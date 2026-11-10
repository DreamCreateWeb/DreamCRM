'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { TextInput } from '@/components/ui/form-fields'
import { StatusPill } from '@/components/ui/status-pill'
import { runAction } from '@/lib/run-action'
import type { CallerQueueItem } from '@/lib/services/prospect-callers'
import type { CallScript } from '@/lib/types/call-script'
import {
  CALLER_OUTCOME_KEYS,
  CALLER_OUTCOME_LABELS,
  CALLER_SKIP_REASONS,
  CALLER_SKIP_REASON_LABELS,
  LOSS_REASON_LABELS,
  MANUAL_LOSS_REASONS,
  PHONE_LINE_TYPE_LABELS,
  QUALITY_BAND_LABELS,
  formatProspectPhone,
  ratingLabel,
  type CallerSkipReason,
  type ProspectCallOutcome,
} from '@/lib/types/prospecting'
import { prospectInitials } from '@/lib/prospect-when'
import { TONE_FILL, TONE_PILL } from '@/lib/ui/encodings'
import {
  bookDemoAsCallerAction,
  getCallerScriptAction,
  logCallerOutcomeAction,
  skipProspectAction,
} from './actions'

/**
 * THE NEXT CALL (P-02) — one card at a time, the Call Mode pattern scoped
 * to the caller's own queue. Left: who, the number (tel:), their local time
 * + the call window, the line type, the previous attempts. Right: the AI
 * script. Bottom: the outcome dock on keys 1–9, plus Skip. Every write goes
 * through runAction; the busy state lives on the pressed button; a stale
 * build offers Refresh, never a retry.
 */

type ScriptState = CallScript | 'loading' | 'failed'
type Picker = null | 'demo' | 'pass' | 'callback' | 'skip'

const KEY_ICON: Record<ProspectCallOutcome, string> = {
  demo_booked: '🎉',
  not_interested: '✕',
  callback: '🔁',
  voicemail: '🎙',
  no_answer: '📵',
  gatekeeper: '🛎',
  disconnected: '☎︎✕',
  wrong_number: '↯',
  closed: '🚪',
  won: '🏆',
}

const SEGMENT_COLOR: Record<string, string> = {
  demo_booked: 'bg-emerald-500',
  callback: 'bg-amber-500',
  gatekeeper: 'bg-amber-300',
  voicemail: 'bg-gray-400 dark:bg-gray-500',
  no_answer: 'bg-gray-300 dark:bg-gray-600',
  not_interested: 'bg-rose-400',
  disconnected: 'bg-rose-300',
  wrong_number: 'bg-rose-300',
  closed: 'bg-gray-500 dark:bg-gray-400',
  skipped: 'bg-[color:var(--color-surface-sunk)]',
}

const ATTEMPT_LABELS: Record<string, string> = { ...CALLER_OUTCOME_LABELS, skipped: 'Skipped' }

function localTime(timezone: string | null): string | null {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date())
  } catch {
    return null
  }
}

function zoneName(timezone: string | null): string | null {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value ?? null
  } catch {
    return null
  }
}

function fmtAttemptDate(d: Date | string): string {
  const at = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(at)
}

