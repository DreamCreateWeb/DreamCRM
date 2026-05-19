'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import type { InboxTerminology } from '@/lib/inbox-terminology'
import { draftReplyAction, sendMailbox } from '../mailbox-actions'

interface Props {
  accountId: string
  toEmail: string
  toName: string | null
  subject: string | null
  messageId: string
  textareaId?: string
  terminology?: InboxTerminology
}

/**
 * Inline quick-reply. A single auto-growing textarea pinned below the
 * message. Press Cmd/Ctrl+Enter to send. "Draft with AI" populates the
 * textarea with a Sonnet-generated reply that incorporates patient
 * context (when the sender matches a patient).
 */
export default function QuickReply({ accountId, toEmail, toName, subject, messageId, textareaId, terminology }: Props) {
  const contact = terminology?.contact ?? 'contact'
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(400, Math.max(64, ta.scrollHeight)) + 'px'
  }, [body])

  function handleSend() {
    if (!body.trim()) return
    setError(null)
    const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject ?? ''}`.trim()
    startTransition(async () => {
      try {
        await sendMailbox({
          accountId,
          to: toEmail,
          subject: replySubject,
          body,
          cc: '',
          replyToMessageId: messageId,
        })
        setSent(true)
        setBody('')
        setTimeout(() => setSent(false), 1600)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  async function handleDraft() {
    setError(null)
    setDrafting(true)
    try {
      const { draft } = await draftReplyAction(messageId)
      if (draft) {
        setBody(draft)
        // Move cursor to end so the user can keep typing.
        requestAnimationFrame(() => {
          const ta = taRef.current
          if (ta) {
            ta.focus()
            ta.setSelectionRange(draft.length, draft.length)
          }
        })
      } else {
        setError('AI is unavailable right now — try again or write manually.')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDrafting(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-stone-900/40 shadow-sm transition-colors',
        'border-stone-200 dark:border-stone-700/60',
        'focus-within:border-stone-300 dark:focus-within:border-stone-600 focus-within:ring-2 focus-within:ring-stone-900/5 dark:focus-within:ring-stone-100/5',
      )}
    >
      <div className="px-4 pt-3 flex items-center justify-between gap-3">
        <div className="text-[11px] text-stone-500 dark:text-stone-400 min-w-0 truncate">
          Reply to <span className="font-medium text-stone-700 dark:text-stone-200">{toName ?? toEmail}</span>
        </div>
        <button
          type="button"
          onClick={handleDraft}
          disabled={drafting || pending}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            drafting
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 cursor-wait'
              : 'text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10',
          )}
          title={`Draft a reply using AI (uses ${contact} context when available)`}
        >
          {drafting ? (
            <>
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
              </svg>
              Drafting…
            </>
          ) : (
            <>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 2l1.7 4.7L18 8.4l-4.3 1.7L12 14.8l-1.7-4.7L6 8.4l4.3-1.7zM19 14l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" strokeLinejoin="round" />
              </svg>
              Draft with AI
            </>
          )}
        </button>
      </div>
      <textarea
        ref={taRef}
        id={textareaId}
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
        placeholder={drafting ? `AI is drafting a reply with ${contact} context…` : 'Write a reply, or click Draft with AI…'}
        className="w-full px-4 pt-2 pb-3 text-[14px] leading-relaxed text-stone-800 dark:text-stone-100 bg-transparent border-0 focus:outline-none focus:ring-0 resize-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
        style={{ minHeight: 64 }}
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
          disabled={pending || drafting || !body.trim() || sent}
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
