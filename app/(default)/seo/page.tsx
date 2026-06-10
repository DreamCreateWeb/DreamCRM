import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getSiteHealth, getOrganicAttribution, type CheckStatus } from '@/lib/services/seo'
import { getReviewStats } from '@/lib/services/reviews'
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
import { setGscSiteAction, disconnectGscAction } from './actions'
import ModuleHint from '@/components/onboarding/module-hint'

export const metadata = { title: 'SEO - DreamCRM' }
export const dynamic = 'force-dynamic'

const STATUS_ICON: Record<CheckStatus, { mark: string; cls: string }> = {
  pass: { mark: '✓', cls: 'text-emerald-600 dark:text-emerald-400' },
  warn: { mark: '~', cls: 'text-amber-600 dark:text-amber-400' },
  fail: { mark: '!', cls: 'text-rose-600 dark:text-rose-400' },
}

interface Props {
  searchParams: Promise<{ gscConnected?: string; gscError?: string }>
}

export default async function SeoPage({ searchParams }: Props) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')

  const { gscConnected, gscError } = await searchParams

  // The platform admin (real platform context) MANAGES the one shared Search
  // Console connection; clinics READ it scoped to their own pages — they
  // connect nothing. A platform admin in demo mode (tenantType 'clinic') sees
  // the clinic read view, which is the point of demo mode.
  const isManage = ctx.tenantType === 'platform'

  const [health, attr, reviews] = await Promise.all([
    getSiteHealth(ctx.organizationId),
    getOrganicAttribution(ctx.organizationId, 30),
    getReviewStats(ctx.organizationId),
  ])

  let gsc: GscConnectionView = { connected: false, status: 'disconnected', siteUrl: null }
  let sites: GscSite[] = []
  let perf: GscPerformance | null = null
  let gscLoadError: string | null = null
  let clinicScope: ClinicSeoResult | null = null

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
    try {
      clinicScope = await getClinicSeoPerformance(ctx.organizationId, 28)
      perf = clinicScope.perf
    } catch (err) {
      gscLoadError = (err as Error).message
    }
  }

  const scoreTone = health.score >= 80 ? 'ok' : health.score >= 60 ? 'warn' : 'bad'
  const now = new Date()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="seo" />
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
          {isManage ? 'Platform · Search Console' : `Search · ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
          {isManage ? 'Search Console' : 'SEO'}
        </h1>
        <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
          {isManage
            ? 'Connect once with the dreamcreatestudio.com Domain property. Every clinic’s SEO tab then reads it scoped to their own pages — clinics connect nothing.'
            : 'Straight answers, not impression graphs: how healthy your site is, and how much organic search actually turns into leads and booked visits — the number agencies can’t show you.'}
        </p>
      </div>

      {gscConnected && (
        <div className="mb-4 text-[13px] px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          Search Console connected.
        </div>
      )}
      {gscError && (
        <div className="mb-4 text-[13px] px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          Couldn&apos;t connect Search Console: {gscError}
        </div>
      )}

      {/* ── Site Health + Organic attribution (clinic only) ───────────── */}
      {!isManage && (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 mb-8">
        <section className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Site health</h2>
            <span
              className={`text-3xl font-bold tabular-nums ${
                scoreTone === 'ok'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : scoreTone === 'warn'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {health.score}
              <span className="text-base text-stone-400 dark:text-stone-500">/100</span>
            </span>
          </div>
          <ul className="space-y-2.5">
            {health.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5">
                <span className={`text-sm font-bold mt-0.5 ${STATUS_ICON[c.status].cls}`}>{STATUS_ICON[c.status].mark}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100">{c.label}</p>
                  <p className="text-[12px] text-stone-500 dark:text-stone-400">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/settings/clinic" className="inline-block mt-4 text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:underline">
            Fix the gaps in Settings → Clinic →
          </Link>
        </section>

        <section className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">Organic search → results</h2>
          <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-4">
            The funnel from search to booked patients · last {attr.windowDays} days
          </p>
          <div className={`grid ${perf ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mb-4`}>
            {perf && <AttrTile label="Clicks from search" value={perf.clicks} />}
            <AttrTile label="Leads from organic" value={attr.organicLeads} total={attr.totalLeads} />
            <AttrTile label="Bookings from organic" value={attr.organicBookings} total={attr.totalBookings} />
          </div>
          <p className="text-[12px] text-stone-500 dark:text-stone-400">
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
      <section className="mb-8 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Google Search Console</h2>
          {isManage && gsc.connected && (
            <form action={disconnectGscAction}>
              <button className="text-[12px] text-stone-400 hover:text-rose-600 dark:text-stone-500 dark:hover:text-rose-400">
                Disconnect
              </button>
            </form>
          )}
        </div>

        {gscLoadError ? (
          <p className="text-[13px] text-rose-600 dark:text-rose-400">
            Couldn&apos;t reach Search Console ({gscLoadError}).
            {isManage && (
              <>
                {' '}
                <a href="/api/oauth/gsc/start" className="underline">Reconnect</a>.
              </>
            )}
          </p>
        ) : !gscOAuthConfigured() ? (
          <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
            Google OAuth isn&apos;t configured on this environment yet.
          </p>
        ) : isManage ? (
          /* ── Platform admin: manage the one shared connection ── */
          !gsc.connected ? (
            <div>
              <p className="text-[13px] text-stone-600 dark:text-stone-300 mb-3 max-w-xl">
                Connect once with the <strong>Domain property</strong> for <strong>dreamcreatestudio.com</strong>. It
                covers the apex, www, and every clinic subdomain — so each clinic&apos;s SEO tab lights up
                automatically with their own scoped data. Clinics connect nothing.
              </p>
              <a
                href="/api/oauth/gsc/start"
                className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-semibold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
              >
                Connect Search Console
              </a>
            </div>
          ) : gsc.status === 'needs_site' ? (
            <div>
              <p className="text-[13px] text-stone-600 dark:text-stone-300 mb-3">
                Connected. Pick the property to track (the <strong>sc-domain:dreamcreatestudio.com</strong> Domain
                property is the one that covers every clinic):
              </p>
              {sites.length === 0 ? (
                <div className="text-[12px] text-stone-500 dark:text-stone-400 max-w-md space-y-1.5">
                  <p className="font-medium text-stone-600 dark:text-stone-300">
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
                    className="text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  >
                    {sites.map((s) => (
                      <option key={s.siteUrl} value={s.siteUrl}>
                        {s.siteUrl}
                      </option>
                    ))}
                  </select>
                  <button className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900">
                    Track this site
                  </button>
                </form>
              )}
            </div>
          ) : perf ? (
            <PerfBlock perf={perf} subtitle={`${gsc.siteUrl} · whole domain · last 28 days`} />
          ) : (
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">No Search Console data yet.</p>
          )
        ) : /* ── Clinic: scoped read of the shared connection, zero setup ── */
        !clinicScope?.platformConnected ? (
          <p className="text-[13px] text-stone-500 dark:text-stone-400 max-w-xl">
            Organic search analytics show up here automatically — nothing for you to set up. They turn on once Search
            Console is connected for the practice network.
          </p>
        ) : clinicScope.customDomain ? (
          <p className="text-[13px] text-stone-500 dark:text-stone-400 max-w-xl">
            You&apos;re on a custom domain ({clinicScope.scopeLabel}). Per-domain Search Console data is on the roadmap —
            until then, organic clicks for it aren&apos;t shown here.
          </p>
        ) : perf && perf.impressions > 0 ? (
          <PerfBlock perf={perf} subtitle="Your site · last 28 days" />
        ) : (
          <p className="text-[13px] text-stone-500 dark:text-stone-400 max-w-xl">
            No Search Console clicks yet for your site. This fills in automatically as Google indexes your pages and
            patients start finding you in search (data lags ~2 days).
          </p>
        )}
      </section>

      {!isManage && (
      <>
      {/* ── Reviews as a ranking signal ───────────────────────────────── */}
      <section className="mb-8 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Reviews — a top local ranking signal</h2>
          <Link href="/reviews" className="text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:underline">
            Manage reviews →
          </Link>
        </div>
        <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-3">
          Review volume + recency is one of the strongest local-search factors. Keep the flow steady from the Reviews
          module.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MiniStat label="Requests sent · 30d" value={reviews.sent30d} />
          <MiniStat label="Reviews left · 30d" value={reviews.completed30d} tone="ok" />
          <MiniStat label="Ready to ask" value={reviews.eligibleCount} />
        </div>
      </section>

      {/* ── Coming next ───────────────────────────────────────────────── */}
      <section>
        <div className="bg-stone-100 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Coming next
          </p>
          <ul className="text-[12px] text-stone-600 dark:text-stone-300 space-y-1">
            <li>· Google Business Profile: posting (from your blog) + profile insights + review replies (access request in progress)</li>
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
    <div className="px-3 py-3 rounded-lg bg-stone-50 dark:bg-stone-800/40">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100 mt-0.5">
        {value.toLocaleString()}
        {total != null && <span className="text-sm font-normal text-stone-400 dark:text-stone-500"> / {total}</span>}
      </p>
      {pct != null && <p className="text-[11px] text-stone-400 dark:text-stone-500">{pct}% from organic</p>}
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-800/40">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p
        className={`text-xl font-bold tabular-nums mt-0.5 ${tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-900 dark:text-stone-100'}`}
      >
        {value}
      </p>
    </div>
  )
}

function PerfBlock({ perf, subtitle }: { perf: GscPerformance; subtitle: string }) {
  return (
    <div>
      <p className="text-[12px] text-stone-400 dark:text-stone-500 mb-3 tabular-nums">{subtitle}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MiniStat label="Clicks" value={perf.clicks.toLocaleString()} tone="ok" />
        <MiniStat label="Impressions" value={perf.impressions.toLocaleString()} />
        <MiniStat label="Avg. CTR" value={`${(perf.ctr * 100).toFixed(1)}%`} />
        <MiniStat label="Avg. position" value={perf.position.toFixed(1)} />
      </div>
      {perf.topQueries.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Top search queries
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500">
              <tr>
                <th className="py-1">Query</th>
                <th className="py-1 text-right">Clicks</th>
                <th className="py-1 text-right">Impr.</th>
                <th className="py-1 text-right">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {perf.topQueries.map((q) => (
                <tr key={q.query} className="border-t border-stone-100 dark:border-stone-700/40">
                  <td className="py-1.5 text-stone-800 dark:text-stone-100">{q.query}</td>
                  <td className="py-1.5 text-right tabular-nums text-stone-600 dark:text-stone-300">{q.clicks}</td>
                  <td className="py-1.5 text-right tabular-nums text-stone-500 dark:text-stone-400">{q.impressions}</td>
                  <td className="py-1.5 text-right tabular-nums text-stone-500 dark:text-stone-400">{q.position.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
