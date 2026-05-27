'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { listBookingSlots, submitBookingRequest } from '../actions'
import type { BookingSlot, SlotsClosedReason } from '@/lib/services/booking'

const APPT_TYPES = [
  { value: 'checkup', label: 'Checkup / Exam' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'filling', label: 'Filling' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'root_canal', label: 'Root Canal' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'other', label: 'Other' },
]

const BG = '#FAF7F2'
const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const SURFACE = '#FFFFFF'
const BORDER = '#E8E2D9'

const DAY_WINDOW = 14 // show two weeks of days
const DAY_NAME_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  orgId: string
  brand: string
  clinicName: string
}

function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

function isoDate(d: Date): string {
  return startOfDay(d).toISOString()
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function fmtDayLabel(d: Date): string {
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, tomorrow)) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

/**
 * Pick the right empty-slot-grid copy. Honest about WHY there's nothing
 * to pick: genuinely-closed days say so; days where the clinic was open
 * but we missed the cutoff say so; "every slot booked" stands on its own.
 *
 * Exported for unit testing — the BookForm is the only render-side caller.
 */
export function emptySlotsCopy(slots: BookingSlot[], closedReason: SlotsClosedReason | null): string {
  if (closedReason === 'day_closed') return "We're closed this day. Try another day."
  if (closedReason === 'past_closing') {
    return "We're done seeing patients for today. Try tomorrow or later this week."
  }
  if (closedReason === 'invalid_hours') return "Online booking isn't available for this day — give us a call."
  if (slots.length === 0) return "We're closed this day. Try another day."
  return 'Every slot is taken for this day. Try another day.'
}

