'use client'

import { useTransition } from 'react'
import { setDemoContext, clearDemoContext } from './actions'

export function SimulateClinicButton({ orgId }: { orgId: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      onClick={() => start(() => setDemoContext(orgId, 'owner'))}
      disabled={pending}
      className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold transition-colors disabled:opacity-60"
    >
      {pending ? 'Loading…' : 'Simulate Clinic'}
    </button>
  )
}

export function SimulatePatientButton({ orgId, patientId, name }: { orgId: string; patientId: string; name: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      onClick={() => start(() => setDemoContext(orgId, 'patient', patientId))}
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-60"
    >
      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
      </svg>
      {pending ? '…' : name}
    </button>
  )
}

export function ExitDemoButton() {
  const [pending, start] = useTransition()
  return (
    <button
      onClick={() => start(() => clearDemoContext())}
      disabled={pending}
      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
    >
      {pending ? 'Exiting…' : 'Exit Demo Mode'}
    </button>
  )
}
