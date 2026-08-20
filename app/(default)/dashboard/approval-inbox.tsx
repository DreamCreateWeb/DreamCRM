'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FlashToast } from '@/components/ui/flash-toast'
import { ActionButton } from '@/components/ui/action-button'
import { isGrantable, BOOKING_BUTTON_CAPABILITIES, SETUP_CAPABILITIES } from '@/lib/autonomy'
import { TONE_DOT, type Tone } from '@/lib/ui/encodings'
import { SMS_ENTITY_TYPES } from '@/lib/sms-registration'
import { approveProposalAction, declineProposalAction, setAutonomyAction } from './actions'
import { uploadFileWithProgress, UploadCancelledError } from '@/lib/upload-with-progress'
import {
  SocialArtifact,
  EmailArtifact,
  ReviewReplyArtifact,
  PlanArtifact,
  GbpFixArtifact,
  type ProposalArtifact,
} from './proposal-artifacts'

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
  /** THE HAND-BACK (round-1 Phase-3 audit): the machine tried this one on
   *  its own, failed twice, and stopped. The card must say so instead of
   *  promising it goes out within the hour. */
  handedBack?: boolean
  /** This card is the machine's to send, but its capability puts mail in a
   *  patient's inbox and it is currently outside the clinic's daylight send
   *  window — so "within the hour" would be false (round-2 audit). */
  waitsForMorning?: boolean
  /** The capability is on automatic, and this card is one the machine will
   *  act on. Kept separate from `capabilityGranted` so a handed-back or
   *  pre-grant card can say the truth without re-offering the hand-over. */
  machineHandles?: boolean
  /** The capability is on automatic AT ALL — the gate for the "always do
   *  this for me" checkbox, which must never re-ask for a trust the clinic
   *  already gave (round-2 audit). */
  capabilityGranted?: boolean
  /** The artifact this card renders instead of a text dump (owner design
   *  directive 2026-08-13: staff LOOK at the work as it will exist — a post
   *  in its platform's chrome, an email as an email, a reply under its
   *  review). Null → the plain-paragraph fallback. */
  artifact?: ProposalArtifact | null
  /** When this card retires itself — drives the queue rail's urgency dot. */
  expiresAt?: Date | null
}

const CAPABILITY_ICON: Record<string, string> = {
  review_reply: '⭐',
  social_post: '📣',
  inquiry_response: '💬',
  outreach_campaign: '💌',
  gbp_website_fix: '📍',
  setup_hours: '🕒',
  setup_chairs: '🪑',
  setup_booking_mode: '📅',
  setup_texting: '💬',
  content_plan: '🗂️',
  schedule_gap: '🌤️',
}

/** Substitute the campaign merge tokens with a readable sample so the card
 *  shows what a patient will actually receive. Pure; pinned by tests. */
export function renderTokenSample(text: string): string {
  return text
    .replace(/\{\{firstName\}\}/g, 'Maria')
    .replace(/\{\{bookingUrl\}\}/g, '[your booking page link]')
}

const HAS_TOKENS = /\{\{(firstName|bookingUrl)\}\}/

/** The queue rail's urgency dot: a card about to retire itself deserves a
 *  quiet tone mark (never the brand hue — tones carry meaning). Pure;
 *  exported for tests. */
export function expiryTone(expiresAt: Date | null | undefined, now: Date = new Date()): Tone | null {
  if (!expiresAt) return null
  const ms = expiresAt.getTime() - now.getTime()
  if (ms <= 24 * 60 * 60 * 1000) return 'urgent'
  if (ms <= 72 * 60 * 60 * 1000) return 'warn'
  return null
}

/** How many of a capability's autonomous entries the strip names before it
 *  clamps and says how many it is holding back. Generous on purpose: the
 *  consent line promises each one, and real weekly volumes are small. */
const WORK_LINES_PER_CAPABILITY = 8

/** A capability the clinic switched to automatic — the take-it-back strip
 *  reads these (Phase 3: trust is reversible ALWAYS, and the way back must
 *  live somewhere that still renders when autonomy empties the inbox). */
export interface TrustGrantChip {
  capability: string
  label: string
  /** When the clinic handed this over. The tell reads a 7-DAY window, so a
   *  grant older than that must not be told "nothing yet" — that is a claim
   *  about all of history from a week's worth of data (round-3 audit). */
  grantedAt?: Date | null
}

/** One capability's worth of work the machine did alone this past week —
 *  the "here's what I handled on my own" half of the strip (Phase 3's
 *  do-and-TELL). */
export interface AutonomousWorkChip {
  capability: string
  label: string
  count: number
  latestSummary: string
  /** Every entry, newest first. The consent line promises "I'll list each
   *  one" — a count and one example is not a list (verification round 1). */
  summaries?: string[]
}

