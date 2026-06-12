'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { FilterChip } from '@/components/ui/filter-chip'
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
import { resendPartnerInviteAction, setPartnerStatusAction, reactivatePartnerAction } from './admin-actions'
import DeletePartnerModal from './delete-partner-modal'

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

type StatusFilter = 'all' | 'active' | 'invited' | 'suspended' | 'archived'

export default function PartnersTable({ partners }: { partners: PartnerTableRow[] }) {
  const [toast, setToast] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [, startTransition] = useTransition()

  // Counts per status drive the chip badges.
  const counts = useMemo(() => {
    const c = { all: partners.length, active: 0, invited: 0, suspended: 0, archived: 0 }
    for (const p of partners) {
      if (p.status === 'active') c.active += 1
      else if (p.status === 'invited') c.invited += 1
      else if (p.status === 'suspended') c.suspended += 1
      else if (p.status === 'archived') c.archived += 1
    }
    return c
  }, [partners])

  // Default to 'active', but if there are no active partners and there is other
  // content, fall back to 'all' so the table isn't confusingly empty.
  const effectiveFilter: StatusFilter =
    filter === 'active' && counts.active === 0 && partners.length > 0 ? 'all' : filter

  const visible = useMemo(
    () =>
      effectiveFilter === 'all'
        ? partners
        : partners.filter((p) => p.status === effectiveFilter),
    [partners, effectiveFilter],
  )

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

  function reactivate(id: string) {
    setPendingId(id)
    startTransition(async () => {
      try {
        const r = await reactivatePartnerAction(id)
        setToast(r.ok ? 'Partner reactivated' : r.error ?? 'Could not reactivate')
      } catch (err) {
        setToast((err as Error).message)
      } finally {
        setPendingId(null)
      }
    })
  }

  return (
    <div>
      {/* Status filter — archived included so closed partners are findable. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterChip active={effectiveFilter === 'active'} onClick={() => setFilter('active')} count={counts.active}>
          Active
        </FilterChip>
        <FilterChip active={effectiveFilter === 'invited'} onClick={() => setFilter('invited')} count={counts.invited}>
          Invited
        </FilterChip>
        <FilterChip active={effectiveFilter === 'suspended'} onClick={() => setFilter('suspended')} count={counts.suspended}>
          Suspended
        </FilterChip>
        <FilterChip active={effectiveFilter === 'archived'} onClick={() => setFilter('archived')} count={counts.archived}>
          Archived
        </FilterChip>
        <FilterChip active={effectiveFilter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
          All
        </FilterChip>
      </div>

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
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[color:var(--color-ink-500)]">
                  No {effectiveFilter === 'all' ? '' : `${effectiveFilter} `}partners.
                </td>
              </tr>
            ) : (
              visible.map((p) => {
                const method = payoutMethodState({ hasConnectAccount: p.hasConnectAccount, payoutsEnabled: p.payoutsEnabled })
                const busy = pendingId === p.id
                const archived = p.status === 'archived'
                return (
                  <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20">
                    <td className="px-4 py-3">
                      <Link href={`/partners/${p.id}`} className={`font-medium hover:text-teal-700 dark:hover:text-teal-400 ${archived ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {p.name}
                      </Link>
                      {archived && <span className="ml-2 text-xs text-[color:var(--color-ink-500)]">(archived)</span>}
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
                        {(p.status === 'active' || p.status === 'suspended') && (
                          <ActionButton
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSuspend(p.id, p.status)}
                            disabled={busy}
                          >
                            {p.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                          </ActionButton>
                        )}
                        {archived ? (
                          <ActionButton variant="secondary" size="sm" onClick={() => reactivate(p.id)} disabled={busy}>
                            {busy ? '…' : 'Reactivate'}
                          </ActionButton>
                        ) : (
                          <ActionButton variant="secondary" size="sm" href={`/partners/${p.id}`}>
                            Open
                          </ActionButton>
                        )}
                        {/* Destructive — separated from the primary, never adjacent. */}
                        {!archived && (
                          <span className="pl-2 ml-1 border-l border-[color:var(--color-hairline)]">
                            <DeletePartnerModal
                              partnerId={p.id}
                              partnerName={p.name}
                              clinicCount={p.clinicCount}
                              accruedCents={p.unpaidCents}
                              lifetimePaidCents={p.lifetimePaidCents}
                              payoutsEnabled={p.payoutsEnabled}
                            />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
