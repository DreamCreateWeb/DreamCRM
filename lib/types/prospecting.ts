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
}

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

// ── Verification (prospect.verification jsonb) ─────────────────────────────
export const VERIFICATION_SIGNALS = ['places', 'business', 'npi', 'website', 'phone', 'reach'] as const
export type VerificationSignalId = (typeof VERIFICATION_SIGNALS)[number]

export const VERIFICATION_SIGNAL_LABELS: Record<VerificationSignalId, string> = {
  places: 'Google listing',
  business: 'Open for business',
  npi: 'NPI registry',
  website: 'Website',
  phone: 'Phone',
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

export type ProspectVerification = Partial<Record<VerificationSignalId, VerificationSignal>>

/** Junk-tolerant read of the jsonb column. */
export function parseVerification(raw: unknown): ProspectVerification {
  if (!raw || typeof raw !== 'object') return {}
  const out: ProspectVerification = {}
  for (const id of VERIFICATION_SIGNALS) {
    const v = (raw as Record<string, unknown>)[id]
    if (!v || typeof v !== 'object') continue
    const r = v as Record<string, unknown>
    if (typeof r.status !== 'string' || typeof r.checkedAt !== 'string') continue
    out[id] = {
      status: r.status,
      detail: typeof r.detail === 'string' ? r.detail : null,
      checkedAt: r.checkedAt,
      source: typeof r.source === 'string' ? r.source : 'unknown',
    }
  }
  return out
}

/** "Verified" means EVERY signal was checked inside the window (60 days). */
export const VERIFY_STALE_DAYS = 60
/** A parked record gets another look after this many days. */
export const PARKED_RECHECK_DAYS = 30

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
  builder: string | null // 'wix'|'squarespace'|'godaddy'|'wordpress'|null
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
   *  "parked" until a re-verify or a human says otherwise. 0–100. */
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
}

export const PROSPECTING_DEFAULTS: ProspectingConfig = {
  killSwitch: true,
  dryRun: true,
  enabledStates: [],
  warmup: { startPerDay: 20, incrementPerWeek: 10, ceilingPerDay: 150, startedAt: null },
  sendWindow: { startHour: 8, endHour: 17 },
  budgets: { placesPerMonth: 2000, crawlsPerMonth: 3000, aiPerMonth: 3000, phoneValidatePerMonth: 1500 },
  qualityFloor: 60,
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
}

export interface ProspectFilters {
  state?: string
  status?: ProspectStatus
  scoreBand?: ProspectScoreBand
  qualityBand?: ProspectQualityBand
  hasWebsite?: boolean
  search?: string
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
