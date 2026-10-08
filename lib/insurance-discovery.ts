import type { EligibilityRequest, InsuranceDriverId, InsuranceUsage } from '@/lib/insurance-eligibility'

/**
 * INSURANCE DISCOVERY — the pure half (2026-10-08). The no-card fallback.
 *
 * A patient arrives with no card, or a card that turned out to be dead,
 * and the desk's habit is to phone around or log into payer portals one by
 * one. Stedi's Insurance Discovery does that search from demographics: a
 * name, a date of birth, ideally a state and ZIP, and — the thing that
 * makes dental payers answer — a Social Security number. It returns every
 * coverage it could find, each flagged REVIEW_NEEDED by Stedi's own rule:
 * discovery never says which match is right, and some matches are other
 * people, other service types, or ended plans. So the design is two
 * steps on purpose: DISCOVERY finds candidate CARDS and a human picks one
 * by comparing name and date of birth; the normal eligibility CHECK then
 * reads that card's benefits through the one normalizer every other
 * answer goes through. Discovery never writes benefits.
 *
 * Costs: a discovery is a different, dearer line than a check (Stedi
 * publishes $1.50 at low volume against $0.30 for a check), so it has its
 * own small included allowance and its own confirm. THE SSN IS NEVER
 * STORED: it is sent to the clearinghouse under the BAA and forgotten;
 * the row keeps only `hasSsn`. Test mode refuses discovery outright
 * ("not available in Test Mode"), so only the live driver can find a
 * real card and the sandbox answers with labelled practice candidates.
 *
 * Client-safe: types, the validator, the request builder, the response
 * parser, ranking, the sandbox candidates and the copy. The server half is
 * lib/services/insurance-eligibility/discovery.ts.
 */

export const STEDI_DISCOVERY_PATH = '/2024-04-01/insurance-discovery/check/v1'

/** Included discoveries per clinic per clinic-local month (platform-env-overridable via INSURANCE_INCLUDED_MONTHLY_DISCOVERIES). */
export const INCLUDED_MONTHLY_INSURANCE_DISCOVERIES = 20

/** What the row keeps about the ask. No SSN, by law — only that one was given. */
export interface DiscoveryInput {
  firstName: string
  lastName: string
  /** ISO calendar date. */
  dateOfBirth: string
  state: string | null
  postalCode: string | null
  hasSsn: boolean
}

/** The ask as typed, SSN included — lives only for the length of one request. */
export interface DiscoveryRequestInput extends DiscoveryInput {
  ssn: string | null
}

export type DiscoveryCandidateStatus = 'active' | 'inactive' | 'unknown'

/** One coverage Stedi found. A CARD, not a benefits answer. */
export interface DiscoveryCandidate {
  payerName: string
  /** The clearinghouse payer id to check against (Stedi's primary id, else the payer's own identification). */
  payerId: string
  payorIdentification: string | null
  memberId: string
  groupNumber: string | null
  planName: string | null
  planBegin: string | null
  planEnd: string | null
  /** From the benefits status rows for dental (35) or the plan (30); unknown when the payer sent no status. */
  status: DiscoveryCandidateStatus
  /** The match carries dental coverage (a status or benefit row on STC 35). */
  dental: boolean
  /** Who the match names: the person asked about as the policyholder, or as someone's dependent. */
  relationship: 'self' | 'dependent'
  /** The policyholder when the match is a dependent's. */
  subscriber: { firstName: string; lastName: string; dateOfBirth: string | null } | null
  /** The matched person as the payer spelled them — the desk compares these to the patient. */
  matchedName: string
  matchedDateOfBirth: string | null
  /** Stedi's confidence word, verbatim (always REVIEW_NEEDED today). */
  confidence: string | null
}

export type DiscoveryStatus = 'found' | 'none' | 'pending' | 'error'

export interface InsuranceDiscoveryView {
  id: string
  patientId: string | null
  driver: InsuranceDriverId
  status: DiscoveryStatus
  input: DiscoveryInput
  candidates: DiscoveryCandidate[]
  coveragesFound: number
  /** Stedi's id for a still-pending search; null otherwise. */
  discoveryId: string | null
  error: string | null
  requestedByName: string | null
  createdAtIso: string
}

