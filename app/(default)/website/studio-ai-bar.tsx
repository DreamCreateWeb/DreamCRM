'use client'

import { useEffect, useState } from 'react'
import { runAiWebsiteEdit } from './ai-edit-action'

/**
 * Floating AI command bar for the Website Studio. The clinic owner types a
 * plain-language instruction; the AI applies the edits and — when "Follow
 * along" is on — the canvas jumps to the changed section and flashes it. With
 * it off, the edit runs in the background and the viewport stays put, so staff
 * can fire an update and move on to another task.
 */
type Phase = 'idle' | 'working' | 'done' | 'error'

const FOLLOW_KEY = 'dc-studio-follow'

export default function StudioAiBar({
  onApplied,
}: {
  onApplied: (page: string, anchor: string | null, follow: boolean) => void
}) {
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [summary, setSummary] = useState('')
  const [edits, setEdits] = useState<string[]>([])
  const [error, setError] = useState('')
  const [follow, setFollow] = useState(true)

  // Persist the "follow" preference across sessions.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(FOLLOW_KEY)
      if (v === '0') setFollow(false)
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

  async function submit() {
    const text = value.trim()
    if (!text || phase === 'working') return
    setPhase('working')
    setError('')
    setEdits([])
    setSummary('')
    try {
      const res = await runAiWebsiteEdit(text)
      if (res.ok) {
        setSummary(res.summary)
        setEdits(res.edits.map((e) => e.label))
        setValue('')
        setPhase('done')
        onApplied(res.page, res.anchor, follow)
        window.setTimeout(() => setPhase((p) => (p === 'done' ? 'idle' : p)), 5000)
      } else {
        setError(res.error)
        setPhase('error')
      }
    } catch {
      setError('Something went wrong — try again.')
      setPhase('error')
    }
  }

  const working = phase === 'working'

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] flex justify-center px-4 pb-6">
      <div className="pointer-events-auto w-full max-w-xl relative">
        {/* Glow behind the bar — intensifies while working */}
        <div
          aria-hidden="true"
          className={`absolute -inset-3 rounded-full bg-gradient-to-r from-violet-500/50 via-fuchsia-500/40 to-sky-500/50 blur-2xl transition-opacity duration-500 ${
            working ? 'opacity-90 animate-pulse' : 'opacity-0'
          }`}
        />

        {/* Status (left) + Follow toggle (right) */}
        <div className="relative mb-2.5 flex items-center justify-between gap-2 min-h-[28px]">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {working && (
              <span className="inline-flex items-center gap-2 rounded-full bg-stone-900/85 backdrop-blur-xl border border-white/10 px-3.5 py-1.5 text-[13px] font-medium text-stone-100 shadow-lg">
                <Sparkle className="w-4 h-4 text-fuchsia-300 [animation:spin_2.4s_linear_infinite]" />
                Updating your site…
              </span>
            )}
            {phase === 'done' && (
              <>
                {summary && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1.5 text-[13px] font-semibold text-white shadow-lg">
                    ✓ {summary}
                  </span>
                )}
                {edits.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center rounded-full bg-stone-900/85 backdrop-blur-xl border border-white/10 px-2.5 py-1 text-[12px] font-medium text-stone-200 shadow"
                  >
                    {e}
                  </span>
                ))}
              </>
            )}
            {phase === 'error' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/90 px-3.5 py-1.5 text-[13px] font-medium text-white shadow-lg">
                {error}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={toggleFollow}
            title={
              follow
                ? 'Following — the viewport jumps to each change'
                : 'Background — edits apply without moving the viewport'
            }
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-stone-900/85 backdrop-blur-xl border border-white/10 pl-2.5 pr-1.5 py-1 text-[11px] font-medium text-stone-300 hover:text-white transition"
          >
            {follow ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Follow along</span>
            <span
              className={`relative w-7 h-4 rounded-full transition-colors ${follow ? 'bg-violet-500' : 'bg-stone-600'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${follow ? 'translate-x-3' : ''}`}
              />
            </span>
          </button>
        </div>

        {/* The bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="relative flex items-center gap-2 rounded-full bg-stone-900/85 backdrop-blur-xl border border-white/10 shadow-2xl pl-4 pr-2 py-2"
        >
          <Sparkle className={`w-5 h-5 shrink-0 ${working ? 'text-fuchsia-300 animate-pulse' : 'text-violet-300'}`} />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={working}
            placeholder="Ask AI to change anything — “make the headline bolder”"
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder-stone-400 focus:outline-none disabled:opacity-60"
            aria-label="Ask the AI to edit your website"
          />
          <button
            type="submit"
            disabled={!value.trim() || working}
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md transition hover:brightness-110 disabled:opacity-40 disabled:cursor-default"
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
