import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  getReviewConfig,
  getReviewStats,
  isReviewConfigComplete,
  listEligiblePatients,
  listReviewRequests,
  PLATFORM_LABEL,
  type ReviewSite,
  type ReviewStatus,
} from '@/lib/services/reviews'
import ReviewConfigPanel from './review-config-panel'
import EligibleList from './eligible-list'

export const metadata = {
  title: 'Reviews & Reputation - DreamCRM',
  description: 'Post-visit review requests across Google, Healthgrades, Facebook',
}

export const dynamic = 'force-dynamic'

/**
 * Reviews v1 dashboard — morning-huddle layout (mirrors Overview +
 * Recall pattern). Hero + stats funnel + "Ready to ask" eligible list
 * + recent activity. Config panel surfaces inline when platforms
 * aren't wired up yet.
 *
 * Research-grounded design:
 *   - FTC-clean: no NPS gating. Send the same prompt to everyone.
 *   - Google is the primary platform on the landing page.
 *   - Healthgrades > Facebook for dental healthcare reputation.
 *   - Yelp is opt-in only (their solicited-review filter penalizes prompts).
 *   - 1/patient/year default rate limit.
 *   - Skip transparency — eligibility list shows WHY a patient qualifies.
 */

const STATUS_PILL: Record<ReviewStatus, string> = {
  pending: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  sent: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  clicked: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  skipped: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
  failed: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: 'Queued',
  sent: 'Sent',
  clicked: 'Opened',
  completed: 'Reviewed',
  skipped: 'Skipped',
  failed: 'Failed',
}

function fmtRelative(d: Date | null): string {
  if (!d) return '—'
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function ReviewsPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType !== 'clinic') redirect('/dashboard')

  const [config, stats, eligible, recent] = await Promise.all([
    getReviewConfig(ctx.organizationId),
    getReviewStats(ctx.organizationId),
    listEligiblePatients(ctx.organizationId, 25),
    listReviewRequests(ctx.organizationId, 30),
  ])

  const configured = isReviewConfigComplete(config)
  const now = new Date()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
            Reviews this month · {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Reviews &amp; Reputation
          </h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
            Post-visit review requests sent to your real patients on Google, Healthgrades, and Facebook. Same outcome
            as Birdeye / Weave / Podium, without the $300/mo separate subscription or the gating-the-FTC-just-banned tradeoff.
          </p>
        </div>
      </div>

      {/* ── Config gate ───────────────────────────────────────────── */}
      {!configured && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-5">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
            Connect at least one review platform to start sending requests
          </p>
          <p className="text-[12px] text-amber-800/80 dark:text-amber-300/80 mb-3">
            We need your Google Place ID (most important — ~80% of dental review value), Healthgrades URL,
            or Facebook Page ID. Yelp is opt-in only — their solicited-review filter penalizes prompted reviews.
          </p>
          <ReviewConfigPanel config={config} />
        </div>
      )}

      {/* ── Funnel KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Kpi label="Sent · 30 days" value={stats.sent30d} hint={stats.pending > 0 ? `${stats.pending} queued` : undefined} />
        <Kpi
          label="Opened"
          value={stats.clickRate30d != null ? `${stats.clickRate30d}%` : '—'}
          hint={stats.clickRate30d != null ? 'Sent → opened' : 'No sends yet'}
        />
        <Kpi
          label="Reviewed"
          value={stats.completed30d}
          hint={stats.completionRate30d != null ? `${stats.completionRate30d}% of opens` : undefined}
          tone="ok"
        />
        <Kpi
          label="Ready to ask"
          value={stats.eligibleCount}
          hint={stats.eligibleCount > 0 ? 'Visits completed, no recent request' : 'Nobody eligible right now'}
        />
      </div>

      {/* ── Platform mix ──────────────────────────────────────────── */}
      {stats.completed30d > 0 && (
        <section className="mb-8 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">
            Where they reviewed · last 30 days
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['google', 'healthgrades', 'facebook', 'yelp'] as ReviewSite[]).map((site) => (
              <div key={site} className="px-3 py-2 rounded-lg bg-stone-50 dark:bg-stone-800/40">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                  {PLATFORM_LABEL[site]}
                </p>
                <p className="text-xl font-bold text-stone-900 dark:text-stone-100 tabular-nums mt-0.5">
                  {stats.byPlatform[site]}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Ready to ask ──────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">
            Ready to ask · {eligible.length} {eligible.length === 1 ? 'patient' : 'patients'}
          </h2>
          {configured && (
            <p className="text-[11px] text-stone-400 dark:text-stone-500">
              Visits completed in the last 30 days · no request in the last {config.minDaysBetweenRequests}d · email opt-in
            </p>
          )}
        </div>
        {!configured ? (
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-8 text-center">
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              Connect a review platform above to start sending.
            </p>
          </div>
        ) : eligible.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-8 text-center">
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              Nobody&apos;s ready to ask right now. Complete an appointment in the agenda + come back here.
            </p>
          </div>
        ) : (
          <EligibleList rows={eligible.map((r) => ({
            ...r,
            appointmentCompletedAt: r.appointmentCompletedAt.toISOString(),
          }))} />
        )}
      </section>

      {/* ── Recent requests ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">
          Recent activity
        </h2>
        {recent.length === 0 ? (
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-8 text-center">
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              No review requests sent yet. Send your first one from the Ready-to-ask list above.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-stone-50/80 dark:bg-stone-900/80 border-b border-stone-200 dark:border-stone-700/60">
                <tr className="text-left text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
                  <th className="px-3 py-2">Patient</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Reviewed</th>
                  <th className="px-3 py-2">Where</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-stone-100 dark:border-stone-700/40 last:border-b-0 hover:bg-stone-50/60 dark:hover:bg-stone-800/30">
                    <td className="px-3 py-2.5">
                      <Link href={`/patients/${r.patientId}`} className="font-medium text-stone-800 dark:text-stone-100 hover:underline">
                        {r.patientName}
                      </Link>
                      <p className="text-[11px] text-stone-400 dark:text-stone-500">{r.patientEmail ?? 'no email'}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_PILL[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                      {fmtRelative(r.sentAt)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                      {fmtRelative(r.completedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-stone-500 dark:text-stone-400">
                      {r.selectedSite ? PLATFORM_LABEL[r.selectedSite] : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Settings panel (always visible when configured) ───────── */}
      {configured && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">
            Settings
          </h2>
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
            <ReviewConfigPanel config={config} />
          </div>
        </section>
      )}

      {/* ── Coming next ───────────────────────────────────────────── */}
      <section>
        <div className="bg-stone-100 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Coming next
          </p>
          <ul className="text-[12px] text-stone-600 dark:text-stone-300 space-y-1">
            <li>· Auto-trigger 24h after appointment completion (cron-driven; toggle in Settings)</li>
            <li>· SMS channel via Twilio (Phase B — schema in place)</li>
            <li>· Read live reviews into the dashboard via Google Business Profile API + reply from inside DreamCRM</li>
            <li>· Optional private-feedback path on the landing page (FTC-clean: never branches by rating)</li>
            <li>· Per-patient &quot;don&apos;t ask for reviews&quot; flag (current rate-limit is org-wide via minDaysBetweenRequests)</li>
          </ul>
        </div>
      </section>
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'ok' | 'warn'
}) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <p className={`text-2xl font-bold tabular-nums mt-0.5 ${tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-stone-900 dark:text-stone-100'}`}>
        {value}
      </p>
      {hint && <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">{hint}</p>}
    </div>
  )
}