export default function ApprovalInbox({
  proposals,
  totalOpen,
  grants = [],
  autonomousWork = [],
  isDemo = false,
  clinicName = 'Your clinic',
}: {
  proposals: ProposalCardData[]
  /** How many open cards EXIST for this clinic — the same population this
   *  list is drawn from (granted capabilities included), so the truncation
   *  notice compares like with like. Deliberately NOT the sidebar badge's
   *  number, which counts only what waits on a human (round-1 Phase-3
   *  audit: subtracting one population from the other hid the notice on
   *  exactly the clinics that had handed something over). */
  totalOpen?: number
  /** Capabilities currently at 'auto' for this clinic. */
  grants?: TrustGrantChip[]
  /** What those grants actually produced in the last 7 days. */
  autonomousWork?: AutonomousWorkChip[]
  /** The demo clinic never really sends — the grant strip says so rather
   *  than promising work that the demo's own cron exclusion prevents. */
  isDemo?: boolean
  /** Names the sender/author inside the artifact previews. */
  clinicName?: string
}) {
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  // ── THE SIGN-HERE STACK (owner-chosen shape, 2026-08-14) ────────────────
  // One card front-and-center at a time — the soonest-to-expire first, the
  // order the list already arrives in — with a queue rail of chips and a
  // "See all" escape back to the grid. The employee hands you one paper at
  // a time to sign.
  //
  // THE LOAD-BEARING RENDER DECISION: every undecided card stays MOUNTED
  // (CSS-hidden, never unmounted — the settings-tabs law). Per-card state
  // (an in-progress edit, an uploaded photo, an armed decline) survives
  // skipping away and back; the whole-DOM tests assert this on purpose.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [viewAll, setViewAll] = useState(false)
  const [entered, setEntered] = useState(true)
  // sessionStorage read happens in an EFFECT, never a lazy initializer —
  // the server renders stack-mode, and a mismatched first client render
  // would be a hydration error (morning-reveal's own rule).
  useEffect(() => {
    try {
      if (sessionStorage.getItem('approval-inbox-see-all') === '1') setViewAll(true)
    } catch {
      /* private mode — default stack */
    }
  }, [])
  const visible = proposals.filter((p) => !gone.has(p.id))
  // Stale focus (decided card, or a server refresh removed it) falls to the
  // head of the queue — the soonest-to-expire card.
  const focused = visible.find((p) => p.id === focusId) ?? visible[0] ?? null
  // The advance transition: two-phase rAF, transform/opacity only, 200ms —
  // the sanctioned morning-reveal recipe, scoped to one card. Reduced
  // motion snaps.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setEntered(false)
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [focused?.id])

  /** The next undecided card after `id` in queue order, cycling; `alsoGone`
   *  lets a decision exclude itself before state lands. */
  function nextUndecidedAfter(id: string, alsoGone?: string): string | null {
    const dead = alsoGone ? new Set(gone).add(alsoGone) : gone
    const i = proposals.findIndex((p) => p.id === id)
    for (let k = 1; k <= proposals.length; k++) {
      const p = proposals[(i + k) % proposals.length]
      if (!dead.has(p.id)) return p.id
    }
    return null
  }

  if (visible.length === 0) {
    // The strip stays even with no cards — a granted capability produces
    // no cards, and the way back to asking must never disappear with them.
    // When cards existed THIS render (all decided client-side just now), a
    // modest completion note marks the moment — it collapses to nothing on
    // the next server render, and is deliberately not a third signature
    // moment.
    const hadHidden = (totalOpen ?? proposals.length) > proposals.length
    return (
      <>
        {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
        {proposals.length > 0 && (
          <div className="mb-8 rounded-[var(--r-lg)] bg-[color:var(--color-surface-2,white)] p-6 text-center ring-1 ring-[color:var(--color-hairline)]">
            <p className="text-2xl" aria-hidden="true">
              🌤️
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
              That’s all of them — nothing else is waiting on your yes.
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {hadHidden
                ? 'A few more are queuing up — they’ll appear here shortly.'
                : 'I’ll bring the next batch here as it’s ready.'}
            </p>
          </div>
        )}
        {(grants.length > 0 || autonomousWork.length > 0) && (
          <GrantsStrip
            grants={grants}
            work={autonomousWork}
            isDemo={isDemo}
            onToast={setToast}
          />
        )}
      </>
    )
  }
  const hiddenCount = Math.max(0, (totalOpen ?? proposals.length) - proposals.length)
  // A granted capability's cards still sit here until the next hourly pass
  // executes them. The header promises "say the word and they go out" — for
  // these that is FALSE (they go out either way), so each one says so.
  const grantedSet = new Set(grants.map((g) => g.capability))
  // The header speaks for every card in the list, so it has to acknowledge
  // the ones that are not waiting on anyone (verification round 2).
  const anyMachineHandled = visible.some((p) => p.machineHandles ?? grantedSet.has(p.capability))

  return (
    <section className="mb-8" aria-label="Waiting on your yes">
      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Waiting on your yes
          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
            {!anyMachineHandled
              ? 'I finished these — say the word and they go out.'
              : isDemo
                ? 'I finished these — say the word and they go out. The ones marked “I’m handling this one” I’d send myself, though in the demo nothing actually goes out.'
                : 'I finished these — say the word and they go out. The ones marked “I’m handling this one” go out either way.'}
          </span>
        </h2>
        {hiddenCount > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Showing {visible.length} of {totalOpen} — the rest queue up as you decide these.
          </p>
        )}
      </div>
      {proposals.length > 1 && (
        <QueueRail
          proposals={proposals}
          gone={gone}
          focusedId={focused?.id ?? null}
          grantedSet={grantedSet}
          viewAll={viewAll}
          onJump={(id) => setFocusId(id)}
          onSkip={() => {
            if (focused) setFocusId(nextUndecidedAfter(focused.id))
          }}
          onToggleView={() => {
            setViewAll((v) => {
              const next = !v
              try {
                sessionStorage.setItem('approval-inbox-see-all', next ? '1' : '0')
              } catch {
                /* private mode */
              }
              return next
            })
          }}
        />
      )}
      <div className={viewAll ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'mx-auto w-full max-w-2xl'}>
        {visible.map((p) => {
          const isFocused = !viewAll && p.id === focused?.id
          return (
            <div
              key={p.id}
              className={viewAll || isFocused ? undefined : 'hidden'}
              style={
                isFocused
                  ? {
                      opacity: entered ? 1 : 0,
                      transform: entered ? 'translateY(0)' : 'translateY(8px)',
                      transition:
                        'opacity var(--dur-base, 200ms) var(--ease-out, ease-out), transform var(--dur-base, 200ms) var(--ease-out, ease-out)',
                    }
                  : undefined
              }
            >
              <ProposalCard
                proposal={p}
                alreadyGranted={p.machineHandles ?? grantedSet.has(p.capability)}
                isDemo={isDemo}
                clinicName={clinicName}
                onDone={(id, message) => {
                  setGone((s) => new Set(s).add(id))
                  if (message) setToast(message)
                  setFocusId(nextUndecidedAfter(id, id))
                }}
              />
            </div>
          )
        })}
      </div>
      {(grants.length > 0 || autonomousWork.length > 0) && (
        <GrantsStrip grants={grants} work={autonomousWork} isDemo={isDemo} onToast={setToast} />
      )}
    </section>
  )
}

