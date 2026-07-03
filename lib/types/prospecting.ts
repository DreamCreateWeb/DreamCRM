// Client-safe prospecting types, labels, and the config resolver — no
// server-only deps so table/drawer/settings components can import them.
// DB functions live in lib/services/prospecting.ts.

import type {
  ProspectStatus,
  ProspectScoreBand,
  ProspectIntentSignal,
} from '@/lib/db/schema/prospecting'

export type { ProspectStatus, ProspectScoreBand, ProspectIntentSignal }

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

export const INTENT_SIGNAL_LABELS: Record<ProspectIntentSignal, string> = {
  reply_interested: 'Replied — interested',
  reply_question: 'Replied — question',
  clicked: 'Clicked a link',
  opens: 'Opened repeatedly',
  demo_request: 'Requested a demo',
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
  }
}

export const PROSPECTING_DEFAULTS: ProspectingConfig = {
  killSwitch: true,
  dryRun: true,
  enabledStates: [],
  warmup: { startPerDay: 20, incrementPerWeek: 10, ceilingPerDay: 150, startedAt: null },
  sendWindow: { startHour: 8, endHour: 17 },
  budgets: { placesPerMonth: 2000, crawlsPerMonth: 3000, aiPerMonth: 3000 },
}

/**
 * Merge a stored config blob over defaults (junk-tolerant) so new knobs
 * never need a backfill — the resolvePortalSettings pattern.
 */
export function resolveProspectingConfig(raw: unknown): ProspectingConfig {
  const d = PROSPECTING_DEFAULTS
  if (!raw || typeof raw !== 'object') return { ...d, warmup: { ...d.warmup }, sendWindow: { ...d.sendWindow }, budgets: { ...d.budgets } }
  const r = raw as Record<string, unknown>
  const warmup = (r.warmup ?? {}) as Record<string, unknown>
  const win = (r.sendWindow ?? {}) as Record<string, unknown>
  const budgets = (r.budgets ?? {}) as Record<string, unknown>
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback
  return {
    killSwitch: typeof r.killSwitch === 'boolean' ? r.killSwitch : d.killSwitch,
    dryRun: typeof r.dryRun === 'boolean' ? r.dryRun : d.dryRun,
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
  hasWebsite?: boolean
  search?: string
}

/** "4.7★ (212)" display helper; null-safe. */
export function ratingLabel(tenths: number | null, count: number | null): string | null {
  if (tenths == null) return null
  const stars = (tenths / 10).toFixed(1)
  return count != null ? `${stars}★ (${count})` : `${stars}★`
}
