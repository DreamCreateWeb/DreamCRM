/**
 * FIT AND FRESHNESS — pure (P-04).
 *
 * "Only practices that need us, with numbers we can stand behind." The
 * owner's rulings (2026-11-11): chains and DSOs are OUT (targeted later
 * with other features); a group practice is deprioritised, never excluded;
 * nobody optimises for "will they pick up" — what matters is that the
 * number is ACTIVE and IS THAT CLINIC'S number.
 *
 * Everything here is a rule over stored facts, so the enrich pass, the
 * verify sweep, the chain sweep and the drawer all reason the same way:
 *
 *   matchDso            a DSO / chain name on the practice, the NPI org or
 *                       the Google listing (lib/dso-names.ts) — a common-
 *                       phrase brand needs the website host to agree
 *   addressKey          the one normalized address the chain rule counts
 *                       DISTINCT addresses by (mirrored in SQL by
 *                       lib/services/prospect-fit.ts: addressKeySql)
 *   chainGroupVerdict   our own data: the same website host or the same
 *                       phone across ≥ CHAIN_SHARED_THRESHOLD prospects at
 *                       different addresses → every one of them is a chain
 *   practiceSize        NPI-1 dentists at the org's address (the registry)
 *   officialTitleKind   owner / dentist / DDS vs CEO / VP / director — a
 *                       corroborating signal, never a decider
 *   isNewPractice       NPPES enumerated < NEW_PRACTICE_MONTHS ago
 *   fitVerdict          the one read of "is this row a chain?", honouring
 *                       the owner's "Not a chain" override
 *   earlyRefreshDue     callers steer freshness: ≥ 3 closed / disconnected
 *                       practices in a territory inside 30 days pulls its
 *                       discovery refresh forward — ONE pull per new closed
 *                       call (territoryPullDue), nothing mutated backwards
 */

import { DSO_DOMAIN_CLASS, DSO_ENTRIES } from './dso-names'
import type { OfficialTitleKind, PracticeSize, ProspectFitSignals } from './types/prospecting'

/** A practice enumerated inside this window is "new" — no website yet is normal. */
export const NEW_PRACTICE_MONTHS = 18
/** This many individual dentists at one address is a group practice. */
export const GROUP_PRACTICE_DENTISTS = 5
/** A website host or a phone shared by this many prospects at DIFFERENT
 *  addresses is a chain. */
export const CHAIN_SHARED_THRESHOLD = 3
/** Callers steer freshness: this many closed / disconnected practices … */
export const EARLY_REFRESH_CLOSED_THRESHOLD = 3
/** … inside this many days pulls the territory's refresh forward. */
export const EARLY_REFRESH_WINDOW_DAYS = 30
/** A stored practice-size signal older than this is looked up again. */
export const SIZE_RECHECK_DAYS = 180

const DAY_MS = 24 * 60 * 60 * 1000

// ── Names ──────────────────────────────────────────────────────────────────

/** "Aspen Dental — Austin, P.C." → "aspen dental austin p c"; '&' reads
 *  "and" so "Dentures & Implants" meets "Dentures and Implants". */
export function normalizePracticeName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

const DSO_NORMALIZED: ReadonlyArray<{ name: string; key: string; domains: readonly string[] | null }> = DSO_ENTRIES.map((e) => ({
  name: e.name,
  key: normalizePracticeName(e.name),
  domains: e.domains && e.domains.length > 0 ? e.domains : null,
})).filter((d) => d.key.length > 0)

/** "www.gentledental.interdent.com" meets ['interdent.com'] — the host
 *  equals a brand domain or sits under it. */
export function hostMatchesDomains(host: string | null | undefined, domains: readonly string[]): boolean {
  const h = (host ?? '').toLowerCase().replace(/^www\./, '')
  if (!h) return false
  return domains.some((d) => h === d || h.endsWith(`.${d}`))
}

/** Is this list entry one that needs the website host to agree? */
export function isDomainClassDso(name: string | null | undefined): boolean {
  return Boolean(name) && DSO_DOMAIN_CLASS.includes(name as string)
}

