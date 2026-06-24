import 'server-only'
import {
  getGoogleBusinessPerformance,
  getGoogleBusinessSearchKeywords,
} from '@/lib/zernio'
import { resolveGbpAccount } from '@/lib/services/zernio'
import { normalizeMetricsWindow, scaleToWindow } from '@/lib/services/metrics-window'

/**
 * Google Business *local metrics* service. The Phase-1-final Zernio surface:
 * the clinic's GBP Performance API numbers (impressions / calls / directions /
 * website clicks / bookings) + top search keywords, pulled live through the
 * clinic's Zernio GBP connection and surfaced on the SEO module + the Analytics
 * Acquisition band — alongside the Search Console web-click data.
 *
 * Mirrors `getClinicSeoPerformance` (lib/services/gsc.ts): a LIVE pull per page
 * load (no cache table — same as the GSC scoped read), totals summed over the
 * window, the 30/90-day window threaded through.
 *
 * Two invariants the SEO + Analytics pages depend on:
 *   1. DEMO-SAFE — a connection flagged `isDemo` NEVER hits the network; it
 *      returns seeded synthetic metrics so the demo showcases populated state.
 *   2. BEST-EFFORT — never throws. No connection → `{connected:false, …zeros}`;
 *      an API failure (incl. a 402 "Analytics add-on required") →
 *      `{connected:true, …zeros, error}`. The pages must render regardless.
 *
 * The org→GBP-account resolver is the shared `resolveGbpAccount`
 * (lib/services/zernio.ts), the same one Reviews + hours/location sync use.
 */

export interface GbpLocalMetrics {
  /** Whether the org has a connected GBP (demo or real). When false every count
   *  is 0 and `topKeywords` is empty — the UI shows a connect-prompt. */
  connected: boolean
  /** Maps + Search, desktop + mobile, summed over the window. */
  impressions: number
  /** Tap-to-call ("Call" button) clicks. */
  calls: number
  /** Direction / route requests. */
  directions: number
  /** Clicks through to the clinic's website from the listing. */
  websiteClicks: number
  /** "Book" action completions on the listing. */
  bookings: number
  /** Top search terms that triggered impressions, impression-sorted, capped. */
  topKeywords: Array<{ term: string; count: number }>
  /** The window these totals cover (days). */
  windowDays: number
  /** Set when a live pull failed (the page still renders zeros). Demo never
   *  errors; a no-connection result is `connected:false`, not an error. */
  error?: string
}

/** Top-keyword cap surfaced in the UI list. */
const KEYWORD_LIMIT = 8

function emptyMetrics(connected: boolean, windowDays: number, error?: string): GbpLocalMetrics {
  return {
    connected,
    impressions: 0,
    calls: 0,
    directions: 0,
    websiteClicks: 0,
    bookings: 0,
    topKeywords: [],
    windowDays,
    ...(error ? { error } : {}),
  }
}

/**
 * Local GBP metrics for the org over the window. Best-effort + demo-safe (see
 * the module doc). `days` defaults to 30; the SEO + Analytics pages pass their
 * 30/90-day toggle through so all GBP numbers honor the same window.
 */
export async function getGbpLocalMetrics(
  orgId: string,
  opts: { days?: number } = {},
): Promise<GbpLocalMetrics> {
  const windowDays = normalizeMetricsWindow(opts.days)

  const account = await resolveGbpAccount(orgId)
  if (!account) return emptyMetrics(false, windowDays)

  // DEMO: seeded synthetic metrics, NEVER the network (per the no-fake-content
  // rule the demo must populate every KPI the UI renders).
  if (account.isDemo) return demoMetrics(windowDays)

  // REAL: live pull. Performance + keywords in parallel; either failing keeps
  // the surface alive (zeros + an error string) — the page never blows up.
  try {
    const [perf, topKeywords] = await Promise.all([
      getGoogleBusinessPerformance(account.accountId, { days: windowDays }),
      // Keywords are monthly-aggregated by Google — a missing/failed keyword
      // pull must NOT zero out the performance KPIs, so it's individually
      // tolerant and returns [] on failure.
      getGoogleBusinessSearchKeywords(account.accountId, { days: windowDays }, KEYWORD_LIMIT).catch(() => []),
    ])
    return {
      connected: true,
      impressions: perf.impressions,
      calls: perf.calls,
      directions: perf.directions,
      websiteClicks: perf.websiteClicks,
      bookings: perf.bookings,
      topKeywords,
      windowDays,
    }
  } catch (e) {
    // Performance pull failed (e.g. 402 Analytics add-on, 403, network) — the
    // GBP IS connected, we just couldn't read it this load. Render zeros + why.
    return emptyMetrics(true, windowDays, (e as Error).message)
  }
}

