import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE CSV ROSTER BRINGS ITS VISIT HISTORY (G2-19).
 *
 * For a practice with no PMS the roster export is the whole recall engine's
 * fuel: "last visit" becomes ONE completed appointment per patient (source
 * 'csv_import', start = end at clinic-local noon of that day, deduped on
 * (patient, day)); "recall due" fills `pms_recall_due_at`. A duplicate row
 * still hands both to the record it matched (an EMPTY recall column only).
 * The placeholder visit then has to be invisible to every chair surface and
 * post-visit touch, and to the journey funnel — the last describe pins the
 * two homes of that exclusion against each other.
 */

// Existing patients in the org (what the dedupe pre-scan returns) and the
// csv_import visits already on the book (the (patient, day) dedupe scan).
const existing = {
  rows: [] as Array<{ id?: string; email: string | null; phone: string | null; pmsRecallDueAt?: Date | null }>,
  visits: [] as Array<{ patientId: string; startTime: Date }>,
}
const inserted: Array<{ table: string; rows: Record<string, unknown>[] }> = []
const updated: Array<{ set: Record<string, unknown>; where: unknown }> = []

const scheduleKick = vi.fn()
vi.mock('@/lib/services/day-one-kick', () => ({ scheduleKick: (...a: unknown[]) => scheduleKick(...(a as [])) }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/Chicago') }))

// Hoisted beside the mock factory that reads them (vi.mock is hoisted above
// every top-level const).
const { PATIENT, APPOINTMENT } = vi.hoisted(() => ({
  PATIENT: { __table: 'patient' },
  APPOINTMENT: { __table: 'appointment' },
}))
vi.mock('@/lib/db', () => {
  // `where()` returns a thenable (both scans await it directly) that ALSO
  // exposes `.orderBy()` (the export query chains it). Which rows come back
  // depends on the table `from()` was handed.
  const whereResult = (table: unknown) => {
    const rows = (table as { __table?: string })?.__table === 'appointment' ? existing.visits : existing.rows
    const p: any = Promise.resolve(rows)
    p.orderBy = () => Promise.resolve(rows)
    p.limit = () => Promise.resolve(rows)
    return p
  }
  return {
    db: {
      select: () => ({ from: (table: unknown) => ({ where: () => whereResult(table) }) }),
      insert: (table: { __table: string }) => ({
        values: async (vals: Record<string, unknown>[]) => {
          inserted.push({ table: table.__table, rows: vals })
        },
      }),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: async (where: unknown) => {
            updated.push({ set, where })
          },
        }),
      }),
    },
    schema: {
      patient: {
        ...PATIENT,
        id: 'id',
        organizationId: 'organizationId',
        email: 'email',
        phone: 'phone',
        isActive: 'isActive',
        firstName: 'firstName',
        lastName: 'lastName',
        dateOfBirth: 'dateOfBirth',
        addressLine1: 'addressLine1',
        city: 'city',
        state: 'state',
        postalCode: 'postalCode',
        insuranceProvider: 'insuranceProvider',
        source: 'source',
        lifecycle: 'lifecycle',
        firstSeenAt: 'firstSeenAt',
        pmsRecallDueAt: 'pmsRecallDueAt',
        $inferInsert: {},
      },
      appointment: {
        ...APPOINTMENT,
        organizationId: 'organizationId',
        patientId: 'patientId',
        startTime: 'startTime',
        source: 'source',
        $inferInsert: {},
      },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (...a: unknown[]) => ({ _eq: a }),
  isNull: (...a: unknown[]) => ({ _isNull: a }),
}))

vi.mock('@/lib/services/patients', () => {
  let n = 0
  return { newPatientId: () => `pat_${++n}` }
})
vi.mock('@/lib/services/appointments', () => {
  let n = 0
  return { newAppointmentId: () => `appt_${++n}` }
})

import { importPatients, autoMapColumns, exportPatientsCsv, CSV_IMPORT_VISIT_TITLE } from '@/lib/services/patient-import'
import { parseImportDate, IMPORT_DATE_FIELDS } from '@/lib/import-dates'
import { BACKFILL_APPOINTMENT_SOURCES } from '@/lib/patient-acquisition'

