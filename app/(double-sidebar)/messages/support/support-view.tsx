'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import MessagesSurfaceTabs from '../surface-tabs'
import InboxAutoRefresh from '../inbox-auto-refresh'
import { sendSupportMessage } from './actions'
import { relativeTime } from '@/lib/utils'

/**
 * THE SUPPORT PANE — a single conversation with Dream Create, rendered the
 * way a practice should experience it: they are talking to "Support" (one
 * name, one 🎧 face), not to whichever platform person happens to answer.
 * The platform side sees the same thread in Client Messaging under the
 * clinic's name.
 */
export interface SupportViewMessage {
  id: number
  body: string
  createdAt: Date | string
  authorId: string
  authorName: string | null
  fromSupport: boolean
}

export default function SupportView({
  messages,
  currentUserId,
  demo = false,
}: {
  messages: SupportViewMessage[]
  currentUserId: string
  demo?: boolean
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Land (and stay) at the newest message, like any chat.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || pending || demo) return
    setError(null)
    startTransition(async () => {
      const res = await sendSupportMessage(body)
      if ('error' in res) {
        setError(res.error)
      } else {
        setBody('')
        router.refresh()
      }
    })
  }

  return (
    <div className="flex h-full flex-col bg-[color:var(--color-canvas)]">
      <InboxAutoRefresh />
      <MessagesSurfaceTabs active="support" />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
          {/* Identity header — who you're talking to, and the honest cadence. */}
          <div className="flex items-center gap-3 border-b border-[color:var(--color-hairline)] py-4">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-xl"
            >
              🎧
            </span>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100">Support</h1>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                The DreamCRM team — questions, problems, ideas. We read everything.
              </p>
            </div>
          </div>

          {/* Thread */}
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto py-5">
            {demo && (
              <p className="rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] px-3.5 py-2.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                In the demo this is a preview — a real practice writes here and the DreamCRM team
                answers as <span className="font-semibold">Support</span>.
              </p>
            )}
            {messages.length === 0 && !demo ? (
              <div className="py-10 text-center">
                <span
                  aria-hidden="true"
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--color-surface-sunk)] text-xl"
                >
                  👋
                </span>
                <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                  Anything on your mind?
                </p>
                <p className="mx-auto mt-0.5 max-w-sm text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Stuck on a setup step, found something broken, or wishing the app did something it
                  doesn’t — write it here and a real person answers.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.authorId === currentUserId
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-[var(--r-lg)] px-3.5 py-2.5 text-sm leading-relaxed ${
                        mine
                          ? 'bg-ink-900 text-[color:var(--color-surface-2)]'
                          : 'bg-[color:var(--color-surface-2)] text-gray-800 shadow-[inset_0_0_0_1px_var(--color-hairline)] dark:text-gray-100'
                      }`}
                    >
                      {!mine && (
                        <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                          {/* The identity contract: the platform side is ALWAYS
                              "Support" here — never a person's name. A teammate
                              at the same practice keeps their own name. */}
                          {m.fromSupport ? (
                            <>
                              <span aria-hidden="true">🎧</span> Support
                            </>
                          ) : (
                            (m.authorName ?? 'Teammate')
                          )}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{m.body}</div>
                      <div
                        className={`mt-1 text-xs tabular-nums ${
                          mine ? 'text-[color:var(--color-surface-2)]/60' : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        {relativeTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Composer */}
          <form onSubmit={onSubmit} className="shrink-0 border-t border-[color:var(--color-hairline)] py-3.5">
            {error && (
              <p role="alert" className="mb-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onSubmit(e)
                  }
                }}
                rows={2}
                disabled={demo || pending}
                placeholder={demo ? 'The demo composer is read-only' : 'Write to the DreamCRM team…'}
                aria-label="Message to support"
                className="form-textarea max-h-40 flex-1 resize-none rounded-[var(--r-sm)] text-sm"
              />
              <button
                type="submit"
                disabled={demo || pending || !body.trim()}
                className="btn shrink-0 bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {pending ? 'Sending…' : 'Send'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              Enter sends · Shift+Enter for a new line
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
