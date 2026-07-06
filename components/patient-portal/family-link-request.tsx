'use client'

import { useState, useTransition } from 'react'
import { requestFamilyLinkAction } from '@/app/(portal)/patient/actions'
import { PortalCard, PORTAL_INK as INK, PORTAL_MUTED as MUTED, PORTAL_BORDER as BORDER } from '@/components/patient-portal/ui'


/**
 * "Add a family member" — replaces the old call-the-front-desk dead end with
 * a two-field ask that lands straight in the clinic's inbox. Staff verify and
 * link with their existing tools; the patient gets a human reply, not a
 * silent pending state.
 */
export default function FamilyLinkRequest({ brand }: { brand: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [rel, setRel] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function send() {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const res = await requestFamilyLinkAction(name, dob, rel)
      if (res.ok) setDone(true)
      else setError(res.error ?? 'Something went wrong.')
    })
  }

  if (done) {
    return (
      <PortalCard>
        <p className="text-[0.95rem] font-semibold" style={{ color: INK }}>
          ✓ Request sent
        </p>
        <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: MUTED }}>
          The front desk will verify a couple of details and link the account — you’ll get a
          reply in Messages, usually within a business day.
        </p>
      </PortalCard>
    )
  }

  return (
    <PortalCard>
      {!open ? (
        <>
          <p className="text-[0.95rem] font-semibold" style={{ color: INK }}>
            Manage a child or family member here too?
          </p>
          <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: MUTED }}>
            Ask us to link their record to your account — you’ll see their visits and handle
            their forms from this same login.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 inline-flex items-center rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white"
            style={{ backgroundColor: brand }}
          >
            Add a family member
          </button>
        </>
      ) : (
        <>
          <p className="text-[0.95rem] font-semibold" style={{ color: INK }}>
            Who should we add?
          </p>
          <div className="mt-3 space-y-2.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their full name"
              maxLength={120}
              className="w-full rounded-2xl px-3.5 py-2.5 text-[0.92rem] outline-none"
              style={{ border: `1px solid ${BORDER}`, color: INK }}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <input
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                placeholder="Birthday (optional)"
                maxLength={20}
                className="w-full rounded-2xl px-3.5 py-2.5 text-[0.92rem] outline-none"
                style={{ border: `1px solid ${BORDER}`, color: INK }}
              />
              <input
                value={rel}
                onChange={(e) => setRel(e.target.value)}
                placeholder="Relationship (optional)"
                maxLength={60}
                className="w-full rounded-2xl px-3.5 py-2.5 text-[0.92rem] outline-none"
                style={{ border: `1px solid ${BORDER}`, color: INK }}
              />
            </div>
          </div>
          <p className="mt-2 text-[0.78rem] leading-relaxed" style={{ color: MUTED }}>
            This goes to the front desk as a message — they’ll verify a couple of details before
            linking, to keep everyone’s records safe.
          </p>
          {error && (
            <p className="mt-2 text-[0.82rem] font-medium" style={{ color: '#B4231F' }} role="alert">
              {error}
            </p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={send}
              disabled={pending || !name.trim()}
              className="rounded-full px-5 py-2.5 text-[0.9rem] font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: brand }}
            >
              {pending ? 'Sending…' : 'Send the request'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[0.85rem] font-medium"
              style={{ color: MUTED }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </PortalCard>
  )
}
