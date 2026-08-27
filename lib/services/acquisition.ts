import 'server-only'
import { and, eq, gte, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { marketingPageview } from '@/lib/db/schema/domain'
import { clinicProfile } from '@/lib/db/schema/platform'
import { organization } from '@/lib/db/schema/auth'
import {
  MARKETING_CHANNELS,
  buildAttributionTouch,
  campaignKeyOf,
  parseSignupAttribution,
  type MarketingChannel,
} from '@/lib/marketing-attribution'
import { hasPaidSubscription, resolveTrialState } from '@/lib/trial'

/**
 * The acquisition sensor's server side (docs/marketing-engine.md, slices
 * 1+1b): the www pageview recorder behind the marketing beacon, and the
 * funnel read (visits → sessions → signups → trialing → paying, per channel
 * + per campaign) behind the platform Acquisition panel. Everything here is
 * PLATFORM-facing — no clinic tenant ever reads these numbers.
 */

/** Mirror of the clinic rollup's path cap (lib/services/site-analytics.ts). */
const PATH_MAX_LEN = 256

/** UTC calendar-day key, same bucketing as the clinic rollup. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Record one marketing-site pageview into the (day, path, channel, campaign)
 * rollup. The channel + campaign key are classified HERE, server-side, from
 * what the beacon saw — the beacon only reports raw facts (path, query,
 * referrer, session-start), so a client can't invent a channel or write an
 * unbounded campaign string. Best-effort at the route; this throws only on
 * a genuinely broken DB.
 */
export async function recordMarketingView(
  input: {
    path: string | null | undefined
    search: string | null | undefined
    referrer: string | null | undefined
    selfHost?: string | null
    /** True when this is the beacon's first report of the browser session —
     *  counts a session alongside the view. */
    newSession?: boolean
  },
  now: Date = new Date(),
): Promise<void> {
  const touch = buildAttributionTouch({ ...input, now })
  const day = dayKey(now)
  const path = touch.landing.slice(0, PATH_MAX_LEN)
  const campaign = campaignKeyOf(touch.utmCampaign)
  const sessionInc = input.newSession === true ? 1 : 0
  await db
    .insert(marketingPageview)
    .values({ day, path, channel: touch.channel, campaign, views: 1, sessions: sessionInc })
    .onConflictDoUpdate({
      target: [
        marketingPageview.day,
        marketingPageview.path,
        marketingPageview.channel,
        marketingPageview.campaign,
      ],
      set: {
        views: sql`${marketingPageview.views} + 1`,
        sessions: sql`${marketingPageview.sessions} + ${sessionInc}`,
        updatedAt: new Date(),
      },
    })
}

export interface ChannelFunnelRow {
  channel: MarketingChannel
  /** www pageviews attributed to this channel in the window. */
  visits: number
  /** Browser sessions started on this channel — the conversion denominator. */
  sessions: number
  /** Clinics created in the window whose first touch was this channel. */
  signups: number
  /** …of which currently on a live trial. */
  trialing: number
  /** …of which trial-expired and unconverted (the leak to watch). */
  expired: number
  /** …of which paying (a real Stripe subscription with access). */
  paying: number
}

export interface CampaignRow {
  channel: MarketingChannel
  /** The normalized campaign key ('' rows are excluded — that's "no campaign"). */
  campaign: string
  visits: number
  sessions: number
  /** Signups whose FIRST touch carried this campaign. */
  signups: number
}

export interface PoweredBySource {
  /** The referring clinic's slug (the Powered-by link's utm_campaign). */
  slug: string
  /** Resolved clinic name when the slug matches a real org; null otherwise. */
  name: string | null
  visits: number
  sessions: number
}

export interface AcquisitionReport {
  windowDays: number
  totalVisits: number
  totalSessions: number
  totalSignups: number
  totalPaying: number
  /** One row per registry channel, display order, zero rows included —
   *  the panel decides what to show; the report never hides a channel. */
  channels: ChannelFunnelRow[]
  /** Daily total visits, oldest → newest, zero-filled — TrendChart-shaped. */
  daily: { bucket: string; value: number }[]
  /** Tagged campaigns by traffic (top N), so the dials can tell
   *  competitor-weave from competitor-nexhealth inside one channel. */
  campaigns: CampaignRow[]
  /** Which clinic sites drive Powered-by clicks (top N). */
  poweredBySources: PoweredBySource[]
  /** Signups with no readable attribution (pre-sensor clinics, blocked
   *  cookies, managed provisioning). Honest, never guessed into a channel. */
  untrackedSignups: number
  untrackedPaying: number
}

const TOP_CAMPAIGNS_LIMIT = 8
const TOP_POWERED_SOURCES_LIMIT = 6

/**
 * The funnel read: visits/sessions per channel + campaign from the rollup,
 * signups per channel from clinic_profile.signup_attribution, graded through
 * the SAME trial/paid rules the billing wall uses (lib/trial.ts) so this
 * report and the app can never disagree about who is paying. Demo orgs are
 * excluded — a seeded clinic is not an acquisition.
 */
export async function getAcquisitionReport(days = 30, now: Date = new Date()): Promise<AcquisitionReport> {
  const windowDays = days === 90 ? 90 : days === 7 ? 7 : 30
  const since = new Date(now.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000)
  const sinceDay = dayKey(since)

  const visitRows = await db
    .select({
      channel: marketingPageview.channel,
      views: sql<number>`coalesce(sum(${marketingPageview.views}), 0)`.mapWith(Number),
      sessions: sql<number>`coalesce(sum(${marketingPageview.sessions}), 0)`.mapWith(Number),
    })
    .from(marketingPageview)
    .where(gte(marketingPageview.day, sinceDay))
    .groupBy(marketingPageview.channel)
  const visitsByChannel = new Map(visitRows.map((r) => [r.channel, r]))

  const dailyRows = await db
    .select({
      day: marketingPageview.day,
      views: sql<number>`coalesce(sum(${marketingPageview.views}), 0)`.mapWith(Number),
    })
    .from(marketingPageview)
    .where(gte(marketingPageview.day, sinceDay))
    .groupBy(marketingPageview.day)
  const viewsByDay = new Map(dailyRows.map((r) => [r.day, r.views]))
  const daily: { bucket: string; value: number }[] = []
  for (let i = 0; i < windowDays; i++) {
    const d = dayKey(new Date(since.getTime() + i * 24 * 60 * 60 * 1000))
    daily.push({ bucket: d, value: viewsByDay.get(d) ?? 0 })
  }

  const campaignRows = await db
    .select({
      channel: marketingPageview.channel,
      campaign: marketingPageview.campaign,
      views: sql<number>`coalesce(sum(${marketingPageview.views}), 0)`.mapWith(Number),
      sessions: sql<number>`coalesce(sum(${marketingPageview.sessions}), 0)`.mapWith(Number),
    })
    .from(marketingPageview)
    .where(and(gte(marketingPageview.day, sinceDay), ne(marketingPageview.campaign, '')))
    .groupBy(marketingPageview.channel, marketingPageview.campaign)

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
    MARKETING_CHANNELS.map((c) => {
      const v = visitsByChannel.get(c)
      return [
        c,
        {
          channel: c,
          visits: v?.views ?? 0,
          sessions: v?.sessions ?? 0,
          signups: 0,
          trialing: 0,
          expired: 0,
          paying: 0,
        },
      ]
    }),
  )
  const signupsByCampaign = new Map<string, number>()
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
    const ck = campaignKeyOf(stamp.utmCampaign)
    if (ck) signupsByCampaign.set(`${stamp.channel} ${ck}`, (signupsByCampaign.get(`${stamp.channel} ${ck}`) ?? 0) + 1)
  }

  const isChannel = (c: string): c is MarketingChannel =>
    (MARKETING_CHANNELS as readonly string[]).includes(c)
  const campaigns: CampaignRow[] = campaignRows
    .filter((r) => isChannel(r.channel))
    .map((r) => ({
      channel: r.channel as MarketingChannel,
      campaign: r.campaign,
      visits: r.views,
      sessions: r.sessions,
      signups: signupsByCampaign.get(`${r.channel} ${r.campaign}`) ?? 0,
    }))
    .sort((a, b) => b.signups - a.signups || b.visits - a.visits)
    .slice(0, TOP_CAMPAIGNS_LIMIT)

  // Powered-by sources: the loop's utm_campaign IS the referring clinic's
  // slug — resolve real names, and keep unresolved slugs visible (a stale
  // slug is still a fact about where clicks came from).
  const poweredRows = campaignRows
    .filter((r) => r.channel === 'powered_by' && r.campaign)
    .sort((a, b) => b.views - a.views)
    .slice(0, TOP_POWERED_SOURCES_LIMIT)
  let poweredBySources: PoweredBySource[] = []
  if (poweredRows.length > 0) {
    const slugs = poweredRows.map((r) => r.campaign)
    let names = new Map<string, string>()
    try {
      const orgRows = await db
        .select({ slug: organization.slug, name: organization.name })
        .from(organization)
        .where(inArray(organization.slug, slugs))
      names = new Map(orgRows.filter((o) => o.slug).map((o) => [o.slug as string, o.name]))
    } catch {
      /* names are decoration — the counts still report */
    }
    poweredBySources = poweredRows.map((r) => ({
      slug: r.campaign,
      name: names.get(r.campaign) ?? null,
      visits: r.views,
      sessions: r.sessions,
    }))
  }

  const channels = MARKETING_CHANNELS.map((c) => rows.get(c)!)
  return {
    windowDays,
    totalVisits: channels.reduce((n, r) => n + r.visits, 0),
    totalSessions: channels.reduce((n, r) => n + r.sessions, 0),
    totalSignups: channels.reduce((n, r) => n + r.signups, 0) + untrackedSignups,
    totalPaying,
    channels,
    daily,
    campaigns,
    poweredBySources,
    untrackedSignups,
    untrackedPaying,
  }
}
