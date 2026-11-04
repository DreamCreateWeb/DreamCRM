import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { scheduleKick } from '@/lib/services/day-one-kick'
import { newPatientId } from '@/lib/services/patients'
import { newAppointmentId } from '@/lib/services/appointments'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { clinicDayInstant } from '@/lib/clinic-timezone'
import { clinicDayKey } from '@/lib/format-datetime'
import { normalizeEmail, normalizePhone } from '@/lib/contact-normalize'
import { parseImportDate } from '@/lib/import-dates'
import { CSV_IMPORT_APPOINTMENT_SOURCE } from '@/lib/patient-acquisition'

/**
 * CSV patient import.
 *
 * A 2,000-patient practice can't hand-type every record into the Add-patient
 * modal. This service takes already-parsed rows + a column mapping, validates
 * each row, dedupes against the org's existing patients (by normalized email OR
 * phone) AND against earlier rows in the same file, and batch-inserts the
 * survivors with `source='import'`.
 *
 * THE ROSTER BRINGS ITS VISIT HISTORY (G2-19). For the first client — no PMS,
 * a CSV export — "last visit" and "recall due" are the two columns the whole
 * recall engine runs on, and the import used to drop them on the floor: every
 * imported patient read ★ new with no last visit, nobody ever read lapsed, and
 * the Recall-due chip was empty. Now a mapped `lastVisitAt` mints ONE completed
 * appointment per patient (source 'csv_import', start = end at clinic-local
 * noon of that day, deduped on (patient, day) so a re-export next quarter adds
 * only the dates it did not already carry), and `recallDueAt` fills
 * `pms_recall_due_at` — the same column the PMS sync writes, which the recall
 * derivation already prefers. A duplicate row (the person is already on file)
 * still contributes both: the roster is the practice's truth about WHEN they
 * were last seen, even when WHO they are was known. The recall date fills an
 * EMPTY column only, never overwriting a PMS or staff value.
 *
 * Source of truth for "is this a duplicate" matches the rest of the app:
 * `lib/contact-normalize.ts` (trim+lowercase email; digits-only phone with the
 * US "1" stripped). The lead-convert + createPatient dedupe paths use the same
 * helpers, so an imported patient won't later look like a new person.
 */

// The patient fields a CSV column can map onto. `firstName`/`lastName` are the
// only required targets; everything else is optional. `fullName` is a virtual
// target — when the file only has a single name column we split it into
// first/last on import. `lastVisitAt` / `recallDueAt` are DATE targets that
// land on the appointment book and the recall column rather than the patient
// row's own fields (see the module comment).
export type ImportField =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'dateOfBirth'
  | 'addressLine1'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'insuranceProvider'
  | 'lastVisitAt'
  | 'recallDueAt'

/** The targets that carry a date — the mapping step previews what each parses
 *  to. Lives in lib/import-dates.ts (client-safe) so the modal can read it. */
export { IMPORT_DATE_FIELDS } from '@/lib/import-dates'

/** column index in the CSV → which patient field it fills. */
export type ColumnMapping = Partial<Record<ImportField, number>>

/** Header synonyms used to auto-detect a mapping. Lowercased, punctuation-stripped. */
const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  firstName: ['first name', 'firstname', 'first', 'given name', 'givenname', 'fname'],
  lastName: ['last name', 'lastname', 'last', 'surname', 'family name', 'familyname', 'lname'],
  fullName: ['name', 'full name', 'fullname', 'patient name', 'patientname', 'patient'],
  email: ['email', 'e mail', 'email address', 'emailaddress', 'mail'],
  phone: ['phone', 'phone number', 'phonenumber', 'mobile', 'cell', 'telephone', 'tel', 'cell phone', 'mobile phone', 'contact number'],
  dateOfBirth: ['dob', 'date of birth', 'dateofbirth', 'birthdate', 'birth date', 'birthday', 'born'],
  addressLine1: ['address', 'address1', 'address line 1', 'addressline1', 'street', 'street address', 'address 1'],
  city: ['city', 'town'],
  state: ['state', 'province', 'region', 'st'],
  postalCode: ['zip', 'zip code', 'zipcode', 'postal', 'postal code', 'postalcode', 'postcode'],
  insuranceProvider: ['insurance', 'insurance provider', 'insuranceprovider', 'carrier', 'insurance carrier', 'insurer', 'plan'],
  // What Dentrix / Eaglesoft / Open Dental / Curve exports call the two
  // recall columns. "last visit" and "last appointment" both mean the last
  // time the patient sat in a chair; "last prophy" / "last cleaning" is what a
  // hygiene recall report says instead.
  lastVisitAt: [
    'last visit', 'last visit date', 'lastvisit', 'lastvisitdate', 'date of last visit', 'last seen',
    'last appointment', 'last appt', 'last appointment date', 'last apt', 'last exam', 'last cleaning',
    'last prophy', 'last hygiene visit', 'last service date', 'last date of service', 'last dos', 'last recall visit',
  ],
  recallDueAt: [
    'recall due', 'recall due date', 'recall date', 'recalldue', 'recall', 'next recall', 'next recall date',
    'next due', 'due for recall', 'recall next', 'next recall due', 'next hygiene due', 'next prophy due',
    'continuing care due', 'cc due', 'next cc', 'next visit due',
  ],
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Best-effort auto-mapping of CSV headers → patient fields. First exact
 * synonym match wins per field; a header is consumed once it's been matched so
 * two fields can't claim the same column. If both a `fullName` column and
 * explicit first/last columns exist, the explicit ones take precedence and
 * fullName is dropped (avoids double-writing the name).
 */
