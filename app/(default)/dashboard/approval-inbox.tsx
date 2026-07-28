'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FlashToast } from '@/components/ui/flash-toast'
import { approveProposalAction, declineProposalAction } from './actions'

/**
 * THE APPROVAL INBOX (Transformation Phase 2 — DESIGN.md primitive #2).
 * Each card is a FINISHED piece of work waiting on a yes: the machine wrote
 * the reply / the post / the campaign; staff read it in plain English, tweak
 * the words if they like, and tap the one big Approve button. Approval
 * executes immediately — there is nothing else to operate.
 *
 * Round-1 audit laws baked in:
 *  - The card QUOTES the thing being answered (the review, the inquiry) —
 *    staff never approve a public reply blind.
 *  - Bodies carrying merge tokens ({{firstName}}) read as a RENDERED sample
 *    by default; the raw text only appears in edit mode, with a legend — a
 *    non-technical reader must never mistake the token for a typo.
 *  - Approving answers with a toast naming what just happened (the machine
 *    acts AND reports; a card that silently vanishes is neither).
 */

export interface ProposalCardData {
  id: string
  capability: string
  capabilityLabel: string
  title: string
  body: string
  /** Extra context line ("goes to ~41 patients", "posts to 2 channels"). */
  meta: string | null
  /** The thing being answered, quoted above the draft. */
  context: { kind: string; author: string | null; starRating: number | null; text: string | null } | null
}

const CAPABILITY_ICON: Record<string, string> = {
  review_reply: '⭐',
  social_post: '📣',
  inquiry_response: '💬',
  outreach_campaign: '💌',
}

/** Substitute the campaign merge tokens with a readable sample so the card
 *  shows what a patient will actually receive. Pure; pinned by tests. */
export function renderTokenSample(text: string): string {
  return text
    .replace(/\{\{firstName\}\}/g, 'Maria')
    .replace(/\{\{bookingUrl\}\}/g, '[your booking page link]')
}

const HAS_TOKENS = /\{\{(firstName|bookingUrl)\}\}/

export default function ApprovalInbox({ proposals }: { proposals: ProposalCardData[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const visible = proposals.filter((p) => !gone.has(p.id))
  if (visible.length === 0) {
    return toast ? <FlashToast message={toast} onDone={() => setToast(null)} /> : null
  }

  return (
    <section className="mb-8" aria-label="Waiting on your yes">
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Waiting on your yes
          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
            I finished these — say the word and they go out.
          </span>
        </h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            onDone={(id, message) => {
              setGone((s) => new Set(s).add(id))
              if (message) setToast(message)
            }}
          />
        ))}
      </div>
    </section>
  )
}

function ProposalCard({
  proposal,
  onDone,
}: {
  proposal: ProposalCardData
  onDone: (id: string, message?: string) => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(proposal.body)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const tokens = HAS_TOKENS.test(body)

  const decide = (decision: 'approve' | 'decline') => {
    setError(null)
    startTransition(async () => {
      const r =
        decision === 'approve'
          ? await approveProposalAction({
              proposalId: proposal.id,
              ...(body !== proposal.body ? { body } : {}),
            })
          : await declineProposalAction({ proposalId: proposal.id })
      if (r.ok) {
        onDone(proposal.id, decision === 'approve' ? (r.message ?? 'Done — it went out.') : undefined)
        router.refresh()
      } else {
        setError(r.error)
        // "Already handled" class errors mean the card is dead — clear it.
        if (/already|retired/i.test(r.error)) {
          onDone(proposal.id)
          router.refresh()
        }
      }
    })
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-base bg-[color:var(--color-brand-50,theme(colors.sky.50))] dark:bg-sky-500/10"
          aria-hidden="true"
        >
          {CAPABILITY_ICON[proposal.capability] ?? '✨'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{proposal.title}</p>
          <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">
            {proposal.capabilityLabel}
            {proposal.meta ? ` · ${proposal.meta}` : ''}
          </p>
        </div>
      </div>

      {/* What we're answering — never approve a public reply blind. */}
      {proposal.context?.text && (
        <blockquote className="mt-3 border-l-2 border-gray-300 dark:border-gray-600 pl-3 text-xs text-gray-500 dark:text-gray-400">
          <p className="whitespace-pre-wrap">“{proposal.context.text}”</p>
          <footer className="mt-1 not-italic">
            — {proposal.context.author?.trim() || 'Anonymous'}
            {proposal.context.starRating != null ? `, ${proposal.context.starRating}★` : ''}
          </footer>
        </blockquote>
      )}

      <div className="mt-3 flex-1">
        {editing ? (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.min(10, Math.max(4, body.split('\n').length + 1))}
              className="w-full text-sm rounded-lg border border-[color:var(--color-hairline)] bg-gray-50 dark:bg-gray-900/40 p-3 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-700"
              aria-label="Edit the drafted text"
            />
            {tokens && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Keep the curly pieces as they are — {'{{firstName}}'} becomes each patient’s own name, and{' '}
                {'{{bookingUrl}}'} becomes your booking link.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 border border-transparent">
            {tokens ? renderTokenSample(body) : body}
          </p>
        )}
        {tokens && !editing && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Shown with a sample name — each patient gets their own.
          </p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => decide('approve')}
          disabled={pending}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-[color:var(--color-brand-600,theme(colors.sky.600))] text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'On it…' : 'Approve — send it'}
        </button>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          disabled={pending}
          className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 disabled:opacity-50"
        >
          {editing ? 'Done editing' : 'Edit first'}
        </button>
        <button
          type="button"
          onClick={() => decide('decline')}
          disabled={pending}
          className="ml-auto px-3 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 disabled:opacity-50"
        >
          No thanks
        </button>
      </div>
    </div>
  )
}
