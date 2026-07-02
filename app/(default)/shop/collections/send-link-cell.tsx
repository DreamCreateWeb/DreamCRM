'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendPayLinkAction } from '@/app/(default)/patients/actions'

/**
 * The board's per-row action: email this patient their pay link. Reuses the
 * patient-record action (same guards: balance, email, Stripe readiness,
 * 3-day resend window); the row's status pill updates on refresh.
 */
export default function SendLinkCell({
  patientId,
  disabled,
  disabledReason,
}: {
  patientId: string
  disabled?: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  function send() {
    startTransition(async () => {
      const r = await sendPayLinkAction(patientId)
      if (r.ok) {
        setState('sent')
        router.refresh()
      } else {
        setError(r.error)
        setState('error')
      }
    })
  }

  if (state === 'sent') {
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Sent ✓</span>
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={pending || disabled}
        title={disabled ? disabledReason : 'Email this patient a secure link to pay online'}
        className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline disabled:opacity-40 disabled:no-underline"
      >
        {pending ? 'Sending…' : 'Email pay link'}
      </button>
      {state === 'error' && (
        <span className="text-[11px] text-rose-600 dark:text-rose-400">{error}</span>
      )}
    </span>
  )
}