/**
 * The sign-here stack's queue rail: "2 of 5", one chip per card (in queue
 * order — decided ones stay as quiet ✓s so progress is visible), Skip, and
 * the See-all escape hatch. Chips jump focus; the teal ring is SELECTION
 * (identity usage, same as call mode's current-call ring), the tiny tone
 * dot is a soon-to-expire mark (tones carry meaning; the brand hue never
 * does), and machine-handled chips wear the same sky tint as the card's
 * "I'm handling this one" pill so the mark reads as one vocabulary.
 */
function QueueRail({
  proposals,
  gone,
  focusedId,
  grantedSet,
  viewAll,
  onJump,
  onSkip,
  onToggleView,
}: {
  proposals: ProposalCardData[]
  gone: Set<string>
  focusedId: string | null
  grantedSet: Set<string>
  viewAll: boolean
  onJump: (id: string) => void
  onSkip: () => void
  onToggleView: () => void
}) {
  const remaining = proposals.filter((p) => !gone.has(p.id))
  const pos = focusedId ? Math.max(1, proposals.findIndex((p) => p.id === focusedId) + 1) : 1
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {!viewAll && (
        <span className="whitespace-nowrap font-mono-num text-xs font-bold text-gray-700 dark:text-gray-200">
          {pos} <span className="font-normal text-gray-400 dark:text-gray-500">of {proposals.length}</span>
        </span>
      )}
      <div className="flex flex-1 flex-wrap items-center gap-1.5" aria-label="The queue">
        {proposals.map((p) => {
          const decided = gone.has(p.id)
          const isFocused = !viewAll && p.id === focusedId
          const machine = p.machineHandles ?? grantedSet.has(p.capability)
          const tone = decided ? null : expiryTone(p.expiresAt)
          return (
            <button
              key={p.id}
              type="button"
              disabled={decided}
              onClick={() => onJump(p.id)}
              aria-label={decided ? `Decided: ${p.title}` : `Jump to: ${p.title}`}
              aria-current={isFocused ? 'true' : undefined}
              title={p.title}
              className={[
                'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-1.5 text-sm',
                'transition-transform [transition-duration:var(--dur-fast,140ms)] [transition-timing-function:var(--spring-pop,ease-out)]',
                isFocused
                  ? 'bg-white dark:bg-gray-800 ring-2 ring-teal-500 scale-105'
                  : decided
                    ? 'bg-[color:var(--color-surface-sunk)] opacity-50'
                    : machine
                      ? 'bg-sky-50 dark:bg-sky-500/10 hover:scale-105'
                      : 'bg-[color:var(--color-surface-sunk)] hover:scale-105',
              ].join(' ')}
            >
              <span aria-hidden="true">{decided ? '✓' : (CAPABILITY_ICON[p.capability] ?? '✨')}</span>
              {tone && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />}
            </button>
          )
        })}
      </div>
      {!viewAll && remaining.length > 1 && (
        <button
          type="button"
          onClick={onSkip}
          className="whitespace-nowrap text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Skip for now →
        </button>
      )}
      <button
        type="button"
        onClick={onToggleView}
        className="whitespace-nowrap text-xs font-medium text-gray-500 dark:text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200"
      >
        {viewAll ? 'One at a time' : `See all ${proposals.length}`}
      </button>
    </div>
  )
}

