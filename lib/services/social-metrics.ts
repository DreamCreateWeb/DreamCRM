import 'server-only'
import { getSocialPlatformAnalytics, socialAnalyticsSupported } from '@/lib/zernio'
import { getZernioConnection } from '@/lib/services/zernio'
import {
  SOCIAL_CHANNEL_SHORTLIST,
  platformLabel,
  platformIcon,
  type SocialChannelPlatform,
} from '@/lib/types/zernio'
import { normalizeMetricsWindow, scaleToWindow } from '@/lib/services/metrics-window'

/**
 * Per-platform social analytics service (Phase 3 PR 4 — the FINAL Zernio
 * surface). Pulls each connected social account's insights (followers / reach /
 * impressions / engagement / profile-views / posts) through the Zernio
 * connection and surfaces them on the Analytics page's "Social performance" band
 * + a compact summary on /social-posts.
 *
 * Mirrors `getGbpLocalMetrics` (lib/services/gbp-metrics.ts) EXACTLY in
 * discipline — a live pull per page load (no cache table, same as GSC + GBP),
 * with the same two hard invariants:
 *   1. DEMO-SAFE — a connection flagged `isDemo` NEVER hits the network; it
 *      returns seeded synthetic per-platform numbers so the demo showcases the
 *      band populated.
 *   2. BEST-EFFORT — never throws. No connected socials → `{ connected:false,
 *      platforms:[] }`; an API failure on a platform → that platform reads zeros
 *      + an `error` string (the others still render). The page renders regardless.
 *
 * Only the shortlisted social platforms (IG / FB / TikTok / YouTube / LinkedIn)
 * are surfaced; Google Business has its own metrics surface (gbp-metrics.ts).
 */

/** One connected platform's normalized analytics, for the UI tiles. */
export interface SocialPlatformMetrics {
  platform: SocialChannelPlatform | string
  /** Human label ("Instagram") + emoji icon — so the UI doesn't re-resolve. */
  label: string
  icon: string
  /** The connected account handle (username/display name), for the tile header. */
  handle: string | null
  followers: number
  reach: number
  impressions: number
  engagement: number
  profileViews: number
  posts: number
  /** Set when this platform's live pull failed (its figures read 0). Demo never
   *  errors. */
  error?: string
}

export interface SocialMetrics {
  /** True when ≥1 shortlisted social platform is connected (demo or real). When
   *  false, `platforms` is empty and the UI shows a connect-prompt. */
  connected: boolean
  /** Whether the org's Zernio connection is the demo (no-network) one. */
  isDemo: boolean
  /** Per connected social platform, one tile of normalized metrics. */
  platforms: SocialPlatformMetrics[]
  /** The window these totals cover (days). */
  windowDays: number
}

/**
 * Per-platform social metrics for the org over the window. Best-effort +
 * demo-safe (see the module doc). `days` defaults to 30; the Analytics page
 * passes its 30/90-day toggle through so the social band honors the same window
 * as the rest of the page.
 */
export async function getSocialMetrics(
  orgId: string,
  opts: { days?: number } = {},
): Promise<SocialMetrics> {
  const windowDays = normalizeMetricsWindow(opts.days)

  const conn = await getZernioConnection(orgId)
  // Connected social accounts limited to the shortlist (the only ones we surface
  // + the only ones with an analytics endpoint). GBP is excluded — it has its
  // own metrics surface.
  const socialAccounts = conn.accounts.filter(
    (a) => (SOCIAL_CHANNEL_SHORTLIST as readonly string[]).includes(a.platform) && socialAnalyticsSupported(a.platform),
  )

  if (socialAccounts.length === 0) {
    return { connected: false, isDemo: conn.isDemo, platforms: [], windowDays }
  }

  // DEMO: seeded synthetic per-platform numbers, NEVER the network (per the
  // no-fake-content rule the demo must populate every tile the UI renders).
  if (conn.isDemo) {
    return {
      connected: true,
      isDemo: true,
      platforms: socialAccounts.map((a) =>
        demoPlatformMetrics(a.platform, a.username ?? a.displayName ?? null, windowDays),
      ),
      windowDays,
    }
  }

  // REAL: pull every connected social platform in parallel. Each is individually
  // tolerant — one platform's failure (e.g. a 402 Analytics add-on) records its
  // own error + zeros and never zeros the others.
  const platforms = await Promise.all(
    socialAccounts.map(async (a): Promise<SocialPlatformMetrics> => {
      const handle = a.username ?? a.displayName ?? null
      try {
        const m = await getSocialPlatformAnalytics(a.platform, a.id, { days: windowDays })
        return {
          platform: a.platform,
          label: platformLabel(a.platform),
          icon: platformIcon(a.platform),
          handle,
          followers: m.followers,
          reach: m.reach,
          impressions: m.impressions,
          engagement: m.engagement,
          profileViews: m.profileViews,
          posts: m.posts,
        }
      } catch (e) {
        return {
          platform: a.platform,
          label: platformLabel(a.platform),
          icon: platformIcon(a.platform),
          handle,
          followers: 0,
          reach: 0,
          impressions: 0,
          engagement: 0,
          profileViews: 0,
          posts: 0,
          error: (e as Error).message,
        }
      }
    }),
  )

  return { connected: true, isDemo: false, platforms, windowDays }
}

