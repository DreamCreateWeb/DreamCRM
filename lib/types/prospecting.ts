// Client-safe prospecting types, labels, and the config resolver — no
// server-only deps so table/drawer/settings components can import them.
// DB functions live in lib/services/prospecting.ts.

import type {
  ProspectStatus,
  ProspectScoreBand,
  ProspectIntentSignal,
  ProspectQualityBand,
  ProspectPhoneStatus,
  ProspectPhoneLineType,
  ProspectPhoneSource,
  ProspectCallOutcome,
} from '@/lib/db/schema/prospecting'

export type {
  ProspectStatus,
  ProspectScoreBand,
  ProspectIntentSignal,
  ProspectQualityBand,
  ProspectPhoneStatus,
  ProspectPhoneLineType,
  ProspectPhoneSource,
  ProspectCallOutcome,
}

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  discovered: 'Discovered',
  enriching: 'Enriching',
  enriched: 'Enriched',
  queued: 'Queued',
  contacted: 'Contacted',
  engaged: 'Engaged',
  call_list: 'Call list',
  converted: 'Converted',
  not_interested: 'Not interested',
  suppressed: 'Suppressed',
  disqualified: 'Disqualified',
  dormant: 'Resting',
  merged: 'Merged',
}

export const SCORE_BAND_LABELS: Record<ProspectScoreBand, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cool: 'Cool',
  low: 'Low',
}

export const QUALITY_BAND_LABELS: Record<ProspectQualityBand, string> = {
  best: 'Best',
  good: 'Good',
  weak: 'Weak',
  parked: 'Parked',
}

export const PHONE_STATUS_LABELS: Record<ProspectPhoneStatus, string> = {
  unknown: 'Not checked',
  valid: 'Valid',
  invalid: 'Invalid number',
  disconnected: 'Disconnected',
  wrong_number: 'Wrong number',
}

export const PHONE_LINE_TYPE_LABELS: Record<ProspectPhoneLineType, string> = {
  landline: 'landline',
  mobile: 'mobile',
  voip: 'VoIP',
  other: 'other line',
}

export const PHONE_SOURCE_LABELS: Record<ProspectPhoneSource, string> = {
  nppes: 'NPI registry',
  places: 'Google listing',
  caller: 'a call',
  // The two-source rule (P-04): the column now carries the number's
  // STANDING; who stated it lives in verification.phone.sources.
  corroborated: 'two sources agree',
  single_source: 'one source only',
}

/** Who can state a prospect's number (verification.phone.sources, P-04):
 *  the registry, the matched listing, a human on a call, the carrier
 *  database saying the line is in service. */
export const PHONE_SOURCE_NAMES = ['nppes', 'places', 'caller', 'carrier'] as const
export type PhoneSourceName = (typeof PHONE_SOURCE_NAMES)[number]
export const PHONE_SOURCE_NAME_LABELS: Record<PhoneSourceName, string> = {
  nppes: 'NPI registry',
  places: 'Google listing',
  caller: 'a call',
  carrier: 'carrier database',
}
/** `corroborated` = the registry and the listing agree (ten digits), or the
 *  carrier says in-service and at least one source states it;
 *  `single_source` = one source, not carrier-checked. No first-dial bucket
 *  (owner ruling 2026-11-11). */
export type PhoneStanding = 'corroborated' | 'single_source'

/** Plain labels for every call outcome (the call card, Call Mode, the log). */
export const CALL_OUTCOME_LABELS: Record<ProspectCallOutcome, string> = {
  no_answer: 'No answer',
  voicemail: 'Voicemail',
  callback: 'Callback',
  demo_booked: 'Demo booked',
  not_interested: 'Not interested',
  won: 'Won',
  disconnected: 'Disconnected',
  wrong_number: 'Wrong number',
  closed: 'Practice closed / retired',
  gatekeeper: 'Reached the desk',
}

/** Outcomes that mean a human actually reached the practice — the one
 *  verification signal only a call can produce. */
export const REACHED_CALL_OUTCOMES: readonly ProspectCallOutcome[] = [
  'callback',
  'demo_booked',
  'won',
  'gatekeeper',
  'not_interested',
]

// ── Cold callers (P-02) ────────────────────────────────────────────────────
export type ProspectCallerStatus = import('@/lib/db/schema/prospecting').ProspectCallerStatus

export const CALLER_STATUS_LABELS: Record<ProspectCallerStatus, string> = {
  invited: 'Invited',
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
}

/** A caller's invite link is good for this long (shorter than a partner's
 *  14 days — a caller starts the week they are hired). */
export const CALLER_INVITE_TTL_DAYS = 7
/** A claimed prospect nobody dialled for this long goes back to the pool. */
export const CALLER_STALE_ASSIGNMENT_DAYS = 7
/** A skipped prospect waits this long before any caller can claim it again. */
export const CALLER_SKIP_COOLDOWN_DAYS = 3
/** A skip that ENDS the relationship ("not a fit", "already spoke") parks
 *  the row out of every caller's reach for this long — never a 3-day
 *  recycle back to the same person. */
