import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  getReviewConfig,
  getReviewStats,
  isReviewConfigComplete,
  listEligiblePatients,
  listFeaturedTestimonialPatientIds,
  listReviewRequests,
  PLATFORM_LABEL,
  type ReviewSite,
  type ReviewStatus,
} from '@/lib/services/reviews'
import ReviewConfigPanel from './review-config-panel'
import EligibleList from './eligible-list'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import type { Tone } from '@/lib/ui/encodings'

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

// Request-funnel state → tone contract. pending = created-not-sent (neutral),
// sent/clicked = in flight, ball in the patient's court (info), completed =
// they wrote a review (ok), skipped = inert (neutral), failed = send problem
// we should fix (urgent).
const STATUS_TONE: Record<ReviewStatus, Tone> = {
  pending: 'neutral',
  sent: 'info',
  clicked: 'info',
  completed: 'ok',
  skipped: 'neutral',
  failed: 'urgent',
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: 'Queued',
  sent: 'Sent',
  clicked: 'Opened',
  completed: 'Reviewed',
  skipped: 'Skipped',
  failed: 'Failed',
}

const STATUS_MEANING: Record<ReviewStatus, string> = {
  pending: 'Created, not yet sent',
  sent: "Email delivered — ball's in their court",
  clicked: 'They opened the form',
  completed: 'They wrote a review',
  skipped: 'Skipped (opted out, no email, or rate-limited)',
  failed: 'Send failed — check their email',
}

const STATUS_ORDER: ReviewStatus[] = ['pending', 'sent', 'clicked', 'completed', 'skipped', 'failed']

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

  const [config, stats, eligible, recent, featuredIds] = await Promise.all([
    getReviewConfig(ctx.organizationId),
    getReviewStats(ctx.organizationId),
    listEligiblePatients(ctx.organizationId, 25),
    listReviewRequests(ctx.organizationId, 30),
    listFeaturedTestimonialPatientIds(ctx.organizationId),
  ])

  const configured = isReviewConfigComplete(config)
  const now = new Date()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="reviews" />
      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title="Reviews & Reputation"
        subtitle="Post-visit review requests sent to your real patients on Google, Healthgrades, and Facebook. Same outcome as Birdeye / Weave / Podium, without the $300/mo separate subscription or the gating the FTC just banned."
        legend={
          <EncodingLegend
            label="What the statuses mean"
            pills={STATUS_ORDER.map((s) => ({
              tone: STATUS_TONE[s],
              label: STATUS_LABEL[s],
              meaning: STATUS_MEANING[s],
            }))}
          />
        }
        actions={
          stats.completed30d > 0 ? (
            <ActionButton variant="primary" breath href="/reviews/received">
              Browse received reviews
            </ActionButton>
          ) : undefined
        }
      />

      {/* ── Config gate ───────────────────────────────────────────── */}
      {!configured && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-[var(--r-lg)] p-5">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
            Connect at least one review platform to start sending requests
          </p>
          <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mb-3">
            We need your Google Place ID (most important — ~80% of dental review value), Healthgrades URL,
            or Facebook Page ID. Yelp is opt-in only — their solicited-review filter penalizes prompted reviews.
          </p>
          <ReviewConfigPanel config={config} />
        </div>
      )}

      {/* ── Funnel KPIs ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiStat
          label="Sent · 30 days"
          value={stats.sent30d}
          sub={stats.pending > 0 ? `${stats.pending} queued to send` : undefined}
          tone={stats.pending > 0 ? 'warn' : undefined}
        />
        <KpiStat
          label="Opened"
          value={stats.clickRate30d != null ? `${stats.clickRate30d}%` : '—'}
          sub={stats.clickRate30d != null ? 'Sent → opened' : 'No sends yet'}
        />
        <KpiStat
          label="Reviewed"
          value={stats.completed30d}
          sub={stats.completionRate30d != null ? `${stats.completionRate30d}% of opens` : undefined}
          href={stats.completed30d > 0 ? '/reviews/received' : undefined}
        />
        <KpiStat
          label="Ready to ask"
          value={stats.eligibleCount}
          sub={stats.eligibleCount > 0 ? 'Visits completed, no recent request' : 'Nobody eligible right now'}
          tone={stats.eligibleCount > 0 ? 'warn' : undefined}
        />
      </div>

      {/* ── Platform mix ──────────────────────────────────────────── */}
      {stats.completed30d > 0 && (
        <section className="v2-card mb-8 p-5">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Where they reviewed · last 30 days
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['google', 'healthgrades', 'facebook', 'yelp'] as ReviewSite[]).map((site) => (
              <div key={site} className="v2-well px-3 py-2">
                <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                  {PLATFORM_LABEL[site]}
                </p>
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100 tabular-nums font-mono-num mt-0.5">
                  {stats.byPlatform[site]}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Ready to ask ──────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Ready to ask · {eligible.length} {eligible.length === 1 ? 'patient' : 'patients'}
          </h2>
          {configured && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-right">
              Visits completed in the last 30 days · no request in the last {config.minDaysBetweenRequests}d · email opt-in
            </p>
          )}
        </div>
        {!configured ? (
          <EmptyState
            icon="🔌"
            title="Connect a review platform to start."
            body="Add your Google Place ID, Healthgrades URL, or Facebook Page above, then patients ready for a request show up here."
          />
        ) : eligible.length === 0 ? (
          <EmptyState
            icon="🌟"
            title="Nobody's ready to ask right now."
            body="Mark an appointment completed in the agenda and the patient will appear here for a request."
            action={
              <ActionButton variant="secondary" size="sm" href="/appointments">
                Go to the agenda
              </ActionButton>
            }
          />
        ) : (
          <EligibleList rows={eligible.map((r) => ({
            ...r,
            appointmentCompletedAt: r.appointmentCompletedAt.toISOString(),
          }))} />
        )}
      </section>

      {/* ── Recent requests ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
          Recent activity
        </h2>
        {recent.length === 0 ? (
          <EmptyState
            icon="📮"
            title="No review requests sent yet."
            body="Send your first one from the Ready-to-ask list above, and it'll track here."
          />
        ) : (
          <div className="v2-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="v2-well border-b border-[color:var(--color-hairline)]">
                <tr className="text-left text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-2">Patient</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sent</th>
                  <th className="px-3 py-2">Reviewed</th>
                  <th className="px-3 py-2">Where</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-[color:var(--color-hairline)] last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                    <td className="px-3 py-2.5">
                      <Link href={`/patients/${r.patientId}`} className="font-medium text-gray-800 dark:text-gray-100 hover:underline">
                        {r.patientName}
                      </Link>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.patientEmail ?? 'no email'}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusPill
                          tone={STATUS_TONE[r.status]}
                          label={STATUS_LABEL[r.status]}
                          title={STATUS_MEANING[r.status]}
                        />
                        {r.status === 'completed' && featuredIds.has(r.patientId) && (
                          <Link
                            href="/reviews/received"
                            className="rounded-full"
                            title="This patient is featured on your website"
                          >
                            <StatusPill tone="special" label="✓ Featured" />
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {fmtRelative(r.sentAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                      {fmtRelative(r.completedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">
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
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
            Settings
          </h2>
          <div className="v2-card p-5">
            <ReviewConfigPanel config={config} />
          </div>
        </section>
      )}

      {/* ── Coming next ───────────────────────────────────────────── */}
      <section>
        <div className="v2-well border border-dashed border-[color:var(--color-hairline-strong)] p-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            Coming next
          </p>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
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
