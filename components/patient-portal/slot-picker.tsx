'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type { BookingSlot, SlotsClosedReason, SlotsForDay } from '@/lib/services/booking'

/**
 * 14-day date strip + slot grid for the portal's book and reschedule flows.
 * Slots load through the server action passed in as `loadSlots` (the portal
 * action re-checks auth + scoping server-side). Mirrors the public widget's
 * picker but tuned for the signed-in, single-column portal context.
 */

const BORDER = '#E8E2D9'
const INK = '#1C1A17'
const MUTED = '#6B635A'

const DAY_WINDOW = 14

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

/** The patient's selected CALENDAR day — the server interprets it in the clinic's zone. */
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
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
  selectedIso,
  onSelect,
  /** Hide slots sooner than this many hours from now (booking minNotice). */
  minNoticeHours = 0,
}: {
  loadSlots: (dateKey: string) => Promise<SlotsForDay>
  brand: string
  selectedIso: string | null
  onSelect: (iso: string | null) => void
  minNoticeHours?: number
}) {
  const days = useMemo(() => {
    const today = startOfDay(new Date())
    return Array.from({ length: DAY_WINDOW }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [])

  const [selectedDate, setSelectedDate] = useState<Date>(days[0])
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [closedReason, setClosedReason] = useState<SlotsClosedReason | null>(null)
  const [pending, startTransition] = useTransition()
  const requestSeq = useRef(0)

  const cutoffMs = Date.now() + minNoticeHours * 3_600_000

  const fetchSlots = useCallback(
    (date: Date) => {
      const seq = ++requestSeq.current
      startTransition(async () => {
        try {
          const res = await loadSlots(isoDate(date))
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

  const pickDay = (d: Date) => {
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
            const active = sameDay(d, selectedDate)
            const today = sameDay(d, new Date())
            return (
              <button
                key={d.toISOString()}
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
                  {today ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className="text-[1.05rem] font-bold leading-tight">{d.getDate()}</span>
                <span className="text-[0.68rem]" style={{ opacity: active ? 0.9 : 0.55 }}>
                  {d.toLocaleDateString('en-US', { month: 'short' })}
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
