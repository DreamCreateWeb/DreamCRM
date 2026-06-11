import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant, requirePlan } from '@/lib/auth/context'
import { getSiteHealth, getOrganicAttribution, type CheckStatus } from '@/lib/services/seo'
import { getReviewStats, getReviewConfig, reviewPlatformUrl } from '@/lib/services/reviews'
import { getSiteTraffic } from '@/lib/services/site-analytics'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'
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

  const [health, attr, reviews, traffic, reviewConfig, clinicSite] = await Promise.all([
    getSiteHealth(ctx.organizationId),
    getOrganicAttribution(ctx.organizationId, 30),
    getReviewStats(ctx.organizationId),
    getSiteTraffic(ctx.organizationId, 30),
    getReviewConfig(ctx.organizationId),
    getClinicSiteBySlug(ctx.organizationSlug),
  ])
  // The clinic's actual Google review write-link, if they configured a Place ID.
  const googleReviewUrl = reviewPlatformUrl('google', reviewConfig)
  // NAP (name/address/phone) shown inline on the GBP card so the clinic can
  // copy it into Google Business Profile verbatim — consistency is the signal.
  const nap = clinicSite
    ? {
        name: clinicSite.profile.displayName ?? clinicSite.orgName,
        phone: clinicSite.primaryLocation?.phone ?? clinicSite.profile.phone ?? null,
        address: [
          clinicSite.primaryLocation?.addressLine1 ?? clinicSite.profile.addressLine1,
          clinicSite.primaryLocation?.city ?? clinicSite.profile.city,
          clinicSite.primaryLocation?.state ?? clinicSite.profile.state,
          clinicSite.primaryLocation?.postalCode ?? clinicSite.profile.postalCode,
        ]
          .filter(Boolean)
          .join(', '),
      }
    : null

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
        <div className="mb-4 text-sm px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
          Search Console connected.
        </div>
      )}
      {gscError && (
        <div className="mb-4 text-sm px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
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
              <span className="text-base text-stone-500 dark:text-stone-400">/100</span>
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
                    <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{c.label}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{c.detail}</p>
                  </div>
                </li>
              )
            })}
          </ul>
          <Link href="/settings/clinic" className="inline-block mt-4 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">
            Fix the gaps in Settings → Clinic →
          </Link>
        </section>

        <section className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">Organic search → results</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
            The funnel from search to booked patients · last {attr.windowDays} days
          </p>
          {/* Total visits vs search clicks — two honestly-different numbers
              side by side so the clinic understands the distinction. */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="px-3 py-3 rounded-lg bg-stone-50 dark:bg-stone-800/40">
              <p className="text-xs uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                Visits (your site)
              </p>
              <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100 mt-0.5">
                {traffic.total.toLocaleString()}
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">all visits, every channel</p>
            </div>
            <div className="px-3 py-3 rounded-lg bg-stone-50 dark:bg-stone-800/40">
              <p className="text-xs uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                Clicks from Google
              </p>
              <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100 mt-0.5">
                {perf ? perf.clicks.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {perf ? 'from Google search only' : 'connect Search Console'}
              </p>
            </div>
          </div>
          <div className={`grid ${perf ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mb-4`}>
            {perf && <AttrTile label="Clicks from search" value={perf.clicks} />}
            <AttrTile label="Leads from organic" value={attr.organicLeads} total={attr.totalLeads} />
            <AttrTile label="Bookings from organic" value={attr.organicBookings} total={attr.totalBookings} />
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">
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
              <button className="text-xs text-stone-500 hover:text-rose-600 dark:text-stone-400 dark:hover:text-rose-400">
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
          <p className="text-sm text-stone-500 dark:text-stone-400 italic">
            Google OAuth isn&apos;t configured on this environment yet.
          </p>
        ) : isManage ? (
          /* ── Platform admin: manage the one shared connection ── */
          !gsc.connected ? (
            <div>
              <p className="text-sm text-stone-600 dark:text-stone-300 mb-3 max-w-xl">
                Connect once with the <strong>Domain property</strong> for <strong>dreamcreatestudio.com</strong>. It
                covers the apex, www, and every clinic subdomain — so each clinic&apos;s SEO tab lights up
                automatically with their own scoped data. Clinics connect nothing.
              </p>
              <a
                href="/api/oauth/gsc/start"
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
              >
                Connect Search Console
              </a>
            </div>
          ) : gsc.status === 'needs_site' ? (
            <div>
              <p className="text-sm text-stone-600 dark:text-stone-300 mb-3">
                Connected. Pick the property to track (the <strong>sc-domain:dreamcreatestudio.com</strong> Domain
                property is the one that covers every clinic):
              </p>
              {sites.length === 0 ? (
                <div className="text-xs text-stone-500 dark:text-stone-400 max-w-md space-y-1.5">
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
                  <button className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900">
                    Track this site
                  </button>
                </form>
              )}
            </div>
          ) : perf ? (
            <PerfBlock perf={perf} subtitle={`${gsc.siteUrl} · whole domain · last 28 days`} />
          ) : (
            <p className="text-sm text-stone-500 dark:text-stone-400 italic">No Search Console data yet.</p>
          )
        ) : /* ── Clinic: scoped read of the shared connection, zero setup ── */
        !clinicScope?.platformConnected ? (
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-xl">
            Organic search analytics show up here automatically — nothing for you to set up. They turn on once Search
            Console is connected for the practice network.
          </p>
        ) : clinicScope.customDomain ? (
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-xl">
            You&apos;re on a custom domain ({clinicScope.scopeLabel}). Per-domain Search Console data is on the roadmap —
            until then, organic clicks for it aren&apos;t shown here.
          </p>
        ) : perf && perf.impressions > 0 ? (
          <PerfBlock perf={perf} subtitle="Your site · last 28 days" />
        ) : (
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-xl">
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
          <Link href="/reviews" className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">
            Manage reviews →
          </Link>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-3">
          Review volume + recency is one of the strongest local-search factors. Keep the flow steady from the Reviews
          module.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MiniStat label="Requests sent · 30d" value={reviews.sent30d} />
          <MiniStat label="Reviews left · 30d" value={reviews.completed30d} tone="ok" />
          <MiniStat label="Ready to ask" value={reviews.eligibleCount} />
        </div>
      </section>

      {/* ── Google Business Profile checklist ─────────────────────────── */}
      <section className="mb-8 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Google Business Profile</h2>
          <a
            href="https://business.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            Open Google Business →
          </a>
        </div>
        <p className="text-xs text-stone-500 dark:text-stone-400 mb-4 max-w-2xl">
          Your Google Business Profile is the single biggest driver of the local map pack — where most new dental
          patients find you. Full in-app management is on the roadmap; for now here&apos;s the checklist that moves the
          needle most, done in Google directly.
        </p>
        <ol className="space-y-4">
          <GbpStep n={1} title="Claim &amp; verify your profile">
            Search your practice name on Google. If you see &ldquo;Own this business?&rdquo; claim it and complete
            verification (postcard, phone, or video). An unverified profile can&apos;t rank or be edited.
          </GbpStep>
          <GbpStep n={2} title="Match your name, address &amp; phone exactly">
            Google rewards consistency between your profile and your website. Use these — copied from your site — verbatim:
            {nap ? (
              <div className="mt-2 rounded-lg bg-stone-50 dark:bg-stone-800/40 p-3 text-stone-700 dark:text-stone-200 space-y-0.5">
                <p className="font-medium">{nap.name}</p>
                {nap.address ? <p className="tabular-nums">{nap.address}</p> : <p className="italic text-stone-400">Add your address in Settings → Clinic</p>}
                {nap.phone ? <p className="tabular-nums">{nap.phone}</p> : <p className="italic text-stone-400">Add your phone in Settings → Clinic</p>}
              </div>
            ) : (
              <span className="block mt-1 italic text-stone-400">
                Fill in your clinic name, address, and phone in Settings → Clinic so they match Google.
              </span>
            )}
          </GbpStep>
          <GbpStep n={3} title="Set the right categories">
            Primary category &ldquo;Dentist&rdquo; (or &ldquo;Pediatric dentist&rdquo; / &ldquo;Cosmetic dentist&rdquo;
            if that&apos;s your focus), then add secondary categories for the services you offer. Categories are a top
            local-ranking factor.
          </GbpStep>
          <GbpStep n={4} title="Share your review link">
            Steady, recent reviews lift map-pack ranking. Add your Google review link to receipts, emails, and your front
            desk.
            {googleReviewUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="text-xs px-2 py-1 rounded bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 break-all">
                  {googleReviewUrl}
                </code>
                <a
                  href={googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
                >
                  Test it →
                </a>
              </div>
            ) : (
              <span className="block mt-1 italic text-stone-400">
                Add your Google Place ID in{' '}
                <Link href="/reviews" className="not-italic text-violet-600 dark:text-violet-400 hover:underline">
                  Reviews
                </Link>{' '}
                and your one-click review link appears here.
              </span>
            )}
          </GbpStep>
        </ol>
      </section>

      {/* ── Coming next ───────────────────────────────────────────────── */}
      <section>
        <div className="bg-stone-100 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Coming next
          </p>
          <ul className="text-xs text-stone-600 dark:text-stone-300 space-y-1">
            <li>· Google Business Profile in-app: posting (from your blog) + profile insights + review replies (access request in progress — the checklist above is the manual path until then)</li>
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

function GbpStep({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-none mt-0.5 w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 text-xs font-bold tabular-nums flex items-center justify-center">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{title}</p>
        <div className="text-xs text-stone-600 dark:text-stone-300 mt-0.5">{children}</div>
      </div>
    </li>
  )
}

function AttrTile({ label, value, total }: { label: string; value: number; total?: number }) {
  const pct = total != null && total > 0 ? Math.round((value / total) * 100) : null
  return (
    <div className="px-3 py-3 rounded-lg bg-stone-50 dark:bg-stone-800/40">
      <p className="text-xs uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100 mt-0.5">
        {value.toLocaleString()}
        {total != null && <span className="text-sm font-normal text-stone-500 dark:text-stone-400"> / {total}</span>}
      </p>
      {pct != null && <p className="text-xs text-stone-500 dark:text-stone-400">{pct}% from organic</p>}
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-800/40">
      <p className="text-xs uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
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
      <p className="text-xs text-stone-500 dark:text-stone-400 mb-3 tabular-nums">{subtitle}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MiniStat label="Clicks" value={perf.clicks.toLocaleString()} tone="ok" />
        <MiniStat label="Impressions" value={perf.impressions.toLocaleString()} />
        <MiniStat label="Avg. CTR" value={`${(perf.ctr * 100).toFixed(1)}%`} />
        <MiniStat label="Avg. position" value={perf.position.toFixed(1)} />
      </div>
      {perf.topQueries.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Top search queries
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-stone-500 dark:text-stone-400">
              <tr>
                <th className="py-1 font-semibold">Query</th>
                <th className="py-1 text-right font-semibold">Clicks</th>
                <th className="py-1 text-right font-semibold">Impr.</th>
                <th className="py-1 text-right font-semibold">Pos.</th>
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
