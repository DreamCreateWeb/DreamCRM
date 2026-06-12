'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { formatBps, formatTerm, moneyFromCents } from '@/lib/types/referrals'
import { updateClinicReferralTermsAction } from '../admin-actions'

interface ClinicRow {
  organizationId: string
  name: string
  slug: string
  planTier: string
  percentBps: number
  termMonths: number | null
  /** True when this clinic carries an explicit per-clinic % override (vs.
   *  live-resolving the partner default). Drives the provenance label. */
  hasPercentOverride: boolean
  hasTermOverride: boolean
  startedAt: string | null
  lifetimeCommissionCents: number
}

const PLAN_LABEL: Record<string, string> = { basic: 'Basic', pro: 'Pro', premium: 'Premium' }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Per-clinic referral rows with an inline-editable % override + term. The %
 * column shows provenance: "10% · default" (live-resolving the partner default)
 * vs "12% · override" (an explicit per-clinic rate). Saving a value equal to
 * the partner default collapses back to "default" (the action persists NULL).
 */
export default function ReferredClinicsTable({
  partnerId,
  partnerDefaultPercentBps,
  partnerDefaultTermMonths,
  clinics,
}: {
  partnerId: string
  partnerDefaultPercentBps: number
  partnerDefaultTermMonths: number | null
  clinics: ClinicRow[]
}) {
  const [editId, setEditId] = useState<string | null>(null)
  const [percent, setPercent] = useState('')
  const [term, setTerm] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function startEdit(c: ClinicRow) {
    setEditId(c.organizationId)
    setPercent(String(c.percentBps / 100))
    setTerm(c.termMonths == null ? '' : String(c.termMonths))
  }

  function save(c: ClinicRow) {
    const pct = Number(percent)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setToast('Percentage must be 0–100')
      return
    }
    const months = term.trim() === '' ? null : Number(term)
    if (months != null && (!Number.isInteger(months) || months < 1)) {
      setToast('Term must be whole months or blank')
      return
    }
    startTransition(async () => {
      try {
        await updateClinicReferralTermsAction({
          organizationId: c.organizationId,
          partnerId,
          percentBps: Math.round(pct * 100),
          termMonths: months,
        })
        setToast(`Updated ${c.name}`)
        setEditId(null)
      } catch (err) {
        setToast((err as Error).message)
      }
    })
  }

  return (
    <div className="v2-card overflow-x-auto">
      <table className="table-auto w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Clinic</th>
            <th className="px-4 py-3 text-left font-semibold">Plan</th>
            <th className="px-4 py-3 text-left font-semibold">Since</th>
            <th className="px-4 py-3 text-left font-semibold">Rate · term</th>
            <th className="px-4 py-3 text-right font-semibold">Lifetime commission</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
          {clinics.map((c) => {
            const editing = editId === c.organizationId
            return (
              <tr key={c.organizationId} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20">
                <td className="px-4 py-3">
                  <Link href={`/ecommerce/customers/${c.organizationId}`} className="font-medium text-gray-900 dark:text-gray-100 hover:text-teal-700 dark:hover:text-teal-400">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{PLAN_LABEL[c.planTier] ?? c.planTier}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{fmtDate(c.startedAt)}</td>
                <td className="px-4 py-3">
                  {editing ? (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <input className="form-input w-16 text-xs py-1" type="number" min={0} max={100} step="0.5"
                          value={percent} onChange={(e) => setPercent(e.target.value)} aria-label="Percent"
                          placeholder={String(partnerDefaultPercentBps / 100)} />
                        <span className="text-gray-400">%</span>
                        <input className="form-input w-20 text-xs py-1" type="number" min={1}
                          value={term} onChange={(e) => setTerm(e.target.value)} placeholder="mo" aria-label="Term months" />
                      </div>
                      <p className="mt-1 text-[0.7rem] text-[color:var(--color-ink-500)]">
                        Uses partner default — currently {formatBps(partnerDefaultPercentBps)} · {formatTerm(partnerDefaultTermMonths)}. Match it to use the default.
                      </p>
                    </div>
                  ) : (
                    <span className="text-gray-700 dark:text-gray-300">
                      <span className="font-mono-num tabular-nums">{(c.percentBps / 100)}%</span>
                      <span className="text-gray-400 dark:text-gray-500"> · {formatTerm(c.termMonths)}</span>
                      <span className="ml-1.5 text-[0.7rem] text-[color:var(--color-ink-500)]">
                        {c.hasPercentOverride ? 'override' : 'default'}
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono-num tabular-nums text-gray-700 dark:text-gray-300">
                  {moneyFromCents(c.lifetimeCommissionCents)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {editing ? (
                      <>
                        <ActionButton variant="ghost" size="sm" onClick={() => setEditId(null)} disabled={pending}>Cancel</ActionButton>
                        <ActionButton variant="primary" size="sm" onClick={() => save(c)} disabled={pending}>Save</ActionButton>
                      </>
                    ) : (
                      <ActionButton variant="secondary" size="sm" onClick={() => startEdit(c)}>Edit rate</ActionButton>
                    )}
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
