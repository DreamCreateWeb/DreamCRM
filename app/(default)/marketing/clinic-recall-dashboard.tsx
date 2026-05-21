import Link from 'next/link'
import type { TenantContext } from '@/lib/auth/context'
import { getRecallStats, type RecallActivityKind } from '@/lib/services/recall-stats'
import { listAudiences } from '@/lib/services/marketing'

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
  const [stats, audiences] = await Promise.all([
    getRecallStats(ctx.organizationId),
    listAudiences(ctx.organizationId),
  ])

  const now = new Date()
  const patientAudiences = audiences.filter((a) => (a.recipientSource ?? 'customers') === 'patients')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
            Recall this week · {fmtDate(now)}
          </p>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold tracking-tight">
            Recall &amp; Outreach
          </h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">
            Patients needing outreach, scheduled campaigns, and performance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/marketing/outreach"
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-stone-300 text-stone-700 dark:text-stone-200"
          >
            Outreach queue
          </Link>
          <Link
            href="/marketing/audiences"
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-stone-300 text-stone-700 dark:text-stone-200"
          >
            Audiences
          </Link>
          <Link
            href="/marketing/campaigns"
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900"
          >
            New campaign →
          </Link>
        </div>
      </div>

      {/* ── Row 1 — Needs your outreach ────────────────────────────────── */}
      <section className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <AttentionCard
            title="Recall due"
            count={stats.recallDueCount}
            countSuffix={stats.recallDueCount === 1 ? 'patient over 6 months' : 'patients over 6 months'}
            ctaHref={stats.recallDueCount > 0 ? '/marketing/outreach?tier=recall_due' : null}
            ctaLabel="Send recall campaign"
            footer={
              stats.recallDueCount > 0
                ? `${stats.recallDueReachableCount} reachable by email`
                : 'Everyone\'s on schedule.'
            }
            accent="amber"
          />
          <AttentionCard
            title="Lapsed"
            count={stats.lapsedCount}
            countSuffix={stats.lapsedCount === 1 ? 'patient over 9 months' : 'patients over 9 months'}
            ctaHref={stats.lapsedCount > 0 ? '/marketing/outreach?tier=lapsed' : null}
            ctaLabel="Send reactivation"
            footer={
              stats.lapsedCount > 0
                ? `${stats.lapsedReachableCount} reachable by email`
                : 'No lapsed patients. Healthy roster.'
            }
            accent="rose"
          />
          <AttentionCard
            title="Birthday this month"
            count={stats.birthdayThisMonthCount}
            countSuffix={stats.birthdayThisMonthCount === 1 ? 'patient' : 'patients'}
            ctaHref={stats.birthdayThisMonthCount > 0 ? '/marketing/outreach?tier=birthday' : null}
            ctaLabel="Send birthday wishes"
            footer={
              stats.birthdayThisMonthCount > 0
                ? 'A low-key warm touchpoint.'
                : 'No birthdays this month.'
            }
            accent="violet"
          />
          <AttentionCard
            title="New patient welcome"
            count={stats.newPatientsCount}
            countSuffix={stats.newPatientsCount === 1 ? 'patient · first 60 days' : 'patients · first 60 days'}
            ctaHref={stats.newPatientsCount > 0 ? '/marketing/outreach?tier=new_patient' : null}
            ctaLabel="Send welcome"
            footer={
              stats.newPatientsCount > 0
                ? 'Catch first-visit follow-ups.'
                : 'No new patients in the window.'
            }
            accent="emerald"
          />
        </div>
      </section>

      {/* ── Row 2 — Upcoming sends + Recent performance ────────────────── */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Upcoming sends · next 14 days</h2>
            <Link
              href="/marketing/campaigns"
              className="text-[11px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            >
              All campaigns →
            </Link>
          </div>
          {stats.upcomingSends.length === 0 ? (
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              Nothing scheduled. <Link href="/marketing/campaigns" className="underline">Draft a campaign</Link> to queue one up.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-700/40">
              {stats.upcomingSends.map((s) => (
                <li key={s.id} className="py-2.5">
                  <Link href={`/marketing/campaigns/${s.id}`} className="block hover:bg-stone-50 dark:hover:bg-stone-800/40 -mx-2 px-2 py-1 rounded">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100 truncate">{s.name}</p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                          {s.audienceName ?? 'No audience set'}
                        </p>
                      </div>
                      <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 tabular-nums shrink-0">
                        {fmtTime(s.scheduledAt)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Recent performance · last 30 days</h2>
            {stats.openRate30d != null && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                {stats.openRate30d}% open · {stats.clickRate30d}% click
              </span>
            )}
          </div>
          {stats.recentSends.length === 0 ? (
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              No sends in the last 30 days. Performance numbers populate once you send your first campaign.
            </p>
          ) : (
            <ul className="space-y-2">
              {stats.recentSends.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/marketing/campaigns/${r.id}`}
                    className="block hover:bg-stone-50 dark:hover:bg-stone-800/40 -mx-2 px-2 py-1.5 rounded"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100 truncate">{r.name}</p>
                      <span className="text-[10px] text-stone-400 dark:text-stone-500 tabular-nums shrink-0 ml-2">
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

      {/* ── Row 3 — Audiences + Activity ───────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">Saved segments</h2>
            <Link
              href="/marketing/audiences"
              className="text-[11px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            >
              Manage →
            </Link>
          </div>
          {patientAudiences.length === 0 ? (
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              No patient segments yet. <Link href="/marketing/audiences" className="underline">Create one</Link>.
            </p>
          ) : (
            <ul className="space-y-2">
              {patientAudiences.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/marketing/campaigns?audience=${a.id}`}
                    className="flex items-center justify-between text-[13px] hover:bg-stone-50 dark:hover:bg-stone-800/40 -mx-2 px-2 py-1.5 rounded"
                  >
                    <span className="font-medium text-stone-700 dark:text-stone-200">{a.name}</span>
                    {a.description && (
                      <span className="text-[11px] text-stone-400 dark:text-stone-500 truncate ml-2 max-w-[60%]">
                        {a.description}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-700/40">
            <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
              <span>{stats.marketableCount} marketable · {stats.optedOutCount} opted out</span>
              <span>{stats.sentThisMonthCount} sent this month</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">Recent activity</h2>
          {stats.recentActivity.length === 0 ? (
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              Activity from sent campaigns shows up here — opens, clicks, and booked appointments.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 dark:divide-stone-700/40">
              {stats.recentActivity.map((a) => (
                <li key={a.id} className="py-2 flex items-center gap-3">
                  <span className="text-base shrink-0" aria-hidden="true">{ACTIVITY_ICON[a.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-stone-700 dark:text-stone-200 truncate">
                      <span className="font-medium">{a.patientName ?? 'A recipient'}</span>{' '}
                      <span className="text-stone-500 dark:text-stone-400">{ACTIVITY_LABEL[a.kind]}</span>{' '}
                      <span className="font-medium">{a.campaignName ?? 'a campaign'}</span>
                    </p>
                  </div>
                  <span className="text-[10px] text-stone-400 dark:text-stone-500 tabular-nums shrink-0">
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

interface AttentionCardProps {
  title: string
  count: number
  countSuffix: string
  ctaHref: string | null
  ctaLabel: string
  footer: string
  accent: 'amber' | 'rose' | 'violet' | 'emerald'
}

const ACCENT_BG: Record<AttentionCardProps['accent'], string> = {
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300',
  rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300',
  violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-800 dark:text-violet-300',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
}

function AttentionCard({ title, count, countSuffix, ctaHref, ctaLabel, footer, accent }: AttentionCardProps) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${ACCENT_BG[accent]}`}>
          {title}
        </span>
      </div>
      <p className="text-3xl font-bold text-stone-900 dark:text-stone-100 tabular-nums">{count}</p>
      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">{countSuffix}</p>
      <p className="text-[11px] text-stone-400 dark:text-stone-500 italic mt-2 grow">{footer}</p>
      {ctaHref ? (
        <Link
          href={ctaHref}
          className="mt-3 text-[12px] font-semibold text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-stone-100 inline-flex items-center gap-1"
        >
          {ctaLabel} →
        </Link>
      ) : (
        <div className="mt-3 h-[18px]" aria-hidden="true" />
      )}
    </div>
  )
}

function FunnelStrip({ sent, opened, clicked, booked }: { sent: number; opened: number; clicked: number; booked: number }) {
  const stages = [
    { label: 'Sent', value: sent, color: 'bg-stone-300 dark:bg-stone-600' },
    { label: 'Opened', value: opened, color: 'bg-sky-400 dark:bg-sky-500' },
    { label: 'Clicked', value: clicked, color: 'bg-violet-400 dark:bg-violet-500' },
    { label: 'Booked', value: booked, color: 'bg-emerald-500 dark:bg-emerald-400' },
  ]
  const max = Math.max(1, sent)
  return (
    <div className="flex items-center gap-3 text-[11px]">
      {stages.map((s) => {
        const pct = Math.round((s.value / max) * 100)
        return (
          <div key={s.label} className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-stone-500 dark:text-stone-400">{s.label}</span>
              <span className="font-semibold text-stone-700 dark:text-stone-200 tabular-nums">{s.value}</span>
            </div>
            <div className="h-1 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
              <div className={`h-full rounded-full ${s.color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
