'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn, formatShortDate, formatTime } from '@/lib/utils'
import type { EmailMessage, EmailThreadDetail } from '@/lib/services/mailbox'
import type { InboxPatientContext } from '@/lib/types/patient-context'
import type { InboxTerminology } from '@/lib/inbox-terminology'
import {
  archiveThreadAction,
  markThreadAction,
  toggleThreadStarAction,
  trashThreadAction,
} from '../mailbox-actions'
import PatientCard from './patient-card'
import AddPatientCard from './add-patient-card'
import QuickReply from './quick-reply'
import EmailIframe from './email-iframe'
import { IntentBadge } from './intent-badge'
import MoveToMenu from './move-to-menu'

interface Props {
  thread: EmailThreadDetail | null
  sanitizedBodies: Record<string, string>
  patientContext: InboxPatientContext | null
  terminology: InboxTerminology
}

export default function ThreadView({ thread, sanitizedBodies, patientContext, terminology }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [pendingAction, startTransition] = useTransition()
  const [replyOpenSignal, setReplyOpenSignal] = useState(0)

  // Mark the whole thread as read on open. Fire-and-forget so it doesn't
  // block the render.
  useEffect(() => {
    if (!thread) return
    const anyUnread = thread.messages.some((m) => !m.isRead)
    if (anyUnread) {
      markThreadAction(thread.threadId, true).catch(() => {})
    }
  }, [thread])

  useEffect(() => {
    function onReply() {
      setReplyOpenSignal((n) => n + 1)
      requestAnimationFrame(() => {
        document.getElementById('quick-reply')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        document.getElementById('quick-reply-textarea')?.focus()
      })
    }
    window.addEventListener('inbox:quickreply', onReply)
    return () => window.removeEventListener('inbox:quickreply', onReply)
  }, [])

  if (!thread) {
    return (
      <div className="grow flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 px-8">
        <div className="w-16 h-16 rounded-full bg-stone-100 dark:bg-stone-800/60 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="text-sm font-medium text-stone-600 dark:text-stone-400">Nothing selected</div>
        <div className="text-[12px] mt-1.5 text-stone-400 dark:text-stone-500">Pick a conversation from the list</div>
        <div className="mt-6 flex items-center gap-2.5 text-[10px] text-stone-400 dark:text-stone-500 tabular-nums tracking-wider">
          <Kbd>j</Kbd><Kbd>k</Kbd>
          <span className="opacity-80">navigate</span>
          <span className="opacity-30">·</span>
          <Kbd>x</Kbd>
          <span className="opacity-80">select</span>
          <span className="opacity-30">·</span>
          <Kbd>e</Kbd>
          <span className="opacity-80">archive</span>
          <span className="opacity-30">·</span>
          <Kbd>r</Kbd>
          <span className="opacity-80">reply</span>
        </div>
      </div>
    )
  }

  const t = thread
  const latest = t.messages[t.messages.length - 1]
  const anyStarred = t.messages.some((m) => m.isStarred)
  const anyUnread = t.messages.some((m) => !m.isRead)

  function nav(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) params.delete(k); else params.set(k, v)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function handleReplyClick() {
    setReplyOpenSignal((n) => n + 1)
    requestAnimationFrame(() => {
      document.getElementById('quick-reply')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      document.getElementById('quick-reply-textarea')?.focus()
    })
  }
  function handleArchive() {
    startTransition(async () => {
      await archiveThreadAction(t.threadId)
      nav({ m: null })
      router.refresh()
    })
  }
  function handleTrash() {
    startTransition(async () => {
      await trashThreadAction(t.threadId)
      nav({ m: null })
      router.refresh()
    })
  }
  function handleStar() {
    startTransition(async () => {
      await toggleThreadStarAction(t.threadId, !anyStarred)
      router.refresh()
    })
  }
  function handleToggleRead() {
    startTransition(async () => {
      await markThreadAction(t.threadId, anyUnread)
      router.refresh()
    })
  }

  return (
    <div className="grow overflow-y-auto bg-stone-50/40 dark:bg-stone-900/20">
      {/* Sticky toolbar — operates on the whole thread */}
      <div className="sticky top-0 z-10 bg-white/85 dark:bg-stone-900/85 backdrop-blur border-b border-stone-200 dark:border-stone-700/60">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-1.5">
          <ToolbarButton onClick={handleReplyClick} variant="primary" shortcut="R" pending={pendingAction}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 17l-5-5 5-5M4 12h11a5 5 0 015 5v0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reply
          </ToolbarButton>
          <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />
          <ToolbarButton onClick={handleStar} active={anyStarred} shortcut="S" pending={pendingAction}>
            <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill={anyStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
              <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" strokeLinejoin="round" />
            </svg>
            {anyStarred ? 'Starred' : 'Star'}
          </ToolbarButton>
          <ToolbarButton onClick={handleArchive} shortcut="E" pending={pendingAction}>
            <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="4" width="18" height="4" rx="1" />
              <path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8M10 12h4" strokeLinecap="round" />
            </svg>
            Archive
          </ToolbarButton>
          <ToolbarButton onClick={handleTrash} shortcut="#" pending={pendingAction}>
            <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Trash
          </ToolbarButton>
          <ToolbarButton onClick={handleToggleRead} shortcut="U" pending={pendingAction}>
            <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              {anyUnread ? (
                <>
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M3 8l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
              )}
            </svg>
            {anyUnread ? 'Read' : 'Unread'}
          </ToolbarButton>
          <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />
          <MoveToMenu messageId={latest.id} currentCategory={t.category} />
          <div className="ml-auto text-[11px] text-stone-500 dark:text-stone-400 tabular-nums tracking-wider hidden sm:block">
            {formatShortDate(latest.receivedAt)} · {formatTime(latest.receivedAt)}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 pt-4 pb-8">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
          <div className="min-w-0">
            {/* Subject + intent */}
            <div className="flex items-start gap-2.5 mb-4">
              <h1 className="text-[20px] leading-snug font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                {t.subject ?? '(no subject)'}
              </h1>
              <div className="pt-1"><IntentBadge intent={t.intent} /></div>
              {t.messages.length > 1 && (
                <span className="pt-1.5 text-[11px] text-stone-500 dark:text-stone-400 tabular-nums">
                  {t.messages.length} messages
                </span>
              )}
            </div>

            {/* Stacked conversation: oldest first, newest expanded by default */}
            <div className="space-y-2.5">
              {t.messages.map((m, i) => {
                const isLatest = i === t.messages.length - 1
                return (
                  <MessageCard
                    key={m.id}
                    message={m}
                    bodyHtml={sanitizedBodies[m.id] ?? null}
                    defaultOpen={isLatest}
                  />
                )
              })}
            </div>

            {/* Quick reply — replies to the latest message in the thread */}
            <div id="quick-reply" className="mt-6 scroll-mt-20">
              <QuickReply
                key={`reply-${latest.id}-${replyOpenSignal}`}
                accountId={latest.accountId}
                toEmail={latest.fromEmail}
                toName={latest.fromName}
                subject={t.subject}
                messageId={latest.id}
                textareaId="quick-reply-textarea"
                terminology={terminology}
              />
            </div>
          </div>

          <div className="xl:sticky xl:top-16 xl:self-start">
            {patientContext ? (
              <PatientCard ctx={patientContext} terminology={terminology} />
            ) : (
              <AddPatientCard
                messageId={latest.id}
                fromEmail={latest.fromEmail}
                fromName={latest.fromName}
                terminology={terminology}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * A single message inside a stacked thread. Collapsed messages show
 * just the sender + snippet + time; expanded shows the full body.
 * Defaults to expanded for the newest message in the thread.
 */
function MessageCard({
  message,
  bodyHtml,
  defaultOpen,
}: {
  message: EmailMessage
  bodyHtml: string | null
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const senderName = message.fromName ?? message.fromEmail

  return (
    <div
      className={cn(
        'rounded-lg border bg-white dark:bg-stone-900/40 transition-colors',
        open
          ? 'border-stone-200 dark:border-stone-700/60'
          : 'border-stone-100 dark:border-stone-800 hover:border-stone-200 dark:hover:border-stone-700/60',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full text-left flex items-start gap-2.5 px-4',
          open ? 'pt-3.5 pb-2' : 'py-3',
        )}
      >
        <Avatar name={senderName} />
        <div className="min-w-0 grow">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[13px] font-medium text-stone-900 dark:text-stone-100 truncate">
              {senderName}
            </span>
            {message.fromName && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                &lt;{message.fromEmail}&gt;
              </span>
            )}
            <span className="ml-auto text-[11px] text-stone-400 dark:text-stone-500 tabular-nums whitespace-nowrap shrink-0">
              {formatShortDate(message.receivedAt)}, {formatTime(message.receivedAt)}
            </span>
          </div>
          {open ? (
            <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
              to {message.toEmails.join(', ')}
              {message.ccEmails.length > 0 && <> · cc {message.ccEmails.join(', ')}</>}
            </div>
          ) : (
            <div className="text-[12px] text-stone-500 dark:text-stone-400 truncate">
              {message.snippet ?? message.bodyText?.slice(0, 140) ?? ''}
            </div>
          )}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-stone-100 dark:border-stone-800">
          {bodyHtml ? (
            <EmailIframe html={bodyHtml} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-stone-800 dark:text-stone-100">
              {message.bodyText ?? '(empty body)'}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  children,
  onClick,
  active,
  pending,
  variant = 'default',
  shortcut,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  pending?: boolean
  variant?: 'default' | 'primary'
  shortcut?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      title={shortcut ? `Shortcut: ${shortcut}` : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors',
        variant === 'primary'
          ? 'bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white'
          : active
            ? 'text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10'
            : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-300 dark:hover:text-stone-100 dark:hover:bg-stone-800',
        pending && 'opacity-50 cursor-wait',
      )}
    >
      {children}
    </button>
  )
}

function Avatar({ name }: { name: string }) {
  const initial = (name?.[0] ?? '?').toUpperCase()
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
    <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[13px] shrink-0', colors[hue])}>
      {initial}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-mono text-[10px] shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
      {children}
    </kbd>
  )
}