// ── Validation ──────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ZIP = /^\d{5}(-\d{4})?$/
const SSN_DIGITS = /^\d{9}$/

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export function validateDiscoveryInput(
  raw: unknown,
  now: Date = new Date(),
): { ok: true; value: DiscoveryRequestInput } | { ok: false; errors: Record<string, string> } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const errors: Record<string, string> = {}
  const firstName = str(r.firstName, 60)
  const lastName = str(r.lastName, 60)
  const dateOfBirth = str(r.dateOfBirth, 10)
  if (!firstName) errors.firstName = 'First name is required.'
  if (!lastName) errors.lastName = 'Last name is required.'
  if (!ISO_DATE.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth))) errors.dateOfBirth = 'Enter a date of birth.'
  else if (dateOfBirth > now.toISOString().slice(0, 10)) errors.dateOfBirth = 'A date of birth can’t be in the future.'
  const state = str(r.state, 10).toUpperCase() || null
  if (state && !/^[A-Z]{2}$/.test(state)) errors.state = 'Use the two-letter state.'
  const postalCode = str(r.postalCode, 10) || null
  if (postalCode && !ZIP.test(postalCode)) errors.postalCode = 'Use a 5-digit ZIP.'
  const ssnRaw = str(r.ssn, 16).replace(/\D/g, '')
  const ssn = ssnRaw ? ssnRaw : null
  if (ssn && !SSN_DIGITS.test(ssn)) errors.ssn = 'A Social Security number is nine digits.'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { firstName, lastName, dateOfBirth, state, postalCode, hasSsn: !!ssn, ssn } }
}

/** The row's copy of the ask: everything but the SSN. */
export function storableDiscoveryInput(v: DiscoveryRequestInput): DiscoveryInput {
  return { firstName: v.firstName, lastName: v.lastName, dateOfBirth: v.dateOfBirth, state: v.state, postalCode: v.postalCode, hasSsn: v.hasSsn }
}

// ── Request ─────────────────────────────────────────────────────────────

export interface StediDiscoveryRequestBody {
  provider: { npi: string }
  subscriber: {
    firstName: string
    lastName: string
    dateOfBirth: string
    ssn?: string
    address?: { state?: string; postalCode?: string }
  }
  encounter: { serviceTypeCodes: string[]; dateOfService: string }
}

function yyyymmdd(iso: string): string {
  return iso.replace(/-/g, '')
}

/** Stedi's body: dental (35), today as the date of service, the SSN only when given. */
export function buildDiscoveryRequest(input: DiscoveryRequestInput, opts: { npi: string; now: Date }): StediDiscoveryRequestBody {
  const body: StediDiscoveryRequestBody = {
    provider: { npi: opts.npi },
    subscriber: { firstName: input.firstName, lastName: input.lastName, dateOfBirth: yyyymmdd(input.dateOfBirth) },
    encounter: { serviceTypeCodes: ['35'], dateOfService: yyyymmdd(opts.now.toISOString().slice(0, 10)) },
  }
  if (input.ssn) body.subscriber.ssn = input.ssn
  if (input.state || input.postalCode) {
    body.subscriber.address = {}
    if (input.state) body.subscriber.address.state = input.state
    if (input.postalCode) body.subscriber.address.postalCode = input.postalCode
  }
  return body
}

// ── Response ────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.map(asRecord) : []
}
function isoFromStedi(v: unknown): string | null {
  const s = asString(v)
  if (!s) return null
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return ISO_DATE.test(s) ? s : null
}

export interface ParsedDiscovery {
  status: 'complete' | 'pending' | 'error'
  discoveryId: string | null
  coveragesFound: number
  candidates: DiscoveryCandidate[]
  errors: string[]
}

/** The legacy benefitsInformation shape: status code 1 = active, 6 = inactive; serviceTypeCodes name the line. */
function statusOf(benefits: Record<string, unknown>[]): { status: DiscoveryCandidateStatus; dental: boolean } {
  let status: DiscoveryCandidateStatus = 'unknown'
  let dental = false
  for (const b of benefits) {
    const codes = (Array.isArray(b.serviceTypeCodes) ? b.serviceTypeCodes : []).map((c) => String(c))
    if (codes.includes('35')) dental = true
    const code = asString(b.code)
    if (code !== '1' && code !== '6') continue
    const dentalRow = codes.includes('35')
    const planRow = codes.length === 0 || codes.includes('30')
    if (!dentalRow && !planRow) continue
    const next: DiscoveryCandidateStatus = code === '1' ? 'active' : 'inactive'
    // A dental row's word beats a plan-wide one; active beats unknown.
    if (dentalRow || status === 'unknown') status = next
  }
  return { status, dental }
}

