import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getActiveBundlesForSidebar } from '@/lib/services/integration-bundles'
import { getGoogleReviewStats } from '@/lib/services/google-reviews'
import { getNewPatientsPerWeek12 } from '@/lib/services/patients'
import { getRecallStats } from '@/lib/services/recall-stats'
import { getSitePerformance } from '@/lib/services/site-analytics'
import { getGbpLocalMetrics } from '@/lib/services/gbp-metrics'
import { getPublishedPostCounts } from '@/lib/services/social-posts'
import { getLeadCounts } from '@/lib/services/leads'
import { listAudiences } from '@/lib/services/marketing'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'
import { TrendChart } from '@/components/ui/charts'

export const metadata = {
  title: 'Growth - DreamCRM',
  description:
    'How new patients find you and how your own list fills the chairs — reputation, outreach, social, and the numbers behind them.',
}

export const dynamic = 'force-dynamic'

/**
 * The Growth hub — v3 redesign ("acquisition leads, two engines"). Growth's
 * identity is OUTWARD: growing into the town and pulling new patients in. But
 * a dental practice's cheapest growth is its own list (reactivating a lapsed
 * patient costs an email; acquiring a stranger costs hundreds), and the two
 * engines feed each other — completed visits drive review requests drive
 * Google rank drives new patients. So the page is shaped as:
 *
 *   1. HERO — the "New patients" scoreboard: the per-week heartbeat (the one
 *      number that IS growth) beside "what's pulling them in" rows — website
 *      visits→leads, Google reputation, GBP presence, social activity. Every
 *      row links to the surface that owns it; rows for unconnected channels
 *      show an honest connect state, never fake zeros dressed as data.
 *   2. ENGINE #2 — "Your own list": the recall/reactivation funnel (due &
 *      reachable → sent → opened → booked back) + the next scheduled send,
 *      or an honest quiet-engine nudge when patients are due and nothing is
 *      scheduled.
 *   3. WHAT'S HAPPENING — number-first news cards that carry attention tones
 *      (leads to triage, reviews waiting on replies incl. the 1–2★ fires,
 *      social activity). No brochure copy.
 *   4. Quiet utility footer — Audiences, the outreach queue, Analytics.
 *
 * All reads are best-effort — the hub renders even when a stat hiccups.
 * Clinic-only (platform/patient tenants redirect), so no tenant-voice
 * branching is needed here.
 */