const patientsInserted = () => inserted.filter((i) => i.table === 'patient').flatMap((i) => i.rows)
const visitsInserted = () => inserted.filter((i) => i.table === 'appointment').flatMap((i) => i.rows)

beforeEach(() => {
  existing.rows = []
  existing.visits = []
  inserted.length = 0
  updated.length = 0
  scheduleKick.mockClear()
})

describe('autoMapColumns', () => {
  it('detects first/last/email/phone/dob from common headers', () => {
    const m = autoMapColumns(['First Name', 'Last Name', 'Email', 'Phone', 'DOB'])
    expect(m).toEqual({ firstName: 0, lastName: 1, email: 2, phone: 3, dateOfBirth: 4 })
  })

  it('detects a single full-name column', () => {
    const m = autoMapColumns(['Name', 'Email'])
    expect(m.fullName).toBe(0)
    expect(m.email).toBe(1)
  })

  it('prefers explicit first/last over a full-name column', () => {
    const m = autoMapColumns(['Name', 'First', 'Last'])
    expect(m.firstName).toBe(1)
    expect(m.lastName).toBe(2)
    expect(m.fullName).toBeUndefined()
  })

  it('is tolerant of punctuation and case in headers', () => {
    const m = autoMapColumns(['e-mail', 'Cell_Phone', 'Postal Code'])
    expect(m.email).toBe(0)
    expect(m.phone).toBe(1)
    expect(m.postalCode).toBe(2)
  })

  it('detects the recall columns a dental export writes — last visit and recall due', () => {
    expect(autoMapColumns(['Last Visit', 'Recall Due'])).toMatchObject({ lastVisitAt: 0, recallDueAt: 1 })
    expect(autoMapColumns(['Last_Appointment_Date', 'Next Recall'])).toMatchObject({ lastVisitAt: 0, recallDueAt: 1 })
    expect(autoMapColumns(['Last Prophy', 'Continuing Care Due'])).toMatchObject({ lastVisitAt: 0, recallDueAt: 1 })
    expect(autoMapColumns(['Last DOS', 'Recall'])).toMatchObject({ lastVisitAt: 0, recallDueAt: 1 })
  })

  it('a bare "Last" is still the last NAME, not the last visit', () => {
    expect(autoMapColumns(['First', 'Last'])).toMatchObject({ firstName: 0, lastName: 1 })
  })
})

describe('parseImportDate — the one parser the modal previews and the import writes', () => {
  const now = new Date('2026-11-03T12:00:00Z')
  it('reads ISO, ISO-with-time, slashed ISO and US dates', () => {
    expect(parseImportDate('2026-03-14', now)).toBe('2026-03-14')
    expect(parseImportDate('2026-03-14T09:30:00', now)).toBe('2026-03-14')
    expect(parseImportDate('2026/3/4', now)).toBe('2026-03-04')
    expect(parseImportDate('3/14/2026', now)).toBe('2026-03-14')
    expect(parseImportDate('03-14-2026', now)).toBe('2026-03-14')
  })
  it('resolves a two-digit year on a sliding pivot: above this year is last century', () => {
    expect(parseImportDate('03/14/24', now)).toBe('2024-03-14')
    expect(parseImportDate('03/14/26', now)).toBe('2026-03-14')
    expect(parseImportDate('03/14/27', now)).toBe('1927-03-14')
    expect(parseImportDate('03/14/65', now)).toBe('1965-03-14')
  })
  it('refuses what it cannot read rather than guessing', () => {
    expect(parseImportDate('14/03/2026', now)).toBeNull() // day-first
    expect(parseImportDate('02/30/2026', now)).toBeNull() // no such day
    expect(parseImportDate('March 14', now)).toBeNull()
    expect(parseImportDate('', now)).toBeNull()
    expect(parseImportDate(null, now)).toBeNull()
  })
  it('names the three date targets for the mapping step', () => {
    expect(Array.from(IMPORT_DATE_FIELDS).sort()).toEqual(['dateOfBirth', 'lastVisitAt', 'recallDueAt'])
  })
})

