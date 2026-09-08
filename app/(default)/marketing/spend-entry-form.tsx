'use client'

import { useActionState } from 'react'
import { MARKETING_CHANNEL_LABELS } from '@/lib/marketing-attribution'
import { SPENDABLE_CHANNELS, monthKeyOf } from '@/lib/marketing-dials'
import { recordSpendAction, type SpendFormResult } from './admin-actions'

/**
 * The one input the dials need: what was actually spent. One row per
 * month × channel; saving the same pair again replaces the number (the
 * owner's latest figure is the figure).
 */

type FormState = SpendFormResult | null

async function submit(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    return await recordSpendAction(formData)
  } catch {
    return { ok: false, error: 'Couldn’t save that — try again.' }
  }
}

export default function SpendEntryForm() {
  const [state, action, pending] = useActionState(submit, null)
  const currentMonth = monthKeyOf(new Date())

  return (
    <form action={action} className="rounded-lg border border-[color:var(--color-hairline)] px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Record spend
      </h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="sr-only">Month</span>
          <input
            type="month"
            name="month"
            defaultValue={currentMonth}
            max={currentMonth}
            required
            className="form-input text-sm py-1.5"
          />
        </label>
        <label className="block">
          <span className="sr-only">Channel</span>
          <select name="channel" defaultValue="google_ads" className="form-select text-sm py-1.5">
            {SPENDABLE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {MARKETING_CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Amount in dollars</span>
          <input
            type="text"
            name="amount"
            inputMode="decimal"
            placeholder="$ spent that month"
            required
            className="form-input text-sm py-1.5 w-36"
          />
        </label>
        <label className="block flex-1 min-w-40">
          <span className="sr-only">Note</span>
          <input
            type="text"
            name="note"
            placeholder="Note (optional)"
            className="form-input text-sm py-1.5 w-full"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="btn bg-teal-500 hover:bg-teal-600 text-white text-sm py-1.5 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {state && !state.ok && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{state.error}</p>
      )}
      {state?.ok && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          Saved — the dials recompute from it immediately.
        </p>
      )}
    </form>
  )
}
