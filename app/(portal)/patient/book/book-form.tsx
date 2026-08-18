'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { bookMyVisitAction, getPortalSlotsAction } from '../actions'
import SlotPicker from '@/components/patient-portal/slot-picker'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'
import { PORTAL_DANGER_BG, PORTAL_DANGER_INK } from '@/components/patient-portal/ui'
import { buildIcs, icsDataUrl } from '@/lib/ics'
import { formatConfirmationWhen } from '@/app/site/[slug]/book/book-form'

/**
 * Portal booking: confirm-and-adjust, not blank-form. The signed-in patient
 * is the default who; visit types come pre-restricted by the clinic's portal
 * settings; the comfort question is the Tend-style touch that tells the
 * front desk how to make the visit easier.
 */

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

interface PersonOpt {
  id: string
  firstName: string
}

export default function PortalBookForm({
  brand,
  timeZone,
  allowedTypes,
  typeLabels,
  minNoticeHours,
  self,
  dependents,
  clinicPhone,
  initialForPatientId,
}: {
  brand: string
  /** Clinic IANA timezone — anchors the slot picker's day strip. */
  timeZone: string
  allowedTypes: string[]
  /** Optional id→label map from the clinic's visit-type catalog. Preferred over
   *  the built-in PORTAL_VISIT_LABELS so custom clinic types render with a real
   *  name; falls back to PORTAL_VISIT_LABELS, then the raw id. */
  typeLabels?: Record<string, string>
  minNoticeHours: number
  self: PersonOpt
  dependents: PersonOpt[]
  clinicPhone: string | null
  /** Pre-selected person (the Family page's "Book for {name}" link). */
  initialForPatientId?: string
}) {
  const [forPatientId, setForPatientId] = useState(initialForPatientId ?? self.id)
  const [type, setType] = useState(allowedTypes[0] ?? 'checkup')
  const [slotIso, setSlotIso] = useState<string | null>(null)
  const [comfort, setComfort] = useState('')
  const [state, setState] = useState<'idle' | 'done'>('idle')
  const [bookedIso, setBookedIso] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const people = [self, ...dependents]

  const submit = () => {
    if (!slotIso) return
    setError('')
    startTransition(async () => {
      const fd = new FormData()
      fd.set('forPatientId', forPatientId)
      fd.set('type', type)
      fd.set('startTime', slotIso)
      fd.set('comfort', comfort)
      const res = await bookMyVisitAction(fd)
      if (res.ok) {
        setBookedIso(slotIso)
        setState('done')
      }
      else setError(res.error)
    })
  }

  if (state === 'done') {
    const who = people.find((p) => p.id === forPatientId)
    const typeLabel = typeLabels?.[type] ?? PORTAL_VISIT_LABELS[type] ?? type
    // Echo the chosen time back — the patient just picked it, and the screen
    // repeating it is what removes the "did it take the right one?" doubt.
    const whenLabel = bookedIso ? formatConfirmationWhen(bookedIso, timeZone) : null
    const icsHref = bookedIso
      ? icsDataUrl(
          buildIcs({
            uid: `portal-booking-${new Date(bookedIso).getTime()}@dreamcreatestudio.com`,
            start: new Date(bookedIso),
            end: new Date(new Date(bookedIso).getTime() + 30 * 60 * 1000),
            summary: typeLabel,
          }),
        )
      : null
    return (
      <div
        className="rounded-2xl bg-white p-8 text-center"
        style={{ border: `1px solid ${BORDER}` }}
      >
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white"
          style={{ backgroundColor: brand }}
        >
          ✓
        </span>
        <h2
          className="mt-4 text-[1.45rem] font-semibold"
          style={{ fontFamily: 'var(--font-display)', color: INK }}
        >
          {forPatientId === self.id ? 'You’re booked' : `${who?.firstName ?? 'They'}’s booked`}
        </h2>
        {whenLabel && (
          <p className="mt-2 text-[1rem] font-semibold" style={{ color: INK }}>
            {typeLabel} · {whenLabel}
          </p>
        )}
        <p className="mx-auto mt-2 max-w-sm text-[0.92rem] leading-relaxed" style={{ color: MUTED }}>
          A confirmation is on its way to your email with everything you need. We’re looking
          forward to seeing you.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/patient/appointments"
            className="inline-block rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white transition active:scale-[0.98]"
            style={{ backgroundColor: brand }}
          >
            See my visits
          </Link>
          {icsHref && (
            <a
              href={icsHref}
              download="appointment.ics"
              className="inline-block rounded-full bg-white px-5 py-2.5 text-[0.9rem] font-semibold transition active:scale-[0.98]"
              style={{ border: `1px solid ${BORDER}`, color: INK }}
            >
              Add to calendar
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {people.length > 1 && (
        <section>
          <p className="mb-2 text-[0.85rem] font-semibold" style={{ color: INK }}>
            Who’s this visit for?
          </p>
          {/* A single-select chip group: give it group semantics and announce
              the choice, which is otherwise carried by brand colour alone. */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Who’s this visit for?">
            {people.map((p) => {
              const active = forPatientId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setForPatientId(p.id)}
                  aria-pressed={active}
                  className="rounded-full px-4 py-2 text-[0.88rem] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={
                    active
                      ? { backgroundColor: brand, color: '#FFFFFF' }
                      : { backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, color: INK }
                  }
                >
                  {p.id === self.id ? `${p.firstName} (me)` : p.firstName}
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-[0.85rem] font-semibold" style={{ color: INK }}>
          What kind of visit?
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="What kind of visit?">
          {allowedTypes.map((t) => {
            const active = type === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={active}
                className="rounded-full px-4 py-2 text-[0.88rem] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={
                  active
                    ? { backgroundColor: brand, color: '#FFFFFF' }
                    : { backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, color: INK }
                }
              >
                {typeLabels?.[t] ?? PORTAL_VISIT_LABELS[t] ?? t}
              </button>
            )
          })}
        </div>
        {clinicPhone && (
          <p className="mt-2 text-[0.8rem]" style={{ color: MUTED }}>
            Need something else?{' '}
            <a href={`tel:${clinicPhone}`} className="font-semibold" style={{ color: brand }}>
              Call us
            </a>{' '}
            and we’ll set aside the right amount of time.
          </p>
        )}
      </section>

      <section>
        <p className="mb-2 text-[0.85rem] font-semibold" style={{ color: INK }}>
          Pick a time
        </p>
        <SlotPicker
          loadSlots={getPortalSlotsAction}
          brand={brand}
          timeZone={timeZone}
          selectedIso={slotIso}
          onSelect={setSlotIso}
          minNoticeHours={minNoticeHours}
        />
      </section>

      <section>
        <label className="mb-2 block text-[0.85rem] font-semibold" style={{ color: INK }} htmlFor="comfort">
          Anything that would make your visit easier?{' '}
          <span className="font-normal" style={{ color: MUTED }}>
            (optional)
          </span>
        </label>
        <textarea
          id="comfort"
          value={comfort}
          onChange={(e) => setComfort(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Nervous about needles, prefer a morning chat first, favorite playlist — we mean it."
          className="w-full rounded-2xl bg-white px-4 py-3 text-[0.92rem] outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-1"
          style={{ border: `1px solid ${BORDER}`, color: INK }}
        />
      </section>

      {error && (
        <p role="alert" className="rounded-xl px-4 py-3 text-[0.88rem] font-medium" style={{ backgroundColor: PORTAL_DANGER_BG, color: PORTAL_DANGER_INK }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!slotIso || pending}
        className="w-full rounded-full py-3.5 text-[0.95rem] font-semibold text-white disabled:opacity-40 sm:w-auto sm:px-8"
        style={{ backgroundColor: brand }}
      >
        {!slotIso ? 'Pick a time to continue' : pending ? 'Booking…' : 'Book this visit'}
      </button>
    </div>
  )
}
