'use client'

import { useState, useTransition } from 'react'
import MessagesHeader from './messages-header'
import { sendChatMessage } from './actions'
import { relativeTime } from '@/lib/utils'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'

export interface ChatMessage {
  id: number
  body: string
  createdAt: Date | string
  authorId: string
  authorName: string | null
}

export default function MessagesBody({
  conversationId,
  title,
  messages,
  currentUserId,
}: {
  conversationId: number | null
  title: string
  messages: ChatMessage[]
  currentUserId: string
}) {
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || !conversationId) return
    setError(null)
    startTransition(async () => {
      try {
        await sendChatMessage({ conversationId, body })
        setBody('')
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div className="grow flex flex-col md:translate-x-0 transition-transform duration-300 ease-in-out">
      <MessagesHeader />
      <div className="px-4 sm:px-6 md:px-5 py-6 flex-1 overflow-y-auto">
        {!conversationId ? (
          <EmptyState
            icon="💬"
            title="No conversation selected"
            body="Pick a conversation from the sidebar, or start a new one."
          />
        ) : (
          <>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">{title}</h2>
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 italic">No messages yet — say hi.</div>
              ) : (
                messages.map((m) => {
                  const mine = m.authorId === currentUserId
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                          mine
                            ? 'bg-violet-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                        }`}
                      >
                        {!mine && (
                          <div className="text-xs font-semibold mb-0.5 opacity-80">
                            {m.authorName ?? 'Unknown'}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{m.body}</div>
                        <div className={`text-xs mt-0.5 tabular-nums ${mine ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>
                          {relativeTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0">
        <div className="flex items-center justify-between bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700/60 px-4 sm:px-6 md:px-5 h-16">
          <form className="grow flex" onSubmit={onSubmit}>
            <div className="grow mr-3">
              <label htmlFor="msg-input" className="sr-only">Type a message</label>
              <input
                id="msg-input"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="form-input w-full bg-gray-100 dark:bg-gray-800 border-transparent focus:bg-white dark:focus:bg-gray-800 placeholder-gray-500"
                type="text"
                placeholder={conversationId ? 'Aa' : 'No conversation selected'}
                disabled={!conversationId || pending}
              />
            </div>
            <ActionButton
              variant="primary"
              type="submit"
              disabled={!conversationId || pending || !body.trim()}
              className="whitespace-nowrap"
            >
              {pending ? 'Sending…' : 'Send →'}
            </ActionButton>
          </form>
        </div>
        {error && <div className="absolute bottom-16 right-4 text-xs text-rose-700 dark:text-rose-300 bg-rose-500/10 px-2 py-1 rounded" role="alert">{error}</div>}
      </div>
    </div>
  )
}
