import {
  FORM_PROCEDURES,
  type AgeLimits,
  type BenefitAmount,
  type CoverageTier,
  type DeductibleAmount,
  type DeductibleApplies,
  type EligibilityRequest,
  type EligibilityResult,
  type EligibilityService,
  type EligibilityStatus,
  type FrequencyCode,
  type PayerContacts,
  type PlanFacts,
  type ProcedureBenefit,
  type ReplacementRules,
  scopeWords,
  tierForCdt,
} from '@/lib/insurance-eligibility'

/**
 * Stedi eligibility — the PURE half of the driver (no network, no server-only
 * import, so the tests can feed it captured payloads).
 *
 * WHAT STEDI IS. An API-first X12 270/271 clearinghouse: we POST a JSON
 * eligibility check naming the PAYER (their payer id), the PROVIDER (the
 * practice's NPI) and the PATIENT (member id, name, DOB), and get back the
 * payer's 271 already parsed into `plans[].benefits.<category>[]`
 * (deductible, outOfPocket, coInsurance, limitations, statuses, …). Every
 * entry is scoped by a service code (STC — "35" is Dental Care — or a CDT
 * procedure code), a coverage level, a network indicator and a time period.
 *
 * WHAT THIS FILE DOES. `buildStediRequest` turns our EligibilityRequest into
 * their request body; `normalizeStediResponse` turns their response into our
 * EligibilityResult, and maps the payer's AAA rejection codes onto our
 * statuses (member not found → not_found; duplicate id → needs_review; payer
 * down → a RETRYABLE throw the service stores as an error row).
 *
 * THE HONESTY LINE. A payer's 271 is an ESTIMATE of benefits, and most dental
 * payers only answer the questions asked in the way they choose to. So this
 * normalizer fills what the payer actually said and leaves the rest null
 * (the UI renders "—", never a made-up number), and it never claims the
 * provider's own network status — the response's network indicator says
 * which side of the network a BENEFIT applies to, not whether this practice
 * is in it (Stedi's docs are explicit on that).
 */

export const STEDI_API_BASE = 'https://healthcare.us.stedi.com'
export const STEDI_ELIGIBILITY_PATH = '/2026-06-01/eligibility-check'
export const STEDI_PAYER_SEARCH_PATH = '/2024-04-01/payers/search'
/** X12 service type code for "Dental Care" — the question we ask every payer. */
export const DENTAL_STC = '35'

// ── Payer search ────────────────────────────────────────────────────────

export interface StediPayerMatch {
  stediId: string
  displayName: string
  primaryPayerId: string
  aliases: string[]
  coverageTypes: string[]
  operatingStates: string[]
  eligibilitySupported: boolean
  score: number
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(asRecord) : []
}

/** Parse the Search Payers response into the few fields the picker shows. */
export function parsePayerSearch(json: unknown): StediPayerMatch[] {
  const items = asArray(asRecord(json).items)
  const out: StediPayerMatch[] = []
  for (const item of items) {
    const p = asRecord(item.payer)
    const primaryPayerId = asString(p.primaryPayerId)
    const displayName = asString(p.displayName)
    if (!primaryPayerId || !displayName) continue
    const support = asRecord(p.transactionSupport)
    out.push({
      stediId: asString(p.stediId) ?? primaryPayerId,
      displayName,
      primaryPayerId,
      aliases: asStringArray(p.aliases),
      coverageTypes: asStringArray(p.coverageTypes),
      operatingStates: asStringArray(p.operatingStates),
      eligibilitySupported: support.eligibilityCheck === 'SUPPORTED',
      score: typeof item.score === 'number' ? item.score : 0,
    })
  }
  return out
}

/**
 * Pick a payer from a name-only search, or refuse. Refuses when the search
 * is AMBIGUOUS — "Delta Dental" alone matches forty state plans with close
 * scores, and guessing California for a Kansas patient would return a
 * confident "not found". The form's payer picker exists so staff choose;
 * this fallback only accepts a clear winner.
 */
export function pickUnambiguousPayer(matches: StediPayerMatch[]): StediPayerMatch | null {
  const eligible = matches.filter((m) => m.eligibilitySupported)
  if (eligible.length === 0) return null
  if (eligible.length === 1) return eligible[0]
  const [top, second] = eligible
  if (second.score > top.score * 0.6) return null
  return top
}

// ── Request ─────────────────────────────────────────────────────────────

export interface StediRequestBody {
  payerId: string
  provider: { npi: string; name: { organization: string } }
  subscriber: { memberId: string; name: { person: { firstName: string; lastName: string } }; dateOfBirth: string }
  dependent?: {
    name: { person: { firstName: string; lastName: string } }
    dateOfBirth: string
    relationToSubscriber: 'SPOUSE' | 'CHILD' | 'OTHER_ADULT'
  }
  encounter: { services: EligibilityService[] }
  externalPatientId?: string
}

const RELATION: Record<'spouse' | 'child' | 'other', 'SPOUSE' | 'CHILD' | 'OTHER_ADULT'> = {
  spouse: 'SPOUSE',
  child: 'CHILD',
  other: 'OTHER_ADULT',
}

export function buildStediRequest(
  req: EligibilityRequest,
  opts: { payerId: string; npi: string; organizationName: string; externalPatientId?: string | null; services?: EligibilityService[] | null },
): StediRequestBody {
  const person = (p: { firstName: string; lastName: string }) => ({
    person: { firstName: p.firstName.trim(), lastName: p.lastName.trim() },
  })
  const body: StediRequestBody = {
    payerId: opts.payerId,
    provider: { npi: opts.npi, name: { organization: opts.organizationName.trim() || 'Dental practice' } },
    subscriber: {
      memberId: req.memberId.trim(),
      name: person(req.relationship === 'self' || !req.subscriber ? req.patient : req.subscriber),
      dateOfBirth: req.relationship === 'self' || !req.subscriber ? req.patient.dateOfBirth : req.subscriber.dateOfBirth,
    },
    // The dental question by default; the Full breakdown names the codes.
    encounter: { services: opts.services?.length ? opts.services : [{ system: 'STC', value: DENTAL_STC }] },
  }
  if (req.relationship !== 'self' && req.subscriber) {
    body.dependent = {
      name: person(req.patient),
      dateOfBirth: req.patient.dateOfBirth,
      relationToSubscriber: RELATION[req.relationship],
    }
  }
  if (opts.externalPatientId) body.externalPatientId = opts.externalPatientId
  return body
}

// ── Response ────────────────────────────────────────────────────────────

/** Thrown when the payer (or Stedi) could not answer right now — the
 *  service stores an error row; a re-check later is the right move. */
export class StediRetryableError extends Error {
  readonly retryable = true
  constructor(message: string) {
    super(message)
    this.name = 'StediRetryableError'
  }
}

/** AAA codes → what they mean for the person at the desk. */
const NOT_FOUND_CODES = new Set(['58', '64', '65', '67', '71', '72', '73', '75'])
const NEEDS_REVIEW_CODES = new Set(['76'])
const RETRY_CODES = new Set(['42', '79', '80'])
/** The payer doesn't know the PROVIDER — a practice-setup problem, never a retry. */
const PROVIDER_CODES = new Set(['41', '43', '50', '51'])

const BLUE_PLAN = /blue\s*cross|blue\s*shield|bcbs|anthem|blue\s*advantage/i
/**
 * Two things a front desk learns the hard way with Blue plans, offered on a
 * "not found": the alpha prefix is part of the member ID, and Blue Advantage
 * answers at its own door, not the state Blue Cross plan's.
 */