export function parseDiscoveryResponse(json: unknown): ParsedDiscovery {
  const root = asRecord(json)
  const rawStatus = (asString(root.status) ?? '').toUpperCase()
  const errors = asArray(root.errors).map((e) => [asString(e.description), asString(e.code) ? `(${asString(e.code)})` : null].filter(Boolean).join(' ')).filter(Boolean)
  const discoveryId = asString(root.discoveryId)
  if (rawStatus === 'PENDING') return { status: 'pending', discoveryId, coveragesFound: 0, candidates: [], errors }
  if (rawStatus === 'ERROR' || (!rawStatus && errors.length)) return { status: 'error', discoveryId, coveragesFound: 0, candidates: [], errors }
  const candidates: DiscoveryCandidate[] = []
  for (const item of asArray(root.items)) {
    const payer = asRecord(item.payer)
    const sub = asRecord(item.subscriber)
    const dep = asRecord(item.dependent)
    const plan = asRecord(item.planInformation)
    const dates = asRecord(item.planDateInformation)
    const memberId = asString(sub.memberId) ?? asString(dep.memberId)
    const payorIdentification = asString(payer.payorIdentification)
    const payerId = asString(item.payerId) ?? payorIdentification
    const payerName = asString(asRecord(payer.name).organization) ?? asString(payer.name) ?? payerId
    if (!memberId || !payerId || !payerName) continue
    const isDependent = !!asString(dep.firstName)
    const who = isDependent ? dep : sub
    const { status, dental } = statusOf(asArray(item.benefitsInformation))
    candidates.push({
      payerName,
      payerId,
      payorIdentification,
      memberId,
      groupNumber: asString(sub.groupNumber) ?? asString(plan.groupNumber),
      planName: asString(plan.planDescription) ?? asString(plan.groupDescription),
      planBegin: isoFromStedi(dates.planBegin) ?? isoFromStedi(dates.eligibilityBegin),
      planEnd: isoFromStedi(dates.planEnd) ?? isoFromStedi(dates.eligibilityEnd),
      status,
      dental,
      relationship: isDependent ? 'dependent' : 'self',
      subscriber: isDependent
        ? { firstName: asString(sub.firstName) ?? '', lastName: asString(sub.lastName) ?? '', dateOfBirth: isoFromStedi(sub.dateOfBirth) }
        : null,
      matchedName: `${asString(who.firstName) ?? ''} ${asString(who.lastName) ?? ''}`.trim(),
      matchedDateOfBirth: isoFromStedi(who.dateOfBirth),
      confidence: asString(asRecord(item.confidence).level),
    })
  }
  const coveragesFound = typeof root.coveragesFound === 'number' ? root.coveragesFound : candidates.length
  return { status: 'complete', discoveryId, coveragesFound, candidates, errors }
}

/**
 * Active dental first, then active, then unknown, then a matching date of
 * birth, then as the payer listed them. An ENDED plan ranks below an
 * unknown one whatever its line — a dead card is not a lead.
 */
