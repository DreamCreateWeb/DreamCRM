'use client'

import { useState, useTransition } from 'react'
import { requestFamilyLinkAction } from '@/app/(portal)/patient/actions'
import {
  PortalCard,
  BrandButton,
  GhostButton,
  PortalInput,
  PortalErrorText,
  PORTAL_INK as INK,
  PORTAL_MUTED as MUTED,
} from '@/components/patient-portal/ui'


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
          <BrandButton brand={brand} onClick={() => setOpen(true)} className="mt-3">
            Add a family member
          </BrandButton>
        </>
      ) : (
        <>
          <p className="text-[0.95rem] font-semibold" style={{ color: INK }}>
            Who should we add?
          </p>
          <div className="mt-3 space-y-2.5">
            <PortalInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their full name"
              maxLength={120}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <PortalInput
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                placeholder="Birthday (optional)"
                maxLength={20}
              />
              <PortalInput
                value={rel}
                onChange={(e) => setRel(e.target.value)}
                placeholder="Relationship (optional)"
                maxLength={60}
              />
            </div>
          </div>
          <p className="mt-2 text-[0.78rem] leading-relaxed" style={{ color: MUTED }}>
            This goes to the front desk as a message — they’ll verify a couple of details before
            linking, to keep everyone’s records safe.
          </p>
          {error && <PortalErrorText>{error}</PortalErrorText>}
          <div className="mt-3 flex items-center gap-3">
            <BrandButton brand={brand} onClick={send} disabled={pending || !name.trim()}>
              {pending ? 'Sending…' : 'Send the request'}
            </BrandButton>
            <GhostButton onClick={() => setOpen(false)}>Cancel</GhostButton>
          </div>
        </>
      )}
    </PortalCard>
  )
}