/** The DSO whose normalized name appears in this name as a whole-word
 *  sequence, else null. A common-phrase brand (lib/dso-names.ts `domains`)
 *  matches ONLY when one of `hosts` is the brand's own — a name hit with
 *  no host corroboration is null, not a weaker signal. */
export function matchDsoName(name: string | null | undefined, hosts: ReadonlyArray<string | null | undefined> = []): string | null {
  const key = normalizePracticeName(name)
  if (!key) return null
  const padded = ` ${key} `
  for (const d of DSO_NORMALIZED) {
    if (!padded.includes(` ${d.key} `)) continue
    if (!d.domains) return d.name
    if (hosts.some((h) => hostMatchesDomains(h, d.domains as readonly string[]))) return d.name
  }
  return null
}

export type DsoMatchedOn = 'practice' | 'npi' | 'listing'

/** The first DSO hit across the three names we hold for a practice; the
 *  hosts (the row's website, the matched listing's) corroborate a
 *  common-phrase brand. */
export function matchDso(names: {
  practice?: string | null
  npi?: string | null
  listing?: string | null
  hosts?: ReadonlyArray<string | null | undefined>
}): { name: string; matchedOn: DsoMatchedOn } | null {
  const hosts = names.hosts ?? []
  const order: Array<[DsoMatchedOn, string | null | undefined]> = [
    ['practice', names.practice],
    ['npi', names.npi],
    ['listing', names.listing],
  ]
  for (const [matchedOn, value] of order) {
    const hit = matchDsoName(value, hosts)
    if (hit) return { name: hit, matchedOn }
  }
  return null
}

// ── The official's title ───────────────────────────────────────────────────

const CLINICIAN_TITLE = /\b(owner|dentist|dds|dmd|doctor|dr|orthodontist|periodontist|endodontist|prosthodontist|oral surgeon|principal)\b/i
const EXECUTIVE_TITLE = /\b(ceo|cfo|coo|cmo|cio|vp|vice president|director|manager|administrator|controller|officer|general counsel|treasurer|secretary)\b/i

/** owner / dentist / DDS / DMD → clinician; CEO / VP / director / manager →
 *  executive (a chain or group tell, corroborating only). */
export function officialTitleKind(title: string | null | undefined): OfficialTitleKind {
  if (!title) return 'unknown'
  const t = title.replace(/\./g, '')
  if (CLINICIAN_TITLE.test(t)) return 'clinician'
  if (EXECUTIVE_TITLE.test(t)) return 'executive'
  return 'unknown'
}

// ── Practice size ──────────────────────────────────────────────────────────

/** ≥ 5 dentists at the address → group (deprioritised, never excluded);
 *  2–4 small; 1 solo; none counted → unknown. */
export function practiceSize(dentists: number | null | undefined): PracticeSize {
  if (dentists == null || !Number.isFinite(dentists) || dentists <= 0) return 'unknown'
  if (dentists >= GROUP_PRACTICE_DENTISTS) return 'group'
  if (dentists >= 2) return 'small'
  return 'solo'
}

export function practiceSizeSentence(size: PracticeSize, dentists: number | null, official: OfficialTitleKind): string {
  const tail = official === 'executive' ? ' — the registry official is an executive, not a dentist' : ''
  switch (size) {
    case 'group':
      return `A group practice — ${dentists} dentists at this address in the registry${tail}`
    case 'small':
      return `${dentists} dentists at this address in the registry${tail}`
    case 'solo':
      return `One dentist at this address in the registry${tail}`
    default:
      return `No individual dentists listed at this address in the registry${tail}`
  }
}

// ── New practice ───────────────────────────────────────────────────────────

/** NPPES dates come as YYYY-MM-DD or MM/DD/YYYY; anything else is null. */
export function parseNppesDate(v: string | null | undefined): Date | null {
  if (!v) return null
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const us = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (us) {
    const d = new Date(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2])))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Whole months between two instants (a < b), floored; 0 when b ≤ a. */
