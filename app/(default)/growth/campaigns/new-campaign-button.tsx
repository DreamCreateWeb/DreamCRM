'use client'

import { useEffect, useState, useTransition } from 'react'
import { createCampaignAction } from '../../marketing/actions'
import { ActionButton } from '@/components/ui/action-button'

/** Slim template shape for the picker (server passes system + this org's
 *  custom templates; empty for the platform tenant → blank-only modal). */
export interface TemplateOption {
  id: number
  name: string
  description: string | null
  subject: string
  kind: 'system' | 'custom'
}

interface Props {
  templates: TemplateOption[]
  /** This tenant's saved audiences for the "To" picker (optional choice —
   *  the editor sidebar can still set it). */
  audiences?: { id: number; name: string }[]
  /** When arriving from the Outreach Queue's "Send recall" CTA, the audience to
   *  pre-target the new campaign with. */
  prefillAudienceId?: number
  /** …and the template to pre-select (same CTA) — the campaign starts
   *  pre-written, not blank. */
  prefillTemplateId?: number
  /** Open the modal on mount (quick-create's ?new=1 landing). */
  autoOpen?: boolean
}

/**
 * "+ New campaign" — name + a "Start from" picker (campaigns phase 1,
 * 2026-07-21). The old Type <select> was decorative (never stored, drove
 * nothing); starting points are REAL: picking one seeds the subject,
 * preview text, and body from the template and stamps templateId for
 * provenance + won-back attribution bucketing. Blank stays first-class.
 */
export default function NewCampaignButton({
  templates,
  audiences = [],
  prefillAudienceId,
  prefillTemplateId,
  autoOpen = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState<number | null>(
    prefillTemplateId && templates.some((t) => t.id === prefillTemplateId) ? prefillTemplateId : null,
  )
  const [audienceId, setAudienceId] = useState<number | ''>(
    prefillAudienceId && audiences.some((a) => a.id === prefillAudienceId) ? prefillAudienceId : '',
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Arriving from the outreach queue or quick-create → open ready to go.
  useEffect(() => {
    if (prefillAudienceId || prefillTemplateId || autoOpen) setOpen(true)
  }, [prefillAudienceId, prefillTemplateId, autoOpen])

  const picked = templates.find((t) => t.id === templateId) ?? null

  function create() {
    setError(null)
    startTransition(async () => {
      try {
        const chosenAudience = audienceId || prefillAudienceId
        await createCampaignAction({
          name: name.trim() || picked?.name || 'Untitled campaign',
          sendChannel: 'resend',
          ...(templateId ? { templateId } : {}),
          ...(chosenAudience ? { audienceId: chosenAudience } : {}),
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
            className="section-enter bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
              New campaign
            </h2>
            {prefillAudienceId && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 -mt-1">
                This campaign goes to the group you picked — choose a starting point and go.
              </p>
            )}

            {templates.length > 0 && (
              <fieldset className="mb-4">
                <legend className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                  Start from
                </legend>
                <div className="space-y-1.5">
                  <StartOption
                    checked={templateId === null}
                    onPick={() => setTemplateId(null)}
                    title="Blank"
                    sub="Start from an empty email and write it yourself (or let AI draft it in the editor)."
                  />
                  {templates.map((t) => (
                    <StartOption
                      key={t.id}
                      checked={templateId === t.id}
                      onPick={() => setTemplateId(t.id)}
                      title={t.name}
                      sub={t.description ?? t.subject}
                      badge={t.kind === 'custom' ? 'Yours' : undefined}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  A starting point pre-writes the subject and body — everything stays editable before anything sends.
                </p>
              </fieldset>
            )}

            {audiences.length > 0 && (
              <label className="block mb-4">
                <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
                  To
                </span>
                <select
                  value={audienceId}
                  onChange={(e) => setAudienceId(e.target.value ? Number(e.target.value) : '')}
                  className="form-select w-full"
                >
                  <option value="">Choose later in the editor</option>
                  {audiences.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block mb-4">
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 block mb-1">
                Name (internal)
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={picked ? picked.name : 'e.g. Holiday hours announcement'}
                className="form-input w-full"
              />
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

function StartOption({
  checked,
  onPick,
  title,
  sub,
  badge,
}: {
  checked: boolean
  onPick: () => void
  title: string
  sub: string
  badge?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onPick}
      className={`flex w-full items-start gap-2.5 rounded-[var(--r-md)] px-3 py-2 text-left transition ring-1 ring-inset ${
        checked
          ? 'ring-teal-500/60 bg-teal-500/[0.06]'
          : 'ring-[color:var(--color-hairline)] hover:ring-[color:var(--color-hairline-strong)] hover:bg-[color:var(--color-surface-sunk)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${
          checked ? 'bg-teal-500 ring-teal-500 text-white' : 'ring-[color:var(--color-hairline-strong)]'
        }`}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="block text-[13px] font-semibold text-gray-800 dark:text-gray-100">{title}</span>
          {badge && (
            <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-xs font-bold text-violet-700 dark:text-violet-300">
              {badge}
            </span>
          )}
        </span>
        <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug">{sub}</span>
      </span>
    </button>
  )
}
