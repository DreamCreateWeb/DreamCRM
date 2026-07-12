import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant, requirePlan } from '@/lib/auth/context'
import { getSiteHealth, getOrganicAttribution, type CheckStatus } from '@/lib/services/seo'
import { getReviewStats } from '@/lib/services/reviews'
import { getSiteTraffic } from '@/lib/services/site-analytics'
import {
  getGscConnectionView,
  listGscSites,
  getGscPerformance,
  getClinicSeoPerformance,
  gscOAuthConfigured,
  type GscPerformance,
  type GscSite,
  type GscConnectionView,
  type ClinicSeoResult,
} from '@/lib/services/gsc'
import { getGbpLocalMetrics, type GbpLocalMetrics } from '@/lib/services/gbp-metrics'
import { setGscSiteAction, disconnectGscAction } from './actions'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = { title: 'SEO - DreamCRM' }
export const dynamic = 'force-dynamic'

// Each site-health check pairs a symbol + a color + an accessible label so the
// meaning never rides on color alone (design-system rule 3).
const STATUS_ICON: Record<CheckStatus, { mark: string; cls: string; label: string }> = {
  pass: { mark: '✓', cls: 'text-emerald-600 dark:text-emerald-400', label: 'Passing' },
  warn: { mark: '~', cls: 'text-amber-600 dark:text-amber-400', label: 'Needs attention' },
  fail: { mark: '!', cls: 'text-rose-600 dark:text-rose-400', label: 'Failing' },
}

interface Props {
  searchParams: Promise<{ gscConnected?: string; gscError?: string }>
}

