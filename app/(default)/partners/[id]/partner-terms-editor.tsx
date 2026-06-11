'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { FlashToast } from '@/components/ui/flash-toast'
import { updatePartnerTermsAction } from '../admin-actions'

/**
 * Edit a partner's default rate / term / note. Changes apply to FUTURE
 * accruals + new clinic assignments — already-accrued ledger rows and existing
 * per-clinic overrides are never rewritten (made explicit in the helper text).
 */
export default function PartnerTermsEditor({
  partnerId,
  defaultPercentBps,
  defaultTermMonths,
  termsNote,
}: {
  partnerId: string
  defaultPercentBps: number
  defaultTermMonths: number | null
  termsNote: string | null
}) {
  const [percent, setPercent] = useState(String(defaultPercentBps / 100))
  const [term, setTerm] = useState(defaultTermMonths == null ? '' : String(defaultTermMonths))
  const [note, setNote] = useState(termsNote ?? '')
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    const pct = Number(percent)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('Percentage must be between 0 and 100')
      return
    }
    const months = term.trim() === '' ? null : Number(term)
    if (months != null && (!Number.isInteger(months) || months < 1)) {
      setError('Term must be a whole number of months, or blank for ongoing')
      return
    }
    startTransition(async () => {
      try {
        await updatePartnerTermsAction({
          partnerId,
          defaultPercentBps: Math.round(pct * 100),
          defaultTermMonths: months,
          termsNote: note.trim() || null,
        })
        setToast('Terms updated')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="v2-card p-5">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Default terms</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Applies to future accruals + new clinic assignments. Per-clinic overrides
        and already-accrued commission stay as they are.
      </p>
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="w-28">
            <label className="block text-xs font-medium mb-1" htmlFor="pt-percent">Commission %</label>
            <input id="pt-percent" className="form-input w-full" type="number" min={0} max={100} step="0.5"
              value={percent} onChange={(e) => setPercent(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1" htmlFor="pt-term">Term (months)</label>
            <input id="pt-term" className="form-input w-full" type="number" min={1}
              value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Blank = ongoing" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="pt-note">Terms note</label>
          <textarea id="pt-note" className="form-textarea w-full" rows={3} value={note}
            onChange={(e) => setNote(e.target.value)} placeholder="What the partner agreed to." />
        </div>
        {error && <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded">{error}</div>}
        <div className="flex justify-end">
          <ActionButton variant="primary" size="sm" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save terms'}
          </ActionButton>
        </div>
      </div>
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