export default function CallerSession({ items, hostTimeZone }: { items: CallerQueueItem[]; hostTimeZone: string }) {
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const [scripts, setScripts] = useState<Record<string, ScriptState>>({})
  const [results, setResults] = useState<Array<string | null>>(() => items.map(() => null))
  const [note, setNote] = useState('')
  const [picker, setPicker] = useState<Picker>(null)
  const [showVoicemail, setShowVoicemail] = useState(false)
  const [demoDay, setDemoDay] = useState('')
  const [demoTime, setDemoTime] = useState('')
  const [attendeeEmail, setAttendeeEmail] = useState('')
  const [callbackDay, setCallbackDay] = useState('')
  const [callbackTime, setCallbackTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<string | null>(null)

  const item = idx < items.length ? items[idx] : null
  const done = idx >= items.length
  const tally = useMemo(() => {
    const t: Record<string, number> = {}
    for (const r of results) if (r && r !== 'skipped') t[r] = (t[r] ?? 0) + 1
    return t
  }, [results])
  const totalLogged = useMemo(() => Object.values(tally).reduce((a, b) => a + b, 0), [tally])

  const requested = useRef(new Set<string>())
  const ensureScript = useCallback((id: string | undefined) => {
    if (!id || requested.current.has(id)) return
    requested.current.add(id)
    setScripts((s) => ({ ...s, [id]: 'loading' }))
    void runAction(() => getCallerScriptAction(id)).then((r) =>
      setScripts((cur) => ({ ...cur, [id]: r.ok && r.script ? r.script : 'failed' })),
    )
  }, [])
  useEffect(() => {
    ensureScript(items[idx]?.id)
    ensureScript(items[idx + 1]?.id)
  }, [idx, items, ensureScript])

  const advance = (outcome: string) => {
    setResults((r) => r.map((v, i) => (i === idx ? outcome : v)))
    setNote('')
    setPicker(null)
    setShowVoicemail(false)
    setDemoDay('')
    setDemoTime('')
    setAttendeeEmail('')
    setCallbackDay('')
    setCallbackTime('')
    setError(null)
    setIdx((i) => i + 1)
  }

  const fail = (r: { error: string; stale?: true }) => {
    setError(r.error)
    if (r.stale) setStale(true)
  }

  const log = useCallback(
    (outcome: ProspectCallOutcome, extra: { lostReason?: string; callbackDay?: string; callbackTime?: string } = {}) => {
      if (!item || pending) return
      setError(null)
      setActive(extra.lostReason ? `lost-${extra.lostReason}` : outcome)
      startTransition(async () => {
        try {
          const r = await runAction(() =>
            logCallerOutcomeAction({ prospectId: item.id, outcome, note: note.trim() || undefined, ...extra }),
          )
          if (r.ok) advance(outcome)
          else fail(r)
        } finally {
          setActive(null)
        }
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item, pending, note, idx],
  )

  const bookDemo = () => {
    if (!item || !demoDay || !demoTime) return
    setError(null)
    setActive('demo')
    startTransition(async () => {
      try {
        const r = await runAction(() =>
          bookDemoAsCallerAction({
            prospectId: item.id,
            demoDay,
            demoTime,
            attendeeName: item.authorizedOfficialName ?? undefined,
            attendeeEmail: attendeeEmail.trim() || undefined,
            note: note.trim() || undefined,
          }),
        )
        if (r.ok) advance('demo_booked')
        else fail(r)
      } finally {
        setActive(null)
      }
    })
  }

  const skip = (reason: CallerSkipReason) => {
    if (!item || pending) return
    setError(null)
    setActive(`skip-${reason}`)
    startTransition(async () => {
      try {
        const r = await runAction(() => skipProspectAction({ prospectId: item.id, reason, note: note.trim() || undefined }))
        if (r.ok) advance('skipped')
        else fail(r)
      } finally {
        setActive(null)
      }
    })
  }

  // Keys 1–9 in CALLER_OUTCOME_KEYS order; 1 opens the demo form, 2 the
  // pass reasons, 3 the callback time; Esc closes a picker. Silent in inputs
  // and on any modified combo — Ctrl/Cmd+4 is "switch to tab 4", never a
  // voicemail logged on a practice nobody dialled (the same rule as the
  // dashboard's keyboard-shortcuts).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if (done || pending || stale) return
      if (e.key === 'Escape') return setPicker(null)
      if (picker) return
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > CALLER_OUTCOME_KEYS.length) return
      const outcome = CALLER_OUTCOME_KEYS[n - 1]
      if (outcome === 'demo_booked') setPicker('demo')
      else if (outcome === 'not_interested') setPicker('pass')
      else if (outcome === 'callback') setPicker('callback')
      else log(outcome)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, pending, picker, log, stale])

  if (done) {
    const demos = tally.demo_booked ?? 0
    return (
      <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-8 text-center ring-1 ring-[color:var(--color-hairline)]">
        <p className="text-4xl" aria-hidden="true">
          {demos > 0 ? '🎉' : totalLogged > 0 ? '👏' : '🌤'}
        </p>
        <h2 className="mt-3 text-xl font-bold text-gray-900 dark:text-gray-100">
          {totalLogged === 0 ? 'That’s the queue — nothing logged' : `${totalLogged} call${totalLogged === 1 ? '' : 's'} done`}
        </h2>
        {demos > 0 && (
          <p className="mt-1 text-sm font-semibold text-violet-600 dark:text-violet-400">
            {demos} demo{demos === 1 ? '' : 's'} booked
          </p>
        )}
        <div className="mx-auto mt-5 flex max-w-md gap-1">
          {results.map((r, i) => (
            <span
              key={i}
              title={`Call ${i + 1} — ${r ? (ATTEMPT_LABELS[r] ?? r) : 'not logged'}`}
              className={`h-2 flex-1 rounded-full ${r ? (SEGMENT_COLOR[r] ?? 'bg-gray-300') : 'bg-[color:var(--color-surface-sunk)]'}`}
            />
          ))}
        </div>
        <div className="mt-6 flex justify-center gap-2">
          <ActionButton variant="primary" onClick={() => router.refresh()}>
            See what’s next
          </ActionButton>
        </div>
      </div>
    )
  }
  if (!item) return null

  const script = scripts[item.id]
  const theirTime = localTime(item.timezone)
  const theirZone = zoneName(item.timezone)
  const rating = ratingLabel(item.googleRatingTenths, item.reviewCount)
  const lineType = item.phoneLineType ? PHONE_LINE_TYPE_LABELS[item.phoneLineType] : null

  return (
    <div>
      {/* Session strip */}
      <div className="mb-5 flex items-center gap-3">
        <span className="whitespace-nowrap font-mono-num text-xs font-bold text-gray-700 dark:text-gray-200">
          CALL {idx + 1} <span className="text-gray-500 dark:text-gray-400">/ {items.length}</span>
        </span>
        <div className="flex flex-1 gap-1">
          {items.map((_, i) => (
            <span
              key={i}
              title={`Call ${i + 1} — ${i === idx ? 'current call' : results[i] ? (ATTEMPT_LABELS[results[i]!] ?? results[i]) : 'up next'}`}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i === idx
                  ? 'bg-[color:var(--color-surface-2)] ring-2 ring-teal-500'
                  : results[i]
                    ? (SEGMENT_COLOR[results[i]!] ?? 'bg-gray-300')
                    : 'bg-[color:var(--color-surface-sunk)]'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={pending || stale}
          onClick={() => setPicker(picker === 'skip' ? null : 'skip')}
          className="whitespace-nowrap text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Skip →
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[330px_1fr]">
        {/* Dial zone */}
        <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-5 ring-1 ring-[color:var(--color-hairline)] lg:sticky lg:top-4">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-base font-extrabold ${TONE_FILL.info}`}
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
                <p className="text-xs text-gray-500 dark:text-gray-400">Ask for {item.authorizedOfficialName}</p>
              )}
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {item.callbackAt && <StatusPill tone="warn" label="⏰ Callback due" title={item.followUpReason ?? undefined} />}
            {item.qualityBand && (
              <StatusPill
                tone={item.qualityBand === 'best' ? 'ok' : 'neutral'}
                label={`${QUALITY_BAND_LABELS[item.qualityBand]}${item.qualityScore != null ? ` · ${item.qualityScore}` : ''}`}
                title="How reachable this practice is — verified by Dream Create"
              />
            )}
            {lineType && <StatusPill tone="neutral" label={lineType} title="Line type" />}
          </div>

          <a
            href={`tel:+1${item.phone}`}
            className="relative mt-4 block rounded-[var(--r-md)] bg-gradient-to-b from-teal-700 to-teal-600 px-4 py-4 text-center transition hover:from-teal-800 hover:to-teal-700"
          >
            <span className="absolute right-3 top-2.5 h-2 w-2 animate-pulse rounded-full bg-teal-200" aria-hidden="true" />
            <span className="font-mono-num text-2xl font-extrabold tracking-tight text-white">
              {formatProspectPhone(item.phone)}
            </span>
            <span className="mt-0.5 block text-xs text-teal-100/80">tap to call</span>
          </a>

          {theirTime && (
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>their local time{theirZone ? ` (${theirZone})` : ''}</span>
              <span className="font-mono-num font-semibold text-gray-700 dark:text-gray-200">{theirTime}</span>
            </div>
          )}
          {item.callWindow.label && (
            <p
              className={`mt-1 text-right text-xs font-semibold ${
                item.callWindow.score >= 3
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : item.callWindow.good
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {item.callWindow.score >= 3 ? '☀️ ' : '⏳ '}
              {item.callWindow.label}
            </p>
          )}
          {item.websiteUrl && (
            <a
              href={item.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block truncate text-xs text-teal-600 hover:underline dark:text-teal-400"
            >
              {item.websiteUrl.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          )}

          {item.attempts.length > 0 && (
            <div className="mt-4 border-t border-[color:var(--color-hairline)] pt-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Previous attempts</p>
              <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {item.attempts.map((a, i) => (
                  <li key={i}>
                    <span className="font-mono-num text-gray-500 dark:text-gray-400">{fmtAttemptDate(a.at)}</span>{' '}
                    <span className="font-semibold">{ATTEMPT_LABELS[a.outcome] ?? a.outcome.replace(/_/g, ' ')}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {' '}
                      · {a.mine ? 'you' : a.byOwner ? 'Dream Create' : 'another caller'}
                    </span>
                    {a.note && <span className="block text-gray-500 dark:text-gray-400">“{a.note}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* The script */}
        <div className="rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] px-6 py-5 ring-1 ring-[color:var(--color-hairline)]">
          {script === 'loading' || script === undefined ? (
            <div className="space-y-2 py-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">✨ Writing their script…</p>
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
                  {item.websiteUrl
                    ? 'Their website has gaps Dream Create fixes.'
                    : 'They have no website — new patients can’t find them.'}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <ScriptStage n={1} label="Open with" tone="teal">
                <p className="text-[1.15rem] font-medium leading-relaxed text-gray-900 dark:text-gray-100">“{script.opener}”</p>
              </ScriptStage>
              <ScriptStage n={2} label="Why them" tone="gray">
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{script.whyThem}</p>
                {script.valuePoints.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    {script.valuePoints.map((v, i) => (
                      <li key={i}>• {v}</li>
                    ))}
                  </ul>
                )}
              </ScriptStage>
              {script.objections.length > 0 && (
                <ScriptStage n={3} label="If they say…" tone="gray">
                  <div className="space-y-1.5">
                    {script.objections.map((o, i) => (
                      <div key={i} className="rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] px-3 py-2 text-sm leading-relaxed">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">“{o.objection}”</span>
                        <span className="text-gray-600 dark:text-gray-300"> → {o.response}</span>
                      </div>
                    ))}
                  </div>
                </ScriptStage>
              )}
              <ScriptStage n={4} label="The ask" tone="violet">
                <p className="text-[0.95rem] font-semibold leading-relaxed text-gray-900 dark:text-gray-100">{script.ask}</p>
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
              </ScriptStage>
            </div>
          )}
        </div>
      </div>

      {/* Outcome dock */}
      <div className="sticky bottom-4 mt-4 rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] p-3.5 shadow-lg ring-1 ring-[color:var(--color-hairline)]">
        {error && (
          <p role="alert" className="mb-2 flex flex-wrap items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
            {stale && (
              <ActionButton size="sm" variant="secondary" onClick={() => window.location.reload()}>
                Refresh
              </ActionButton>
            )}
          </p>
        )}

        {picker === 'demo' ? (
          <div className={`rounded-[var(--r-md)] p-3 ${TONE_PILL.info}`}>
            <p className="text-xs font-semibold">
              🎉 Lock the time while they’re on the phone — on Dream Create’s clock ({hostTimeZone.replace(/_/g, ' ')})
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TextInput type="date" value={demoDay} onChange={(e) => setDemoDay(e.target.value)} className="text-sm" aria-label="Demo day" autoFocus />
              <TextInput type="time" value={demoTime} onChange={(e) => setDemoTime(e.target.value)} className="text-sm" aria-label="Demo time" />
              <TextInput
                type="email"
                value={attendeeEmail}
                onChange={(e) => setAttendeeEmail(e.target.value)}
                placeholder="their email (optional)"
                className="w-52 text-sm"
                aria-label="Their email"
              />
              <ActionButton
                size="sm"
                variant="primary"
                pending={pending && active === 'demo'}
                disabled={pending || stale || !demoDay || !demoTime}
                onClick={bookDemo}
              >
                Book it
              </ActionButton>
              <ActionButton size="sm" variant="ghost" disabled={pending} onClick={() => setPicker(null)}>
                Cancel
              </ActionButton>
            </div>
          </div>
        ) : picker === 'pass' ? (
          <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] p-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Why’d they pass?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MANUAL_LOSS_REASONS.map((key) => (
                <ActionButton
                  key={key}
                  size="sm"
                  variant="secondary"
                  pending={pending && active === `lost-${key}`}
                  disabled={pending || stale}
                  onClick={() => log('not_interested', { lostReason: key })}
                >
                  {LOSS_REASON_LABELS[key]}
                </ActionButton>
              ))}
              <ActionButton size="sm" variant="ghost" disabled={pending} onClick={() => setPicker(null)}>
                Cancel
              </ActionButton>
            </div>
          </div>
        ) : picker === 'callback' ? (
          <div className={`rounded-[var(--r-md)] p-3 ${TONE_PILL.warn}`}>
            <p className="text-xs font-semibold">
              🔁 When did they ask you to call back? Their time{theirZone ? ` (${theirZone})` : ''}.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TextInput type="date" value={callbackDay} onChange={(e) => setCallbackDay(e.target.value)} className="text-sm" aria-label="Callback day" autoFocus />
              <TextInput type="time" value={callbackTime} onChange={(e) => setCallbackTime(e.target.value)} className="text-sm" aria-label="Callback time" />
              <ActionButton
                size="sm"
                variant="primary"
                pending={pending && active === 'callback'}
                disabled={pending || stale || !callbackDay || !callbackTime}
                onClick={() => log('callback', { callbackDay, callbackTime })}
              >
                Set the callback
              </ActionButton>
              <ActionButton size="sm" variant="ghost" disabled={pending} onClick={() => setPicker(null)}>
                Cancel
              </ActionButton>
            </div>
          </div>
        ) : picker === 'skip' ? (
          <div className="rounded-[var(--r-md)] bg-[color:var(--color-surface-sunk)] p-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              Skip this one. “Come back to it later” sends it back to the pool for a few days; “not a fit” and
              “already spoke” take it off the callers’ list for good. Why?
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CALLER_SKIP_REASONS.map((key) => (
                <ActionButton
                  key={key}
                  size="sm"
                  variant="secondary"
                  pending={pending && active === `skip-${key}`}
                  disabled={pending || stale}
                  onClick={() => skip(key)}
                >
                  {CALLER_SKIP_REASON_LABELS[key]}
                </ActionButton>
              ))}
              <ActionButton size="sm" variant="ghost" disabled={pending} onClick={() => setPicker(null)}>
                Cancel
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything to remember? (optional)"
              className="min-w-[200px] flex-1 rounded-full text-sm"
              maxLength={500}
              aria-label="Note"
            />
            {CALLER_OUTCOME_KEYS.map((outcome, i) => (
              <OutcomeButton
                key={outcome}
                kbd={String(i + 1)}
                primary={outcome === 'demo_booked'}
                disabled={pending || stale}
                busy={pending && active === outcome}
                onClick={() => {
                  if (outcome === 'demo_booked') setPicker('demo')
                  else if (outcome === 'not_interested') setPicker('pass')
                  else if (outcome === 'callback') setPicker('callback')
                  else log(outcome)
                }}
              >
                {KEY_ICON[outcome]} {CALLER_OUTCOME_LABELS[outcome]}
              </OutcomeButton>
            ))}
          </div>
        )}

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Keys 1–9 log outcomes · 7, 8 and 9 park a dead number or a closed practice for good · voicemails, no-answers
          and callbacks come back to your queue at their time.
        </p>
      </div>
    </div>
  )
}

function ScriptStage({
  n,
  label,
  tone,
  children,
}: {
  n: number
  label: string
  tone: 'teal' | 'gray' | 'violet'
  children: React.ReactNode
}) {
  // A solid fill with a label on it comes from TONE_FILL (the a11y registry).
  const badge =
    tone === 'teal'
      ? TONE_FILL.ok
      : tone === 'violet'
        ? TONE_FILL.info
        : 'bg-[color:var(--color-surface-sunk)] text-gray-600 dark:text-gray-300'
  return (
    <div className="flex gap-3">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono-num text-xs font-bold ${badge}`} aria-hidden="true">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  )
}

function OutcomeButton({
  children,
  kbd,
  primary,
  disabled,
  busy,
  onClick,
}: {
  children: React.ReactNode
  kbd: string
  primary?: boolean
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-[var(--r-md)] px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
        primary
          ? 'bg-teal-600 text-white hover:opacity-90'
          : 'bg-[color:var(--color-surface-2)] text-gray-700 ring-1 ring-[color:var(--color-hairline)] hover:ring-gray-400 dark:text-gray-200'
      }`}
    >
      <span className={busy ? 'opacity-60' : ''}>{children}</span>
      <span
        className={`rounded px-1.5 font-mono-num text-xs font-semibold ${
          primary ? 'bg-white/20 text-white' : 'bg-[color:var(--color-surface-sunk)] text-gray-500 dark:text-gray-400'
        }`}
      >
        {kbd}
      </span>
    </button>
  )
}