export default async function SeoPage({ searchParams }: Props) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  // SEO is a Pro+ clinic module. requirePlan no-ops for the platform-manage
  // view (tenantType 'platform'), so the platform admin keeps the connect view.
  await requirePlan(ctx, 'pro', 'seo')

  const { gscConnected, gscError } = await searchParams

  // The platform admin (real platform context) MANAGES the one shared Search
  // Console connection; clinics READ it scoped to their own pages — they
  // connect nothing. A platform admin in demo mode (tenantType 'clinic') sees
  // the clinic read view, which is the point of demo mode.
  const isManage = ctx.tenantType === 'platform'

  const [health, attr, reviews, traffic] = await Promise.all([
    getSiteHealth(ctx.organizationId),
    getOrganicAttribution(ctx.organizationId, 30),
    getReviewStats(ctx.organizationId),
    getSiteTraffic(ctx.organizationId, 30),
  ])

  let gsc: GscConnectionView = { connected: false, status: 'disconnected', siteUrl: null }
  let sites: GscSite[] = []
  let perf: GscPerformance | null = null
  let gscLoadError: string | null = null
  let clinicScope: ClinicSeoResult | null = null
  // Google Business local metrics (calls/directions/bookings + top keywords) —
  // clinic surface only; best-effort + demo-safe (never throws). Null when not
  // loaded (the manage view doesn't render the GBP metrics card).
  let gbp: GbpLocalMetrics | null = null

  if (isManage) {
    gsc = await getGscConnectionView(ctx.organizationId)
    if (gsc.connected && gsc.status === 'needs_site') {
      try {
        sites = await listGscSites(ctx.organizationId)
      } catch (err) {
        gscLoadError = (err as Error).message
      }
    } else if (gsc.connected && gsc.siteUrl) {
      try {
        perf = await getGscPerformance(ctx.organizationId, 28)
      } catch (err) {
        gscLoadError = (err as Error).message
      }
    }
  } else {
    // The clinic-scoped GSC read + the GBP local metrics are independent —
    // fetch in parallel (GBP is best-effort and never throws).
    const [clinicResult, gbpMetrics] = await Promise.all([
      getClinicSeoPerformance(ctx.organizationId, 28)
        .then((r) => ({ ok: true as const, r }))
        .catch((err) => ({ ok: false as const, err: err as Error })),
      getGbpLocalMetrics(ctx.organizationId, { days: 30 }),
    ])
    if (clinicResult.ok) {
      clinicScope = clinicResult.r
      perf = clinicResult.r.perf
    } else {
      gscLoadError = clinicResult.err.message
    }
    gbp = gbpMetrics
  }

  const scoreTone = health.score >= 80 ? 'ok' : health.score >= 60 ? 'warn' : 'bad'
  const now = new Date()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="seo" />
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={
          isManage
            ? 'Platform · Search Console'
            : `Search · ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`
        }
        title={isManage ? 'Search Console' : 'SEO'}
        subtitle={
          isManage
            ? 'Connect once with the dreamcreatestudio.com Domain property. Every clinic’s SEO tab then reads it scoped to their own pages — clinics connect nothing.'
            : 'Straight answers, not impression graphs: how healthy your site is, and how much organic search actually turns into leads and booked visits — the number agencies can’t show you.'
        }
      />

      {gscConnected && (
        <div className="mb-4 text-sm px-4 py-2.5 rounded-[var(--r-md)] bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          Search Console connected.
        </div>
      )}
      {gscError && (
        <div className="mb-4 text-sm px-4 py-2.5 rounded-[var(--r-md)] bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          Couldn&apos;t connect Search Console: {gscError}
        </div>
      )}

      {/* ── Site Health + Organic attribution (clinic only) ───────────── */}
      {!isManage && (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 mb-8">
        <section className="v2-card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Site health</h2>
            <span
              className={`text-3xl font-bold tabular-nums font-mono-num ${
                scoreTone === 'ok'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : scoreTone === 'warn'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {health.score}
              <span className="text-base text-gray-500 dark:text-gray-400">/100</span>
            </span>
          </div>
          <ul className="space-y-2.5">
            {health.checks.map((c) => {
              const icon = STATUS_ICON[c.status]
              return (
                <li key={c.id} className="flex items-start gap-2.5">
                  <span
                    className={`text-sm font-bold mt-0.5 ${icon.cls}`}
                    title={icon.label}
                    aria-label={icon.label}
                  >
                    {icon.mark}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{c.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.detail}</p>
                  </div>
                </li>
              )
            })}
          </ul>
          <Link href="/website/content" className="inline-block mt-4 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
            Fix the gaps in Website → Content →
          </Link>
        </section>

        <section className="v2-card p-5">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Organic search → results</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            The funnel from search to booked patients · last {attr.windowDays} days
          </p>
          {/* Total visits vs search clicks — two honestly-different numbers
              side by side so the clinic understands the distinction. */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="v2-well px-3 py-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                Visits (your site)
              </p>
              <p className="text-2xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 mt-0.5">
                {traffic.total.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">all visits, every channel</p>
            </div>
            <div className="v2-well px-3 py-3">
              <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                Clicks from Google
              </p>
              <p className="text-2xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 mt-0.5">
                {perf ? perf.clicks.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {perf ? 'from Google search only' : 'connect Search Console'}
              </p>
            </div>
          </div>
          <div className={`grid ${perf ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mb-4`}>
            {perf && <AttrTile label="Clicks from search" value={perf.clicks} />}
            <AttrTile label="Leads from organic" value={attr.organicLeads} total={attr.totalLeads} />
            <AttrTile label="Bookings from organic" value={attr.organicBookings} total={attr.totalBookings} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {perf
              ? 'Search Console clicks → the leads + bookings our forms attribute to organic search. The whole funnel, one screen.'
              : isManage
                ? 'We attribute every contact + booking back to its traffic source. Connect Search Console below to add clicks + queries on top.'
                : 'We attribute every contact + booking back to its traffic source. Search Console clicks appear here automatically once your pages start ranking.'}
          </p>
        </section>
      </div>
      )}

      {/* ── Search Console ────────────────────────────────────────────── */}
      <section className="v2-card mb-8 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Google Search Console</h2>
          {isManage && gsc.connected && (
            <form action={disconnectGscAction}>
              <button className="text-xs text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400">
                Disconnect
              </button>
            </form>
          )}
        </div>

        {gscLoadError ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">
            Couldn&apos;t reach Search Console ({gscLoadError}).
            {isManage && (
              <>
                {' '}
                <a href="/api/oauth/gsc/start" className="underline">Reconnect</a>.
              </>
            )}
          </p>
        ) : !gscOAuthConfigured() ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            Google sign-in isn&apos;t set up on this environment yet.
          </p>
        ) : isManage ? (
          /* ── Platform admin: manage the one shared connection ── */
          !gsc.connected ? (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 max-w-xl">
                Connect once with the <strong>Domain property</strong> for <strong>dreamcreatestudio.com</strong>. It
                covers the apex, www, and every clinic subdomain — so each clinic&apos;s SEO tab lights up
                automatically with their own scoped data. Clinics connect nothing.
              </p>
              <a
                href="/api/oauth/gsc/start"
                className="inline-flex items-center px-4 py-2 rounded-[var(--r-sm)] text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
              >
                Connect Search Console
              </a>
            </div>
          ) : gsc.status === 'needs_site' ? (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                Connected. Pick the property to track (the <strong>sc-domain:dreamcreatestudio.com</strong> Domain
                property is the one that covers every clinic):
              </p>
              {sites.length === 0 ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 max-w-md space-y-1.5">
                  <p className="font-medium text-gray-600 dark:text-gray-300">
                    No verified properties on this Google account yet.
                  </p>
                  <p>
                    Add your site at{' '}
                    <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="underline">
                      Google Search Console
                    </a>{' '}
                    and verify ownership — a DNS TXT record on your domain is easiest, and verifying{' '}
                    <strong>dreamcreatestudio.com</strong> as a Domain property covers every clinic subdomain at once.
                    Then reload this page.
                  </p>
                  <p>Make sure you verify with the same Google account you just connected here.</p>
                </div>
              ) : (
                <form action={setGscSiteAction} className="flex items-center gap-2">
                  <select
                    name="siteUrl"
                    className="text-sm px-2 py-1.5 rounded-[var(--r-sm)] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  >
                    {sites.map((s) => (
                      <option key={s.siteUrl} value={s.siteUrl}>
                        {s.siteUrl}
                      </option>
                    ))}
                  </select>
                  <button className="text-sm font-semibold px-3 py-1.5 rounded-[var(--r-sm)] bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300">
                    Track this site
                  </button>
                </form>
              )}
            </div>
          ) : perf ? (
            <PerfBlock perf={perf} subtitle={`${gsc.siteUrl} · whole domain · last 28 days`} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No Search Console data yet.</p>
          )
        ) : /* ── Clinic: scoped read of the shared connection, zero setup ── */
        !clinicScope?.platformConnected ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl">
            Organic search analytics show up here automatically — nothing for you to set up. They turn on once Search
            Console is connected for the practice network.
          </p>
        ) : clinicScope.customDomain ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl">
            You&apos;re on a custom domain ({clinicScope.scopeLabel}). Per-domain Search Console data is on the roadmap —
            until then, organic clicks for it aren&apos;t shown here.
          </p>
        ) : perf && perf.impressions > 0 ? (
          <PerfBlock perf={perf} subtitle="Your site · last 28 days" />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl">
            No Search Console clicks yet for your site. This fills in automatically as Google indexes your pages and
            patients start finding you in search (data lags ~2 days).
          </p>
        )}
      </section>

      {!isManage && (
      <>
      {/* ── Reviews as a ranking signal ───────────────────────────────── */}
      <section className="v2-card mb-8 p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Reviews — a top local ranking signal</h2>
          <Link href="/growth/reviews" className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
            Manage reviews →
          </Link>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Review volume + recency is one of the strongest local-search factors. Keep the flow steady from the Reviews
          module.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MiniStat label="Requests sent · 30d" value={reviews.sent30d} />
          <MiniStat label="Reviews left · 30d" value={reviews.completed30d} tone="ok" />
          <MiniStat label="Ready to ask" value={reviews.eligibleCount} />
        </div>
      </section>

      {/* ── Google Business Profile — local performance ───────────────── */}
      <section className="v2-card mb-8 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Google Business Profile</h2>
          {gbp?.connected ? (
            <Link href="/growth/reviews/received" className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
              Manage reviews →
            </Link>
          ) : (
            <Link href="/integrations" className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline">
              Connect →
            </Link>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-2xl">
          Your Google Business Profile is the single biggest driver of the local map results — where most new dental
          patients find you. {gbp?.connected
            ? `How your listing did in the last ${gbp.windowDays} days.`
            : 'Connect it to see how many people find and act on your listing.'}
        </p>

        {!gbp?.connected ? (
          /* Not connected — calm, honest connect prompt (no fabricated numbers). */
          <div className="v2-well p-4 max-w-2xl">
            <p className="text-sm text-gray-700 dark:text-gray-200 font-medium mb-1">
              See your Google Business performance here
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Connect your Google Business Profile to pull real impressions, calls, direction requests, website clicks,
              bookings, and the top search terms people use to find you — alongside your Search Console clicks above.
            </p>
            <Link
              href="/integrations"
              className="inline-flex items-center px-4 py-2 rounded-[var(--r-sm)] text-sm font-semibold bg-teal-500 text-white hover:bg-teal-600 dark:bg-teal-400 dark:text-gray-900 dark:hover:bg-teal-300"
            >
              Connect Google Business
            </Link>
          </div>
        ) : (
          <>
            {gbp.error ? (
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                Connected, but we couldn&apos;t load metrics this time ({gbp.error}). The numbers below will fill in
                next time you open this page.
              </p>
            ) : null}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
              <MiniStat label="Listing views" value={gbp.impressions.toLocaleString()} tone="ok" />
              <MiniStat label="Calls" value={gbp.calls.toLocaleString()} />
              <MiniStat label="Directions" value={gbp.directions.toLocaleString()} />
              <MiniStat label="Website clicks" value={gbp.websiteClicks.toLocaleString()} />
              <MiniStat label="Bookings" value={gbp.bookings.toLocaleString()} />
            </div>
            {gbp.topKeywords.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
                  Top search terms on Google
                </p>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="py-1 font-semibold">Search term</th>
                      <th className="py-1 text-right font-semibold">Impressions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gbp.topKeywords.map((k) => (
                      <tr key={k.term} className="border-t border-[color:var(--color-hairline)]">
                        <td className="py-1.5 text-gray-800 dark:text-gray-100">{k.term}</td>
                        <td className="py-1.5 text-right tabular-nums font-mono-num text-gray-600 dark:text-gray-300">
                          {k.count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Grouped by month by Google; terms with very few impressions are hidden. Data lags ~2-3 days.
                </p>
              </div>
            ) : !gbp.error ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No search terms above Google&apos;s reporting threshold yet — they appear as your listing gets more
                impressions.
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* ── Search appearance moved to Pages — the #meta anchor keeps old
          deep links landing somewhere honest. ─────────────────────────── */}
      <section id="meta" className="v2-well mb-8 p-4 scroll-mt-28">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Per-page titles &amp; descriptions moved to the Pages manager —{' '}
          <Link href="/website/pages" className="font-medium text-teal-700 dark:text-teal-400 hover:underline underline-offset-4">
            open Pages →
          </Link>
        </p>
      </section>


      {/* ── Coming next ───────────────────────────────────────────────── */}
      <section>
        <div className="v2-well p-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Coming next
          </p>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
            <li>· Google Business posting (from your blog) + offers &amp; events straight to your listing</li>
            <li>· Core Web Vitals (page speed) on your key pages</li>
            <li>· Rank tracking for your top local terms</li>
          </ul>
        </div>
      </section>
      </>
      )}
    </div>
  )
}

function AttrTile({ label, value, total }: { label: string; value: number; total?: number }) {
  const pct = total != null && total > 0 ? Math.round((value / total) * 100) : null
  return (
    <div className="v2-well px-3 py-3">
      <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 mt-0.5">
        {value.toLocaleString()}
        {total != null && <span className="text-sm font-normal text-gray-500 dark:text-gray-400"> / {total}</span>}
      </p>
      {pct != null && <p className="text-xs text-gray-500 dark:text-gray-400">{pct}% from organic</p>}
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' }) {
  return (
    <div className="v2-well px-3 py-2">
      <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{label}</p>
      <p
        className={`text-xl font-bold tabular-nums font-mono-num mt-0.5 ${tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-900 dark:text-gray-100'}`}
      >
        {value}
      </p>
    </div>
  )
}

function PerfBlock({ perf, subtitle }: { perf: GscPerformance; subtitle: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 tabular-nums font-mono-num">{subtitle}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MiniStat label="Clicks" value={perf.clicks.toLocaleString()} tone="ok" />
        <MiniStat label="Impressions" value={perf.impressions.toLocaleString()} />
        <MiniStat label="Avg. click rate" value={`${(perf.ctr * 100).toFixed(1)}%`} />
        <MiniStat label="Avg. position" value={perf.position.toFixed(1)} />
      </div>
      {perf.topQueries.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Top search queries
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <tr>
                <th className="py-1 font-semibold">Query</th>
                <th className="py-1 text-right font-semibold">Clicks</th>
                <th className="py-1 text-right font-semibold">Impr.</th>
                <th className="py-1 text-right font-semibold">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {perf.topQueries.map((q) => (
                <tr key={q.query} className="border-t border-[color:var(--color-hairline)]">
                  <td className="py-1.5 text-gray-800 dark:text-gray-100">{q.query}</td>
                  <td className="py-1.5 text-right tabular-nums font-mono-num text-gray-600 dark:text-gray-300">{q.clicks}</td>
                  <td className="py-1.5 text-right tabular-nums font-mono-num text-gray-500 dark:text-gray-400">{q.impressions}</td>
                  <td className="py-1.5 text-right tabular-nums font-mono-num text-gray-500 dark:text-gray-400">{q.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
