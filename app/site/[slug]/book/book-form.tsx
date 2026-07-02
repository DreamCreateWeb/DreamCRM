'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { listBookingSlots, submitBookingRequest, type BookingConfirmation } from '../actions'
import type { BookingSlot, SlotsClosedReason } from '@/lib/services/booking'
import { OTHER_VISIT_TYPE_ID } from '@/lib/types/visit-types'
import { buildIcs, icsDataUrl } from '@/lib/ics'
import { readableInk } from '@/lib/clinic-site-theme'
import { clinicDayKey } from '@/lib/format-datetime'
import { clinicDayStart, dayOfWeekForDateKey } from '@/lib/clinic-timezone'
import FormTrustFields from '@/components/clinic-site/form-trust-fields'

/** Public-bookable visit type, shaped for the form (server passes the
 *  resolved, bookablePublic-filtered catalog with each type's duration —
 *  and its deposit, zeroed when the clinic can't take payments). */
export interface PublicVisitTypeOption {
  id: string
  label: string
  durationMinutes: number
  depositCents?: number
}

/** Final option in every visit-type dropdown so patients who don't see
 *  their reason in the clinic's catalog can still book. Visit-type id
 *  `other` is the discriminated value the server action expects. */
const OTHER_OPTION = { value: OTHER_VISIT_TYPE_ID, label: 'Other / not sure', durationMinutes: 30, depositCents: 0 }

/** Build the visit-type dropdown options from a clinic's public-bookable visit
 *  types. Always guarantees an "Other / not sure" fallback so a patient can
 *  book even when their reason isn't in the list (or the clinic configured
 *  nothing public).
 *
 *  Exported for unit testing. */
export function buildVisitTypeOptions(
  visitTypes: Array<{ id: string; label: string; durationMinutes?: number; depositCents?: number }>,
): Array<{ value: string; label: string; durationMinutes: number; depositCents: number }> {
  const opts = visitTypes.map((t) => ({
    value: t.id,
    label: t.label,
    durationMinutes: t.durationMinutes ?? 30,
    depositCents: t.depositCents ?? 0,
  }))
  // De-dupe if the catalog already carries an `id: 'other'` row.
  if (opts.some((o) => o.value === OTHER_OPTION.value)) return opts
  return [...opts, OTHER_OPTION]
}

/** "$25" (whole dollars) / "$25.50" — deposit chips + footnotes. */
export function fmtDeposit(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}

const BG = 'var(--c-bg, #FAF7F2)'
const INK = 'var(--c-ink, #1C1A17)'
const INK_MUTED = 'var(--c-ink-muted, #6B635A)'
const SURFACE = 'var(--c-surface, #FFFFFF)'
const BORDER = 'var(--c-border, #E8E2D9)'

const DAY_WINDOW = 14 // show two weeks of days
const DAY_NAME_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  /** Used only for the read-only slot-availability lookup. */
  orgId: string
  /** The clinic's IANA timezone — the day strip + Today/Tomorrow labels follow
   *  the CLINIC's calendar, not the visitor's browser date (a patient browsing
   *  from another timezone around midnight would otherwise see a day strip
   *  shifted off the clinic's bookable days). */
  timeZone: string
  /** Public slug — the booking write resolves the org from it server-side
   *  (never the client-posted orgId). */
  slug: string
  brand: string
  clinicName: string
  /** Clinic phone for the closed-window "call us" fallback + success-screen
   *  tel: links. Null when the clinic hasn't set one. */
  clinicPhone?: string | null
  /** Whether ANY day in the bookable window has an opening (computed
   *  server-side). When false, the form leads with a prominent "call us" card
   *  instead of an empty slot grid. */
  windowHasAvailability?: boolean
  /** Public-bookable visit types (resolved from the clinic's visit-type
   *  catalog, filtered to bookablePublic). The form always appends an
   *  "Other / not sure" fallback so patients can book even when their reason
   *  isn't in the list. Each carries its duration so the slot grid checks the
   *  whole visit window against the clinic's chairs. */
  visitTypes: PublicVisitTypeOption[]
}

// The day strip works on 'YYYY-MM-DD' CALENDAR-DATE keys in the clinic's
// timezone (the same shape the slot lookup consumes), never on browser-local
// Dates — a visitor's midnight is not the clinic's midnight.

function keyParts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number)
  return { y, m, d }
}