describe('importPatients', () => {
  const mapping = { firstName: 0, lastName: 1, email: 2, phone: 3 }

  it('inserts new patients with source=import and lifecycle=active', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'jane@x.com', '5551112222']],
      mapping,
    })
    expect(r.created).toBe(1)
    expect(r.duplicates).toBe(0)
    expect(patientsInserted()[0]).toMatchObject({ firstName: 'Jane', lastName: 'Doe', source: 'import', lifecycle: 'active' })
    // THE DAY-ONE KICK (docs/ACTIVATION.md S2): a roster just arrived.
    expect(scheduleKick).toHaveBeenCalledWith('org_1', 'patients_imported')
  })

  it('an import that created nothing does not kick the generators', async () => {
    existing.rows = [{ id: 'pat_x', email: 'JANE@X.COM', phone: null }]
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'jane@x.com', '5551112222']],
      mapping,
    })
    expect(r.created).toBe(0)
    expect(scheduleKick).not.toHaveBeenCalled()
  })

  it('skips a row whose email matches an existing patient (case-insensitive)', async () => {
    existing.rows = [{ id: 'pat_x', email: 'JANE@X.COM', phone: null }]
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'jane@x.com', '5551112222']],
      mapping,
    })
    expect(r.created).toBe(0)
    expect(r.duplicates).toBe(1)
    expect(r.results[0]).toMatchObject({ status: 'duplicate', reason: 'Email already on file' })
    expect(inserted).toHaveLength(0)
  })

  it('skips a row whose phone matches an existing patient (formatting-insensitive)', async () => {
    existing.rows = [{ id: 'pat_x', email: null, phone: '(555) 111-2222' }]
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'new@x.com', '1-555-111-2222']],
      mapping,
    })
    expect(r.duplicates).toBe(1)
    expect(r.results[0].reason).toBe('Phone already on file')
  })

  it('dedupes two rows in the SAME file by email', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [
        ['Jane', 'Doe', 'dup@x.com', '5550000001'],
        ['Janie', 'Doe', 'DUP@x.com', '5550000002'],
      ],
      mapping,
    })
    expect(r.created).toBe(1)
    expect(r.duplicates).toBe(1)
  })

  it('errors a row with no usable name', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['', '', 'noname@x.com', '5550000003']],
      mapping,
    })
    expect(r.errors).toBe(1)
    expect(r.created).toBe(0)
    expect(r.results[0]).toMatchObject({ status: 'error', reason: 'Missing first name' })
  })

  it('splits a full-name column into first/last', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane Doe', 'jane@x.com']],
      mapping: { fullName: 0, email: 1 },
    })
    expect(r.created).toBe(1)
    expect(patientsInserted()[0]).toMatchObject({ firstName: 'Jane', lastName: 'Doe' })
  })

  it('coerces a US-format date of birth to ISO', async () => {
    await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', '', '', '03/14/1990']],
      mapping: { firstName: 0, lastName: 1, email: 2, phone: 3, dateOfBirth: 4 },
    })
    expect(patientsInserted()[0]).toMatchObject({ dateOfBirth: '1990-03-14' })
  })

  it('returns an all-zero summary for no rows', async () => {
    const r = await importPatients({ organizationId: 'org_1', rows: [], mapping })
    expect(r).toMatchObject({ attempted: 0, created: 0, duplicates: 0, errors: 0, visits: 0, recalls: 0 })
  })

  it('imports rows with no contact info (no email/phone never dedupes)', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [
        ['Jane', 'Doe', '', ''],
        ['John', 'Roe', '', ''],
      ],
      mapping,
    })
    expect(r.created).toBe(2)
    expect(r.duplicates).toBe(0)
  })
})

