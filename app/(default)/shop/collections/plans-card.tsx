'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StatusPill } from '@/components/ui/status-pill'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cancelPlanAction } from './actions'

export interface PlanRowView {
  id: string
  patientId: string
  patientName: string
  totalCents: number
  installmentCents: number
  installments: number
  installmentsPaid: number
  status: string
  /** Pre-formatted clinic-tz day label (server-rendered) or null. */
  nextChargeLabel: string | null
  lastError: string | null
}

const STATUS_TONE: Record<string, { tone: 'ok' | 'warn' | 'urgent' | 'neutral'; label: string }> = {
  proposed: { tone: 'neutral', label: 'Waiting on patient' },
  active: { tone: 'ok', label: 'Active' },
  past_due: { tone: 'urgent', label: 'Past due' },
  completed: { tone: 'ok', label: 'Completed' },
  canceled: { tone: 'neutral', label: 'Canceled' },
}

/** The plans table on the Collections board — progress, next charge, cancel. */
export default function PlansCard({ plans, canManage }: { plans: PlanRowView[]; canManage: boolean }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const money = (c: number) => `$${(c / 100).toFixed(2)}`

  async function cancel(plan: PlanRowView) {
    const ok = await confirm({
      title: `Cancel ${plan.patientName}’s plan?`,
      message: 'No further installments will be charged. Payments already made stay on the books.',
      confirmLabel: 'Cancel the plan',
      danger: true,
    })
    if (!ok) return
    setPendingId(plan.id)
    startTransition(async () => {
      await cancelPlanAction(plan.id)
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <div className="v2-card overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-[color:var(--color-hairline)]">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Payment plans</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Monthly autopay installments — each successful charge lands in Online payments for PMS posting.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)] text-left">
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Patient</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Plan</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Progress</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Next charge</th>
              {canManage && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-hairline)]">
            {plans.map((p) => {
              const meta = STATUS_TONE[p.status] ?? STATUS_TONE.proposed
              const open = p.status === 'proposed' || p.status === 'active' || p.status === 'past_due'
              return (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <Link href={`/patients/${p.patientId}`} className="font-medium text-gray-800 dark:text-gray-100 hover:underline">
                      {p.patientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-gray-700 dark:text-gray-200">
                    {money(p.totalCents)} · {p.installments} × {money(p.installmentCents)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-200">
                    {p.installmentsPaid} of {p.installments}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                    {p.status === 'past_due' && p.lastError && (
                      <p className="mt-1 text-xs text-rose-500 max-w-[16rem] truncate" title={p.lastError}>
                        {p.lastError}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                    {p.nextChargeLabel ?? '—'}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {open && (
                        <button
                          type="button"
                          onClick={() => cancel(p)}
                          disabled={pendingId === p.id}
                          className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-40"
                        >
                          {pendingId === p.id ? 'Canceling…' : 'Cancel'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
