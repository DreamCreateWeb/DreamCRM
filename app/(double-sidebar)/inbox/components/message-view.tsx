'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn, formatShortDate, formatTime } from '@/lib/utils'
import type { EmailMessage } from '@/lib/services/mailbox'
import type { InboxPatientContext } from '@/lib/types/patient-context'
import {
  archiveMessageAction,
  markMessage,
  toggleStar,
  trashMessageAction,
} from '../mailbox-actions'
import PatientCard from './patient-card'
import AddPatientCard from './add-patient-card'
import QuickReply from './quick-reply'
import EmailIframe from './email-iframe'
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

  // Scroll the reply input into view when the user hits R.
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

  if (!message) {
    return (
      <div className="grow flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 px-8">
        <div className="w-16 h-16 rounded-full bg-stone-100 dark:bg-stone-800/60 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="text-sm font-medium text-stone-600 dark:text-stone-400">Nothing selected</div>
        <div className="text-[12px] mt-1.5 text-stone-400 dark:text-stone-500">Pick a message from the list</div>
        <div className="mt-6 flex items-center gap-2.5 text-[10px] text-stone-400 dark:text-stone-500 tabular-nums tracking-wider">
          <Kbd>j</Kbd><Kbd>k</Kbd>
          <span className="opacity-80">navigate</span>
          <span className="opacity-30">·</span>
          <Kbd>r</Kbd>
          <span className="opacity-80">reply</span>
          <span className="opacity-30">·</span>
          <Kbd>e</Kbd>
          <span className="opacity-80">archive</span>
        </div>
      </div>
    )
  }

  // Capture the narrowed-non-null message into a const so closures keep its
  // type — TS doesn't carry narrowing into function declarations made after
  // an early return.
  const msg = message

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
      {/* Sticky toolbar — stays visible while scrolling long emails */}
      <div className="sticky top-0 z-10 bg-white/85 dark:bg-stone-900/85 backdrop-blur border-b border-stone-200 dark:border-stone-700/60">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-1.5">
          <ToolbarButton onClick={handleReplyClick} variant="primary" shortcut="R" pending={pendingAction}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 17l-5-5 5-5M4 12h11a5 5 0 015 5v0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Reply
          </ToolbarButton>
          <div className="w-px h-5 bg-stone-200 dark:bg-stone-700 mx-1" />
          <ToolbarButton onClick={handleStar} active={msg.isStarred} shortcut="S" pending={pendingAction}>
            <svg className="w-[15px] h-[15px]" viewBox="0 0 24 24" fill={msg.isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
              <path d="M12 17.3l-6.18 3.7 1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73 1.64 7.03z" strokeLinejoin="round" />
            </svg>
            {msg.isStarred ? 'Starred' : 'Star'}
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
              {msg.isRead ? (
                <>
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M3 8l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
              )}
            </svg>
            {msg.isRead ? 'Unread' : 'Read'}
          </ToolbarButton>
          <div className="ml-auto text-[11px] text-stone-500 dark:text-stone-400 tabular-nums tracking-wider hidden sm:block">
            {formatShortDate(msg.receivedAt)} · {formatTime(msg.receivedAt)}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 pt-4 pb-8">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
          {/* Main content */}
          <div className="min-w-0">
            {/* Subject + intent */}
            <div className="flex items-start gap-2.5 mb-3">
              <h1 className="text-[20px] leading-snug font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                {msg.subject ?? '(no subject)'}
              </h1>
              <div className="pt-1"><IntentBadge intent={msg.intent} /></div>
            </div>

            {/* Compact sender row */}
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-stone-200 dark:border-stone-700/40">
              <Avatar name={msg.fromName ?? msg.fromEmail} />
              <div className="min-w-0 grow text-[13px]">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="font-medium text-stone-900 dark:text-stone-100 truncate">
                    {msg.fromName ?? msg.fromEmail}
                  </span>
                  {msg.fromName && (
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                      &lt;{msg.fromEmail}&gt;
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  to {msg.toEmails.join(', ')}
                  {msg.ccEmails.length > 0 && <> · cc {msg.ccEmails.join(', ')}</>}
                </div>
              </div>
            </div>

            {/* Body — iframe-rendered for full CSS isolation */}
            {bodyHtml ? (
              <EmailIframe html={bodyHtml} />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-stone-800 dark:text-stone-100">
                {msg.bodyText ?? '(empty body)'}
              </pre>
            )}

            {/* Quick reply */}
            <div id="quick-reply" className="mt-6 scroll-mt-20">
              {accountId && (
                <QuickReply
                  key={`reply-${msg.id}-${replyOpenSignal}`}
                  accountId={accountId}
                  toEmail={msg.fromEmail}
                  toName={msg.fromName}
                  subject={msg.subject}
                  messageId={msg.id}
                  textareaId="quick-reply-textarea"
                />
              )}
            </div>
          </div>

          {/* Right column — patient card or add-patient CTA */}
          <div className="xl:sticky xl:top-16 xl:self-start">
            {patientContext ? (
              <PatientCard ctx={patientContext} />
            ) : (
              <AddPatientCard messageId={msg.id} fromEmail={msg.fromEmail} fromName={msg.fromName} />
            )}
          </div>
        </div>
      </div>
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
