'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FlashToast } from '@/components/ui/flash-toast'
import { isGrantable } from '@/lib/autonomy'
import { approveProposalAction, declineProposalAction, setAutonomyAction } from './actions'

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
  /** The patient-facing email subject (email-sending capabilities only) —
   *  part of the artifact, shown and editable like the body (round-2 gap:
   *  a card that hides the subject shows two-thirds of the work). */
  subject: string | null
  /** Extra context line ("goes to ~41 patients", "posts to 2 channels"). */
  meta: string | null
  /** The thing being answered, quoted above the draft. preferredDate rides
   *  along for inquiries (round-3 audit: a date-only inquiry otherwise
   *  rendered NO context, and staff approved a reply that might contradict
   *  a requested date they never saw). */
  context: {
    kind: string
    author: string | null
    starRating: number | null
    text: string | null
    preferredDate?: string | null
  } | null
  /** EARNED TRUST (Phase 3): how many recent approvals of this capability
   *  in a row went out exactly as written. At 3+ the card gently suggests
   *  the grant — a suggestion only; the box is never pre-ticked. */
  uneditedRun?: number
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

/** A capability the clinic switched to automatic — the take-it-back strip
 *  reads these (Phase 3: trust is reversible ALWAYS, and the way back must
 *  live somewhere that still renders when autonomy empties the inbox). */
export interface TrustGrantChip {
  capability: string
  label: string
}

export default function ApprovalInbox({
  proposals,
  totalOpen,
  grants = [],
}: {
  proposals: ProposalCardData[]
  /** The true open count (the sidebar badge's number) — shown when the list
   *  is truncated so the badge and the inbox never silently disagree. */
  totalOpen?: number
  /** Capabilities currently at 'auto' for this clinic. */
  grants?: TrustGrantChip[]
}) {
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const visible = proposals.filter((p) => !gone.has(p.id))
  if (visible.length === 0) {
    // The strip stays even with no cards — a granted capability produces
    // no cards, and the way back to asking must never disappear with them.
    return (
      <>
        {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
        {grants.length > 0 && <GrantsStrip grants={grants} onToast={setToast} />}
      </>
    )
  }
  const hiddenCount = Math.max(0, (totalOpen ?? proposals.length) - proposals.length)
  // A granted capability's cards still sit here until the next hourly pass
  // executes them. The header promises "say the word and they go out" — for
  // these that is FALSE (they go out either way), so each one says so.
  const grantedSet = new Set(grants.map((g) => g.capability))

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
        {hiddenCount > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Showing {visible.length} of {totalOpen} — the rest queue up as you decide these.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visible.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            alreadyGranted={grantedSet.has(p.capability)}
            onDone={(id, message) => {
              setGone((s) => new Set(s).add(id))
              if (message) setToast(message)
            }}
          />
        ))}
      </div>
      {grants.length > 0 && <GrantsStrip grants={grants} onToast={setToast} />}
    </section>
  )
}

/**
 * "On my own" — the ladder's take-it-back strip (Phase 3). Lists what the
 * clinic has handed over, each with one tap back to asking. Lives on the
 * Overview because trust must be REVERSIBLE ALWAYS from a surface that
 * still renders when autonomy has emptied the inbox — a settings page is
 * never the way in, and a vanished inbox must never strand a grant.
 */
function GrantsStrip({
  grants,
  onToast,
}: {
  grants: TrustGrantChip[]
  onToast: (message: string) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [gone, setGone] = useState<Set<string>>(new Set())
  const shown = grants.filter((g) => !gone.has(g.capability))
  if (shown.length === 0) return null

  return (
    <div className="mt-3 mb-8 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>I handle these on my own now and report each one in the diary:</span>
      {shown.map((g) => (
        <span
          key={g.capability}
          className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700/60 px-2.5 py-1 text-gray-700 dark:text-gray-200"
        >
          {g.label}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await setAutonomyAction({ capability: g.capability, level: 'ask' })
                if (r.ok) {
                  setGone((s) => new Set(s).add(g.capability))
                  onToast(r.message)
                  router.refresh()
                } else {
                  onToast(r.error)
                }
              })
            }
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline decoration-dotted underline-offset-2 disabled:opacity-50"
            aria-label={`Go back to asking before ${g.label}`}
          >
            back to asking
          </button>
        </span>
      ))}
    </div>
  )
}