export const BLUE_PLAN_HINT =
  'Blue plans: enter the member ID with the letter prefix printed on the card, and a card that says Blue Advantage is its own payer — pick “Blue Advantage” in the list rather than the state Blue Cross plan.'

interface AaaError {
  code: string | null
  description: string | null
  location: string | null
}

function readErrors(json: Record<string, unknown>): AaaError[] {
  return asArray(json.errors).map((e) => ({
    code: asString(e.code),
    description: asString(e.description),
    location: asString(e.location),
  }))
}

type Entry = Record<string, unknown>

function entries(benefits: Record<string, unknown>, category: string): Entry[] {
  return asArray(benefits[category])
}
function serviceValue(e: Entry): string | null {
  return asString(asRecord(e.service).value)
}
function serviceSystem(e: Entry): string | null {
  return asString(asRecord(e.service).system)
}
function messages(e: Entry): string[] {
  return asStringArray(e.messages)
}
function cents(v: unknown): number | null {
  const s = asString(v)
  if (!s) return null
  const n = Number(s.replace(/[$,]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}
/** The payer's coinsurance percent is the PATIENT's share; "0.2" and "20" both mean 20%. */
function patientSharePct(v: unknown): number | null {
  const s = asString(v)
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  const pct = n <= 1 ? n * 100 : n
  return pct > 100 ? null : Math.round(pct)
}

const DENTAL_STCS = new Set(['35', '23', '24', '25', '26', '27', '28', '36', '37', '38', '39', '40', '41'])
function isDentalish(e: Entry): boolean {
  const v = serviceValue(e)
  if (!v) return true // unscoped entries apply to the plan as a whole
  if (serviceSystem(e) === 'CDT') return true
  return DENTAL_STCS.has(v) || v === '30'
}
function isIndividual(e: Entry): boolean {
  const lvl = asString(e.coverageLevel)
  return !lvl || lvl === 'INDIVIDUAL' || lvl === 'EMPLOYEE_ONLY'
}
/** Family-level rows: FAMILY, EMPLOYEE_AND_SPOUSE, EMPLOYEE_AND_CHILDREN, … — anything stated for more than one person. */
function isFamily(e: Entry): boolean {
  const lvl = asString(e.coverageLevel)
  return !!lvl && !isIndividual(e)
}
function networkRank(e: Entry): number {
  const ind = asString(asRecord(e.network).indicator)
  if (ind === 'IN_NETWORK') return 0
  if (!ind || ind === 'IN_AND_OUT_OF_NETWORK') return 1
  return 2
}
function period(e: Entry): string | null {
  return asString(e.timePeriod)
}
const YEAR_PERIODS = new Set(['CALENDAR_YEAR', 'SERVICE_YEAR', 'YEARS', 'YEAR_TO_DATE', 'CONTRACT'])

type AmountWant = 'year' | 'remaining' | 'lifetime' | 'lifetime_remaining'

function wantsPeriod(want: AmountWant, p: string | null): boolean {
  switch (want) {
    case 'remaining':
      return p === 'REMAINING'
    case 'lifetime':
      return p === 'LIFETIME'
    case 'lifetime_remaining':
      return p === 'LIFETIME_REMAINING'
    default:
      return !p || YEAR_PERIODS.has(p)
  }
}

/** The best-scoped amount for a category: the asked coverage level, in-network first. */
function pickAmount(list: Entry[], want: AmountWant, level: 'individual' | 'family' = 'individual'): number | null {
  const candidates = list
    .filter((e) => isDentalish(e) && (level === 'family' ? isFamily(e) : isIndividual(e)))
    .filter((e) => wantsPeriod(want, period(e)))
    .filter((e) => cents(e.amount) != null)
    .sort((a, b) => networkRank(a) - networkRank(b) || (serviceValue(b) === DENTAL_STC ? 1 : 0) - (serviceValue(a) === DENTAL_STC ? 1 : 0))
  return candidates.length ? cents(candidates[0].amount) : null
}

/**
 * Assemble what the payer STATED into a benefit amount. Used is derived only
 * when both ends are known — otherwise it stays null and the UI says so.
 */
function amountOf(total: number | null, remaining: number | null): BenefitAmount | null {
  if (total == null && remaining == null) return null
  return {
    totalCents: total,
    usedCents: total != null && remaining != null ? Math.max(0, total - remaining) : null,
    remainingCents: remaining,
  }
}
function deductibleOf(total: number | null, remaining: number | null): DeductibleAmount | null {
  if (total == null && remaining == null) return null
  return {
    individualCents: total,
    metCents: total != null && remaining != null ? Math.max(0, total - remaining) : null,
    remainingCents: remaining,
  }
}

/** STC → the tier the front desk talks in. */
const TIER_BY_STC: Record<string, CoverageTier> = {
  '41': 'preventive', // Routine (Preventive) Dental
  '23': 'diagnostic', // Diagnostic Dental
  '25': 'basic', // Restorative
  '24': 'perio', // Periodontics
  '26': 'endo', // Endodontics
  '40': 'oralSurgery', // Oral Surgery
  '28': 'basic', // Adjunctive Dental Services
  '36': 'major', // Dental Crowns
  '39': 'major', // Prosthodontics
  '27': 'major', // Maxillofacial Prosthetics
  '38': 'ortho', // Orthodontics
}

type TierPct = Record<CoverageTier, number | null>

function emptyTiers(): TierPct {
  return { diagnostic: null, preventive: null, basic: null, perio: null, endo: null, oralSurgery: null, major: null, ortho: null }
}

/**
 * Plan-pays per tier on one side of the network. The payer prices STCs;
 * the first stated row per tier wins (in-network first on the IN side).
 * Fallbacks are the desk's own: a plan that prices Restorative but not
 * Periodontics still has a "basic" number, and a plan that priced only
 * "Dental Care" has one number for everything but ortho.
 */
function tierPercents(coIns: Entry[], side: 'in' | 'out'): TierPct | null {
  const raw = emptyTiers()
  let generic: number | null = null
  // Plan RULES carry whatever coverage level the payer felt like stamping —
  // Aetna marks every percent and frequency FAMILY because the rule is
  // plan-wide — so the level is read only on dollar amounts (pickAmount).
  const rows = [...coIns]
    .filter((e) => {
      const ind = asString(asRecord(e.network).indicator)
      return side === 'out' ? ind === 'OUT_OF_NETWORK' : ind !== 'OUT_OF_NETWORK'
    })
    .sort((a, b) => networkRank(a) - networkRank(b))
  for (const e of rows) {
    const share = patientSharePct(e.percent)
    if (share == null) continue
    const stc = serviceSystem(e) === 'STC' ? serviceValue(e) : null
    if (stc && TIER_BY_STC[stc]) {
      const tier = TIER_BY_STC[stc]
      if (raw[tier] == null) raw[tier] = 100 - share
    } else if (stc === DENTAL_STC || stc === '30' || !stc) {
      // A plan-wide row that NAMES its tier ("Preventative", "Major,Ortho")
      // is that tier's rate; one that names nothing is the generic rate.
      const named = classifyMessages(e).filter((n) => n.kind === 'category' && n.category).map((n) => n.category!)
      if (named.length) {
        for (const t of named) if (raw[t] == null) raw[t] = 100 - share
      } else if (generic == null) generic = 100 - share
    }
  }
  const any = Object.values(raw).some((v) => v != null) || generic != null
  if (!any) return null
  const basic = raw.basic ?? raw.perio ?? raw.endo ?? raw.oralSurgery ?? generic
  return {
    diagnostic: raw.diagnostic ?? raw.preventive ?? generic,
    preventive: raw.preventive ?? raw.diagnostic ?? generic,
    basic,
    perio: raw.perio,
    endo: raw.endo,
    oralSurgery: raw.oralSurgery,
    major: raw.major ?? generic,
    ortho: raw.ortho,
  }
}

function coverageTiers(coIns: Entry[], side: 'in' | 'out' = 'in'): EligibilityResult['coveragePct'] {
  const t = tierPercents(coIns, side)
  if (!t) return null
  return {
    preventive: t.preventive,
    basic: t.basic,
    major: t.major,
    ortho: t.ortho,
    diagnostic: t.diagnostic,
    perio: t.perio,
    endo: t.endo,
    oralSurgery: t.oralSurgery,
  }
}

/** CDT procedure → the frequency rows the tool names. */
const FREQ_BY_CDT: Array<{ re: RegExp; code: FrequencyCode; label: string }> = [
  { re: /^D01(20|40|50)/, code: 'exam', label: 'Exams' },
  { re: /^D11(10|20)/, code: 'prophy', label: 'Cleanings' },
  { re: /^D027[0-9]/, code: 'bitewings', label: 'Bitewing X-rays' },
  { re: /^D0210/, code: 'fmx', label: 'Full-mouth X-rays' },
  { re: /^D12(06|08)/, code: 'fluoride', label: 'Fluoride' },
]

const PERIOD_LABEL: Record<string, string> = {
  CALENDAR_YEAR: 'per calendar year',
  SERVICE_YEAR: 'per plan year',
  YEARS: 'per year',
  YEAR_TO_DATE: 'year to date',
  MONTH: 'per month',
  WEEK: 'per week',
  LIFETIME: 'lifetime',
  LIFETIME_REMAINING: 'lifetime remaining',
  REMAINING: 'remaining',
  VISIT: 'per visit',
  DAY: 'per day',
}

/** Common CDT procedures the tool can name when the payer sends a bare code. */
const CDT_LABEL: Record<string, string> = {
  D0330: 'Panoramic X-ray',
  D1351: 'Sealants',
  D2140: 'Fillings',
  D2150: 'Fillings',
  D2391: 'Fillings',
  D2710: 'Crowns',
  D2740: 'Crowns',
  D2750: 'Crowns',
  D4341: 'Scaling & root planing',
  D4342: 'Scaling & root planing',
  D4381: 'Perio antibiotic',
  D4910: 'Perio maintenance',
  D5110: 'Dentures',
  D5120: 'Dentures',
  D6010: 'Implants',
  D6792: 'Bridges',
  D7140: 'Extractions',
}

/** A CDT code's desk label: the sheet's own line label when the code is one the form names, else the short table, else "CDT Dxxxx". */
function cdtLabel(code: string): string {
  const def = FORM_PROCEDURES.find((p) => p.codes.includes(code))
  if (def) return def.label
  return CDT_LABEL[code] ?? `CDT ${code}`
}

/** "2 per plan year", "1 every 5 years" — a service-limit period in desk words. */
function periodWords(value: number | null, qualifier: string | null): string {
  const q = (qualifier ?? '').toUpperCase()
  const n = value ?? 1
  switch (q) {
    case 'CONTRACT':
    case 'SERVICE_YEAR':
      return n <= 1 ? 'per plan year' : `every ${n} plan years`
    case 'CALENDAR_YEAR':
      return n <= 1 ? 'per calendar year' : `every ${n} calendar years`
    case 'YEAR':
    case 'YEARS':
      return n <= 1 ? 'per year' : `every ${n} years`
    case 'MONTH':
    case 'MONTHS':
      // "1 every 60 months" is "1 every 5 years" at a desk.
      if (n >= 12 && n % 12 === 0) return n === 12 ? 'per year' : `every ${n / 12} years`
      return n <= 1 ? 'per month' : `every ${n} months`
    case 'DAY':
    case 'DAYS':
      return n <= 1 ? 'per day' : `every ${n} days`
    case 'LIFETIME':
      return 'per lifetime'
    case 'VISIT':
      return 'per visit'
    default:
      return q ? q.toLowerCase().replace(/_/g, ' ') : ''
  }
}

/**
 * A limitation row's delivery: the count, and the span it is counted over.
 * Payers send the span two ways — `period` ("3 per 1 CALENDAR_YEAR") and
 * `frequency` ("1 every 60 MONTHS") — and a `period` of REMAINING is not an
 * allowance at all but a COUNT of what is left this period (Aetna: "2
 * remaining", with the last visit's date beside it).
 */
function deliveryOf(e: Entry): { count: number; span: { value: number | null; qualifier: string | null } | null; remaining: boolean } | null {
  const delivery = asArray(e.serviceLimits).map((l) => asRecord(asRecord(l).delivery)).find((d) => asString(asRecord(d.quantity).value))
  if (!delivery) return null
  const count = Number(asString(asRecord(delivery.quantity).value))
  if (!Number.isFinite(count)) return null
  const per = asRecord(delivery.period)
  const freq = asRecord(delivery.frequency)
  const pick = asString(per.qualifier) ? per : asString(freq.qualifier) ? freq : null
  const qualifier = pick ? asString(pick.qualifier) : null
  const value = pick && pick.value != null && Number.isFinite(Number(pick.value)) ? Number(pick.value) : null
  return { count, span: qualifier ? { value, qualifier } : null, remaining: (qualifier ?? '').toUpperCase() === 'REMAINING' }
}

/** What is left this period, when the row is a REMAINING count. */
function remainingOf(e: Entry): number | null {
  const d = deliveryOf(e)
  if (d?.remaining) return d.count
  if (period(e) === 'REMAINING') {
    const v = asString(asRecord(e.quantity).value)
    return v != null && Number.isFinite(Number(v)) ? Number(v) : null
  }
  return null
}

/** The allowance on a limitation row in desk words, or null when the row carries no quantity (a REMAINING count is not an allowance). */
function limitTextOf(e: Entry): string | null {
  const d = deliveryOf(e)
  if (d) {
    if (d.remaining) return null
    return `${d.count} ${periodWords(d.span?.value ?? null, d.span?.qualifier ?? null)}`.trim()
  }
  const q = asRecord(e.quantity)
  const qual = asString(q.qualifier)
  const value = asString(q.value)
  if (!value || !qual || !['VISITS', 'NUMBER_OF_SERVICES_OR_PROCEDURES', 'MAXIMUM', 'DAYS', 'MONTH', 'YEARS'].includes(qual)) return null
  const per = period(e)
  if (per === 'REMAINING') return null
  const unit = qual === 'VISITS' ? 'visit' : qual === 'DAYS' ? 'day' : qual === 'MONTH' ? 'month' : qual === 'YEARS' ? 'year' : ''
  const head = `${value}${unit ? ` ${unit}${value === '1' ? '' : 's'}` : ''}`
  return per && PERIOD_LABEL[per] ? `${head} ${PERIOD_LABEL[per]}` : head
}

/** The replacement window on a limitation row, in months, when its span is a stretch of time. */
function limitMonthsOf(e: Entry): number | null {
  const d = deliveryOf(e)
  if (!d || d.remaining || !d.span) return null
  const n = d.span.value ?? 1
  if (!Number.isFinite(n) || n <= 0) return null
  switch ((d.span.qualifier ?? '').toUpperCase()) {
    case 'MONTH':
    case 'MONTHS':
      return n
    case 'YEAR':
    case 'YEARS':
    case 'CONTRACT':
    case 'SERVICE_YEAR':
    case 'CALENDAR_YEAR':
      return n * 12
    default:
      return null
  }
}

function lastOnOf(e: Entry): string | null {
  const dates = asRecord(e.dates)
  return asString(asRecord(dates.latestVisit).start) ?? asString(dates.latestVisit)
}
function nextOnOf(e: Entry): string | null {
  // Payers answer "when is the next one covered" as a service date range
  // whose start is the next eligible day.
  return asString(asRecord(asRecord(e.dates).service).start)
}

/** A category-level frequency row's label — what a payer that counts by service type is counting. */
const STC_FREQ_LABEL: Record<string, string> = {
  '23': 'Diagnostic (exams & x-rays)',
  '41': 'Preventive (cleanings & fluoride)',
  '24': 'Perio',
  '25': 'Fillings',
  '26': 'Root canals',
  '28': 'Adjunctive',
  '36': 'Crowns',
  '39': 'Dentures & bridges',
  '38': 'Ortho',
  '27': 'Maxillofacial prosthetics',
  '40': 'Oral surgery',
}

/**
 * The frequency lines. A payer tells one allowance over several rows — the
 * count per period on one, "N remaining" with the last visit's date on the
 * next, the scope and shared codes on a third — so rows are MERGED per line
 * rather than deduped, and nothing the payer counted is dropped.
 */
function frequencyRows(limits: Entry[]): EligibilityResult['frequencies'] {
  const rows = new Map<string, EligibilityResult['frequencies'][number]>()
  const scopes = new Map<string, string[]>()
  for (const e of limits) {
    const sys = serviceSystem(e)
    const svc = serviceValue(e)
    const limitText = limitTextOf(e)
    const remaining = remainingOf(e)
    const lastOn = lastOnOf(e)
    const nextOn = nextOnOf(e)
    const facts = classifyMessages(e)
    const hasFact = facts.some((n) => n.kind === 'shares' || n.kind === 'scope' || n.kind === 'deductible')
    if (!limitText && remaining == null && !lastOn && !nextOn && !hasFact) continue
    let code: FrequencyCode = 'other'
    let label = asString(asRecord(e.service).definition) ?? (svc ? cdtLabel(svc) : null) ?? messages(e)[0] ?? 'Limit'
    if (sys === 'CDT' && svc) {
      const hit = FREQ_BY_CDT.find((f) => f.re.test(svc))
      if (hit) {
        code = hit.code
        label = hit.label
      } else label = cdtLabel(svc)
    } else if (sys === 'STC' && svc && STC_FREQ_LABEL[svc]) label = STC_FREQ_LABEL[svc]
    if (code === 'other' && !svc) continue
    const key = `${code}:${label}`
    const row = rows.get(key) ?? { code, label, limit: '', lastOn: null, nextOn: null }
    if (limitText && !row.limit) row.limit = limitText
    if (remaining != null && row.remaining == null) row.remaining = remaining
    if (lastOn && !row.lastOn) row.lastOn = lastOn
    if (nextOn && !row.nextOn) row.nextOn = nextOn
    for (const n of facts) {
      if (n.kind === 'shares' && n.codes?.length) row.sharesWith = Array.from(new Set([...(row.sharesWith ?? []), ...n.codes]))
      else if (n.kind === 'scope') scopes.set(key, [...(scopes.get(key) ?? []), n.text])
      else if (n.kind === 'deductible') row.noDeductible = n.applies === false
    }
    rows.set(key, row)
  }
  // Scope fragments ("TOOTH NUMBER 02 TO 03,TOOTH NUMBER 18 TO 19") are one scope.
  scopes.forEach((raws, key) => {
    const row = rows.get(key)
    if (row) row.scope = scopeWords(raws.join(','))
  })
  // A line with facts but no allowance and no count is a sentence, not a frequency.
  return Array.from(rows.values()).filter((r) => r.limit || r.remaining != null || r.lastOn || r.nextOn)
}

// ── What a payer's sentence IS ──────────────────────────────────────────

/**
 * Payers put facts in free text: which teeth a crown covers, which codes
 * share an allowance, whether the deductible applies, which networks the
 * plan runs on, how the plan is funded, how old a dependent can be. Aetna
 * even joins several in one string with commas ("Shares frequency with
 * D0145,D0150,D0180,DEDUCTIBLE DOES NOT APPLY"). Each sentence is sorted
 * into the field it answers, and only what answers nothing is left for the
 * sheet's MISC box — a box of thirty raw strings is a sheet nobody reads.
 */
type NoteKind = 'shares' | 'scope' | 'deductible' | 'counter' | 'category' | 'network' | 'funding' | 'dependentAge' | 'downgrade' | 'clause' | 'boilerplate' | 'note'
interface PayerNote {
  kind: NoteKind
  text: string
  codes?: string[]
  applies?: boolean
  category?: CoverageTier | null
  funding?: 'self' | 'fully'
  age?: number
}

const CODE_TOKEN = /^D\d{4}(\s*-\s*D\d{4})?$/i
const CATEGORY_WORD: Record<string, CoverageTier> = {
  PREVENTATIVE: 'preventive',
  PREVENTIVE: 'preventive',
  DIAGNOSTIC: 'diagnostic',
  BASIC: 'basic',
  MAJOR: 'major',
  ORTHO: 'ortho',
  ORTHODONTIC: 'ortho',
  ORTHODONTICS: 'ortho',
  PERIO: 'perio',
  PERIODONTICS: 'perio',
  ENDO: 'endo',
  ENDODONTICS: 'endo',
  RESTORATIVE: 'basic',
  ADJUNCTIVE: 'basic',
  'ORAL SURGERY': 'oralSurgery',
  PROSTHODONTICS: 'major',
}
/** A category label that names no tier — the plan talking about itself. */
const BARE_CATEGORY = /^(DENTAL|DENTAL CARE|HEALTH BENEFIT PLAN COVERAGE)$/i

function classifyFragment(t: string): PayerNote {
  const u = t.toUpperCase()
  if (BOILERPLATE.test(t)) return { kind: 'boilerplate', text: t }
  const shares = /^SHARES?\s+(A\s+)?FREQUENCY\s+WITH\s*:?\s*(.*)$/i.exec(t)
  if (shares) {
    const codes = shares[2].split(/[\s,;]+/).filter((c) => CODE_TOKEN.test(c)).map((c) => c.toUpperCase().replace(/\s+/g, ''))
    return { kind: 'shares', text: t, codes }
  }
  if (/^TOOTH (NUMBER|NUMBERS|NO\.?|#)\b/i.test(t) || /^PER (FULL MOUTH|QUADRANT|QUAD|ARCH|TOOTH|SURFACE)\b/i.test(t) || /^(UPPER|LOWER) ARCH\b/i.test(t) || /^PERMANENT (MOLARS|TEETH|FIRST|SECOND)\b/i.test(t))
    return { kind: 'scope', text: t }
  if (/DEDUCTIBLE\s+(DOES\s+NOT|DOESN'?T|WILL\s+NOT|NOT)\s+APPL|DEDUCTIBLE\s+(IS\s+)?WAIVED|^NO\s+DEDUCTIBLE/i.test(t)) return { kind: 'deductible', text: t, applies: false }
  if (/^DEDUCTIBLE\s+APPLIES/i.test(t)) return { kind: 'deductible', text: t, applies: true }
  if (/\bCOUNTER$/i.test(t)) return { kind: 'counter', text: t }
  if (CATEGORY_WORD[u]) return { kind: 'category', text: t, category: CATEGORY_WORD[u] }
  if (BARE_CATEGORY.test(t)) return { kind: 'category', text: t, category: null }
  if (/\bNETWORK$/i.test(t) && t.length < 60) return { kind: 'network', text: t }
  if (/^SELF[\s-]*FUNDED$/i.test(t)) return { kind: 'funding', text: t, funding: 'self' }
  if (/^FULLY[\s-]*INSURED$/i.test(t)) return { kind: 'funding', text: t, funding: 'fully' }
  const dep = /^(?:CHLD|CHILD(?:REN)?|DEP(?:ENDENT)?S?)\s+(?:TO|THRU|THROUGH|UNTIL|UP TO)\s+(?:AGE\s+)?(\d{2})\b/i.exec(t)
  if (dep) return { kind: 'dependentAge', text: t, age: Number(dep[1]) }
  if (DOWNGRADE.test(t)) return { kind: 'downgrade', text: t }
  // Read into their own fields (missingToothClause, waitingPeriods / noWaitingPeriods) — the sheet has a line for each.
  if (/MISSING TOOTH/i.test(t) || /WAITING PERIOD/i.test(t)) return { kind: 'clause', text: t }
  return { kind: 'note', text: t }
}

/**
 * One message → its facts. A comma-joined message splits only when EVERY
 * piece is a known fact (a code list rides its "shares frequency" head);
 * a sentence with commas in it stays one sentence.
 */
function classifyMessage(m: string): PayerNote[] {
  const whole = m.trim()
  if (!whole) return []
  const parts = whole.split(',').map((x) => x.trim()).filter(Boolean)
  if (parts.length > 1) {
    const merged: string[] = []
    for (const part of parts) {
      const prev = merged[merged.length - 1]
      if (prev && CODE_TOKEN.test(part) && /^SHARES?\s+(A\s+)?FREQUENCY/i.test(prev)) merged[merged.length - 1] = `${prev},${part}`
      else merged.push(part)
    }
    const notes = merged.map(classifyFragment)
    if (notes.every((n) => n.kind !== 'note')) return notes
  }
  return [classifyFragment(whole)]
}

function classifyMessages(e: Entry): PayerNote[] {
  return messages(e).flatMap(classifyMessage)
}

interface PlacedNotes {
  networks: string[]
  funding: 'self' | 'fully' | null
  dependentAge: number | null
  downgrades: string[]
  /** What the deductible notes said, by the row's tier. */
  deductibleByTier: Partial<Record<CoverageTier, boolean>>
  /** Sentences that answer no field — the sheet's MISC box. */
  unplaced: string[]
}

function tierOfEntry(e: Entry): CoverageTier | null {
  const svc = serviceValue(e)
  if (!svc) return null
  if (serviceSystem(e) === 'STC') return TIER_BY_STC[svc] ?? null
  return tierForCdt(svc)
}

/** Every message across every benefit category, sorted into its field. */
function collectNotes(benefits: Record<string, unknown>): PlacedNotes {
  const out: PlacedNotes = { networks: [], funding: null, dependentAge: null, downgrades: [], deductibleByTier: {}, unplaced: [] }
  const seen = new Set<string>()
  const once = (list: string[], t: string) => {
    const k = t.toUpperCase()
    if (seen.has(k)) return
    seen.add(k)
    list.push(t)
  }
  for (const [category, v] of Object.entries(benefits)) {
    for (const e of asArray(v)) {
      if (category === 'nonCovered') {
        const what = asString(asRecord(e.service).definition) ?? (serviceValue(e) ? STC_FREQ_LABEL[serviceValue(e)!] ?? cdtLabel(serviceValue(e)!) : null)
        if (what) once(out.unplaced, `Not covered: ${what}`)
      }
      for (const n of classifyMessages(e)) {
        switch (n.kind) {
          case 'network':
            if (!out.networks.some((x) => x.toUpperCase() === n.text.toUpperCase())) out.networks.push(n.text)
            break
          case 'funding':
            out.funding ??= n.funding ?? null
            break
          case 'dependentAge':
            out.dependentAge ??= n.age ?? null
            break
          case 'downgrade':
            once(out.downgrades, n.text)
            break
          case 'deductible': {
            // STC 28 (adjunctive: anesthesia, palliative) is a catch-all a
            // payer often waives the deductible on; it must not speak for basic.
            const tier = serviceSystem(e) === 'STC' && serviceValue(e) === '28' ? null : tierOfEntry(e)
            if (tier && n.applies != null) out.deductibleByTier[tier] ??= n.applies
            break
          }
          case 'note':
            once(out.unplaced, n.text)
            break
          default:
            // shares / scope / counter / category / boilerplate: read on the
            // row they ride (frequencies, procedure lines) or payer-internal.
            break
        }
      }
    }
  }
  return out
}

// ── The verification sheet's fields ────────────────────────────────────

/** A sentence most payers stamp on every limitation row; it says nothing a desk can use. */
const BOILERPLATE = /^SIMILAR PROCEDURES PERFORMED MAY IMPACT LIMITATION\.?$/i

/** Every message across every benefit category, deduped, in the payer's order. */
function everyMessage(benefits: Record<string, unknown>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of Object.values(benefits)) {
    for (const e of asArray(v)) {
      for (const m of messages(e)) {
        const t = m.trim()
        const k = t.toUpperCase()
        if (!t || seen.has(k) || BOILERPLATE.test(t)) continue
        seen.add(k)
        out.push(t)
      }
    }
  }
  return out
}

function planFacts(root: Record<string, unknown>, statuses: Entry[], yearly: Entry[], coverage: { effective: string | null; termination: string | null }, now: Date, placed?: Pick<PlacedNotes, 'networks' | 'funding'>): PlanFacts | null {
  const subInfo = asRecord(asRecord(root.subscriber).additionalInformation)
  const depInfo = asRecord(asRecord(root.dependent).additionalInformation)
  const group = { ...asRecord(subInfo.group), ...asRecord(depInfo.group) }
  const plan = { ...asRecord(subInfo.plan), ...asRecord(depInfo.plan) }
  const insuranceType = statuses.filter(isDentalish).map((s) => asString(s.insuranceType)).find((x) => !!x) ?? null
  const periods = yearly.map(period).filter((p): p is string => !!p)
  const benefitYear: PlanFacts['benefitYear'] = periods.some((p) => p === 'CALENDAR_YEAR')
    ? 'calendar'
    : periods.some((p) => p === 'CONTRACT' || p === 'SERVICE_YEAR')
      ? 'plan'
      : null
  let start: string | null = null
  let end: string | null = null
  if (benefitYear === 'calendar') {
    const y = now.getUTCFullYear()
    start = `${y}-01-01`
    end = `${y}-12-31`
  } else if (benefitYear === 'plan') {
    start = coverage.effective
    end = coverage.termination
  }
  const facts: PlanFacts = {
    groupNumber: asString(group.number) ?? asString(group.id),
    groupName: asString(group.name) ?? asString(group.description),
    planNumber: asString(plan.number) ?? asString(plan.id),
    insuranceType,
    benefitYear,
    benefitYearStart: start,
    benefitYearEnd: end,
    networks: placed?.networks ?? [],
    funding: placed?.funding ?? null,
  }
  return Object.entries(facts).some(([k, v]) => (k === 'networks' ? (v as string[]).length > 0 : v != null)) ? facts : null
}

function formatAddress(a: Record<string, unknown>): string | null {
  const line1 = asString(a.addressLine1) ?? asString(a.address1)
  if (!line1) return null
  const line2 = asString(a.addressLine2) ?? asString(a.address2)
  const city = asString(a.city)
  const state = asString(a.state)
  const zip = asString(a.postalCode) ?? asString(a.zip)
  const tail = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [line1, line2, tail].filter(Boolean).join(', ')
}

function payerContacts(root: Record<string, unknown>, benefits: Record<string, unknown>): PayerContacts | null {
  const contacts = asArray(asRecord(root.payer).contacts)
    .map((c) => ({
      name: asString(c.name),
      phones: asStringArray(c.phoneNumbers),
      faxes: asStringArray(c.faxNumbers),
      emails: asStringArray(c.emails),
      urls: asStringArray(c.urls),
    }))
    .filter((c) => c.name || c.phones.length || c.faxes.length || c.emails.length || c.urls.length)
  // A claims address rides a related entity (a carve-out administrator, a
  // claims office) on some benefit row — the first with an address wins.
  let claimsAddress: string | null = formatAddress(asRecord(asRecord(root.payer).address))
  if (!claimsAddress) {
    outer: for (const v of Object.values(benefits)) {
      for (const e of asArray(v)) {
        for (const rel of asArray(e.relatedEntities)) {
          const addr = formatAddress(asRecord(rel.address))
          if (addr) {
            claimsAddress = addr
            break outer
          }
        }
      }
    }
  }
  if (!contacts.length && !claimsAddress) return null
  return { contacts, claimsAddress }
}

/**
 * What the deductible applies to. Payers say it two ways: a note on the
 * deductible row ("BASIC/MAJOR/SELECT", "DOES NOT APPLY TO PREVENTIVE") or
 * a row scoped to the tier's own STC. A tier named applies; preventive is
 * read as excluded when others are named and it is not — "basic and major"
 * means what it says at a desk — and left null when nothing was said.
 */
function deductibleApplies(deductible: Entry[], byTier: PlacedNotes['deductibleByTier'] = {}): DeductibleApplies | null {
  const rows = deductible.filter(isIndividual).filter((e) => cents(e.amount) != null)
  if (!rows.length && !Object.keys(byTier).length) return null
  let preventive: boolean | null = null
  let basic: boolean | null = null
  let major: boolean | null = null
  const notes: string[] = []
  for (const e of rows) {
    const amount = cents(e.amount) ?? 0
    const text = messages(e).join(' ')
    const stc = serviceSystem(e) === 'STC' ? serviceValue(e) : null
    // A COVERAGE category (the benefit's STC), never a plan tier — the
    // plan-gate guard reads a variable named tier compared to a word it forbids.
    const category = stc ? TIER_BY_STC[stc] : null
    const applies = amount > 0
    if (category === 'preventive' || category === 'diagnostic') preventive = applies
    else if (category === 'basic' || category === 'perio' || category === 'endo' || category === 'oralSurgery') basic = applies
    else if (category === 'major') major = applies
    if (!text) continue
    if (amount > 0 && !/ALL OTHER/i.test(text) && !classifyMessages(e).every((n) => n.kind === 'category')) notes.push(text)
    const upper = text.toUpperCase()
    const negated = /DOES NOT APPLY|NOT APPLY|WAIVED|EXCLUD/i.test(upper)
    if (/PREVENT|DIAGNOSTIC|TYPE ?1|TYPE ?I\b/.test(upper)) preventive = negated ? false : applies
    if (/BASIC|TYPE ?2|TYPE ?II\b/.test(upper)) basic = negated ? false : applies
    if (/MAJOR|TYPE ?3|TYPE ?III\b/.test(upper)) major = negated ? false : applies
  }
  // Notes on the benefit rows themselves ("DEDUCTIBLE DOES NOT APPLY" on
  // the preventive line) — the payer's word on a tier beats a guess.
  const waived = (tiers: CoverageTier[]) => tiers.map((t) => byTier[t]).filter((v): v is boolean => v != null)
  const pv = waived(['preventive', 'diagnostic'])
  const bs = waived(['basic', 'perio', 'endo', 'oralSurgery'])
  const mj = waived(['major'])
  if (pv.length) preventive = pv.some((v) => v)
  if (bs.length) basic = bs.some((v) => v)
  if (mj.length) major = mj.some((v) => v)
  // A plan-wide deductible the payer scoped by exception: it applies to
  // what it did not waive. Only when the payer spoke about scope at all —
  // silence stays null.
  const planWide = rows.some((e) => (cents(e.amount) ?? 0) > 0 && (serviceValue(e) === '30' || serviceValue(e) === DENTAL_STC || !serviceValue(e)))
  if (planWide && Object.keys(byTier).length) {
    basic ??= true
    major ??= true
    preventive ??= true
  }
  if (preventive == null && (basic === true || major === true)) preventive = false
  if (preventive == null && basic == null && major == null && !notes.length) return null
  return { preventive, basic, major, note: notes.length ? Array.from(new Set(notes)).join(' · ') : null }
}

function cdtRowsFor(list: Entry[], codes: string[]): Entry[] {
  return list.filter((e) => serviceSystem(e) === 'CDT' && !!serviceValue(e) && codes.includes(serviceValue(e)!))
}

/**
 * The form's procedure lines. A payer prices a procedure two ways: a
 * coinsurance row on the code itself (rare for covered work, common for
 * EXCLUDED work — "D9944 patient pays 100%"), or its tier's rate. The line
 * says which (`pctSource`), so the sheet can be honest about a derived
 * percent. Limits, dates and notes come from the code's limitation rows.
 */
function procedureLines(coIns: Entry[], limits: Entry[], tiers: TierPct | null): ProcedureBenefit[] {
  const out: ProcedureBenefit[] = []
  for (const def of FORM_PROCEDURES) {
    // Plan rules at any coverage level (see tierPercents) — only dollar
    // amounts read the level.
    const priced = cdtRowsFor(coIns, def.codes)
      .sort((a, b) => networkRank(a) - networkRank(b))
      .find((e) => patientSharePct(e.percent) != null)
    const limitRows = cdtRowsFor(limits, def.codes)
    const limitRow = limitRows.find((e) => limitTextOf(e)) ?? limitRows[0]
    const facts = limitRows.flatMap(classifyMessages)
    const notes = Array.from(new Set(facts.filter((n) => n.kind === 'note').map((n) => n.text)))
    const sharesWith = Array.from(new Set(facts.filter((n) => n.kind === 'shares').flatMap((n) => n.codes ?? [])))
    const scopeRaw = facts.filter((n) => n.kind === 'scope').map((n) => n.text)
    const scope = scopeRaw.length ? scopeRaw.join(',') : null
    const ded = facts.find((n) => n.kind === 'deductible')
    const remaining = limitRows.map(remainingOf).find((n): n is number => n != null) ?? null
    let planPays: number | null = null
    let pctSource: ProcedureBenefit['pctSource'] = null
    if (priced) {
      planPays = 100 - (patientSharePct(priced.percent) as number)
      pctSource = 'code'
    } else if (tiers && tiers[def.tier] != null) {
      planPays = tiers[def.tier]
      pctSource = 'tier'
    }
    const limit = limitRow ? limitTextOf(limitRow) : null
    const lastOn = limitRows.map(lastOnOf).find((d) => !!d) ?? null
    const nextOn = limitRows.map(nextOnOf).find((d) => !!d) ?? null
    if (planPays == null && !limit && !lastOn && !nextOn && !notes.length && remaining == null && !sharesWith.length && !scope) continue
    out.push({
      key: def.key,
      code: serviceValue(priced ?? limitRow ?? {}) ?? def.codes[0],
      label: def.label,
      planPays,
      pctSource,
      limit,
      lastOn,
      nextOn,
      notes,
      remaining,
      sharesWith,
      scope: scope ? scopeWords(scope) : null,
      deductibleApplies: ded ? (ded.applies ?? null) : null,
    })
  }
  return out
}

const CROWN_BRIDGE = /^D(27\d\d|6[0-9]{3})$/
const DENTURE = /^D5[0-9]{3}$/

function replacementRules(limits: Entry[], allText: string[]): ReplacementRules | null {
  // A window on the code (D27xx / D5xxx) or, when the payer counts by
  // category, on the STC — 36 Dental Crowns, 39 Prosthodontics.
  const months = (re: RegExp, stc: string) =>
    limits
      .filter((e) => (serviceSystem(e) === 'CDT' && re.test(serviceValue(e) ?? '')) || (serviceSystem(e) === 'STC' && serviceValue(e) === stc))
      .map(limitMonthsOf)
      .find((m): m is number => m != null && m >= 12) ?? null
  const crownBridgeMonths = months(CROWN_BRIDGE, '36')
  const dentureMonths = months(DENTURE, '39')
  const joined = allText.join(' \n ')
  const paysOn: ReplacementRules['paysOn'] = /PAID ON (THE )?PREP|PREP(ARATION)? DATE/i.test(joined)
    ? 'prep'
    : /PAID ON (THE )?(SEAT|INSERT|COMPLETION|CEMENT|DELIVERY)|(SEAT|INSERTION|COMPLETION|CEMENTATION|DELIVERY) DATE/i.test(joined)
      ? 'seat'
      : null
  if (crownBridgeMonths == null && dentureMonths == null && !paysOn) return null
  return { crownBridgeMonths, dentureMonths, paysOn }
}

/**
 * "through age 14", "under age 19", "to age 16", "age 26 and under", "under
 * 19 years of age" → the number. The word AGE (or "n and under / younger")
 * has to be there: "limited to 1 per tooth" and "up to 2 per year" are
 * allowances, not ages, and a sealant row says both.
 */
function ageFrom(texts: string[]): number | null {
  const patterns = [
    /\bAGE\s*(?:OF\s*)?(\d{1,2})\b/i,
    /\b(\d{1,2})\s*(?:YEARS?\s*)?(?:OF AGE|AND (?:UNDER|YOUNGER))\b/i,
    /\bUNDER\s*(\d{1,2})\s*YEARS?\b/i,
  ]
  for (const t of texts) {
    for (const re of patterns) {
      const m = re.exec(t)
      if (m) {
        const n = Number(m[1])
        if (n >= 1 && n <= 99) return n
      }
    }
  }
  return null
}

/** A structured age ceiling on a row (`serviceLimits[].ageMaximum`); 99 is a payer's way of saying none. */
function ageMaximumOf(rows: Entry[]): number | null {
  for (const e of rows) {
    for (const l of asArray(e.serviceLimits)) {
      const n = Number(asRecord(l).ageMaximum)
      if (Number.isFinite(n) && n >= 1 && n < 99) return n
    }
  }
  return null
}

function ageLimits(coIns: Entry[], limits: Entry[], allText: string[], placedDependentAge: number | null = null): AgeLimits | null {
  const rowsFor = (codes: string[]) => [...cdtRowsFor(coIns, codes), ...cdtRowsFor(limits, codes)]
  const rowsText = (re: RegExp, codes: string[]) => rowsFor(codes).flatMap(messages).concat(allText.filter((t) => re.test(t)))
  const fluoride = ageMaximumOf(rowsFor(['D1206', 'D1208'])) ?? ageFrom(rowsText(/FLUORIDE/i, ['D1206', 'D1208']))
  const sealants = ageMaximumOf(rowsFor(['D1351'])) ?? ageFrom(rowsText(/SEALANT/i, ['D1351']))
  const orthoEntries = [...coIns, ...limits].filter((e) => serviceValue(e) === '38' || /^D8/.test(serviceValue(e) ?? ''))
  const ortho = ageMaximumOf(orthoEntries) ?? ageFrom(orthoEntries.flatMap(messages).concat(allText.filter((t) => /ORTHO/i.test(t))))
  // A dependent age limit is about coverage itself — a sentence about ortho,
  // fluoride or sealants for children is that benefit's own limit, read above.
  const dependent = placedDependentAge ?? ageFrom(allText.filter((t) => /DEPENDENT|CHILD(REN)?\b|STUDENT/i.test(t) && /AGE/i.test(t) && !/ORTHO|FLUORIDE|SEALANT/i.test(t)))
  if (fluoride == null && sealants == null && ortho == null && dependent == null) return null
  return { fluoride, sealants, ortho, dependent }
}

const DOWNGRADE = /DOWNGRAD|ALTERNATE BENEFIT|ALTERNATIVE BENEFIT|ANTERIOR AND BICUSPID|AMALGAM|POSTERIOR (COMPOSITE|TEETH)|LEAST EXPENSIVE|LOWEST COST/i

function planDates(json: Record<string, unknown>, statuses: Entry[]): { effective: string | null; termination: string | null } {
  // The person asked about: a dependent's dates ride the dependent block
  // (Aetna answers a child's card with the parent as subscriber).
  const fromDep = asRecord(asRecord(asRecord(json.dependent).dates).plan)
  const fromDepElig = asRecord(asRecord(asRecord(json.dependent).dates).eligibility)
  const fromSub = asRecord(asRecord(asRecord(json.subscriber).dates).plan)
  const fromElig = asRecord(asRecord(asRecord(json.subscriber).dates).eligibility)
  const fromStatus = statuses.map((s) => asRecord(asRecord(s.dates).plan)).find((d) => asString(d.start) || asString(d.end)) ?? {}
  const pick = (k: 'start' | 'end') => asString(fromDep[k]) ?? asString(fromDepElig[k]) ?? asString(fromSub[k]) ?? asString(fromElig[k]) ?? asString(fromStatus[k])
  return { effective: pick('start'), termination: pick('end') }
}

/** Which plan is the dental one, when a payer returns several. */
function pickPlan(plans: Entry[]): Entry | null {
  if (plans.length === 0) return null
  const scored = plans.map((p) => {
    const b = asRecord(p.benefits)
    const all = Object.values(b).flatMap((v) => asArray(v))
    const dental = all.filter((e) => serviceValue(e) === DENTAL_STC || serviceSystem(e) === 'CDT').length
    const named = /dental/i.test(asString(p.name) ?? '') ? 5 : 0
    return { p, score: dental + named }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].p
}

export function normalizeStediResponse(json: unknown, req: EligibilityRequest, now: Date): EligibilityResult {
  const root = asRecord(json)
  // Some payers put an ID where their name goes ("47009") — a name with no
  // letters is not a name, so fall back to what the desk picked.
  const rawPayerName = asString(asRecord(asRecord(root.payer).name).organization)
  const payerName = rawPayerName && /[a-z]/i.test(rawPayerName) ? rawPayerName : req.payerName?.trim() || req.carrierName.trim()
  const asOf = now.toISOString()
  const base: Omit<EligibilityResult, 'status'> = {
    payerName,
    planName: null,
    coverage: { effective: null, termination: null },
    network: 'unknown',
    annualMax: null,
    deductible: null,
    familyMax: null,
    familyDeductible: null,
    orthoLifetimeMax: null,
    coveragePct: null,
    waitingPeriods: [],
    frequencies: [],
    missingToothClause: null,
    notes: [],
    asOf,
  }

  // 1. AAA rejections — the payer answered "no" to the question, not "no coverage".
  const errors = readErrors(root)
  if (errors.length > 0) {
    const codes = errors.map((e) => e.code ?? '')
    const describe = errors.map((e) => `${e.description ?? 'Payer rejected the request'} (AAA ${e.code ?? '?'})`)
    if (codes.some((c) => RETRY_CODES.has(c))) {
      throw new StediRetryableError(`The payer couldn’t answer right now — try again in a few minutes. ${describe.join('; ')}`)
    }
    if (codes.some((c) => PROVIDER_CODES.has(c))) {
      // Not retryable and not about the member: the payer won't answer for a
      // provider it doesn't know, whatever is typed in the form.
      throw new Error(
        `${payerName} doesn’t recognize the practice’s NPI, so it won’t answer about any member. Add the practice’s NPI under Settings → Business profile. ${describe.join('; ')}`,
      )
    }
    if (codes.every((c) => NOT_FOUND_CODES.has(c))) {
      const notes = [
        `${payerName} found no member matching these details. Check the member ID, name and date of birth against the card.`,
        ...describe,
      ]
      if (BLUE_PLAN.test(`${payerName} ${req.carrierName} ${req.payerName ?? ''}`)) notes.push(BLUE_PLAN_HINT)
      return { ...base, status: 'not_found', notes }
    }
    if (codes.some((c) => NEEDS_REVIEW_CODES.has(c))) {
      return {
        ...base,
        status: 'needs_review',
        notes: ['The payer found more than one member with this ID — confirm the name and date of birth on the card.', ...describe],
      }
    }
    throw new Error(describe.join('; '))
  }

  // 2. Benefits.
  const plans = asArray(root.plans)
  const plan = pickPlan(plans)
  if (!plan) {
    return { ...base, status: 'needs_review', notes: ['The payer answered without any plan details. Call them to confirm coverage.'] }
  }
  const benefits = asRecord(plan.benefits)
  const statuses = entries(benefits, 'statuses')
  const statusValues = statuses.filter(isDentalish).map((s) => asString(s.status) ?? '')
  let status: EligibilityStatus
  if (statusValues.some((s) => s.startsWith('ACTIVE'))) status = 'active'
  else if (statusValues.length > 0 && statusValues.every((s) => s.startsWith('INACTIVE'))) status = 'inactive'
  else status = statusValues.length === 0 ? 'needs_review' : 'needs_review'

  const coverage = planDates(root, statuses)
  const deductible = entries(benefits, 'deductible')
  const oop = entries(benefits, 'outOfPocket')
  const limits = entries(benefits, 'limitations')
  const coIns = entries(benefits, 'coInsurance')

  const dedTotal = pickAmount(deductible, 'year')
  const dedRemaining = pickAmount(deductible, 'remaining')
  // Dental annual maximums arrive as Out-of-Pocket (G) with most payers, and
  // as a dollar Limitation (F) with the rest — read both, prefer the first.
  // A carry-over (rollover) maximum rides the same limitation rows with a
  // smaller amount — it is a bonus on top of the maximum, not the maximum.
  const dollarLimits = limits.filter((e) => !asRecord(e.quantity).value && !/carry\s*over|rollover/i.test(messages(e).join(' ')))
  // The yearly maximum is a plan-wide figure; an ortho LIFETIME row is a
  // different pot and must never be read as this year's.
  const isOrtho = (e: Entry) => serviceValue(e) === '38' || classifyMessages(e).some((n) => n.kind === 'category' && n.category === 'ortho')
  const notOrtho = (e: Entry) => !isOrtho(e)
  const yearly = [...oop.filter(notOrtho), ...dollarLimits.filter(notOrtho)]
  const maxTotal = pickAmount(yearly, 'year')
  const maxRemaining = pickAmount(yearly, 'remaining')
  const familyMaxTotal = pickAmount(yearly, 'year', 'family')
  const familyMaxRemaining = pickAmount(yearly, 'remaining', 'family')
  const familyDedTotal = pickAmount(deductible, 'year', 'family')
  const familyDedRemaining = pickAmount(deductible, 'remaining', 'family')
  const ortho = [...oop, ...dollarLimits].filter(isOrtho)
  const orthoTotal = pickAmount(ortho, 'lifetime')
  const orthoRemaining = pickAmount(ortho, 'lifetime_remaining')

  const notes: string[] = []
  const allMessages = [...limits, ...entries(benefits, 'benefitDescription'), ...entries(benefits, 'exclusions')].flatMap(messages)
  const noWaiting = allMessages.some((m) => /no waiting period/i.test(m))
  const waiting = allMessages.filter((m) => /waiting period/i.test(m) && !/no waiting period/i.test(m)).slice(0, 2)
  const missingTooth = allMessages.some((m) => /missing tooth/i.test(m))
  notes.push(...waiting)
  if (status === 'needs_review' && statusValues.length === 0) {
    notes.push('The payer didn’t state a coverage status for dental care. Call them to confirm before quoting.')
  }
  if (status === 'active' && coverage.termination && coverage.termination < asOf.slice(0, 10)) {
    notes.push(`The plan’s end date (${coverage.termination}) has passed — treat this coverage as ended.`)
  }

  const tiersIn = tierPercents(coIns, 'in')
  const allText = everyMessage(benefits)
  const placed = collectNotes(benefits)
  const subPlanName = asString(asRecord(asRecord(asRecord(root.subscriber).additionalInformation).plan).name)
  const depPlanName = asString(asRecord(asRecord(asRecord(root.dependent).additionalInformation).plan).name)
  // Aetna names the plan on the status row ("PPO Dental 2000"), not in the plan block.
  const statusPlanName = statuses.map((s) => asString(s.planCoverageDescription)).find((x) => !!x) ?? null

  return {
    ...base,
    status,
    planName: asString(plan.name) ?? depPlanName ?? subPlanName ?? statusPlanName,
    coverage,
    deductible: deductibleOf(dedTotal, dedRemaining),
    annualMax: amountOf(maxTotal, maxRemaining),
    familyMax: amountOf(familyMaxTotal, familyMaxRemaining),
    familyDeductible: deductibleOf(familyDedTotal, familyDedRemaining),
    orthoLifetimeMax: amountOf(orthoTotal, orthoRemaining),
    coveragePct: coverageTiers(coIns),
    coveragePctOut: coverageTiers(coIns, 'out'),
    noWaitingPeriods: noWaiting || undefined,
    frequencies: frequencyRows(limits),
    missingToothClause: missingTooth ? true : null,
    notes,
    plan: planFacts(root, statuses, yearly, coverage, now, placed),
    payerContacts: payerContacts(root, benefits),
    deductibleApplies: deductibleApplies(deductible, placed.deductibleByTier),
    procedures: procedureLines(coIns, limits, tiersIn),
    replacement: replacementRules(limits, allText),
    ageLimits: ageLimits(coIns, limits, allText, placed.dependentAge),
    downgrades: placed.downgrades,
    // Only the sentences that answer no field — the sheet's MISC box.
    payerNotes: placed.unplaced,
  }
}
