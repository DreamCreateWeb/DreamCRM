'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { BulkBar } from '@/components/ui/bulk-bar'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { runAction } from '@/lib/run-action'
import { formatCents } from '@/lib/types/shop'
import { markPaymentsPostedAction, unmarkPaymentPostedAction } from './actions'
import { TableFit } from '@/components/ui/data-table'

/** One row, fully formatted on the server (clinic-tz dates, status pill). */
export interface PostingRow {
  id: string
  patientId: string
  patientName: string
  amountCents: number
  paidLabel: string
  balanceAtPaymentCents: number | null
  /** Server-rendered Paid / Refunded pill. */
  status: ReactNode
  /** Clinic-tz date label — null while still to post. */
  postedLabel: string | null
  postedByName: string | null
}

const TH = 'px-3 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400'

/**
 * The reconcile checklist: a "Posted" action per row and a bulk bar for a
 * day's batch. "Posted" means entered in the practice's ledger (their PMS or
 * their books) — a person stamps it, nothing here does it for them.
 */
export default function PostingTable({ rows }: { rows: PostingRow[] }) {
  const confirm = useConfirm()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null) // a row id, or 'bulk'
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'urgent' } | null>(null)

  const todo = rows.filter((r) => !r.postedLabel)

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function post(ids: string[], key: string) {
    setBusy(key)
    try {
      const res = await runAction(() => markPaymentsPostedAction(ids))
      if (res.ok) {
        setSelected(new Set())
        setToast({ message: res.changed === 1 ? 'Marked posted.' : `Marked ${res.changed} posted.`, tone: 'ok' })
      } else setToast({ message: res.error, tone: 'urgent' })
    } finally {
      setBusy(null)
    }
  }

  async function postSelected() {
    const picked = todo.filter((r) => selected.has(r.id))
    if (picked.length === 0) return
    // The dialog law: awaited BEFORE any transition.
    const ok = await confirm({
      title: `Mark ${picked.length} payment${picked.length === 1 ? '' : 's'} as posted?`,
      message: 'Only do this once they are entered in your ledger — you can undo any single row.',
      confirmLabel: 'Mark posted',
    })
    if (!ok) return
    await post(picked.map((r) => r.id), 'bulk')
  }

  async function undo(id: string) {
    setBusy(id)
    try {
      const res = await runAction(() => unmarkPaymentPostedAction(id))
      setToast(res.ok ? { message: 'Back on the to-post list.', tone: 'ok' } : { message: res.error, tone: 'urgent' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="v2-card overflow-hidden">
        <TableFit label="Online payments to post">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)] text-left">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all payments still to post"
                  className="h-4 w-4"
                  disabled={todo.length === 0}
                  checked={todo.length > 0 && todo.every((r) => selected.has(r.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(todo.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className={TH}>Patient</th>
              <th className={`${TH} text-right`}>Amount</th>
              <th className={TH}>Paid</th>
              <th className={`hidden sm:table-cell ${TH} text-right`}>Balance at payment</th>
              <th className={`hidden sm:table-cell ${TH}`}>Status</th>
              <th className={TH}>In your ledger</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-hairline)]">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <td className="px-3 py-3">
                  {!p.postedLabel && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.patientName}’s ${formatCents(p.amountCents)} payment`}
                      className="h-4 w-4"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                  )}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/patients/${p.patientId}`} className="font-medium text-gray-800 dark:text-gray-100 hover:underline">
                    {p.patientName}
                  </Link>
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-mono-num font-semibold text-gray-800 dark:text-gray-100">
                  {formatCents(p.amountCents)}
                </td>
                <td className="px-3 py-3 text-gray-600 dark:text-gray-300 tabular-nums font-mono-num">{p.paidLabel}</td>
                <td className="hidden sm:table-cell px-3 py-3 text-right tabular-nums font-mono-num text-gray-600 dark:text-gray-300">
                  {p.balanceAtPaymentCents == null ? '—' : formatCents(p.balanceAtPaymentCents)}
                </td>
                <td className="hidden sm:table-cell px-3 py-3">{p.status}</td>
                <td className="px-3 py-3">
                  {p.postedLabel ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill
                        tone="ok"
                        label={`Posted ${p.postedLabel}`}
                        title={p.postedByName ? `Marked posted by ${p.postedByName}` : 'Marked posted'}
                      />
                      {p.postedByName && <span className="text-xs text-gray-500 dark:text-gray-400">{p.postedByName}</span>}
                      <ActionButton variant="ghost" size="sm" pending={busy === p.id} onClick={() => undo(p.id)}>
                        Undo
                      </ActionButton>
                    </div>
                  ) : (
                    <ActionButton variant="secondary" size="sm" pending={busy === p.id} onClick={() => post([p.id], p.id)}>
                      Mark posted
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableFit>
      </div>

      <BulkBar count={selected.size} noun="to mark posted" onClear={() => setSelected(new Set())}>
        <ActionButton size="sm" variant="primary" pending={busy === 'bulk'} onClick={postSelected}>
          {`Mark ${selected.size} posted`}
        </ActionButton>
      </BulkBar>

      {toast && <FlashToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </>
  )
}
