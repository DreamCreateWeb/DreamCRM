'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import type { AppointmentDetail } from '@/lib/services/appointments'
import { appointmentFlagGlyphs, type Tone } from '@/lib/ui/encodings'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { useDrawerExit } from '@/components/ui/use-drawer-exit'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { GlyphCluster } from '@/components/ui/glyph-cluster'
import { FlashToast } from '@/components/ui/flash-toast'
import FollowupQuickAdd from '@/components/followups/followup-quick-add'
import PatientTagControl from '@/components/tags/patient-tag-control'
import SendIntakeInline from '../patients/send-intake-inline'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { sendReviewRequestForPatientAction } from '../patients/actions'
import BookFromPatientDrawer from './book-from-patient-drawer'
import {
  confirmAppointmentAction,
  cancelAppointmentAction,
  markNoShowAction,
  markCompletedAction,
  rescheduleAppointmentAction,
  sendReminderAction,
} from './actions'

function money(cents: number): string {
  if (cents === 0) return '$0'
  const d = cents / 100
  if (d >= 1000) return `$${(d / 1000).toFixed(1)}k`
  return `$${d.toFixed(0)}`
}

function fmtFull(d: Date): string {
  return d.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtRelative(d: Date | null): string {
  if (!d) return '—'
  const ms = Date.now() - d.getTime()
  const mins = Math.floor(Math.abs(ms) / 60000)
  const fut = ms < 0
  if (mins < 60) return fut ? `in ${mins}m` : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return fut ? `in ${hrs}h` : `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return fut ? `in ${days}d` : `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Unconfirmed',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}
const STATUS_TONE: Record<string, Tone> = {
  scheduled: 'warn',
  confirmed: 'ok',
  completed: 'neutral',
  cancelled: 'urgent',
  no_show: 'urgent',
}
const STATUS_TITLE: Record<string, string> = {
  scheduled: "Hasn't confirmed yet — send a reminder",
  confirmed: 'The patient confirmed this visit',
  completed: 'This visit is done',
  cancelled: 'This visit was cancelled',
  no_show: "The patient didn't show",
}

export default function AppointmentDrawer({
  appointmentId,
  onClose,
}: {
  appointmentId: string
  onClose: () => void
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [detail, setDetail] = useState<AppointmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [reschedOpen, setReschedOpen] = useState(false)
  const [rebookOpen, setRebookOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Trap focus in the drawer (it's a hand-rolled role="dialog"). Gated off while
  // a sub-drawer is open — those own their focus trap, so only the top layer
  // captures Tab. Esc stays on the drawer's own handler below.
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(!reschedOpen && !rebookOpen, dialogRef)
  // Slide-in/out motion matched to the shared <Drawer>; ✕ / backdrop / Esc
  // route through requestClose so the exit plays before the parent unmounts.
  const { closing, requestClose } = useDrawerExit(onClose)

  async function loadDetail() {
    setLoading(true)
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const d = await res.json()
      const rehydrated = {
        ...d,
        startTime: new Date(d.startTime),
        endTime: d.endTime ? new Date(d.endTime) : null,
        confirmedAt: d.confirmedAt ? new Date(d.confirmedAt) : null,
        cancelledAt: d.cancelledAt ? new Date(d.cancelledAt) : null,
        createdAt: new Date(d.createdAt),
        reminderLastSentAt: d.reminderLastSentAt ? new Date(d.reminderLastSentAt) : null,
        patient: {
          ...d.patient,
          lastVisitAt: d.patient.lastVisitAt ? new Date(d.patient.lastVisitAt) : null,
        },
        reminders: (d.reminders ?? []).map((r: { sentAt: string; deliveredAt?: string; repliedAt?: string }) => ({
          ...r,
          sentAt: new Date(r.sentAt),
          deliveredAt: r.deliveredAt ? new Date(r.deliveredAt) : null,
          repliedAt: r.repliedAt ? new Date(r.repliedAt) : null,
        })),
        intakeAttached: d.intakeAttached
          ? { ...d.intakeAttached, submittedAt: new Date(d.intakeAttached.submittedAt) }
          : null,
      }
      setDetail(rehydrated as AppointmentDetail)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId])

  // Esc closes the drawer (parity with the shared Drawer primitive). Skip when
  // a sub-drawer is open so Esc dismisses that first.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !reschedOpen && !rebookOpen) requestClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [requestClose, reschedOpen, rebookOpen])

  function refresh() {
    router.refresh()
    onClose()
  }

  function flash(msg: string) {
    setToast(msg)
  }

  function onConfirm() {
    startTransition(async () => {
      await confirmAppointmentAction(appointmentId)
      flash('Confirmed.')
      router.refresh()
      onClose()
    })
  }

  async function onCancel() {
    if (
      !(await confirm({
        title: 'Cancel this appointment?',
        message: 'The patient will not be notified automatically.',
        confirmLabel: 'Cancel appointment',
        danger: true,
      }))
    )
      return
    startTransition(async () => {
      await cancelAppointmentAction(appointmentId)
      flash('Cancelled.')
      router.refresh()
      onClose()
    })
  }

  async function onNoShow() {
    if (!(await confirm({ title: 'Mark as no-show?', confirmLabel: 'Mark no-show', danger: true }))) return
    startTransition(async () => {
      await markNoShowAction(appointmentId)
      flash('Marked no-show.')
      refresh()
    })
  }

  function onComplete() {
    startTransition(async () => {
      await markCompletedAction(appointmentId)
      flash('Marked completed.')
      refresh()
    })
  }

  function onRequestReview() {
    if (!detail) return
    const patientId = detail.patient.id
    startTransition(async () => {
      const r = await sendReviewRequestForPatientAction(patientId)
      // The service enforces every guard (no email, opted out, no platforms
      // configured, within the rate-limit window) — surface its message verbatim.
      flash(r.ok ? 'Review request sent.' : r.error)
    })
  }

  function onSendReminder() {
    startTransition(async () => {
      const r = await sendReminderAction(appointmentId, 'email')
      flash('ok' in r && r.ok === true ? 'Reminder sent.' : 'error' in r ? r.error : 'Failed')
      router.refresh()
      // Re-fetch the drawer payload so the new reminder log entry shows
      // up in the activity stripe without a close+reopen cycle.
      await loadDetail()
    })
  }

  const isScheduled = detail?.status === 'scheduled'
  const isOpenState = detail?.status === 'scheduled' || detail?.status === 'confirmed'
  const isPastOpen = !!detail && isOpenState && detail.startTime < new Date()
  // Cancelled / no-show rows are recovery candidates — lead with "Rebook".
  const isRecoverable = detail?.status === 'cancelled' || detail?.status === 'no_show'

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] drawer-backdrop-enter ${closing ? 'is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Appointment"
        onClick={(e) => e.stopPropagation()}
        className={`drawer-enter-right ${closing ? 'is-closing' : ''} bg-[color:var(--color-surface-2)] w-full sm:w-[480px] h-full overflow-y-auto rounded-l-[var(--r-lg)] shadow-[var(--shadow-modal)] flex flex-col`}
      >
        <div className="sticky top-0 z-10 bg-[color:var(--color-surface-2)]/95 backdrop-blur px-5 py-3 border-b border-[color:var(--color-hairline)] flex items-center justify-between">
          <h2 className="text-[14px] font-medium text-gray-900 dark:text-gray-100">Appointment</h2>
          <button
            onClick={requestClose}
            title="Close (Esc)"
            aria-label="Close"
            className="p-1.5 rounded-[var(--r-sm)] text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</div>
        ) : error ? (
          <div className="px-5 py-10 text-center text-sm text-rose-600 dark:text-rose-400">{error}</div>
        ) : detail ? (
          <div className="flex-1 flex flex-col">
            <div className="px-5 py-5 space-y-4">
              {/* ── Identity header ──────────────────────────────────── */}
              <div>
                <Link
                  href={`/patients/${detail.patient.id}`}
                  className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 hover:underline"
                >
                  {detail.patient.fullName}
                </Link>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <StatusPill tone={STATUS_TONE[detail.status] ?? 'neutral'} title={STATUS_TITLE[detail.status]}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </StatusPill>
                  <GlyphCluster glyphs={appointmentFlagGlyphs(detail.flags)} cap={Infinity} />
                </div>
                {/* Tags are now editable in place — apply "VIP"/"anxious"/a
                    recare flag while you're looking at the visit; it flows into
                    the targeting loop (view → audience → campaign). */}
                <div className="mt-1.5">
                  <PatientTagControl patientId={detail.patient.id} initialTags={detail.tags} />
                </div>
              </div>

              {/* ── Appointment facts ────────────────────────────────── */}
              <div className="space-y-1 text-sm">
                <p className="text-gray-800 dark:text-gray-100 font-medium capitalize">{detail.type.replace(/_/g, ' ')}</p>
                <p className="text-gray-700 dark:text-gray-200">{fmtFull(detail.startTime)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {detail.durationMinutes ? `${detail.durationMinutes} min` : 'duration unspecified'}
                  {detail.providerName && ` · with ${detail.providerName}`}
                  {detail.locationName && ` · at ${detail.locationName}`}
                </p>
              </div>

              {/* ── Context stats ────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3 v2-well p-3">
                <Stat label="Last visit" value={fmtRelative(detail.patient.lastVisitAt)} />
                <Stat label="Balance" value={money(detail.patient.outstandingBalanceCents)} tone={detail.patient.outstandingBalanceCents > 0 ? 'warn' : 'ok'} />
                <Stat label="Lifetime spend" value={money(detail.patient.lifetimeValueCents)} />
                <Stat label="Total bookings" value={String(detail.patient.totalBookings)} />
              </div>

              {/* ── Quick add a follow-up for this patient ───────────── */}
              <FollowupQuickAdd
                patientId={detail.patient.id}
                patientFirstName={detail.patient.fullName.split(' ')[0] ?? 'this patient'}
                onDone={(msg) => setToast(msg)}
              />

              {/* ── Action group — exactly one primary ───────────────── */}
              <div className="flex flex-wrap gap-2">
                {isRecoverable ? (
                  <ActionButton variant="primary" size="sm" onClick={() => setRebookOpen(true)} disabled={pending}>
                    Rebook patient
                  </ActionButton>
                ) : isScheduled ? (
                  <ActionButton variant="primary" size="sm" onClick={onConfirm} disabled={pending}>
                    Mark confirmed
                  </ActionButton>
                ) : detail.status === 'completed' ? (
                  // The visit's done — the natural next step is asking for a review.
                  <ActionButton variant="primary" size="sm" onClick={onRequestReview} disabled={pending}>
                    Request review
                  </ActionButton>
                ) : (
                  <ActionButton variant="primary" size="sm" onClick={onSendReminder} disabled={pending}>
                    Send reminder email
                  </ActionButton>
                )}
                {/* When scheduled, "Send reminder" is a secondary verb (the
                    primary is "Mark confirmed"). */}
                {isScheduled && (
                  <ActionButton variant="secondary" size="sm" onClick={onSendReminder} disabled={pending}>
                    Send reminder email
                  </ActionButton>
                )}
                {detail.status !== 'completed' && detail.status !== 'cancelled' && (
                  <ActionButton variant="secondary" size="sm" onClick={() => setReschedOpen(true)} disabled={pending}>
                    Reschedule
                  </ActionButton>
                )}
                {isPastOpen && (
                  <ActionButton variant="secondary" size="sm" onClick={onComplete} disabled={pending}>
                    Mark completed
                  </ActionButton>
                )}
              </div>

              {/* ── Destructive actions — separated, never beside primary ── */}
              {isOpenState && (
                <div className="flex flex-wrap gap-2 pt-3 border-t border-[color:var(--color-hairline)]">
                  {isPastOpen && (
                    <ActionButton variant="danger" size="sm" onClick={onNoShow} disabled={pending}>
                      Mark no-show
                    </ActionButton>
                  )}
                  <ActionButton variant="danger" size="sm" onClick={onCancel} disabled={pending}>
                    Cancel appointment
                  </ActionButton>
                </div>
              )}

              {detail.notes && (
                <div className="pt-3 border-t border-[color:var(--color-hairline)]">
                  <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}

              {/* Reminder activity */}
              <div className="pt-3 border-t border-[color:var(--color-hairline)]">
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Reminder activity</p>
                {detail.reminders.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    No reminders sent yet for this appointment.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.reminders.map((r) => (
                      <li key={r.id} className="text-xs text-gray-700 dark:text-gray-300">
                        <span className="font-medium uppercase tracking-wider text-xs text-gray-500 dark:text-gray-400">
                          {r.channel}
                        </span>{' '}
                        sent {fmtRelative(r.sentAt)}
                        {r.sentByName && <> by {r.sentByName}</>}
                        {r.repliedAt && (
                          <span className="text-emerald-700 dark:text-emerald-300"> · patient replied {fmtRelative(r.repliedAt)}</span>
                        )}
                        {r.replyBody && <p className="ml-4 mt-0.5 text-xs italic">&ldquo;{r.replyBody}&rdquo;</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Intake attached */}
              <div className="pt-3 border-t border-[color:var(--color-hairline)]">
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Intake</p>
                {detail.intakeAttached ? (
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    {detail.intakeAttached.formTitle} · submitted {fmtRelative(detail.intakeAttached.submittedAt)}
                    {' · '}
                    <Link href={`/intake-forms/submissions/${detail.intakeAttached.id}`} className="text-teal-700 dark:text-teal-400 hover:underline">View</Link>
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    No intake on file for this patient yet.{' '}
                    <SendIntakeInline
                      patientId={detail.patient.id}
                      label="Send the form"
                      className="underline text-amber-800 dark:text-amber-200 hover:opacity-80 disabled:opacity-50"
                    />
                    .
                  </p>
                )}
              </div>

              {/* Source / created */}
              <div className="pt-3 border-t border-[color:var(--color-hairline)]">
                <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Booking source</p>
                <p className="text-xs text-gray-700 dark:text-gray-200">
                  {detail.source
                    ? `via ${detail.source.replace(/_/g, ' ')}`
                    : 'no source recorded'}{' '}
                  · created {fmtRelative(detail.createdAt)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {reschedOpen && detail && (
          <RescheduleSubDrawer
            detail={detail}
            onClose={() => setReschedOpen(false)}
            onDone={refresh}
          />
        )}

        {rebookOpen && detail && (
          <BookFromPatientDrawer
            patientId={detail.patient.id}
            patientName={detail.patient.fullName}
            defaultType={detail.type}
            onClose={() => { setRebookOpen(false); refresh() }}
          />
        )}

        {toast && <FlashToast message={toast} onDone={() => setToast(null)} duration={3000} />}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'ok' | 'warn'
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-amber-700 dark:text-amber-300'
      : tone === 'ok'
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-gray-800 dark:text-gray-100'
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</p>
      <p className={`text-sm font-semibold font-mono-num tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}

function RescheduleSubDrawer({
  detail,
  onClose,
  onDone,
}: {
  detail: AppointmentDetail
  onClose: () => void
  onDone: () => void
}) {
  const subRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, subRef, { onEscape: onClose })
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [timeStr, setTimeStr] = useState('09:00')
  const [notify, setNotify] = useState(true)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const iso = `${dateStr}T${timeStr}:00`
    const local = new Date(iso)
    if (Number.isNaN(local.getTime())) { setError('Pick a valid date + time'); return }
    startTransition(async () => {
      const r = await rescheduleAppointmentAction({
        appointmentId: detail.id,
        newStartTime: local.toISOString(),
        notifyPatient: notify,
      })
      if ('ok' in r && r.ok === true) {
        onDone()
      } else if ('error' in r) {
        setError(r.error)
      }
    })
  }

  return (
    <div
      ref={subRef}
      role="dialog"
      aria-modal="true"
      aria-label="Reschedule appointment"
      className="absolute inset-0 bg-[color:var(--color-surface-2)] rounded-l-[var(--r-lg)] flex flex-col"
    >
      <div className="px-5 py-4 border-b border-[color:var(--color-hairline)] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Reschedule</h3>
        <button onClick={onClose} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Back</button>
      </div>
      <div className="px-5 py-5 space-y-3 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Moves <strong>{detail.patient.fullName}</strong> from{' '}
          <strong>{fmtFull(detail.startTime)}</strong> to a new slot. The original row stays in the audit trail as cancelled.
        </p>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">New date</span>
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="form-input w-full mt-1 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">New time</span>
          <input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} className="form-input w-full mt-1 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="form-checkbox" />
          Notify patient via email
        </label>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
      <div className="px-5 py-4 border-t border-[color:var(--color-hairline)] flex justify-end gap-2">
        <ActionButton variant="secondary" size="sm" onClick={onClose} disabled={pending}>
          Cancel
        </ActionButton>
        <ActionButton variant="primary" size="sm" onClick={submit} disabled={pending}>
          {pending ? 'Rescheduling…' : 'Confirm reschedule'}
        </ActionButton>
      </div>
    </div>
  )
}
