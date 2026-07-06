'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LoyaltySettings } from '@/lib/types/loyalty'
import { ActionButton } from '@/components/ui/action-button'
import { Toggle } from '@/components/ui/toggle'
import { saveLoyaltySettingsAction } from './actions'

/**
 * Loyalty program config (the Shop hub's points card). Opt-in, default OFF.
 * Earning runs on the daily sweep; redemption mints a single-use shop coupon
 * — which is exactly why this lives on the Shop page.
 */
export default function LoyaltyConfigCard({
  settings,
  canManage,
}: {
  settings: LoyaltySettings
  canManage: boolean
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(settings)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function num<K extends keyof LoyaltySettings>(k: K, v: string) {
    setDraft((d) => ({ ...d, [k]: Number(v) || 0 }))
    setSaved(false)
  }

  function save() {
    setError('')
    startTransition(async () => {
      const r = await saveLoyaltySettingsAction(draft)
      if (r.ok) {
        setSaved(true)
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div className="v2-card px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            💎 Loyalty rewards
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-xl">
            Patients earn points for kept visits, referrals that show up, and online payments —
            and spend them as a discount code in your shop. Points accrue automatically each
            day once this is on; every patient&rsquo;s balance lives on their record and in
            their portal.
          </p>
        </div>
        <Toggle
          checked={draft.enabled}
          onChange={(v) => {
            setDraft((d) => ({ ...d, enabled: v }))
            setSaved(false)
          }}
          disabled={!canManage}
          srLabel="Enable loyalty rewards"
        />
      </div>

      {draft.enabled && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <NumField label="Kept visit" value={draft.pointsPerVisit} onChange={(v) => num('pointsPerVisit', v)} suffix="pts" disabled={!canManage} />
          <NumField label="Referral kept" value={draft.pointsPerReferral} onChange={(v) => num('pointsPerReferral', v)} suffix="pts" disabled={!canManage} />
          <NumField label="Online payment" value={draft.pointsPerPayment} onChange={(v) => num('pointsPerPayment', v)} suffix="pts" disabled={!canManage} />
          <NumField label="Redeem at" value={draft.redeemPoints} onChange={(v) => num('redeemPoints', v)} suffix="pts" disabled={!canManage} />
          <NumField
            label="Reward value"
            value={Math.round(draft.redeemValueCents / 100)}
            onChange={(v) => num('redeemValueCents', String((Number(v) || 0) * 100))}
            suffix="$ off"
            disabled={!canManage}
          />
        </div>
      )}

      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save rewards settings'}
          </ActionButton>
          {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved ✓</span>}
          {error && <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      )}
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  disabled,
}: {
  label: string
  value: number
  onChange: (v: string) => void
  suffix: string
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label={`${label} (${suffix})`}
          className="form-input w-20 text-sm tabular-nums"
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">{suffix}</span>
      </span>
    </label>
  )
}
