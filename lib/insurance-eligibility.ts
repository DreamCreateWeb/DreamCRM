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
 * THE RELEASE GATE — OPEN (polish phase 6, 2026-10-03). The tool previewed
 * to platform admins only from 2026-09-30 (owner ruling: "hide it for now —
 * I have real clients now") and was released to every clinic once the six
 * polish phases landed. Every surface of the tool — the page, its actions,
 * the patient-record rail card + nudge — still asks this ONE question, so a
 * future preview (a new driver, say) is one predicate away rather than a
 * sweep: the tool is a CLINIC feature, and a patient or the platform tenant
 * never sees it. The sidebar + ⌘K ride the module registry (no
 * `platformAdminOnly` flag any more) and the roster lane rides
 * PREVIEW_CAPABILITIES (now empty).
 */
export function canUseInsuranceTool(ctx: { tenantType?: string | null }): boolean {
  return ctx.tenantType === 'clinic'
}

/**
 * THE INCLUDED ALLOWANCE (polish phase 6). A LIVE check reaches a real payer
 * and is billed per check to the Dream Create account, so every clinic gets
 * an included number a month and the tool says so plainly — "12 of 200
 * checks used this month" — rather than silently billing past it. Only the
 * `stedi` (live) driver counts: sandbox and test-mode answers are free. The
 * month is the CLINIC-LOCAL calendar month (lib/clinic-timezone.ts), the same
 * window the rest of the dashboard reports in. Env-overridable per platform
 * (`INSURANCE_INCLUDED_MONTHLY_CHECKS`) in the service, never per clinic —
 * a per-clinic knob would be a plan tier by another name (the no-plan-gating
 * convention).
 */
export const INCLUDED_MONTHLY_INSURANCE_CHECKS = 200

/** Whether a driver's checks are billed per call (and so count against the allowance). */
export function isBilledDriver(driver: InsuranceDriverId): boolean {
  return driver === 'stedi'
}

export interface InsuranceUsage {
  /** Billed checks so far this clinic-local month. */
  used: number
  included: number
  /** The count could not be read — the allowance fails OPEN and the counter hides. */
  unreadable: boolean
}

/** "12 of 200 checks used this month" / "All 200 included checks used this month". */
export function usageLine(usage: InsuranceUsage): string {
  if (usage.used >= usage.included) return `All ${usage.included} included checks used this month`
  return `${usage.used} of ${usage.included} checks used this month`
}

/**
 * THE READINESS RULE. A live payer answers a PROVIDER, so a live check needs
 * the practice's own NPI (`clinic_profile.npi`, Settings → Business profile)
 * or the platform fallback `STEDI_DEFAULT_NPI`. Test mode rides Stedi's mock
 * NPI and the sandbox needs none, so only the live driver can be "not ready".
 * Pure so the page, the rail card and the service agree on one answer.
 */
export function needsPracticeNpi(
  driver: InsuranceDriverId,
  storedNpi: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (driver !== 'stedi') return false
  const stored = (storedNpi ?? '').replace(/\D/g, '')
  if (stored.length === 10) return false
  const fallback = (env.STEDI_DEFAULT_NPI ?? '').replace(/\D/g, '')
  return fallback.length !== 10
}

/** The one copy for the not-ready state, shared by the page, the rail card and the refusal. */
export const NPI_READINESS_COPY = {
  title: 'Add your practice NPI to start checking',
  body: 'Payers answer a provider, so a live check needs the practice’s NPI. It lives on the Business profile — one box, once.',
  cta: 'Add the NPI in Settings →',
  href: '/settings/clinic',
  refusal: 'Add the practice’s NPI on the Business profile before checking — payers need it to answer.',
} as const

/** Ten digits or nothing — the shape a payer accepts; punctuation is noise. */
export function normalizeNpi(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  return digits.length === 10 ? digits : null
}

/**
 * THE INTRO CARD (2026-10-05, self-serve setup). Until a clinic turns the
 * tool on, /insurance shows what it is and one button — "Enable and set
 * up" — and the record hides the rail card. One home for the copy so the
 * intro, the tests and the runbook say the same thing.
 */
export const INSURANCE_INTRO = {
  title: 'Insurance checks',
  lede: 'Know a patient’s benefits before they sit down — typed from the card, answered in seconds, kept on their record.',
  does: [
    'Type what’s on the card, or scan a photo of it, and get a benefits snapshot: what’s left this year, the deductible, what the plan pays, waiting periods, and when the next exam or cleaning is covered.',
    'The record remembers the card — a re-check from the patient’s page is one tap, and every answer stays in their history.',
    'Print a one-page benefits sheet for the chart, or copy a plain summary into your PMS notes.',
  ],
  know: [
    `${INCLUDED_MONTHLY_INSURANCE_CHECKS} checks a month are included once real payer answers are on; the page always says where the month stands.`,
    'Every answer says who gave it — a practice or test answer is labelled, a payer answer is not. Confirm with the carrier before quoting a patient.',
    'A scanned card photo is read by an AI service to fill the boxes; the photo itself is kept on the patient’s record.',
  ],
  npiLabel: 'Practice NPI',
  npiHelp: 'Payers answer a provider, so real answers need the practice’s 10-digit NPI. It also lives on the Business profile.',
  enable: 'Enable and set up',
  turnOn: 'Turn on insurance checks',
  turnOff: 'Turn off insurance checks',
  askManager: 'An owner or admin turns this on for the practice.',
  npiRefusal: 'An NPI is ten digits — check it against the practice’s paperwork.',
  npiRequired: 'Add the practice’s NPI to turn on real payer answers.',
} as const

/** The pure half of the demo rule: WHICH driver a check actually runs under. */
export function effectiveInsuranceDriver(opts: {
  driver: InsuranceDriverId
  storedNpi: string | null | undefined
  isDemo: boolean
  env?: Record<string, string | undefined>
}): { driver: InsuranceDriverId; needsNpi: boolean } {
  const missing = needsPracticeNpi(opts.driver, opts.storedNpi, opts.env)
  // The demo clinic gets the SAME driver as every org (owner ruling
  // 2026-10-01: a silent sandbox swap turned the owner's own test into a fake
  // answer) — EXCEPT where the live driver would only refuse it. A demo with
  // no NPI cannot reach a payer, so the sandbox, labelled "Practice answer"
  // on every result, is the one honest fallback there.
  if (missing && opts.isDemo) return { driver: 'sandbox', needsNpi: false }
  return { driver: opts.driver, needsNpi: missing }
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

/** A named frequency line → the sheet's procedure line it answers ('other' answers a category, not a line). */
export const FREQ_TO_KEY: Partial<Record<FrequencyCode, FormProcedureKey>> = {
  exam: 'exam',
  prophy: 'prophy',
  bitewings: 'bitewings',
  fmx: 'fmx',
  fluoride: 'fluoride',
}

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

/**
 * THE VERIFICATION SHEET'S VOCABULARY (2026-10-08). A desk's breakdown form
 * (the one Ted Pinney's office fills by phone) asks for more than the card
 * showed: the group and employer, the payer's phone and claims address,
 * whether the benefit year is calendar or plan, what the deductible applies
 * to, seven tiers rather than four, the per-procedure lines (last date,
 * frequency, percent), replacement windows, age limits, downgrades, and
 * every note the payer sent. Most of it was already in the 271 and being
 * dropped. Every field below is OPTIONAL on the result (older stored rows
 * lack them) and NULLABLE inside (the payer may not have said) — the sheet
 * prints a blank, never a guess.
 */
export interface PlanFacts {
  groupNumber: string | null
  /** The group's description — usually the employer. */
  groupName: string | null
  planNumber: string | null
  /** The payer's insurance type word ("GROUP_POLICY", "PPO", …), in desk words via insuranceTypeLabel. */
  insuranceType: string | null
  /** Whether the maximum and deductible run on the calendar year or the plan's own year. */
  benefitYear: 'calendar' | 'plan' | null
  benefitYearStart: string | null
  benefitYearEnd: string | null
  /** The networks the plan names ("STANDARD DENTAL NETWORK, PPO II NETWORK"). */
  networks?: string[]
  /** Self-funded (the employer pays claims; ERISA, not state mandates) or fully insured, when the payer said. */
  funding?: 'self' | 'fully' | null
}

export interface PayerContact {
  name: string | null
  phones: string[]
  faxes: string[]
  emails: string[]
  urls: string[]
}

export interface PayerContacts {
  contacts: PayerContact[]
  /** A claims mailing address the payer sent on a related entity, formatted on one line. */
  claimsAddress: string | null
}

/** What the deductible applies to; null per tier when the payer didn't say. */
export interface DeductibleApplies {
  preventive: boolean | null
  basic: boolean | null
  major: boolean | null
  /** The payer's own words ("BASIC/MAJOR/SELECT"). */
  note: string | null
}

export type CoverageTier = 'diagnostic' | 'preventive' | 'basic' | 'perio' | 'endo' | 'oralSurgery' | 'major' | 'ortho'

/** The procedure lines a verification sheet names. Keys are stable; codes list the siblings a payer may answer under (first = canonical). */
export type FormProcedureKey =
  | 'er_exam'
  | 'exam'
  | 'bitewings'
  | 'pa'
  | 'pano'
  | 'fmx'
  | 'srp'
  | 'perio_maint'
  | 'prophy'
  | 'fluoride'
  | 'sealants'
  | 'occlusal_guard'
  | 'crown'
  | 'bridge'
  | 'denture'

export interface FormProcedureDef {
  key: FormProcedureKey
  label: string
  codes: string[]
  /** Which tier's percent applies when the payer priced the tier and not the code. */
  tier: CoverageTier
}

export const FORM_PROCEDURES: readonly FormProcedureDef[] = [
  { key: 'er_exam', label: 'Emergency exam', codes: ['D0140'], tier: 'diagnostic' },
  { key: 'exam', label: 'Exam', codes: ['D0120', 'D0150'], tier: 'diagnostic' },
  { key: 'bitewings', label: 'Bitewings', codes: ['D0274', 'D0272', 'D0273', 'D0277'], tier: 'diagnostic' },
  { key: 'pa', label: 'Periapical X-ray', codes: ['D0220', 'D0230'], tier: 'diagnostic' },
  { key: 'pano', label: 'Panoramic X-ray', codes: ['D0330'], tier: 'diagnostic' },
  { key: 'fmx', label: 'Full-mouth X-rays', codes: ['D0210'], tier: 'diagnostic' },
  { key: 'srp', label: 'Scaling & root planing', codes: ['D4341', 'D4342'], tier: 'perio' },
  { key: 'perio_maint', label: 'Perio maintenance', codes: ['D4910'], tier: 'perio' },
  { key: 'prophy', label: 'Cleaning', codes: ['D1110', 'D1120'], tier: 'preventive' },
  { key: 'fluoride', label: 'Fluoride', codes: ['D1206', 'D1208'], tier: 'preventive' },
  { key: 'sealants', label: 'Sealants', codes: ['D1351'], tier: 'preventive' },
  { key: 'occlusal_guard', label: 'Occlusal guard', codes: ['D9944', 'D9945', 'D9946', 'D9940'], tier: 'major' },
  { key: 'crown', label: 'Crown', codes: ['D2740', 'D2750', 'D2710', 'D2752'], tier: 'major' },
  { key: 'bridge', label: 'Bridge', codes: ['D6240', 'D6750', 'D6792', 'D6245'], tier: 'major' },
  { key: 'denture', label: 'Denture / partial', codes: ['D5110', 'D5120', 'D5213', 'D5214'], tier: 'major' },
]

export function formProcedure(key: FormProcedureKey): FormProcedureDef {
  return FORM_PROCEDURES.find((p) => p.key === key)!
}

/** One procedure line as the payer answered it. */
export interface ProcedureBenefit {
  key: FormProcedureKey
  /** The code the payer actually answered under. */
  code: string
  label: string
  /** Plan-pays percent, or null when neither the code nor its tier was priced. */
  planPays: number | null
  /** 'code' = the payer priced this procedure itself; 'tier' = its category's rate (the code's range decides the category). */
  pctSource: 'code' | 'tier' | null
  /** Code-owned allowance words ("2 per plan year", "1 every 60 months"); null when the payer set no limit. */
  limit: string | null
  lastOn: string | null
  nextOn: string | null
  /** The payer's own notes on this line (boilerplate stripped; scope, shared-frequency and deductible facts are read into their own fields). */
  notes: string[]
  /** How many are left this period, when the payer counted. */
  remaining?: number | null
  /** Codes that draw on the same allowance. */
  sharesWith?: string[]
  /** Teeth / arches / "per full mouth", in desk words. */
  scope?: string | null
  /** Whether the deductible applies to this line, when the payer said. */
  deductibleApplies?: boolean | null
}

export interface ReplacementRules {
  /** Months between covered crown / bridge replacements, when stated. */
  crownBridgeMonths: number | null
  dentureMonths: number | null
  /** Whether the payer pays major work on the seat (insertion) date or the prep date. */
  paysOn: 'seat' | 'prep' | null
}

export interface AgeLimits {
  fluoride: number | null
  sealants: number | null
  ortho: number | null
  /** Dependent children covered through this age. */
  dependent: number | null
}

/** One service the request names: the dental STC, or a CDT procedure code (the Full breakdown's asks). */
export interface EligibilityService {
  system: 'STC' | 'CDT'
  value: string
}

/**
 * THE FULL BREAKDOWN'S RECEIPT (2026-10-08): what was asked, what came
 * back with something specific, how many payer checks it took and why it
 * stopped. `mode` is how the payer answered: 'single' = every code in one
 * request; 'per_code' = the payer ignores extra codes and each was asked
 * on its own; 'mixed' = some of each; 'capped' = the month's allowance
 * stopped it before every code was asked (the sheet still prints what it
 * has, with blanks).
 */
export interface BreakdownSummary {
  requestedCodes: string[]
  answeredKeys: FormProcedureKey[]
  /** Codes asked on their own and still unanswered (the payer had nothing specific). */
  silentCodes: string[]
  /** Codes whose own request failed (stored as a note, never as an answer). */
  failedCodes: string[]
  checks: number
  mode: 'single' | 'per_code' | 'mixed' | 'capped'
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
  coveragePct: {
    preventive: number | null
    basic: number | null
    major: number | null
    ortho: number | null
    /** The three extra tiers a breakdown form names (older rows: absent = not stated). */
    diagnostic?: number | null
    perio?: number | null
    endo?: number | null
    oralSurgery?: number | null
  } | null
  /** The same tiers on the out-of-network side, when the payer priced them. */
  coveragePctOut?: EligibilityResult['coveragePct']
  waitingPeriods: Array<{ category: 'basic' | 'major' | 'ortho'; endsOn: string }>
  /** The payer said in words that the plan has no waiting periods. */
  noWaitingPeriods?: boolean
  /** Code-owned copy for the allowance ("2 per year", "1 every 3 years") + the last date the plan saw one. */
  frequencies: Array<{
    code: FrequencyCode
    label: string
    limit: string
    lastOn: string | null
    nextOn?: string | null
    /** How many are left this period, when the payer counted ("2 remaining"). */
    remaining?: number | null
    /** Codes that draw on the same allowance ("Shares frequency with D0145, D0150"). */
    sharesWith?: string[]
    /** The payer's scope words for the line — teeth, arches, "per full mouth" — in desk words. */
    scope?: string | null
    /** The payer said the deductible is waived on this line. */
    noDeductible?: boolean | null
  }>
  missingToothClause: boolean | null
  notes: string[]
  /** When the payer (or the sandbox) answered — ISO instant. */
  asOf: string
  // ── The verification sheet's fields (2026-10-08) ─────────────────────
  plan?: PlanFacts | null
  payerContacts?: PayerContacts | null
  deductibleApplies?: DeductibleApplies | null
  /** The form's named procedure lines, only those the payer said anything about. */
  procedures?: ProcedureBenefit[]
  replacement?: ReplacementRules | null
  ageLimits?: AgeLimits | null
  /** Downgrade / alternate-benefit sentences, verbatim. */
  downgrades?: string[]
  /** EVERY note the payer sent, deduped, in the payer's order (the sheet's MISC box). */
  payerNotes?: string[]
  /** Present when this answer is a Full breakdown — the per-procedure asks and their receipt. */
  breakdown?: BreakdownSummary | null
}

/** The payer's insurance-type word in desk words. */
export function insuranceTypeLabel(v: string | null | undefined): string | null {
  if (!v) return null
  const map: Record<string, string> = {
    GROUP_POLICY: 'Group plan',
    PREFERRED_PROVIDER_ORGANIZATION: 'PPO',
    PPO: 'PPO',
    HEALTH_MAINTENANCE_ORGANIZATION: 'HMO',
    HMO: 'HMO',
    INDEMNITY: 'Indemnity',
    EXCLUSIVE_PROVIDER_ORGANIZATION: 'EPO',
    POINT_OF_SERVICE: 'POS',
    MEDICAID: 'Medicaid',
    MEDICARE_PART_A: 'Medicare',
    MEDICARE_PART_B: 'Medicare',
    COMMERCIAL: 'Commercial',
    DENTAL: 'Dental',
    INDIVIDUAL_POLICY: 'Individual plan',
    OTHER: 'Other',
  }
  if (map[v]) return map[v]
  const words = v.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** "10 years", "18 months", "5 years" — a replacement window in desk words. */
export function replacementWords(months: number | null | undefined): string | null {
  if (months == null || !Number.isFinite(months) || months <= 0) return null
  if (months % 12 === 0) {
    const y = months / 12
    return `${y} ${y === 1 ? 'year' : 'years'}`
  }
  return `${months} months`
}

/** Plan-pays in words; the sheet and the summary share it. */
/**
 * A payer's scope words in desk words: "TOOTH NUMBER 01 TO 05 12 TO 16,TOOTH
 * NUMBER 17 TO 21 28 TO 32" → "teeth 1–5, 12–16, 17–21, 28–32"; "PER FULL
 * MOUTH" → "per full mouth". Anything unrecognised is lower-cased as is.
 */
export function scopeWords(raw: string): string {
  const t = raw.trim()
  if (/TOOTH (NUMBER|NUMBERS|NO\.?|#)/i.test(t)) {
    const ranges: string[] = []
    const re = /(\d{1,2})\s*(?:TO|-|THRU|THROUGH)\s*(\d{1,2})/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(t))) ranges.push(`${Number(m[1])}–${Number(m[2])}`)
    if (ranges.length) return `teeth ${ranges.join(', ')}`
  }
  return t.toLowerCase().replace(/\s+/g, ' ')
}

/** "Standard Dental, PPO II, Dental Extend networks" — the plan's network names, without the shouting. */
export function networkWords(list: string[] | null | undefined): string | null {
  if (!list?.length) return null
  const names = list.map((n) =>
    n
      .trim()
      .replace(/\s+NETWORK$/i, '')
      .toLowerCase()
      .replace(/\b([a-z])/g, (c) => c.toUpperCase())
      .replace(/\b(Ppo|Hmo|Epo|Dhmo|Dppo|Ii|Iii|Iv)\b/g, (c) => c.toUpperCase()),
  )
  return `${names.join(', ')} ${names.length === 1 ? 'network' : 'networks'}`
}

/** "Self-funded plan" / "Fully insured plan" — how the plan pays claims, when the payer said. */
export function fundingWords(v: 'self' | 'fully' | null | undefined): string | null {
  return v === 'self' ? 'Self-funded plan' : v === 'fully' ? 'Fully insured plan' : null
}

/** "counts with D0145, D0150, D0180" — the codes that share one allowance. */
export function sharesWords(codes: string[] | null | undefined): string | null {
  if (!codes?.length) return null
  return `counts with ${codes.join(', ')}`
}

/**
 * THE ONE HOME for a line's small facts, in order: scope, shared codes, the
 * deductible, what's left — read by the card's sub-line, the sheet's
 * history table and the copied summary, so the three never word it apart.
 */
export function lineFacts(p: { scope?: string | null; sharesWith?: string[]; deductibleApplies?: boolean | null; noDeductible?: boolean | null; remaining?: number | null }): string[] {
  const out: string[] = []
  if (p.scope) out.push(p.scope)
  const shares = sharesWords(p.sharesWith)
  if (shares) out.push(shares)
  if (p.deductibleApplies === false || p.noDeductible === true) out.push('no deductible')
  else if (p.deductibleApplies === true) out.push('deductible applies')
  if (p.remaining != null) out.push(`${p.remaining} left this period`)
  return out
}

export function planPaysWord(v: number | null | undefined): string {
  if (v == null) return 'not stated'
  if (v === 0) return 'not covered'
  return `${v}%`
}

/** The tier a CDT code belongs to by its range — the ADA's own categories. */
export function tierForCdt(code: string): CoverageTier | null {
  const n = Number(code.replace(/^D/i, ''))
  if (!Number.isFinite(n)) return null
  if (n >= 100 && n <= 999) return 'diagnostic'
  if (n >= 1000 && n <= 1999) return 'preventive'
  if (n >= 2000 && n <= 2699) return 'basic'
  if (n >= 2700 && n <= 2999) return 'major'
  if (n >= 3000 && n <= 3999) return 'endo'
  if (n >= 4000 && n <= 4999) return 'perio'
  if (n >= 5000 && n <= 6999) return 'major'
  if (n >= 7000 && n <= 7999) return 'oralSurgery'
  if (n >= 8000 && n <= 8999) return 'ortho'
  if (n >= 9000 && n <= 9999) return 'basic'
  return null
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
  /** Payer checks this row cost against the month's allowance (a Full breakdown can be several). Older rows: 1. */
  billedChecks?: number
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

// ── The remembered card ────────────────────────────────────────────────

export type InsuranceDetailSource = 'check' | 'staff' | 'pms' | 'intake'

/**
 * THE RECORD REMEMBERS THE CARD (polish phase 3). What the three flat patient
 * columns cannot hold and a re-check needs: the exact payer, the plan, whose
 * name the policy is in. Stored in `patient.insurance_detail` (jsonb) and
 * TRUSTED ONLY while `memberId` still equals the on-file policy number —
 * every other writer of the flat columns (PMS sync, the portal profile form,
 * the staff editor) keeps working as before, and a changed card silently
 * retires the detail. `source` says who last stamped it.
 */
export interface PatientInsuranceDetail {
  memberId: string
  payerId: string | null
  payerName: string | null
  planName: string | null
  relationship: InsuranceRelationship
  subscriber: EligibilityPerson | null
  effectiveOn?: string | null
  expiresOn?: string | null
  source: InsuranceDetailSource
  /** ISO instant. */
  updatedAt: string
}

const DETAIL_SOURCES: ReadonlySet<string> = new Set(['check', 'staff', 'pms', 'intake'])

function optionalDate(v: unknown): string | null {
  const s = str(v)
  return s && isRealCalendarDate(s) ? s : null
}

/** Untrusted jsonb → a typed detail, or null for anything that isn't one. */
export function parseInsuranceDetail(raw: unknown): PatientInsuranceDetail | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const memberId = str(o.memberId)
  if (!memberId) return null
  const relationshipRaw = str(o.relationship) as InsuranceRelationship
  const relationship: InsuranceRelationship = INSURANCE_RELATIONSHIPS.some((r) => r.id === relationshipRaw)
    ? relationshipRaw
    : 'self'
  let subscriber: EligibilityPerson | null = null
  if (relationship !== 'self' && o.subscriber && typeof o.subscriber === 'object') {
    const sub = o.subscriber as Record<string, unknown>
    const firstName = str(sub.firstName)
    const lastName = str(sub.lastName)
    const dateOfBirth = str(sub.dateOfBirth)
    if (firstName && lastName && isRealCalendarDate(dateOfBirth)) subscriber = { firstName, lastName, dateOfBirth }
  }
  const sourceRaw = str(o.source)
  const updatedAtRaw = str(o.updatedAt)
  return {
    memberId,
    payerId: str(o.payerId) || null,
    payerName: str(o.payerName) || null,
    planName: str(o.planName) || null,
    relationship,
    subscriber,
    effectiveOn: optionalDate(o.effectiveOn),
    expiresOn: optionalDate(o.expiresOn),
    source: (DETAIL_SOURCES.has(sourceRaw) ? sourceRaw : 'staff') as InsuranceDetailSource,
    updatedAt: updatedAtRaw && Number.isFinite(new Date(updatedAtRaw).getTime()) ? updatedAtRaw : new Date(0).toISOString(),
  }
}

/** The detail a recognised check (or a Save) leaves on the record. */
export function detailFromRequest(
  input: EligibilityRequest,
  result: Pick<EligibilityResult, 'payerName' | 'planName' | 'coverage'> | null,
  source: InsuranceDetailSource,
  now: Date = new Date(),
): PatientInsuranceDetail {
  return {
    memberId: input.memberId.trim(),
    payerId: input.payerId?.trim() || null,
    payerName: input.payerName?.trim() || result?.payerName?.trim() || input.carrierName.trim() || null,
    planName: result?.planName?.trim() || null,
    relationship: input.relationship,
    subscriber: input.relationship === 'self' ? null : input.subscriber,
    effectiveOn: result?.coverage.effective ?? null,
    expiresOn: result?.coverage.termination ?? null,
    source,
    updatedAt: now.toISOString(),
  }
}

/** Which statuses mean the payer RECOGNISED the card (worth remembering). */
export function checkRecognisedCard(status: EligibilityStatus): boolean {
  return status === 'active' || status === 'inactive' || status === 'needs_review'
}

/** The detail applies to the on-file card only while the member ids agree. */
export function detailMatchesOnFile(detail: PatientInsuranceDetail | null, insurancePolicyNumber: string | null): detail is PatientInsuranceDetail {
  if (!detail) return false
  const onFile = (insurancePolicyNumber ?? '').trim()
  return !onFile || onFile === detail.memberId.trim()
}

/**
 * Build the request a re-check sends from what a patient row already holds.
 * The flat columns give the card; the remembered detail — ONLY when its
 * member id still matches — gives the exact payer and the policyholder, so
 * "Check now" on the record works first time for a dependent too.
 */
export function requestFromOnFile(row: {
  firstName: string
  lastName: string
  dateOfBirth: string | null
  insuranceProvider: string | null
  insurancePolicyNumber: string | null
  insuranceGroupNumber: string | null
  insuranceDetail?: unknown
}): Partial<EligibilityRequest> {
  const detail = parseInsuranceDetail(row.insuranceDetail)
  const base: Partial<EligibilityRequest> = {
    patient: { firstName: row.firstName, lastName: row.lastName, dateOfBirth: row.dateOfBirth ?? '' },
    carrierName: row.insuranceProvider ?? '',
    memberId: row.insurancePolicyNumber ?? '',
    groupNumber: row.insuranceGroupNumber,
    relationship: 'self',
    subscriber: null,
  }
  if (!detailMatchesOnFile(detail, row.insurancePolicyNumber)) return base
  return {
    ...base,
    carrierName: row.insuranceProvider || detail.payerName || '',
    memberId: row.insurancePolicyNumber || detail.memberId,
    relationship: detail.relationship,
    subscriber: detail.relationship === 'self' ? null : detail.subscriber,
    payerId: detail.payerId,
    payerName: detail.payerName,
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
