'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import type { AppointmentDetail } from '@/lib/services/appointments'
import { AppointmentGlyphCluster } from './appointment-glyph-cluster'
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

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
const STATUS_PILL: Record<string, string> = {
  scheduled: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  confirmed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  completed: 'bg-stone-500/15 text-stone-600 dark:text-stone-300',
  cancelled: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  no_show: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

export default function AppointmentDrawer({
  appointmentId,
  onClose,
}: {
  appointmentId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<AppointmentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [reschedOpen, setReschedOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/appointments/${appointmentId}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load (${r.status})`)
        return r.json()
      })
      .then((d) => {
        // Re-hydrate Date objects
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
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [appointmentId])

  function refresh() {
    router.refresh()
    onClose()
  }

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function onConfirm() {
    startTransition(async () => {
      await confirmAppointmentAction(appointmentId)
      flash('Confirmed.')
      router.refresh()
      onClose()
    })
  }

  function onCancel() {
    if (!confirm('Cancel this appointment? The patient will not be notified automatically.')) return
    startTransition(async () => {
      await cancelAppointmentAction(appointmentId)
      flash('Cancelled.')
      router.refresh()
      onClose()
    })
  }

  function onNoShow() {
    if (!confirm('Mark as no-show?')) return
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

  function onSendReminder() {
    startTransition(async () => {
      const r = await sendReminderAction(appointmentId, 'email')
      flash('ok' in r && r.ok === true ? 'Reminder sent.' : 'error' in r ? r.error : 'Failed')
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="bg-white dark:bg-gray-800 w-full sm:w-[480px] h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Appointment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="px-5 py-10 text-center text-sm text-red-600">{error}</div>
        ) : detail ? (
          <div className="flex-1 flex flex-col">
            <div className="px-5 py-5 space-y-4">
              {/* Patient header */}
              <div>
                <Link
                  href={`/patients/${detail.patient.id}`}
                  className="text-xl font-bold text-gray-800 dark:text-gray-100 hover:underline"
                >
                  {detail.patient.fullName}
                </Link>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_PILL[detail.status]}`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                  <AppointmentGlyphCluster flags={detail.flags} cap={Infinity} />
                </div>
              </div>

              {/* Appointment facts */}
              <div className="space-y-1 text-sm">
                <p className="text-gray-800 dark:text-gray-100 font-medium capitalize">{detail.type.replace(/_/g, ' ')}</p>
                <p className="text-gray-700 dark:text-gray-200">{fmtFull(detail.startTime)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {detail.durationMinutes ? `${detail.durationMinutes} min` : 'duration unspecified'}
                  {detail.providerName && ` · with ${detail.providerName}`}
                  {detail.locationName && ` · at ${detail.locationName}`}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {detail.status === 'scheduled' && (
                  <button onClick={onConfirm} disabled={pending} className="btn-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                    Mark confirmed
                  </button>
                )}
                <button onClick={onSendReminder} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50">
                  Send reminder email
                </button>
                {detail.status !== 'completed' && detail.status !== 'cancelled' && (
                  <button onClick={() => setReschedOpen(true)} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50">
                    Reschedule
                  </button>
                )}
                {detail.status === 'scheduled' || detail.status === 'confirmed' ? (
                  <>
                    {detail.startTime < new Date() && (
                      <>
                        <button onClick={onComplete} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50">
                          Mark completed
                        </button>
                        <button onClick={onNoShow} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-red-600 disabled:opacity-50">
                          No-show
                        </button>
                      </>
                    )}
                    <button onClick={onCancel} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-red-600 disabled:opacity-50">
                      Cancel appointment
                    </button>
                  </>
                ) : null}
              </div>

              {detail.notes && (
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}

              {/* Reminder activity */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Reminder activity</p>
                {detail.reminders.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    No reminders sent yet for this appointment.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.reminders.map((r) => (
                      <li key={r.id} className="text-xs text-gray-700 dark:text-gray-300">
                        <span className="font-medium uppercase tracking-wider text-[10px] text-gray-500 dark:text-gray-400">
                          {r.channel}
                        </span>{' '}
                        sent {fmtRelative(r.sentAt)}
                        {r.sentByName && <> by {r.sentByName}</>}
                        {r.repliedAt && (
                          <span className="text-emerald-700 dark:text-emerald-300"> · patient replied {fmtRelative(r.repliedAt)}</span>
                        )}
                        {r.replyBody && <p className="ml-4 mt-0.5 text-[11px] italic">&ldquo;{r.replyBody}&rdquo;</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Intake attached */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Intake</p>
                {detail.intakeAttached ? (
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    {detail.intakeAttached.formTitle} · submitted {fmtRelative(detail.intakeAttached.submittedAt)}
                    {' · '}
                    <Link href="/intake-forms" className="text-violet-600 dark:text-violet-400 hover:underline">View</Link>
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    No intake on file for this patient yet.{' '}
                    <Link href="/intake-forms" className="underline">Send the form</Link>.
                  </p>
                )}
              </div>

              {/* Patient context mini-card */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-2">Patient context</p>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Last visit" value={fmtRelative(detail.patient.lastVisitAt)} />
                  <Stat label="Balance" value={money(detail.patient.outstandingBalanceCents)} tone={detail.patient.outstandingBalanceCents > 0 ? 'warn' : 'ok'} />
                  <Stat label="Lifetime spend" value={money(detail.patient.lifetimeValueCents)} />
                  <Stat label="Total bookings" value={String(detail.patient.totalBookings)} />
                </div>
              </div>

              {/* Source / created */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-1">Booking source</p>
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

        {toast && (
          <div className="absolute bottom-4 right-4 bg-emerald-700 text-white text-xs px-3 py-2 rounded shadow">
            {toast}
          </div>
        )}
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
      ? 'text-red-700 dark:text-red-300'
      : tone === 'ok'
        ? 'text-emerald-700 dark:text-emerald-300'
        : 'text-gray-800 dark:text-gray-100'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</p>
      <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
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
    <div className="absolute inset-0 bg-white dark:bg-gray-800 flex flex-col">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Reschedule</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">← Back</button>
      </div>
      <div className="px-5 py-5 space-y-3 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Moves <strong>{detail.patient.fullName}</strong> from{' '}
          <strong>{fmtFull(detail.startTime)}</strong> to a new slot. The original row stays in the audit trail as cancelled.
        </p>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">New date</span>
          <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="form-input w-full mt-1 text-sm" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">New time</span>
          <input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} className="form-input w-full mt-1 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="form-checkbox" />
          Notify patient via email
        </label>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700/60 flex justify-end gap-2">
        <button onClick={onClose} disabled={pending} className="btn-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200">
          Cancel
        </button>
        <button onClick={submit} disabled={pending} className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 disabled:opacity-50">
          {pending ? 'Rescheduling…' : 'Confirm reschedule'}
        </button>
      </div>
    </div>
  )
}
