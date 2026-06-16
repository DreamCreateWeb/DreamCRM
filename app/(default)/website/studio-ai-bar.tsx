'use client'

import { useEffect, useRef, useState } from 'react'
import { runAiWebsiteEdit, undoAiWebsiteEdit } from './ai-edit-action'
import type { AiUsageSnapshot } from '@/lib/types/ai-website'

/**
 * Floating AI command bar for the Website Studio. The owner types a plain-
 * language instruction; the AI applies the edits and (when "Follow along" is on)
 * the canvas jumps to + flashes the change. Every change is shown as a
 * before→after so mistakes are obvious, with one-click Undo as the safety net.
 */
type Phase = 'idle' | 'working' | 'done' | 'error'
type EditDetail = { label: string; preview: string; anchor: string | null; page: string }
export type UndoData = { before: Record<string, unknown>; page: string; anchor: string | null }

const FOLLOW_KEY = 'dc-studio-follow'

/**
 * Plain-language starters so a non-technical front-desk person knows what they
 * can ask — they don't think in "Hero" / "section" terms, they think "my hours"
 * and "my phone number". Clicking one drops an editable example into the box
 * (we focus + place the cursor at the end), teaching the vocabulary by example
 * rather than making them guess. Each maps to something the edit engine
 * (lib/services/ai-website-edit.ts) actually understands. Order = likely use.
 */
const SUGGESTIONS: { label: string; fill: string }[] = [
  { label: 'Change my hours', fill: 'Change my hours to ' },
  { label: 'Update my phone number', fill: 'Change my phone number to ' },
  { label: 'Make my intro warmer', fill: 'Make my homepage intro warmer and more welcoming' },
  { label: 'Reword my headline', fill: 'Reword my homepage headline to feel more inviting' },
  { label: 'Add a service', fill: 'Add a service for ' },
  { label: 'List insurance I accept', fill: 'We accept ' },
  { label: 'Add a common question', fill: 'Add a question and answer: ' },
  { label: 'Change my brand color', fill: 'Change my brand color to ' },
]

