import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant, requirePlan } from '@/lib/auth/context'
import { getClinicAnalytics, type TrendPoint } from '@/lib/services/analytics'
import { getSiteTraffic } from '@/lib/services/site-analytics'
import { getSocialMetrics } from '@/lib/services/social-metrics'
import { getPublishedPostCounts } from '@/lib/services/social-posts'
import { getRetentionAttribution, type RetentionAttribution } from '@/lib/services/retention-attribution'
import { getReviewsProof, type ReviewsProof } from '@/lib/services/reviews'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'
import { KpiStat } from '@/components/ui/kpi-stat'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import { BrandLogo, type BrandLogoId } from '@/components/integrations/brand-logos'
import { TONE_TEXT } from '@/lib/ui/encodings'

/** Social platform slug → brand-logo id (the rest of the app uses real marks). */
const SOCIAL_BRAND_IDS: Record<string, BrandLogoId> = {
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  linkedin: 'linkedin',
}

export const metadata = { title: 'Practice Analytics - DreamCRM' }
export const dynamic = 'force-dynamic'

function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
// 'YYYY-MM-DD' → compact 'M/D' for the daily-visits sparkline x-axis.
function shortDay(day: string): string {
  const [, m, d] = day.split('-')
  return m && d ? `${Number(m)}/${Number(d)}` : day
}
function pct(n: number | null): string {
  return n == null ? '—' : `${(n * 100).toFixed(1)}%`
}

interface Props {
  searchParams: Promise<{ days?: string }>
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')
  await requirePlan(ctx, 'premium', 'analytics')

  const { days } = await searchParams
  const windowDays = days === '90' ? 90 : 30
  const [a, traffic, social, wonBack, reviewsProof, postCounts] = await Promise.all([
    getClinicAnalytics(ctx.organizationId, windowDays),
    getSiteTraffic(ctx.organizationId, windowDays),
    getSocialMetrics(ctx.organizationId, { days: windowDays }),
    // The "proof" panels are secondary — if one query fails it degrades to its
    // empty state rather than taking down the whole dashboard.
    getRetentionAttribution(ctx.organizationId, { days: windowDays }).catch(
      () => ({ windowDays, totalWonBack: 0, buckets: [] }),
    ),
    getReviewsProof(ctx.organizationId).catch(
      () => ({ featuredCount: 0, featured: [], googleRating: null, googleCount: 0 }),
    ),
    getPublishedPostCounts(ctx.organizationId, { days: windowDays }).catch((): Record<string, number> => ({})),
  ])
  const trafficDelta = traffic.total - traffic.totalPrev

  const newPatientsDelta = a.acquisition.newPatients - a.acquisition.newPatientsPrev
  // Rates on a tiny sample are meaningless (a single no-show would read as
  // 100%). Show counts + a "building history" note until enough resolve.
  // Each rate gets a low-volume flag keyed to ITS OWN denominator — the
  // no-show rate is over attended visits, but the cancellation rate is over
  // all booked appointments, so they can't share one threshold.
  const LOW_VOL = 5
  const confirmableDenom = a.schedule.total - a.schedule.cancelled // matches confirmationRate
  const lowVolAttended = a.schedule.attended < LOW_VOL // no-show rate
  const lowVolCancellation = a.schedule.total < LOW_VOL // cancellation rate (denom = total)
  const lowVolConfirmation = confirmableDenom < LOW_VOL // confirmation rate
  // The "building history" footnote shows whenever ANY headline rate is on a
  // thin sample — it explains every "x/y" fallback rendered above it.
  const anyLowVol = lowVolAttended || lowVolCancellation || lowVolConfirmation
  const now = new Date()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="analytics" />
      {/* ── Header + range toggle ───────────────────────────────────────── */}
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Practice · {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            <StatusPill tone="warn" label="Premium" />
          </span>
        }
        title="Analytics"
        subtitle="The numbers a CRM can honestly measure — acquisition, schedule health, recall and reputation. Clinical production stays in your PMS; we don't fake it."
        actions={
          // Window is a FILTER, not the page's primary action — chips, not buttons.
          <div className="flex items-center gap-1.5">
            {[30, 90].map((d) => (
              <FilterChip key={d} href={`/analytics?days=${d}`} active={windowDays === d}>
                {d} days
              </FilterChip>
            ))}
          </div>
        }
      />