export function autoMapColumns(header: string[]): ColumnMapping {
  const normalized = header.map(normalizeHeader)
  const used = new Set<number>()
  const mapping: ColumnMapping = {}

  // Order matters: detect first/last before fullName so they win the name slot.
  const order: ImportField[] = [
    'firstName', 'lastName', 'email', 'phone', 'dateOfBirth',
    'addressLine1', 'city', 'state', 'postalCode', 'insuranceProvider',
    'lastVisitAt', 'recallDueAt', 'fullName',
  ]

  for (const field of order) {
    const synonyms = HEADER_SYNONYMS[field]
    for (let i = 0; i < normalized.length; i++) {
      if (used.has(i)) continue
      if (synonyms.includes(normalized[i])) {
        mapping[field] = i
        used.add(i)
        break
      }
    }
  }

  if (mapping.firstName !== undefined && mapping.lastName !== undefined) {
    delete mapping.fullName
  }
  return mapping
}

/** Coerce common date formats to ISO 'YYYY-MM-DD'; null when unparseable.
 *  The pure parser lives in lib/import-dates.ts so the modal can preview it. */
function coerceDate(raw: string): string | null {
  return parseImportDate(raw)
}

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { firstName: '', lastName: '' }
  // "Last, First" → First Last
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',', 2).map((s) => s.trim())
    return { firstName: first ?? '', lastName: last ?? '' }
  }
  const space = trimmed.indexOf(' ')
  if (space < 0) return { firstName: trimmed, lastName: '' }
  return { firstName: trimmed.slice(0, space), lastName: trimmed.slice(space + 1).trim() }
}

function cell(row: string[], idx: number | undefined): string {
  if (idx === undefined) return ''
  return (row[idx] ?? '').trim()
}

export interface ImportRowResult {
  /** 1-based row number in the data section (excludes the header). */
  row: number
  name: string
  status: 'created' | 'duplicate' | 'error'
  reason?: string
}

export interface ImportSummary {
  attempted: number
  created: number
  duplicates: number
  errors: number
  /** Completed-visit rows minted from the "last visit" column (new patients
   *  AND duplicates), after the (patient, day) dedupe. */
  visits: number
  /** Recall due dates written (new patients, and duplicates whose column was empty). */
  recalls: number
  results: ImportRowResult[]
}

export interface ImportPatientsInput {
  organizationId: string
  rows: string[][]
  mapping: ColumnMapping
}

/** Hard cap so a runaway file can't lock the DB. The action enforces it too. */
export const MAX_IMPORT_ROWS = 5000

/** The title on the roster's placeholder visit — says what it is wherever an
 *  appointment title renders (the record's timeline, the thread markers). */
export const CSV_IMPORT_VISIT_TITLE = 'Last visit (from your roster)'

/**
 * Validate + dedupe + insert. Idempotent-ish: re-running the same file produces
 * all-duplicates the second time (every row now matches an existing patient),
 * and the visit history it carries is deduped on (patient, day) so the second
 * run mints nothing it already minted.
 */