/**
 * "On my own" — the ladder's strip (Phase 3), which does two jobs.
 *
 * TAKE IT BACK: what the clinic has handed over, each with one tap back to
 * asking. It lives on the Overview because trust must be REVERSIBLE ALWAYS
 * from a surface that still renders when autonomy has emptied the inbox —
 * a settings page is never the way in, and a vanished inbox must never
 * strand a grant.
 *
 * AND TELL (round-1 Phase-3 audit): what those grants actually produced in
 * the last 7 days — grouped per capability and NAMING EACH ONE in the
 * machine's own words (clamped per capability with an honest "…and N more";
 * the consent line promises a list, not a count with an example). Without it the phase shipped the DO with no
 * TELL — granted work is absent from every daily signal by design, and the
 * weekly standup narrates the PRIOR week in aggregate without ever marking
 * which of it was the machine's own. A clinic could hand something over and
 * not see one thing it did for up to 13 days.
 */
function GrantsStrip({
  grants,
  work = [],
  isDemo = false,
  onToast,
}: {
  grants: TrustGrantChip[]
  work?: AutonomousWorkChip[]
  isDemo?: boolean
  onToast: (message: string) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // THE SERVER STATE IS THE ONLY STATE (verification round 2). This used to
  // hide a revoked chip optimistically and never un-hide it: router.refresh()
  // preserves client state, so revoking and then handing the SAME capability
  // back in one session left no chip — no take-back control anywhere in the
  // product for the rest of that session, while a card beside it pointed at
  // the missing control and the machine kept acting. "Reversible always"
  // cannot depend on a local set that only ever grows. The transition's
  // pending flag covers the beat before the refresh lands.
  const shown = grants
  // THE TELL OUTLIVES THE GRANT (round-2 audit): taking a job back used to
  // delete, in the same click, the record of everything the machine had
  // done with it — the one moment a clinic most wants to read that list.
  // The chips need a live grant; the week's work does not.
  if (shown.length === 0 && work.length === 0) return null
  // "Yet" is a statement about all of history; the read behind it covers
  // seven days. It stays only while every live grant is younger than that.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const everyGrantIsFresh =
    shown.length > 0 && shown.every((g) => (g.grantedAt ? g.grantedAt.getTime() >= weekAgo : false))

  return (
    <div className="mt-3 mb-8 text-xs text-gray-500 dark:text-gray-400">
      {shown.length > 0 && (
      <div className="flex flex-wrap items-center gap-2">
      <span>
        {isDemo
          ? 'In the demo I show you how this works — nothing actually goes out:'
          : 'I handle these on my own now, and list each one right here:'}
      </span>
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
                // The take-back gets the same failure boundary the hand-over
                // has (round-3 audit): a throw here used to reject inside the
                // transition, so the click said nothing, the chip stayed, and
                // staff could not tell whether the machine had stopped.
                const r = await setAutonomyAction({
                  capability: g.capability,
                  level: 'ask',
                }).catch(() => ({
                  ok: false as const,
                  error: 'I couldn’t switch this one back just now — give it another try in a minute.',
                }))
                if (r.ok) {
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
      )}
      {/* THE TELL. Every entry the machine handled alone, in its own words —
          no drill-down, no filters, nothing to operate. Clamped per
          capability with an honest "…and N more" rather than a silent cut.
          The zero state is honest rather than hidden: silence after a
          hand-over reads as "did it break?". */}
      <div className="mt-2 pl-0.5">
        {work.length === 0 ? (
          <p>
            {everyGrantIsFresh
              ? 'Nothing on my own yet — I’ll list each one right here.'
              : 'Nothing this past week — I’ll list each one right here.'}
          </p>
        ) : (
          <>
            {shown.length === 0 && (
              <p className="mb-0.5">Here’s what I handled on my own this week:</p>
            )}
            <ul className="space-y-1.5">
              {work.map((w) => {
                const lines = w.summaries?.length ? w.summaries : [w.latestSummary]
                const shownLines = lines.slice(0, WORK_LINES_PER_CAPABILITY)
                const rest = w.count - shownLines.length
                return (
                  <li key={w.capability}>
                    <span className="text-gray-700 dark:text-gray-200">{w.label}</span> — {w.count}{' '}
                    this week:
                    <ul className="mt-0.5 ml-3 space-y-0.5">
                      {shownLines.map((line, i) => (
                        <li key={i}>{`· ${line}`}</li>
                      ))}
                      {rest > 0 && (
                        <li>{`· …and ${rest} more this week`}</li>
                      )}
                    </ul>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function ProposalCard({
  proposal,
  alreadyGranted = false,
  isDemo = false,
  clinicName = 'Your clinic',
  onDone,
}: {
  proposal: ProposalCardData
  clinicName?: string
  /** Demo clinic — the grant never actually fires (the generator cron skips
   *  demo orgs), so the card must not promise autonomous delivery. */
  isDemo?: boolean
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
  // Defaults keep the card honest when a caller omits the flag: an
  // already-granted card means the capability is granted.
  const capabilityGranted = proposal.capabilityGranted ?? alreadyGranted
  const tokens = HAS_TOKENS.test(body)
  // Setup asks (onboarding overhaul): the card collects an ANSWER instead of
  // approving a drafted artifact — no body editing (the body is the question,
  // not a work product), a typed control per ask, and approve labels that
  // say what saying yes does.
  const isSetup = SETUP_CAPABILITIES.includes(proposal.capability)
  const [chairsAnswer, setChairsAnswer] = useState('3')
  const [modeAnswer, setModeAnswer] = useState<'requests' | 'direct'>('requests')
  const [texting, setTexting] = useState({
    ein: '',
    entityType: '',
    brandContactName: '',
    brandContactEmail: '',
  })
  // Staff-attached photo for a social card (owner-caught gap: an approved
  // post published imageless with no way to add one). Uploaded through the
  // composer's own storage path; the preview renders it live, the approve
  // carries its URL.
  const [image, setImage] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imagePct, setImagePct] = useState(0)
  const [imageError, setImageError] = useState<string | null>(null)

  async function onPickImage(file: File | null) {
    if (!file || imageUploading) return
    setImageError(null)
    setImageUploading(true)
    setImagePct(0)
    try {
      const url = await uploadFileWithProgress(file, 'social-posts', setImagePct).promise
      setImage(url)
    } catch (err) {
      if (!(err instanceof UploadCancelledError)) {
        setImageError(err instanceof Error ? err.message : 'Upload failed — try again.')
      }
    } finally {
      setImageUploading(false)
    }
  }
  // The send APPENDS a booking button for these capabilities when the body
  // doesn't place the link itself — say so on the card, because "what the
  // card shows is what sends" must be literally true (verification round:
  // staff could rewrite the invitation and still ship a button unseen).
  const appendsBookingButton =
    BOOKING_BUTTON_CAPABILITIES.includes(proposal.capability) && !body.includes('{{bookingUrl}}')
  // The executor appends the clinic sign-off to an UNSIGNED inquiry reply —
  // the email artifact renders it so what the card shows is what sends.
  const appendsSignoff =
    proposal.capability === 'inquiry_response' &&
    !(body.trim().split('\n').filter((l) => l.trim()).pop() ?? '').trim().match(/^[—-]/)
  const artifact = proposal.artifact ?? null
  const showsEmailArtifact = artifact?.kind === 'email' && !editing

  const decide = (decision: 'approve' | 'decline') => {
    setError(null)
    // A blanked subject must never silently fall back to the original —
    // what the card shows is what sends (round-3 audit; the server's own
    // empty-subject guard is only reachable when we transmit the field).
    if (decision === 'approve' && proposal.subject != null && !subject.trim()) {
      setError('The subject can’t be empty — give it a few words first.')
      return
    }
    // A setup answer is validated where it's typed — the server re-checks.
    if (decision === 'approve' && proposal.capability === 'setup_chairs') {
      const n = Number.parseInt(chairsAnswer, 10)
      if (!Number.isFinite(n) || n < 1 || n > 30) {
        setError('How many chairs? Pick a number from 1 to 30.')
        return
      }
    }
    if (decision === 'approve' && proposal.capability === 'setup_texting') {
      if (!texting.ein.trim() || !texting.entityType || !texting.brandContactName.trim() || !texting.brandContactEmail.trim()) {
        setError('Fill in all four details first — the carriers need every one.')
        return
      }
    }
    const setupAnswer =
      decision === 'approve' && proposal.capability === 'setup_chairs'
        ? String(Number.parseInt(chairsAnswer, 10))
        : decision === 'approve' && proposal.capability === 'setup_booking_mode'
          ? modeAnswer
          : decision === 'approve' && proposal.capability === 'setup_texting'
            ? JSON.stringify(texting)
            : undefined
    startTransition(async () => {
      // Every server-action call on this card has a failure boundary: a
      // rejected promise inside a transition is invisible, and the card would
      // sit there looking live with nothing said (round-3 audit).
      const r = await (decision === 'approve'
        ? approveProposalAction({
            proposalId: proposal.id,
            ...(body !== proposal.body ? { body } : {}),
            ...(proposal.subject != null && subject.trim() && subject !== proposal.subject
              ? { subject }
              : {}),
            ...(setupAnswer !== undefined ? { answer: setupAnswer } : {}),
            ...(image && proposal.capability === 'social_post' ? { imageUrl: image } : {}),
          })
        : declineProposalAction({ proposalId: proposal.id })
      ).catch(() => ({
        ok: false as const,
        error: 'Something went wrong on my side — nothing went out. Give it another try in a minute.',
        expired: false,
      }))
      if (r.ok) {
        let message = r.message ?? (decision === 'approve' ? 'Done — it went out.' : undefined)
        if (decision === 'approve' && alwaysDo && isGrantable(proposal.capability)) {
          // A failed grant never blocks the approve's own good news — but it
          // must not vanish either (round-1 Phase-3 audit): a swallowed
          // failure left the clinic believing it had handed the job over
          // while the machine kept asking, with no trace anywhere on a
          // first-ever grant. Both halves get said, joined so two sentences
          // never run together (the ledger summary has no full stop).
          const grant = await setAutonomyAction({
            capability: proposal.capability,
            level: 'auto',
          }).catch(() => ({ ok: false as const, error: 'I couldn’t switch this one to automatic.' }))
          message = [
            message,
            grant.ok
              ? grant.message
              : `${grant.error} I’ll keep asking for now — tick the box again next time.`,
          ]
            .filter(Boolean)
            .join(' · ')
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
          <div className="flex items-start gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1 min-w-0">
              {proposal.title}
            </p>
            {/* THE TRUTH ON THE LOUDEST ELEMENT (verification round 2). The
                generators write titles for a human who must act — "Send
                it?", "Answer Maria's website inquiry" — and a machine-
                handled card renders them verbatim under a header that says
                "say the word and they go out". Both are false for this
                card, and the honest line lives in gray under the draft. The
                titles are correct for the ask-first majority, so the card
                carries the fact instead of rewriting generated prose. */}
            {alreadyGranted && (
              <span className="shrink-0 rounded-full bg-sky-50 dark:bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                {/* ONE label everywhere: the header names this exact phrase,
                    so a demo-only variant sent the reader looking for a mark
                    that did not exist (verification round 3). The demo's
                    hedge lives in the header and on the card itself. */}
                I’m handling this one
              </span>
            )}
          </div>
          <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-0.5">
            {proposal.capabilityLabel}
            {proposal.meta ? ` · ${proposal.meta}` : ''}
          </p>
        </div>
      </div>

      {/* What we're answering — never approve a public reply blind. A
          date-only inquiry (no message) still shows its one statement: the
          date they asked about (round-3 audit). */}
      {proposal.context && proposal.capability !== 'review_reply' && (proposal.context.text || proposal.context.preferredDate) && (
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
      {proposal.subject != null && !showsEmailArtifact && (
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
        ) : proposal.capability === 'review_reply' && proposal.context ? (
          <ReviewReplyArtifact
            author={proposal.context.author}
            starRating={proposal.context.starRating}
            reviewText={proposal.context.text}
            reply={body}
            clinicName={clinicName}
          />
        ) : artifact?.kind === 'social' ? (
          <div>
            <SocialArtifact body={body} clinicName={clinicName} channel={artifact.channel} imageUrl={image} />
            <div className="mt-2 flex items-center gap-3">
              <label className="text-xs font-medium text-sky-700 dark:text-sky-300 cursor-pointer hover:underline">
                {imageUploading
                  ? `Uploading… ${imagePct}%`
                  : image
                    ? 'Change photo'
                    : 'Add a photo'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={pending || imageUploading}
                  onChange={(e) => {
                    void onPickImage(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                />
              </label>
              {image && !imageUploading && (
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Remove photo
                </button>
              )}
              {!image && !imageUploading && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Posts without one — exactly as shown.
                </span>
              )}
            </div>
            {imageError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{imageError}</p>}
          </div>
        ) : artifact?.kind === 'plan' ? (
          <PlanArtifact items={artifact.items} clinicName={clinicName} channel={artifact.channel} />
        ) : artifact?.kind === 'email' ? (
          <EmailArtifact
            clinicName={clinicName}
            toLine={artifact.toLine}
            subject={proposal.subject != null ? subject : null}
            body={tokens ? renderTokenSample(body) : body}
            showBookingButton={appendsBookingButton}
            showSignoff={appendsSignoff}
          />
        ) : artifact?.kind === 'gbp' ? (
          <GbpFixArtifact targetUrl={artifact.targetUrl} previousUri={artifact.previousUri} />
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
        {appendsBookingButton && !showsEmailArtifact && (
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

      {/* Setup-ask answer controls — the card collects a fact, the approve
          writes it. */}
      {proposal.capability === 'setup_chairs' && (
        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor={`chairs-${proposal.id}`}
            className="text-sm text-gray-700 dark:text-gray-200 font-medium"
          >
            Chairs:
          </label>
          <input
            id={`chairs-${proposal.id}`}
            type="number"
            min={1}
            max={30}
            value={chairsAnswer}
            onChange={(e) => setChairsAnswer(e.target.value)}
            disabled={pending}
            className="w-20 text-sm rounded-lg border border-[color:var(--color-hairline)] bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-700"
          />
        </div>
      )}
      {proposal.capability === 'setup_texting' && (
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`ein-${proposal.id}`} className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              EIN (tax ID)
            </label>
            <input
              id={`ein-${proposal.id}`}
              type="text"
              inputMode="numeric"
              placeholder="12-3456789"
              value={texting.ein}
              onChange={(e) => setTexting((t) => ({ ...t, ein: e.target.value }))}
              disabled={pending}
              className="w-full text-sm rounded-lg border border-[color:var(--color-hairline)] bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-700"
            />
          </div>
          <div>
            <label htmlFor={`entity-${proposal.id}`} className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Business type
            </label>
            <select
              id={`entity-${proposal.id}`}
              value={texting.entityType}
              onChange={(e) => setTexting((t) => ({ ...t, entityType: e.target.value }))}
              disabled={pending}
              className="w-full text-sm rounded-lg border border-[color:var(--color-hairline)] bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-700"
            >
              <option value="" disabled>
                Pick one…
              </option>
              {SMS_ENTITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`contact-name-${proposal.id}`} className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Contact person
            </label>
            <input
              id={`contact-name-${proposal.id}`}
              type="text"
              placeholder="Dr. Ada Reyes"
              value={texting.brandContactName}
              onChange={(e) => setTexting((t) => ({ ...t, brandContactName: e.target.value }))}
              disabled={pending}
              className="w-full text-sm rounded-lg border border-[color:var(--color-hairline)] bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-700"
            />
          </div>
          <div>
            <label htmlFor={`contact-email-${proposal.id}`} className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Their email at your practice
            </label>
            <input
              id={`contact-email-${proposal.id}`}
              type="email"
              placeholder="you@yourpractice.com"
              value={texting.brandContactEmail}
              onChange={(e) => setTexting((t) => ({ ...t, brandContactEmail: e.target.value }))}
              disabled={pending}
              className="w-full text-sm rounded-lg border border-[color:var(--color-hairline)] bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:focus:ring-sky-700"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              The carriers email this person a verification link — it needs to be an address at your practice, not ours.
            </p>
          </div>
        </div>
      )}
      {proposal.capability === 'setup_booking_mode' && (
        <div className="mt-3 space-y-1.5" role="radiogroup" aria-label="How should booking work?">
          {(
            [
              ['requests', 'Requests I approve — nothing lands without my say-so (recommended)'],
              ['direct', 'Direct booking — patients book straight into open times'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer"
            >
              <input
                type="radio"
                name={`mode-${proposal.id}`}
                checked={modeAnswer === value}
                onChange={() => setModeAnswer(value)}
                disabled={pending}
                className="mt-1"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}

      {/* THE HAND-BACK, said plainly (round-1 Phase-3 audit): the machine
          tried this one alone, couldn't, and stopped trying. It outranks the
          "goes out on its own" line — that promise is exactly what was
          false while a granted card retried invisibly every hour. */}
      {proposal.handedBack && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          I tried this one on my own twice and couldn’t send it — it’s back with you. Approving it
          here is the surest way through.
        </p>
      )}
      {/* THE PRE-GRANT CARD (round-3 audit). Round 2 made "from now on" mean
          from now on, which created a card the machine will never touch even
          though its capability is automatic — and gave it no copy at all. It
          sat silent beside a strip announcing the machine handles these now,
          and the reasonable reading ("the machine has this") is exactly
          wrong: this is the parked 1-star review the boundary protects. */}
      {capabilityGranted && !alreadyGranted && !proposal.handedBack && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          This one came in before you handed these over, so it’s still yours to say yes to — I only
          take the ones filed after.
        </p>
      )}
      {alreadyGranted && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {isDemo
            ? 'You’ve handed these to me — in the demo I’ll show you how it works, but nothing actually goes out. Approve to see the whole flow, or take the job back below.'
            : proposal.waitsForMorning
              ? // The send window (round-1 P4) holds patient mail overnight,
                // which made the old "within the hour" line false all evening
                // (round-2 audit). Say the real thing — it reassures.
                'You’ve handed these to me — this one goes out in the morning; I don’t put mail in patients’ inboxes overnight. Approve now if you’d like it to go this minute, tell me to skip this one, or take the job back below.'
              : // THE THIRD EXIT (round-3 audit): the preview window exists so
                // a human can stop ONE draft. Naming only "approve" and "take
                // the job back" made a single bad draft cost the whole
                // hand-over — a ladder whose only correction is climbing all
                // the way down.
                'You’ve handed these to me — this one goes out on its own within the hour. Approve now if you’d like it to go this minute, tell me to skip this one, or take the job back below.'}
        </p>
      )}
      {/* The hand-over offer and its nudge are gated on whether the CAPABILITY
          is already automatic — not on whether this particular card is the
          machine's. A handed-back card was re-asking for a trust the clinic
          had already given, while the strip below said so (round-2 audit). */}
      {!capabilityGranted && isGrantable(proposal.capability) && (proposal.uneditedRun ?? 0) >= 3 && (
        <p className="mt-3 text-xs text-sky-700 dark:text-sky-300">
          You’ve said yes to the last {proposal.uneditedRun} of these without changing a word — tick
          the box below and I’ll take them over.
        </p>
      )}
      {!capabilityGranted && isGrantable(proposal.capability) && (
        <label className="mt-3 flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={alwaysDo}
            onChange={(e) => setAlwaysDo(e.target.checked)}
            disabled={pending}
            className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
          />
          {/* SAY WHAT IS BEING HANDED OVER (round-1 Phase-3 audit). A grant
              is capability-WIDE, so a tick on a warm 5-star reply also hands
              over the angry ones — the class of review the rest of the
              product treats as an escalation. A grant the granter doesn't
              understand is not a grant. And the promise names a real place:
              the strip under this inbox, not a "diary" that never existed. */}
          <span>
            From now on, handle these for me on your own
            {proposal.capability === 'review_reply'
              ? ' — including 1- and 2-star reviews, which I’d answer publicly too'
              : ''}
            . I’ll list each one on your Overview, and you can take it back any time.
          </span>
        </label>
      )}

      <div className="mt-3 flex items-center gap-2">
        {/* The product's most-pressed button, on the primitive it deserves:
            the old raw <button> painted var(--color-brand-600) — a token that
            doesn't exist — so it silently rendered the fallback sky, and its
            'On it…' ternary jumped the width mid-press. */}
        <ActionButton variant="primary" onClick={() => decide('approve')} pending={pending}>
          {proposal.capability === 'setup_hours'
            ? 'Yes — that’s my week'
            : proposal.capability === 'setup_chairs'
              ? 'Save'
              : proposal.capability === 'setup_booking_mode'
                ? 'Save my choice'
                : proposal.capability === 'setup_texting'
                  ? 'Start my registration'
                  : 'Approve — send it'}
        </ActionButton>
        {proposal.capability === 'setup_hours' && (
          <a
            href="/settings/clinic"
            className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60"
          >
            Fix them instead
          </a>
        )}
        {!isSetup && (
          <ActionButton variant="ghost" onClick={() => setEditing((v) => !v)} pending={pending}>
            {editing ? 'Done editing' : 'Edit first'}
          </ActionButton>
        )}
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
          {alreadyGranted
            ? declineArmed
              ? 'Sure? I’ll drop it'
              : 'Skip this one'
            : declineArmed
              ? 'Sure? I won’t ask again'
              : 'No thanks'}
        </button>
      </div>
    </div>
  )
}