      {/* ── Scorecard — the headline numbers, at a glance ───────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <KpiStat
          label="New patients"
          value={a.acquisition.newPatients}
          sub={<DeltaBadge value={newPatientsDelta} />}
          href="/patients?status=new"
        />
        <KpiStat
          label="Appointments"
          value={a.schedule.total}
          sub={<VolumeTrend cur={a.schedule.total} prev={a.schedule.prev.total} />}
          href="/appointments?window=past_30d"
        />
        <KpiStat
          label="No-show rate"
          value={a.schedule.attended === 0 ? '—' : lowVolAttended ? `${a.schedule.noShow}/${a.schedule.attended}` : pct(a.schedule.noShowRate)}
          tone={lowVolAttended || a.schedule.noShowRate == null ? undefined : a.schedule.noShowRate > a.schedule.benchmarkNoShowRate ? 'urgent' : 'ok'}
          sub={
            lowVolAttended || a.schedule.noShowRate == null ? (
              'building history'
            ) : (
              <>
                vs benchmark {pct(a.schedule.benchmarkNoShowRate)}
                <RateTrend cur={a.schedule.noShowRate} prev={a.schedule.prev.noShowRate} lowerIsBetter />
              </>
            )
          }
          href="/appointments?window=past_30d&attention=no_show"
        />
        <KpiStat
          label="Reviews left"
          value={a.reputation.completed}
          sub={`of ${a.reputation.sent} ${a.reputation.sent === 1 ? 'request' : 'requests'} sent`}
          href="/reviews/received"
        />
      </div>

      {/* ── Acquisition ─────────────────────────────────────────────────── */}
      <Section title="Acquisition" subtitle={`New patients + where they came from · last ${windowDays} days`}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
          <Card>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">New patients</p>
                <p className="text-4xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 mt-0.5">{a.acquisition.newPatients}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">won through your channels · bulk imports excluded</p>
              </div>
              <DeltaBadge value={newPatientsDelta} />
            </div>
            <Bars points={a.acquisition.trend} className="mt-4" />
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-3">Source mix</p>
            {a.acquisition.sourceMix.length === 0 ? (
              <Empty>No new patients in this window.</Empty>
            ) : (
              <RankBars rows={a.acquisition.sourceMix.map((s) => ({ label: humanize(s.source), value: s.count, href: `/patients?source=${encodeURIComponent(s.source)}` }))} />
            )}
          </Card>
        </div>
        <Card className="mt-4">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-3">
            Website funnel — search to booked
          </p>
          <Funnel
            steps={[
              { label: 'Clicks from search', value: a.acquisition.websiteFunnel.clicks, note: a.acquisition.websiteFunnel.clicks == null ? 'Connect Search Console' : undefined, href: '/seo' },
              { label: 'Website leads', value: a.acquisition.websiteFunnel.leads, href: '/leads' },
              { label: 'Contacted', value: a.acquisition.websiteFunnel.contacted },
              {
                label: 'Converted to patient',
                value: a.acquisition.websiteFunnel.converted,
                note: convNote(a.acquisition.websiteFunnel.converted, a.acquisition.websiteFunnel.leads, 'leads'),
              },
            ]}
          />
        </Card>
        {/* Google Business local actions — how the map-pack listing converts
            (calls / directions / bookings + impressions). Connect prompt when
            no GBP is linked, so the card is never a row of dead zeros. */}
        <Card className="mt-4">
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
              Google Business — local actions
            </p>
            <Link
              href={a.acquisition.gbp?.connected ? '/seo' : '/integrations'}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 hover:underline"
            >
              {a.acquisition.gbp?.connected ? 'Details →' : 'Connect →'}
            </Link>
          </div>
          {a.acquisition.gbp?.connected ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiStat label="Listing views" value={a.acquisition.gbp.impressions.toLocaleString()} />
              <KpiStat label="Calls" value={a.acquisition.gbp.calls.toLocaleString()} href="/seo" />
              <KpiStat label="Directions" value={a.acquisition.gbp.directions.toLocaleString()} href="/seo" />
              <KpiStat label="Bookings" value={a.acquisition.gbp.bookings.toLocaleString()} href="/seo" />
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Connect your{' '}
              <Link href="/integrations" className="text-teal-700 dark:text-teal-400 hover:underline">
                Google Business Profile
              </Link>{' '}
              to see calls, direction requests, and bookings from your Google listing here.
            </p>
          )}
        </Card>
        {/* Website visits — the first real "how many people land on my site"
            number (every channel, not just search). Drillable to top pages. */}
        <Card className="mt-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                Website visits
              </p>
              <p className="text-4xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 mt-0.5">
                {traffic.total.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                all visits to your public site · last {windowDays} days
              </p>
            </div>
            <DeltaBadge value={trafficDelta} />
          </div>
          {traffic.total === 0 ? (
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 italic">
              No visits counted yet — this fills in as people land on your site.
            </p>
          ) : (
            <>
              <Bars
                points={traffic.daily.map((d) => ({ label: shortDay(d.day), count: d.views }))}
                className="mt-4"
              />
              {traffic.topPages.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
                    Top pages
                  </p>
                  <RankBars
                    rows={traffic.topPages.map((p) => ({ label: p.path === '/' ? 'Home' : p.path, value: p.views }))}
                    compact
                  />
                </div>
              )}
            </>
          )}
        </Card>
      </Section>

      {/* ── Social performance ──────────────────────────────────────────── */}
      {/* Per-platform reach/engagement from the connected social channels (via
          Zernio). Honest: only what the API returns; a connect-prompt when no
          social channel is linked, so the band is never a row of dead zeros. */}
      <Section
        title="Social performance"
        subtitle={`Reach + engagement from your connected social channels · last ${windowDays} days`}
      >
        {social.connected ? (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {social.platforms.map((p) => (
              <Card key={p.platform}>
                <div className="flex items-center gap-2 mb-3">
                  {SOCIAL_BRAND_IDS[p.platform] ? (
                    <BrandLogo id={SOCIAL_BRAND_IDS[p.platform]} size={22} />
                  ) : (
                    <span aria-hidden="true" className="text-lg">{p.icon}</span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{p.label}</p>
                    {p.handle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{p.handle}</p>}
                  </div>
                </div>
                {p.error ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    Couldn&apos;t load metrics this load{/analytics add-on|402|payment required/i.test(p.error) ? ' — analytics add-on required' : ''}.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <KpiStat label="Followers" value={p.followers.toLocaleString()} />
                    <KpiStat label="Reach" value={p.reach.toLocaleString()} />
                    <KpiStat label="Impressions" value={p.impressions.toLocaleString()} />
                    <KpiStat label="Engagement" value={p.engagement.toLocaleString()} />
                  </div>
                )}
                {/* The activity behind the reach: what you actually published.
                    Honest — no per-post numbers (those are deprecated). */}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 pt-3 border-t border-[color:var(--color-hairline)]">
                  {postCounts[p.platform] ? (
                    <>
                      <span className="font-semibold tabular-nums font-mono-num text-gray-700 dark:text-gray-200">
                        {postCounts[p.platform]}
                      </span>{' '}
                      {postCounts[p.platform] === 1 ? 'post' : 'posts'} published · last {windowDays} days
                    </>
                  ) : (
                    'No posts published this period'
                  )}
                </p>
              </Card>
            ))}
          </div>
          <div className="mt-3 text-right">
            <Link href="/social-posts" className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
              Create or schedule a post →
            </Link>
          </div>
          </>
        ) : (
          <Card>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Connect a social channel (Instagram, Facebook, TikTok, YouTube, or LinkedIn) on{' '}
              <Link href="/integrations" className="text-teal-700 dark:text-teal-400 hover:underline">
                Integrations
              </Link>{' '}
              to see followers, reach, and engagement here.
            </p>
          </Card>
        )}
      </Section>

      {/* ── Schedule health ─────────────────────────────────────────────── */}
      {/* Every headline number drills into the filtered Appointments view that
          explains it (design doctrine: numbers are never dead ends). */}
      <Section title="Schedule health" subtitle={`Appointments with a visit time in the last ${windowDays} days`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1.5">
          <KpiStat
            label="Appointments"
            value={a.schedule.total}
            sub={<VolumeTrend cur={a.schedule.total} prev={a.schedule.prev.total} />}
            href="/appointments?window=past_30d"
          />
          <KpiStat
            label="Confirmation rate"
            value={confirmableDenom === 0 ? '—' : lowVolConfirmation ? `${a.schedule.confirmed}/${confirmableDenom}` : pct(a.schedule.confirmationRate)}
            sub={
              <>
                who still need a text →
                {!lowVolConfirmation && <RateTrend cur={a.schedule.confirmationRate} prev={a.schedule.prev.confirmationRate} />}
              </>
            }
            tone={lowVolConfirmation || a.schedule.confirmationRate == null ? undefined : 'ok'}
            href="/appointments?attention=unconfirmed"
          />
          <KpiStat
            label="No-show rate"
            value={a.schedule.attended === 0 ? '—' : lowVolAttended ? `${a.schedule.noShow} of ${a.schedule.attended}` : pct(a.schedule.noShowRate)}
            tone={lowVolAttended || a.schedule.noShowRate == null ? undefined : a.schedule.noShowRate > a.schedule.benchmarkNoShowRate ? 'urgent' : 'ok'}
            sub={
              a.schedule.attended === 0 ? 'no visits yet' : lowVolAttended ? 'visits so far' : (
                <>
                  benchmark {pct(a.schedule.benchmarkNoShowRate)}
                  <RateTrend cur={a.schedule.noShowRate} prev={a.schedule.prev.noShowRate} lowerIsBetter />
                </>
              )
            }
            href="/appointments?window=past_30d&attention=no_show"
          />
          <KpiStat
            label="Cancellation rate"
            value={a.schedule.total === 0 ? '—' : lowVolCancellation ? `${a.schedule.cancelled}/${a.schedule.total}` : pct(a.schedule.cancellationRate)}
            sub={
              a.schedule.total === 0 ? undefined : lowVolCancellation ? 'booked so far' : (
                <>
                  {a.schedule.cancelled} of {a.schedule.total} booked
                  <RateTrend cur={a.schedule.cancellationRate} prev={a.schedule.prev.cancellationRate} lowerIsBetter />
                </>
              )
            }
            href="/appointments?window=past_30d&attention=cancelled"
          />
        </div>
        {anyLowVol ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Rates shown as counts where the sample is still small (under {LOW_VOL}) — they firm up into
            percentages as your history grows.
          </p>
        ) : (
          <div className="mb-4" />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
          <Card>
            <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">Volume by week</p>
            <Bars points={a.schedule.volumeTrend} className="mt-3" />
          </Card>
          <div className="grid grid-rows-2 gap-4">
            <Card>
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">By booking source</p>
              {a.schedule.bySource.length === 0 ? <Empty>No appointments.</Empty> : (
                <RankBars rows={a.schedule.bySource.map((s) => ({ label: humanize(s.source), value: s.count, href: `/appointments?source=${encodeURIComponent(s.source)}` }))} compact />
              )}
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">By provider</p>
              {a.schedule.byProvider.length === 0 ? <Empty>No provider assigned.</Empty> : (
                <RankBars rows={a.schedule.byProvider.map((s) => ({ label: s.provider, value: s.count }))} compact />
              )}
            </Card>
          </div>
        </div>
      </Section>

      {/* ── Recall & Outreach + Reputation ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Section title="Recall & outreach" subtitle="Bringing patients back" flush>
          <Card>
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Recall due now</p>
                <p className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 mt-0.5">{a.recall.due}</p>
              </div>
              <Link href="/patients?status=recall_due" className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 hover:underline self-end">
                View list →
              </Link>
            </div>
            <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
              Outreach funnel · last {windowDays} days
            </p>
            <Funnel
              steps={[
                { label: 'Sent', value: a.recall.outreach.sent },
                { label: 'Opened', value: a.recall.outreach.opened },
                { label: 'Clicked', value: a.recall.outreach.clicked },
                {
                  label: 'Booked',
                  value: a.recall.outreach.booked,
                  note: convNote(a.recall.outreach.booked, a.recall.outreach.sent, 'sent'),
                  href: '/marketing',
                },
              ]}
            />
            {/* The proof under the funnel: who actually came back, and what
                brought each of them back. Honest — only campaign-attributed
                rebookings, drillable down to the patient + the visit. */}
            <div className="mt-5 pt-4 border-t border-[color:var(--color-hairline)]">
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
                Patients won back · last {windowDays} days
              </p>
              {wonBack.totalWonBack === 0 ? (
                <Empty>No campaign has rebooked a patient in this window yet.</Empty>
              ) : (
                <WonBack data={wonBack} />
              )}
            </div>
          </Card>
        </Section>

        <Section title="Reputation" subtitle={`Review requests · last ${windowDays} days`} flush>
          <Card>
            {/* Sent → Opened → Reviewed. "Opened" is the REAL count of requests
                whose review link the patient opened (review_request.clickedAt) —
                not a number reconstructed from the click rate. review_request
                has no email-open tracking, so this is the only honest middle
                step; the rate rides alongside as context. */}
            <Funnel
              steps={[
                { label: 'Requests sent', value: a.reputation.sent },
                { label: 'Opened the link', value: a.reputation.opened, note: a.reputation.clickRate != null ? pct(a.reputation.clickRate) : undefined },
                {
                  label: 'Reviews left',
                  value: a.reputation.completed,
                  note: convNote(a.reputation.completed, a.reputation.sent, 'sent'),
                  href: '/reviews/received',
                },
              ]}
            />
            <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mt-4 mb-2">Platform mix</p>
            <RankBars
              rows={[
                { label: 'Google', value: a.reputation.byPlatform.google },
                { label: 'Healthgrades', value: a.reputation.byPlatform.healthgrades },
                { label: 'Facebook', value: a.reputation.byPlatform.facebook },
                { label: 'Yelp', value: a.reputation.byPlatform.yelp },
              ].filter((r) => r.value > 0)}
              compact
              emptyNote="No reviews left yet in this window."
            />
            {/* The proof those reviews become public credibility: testimonials
                live on the site + the Google star snippet. Current-state, not
                windowed — it's what a prospect sees right now. */}
            <div className="mt-5 pt-4 border-t border-[color:var(--color-hairline)]">
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
                On your website now
              </p>
              <OnSite proof={reviewsProof} />
            </div>
          </Card>
        </Section>
      </div>

      {/* ── PMS-owned (honest deferral) ─────────────────────────────────── */}
      <section>
        <div className="v2-well border border-dashed border-[color:var(--color-hairline-strong)] p-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1">Lives in your PMS</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 max-w-2xl">
            These are clinical metrics your practice-management system owns. We don&apos;t estimate them — they&apos;ll
            surface here once two-way PMS sync (Integrations) is connected.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {a.pmsOwned.map((p) => (
              <div key={p.label} className="flex items-start gap-2">
                <span className="text-gray-400 dark:text-gray-500 mt-0.5" aria-hidden="true">·</span>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  <span className="font-medium text-gray-700 dark:text-gray-200">{p.label}</span> — {p.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ── Presentational helpers ────────────────────────────────────────────── */

function Section({ title, subtitle, children, flush }: { title: string; subtitle?: string; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className={flush ? '' : 'mb-8'}>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`v2-card p-5 ${className}`}>{children}</div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-500 dark:text-gray-400 italic">{children}</p>
}

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-500 dark:text-gray-400">no change</span>
  const up = value > 0
  return (
    <span className={`text-xs font-semibold tabular-nums font-mono-num ${up ? TONE_TEXT.ok : TONE_TEXT.urgent}`}>
      {up ? '▲' : '▼'} {Math.abs(value)} vs prev
    </span>
  )
}

/** A self-colored "vs previous period" delta in percentage points, tone-aware:
 *  improvement = ok (green), regression = urgent. `lowerIsBetter` flips which
 *  direction counts as improvement (no-show / cancellation = down is good). */
function RateTrend({ cur, prev, lowerIsBetter = false }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur == null || prev == null) return null
  const pts = Math.round((cur - prev) * 1000) / 10
  if (pts === 0) return <span className="text-gray-400 dark:text-gray-500"> · flat vs prev</span>
  const improved = lowerIsBetter ? pts < 0 : pts > 0
  return (
    <span className={`font-medium ${improved ? TONE_TEXT.ok : TONE_TEXT.urgent}`}>
      {' '}· {pts > 0 ? '▲' : '▼'} {Math.abs(pts)} pts vs prev
    </span>
  )
}

/** A neutral count delta (volume isn't "good" or "bad", just up/down). */
function VolumeTrend({ cur, prev }: { cur: number; prev: number }) {
  const d = cur - prev
  if (d === 0) return <span className="text-gray-400 dark:text-gray-500">flat vs previous period</span>
  return (
    <span className="text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
      {d > 0 ? '▲' : '▼'} {Math.abs(d)} vs previous period
    </span>
  )
}

/** Conversion-rate caption for a funnel's final step ("X% of Y"). Null when the
 *  denominator is zero — no fake 0%. */
function convNote(numerator: number | null, denominator: number, ofLabel: string): string | undefined {
  if (numerator == null || denominator <= 0) return undefined
  return `${((numerator / denominator) * 100).toFixed(0)}% of ${ofLabel}`
}

function Bars({ points, className = '' }: { points: TrendPoint[]; className?: string }) {
  const max = Math.max(1, ...points.map((p) => p.count))
  const total = points.reduce((s, p) => s + p.count, 0)
  const avg = points.length ? total / points.length : 0
  // Thin the x-axis labels so a 30/90-day daily chart doesn't crush (≤~12 shown).
  const labelEvery = Math.max(1, Math.ceil(points.length / 12))
  return (
    <div className={className}>
      <div className="relative h-32">
        {/* Average reference line — instant "is this bar above or below normal". */}
        {avg > 0 && (
          <div
            className="absolute inset-x-0 z-10 border-t border-dashed border-gray-300/80 dark:border-gray-600/70 pointer-events-none"
            style={{ bottom: `${(avg / max) * 100}%` }}
          >
            <span className="absolute -top-2 right-0 text-[10px] text-gray-400 dark:text-gray-500 bg-[color:var(--color-surface-1)] px-1">
              avg {Math.round(avg)}
            </span>
          </div>
        )}
        <div className="flex items-end gap-1 h-full border-b border-[color:var(--color-hairline)]">
          {points.map((p, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
              <span className="text-[10px] tabular-nums font-mono-num text-gray-600 dark:text-gray-300 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {p.count}
              </span>
              {/* Chart series 1 = teal (identity; the only teal allowed in data). */}
              <div
                className="w-full rounded-t bg-gradient-to-t from-teal-500/65 to-teal-400/90 dark:from-teal-500/55 dark:to-teal-300/80 group-hover:from-teal-500 group-hover:to-teal-400 transition-colors min-h-[2px]"
                style={{ height: `${(p.count / max) * 100}%` }}
                title={`${p.label}: ${p.count}`}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1 mt-1">
        {points.map((p, i) => (
          <span key={i} className="flex-1 text-[10px] text-gray-400 dark:text-gray-500 truncate text-center">
            {i % labelEvery === 0 ? p.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function RankBars({ rows, compact, emptyNote }: { rows: { label: string; value: number; href?: string }[]; compact?: boolean; emptyNote?: string }) {
  if (rows.length === 0) return <Empty>{emptyNote ?? 'Nothing to show yet.'}</Empty>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-gray-700 dark:text-gray-200 truncate">{r.label}</span>
              <span className="tabular-nums font-mono-num font-medium text-gray-500 dark:text-gray-400">{r.value}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div className="h-full rounded-full bg-teal-500/70 dark:bg-teal-400/60" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </>
        )
        return r.href ? (
          <Link key={r.label} href={r.href} className="block hover:opacity-80 transition-opacity" title={`See the ${r.label} patients`}>
            {inner}
          </Link>
        ) : (
          <div key={r.label}>{inner}</div>
        )
      })}
    </div>
  )
}

function Funnel({ steps }: { steps: { label: string; value: number | null; note?: string; href?: string }[] }) {
  const top = Math.max(1, ...steps.map((s) => s.value ?? 0))
  return (
    <div className="space-y-1.5">
      {steps.map((s) => {
        const w = s.value == null ? 0 : (s.value / top) * 100
        const inner = (
          <div className="relative h-9 rounded-[var(--r-sm)] bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-teal-500/25 dark:bg-teal-400/20" style={{ width: `${Math.max(w, s.value ? 6 : 0)}%` }} />
            <div className="relative h-full flex items-center justify-between px-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{s.label}</span>
              <span className="text-sm tabular-nums font-mono-num font-semibold text-gray-900 dark:text-gray-100">
                {s.value == null ? <span className="text-gray-500 dark:text-gray-400 font-normal">{s.note ?? '—'}</span> : s.value}
                {s.value != null && s.note && <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">{s.note}</span>}
              </span>
            </div>
          </div>
        )
        return s.href ? (
          <Link key={s.label} href={s.href} className="block hover:opacity-90">
            {inner}
          </Link>
        ) : (
          <div key={s.label}>{inner}</div>
        )
      })}
    </div>
  )
}

/** The reputation "proof" — what the review program puts on the public site:
 *  testimonials showcased (drill to each) + the live Google star snippet. */
function OnSite({ proof }: { proof: ReviewsProof }) {
  const hasRating = proof.googleRating != null && proof.googleCount > 0
  if (proof.featuredCount === 0 && !hasRating) {
    return <Empty>No reviews are showcased on your site yet — feature one from Reviews received.</Empty>
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-200">
        <span>
          <span className="font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">{proof.featuredCount}</span>{' '}
          {proof.featuredCount === 1 ? 'testimonial' : 'testimonials'} live on your site
        </span>
        {hasRating && (
          <span>
            <span className="font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">
              {proof.googleRating!.toFixed(1)}★
            </span>{' '}
            Google rating across {proof.googleCount} {proof.googleCount === 1 ? 'review' : 'reviews'}
          </span>
        )}
      </div>
      {proof.featured.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {proof.featured.map((f, i) => (
            <Link
              key={f.patientId ?? `t-${i}`}
              href="/reviews/received"
              className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700/40 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Manage featured testimonials"
            >
              {f.label}
            </Link>
          ))}
          {proof.featuredCount > proof.featured.length && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              +{proof.featuredCount - proof.featured.length} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** The retention "proof" — distinct patients a campaign provably rebooked, by
 *  outreach type, each chip drilling to that patient's rebooked visit. */
function WonBack({ data }: { data: RetentionAttribution }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700 dark:text-gray-200">
        <span className="font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">{data.totalWonBack}</span>{' '}
        {data.totalWonBack === 1 ? 'patient' : 'patients'} rebooked from outreach
      </p>
      <ul className="space-y-2.5">
        {data.buckets.map((b) => (
          <li key={b.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-gray-700 dark:text-gray-200">{b.label}</span>
              <span className="tabular-nums font-mono-num font-semibold text-gray-900 dark:text-gray-100">{b.count}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {b.patients.map((p) => (
                <Link
                  key={p.patientId}
                  href={p.appointmentId ? `/appointments?appt=${p.appointmentId}` : `/patients/${p.patientId}`}
                  className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700/40 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  title={`Open ${p.name}'s rebooked visit`}
                >
                  {p.name}
                </Link>
              ))}
              {b.count > b.patients.length && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  +{b.count - b.patients.length} more
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
