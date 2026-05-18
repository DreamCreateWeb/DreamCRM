'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { sendMailbox } from '../mailbox-actions'

interface Props {
  accountId: string
  toEmail: string
  toName: string | null
  subject: string | null
  /**
   * When true, the textarea is always rendered (auto-expanding rather than
   * hidden behind a "click to compose" button). The MessageView passes this
   * since a reply should always be one keystroke away once a message is
   * open. The collapsed state is kept for future use (eg compose in a list
   * view) but not used today.
   */
  alwaysOpen?: boolean
}

/**
 * Inline quick-reply. A single auto-growing textarea pinned below the
 * message. Press Cmd/Ctrl+Enter to send. Esc clears + blurs.
 */
export default function QuickReply({ accountId, toEmail, toName, subject, alwaysOpen = false }: Props) {
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-grow the textarea up to a sensible max so long replies don't push
  // the rest of the page off screen.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(320, Math.max(56, ta.scrollHeight)) + 'px'
  }, [body])

  function handleSend() {
    if (!body.trim()) return
    setError(null)
    const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject ?? ''}`.trim()
    startTransition(async () => {
      try {
        await sendMailbox({ accountId, to: toEmail, subject: replySubject, body, cc: '' })
        setSent(true)
        setBody('')
        setTimeout(() => setSent(false), 1600)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-stone-900/40 shadow-sm transition-colors',
        'border-stone-200 dark:border-stone-700/60',
        'focus-within:border-stone-300 dark:focus-within:border-stone-600 focus-within:ring-2 focus-within:ring-stone-900/5 dark:focus-within:ring-stone-100/5',
      )}
    >
      <div className="px-4 pt-3 text-[11px] text-stone-500 dark:text-stone-400">
        Reply to <span className="font-medium text-stone-700 dark:text-stone-200">{toName ?? toEmail}</span>
      </div>
      <textarea
        ref={taRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            handleSend()
          } else if (e.key === 'Escape') {
            ;(e.target as HTMLTextAreaElement).blur()
          }
        }}
        rows={2}
        placeholder="Write a reply…"
        className="w-full px-4 pt-2 pb-3 text-[14px] leading-relaxed text-stone-800 dark:text-stone-100 bg-transparent border-0 focus:outline-none focus:ring-0 resize-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
        style={{ minHeight: 56 }}
      />
      <div className="px-4 py-2 border-t border-stone-100 dark:border-stone-700/40 flex items-center justify-between bg-stone-50/40 dark:bg-stone-800/30 rounded-b-xl">
        <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
          {error ? (
            <span className="text-rose-600 dark:text-rose-400">{error}</span>
          ) : sent ? (
            <span className="text-emerald-600 dark:text-emerald-400">Sent ✓</span>
          ) : (
            <span className="tabular-nums tracking-wider">⌘ Enter to send · Esc to blur</span>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={pending || !body.trim() || sent}
          className={cn(
            'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
            sent
              ? 'bg-emerald-600 text-white'
              : 'bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {sent ? 'Sent' : pending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