export default function BookForm({ orgId, brand, clinicName }: Props) {
  const days = useMemo(() => {
    const today = startOfDay(new Date())
    return Array.from({ length: DAY_WINDOW }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [])

  const [selectedDate, setSelectedDate] = useState<Date>(days[0])
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null)
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [closedReason, setClosedReason] = useState<SlotsClosedReason | null>(null)
  const [slotsPending, startSlotsTransition] = useTransition()
  const [submitState, setSubmitState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    startSlotsTransition(() => {
      listBookingSlots(orgId, isoDate(selectedDate))
        .then(({ slots: next, closedReason: reason }) => {
          setSlots(next)
          setClosedReason(reason)
          // Clear the selected slot if the date changed and it's no longer in the new grid.
          setSelectedSlotIso((cur) =>
            cur && next.some((s) => s.startIso === cur && s.available) ? cur : null,
          )
        })
        .catch(() => {
          setSlots([])
          setClosedReason(null)
        })
    })
  }, [orgId, selectedDate])

  if (submitState === 'success') {
    return (
      <div className="text-center py-16">
        <div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
          style={{ backgroundColor: brand + '22' }}
        >
          <svg className="w-10 h-10" style={{ color: brand }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold tracking-[-0.02em] mb-3" style={{ color: INK }}>
          You&rsquo;re booked.
        </h2>
        <p className="max-w-sm mx-auto leading-relaxed" style={{ color: INK_MUTED }}>
          We&rsquo;ll send a confirmation to your email and call to verify within 24 hours.
        </p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedSlotIso) {
      setErrorMsg('Pick a time before submitting.')
      setSubmitState('error')
      return
    }
    setSubmitState('pending')
    setErrorMsg('')
    const fd = new FormData(e.currentTarget)
    fd.set('orgId', orgId)
    fd.set('startTime', selectedSlotIso)
    // Source-attribution snapshot (mirrors the contact form) so the SEO
    // module can attribute organic-search traffic to booked appointments.
    if (typeof window !== 'undefined') {
      fd.set('sourcePage', window.location.pathname)
      fd.set('referrer', document.referrer || '')
      const params = new URLSearchParams(window.location.search)
      fd.set('utm_source', params.get('utm_source') || '')
      fd.set('utm_medium', params.get('utm_medium') || '')
      fd.set('utm_campaign', params.get('utm_campaign') || '')
    }
    try {
      await submitBookingRequest(fd)
      setSubmitState('success')
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Something went wrong. Please call us to book.',
      )
      setSubmitState('error')
    }
  }

  const hasAnySlot = slots.some((s) => s.available)

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* ── 1. Pick a date ─────────────────────────────────────────────── */}
      <section>
        <p
          className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
          style={{ color: brand }}
        >
          01 · Pick a date
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {days.map((d) => {
            const isSelected = sameDay(d, selectedDate)
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => setSelectedDate(d)}
                className="shrink-0 snap-start rounded-2xl px-4 py-3 text-center transition border min-w-[72px]"
                style={{
                  borderColor: isSelected ? brand : BORDER,
                  backgroundColor: isSelected ? brand : SURFACE,
                  color: isSelected ? 'white' : INK,
                }}
                aria-pressed={isSelected}
              >
                <div
                  className="text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: isSelected ? 'rgba(255,255,255,0.85)' : INK_MUTED }}
                >
                  {DAY_NAME_SHORT[d.getDay()]}
                </div>
                <div className="text-xl font-bold leading-none mt-1">{d.getDate()}</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* ── 2. Pick a time ─────────────────────────────────────────────── */}
      <section>
        <p
          className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
          style={{ color: brand }}
        >
          02 · Pick a time · {fmtDayLabel(selectedDate)}
        </p>
        {slotsPending ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-11 rounded-xl animate-pulse"
                style={{ backgroundColor: BORDER }}
              />
            ))}
          </div>
        ) : !hasAnySlot ? (
          <p
            className="text-sm leading-relaxed rounded-xl px-4 py-6 text-center"
            style={{ backgroundColor: SURFACE, border: `1px dashed ${BORDER}`, color: INK_MUTED }}
          >
            {emptySlotsCopy(slots, closedReason)}
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {slots.map((s) => {
              const isSelected = s.startIso === selectedSlotIso
              return (
                <button
                  key={s.startIso}
                  type="button"
                  disabled={!s.available}
                  onClick={() => setSelectedSlotIso(s.startIso)}
                  className="h-11 rounded-xl text-sm font-semibold transition disabled:cursor-not-allowed disabled:line-through"
                  style={{
                    backgroundColor: isSelected
                      ? brand
                      : s.available
                        ? SURFACE
                        : BG,
                    color: isSelected
                      ? 'white'
                      : s.available
                        ? INK
                        : INK_MUTED,
                    border: `1px solid ${isSelected ? brand : BORDER}`,
                    opacity: s.available ? 1 : 0.45,
                  }}
                  aria-pressed={isSelected}
                  aria-label={
                    s.available
                      ? `${s.label} — available`
                      : `${s.label} — taken`
                  }
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 3. Contact info ────────────────────────────────────────────── */}
      <section>
        <p
          className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
          style={{ color: brand }}
        >
          03 · Your info
        </p>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              name="firstName"
              type="text"
              required
              placeholder="First name"
              autoComplete="given-name"
              className="px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
              style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
            />
            <input
              name="lastName"
              type="text"
              required
              placeholder="Last name"
              autoComplete="family-name"
              className="px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
              style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
            />
          </div>
          <input
            name="phone"
            type="tel"
            required
            placeholder="Phone number"
            autoComplete="tel"
            inputMode="tel"
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          />
          <input
            name="email"
            type="email"
            placeholder="Email (optional, for confirmation)"
            autoComplete="email"
            inputMode="email"
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          />
          <select
            name="type"
            defaultValue="checkup"
            className="w-full px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2 appearance-none"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          >
            {APPT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <textarea
            name="notes"
            rows={3}
            placeholder="Anything we should know before your visit? (optional)"
            className="w-full px-4 py-3 rounded-xl text-[15px] resize-none focus:outline-none focus:ring-2"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          />
        </div>
      </section>

      {submitState === 'error' && errorMsg && (
        <p className="text-sm text-red-600">{errorMsg}</p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={submitState === 'pending' || !selectedSlotIso}
          className="w-full py-4 rounded-full text-base font-semibold text-white shadow-lg transition hover:opacity-95 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: brand }}
        >
          {submitState === 'pending'
            ? 'Booking…'
            : selectedSlotIso
              ? `Book ${fmtDayLabel(selectedDate)} · ${slots.find((s) => s.startIso === selectedSlotIso)?.label ?? ''}`
              : 'Pick a time to continue'}
        </button>
        <p className="text-xs text-center mt-3" style={{ color: INK_MUTED }}>
          We&rsquo;ll send a confirmation and call to verify within 24 hours. No payment required to
          book.
        </p>
      </div>
    </form>
  )
}
