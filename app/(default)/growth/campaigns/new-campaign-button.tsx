'use client'

import { useEffect, useState, useTransition } from 'react'
import { createCampaignAction } from '../../marketing/actions'
import { ActionButton } from '@/components/ui/action-button'

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
  const [error, setError] = useState<string | null>(null)

  // Arriving from the outreach queue → open ready to go.
  useEffect(() => {
    if (prefillAudienceId) setOpen(true)
  }, [prefillAudienceId])

  function create() {
    setError(null)
    startTransition(async () => {
      try {
        await createCampaignAction({
          name: name.trim() || campaignTypes.find((c) => c.key === type)?.label || 'Untitled campaign',
          sendChannel: 'resend',
          ...(prefillAudienceId ? { audienceId: prefillAudienceId } : {}),
        })
        // server action redirects to the editor on success
      } catch (err) {
        // createCampaignAction redirect()s on success, which throws a Next
        // control-flow signal (digest starts with NEXT_REDIRECT) — re-throw
        // so navigation proceeds; only show real failures.
        const digest = (err as { digest?: string } | null)?.digest
        if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Could not create the campaign. Try again.')
      }
    })
  }

  return (
    <>
      <ActionButton variant="primary" breath onClick={() => setOpen(true)}>
        + New campaign
      </ActionButton>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-[color:var(--color-ink-900)]/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
              New campaign
            </h2>
            {prefillAudienceId && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 -mt-1">
                This campaign goes to the recall group you picked — give it a name and choose a starting point.
              </p>
            )}
            <label className="block mb-3">
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
                Name (internal)
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. May product launch"
                className="form-input w-full"
              />
            </label>
            <label className="block mb-4">
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
                Type
              </span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="form-select w-full"
              >
                {campaignTypes.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} — {t.description}
                  </option>
                ))}
              </select>
            </label>
            {error && <p className="text-xs text-rose-600 dark:text-rose-400 mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <ActionButton variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </ActionButton>
              <ActionButton variant="primary" size="sm" onClick={create} disabled={pending}>
                {pending ? 'Creating…' : 'Create'}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
