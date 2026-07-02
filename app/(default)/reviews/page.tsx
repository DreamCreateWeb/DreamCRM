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
import { getGoogleReviewStats, hasGoogleBusinessConnection, listFeaturableGoogleReviews } from '@/lib/services/google-reviews'
import { getNpsSummary } from '@/lib/services/nps'
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

  // One eligible scan serves both the "Ready to ask" count and the list —
  // getReviewStats skips its own (includeEligible:false) so we don't scan twice.
  const [config, stats, eligibleAll, recent, featuredIds, googleStats, googleConnected, autoFeatured, nps] = await Promise.all([
    getReviewConfig(ctx.organizationId),
    getReviewStats(ctx.organizationId, 30, { includeEligible: false }),
    listEligiblePatients(ctx.organizationId, 1000),
    listReviewRequests(ctx.organizationId, 30),
    listFeaturedTestimonialPatientIds(ctx.organizationId),
    getGoogleReviewStats(ctx.organizationId),
    hasGoogleBusinessConnection(ctx.organizationId),
    listFeaturableGoogleReviews(ctx.organizationId).catch(() => []),
    getNpsSummary(ctx.organizationId),
  ])
  const eligibleCount = eligibleAll.length
  const eligible = eligibleAll.slice(0, 25)

  const configured = isReviewConfigComplete(config)
  // Google-first: the write-review link is the one thing the whole loop needs.
  const hasGoogleLink = !!config.googlePlaceId
  const now = new Date()

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="reviews" />
      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title="Reviews & Reputation"
        subtitle="Ask your real patients for a review after their visit — on Google, Healthgrades, and Facebook. Same results as Birdeye, Weave, or Podium, without the separate $300/mo bill or the review-gating the FTC just banned."
        legend={
          <EncodingLegend
            label="What the statuses mean"
            pills={[
              ...STATUS_ORDER.map((s) => ({
                tone: STATUS_TONE[s],
                label: STATUS_LABEL[s],
                meaning: STATUS_MEANING[s],
              })),
              // The activity table also renders this pill — keep it in the key.
              { tone: 'special' as const, label: '✓ Featured', meaning: 'This patient is featured on your public website' },
            ]}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <ActionButton variant="secondary" size="sm" href="/settings/automations/emails?email=review_request">
              Edit request email
            </ActionButton>
            {stats.completed30d > 0 && (
              <ActionButton variant="primary" breath href="/reviews/received">
                Browse received reviews
              </ActionButton>
            )}
          </div>
        }
      />

      {/* ── Setup gate — the Google review link is the hero ─────────── */}
      {!hasGoogleLink && (
        <div className="mb-6 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-[var(--r-lg)] p-5">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
            Set your Google review link to turn the whole thing on
          </p>
          <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mb-3">
            Once this is set, a completed visit automatically asks the patient for a
            Google review, those reviews sync back in, and your 4★+ ones feature on your
            website — all on their own. Connect your Google Business Profile on{' '}
            <Link href="/integrations" className="underline">Integrations</Link> and we&apos;ll
            try to fill this in for you.
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
          value={eligibleCount}
          sub={eligibleCount > 0 ? 'Visits completed, no recent request' : 'Nobody eligible right now'}
          tone={eligibleCount > 0 ? 'warn' : undefined}
        />
      </div>

      {/* ── Google reviews (real, synced via the GBP connection) ───── */}
      {googleConnected && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <KpiStat
            label="Google rating"
            value={googleStats.averageRating != null ? `${googleStats.averageRating.toFixed(1)}★` : '—'}
            sub={googleStats.count > 0 ? `Across ${googleStats.count} Google review${googleStats.count === 1 ? '' : 's'}` : 'No Google reviews yet'}
            href="/reviews/received"
          />
          <KpiStat
            label="Google reviews"
            value={googleStats.count}
            sub="Synced from your Google Business Profile"
            href="/reviews/received"
          />
          <KpiStat
            label="Auto-featured on site"
            value={autoFeatured.length}
            sub={autoFeatured.length > 0 ? `${config.featureMinStars}★+ showing on your website` : 'None featured yet'}
            tone={autoFeatured.length > 0 ? 'ok' : undefined}
            href="/reviews/received"
          />
          <KpiStat
            label="Need a reply"
            value={googleStats.needsReply}
            sub={googleStats.needsReply > 0 ? 'Reply from Reviews received' : 'All caught up'}
            tone={googleStats.needsReply > 0 ? 'warn' : undefined}
            href={googleStats.needsReply > 0 ? '/reviews/received' : undefined}
          />
        </div>
      )}

      {/* ── Platform mix ──────────────────────────────────────────── */}
      {stats.completed30d > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Where they reviewed · last 30 days
            </h2>
            {/* Drill into the proof: what these reviews became on your site
                (testimonials + rating) lives in Analytics, the deeper layer. */}
            <Link
              href="/analytics"
              className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 whitespace-nowrap"
            >
              See the impact →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['google', 'healthgrades', 'facebook', 'yelp'] as ReviewSite[]).map((site) => (
              <KpiStat key={site} label={PLATFORM_LABEL[site]} value={stats.byPlatform[site]} />
            ))}
          </div>
        </section>
      )}

      {/* ── Patient pulse (NPS) — shown once surveys are on or data exists. */}
      {(config.npsEnabled || nps.sent > 0) && (
        <section className="mb-8">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              Patient pulse · last 90 days
            </h2>
            <span className="text-xs text-gray-400">
              Private post-visit surveys — never posted anywhere public
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiStat
              label="NPS score"
              value={nps.score != null ? nps.score : '—'}
              sub={nps.score != null ? 'promoters − detractors' : 'No responses yet'}
              tone={nps.score != null ? (nps.score >= 50 ? 'ok' : nps.score >= 0 ? 'warn' : 'urgent') : undefined}
            />
            <KpiStat
              label="Responses"
              value={nps.responses}
              sub={nps.sent > 0 ? `of ${nps.sent} surveys sent` : 'No surveys sent yet'}
            />
            <KpiStat label="Promoters (9–10)" value={nps.promoters} tone={nps.promoters > 0 ? 'ok' : undefined} />
            <KpiStat
              label="Detractors (0–6)"
              value={nps.detractors}
              sub={nps.detractors > 0 ? 'each one pinged your team' : undefined}
              tone={nps.detractors > 0 ? 'urgent' : undefined}
            />
          </div>
          {nps.recentComments.length > 0 && (
            <div className="mt-3 v2-card divide-y divide-[color:var(--color-hairline)]">
              {nps.recentComments.map((c, i) => (
                <div key={`${c.patientId}-${i}`} className="px-4 py-3 flex items-start gap-3">
                  <span
                    className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      c.score >= 9
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : c.score >= 7
                          ? 'bg-gray-500/15 text-gray-600 dark:text-gray-300'
                          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {c.score}
                  </span>
                  <div className="min-w-0">
                    <Link href={`/patients/${c.patientId}`} className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:underline">
                      {c.patientName}
                    </Link>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{c.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
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

      {/* ── How the automatic loop works ──────────────────────────── */}
      <section>
        <div className="v2-well border border-dashed border-[color:var(--color-hairline-strong)] p-5">
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
            How this works
          </p>
          <ol className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-decimal list-inside">
            <li>A visit gets marked completed → the patient is automatically asked for a Google review.</li>
            <li>They tap through and leave their review on Google.</li>
            <li>Their review syncs back here on its own (hourly, or hit “Refresh from Google”).</li>
            <li>
              Your {config.featureMinStars}★+ reviews feature on your website automatically — hide any
              one you don&apos;t want on the “Reviews received” page.
            </li>
          </ol>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3">
            Text-message requests are coming next — everything above runs on email today.
          </p>
        </div>
      </section>
    </div>
  )
}
