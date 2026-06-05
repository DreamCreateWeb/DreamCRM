'use client'

import { useEffect, useState, useTransition } from 'react'
import { createCampaignAction } from '../actions'

interface Props {
  campaignTypes: { key: string; label: string; description: string }[]
  /** When arriving from the Outreach Queue's "Send recall" CTA, the audience to
   *  pre-target the new campaign with. */
  prefillAudienceId?: number
}

export default function NewCampaignButton({ campaignTypes, prefillAudienceId }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState(campaignTypes[0]?.key ?? '')
  const [pending, startTransition] = useTransition()

  // Arriving from the outreach queue → open ready to go.
  useEffect(() => {
    if (prefillAudienceId) setOpen(true)
  }, [prefillAudienceId])

  function create() {
    startTransition(async () => {
      await createCampaignAction({
        name: name.trim() || campaignTypes.find((c) => c.key === type)?.label || 'Untitled campaign',
        sendChannel: 'resend',
        ...(prefillAudienceId ? { audienceId: prefillAudienceId } : {}),
      })
      // server action redirects to the editor
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900"
      >
        + New campaign
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-stone-900/40 dark:bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100 mb-3">
              New campaign
            </h2>
            {prefillAudienceId && (
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-3 -mt-1">
                This campaign will target the recall audience you selected — name it and pick a starting point.
              </p>
            )}
            <label className="block mb-3">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
                Name (internal)
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. May product launch"
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
              />
            </label>
            <label className="block mb-4">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 block mb-1">
                Type
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
              >
                {campaignTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} — {t.description}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-sm font-medium px-3 py-1.5 rounded-lg text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={pending}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
              >
                {pending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
