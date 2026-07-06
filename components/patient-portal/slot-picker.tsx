'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { BookingSlot, SlotsClosedReason, SlotsForDay } from '@/lib/services/booking'
import { clinicDayKey } from '@/lib/format-datetime'
import { dayOfWeekForDateKey } from '@/lib/clinic-timezone'
import { PORTAL_INK as INK, PORTAL_MUTED as MUTED, PORTAL_BORDER as BORDER } from '@/components/patient-portal/ui'

/**
 * 14-day date strip + slot grid for the portal's book and reschedule flows.
 * Slots load through the server action passed in as `loadSlots` (the portal
 * action re-checks auth + scoping server-side). Mirrors the public widget's
 * picker but tuned for the signed-in, single-column portal context.
 *
 * The strip works on 'YYYY-MM-DD' CALENDAR-DATE keys in the CLINIC's timezone
 * (the shape `loadSlots` consumes) — never on browser-local Dates, since a
 * traveling patient's midnight is not the clinic's midnight.
 */


const DAY_WINDOW = 14
const DAY_NAME_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAME_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function keyParts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { y, m, d }
}

function addDaysToKey(key: string, days: number): string {
  const { y, m, d } = keyParts(key)
  // Date.UTC normalizes overflow, so this crosses month/year boundaries.
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function emptySlotsCopy(slots: BookingSlot[], closedReason: SlotsClosedReason | null): string {
  if (closedReason === 'day_closed') return 'We’re closed this day — try another one.'
  if (closedReason === 'past_closing') return 'We’re done seeing patients today — try tomorrow.'
  if (closedReason === 'invalid_hours') return 'Online booking isn’t set up for this day — give us a call.'
  if (slots.length === 0) return 'We’re closed this day — try another one.'
  return 'Every time is taken this day — try another one.'
}

export default function SlotPicker({
  loadSlots,
  brand,
  timeZone,
  selectedIso,
  onSelect,
  /** Hide slots sooner than this many hours from now (booking minNotice). */
  minNoticeHours = 0,
}: {
  loadSlots: (dateKey: string) => Promise<SlotsForDay>
  brand: string
  /** The clinic's IANA timezone — anchors the day strip to the CLINIC's calendar. */
  timeZone: string
  selectedIso: string | null
  onSelect: (iso: string | null) => void
  minNoticeHours?: number
}) {
  const days = useMemo(() => {
    // Anchor the strip to the CLINIC's today, not the browser's.
    const todayKey = clinicDayKey(new Date(), timeZone)
    return Array.from({ length: DAY_WINDOW }, (_, i) => addDaysToKey(todayKey, i))
  }, [timeZone])

  const [selectedDate, setSelectedDate] = useState<string>(days[0])
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [closedReason, setClosedReason] = useState<SlotsClosedReason | null>(null)
  const [pending, startTransition] = useTransition()
  const requestSeq = useRef(0)

  const cutoffMs = Date.now() + minNoticeHours * 3_600_000

  const fetchSlots = useCallback(
    (dateKey: string) => {
      const seq = ++requestSeq.current
      startTransition(async () => {
        try {
          const res = await loadSlots(dateKey)
          if (seq !== requestSeq.current) return
          setSlots(res.slots)
          setClosedReason(res.closedReason)
        } catch {
          if (seq !== requestSeq.current) return
          setSlots([])
          setClosedReason('invalid_hours')
        }
      })
    },
    [loadSlots],
  )

  useEffect(() => {
    fetchSlots(selectedDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickDay = (d: string) => {
    setSelectedDate(d)
    onSelect(null)
    fetchSlots(d)
  }

  const stripRef = useRef<HTMLDivElement | null>(null)
  const scrollStrip = (dir: 1 | -1) => {
    stripRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' })
  }

  const visibleSlots = slots.filter((s) => new Date(s.startIso).getTime() >= cutoffMs)

  return (
    <div>
      <div className="relative">
        <div ref={stripRef} className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => {
            const active = d === selectedDate
            const today = d === clinicDayKey(new Date(), timeZone)
            return (
              <button
                key={d}
                type="button"
                onClick={() => pickDay(d)}
                className="flex min-w-[4.4rem] flex-col items-center rounded-2xl px-3 py-2.5"
                style={
                  active
                    ? { backgroundColor: brand, color: '#FFFFFF' }
                    : { backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, color: INK }
                }
              >
                <span className="text-[0.68rem] font-semibold uppercase tracking-wide" style={{ opacity: active ? 0.9 : 0.55 }}>
                  {today ? 'Today' : DAY_NAME_SHORT[dayOfWeekForDateKey(d)]}
                </span>
                <span className="text-[1.05rem] font-bold leading-tight">{keyParts(d).d}</span>
                <span className="text-[0.68rem]" style={{ opacity: active ? 0.9 : 0.55 }}>
                  {MONTH_NAME_SHORT[keyParts(d).m - 1]}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            type="button"
            aria-label="Earlier days"
            onClick={() => scrollStrip(-1)}
            className="rounded-full bg-white px-2.5 py-1 text-sm"
            style={{ border: `1px solid ${BORDER}`, color: MUTED }}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Later days"
            onClick={() => scrollStrip(1)}
            className="rounded-full bg-white px-2.5 py-1 text-sm"
            style={{ border: `1px solid ${BORDER}`, color: MUTED }}
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-3 min-h-[5rem]">
        {pending ? (
          <p className="py-6 text-center text-[0.88rem]" style={{ color: MUTED }}>
            Checking openings…
          </p>
        ) : visibleSlots.filter((s) => s.available).length === 0 ? (
          <p className="py-6 text-center text-[0.88rem]" style={{ color: MUTED }}>
            {emptySlotsCopy(visibleSlots, closedReason)}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visibleSlots.map((slot) => {
              const active = selectedIso === slot.startIso
              if (!slot.available) {
                return (
                  <span
                    key={slot.startIso}
                    className="rounded-xl px-2 py-2.5 text-center text-[0.85rem] line-through"
                    style={{ color: '#B9B0A5', backgroundColor: '#F3EEE7' }}
                  >
                    {slot.label}
                  </span>
                )
              }
              return (
                <button
                  key={slot.startIso}
                  type="button"
                  onClick={() => onSelect(active ? null : slot.startIso)}
                  className="rounded-xl px-2 py-2.5 text-center text-[0.85rem] font-semibold transition-colors"
                  style={
                    active
                      ? { backgroundColor: brand, color: '#FFFFFF' }
                      : { backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, color: INK }
                  }
                >
                  {slot.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
