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

/**
 * sandbox     the built-in deterministic driver (practice answers)
 * stedi_test  Stedi with a TEST key: their predefined mock requests answer
 *             with sample benefits (practice answers, free)
 * stedi       Stedi with a LIVE key: the real payer, billed per check —
 *             needs an executed BAA (docs/COMPLIANCE.md)
 */
export type InsuranceDriverId = 'sandbox' | 'stedi_test' | 'stedi'

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
  /** The clearinghouse's payer id when staff picked the exact payer (Stedi
   *  drivers); null lets the driver resolve the carrier name, which refuses
   *  ambiguous names like "Delta Dental" (forty state plans). */
  payerId?: string | null
  /** The picked payer's display name, for the record. */
  payerName?: string | null
}

export type EligibilityStatus = 'active' | 'inactive' | 'not_found' | 'needs_review' | 'error'

export type NetworkStatus = 'in_network' | 'out_of_network' | 'unknown'

export type FrequencyCode = 'exam' | 'prophy' | 'bitewings' | 'fmx' | 'fluoride' | 'other'

/**
 * A dollar benefit as the payer stated it. Every part is nullable BY LAW: a
 * payer that answers "your maximum is $2,500" and nothing else has NOT said
 * how much is used, and showing "$2,500 left · $0 used" would be a guess
 * dressed up as a fact. At least one part is non-null when the object exists
 * (an all-null amount is `null`). When total and remaining are both stated,
 * used is their difference — arithmetic, not a guess.
 */
export interface BenefitAmount {
  totalCents: number | null
  usedCents: number | null
  remainingCents: number | null
}

/** The deductible, in the payer's own words (`individual` / `met`). Same nullability law. */
export interface DeductibleAmount {
  individualCents: number | null
  metCents: number | null
  remainingCents: number | null
}

export interface EligibilityResult {
  status: Exclude<EligibilityStatus, 'error'>
  payerName: string
  planName: string | null
  coverage: { effective: string | null; termination: string | null }
  network: NetworkStatus
  annualMax: BenefitAmount | null
  deductible: DeductibleAmount | null
  /** Family-level maximum / deductible, when the payer stated them (older rows: absent). */
  familyMax?: BenefitAmount | null
  familyDeductible?: DeductibleAmount | null
  /** The orthodontic lifetime maximum (STC 38, LIFETIME), when stated. */
  orthoLifetimeMax?: BenefitAmount | null
  /** Plan-pays percent per tier; null per tier when the payer didn't say (the UI shows —, never a guess). */
  coveragePct: { preventive: number | null; basic: number | null; major: number | null; ortho: number | null } | null
  waitingPeriods: Array<{ category: 'basic' | 'major' | 'ortho'; endsOn: string }>
  /** Code-owned copy for the allowance ("2 per year", "1 every 3 years") + the last date the plan saw one. */
  frequencies: Array<{ code: FrequencyCode; label: string; limit: string; lastOn: string | null; nextOn?: string | null }>
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
  /** The staff member who ran it, for "Checked today by Dana"; null for seeded or system rows. */
  requestedByName: string | null
}

/**
 * Driver switch — the same idiom as EMAIL_DRIVER / SMS_DRIVER / AI_DRIVER.
 * Unknown or blank values resolve to the sandbox: a typo in an env var must
 * never route a front desk's question to nothing.
 */
export function resolveInsuranceDriverId(env: Record<string, string | undefined> = process.env): InsuranceDriverId {
  const raw = (env.INSURANCE_DRIVER ?? '').trim().toLowerCase()
  if (raw === 'stedi') {
    // The mode is an explicit second switch, never sniffed from the key: the
    // wrong guess either bills the owner or labels a real answer as practice.
    return (env.STEDI_MODE ?? '').trim().toLowerCase() === 'live' ? 'stedi' : 'stedi_test'
  }
  return 'sandbox'
}

export const INSURANCE_DRIVER_LABEL: Record<InsuranceDriverId, { pill: string; short: string; title: string }> = {
  sandbox: {
    pill: 'Practice answer',
    short: 'Practice',
    title:
      'A sample answer from the built-in sandbox — not a real payer check. Confirm with the carrier before quoting a patient.',
  },
  stedi_test: {
    pill: 'Test payer answer',
    short: 'Test',
    title:
      'Stedi test mode: the payer’s sample benefits for a mock member, not this patient’s real coverage. Confirm with the carrier before quoting a patient.',
  },
  stedi: {
    pill: 'Payer answer',
    short: 'Payer',
    title:
      'Checked with the payer through Stedi. Benefits are the payer’s estimate; eligibility on the day of service governs.',
  },
}