export default function StudioAiBar({
  onApplied,
  usage,
  onUsage,
  undoData,
  onUndoData,
  hidden,
}: {
  onApplied: (opts: {
    page: string
    anchor: string | null
    edits: { anchor: string | null; page: string }[]
    follow: boolean
  }) => void
  /** Lifted to the Studio shell so the bar + section-modal rewrite buttons share
   *  one monthly counter. */
  usage: AiUsageSnapshot
  onUsage: (next: AiUsageSnapshot) => void
  /** Lifted so the one-click Undo SURVIVES a section modal opening on top — the
   *  bar is CSS-hidden under the modal (not unmounted), and the undo target
   *  lives in the shell either way. */
  undoData: UndoData | null
  onUndoData: (next: UndoData | null) => void
  /** When a section modal is open the bar hides visually but stays mounted so
   *  its done-panel + Undo aren't lost. */
  hidden?: boolean
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [summary, setSummary] = useState('')
  const [details, setDetails] = useState<EditDetail[]>([])
  const [error, setError] = useState('')
  const [isClarify, setIsClarify] = useState(false)
  const [follow, setFollow] = useState(true)
  const [undoing, setUndoing] = useState(false)
  const [isLimit, setIsLimit] = useState(false)
  const outOfEdits = usage.remaining <= 0
  // The done-panel (summary of the last edit) should re-appear when the modal
  // closes if there's still an undoable edit pending.
  const showDonePanel = phase === 'done' || (!!undoData && phase === 'idle' && details.length > 0)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(FOLLOW_KEY) === '0') setFollow(false)
    } catch {
      /* ignore */
    }
  }, [])
  function toggleFollow() {
    setFollow((f) => {
      const next = !f
      try {
        window.localStorage.setItem(FOLLOW_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  /** Drop a starter into the box + focus it (cursor at the end) so they can
   *  finish the thought and send — never auto-sends, so they always review. */
  function applySuggestion(fill: string) {
    setValue(fill)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      const end = el.value.length
      try {
        el.setSelectionRange(end, end)
      } catch {
        /* some input types reject setSelectionRange — focus is enough */
      }
    })
  }

  async function submit() {
    const text = value.trim()
    if (!text || phase === 'working' || outOfEdits) return
    setPhase('working')
    setError('')
    setIsClarify(false)
    setIsLimit(false)
    setDetails([])
    setSummary('')
    try {
      const res = await runAiWebsiteEdit(text)
      if (res.ok) {
        setSummary(res.summary)
        setDetails(res.edits)
        onUndoData({ before: res.before, page: res.page, anchor: res.anchor })
        onUsage(res.usage)
        setValue('')
        setPhase('done')
        onApplied({ page: res.page, anchor: res.anchor, edits: res.edits, follow })
        // The done panel (with Undo) stays put until the owner dismisses it or
        // runs the next edit — the safety net must never vanish on its own while
        // they're still checking the change across their site.
      } else {
        setError(res.error)
        setIsClarify(!!res.clarify)
        setIsLimit(!!res.limit)
        if (res.usage) onUsage(res.usage)
        setPhase('error')
      }
    } catch {
      setError('Something went wrong — try again.')
      setIsClarify(false)
      setIsLimit(false)
      setPhase('error')
    }
  }

  async function undo() {
    if (!undoData || undoing) return
    setUndoing(true)
    try {
      const r = await undoAiWebsiteEdit(undoData.before)
      if (r.ok) {
        onApplied({ page: undoData.page, anchor: undoData.anchor, edits: [], follow })
        setPhase('idle')
        setDetails([])
        onUndoData(null)
      }
    } finally {
      setUndoing(false)
    }
  }

  const working = phase === 'working'

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-[65] flex justify-center px-4 pb-6 ${hidden ? 'invisible' : ''}`}
      aria-hidden={hidden ? true : undefined}
    >
      {/* Stacked panels (done-summary + status + bar). No overflow clip here —
          the only long part (the edit list) self-caps + scrolls on its own
          (max-h-48 below). Clipping HERE would fight the glow's -inset-3 bleed
          and leave two stuck scrollbars that don't actually scroll. */}
      <div className="pointer-events-auto w-full max-w-xl relative">
        {/* Glow behind the bar */}
        <div
          aria-hidden="true"
          className={`absolute -inset-3 rounded-full bg-gradient-to-r from-teal-500/50 via-teal-400/40 to-teal-600/50 blur-2xl transition-opacity duration-500 ${
            working ? 'opacity-90 animate-pulse' : 'opacity-0'
          }`}
        />

        {/* Done panel — what changed + Undo */}
        {showDonePanel && (
          <div className="relative mb-2.5 rounded-[var(--r-lg)] bg-gray-900/90 backdrop-blur-xl border border-white/10 shadow-[var(--shadow-modal)] p-3 text-gray-100">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 min-w-0">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 10l3.5 3.5L15 6" /></svg>
                <span className="truncate">{summary}</span>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={undo}
                  disabled={undoing}
                  title="Undo last AI change"
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 py-1 text-xs font-semibold text-white transition disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 5L4 9l4 4M4 9h8a4 4 0 010 8h-1" /></svg>
                  {undoing ? 'Undoing…' : 'Undo last AI change'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhase('idle')
                    setDetails([])
                    onUndoData(null)
                  }}
                  className="w-6 h-6 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition"
                  aria-label="Dismiss"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"><path d="M6 6l8 8M14 6l-8 8" /></svg>
                </button>
              </div>
            </div>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {details.map((e, i) => (
                <li key={`${e.label}-${i}`} className="flex items-baseline gap-1.5 text-xs min-w-0">
                  <span className="shrink-0 text-gray-400">{e.label}</span>
                  <span className="shrink-0 text-gray-500">→</span>
                  <span className="truncate text-gray-100">{e.preview}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Status (left) + Follow toggle (right) */}
        <div className="relative mb-2.5 flex items-center justify-between gap-2 min-h-[28px]">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {working && (
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-900/85 backdrop-blur-xl border border-white/10 px-3.5 py-1.5 text-sm font-medium text-gray-100 shadow-lg">
                <Sparkle className="w-4 h-4 text-teal-300 [animation:spin_2.4s_linear_infinite]" />
                Updating your site…
              </span>
            )}
            {phase === 'error' && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium text-white shadow-lg ${
                  isClarify || isLimit ? 'bg-amber-500/90' : 'bg-rose-500/90'
                }`}
              >
                {isLimit ? '✨' : isClarify ? '🤔' : ''} {error}
              </span>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-1.5">
            {/* Monthly AI-edit allowance — AI edits spend tokens, so they're metered. */}
            <span
              title="AI edits use AI and are metered monthly — they reset on the 1st. Editing by hand is always free."
              className={`inline-flex items-center gap-1 rounded-full bg-gray-900/85 backdrop-blur-xl border px-2.5 py-1 text-xs font-medium ${
                outOfEdits ? 'border-amber-400/40 text-amber-300' : 'border-white/10 text-gray-300'
              }`}
            >
              <Sparkle className="w-3 h-3" />
              {outOfEdits ? 'No AI edits left' : `${usage.remaining} AI edit${usage.remaining === 1 ? '' : 's'} left`}
            </span>
            <button
              type="button"
              onClick={toggleFollow}
              title={
                follow
                  ? 'Following — the viewport jumps to each change'
                  : 'Background — edits apply without moving the viewport'
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-gray-900/85 backdrop-blur-xl border border-white/10 pl-2.5 pr-1.5 py-1 text-xs font-medium text-gray-300 hover:text-white transition"
            >
              {follow ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Follow along</span>
              <span className={`relative w-7 h-4 rounded-full transition-colors ${follow ? "bg-teal-500" : "bg-gray-600"}`}>
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${follow ? 'translate-x-3' : ''}`} />
              </span>
            </button>
          </div>
        </div>

        {/* Plain-language starters — only while the box is empty + idle, so they
            read as "here's what you can ask" and get out of the way the moment
            they start typing. Hidden scrollbar (intentional horizontal scroll,
            no visible track — unlike the stuck-scrollbar bug above). */}
        {!working && !value.trim() && !outOfEdits && (
          <div className="relative mb-2.5 flex items-center gap-2">
            <span className="shrink-0 pl-1 text-xs font-medium text-gray-400 select-none">Try</span>
            <div
              className="dc-ai-suggest flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
              style={{ scrollbarWidth: 'none' }}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => applySuggestion(s.fill)}
                  className="shrink-0 whitespace-nowrap rounded-full bg-gray-900/85 backdrop-blur-xl border border-white/10 px-3 py-1 text-xs font-medium text-gray-200 transition hover:border-teal-400/50 hover:text-white"
                >
                  {s.label}
                </button>
              ))}
            </div>
            <style>{`.dc-ai-suggest::-webkit-scrollbar{display:none}`}</style>
          </div>
        )}

        {/* The bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="relative flex items-center gap-2 rounded-full bg-gray-900/85 backdrop-blur-xl border border-white/10 shadow-[var(--shadow-modal)] pl-4 pr-2 py-2"
        >
          <Sparkle className={`w-5 h-5 shrink-0 ${working ? "text-teal-300 animate-pulse" : "text-teal-200"}`} />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={working || outOfEdits}
            placeholder={
              outOfEdits
                ? 'Out of AI edits this month — edit by hand, or they reset on the 1st'
                : 'Ask AI to change anything — “close at 3pm on Fridays”'
            }
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none disabled:opacity-60"
            aria-label="Ask the AI to edit your website"
          />
          <button
            type="submit"
            disabled={!value.trim() || working || outOfEdits}
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-teal-400 text-white dark:text-gray-900 shadow-md transition hover:brightness-110 disabled:opacity-40 disabled:cursor-default"
            aria-label="Send"
          >
            {working ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-90" d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2z" />
      <path d="M19 14l.8 2.7L22.5 17l-2.7.8L19 20.5l-.8-2.7L15.5 17l2.7-.8L19 14z" opacity="0.7" />
    </svg>
  )
}

function Eye({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOff({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 5.1A9.6 9.6 0 0112 5c6.5 0 10 7 10 7a13.2 13.2 0 01-2.2 2.9M6.5 6.5C3.6 8.2 2 12 2 12s3.5 7 10 7a9.4 9.4 0 004.5-1.1M3 3l18 18M9.5 9.5a3 3 0 004.2 4.2" />
    </svg>
  )
}
