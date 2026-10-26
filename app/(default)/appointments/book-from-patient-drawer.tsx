'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { useFocusTrap } from '@/components/ui/use-focus-trap'
import { MANUAL_TIME, SlotGrid, isDateKey, localDateKey } from '@/components/appointments/slot-grid'
import { ACTION_FAILED_MESSAGE, STALE_APP_MESSAGE, isDeploymentSkewError } from '@/lib/deployment-skew'
import type { BookingSlot } from '@/lib/services/booking'
import {
  createInternalAppointmentAction,
  getBookingConfigAction,
  getBookingSlotsAction,
  type BookingConfig,
} from './actions'

/**
 * In-place drawer rendered on the patient detail page (and the appointments
 * "Rebook" flow) when booking is initiated. Reuses the same date+time form
 * pattern as the reschedule drawer, upgraded to a real clinic-ops booking:
 *
 *  - provider select (from the clinic's roster; optional "No provider")
 *  - visit-type select (from the clinic's catalog; shows the type duration)
 *  - duration auto-fills from the type, with a manual override
 *  - the raw time input is replaced with available-slot options for the chosen
 *    date (chair-aware), with a "Custom time" escape hatch
 *  - a "Walk-in (already here)" checkbox that allows now/past-today times and
 *    skips the slot guard
 *
 * Per the research doc: staying on the patient page keeps the staff member in
 * their relationship-conversation context instead of bouncing them to
 * /appointments.
 */
