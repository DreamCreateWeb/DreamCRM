'use client'

import { useState } from 'react'
import { runAiWebsiteEdit } from './ai-edit-action'

/**
 * Floating AI command bar for the Website Studio. The clinic owner types a
 * plain-language instruction; the AI applies the edits and the parent reloads
 * the canvas to follow the change. It doesn't chat back — it shows what it
 * changed and lets the live site speak for itself.
 */
type Phase = 'idle' | 'working' | 'done' | 'error'

export default function StudioAiBar({ onApplied }: { onApplied: (page: string) => void }) {
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [summary, setSummary] = useState('')
  const [edits, setEdits] = useState<string[]>([])
  const [error, setError] = useState('')

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
        onApplied(res.page)
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

        {/* Status row — appears above the bar */}
        {phase !== 'idle' && (
          <div className="relative mb-2.5 flex flex-wrap items-center justify-center gap-2 text-center">
            {working && (
              <span className="inline-flex items-center gap-2 rounded-full bg-stone-900/85 backdrop-blur-xl border border-white/10 px-3.5 py-1.5 text-[13px] font-medium text-stone-100 shadow-lg">
                <Sparkle className="w-4 h-4 text-fuchsia-300 [animation:spin_2.4s_linear_infinite]" />
                Updating your site…
              </span>
            )}
            {phase === 'done' && (
              <>
                {summary && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-lg">
                    ✓ {summary}
                  </span>
                )}
                {edits.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center rounded-full bg-stone-900/85 backdrop-blur-xl border border-white/10 px-3 py-1 text-[12px] font-medium text-stone-200 shadow"
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
        )}

        {/* The bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="relative flex items-center gap-2 rounded-full bg-stone-900/85 backdrop-blur-xl border border-white/10 shadow-2xl pl-4 pr-2 py-2"
        >
          <Sparkle
            className={`w-5 h-5 shrink-0 ${working ? 'text-fuchsia-300 animate-pulse' : 'text-violet-300'}`}
          />
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