export const CALLER_SKIP_LONG_COOLDOWN_DAYS = 90
export const CALLER_SKIP_FINAL_REASONS = ['not_a_fit', 'already_spoke'] as const
/** A row the sweep or a pause hands back waits this long before the SAME
 *  tick's refill can hand it straight back. */
export const CALLER_RELEASE_COOLDOWN_DAYS = 3

/** Statuses a caller's queue can SERVE: the live ones. A row that leaves
 *  this list by any path (a reply, a bounce, a verify pass, a conversion)
 *  drops off the dial card the moment it is read, and
 *  `releaseIfUnservable` frees the slot. `engaged` is here (a practice that
 *  warms up while held stays held) but NOT in the pool a caller claims
 *  from — those are the owner's warm leads. */
export const CALLER_SERVABLE_STATUSES = ['enriched', 'queued', 'contacted', 'engaged', 'call_list'] as const

/** Intent signals that mean a hand went up — those practices stay with the
 *  platform owner's own call list and are never auto-assigned to a caller. */
export const HAND_RAISER_SIGNALS: readonly ProspectIntentSignal[] = [
  'reply_interested',
  'reply_question',
  'demo_request',
  'event_met',
]

/** Outcomes after which a caller's assignment ends — the record is done (a
 *  polite no) or dead (closed / bad number). Every one of them also makes
 *  the row UNSERVABLE (a status or phone flip), so the pool never hands it
 *  back. A booked demo is NOT here: the row stays with the caller who
 *  earned it, off the dial card, until the meeting passes. */
export const CALLER_TERMINAL_OUTCOMES: readonly ProspectCallOutcome[] = [
  'not_interested',
  'closed',
  'disconnected',
  'wrong_number',
]

/** The outcome keys a caller can press (1–9, in this order). `demo_booked`
 *  opens the inline booking form; `not_interested` asks for a coded reason;
 *  `callback` asks for a time in the practice's zone. */
export const CALLER_OUTCOME_KEYS: readonly ProspectCallOutcome[] = [
  'demo_booked',
  'not_interested',
  'callback',
  'voicemail',
  'no_answer',
  'gatekeeper',
  'disconnected',
  'wrong_number',
  'closed',
]

/** The caller's labels — "Reached" leads where a human picked up. */
export const CALLER_OUTCOME_LABELS: Record<ProspectCallOutcome, string> = {
  ...CALL_OUTCOME_LABELS,
  demo_booked: 'Reached — interested',
  not_interested: 'Reached — not interested',
  gatekeeper: 'Gatekeeper',
}

/** A skip is logged on the call log under this outcome word (never through
 *  logCallOutcome — it changes nothing about the record but who holds it). */
export const CALLER_SKIP_OUTCOME = 'skipped'

export const CALLER_SKIP_REASONS = ['not_a_fit', 'already_spoke', 'bad_timing', 'other'] as const
export type CallerSkipReason = (typeof CALLER_SKIP_REASONS)[number]
export const CALLER_SKIP_REASON_LABELS: Record<CallerSkipReason, string> = {
  not_a_fit: "Doesn't look like a fit",
  already_spoke: 'Already spoke to them',
  bad_timing: 'Come back to it later',
  other: 'Other',
}

// ── Verification (prospect.verification jsonb) ─────────────────────────────
export const VERIFICATION_SIGNALS = ['places', 'business', 'npi', 'website', 'phone', 'reviews', 'reach'] as const
export type VerificationSignalId = (typeof VERIFICATION_SIGNALS)[number]

export const VERIFICATION_SIGNAL_LABELS: Record<VerificationSignalId, string> = {
  places: 'Google listing',
  business: 'Open for business',
  npi: 'NPI registry',
  website: 'Website',
  phone: 'Phone',
  reviews: 'Google reviews',
  reach: 'Reached by a call',
}

export interface VerificationSignal {
  /** Signal-specific status word (matched / no_match / active / retired /
   *  alive / dead / parked / valid / …). Always a plain lowercase token. */
  status: string
  /** One sentence a human can read on the drawer. */
  detail: string | null
  /** ISO instant — rendered with a UTC mark on platform surfaces. */
  checkedAt: string
  /** Where the fact came from: places | nppes | crawl | aws_pinpoint | nanp | caller. */
  source: string
}

/** The phone signal carries the two-source rule (P-04): who stated the
 *  number, its standing, and whether the line check ran. */
export interface PhoneVerificationSignal extends VerificationSignal {
  sources?: PhoneSourceName[]
  standing?: PhoneStanding | null
  /** off = the line check is not configured; skipped = it was configured
   *  but did not run (budget, refused, unavailable); done = it answered. */
  lineCheck?: 'off' | 'skipped' | 'done' | null
}

/** Liveness from the listing (P-04): the latest review's publish time and
 *  whether the listing states opening hours. Statuses: recent (≤ 6 months)
 *  · quiet (≤ 18) · stale (older) · none (no reviews) · unknown (Google
 *  returned no dates). */
export interface ReviewsVerificationSignal extends VerificationSignal {
  latestAt?: string | null
  hours?: boolean | null
}

