import Link from 'next/link'
import { getClinicOverview, type TodayAppointmentRow, type ActivityKind } from '@/lib/services/clinic-overview'
import { getStaffOnboarding, getActivationChecklist } from '@/lib/services/staff-onboarding'
import { listOpenProposals } from '@/lib/services/proposals'
import { countRunway } from '@/lib/services/dream-team'

import { buildWeeklyStandup } from '@/lib/services/standup'
import { getActiveGuardianNote } from '@/lib/services/guardian'
import DreamTeamStrip from './dream-team-strip'
import GuardianNoteCard from './guardian-note-card'
import StandupCard from './standup-card'
import WelcomeModal from '@/components/onboarding/welcome-modal'
import GettingStarted from '@/components/onboarding/getting-started'
import type { TenantContext } from '@/lib/auth/context'
import { readDemoSkin } from '@/lib/demo-skin'
import { formatRelativeDate } from '@/lib/utils/format'
import { formatClinicTime, formatClinicDayHeader, formatClinicDayTime } from '@/lib/format-datetime'
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
import { leadAgeLabel } from '@/lib/lead-age'
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
// Times + day headers render at the CLINIC's wall-clock — this is a server
// component, so bare toLocale* would print UTC (formatClinicTime /
// formatClinicDayHeader from @/lib/format-datetime, tz from the snapshot).