export async function importPatients({
  organizationId,
  rows,
  mapping,
}: ImportPatientsInput): Promise<ImportSummary> {
  const summary: ImportSummary = { attempted: 0, created: 0, duplicates: 0, errors: 0, visits: 0, recalls: 0, results: [] }
  if (rows.length === 0) return summary

  const capped = rows.slice(0, MAX_IMPORT_ROWS)
  const wantsDates = mapping.lastVisitAt !== undefined || mapping.recallDueAt !== undefined

  // Pull existing patients once and build normalized lookup sets — far cheaper
  // than a per-row round-trip for a 2,000-row file. The id rides along so a
  // duplicate row can still hand its visit history to the record it matched.
  const existing = await db
    .select({
      id: schema.patient.id,
      email: schema.patient.email,
      phone: schema.patient.phone,
      pmsRecallDueAt: schema.patient.pmsRecallDueAt,
    })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))

  const seenEmails = new Map<string, string>()
  const seenPhones = new Map<string, string>()
  const recallOnFile = new Set<string>()
  for (const e of existing) {
    const ne = normalizeEmail(e.email)
    if (ne && !seenEmails.has(ne)) seenEmails.set(ne, e.id)
    const np = normalizePhone(e.phone)
    if (np && !seenPhones.has(np)) seenPhones.set(np, e.id)
    if (e.pmsRecallDueAt) recallOnFile.add(e.id)
  }

  // Dates are days on the PRACTICE's calendar (timezone rule 2): "last visit
  // 2026-03-14" lands at clinic-local noon of the 14th, never at a UTC
  // midnight that is still the 13th in Denver. The dedupe key is that day.
  const timeZone = wantsDates ? await getClinicTimeZone(organizationId) : null
  const now = new Date()
  const todayKey = timeZone ? clinicDayKey(now, timeZone) : null
  const visitKeys = new Set<string>()
  if (mapping.lastVisitAt !== undefined && timeZone) {
    const priorVisits = await db
      .select({ patientId: schema.appointment.patientId, startTime: schema.appointment.startTime })
      .from(schema.appointment)
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          eq(schema.appointment.source, CSV_IMPORT_APPOINTMENT_SOURCE),
        ),
      )
    for (const v of priorVisits) visitKeys.add(`${v.patientId}|${clinicDayKey(v.startTime, timeZone)}`)
  }

  const toInsert: Array<typeof schema.patient.$inferInsert> = []
  const visitsToInsert: Array<typeof schema.appointment.$inferInsert> = []
  /** Duplicates whose EMPTY recall column the roster can fill. */
  const recallFills: Array<{ patientId: string; at: Date }> = []

  /** Queue the roster's visit history for a patient id — new or matched. */
  const carryHistory = (patientId: string, raw: string[], isNew: boolean): { recallAt: Date | null } => {
    let recallAt: Date | null = null
    if (timeZone) {
      const lastVisitKey = coerceDate(cell(raw, mapping.lastVisitAt))
      // A "last visit" after today is a typo or a booked future slot — not
      // history, and never a completed visit we would invent.
      if (lastVisitKey && todayKey && lastVisitKey <= todayKey && !visitKeys.has(`${patientId}|${lastVisitKey}`)) {
        const at = clinicDayInstant(lastVisitKey, timeZone)
        if (at) {
          visitKeys.add(`${patientId}|${lastVisitKey}`)
          visitsToInsert.push({
            id: newAppointmentId(),
            organizationId,
            patientId,
            title: CSV_IMPORT_VISIT_TITLE,
            startTime: at,
            endTime: at,
            type: 'recall',
            status: 'completed',
            completedAt: at,
            source: CSV_IMPORT_APPOINTMENT_SOURCE,
          })
          summary.visits++
        }
      }
      const recallKey = coerceDate(cell(raw, mapping.recallDueAt))
      if (recallKey) {
        recallAt = clinicDayInstant(recallKey, timeZone)
        if (recallAt && !isNew && !recallOnFile.has(patientId)) {
          recallOnFile.add(patientId)
          recallFills.push({ patientId, at: recallAt })
          summary.recalls++
        } else if (recallAt && isNew) {
          summary.recalls++
        }
      }
    }
    return { recallAt }
  }

  for (let r = 0; r < capped.length; r++) {
    const raw = capped[r]
    summary.attempted++
    const rowNum = r + 1

    let firstName = cell(raw, mapping.firstName)
    let lastName = cell(raw, mapping.lastName)
    if ((!firstName || !lastName) && mapping.fullName !== undefined) {
      const split = splitName(cell(raw, mapping.fullName))
      firstName = firstName || split.firstName
      lastName = lastName || split.lastName
    }
    const displayName = `${firstName} ${lastName}`.trim() || '(unnamed)'

    if (!firstName) {
      summary.errors++
      summary.results.push({ row: rowNum, name: displayName, status: 'error', reason: 'Missing first name' })
      continue
    }

    const emailRaw = cell(raw, mapping.email) || null
    const phoneRaw = cell(raw, mapping.phone) || null
    const ne = normalizeEmail(emailRaw)
    const np = normalizePhone(phoneRaw)

    // Dedupe: against existing patients OR earlier accepted rows in this file.
    const dupBy =
      (ne && seenEmails.has(ne) && 'email') ||
      (np && seenPhones.has(np) && 'phone') ||
      null
    if (dupBy) {
      summary.duplicates++
      summary.results.push({
        row: rowNum,
        name: displayName,
        status: 'duplicate',
        reason: dupBy === 'email' ? 'Email already on file' : 'Phone already on file',
      })
      // The person is on file; their visit history may not be.
      const matchedId = (dupBy === 'email' ? seenEmails.get(ne!) : seenPhones.get(np!)) ?? null
      if (matchedId) carryHistory(matchedId, raw, false)
      continue
    }

    const dobRaw = cell(raw, mapping.dateOfBirth)
    const id = newPatientId()
    const { recallAt } = carryHistory(id, raw, true)
    toInsert.push({
      id,
      organizationId,
      firstName,
      lastName,
      email: emailRaw,
      phone: phoneRaw,
      dateOfBirth: coerceDate(dobRaw),
      addressLine1: cell(raw, mapping.addressLine1) || null,
      city: cell(raw, mapping.city) || null,
      state: cell(raw, mapping.state) || null,
      postalCode: cell(raw, mapping.postalCode) || null,
      insuranceProvider: cell(raw, mapping.insuranceProvider) || null,
      ...(recallAt ? { pmsRecallDueAt: recallAt } : {}),
      source: 'import',
      lifecycle: 'active',
      isActive: 1,
      firstSeenAt: now,
      lastActivityAt: now,
    })

    // Mark these contacts as seen so a file with two rows for the same person
    // only imports one (and the second row's history lands on the first).
    if (ne) seenEmails.set(ne, id)
    if (np) seenPhones.set(np, id)

    summary.created++
    summary.results.push({ row: rowNum, name: displayName, status: 'created' })
  }

  // Batch insert in chunks so one giant VALUES list doesn't blow a query limit.
  // Patients first: the visit rows reference them.
  const CHUNK = 500
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    if (chunk.length) await db.insert(schema.patient).values(chunk)
  }
  for (let i = 0; i < visitsToInsert.length; i += CHUNK) {
    const chunk = visitsToInsert.slice(i, i + CHUNK)
    if (chunk.length) await db.insert(schema.appointment).values(chunk)
  }
  // A matched record's EMPTY recall column takes the roster's date; the
  // `is null` guard re-checks at write time so a PMS sync landing between the
  // scan and here is never overwritten.
  for (const fill of recallFills) {
    await db
      .update(schema.patient)
      .set({ pmsRecallDueAt: fill.at, updatedAt: now })
      .where(
        and(
          eq(schema.patient.organizationId, organizationId),
          eq(schema.patient.id, fill.patientId),
          isNull(schema.patient.pmsRecallDueAt),
        ),
      )
  }

  // THE DAY-ONE KICK (docs/ACTIVATION.md S2): a roster just arrived — run
  // the practice's generators now. Fire-and-forget; the import is done. A
  // re-import that only brought visit history is data arriving too.
  if (summary.created > 0 || summary.visits > 0) scheduleKick(organizationId, 'patients_imported')

  return summary
}

