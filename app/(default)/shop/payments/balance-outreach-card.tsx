'use client'

import { useState, useTransition } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import type { BalanceOutreachSettings } from '@/lib/types/balance-outreach'
import { saveBalanceOutreachAction } from './actions'

/**
 * "Automatic balance reminders" — the opt-in dunning cadence. Off by default;
 * plain-language controls (threshold, cadence, cap) with the guardrails
 * spelled out so the office knows exactly what patients will get.
 */
export default function BalanceOutreachCard({
  initial,
  canManage,
  paymentsReady,
}: {
  initial: BalanceOutreachSettings
  canManage: boolean
  paymentsReady: boolean
}) {
  const [s, setS] = useState<BalanceOutreachSettings>(initial)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const dirty = JSON.stringify(s) !== JSON.stringify(initial)

  function save() {
    setSaved(false)
    start(async () => {
      const r = await saveBalanceOutreachAction(s)
      if (r.ok) {
        setSaved(true)
        setToast(s.enabled ? 'Automatic balance reminders are on.' : 'Saved.')
      } else setToast(r.error)
    })
  }

  return (
    <div className="v2-card p-5 mt-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Automatic balance reminders</h2>
          <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            Email patients who owe a balance a friendly note with a secure pay link — the same
            email as the “Email a pay link” button, on a schedule. Off by default; you decide the
            threshold and pace. The wording is editable under Settings → Automations → Emails.
          </p>
        </div>
        <Toggle
          checked={s.enabled}
          onChange={(v) => { setS({ ...s, enabled: v }); setSaved(false) }}
          disabled={!canManage}
          srLabel="Send automatic balance reminders"
        />
      </div>

      {s.enabled && !paymentsReady && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--r-sm)] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <StatusPill tone="warn" label="Stripe needed" />
          <span>
            Reminders only send while your connected Stripe account can take payments — connect it
            under <a href="/shop" className="font-medium underline">Shop</a> first, or the emails will
            quietly skip.
          </span>
        </div>
      )}

      <div className={`mt-4 grid gap-4 sm:grid-cols-3 ${s.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        <label className="block">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Only when they owe at least</span>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">$</span>
            <input
              type="number"
              min={1}
              max={10000}
              step={1}
              value={Math.round(s.minBalanceCents / 100)}
              onChange={(e) => { setS({ ...s, minBalanceCents: Math.min(10_000, Math.max(1, Math.round(Number(e.target.value) || 25))) * 100 }); setSaved(false) }}
              disabled={!canManage}
              className="form-input w-24 text-sm font-mono-num tabular-nums"
              aria-label="Minimum balance in dollars before a reminder sends"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Wait between reminders</span>
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              min={7}
              max={60}
              step={1}
              value={s.cadenceDays}
              onChange={(e) => { setS({ ...s, cadenceDays: Math.min(60, Math.max(7, Math.round(Number(e.target.value) || 14))) }); setSaved(false) }}
              disabled={!canManage}
              className="form-input w-20 text-sm font-mono-num tabular-nums"
              aria-label="Days between reminders"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">days</span>
          </div>
        </label>
        <label className="block">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Stop after</span>
          <div className="mt-1 flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={6}
              step={1}
              value={s.maxSends}
              onChange={(e) => { setS({ ...s, maxSends: Math.min(6, Math.max(1, Math.round(Number(e.target.value) || 3))) }); setSaved(false) }}
              disabled={!canManage}
              className="form-input w-16 text-sm font-mono-num tabular-nums"
              aria-label="Maximum reminders per patient in 90 days"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">emails / 90 days</span>
          </div>
        </label>
      </div>
      <p className={`mt-2 text-[11px] leading-relaxed text-gray-400 ${s.enabled ? '' : 'opacity-50'}`}>
        After the cap, collections becomes a phone call — the front-desk follow-up list still
        tracks the balance. A pay link you send by hand pauses the schedule too, so patients
        never get two in a row.
      </p>

      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <ActionButton variant="primary" size="sm" onClick={save} disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save'}
          </ActionButton>
          {dirty && !pending && <StatusPill tone="warn" label="Unsaved changes" />}
          {!dirty && saved && !pending && (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Saved ✓</span>
          )}
        </div>
      )}
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
