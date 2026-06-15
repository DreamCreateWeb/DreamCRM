import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant, requirePlan } from '@/lib/auth/context'
import { getClinicAnalytics, type TrendPoint } from '@/lib/services/analytics'
import { getSiteTraffic } from '@/lib/services/site-analytics'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { TONE_TEXT } from '@/lib/ui/encodings'

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
  const [a, traffic] = await Promise.all([
    getClinicAnalytics(ctx.organizationId, windowDays),
    getSiteTraffic(ctx.organizationId, windowDays),
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
            <span className="text-xs font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              Premium
            </span>
          </span>
        }
        title="Analytics"
        subtitle="The numbers a CRM can honestly measure — acquisition, schedule health, recall and reputation. Clinical production stays in your PMS; we don't fake it."
        actions={
          <div className="flex items-center gap-1.5">
            {[30, 90].map((d) => (
              <ActionButton
                key={d}
                href={`/analytics?days=${d}`}
                variant={windowDays === d ? 'primary' : 'secondary'}
                size="sm"
              >
                {d} days
              </ActionButton>
            ))}
          </div>
        }
      />

      {/* ── Acquisition ─────────────────────────────────────────────────── */}
      <Section title="Acquisition" subtitle={`New patients + where they came from · last ${windowDays} days`}>
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-4">
          <Card>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">New patients</p>
                <p className="text-4xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 mt-0.5">{a.acquisition.newPatients}</p>
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
              <RankBars rows={a.acquisition.sourceMix.map((s) => ({ label: humanize(s.source), value: s.count }))} />
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
              { label: 'Converted to patient', value: a.acquisition.websiteFunnel.converted },
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
              <KpiStat label="Listing views" value={a.acquisition.gbp.impressions} />
              <KpiStat label="Calls" value={a.acquisition.gbp.calls} href="/seo" />
              <KpiStat label="Directions" value={a.acquisition.gbp.directions} href="/seo" />
              <KpiStat label="Bookings" value={a.acquisition.gbp.bookings} href="/seo" />
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Connect your{' '}
              <Link href="/integrations" className="text-teal-700 dark:text-teal-400 hover:underline">
                Google Business Profile
              </Link>{' '}
              to see calls, direction requests, and bookings from your map-pack listing here.
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

      {/* ── Schedule health ─────────────────────────────────────────────── */}
      {/* Every headline number drills into the filtered Appointments view that
          explains it (design doctrine: numbers are never dead ends). */}
      <Section title="Schedule health" subtitle={`Appointments with a visit time in the last ${windowDays} days`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-1.5">
          <KpiStat
            label="Appointments"
            value={a.schedule.total}
            href="/appointments?window=past_30d"
          />
          <KpiStat
            label="Confirmation rate"
            value={confirmableDenom === 0 ? '—' : lowVolConfirmation ? `${a.schedule.confirmed}/${confirmableDenom}` : pct(a.schedule.confirmationRate)}
            sub="who still need a text →"
            tone={lowVolConfirmation || a.schedule.confirmationRate == null ? undefined : 'ok'}
            href="/appointments?attention=unconfirmed"
          />
          <KpiStat
            label="No-show rate"
            value={a.schedule.attended === 0 ? '—' : lowVolAttended ? `${a.schedule.noShow} of ${a.schedule.attended}` : pct(a.schedule.noShowRate)}
            tone={lowVolAttended || a.schedule.noShowRate == null ? undefined : a.schedule.noShowRate > a.schedule.benchmarkNoShowRate ? 'urgent' : 'ok'}
            sub={a.schedule.attended === 0 ? 'no visits yet' : lowVolAttended ? 'visits so far' : `benchmark ${pct(a.schedule.benchmarkNoShowRate)}`}
            href="/appointments?window=past_30d&attention=no_show"
          />
          <KpiStat
            label="Cancellation rate"
            value={a.schedule.total === 0 ? '—' : lowVolCancellation ? `${a.schedule.cancelled}/${a.schedule.total}` : pct(a.schedule.cancellationRate)}
            sub={a.schedule.total === 0 ? undefined : lowVolCancellation ? 'booked so far' : `${a.schedule.cancelled} of ${a.schedule.total} booked`}
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
                <RankBars rows={a.schedule.bySource.map((s) => ({ label: humanize(s.source), value: s.count }))} compact />
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
                { label: 'Booked', value: a.recall.outreach.booked, href: '/marketing' },
              ]}
            />
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
                { label: 'Reviews left', value: a.reputation.completed, href: '/reviews/received' },
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

function Bars({ points, className = '' }: { points: TrendPoint[]; className?: string }) {
  const max = Math.max(1, ...points.map((p) => p.count))
  return (
    <div className={`flex items-end gap-1 h-24 ${className}`}>
      {points.map((p, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 group">
          <span className="text-xs tabular-nums font-mono-num text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100">{p.count}</span>
          {/* Chart series 1 = teal (identity; the only teal allowed in data). */}
          <div
            className="w-full rounded-t bg-teal-500/80 dark:bg-teal-400/70 min-h-[2px]"
            style={{ height: `${(p.count / max) * 100}%` }}
            title={`${p.label}: ${p.count}`}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate w-full text-center">{p.label}</span>
        </div>
      ))}
    </div>
  )
}

function RankBars({ rows, compact, emptyNote }: { rows: { label: string; value: number }[]; compact?: boolean; emptyNote?: string }) {
  if (rows.length === 0) return <Empty>{emptyNote ?? 'No data.'}</Empty>
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-gray-700 dark:text-gray-200 truncate">{r.label}</span>
            <span className="tabular-nums font-mono-num font-medium text-gray-500 dark:text-gray-400">{r.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full bg-teal-500/70 dark:bg-teal-400/60" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
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