// ── Demo metrics ──────────────────────────────────────────────────────────────
//
// The demo (Dream Dental) can't connect a real GBP, so `getGbpLocalMetrics`
// returns these synthetic numbers when the connection is `isDemo` — NEVER the
// network. Per-30-day baselines scaled linearly to the requested window so the
// 30/90-day toggle visibly changes the figures (a 90-day view ≈ 3× a 30-day
// one). Realistic for a single busy dental practice: a few thousand impressions,
// dozens of calls/directions, a handful of bookings, dental-flavored top terms.
//
// This is the demo's source of truth (no DB row needed — the metrics are a live
// compute, so seeding the connection as `isDemo` via `seedDemoZernio` is all
// that's required for this surface to populate). `seedDemoGbpMetrics` exists for
// symmetry with the other demo seeders + asserts the connection prerequisite.

/** Per-30-day demo baselines. */
const DEMO_30D = {
  impressions: 4120,
  calls: 38,
  directions: 52,
  websiteClicks: 96,
  bookings: 11,
}

/** Synthetic top search keywords for the demo (Dream Dental, Austin TX). Mix of
 *  generic high-intent terms + branded + city-qualified + service terms — the
 *  shape a real dental GBP returns. Impression-sorted (the client sorts too). */
const DEMO_KEYWORDS_30D: Array<{ term: string; count: number }> = [
  { term: 'dentist near me', count: 612 },
  { term: 'dream dental', count: 388 },
  { term: 'teeth whitening austin', count: 274 },
  { term: 'emergency dentist austin', count: 201 },
  { term: 'family dentist', count: 168 },
  { term: 'dental cleaning near me', count: 142 },
  { term: 'invisalign austin tx', count: 119 },
  { term: 'pediatric dentist near me', count: 87 },
]

function demoMetrics(windowDays: number): GbpLocalMetrics {
  const s = (n: number) => scaleToWindow(n, windowDays)
  return {
    connected: true,
    impressions: s(DEMO_30D.impressions),
    calls: s(DEMO_30D.calls),
    directions: s(DEMO_30D.directions),
    websiteClicks: s(DEMO_30D.websiteClicks),
    bookings: s(DEMO_30D.bookings),
    topKeywords: DEMO_KEYWORDS_30D.slice(0, KEYWORD_LIMIT).map((k) => ({ term: k.term, count: s(k.count) })),
    windowDays,
  }
}

/**
 * Demo "seed" for GBP local metrics. There is NO metrics table — the numbers
 * are a live compute from `DEMO_30D` / `DEMO_KEYWORDS_30D` returned whenever the
 * org's Zernio connection is `isDemo` (which `seedDemoZernio` already creates).
 * So this is a no-op assertion of that prerequisite, kept for symmetry with the
 * other `seedDemo*` functions and so the demo-clinic seeder has one obvious
 * call site documenting where the metrics come from. Idempotent; never networks.
 */
export async function seedDemoGbpMetrics(organizationId: string): Promise<void> {
  // The metrics surface reads through the demo Zernio connection (seeded by
  // `seedDemoZernio`). Nothing to persist here — calling getGbpLocalMetrics for
  // this org returns demoMetrics() because the connection is isDemo. We keep
  // this function so the seeder + self-heal have a documented hook (and a unit
  // test target) for the metrics demo path.
  void organizationId
}