/** Which drivers give practice answers rather than real ones. */
export function isPracticeDriver(driver: InsuranceDriverId): boolean {
  return driver !== 'stedi'
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
  const payerId = str(o.payerId) || null
  const payerName = str(o.payerName) || null

  if (Object.keys(errors).length > 0 || !patient) return { ok: false, errors }
  return {
    ok: true,
    value: { patient, carrierName, memberId, groupNumber, relationship, subscriber, payerId, payerName },
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

/** "Dec 8, 2028" from an ISO calendar date; junk is returned as typed. */
export function niceDate(iso: string | null | undefined): string {
  if (!iso || !ISO_DATE.test(iso)) return iso ?? ''
  const d = new Date(`${iso}T00:00:00Z`)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Dollar string from cents for benefit figures ("$1,240"). */
export function benefitDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

/** The deductible in the shared total/used/remaining shape. */
export function deductibleAsAmount(d: DeductibleAmount | null | undefined): BenefitAmount | null {
  if (!d) return null
  return { totalCents: d.individualCents, usedCents: d.metCents, remainingCents: d.remainingCents }
}

/** A benefit amount with nothing stated is no amount at all. */
export function hasAnyAmount(a: BenefitAmount | null | undefined): a is BenefitAmount {
  return !!a && (a.totalCents != null || a.usedCents != null || a.remainingCents != null)
}

export interface BenefitAmountCopy {
  /** The big number ("$1,240 left", "Up to $2,500", "Met"). */
  headline: string
  /** The honest sub-line ("of $2,500 · $1,260 used", "the payer didn’t say how much is used"). */
  sub: string
  /** used ÷ total when BOTH are stated (the heartbeat's fuel); null otherwise — never drawn from a guess. */
  fractionUsed: number | null
  /** Whether the sub-line is a "didn't say" caveat rather than a fact. */
  caveat: boolean
}

/**
 * THE ONE HOME for how a dollar benefit is worded — the result card, the rail
 * card, the printable sheet and the copied summary all read it. The law: say
 * what the payer stated, derive only what arithmetic allows, and say out loud
 * what the payer left out.
 */
export function describeBenefitAmount(a: BenefitAmount | null | undefined, kind: 'max' | 'deductible'): BenefitAmountCopy | null {
  if (!hasAnyAmount(a)) return null
  const total = a.totalCents
  const remaining = a.remainingCents
  // Used is the payer's figure, else the difference when both ends are known.
  const used = a.usedCents ?? (total != null && remaining != null ? Math.max(0, total - remaining) : null)
  const fractionUsed = total != null && total > 0 && used != null ? Math.min(1, used / total) : null
  const left = remaining ?? (total != null && used != null ? Math.max(0, total - used) : null)

  if (kind === 'deductible') {
    if (left != null) {
      if (left === 0) {
        return { headline: 'Met', sub: total != null ? `the ${benefitDollars(total)} deductible is met for the year` : 'met for the year', fractionUsed, caveat: false }
      }
      if (total != null) return { headline: `${benefitDollars(left)} left`, sub: `of ${benefitDollars(total)}${used != null ? ` · ${benefitDollars(used)} met` : ''}`, fractionUsed, caveat: false }
      return { headline: `${benefitDollars(left)} left`, sub: 'the payer didn’t say the full deductible', fractionUsed, caveat: true }
    }
    if (total != null) return { headline: benefitDollars(total), sub: 'the payer didn’t say how much is met', fractionUsed: null, caveat: true }
    // Only "met" is known.
    return { headline: `${benefitDollars(used!)} met`, sub: 'the payer didn’t say the full deductible', fractionUsed: null, caveat: true }
  }

  if (left != null) {
    if (total != null) {
      const usedText = used != null ? (left === 0 ? 'all used this year' : `${benefitDollars(used)} used`) : null
      return { headline: `${benefitDollars(left)} left`, sub: `of ${benefitDollars(total)}${usedText ? ` · ${usedText}` : ''}`, fractionUsed, caveat: false }
    }
    return { headline: `${benefitDollars(left)} left`, sub: 'the payer didn’t say the yearly maximum', fractionUsed, caveat: true }
  }
  if (total != null) {
    return { headline: `Up to ${benefitDollars(total)}`, sub: 'the payer didn’t say how much is used', fractionUsed: null, caveat: true }
  }
  // Only "used" is known — rare, but a real payer sentence.
  return { headline: `${benefitDollars(used!)} used`, sub: 'the payer didn’t say the yearly maximum', fractionUsed: null, caveat: true }
}

/**
 * How long a verdict stays worth trusting. Benefits move with every claim the
 * office across town files, and a plan can end on the last day of any month —
 * a month-old check is a lead, not an answer.
 */
export const VERIFICATION_FRESH_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export function isStaleCheck(checkedAtIso: string, now: Date = new Date()): boolean {
  const at = new Date(checkedAtIso).getTime()
  if (!Number.isFinite(at)) return true
  return now.getTime() - at > VERIFICATION_FRESH_DAYS * DAY_MS
}

/** "today", "yesterday", "6 days ago", "3 weeks ago", "4 months ago", "over a year ago". */
export function checkAgeLabel(checkedAtIso: string, now: Date = new Date()): string {
  const at = new Date(checkedAtIso).getTime()
  if (!Number.isFinite(at)) return 'some time ago'
  const days = Math.floor((now.getTime() - at) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const w = Math.floor(days / 7)
    return w === 1 ? 'a week ago' : `${w} weeks ago`
  }
  if (days < 365) {
    const m = Math.floor(days / 30)
    return m === 1 ? 'a month ago' : `${m} months ago`
  }
  return 'over a year ago'
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
  { suffix: '7777', outcome: 'Active, but the payer only states the yearly maximum (no "used" figure)' },
]
