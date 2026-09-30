import type { Tone } from '@/lib/ui/encodings'

/**
 * Insurance eligibility — the client-safe core.
 *
 * WHAT THIS IS. A front desk types what is on a patient's insurance card and
 * asks "are they covered, and for what?". The answer comes from an
 * `EligibilityProvider` (lib/services/insurance-eligibility/) selected by
 * `INSURANCE_DRIVER`, and every answer is stored as an `insurance_verification`
 * row so the patient's record carries a history.
 *
 * THE HONESTY LAW (DESIGN.md: "never an eligibility promise we can't keep").
 * The only driver today is `sandbox` — deterministic, never networks, and
 * every answer it gives is a PRACTICE answer. The UI must say so on every
 * result (`INSURANCE_DRIVER_LABEL`), the same way the NexHealth sandbox
 * connection announces itself on /integrations/pms. A real clearinghouse
 * driver (an X12 270/271 vendor) plugs in behind the same interface and needs
 * an executed BAA before the env flips (docs/COMPLIANCE.md).
 *
 * This module has NO service imports so the page, the panel and the tests
 * can share the same validation + labels.
 */

export type InsuranceDriverId = 'sandbox'

/**
 * THE RELEASE GATE (owner ruling 2026-09-30: "hide it for now — accessible
 * only from my admin portal until we decide to release it; I have real
 * clients now"). Every surface of the tool — the page, its actions, the
 * sidebar entry, the ⌘K action, the patient-record rail card + nudge, the
 * roster lane — asks this one question. `platformAdmin` rides the USER row,
 * so the owner keeps the tool wherever they are (their own org, the demo,
 * View-as-clinic) and no clinic staff member can ever reach it. Flip this to
 * `true` (and drop `platformAdminOnly` on the module + the capability from
 * PREVIEW_CAPABILITIES) to release.
 */
export function canUseInsuranceTool(ctx: { platformAdmin?: boolean | null }): boolean {
  return ctx.platformAdmin === true
}

export type InsuranceRelationship = 'self' | 'spouse' | 'child' | 'other'

export const INSURANCE_RELATIONSHIPS: ReadonlyArray<{ id: InsuranceRelationship; label: string }> = [
  { id: 'self', label: 'The patient' },
  { id: 'spouse', label: 'Their spouse' },
  { id: 'child', label: 'A parent' },
  { id: 'other', label: 'Someone else' },
]

export interface EligibilityPerson {
  firstName: string
  lastName: string
  /** ISO calendar date, `YYYY-MM-DD` — the same shape as `patient.date_of_birth`. */
  dateOfBirth: string
}

export interface EligibilityRequest {
  patient: EligibilityPerson
  carrierName: string
  memberId: string
  groupNumber: string | null
  relationship: InsuranceRelationship
  /** Required when the patient is not the subscriber. */
  subscriber: EligibilityPerson | null
}

export type EligibilityStatus = 'active' | 'inactive' | 'not_found' | 'needs_review' | 'error'

export type NetworkStatus = 'in_network' | 'out_of_network' | 'unknown'

export type FrequencyCode = 'exam' | 'prophy' | 'bitewings' | 'fmx' | 'fluoride'

export interface EligibilityResult {
  status: Exclude<EligibilityStatus, 'error'>
  payerName: string
  planName: string | null
  coverage: { effective: string | null; termination: string | null }
  network: NetworkStatus
  annualMax: { totalCents: number; usedCents: number; remainingCents: number } | null
  deductible: { individualCents: number; metCents: number; remainingCents: number } | null
  coveragePct: { preventive: number; basic: number; major: number; ortho: number | null } | null
  waitingPeriods: Array<{ category: 'basic' | 'major' | 'ortho'; endsOn: string }>
  /** Code-owned copy for the allowance ("2 per year", "1 every 3 years") + the last date the plan saw one. */
  frequencies: Array<{ code: FrequencyCode; label: string; limit: string; lastOn: string | null }>
  missingToothClause: boolean | null
  notes: string[]
  /** When the payer (or the sandbox) answered — ISO instant. */
  asOf: string
}

/** The serialisable shape of one stored check — what services return and
 *  server actions hand to client components (ISO strings, no Dates). */
export interface InsuranceCheckView {
  id: string
  patientId: string | null
  patientName: string | null
  driver: InsuranceDriverId
  status: EligibilityStatus
  input: EligibilityRequest
  result: EligibilityResult | null
  error: string | null
  checkedAtIso: string
  requestedByUserId: string | null
}

/**
 * Driver switch — the same idiom as EMAIL_DRIVER / SMS_DRIVER / AI_DRIVER.
 * Unknown or blank values resolve to the sandbox: a typo in an env var must
 * never route a front desk's question to nothing.
 */
export function resolveInsuranceDriverId(env: Record<string, string | undefined> = process.env): InsuranceDriverId {
  const raw = (env.INSURANCE_DRIVER ?? '').trim().toLowerCase()
  if (raw === 'sandbox' || raw === '') return 'sandbox'
  return 'sandbox'
}

export const INSURANCE_DRIVER_LABEL: Record<InsuranceDriverId, { pill: string; title: string }> = {
  sandbox: {
    pill: 'Practice answer',
    title:
      'A sample answer from the built-in sandbox — not a real payer check. Confirm with the carrier before quoting a patient.',
  },
}

/** Which drivers give practice answers rather than real ones. */
export function isPracticeDriver(driver: InsuranceDriverId): boolean {
  return driver === 'sandbox'
}

