import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getSiteHealth, getOrganicAttribution, type CheckStatus } from '@/lib/services/seo'
import { getReviewStats } from '@/lib/services/reviews'

export const metadata = { title: 'SEO - DreamCRM' }
export const dynamic = 'force-dynamic'

/**
 * SEO dashboard v1 — the honest "is it working" surface, the opposite of the
 * agency black box. Self-contained: Site Health (we own the markup) + organic
 * attribution (from the referrer/UTM we capture) + Reviews as a ranking
 * signal. Search Console performance + the full clicks→bookings funnel land
 * in the next update.
 */

const STATUS_ICON: Record<CheckStatus, { mark: string; cls: string }> = {
  pass: { mark: '✓', cls: 'text-emerald-600 dark:text-emerald-400' },
  warn: { mark: '~', cls: 'text-amber-600 dark:text-amber-400' },
  fail: { mark: '!', cls: 'text-rose-600 dark:text-rose-400' },
}

export default async function SeoPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [health, attr, reviews] = await Promise.all([
    getSiteHealth(ctx.organizationId),
    getOrganicAttribution(ctx.organizationId, 30),
    getReviewStats(ctx.organizationId),
  ])

  const scoreTone =
    health.score >= 80 ? 'ok' : health.score >= 60 ? 'warn' : 'bad'
  const now = new Date()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
          Search · {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">SEO</h1>
        <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
          Straight answers, not impression graphs: how healthy your site is, and how much organic search actually
          turns into leads and booked visits — the number agencies can&apos;t show you.
        </p>
      </div>

      {/* ── Top row: Site Health score + Organic attribution ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 mb-8">
        {/* Site Health */}
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
                <span className={`text-sm font-bold mt-0.5 ${STATUS_ICON[c.status].cls}`}>
                  {STATUS_ICON[c.status].mark}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100">{c.label}</p>
                  <p className="text-[12px] text-stone-500 dark:text-stone-400">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/settings/clinic"
            className="inline-block mt-4 text-[12px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            Fix the gaps in Settings → Clinic →
          </Link>
        </section>

        {/* Organic attribution — the moat */}
        <section className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">
            Organic search → results
          </h2>
          <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-4">
            New leads + bookings that arrived from organic search · last {attr.windowDays} days
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <AttrTile
              label="Leads from organic"
              value={attr.organicLeads}
              total={attr.totalLeads}
            />
            <AttrTile
              label="Bookings from organic"
              value={attr.organicBookings}
              total={attr.totalBookings}
            />
          </div>
          <p className="text-[12px] text-stone-500 dark:text-stone-400">
            We capture the traffic source on every contact + booking form, then attribute it back here — so you can see
            search actually producing patients, not just impressions.
          </p>
          {attr.totalLeads === 0 && attr.totalBookings === 0 && (
            <p className="text-[12px] text-stone-400 dark:text-stone-500 italic mt-2">
              No leads or bookings in this window yet — numbers appear as your site gets traffic.
            </p>
          )}
        </section>
      </div>

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

      {/* ── Coming next: Search Console + GBP ─────────────────────────── */}
      <section>
        <div className="bg-stone-100 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Coming next
          </p>
          <ul className="text-[12px] text-stone-600 dark:text-stone-300 space-y-1">
            <li>· Connect Google Search Console — real clicks, queries, and average position (the honest trend line)</li>
            <li>· The full funnel: search impressions → clicks → leads → booked appointments</li>
            <li>· Google Business Profile: posting (from your blog) + profile insights + review replies (access request in progress)</li>
            <li>· Core Web Vitals (page speed) on your key pages</li>
            <li>· Rank tracking for your top local terms</li>
          </ul>
        </div>
      </section>
    </div>
  )
}

function AttrTile({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : null
  return (
    <div className="px-3 py-3 rounded-lg bg-stone-50 dark:bg-stone-800/40">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-100 mt-0.5">
        {value}
        <span className="text-sm font-normal text-stone-400 dark:text-stone-500"> / {total}</span>
      </p>
      {pct != null && <p className="text-[11px] text-stone-400 dark:text-stone-500">{pct}% from organic</p>}
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: 'ok' }) {
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
