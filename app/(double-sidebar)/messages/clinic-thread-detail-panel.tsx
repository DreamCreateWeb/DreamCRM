'use client'

import { useState, useTransition, useEffect, useMemo, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import FollowupQuickAdd from '@/components/followups/followup-quick-add'
import PatientTagControl from '@/components/tags/patient-tag-control'
import type { PatientTagView } from '@/lib/types/patient-tags'
import type { MessageAttachment } from '@/lib/types/messaging'
import { MessageAttachments } from './message-attachments'
import { channelMeta } from './channel-meta'
import {
  archiveThreadAction,
  assignThreadAction,
  cancelScheduledMessageAction,
  draftReplyAction,
  markUnreadAction,
  reopenThreadAction,
  scheduleMessageAction,
  sendMessageAction,
  snoozeThreadAction,
  toggleStarAction,
} from './clinic-actions'
import type { ScheduledMessageView } from '@/lib/services/scheduled-messages'
import { detectPreferredChannel, pickDefaultReplyChannel } from './pick-default-reply-channel'
import { avatarTint, groupMessagesByDay, messageInitials } from './message-grouping'
import { uploadFileWithProgress } from '@/lib/upload-with-progress'
import { MAX_MESSAGE_ATTACHMENTS } from '@/lib/types/messaging'
import BookFromPatientDrawer from '@/app/(default)/appointments/book-from-patient-drawer'

type Channel = 'in_app' | 'email' | 'sms'

interface ThreadHeader {
  id: string
  patientId: string
  patientFirstName: string
  patientLastName: string
  patientEmail: string | null
  patientPhone: string | null
  status: 'open' | 'snoozed' | 'archived'
  assignedUserId: string | null
  assignedUserName: string | null
  snoozedUntil: string | null
  lastMessageChannel: Channel | null
  starred?: boolean
}

interface SerializedMessage {
  id: string
  source: 'patient_message' | 'email_message'
  channel: Channel
  direction: 'inbound' | 'outbound'
  body: string
  subject?: string | null
  fromName?: string | null
  fromEmail?: string | null
  sentAt: string
  sentByUserId?: string | null
  sentByUserName?: string | null
  externalId?: string | null
  /** Outbound delivery receipts (in-app channel), ISO strings. */
  deliveredAt?: string | null
  readByPatientAt?: string | null
  /** Image attachments on this message. */
  attachments?: MessageAttachment[]
}

interface TemplateOption {
  key: string
  label: string
  rendered: string
}

/** Slim patient context for the thread header — mirrors the service's
 *  ThreadPatientContext (serialized dates). null when unavailable. */
interface PatientContext {
  patientId: string
  nextVisitAt: string | null
  nextVisitType: string | null
  lastVisitAt: string | null
  outstandingBalanceCents: number | null
  balanceAsOf: string | null
  missingIntake: boolean
}

interface Props {
  thread: ThreadHeader
  messages: SerializedMessage[]
  currentUserName: string | null
  templates: TemplateOption[]
  hasEmail: boolean
  /** Patient context strip data (next/last visit, balance, intake). */
  patientContext?: PatientContext | null
  /** The patient's current CRM tags (editable in the header). */
  patientTags?: PatientTagView[]
  /** Org staff who can own this conversation (the reassign dropdown). */
  members?: { userId: string; name: string }[]
  /** The signed-in staff user — powers the "Assign to me" shortcut. */
  currentUserId?: string | null
  /** Mobile-only "← All conversations" link back to the list pane. */
  backHref?: string
  /** Whether the Anthropic key is configured — shows the "✨ Draft" assist. */
  aiEnabled?: boolean
  /** Pending "send later" messages for this patient (shown above the composer). */
  scheduledMessages?: ScheduledMessageView[]
}

const SNOOZE_OPTIONS = [
  { label: '4 hours', hours: 4 },
  { label: 'Tomorrow', hours: 24 },
  { label: 'Next week', hours: 24 * 7 },
]

const CHANNEL_LABEL: Record<Channel, string> = {
  in_app: 'in-app',
  email: 'email',
  sms: 'SMS',
}

/** Short, scannable date for the context strip ("Thu, Jun 12"). */
function fmtVisitDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Money for the context strip — same `$X.XX` shape as the patient detail page. */
function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

/** Bare clock for the per-group timestamp ("3:24 PM"). */
function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** Friendly date+time for a scheduled send ("Mon, Jun 23 · 9:00 AM"). */
function fmtSchedule(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** A `datetime-local` default value (next top of the hour, local zone). */
function defaultScheduleLocal(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* ── Inline icon set ────────────────────────────────────────────────────
   A small, consistent stroke-icon family for the header toolbar + context
   strip — replaces stray emoji so the controls read as one designed system
   (16px, 1.75 stroke, currentColor; 14px overrides for the context stats). */
const SVG_BASE = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const IconAssign = () => (
  <svg {...SVG_BASE}>
    <circle cx="9.5" cy="8" r="3.25" />
    <path d="M4 19a5.5 5.5 0 0 1 11 0" />
    <path d="M19 7.5v5M21.5 10h-5" />
  </svg>
)
const IconSnooze = () => (
  <svg {...SVG_BASE}>
    <path d="M20 14.2A8.4 8.4 0 1 1 9.8 4 6.6 6.6 0 0 0 20 14.2Z" />
  </svg>
)
const IconArchive = () => (
  <svg {...SVG_BASE}>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1.2" />
    <path d="M5 8.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18V8.5" />
    <path d="M9.5 12h5" />
  </svg>
)
const IconReopen = () => (
  <svg {...SVG_BASE}>
    <path d="M3 4.5v4h4" />
    <path d="M3.5 8.5A8 8 0 1 1 4 14.5" />
  </svg>
)
const IconUser = () => (
  <svg {...SVG_BASE}>
    <circle cx="12" cy="8" r="3.25" />
    <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
  </svg>
)
const IconCalendarPlus = () => (
  <svg {...SVG_BASE}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    <path d="M12 13v4M10 15h4" />
  </svg>
)
const IconStar = ({ filled = false }: { filled?: boolean }) => (
  <svg {...SVG_BASE} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.8L12 16.77l-5.2 2.75.99-5.8-4.21-4.1 5.82-.85z" />
  </svg>
)
const IconMailUnread = () => (
  <svg {...SVG_BASE}>
    <path d="M4 8.5 12 13l4-2.25" />
    <path d="M4 7.5h11M4 7.5v9a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V11" />
    <circle cx="19" cy="6" r="2.5" fill="currentColor" stroke="none" />
  </svg>
)
const IconCalendar = () => (
  <svg {...SVG_BASE} width={14} height={14}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
  </svg>
)
const IconClock = () => (
  <svg {...SVG_BASE} width={14} height={14}>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 7.5V12l3 1.5" />
  </svg>
)
const IconCard = () => (
  <svg {...SVG_BASE} width={14} height={14}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
  </svg>
)
const IconClipboard = () => (
  <svg {...SVG_BASE} width={14} height={14}>
    <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
    <path d="M9 6V4.6A1.6 1.6 0 0 1 10.6 3h2.8A1.6 1.6 0 0 1 15 4.6V6z" />
    <path d="M9 12h6M9 15.5h4" />
  </svg>
)
/* Delivery-receipt ticks: single = delivered, double = read. */
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 12.5 9.5 18 20 6.5" />
  </svg>
)
const IconCheckDouble = () => (
  <svg width="15" height="12" viewBox="0 0 30 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12.5 7 18 16.5 6.5" />
    <path d="M11.5 14.5 13 16 23.5 4.5" />
  </svg>
)

/** A cohesive triage-toolbar button: icon (quiet at rest → tints on hover) +
 *  an optional label that collapses on narrow panes. `active` = its menu is
 *  open (or the thread is assigned) → a soft teal wash. */
function ToolButton({
  icon,
  active = false,
  className = '',
  children,
  ...rest
}: {
  icon: ReactNode
  active?: boolean
  className?: string
  children?: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`group inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${
        active
          ? 'bg-teal-500/[0.12] text-teal-700 dark:text-teal-300'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-500/[0.08] hover:text-gray-900 dark:hover:text-gray-100'
      } ${className}`}
      {...rest}
    >
      <span
        className={`shrink-0 transition-colors ${
          active
            ? 'text-teal-600 dark:text-teal-400'
            : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'
        }`}
      >
        {icon}
      </span>
      {children && <span className="hidden md:inline">{children}</span>}
    </button>
  )
}

/** Thin vertical rule between context-strip stats / toolbar groups. */
const StripDivider = () => (
  <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-[color:var(--color-hairline-strong)]" />
)

export default function ThreadDetailPanel({
  thread,
  messages,
  currentUserName,
  templates,
  hasEmail,
  patientContext,
  patientTags = [],
  members = [],
  currentUserId = null,
  backHref,
  aiEnabled = false,
  scheduledMessages = [],
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [attachments, setAttachments] = useState<MessageAttachment[]>([])
  const [uploading, setUploading] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Auto-pick the reply channel using the patient's historical inbound
  // distribution (when a strong majority exists) or the channel of the
  // most recent inbound otherwise. See pick-default-reply-channel.ts
  // for the rationale.
  const preferred = useMemo(() => detectPreferredChannel(messages), [messages])
  const [channel, setChannel] = useState<Channel>(() =>
    pickDefaultReplyChannel(messages, hasEmail),
  )
  const [showSnooze, setShowSnooze] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [starred, setStarred] = useState(!!thread.starred)
  const streamRef = useRef<HTMLDivElement | null>(null)

  // Group the flat message list into day buckets, each holding runs of
  // consecutive same-sender messages — so we render one avatar + sender
  // label per group (iMessage/Front quality), not a label over every bubble.
  const dayGroups = useMemo(() => groupMessagesByDay(messages), [messages])

  const patientName = `${thread.patientFirstName} ${thread.patientLastName}`.trim()
  const patientInitials = messageInitials(thread.patientFirstName, thread.patientLastName)
  const patientTint = avatarTint(thread.patientId || patientName)

  // Scroll the message stream to the bottom whenever it changes
  useEffect(() => {
    const el = streamRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread.id, messages.length])

  // Run a thread action inside the transition, catching failures so a single
  // failed action surfaces a toast instead of throwing up to the route error
  // boundary and blanking the whole conversation view.
  function runAction(fn: () => Promise<unknown>, onSuccess: () => void) {
    startTransition(async () => {
      try {
        await fn()
        onSuccess()
      } catch (err) {
        setToast(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.')
      }
    })
  }

  function handleSend() {
    if (!body.trim() && attachments.length === 0) return
    if (uploading > 0) return
    const sent = attachments
    runAction(
      () => sendMessageAction({ patientId: thread.patientId, body, channel, attachments: sent }),
      () => {
        setBody('')
        setAttachments([])
        setToast(`Sent to ${thread.patientFirstName}`)
        router.refresh()
      },
    )
  }

  // Upload one or more chosen image files to S3, then add them to the pending
  // attachment tray. The /api/upload route sniffs magic bytes + rejects
  // non-images, so a bad pick surfaces a toast rather than a broken thumbnail.
  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const room = MAX_MESSAGE_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setToast(`Up to ${MAX_MESSAGE_ATTACHMENTS} photos per message.`)
      return
    }
    const picked = Array.from(files).slice(0, room)
    for (const file of picked) {
      if (!file.type.startsWith('image/')) {
        setToast('Only images can be attached.')
        continue
      }
      if (file.size > 8 * 1024 * 1024) {
        setToast(`"${file.name}" is over 8MB — pick a smaller image.`)
        continue
      }
      setUploading((n) => n + 1)
      uploadFileWithProgress(file, 'message-attachments')
        .promise.then((url) => {
          setAttachments((prev) =>
            prev.length >= MAX_MESSAGE_ATTACHMENTS
              ? prev
              : [...prev, { url, name: file.name, contentType: file.type }],
          )
        })
        .catch(() => setToast(`Couldn't upload "${file.name}". Please try again.`))
        .finally(() => setUploading((n) => Math.max(0, n - 1)))
    }
  }

  function removeAttachment(url: string) {
    setAttachments((prev) => prev.filter((a) => a.url !== url))
  }

  // Queue the composed message for a future time (the cron flushes it). Same
  // body/attachment validation as Send; clears the composer on success.
  function handleSchedule() {
    if (scheduling || uploading > 0) return
    if (!body.trim() && attachments.length === 0) {
      setToast('Add a message or an attachment to schedule.')
      return
    }
    if (!scheduleAt) {
      setToast('Pick a date and time first.')
      return
    }
    const when = new Date(scheduleAt)
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      setToast('Pick a send time at least a minute from now.')
      return
    }
    if (channel === 'sms') {
      setToast('SMS is not available yet — schedule an email or in-app message.')
      return
    }
    setScheduling(true)
    const sent = attachments
    void scheduleMessageAction({
      patientId: thread.patientId,
      body,
      channel,
      scheduledForIso: when.toISOString(),
      attachments: sent,
    })
      .then((res) => {
        if (res.ok) {
          setBody('')
          setAttachments([])
          setShowSchedule(false)
          setScheduleAt('')
          setToast(`Scheduled for ${fmtSchedule(when.toISOString())}`)
          router.refresh()
        } else {
          setToast(res.error)
        }
      })
      .catch(() => setToast("Couldn't schedule the message. Please try again."))
      .finally(() => setScheduling(false))
  }

  function handleCancelScheduled(id: string) {
    void cancelScheduledMessageAction(id)
      .then((res) => {
        if (res.ok) {
          setToast('Scheduled message canceled')
          router.refresh()
        } else {
          setToast(res.error)
        }
      })
      .catch(() => setToast("Couldn't cancel. Please try again."))
  }

  function handleSnooze(hours: number) {
    setShowSnooze(false)
    runAction(
      () => snoozeThreadAction(thread.id, hours),
      () => {
        setToast('Conversation snoozed')
        router.refresh()
      },
    )
  }

  function handleArchive() {
    runAction(
      () => archiveThreadAction(thread.id),
      () => router.push('/messages'),
    )
  }

  function handleReopen() {
    runAction(
      () => reopenThreadAction(thread.id),
      () => {
        setToast('Conversation reopened')
        router.refresh()
      },
    )
  }

  function handleMarkUnread() {
    runAction(
      () => markUnreadAction(thread.id),
      // Close back to the list so the on-open auto-read doesn't immediately
      // re-clear the unread we just set.
      () => router.push('/messages'),
    )
  }

  function handleToggleStar() {
    const next = !starred
    setStarred(next) // optimistic — the star is a trivial toggle
    runAction(
      () => toggleStarAction(thread.id, next),
      () => router.refresh(),
    )
  }

  function handleAssign(userId: string | null) {
    setShowAssign(false)
    if (userId === thread.assignedUserId) return
    const who = userId ? members.find((m) => m.userId === userId)?.name ?? 'teammate' : null
    runAction(
      () => assignThreadAction(thread.id, userId),
      () => {
        setToast(who ? `Assigned to ${who}` : 'Unassigned')
        router.refresh()
      },
    )
  }

  function applyTemplate(key: string) {
    const tpl = templates.find((t) => t.key === key)
    if (tpl) setBody(tpl.rendered)
    setShowTemplates(false)
  }

  // Ask Claude to draft the next reply, then drop it into the composer for
  // staff to review + edit before sending — never auto-sends. Gated by the
  // monthly allowance; surfaces a friendly toast on any miss.
  function handleDraft() {
    if (drafting) return
    setDrafting(true)
    void draftReplyAction(thread.id)
      .then((res) => {
        if (res.ok) {
          setBody(res.draft)
          setToast(
            res.remaining <= 5
              ? `Draft ready · ${res.remaining} AI draft${res.remaining === 1 ? '' : 's'} left this month`
              : 'Draft ready — review and edit before sending',
          )
        } else {
          setToast(
            res.reason === 'no_allowance'
              ? "You've used this month's AI drafts — they reset on the 1st."
              : res.reason === 'no_messages'
                ? 'Add a message first, then AI can draft a reply.'
                : res.reason === 'not_configured'
                  ? 'AI drafting isn’t available yet.'
                  : "Couldn't draft a reply just now. Please try again.",
          )
        }
      })
      .catch(() => setToast("Couldn't draft a reply just now. Please try again."))
      .finally(() => setDrafting(false))
  }

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="border-b border-[color:var(--color-hairline)] bg-[color:var(--color-surface-2)] px-5 py-3 shrink-0">
        {/* Mobile-only back link to the thread list (the two panes collapse
            to one below lg). Hidden at lg+ where both panes are visible. */}
        {backHref && (
          <Link
            href={backHref}
            className="lg:hidden inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-2"
          >
            ← All conversations
          </Link>
        )}
        <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-center gap-3">
          {/* Patient avatar — initials on the patient's stable tint, the same
              chip the thread list shows, so identity carries across panes. */}
          <span
            aria-hidden="true"
            className={`hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-pill)] text-sm font-semibold ring-1 ring-inset ring-black/[0.04] dark:ring-white/10 ${patientTint.bg} ${patientTint.text}`}
          >
            {patientInitials}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/patients/${thread.patientId}`}
                className="text-base font-bold text-gray-900 dark:text-gray-100 hover:underline truncate inline-block"
              >
                {patientName}
              </Link>
              {thread.status === 'snoozed' && (
                <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] bg-amber-500/15 text-amber-700 dark:text-amber-300" title="Snoozed — will resurface later">
                  💤 Snoozed
                </span>
              )}
              {thread.status === 'archived' && (
                <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] bg-gray-500/15 text-gray-600 dark:text-gray-300" title="Archived — closed and tucked away">
                  Archived
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {thread.patientEmail ?? <span className="italic">no email on file</span>}
              {thread.patientPhone && <span> · {thread.patientPhone}</span>}
              {thread.assignedUserName && (
                <span className="ml-2 text-gray-600 dark:text-gray-300">Assigned to {thread.assignedUserName}</span>
              )}
            </p>
          </div>
        </div>
        {/* Routine triage actions — one cohesive icon toolbar; none competes
            with the reply composer's single primary, and archive is NOT
            destructive. Labels collapse below md so the cluster never crowds
            the patient name on a narrow pane. */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Star (priority flag) — a standalone amber toggle, set apart from
              the triage group since it's a flag, not an action. */}
          <button
            type="button"
            onClick={handleToggleStar}
            disabled={pending}
            aria-pressed={starred}
            title={starred ? 'Starred — click to unstar' : 'Star this conversation'}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] transition-colors disabled:opacity-50 ${
              starred
                ? 'text-amber-500 hover:bg-amber-500/10'
                : 'text-gray-400 hover:bg-gray-500/[0.08] hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            <IconStar filled={starred} />
          </button>
          {/* Triage actions, grouped into one segmented instrument-panel
              control so they read as a designed unit — not buttons sprinkled
              in a row. Assign first; snooze/archive/reopen follow by status. */}
          <div className="flex items-center gap-0.5 rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] p-0.5 shadow-[inset_0_0_0_1px_var(--color-hairline)]">
          <div className="relative">
            <ToolButton
              icon={<IconAssign />}
              onClick={() => setShowAssign(!showAssign)}
              disabled={pending}
              active={showAssign || !!thread.assignedUserName}
              aria-expanded={showAssign}
              title="Assign this conversation to a teammate"
            >
              {thread.assignedUserName ? thread.assignedUserName.split(' ')[0] : 'Assign'}
            </ToolButton>
            {showAssign && (
              <div className="pop-in origin-top-right absolute right-0 top-full mt-1 z-10 py-1 min-w-[12rem] max-h-72 overflow-y-auto rounded-[var(--r-lg)] bg-[color:var(--color-surface-1)] shadow-[var(--shadow-pop)]">
                {currentUserId && thread.assignedUserId !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => handleAssign(currentUserId)}
                    className="block w-full text-left text-xs px-3 py-1.5 font-medium text-teal-700 dark:text-teal-300 hover:bg-gray-500/[0.08]"
                  >
                    Assign to me
                  </button>
                )}
                {members.length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">No teammates yet</p>
                ) : (
                  members.map((m) => {
                    const isCurrent = m.userId === thread.assignedUserId
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => handleAssign(m.userId)}
                        className={`flex w-full items-center justify-between gap-2 text-left text-xs px-3 py-1.5 hover:bg-gray-500/[0.08] ${
                          isCurrent
                            ? 'font-semibold text-teal-700 dark:text-teal-300'
                            : 'text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        <span className="truncate">{m.name}</span>
                        {isCurrent && <span aria-hidden="true">✓</span>}
                      </button>
                    )
                  })
                )}
                {thread.assignedUserId && (
                  <button
                    type="button"
                    onClick={() => handleAssign(null)}
                    className="block w-full text-left text-xs px-3 py-1.5 mt-1 border-t border-[color:var(--color-hairline)] text-gray-500 dark:text-gray-400 hover:bg-gray-500/[0.08]"
                  >
                    Unassign
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Mark unread — flag a read thread back into the needs-attention
              view; closes to the list so it isn't auto-re-read on this render. */}
          <ToolButton
            icon={<IconMailUnread />}
            onClick={handleMarkUnread}
            disabled={pending}
            title="Mark unread — bring this back to your needs-attention view"
          >
            Unread
          </ToolButton>
          {thread.status === 'snoozed' ? (
            <ToolButton icon={<IconReopen />} onClick={handleReopen} disabled={pending} title="Reopen this snoozed conversation">
              Reopen
            </ToolButton>
          ) : thread.status === 'archived' ? (
            <ToolButton icon={<IconReopen />} onClick={handleReopen} disabled={pending} title="Reopen this archived conversation">
              Reopen
            </ToolButton>
          ) : (
            <>
              <div className="relative">
                <ToolButton
                  icon={<IconSnooze />}
                  onClick={() => setShowSnooze(!showSnooze)}
                  disabled={pending}
                  active={showSnooze}
                  aria-expanded={showSnooze}
                  title="Snooze this conversation — it'll come back later"
                >
                  Snooze
                </ToolButton>
                {showSnooze && (
                  <div className="pop-in origin-top-right absolute right-0 top-full mt-1 z-10 py-1 min-w-[10rem] rounded-[var(--r-lg)] bg-[color:var(--color-surface-1)] shadow-[var(--shadow-pop)]">
                    {SNOOZE_OPTIONS.map((opt) => (
                      <button
                        key={opt.hours}
                        type="button"
                        onClick={() => handleSnooze(opt.hours)}
                        className="block w-full text-left text-xs px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-500/[0.08]"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ToolButton icon={<IconArchive />} onClick={handleArchive} disabled={pending} title="Close this conversation and tuck it away">
                Archive
              </ToolButton>
            </>
          )}
          </div>
          {/* Book a visit without leaving the conversation — opens the same
              in-place drawer staff use on the patient page (provider / type /
              slot-picker / walk-in). Keeps them in relationship context. */}
          <button
            type="button"
            onClick={() => setBookOpen(true)}
            title={`Book a visit for ${thread.patientFirstName}`}
            className="group ml-0.5 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2.5 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 transition-colors"
          >
            <IconCalendarPlus />
            <span className="hidden md:inline">Book</span>
          </button>
          <Link
            href={`/patients/${thread.patientId}`}
            title="Open this patient's full record"
            className="group inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2.5 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 transition-colors"
          >
            <IconUser />
            <span className="hidden md:inline">View patient</span>
          </Link>
        </div>
        </div>

        {/* ── Patient context strip ──────────────────────────────────
            One calm line so staff answering "see you Thursday?" can see the
            visit/balance/intake picture without leaving the inbox. Tones
            follow the contract: missing-intake is amber (OUR action), a
            positive balance is rose (problem now). Links to the patient. */}
        {patientContext && (
          <Link
            href={`/patients/${patientContext.patientId}`}
            title="Open this patient's record"
            className="v2-well group mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-xs transition-colors hover:bg-[color:var(--color-hairline)]"
          >
            {/* Next visit */}
            <span className="inline-flex items-center gap-1.5">
              <span className="text-gray-400 dark:text-gray-500"><IconCalendar /></span>
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">Next</span>
              {patientContext.nextVisitAt ? (
                <span className="font-medium text-gray-700 dark:text-gray-200 font-mono-num tabular-nums">
                  {fmtVisitDate(patientContext.nextVisitAt)}
                  {patientContext.nextVisitType ? ` · ${patientContext.nextVisitType}` : ''}
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">none scheduled</span>
              )}
            </span>
            <StripDivider />
            {/* Last visit */}
            <span className="inline-flex items-center gap-1.5">
              <span className="text-gray-400 dark:text-gray-500"><IconClock /></span>
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">Last</span>
              {patientContext.lastVisitAt ? (
                <span className="font-medium text-gray-700 dark:text-gray-200 font-mono-num tabular-nums">
                  {fmtVisitDate(patientContext.lastVisitAt)}
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">none yet</span>
              )}
            </span>
            <StripDivider />
            {/* Balance — the icon + value tint by state (rose = owed now,
                emerald = clear), so the picture reads at a glance. */}
            <span className="inline-flex items-center gap-1.5">
              <span
                className={
                  patientContext.outstandingBalanceCents != null && patientContext.outstandingBalanceCents > 0
                    ? 'text-rose-500 dark:text-rose-400'
                    : patientContext.outstandingBalanceCents === 0
                      ? 'text-emerald-500 dark:text-emerald-400'
                      : 'text-gray-400 dark:text-gray-500'
                }
              >
                <IconCard />
              </span>
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-[color:var(--color-ink-500)]">Balance</span>
              {patientContext.outstandingBalanceCents == null ? (
                <span className="text-gray-500 dark:text-gray-400" title="No balance synced from the PMS">no PMS balance</span>
              ) : patientContext.outstandingBalanceCents > 0 ? (
                <span className="font-semibold text-rose-700 dark:text-rose-300 font-mono-num tabular-nums">
                  {fmtMoney(patientContext.outstandingBalanceCents)}
                </span>
              ) : (
                <span className="font-medium text-emerald-700 dark:text-emerald-300">paid up</span>
              )}
            </span>
            {patientContext.missingIntake && (
              <>
                <StripDivider />
                <span
                  className="inline-flex items-center gap-1 rounded-[var(--r-xs)] bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300"
                  title="A visit is booked soon and no intake form is on file"
                >
                  <IconClipboard /> Intake missing
                </span>
              </>
            )}
          </Link>
        )}

        {/* Tags — group this patient (VIP / anxious / recare) right from the
            conversation; flows into the targeting loop (view → audience). */}
        <div className="mt-2.5">
          <PatientTagControl patientId={thread.patientId} initialTags={patientTags} />
        </div>

        {/* Quick follow-up — jot "chase this next week" without leaving the
            conversation. It flows into My Day, the morning digest, the
            follow-ups board, and the patient's timeline. */}
        <div className="mt-2">
          <FollowupQuickAdd
            patientId={thread.patientId}
            patientFirstName={thread.patientFirstName}
            onDone={(msg) => setToast(msg)}
          />
        </div>
      </div>

      {/* ── Message stream ────────────────────────────────────────── */}
      <div ref={streamRef} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 bg-[color:var(--color-canvas)]">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon="✍️"
              title="No messages yet"
              body={`Start the conversation with ${thread.patientFirstName} — type a note below and it lands in their thread across every channel.`}
            />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {dayGroups.map((day) => (
              <div key={day.dayKey}>
                {/* Day separator — a centred hairline pill so the eye can
                    place each message in time without a loud header. */}
                <div className="relative my-3 flex items-center justify-center" role="separator" aria-label={day.label}>
                  <span className="absolute inset-x-0 top-1/2 h-px bg-[color:var(--color-hairline)]" aria-hidden="true" />
                  <span className="relative z-10 rounded-[var(--r-pill)] bg-[color:var(--color-surface-sunk)] px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">
                    {day.label}
                  </span>
                </div>

                <ul className="space-y-3.5">
                  {day.groups.map((group) => {
                    const outbound = group.direction === 'outbound'
                    const ch = channelMeta(group.channel)
                    const senderLabel = outbound
                      ? (group.senderName ?? currentUserName ?? 'You')
                      : patientName
                    const last = group.messages[group.messages.length - 1]
                    return (
                      <li
                        key={group.key}
                        className={`flex gap-2.5 ${outbound ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        {/* Avatar once per group. Inbound = the patient's
                            stable tint; outbound = a quiet ink chip for "us". */}
                        <span
                          aria-hidden="true"
                          className={`mt-auto hidden sm:flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-pill)] text-xs font-semibold ${
                            outbound
                              ? 'bg-teal-500/15 text-teal-700 dark:bg-teal-400/20 dark:text-teal-200'
                              : `${patientTint.bg} ${patientTint.text}`
                          }`}
                        >
                          {outbound ? messageInitials(senderLabel) : patientInitials}
                        </span>

                        <div className={`flex min-w-0 max-w-[78%] flex-col gap-1 ${outbound ? 'items-end' : 'items-start'}`}>
                          {/* One sender + channel line per group, quiet. */}
                          <div className={`flex items-center gap-1.5 px-0.5 text-xs ${outbound ? 'flex-row-reverse' : ''}`}>
                            <span className="font-semibold text-gray-600 dark:text-gray-300 truncate max-w-[12rem]">
                              {senderLabel}
                            </span>
                            <span
                              className={`shrink-0 inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] ${ch.pill}`}
                              title={ch.title}
                            >
                              <span aria-hidden="true">{ch.icon}</span>
                              {ch.label}
                            </span>
                          </div>

                          {/* The bubbles. Outbound = ink fill aligned right;
                              inbound = etched surface aligned left. Tighter
                              corners between same-sender bubbles in the run. */}
                          {group.messages.map((m, i) => {
                            const first = i === 0
                            const lastInRun = i === group.messages.length - 1
                            const tail = outbound
                              ? (first ? 'rounded-tr-md' : '') + (lastInRun ? ' rounded-br-md' : '')
                              : (first ? 'rounded-tl-md' : '') + (lastInRun ? ' rounded-bl-md' : '')
                            return (
                              <div
                                key={m.id}
                                className={`w-fit px-3.5 py-2 rounded-[var(--r-lg)] text-sm leading-relaxed whitespace-pre-wrap break-words ${tail} ${
                                  outbound
                                    ? 'bg-teal-600 text-white dark:bg-teal-500'
                                    : 'bg-[color:var(--color-surface-2)] text-gray-800 dark:text-gray-100 shadow-[inset_0_0_0_1px_var(--color-hairline)]'
                                }`}
                              >
                                {m.subject && m.channel === 'email' && (
                                  <p className="font-semibold text-xs mb-1 opacity-75">{m.subject}</p>
                                )}
                                {m.body}
                                {m.attachments && m.attachments.length > 0 && (
                                  <MessageAttachments
                                    attachments={m.attachments}
                                    className={m.body ? 'mt-2' : ''}
                                  />
                                )}
                              </div>
                            )
                          })}

                          {/* Timestamp once per group, on the last bubble —
                              outbound carries a delivery receipt (Delivered ✓ /
                              Read ✓✓ for in-app; email shows just the time). */}
                          <span className="flex items-center gap-1 px-0.5 text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                            {fmtClock(last.sentAt)}
                            {outbound && (last.readByPatientAt || last.deliveredAt) && (
                              <span
                                className={`inline-flex items-center gap-0.5 ${
                                  last.readByPatientAt
                                    ? 'text-teal-600 dark:text-teal-400 font-medium'
                                    : 'text-gray-400 dark:text-gray-500'
                                }`}
                                title={
                                  last.readByPatientAt
                                    ? 'Read by the patient in their portal'
                                    : 'Delivered to the patient portal'
                                }
                              >
                                {last.readByPatientAt ? <IconCheckDouble /> : <IconCheck />}
                                {last.readByPatientAt ? 'Read' : 'Delivered'}
                              </span>
                            )}
                          </span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Scheduled sends (pending) ─────────────────────────────────
          Shown above the composer so staff see what's queued + can cancel.
          Renders even when archived so a queued send is never invisible. */}
      {scheduledMessages.length > 0 && (
        <div className="border-t border-[color:var(--color-hairline)] bg-[color:var(--color-surface-1)] px-4 sm:px-6 pt-3 shrink-0">
          <div className="max-w-3xl mx-auto space-y-1.5">
            {scheduledMessages.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-[var(--r-sm)] bg-indigo-500/[0.08] px-3 py-1.5 text-xs text-indigo-800 dark:text-indigo-200"
              >
                <span aria-hidden="true">⏰</span>
                <span className="font-medium shrink-0">Scheduled · {fmtSchedule(s.scheduledFor)}</span>
                <span className="text-indigo-700/70 dark:text-indigo-300/70 truncate">
                  {s.body || (s.attachments.length > 0 ? `${s.attachments.length} photo${s.attachments.length === 1 ? '' : 's'}` : '')}
                  {s.channel === 'email' ? ' · email' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => handleCancelScheduled(s.id)}
                  className="ml-auto shrink-0 font-semibold text-indigo-700 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-100 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Composer (only when not archived) ─────────────────────── */}
      {thread.status !== 'archived' && (
        <div className="border-t border-[color:var(--color-hairline)] bg-[color:var(--color-surface-1)] px-4 sm:px-6 py-3 shrink-0">
          <div className="max-w-3xl mx-auto">
            {/* Controls row — channel select, templates menu, prefers hint. */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <label className="sr-only" htmlFor="reply-channel">Reply channel</label>
              <select
                id="reply-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                title="Choose how this reply is delivered"
                className="form-select text-xs font-medium py-1 pl-2 pr-7 text-gray-700 dark:text-gray-200"
              >
                <option value="in_app">In-app message</option>
                <option value="email" disabled={!hasEmail}>
                  {hasEmail ? 'Email' : 'Email (no address on file)'}
                </option>
                <option value="sms" disabled>SMS (coming soon)</option>
              </select>
              {templates.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTemplates((s) => !s)}
                    aria-expanded={showTemplates}
                    title="Drop a saved reply into the box"
                    className="inline-flex items-center gap-1 rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    Templates <span aria-hidden="true" className="opacity-60">▾</span>
                  </button>
                  {showTemplates && (
                    <div className="pop-in origin-bottom-left absolute left-0 bottom-full mb-1 z-10 py-1 min-w-[14rem] rounded-[var(--r-lg)] bg-[color:var(--color-surface-1)] shadow-[var(--shadow-pop)]">
                      {templates.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => applyTemplate(t.key)}
                          className="block w-full text-left text-xs px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-500/[0.08]"
                        >
                          {t.label}
                        </button>
                      ))}
                      <a
                        href="/settings/message-templates"
                        className="mt-1 block border-t border-[color:var(--color-hairline)] px-3 pt-1.5 pb-0.5 text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400"
                      >
                        Manage replies →
                      </a>
                    </div>
                  )}
                </div>
              )}
              {aiEnabled && messages.length > 0 && (
                // AI draft assist — fills the box with an on-voice reply for
                // staff to review. Violet (special tone), distinct from the
                // teal primary Send so it never competes for "the" action.
                <button
                  type="button"
                  onClick={handleDraft}
                  disabled={drafting}
                  title="Let AI draft a reply you can review and edit"
                  className="inline-flex items-center gap-1 rounded-[var(--r-sm)] border border-violet-300/70 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-500/15 disabled:opacity-50 disabled:pointer-events-none dark:border-violet-400/30 dark:text-violet-300 transition-colors"
                >
                  <span aria-hidden="true">✨</span>
                  {drafting ? 'Drafting…' : 'Draft'}
                </button>
              )}
              {/* Attach photos — opens the OS file picker; uploads land in the
                  tray above the textarea. Hidden input is driven by the button. */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files)
                  e.target.value = '' // allow re-picking the same file
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_MESSAGE_ATTACHMENTS}
                title={
                  attachments.length >= MAX_MESSAGE_ATTACHMENTS
                    ? `Up to ${MAX_MESSAGE_ATTACHMENTS} photos`
                    : 'Attach a photo'
                }
                className="inline-flex items-center gap-1 rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-2)] px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-gray-300 disabled:opacity-50 disabled:pointer-events-none dark:text-gray-200 dark:hover:border-gray-600 transition-colors"
              >
                <span aria-hidden="true">📎</span>
                <span className="hidden sm:inline">Photo</span>
              </button>
              {preferred && (
                // A derived metadata hint, not a status — quiet ink chip in a
                // sunk well so it never reads as an encoded tone.
                <span
                  className="v2-well text-xs font-medium px-1.5 py-0.5 text-gray-600 dark:text-gray-300"
                  title={`${preferred.count} of ${preferred.totalInbound} inbound messages on ${CHANNEL_LABEL[preferred.channel]} (${Math.round(preferred.share * 100)}%)`}
                >
                  {thread.patientFirstName} prefers {CHANNEL_LABEL[preferred.channel]}
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto tabular-nums">
                ⌘ + Enter to send
              </span>
            </div>
            {/* Pending-attachment tray — thumbnails with a remove ×; an
                uploading placeholder shimmers while a transfer is in flight. */}
            {(attachments.length > 0 || uploading > 0) && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div
                    key={a.url}
                    className="group relative h-16 w-16 overflow-hidden rounded-[var(--r-sm)] ring-1 ring-inset ring-[color:var(--color-hairline-strong)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- user upload preview */}
                    <img src={a.url} alt={a.name || 'attachment'} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.url)}
                      title="Remove"
                      className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {uploading > 0 &&
                  Array.from({ length: uploading }).map((_, i) => (
                    <div
                      key={`up-${i}`}
                      className="skeleton h-16 w-16 rounded-[var(--r-sm)]"
                      aria-label="Uploading photo"
                    />
                  ))}
              </div>
            )}
            {/* Framed reply box — textarea + Send together in one calm panel. */}
            <div className="v2-panel flex items-end gap-2 p-2 focus-within:shadow-[inset_0_0_0_1px_var(--color-hairline-strong)] transition-shadow">
              <label className="sr-only" htmlFor="reply-body">Your reply</label>
              <textarea
                id="reply-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend()
                }}
                placeholder={`Reply to ${thread.patientFirstName}…`}
                rows={2}
                className="flex-1 resize-none border-0 bg-transparent px-1.5 py-1 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-0"
              />
              {/* Schedule (send later) — a quiet clock toggle beside Send; opens
                  a popover with a date+time picker. Never competes with Send. */}
              {channel !== 'sms' && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSchedule((s) => !s)
                      if (!scheduleAt) setScheduleAt(defaultScheduleLocal())
                    }}
                    disabled={pending || scheduling}
                    aria-expanded={showSchedule}
                    title="Schedule this message to send later"
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] border transition-colors disabled:opacity-50 ${
                      showSchedule
                        ? 'border-indigo-300 bg-indigo-500/10 text-indigo-700 dark:border-indigo-400/40 dark:text-indigo-300'
                        : 'border-[color:var(--color-hairline-strong)] bg-[color:var(--color-surface-2)] text-gray-600 hover:text-gray-900 dark:text-gray-300'
                    }`}
                  >
                    <IconClock />
                  </button>
                  {showSchedule && (
                    <div className="pop-in origin-bottom-right absolute right-0 bottom-full mb-1 z-10 w-64 rounded-[var(--r-lg)] bg-[color:var(--color-surface-1)] p-3 shadow-[var(--shadow-pop)]">
                      <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">Send later</p>
                      <input
                        type="datetime-local"
                        value={scheduleAt}
                        min={defaultScheduleLocal()}
                        onChange={(e) => setScheduleAt(e.target.value)}
                        className="form-input w-full text-xs"
                        aria-label="Send date and time"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowSchedule(false)}
                          className="rounded-[var(--r-sm)] px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSchedule}
                          disabled={scheduling || uploading > 0 || (!body.trim() && attachments.length === 0)}
                          className="rounded-[var(--r-sm)] bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {scheduling ? 'Scheduling…' : 'Schedule'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* The pane's single primary action. */}
              <ActionButton
                variant="primary"
                size="sm"
                onClick={handleSend}
                disabled={pending || uploading > 0 || (!body.trim() && attachments.length === 0)}
              >
                {pending ? 'Sending…' : `Send ${channel === 'email' ? 'email' : channel === 'sms' ? 'SMS' : 'message'}`}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {bookOpen && (
        <BookFromPatientDrawer
          patientId={thread.patientId}
          patientName={patientName}
          onClose={() => setBookOpen(false)}
        />
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}