describe('importPatients — the roster brings its visit history', () => {
  const mapping = { firstName: 0, lastName: 1, email: 2, lastVisitAt: 3, recallDueAt: 4 }

  it('a "last visit" two years back mints ONE completed visit at clinic-local noon, start = end — the patient reads overdue and lapsed from it', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'jane@x.com', '03/14/2024', '']],
      mapping,
    })
    expect(r.created).toBe(1)
    expect(r.visits).toBe(1)
    const [visit] = visitsInserted()
    const [patientRow] = patientsInserted()
    expect(visit).toMatchObject({
      organizationId: 'org_1',
      patientId: patientRow.id,
      status: 'completed',
      type: 'recall',
      source: 'csv_import',
      title: CSV_IMPORT_VISIT_TITLE,
    })
    // Noon in Chicago on 2024-03-14 (CDT, UTC-5) is 17:00Z — a day on the
    // PRACTICE's calendar, never a UTC midnight that is still the 13th.
    expect((visit.startTime as Date).toISOString()).toBe('2024-03-14T17:00:00.000Z')
    expect(visit.endTime).toEqual(visit.startTime)
    expect(visit.completedAt).toEqual(visit.startTime)
    // Patients insert first — the visit references the id it minted.
    expect(inserted.map((i) => i.table)).toEqual(['patient', 'appointment'])
    expect(patientRow.id).toMatch(/^pat_\d+$/)
  })

  it('"recall due" fills pms_recall_due_at — the column the recall derivation already prefers', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'jane@x.com', '', '2026-12-01']],
      mapping,
    })
    expect(r.recalls).toBe(1)
    expect(r.visits).toBe(0)
    const [p] = patientsInserted()
    expect((p.pmsRecallDueAt as Date).toISOString()).toBe('2026-12-01T18:00:00.000Z') // noon CST
    expect(visitsInserted()).toHaveLength(0)
  })

  it('a re-import hands a DUPLICATE row\'s history to the record it matched — once per (patient, day)', async () => {
    existing.rows = [{ id: 'pat_on_file', email: 'jane@x.com', phone: null, pmsRecallDueAt: null }]
    // The first import already minted the 2024-03-14 visit.
    existing.visits = [{ patientId: 'pat_on_file', startTime: new Date('2024-03-14T17:00:00Z') }]
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [
        ['Jane', 'Doe', 'jane@x.com', '03/14/2024', '2026-12-01'], // same day → nothing new
        ['Jane', 'Doe', 'JANE@x.com', '09/02/2025', ''], // a newer visit → one row
      ],
      mapping,
    })
    expect(r.created).toBe(0)
    expect(r.duplicates).toBe(2)
    expect(r.visits).toBe(1)
    expect(visitsInserted()).toHaveLength(1)
    expect(visitsInserted()[0]).toMatchObject({ patientId: 'pat_on_file', source: 'csv_import' })
    expect((visitsInserted()[0].startTime as Date).toISOString()).toBe('2025-09-02T17:00:00.000Z')
    // The EMPTY recall column takes the roster's date, guarded by `is null`
    // at write time; it is counted once.
    expect(r.recalls).toBe(1)
    expect(updated).toHaveLength(1)
    expect((updated[0].set.pmsRecallDueAt as Date).toISOString()).toBe('2026-12-01T18:00:00.000Z')
    expect(JSON.stringify(updated[0].where)).toContain('_isNull')
    // History arriving is data arriving: the generators run.
    expect(scheduleKick).toHaveBeenCalledWith('org_1', 'patients_imported')
  })

  it('never overwrites a recall date already on file (a PMS or staff value)', async () => {
    existing.rows = [{ id: 'pat_on_file', email: 'jane@x.com', phone: null, pmsRecallDueAt: new Date('2026-06-01T00:00:00Z') }]
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'jane@x.com', '', '2026-12-01']],
      mapping,
    })
    expect(r.recalls).toBe(0)
    expect(updated).toHaveLength(0)
  })

  it('the same file run twice mints nothing the second time', async () => {
    const rows = [['Jane', 'Doe', 'jane@x.com', '03/14/2024', '']]
    await importPatients({ organizationId: 'org_1', rows, mapping })
    const first = visitsInserted()[0]
    inserted.length = 0
    existing.rows = [{ id: first.patientId as string, email: 'jane@x.com', phone: null }]
    existing.visits = [{ patientId: first.patientId as string, startTime: first.startTime as Date }]
    const r = await importPatients({ organizationId: 'org_1', rows, mapping })
    expect(r).toMatchObject({ created: 0, duplicates: 1, visits: 0 })
    expect(inserted).toHaveLength(0)
  })

  it('a last visit in the future is not history — no completed visit is invented', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'jane@x.com', '2099-01-01', '']],
      mapping,
    })
    expect(r.created).toBe(1)
    expect(r.visits).toBe(0)
    expect(visitsInserted()).toHaveLength(0)
  })

  it('an unreadable date is dropped, never a wrong one', async () => {
    const r = await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', 'jane@x.com', '14/03/2024', 'soon']],
      mapping,
    })
    expect(r.created).toBe(1)
    expect(r.visits).toBe(0)
    expect(r.recalls).toBe(0)
    expect(patientsInserted()[0]).not.toHaveProperty('pmsRecallDueAt')
  })
})

