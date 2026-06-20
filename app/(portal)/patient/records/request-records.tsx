'use client'

import { useState, useTransition } from 'react'
import { requestMyRecordsAction } from '../actions'
import { PortalCard, PORTAL_INK, PORTAL_MUTED } from '@/components/patient-portal/ui'

/**
 * "Request my records" — turns the old passive "call us" card into a real,
 * tracked ask. One tap sends an inbound message the front desk sees in
 * /messages and replies to in this patient's portal thread. Calling is kept as
 * a secondary path; the records themselves live in the clinic's PMS.
 */
export default function RequestRecordsCard({ brand, phone }: { brand: string; phone: string | null }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    start(async () => {
      const r = await requestMyRecordsAction()
      if (r.ok) setDone(true)
      else setError(r.error)
    })
  }

  return (
    <PortalCard>
      <p className="text-[0.95rem] font-semibold" style={{ color: PORTAL_INK }}>
        Need your full chart or X-rays?
      </p>
      <p className="mt-1 text-[0.88rem] leading-relaxed" style={{ color: PORTAL_MUTED }}>
        Your clinical records live in our practice system, and they’re yours — by law you can request a
        copy anytime, X-rays included.
      </p>
      {done ? (
        <div
          className="mt-3 rounded-2xl px-4 py-3 text-[0.88rem] font-medium"
          style={{ backgroundColor: '#E5EFE6', color: '#2F6B3C' }}
        >
          Request sent — we’ll reply in your{' '}
          <a href="/patient/messages" className="font-semibold underline">
            messages
          </a>{' '}
          with how to get them to you.
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.88rem] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: brand }}
            >
              {pending ? 'Sending…' : 'Request my records'}
            </button>
            {phone && (
              <span className="text-[0.84rem]" style={{ color: PORTAL_MUTED }}>
                or call{' '}
                <a href={`tel:${phone}`} className="font-semibold" style={{ color: brand }}>
                  {phone}
                </a>
              </span>
            )}
          </div>
          {error && (
            <p className="mt-2 text-[0.82rem]" style={{ color: '#B4452F' }}>
              {error}
            </p>
          )}
        </>
      )}
    </PortalCard>
  )
}