export function monthsBetween(a: Date, b: Date): number {
  if (b.getTime() <= a.getTime()) return 0
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
  if (b.getUTCDate() < a.getUTCDate()) months -= 1
  return Math.max(0, months)
}

/** Enumerated less than NEW_PRACTICE_MONTHS ago (a future date counts as new —
 *  the registry's clock, not ours). */
export function isNewPractice(enumerationDate: string | null | undefined, now: Date): boolean {
  const d = parseNppesDate(enumerationDate)
  if (!d) return false
  return monthsBetween(d, now) < NEW_PRACTICE_MONTHS
}

/** "Jun 2025" from an ISO-ish date (UTC); null when unparseable. */
export function formatMonthYear(iso: string | Date | null | undefined): string | null {
  if (!iso) return null
  const d = typeof iso === 'string' ? (parseNppesDate(iso) ?? new Date(iso)) : iso
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(d)
}

/** The opportunity reason for a new practice: no website yet is normal. */
export function newPracticeSentence(enumeratedAt: string | null | undefined): string {
  const when = formatMonthYear(enumeratedAt)
  return `Opened ${when ?? 'recently'} — no website yet is normal; now is the moment`
}

// ── The address key ────────────────────────────────────────────────────────

/** The street words the key folds to one spelling — the same table drives
 *  `addressKeySql` (lib/services/prospect-fit.ts), so the SQL and the pure
 *  key cannot drift apart. */
export const ADDRESS_WORDS: ReadonlyArray<readonly [string, string]> = [
  ['street', 'st'],
  ['avenue', 'ave'],
  ['road', 'rd'],
  ['drive', 'dr'],
  ['boulevard', 'blvd'],
  ['lane', 'ln'],
  ['court', 'ct'],
  ['parkway', 'pkwy'],
  ['highway', 'hwy'],
  ['place', 'pl'],
  ['circle', 'cir'],
  ['north', 'n'],
  ['south', 's'],
  ['east', 'e'],
  ['west', 'w'],
  // The suite line's own spellings, so a KEPT suite compares as one word.
  ['suite', 'ste'],
  ['floor', 'fl'],
  ['building', 'bldg'],
  ['apartment', 'apt'],
  ['room', 'rm'],
]
/** A suite / unit / floor token and the value after it ("STE 200",
 *  "Suite B", "Unit #4") — read AFTER the word table folded the long
 *  spellings, so only the short ones are listed. */
export const SUITE_TOKEN_PATTERN = '(ste|unit|apt|fl|rm|bldg)'
/** The unit-like tokens a KEPT suite folds to ONE spelling (fix pass II,
 *  V4): '#300', 'STE 300', 'Suite 300', 'Unit 300', 'Apt 300', 'Rm 300'
 *  all read 'ste 300', so the suite VALUE is what compares — 'STE 300' and
 *  'STE 301' stay two. A floor or a building is a different kind of line
 *  and keeps its own word. */
export const SUITE_FOLD_PATTERN = '(ste|unit|apt|rm)'

/**
 * THE ONE ADDRESS KEY: lower-case; the common street (and suite) words
 * folded to their abbreviations; the suite / unit / floor token and its
 * value dropped (unless `keepSuite` — the practice-size count keeps them,
 * they ARE the distinguishing token in a building, folded to one spelling
 * so the value compares); ZIP5 only; then letters and digits. '123 MAIN
 * ST STE 200' / '787011234' and '123 Main Street Suite 200' / '78701' are
 * ONE address; '100 Main St' and '200 Main St' are two. NULL when there is
 * no street (fix pass II, V8): a phone-only stub with a ZIP is not an
 * address, so `count(distinct …)` skips it and it never makes two offices
 * a chain. Mirrored in SQL by `addressKeySql`.
 */