export function rankCandidates(list: DiscoveryCandidate[], input: Pick<DiscoveryInput, 'dateOfBirth'>): DiscoveryCandidate[] {
  const score = (c: DiscoveryCandidate) =>
    (c.status === 'active' ? 6 : c.status === 'unknown' ? 3 : 0) + (c.dental ? 2 : 0) + (c.matchedDateOfBirth === input.dateOfBirth ? 1 : 0)
  return list.map((c, i) => ({ c, i, s: score(c) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c)
}

/** The check form, filled from a chosen card. The patient stays the person asked about. */
export function candidateToRequest(c: DiscoveryCandidate, input: Pick<DiscoveryInput, 'firstName' | 'lastName' | 'dateOfBirth'>): Partial<EligibilityRequest> {
  const dependent = c.relationship === 'dependent' && c.subscriber && c.subscriber.firstName && c.subscriber.lastName && c.subscriber.dateOfBirth
  return {
    patient: { firstName: input.firstName, lastName: input.lastName, dateOfBirth: input.dateOfBirth },
    carrierName: c.payerName,
    payerId: c.payerId,
    payerName: c.payerName,
    memberId: c.memberId,
    groupNumber: c.groupNumber,
    relationship: dependent ? 'other' : 'self',
    subscriber: dependent ? { firstName: c.subscriber!.firstName, lastName: c.subscriber!.lastName, dateOfBirth: c.subscriber!.dateOfBirth! } : null,
  }
}

// ── The sandbox's candidates ────────────────────────────────────────────

function fnv(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const SANDBOX_PAYERS: ReadonlyArray<{ name: string; id: string; plan: string }> = [
  { name: 'Delta Dental of California', id: '77777', plan: 'Delta Dental PPO' },
  { name: 'Cigna Dental', id: '62308', plan: 'Cigna DPPO Advantage' },
  { name: 'MetLife', id: '65978', plan: 'MetLife PDP Plus' },
  { name: 'Guardian', id: '64246', plan: 'Guardian DentalGuard Preferred' },
]

/**
 * Deterministic practice candidates: most names find one card, some find
 * two (one of them ended), a few find nothing — so every state the panel
 * can show is reachable in the demo. Never a real payer.
 */
export function sandboxDiscoveryCandidates(input: DiscoveryInput, now: Date): DiscoveryCandidate[] {
  const h = fnv(`${input.firstName}|${input.lastName}|${input.dateOfBirth}`.toLowerCase())
  if (h % 5 === 0) return []
  const year = now.getUTCFullYear()
  const p = SANDBOX_PAYERS[h % SANDBOX_PAYERS.length]
  const memberId = `${p.id.slice(0, 2)}-${String(h % 900_000 + 100_000)}`
  const name = `${input.firstName} ${input.lastName}`.trim()
  const first: DiscoveryCandidate = {
    payerName: p.name,
    payerId: p.id,
    payorIdentification: p.id,
    memberId,
    groupNumber: `GRP-${String((h >>> 8) % 9000 + 1000)}`,
    planName: p.plan,
    planBegin: `${year}-01-01`,
    planEnd: null,
    status: 'active',
    dental: true,
    relationship: 'self',
    subscriber: null,
    matchedName: name.toUpperCase(),
    matchedDateOfBirth: input.dateOfBirth,
    confidence: 'REVIEW_NEEDED',
  }
  if (h % 3 !== 0) return [first]
  const q = SANDBOX_PAYERS[(h + 1) % SANDBOX_PAYERS.length]
  const ended: DiscoveryCandidate = {
    ...first,
    payerName: q.name,
    payerId: q.id,
    payorIdentification: q.id,
    memberId: `${q.id.slice(0, 2)}-${String((h >>> 4) % 900_000 + 100_000)}`,
    groupNumber: null,
    planName: q.plan,
    planBegin: `${year - 2}-01-01`,
    planEnd: `${year - 1}-12-31`,
    status: 'inactive',
  }
  return [first, ended]
}

// ── Copy ────────────────────────────────────────────────────────────────

export const DISCOVERY_COPY = {
  door: 'No card? Find their coverage',
  title: 'Find their coverage',
  lede: 'Searches the payers for a plan in this name. Works best with a Social Security number — many dental payers answer to nothing else.',
  ssnLabel: 'Social Security number',
  ssnHint: 'Optional. Sent to the clearinghouse for the search and never kept here.',
  stateLabel: 'State',
  zipLabel: 'ZIP',
  find: 'Find coverage',
  finding: 'Searching…',
  use: 'Use this card',
  close: 'Close',
  pending: 'Still searching — the payers haven’t all answered yet. Check back in a minute.',
  checkAgain: 'Check for results',
  none: 'Nothing found in this name. Try adding a Social Security number, or check the spelling and date of birth.',
  honesty: 'Every match needs a look: compare the name and date of birth to the patient before you check benefits. A match can be another person, an ended plan, or medical rather than dental.',
  practice: 'Practice answer — these are sample cards, not a payer search.',
  liveOnly: 'Finding coverage needs real payer answers, which test mode can’t give.',
  confirmTitle: 'Search the payers for their coverage?',
  confirmLabel: 'Find coverage',
  confirmBody(usage: InsuranceUsage | null | undefined, billed: boolean): string {
    const lead = 'This asks the payers for any plan in this name and date of birth. It finds a card — the benefits still come from a normal check afterwards.'
    if (!billed) return `${lead} A practice answer: nothing goes to a payer.`
    const standing = usage && !usage.unreadable ? ` ${usage.used} of ${usage.included} of this month’s included searches are used.` : ''
    return `${lead} A search costs more than a check.${standing}`
  },
  usageLine(usage: InsuranceUsage): string {
    return `${usage.used} of ${usage.included} searches used this month`
  },
  statusWord(s: DiscoveryCandidateStatus): string {
    return s === 'active' ? 'Active' : s === 'inactive' ? 'Ended' : 'Status unknown'
  },
} as const

/** The Action Ledger line. */
export function ledgerSummaryForDiscovery(view: Pick<InsuranceDiscoveryView, 'status' | 'coveragesFound' | 'input' | 'driver'>, patientDisplayName: string): string {
  const who = patientDisplayName.trim() || `${view.input.firstName} ${view.input.lastName}`.trim()
  const possessive = who.endsWith('s') ? `${who}’` : `${who}’s`
  const practice = view.driver === 'sandbox' ? ' (practice answer)' : ''
  switch (view.status) {
    case 'found':
      return `Searched for ${possessive} insurance — ${view.coveragesFound} possible ${view.coveragesFound === 1 ? 'plan' : 'plans'}${practice}`
    case 'none':
      return `Searched for ${possessive} insurance — nothing found${practice}`
    case 'pending':
      return `Searching for ${possessive} insurance — the payers are still answering`
    case 'error':
      return `Tried to search for ${possessive} insurance and couldn’t`
  }
}
