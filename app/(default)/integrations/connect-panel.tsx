'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { OPEN_DENTAL_API_FEE_NOTE } from '@/lib/types/pms'
import { connectOpenDentalAction } from './actions'

/**
 * Open Dental connect form. The clinic pastes their per-office Customer Key;
 * we validate it against the live API before storing (encrypted). The
 * platform-level Developer Key is a server secret — clinics never see it.
 */
export default function ConnectPanel({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const r = await connectOpenDentalAction(fd)
      if (r.ok) router.refresh()
      else setError(r.error ?? 'Could not connect to Open Dental.')
    })
  }

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <PlugIcon />
        </div>
        <div>
          <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Connect Open Dental</h3>
          <p className="text-[12px] text-stone-500 dark:text-stone-400">
            Sanctioned + audit-clean — every change lands in your Open Dental Audit Trail.
          </p>
        </div>
      </div>

      <ol className="text-[12px] text-stone-600 dark:text-stone-300 space-y-1.5 mb-4 list-decimal pl-4">
        <li>In Open Dental, go to <span className="font-medium">Setup → Advanced → API</span> and generate a Customer Key.</li>
        <li>Paste it below. We&apos;ll verify the connection before saving (key stored encrypted).</li>
        <li>Run your first sync — patients, appointments, providers, and balances flow in.</li>
      </ol>

      {!configured && (
        <div className="mb-4 text-[12px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2">
          Open Dental isn&apos;t enabled on this DreamCRM instance yet (the platform Developer Key is missing).
          Contact support and we&apos;ll switch it on.
        </div>
      )}

      <form onSubmit={onSubmit}>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-1">
          Open Dental Customer Key
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            name="customerKey"
            type="text"
            autoComplete="off"
            placeholder="e.g. VzkU8w…"
            disabled={pending || !configured}
            className="flex-1 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !configured}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-stone-900 text-stone-100 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white disabled:opacity-50 whitespace-nowrap"
          >
            {pending ? 'Verifying…' : 'Connect'}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-3 text-[12px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <p className="mt-3 text-[11px] text-stone-400 dark:text-stone-500">{OPEN_DENTAL_API_FEE_NOTE}</p>
    </div>
  )
}

function PlugIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7V3m6 4V3M7 11h10M9 11v4a3 3 0 003 3v3m0-3a3 3 0 003-3v-4" />
    </svg>
  )
}
