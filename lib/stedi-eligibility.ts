import type { EligibilityRequest, EligibilityResult, EligibilityStatus, FrequencyCode } from '@/lib/insurance-eligibility'

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
  encounter: { services: Array<{ system: 'STC'; value: string }> }
  externalPatientId?: string
}

const RELATION: Record<'spouse' | 'child' | 'other', 'SPOUSE' | 'CHILD' | 'OTHER_ADULT'> = {
  spouse: 'SPOUSE',
  child: 'CHILD',
  other: 'OTHER_ADULT',
}

export function buildStediRequest(
  req: EligibilityRequest,
  opts: { payerId: string; npi: string; organizationName: string; externalPatientId?: string | null },
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
    encounter: { services: [{ system: 'STC', value: DENTAL_STC }] },
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

/** The best-scoped amount for a category: individual, in-network first. */
function pickAmount(list: Entry[], want: 'year' | 'remaining'): number | null {
  const candidates = list
    .filter((e) => isDentalish(e) && isIndividual(e))
    .filter((e) => {
      const p = period(e)
      return want === 'remaining' ? p === 'REMAINING' : !p || YEAR_PERIODS.has(p)
    })
    .filter((e) => cents(e.amount) != null)
    .sort((a, b) => networkRank(a) - networkRank(b) || (serviceValue(b) === DENTAL_STC ? 1 : 0) - (serviceValue(a) === DENTAL_STC ? 1 : 0))
  return candidates.length ? cents(candidates[0].amount) : null
}

/** STC → the tier the front desk talks in. */
const TIER_BY_STC: Record<string, 'preventive' | 'basic' | 'major' | 'ortho'> = {
  '41': 'preventive', // Routine (Preventive) Dental
  '23': 'preventive', // Diagnostic Dental
  '25': 'basic', // Restorative
  '24': 'basic', // Periodontics
  '26': 'basic', // Endodontics
  '40': 'basic', // Oral Surgery
  '28': 'basic', // Adjunctive Dental Services
  '36': 'major', // Dental Crowns
  '39': 'major', // Prosthodontics
  '27': 'major', // Maxillofacial Prosthetics
  '38': 'ortho', // Orthodontics
}

function coverageTiers(coIns: Entry[]): EligibilityResult['coveragePct'] {
  const planPays: Record<'preventive' | 'basic' | 'major' | 'ortho', number | null> = {
    preventive: null,
    basic: null,
    major: null,
    ortho: null,
  }
  let generic: number | null = null
  const sorted = [...coIns].filter(isIndividual).sort((a, b) => networkRank(a) - networkRank(b))
  for (const e of sorted) {
    const share = patientSharePct(e.percent)
    if (share == null) continue
    const stc = serviceSystem(e) === 'STC' ? serviceValue(e) : null
    if (stc && TIER_BY_STC[stc]) {
      const tier = TIER_BY_STC[stc]
      if (planPays[tier] == null) planPays[tier] = 100 - share
    } else if ((stc === DENTAL_STC || stc === '30' || !stc) && generic == null) {
      generic = 100 - share
    }
  }
  const any = Object.values(planPays).some((v) => v != null) || generic != null
  if (!any) return null
  return {
    preventive: planPays.preventive ?? generic,
    basic: planPays.basic ?? generic,
    major: planPays.major ?? generic,
    ortho: planPays.ortho,
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

function frequencyRows(limits: Entry[]): EligibilityResult['frequencies'] {
  const rows: EligibilityResult['frequencies'] = []
  const seen = new Set<string>()
  for (const e of limits) {
    const q = asRecord(e.quantity)
    const qual = asString(q.qualifier)
    const value = asString(q.value)
    if (!value || !qual || !['VISITS', 'NUMBER_OF_SERVICES_OR_PROCEDURES', 'MAXIMUM', 'DAYS', 'MONTH', 'YEARS'].includes(qual)) continue
    const sys = serviceSystem(e)
    const svc = serviceValue(e)
    let code: FrequencyCode = 'other'
    let label = asString(asRecord(e.service).definition) ?? messages(e)[0] ?? 'Limit'
    if (sys === 'CDT' && svc) {
      const hit = FREQ_BY_CDT.find((f) => f.re.test(svc))
      if (hit) {
        code = hit.code
        label = hit.label
      }
    }
    if (code === 'other' && !svc) continue
    const key = `${code}:${label}`
    if (seen.has(key)) continue
    seen.add(key)
    const per = period(e)
    const unit = qual === 'VISITS' ? 'visit' : qual === 'DAYS' ? 'day' : qual === 'MONTH' ? 'month' : qual === 'YEARS' ? 'year' : ''
    const limit = per && PERIOD_LABEL[per] ? `${value}${unit ? ` ${unit}${value === '1' ? '' : 's'}` : ''} ${PERIOD_LABEL[per]}` : `${value}${unit ? ` ${unit}${value === '1' ? '' : 's'}` : ''}`
    rows.push({ code, label, limit: limit.trim(), lastOn: asString(asRecord(asRecord(e.dates).latestVisit).start) ?? asString(asRecord(e.dates).latestVisit) })
  }
  return rows
}

function planDates(json: Record<string, unknown>, statuses: Entry[]): { effective: string | null; termination: string | null } {
  const fromSub = asRecord(asRecord(asRecord(json.subscriber).dates).plan)
  const fromElig = asRecord(asRecord(asRecord(json.subscriber).dates).eligibility)
  const fromStatus = statuses.map((s) => asRecord(asRecord(s.dates).plan)).find((d) => asString(d.start) || asString(d.end)) ?? {}
  const pick = (k: 'start' | 'end') => asString(fromSub[k]) ?? asString(fromElig[k]) ?? asString(fromStatus[k])
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
  const payerName = asString(asRecord(asRecord(root.payer).name).organization) ?? req.carrierName.trim()
  const asOf = now.toISOString()
  const base: Omit<EligibilityResult, 'status'> = {
    payerName,
    planName: null,
    coverage: { effective: null, termination: null },
    network: 'unknown',
    annualMax: null,
    deductible: null,
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
    if (codes.every((c) => NOT_FOUND_CODES.has(c))) {
      return {
        ...base,
        status: 'not_found',
        notes: [
          `${payerName} found no member matching these details. Check the member ID, name and date of birth against the card.`,
          ...describe,
        ],
      }
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
  const maxTotal = pickAmount(oop, 'year') ?? pickAmount(limits.filter((e) => !asRecord(e.quantity).value), 'year')
  const maxRemaining = pickAmount(oop, 'remaining') ?? pickAmount(limits.filter((e) => !asRecord(e.quantity).value), 'remaining')

  const notes: string[] = []
  const allMessages = [...limits, ...entries(benefits, 'benefitDescription'), ...entries(benefits, 'exclusions')].flatMap(messages)
  const waiting = allMessages.filter((m) => /waiting period/i.test(m)).slice(0, 2)
  const missingTooth = allMessages.some((m) => /missing tooth/i.test(m))
  notes.push(...waiting)
  if (status === 'needs_review' && statusValues.length === 0) {
    notes.push('The payer didn’t state a coverage status for dental care. Call them to confirm before quoting.')
  }
  if (status === 'active' && coverage.termination && coverage.termination < asOf.slice(0, 10)) {
    notes.push(`The plan’s end date (${coverage.termination}) has passed — treat this coverage as ended.`)
  }

  return {
    ...base,
    status,
    planName: asString(plan.name),
    coverage,
    deductible:
      dedTotal != null
        ? {
            individualCents: dedTotal,
            metCents: dedRemaining != null ? Math.max(0, dedTotal - dedRemaining) : 0,
            remainingCents: dedRemaining ?? dedTotal,
          }
        : null,
    annualMax:
      maxTotal != null
        ? {
            totalCents: maxTotal,
            usedCents: maxRemaining != null ? Math.max(0, maxTotal - maxRemaining) : 0,
            remainingCents: maxRemaining ?? maxTotal,
          }
        : null,
    coveragePct: coverageTiers(coIns),
    frequencies: frequencyRows(limits),
    missingToothClause: missingTooth ? true : null,
    notes,
  }
}