// ----- Export ----------------------------------------------------------

/** One CSV field, RFC-4180-escaped (quote-wrap only when needed). */
function csvCell(value: string | null | undefined): string {
  const v = value ?? ''
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export const EXPORT_HEADERS = [
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Date of Birth',
  'Address',
  'City',
  'State',
  'Postal Code',
  'Insurance Provider',
  'Source',
  'Lifecycle',
  'First Seen',
] as const

/**
 * Export the org's patients as CSV text — the standard relationship fields a
 * clinic would want if they leave, not internal ids. Answers the "can I get my
 * data out" lock-in question. Active (non-archived) patients only.
 */
export async function exportPatientsCsv(organizationId: string): Promise<string> {
  return (await exportPatientsCsvWithCount(organizationId)).csv
}

/** The same CSV plus the row count — the access log records how many
 *  patients left the building (ML-31). */
export async function exportPatientsCsvWithCount(organizationId: string): Promise<{ csv: string; rows: number }> {
  const rows = await db
    .select({
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      phone: schema.patient.phone,
      dateOfBirth: schema.patient.dateOfBirth,
      addressLine1: schema.patient.addressLine1,
      city: schema.patient.city,
      state: schema.patient.state,
      postalCode: schema.patient.postalCode,
      insuranceProvider: schema.patient.insuranceProvider,
      source: schema.patient.source,
      lifecycle: schema.patient.lifecycle,
      firstSeenAt: schema.patient.firstSeenAt,
    })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, organizationId), eq(schema.patient.isActive, 1)))
    .orderBy(schema.patient.lastName, schema.patient.firstName)

  const lines = [EXPORT_HEADERS.join(',')]
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.firstName),
        csvCell(r.lastName),
        csvCell(r.email),
        csvCell(r.phone),
        csvCell(r.dateOfBirth),
        csvCell(r.addressLine1),
        csvCell(r.city),
        csvCell(r.state),
        csvCell(r.postalCode),
        csvCell(r.insuranceProvider),
        csvCell(r.source),
        csvCell(r.lifecycle),
        csvCell(r.firstSeenAt ? r.firstSeenAt.toISOString().slice(0, 10) : ''),
      ].join(','),
    )
  }
  // Trailing newline so the file ends cleanly.
  return { csv: lines.join('\r\n') + '\r\n', rows: rows.length }
}
