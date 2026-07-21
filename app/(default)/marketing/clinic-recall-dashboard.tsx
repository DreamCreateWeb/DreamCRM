import Link from 'next/link'
import type { TenantContext } from '@/lib/auth/context'
import { getRecallStats, type RecallActivityKind } from '@/lib/services/recall-stats'
import { listAudiences } from '@/lib/services/marketing'
import { getRetentionSettings, previewRetentionAudiences, getAutomationStats } from '@/lib/services/retention-automation'
import { getAutomationOverride } from '@/lib/services/marketing-templates'
import { RETENTION_KINDS } from '@/lib/types/retention'
import { RetentionAutomationsCard } from './retention-automations-card'
import { NewsletterCard } from './newsletter-card'
import { listPublishedPosts } from '@/lib/services/blog'
import { getReferralProgramStats } from '@/lib/services/patient-referrals'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'
import type { Tone } from '@/lib/ui/encodings'

/**
 * Clinic-tenant Recall & Outreach dashboard. Mirrors the morning-huddle
 * pattern from /dashboard (clinic-overview.tsx): attention cards on top,
 * each with a count + CTA + preview rows; then upcoming sends; then
 * recent performance (Sent → Opened → Clicked → Booked funnel); then
 * activity feed. Every number drills.
 *
 * Design choices grounded in research (Lighthouse 360 morning task list,
 * NexHealth booking attribution, RevenueWell per-campaign revenue
 * reporting, Weave overdue-patients sorted list). Anti-patterns avoided:
 * no SaaS funnel bar chart, no "won/qualified" pipeline pills, no
 * customers-table reads.
 */

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function fmtTime(d: Date): string {
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtRelative(d: Date): string {
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

const ACTIVITY_LABEL: Record<RecallActivityKind, string> = {
  campaign_sent: 'received',
  campaign_opened: 'opened',
  campaign_clicked: 'clicked',
  campaign_booked: 'booked from',
  patient_opted_out: 'opted out of',
}

const ACTIVITY_ICON: Record<RecallActivityKind, string> = {
  campaign_sent: '✉️',
  campaign_opened: '👁',
  campaign_clicked: '🖱',
  campaign_booked: '📅',
  patient_opted_out: '🔕',
}

export default async function ClinicRecallDashboard({ ctx }: { ctx: TenantContext }) {
  const [stats, audiences, retentionSettings, retentionPreview, publishedPosts, referralStats, automationStats, overrides] =
    await Promise.all([
      getRecallStats(ctx.organizationId),
      listAudiences(ctx.organizationId),
      getRetentionSettings(ctx.organizationId),
      previewRetentionAudiences(ctx.organizationId),
      listPublishedPosts(ctx.organizationId, { limit: 3 }),
      getReferralProgramStats(ctx.organizationId),
      getAutomationStats(ctx.organizationId),
      Promise.all(RETENTION_KINDS.map((k) => getAutomationOverride(ctx.organizationId, k))),
    ])
  const customized = Object.fromEntries(
    RETENTION_KINDS.map((k, i) => [k, overrides[i] !== null]),
  ) as Record<(typeof RETENTION_KINDS)[number], boolean>
  const publishedPostCount = publishedPosts.length

  const now = new Date()
  const orgName = ctx.organizationName ?? 'Your clinic'
  const canManageAutomations = ctx.role === 'owner' || ctx.role === 'admin'
  const patientAudiences = audiences.filter((a) => (a.recipientSource ?? 'customers') === 'patients')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Header — primary action is the outreach queue (the highest-
          leverage next step: it's where the recall sends actually start).
          Audiences + Campaigns are secondary. ──────────────────────────── */}
      <PageHeader
        eyebrow={
          <Link href="/growth" className="hover:underline underline-offset-4">
            ‹ Growth
          </Link>
        }
        title="Recall & Outreach"
        subtitle={`Patients who need a nudge, what's scheduled to send, and how recent sends performed — for ${fmtDate(now)}.`}
        actions={
          <>
            <ActionButton variant="secondary" href="/growth/audiences">
              Audiences
            </ActionButton>
            <ActionButton variant="secondary" href="/growth/campaigns">
              Campaigns
            </ActionButton>
            <ActionButton variant="primary" breath href="/growth/outreach/queue">
              Open outreach queue
            </ActionButton>
          </>
        }
      />

      {/* ── Row 1 — Needs your outreach ────────────────────────────────── */}
      <section className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <RecallKpi
            label="Recall due"
            count={stats.recallDueCount}
            href={stats.recallDueCount > 0 ? '/growth/outreach/queue?tier=recall_due' : undefined}
            sub={
              stats.recallDueCount > 0
                ? `${stats.recallDueReachableCount} reachable by email · send a recall`
                : "Everyone's on schedule."
            }
            tone={stats.recallDueCount > 0 ? 'warn' : 'neutral'}
          />
          <RecallKpi
            label="Lapsed"
            count={stats.lapsedCount}
            href={stats.lapsedCount > 0 ? '/growth/outreach/queue?tier=lapsed' : undefined}
            sub={
              stats.lapsedCount > 0
                ? `${stats.lapsedReachableCount} reachable · send a reactivation`
                : 'No lapsed patients. Healthy roster.'
            }
            tone={stats.lapsedCount > 0 ? 'warn' : 'neutral'}
          />
          <RecallKpi
            label="Birthday this month"
            count={stats.birthdayThisMonthCount}
            href={stats.birthdayThisMonthCount > 0 ? '/growth/outreach/queue?tier=birthday' : undefined}
            sub={
              stats.birthdayThisMonthCount > 0
                ? 'A warm, low-key hello.'
                : 'No birthdays this month.'
            }
            tone={stats.birthdayThisMonthCount > 0 ? 'special' : 'neutral'}
          />
          <RecallKpi
            label="New patient welcome"
            count={stats.newPatientsCount}
            href={stats.newPatientsCount > 0 ? '/growth/outreach/queue?tier=new_patient' : undefined}
            sub={
              stats.newPatientsCount > 0
                ? 'First 60 days · catch first-visit follow-ups.'
                : 'No new patients in the window.'
            }
            tone={stats.newPatientsCount > 0 ? 'special' : 'neutral'}
          />
        </div>
      </section>

      {/* ── Row 2 — Upcoming sends + Recent performance ────────────────── */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="v2-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Upcoming sends · next 14 days</h2>
            <Link
              href="/growth/campaigns"
              className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
            >
              All campaigns →
            </Link>
          </div>
          {stats.upcomingSends.length === 0 ? (
            <EmptyState
              icon="🗓️"
              title="Nothing scheduled."
              body="Draft a campaign to queue your next recall or newsletter send."
              action={
                <ActionButton variant="secondary" size="sm" href="/growth/campaigns">
                  Draft a campaign
                </ActionButton>
              }
            />
          ) : (
            <ul className="divide-y divide-[color:var(--color-hairline)]">
              {stats.upcomingSends.map((s) => (
                <li key={s.id} className="py-2.5">
                  <Link href={`/growth/campaigns/${s.id}`} className="block hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors -mx-2 px-2 py-1 rounded">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{s.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {s.audienceName ?? 'No audience set'}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300 tabular-nums font-mono-num shrink-0">
                        {fmtTime(s.scheduledAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="v2-card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Recent performance · last 30 days</h2>
            <div className="flex items-center gap-3 shrink-0">
              {stats.openRate30d != null && (
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
                  {stats.openRate30d}% open · {stats.clickRate30d}% click
                </span>
              )}
              {/* Drill from the operational funnel into the proof: who actually
                  came back, and what brought them (Analytics, the deeper layer). */}
              <Link
                href="/growth/analytics"
                className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 whitespace-nowrap"
              >
                Who came back →
              </Link>
            </div>
          </div>
          {stats.recentSends.length === 0 ? (
            <EmptyState
              icon="📊"
              title="No sends in the last 30 days."
              body="Performance numbers populate once you send your first campaign."
            />
          ) : (
            <ul className="space-y-2">
              {stats.recentSends.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/growth/campaigns/${r.id}`}
                    className="block hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors -mx-2 px-2 py-1.5 rounded"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{r.name}</p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0 ml-2">
                        {fmtRelative(r.sentAt)}
                      </span>
                    </div>
                    {/* Sent → Opened → Clicked → Booked funnel — the NexHealth attribution model. */}
                    <FunnelStrip sent={r.sent} opened={r.opened} clicked={r.clicked} booked={r.booked} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Automations — set & forget recall sends ────────────────────── */}
      <section className="mb-8 space-y-4">
        <RetentionAutomationsCard
          initial={retentionSettings}
          preview={retentionPreview}
          stats={automationStats}
          customized={customized}
          canManage={canManageAutomations}
        />
        <NewsletterCard publishedPostCount={publishedPostCount} />
        <ReferralProgramCard referredPatients={referralStats.referredPatients} referrers={referralStats.referrers} />
      </section>

      {/* ── Row 3 — Audiences + Activity ───────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="v2-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Saved segments</h2>
            <Link
              href="/growth/audiences"
              className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300"
            >
              Manage →
            </Link>
          </div>
          {patientAudiences.length === 0 ? (
            <EmptyState
              icon="🎯"
              title="No patient segments yet."
              body="Save a segment to turn your patient list into reusable groups you can send a campaign to."
              action={
                <ActionButton variant="secondary" size="sm" href="/growth/audiences">
                  Create a segment
                </ActionButton>
              }
            />
          ) : (
            <ul className="space-y-2">
              {patientAudiences.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/growth/campaigns?prefill_audience=${a.id}`}
                    className="flex items-center justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors -mx-2 px-2 py-1.5 rounded"
                  >
                    <span className="font-medium text-gray-700 dark:text-gray-200">{a.name}</span>
                    {a.description && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate ml-2 max-w-[60%]">
                        {a.description}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-[color:var(--color-hairline)]">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num">
              <span>{stats.marketableCount} marketable · {stats.optedOutCount} opted out</span>
              <span>{stats.sentThisMonthCount} sent this month</span>
            </div>
          </div>
        </div>

        <div className="v2-card p-5">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Recent activity</h2>
          {stats.recentActivity.length === 0 ? (
            <EmptyState
              icon="📨"
              title="No activity yet."
              body="Opens, clicks, and booked appointments from sent campaigns show up here."
            />
          ) : (
            <ul className="divide-y divide-[color:var(--color-hairline)]">
              {stats.recentActivity.map((a) => (
                <li key={a.id} className="py-2 flex items-center gap-3">
                  <span className="text-base shrink-0" aria-hidden="true">{ACTIVITY_ICON[a.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 dark:text-gray-200 truncate">
                      <span className="font-medium">{a.patientName ?? 'A recipient'}</span>{' '}
                      <span className="text-gray-500 dark:text-gray-400">{ACTIVITY_LABEL[a.kind]}</span>{' '}
                      <span className="font-medium">{a.campaignName ?? 'a campaign'}</span>
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0">
                    {fmtRelative(a.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

// ── Components ────────────────────────────────────────────────────────

/**
 * Attention KPI — the whole tile drills into the matching outreach tier
 * (KpiStat's drillable model). Urgency is carried by the tone'd `sub`
 * line, never by dimming/coloring the digits (DESIGN-SYSTEM rule 4).
 */
/**
 * The refer-a-friend program's Growth-side door. The program itself lives
 * where its pieces run — patients share from the portal, attribution shows on
 * the patient record, thank-you points sit in Shop → Loyalty — but a
 * growth-minded owner looks HERE, so this card is the map to those homes plus
 * the live pulse (structure-audit finding: the program was invisible from
 * Growth).
 */
function ReferralProgramCard({ referredPatients, referrers }: { referredPatients: number; referrers: number }) {
  return (
    <div className="v2-card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Refer-a-friend</h2>
            <span className="text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 rounded-full px-2 py-0.5">
              Patients share from their portal
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-prose">
            Every patient has a personal share link in their portal; friends who book through it
            are stamped &ldquo;referred by&rdquo; on their record automatically.{' '}
            {referredPatients > 0 ? (
              <span className="tabular-nums">
                {referredPatients} patient{referredPatients === 1 ? '' : 's'} came in this way, brought by{' '}
                {referrers} referrer{referrers === 1 ? '' : 's'}.
              </span>
            ) : (
              'No referred bookings yet — it counts up here as friends book.'
            )}{' '}
            Thank-you points live in{' '}
            <Link href="/shop" className="font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4">
              Shop → Loyalty
            </Link>
            ; the portal switch is in{' '}
            <Link href="/settings/portal" className="font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4">
              Portal settings
            </Link>
            .
          </p>
        </div>
        <ActionButton variant="secondary" size="sm" href="/settings/portal">
          Portal share settings
        </ActionButton>
      </div>
    </div>
  )
}

function RecallKpi({
  label,
  count,
  href,
  sub,
  tone,
}: {
  label: string
  count: number
  href?: string
  sub: string
  tone: Tone
}) {
  return <KpiStat label={label} value={count} href={href} sub={sub} tone={tone} />
}

function FunnelStrip({ sent, opened, clicked, booked }: { sent: number; opened: number; clicked: number; booked: number }) {
  // Stage colors map to the tone contract: Sent = neutral (gray, inert
  // baseline), Opened/Clicked = info (violet, ball-in-their-court — v3 moved
  // info indigo→violet so it can't collide with the dream-blue brand), Booked = ok
  // (emerald, the done-good outcome). Each stage carries a visible text
  // label + count, so color never stands alone.
  const stages = [
    { label: 'Sent', value: sent, color: 'bg-gray-300 dark:bg-gray-600' },
    { label: 'Opened', value: opened, color: 'bg-violet-400 dark:bg-violet-500' },
    { label: 'Clicked', value: clicked, color: 'bg-violet-500 dark:bg-violet-400' },
    { label: 'Booked', value: booked, color: 'bg-emerald-500 dark:bg-emerald-400' },
  ]
  const max = Math.max(1, sent)
  return (
    <div className="flex items-center gap-3 text-xs">
      {stages.map((s) => {
        const pct = Math.round((s.value / max) * 100)
        return (
          <div key={s.label} className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-gray-500 dark:text-gray-400">{s.label}</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums font-mono-num">{s.value}</span>
            </div>
            <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div className={`h-full rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
