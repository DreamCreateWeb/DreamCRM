'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { sendMailbox } from '../mailbox-actions'

interface Props {
  accountId: string
  toEmail: string
  toName: string | null
  subject: string | null
  defaultOpen?: boolean
}

/**
 * Inline quick-reply pane. Replaces the "open compose dialog → fill 6 fields"
 * flow with a single textarea that prefills To/Subject from the current
 * message. Press Cmd/Ctrl+Enter to send.
 */
export default function QuickReply({ accountId, toEmail, toName, subject, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function handleSend() {
    if (!body.trim()) return
    setError(null)
    const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject ?? ''}`.trim()
    startTransition(async () => {
      try {
        await sendMailbox({ accountId, to: toEmail, subject: replySubject, body, cc: '' })
        setSent(true)
        setBody('')
        setTimeout(() => {
          setSent(false)
          setOpen(false)
        }, 1200)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-xl border border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900/40 px-4 py-3 text-sm text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors"
      >
        Reply to <span className="font-medium text-stone-700 dark:text-stone-200">{toName ?? toEmail}</span>…
        <span className="float-right text-[11px] tabular-nums tracking-wider text-stone-400 dark:text-stone-500">
          R
        </span>
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900/40 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-stone-200/60 dark:border-stone-700/40 text-[12px] text-stone-500 dark:text-stone-400 flex items-center justify-between">
        <span>
          To <span className="font-medium text-stone-800 dark:text-stone-200">{toName ?? toEmail}</span>
        </span>
        <button onClick={() => { setOpen(false); setBody(''); setError(null) }} className="hover:text-stone-700 dark:hover:text-stone-200">
          Cancel
        </button>
      </div>
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            handleSend()
          } else if (e.key === 'Escape') {
            setOpen(false); setBody('')
          }
        }}
        rows={6}
        placeholder="Write your reply…"
        className="w-full px-4 py-3 text-sm text-stone-800 dark:text-stone-100 bg-transparent border-0 focus:outline-none focus:ring-0 resize-none"
      />
      <div className="px-4 py-2.5 border-t border-stone-200/60 dark:border-stone-700/40 flex items-center justify-between bg-stone-50/50 dark:bg-stone-800/30">
        <div className="text-[11px] text-stone-500 dark:text-stone-400">
          {error ? <span className="text-rose-600 dark:text-rose-400">{error}</span> : <span className="tabular-nums tracking-wider">⌘ Enter to send</span>}
        </div>
        <button
          onClick={handleSend}
          disabled={pending || !body.trim() || sent}
          className={cn(
            'rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
            sent
              ? 'bg-emerald-600 text-white'
              : 'bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white disabled:opacity-50',
          )}
        >
          {sent ? 'Sent ✓' : pending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