function ProposalCard({
  proposal,
  alreadyGranted = false,
  onDone,
}: {
  proposal: ProposalCardData
  /** This capability is already on automatic — the card is a courtesy
   *  preview, not a gate; it goes out on the next pass regardless. */
  alreadyGranted?: boolean
  onDone: (id: string, message?: string) => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(proposal.body)
  const [subject, setSubject] = useState(proposal.subject ?? '')
  // Declining is permanent (the machine never re-asks about this work), so
  // the first tap ARMS the button and the second confirms — a rushed
  // mis-tap must not silently destroy drafted work (round-2 audit).
  const [declineArmed, setDeclineArmed] = useState(false)
  // "Always do this for me" (Phase 3): NEVER pre-checked — nothing grants
  // itself autonomy; the human ticks it, and the grant only lands after
  // THIS approve succeeds (a failed send must not hand over the keys).
  const [alwaysDo, setAlwaysDo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const tokens = HAS_TOKENS.test(body)
  // The send APPENDS a booking button for these capabilities when the body
  // doesn't place the link itself — say so on the card, because "what the
  // card shows is what sends" must be literally true (verification round:
  // staff could rewrite the invitation and still ship a button unseen).
  const appendsBookingButton =
    (proposal.capability === 'outreach_campaign' || proposal.capability === 'inquiry_response') &&
    !body.includes('{{bookingUrl}}')

  const decide = (decision: 'approve' | 'decline') => {
    setError(null)
    // A blanked subject must never silently fall back to the original —
    // what the card shows is what sends (round-3 audit; the server's own
    // empty-subject guard is only reachable when we transmit the field).
    if (decision === 'approve' && proposal.subject != null && !subject.trim()) {
      setError('The subject can’t be empty — give it a few words first.')
      return
    }
    startTransition(async () => {
      const r =
        decision === 'approve'
          ? await approveProposalAction({
              proposalId: proposal.id,
              ...(body !== proposal.body ? { body } : {}),
              ...(proposal.subject != null && subject.trim() && subject !== proposal.subject
                ? { subject }
                : {}),
            })
          : await declineProposalAction({ proposalId: proposal.id })
      if (r.ok) {
        let message = r.message ?? (decision === 'approve' ? 'Done — it went out.' : undefined)
        if (decision === 'approve' && alwaysDo && isGrantable(proposal.capability)) {
          const grant = await setAutonomyAction({ capability: proposal.capability, level: 'auto' })
          if (grant.ok) message = `${message ?? ''} ${grant.message}`.trim()
          // A failed grant never blocks the approve's own good news — the
          // checkbox simply didn't take; the card flow stays honest.
        }
        onDone(proposal.id, message)
        router.refresh()
      } else {
        setError(r.error)
        // The server says the card is DEAD (retired / already decided) —
        // clear it on the STRUCTURED flag, never by matching the copy
        // (verification round: three retire messages missed the old
        // /already|retired/ regex and left a dead card with a live
        // Approve button).
        if (r.expired) {
          onDone(proposal.id, r.error)
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

      {/* What we're answering — never approve a public reply blind. A
          date-only inquiry (no message) still shows its one statement: the
          date they asked about (round-3 audit). */}
      {proposal.context && (proposal.context.text || proposal.context.preferredDate) && (
        <blockquote className="mt-3 border-l-2 border-gray-300 dark:border-gray-600 pl-3 text-xs text-gray-500 dark:text-gray-400">
          {proposal.context.text && <p className="whitespace-pre-wrap">“{proposal.context.text}”</p>}
          {proposal.context.preferredDate && (
            <p className={proposal.context.text ? 'mt-1' : ''}>
              Asked about: <span className="font-medium">{proposal.context.preferredDate}</span>
            </p>
          )}
          <footer className="mt-1 not-italic">
            — {proposal.context.author?.trim() || 'Anonymous'}
            {proposal.context.starRating != null ? `, ${proposal.context.starRating}★` : ''}
          </footer>
        </blockquote>
      )}

      {/* The email subject — the first line the patient reads is part of
          the artifact, never hidden from the approver (round-2 gap). */}
      {proposal.subject != null && (
        <div className="mt-3">
          {editing ? (
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="w-full text-sm rounded-lg border border-[color:var(--color-hairline)] bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-700"
              aria-label="Edit the email subject"
            />
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-200">
              <span className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-2">Subject</span>
              <span className="font-medium">{subject}</span>
            </p>
          )}
        </div>
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
                {/* Explain only the tokens actually IN the draft — a legend
                    describing a {{bookingUrl}} the body doesn't contain
                    reads as a promise about invisible content. */}
                Keep the curly pieces as they are — {'{{firstName}}'} becomes each patient’s own name
                {body.includes('{{bookingUrl}}') ? (
                  <>, and {'{{bookingUrl}}'} becomes your booking link.</>
                ) : (
                  '.'
                )}
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
        {appendsBookingButton && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {/* The sign-off half mirrors the executor's own heuristic: a
                draft whose last line is an em-dash signature sends as
                written — the appended sign-off (and this claim) only apply
                when the draft is unsigned. */}
            {proposal.capability === 'inquiry_response' &&
            !(body.trim().split('\n').filter((l) => l.trim()).pop() ?? '').trim().match(/^[—-]/)
              ? 'Your booking button and your clinic’s sign-off go at the bottom.'
              : 'Your booking button goes at the bottom.'}
          </p>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}

      {alreadyGranted && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          You’ve handed these to me — this one goes out on its own within the hour. Approve now if
          you’d like it to go this minute, or take the job back below.
        </p>
      )}
      {!alreadyGranted && isGrantable(proposal.capability) && (proposal.uneditedRun ?? 0) >= 3 && (
        <p className="mt-3 text-xs text-sky-700 dark:text-sky-300">
          You’ve said yes to the last {proposal.uneditedRun} of these without changing a word — tick
          the box below and I’ll take them over.
        </p>
      )}
      {!alreadyGranted && isGrantable(proposal.capability) && (
        <label className="mt-3 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={alwaysDo}
            onChange={(e) => setAlwaysDo(e.target.checked)}
            disabled={pending}
            className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
          />
          <span>
            From now on, handle these for me on your own — I’ll see each one in the diary, and I can
            take it back any time.
          </span>
        </label>
      )}

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
          onClick={() => {
            if (declineArmed) decide('decline')
            else setDeclineArmed(true)
          }}
          onBlur={() => setDeclineArmed(false)}
          disabled={pending}
          className={[
            'ml-auto px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50',
            declineArmed
              ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60',
          ].join(' ')}
        >
          {declineArmed ? 'Sure? I won’t ask again' : 'No thanks'}
        </button>
      </div>
    </div>
  )
}
