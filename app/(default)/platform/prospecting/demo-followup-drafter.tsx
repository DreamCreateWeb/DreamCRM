'use client'

import { useState, useTransition } from 'react'
import { ActionButton } from '@/components/ui/action-button'
import { draftDemoFollowupAction, logCallOutcomeAction } from './admin-actions'
import type { DemoOutcome, DemoLostReason } from '@/lib/services/demo-followup'

/**
 * AI post-demo follow-up drafter + debrief — one button in the deal room that
 * writes a personalized follow-up email from the prospect's real context AND
 * reads the owner's "how it went" note for the likely outcome. Both are
 * suggestions the owner controls: he edits + copies the email into his OWN
 * inbox (never auto-sent), and confirms the outcome with one click (never
 * auto-logged) — which feeds the win/loss learning loop.
 */

const ERROR_COPY: Record<string, string> = {
  ai_unavailable: 'AI drafting is not configured right now.',
  not_found: "Couldn't load this prospect.",
  failed: "The draft didn't come through — give it another try.",
}

const LOST_REASON_LABEL: Record<DemoLostReason, string> = {
  price: 'price',
  using_competitor: 'already has a vendor',
  no_need: "doesn't see the need",
  bad_timing: 'bad timing',
  not_decision_maker: 'not the decision-maker',
  other: 'other',
}

export default function DemoFollowupDrafter({ prospectId }: { prospectId: string }) {
  const [pending, startTransition] = useTransition()
  const [logging, startLogging] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<DemoOutcome>('undecided')
  const [lostReason, setLostReason] = useState<DemoLostReason | null>(null)
  const [logged, setLogged] = useState<null | 'won' | 'lost'>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const run = () => {
    setError(null)
    setCopied(false)
    setLogged(null)
    startTransition(async () => {
      const res = await draftDemoFollowupAction(prospectId, note.trim() || undefined)
      if (res.ok) {
        setDraft(res.draft)
        setOutcome(res.outcome)
        setLostReason(res.lostReason)
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

  const logOutcome = () => {
    startLogging(async () => {
      try {
        await logCallOutcomeAction({
          prospectId,
          outcome: outcome === 'won' ? 'won' : 'not_interested',
          lostReason: outcome === 'lost' ? lostReason ?? 'other' : undefined,
          note: note.trim() || undefined,
        })
        setLogged(outcome === 'won' ? 'won' : 'lost')
      } catch {
        setError("Couldn't log the outcome — use the action strip below.")
      }
    })
  }

  return (
    <div className="mt-4 rounded-[var(--r-md)] border border-teal-500/20 bg-teal-500/5 p-4">
      {!open ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">✨ Draft a follow-up</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              AI writes a post-demo email from their gaps + how it went, and reads the outcome. You send + confirm.
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
              How did the demo go?{' '}
              <span className="text-gray-400">(optional — steers the draft + reads the outcome)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. loved the website, signing up next week — or: passed, happy with their vendor"
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
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Edit anything, then copy it into your own inbox. We never auto-send.
              </p>
            </>
          )}

          {/* Outcome suggestion read from the note — one-click confirm, never auto-logged. */}
          {draft && logged === null && outcome !== 'undecided' && (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2 text-xs ${
                outcome === 'won'
                  ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                  : 'bg-gray-500/10 text-gray-700 dark:text-gray-300'
              }`}
            >
              <span>
                {outcome === 'won' ? (
                  <>
                    Sounds like a <span className="font-semibold">win</span> 🎉 — log it to convert them?
                  </>
                ) : (
                  <>
                    Sounds like a <span className="font-semibold">pass</span>
                    {lostReason ? ` (${LOST_REASON_LABEL[lostReason]})` : ''} — log it so the learning loop hears it?
                  </>
                )}
              </span>
              <ActionButton size="sm" variant="secondary" disabled={logging} onClick={logOutcome}>
                {logging ? 'Logging…' : outcome === 'won' ? 'Mark won' : 'Log the pass'}
              </ActionButton>
            </div>
          )}

          {logged && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {logged === 'won'
                ? '✓ Logged as won — open the action strip below to convert them into a clinic.'
                : '✓ Logged — the reason feeds your win/loss learning loop.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
