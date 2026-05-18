'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn, formatShortDate, formatTime } from '@/lib/utils'
import type { EmailMessage } from '@/lib/services/mailbox'
import type { InboxPatientContext } from '@/lib/services/patient-context'
import {
  archiveMessageAction,
  markMessage,
  toggleStar,
  trashMessageAction,
} from '../mailbox-actions'
import PatientCard from './patient-card'
import QuickReply from './quick-reply'
import { IntentBadge } from './intent-badge'

interface Props {
  message: EmailMessage | null
  bodyHtml: string | null // pre-sanitized by the server
  patientContext: InboxPatientContext | null
  accountId: string | null
}

export default function MessageView({ message, bodyHtml, patientContext, accountId }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pendingAction, startTransition] = useTransition()
  const [replyOpenSignal, setReplyOpenSignal] = useState(0)

  // Mark as read on open (silent best-effort).
  useEffect(() => {
    if (message && !message.isRead) {
      markMessage(message.id, true).catch(() => {})
    }
  }, [message])

  // Listen for the R keyboard shortcut from the global handler.
  useEffect(() => {
    function onReply() { setReplyOpenSignal((n) => n + 1) }
    window.addEventListener('inbox:quickreply', onReply)
    return () => window.removeEventListener('inbox:quickreply', onReply)
  }, [])

  if (!message) {
    return (
      <div className="grow flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 px-8">
        <svg className="w-14 h-14 mb-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="text-sm">Select a message to read</div>
        <div className="text-[11px] mt-2 tabular-nums tracking-wider opacity-70">
          j / k to navigate · r to reply · e to archive
        </div>
      </div>
    )
  }

  function nav(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k); else params.set(k, v)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // Capture the (now non-null) message into a const so its narrowed type
  // survives into the closures below — TS doesn't carry narrowing into
  // function declarations made after an early return.
  const msg = message
  function handleArchive() {
    startTransition(async () => {
      await archiveMessageAction(msg.id)
      nav({ m: null })
      router.refresh()
    })
  }
  function handleTrash() {
    startTransition(async () => {
      await trashMessageAction(msg.id)
      nav({ m: null })
      router.refresh()
    })
  }
  function handleStar() {
    startTransition(async () => {
      await toggleStar(msg.id, !msg.isStarred)
      router.refresh()
    })
  }
  function handleToggleRead() {
    startTransition(async () => {
      await markMessage(msg.id, !msg.isRead)
      router.refresh()
    })
  }

  return (
    <div className="grow overflow-y-auto bg-stone-50/40 dark:bg-stone-900/20">
      <div className="max-w-5xl mx-auto px-5 py-5">
        {/* Action bar */}
        <div className="flex items-center gap-1 mb-4">
          <IconButton onClick={handleStar} title="Star (s)" active={message.isStarred} pending={pendingAction}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={message.isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
              <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <IconButton onClick={handleArchive} title="Archive (e)" pending={pendingAction}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="4" width="18" height="4" rx="1" />
              <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" strokeLinecap="round" />
            </svg>
          </IconButton>
          <IconButton onClick={handleTrash} title="Trash (#)" pending={pendingAction}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />
          <IconButton onClick={handleToggleRead} title={message.isRead ? 'Mark unread (u)' : 'Mark read (u)'} pending={pendingAction}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              {message.isRead ? (
                <path d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <circle cx="12" cy="12" r="4" fill="currentColor" />
              )}
            </svg>
          </IconButton>
          <div className="ml-auto text-[11px] text-stone-400 dark:text-stone-500 tabular-nums tracking-wider">
            {formatShortDate(message.receivedAt)} · {formatTime(message.receivedAt)}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
          {/* Main content */}
          <div className="min-w-0">
            <div className="flex items-start gap-3 mb-4">
              <h1 className="text-[22px] leading-tight font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                {message.subject ?? '(no subject)'}
              </h1>
              <IntentBadge intent={message.intent} />
            </div>

            <div className="flex items-start gap-3 mb-5 pb-4 border-b border-stone-200 dark:border-stone-700/40">
              <Avatar name={message.fromName ?? message.fromEmail} />
              <div className="min-w-0 grow text-sm">
                <div className="font-medium text-stone-900 dark:text-stone-100 truncate">
                  {message.fromName ?? message.fromEmail}
                </div>
                {message.fromName && (
                  <div className="text-[12px] text-stone-500 dark:text-stone-400 truncate">{message.fromEmail}</div>
                )}
                <div className="text-[12px] text-stone-500 dark:text-stone-400 mt-1 truncate">
                  to {message.toEmails.join(', ')}
                  {message.ccEmails.length > 0 && <> · cc {message.ccEmails.join(', ')}</>}
                </div>
              </div>
            </div>

            {/* Body */}
            <article className="prose prose-stone prose-sm dark:prose-invert max-w-none prose-img:rounded-md prose-a:text-emerald-700 dark:prose-a:text-emerald-400 prose-headings:font-semibold">
              {bodyHtml ? (
                // Body comes pre-sanitized from the server (lib/email-sanitize.ts).
                <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-stone-700 dark:text-stone-200">
                  {message.bodyText ?? '(empty body)'}
                </pre>
              )}
            </article>

            {/* Quick reply */}
            <div className="mt-6">
              {accountId && (
                <QuickReplyAutoOpen
                  signal={replyOpenSignal}
                  accountId={accountId}
                  toEmail={message.fromEmail}
                  toName={message.fromName}
                  subject={message.subject}
                />
              )}
            </div>
          </div>

          {/* Patient context sidebar */}
          <div className="xl:sticky xl:top-5 xl:self-start">
            {patientContext && <PatientCard ctx={patientContext} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  title,
  active,
  pending,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
  pending?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      title={title}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        active
          ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400'
          : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-stone-800',
        pending && 'opacity-50 cursor-wait',
      )}
    >
      {children}
    </button>
  )
}

function Avatar({ name }: { name: string }) {
  const initial = (name?.[0] ?? '?').toUpperCase()
  // Deterministic color hash so the same sender always gets the same hue.
  const hue = Math.abs(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 6
  const colors = [
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
    'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200',
  ]
  return (
    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0', colors[hue])}>
      {initial}
    </div>
  )
}

// Re-mounts QuickReply with defaultOpen=true whenever the user hits 'R',
// since the global key handler dispatches the inbox:quickreply event and
// we bump `signal` in response. Without the remount the open state would
// stay sticky across messages.
function QuickReplyAutoOpen({
  signal,
  accountId,
  toEmail,
  toName,
  subject,
}: {
  signal: number
  accountId: string
  toEmail: string
  toName: string | null
  subject: string | null
}) {
  return (
    <QuickReply
      key={`reply-${accountId}-${toEmail}-${signal}`}
      accountId={accountId}
      toEmail={toEmail}
      toName={toName}
      subject={subject}
      defaultOpen={signal > 0}
    />
  )
}
