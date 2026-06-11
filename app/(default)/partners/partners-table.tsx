'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import {
  PARTNER_STATUS_LABELS,
  PARTNER_STATUS_TONE,
  PAYOUT_METHOD_LABELS,
  PAYOUT_METHOD_TONE,
  payoutMethodState,
  formatBps,
  formatTerm,
  moneyFromCents,
  type PartnerStatus,
} from '@/lib/types/referrals'
import { resendPartnerInviteAction, setPartnerStatusAction } from './admin-actions'

export interface PartnerTableRow {
  id: string
  name: string
  company: string | null
  email: string
  status: PartnerStatus
  defaultPercentBps: number
  defaultTermMonths: number | null
  hasConnectAccount: boolean
  payoutsEnabled: boolean
  clinicCount: number
  unpaidCents: number
  lifetimePaidCents: number
  isDemo: boolean
}

export default function PartnersTable({ partners }: { partners: PartnerTableRow[] }) {
  const [toast, setToast] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function resend(id: string) {
    setPendingId(id)
    startTransition(async () => {
      try {
        const r = await resendPartnerInviteAction(id)
        setToast(`Invite re-sent to ${r.email}`)
      } catch (err) {
        setToast((err as Error).message)
      } finally {
        setPendingId(null)
      }
    })
  }

  function toggleSuspend(id: string, status: PartnerStatus) {
    const next = status === 'suspended' ? 'active' : 'suspended'
    setPendingId(id)
    startTransition(async () => {
      try {
        await setPartnerStatusAction(id, next)
        setToast(next === 'suspended' ? 'Partner suspended' : 'Partner reactivated')
      } catch (err) {
        setToast((err as Error).message)
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <div className="v2-card overflow-x-auto">
      <table className="table-auto w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Partner</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-left font-semibold">Rate · term</th>
            <th className="px-4 py-3 text-right font-semibold">Clinics</th>
            <th className="px-4 py-3 text-right font-semibold">Unpaid</th>
            <th className="px-4 py-3 text-right font-semibold">Paid</th>
            <th className="px-4 py-3 text-left font-semibold">Payouts</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {partners.map((p) => {
            const method = payoutMethodState({ hasConnectAccount: p.hasConnectAccount, payoutsEnabled: p.payoutsEnabled })
            const busy = pendingId === p.id
            return (
              <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20">
                <td className="px-4 py-3">
                  <Link href={`/partners/${p.id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:text-teal-700 dark:hover:text-teal-400">
                    {p.name}
                  </Link>
                  {p.isDemo && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[0.65rem] font-semibold align-middle">
                      Demo
                    </span>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {p.company ? `${p.company} · ` : ''}{p.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill tone={PARTNER_STATUS_TONE[p.status]} label={PARTNER_STATUS_LABELS[p.status]} />
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                  <span className="font-mono-num tabular-nums">{formatBps(p.defaultPercentBps)}</span>
                  <span className="text-gray-400 dark:text-gray-500"> · {formatTerm(p.defaultTermMonths)}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono-num tabular-nums text-gray-700 dark:text-gray-300">{p.clinicCount}</td>
                <td className={`px-4 py-3 text-right font-mono-num tabular-nums ${p.unpaidCents > 0 ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                  {moneyFromCents(p.unpaidCents)}
                </td>
                <td className="px-4 py-3 text-right font-mono-num tabular-nums text-gray-700 dark:text-gray-300">{moneyFromCents(p.lifetimePaidCents)}</td>
                <td className="px-4 py-3">
                  <StatusPill tone={PAYOUT_METHOD_TONE[method]} label={PAYOUT_METHOD_LABELS[method]} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {p.status === 'invited' && (
                      <ActionButton variant="ghost" size="sm" onClick={() => resend(p.id)} disabled={busy}>
                        {busy ? '…' : 'Resend'}
                      </ActionButton>
                    )}
                    {p.status !== 'invited' && (
                      <ActionButton
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSuspend(p.id, p.status)}
                        disabled={busy}
                      >
                        {p.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </ActionButton>
                    )}
                    <ActionButton variant="secondary" size="sm" href={`/partners/${p.id}`}>
                      Open
                    </ActionButton>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