export default async function GrowthHubPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')

  const [
    bundles,
    reviewStats,
    newPatientsWeekly,
    recall,
    sitePerf,
    gbp,
    postCounts,
    leadCounts,
    audiences,
    tz,
  ] = await Promise.all([
    getActiveBundlesForSidebar(ctx.organizationId).catch(() => new Set<string>()),
    getGoogleReviewStats(ctx.organizationId).catch(() => null),
    getNewPatientsPerWeek12(ctx.organizationId).catch(
      () => [] as Array<{ bucket: string; value: number }>,
    ),
    getRecallStats(ctx.organizationId).catch(() => null),
    getSitePerformance(ctx.organizationId).catch(() => null),
    getGbpLocalMetrics(ctx.organizationId).catch(() => null),
    getPublishedPostCounts(ctx.organizationId).catch(() => ({}) as Record<string, number>),
    getLeadCounts(ctx.organizationId).catch(() => null),
    listAudiences(ctx.organizationId).catch(() => []),
    getClinicTimeZone(ctx.organizationId),
  ])

  const hasSocialChannel = bundles.has('social') || bundles.has('google')
  const postsPublished30d = Object.values(postCounts).reduce((a, b) => a + b, 0)

  // New patients: trailing 4 weeks vs the prior 4, from the 12-week series.
  const last4 = sumRange(newPatientsWeekly, -4)
  const prior4 = sumRange(newPatientsWeekly, -8, -4)
  const newPatientsDelta = prior4 > 0 ? Math.round(((last4 - prior4) / prior4) * 100) : null

  const nextSend = recall?.upcomingSends?.[0] ?? null
  const quietEngine =
    !!recall && recall.recallDueReachableCount > 0 && (recall.upcomingSends?.length ?? 0) === 0

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title="Growth"
        subtitle="How new patients find you, and how your own list fills the chairs."
        actions={
          <div className="flex items-center gap-2">
            <ActionButton variant="secondary" size="sm" href="/growth/analytics">
              Full analytics
            </ActionButton>
            <ActionButton variant="primary" size="sm" href="/growth/outreach?new=1">
              New campaign
            </ActionButton>
          </div>
        }
      />

      {/* ── Engine #1: the acquisition scoreboard. The heartbeat is new
          patients per week — the one number that IS growth — beside the
          real channels pulling them in. ─────────────────────────────────── */}
      <div className="v2-card overflow-hidden mb-6">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="p-5 sm:p-6 min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">New patients</h2>
            <div className="mt-3 flex items-end gap-3">
              <div className="text-4xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                {last4}
              </div>
              <div className="pb-0.5">
                <div className="text-xs text-gray-500 dark:text-gray-400">last 4 weeks</div>
                {newPatientsDelta != null && (
                  <div
                    className={`text-xs tabular-nums font-semibold ${newPatientsDelta >= 0 ? TONE_TEXT.ok : TONE_TEXT.warn}`}
                    title="vs the prior 4 weeks"
                  >
                    {newPatientsDelta >= 0 ? '▲' : '▼'} {Math.abs(newPatientsDelta)}% vs prior 4
                  </div>
                )}
              </div>
            </div>
            {newPatientsWeekly.length >= 2 && (
              <TrendChart
                data={newPatientsWeekly}
                kind="area"
                height={150}
                label="new patients"
                className="mt-4"
                ariaLabel={`New patients per week over the last ${newPatientsWeekly.length} weeks`}
              />
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Patients whose first visit landed in each of the last 12 weeks — imports and PMS
              backfills don’t count, so the line never lies.
            </p>
          </div>

          {/* What's pulling them in — one row per real channel. */}
          <div className="p-5 sm:p-6 lg:border-l border-t lg:border-t-0 border-[color:var(--color-hairline)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-500)] dark:text-gray-400 mb-2">
              What’s pulling them in
            </h3>
            <ul className="divide-y divide-[color:var(--color-hairline)]">
              <ChannelRow
                href="/website"
                glyph="🌐"
                label="Website"
                value={
                  sitePerf
                    ? `${sitePerf.traffic.total.toLocaleString()} visits → ${sitePerf.leads30d} lead${sitePerf.leads30d === 1 ? '' : 's'} · 30d`
                    : 'stats unavailable right now'
                }
              />
              <ChannelRow
                href="/growth/reviews"
                glyph="⭐"
                label="Reputation"
                value={
                  reviewStats && reviewStats.count > 0 && reviewStats.averageRating != null
                    ? `${reviewStats.averageRating.toFixed(1)}★ · ${reviewStats.count} Google review${reviewStats.count === 1 ? '' : 's'}`
                    : 'no Google reviews synced yet'
                }
                tone={reviewStats && reviewStats.count > 0 ? 'ok' : undefined}
              />
              <ChannelRow
                href={gbp?.connected ? '/growth/analytics' : '/integrations'}
                glyph="📍"
                label="Google Business"
                value={
                  gbp?.connected
                    ? `${gbp.calls} call${gbp.calls === 1 ? '' : 's'} · ${gbp.directions} direction request${gbp.directions === 1 ? '' : 's'} · ${gbp.windowDays}d`
                    : 'not connected — the local-search numbers live here'
                }
              />
              <ChannelRow
                href={hasSocialChannel ? '/growth/social' : '/integrations'}
                glyph="📣"
                label="Social"
                value={
                  hasSocialChannel
                    ? `${postsPublished30d} post${postsPublished30d === 1 ? '' : 's'} published · 30d`
                    : 'not connected — the composer unlocks in Integrations'
                }
              />
            </ul>
          </div>
        </div>
      </div>

      {/* ── Engine #2: your own list. Reactivating a patient you already
          have costs an email — the funnel shows the machine working. ────── */}
      {recall && (
        <div className="v2-card p-5 sm:p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Your own list — the reactivation engine
            </h2>
            <Link
              href="/growth/outreach"
              className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
            >
              Recall &amp; Outreach →
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FunnelStat
              href="/growth/outreach/queue"
              value={recall.recallDueReachableCount}
              label="due & reachable"
              tone={recall.recallDueReachableCount > 0 ? 'warn' : undefined}
              aria={`${recall.recallDueReachableCount} patients due and reachable — open the outreach queue`}
            />
            <FunnelStat
              href="/growth/outreach"
              value={recall.sentThisMonthCount}
              label="sent this month"
              aria={`${recall.sentThisMonthCount} campaign messages sent this month`}
            />
            <FunnelStat
              href="/growth/outreach"
              value={recall.openRate30d != null ? `${recall.openRate30d}%` : '—'}
              label="opened · 30d"
              aria={`Open rate over the last 30 days: ${recall.openRate30d != null ? `${recall.openRate30d} percent` : 'no sends yet'}`}
            />
            <FunnelStat
              href="/growth/outreach"
              value={recall.bookedFromRecallCount}
              label="booked back · 30d"
              tone={recall.bookedFromRecallCount > 0 ? 'ok' : undefined}
              aria={`${recall.bookedFromRecallCount} patients booked back from outreach in the last 30 days`}
            />
          </div>

          {/* Engine status — the next send, or an honest quiet-engine nudge. */}
          <div className="mt-4 pt-3 border-t border-[color:var(--color-hairline)] text-xs">
            {nextSend ? (
              <p className="text-gray-600 dark:text-gray-300">
                <span aria-hidden="true">🗓️ </span>
                Next send: <span className="font-semibold">{nextSend.name}</span>
                {' · '}
                {formatClinicDayTime(nextSend.scheduledAt, tz)}
                {nextSend.audienceRecipientCount != null && (
                  <>
                    {' '}
                    · to {nextSend.audienceRecipientCount} patient
                    {nextSend.audienceRecipientCount === 1 ? '' : 's'}
                  </>
                )}
              </p>
            ) : quietEngine ? (
              <p className={TONE_TEXT.warn}>
                <span aria-hidden="true">💤 </span>
                {recall.recallDueReachableCount} patient
                {recall.recallDueReachableCount === 1 ? ' is' : 's are'} due and nothing is
                scheduled to reach them —{' '}
                <Link
                  href="/growth/outreach/queue"
                  className="font-semibold underline underline-offset-4"
                >
                  open the queue
                </Link>
                .
              </p>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">
                Nothing scheduled right now — auto-sends and smart rules keep running on their own.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── What's happening — number-first, attention tones only when a
          human is actually needed. ───────────────────────────────────────── */}
      <section className="mb-7">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-500)] dark:text-gray-400 mb-3">
          What’s happening
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <NewsCard
            href="/leads"
            value={String(leadCounts?.new ?? 0)}
            label={`new lead${(leadCounts?.new ?? 0) === 1 ? '' : 's'} to triage`}
            tone={(leadCounts?.new ?? 0) > 0 ? 'warn' : undefined}
            aria={`Leads — ${leadCounts?.new ?? 0} new to triage`}
          />
          {reviewStats && reviewStats.needsReply > 0 ? (
            <NewsCard
              href="/growth/reviews/received"
              value={String(reviewStats.needsReply)}
              label={
                reviewStats.lowStarNeedsReply > 0
                  ? `review${reviewStats.needsReply === 1 ? '' : 's'} waiting on a reply · ${reviewStats.lowStarNeedsReply} rated 1–2★`
                  : `review${reviewStats.needsReply === 1 ? '' : 's'} waiting on a reply`
              }
              tone={reviewStats.lowStarNeedsReply > 0 ? 'urgent' : 'warn'}
              aria={`Reviews — ${reviewStats.needsReply} waiting on a reply${reviewStats.lowStarNeedsReply > 0 ? `, ${reviewStats.lowStarNeedsReply} rated 1 to 2 stars` : ''}`}
            />
          ) : (
            <NewsCard
              href="/growth/reviews"
              value={String(reviewStats?.count ?? 0)}
              label={
                reviewStats && reviewStats.count > 0 && reviewStats.averageRating != null
                  ? `Google reviews · ${reviewStats.averageRating.toFixed(1)}★ · all replied`
                  : 'Google reviews so far'
              }
              tone={reviewStats && reviewStats.count > 0 ? 'ok' : undefined}
              aria={`Reviews — ${reviewStats?.count ?? 0} Google reviews${reviewStats?.averageRating != null ? `, ${reviewStats.averageRating.toFixed(1)} star average` : ''}, none waiting on a reply`}
            />
          )}
          {hasSocialChannel ? (
            <NewsCard
              href="/growth/social"
              value={String(postsPublished30d)}
              label={`post${postsPublished30d === 1 ? '' : 's'} published · 30d`}
              aria={`Social — ${postsPublished30d} post${postsPublished30d === 1 ? '' : 's'} published in the last 30 days`}
            />
          ) : (
            <NewsCard
              href="/integrations"
              value="0"
              label="social channels connected — the composer unlocks in Integrations"
              aria="Social — no channels connected yet; connect one in Integrations"
            />
          )}
        </div>
      </section>

      {/* ── The quiet utilities — the setup/reference layers, present but
          silent. ─────────────────────────────────────────────────────────── */}
      <div className="pt-5 border-t border-[color:var(--color-hairline)] flex flex-wrap items-center gap-x-8 gap-y-3">
        <Link
          href="/growth/audiences"
          className="group inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
        >
          <span aria-hidden="true">👥</span>
          <span className="font-semibold">Audiences</span>
          <span className="text-gray-500 dark:text-gray-400 tabular-nums">
            {audiences.length} saved
          </span>
        </Link>
        <Link
          href="/growth/outreach/queue"
          className="group inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
        >
          <span aria-hidden="true">📬</span>
          <span className="font-semibold">Outreach queue</span>
          {recall && (
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">
              {recall.recallDueReachableCount + recall.lapsedReachableCount} worth a nudge
            </span>
          )}
        </Link>
        <Link
          href="/growth/analytics"
          className="group inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
        >
          <span aria-hidden="true">📈</span>
          <span className="font-semibold">Analytics</span>
          <span className="text-gray-500 dark:text-gray-400">the whole picture</span>
        </Link>
      </div>
    </div>
  )
}

/** Sum a slice of the weekly series (negative indices from the end). */
function sumRange(
  weekly: Array<{ bucket: string; value: number }>,
  from: number,
  to?: number,
): number {
  return weekly.slice(from, to).reduce((a, p) => a + p.value, 0)
}

/** One acquisition channel: glyph, name, and its real number (or an honest
 *  connect state). A full-row link into the surface that owns it. */
function ChannelRow({
  href,
  glyph,
  label,
  value,
  tone,
}: {
  href: string
  glyph: string
  label: string
  value: string
  tone?: Tone
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-[var(--r-xs)] hover:bg-teal-500/5 transition-colors"
      >
        <span aria-hidden="true" className="text-base shrink-0">
          {glyph}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
            {label}
          </span>
          <span
            className={`block text-xs leading-snug ${tone ? TONE_TEXT[tone] : 'text-gray-500 dark:text-gray-400'}`}
          >
            {value}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="text-gray-300 dark:text-gray-600 group-hover:text-teal-600 dark:group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all shrink-0"
        >
          →
        </span>
      </Link>
    </li>
  )
}

/** One stage of the reactivation funnel — a linked number, label whispering. */
function FunnelStat({
  href,
  value,
  label,
  tone,
  aria,
}: {
  href: string
  value: number | string
  label: string
  tone?: Tone
  aria: string
}) {
  return (
    <Link href={href} aria-label={aria} className="group block">
      <div
        className={`text-3xl font-bold tabular-nums font-mono-num leading-none ${
          tone ? TONE_TEXT[tone] : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
        {label}
      </div>
    </Link>
  )
}

/** A "what's happening" card — a door that earns its card space by carrying
 *  news. The NUMBER is the hero (mono, tone-colored when it's a signal);
 *  the label whispers; there is no brochure copy. Mirrors the Website hub. */
function NewsCard({
  href,
  value,
  label,
  tone,
  aria,
}: {
  href: string
  value: string
  label: string
  tone?: Tone
  aria: string
}) {
  return (
    <Link href={href} aria-label={aria} className="block h-full group">
      <div className="v2-card-interactive p-4 sm:p-5 h-full flex flex-col">
        <div
          className={`text-3xl font-bold tabular-nums font-mono-num leading-none ${
            tone ? TONE_TEXT[tone] : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {value}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-snug">
            {label}
          </span>
          <span
            className="text-gray-300 dark:text-gray-600 group-hover:text-teal-700 dark:group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all shrink-0"
            aria-hidden
          >
            →
          </span>
        </div>
      </div>
    </Link>
  )
}
