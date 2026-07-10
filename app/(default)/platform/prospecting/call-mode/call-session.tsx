'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import type { CallQueueItem } from '@/lib/services/prospecting'
import type { CallScript } from '@/lib/types/call-script'
import {
  getCallScriptAction,
  logCallOutcomeAction,
  bookDemoForProspectAction,
} from '../admin-actions'

/**
 * The dial-session player. One card at a time; the AI script for the current
 * card loads on entry and the NEXT card's script prefetches in the background
 * (calls take minutes, generation takes seconds — you never wait). Outcomes
 * are one tap: they log through the same plumbing as the call list (follow-up
 * scheduling included) and auto-advance. "Demo booked" opens an inline time
 * picker so the slot is set while they're still on the phone.
 */

type ScriptState = CallScript | 'loading' | 'failed'

const SOURCE_META: Record<CallQueueItem['source'], { label: string; tone: 'special' | 'warn' | 'info' }> = {
  hand_raiser: { label: '🙋 They replied', tone: 'special' },
  follow_up: { label: '⏰ Follow-up due', tone: 'warn' },
  phone_first: { label: '📵 Phone is the only door', tone: 'info' },
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
  const [tally, setTally] = useState<Record<string, number>>({})
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

  const advance = () => {
    setNote('')
    setShowVoicemail(false)
    setPassPicker(false)
    setDemoPicker(false)
    setDemoAt('')
    setAttendeeEmail('')
    setError(null)
    setIdx((i) => i + 1)
  }

  const log = (outcome: string, lostReason?: string) => {
    if (!item) return
    setError(null)
    startTransition(async () => {
      try {
        await logCallOutcomeAction({
          prospectId: item.id,
          outcome,
          note: note.trim() || undefined,
          lostReason,
        })
        setTally((t) => ({ ...t, [outcome]: (t[outcome] ?? 0) + 1 }))
        advance()
      } catch {
        setError("Couldn't log that — try again.")
      }
    })
  }

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
        setTally((t) => ({ ...t, demo_booked: (t.demo_booked ?? 0) + 1 }))
        setBooked((b) => [...b, { id: item.id, name: item.name }])
        advance()
      } catch {
        setError("Couldn't book that — check the time and try again.")
      }
    })
  }

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
        <div className="mx-auto mt-4 flex max-w-xs flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          {Object.entries(tally).map(([k, n]) => (
            <div key={k} className="flex justify-between">
              <span>{k.replace(/_/g, ' ')}</span>
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
  const rating =
    item.googleRatingTenths != null
      ? `${(item.googleRatingTenths / 10).toFixed(1)}★${item.reviewCount != null ? ` (${item.reviewCount})` : ''}`
      : null

  return (
    <div>
      {/* Progress */}
      <div className="mb-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="font-semibold tabular-nums">
          Call {idx + 1} of {items.length}
        </span>
        <button type="button" onClick={advance} className="font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          Skip →
        </button>
      </div>
      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-sunk)]">
        <div
          className="h-full rounded-full bg-teal-500 transition-all"
          style={{ width: `${(idx / items.length) * 100}%` }}
        />
      </div>

      {/* The card */}
      <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-6 ring-1 ring-[color:var(--color-hairline)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{item.name}</h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {[item.city, item.state].filter(Boolean).join(', ')}
              {item.authorizedOfficialName ? ` · ${item.authorizedOfficialName}` : ''}
              {rating ? ` · ${rating}` : ''}
            </p>
          </div>
          <StatusPill tone={meta.tone} label={meta.label} />
        </div>

        {/* The dial */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] px-4 py-3">
          <a
            href={`tel:+1${item.phone}`}
            className="font-mono-num text-2xl font-bold tracking-tight text-teal-600 hover:underline dark:text-teal-400"
          >
            {fmtPhone(item.phone)}
          </a>
          {theirTime && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              their time: <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{theirTime}</span>
            </span>
          )}
        </div>

        {/* Warm signals — the "this isn't really cold" line. */}
        {(warm || item.intentSummary || item.followUpReason || item.lastCallOutcome) && (
          <div className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-300">
            {warm && (
              <p>
                ✉️ They've opened your emails{' '}
                <span className="font-semibold tabular-nums">{item.opens}×</span>
                {item.clicks > 0 && (
                  <>
                    {' '}
                    and clicked <span className="font-semibold tabular-nums">{item.clicks}×</span>
                  </>
                )}{' '}
                — they know the name.
              </p>
            )}
            {item.intentSummary && <p>💬 {item.intentSummary}</p>}
            {item.followUpReason && <p>⏰ You promised: {item.followUpReason}</p>}
            {item.lastCallOutcome && <p>📞 Last call: {item.lastCallOutcome.replace(/_/g, ' ')}</p>}
          </div>
        )}

        {/* The script */}
        <div className="mt-5 border-t border-[color:var(--color-hairline)] pt-4">
          {script === 'loading' || script === undefined ? (
            <div className="space-y-2">
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
            <div className="text-sm text-gray-500 dark:text-gray-400">
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
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  Open with
                </p>
                <p className="mt-1 text-[1.05rem] font-medium leading-relaxed text-gray-900 dark:text-gray-100">
                  “{script.opener}”
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Why them
                </p>
                <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{script.whyThem}</p>
              </div>
              {script.valuePoints.length > 0 && (
                <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  {script.valuePoints.map((v, i) => (
                    <li key={i}>• {v}</li>
                  ))}
                </ul>
              )}
              {script.objections.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    If they say…
                  </p>
                  <div className="mt-1.5 space-y-1.5">
                    {script.objections.map((o, i) => (
                      <div key={i} className="rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] px-3 py-2 text-sm">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">“{o.objection}”</span>
                        <span className="text-gray-600 dark:text-gray-300"> → {o.response}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  The ask
                </p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-gray-900 dark:text-gray-100">{script.ask}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowVoicemail((v) => !v)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                🎙 Voicemail script {showVoicemail ? '▲' : '▼'}
              </button>
              {showVoicemail && (
                <p className="rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] px-3 py-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  “{script.voicemail}”
                </p>
              )}
            </div>
          )}
        </div>

        {/* Note + outcomes */}
        <div className="mt-5 border-t border-[color:var(--color-hairline)] pt-4">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything to remember? (optional — lands in the call log)"
            className="form-input w-full text-sm"
            maxLength={500}
          />

          {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

          {demoPicker ? (
            <div className="mt-3 rounded-[var(--r-md)] bg-violet-500/10 p-3">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                🎉 Lock the time while they're on the phone
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={demoAt}
                  onChange={(e) => setDemoAt(e.target.value)}
                  className="form-input text-sm"
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
            <div className="mt-3 rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] p-3">
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
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton size="sm" variant="primary" disabled={pending} onClick={() => setDemoPicker(true)}>
                🎉 Demo booked
              </ActionButton>
              <ActionButton size="sm" variant="secondary" disabled={pending} onClick={() => log('callback')}>
                🔁 Callback
              </ActionButton>
              <ActionButton size="sm" variant="secondary" disabled={pending} onClick={() => log('voicemail')}>
                🎙 Voicemail
              </ActionButton>
              <ActionButton size="sm" variant="secondary" disabled={pending} onClick={() => log('no_answer')}>
                📵 No answer
              </ActionButton>
              <ActionButton size="sm" variant="secondary" disabled={pending} onClick={() => setPassPicker(true)}>
                ✕ Not interested
              </ActionButton>
            </div>
          )}

          <p className="mt-2 text-[0.7rem] text-gray-400 dark:text-gray-500">
            Callbacks, voicemails, and no-answers schedule their own follow-up — nothing drops.
          </p>
        </div>
      </div>
    </div>
  )
}