describe('csv_import is excluded from the funnel, the chair and every post-visit touch', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('is in the backfill registry beside pms_import', () => {
    expect(Array.from(BACKFILL_APPOINTMENT_SOURCES).sort()).toEqual(['csv_import', 'pms_import'])
  })

  it('the journey funnel names it on every source-law constant — it may anchor, never mint', () => {
    const src = read('lib/services/patient-journey.ts')
    for (const member of Array.from(BACKFILL_APPOINTMENT_SOURCES)) {
      expect(src, `NOT_IMPORTED excludes ${member}`).toMatch(new RegExp(`NOT_IMPORTED = sql\`.*is distinct from '${member}'`))
      expect(src, `IMPORTED includes ${member}`).toMatch(new RegExp(`IMPORTED = sql\`\\(.*= '${member}'`))
      expect(src, `BOOKED_MINTABLE excludes ${member}`).toMatch(new RegExp(`BOOKED_MINTABLE = sql\`.*is distinct from '${member}'`))
      expect(src, `IMPORTED_OR_LIVE includes ${member}`).toMatch(new RegExp(`IMPORTED_OR_LIVE = sql\`\\(.*= '${member}'`))
    }
  })

  it('the agenda, Today\'s chair, review asks, the post-visit survey and loyalty all add the predicate', () => {
    const guarded = {
      'lib/services/appointments.ts': 1,
      'lib/services/clinic-overview.ts': 1,
      'lib/services/reviews.ts': 1,
      'lib/services/nps.ts': 2,
      'lib/services/loyalty.ts': 2,
    }
    for (const [file, sites] of Object.entries(guarded)) {
      const src = read(file)
      expect(src, file).toContain("from '@/lib/services/visit-sources'")
      expect((src.match(/notCsvImportVisit\(\)/g) ?? []).length, file).toBe(sites)
    }
    // NULL-safe by construction: a hand-booked visit with no source is real.
    expect(read('lib/services/visit-sources.ts')).toContain('is distinct from')
  })
})

describe('exportPatientsCsv', () => {
  it('emits a header row even when there are no patients', async () => {
    existing.rows = []
    const csv = await exportPatientsCsv('org_1')
    expect(csv.startsWith('First Name,Last Name,Email')).toBe(true)
  })

  it('quote-escapes fields containing commas', async () => {
    existing.rows = [
      {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@x.com',
        phone: '5551112222',
        dateOfBirth: '1990-03-14',
        addressLine1: '1 Main St, Apt 2',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62704',
        insuranceProvider: 'Delta Dental',
        source: 'import',
        lifecycle: 'active',
        firstSeenAt: new Date('2026-01-01T00:00:00Z'),
      },
    ] as never
    const csv = await exportPatientsCsv('org_1')
    expect(csv).toContain('"1 Main St, Apt 2"')
    expect(csv).toContain('jane@x.com')
    expect(csv).toContain('2026-01-01')
  })
})