function addDaysToKey(key: string, days: number): string {
  const { y, m, d } = keyParts(key)
  // Date.UTC normalizes overflow, so this crosses month/year boundaries.
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** "Monday, January 15" for a calendar-date key (timezone-independent — a
 *  calendar date has one weekday). */
function fmtKeyDate(key: string): string {
  const { y, m, d } = keyParts(key)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function fmtDayLabel(key: string, timeZone: string): string {
  const now = new Date()
  if (key === clinicDayKey(now, timeZone)) return 'Today'
  if (key === clinicDayKey(clinicDayStart(now, timeZone, 1), timeZone)) return 'Tomorrow'
  return fmtKeyDate(key)
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

/**
 * Format a confirmation's start instant into a "Monday, January 15 · 2:00 PM"
 * label in the CLINIC's timezone (so the screen matches the confirmation
 * email). Exported for unit testing.
 */
export function formatConfirmationWhen(startIso: string, timeZone: string): string {
  const d = new Date(startIso)
  if (isNaN(d.getTime())) return ''
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
  return `${date} · ${time}`
}

/**
 * Rich post-booking success screen. Confirms the date/time/type + clinic
 * address with a maps link, offers "Add to calendar" (an inline .ics data URL
 * — no server round-trip, no unauthenticated appointment lookup), a "what to
 * expect" line, and — when the clinic has a default intake form — a prominent
 * "Fill out your intake form now" button. Phone-only bookers (no email) get
 * the SAME screen plus a "We'll call to confirm" note, since this on-screen
 * artifact is their only record.
 *
 * Exported so it can be unit-tested in isolation from the form's slot/transition
 * machinery.
 */
export function BookingSuccess({ confirmation, brand }: { confirmation: BookingConfirmation; brand: string }) {
  const c = confirmation
  // Contrast-safe text fill (links) on the warm ground.
  const brandInk = readableInk(brand)
  const whenLabel = formatConfirmationWhen(c.startTimeIso, c.timeZone)

  const calendarHref = useMemo(() => {
    const start = new Date(c.startTimeIso)
    const end = new Date(c.endTimeIso)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
    const description = [
      `${c.visitTypeLabel} at ${c.clinicName}.`,
      c.clinicPhone ? `Questions? Call ${c.clinicPhone}.` : '',
    ]
      .filter(Boolean)
      .join(' ')
    return icsDataUrl(
      buildIcs({
        uid: `booking-${start.getTime()}@dreamcreatestudio.com`,
        start,
        end,
        summary: `${c.visitTypeLabel} at ${c.clinicName}`,
        location: c.addressText,
        description,
      }),
    )
  }, [c])

  return (
    <div className="text-center py-12 sm:py-14">
      <div
        className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
        style={{ backgroundColor: brand + '22' }}
      >
        <svg className="w-10 h-10" style={{ color: brand }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold tracking-[-0.02em] mb-2" style={{ color: INK }}>
        You&rsquo;re booked.
      </h2>
      <p className="leading-relaxed mb-7" style={{ color: INK_MUTED }}>
        {c.emailSent
          ? 'We sent a confirmation to your email. See you soon!'
          : 'We don’t have your email, so we’ll call to confirm. Here are your visit details — feel free to save them.'}
      </p>

      {/* Visit details card. */}
      <div
        className="text-left rounded-2xl p-5 sm:p-6 mb-5 max-w-md mx-auto"
        style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}
      >
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="font-medium shrink-0" style={{ color: INK_MUTED }}>
              When
            </dt>
            <dd className="text-right font-semibold" style={{ color: INK }}>
              {whenLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-medium shrink-0" style={{ color: INK_MUTED }}>
              Visit
            </dt>
            <dd className="text-right font-semibold" style={{ color: INK }}>
              {c.visitTypeLabel}
            </dd>
          </div>
          {c.addressText && (
            <div className="flex justify-between gap-4">
              <dt className="font-medium shrink-0" style={{ color: INK_MUTED }}>
                Where
              </dt>
              <dd className="text-right" style={{ color: INK }}>
                {c.mapsUrl ? (
                  <a
                    href={c.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:underline"
                    style={{ color: brandInk }}
                  >
                    {c.addressText}
                  </a>
                ) : (
                  <span className="font-semibold">{c.addressText}</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* What to expect. */}
      <p className="text-sm leading-relaxed mb-7 max-w-md mx-auto" style={{ color: INK_MUTED }}>
        Please arrive about 10 minutes early, and bring your insurance card and a
        photo ID if you have them.
      </p>

      {/* Actions. Min 44px tap targets. Intake CTA is the prominent (filled)
          action when present — it's the highest-value next step for the clinic. */}
      <div className="flex flex-col gap-3 max-w-md mx-auto">
        {c.intakeFormUrl && (
          <a
            href={c.intakeFormUrl}
            className="w-full min-h-[48px] inline-flex items-center justify-center px-5 rounded-full text-base font-semibold text-white shadow-lg transition hover:opacity-95"
            style={{ backgroundColor: brand }}
          >
            Fill out your intake form now
          </a>
        )}
        {calendarHref && (
          <a
            href={calendarHref}
            download="visit.ics"
            className="w-full min-h-[48px] inline-flex items-center justify-center px-5 rounded-full text-base font-semibold transition hover:opacity-90"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          >
            Add to calendar
          </a>
        )}
        {c.mapsUrl && (
          <a
            href={c.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[48px] inline-flex items-center justify-center px-5 rounded-full text-base font-semibold transition hover:opacity-90"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          >
            Get directions
          </a>
        )}
      </div>

      {c.clinicPhone && (
        <p className="text-sm mt-7" style={{ color: INK_MUTED }}>
          Need to change something? Call us at{' '}
          <a href={`tel:${c.clinicPhone}`} className="font-semibold hover:underline" style={{ color: INK }}>
            {c.clinicPhone}
          </a>
          .
        </p>
      )}
    </div>
  )
}

export default function BookForm({
  orgId,
  timeZone,
  slug,
  brand,
  clinicName,
  clinicPhone = null,
  windowHasAvailability = true,
  visitTypes,
}: Props) {
  // Contrast-safe text fill for brand-colored eyebrows/links on the warm ground
  // (raw brand stays on backgrounds, borders, and SVG icon strokes).
  const brandInk = readableInk(brand)
  const apptTypes = useMemo(() => buildVisitTypeOptions(visitTypes), [visitTypes])
  const defaultApptType = apptTypes[0]?.value ?? OTHER_VISIT_TYPE_ID
  const [selectedType, setSelectedType] = useState<string>(defaultApptType)
  const selectedDuration = useMemo(
    () => apptTypes.find((t) => t.value === selectedType)?.durationMinutes ?? 30,
    [apptTypes, selectedType],
  )
  const selectedDepositCents = useMemo(
    () => apptTypes.find((t) => t.value === selectedType)?.depositCents ?? 0,
    [apptTypes, selectedType],
  )
  const days = useMemo(() => {
    // Anchor the strip to the CLINIC's today, not the browser's.
    const todayKey = clinicDayKey(new Date(), timeZone)
    return Array.from({ length: DAY_WINDOW }, (_, i) => addDaysToKey(todayKey, i))
  }, [timeZone])

  const [selectedDate, setSelectedDate] = useState<string>(days[0])
  const [selectedSlotIso, setSelectedSlotIso] = useState<string | null>(null)
  const [slots, setSlots] = useState<BookingSlot[]>([])
  const [closedReason, setClosedReason] = useState<SlotsClosedReason | null>(null)
  // Distinct from "no slots" — a failed fetch must NOT masquerade as "we're
  // closed this day". When true, we show a retry hint instead of a closed copy.
  const [slotsError, setSlotsError] = useState(false)
  const [slotsPending, startSlotsTransition] = useTransition()
  const [submitState, setSubmitState] = useState<'idle' | 'pending' | 'redirecting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null)

  // Ref + scroll handler for the day strip prev/next arrows. The strip
  // overflows past the visible width on every viewport (14-day window /
  // ~5 days visible at a time), so we surface explicit arrow buttons —
  // less obvious-to-discover than swipe on a touchpad/mouse setup.
  const dayStripRef = useRef<HTMLDivElement | null>(null)
  // Scroll target for the "pick a time" validation error.
  const timeSectionRef = useRef<HTMLElement | null>(null)
  const scrollDays = useCallback((dir: 1 | -1) => {
    const el = dayStripRef.current
    if (!el) return
    // Move by ~70% of the visible track width — about "one page" of days.
    const step = Math.max(180, el.clientWidth * 0.7)
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    startSlotsTransition(() => {
      // Pass the selected visit's duration so a longer appointment only shows
      // start times where the whole window is free across the clinic's chairs.
      listBookingSlots(orgId, selectedDate, selectedDuration)
        .then(({ slots: next, closedReason: reason }) => {
          setSlots(next)
          setClosedReason(reason)
          setSlotsError(false)
          // Clear the selected slot if the date changed and it's no longer in the new grid.
          setSelectedSlotIso((cur) =>
            cur && next.some((s) => s.startIso === cur && s.available) ? cur : null,
          )
        })
        .catch(() => {
          // Network/server hiccup — surface a retry hint, NOT a false "closed".
          setSlots([])
          setClosedReason(null)
          setSlotsError(true)
        })
    })
  }, [orgId, selectedDate, selectedDuration])

  if (submitState === 'success' && confirmation) {
    return <BookingSuccess confirmation={confirmation} brand={brand} />
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedSlotIso) {
      setErrorMsg('Pick a time before submitting.')
      setSubmitState('error')
      // Scroll the first thing the patient must fix (the time picker) into
      // view — on mobile the submit button + error sit far below it.
      timeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitState('pending')
    setErrorMsg('')
    const fd = new FormData(e.currentTarget)
    fd.set('slug', slug)
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
      // Refer-a-friend share-link token (attributes a NEW patient's booking
      // to the friend who sent them).
      fd.set('ref', params.get('ref') || '')
    }
    try {
      const conf = await submitBookingRequest(fd)
      if (conf.depositUrl) {
        // The visit is booked — the deposit completes it. Hand off to Stripe;
        // the return trip lands back on this page with ?deposit_session=….
        setSubmitState('redirecting')
        window.location.assign(conf.depositUrl)
        return
      }
      setConfirmation(conf)
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
      {/* Spam-trust hidden fields — picked up by `new FormData(form)` and
          validated by `looksLikeBot` in submitBookingRequest. */}
      <FormTrustFields />
      {/* ── Closed-window fallback ───────────────────────────────────────
          When the entire bookable window is closed/full, lead with a clear
          "call us" card so phone isn't buried in a side panel below the fold.
          The slot grid stays below (still honest per-day), but this is the
          prominent next step. Only shows when the clinic has a phone. */}
      {!windowHasAvailability && clinicPhone && (
        <section
          className="rounded-2xl p-5 sm:p-6 text-center"
          style={{ backgroundColor: brand + '12', border: `1px solid ${brand}40` }}
        >
          <p className="text-base font-semibold mb-1" style={{ color: INK }}>
            No online openings right now.
          </p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: INK_MUTED }}>
            Our online schedule is full for the next two weeks — but we often have
            more availability than shows here. Give us a call and we&rsquo;ll find
            you a time.
          </p>
          <a
            href={`tel:${clinicPhone}`}
            className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-full text-base font-semibold text-white shadow-lg transition hover:opacity-95"
            style={{ backgroundColor: brand }}
          >
            Call us at {clinicPhone}
          </a>
        </section>
      )}

      {/* ── 1. Pick a date ─────────────────────────────────────────────── */}
      <section>
        <p
          className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
          style={{ color: brandInk }}
        >
          01 · Pick a date
        </p>
        {/* Day strip — breaks out of the parent form card's padding so the
            swipe surface spans the full card width on mobile. The prev/next
            arrows sit absolutely positioned over the strip; they were
            previously missing entirely (only swipe scrolled), which made the
            full 14-day window invisible on a mouse-driven desktop. */}
        <div className="relative -mx-5 sm:-mx-9">
          <button
            type="button"
            onClick={() => scrollDays(-1)}
            aria-label="Previous days"
            className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--c-surface,#FFFFFF)] shadow-sm transition hover:shadow-md"
            style={{ border: `1px solid ${BORDER}`, color: brand }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          <div
            ref={dayStripRef}
            className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth px-12 sm:px-14"
            style={{ scrollbarWidth: 'none' }}
          >
            {days.map((d) => {
              const isSelected = d === selectedDate
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className="shrink-0 snap-start rounded-2xl px-4 py-3 text-center transition border min-w-[68px]"
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
                    {DAY_NAME_SHORT[dayOfWeekForDateKey(d)]}
                  </div>
                  <div className="text-xl font-bold leading-none mt-1">{keyParts(d).d}</div>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollDays(1)}
            aria-label="More days"
            className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[var(--c-surface,#FFFFFF)] shadow-sm transition hover:shadow-md"
            style={{ border: `1px solid ${BORDER}`, color: brand }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </section>

      {/* ── 2. Pick a time ─────────────────────────────────────────────── */}
      <section ref={timeSectionRef} style={{ scrollMarginTop: 'calc(var(--site-header-h, 64px) + 12px)' }}>
        <p
          className="text-xs font-semibold uppercase tracking-[0.16em] mb-3"
          style={{ color: brandInk }}
        >
          02 · Pick a time · {fmtDayLabel(selectedDate, timeZone)}
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
        ) : slotsError ? (
          <p
            className="text-sm leading-relaxed rounded-xl px-4 py-6 text-center"
            style={{ backgroundColor: SURFACE, border: `1px dashed ${BORDER}`, color: INK_MUTED }}
          >
            We couldn&rsquo;t load available times just now. Please refresh the
            page and try again
            {clinicPhone ? <> — or call us at {clinicPhone}</> : null}.
          </p>
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
          style={{ color: brandInk }}
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
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full min-h-[44px] px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2 appearance-none"
            style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
          >
            {apptTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
                {t.depositCents > 0 ? ` — ${fmtDeposit(t.depositCents)} deposit` : ''}
              </option>
            ))}
          </select>
          {selectedDepositCents > 0 && (
            <p className="text-sm leading-relaxed rounded-xl px-4 py-3" style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, color: INK_MUTED }}>
              This visit takes a <strong style={{ color: INK }}>{fmtDeposit(selectedDepositCents)} deposit</strong> to
              hold your spot — it&rsquo;s credited toward your visit, so you&rsquo;re not paying extra.
              You&rsquo;ll pay securely after picking your time.
            </p>
          )}
          {/* Two optional front-desk-context questions (NexHealth-style). Both
              default to "" (no answer) and ride the appointment notes — no
              schema. Mobile-friendly: full-width, ≥44px tap height. */}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="sr-only" htmlFor="book-visited-before">
              Have you visited us before?
            </label>
            <select
              id="book-visited-before"
              name="visitedBefore"
              defaultValue=""
              aria-label="Have you visited us before?"
              className="w-full min-h-[44px] px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2 appearance-none"
              style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
            >
              <option value="">Visited us before? (optional)</option>
              <option value="new">No — first visit</option>
              <option value="returning">Yes — I&rsquo;m a returning patient</option>
            </select>
            <label className="sr-only" htmlFor="book-has-insurance">
              Do you have dental insurance?
            </label>
            <select
              id="book-has-insurance"
              name="hasInsurance"
              defaultValue=""
              aria-label="Do you have dental insurance?"
              className="w-full min-h-[44px] px-4 py-3 rounded-xl text-[15px] focus:outline-none focus:ring-2 appearance-none"
              style={{ backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }}
            >
              <option value="">Dental insurance? (optional)</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unsure">Not sure</option>
            </select>
          </div>
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
          disabled={submitState === 'pending' || submitState === 'redirecting' || !selectedSlotIso}
          className="w-full py-4 rounded-full text-base font-semibold text-white shadow-lg transition hover:opacity-95 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: brand }}
        >
          {submitState === 'redirecting'
            ? 'Taking you to secure payment…'
            : submitState === 'pending'
            ? 'Booking…'
            : selectedSlotIso
              ? // Short form on mobile (day name + time) keeps the button from
                // wrapping on narrow screens; full date label on sm+ where
                // there's room.
                (() => {
                  const slot = slots.find((s) => s.startIso === selectedSlotIso)
                  const dayLabel = fmtDayLabel(selectedDate, timeZone)
                  const shortDay =
                    dayLabel === 'Today' || dayLabel === 'Tomorrow'
                      ? dayLabel
                      : DAY_NAME_SHORT[dayOfWeekForDateKey(selectedDate)]
                  return (
                    <>
                      <span className="sm:hidden">
                        Book {shortDay} · {slot?.label ?? ''}
                      </span>
                      <span className="hidden sm:inline">
                        Book {dayLabel} · {slot?.label ?? ''}
                      </span>
                    </>
                  )
                })()
              : 'Pick a time to continue'}
        </button>
        <p className="text-xs text-center mt-3" style={{ color: INK_MUTED }}>
          {selectedDepositCents > 0 ? (
            <>
              We&rsquo;ll send a confirmation and call to verify within 24 hours. The{' '}
              {fmtDeposit(selectedDepositCents)} deposit is credited toward your visit.
            </>
          ) : (
            <>
              We&rsquo;ll send a confirmation and call to verify within 24 hours. No payment
              required to book.
            </>
          )}
        </p>
      </div>
    </form>
  )
}
