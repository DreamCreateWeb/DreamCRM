'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { bookMyVisitAction, getPortalSlotsAction } from '../actions'
import SlotPicker from '@/components/patient-portal/slot-picker'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'

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
  allowedTypes,
  typeLabels,
  minNoticeHours,
  self,
  dependents,
  clinicPhone,
}: {
  brand: string
  allowedTypes: string[]
  /** Optional id→label map from the clinic's visit-type catalog. Preferred over
   *  the built-in PORTAL_VISIT_LABELS so custom clinic types render with a real
   *  name; falls back to PORTAL_VISIT_LABELS, then the raw id. */
  typeLabels?: Record<string, string>
  minNoticeHours: number
  self: PersonOpt
  dependents: PersonOpt[]
  clinicPhone: string | null
}) {
  const [forPatientId, setForPatientId] = useState(self.id)
  const [type, setType] = useState(allowedTypes[0] ?? 'checkup')
  const [slotIso, setSlotIso] = useState<string | null>(null)
  const [comfort, setComfort] = useState('')
  const [state, setState] = useState<'idle' | 'done'>('idle')
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
      if (res.ok) setState('done')
      else setError(res.error)
    })
  }

  if (state === 'done') {
    const who = people.find((p) => p.id === forPatientId)
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
        <p className="mx-auto mt-2 max-w-sm text-[0.92rem] leading-relaxed" style={{ color: MUTED }}>
          A confirmation is on its way to your email with everything you need. We’re looking
          forward to seeing you.
        </p>
        <Link
          href="/patient/appointments"
          className="mt-5 inline-block rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white"
          style={{ backgroundColor: brand }}
        >
          See my visits
        </Link>
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
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const active = forPatientId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setForPatientId(p.id)}
                  className="rounded-full px-4 py-2 text-[0.88rem] font-semibold"
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
        <div className="flex flex-wrap gap-2">
          {allowedTypes.map((t) => {
            const active = type === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className="rounded-full px-4 py-2 text-[0.88rem] font-semibold"
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
          className="w-full rounded-2xl bg-white px-4 py-3 text-[0.92rem] outline-none"
          style={{ border: `1px solid ${BORDER}`, color: INK }}
        />
      </section>

      {error && (
        <p className="rounded-xl px-4 py-3 text-[0.88rem] font-medium" style={{ backgroundColor: '#F7E9E6', color: '#9B4434' }}>
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
        {pending ? 'Booking…' : 'Book this visit'}
      </button>
    </div>
  )
}