export type OfficialTitleKind = 'clinician' | 'executive' | 'unknown'
export type PracticeSize = 'solo' | 'small' | 'group' | 'unknown'

/** Fit (P-04) — stored under `verification.fit.*`, each a signal with its
 *  source and UTC stamp like every other, plus the facts the rule read. */
export interface ProspectFitSignals {
  /** A DSO / chain name on the practice, the NPI org or the listing
   *  (status `match` | `none`). */
  dso?: VerificationSignal & { name?: string | null; matchedOn?: 'practice' | 'npi' | 'listing' | null; priorStatus?: string | null }
  /** Our own data: a website host or a phone shared across ≥3 prospects at
   *  different addresses (status `shared_host` | `shared_phone` | `none`). */
  chain?: VerificationSignal & { kind?: 'shared_host' | 'shared_phone' | null; count?: number | null; key?: string | null; priorStatus?: string | null }
  /** NPI-1 dentists at the org's address (status = PracticeSize). */
  size?: VerificationSignal & { dentists?: number | null; official?: OfficialTitleKind | null }
  /** NPPES enumeration inside NEW_PRACTICE_MONTHS (status `new` | `established` | `unknown`). */
  newPractice?: VerificationSignal & { enumeratedAt?: string | null }
  /** The owner said "Not a chain" — never re-flagged. */
  chainOverride?: VerificationSignal
}
export const FIT_SIGNALS = ['dso', 'chain', 'size', 'newPractice', 'chainOverride'] as const
export type FitSignalId = (typeof FIT_SIGNALS)[number]
export const FIT_SIGNAL_LABELS: Record<FitSignalId, string> = {
  dso: 'DSO / chain name',
  chain: 'Shared with other practices',
  size: 'Practice size',
  newPractice: 'Opened',
  chainOverride: 'Not a chain',
}

export type ProspectVerification = Partial<Record<VerificationSignalId, VerificationSignal>> & {
  phone?: PhoneVerificationSignal
  reviews?: ReviewsVerificationSignal
  fit?: ProspectFitSignals
}

function parseSignal(v: unknown): (VerificationSignal & Record<string, unknown>) | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.status !== 'string' || typeof r.checkedAt !== 'string') return null
  return {
    ...r,
    status: r.status,
    detail: typeof r.detail === 'string' ? r.detail : null,
    checkedAt: r.checkedAt,
    source: typeof r.source === 'string' ? r.source : 'unknown',
  }
}

/** Junk-tolerant read of the jsonb column. */
export function parseVerification(raw: unknown): ProspectVerification {
  if (!raw || typeof raw !== 'object') return {}
  const out: ProspectVerification = {}
  for (const id of VERIFICATION_SIGNALS) {
    const sig = parseSignal((raw as Record<string, unknown>)[id])
    if (!sig) continue
    const base: VerificationSignal = { status: sig.status, detail: sig.detail, checkedAt: sig.checkedAt, source: sig.source }
    if (id === 'phone') {
      const sources = Array.isArray(sig.sources)
        ? sig.sources.filter((s): s is PhoneSourceName => (PHONE_SOURCE_NAMES as readonly string[]).includes(s as string))
        : undefined
      const standing = sig.standing === 'corroborated' || sig.standing === 'single_source' ? sig.standing : null
      const lineCheck = sig.lineCheck === 'off' || sig.lineCheck === 'skipped' || sig.lineCheck === 'done' ? sig.lineCheck : null
      out.phone = { ...base, ...(sources ? { sources } : {}), ...(standing ? { standing } : {}), ...(lineCheck ? { lineCheck } : {}) }
    } else if (id === 'reviews') {
      out.reviews = {
        ...base,
        latestAt: typeof sig.latestAt === 'string' ? sig.latestAt : null,
        hours: typeof sig.hours === 'boolean' ? sig.hours : null,
      }
    } else {
      out[id] = base
    }
  }
  const fitRaw = (raw as Record<string, unknown>).fit
  if (fitRaw && typeof fitRaw === 'object') {
    const fit: ProspectFitSignals = {}
    for (const id of FIT_SIGNALS) {
      const sig = parseSignal((fitRaw as Record<string, unknown>)[id])
      if (!sig) continue
      const base: VerificationSignal = { status: sig.status, detail: sig.detail, checkedAt: sig.checkedAt, source: sig.source }
      switch (id) {
        case 'dso':
          fit.dso = {
            ...base,
            name: typeof sig.name === 'string' ? sig.name : null,
            matchedOn: sig.matchedOn === 'practice' || sig.matchedOn === 'npi' || sig.matchedOn === 'listing' ? sig.matchedOn : null,
            priorStatus: typeof sig.priorStatus === 'string' ? sig.priorStatus : null,
          }
          break
        case 'chain':
          fit.chain = {
            ...base,
            kind: sig.kind === 'shared_host' || sig.kind === 'shared_phone' ? sig.kind : null,
            count: typeof sig.count === 'number' ? sig.count : null,
            key: typeof sig.key === 'string' ? sig.key : null,
            priorStatus: typeof sig.priorStatus === 'string' ? sig.priorStatus : null,
          }
          break
        case 'size':
          fit.size = {
            ...base,
            dentists: typeof sig.dentists === 'number' ? sig.dentists : null,
            official: sig.official === 'clinician' || sig.official === 'executive' || sig.official === 'unknown' ? sig.official : null,
          }
          break
        case 'newPractice':
          fit.newPractice = { ...base, enumeratedAt: typeof sig.enumeratedAt === 'string' ? sig.enumeratedAt : null }
          break
        case 'chainOverride':
          fit.chainOverride = base
          break
      }
    }
    if (Object.keys(fit).length > 0) out.fit = fit
  }
  return out
}

