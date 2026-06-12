'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { formatBps, formatTerm } from '@/lib/types/referrals'
import {
  assignClinicReferralAction,
  updateClinicReferralTermsAction,
  clearClinicReferralAction,
} from '@/app/(default)/partners/admin-actions'

interface PartnerOption {
  id: string
  name: string
  company: string | null
  defaultPercentBps: number
  defaultTermMonths: number | null
}

interface CurrentReferral {
  partnerId: string
  partnerName: string
  percentBps: number
  termMonths: number | null
  hasPercentOverride: boolean
  hasTermOverride: boolean
  /** The attributed partner's current default rate — for the "Uses partner
   *  default — currently X%" helper. */
  partnerDefaultPercentBps: number
  partnerDefaultTermMonths: number | null
  /** True when the attributed partner is archived (closed) — shown as
   *  "(archived)"; the clinic stays reassignable. */
  partnerArchived: boolean
}

/**
 * Retroactive referral attribution for a clinic — assign / change / clear the
 * partner + edit the per-clinic rate/term override. Platform owner/admin only
 * (the page gates; the actions re-check).
 */
export default function ReferralCard({
  organizationId,
  current,
  partners,
}: {
  organizationId: string
  current: CurrentReferral | null
  partners: PartnerOption[]
}) {
  const [editing, setEditing] = useState(false)
  const [partnerId, setPartnerId] = useState(current?.partnerId ?? '')
  const [percent, setPercent] = useState(current ? String(current.percentBps / 100) : '')
  const [term, setTerm] = useState(current?.termMonths == null ? '' : String(current.termMonths))
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selectedPartner = partners.find((p) => p.id === partnerId) ?? null

  function save() {
    setError(null)
    if (!partnerId) {
      setError('Pick a partner, or use Remove to clear the referral')
      return
    }
    const pct = percent.trim() === '' ? null : Number(percent)
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setError('Percentage must be 0–100')
      return
    }
    const months = term.trim() === '' ? null : Number(term)
    if (months != null && (!Number.isInteger(months) || months < 1)) {
      setError('Term must be whole months or blank')
      return
    }
    const percentBps = pct == null ? null : Math.round(pct * 100)
    startTransition(async () => {
      try {
        const changingPartner = current?.partnerId !== partnerId
        if (changingPartner) {
          await assignClinicReferralAction({
            organizationId,
            partnerId,
            percentBps,
            termMonths: months,
          })
        } else {
          await updateClinicReferralTermsAction({ organizationId, partnerId, percentBps, termMonths: months })
        }
        setToast('Referral saved')
        setEditing(false)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  function clear() {
    startTransition(async () => {
      try {
        await clearClinicReferralAction(organizationId, current?.partnerId)
        setToast('Referral cleared')
        setEditing(false)
        setPartnerId('')
        setPercent('')
        setTerm('')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="v2-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Referral</h2>
        {!editing && (
          <ActionButton variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {current ? 'Change' : 'Assign'}
          </ActionButton>
        )}
      </div>

      {!editing ? (
        current ? (
          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <p>
              Referred by{' '}
              <Link href={`/partners/${current.partnerId}`} className="font-medium text-teal-700 dark:text-teal-400 hover:underline">
                {current.partnerName}
              </Link>
              {current.partnerArchived && (
                <span className="ml-1.5 text-xs text-[color:var(--color-ink-500)]">(archived)</span>
              )}
            </p>
            <p className="text-gray-500 dark:text-gray-400">
              <span className="font-mono-num">{formatBps(current.percentBps)}</span> of each paid invoice · {formatTerm(current.termMonths)}
              <span className="ml-1.5 text-xs">
                {current.hasPercentOverride ? '· override' : '· partner default'}
              </span>
            </p>
            {!current.hasPercentOverride && (
              <p className="text-xs text-[color:var(--color-ink-500)]">
                Tracks the partner’s current default — changes to it apply here automatically.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {partners.length === 0
              ? 'No active partners to attribute. Add one under Partners first.'
              : 'No referral partner. Assign one to track commission on this clinic’s subscription.'}
          </p>
        )
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="rc-partner">Partner</label>
            <select id="rc-partner" className="form-select w-full" value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}>
              <option value="">Select a partner…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.company ? ` (${p.company})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="w-28">
              <label className="block text-xs font-medium mb-1" htmlFor="rc-pct">Commission %</label>
              <input id="rc-pct" className="form-input w-full" type="number" min={0} max={100} step="0.5"
                value={percent} onChange={(e) => setPercent(e.target.value)}
                placeholder={selectedPartner ? String(selectedPartner.defaultPercentBps / 100) : ''} />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" htmlFor="rc-term">Term (months)</label>
              <input id="rc-term" className="form-input w-full" type="number" min={1}
                value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Blank = ongoing" />
            </div>
          </div>
          {selectedPartner && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Leave blank (or match it) to use the partner default — currently{' '}
              {formatBps(selectedPartner.defaultPercentBps)} · {formatTerm(selectedPartner.defaultTermMonths)}.
              The default applies automatically and follows any future change; enter a value only to lock a custom rate.
            </p>
          )}
          {error && <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>}
          <div className="flex items-center justify-between">
            {current ? (
              <ActionButton variant="ghost" size="sm" onClick={clear} disabled={pending}>Remove</ActionButton>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <ActionButton variant="secondary" size="sm" onClick={() => { setEditing(false); setError(null) }} disabled={pending}>Cancel</ActionButton>
              <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>Save</ActionButton>
            </div>
          </div>
        </div>
      )}
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
