'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { draftDemoFollowupAction } from './admin-actions'

/**
 * AI post-demo follow-up drafter — a button in the deal room that writes a
 * personalized follow-up email from the prospect's real context (their gaps,
 * the objections the brief anticipated, and an optional one-line note on how
 * the demo actually went). The owner reviews, copies, and sends it from his
 * OWN inbox — we never auto-send.
 */

const ERROR_COPY: Record<string, string> = {
  ai_unavailable: 'AI drafting is not configured right now.',
  not_found: "Couldn't load this prospect.",
  failed: "The draft didn't come through — give it another try.",
}

export default function DemoFollowupDrafter({ prospectId }: { prospectId: string }) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const run = () => {
    setError(null)
    setCopied(false)
    startTransition(async () => {
      const res = await draftDemoFollowupAction(prospectId, note.trim() || undefined)
      if (res.ok) {
        setDraft(res.draft)
      } else {
        setError(ERROR_COPY[res.error] ?? ERROR_COPY.failed)
      }
    })
  }

  const copy = async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed — select the text and copy manually.')
    }
  }

  return (
    <div className="mt-4 rounded-[var(--r-md)] border border-teal-500/20 bg-teal-500/5 p-4">
      {!open ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">✨ Draft a follow-up</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              AI writes a post-demo email from their gaps + how it went. You send it.
            </p>
          </div>
          <ActionButton size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Write it
          </ActionButton>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              How did the demo go? <span className="text-gray-400">(optional — steers the draft)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. loved the website, worried about switching from their current vendor"
              className="form-input mt-1 w-full text-sm"
              maxLength={500}
            />
          </div>

          <div className="flex items-center gap-2">
            <ActionButton size="sm" variant="primary" disabled={pending} onClick={run}>
              {pending ? 'Writing…' : draft ? 'Rewrite' : 'Draft it'}
            </ActionButton>
            {draft && (
              <ActionButton size="sm" variant="secondary" onClick={copy}>
                {copied ? '✓ Copied' : 'Copy'}
              </ActionButton>
            )}
          </div>

          {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          {draft && (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={9}
                className="form-textarea w-full text-sm leading-relaxed"
                spellCheck
              />
              <p className="text-[0.7rem] text-gray-400 dark:text-gray-500">
                Edit anything, then copy it into your own inbox. We never auto-send.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