// ── Demo metrics ──────────────────────────────────────────────────────────────
//
// The demo (Dream Dental) can't connect a real social account, so `getSocialMetrics`
// returns these synthetic numbers when the connection is `isDemo` — NEVER the
// network. Followers are a fixed point-in-time figure per platform; reach /
// impressions / engagement / profile-views / posts are per-30-day baselines
// scaled linearly to the requested window so the 30/90 toggle visibly changes
// the figures. Realistic for a single dental practice's modest social presence.
//
// seedDemoZernio seeds connected Instagram + Facebook accounts (from PR 2), so
// those are the platforms this returns for the demo — no DB row to persist (the
// metrics are a live compute), mirroring gbp-metrics.ts's demo model.

/** Per-platform per-30-day demo baselines + a fixed follower count. */
const DEMO_SOCIAL_30D: Record<string, { followers: number; reach: number; impressions: number; engagement: number; profileViews: number; posts: number }> = {
  instagram: { followers: 1840, reach: 6200, impressions: 9800, engagement: 540, profileViews: 410, posts: 12 },
  facebook: { followers: 2310, reach: 4900, impressions: 7400, engagement: 380, profileViews: 260, posts: 9 },
  tiktok: { followers: 920, reach: 11200, impressions: 15800, engagement: 720, profileViews: 300, posts: 8 },
  youtube: { followers: 540, reach: 3100, impressions: 4200, engagement: 190, profileViews: 220, posts: 3 },
  linkedin: { followers: 410, reach: 1700, impressions: 2300, engagement: 95, profileViews: 140, posts: 5 },
}

/** Fallback baseline for any shortlisted platform without an explicit demo row. */
const DEMO_SOCIAL_FALLBACK = { followers: 600, reach: 2500, impressions: 3800, engagement: 160, profileViews: 180, posts: 6 }

function demoPlatformMetrics(platform: string, handle: string | null, windowDays: number): SocialPlatformMetrics {
  const base = DEMO_SOCIAL_30D[platform] ?? DEMO_SOCIAL_FALLBACK
  const s = (n: number) => scaleToWindow(n, windowDays)
  return {
    platform,
    label: platformLabel(platform),
    icon: platformIcon(platform),
    handle,
    // Followers is a point-in-time count — NOT scaled by the window.
    followers: base.followers,
    reach: s(base.reach),
    impressions: s(base.impressions),
    engagement: s(base.engagement),
    profileViews: s(base.profileViews),
    posts: s(base.posts),
  }
}

/**
 * Demo "seed" for social metrics. There is NO metrics table — the numbers are a
 * live compute from `DEMO_SOCIAL_30D` returned whenever the org's Zernio
 * connection is `isDemo` (which `seedDemoZernio` creates, along with the
 * connected IG + FB accounts). So this is a no-op assertion of that prerequisite,
 * kept for symmetry with the other `seedDemo*` functions (and as a documented
 * call site in the seeder + a unit-test target). Idempotent; never networks.
 */
export async function seedDemoSocialMetrics(organizationId: string): Promise<void> {
  void organizationId
}