export function addressKey(line1: string | null | undefined, postalCode: string | null | undefined, opts: { keepSuite?: boolean } = {}): string | null {
  let s = (line1 ?? '').toLowerCase()
  for (const [word, abbr] of ADDRESS_WORDS) s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), abbr)
  if (opts.keepSuite) {
    s = s.replace(new RegExp(`\\b${SUITE_FOLD_PATTERN}\\b\\.?\\s*#?\\s*`, 'g'), 'ste ')
    s = s.replace(/#\s*/g, 'ste ')
  } else {
    s = s.replace(new RegExp(`\\b${SUITE_TOKEN_PATTERN}\\b\\.?\\s*#?\\s*[a-z0-9-]+`, 'g'), ' ')
    s = s.replace(/#\s*[a-z0-9-]+/g, ' ')
  }
  const street = s.replace(/[^a-z0-9]/g, '')
  if (!street) return null
  const zip = (postalCode ?? '').replace(/\D/g, '').slice(0, 5)
  return `${street}${zip}`
}

// ── Chains from our own data ───────────────────────────────────────────────

/** Hosts many unrelated practices share — a Facebook page, a Google
 *  Business site, a builder's free subdomain, a directory. Never a chain. */
export const GENERIC_WEBSITE_HOSTS: readonly string[] = [
  'facebook.com',
  'instagram.com',
  'business.site',
  'sites.google.com',
  'google.com',
  'wixsite.com',
  'godaddysites.com',
  'weebly.com',
  'weeblysite.com',
  'squarespace.com',
  'wordpress.com',
  'linktr.ee',
  'yelp.com',
  'healthgrades.com',
  'zocdoc.com',
  'webmd.com',
  'vitals.com',
  'yellowpages.com',
  'nextdoor.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'bing.com',
  'mapquest.com',
  'localmed.com',
  'dentalplans.com',
  '1800dentist.com',
  'emergencydentistsusa.com',
  'dentist.com',
  'opencare.com',
]

/** "https://www.smile.com/about" → "smile.com"; null when not a URL. */
export function websiteHost(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

export function isGenericWebsiteHost(host: string | null | undefined): boolean {
  if (!host) return true
  const h = host.toLowerCase().replace(/^www\./, '')
  return GENERIC_WEBSITE_HOSTS.some((g) => h === g || h.endsWith(`.${g}`))
}

export type ChainKind = 'shared_host' | 'shared_phone'

export interface ChainGroup {
  kind: ChainKind
  /** The host or the ten-digit phone the group shares. */
  key: string
  /** Distinct addresses in the group. */
  addresses: number
  ids: string[]
}

/** The rule: ≥ CHAIN_SHARED_THRESHOLD distinct addresses on one key — and a
 *  shared host is only a chain when the host is the practice's own. */
export function chainGroupVerdict(group: Pick<ChainGroup, 'kind' | 'key' | 'addresses'>, threshold = CHAIN_SHARED_THRESHOLD): boolean {
  if (group.addresses < threshold) return false
  if (group.kind === 'shared_host') return !isGenericWebsiteHost(group.key)
  return /^\d{10}$/.test(group.key)
}

/** The plain sentence a flagged row carries. */
export function chainSentence(input: { dso?: string | null; chain?: { kind: ChainKind; count: number } | null }): string {
  if (input.dso) return `Part of ${input.dso} — a chain; we'll target chains later`
  if (input.chain) {
    const others = Math.max(0, input.chain.count - 1)
    const what = input.chain.kind === 'shared_host' ? 'its website' : 'its phone number'
    return `Shares ${what} with ${others} other practice${others === 1 ? '' : 's'} at different addresses — a chain; we'll target chains later`
  }
  return "A chain; we'll target chains later"
}

/** THE ONE READ of "is this row a chain?" — a DSO name hit or a shared-key
 *  group, unless the owner said "Not a chain" (never re-flagged). */
export function fitVerdict(fit: ProspectFitSignals | null | undefined):
  | { chain: false }
  | { chain: true; via: 'dso' | 'chain'; reason: string } {
  if (!fit) return { chain: false }
  if (fit.chainOverride) return { chain: false }
  if (fit.dso?.status === 'match') {
    return { chain: true, via: 'dso', reason: fit.dso.detail ?? chainSentence({ dso: fit.dso.name ?? 'a DSO' }) }
  }
  if (fit.chain && (fit.chain.status === 'shared_host' || fit.chain.status === 'shared_phone')) {
    return {
      chain: true,
      via: 'chain',
      reason: fit.chain.detail ?? chainSentence({ chain: { kind: fit.chain.status, count: fit.chain.count ?? CHAIN_SHARED_THRESHOLD } }),
    }
  }
  return { chain: false }
}

/** Statuses a chain flag can be lifted back to; anything else returns to
 *  the pool as `enriched`. A RESTING row (`dormant`) is set aside like any
 *  live member and returns to resting — its `dormant_from_status` is kept
 *  through the flag, so it still wakes to where it came from. */
export const CHAIN_RESTORABLE_STATUSES = ['discovered', 'enriched', 'queued', 'contacted', 'engaged', 'call_list', 'dormant'] as const

export function chainRestoreStatus(priorStatus: string | null | undefined): string {
  return priorStatus && (CHAIN_RESTORABLE_STATUSES as readonly string[]).includes(priorStatus) ? priorStatus : 'enriched'
}

/** The statuses a chain sweep DISQUALIFIES — the live ones and a resting
 *  one (a dormant member is set aside exactly as the verify sweep sets it
 *  aside); every other row still records the signal (a customer, a merged
 *  shell, a row that already said no or is already gone keeps its status). */
export function chainFlaggable(status: string | null | undefined): boolean {
  return Boolean(status) && (CHAIN_RESTORABLE_STATUSES as readonly string[]).includes(status as string)
}

// ── Callers steer freshness ────────────────────────────────────────────────

export function earlyRefreshDue(closedPractices: number, threshold = EARLY_REFRESH_CLOSED_THRESHOLD): boolean {
  return Number.isFinite(closedPractices) && closedPractices >= threshold
}

/** The hunt tile's reason, honest about the mix: "3 closed practices this
 *  month", "3 disconnected numbers this month", "2 closed, 1 disconnected
 *  this month" — never "closed practices" for a disconnected count. */
export function earlyRefreshReason(counts: { closed: number; disconnected: number }): string {
  const closed = Math.max(0, Math.floor(counts.closed || 0))
  const disconnected = Math.max(0, Math.floor(counts.disconnected || 0))
  if (closed > 0 && disconnected > 0) return `${closed} closed, ${disconnected} disconnected this month`
  if (closed > 0) return `${closed} closed practice${closed === 1 ? '' : 's'} this month`
  return `${disconnected} disconnected number${disconnected === 1 ? '' : 's'} this month`
}

/**
 * ONE PULL PER NEW CLOSED CALL (the fix-pass rule): a territory's refresh
 * is pulled forward when its NEWEST closed / disconnected call is later
 * than its last sweep (`COALESCE(last_refreshed_at, updated_at)`), it is
 * not already pulled, and its state is enabled. A refresh that ran stamps
 * `last_refreshed_at = now`, so the same calls never pull it again; a
 * later closed call does. Mirrored in SQL by `pullForwardWhere`
 * (lib/services/prospect-discovery.ts).
 */
export function territoryPullDue(
  t: { sweptAt: Date | null; refreshPulledAt: Date | null; newestClosedCall: Date | null },
  enabled: boolean,
): boolean {
  if (!enabled) return false
  if (t.refreshPulledAt) return false
  if (!t.newestClosedCall) return false
  if (!t.sweptAt) return true
  return t.newestClosedCall.getTime() > t.sweptAt.getTime()
}

/** Is a stored signal older than `days` (or missing)? */
export function signalOlderThan(checkedAt: string | null | undefined, now: Date, days: number): boolean {
  if (!checkedAt) return true
  const t = new Date(checkedAt).getTime()
  if (Number.isNaN(t)) return true
  return now.getTime() - t > days * DAY_MS
}