/** "Verified" means EVERY signal was checked inside the window (60 days).
 *  The sweep reads the live value from `config.hygiene.reverifyAfterDays`;
 *  this is its default and the drawer's headline window. */
export const VERIFY_STALE_DAYS = 60
/** A parked record gets another look after this many days (the default
 *  for `config.hygiene.parkedRecheckDays`). */
export const PARKED_RECHECK_DAYS = 30
/** A row with no touch for this long rests (`config.hygiene.staleAfterDays`). */
export const STALE_AFTER_DAYS = 90
/** A finished territory is re-swept after this many days. */
export const DISCOVERY_REFRESH_DAYS = 30

/** "Nov 10, 2026 · 14:05 UTC" — platform surfaces mark UTC rather than
 *  pretending to know the reader's clock. Client-safe, no tz dependency. */
export function formatUtcStamp(iso: string | Date | null | undefined): string | null {
  if (!iso) return null
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return null
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${date} · ${hh}:${mm} UTC`
}

export const INTENT_SIGNAL_LABELS: Record<ProspectIntentSignal, string> = {
  reply_interested: 'Replied — interested',
  reply_question: 'Replied — question',
  clicked: 'Clicked a link',
  opens: 'Opened repeatedly',
  demo_request: 'Requested a demo',
  grader_run: 'Ran the practice grader',
  event_met: 'Met at a conference',
}

// ── Crawl signals (prospect.enrichment jsonb) ──────────────────────────────
export interface ProspectCrawlSignals {
  ssl: boolean
  mobileViewport: boolean
  copyrightYear: number | null
  titleTag: string | null
  metaDescription: string | null
  bookingWidget: boolean
  socialLinks: { facebook?: string; instagram?: string; tiktok?: string; youtube?: string }
  /** A BUILDER_LABELS key (wix · squarespace · godaddy · weebly · prosites ·
   *  pbhs · officite · tntdental · wordpress) or null = custom / unknown. */
  builder: string | null
  /** The competitor stack (P-04): booking widgets and review engines
   *  fingerprinted by script / host / iframe on the site (STACK names).
   *  Optional — older crawls lack it; absent means "not looked", [] means
   *  "looked, none" (a phone number is their only door). */
  stack?: string[]
  pageWeightKb: number
  emails: string[] // mailto/contact-page discoveries (never guessed)
  fetchedAt: string // ISO
  error?: string
  // Brand capture (added for presenter mode — optional, older crawls lack
  // them; jsonb tolerates absence, re-enrich backfills).
  /** <meta name="theme-color"> when a valid hex — the RAW captured value
   *  (often #ffffff; usableBrandColor() decides if it's demo-worthy). */
  themeColor?: string | null
  /** Best square brand mark: apple-touch-icon > <link rel~=icon> > og:image.
   *  Absolute https URL. */
  iconUrl?: string | null
  /** og:site_name — how they brand themselves. */
  siteName?: string | null
  /** Competitor/vendor fingerprints from the site — who we'd displace (the
   *  deal room). Shape: DetectedVendor from lib/prospect-vendors.ts. Optional;
   *  older crawls lack it, re-enrich backfills. */
  vendors?: Array<{ name: string; category: string; estMonthly: number }>
}

/** The site builders the crawl fingerprints, in words (P-04). DIY builders
 *  and dental template vendors raise the opportunity score. */
export const BUILDER_LABELS: Record<string, string> = {
  wix: 'Wix',
  squarespace: 'Squarespace',
  godaddy: 'GoDaddy Website Builder',
  weebly: 'Weebly',
  wordpress: 'WordPress',
  prosites: 'ProSites',
  pbhs: 'PBHS',
  officite: 'Officite',
  tntdental: 'TNT Dental',
}
export const DIY_BUILDERS = ['wix', 'squarespace', 'godaddy', 'weebly'] as const
export const TEMPLATE_VENDOR_BUILDERS = ['prosites', 'pbhs', 'officite', 'tntdental'] as const

// ── AI verdict (prospect.ai_verdict jsonb) ─────────────────────────────────
export interface ProspectAiVerdict {
  hasWebsite: boolean
  websiteQuality: number // 0-100
  websiteReasons: string[]
  socialPresence: number // 0-100
  onlineBooking: boolean
  weaknesses: string[] // feed personalized outreach copy
  summary: string
}

// ── Outreach segments (sequence ↔ prospect matching) ───────────────────────
export const OUTREACH_SEGMENTS = ['no_website', 'weak_website', 'weak_presence'] as const
export type OutreachSegment = (typeof OUTREACH_SEGMENTS)[number]

export const SEGMENT_LABELS: Record<OutreachSegment, string> = {
  no_website: 'No website',
  weak_website: 'Weak website',
  weak_presence: 'Weak presence',
}

// ── Win/loss (the pipeline + learning loop) ────────────────────────────────
export const PROSPECT_LOSS_REASONS = [
  'price',
  'using_competitor',
  'no_need',
  'bad_timing',
  'not_decision_maker',
  'no_response',
  'replied_no',
  'unsubscribed',
  'bounced',
  'other',
] as const
export type ProspectLossReason = (typeof PROSPECT_LOSS_REASONS)[number]

export const LOSS_REASON_LABELS: Record<ProspectLossReason, string> = {
  price: 'Too expensive',
  using_competitor: 'Happy with a competitor',
  no_need: "Doesn't see the need",
  bad_timing: 'Bad timing',
  not_decision_maker: 'Not the decision maker',
  no_response: 'Went quiet / no response',
  replied_no: 'Replied — not interested',
  unsubscribed: 'Unsubscribed',
  bounced: 'Email bounced / undeliverable',
  other: 'Other',
}

/** The loss reasons a human picks when logging a call (the rest are set by the
 *  system — replied_no, unsubscribed, bounced, no_response). */
export const MANUAL_LOSS_REASONS: ProspectLossReason[] = [
  'price',
  'using_competitor',
  'no_need',
  'bad_timing',
  'not_decision_maker',
  'other',
]

export interface WinLossReport {
  windowDays: number
  won: number
  lost: number
  /** won / (won + lost), rounded %. null when no decided outcomes. */
  winRatePct: number | null
  /** Loss reasons, most common first. */
  lossReasons: Array<{ reason: ProspectLossReason; label: string; count: number }>
  /** Per-segment win/loss (segment from the prospect's latest enrollment). */
  segments: Array<{
    segment: OutreachSegment | 'unsegmented'
    label: string
    won: number
    lost: number
    winRatePct: number | null
  }>
  /** Average outreach touches sent before a win (null if no wins had touches). */
  avgTouchesToWin: number | null
}

// ── Territory & coverage (the map view) ────────────────────────────────────
export interface TerritoryRow {
  state: string
  stateName: string
  enabled: boolean
  /** Total prospects discovered in this state. */
  total: number
  enriched: number // enriched-and-beyond (scored)
  contacted: number
  callList: number
  won: number
  hot: number
  warm: number
  /** Discovery tasks still pending (grid not fully swept). */
  tasksPending: number
  imported: number
  /** enriched / total, rounded % — how much of what we found we've worked. */
  workedPct: number
  /** won / contacted, rounded % — close rate where we've engaged. null at 0. */
  convertPct: number | null
}

// ── Config (prospecting_config singleton jsonb) ────────────────────────────
export interface ProspectingConfig {
  /** Master OFF switch — ships true (system off). Nothing runs while true. */
  killSwitch: boolean
  /** Personalize + log touches but never actually send. Ships true. */
  dryRun: boolean
  /** States enabled for discovery ('GA', 'FL', …). Empty = discovery idle. */
  enabledStates: string[]
  warmup: {
    startPerDay: number
    incrementPerWeek: number
    ceilingPerDay: number
    /** ISO date sending first went live; null until real sends start. */
    startedAt: string | null
  }
  /** Prospect-local send window, 24h clock. Weekends always skipped. */
  sendWindow: { startHour: number; endHour: number }
  budgets: {
    placesPerMonth: number
    crawlsPerMonth: number
    aiPerMonth: number
    /** Line-type checks (Amazon Pinpoint PhoneNumberValidate, ~$0.006 each). */
    phoneValidatePerMonth: number
  }
  /** THE QUALITY FLOOR (P-01). The queues and the hunter serve only
   *  prospects whose quality_score reaches this; everything under it is
   *  "parked" until a re-verify or a human says otherwise. 0–100. Ships
   *  at 70 since P-04 (the fit + liveness signals exist to stand behind
   *  it); a stored config keeps whatever it had. */
  qualityFloor: number
  /** The hunter: auto-enroll enriched prospects into segment sequences.
   *  Ships OFF. Runs even in dry-run (enrollments are DB-only/reversible —
   *  sends stay dry until dryRun flips). */
  autoEnroll: {
    enabled: boolean
    bands: ProspectScoreBand[]
    perDay: number
  }
  /** Deliverability watchdog — auto-pauses LIVE sending (dryRun=true) when
   *  the trailing bounce/complaint rates breach. trippedAt/reason are set
   *  by the engine; flipping dry-run off clears them. */
  watchdog: {
    enabled: boolean
    windowHours: number
    /** Sample floor — never trip below this many live sends in-window. */
    minSends: number
    maxBouncePct: number
    maxComplaintPct: number
    trippedAt: string | null
    reason: string | null
  }
  /** The daily hunt digest email to platform owner/admins. */
  digest: { enabled: boolean }
  /** Self-booking demos — an interested prospect picks a time from the
   *  owner's availability. Ships OFF (booking a demo emails the owner). Slots
   *  are generated in hostTimeZone weekday business hours and shown to the
   *  prospect in their own timezone. */
  booking: {
    enabled: boolean
    hostTimeZone: string
    durationMin: number
    /** How many days out the calendar offers. */
    days: number
    startHour: number
    endHour: number
    slotMinutes: number
    /** Minimum lead time before the earliest offered slot. */
    leadHours: number
  }
  /** The editable "brain": an owner override of the canonical product
   *  knowledge (empty = use the built-in default) + per-competitor battle
   *  cards, both fed into every prospecting AI surface. */
  brain: {
    /** Full product-knowledge override; '' falls back to PRODUCT_KNOWLEDGE. */
    productOverride: string
    battleCards: Array<{ competitor: string; angle: string }>
  }
  /** Focus mode — an operator lens on one state. Doesn't change the send
   *  engine (that stays global); it pins the territory + prospect list to the
   *  chosen state so the owner can concentrate. null = no focus. */
  focus: { state: string | null }
  /** HYGIENE (P-03) — the list keeps itself clean. A row with no human or
   *  outreach touch for `staleAfterDays` rests; a verified row older than
   *  `reverifyAfterDays` (parked: `parkedRecheckDays`) is re-verified; a
   *  finished territory older than `discoveryRefreshDays` is re-swept. */
  hygiene: {
    staleAfterDays: number
    reverifyAfterDays: number
    parkedRecheckDays: number
    discoveryRefreshDays: number
  }
}

export const PROSPECTING_DEFAULTS: ProspectingConfig = {
  killSwitch: true,
  dryRun: true,
  enabledStates: [],
  warmup: { startPerDay: 20, incrementPerWeek: 10, ceilingPerDay: 150, startedAt: null },
  sendWindow: { startHour: 8, endHour: 17 },
  budgets: { placesPerMonth: 2000, crawlsPerMonth: 3000, aiPerMonth: 3000, phoneValidatePerMonth: 1500 },
  qualityFloor: 70,
  autoEnroll: { enabled: false, bands: ['hot', 'warm'], perDay: 50 },
  watchdog: {
    enabled: true,
    windowHours: 72,
    minSends: 20,
    maxBouncePct: 5,
    maxComplaintPct: 0.3,
    trippedAt: null,
    reason: null,
  },
  digest: { enabled: true },
  booking: {
    enabled: false,
    hostTimeZone: 'America/New_York',
    durationMin: 30,
    days: 10,
    startHour: 9,
    endHour: 17,
    slotMinutes: 30,
    leadHours: 12,
  },
  brain: { productOverride: '', battleCards: [] },
  focus: { state: null },
  hygiene: {
    staleAfterDays: STALE_AFTER_DAYS,
    reverifyAfterDays: VERIFY_STALE_DAYS,
    parkedRecheckDays: PARKED_RECHECK_DAYS,
    discoveryRefreshDays: DISCOVERY_REFRESH_DAYS,
  },
}

/**
 * Merge a stored config blob over defaults (junk-tolerant) so new knobs
 * never need a backfill — the resolvePortalSettings pattern.
 */
export function resolveProspectingConfig(raw: unknown): ProspectingConfig {
  const d = PROSPECTING_DEFAULTS
  if (!raw || typeof raw !== 'object') {
    return {
      ...d,
      warmup: { ...d.warmup },
      sendWindow: { ...d.sendWindow },
      budgets: { ...d.budgets },
      autoEnroll: { ...d.autoEnroll, bands: [...d.autoEnroll.bands] },
      watchdog: { ...d.watchdog },
      digest: { ...d.digest },
      booking: { ...d.booking },
      brain: { productOverride: '', battleCards: [] },
      focus: { state: null },
      hygiene: { ...d.hygiene },
    }
  }
  const r = raw as Record<string, unknown>
  const warmup = (r.warmup ?? {}) as Record<string, unknown>
  const win = (r.sendWindow ?? {}) as Record<string, unknown>
  const budgets = (r.budgets ?? {}) as Record<string, unknown>
  const auto = (r.autoEnroll ?? {}) as Record<string, unknown>
  const dog = (r.watchdog ?? {}) as Record<string, unknown>
  const digest = (r.digest ?? {}) as Record<string, unknown>
  const booking = (r.booking ?? {}) as Record<string, unknown>
  const brain = (r.brain ?? {}) as Record<string, unknown>
  const focus = (r.focus ?? {}) as Record<string, unknown>
  const hygiene = (r.hygiene ?? {}) as Record<string, unknown>
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback
  // Percentages keep fractions (0.3% complaint threshold) — num() would
  // round them into uselessness.
  const pct = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  const bands = Array.isArray(auto.bands)
    ? auto.bands.filter((b): b is ProspectScoreBand =>
        (['hot', 'warm', 'cool', 'low'] as const).includes(b as ProspectScoreBand),
      )
    : d.autoEnroll.bands
  return {
    killSwitch: bool(r.killSwitch, d.killSwitch),
    dryRun: bool(r.dryRun, d.dryRun),
    enabledStates: Array.isArray(r.enabledStates)
      ? r.enabledStates.filter((s): s is string => typeof s === 'string' && /^[A-Z]{2}$/.test(s))
      : d.enabledStates,
    warmup: {
      startPerDay: num(warmup.startPerDay, d.warmup.startPerDay),
      incrementPerWeek: num(warmup.incrementPerWeek, d.warmup.incrementPerWeek),
      ceilingPerDay: num(warmup.ceilingPerDay, d.warmup.ceilingPerDay),
      startedAt: typeof warmup.startedAt === 'string' ? warmup.startedAt : null,
    },
    sendWindow: {
      startHour: Math.min(23, num(win.startHour, d.sendWindow.startHour)),
      endHour: Math.min(24, num(win.endHour, d.sendWindow.endHour)),
    },
    budgets: {
      placesPerMonth: num(budgets.placesPerMonth, d.budgets.placesPerMonth),
      crawlsPerMonth: num(budgets.crawlsPerMonth, d.budgets.crawlsPerMonth),
      aiPerMonth: num(budgets.aiPerMonth, d.budgets.aiPerMonth),
      phoneValidatePerMonth: num(budgets.phoneValidatePerMonth, d.budgets.phoneValidatePerMonth),
    },
    qualityFloor: Math.min(100, num(r.qualityFloor, d.qualityFloor)),
    autoEnroll: {
      enabled: bool(auto.enabled, d.autoEnroll.enabled),
      bands: bands.length > 0 ? bands : [...d.autoEnroll.bands],
      perDay: num(auto.perDay, d.autoEnroll.perDay),
    },
    watchdog: {
      enabled: bool(dog.enabled, d.watchdog.enabled),
      windowHours: num(dog.windowHours, d.watchdog.windowHours),
      minSends: num(dog.minSends, d.watchdog.minSends),
      maxBouncePct: pct(dog.maxBouncePct, d.watchdog.maxBouncePct),
      maxComplaintPct: pct(dog.maxComplaintPct, d.watchdog.maxComplaintPct),
      trippedAt: typeof dog.trippedAt === 'string' ? dog.trippedAt : null,
      reason: typeof dog.reason === 'string' ? dog.reason : null,
    },
    digest: { enabled: bool(digest.enabled, d.digest.enabled) },
    booking: {
      enabled: bool(booking.enabled, d.booking.enabled),
      hostTimeZone: typeof booking.hostTimeZone === 'string' ? booking.hostTimeZone : d.booking.hostTimeZone,
      durationMin: num(booking.durationMin, d.booking.durationMin),
      days: Math.min(60, num(booking.days, d.booking.days)),
      startHour: Math.min(23, num(booking.startHour, d.booking.startHour)),
      endHour: Math.min(24, num(booking.endHour, d.booking.endHour)),
      slotMinutes: Math.max(5, num(booking.slotMinutes, d.booking.slotMinutes)),
      leadHours: num(booking.leadHours, d.booking.leadHours),
    },
    brain: {
      productOverride:
        typeof brain.productOverride === 'string' ? brain.productOverride.slice(0, 12000) : '',
      battleCards: Array.isArray(brain.battleCards)
        ? brain.battleCards
            .filter(
              (c): c is { competitor: string; angle: string } =>
                !!c &&
                typeof c === 'object' &&
                typeof (c as Record<string, unknown>).competitor === 'string' &&
                typeof (c as Record<string, unknown>).angle === 'string',
            )
            .map((c) => ({ competitor: c.competitor.slice(0, 80), angle: c.angle.slice(0, 600) }))
            .filter((c) => c.competitor.trim().length > 0 && c.angle.trim().length > 0)
            .slice(0, 20)
        : [],
    },
    focus: {
      state:
        typeof focus.state === 'string' && /^[A-Z]{2}$/.test(focus.state) ? focus.state : null,
    },
    hygiene: {
      // A zero would rest or re-verify everything every tick; the floors
      // keep the knobs honest (and the ceilings keep them from meaning "never").
      staleAfterDays: Math.max(7, Math.min(730, num(hygiene.staleAfterDays, d.hygiene.staleAfterDays))),
      reverifyAfterDays: Math.max(7, Math.min(365, num(hygiene.reverifyAfterDays, d.hygiene.reverifyAfterDays))),
      parkedRecheckDays: Math.max(7, Math.min(365, num(hygiene.parkedRecheckDays, d.hygiene.parkedRecheckDays))),
      discoveryRefreshDays: Math.max(7, Math.min(365, num(hygiene.discoveryRefreshDays, d.hygiene.discoveryRefreshDays))),
    },
  }
}

// ── List/table row shapes (service → UI) ───────────────────────────────────
export interface ProspectListRow {
  id: string
  name: string
  city: string | null
  state: string | null
  phone: string | null
  email: string | null
  websiteUrl: string | null
  googleRatingTenths: number | null
  reviewCount: number | null
  status: ProspectStatus
  scoreBand: ProspectScoreBand | null
  opportunityScore: number | null
  intentSignal: ProspectIntentSignal | null
  intentAt: Date | null
  authorizedOfficialName: string | null
  createdAt: Date
  // Verification + quality (P-01)
  qualityScore: number | null
  qualityBand: ProspectQualityBand | null
  qualityReasons: string[]
  phoneStatus: ProspectPhoneStatus | null
  phoneLineType: ProspectPhoneLineType | null
  verifiedAt: Date | null
  /** The cold caller working it right now (P-02), else null. */
  assignedCallerId: string | null
  // Hygiene (P-03): a merged row says where it went (the table's door).
  mergedIntoProspectId: string | null
  mergedIntoName: string | null
  /** Why a row was set aside (retired · closed · chain · …) — the table's
   *  "Chain" pill (P-04). */
  suppressedReason: string | null
}

/** The hunt panel's hygiene tile (P-03): what the sweep did today, how many
 *  rows are resting, and the last territory it re-swept (UTC stamped).
 *  P-04 adds the chains set aside and a territory whose refresh the callers
 *  pulled forward. */
export interface ProspectHygieneStats {
  mergedToday: number
  resting: number
  lastRefresh: { state: string; zipPrefix: string; at: Date } | null
  /** Rows set aside as a chain / DSO (status disqualified, reason chain). */
  chainsRemoved: number
  /** The territory whose refresh was pulled forward and has not run yet:
   *  "Refreshing TX 787 early — 3 closed practices this month". */
  earlyRefresh: { state: string; zipPrefix: string; reason: string; at: Date } | null
}

/** What a stale drawer or card hears when its row was merged meanwhile
 *  (P-03): the number, the verify, the re-enrich all belong to the survivor. */
export const MERGED_ROW_WORDS = 'This record was merged into another — open the row that kept its history and work from there.'

/** Why a merge was refused, in the reader's words — the drawer never shows
 *  a reason code (P-03 fix pass). Keys mirror MergeRefusalReason. */
export const MERGE_REFUSAL_WORDS: Record<string, string> = {
  not_found: 'One of these records is gone — refresh and look again.',
  same_row: 'These are already one record.',
  already_merged: 'One of these was merged a moment ago — open its survivor and try from there.',
  loser_converted: 'A practice that became a clinic is always the record that stays — merge the other way round.',
  loser_terminal: 'That record said no, is gone, or asked never to be contacted; it stays its own record beside a clinic.',
  both_converted: 'Both of these are clinics already — two customers never merge.',
}

/** A possible duplicate of the row on the drawer (P-03) — found by the
 *  matcher's keys, offered to a human; the sweep merges only exact ones. */
export interface DuplicateCandidate {
  id: string
  name: string
  city: string | null
  state: string | null
  status: ProspectStatus
  qualityScore: number | null
  /** Plain words: "same phone", "same Google listing", "same name and ZIP". */
  reasons: string[]
  /** True when the sweep would merge these on its own (same listing, or same
   *  phone AND same name); the drawer still asks first. */
  exact: boolean
}

/** Live-pool quality counts for the hunt tiles, the table chips and the
 *  floor slider. `unverified` = enriched but never verified (the sweep is
 *  still getting to them). `scoreBuckets[i]` counts the live prospects a
 *  floor COULD serve (never a parked band, never a hard zero — the floor
 *  predicate's own legs) whose quality_score sits in [5i, 5i+5) (the last
 *  bucket holds 100); the parked rows are `parked`, never in a bucket. */
export interface ProspectQualityCounts {
  best: number
  good: number
  weak: number
  parked: number
  unverified: number
  /** Best-band prospects that are actually dialable right now. */
  bestInQueue: number
  scoreBuckets: number[]
}

/** How many verified prospects sit at or above / below a floor, from the
 *  bucket histogram (client-side, so the slider reads live). */
export function splitAtFloor(buckets: number[], floor: number): { above: number; below: number } {
  let above = 0
  let below = 0
  buckets.forEach((n, i) => {
    const bucketStart = i * 5
    if (bucketStart >= floor) above += n
    else below += n
  })
  return { above, below }
}

export interface ProspectFunnelStats {
  discovered: number
  enriched: number
  contacted: number
  engaged: number
  callList: number
  converted: number
  /** Hygiene (P-03) — off the funnel, counted for the table's filters. */
  dormant: number
  merged: number
  /** Chains / DSOs set aside (P-04) — hidden by default, one chip away. */
  chains: number
}

export interface ProspectFilters {
  state?: string
  status?: ProspectStatus
  scoreBand?: ProspectScoreBand
  qualityBand?: ProspectQualityBand
  hasWebsite?: boolean
  search?: string
  /** Only the rows set aside as a chain (P-04). */
  chain?: boolean
}

/** "(404) 555-1212" from 10 bare digits; anything else echoes as-is. */
export function formatProspectPhone(digits: string | null | undefined): string | null {
  if (!digits) return null
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits
}

/** "4.7★ (212)" display helper; null-safe. */
export function ratingLabel(tenths: number | null, count: number | null): string | null {
  if (tenths == null) return null
  const stars = (tenths / 10).toFixed(1)
  return count != null ? `${stars}★ (${count})` : `${stars}★`
}
