'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { SANDMAN_SUGGESTIONS } from '@/lib/sandman'
import { ActionButton } from '@/components/ui/action-button'
import { askSandmanAction } from './actions'

/**
 * SANDMAN (docs/ai-operations.md, D5) — the Dream Team's chief of staff, in
 * conversation. Ask about the practice's own numbers; get a grounded answer
 * and, when it helps, a place to look.
 *
 * Design: this is a CONVERSATION, not a console. The panel opens with the
 * questions a front desk actually has, keeps the thread in view, and never
 * renders a control that acts — every suggestion is a link, resolved
 * server-side from the closed registry.
 */
interface Turn {
  role: 'user' | 'assistant'
  content: string
  actions?: Array<{ kind: string; label: string; href: string }>
}

export default function SandmanPanel({ clinicName }: { clinicName: string }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [pending, startTransition] = useTransition()
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, pending])

  function ask(question: string) {
    const q = question.trim()
    if (!q || pending) return
    const history = turns.map((t) => ({ role: t.role, content: t.content }))
    setTurns((prev) => [...prev, { role: 'user', content: q }])
    setDraft('')
    startTransition(async () => {
      try {
        const res = await askSandmanAction({ query: q, history })
        setTurns((prev) => [
          ...prev,
          { role: 'assistant', content: res.answer, actions: res.actions },
        ])
      } catch {
        setTurns((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'That didn’t go through — try asking again in a moment.',
          },
        ])
      } finally {
        inputRef.current?.focus()
      }
    })
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ask Sandman</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Your chief of staff — grounded in {clinicName}&rsquo;s own numbers.
        </p>
      </div>

      <div className="v2-card overflow-hidden">
        <div
          ref={threadRef}
          className="max-h-[26rem] space-y-3 overflow-y-auto px-5 py-4"
          aria-live="polite"
        >
          {turns.length === 0 && (
            <div>
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                Ask me how the month is going, why a number moved, or what to do about it. I read
                your real numbers — never a patient&rsquo;s details.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SANDMAN_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    disabled={pending}
                    className="rounded-full bg-[color:var(--color-surface-sunk)] px-3 py-1.5 text-xs text-gray-600 transition-colors hover:bg-teal-500/10 hover:text-teal-700 disabled:opacity-50 dark:text-gray-300 dark:hover:text-teal-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) =>
            t.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-[var(--r-md)] bg-teal-600 px-3 py-2 text-sm leading-relaxed text-white">
                  {t.content}
                </p>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-sm"
                >
                  🌙
                </span>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-100">
                    {t.content}
                  </p>
                  {t.actions && t.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.actions.map((a) => (
                        <Link
                          key={a.kind}
                          href={a.href}
                          className="rounded-[var(--r-xs)] border border-[color:var(--color-hairline-strong)] px-2.5 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-500/10 dark:text-teal-300"
                        >
                          {a.label} →
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {pending && (
            <div className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-sm"
              >
                🌙
              </span>
              <p role="status" className="animate-pulse text-sm text-gray-500 dark:text-gray-400">
                Reading your numbers…
              </p>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(draft)
          }}
          className="flex items-center gap-2 border-t border-[color:var(--color-hairline)] px-4 py-3"
        >
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about your practice…"
            aria-label="Ask Sandman about your practice"
            maxLength={2000}
            className="form-input flex-1 rounded-full text-sm"
          />
          <ActionButton
            type="submit"
            variant="primary"
            size="sm"
            pending={pending}
            disabled={pending || draft.trim().length === 0}
          >
            Ask
          </ActionButton>
        </form>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Sandman reads counts and rates only — never an individual patient&rsquo;s record — and never
        sends or posts anything on its own.
      </p>
    </section>
  )
}