export default async function ClinicOverview({ ctx }: { ctx: TenantContext }) {
  const [data, onboarding, proposals, stagedCount, standup, guardianNote] = await Promise.all([
    getClinicOverview(ctx.organizationId),
    getStaffOnboarding(ctx.organizationId, ctx.userId),
    // The Dream Team's summons strip + the weekly standup are best-effort
    // reads — the morning huddle must never fail because a narrator
    // hiccupped. The FULL Approval Inbox (artifacts, unedited runs, the
    // grants strip) moved to /dream-team (docs/ai-operations.md, D2); the
    // Overview reads only what the one-row summons needs.
    listOpenProposals(ctx.organizationId).catch(() => []),
    // The veto runway's count (D4) — the strip mentions staged work so the
    // Stop window is visible from the huddle. Best-effort, 0 on failure.
    countRunway(ctx.organizationId),
    buildWeeklyStandup(ctx.organizationId).catch(() => null),
    // THE GUARDIAN's heads-up (Phase 4), when the audience lock is open
    // and the finding is one this practice can act on. Self-expiring and
    // re-verified against live switches inside the service.
    getActiveGuardianNote(ctx.organizationId).catch(() => null),
  ])
  // The checklist derives from live org data — only compute it while it's
  // still showing (not dismissed; auto-hides once everything is done).
  const checklist = onboarding.checklistDismissed
    ? null
    : await getActivationChecklist(ctx.organizationId)
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
        subtitle="What's worth your attention this morning — every number opens the list behind it."
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

      {/* ── Setup/sync attention banner (renders only when something's broken).
          Fed by the readiness resolver, so connected-but-broken reaches here
          for EVERY subsystem — PMS sync, the Google listing's Website button,
          a dropped inbox, Stripe restrictions, booking live on unconfirmed
          hours — not just the PMS like the old banner. */}
      {data.readinessAttention.length > 0 && (
        <section className="mb-6">
          <div className="rounded-[var(--r-lg)] bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 p-4">
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300"
                aria-hidden="true"
              >
                !
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  {data.readinessAttention.length === 1
                    ? data.readinessAttention[0].label
                    : `${data.readinessAttention.length} things need your attention`}
                </p>
                <ul className="mt-1 space-y-1.5">
                  {data.readinessAttention.map((f) => (
                    <li key={f.id} className="text-xs text-amber-800/90 dark:text-amber-300/90">
                      {data.readinessAttention.length > 1 && (
                        <span className="font-medium">{f.label} — </span>
                      )}
                      {f.summary}{' '}
                      <Link
                        href={f.href}
                        className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Website check-engine light (renders only when a signal fires) ──
          Traffic drop / silent forms — problems that never announce
          themselves. Same banner language as the sync-health notice above. */}
      {data.siteHealth && (
        <section className="mb-6">
          <div className="rounded-[var(--r-lg)] bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 p-4 flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base bg-amber-500/15"
              aria-hidden="true"
            >
              🌐
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {data.siteHealth.title}
              </p>
              <p className="text-xs mt-0.5 text-amber-800/90 dark:text-amber-300/90">
                {data.siteHealth.body}
              </p>
            </div>
            <Link
              href={data.siteHealth.href}
              className="text-xs font-medium px-3 py-1.5 rounded-lg shrink-0 self-center bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-200"
            >
              {data.siteHealth.linkLabel}
            </Link>
          </div>
        </section>
      )}

      {/* ── The Guardian's heads-up — the machine asking for a hand ────── */}
      <GuardianNoteCard note={guardianNote} />

      {/* ── The Dream Team's summons — one calm row; the stack lives on
          /dream-team (docs/ai-operations.md, D2) ─────────────────────── */}
      <DreamTeamStrip
        proposals={proposals.map((p) => ({
          id: p.id,
          capability: p.capability,
          capabilityLabel: p.capabilityLabel,
          expiresAt: p.expiresAt ?? null,
        }))}
        stagedCount={stagedCount}
      />

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
              <li key={r.id} className="py-1.5">
                {/* A name is a door everywhere else on this page — this one
                    opens the visit's own drawer, where the remedy lives. */}
                <Link
                  href={`/appointments?appt=${r.id}`}
                  className="flex items-center justify-between text-sm hover:underline"
                >
                  <span className="truncate text-gray-700 dark:text-gray-200">{r.patientName}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 tabular-nums">
                    {r.startTime.toLocaleString('en-US', {
                      weekday: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: data.timeZone,
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </AttentionCard>

          {/* Catch-net for "new patients means SEATED": a past visit nobody
              marked can't count anywhere (no review ask, no survey, no new-
              patient credit). Renders only when there's something to catch. */}
          {data.unmarkedPastVisits.count > 0 && (
            <AttentionCard
              title="Did these visits happen?"
              count={data.unmarkedPastVisits.count}
              countSuffix={
                data.unmarkedPastVisits.count === 1
                  ? 'past visit still needs an outcome'
                  : 'past visits still need an outcome'
              }
              cta={{ label: 'Mark what happened', href: '/appointments?window=past_30d&attention=unmarked' }}
              emptyCopy=""
            >
              {data.unmarkedPastVisits.preview.map((r) => (
                <li key={r.id} className="py-1.5">
                  <Link
                    href={`/appointments?appt=${r.id}`}
                    className="flex items-center justify-between text-sm hover:underline"
                  >
                    <span className="truncate text-gray-700 dark:text-gray-200">{r.patientName}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 tabular-nums">
                      {/* Month + day, not bare weekday — this card spans 30 days,
                          so "Tue 2:00 PM" is ambiguous across four Tuesdays. */}
                      {formatClinicDayTime(r.startTime, data.timeZone)}
                    </span>
                  </Link>
                </li>
              ))}
            </AttentionCard>
          )}

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
            title="New inquiries"
            count={data.newLeads.count}
            countSuffix={
              data.newLeads.count === 1 ? 'untouched website inquiry' : 'untouched website inquiries'
            }
            cta={data.newLeads.count > 0 ? { label: 'See new leads', href: '/leads?status=new' } : null}
            emptyCopy="No new inquiries waiting. Anyone who fills out your contact form lands here."
          >
            {data.newLeads.preview.map((l) => (
              <li key={l.id} className="py-1.5">
                <Link href="/leads?status=new" className="flex items-center justify-between text-sm hover:underline">
                  <span className="truncate text-gray-700 dark:text-gray-200">{l.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 tabular-nums">
                    {leadAgeLabel(l.ageHours)}
                  </span>
                </Link>
              </li>
            ))}
          </AttentionCard>

          {/* Unanswered patient messages — the ball is in our court . */}
          {(
            <AttentionCard
              title="Unanswered messages"
              count={data.unreadMessages}
              countSuffix={data.unreadMessages === 1 ? 'thread waiting on a reply' : 'threads waiting on a reply'}
              cta={data.unreadMessages > 0 ? { label: 'Open inbox', href: '/messages?unread=1' } : null}
              emptyCopy="No unread patient messages. Inbox zero — nice."
            />
          )}

          {/* Follow-ups your team owes a patient — overdue + due today . */}
          {(
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
                <li key={f.id} className="py-1.5">
                  <Link href="/followups" className="flex items-center justify-between text-sm hover:underline">
                    <span className="truncate text-gray-700 dark:text-gray-200">{f.title}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 truncate max-w-[40%]">
                      {f.patientName}
                    </span>
                  </Link>
                </li>
              ))}
            </AttentionCard>
          )}

          {/* Paid shop orders still to fulfill — your move . */}
          {(
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

      {/* ── The weekly standup — what the machine got done last week ──── */}
      {standup && <StandupCard standup={standup} />}

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
                  // Hover only where a click actually lands — a lit row with
                  // no destination is a false affordance.
                  <li
                    key={a.id}
                    className={`px-5 py-3 ${a.href ? 'hover:bg-gray-50 dark:hover:bg-gray-900/30' : ''}`}
                  >
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

      {/* ── Bottom — reviews (live). The old SMS "coming soon" card was
          permanent dead chrome holding half the row; the promise demotes to a
          one-line footnote inside the Reviews tile and still retires itself
          the moment this clinic's texting goes live (the honesty flip owns
          any live SMS surface). */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ReviewsReceivedCard
            completed={data.reviewsReceived.completed30d}
            sent={data.reviewsReceived.sent30d}
            smsComingSoon={!data.smsLive}
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
        {/* Zero keeps full contrast — an empty queue is information, not decoration.
            The page's own subtitle promises "every number opens the list behind
            it", so when a CTA exists the NUMBER is the link, not just the small
            ghost line below (the KpiStat recipe). */}
        {cta ? (
          <Link
            href={cta.href}
            className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 rounded-sm hover:text-teal-700 dark:hover:text-teal-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            aria-label={`${count} ${countSuffix}`}
          >
            {count}
          </Link>
        ) : (
          <span className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100">
            {count}
          </span>
        )}
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
      {/* Two-target row (the agenda's own pattern): the NAME opens the
          patient; time + status open the VISIT via the drawer deep-link —
          so an "Unconfirmed" pill is one click from its remedy. */}
      <Link
        href={`/appointments?appt=${appt.id}`}
        className="shrink-0 w-16 text-sm font-mono-num font-medium text-gray-600 dark:text-gray-300 tabular-nums hover:underline"
        aria-label={`Open this visit`}
      >
        {formatClinicTime(appt.startTime, timeZone)}
      </Link>
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
      <Link href={`/appointments?appt=${appt.id}`} className="shrink-0" aria-label="Open this visit">
        <StatusPill tone={tone} label={statusLabel} title={statusTitle} />
      </Link>
    </li>
  )
}


// Reviews is LIVE — a real 30-day count off the review funnel, with a link
// into the received-reviews surface. Replaces the old "coming soon" Reviews
// placeholder (Reviews & Reputation v2 shipped).
function ReviewsReceivedCard({
  completed,
  sent,
  smsComingSoon = false,
}: {
  completed: number
  sent: number
  /** True until this clinic's texting goes live — a one-line footnote, not a
   *  card of permanent dead chrome. */
  smsComingSoon?: boolean
}) {
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
      {smsComingSoon && (
        <p className="mt-3 border-t border-[color:var(--color-hairline)] pt-2 text-xs text-gray-500 dark:text-gray-400">
          Two-way patient texting is coming — replies will land in your inbox.
        </p>
      )}
    </div>
  )
}
