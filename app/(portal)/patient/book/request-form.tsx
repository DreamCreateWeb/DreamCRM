'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { requestMyVisitAction } from '../actions'
import { PORTAL_VISIT_LABELS } from '@/lib/types/portal'
import { PORTAL_DANGER_BG, PORTAL_DANGER_INK } from '@/components/patient-portal/ui'

/**
 * Portal request-only booking — shown instead of the slot picker when the
 * clinic has turned OFF self-scheduling (Settings → Practice). The signed-in
 * patient is known, so there are no contact fields: just an optional reason +
 * preferred times + note. Submitting sends an in-app message to the clinic
 * (their reply lands in this patient's portal Messages). Mirrors the public
 * website's request form + the slot-picker form's look.
 */

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

interface PersonOpt {
  id: string
  firstName: string
}

export default function PortalRequestForm({
  brand,
  allowedTypes,
  typeLabels,
  self,
  dependents,
  clinicPhone,
}: {
  brand: string
  allowedTypes: string[]
  typeLabels?: Record<string, string>
  self: PersonOpt
  dependents: PersonOpt[]
  clinicPhone: string | null
}) {
  const [forPatientId, setForPatientId] = useState(self.id)
  // The picker submits the human LABEL as the free-text reason; '' = unspecified.
  const [reason, setReason] = useState('')
  const [preferred, setPreferred] = useState('')
  const [notes, setNotes] = useState('')
  const [state, setState] = useState<'idle' | 'done'>('idle')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const people = [self, ...dependents]
  const reasonOptions = allowedTypes.map((t) => typeLabels?.[t] ?? PORTAL_VISIT_LABELS[t] ?? t)

  const submit = () => {
    setError('')
    startTransition(async () => {
      const fd = new FormData()
      fd.set('forPatientId', forPatientId)
      fd.set('reason', reason)
      fd.set('preferredTimes', preferred)
      fd.set('notes', notes)
      const res = await requestMyVisitAction(fd)
      if (res.ok) setState('done')
      else setError(res.error)
    })
  }

  if (state === 'done') {
    return (
      <div className="rounded-2xl bg-white p-8 text-center" style={{ border: `1px solid ${BORDER}` }}>
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white"
          style={{ backgroundColor: brand }}
        >
          ✓
        </span>
        <h2 className="mt-4 text-[1.45rem] font-semibold" style={{ fontFamily: 'var(--font-display)', color: INK }}>
          Request sent
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[0.92rem] leading-relaxed" style={{ color: MUTED }}>
          Thanks! We’ll reach out to find a time that works — usually within one business day. You’ll
          see our reply in your Messages.
        </p>
        <Link
          href="/patient/messages"
          className="mt-5 inline-block rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white"
          style={{ backgroundColor: brand }}
        >
          Go to Messages
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

      {reasonOptions.length > 0 && (
        <section>
          <p className="mb-2 text-[0.85rem] font-semibold" style={{ color: INK }}>
            What kind of visit?{' '}
            <span className="font-normal" style={{ color: MUTED }}>
              (optional)
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {reasonOptions.map((label) => {
              const active = reason === label
              return (
                <button
                  key={label}
                  type="button"
                  // Toggle: clicking the active pill clears the reason.
                  onClick={() => setReason(active ? '' : label)}
                  className="rounded-full px-4 py-2 text-[0.88rem] font-semibold"
                  style={
                    active
                      ? { backgroundColor: brand, color: '#FFFFFF' }
                      : { backgroundColor: '#FFFFFF', border: `1px solid ${BORDER}`, color: INK }
                  }
                >
                  {label}
                </button>
              )
            })}
          </div>
          {clinicPhone && (
            <p className="mt-2 text-[0.8rem]" style={{ color: MUTED }}>
              Prefer to talk it through?{' '}
              <a href={`tel:${clinicPhone}`} className="font-semibold" style={{ color: brand }}>
                Call us
              </a>
              .
            </p>
          )}
        </section>
      )}

      <section>
        <label className="mb-2 block text-[0.85rem] font-semibold" style={{ color: INK }} htmlFor="preferred">
          When works best?{' '}
          <span className="font-normal" style={{ color: MUTED }}>
            (optional)
          </span>
        </label>
        <input
          id="preferred"
          value={preferred}
          onChange={(e) => setPreferred(e.target.value)}
          maxLength={200}
          placeholder="e.g. weekday mornings, after 4pm…"
          className="w-full rounded-2xl bg-white px-4 py-3 text-[0.92rem] outline-none"
          style={{ border: `1px solid ${BORDER}`, color: INK }}
        />
      </section>

      <section>
        <label className="mb-2 block text-[0.85rem] font-semibold" style={{ color: INK }} htmlFor="notes">
          Anything we should know?{' '}
          <span className="font-normal" style={{ color: MUTED }}>
            (optional)
          </span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="A bit about what you need, or anything that would make your visit easier."
          className="w-full rounded-2xl bg-white px-4 py-3 text-[0.92rem] outline-none"
          style={{ border: `1px solid ${BORDER}`, color: INK }}
        />
      </section>

      {error && (
        <p className="rounded-xl px-4 py-3 text-[0.88rem] font-medium" style={{ backgroundColor: PORTAL_DANGER_BG, color: PORTAL_DANGER_INK }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="w-full rounded-full py-3.5 text-[0.95rem] font-semibold text-white disabled:opacity-40 sm:w-auto sm:px-8"
        style={{ backgroundColor: brand }}
      >
        {pending ? 'Sending…' : 'Send request'}
      </button>
    </div>
  )
}
