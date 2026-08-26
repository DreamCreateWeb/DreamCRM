import 'server-only'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { marketingPageview } from '@/lib/db/schema/domain'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import {
  MARKETING_CHANNELS,
  buildAttributionTouch,
  parseSignupAttribution,
  type MarketingChannel,
} from '@/lib/marketing-attribution'
import { hasPaidSubscription, resolveTrialState } from '@/lib/trial'

/**
 * The acquisition sensor's server side (docs/marketing-engine.md, slice 1):
 * the www pageview recorder behind the marketing beacon, and the funnel read
 * (visits → signups → trialing → paying, per channel) behind the platform
 * Acquisition panel. Everything here is PLATFORM-facing — no clinic tenant
 * ever reads these numbers.
 */

/** Mirror of the clinic rollup's path cap (lib/services/site-analytics.ts). */
const PATH_MAX_LEN = 256

/** UTC calendar-day key, same bucketing as the clinic rollup. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Record one marketing-site pageview into the (day, path, channel) rollup.
 * The channel is classified HERE, server-side, from what the beacon saw —
 * the beacon only reports raw facts (path, query, referrer), so a client
 * can't invent a channel the registry doesn't know. Best-effort at the
 * route; this throws only on a genuinely broken DB.
 */
export async function recordMarketingView(
  input: { path: string | null | undefined; search: string | null | undefined; referrer: string | null | undefined; selfHost?: string | null },
  now: Date = new Date(),
): Promise<void> {
  const touch = buildAttributionTouch({ ...input, now })
  const day = dayKey(now)
  const path = touch.landing.slice(0, PATH_MAX_LEN)
  await db
    .insert(marketingPageview)
    .values({ day, path, channel: touch.channel, views: 1 })
    .onConflictDoUpdate({
      target: [marketingPageview.day, marketingPageview.path, marketingPageview.channel],
      set: { views: sql`${marketingPageview.views} + 1`, updatedAt: new Date() },
    })
}

export interface ChannelFunnelRow {
  channel: MarketingChannel
  /** www pageviews attributed to this channel in the window. */
  visits: number
  /** Clinics created in the window whose first touch was this channel. */
  signups: number
  /** …of which currently on a live trial. */
  trialing: number
  /** …of which trial-expired and unconverted (the leak to watch). */
  expired: number
  /** …of which paying (a real Stripe subscription with access). */
  paying: number
}

export interface AcquisitionReport {
  windowDays: number
  totalVisits: number
  totalSignups: number
  totalPaying: number
  /** One row per registry channel, display order, zero rows included —
   *  the panel decides what to show; the report never hides a channel. */
  channels: ChannelFunnelRow[]
  /** Signups with no readable attribution (pre-sensor clinics, blocked
   *  cookies, managed provisioning). Honest, never guessed into a channel. */
  untrackedSignups: number
  untrackedPaying: number
}

/**
 * The funnel read: visits per channel from the rollup + signups per channel
 * from clinic_profile.signup_attribution, graded through the SAME trial/paid
 * rules the billing wall uses (lib/trial.ts) so this report and the app can
 * never disagree about who is paying. Demo orgs are excluded — a seeded
 * clinic is not an acquisition.
 */
export async function getAcquisitionReport(days = 30, now: Date = new Date()): Promise<AcquisitionReport> {
  const windowDays = days === 90 ? 90 : days === 7 ? 7 : 30
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const sinceDay = dayKey(since)

  const visitRows = await db
    .select({
      channel: marketingPageview.channel,
      views: sql<number>`coalesce(sum(${marketingPageview.views}), 0)`.mapWith(Number),
    })
    .from(marketingPageview)
    .where(gte(marketingPageview.day, sinceDay))
    .groupBy(marketingPageview.channel)
  const visitsByChannel = new Map(visitRows.map((r) => [r.channel, r.views]))

  const signupRows = await db
    .select({
      attribution: clinicProfile.signupAttribution,
      trialEndsAt: clinicProfile.trialEndsAt,
      subscriptionStatus: clinicProfile.subscriptionStatus,
      stripeSubscriptionId: clinicProfile.stripeSubscriptionId,
    })
    .from(clinicProfile)
    .innerJoin(organization, eq(organization.id, clinicProfile.organizationId))
    .where(
      and(
        eq(organization.type, 'clinic'),
        eq(organization.isDemo, false),
        gte(clinicProfile.createdAt, since),
      ),
    )

  const rows = new Map<MarketingChannel, ChannelFunnelRow>(
    MARKETING_CHANNELS.map((c) => [c, { channel: c, visits: visitsByChannel.get(c) ?? 0, signups: 0, trialing: 0, expired: 0, paying: 0 }]),
  )
  let untrackedSignups = 0
  let untrackedPaying = 0
  let totalPaying = 0

  for (const s of signupRows) {
    const paid = hasPaidSubscription(s)
    const trial = resolveTrialState(s, now)
    if (paid) totalPaying++
    const stamp = parseSignupAttribution(s.attribution)
    if (!stamp) {
      untrackedSignups++
      if (paid) untrackedPaying++
      continue
    }
    const row = rows.get(stamp.channel)
    if (!row) continue // registry drift — impossible today, harmless if ever
    row.signups++
    if (paid) row.paying++
    else if (trial.onTrial) row.trialing++
    else if (trial.expired) row.expired++
  }

  const channels = MARKETING_CHANNELS.map((c) => rows.get(c)!)
  return {
    windowDays,
    totalVisits: channels.reduce((n, r) => n + r.visits, 0),
    totalSignups: channels.reduce((n, r) => n + r.signups, 0) + untrackedSignups,
    totalPaying,
    channels,
    untrackedSignups,
    untrackedPaying,
  }
}
