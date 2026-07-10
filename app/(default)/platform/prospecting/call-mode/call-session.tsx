'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import type { CallQueueItem } from '@/lib/services/prospecting'
import type { CallScript } from '@/lib/types/call-script'
import { prospectInitials } from '@/lib/prospect-when'
import { Stage } from '../stage'
import {
  getCallScriptAction,
  logCallOutcomeAction,
  bookDemoForProspectAction,
} from '../admin-actions'

/**
 * The dial-session cockpit. Left: the dial zone (who, the number, their local
 * time, the warm signals that prove it isn't really cold). Right: the AI
 * script as a numbered teleprompter. Top: a session strip — one segment per
 * call that fills with your outcome's color as you go. Bottom: a docked
 * outcome bar with keyboard shortcuts (1–5) so logging never breaks flow.
 * The current script loads on entry and the NEXT prefetches while you talk.
 */

type ScriptState = CallScript | 'loading' | 'failed'

const SOURCE_META: Record<CallQueueItem['source'], { label: string; tone: 'special' | 'warn' | 'info' }> = {
  hand_raiser: { label: '🙋 They replied', tone: 'special' },
  follow_up: { label: '⏰ Follow-up due', tone: 'warn' },
  phone_first: { label: '📵 Phone is the only door', tone: 'info' },
}

/** Session-strip segment color per logged outcome. */
const SEGMENT_COLOR: Record<string, string> = {
  demo_booked: 'bg-emerald-500',
  callback: 'bg-amber-500',
  voicemail: 'bg-gray-400 dark:bg-gray-500',
  no_answer: 'bg-gray-300 dark:bg-gray-600',
  not_interested: 'bg-rose-400',
  skipped: 'bg-[color:var(--color-surface-sunk)]',
}

const LOST_REASONS: Array<[string, string]> = [
  ['price', 'Price'],
  ['using_competitor', 'Has a vendor'],
  ['no_need', 'No need'],
  ['bad_timing', 'Bad timing'],
  ['not_decision_maker', 'Not the decision-maker'],
  ['other', 'Other'],
]

function fmtPhone(digits: string): string {
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits
}

function localTime(timezone: string | null): string | null {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(
      new Date(),
    )
  } catch {
    return null
  }
}

