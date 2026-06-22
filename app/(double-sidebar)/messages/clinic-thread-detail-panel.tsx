'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import FollowupQuickAdd from '@/components/followups/followup-quick-add'
import PatientTagControl from '@/components/tags/patient-tag-control'
import type { PatientTagView } from '@/lib/types/patient-tags'
import { channelMeta } from './channel-meta'
import {
  archiveThreadAction,
  assignThreadAction,
  reopenThreadAction,
  sendMessageAction,
  snoozeThreadAction,
} from './clinic-actions'
import { detectPreferredChannel, pickDefaultReplyChannel } from './pick-default-reply-channel'
import { avatarTint, groupMessagesByDay, messageInitials } from './message-grouping'

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
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState('')
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

  function handleSend() {
    if (!body.trim()) return
    startTransition(async () => {
      await sendMessageAction({
        patientId: thread.patientId,
        body,
        channel,
      })
      setBody('')
      setToast(`Sent to ${thread.patientFirstName}`)
      router.refresh()
    })
  }

  function handleSnooze(hours: number) {
    setShowSnooze(false)
    startTransition(async () => {
      await snoozeThreadAction(thread.id, hours)
      setToast('Thread snoozed')
      router.refresh()
    })
  }

  function handleArchive() {
    startTransition(async () => {
      await archiveThreadAction(thread.id)
      router.push('/messages')
    })
  }

  function handleReopen() {
    startTransition(async () => {
      await reopenThreadAction(thread.id)
      setToast('Thread reopened')
      router.refresh()
    })
  }

  function handleAssign(userId: string | null) {
    setShowAssign(false)
    if (userId === thread.assignedUserId) return
    const who = userId ? members.find((m) => m.userId === userId)?.name ?? 'teammate' : null
    startTransition(async () => {
      await assignThreadAction(thread.id, userId)
      setToast(who ? `Assigned to ${who}` : 'Unassigned')
      router.refresh()
    })
  }

  function applyTemplate(key: string) {
    const tpl = templates.find((t) => t.key === key)
    if (tpl) setBody(tpl.rendered)
    setShowTemplates(false)
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
            className={`hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-pill)] text-sm font-semibold ${patientTint.bg} ${patientTint.text}`}
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
        {/* Routine triage actions — all secondary; none competes with the
            reply composer's single primary, and archive is NOT destructive. */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Assign / reassign — independent of status, so it sits ahead of the
              status-dependent snooze/archive/reopen controls. */}
          <div className="relative">
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={() => setShowAssign(!showAssign)}
              disabled={pending}
              aria-expanded={showAssign}
              title="Assign this conversation to a teammate"
            >
              {thread.assignedUserName ? `👤 ${thread.assignedUserName.split(' ')[0]}` : 'Assign'}
            </ActionButton>
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
          {thread.status === 'snoozed' ? (
            <ActionButton size="sm" variant="secondary" onClick={handleReopen} disabled={pending}>
              Reopen (snoozed)
            </ActionButton>
          ) : thread.status === 'archived' ? (
            <ActionButton size="sm" variant="secondary" onClick={handleReopen} disabled={pending}>
              Reopen (archived)
            </ActionButton>
          ) : (
            <>
              <div className="relative">
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowSnooze(!showSnooze)}
                  disabled={pending}
                  aria-expanded={showSnooze}
                  title="Snooze this thread to resurface it later"
                >
                  💤 Snooze
                </ActionButton>
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
              <ActionButton size="sm" variant="secondary" onClick={handleArchive} disabled={pending} title="Close and tuck this thread away">
                Archive
              </ActionButton>
            </>
          )}
          <ActionButton size="sm" variant="ghost" href={`/patients/${thread.patientId}`}>
            View patient →
          </ActionButton>
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
            className="v2-well group mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 transition-colors hover:bg-[color:var(--color-hairline)]"
          >
            <span className="flex items-baseline gap-1.5">
              <span className="text-[color:var(--color-ink-500)] uppercase tracking-wide text-[0.625rem] font-semibold">Next</span>
              {patientContext.nextVisitAt ? (
                <span className="font-medium text-gray-700 dark:text-gray-200 font-mono-num tabular-nums">
                  {fmtVisitDate(patientContext.nextVisitAt)}
                  {patientContext.nextVisitType ? ` · ${patientContext.nextVisitType}` : ''}
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">none scheduled</span>
              )}
            </span>
            <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[color:var(--color-ink-500)] uppercase tracking-wide text-[0.625rem] font-semibold">Last</span>
              {patientContext.lastVisitAt ? (
                <span className="font-medium text-gray-700 dark:text-gray-200 font-mono-num tabular-nums">
                  {fmtVisitDate(patientContext.lastVisitAt)}
                </span>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">none yet</span>
              )}
            </span>
            <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[color:var(--color-ink-500)] uppercase tracking-wide text-[0.625rem] font-semibold">Balance</span>
              {patientContext.outstandingBalanceCents == null ? (
                <span className="text-gray-500 dark:text-gray-400" title="No balance synced from the PMS">
                  no PMS balance
                </span>
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
                <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
                <span
                  className="font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  title="A visit is booked soon and no intake form is on file"
                >
                  📝 Intake missing
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
      <div ref={streamRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 bg-[color:var(--color-canvas)]">
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
                              ? 'bg-ink-800/10 text-ink-700 dark:bg-white/10 dark:text-gray-200'
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
                              className={`shrink-0 font-medium px-1.5 py-0.5 rounded-[var(--r-xs)] ${ch.pill}`}
                              title={ch.title}
                            >
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
                                    ? 'bg-ink-900 text-[color:var(--color-surface-2)]'
                                    : 'bg-[color:var(--color-surface-2)] text-gray-800 dark:text-gray-100 shadow-[inset_0_0_0_1px_var(--color-hairline)]'
                                }`}
                              >
                                {m.subject && m.channel === 'email' && (
                                  <p className="font-semibold text-xs mb-1 opacity-75">{m.subject}</p>
                                )}
                                {m.body}
                              </div>
                            )
                          })}

                          {/* Timestamp once per group, on the last bubble. */}
                          <span className="px-0.5 text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                            {fmtClock(last.sentAt)}
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
              {/* The pane's single primary action. */}
              <ActionButton variant="primary" size="sm" onClick={handleSend} disabled={pending || !body.trim()}>
                {pending ? 'Sending…' : `Send ${channel === 'email' ? 'email' : channel === 'sms' ? 'SMS' : 'message'}`}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </>
  )
}