export default function BookFromPatientDrawer({
  patientId,
  patientName,
  defaultType,
  defaultDate,
  onClose,
}: {
  patientId: string
  patientName: string
  /** Pre-select a visit type (e.g. the "Rebook" flow carries the prior type). */
  defaultType?: string | null
  /** The day to open on, `YYYY-MM-DD` — a caller that knows the right one
   *  seeds it (the next recall after a completed visit, an inquiry's preferred
   *  date). Anything else, and the drawer opens on tomorrow as it always has. */
  defaultDate?: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, dialogRef, { onEscape: onClose })
  const [dateStr, setDateStr] = useState(() => {
    if (isDateKey(defaultDate)) return defaultDate
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return localDateKey(d)
  })
  const [config, setConfig] = useState<BookingConfig | null>(null)
  const [type, setType] = useState<string>(defaultType || 'cleaning')
  const [providerId, setProviderId] = useState<string>('')
  const [duration, setDuration] = useState<number>(30)
  // Track whether the user has hand-edited duration so a type change doesn't
  // clobber a manual override.
  const [durationTouched, setDurationTouched] = useState(false)
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [slotsPending, startSlots] = useTransition()
  const [selectedTime, setSelectedTime] = useState<string>('') // ISO of chosen slot, or MANUAL_TIME
  // Default the manual time to NOW rounded up to the next quarter hour —
  // "walk-in" means the patient is standing at the desk, not at 9 AM.
  const [manualTime, setManualTime] = useState(() => {
    const d = new Date()
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [walkIn, setWalkIn] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Load the clinic's providers + visit types once.
  useEffect(() => {
    let alive = true
    getBookingConfigAction()
      .then((c) => {
        if (!alive) return
        setConfig(c)
        // Reconcile the initial type against the catalog; pick the duration.
        const initial = c.visitTypes.find((t) => t.id === (defaultType || 'cleaning')) ?? c.visitTypes[0]
        if (initial) {
          setType(initial.id)
          if (!durationTouched) setDuration(initial.durationMinutes)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedTypeDuration = useMemo(() => {
    const t = config?.visitTypes.find((vt) => vt.id === type)
    return t?.durationMinutes ?? 30
  }, [config, type])

  // Load slots when date / duration changes — and not for walk-ins (the slot
  // grid is irrelevant when the patient is physically present).
  const loadSlots = useCallback(() => {
    if (walkIn) {
      setSlots([])
      return
    }
    startSlots(() => {
      getBookingSlotsAction(dateStr, duration)
        .then((next) => {
          setSlots(next)
          // Drop the chosen slot if it's no longer in the grid.
          setSelectedTime((cur) =>
            cur === MANUAL_TIME || next.some((s) => s.startIso === cur && s.available) ? cur : '',
          )
        })
        .catch(() => setSlots([]))
    })
  }, [dateStr, duration, walkIn])

  useEffect(() => {
    loadSlots()
  }, [loadSlots])

  function onTypeChange(id: string) {
    setType(id)
    const t = config?.visitTypes.find((vt) => vt.id === id)
    if (t && !durationTouched) setDuration(t.durationMinutes)
  }

  function submit() {
    setError(null)
    let startIso: string
    if (walkIn || selectedTime === MANUAL_TIME) {
      // Manual / walk-in: build the instant from date + manual time, local zone.
      const iso = `${dateStr}T${manualTime}:00`
      const local = new Date(iso)
      if (Number.isNaN(local.getTime())) {
        setError('Pick a valid date + time')
        return
      }
      startIso = local.toISOString()
    } else if (selectedTime) {
      startIso = selectedTime
    } else {
      setError('Pick a time, or check "Walk-in" / "Custom time".')
      return
    }
    startTransition(async () => {
      // Never bare-await a server action in a client component: a redeploy
      // under this tab makes Next THROW, and the drawer would sit on
      // "Booking…" forever. Classify the redeploy case; offer a refresh.
      try {
        const r = await createInternalAppointmentAction({
          patientId,
          startTime: startIso,
          type,
          providerId: providerId || null,
          durationMinutes: duration,
          notes: notes.trim() || null,
          allowPast: walkIn,
        })
        if ('ok' in r && r.ok === true) {
          router.refresh()
          onClose()
        } else if ('error' in r) {
          setError(r.error)
        }
      } catch (err) {
        setError(isDeploymentSkewError(err) ? STALE_APP_MESSAGE : ACTION_FAILED_MESSAGE)
      }
    })
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Book appointment" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[color:var(--color-ink-900)]/30 backdrop-blur-[2px] px-2 sm:px-4">
      <div className="section-enter bg-[color:var(--color-surface-2)] rounded-t-[var(--r-lg)] sm:rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md flex flex-col max-h-[92vh]">
        <div className="px-6 py-5 border-b border-[color:var(--color-hairline)]">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Book appointment</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">For <strong>{patientName}</strong></p>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto">
          {/* Visit type */}
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Type</span>
            <select value={type} onChange={(e) => onTypeChange(e.target.value)} className="form-select w-full mt-1 text-sm">
              {(config?.visitTypes ?? [{ id: type, label: type, durationMinutes: 30 }]).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.durationMinutes}m
                </option>
              ))}
            </select>
          </label>

          {/* Provider + duration */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Provider</span>
              <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="form-select w-full mt-1 text-sm">
                <option value="">No provider</option>
                {(config?.providers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Duration (min)</span>
              <input
                type="number"
                min={15}
                max={480}
                step={15}
                value={duration}
                onChange={(e) => { setDuration(Math.max(15, Number(e.target.value) || 30)); setDurationTouched(true) }}
                className="form-input w-full mt-1 text-sm"
              />
              {durationTouched && duration !== selectedTypeDuration && (
                <button
                  type="button"
                  onClick={() => { setDuration(selectedTypeDuration); setDurationTouched(false) }}
                  className="text-xs text-teal-700 dark:text-teal-400 hover:underline mt-0.5"
                >
                  Reset to {selectedTypeDuration}m
                </button>
              )}
            </label>
          </div>

          {/* Date */}
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Date</span>
            <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} className="form-input w-full mt-1 text-sm" />
          </label>

          {/* Walk-in */}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={walkIn} onChange={(e) => setWalkIn(e.target.checked)} className="form-checkbox" />
            Walk-in (already here)
          </label>

          {/* Time — slot grid OR manual */}
          {walkIn ? (
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Time</span>
              <input type="time" value={manualTime} onChange={(e) => setManualTime(e.target.value)} className="form-input w-full mt-1 text-sm" />
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">Walk-ins can use right now or an earlier time today — we won't check for an open slot.</span>
            </label>
          ) : (
            <div>
              <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Time</span>
              <SlotGrid
                slots={slots}
                pending={slotsPending}
                selected={selectedTime}
                onSelect={setSelectedTime}
                manualTime={manualTime}
                onManualTimeChange={setManualTime}
              />
            </div>
          )}

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the front desk should know…" className="form-textarea w-full mt-1 text-sm min-h-[70px]" />
          </label>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-[color:var(--color-hairline)] flex justify-end gap-2">
          <ActionButton variant="secondary" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" size="sm" onClick={submit} pending={pending}>
            Book appointment
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
