'use client'

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  COPILOT_ACTIONS,
  type CopilotResponse,
  type CopilotActionKind,
  type CopilotSuggestedAction,
} from '@/lib/prospect-copilot'
import {
  copilotAction,
  setKillSwitchAction,
  setDryRunAction,
  setHunterEnabledAction,
} from './admin-actions'

const SUGGESTIONS = [
  'How’s the hunt going today?',
  'Who should I call first?',
  'Are we live or in dry-run?',
  'Why isn’t anything sending?',
  'How many hot prospects do we have?',
]

/** Run the mutation behind a suggested action. Navigation kinds return false
 *  (the caller routes instead). All mutations are one small server action. */
async function runMutation(kind: CopilotActionKind): Promise<boolean> {
  switch (kind) {
    case 'engine_on':
      await setKillSwitchAction(false)
      return true
    case 'engine_off':
      await setKillSwitchAction(true)
      return true
    case 'go_live':
      await setDryRunAction(false)
      return true
    case 'go_dry_run':
      await setDryRunAction(true)
      return true
    case 'hunter_on':
      await setHunterEnabledAction(true)
      return true
    case 'hunter_off':
      await setHunterEnabledAction(false)
      return true
    default:
      return false
  }
}

export default function CopilotBar() {
  const router = useRouter()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<CopilotResponse | null>(null)
  const [asking, startAsking] = useTransition()
  const [running, startRunning] = useTransition()
  const [ranLabel, setRanLabel] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ⌘J / Ctrl-J opens the copilot from anywhere on the surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else {
      setRanLabel(null)
    }
  }, [open])

  const ask = useCallback((q: string) => {
    const trimmed = q.trim()
    if (trimmed.length === 0) return
    setResponse(null)
    setRanLabel(null)
    startAsking(async () => {
      const res = await copilotAction(trimmed)
      setResponse(res)
    })
  }, [])

  const onAction = async (a: CopilotSuggestedAction) => {
    const def = COPILOT_ACTIONS[a.kind]
    if (!def.mutation) {
      if (def.href) {
        setOpen(false)
        router.push(def.href)
      }
      return
    }
    if (
      def.confirm &&
      !(await confirm({
        title: `${a.label}?`,
        message: 'This changes the live engine right now.',
        confirmLabel: a.label,
        danger: a.kind === 'engine_off',
      }))
    )
      return
    startRunning(async () => {
      await runMutation(a.kind)
      setRanLabel(a.label)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] bg-white/60 dark:bg-gray-800/40 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 transition-colors"
      >
        <span aria-hidden="true">✨</span>
        Ask the copilot
        <kbd className="ml-1 hidden sm:inline rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400">
          ⌘J
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-sm px-4 pt-[12vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-[var(--r-lg)] border border-[color:var(--color-hairline-strong)] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[color:var(--color-hairline)] px-4 py-3">
              <span aria-hidden="true" className="text-lg">
                ✨
              </span>
              <textarea
                ref={inputRef}
                rows={1}
                value={query}
                placeholder="Ask about the hunt — who to call, live vs dry-run, today’s numbers…"
                className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(query)
                  }
                }}
              />
              <button
                type="button"
                disabled={asking || query.trim().length === 0}
                onClick={() => ask(query)}
                className="rounded-[var(--r-xs)] bg-teal-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
              >
                {asking ? 'Thinking…' : 'Ask'}
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto px-4 py-4">
              {!response && !asking && (
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">
                    Try asking
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setQuery(s)
                          ask(s)
                        }}
                        className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {asking && (
                <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">
                  Reading the hunt…
                </p>
              )}

              {response && !asking && (
                <div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-100">
                    {response.answer}
                  </p>
                  {response.actions.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {response.actions.map((a) => {
                        const def = COPILOT_ACTIONS[a.kind]
                        return (
                          <button
                            key={a.kind}
                            type="button"
                            disabled={running}
                            onClick={() => onAction(a)}
                            className={`rounded-[var(--r-xs)] px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                              def.mutation
                                ? 'bg-teal-600 text-white hover:bg-teal-700'
                                : 'border border-[color:var(--color-hairline-strong)] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                          >
                            {a.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {ranLabel && (
                    <p className="mt-3 text-xs text-teal-700 dark:text-teal-300">
                      Done: {ranLabel} ✓
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-[color:var(--color-hairline)] px-4 py-2 text-[11px] text-gray-400 dark:text-gray-500">
              Grounded in your live hunt data. The copilot never sends or changes anything on its
              own — you click to run any action.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
