import Link from 'next/link'
import { getClinicOverview, type TodayAppointmentRow, type ActivityKind } from '@/lib/services/clinic-overview'
import type { TenantContext } from '@/lib/auth/context'
import { formatRelativeDate } from '@/lib/utils/format'

const STATUS_PILLS: Record<string, string> = {
  scheduled: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  completed: 'bg-gray-500/15 text-gray-600 dark:text-gray-300',
  cancelled: 'bg-red-500/15 text-red-700 dark:text-red-300',
  no_show: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Unconfirmed',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

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

function fmtTime(d: Date): string {
  return d.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fmtDayHeader(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default async function ClinicOverview({ ctx }: { ctx: TenantContext }) {
  const data = await getClinicOverview(ctx.organizationId)
  const name = ctx.organizationName
  const mtdDelta = data.trends.newPatientsMTD - data.trends.newPatientsLastMTD

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Sticky hero ──────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
            Morning huddle · {fmtDayHeader(data.date)}
          </p>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            {name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/appointments"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            Open agenda
          </Link>
          <Link
            href="/appointments?window=today"
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            + New booking
          </Link>
        </div>
      </div>

      {/* ── Integrations sync-health banner (renders only when unhealthy) ── */}
      {data.integrationsHealth && data.integrationsHealth.severity !== 'info' && (
        <section className="mb-6">
          <div
            className={[
              'rounded-xl border p-4 flex items-start gap-3',
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
                Integrations: sync needs attention
              </p>
              <p
                className={[
                  'text-[12px] mt-0.5',
                  data.integrationsHealth.severity === 'error'
                    ? 'text-rose-800/80 dark:text-rose-300/80'
                    : 'text-amber-800/80 dark:text-amber-300/80',
                ].join(' ')}
              >
                {data.integrationsHealth.message}
              </p>
            </div>
            <Link
              href="/integrations"
              className={[
                'text-[12px] font-medium px-3 py-1.5 rounded-lg shrink-0 self-center',
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

      {/* ── Row 1 — Needs your attention ─────────────────────────────── */}
      <section className="mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3">
                  {r.startTime.toLocaleString('en-US', {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </AttentionCard>

          <AttentionCard
            title="New intake submissions"
            count={data.intakeSubmissions.count}
            countSuffix={data.intakeSubmissions.count === 1 ? 'in the last 7 days' : 'in the last 7 days'}
            cta={data.intakeSubmissions.count > 0 ? { label: 'Review submissions', href: '/intake-forms' } : null}
            emptyCopy="No intake submissions this week. Send the link to new bookings to drive volume."
          >
            {data.intakeSubmissions.preview.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm py-1.5">
                <span className="truncate text-gray-700 dark:text-gray-200">
                  {r.submitterName ?? 'Anonymous'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3 truncate max-w-[10ch]">
                  {r.formTitle}
                </span>
              </li>
            ))}
          </AttentionCard>

          <AttentionCard
            title="Outstanding balances"
            count={data.outstandingBalances.count}
            countSuffix={
              data.outstandingBalances.count > 0
                ? `${data.outstandingBalances.count === 1 ? 'invoice' : 'invoices'} · ${money(data.outstandingBalances.totalCents)}`
                : 'invoices to chase'
            }
            cta={data.outstandingBalances.count > 0 ? { label: 'View invoices', href: '/ecommerce/invoices' } : null}
            emptyCopy="No outstanding shop balances. Patients are paid up."
          >
            {/* Balance card has no per-row preview yet — totals tell the story. */}
            {data.outstandingBalances.count > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">
                Click through to see who owes and send pay-link reminders.
              </p>
            )}
          </AttentionCard>

          <AttentionCard
            title="New leads"
            count={data.newLeads.count}
            countSuffix={
              data.newLeads.count === 1 ? 'untouched website inquiry' : 'untouched website inquiries'
            }
            cta={data.newLeads.count > 0 ? { label: 'Triage leads', href: '/leads?status=new' } : null}
            emptyCopy="No new website leads waiting. Anyone who fills out your contact form lands here."
          >
            {data.newLeads.preview.map((l) => (
              <li key={l.id} className="flex items-center justify-between text-sm py-1.5">
                <span className="truncate text-gray-700 dark:text-gray-200">{l.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-3">
                  {l.ageHours < 1 ? 'just now' : `${l.ageHours}h ago`}
                </span>
              </li>
            ))}
          </AttentionCard>
        </div>
      </section>

      {/* ── Row 2 — Today's chair ────────────────────────────────────── */}
      <section className="mb-8">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Today&rsquo;s chair
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {data.todaysAppointments.length}{' '}
              {data.todaysAppointments.length === 1 ? 'appointment' : 'appointments'}
            </span>
          </div>
          {data.todaysAppointments.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-3xl mb-2">☕</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                Nothing booked today.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Go enjoy a quiet morning.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {data.todaysAppointments.map((a) => (
                <TodayChairRow key={a.id} appt={a} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Row 3 — Trend tiles ──────────────────────────────────────── */}
      <section className="mb-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <TrendTile
            label="Bookings today"
            value={data.trends.bookingsToday.toString()}
            hint="across all channels"
          />
          <TrendTile
            label="New patients MTD"
            value={data.trends.newPatientsMTD.toString()}
            hint={
              data.trends.newPatientsLastMTD === 0
                ? 'first month tracking'
                : `${mtdDelta >= 0 ? '+' : ''}${mtdDelta} vs last month`
            }
            tone={mtdDelta >= 0 ? 'positive' : 'negative'}
          />
          <TrendTile
            label="Upcoming"
            value={data.trends.upcomingNext7d.toString()}
            hint="next 7 days"
          />
          <TrendTile
            label="Intake forms"
            value={data.trends.activeIntakeForms.toString()}
            hint={data.trends.activeIntakeForms === 1 ? 'active template' : 'active templates'}
          />
        </div>
      </section>

      {/* ── Row 4 — Recent activity ──────────────────────────────────── */}
      <section className="mb-8">
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Recent activity
            </h2>
          </div>
          {data.recentActivity.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No activity yet. Bookings, intake submissions, and paid invoices will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {data.recentActivity.map((a) => {
                const inner = (
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0">{ACTIVITY_ICON[a.kind]}</span>
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
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0" suppressHydrationWarning>
                      {formatRelativeDate(a.occurredAt)}
                    </span>
                  </div>
                )
                return (
                  <li key={a.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
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

      {/* ── Bottom — Coming soon strip ───────────────────────────────── */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ComingSoonCard
            title="Reviews & reputation"
            blurb="Auto-prompt patients for Google reviews after the visit."
          />
          <ComingSoonCard
            title="SMS replies"
            blurb="Two-way patient text via Twilio. Replies land in your inbox."
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
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-5 flex flex-col">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
        {title}
      </p>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-3xl font-bold ${count > 0 ? 'text-gray-800 dark:text-gray-100' : 'text-gray-300 dark:text-gray-600'}`}>
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
        <Link
          href={cta.href}
          className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline mt-3 self-start"
        >
          {cta.label} →
        </Link>
      )}
    </div>
  )
}

function TodayChairRow({ appt }: { appt: TodayAppointmentRow }) {
  const statusKey = appt.status
  const statusClass = STATUS_PILLS[statusKey] ?? STATUS_PILLS.scheduled
  const statusLabel = STATUS_LABELS[statusKey] ?? statusKey
  const typeLabel = appt.type.replace('_', ' ')

  return (
    <li className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
      <div className="shrink-0 w-16 text-sm font-mono font-medium text-gray-600 dark:text-gray-300">
        {fmtTime(appt.startTime)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/patients/${appt.patientId}`}
            className="font-semibold text-gray-800 dark:text-gray-100 truncate hover:underline"
          >
            {appt.patientName}
          </Link>
          {appt.flags.newPatient && (
            <span title="New patient" className="text-amber-500 text-sm" aria-label="New patient">
              ★
            </span>
          )}
          {appt.flags.birthdayThisWeek && (
            <span title="Birthday this week" className="text-pink-500 text-sm" aria-label="Birthday this week">
              🎂
            </span>
          )}
          {appt.flags.hasOutstandingBalance && (
            <span
              title="Outstanding balance on file"
              className="text-red-500 text-sm"
              aria-label="Outstanding balance"
            >
              $
            </span>
          )}
          {!appt.flags.hasIntakeOnFile && appt.flags.newPatient && (
            <span
              title="No intake form on file"
              className="text-amber-500 text-sm"
              aria-label="No intake form on file"
            >
              📝!
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{typeLabel}</div>
      </div>
      <span
        className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${statusClass}`}
      >
        {statusLabel}
      </span>
    </li>
  )
}

function TrendTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string
  value: string
  hint: string
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  const hintClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-500 dark:text-gray-400'
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4">
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">
        {label}
      </p>
      <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{value}</div>
      <div className={`text-xs mt-1 ${hintClass}`}>{hint}</div>
    </div>
  )
}

function ComingSoonCard({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900/30 border border-dashed border-gray-200 dark:border-gray-700/60 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
          Coming soon
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{blurb}</p>
    </div>
  )
}