/**
 * Status → tone. `error` is warn (needs OUR action — we couldn't ask), never
 * urgent: rose on a failed lookup reads as "no coverage", which is a claim the
 * check did not make.
 */
export const STATUS_TONE: Record<EligibilityStatus, Tone> = {
  active: 'ok',
  inactive: 'urgent',
  not_found: 'warn',
  needs_review: 'warn',
  error: 'warn',
}

export const STATUS_LABEL: Record<EligibilityStatus, string> = {
  active: 'Active',
  inactive: 'Not active',
  not_found: 'Not found',
  needs_review: 'Needs a look',
  error: 'Couldn’t check',
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealCalendarDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function validatePerson(
  raw: unknown,
  prefix: string,
  errors: Record<string, string>,
  todayIso: string,
): EligibilityPerson | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const firstName = str(o.firstName)
  const lastName = str(o.lastName)
  const dateOfBirth = str(o.dateOfBirth)
  if (!firstName) errors[`${prefix}.firstName`] = 'First name is required'
  if (!lastName) errors[`${prefix}.lastName`] = 'Last name is required'
  if (!dateOfBirth) errors[`${prefix}.dateOfBirth`] = 'Date of birth is required'
  else if (!isRealCalendarDate(dateOfBirth)) errors[`${prefix}.dateOfBirth`] = 'Enter a real date (YYYY-MM-DD)'
  else if (dateOfBirth > todayIso) errors[`${prefix}.dateOfBirth`] = 'Date of birth can’t be in the future'
  return { firstName, lastName, dateOfBirth }
}

/**
 * Validate + normalise a request. Treats its input as untrusted (it arrives
 * from a form on the client). Runs identically on both sides so the inline
 * errors staff see are the same ones the server would raise.
 */
export function validateEligibilityRequest(
  raw: unknown,
  now: Date = new Date(),
): { ok: true; value: EligibilityRequest } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const todayIso = now.toISOString().slice(0, 10)

  const patient = validatePerson(o.patient, 'patient', errors, todayIso)
  const carrierName = str(o.carrierName)
  if (!carrierName) errors.carrierName = 'Carrier is required'
  const memberIdRaw = str(o.memberId)
  const memberId = memberIdRaw.replace(/\s+/g, ' ')
  if (memberId.replace(/[\s-]/g, '').length < 3) errors.memberId = 'Enter the member ID from the card'
  const groupNumber = str(o.groupNumber) || null
  const relationshipRaw = str(o.relationship) as InsuranceRelationship
  const relationship: InsuranceRelationship = INSURANCE_RELATIONSHIPS.some((r) => r.id === relationshipRaw)
    ? relationshipRaw
    : 'self'
  let subscriber: EligibilityPerson | null = null
  if (relationship !== 'self') {
    subscriber = validatePerson(o.subscriber, 'subscriber', errors, todayIso)
  }

  if (Object.keys(errors).length > 0 || !patient) return { ok: false, errors }
  return {
    ok: true,
    value: { patient, carrierName, memberId, groupNumber, relationship, subscriber },
  }
}

/** Build a self-subscriber request from what a patient row already holds. */
export function requestFromOnFile(row: {
  firstName: string
  lastName: string
  dateOfBirth: string | null
  insuranceProvider: string | null
  insurancePolicyNumber: string | null
  insuranceGroupNumber: string | null
}): Partial<EligibilityRequest> {
  return {
    patient: { firstName: row.firstName, lastName: row.lastName, dateOfBirth: row.dateOfBirth ?? '' },
    carrierName: row.insuranceProvider ?? '',
    memberId: row.insurancePolicyNumber ?? '',
    groupNumber: row.insuranceGroupNumber,
    relationship: 'self',
    subscriber: null,
  }
}

/** Dollar string from cents for benefit figures ("$1,240"). */
export function benefitDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

export function summarizeCheckForTimeline(view: Pick<InsuranceCheckView, 'status' | 'driver' | 'result' | 'input'>): {
  title: string
  subtitle: string
} {
  const title = `Insurance check — ${STATUS_LABEL[view.status]}`
  const plan = view.result?.planName ?? view.input.carrierName
  const bits = [plan, isPracticeDriver(view.driver) ? 'practice answer' : null].filter(Boolean)
  return { title, subtitle: bits.join(' · ') }
}

/** The Action Ledger line, in the narrator's voice. */
export function ledgerSummaryForCheck(
  view: Pick<InsuranceCheckView, 'status' | 'driver' | 'input'>,
  patientDisplayName: string,
): string {
  const who = patientDisplayName.trim() || `${view.input.patient.firstName} ${view.input.patient.lastName}`.trim()
  const possessive = who.endsWith('s') ? `${who}’` : `${who}’s`
  const verdict = STATUS_LABEL[view.status].toLowerCase()
  const practice = isPracticeDriver(view.driver) ? ' (practice answer)' : ''
  return `Looked up ${possessive} ${view.input.carrierName} benefits — ${verdict}${practice}`
}

/**
 * The sandbox's steering wheel — member IDs ending in these digits force a
 * state so every card the tool can show is reachable on demand. Exported so
 * the page's tips block and the tests read one source.
 */
export const SANDBOX_STEERING: ReadonlyArray<{ suffix: string; outcome: string }> = [
  { suffix: '0000', outcome: 'Coverage ended (not active)' },
  { suffix: '9999', outcome: 'Member not found' },
  { suffix: '5555', outcome: 'Needs a look (subscriber mismatch)' },
  { suffix: '0001', outcome: 'The payer times out (a failed check)' },
]
