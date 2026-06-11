import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newPatientId } from '@/lib/services/patients'
import { normalizeEmail, normalizePhone } from '@/lib/contact-normalize'

/**
 * CSV patient import.
 *
 * A 2,000-patient practice can't hand-type every record into the Add-patient
 * modal. This service takes already-parsed rows + a column mapping, validates
 * each row, dedupes against the org's existing patients (by normalized email OR
 * phone) AND against earlier rows in the same file, and batch-inserts the
 * survivors with `source='import'`.
 *
 * Source of truth for "is this a duplicate" matches the rest of the app:
 * `lib/contact-normalize.ts` (trim+lowercase email; digits-only phone with the
 * US "1" stripped). The lead-convert + createPatient dedupe paths use the same
 * helpers, so an imported patient won't later look like a new person.
 */

// The patient fields a CSV column can map onto. `firstName`/`lastName` are the
// only required targets; everything else is optional. `fullName` is a virtual
// target — when the file only has a single name column we split it into
// first/last on import.
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
    'addressLine1', 'city', 'state', 'postalCode', 'insuranceProvider', 'fullName',
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const US_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/

/** Coerce common date formats to ISO 'YYYY-MM-DD'; null when unparseable. */
function coerceDate(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (ISO_DATE.test(v)) return v
  const m = US_DATE.exec(v)
  if (m) {
    const mm = m[1].padStart(2, '0')
    const dd = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  return null
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
  results: ImportRowResult[]
}

export interface ImportPatientsInput {
  organizationId: string
  rows: string[][]
  mapping: ColumnMapping
}

/** Hard cap so a runaway file can't lock the DB. The action enforces it too. */
export const MAX_IMPORT_ROWS = 5000

/**
 * Validate + dedupe + insert. Idempotent-ish: re-running the same file produces
 * all-duplicates the second time (every row now matches an existing patient).
 */
export async function importPatients({
  organizationId,
  rows,
  mapping,
}: ImportPatientsInput): Promise<ImportSummary> {
  const summary: ImportSummary = { attempted: 0, created: 0, duplicates: 0, errors: 0, results: [] }
  if (rows.length === 0) return summary

  const capped = rows.slice(0, MAX_IMPORT_ROWS)

  // Pull existing patients once and build normalized lookup sets — far cheaper
  // than a per-row round-trip for a 2,000-row file.
  const existing = await db
    .select({ email: schema.patient.email, phone: schema.patient.phone })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, organizationId))

  const seenEmails = new Set<string>()
  const seenPhones = new Set<string>()
  for (const e of existing) {
    const ne = normalizeEmail(e.email)
    if (ne) seenEmails.add(ne)
    const np = normalizePhone(e.phone)
    if (np) seenPhones.add(np)
  }

  const now = new Date()
  const toInsert: Array<typeof schema.patient.$inferInsert> = []

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
      continue
    }

    const dobRaw = cell(raw, mapping.dateOfBirth)
    const id = newPatientId()
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
      source: 'import',
      lifecycle: 'active',
      isActive: 1,
      firstSeenAt: now,
      lastActivityAt: now,
    })

    // Mark these contacts as seen so a file with two rows for the same person
    // only imports one.
    if (ne) seenEmails.add(ne)
    if (np) seenPhones.add(np)

    summary.created++
    summary.results.push({ row: rowNum, name: displayName, status: 'created' })
  }

  // Batch insert in chunks so one giant VALUES list doesn't blow a query limit.
  const CHUNK = 500
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    if (chunk.length) await db.insert(schema.patient).values(chunk)
  }

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
  return lines.join('\r\n') + '\r\n'
}