export default function CallSession({ items }: { items: CallQueueItem[] }) {
  const [idx, setIdx] = useState(0)
  const [scripts, setScripts] = useState<Record<string, ScriptState>>({})
  // Per-call outcome (by queue position) — drives the session strip + tallies.
  const [results, setResults] = useState<Array<string | null>>(() => items.map(() => null))
  const [booked, setBooked] = useState<Array<{ id: string; name: string }>>([])
  const [note, setNote] = useState('')
  const [showVoicemail, setShowVoicemail] = useState(false)
  const [passPicker, setPassPicker] = useState(false)
  const [demoPicker, setDemoPicker] = useState(false)
  const [demoAt, setDemoAt] = useState('')
  const [attendeeEmail, setAttendeeEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const item = idx < items.length ? items[idx] : null
  const done = idx >= items.length
  const tally = useMemo(() => {
    const t: Record<string, number> = {}
    for (const r of results) if (r && r !== 'skipped') t[r] = (t[r] ?? 0) + 1
    return t
  }, [results])
  const totalLogged = useMemo(() => Object.values(tally).reduce((a, b) => a + b, 0), [tally])

  // Ref-guarded so StrictMode re-renders never double-fetch the same script.
  const requested = useRef(new Set<string>())
  const ensureScript = useCallback((id: string | undefined) => {
    if (!id || requested.current.has(id)) return
    requested.current.add(id)
    setScripts((s) => ({ ...s, [id]: 'loading' }))
    getCallScriptAction(id)
      .then((script) => setScripts((cur) => ({ ...cur, [id]: script ?? 'failed' })))
      .catch(() => setScripts((cur) => ({ ...cur, [id]: 'failed' })))
  }, [])

  // Load the current script + prefetch the next one.
  useEffect(() => {
    ensureScript(items[idx]?.id)
    ensureScript(items[idx + 1]?.id)
  }, [idx, items, ensureScript])

  const advance = (outcome: string) => {
    setResults((r) => r.map((v, i) => (i === idx ? outcome : v)))
    setNote('')
    setShowVoicemail(false)
    setPassPicker(false)
    setDemoPicker(false)
    setDemoAt('')
    setAttendeeEmail('')
    setError(null)
    setIdx((i) => i + 1)
  }

  const log = useCallback(
    (outcome: string, lostReason?: string) => {
      if (!item || pending) return
      setError(null)
      startTransition(async () => {
        try {
          await logCallOutcomeAction({
            prospectId: item.id,
            outcome,
            note: note.trim() || undefined,
            lostReason,
          })
          advance(outcome)
        } catch {
          setError("Couldn't log that — try again.")
        }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item, pending, note, idx],
  )

  const bookDemo = () => {
    if (!item || !demoAt) return
    setError(null)
    startTransition(async () => {
      try {
        await bookDemoForProspectAction({
          prospectId: item.id,
          demoAtIso: new Date(demoAt).toISOString(),
          attendeeName: item.authorizedOfficialName ?? undefined,
          attendeeEmail: attendeeEmail.trim() || undefined,
        })
        setBooked((b) => [...b, { id: item.id, name: item.name }])
        advance('demo_booked')
      } catch {
        setError("Couldn't book that — check the time and try again.")
      }
    })
  }

  // Keyboard shortcuts: 1 demo · 2 callback · 3 voicemail · 4 no answer ·
  // 5 pass · Esc closes pickers. Silent while typing in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (done || pending) return
      if (e.key === 'Escape') {
        setPassPicker(false)
        setDemoPicker(false)
        return
      }
      if (demoPicker || passPicker) return
      if (e.key === '1') setDemoPicker(true)
      else if (e.key === '2') log('callback')
      else if (e.key === '3') log('voicemail')
      else if (e.key === '4') log('no_answer')
      else if (e.key === '5') setPassPicker(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, pending, demoPicker, passPicker, log])

  // ── End-of-session summary ────────────────────────────────────────────────
  if (done) {
    const demos = tally.demo_booked ?? 0
    return (
      <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-8 text-center ring-1 ring-[color:var(--color-hairline)]">
        <p className="text-4xl" aria-hidden="true">
          {demos > 0 ? '🎉' : totalLogged > 0 ? '👏' : '🌤'}
        </p>
        <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">
          {totalLogged === 0
            ? 'Session over — nothing logged'
            : `${totalLogged} call${totalLogged === 1 ? '' : 's'} done`}
        </h2>
        {demos > 0 && (
          <p className="mt-1 text-sm font-semibold text-violet-600 dark:text-violet-400">
            {demos} demo{demos === 1 ? '' : 's'} booked
          </p>
        )}
        {/* The session strip, final state — the shape of the session. */}
        <div className="mx-auto mt-5 flex max-w-md gap-1">
          {results.map((r, i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full ${r ? SEGMENT_COLOR[r] ?? 'bg-gray-300' : 'bg-[color:var(--color-surface-sunk)]'}`}
            />
          ))}
        </div>
        <div className="mx-auto mt-4 flex max-w-xs flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          {Object.entries(tally).map(([k, n]) => (
            <div key={k} className="flex justify-between">
              <span className="capitalize">{k.replace(/_/g, ' ')}</span>
              <span className="font-semibold tabular-nums">{n}</span>
            </div>
          ))}
        </div>
        {booked.length > 0 && (
          <div className="mt-5 text-sm">
            <p className="font-medium text-gray-700 dark:text-gray-200">Get ready for:</p>
            {booked.map((b) => (
              <Link
                key={b.id}
                href={`/platform/prospecting/demo/${b.id}`}
                className="mt-1 block font-semibold text-violet-600 hover:underline dark:text-violet-400"
              >
                🎬 {b.name} — demo prep →
              </Link>
            ))}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <ActionButton href="/platform/prospecting" variant="secondary">
            Back to the pipeline
          </ActionButton>
          <ActionButton href="/platform/prospecting/call-mode" variant="primary">
            Run it again
          </ActionButton>
        </div>
      </div>
    )
  }
  if (!item) return null

  const script = scripts[item.id]
  const meta = SOURCE_META[item.source]
  const theirTime = localTime(item.timezone)
  const warm = item.opens > 0 || item.clicks > 0
  const hasSignals = warm || item.intentSummary || item.followUpReason || item.lastCallOutcome
  const rating =
    item.googleRatingTenths != null
      ? `${(item.googleRatingTenths / 10).toFixed(1)}★${item.reviewCount != null ? ` (${item.reviewCount})` : ''}`
      : null

  return (
    <div>
      {/* Session strip — one segment per call, filled with the outcome color. */}
      <div className="mb-5 flex items-center gap-3">
        <span className="whitespace-nowrap font-mono-num text-xs font-bold text-gray-700 dark:text-gray-200">
          CALL {idx + 1} <span className="text-gray-400 dark:text-gray-500">/ {items.length}</span>
        </span>
        <div className="flex flex-1 gap-1">
          {items.map((_, i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i === idx
                  ? 'bg-[color:var(--color-surface-2)] ring-2 ring-teal-500'
                  : results[i]
                    ? SEGMENT_COLOR[results[i]!] ?? 'bg-gray-300'
                    : 'bg-[color:var(--color-surface-sunk)]'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => advance('skipped')}
          className="whitespace-nowrap text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Skip →
        </button>
      </div>

      {/* Cockpit */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[330px_1fr]">
        {/* Dial zone */}
        <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-5 ring-1 ring-[color:var(--color-hairline)] lg:sticky lg:top-4">
          <div className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-violet-500 text-base font-extrabold text-white"
              aria-hidden="true"
            >
              {prospectInitials(item.name)}
            </span>
            <div className="min-w-0">
              <h2 className="text-[1.05rem] font-bold leading-snug text-gray-900 dark:text-gray-100">{item.name}</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {[item.city, item.state].filter(Boolean).join(', ')}
                {rating ? ` · ${rating}` : ''}
              </p>
              {item.authorizedOfficialName && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.authorizedOfficialName}</p>
              )}
            </div>
          </div>
          <div className="mt-2.5">
            <StatusPill tone={meta.tone} label={meta.label} />
          </div>

          {/* The number — the one tap that matters. */}
          <a
            href={`tel:+1${item.phone}`}
            className="relative mt-4 block rounded-[var(--r-md)] bg-gradient-to-b from-teal-700 to-teal-600 px-4 py-4 text-center transition hover:from-teal-600 hover:to-teal-500"
          >
            <span className="absolute right-3 top-2.5 h-2 w-2 animate-pulse rounded-full bg-teal-200" aria-hidden="true" />
            <span className="font-mono-num text-2xl font-extrabold tracking-tight text-white">
              {fmtPhone(item.phone)}
            </span>
            <span className="mt-0.5 block text-[0.7rem] text-teal-100/80">tap to call</span>
          </a>
          {theirTime && (
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>their local time</span>
              <span className="font-mono-num font-semibold text-gray-700 dark:text-gray-200">{theirTime}</span>
            </div>
          )}

          {hasSignals && (
            <div className="mt-4 border-t border-[color:var(--color-hairline)] pt-3">
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Why this isn't cold
              </p>
              <div className="mt-1.5 space-y-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {warm && (
                  <p>
                    ✉️ Opened your emails <span className="font-mono-num font-semibold">{item.opens}×</span>
                    {item.clicks > 0 && (
                      <>
                        {' '}
                        · clicked <span className="font-mono-num font-semibold">{item.clicks}×</span>
                      </>
                    )}
                  </p>
                )}
                {item.intentSummary && <p>💬 {item.intentSummary}</p>}
                {item.followUpReason && <p>⏰ You promised: {item.followUpReason}</p>}
                {item.lastCallOutcome && <p>📞 Last call: {item.lastCallOutcome.replace(/_/g, ' ')}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Teleprompter */}
        <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] px-6 py-5 ring-1 ring-[color:var(--color-hairline)]">
          {script === 'loading' || script === undefined ? (
            <div className="space-y-2 py-4">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500">✨ Writing their script…</p>
              {item.talkingPoints.length > 0 && (
                <ul className="list-inside list-disc text-sm text-gray-600 dark:text-gray-300">
                  {item.talkingPoints.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : script === 'failed' ? (
            <div className="py-4 text-sm text-gray-500 dark:text-gray-400">
              <p>No script this time — lead with what you know:</p>
              {item.talkingPoints.length > 0 ? (
                <ul className="mt-1 list-inside list-disc">
                  {item.talkingPoints.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1">
                  {item.websiteUrl ? 'Their site has gaps we fix.' : 'They have no website — patients can’t find them.'}
                </p>
              )}
            </div>
          ) : (
            <div>
              <Stage n={1} tone="teal" label="Open with">
                <p className="text-[1.15rem] font-medium leading-relaxed text-gray-900 dark:text-gray-100">
                  “{script.opener}”
                </p>
              </Stage>
              <Stage n={2} tone="gray" label="Why them">
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{script.whyThem}</p>
                {script.valuePoints.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    {script.valuePoints.map((v, i) => (
                      <li key={i}>• {v}</li>
                    ))}
                  </ul>
                )}
              </Stage>
              {script.objections.length > 0 && (
                <Stage n={3} tone="gray" label="If they say…">
                  <div className="space-y-1.5">
                    {script.objections.map((o, i) => (
                      <div
                        key={i}
                        className="rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] px-3 py-2 text-sm leading-relaxed"
                      >
                        <span className="font-semibold text-gray-800 dark:text-gray-200">“{o.objection}”</span>
                        <span className="text-gray-600 dark:text-gray-300"> → {o.response}</span>
                      </div>
                    ))}
                  </div>
                </Stage>
              )}
              <Stage n={4} tone="violet" label="The ask">
                <p className="text-[0.95rem] font-semibold leading-relaxed text-gray-900 dark:text-gray-100">
                  {script.ask}
                </p>
                <button
                  type="button"
                  onClick={() => setShowVoicemail((v) => !v)}
                  className="mt-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  🎙 Voicemail script {showVoicemail ? '▲' : '▼'}
                </button>
                {showVoicemail && (
                  <p className="mt-1.5 rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] px-3 py-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    “{script.voicemail}”
                  </p>
                )}
              </Stage>
            </div>
          )}
        </div>
      </div>

      {/* Outcome dock — sticky so long scripts never hide the buttons. */}
      <div className="sticky bottom-4 mt-4 rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-3.5 shadow-lg ring-1 ring-[color:var(--color-hairline)]">
        {error && <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        {demoPicker ? (
          <div className="rounded-[var(--r-md)] bg-violet-500/10 p-3">
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              🎉 Lock the time while they're on the phone
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={demoAt}
                onChange={(e) => setDemoAt(e.target.value)}
                className="form-input text-sm"
                autoFocus
              />
              <input
                type="email"
                value={attendeeEmail}
                onChange={(e) => setAttendeeEmail(e.target.value)}
                placeholder="their email (optional)"
                className="form-input w-52 text-sm"
              />
              <ActionButton size="sm" variant="primary" disabled={pending || !demoAt} onClick={bookDemo}>
                {pending ? 'Booking…' : 'Book it'}
              </ActionButton>
              <button
                type="button"
                onClick={() => setDemoPicker(false)}
                className="text-xs text-gray-500 hover:underline dark:text-gray-400"
              >
                cancel
              </button>
            </div>
          </div>
        ) : passPicker ? (
          <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] p-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Why'd they pass?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LOST_REASONS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={pending}
                  onClick={() => log('not_interested', key)}
                  className="rounded-full bg-[color:var(--color-surface-2)] px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-[color:var(--color-hairline)] hover:ring-gray-400 dark:text-gray-200"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPassPicker(false)}
                className="px-2 text-xs text-gray-500 hover:underline dark:text-gray-400"
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything to remember? (optional)"
              className="form-input min-w-[200px] flex-1 rounded-full text-sm"
              maxLength={500}
            />
            <OutcomeButton primary kbd="1" disabled={pending} onClick={() => setDemoPicker(true)}>
              🎉 Demo booked
            </OutcomeButton>
            <OutcomeButton kbd="2" disabled={pending} onClick={() => log('callback')}>
              🔁 Callback
            </OutcomeButton>
            <OutcomeButton kbd="3" disabled={pending} onClick={() => log('voicemail')}>
              🎙 Voicemail
            </OutcomeButton>
            <OutcomeButton kbd="4" disabled={pending} onClick={() => log('no_answer')}>
              📵 No answer
            </OutcomeButton>
            <OutcomeButton kbd="5" disabled={pending} onClick={() => setPassPicker(true)}>
              ✕ Pass
            </OutcomeButton>
          </div>
        )}

        <p className="mt-2 text-[0.7rem] text-gray-400 dark:text-gray-500">
          Keys 1–5 log outcomes · callbacks, voicemails, and no-answers schedule their own follow-up — nothing drops.
        </p>
      </div>
    </div>
  )
}

function OutcomeButton({
  children,
  kbd,
  primary,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  kbd: string
  primary?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-[var(--r-md)] px-3.5 py-2 text-xs font-bold transition disabled:opacity-50 ${
        primary
          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
          : 'bg-[color:var(--color-surface-2)] text-gray-700 ring-1 ring-[color:var(--color-hairline)] hover:ring-gray-400 dark:text-gray-200'
      }`}
    >
      <span>{children}</span>
      <span
        className={`rounded px-1.5 font-mono-num text-[0.6rem] font-semibold ${
          primary ? 'bg-white/20 text-white' : 'bg-[color:var(--color-surface-sunk)] text-gray-400 dark:text-gray-500'
        }`}
      >
        {kbd}
      </span>
    </button>
  )
}
