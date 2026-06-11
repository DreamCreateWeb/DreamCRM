import { describe, it, expect, vi, beforeEach } from 'vitest'

// Existing patients in the org (what the dedupe pre-scan returns).
const existing = { rows: [] as Array<{ email: string | null; phone: string | null }> }
const inserted: Array<Record<string, unknown>[]> = []

vi.mock('@/lib/db', () => {
  // `where()` returns a thenable (the import dedupe scan awaits it directly)
  // that ALSO exposes `.orderBy()` (the export query chains it). `.limit()` is
  // there for createPatient-style scans, unused here.
  const whereResult = () => {
    const p: any = Promise.resolve(existing.rows)
    p.orderBy = () => Promise.resolve(existing.rows)
    p.limit = () => Promise.resolve(existing.rows)
    return p
  }
  return {
    db: {
      select: () => ({ from: () => ({ where: () => whereResult() }) }),
      insert: () => ({
        values: async (vals: Record<string, unknown>[]) => {
          inserted.push(vals)
        },
      }),
    },
  schema: {
    patient: {
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
      $inferInsert: {},
    },
  },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (...a: unknown[]) => ({ _eq: a }),
}))

vi.mock('@/lib/services/patients', () => {
  let n = 0
  return { newPatientId: () => `pat_${++n}` }
})

import { importPatients, autoMapColumns, exportPatientsCsv } from '@/lib/services/patient-import'

beforeEach(() => {
  existing.rows = []
  inserted.length = 0
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
    expect(inserted[0][0]).toMatchObject({ firstName: 'Jane', lastName: 'Doe', source: 'import', lifecycle: 'active' })
  })

  it('skips a row whose email matches an existing patient (case-insensitive)', async () => {
    existing.rows = [{ email: 'JANE@X.COM', phone: null }]
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
    existing.rows = [{ email: null, phone: '(555) 111-2222' }]
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
    expect(inserted[0][0]).toMatchObject({ firstName: 'Jane', lastName: 'Doe' })
  })

  it('coerces a US-format date of birth to ISO', async () => {
    await importPatients({
      organizationId: 'org_1',
      rows: [['Jane', 'Doe', '', '', '03/14/1990']],
      mapping: { firstName: 0, lastName: 1, email: 2, phone: 3, dateOfBirth: 4 },
    })
    expect(inserted[0][0]).toMatchObject({ dateOfBirth: '1990-03-14' })
  })

  it('returns an all-zero summary for no rows', async () => {
    const r = await importPatients({ organizationId: 'org_1', rows: [], mapping })
    expect(r).toMatchObject({ attempted: 0, created: 0, duplicates: 0, errors: 0 })
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
