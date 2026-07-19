import Link from 'next/link'
import { getClinicOverview, type TodayAppointmentRow, type ActivityKind } from '@/lib/services/clinic-overview'
import { getStaffOnboarding, getActivationChecklist } from '@/lib/services/staff-onboarding'
import WelcomeModal from '@/components/onboarding/welcome-modal'
import GettingStarted from '@/components/onboarding/getting-started'
import type { TenantContext } from '@/lib/auth/context'
import { readDemoSkin } from '@/lib/demo-skin'
import { formatRelativeDate } from '@/lib/utils/format'
import { formatClinicTime, formatClinicDayHeader } from '@/lib/format-datetime'
import { PageHeader } from '@/components/ui/page-header'
import { ProgressRing } from '@/components/ui/progress-ring'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { GlyphCluster } from '@/components/ui/glyph-cluster'
import { TagChip } from '@/components/ui/tag-chip'
import { EncodingLegend } from '@/components/ui/encoding-legend'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiStat } from '@/components/ui/kpi-stat'
import { patientFlagGlyphs, type Tone, type GlyphId, type PillLegendRow } from '@/lib/ui/encodings'
import { MorningReveal } from './morning-reveal'

// Appointment status → semantic tone + plain-language label. The tone carries
// the meaning per the design-system contract (warn = needs our action,
// ok = good, neutral = inert, urgent = problem now).
const STATUS_TONE: Record<string, Tone> = {
  scheduled: 'warn',
  confirmed: 'ok',
  completed: 'neutral',
  cancelled: 'urgent',
  no_show: 'urgent',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Unconfirmed',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

const STATUS_TITLES: Record<string, string> = {
  scheduled: "Hasn't replied to a confirmation yet — send a reminder",
  confirmed: 'Patient confirmed this visit',
  completed: 'This visit is done',
  cancelled: 'This visit was cancelled',
  no_show: "Patient didn't show — follow up to rebook",
}

// Legend rows declaring exactly the pills this page shows on Today's chair.
const PILL_LEGEND: PillLegendRow[] = [
  { tone: 'warn', label: 'Unconfirmed', meaning: STATUS_TITLES.scheduled },
  { tone: 'ok', label: 'Confirmed', meaning: STATUS_TITLES.confirmed },
  { tone: 'neutral', label: 'Completed', meaning: STATUS_TITLES.completed },
  { tone: 'urgent', label: 'Cancelled', meaning: STATUS_TITLES.cancelled },
  { tone: 'urgent', label: 'No-show', meaning: STATUS_TITLES.no_show },
]

// The glyphs this page renders on Today's chair (in registry display order).
const PAGE_GLYPHS: GlyphId[] = ['newPatient', 'birthday', 'balance', 'missingIntakeNext']

const ACTIVITY_ICON: Record<ActivityKind, string> = {
  appointment_booked: '📅',
  intake_submitted: '📝',
  invoice_paid: '💵',
  patient_added: '👤',
}

function money(cents: number): string {
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toFixed(0)}`
}

// Plan gating for tier-locked attention cards (Shop = premium, Messages = pro).
const PLAN_RANK: Record<string, number> = { basic: 0, pro: 1, premium: 2 }
function planAtLeast(have: string, need: 'basic' | 'pro' | 'premium'): boolean {
  return (PLAN_RANK[have] ?? 0) >= PLAN_RANK[need]
}

// Times + day headers render at the CLINIC's wall-clock — this is a server
// component, so bare toLocale* would print UTC (formatClinicTime /
// formatClinicDayHeader from @/lib/format-datetime, tz from the snapshot).

export default async function ClinicOverview({ ctx }: { ctx: TenantContext }) {
  const [data, onboarding] = await Promise.all([
    getClinicOverview(ctx.organizationId),
    getStaffOnboarding(ctx.organizationId, ctx.userId),
  ])
  // The checklist derives from live org data — only compute it while it's
  // still showing (not dismissed; auto-hides once everything is done).
  const checklist = onboarding.checklistDismissed
    ? null
    : await getActivationChecklist(ctx.organizationId, ctx.planTier)
  // Presenter mode: a prospect-branded demo shows THEIR practice name on
  // the huddle title (cosmetic overlay; null for everyone but a platform
  // admin inside demo mode).
  const demoSkin = await readDemoSkin(ctx)
  const name = demoSkin?.clinicName ?? ctx.organizationName
  const mtdDelta = data.trends.newPatientsMTD - data.trends.newPatientsLastMTD
  // Website visits, last 7 days — null (fetch failed / feature dark) hides the
  // tile and keeps the classic 4-up trend row.
  const site = data.siteTraffic
  const siteDeltaPct =
    site && site.totalPrev > 0
      ? Math.round(((site.total - site.totalPrev) / site.totalPrev) * 100)
      : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {!onboarding.welcomeSeen && <WelcomeModal clinicName={name} />}
      {checklist && !checklist.allDone && <GettingStarted checklist={checklist} />}

      {/* ── Header ────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={`Morning huddle · ${formatClinicDayHeader(data.date, data.timeZone)}`}
        title={name}
        subtitle="The six things worth your attention this morning — every number opens the list behind it."
        legend={<EncodingLegend glyphs={PAGE_GLYPHS} pills={PILL_LEGEND} />}
        actions={
          <>
            <ActionButton href="/appointments" variant="secondary">
              Open agenda
            </ActionButton>
            {/* The page's single primary — carries the ambient breath. */}
            <ActionButton href="/appointments?window=today" variant="primary" breath>
              + New booking
            </ActionButton>
          </>
        }
      />

      {/* ── Integrations sync-health banner (renders only when unhealthy) ── */}
      {data.integrationsHealth && data.integrationsHealth.severity !== 'info' && (
        <section className="mb-6">
          <div
            className={[
              'rounded-[var(--r-lg)] border p-4 flex items-start gap-3',
              data.integrationsHealth.severity === 'error'
                ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30',
            ].join(' ')}
          >
            <div
              className={[
                'w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base font-semibold',
                data.integrationsHealth.severity === 'error'
                  ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                  : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
              ].join(' ')}
              aria-hidden="true"
            >
              !
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={[
                  'text-sm font-semibold',
                  data.integrationsHealth.severity === 'error'
                    ? 'text-rose-900 dark:text-rose-200'
                    : 'text-amber-900 dark:text-amber-200',
                ].join(' ')}
              >
                A sync needs your attention
              </p>
              <p
                className={[
                  'text-xs mt-0.5',
                  data.integrationsHealth.severity === 'error'
                    ? 'text-rose-800/90 dark:text-rose-300/90'
                    : 'text-amber-800/90 dark:text-amber-300/90',
                ].join(' ')}
              >
                {data.integrationsHealth.message}
              </p>
            </div>
            <Link
              href="/integrations"
              className={[
                'text-xs font-medium px-3 py-1.5 rounded-lg shrink-0 self-center',
                data.integrationsHealth.severity === 'error'
                  ? 'bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:hover:bg-rose-500/30'
                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30',
              ].join(' ')}
            >
              Open Integrations
            </Link>
          </div>
        </section>
      )}

      {/* ── Website check-engine light (renders only when a signal fires) ──
          Traffic drop / silent forms — problems that never announce
          themselves. Same banner language as the sync-health notice above. */}
      {data.siteHealth && (
        <section className="mb-6">
          <div className="rounded-[var(--r-lg)] border p-4 flex items-start gap-3 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30">
            <div
              className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base bg-amber-100 dark:bg-amber-500/20"
              aria-hidden="true"
            >
              🌐
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {data.siteHealth.title}
              </p>
              <p className="text-xs mt-0.5 text-amber-800/90 dark:text-amber-300/90">
                {data.siteHealth.body}
              </p>
            </div>
            <Link
              href={data.siteHealth.href}
              className="text-xs font-medium px-3 py-1.5 rounded-lg shrink-0 self-center bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:hover:bg-amber-500/30"
            >
              {data.siteHealth.linkLabel}
            </Link>
          </div>
        </section>
      )}

      {/* ── Row 1 — Needs your attention ─────────────────────────────── */}
      {/* Signature moment: this row cascades in once on first session entry
          (MorningReveal), in the same beat the KPIs below count up. */}
      <section className="mb-8">
        <MorningReveal className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <AttentionCard
            title="Unconfirmed"
            count={data.unconfirmed.count}
            countSuffix={data.unconfirmed.count === 1 ? 'appointment in next 48h' : 'appointments in next 48h'}
            cta={data.unconfirmed.count > 0 ? { label: 'Send confirmations', href: '/appointments?attention=unconfirmed' } : null}
            emptyCopy="Every booking in the next 48h is confirmed. Nice."
          >
            {data.unconfirmed.preview.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm py-1.5">
                <span className="truncate text-gray-700 dark:text-gray-200">{r.patientName}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 tabular-nums">
                  {r.startTime.toLocaleString('en-US', {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: data.timeZone,
                  })}
                </span>
              </li>
            ))}
          </AttentionCard>

          <AttentionCard
            title="New intake submissions"
            count={data.intakeSubmissions.count}
            countSuffix={data.intakeSubmissions.count === 1 ? 'in the last 7 days' : 'in the last 7 days'}
            cta={
              data.intakeSubmissions.count > 0
                ? { label: 'Review submissions', href: `/intake-forms/submissions/${data.intakeSubmissions.preview[0]?.id ?? ''}` }
                : null
            }
            emptyCopy="No intake submissions this week. Send the form link with new bookings to get more."
          >
            {data.intakeSubmissions.preview.map((r) => (
              <li key={r.id} className="py-1.5">
                <Link
                  href={`/intake-forms/submissions/${r.id}`}
                  className="flex items-center justify-between text-sm hover:underline"
                >
                  <span className="truncate text-gray-700 dark:text-gray-200">
                    {r.submitterName ?? 'Anonymous'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 truncate max-w-[10ch]">
                    {r.formTitle}
                  </span>
                </Link>
              </li>
            ))}
          </AttentionCard>

          <AttentionCard
            title="Outstanding balances"
            count={data.outstandingBalances.count}
            countSuffix={
              data.outstandingBalances.count > 0
                ? `${data.outstandingBalances.count === 1 ? 'patient owes' : 'patients owe'} · ${money(data.outstandingBalances.totalCents)}`
                : 'patients with a balance'
            }
            cta={data.outstandingBalances.count > 0 ? { label: 'See who owes', href: '/patients?balance=1' } : null}
            emptyCopy="No balances on file from your PMS. Patients are paid up."
          >
            {/* Sourced from the PMS sync — totals tell the story. */}
            {data.outstandingBalances.count > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">
                From your PMS. Click through to see who owes and send a pay link.
              </p>
            )}
          </AttentionCard>

          <AttentionCard
            title="New leads"
            count={data.newLeads.count}
            countSuffix={
              data.newLeads.count === 1 ? 'untouched website inquiry' : 'untouched website inquiries'
            }
            cta={data.newLeads.count > 0 ? { label: 'See new leads', href: '/leads?status=new' } : null}
            emptyCopy="No new website leads waiting. Anyone who fills out your contact form lands here."
          >
            {data.newLeads.preview.map((l) => (
              <li key={l.id} className="flex items-center justify-between text-sm py-1.5">
                <span className="truncate text-gray-700 dark:text-gray-200">{l.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 tabular-nums">
                  {l.ageHours < 1 ? 'just now' : `${l.ageHours}h ago`}
                </span>
              </li>
            ))}
          </AttentionCard>

          {/* Unanswered patient messages — the ball is in our court (pro+). */}
          {planAtLeast(ctx.planTier, 'pro') && (
            <AttentionCard
              title="Unanswered messages"
              count={data.unreadMessages}
              countSuffix={data.unreadMessages === 1 ? 'thread waiting on a reply' : 'threads waiting on a reply'}
              cta={data.unreadMessages > 0 ? { label: 'Open inbox', href: '/messages?unread=1' } : null}
              emptyCopy="No unread patient messages. Inbox zero — nice."
            />
          )}

          {/* Follow-ups your team owes a patient — overdue + due today (pro+). */}
          {planAtLeast(ctx.planTier, 'pro') && (
            <AttentionCard
              title="Follow-ups due"
              count={data.followups.overdue + data.followups.dueToday}
              countSuffix={
                data.followups.overdue > 0
                  ? `${data.followups.overdue} overdue · ${data.followups.dueToday} today`
                  : data.followups.dueToday === 1
                    ? 'follow-up due today'
                    : 'follow-ups due today'
              }
              cta={
                data.followups.overdue + data.followups.dueToday > 0
                  ? { label: 'Work the list', href: data.followups.overdue > 0 ? '/followups?due=overdue' : '/followups?due=today' }
                  : data.followups.openTotal > 0
                    ? { label: 'View all', href: '/followups' }
                    : null
              }
              emptyCopy="Nothing due today. Add a follow-up from any patient to never drop a callback again."
            >
              {data.followups.preview.map((f) => (
                <li key={f.id} className="flex items-center justify-between text-sm py-1.5">
                  <span className="truncate text-gray-700 dark:text-gray-200">{f.title}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 truncate max-w-[40%]">
                    {f.patientName}
                  </span>
                </li>
              ))}
            </AttentionCard>
          )}

          {/* Paid shop orders still to fulfill — your move (premium). */}
          {planAtLeast(ctx.planTier, 'premium') && (
            <AttentionCard
              title="Orders to fulfill"
              count={data.paidOrdersUnfulfilled}
              countSuffix={data.paidOrdersUnfulfilled === 1 ? 'paid order awaiting fulfillment' : 'paid orders awaiting fulfillment'}
              cta={data.paidOrdersUnfulfilled > 0 ? { label: 'Fulfill orders', href: '/shop/orders?status=paid' } : null}
              emptyCopy="No paid orders waiting to ship or be picked up."
            />
          )}
        </MorningReveal>
      </section>

      {/* ── Row 2 — Today's chair ────────────────────────────────────── */}
      <section className="mb-8">
        <div className="v2-card overflow-hidden">
          <div className="v2-well rounded-none px-5 py-4 border-b border-[color:var(--color-hairline)] flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Today&rsquo;s chair
            </h2>
            {/* The section's heartbeat (law 7): confirmed share of today, ring +
                explicit text (color never carries meaning alone). Completed
                visits count as confirmed — a done visit isn't "needs a text". */}
            {(() => {
              const total = data.todaysAppointments.length
              const confirmed = data.todaysAppointments.filter(
                (a) => a.status === 'confirmed' || a.status === 'completed',
              ).length
              return (
                <span className="flex items-center gap-2.5">
                  {/* The count drills into today's agenda (every number opens
                      the list behind it). */}
                  <Link
                    href="/appointments?window=today"
                    className="text-xs text-gray-500 dark:text-gray-400 tabular-nums font-mono-num hover:underline"
                  >
                    {total} {total === 1 ? 'appointment' : 'appointments'}
                    {total > 0 && ` · ${confirmed} confirmed`}
                  </Link>
                  {total > 0 && (
                    <ProgressRing
                      value={confirmed}
                      max={total}
                      size={34}
                      label={`${confirmed} of ${total} confirmed`}
                    />
                  )}
                </span>
              )
            })()}
          </div>
          {data.todaysAppointments.length === 0 ? (
            <EmptyState
              icon="☕"
              title="Nothing booked today."
              body="Go enjoy a quiet morning."
            />
          ) : (
            <ul className="divide-y divide-[color:var(--color-hairline)]">
              {data.todaysAppointments.map((a) => (
                <TodayChairRow key={a.id} appt={a} timeZone={data.timeZone} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Row 3 — Trend tiles ──────────────────────────────────────── */}
      {/* The Overview's hero KPIs count up once on first session entry, in the
          same beat as the attention-card cascade (Part 3). */}
      <section className="mb-8">
        <div className={site ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3' : 'grid grid-cols-2 lg:grid-cols-4 gap-3'}>
          <KpiStat
            label="Bookings today"
            value={data.trends.bookingsToday}
            sub="across all channels"
            href="/appointments?window=today"
            countUp
            spark={data.trends.bookingsPerDay14}
          />
          <KpiStat
            label="New patients MTD"
            value={data.trends.newPatientsMTD}
            sub={
              data.trends.newPatientsLastMTD === 0
                ? 'first month tracking'
                : `${mtdDelta >= 0 ? '+' : ''}${mtdDelta} vs last month`
            }
            tone={data.trends.newPatientsLastMTD === 0 ? undefined : mtdDelta >= 0 ? 'ok' : 'urgent'}
            href="/patients?status=new"
            countUp
          />
          <KpiStat
            label="Upcoming"
            value={data.trends.upcomingNext7d}
            sub="next 7 days"
            href="/appointments?window=this_week"
            countUp
          />
          <KpiStat
            label="Intake forms"
            value={data.trends.activeIntakeForms}
            sub={data.trends.activeIntakeForms === 1 ? 'active template' : 'active templates'}
            href="/intake-forms"
            countUp
          />
          {site && (
            <KpiStat
              label="Website visits"
              value={site.total}
              sub={
                siteDeltaPct == null
                  ? 'last 7 days'
                  : `${siteDeltaPct >= 0 ? '+' : ''}${siteDeltaPct}% vs prior week`
              }
              tone={siteDeltaPct == null ? undefined : siteDeltaPct >= 0 ? 'ok' : 'urgent'}
              href="/growth/analytics"
              countUp
            />
          )}
        </div>
      </section>

      {/* ── Row 4 — Recent activity ──────────────────────────────────── */}
      <section className="mb-8">
        <div className="v2-card overflow-hidden">
          <div className="v2-well rounded-none px-5 py-4 border-b border-[color:var(--color-hairline)]">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Recent activity
            </h2>
          </div>
          {data.recentActivity.length === 0 ? (
            <EmptyState
              title="No activity yet."
              body="Bookings, intake submissions, and paid invoices will appear here."
            />
          ) : (
            <ul className="divide-y divide-[color:var(--color-hairline)]">
              {data.recentActivity.map((a) => {
                const inner = (
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0" aria-hidden="true">{ACTIVITY_ICON[a.kind]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 dark:text-gray-100 truncate">
                        {a.title}
                      </div>
                      {a.subtitle && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {a.subtitle}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 tabular-nums" suppressHydrationWarning>
                      {formatRelativeDate(a.occurredAt)}
                    </span>
                  </div>
                )
                return (
                  <li key={a.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/30">
                    {a.href ? (
                      <Link href={a.href} className="block">{inner}</Link>
                    ) : (
                      inner
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ── Bottom — reviews (live) + the one honest coming-soon ─────────── */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Reviews is LIVE — a real 30-day count, not a placeholder. */}
          <ReviewsReceivedCard
            completed={data.reviewsReceived.completed30d}
            sent={data.reviewsReceived.sent30d}
          />
          <ComingSoonCard
            title="SMS replies"
            blurb="Two-way patient text. Replies land in your inbox."
          />
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────

function AttentionCard({
  title,
  count,
  countSuffix,
  cta,
  emptyCopy,
  children,
}: {
  title: string
  count: number
  countSuffix: string
  cta: { label: string; href: string } | null
  emptyCopy: string
  children?: React.ReactNode
}) {
  return (
    <div className="v2-card h-full p-5 flex flex-col">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        {title}
      </p>
      <div className="flex items-baseline gap-2 mb-2">
        {/* Zero keeps full contrast — an empty queue is information, not decoration. */}
        <span className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">
          {count}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{countSuffix}</span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic flex-1 mt-1">
          {emptyCopy}
        </p>
      ) : (
        <ul className="text-sm text-gray-700 dark:text-gray-200 mt-1 flex-1">{children}</ul>
      )}
      {cta && (
        // Attention-card CTAs are ghost links (teal = identity, not status);
        // the page's one primary lives in the header.
        <Link
          href={cta.href}
          className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 hover:underline mt-3 self-start"
        >
          {cta.label} →
        </Link>
      )}
    </div>
  )
}

function TodayChairRow({ appt, timeZone }: { appt: TodayAppointmentRow; timeZone: string }) {
  const statusKey = appt.status
  const tone = STATUS_TONE[statusKey] ?? STATUS_TONE.scheduled
  const statusLabel = STATUS_LABELS[statusKey] ?? statusKey
  const statusTitle = STATUS_TITLES[statusKey]
  const typeLabel = appt.type.replace('_', ' ')

  // Map the overview's row flags onto the shared glyph registry. Missing-intake
  // only fires for new patients with no form on file (the original gating).
  const glyphs = patientFlagGlyphs({
    newPatient: appt.flags.newPatient,
    birthdayThisWeek: appt.flags.birthdayThisWeek,
    hasOutstandingBalance: appt.flags.hasOutstandingBalance,
    missingIntakeBeforeAppt: appt.flags.newPatient && !appt.flags.hasIntakeOnFile,
  })

  return (
    <li className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-900/30">
      <div className="shrink-0 w-16 text-sm font-mono-num font-medium text-gray-600 dark:text-gray-300 tabular-nums">
        {formatClinicTime(appt.startTime, timeZone)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/patients/${appt.patientId}`}
            className="font-semibold text-gray-900 dark:text-gray-100 truncate hover:underline"
          >
            {appt.patientName}
          </Link>
          <GlyphCluster glyphs={glyphs} />
          {appt.tags.slice(0, 3).map((t) => (
            <TagChip key={t.id} name={t.name} color={t.color} size="xs" />
          ))}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{typeLabel}</div>
      </div>
      <StatusPill tone={tone} label={statusLabel} title={statusTitle} className="shrink-0" />
    </li>
  )
}

function ComingSoonCard({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="v2-well border border-dashed border-[color:var(--color-hairline-strong)] p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </span>
        <span className="text-xs font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
          Coming soon
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{blurb}</p>
    </div>
  )
}

// Reviews is LIVE — a real 30-day count off the review funnel, with a link
// into the received-reviews surface. Replaces the old "coming soon" Reviews
// placeholder (Reviews & Reputation v2 shipped).
function ReviewsReceivedCard({ completed, sent }: { completed: number; sent: number }) {
  return (
    <div className="v2-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Reviews received (30d)
      </p>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">{completed}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          from {sent} {sent === 1 ? 'request' : 'requests'} sent
        </span>
      </div>
      <Link
        href="/growth/reviews/received"
        className="text-sm font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 hover:underline"
      >
        {completed > 0 ? 'Read reviews & feature them' : 'Open Reviews'} →
      </Link>
    </div>
  )
}
