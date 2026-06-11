'use client'

import { useState, useTransition, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import { channelMeta } from './channel-meta'
import {
  archiveThreadAction,
  reopenThreadAction,
  sendMessageAction,
  snoozeThreadAction,
} from './clinic-actions'
import { detectPreferredChannel, pickDefaultReplyChannel } from './pick-default-reply-channel'

type Channel = 'in_app' | 'email' | 'sms'

interface ThreadHeader {
  id: string
  patientId: string
  patientFirstName: string
  patientLastName: string
  patientEmail: string | null
  patientPhone: string | null
  status: 'open' | 'snoozed' | 'archived'
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

export default function ThreadDetailPanel({
  thread,
  messages,
  currentUserName,
  templates,
  hasEmail,
  patientContext,
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
  const streamRef = useRef<HTMLDivElement | null>(null)

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

  function applyTemplate(key: string) {
    const tpl = templates.find((t) => t.key === key)
    if (tpl) setBody(tpl.rendered)
  }

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="border-b border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 px-5 py-3 shrink-0">
        {/* Mobile-only back link to the thread list (the two panes collapse
            to one below lg). Hidden at lg+ where both panes are visible. */}
        {backHref && (
          <Link
            href={backHref}
            className="lg:hidden inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 mb-2"
          >
            ← All conversations
          </Link>
        )}
        <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/patients/${thread.patientId}`}
            className="text-base font-bold text-stone-900 dark:text-stone-100 hover:underline truncate inline-block"
          >
            {thread.patientFirstName} {thread.patientLastName}
          </Link>
          <p className="text-xs text-stone-500 dark:text-stone-400 truncate">
            {thread.patientEmail ?? <span className="italic">no email on file</span>}
            {thread.patientPhone && <span> · {thread.patientPhone}</span>}
            {thread.assignedUserName && (
              <span className="ml-2 text-violet-700 dark:text-violet-300">Assigned to {thread.assignedUserName}</span>
            )}
          </p>
        </div>
        {/* Routine triage actions — all secondary; none competes with the
            reply composer's single primary, and archive is NOT destructive. */}
        <div className="flex items-center gap-1.5 shrink-0">
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
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg z-10 py-1 min-w-[10rem]">
                    {SNOOZE_OPTIONS.map((opt) => (
                      <button
                        key={opt.hours}
                        type="button"
                        onClick={() => handleSnooze(opt.hours)}
                        className="block w-full text-left text-xs px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200"
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
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
          >
            <span>
              <span className="text-stone-400 dark:text-stone-500">Next visit </span>
              {patientContext.nextVisitAt ? (
                <span className="font-medium text-stone-700 dark:text-stone-200 tabular-nums">
                  {fmtVisitDate(patientContext.nextVisitAt)}
                  {patientContext.nextVisitType ? ` · ${patientContext.nextVisitType}` : ''}
                </span>
              ) : (
                <span className="text-stone-500 dark:text-stone-400">none scheduled</span>
              )}
            </span>
            <span aria-hidden="true" className="text-stone-300 dark:text-stone-600">·</span>
            <span>
              <span className="text-stone-400 dark:text-stone-500">Last visit </span>
              {patientContext.lastVisitAt ? (
                <span className="font-medium text-stone-700 dark:text-stone-200 tabular-nums">
                  {fmtVisitDate(patientContext.lastVisitAt)}
                </span>
              ) : (
                <span className="text-stone-500 dark:text-stone-400">none yet</span>
              )}
            </span>
            <span aria-hidden="true" className="text-stone-300 dark:text-stone-600">·</span>
            <span>
              <span className="text-stone-400 dark:text-stone-500">Balance </span>
              {patientContext.outstandingBalanceCents == null ? (
                <span className="text-stone-500 dark:text-stone-400" title="No balance synced from the PMS">
                  no PMS balance
                </span>
              ) : patientContext.outstandingBalanceCents > 0 ? (
                <span className="font-semibold text-rose-700 dark:text-rose-300 tabular-nums">
                  {fmtMoney(patientContext.outstandingBalanceCents)}
                </span>
              ) : (
                <span className="font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">paid up</span>
              )}
            </span>
            {patientContext.missingIntake && (
              <>
                <span aria-hidden="true" className="text-stone-300 dark:text-stone-600">·</span>
                <span
                  className="font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  title="A visit is booked soon and no intake form is on file"
                >
                  📝 Intake missing
                </span>
              </>
            )}
          </Link>
        )}
      </div>

      {/* ── Message stream ────────────────────────────────────────── */}
      <div ref={streamRef} className="flex-1 overflow-y-auto px-5 py-4 bg-stone-50 dark:bg-stone-950">
        {messages.length === 0 ? (
          <EmptyState
            icon="✍️"
            title="No messages yet"
            body={`Send the first one to ${thread.patientFirstName} below.`}
          />
        ) : (
          <ul className="space-y-3 max-w-3xl mx-auto">
            {messages.map((m) => {
              const ch = channelMeta(m.channel)
              return (
                <li key={m.id} className={m.direction === 'outbound' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className="max-w-[80%]">
                    <div className={`text-xs uppercase tracking-wider font-semibold mb-1 text-stone-500 dark:text-stone-400 ${m.direction === 'outbound' ? 'text-right' : ''}`}>
                      {m.direction === 'outbound' ? (m.sentByUserName ?? currentUserName ?? 'You') : `${thread.patientFirstName} ${thread.patientLastName}`}
                      <span className="ml-1.5 normal-case font-normal text-stone-500 dark:text-stone-400 tabular-nums">
                        · {new Date(m.sentAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <span
                        className={`ml-1.5 normal-case font-medium px-1.5 py-0.5 rounded text-xs ${ch.pill}`}
                        title={ch.title}
                      >
                        {ch.label}
                      </span>
                    </div>
                    <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      m.direction === 'outbound'
                        ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 rounded-tr-sm'
                        : 'bg-white border border-stone-200 dark:bg-stone-800 dark:border-stone-700 text-stone-800 dark:text-stone-100 rounded-tl-sm'
                    }`}>
                      {m.subject && m.channel === 'email' && (
                        <p className="font-semibold text-xs mb-1 opacity-75">{m.subject}</p>
                      )}
                      {m.body}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* ── Composer (only when not archived) ─────────────────────── */}
      {thread.status !== 'archived' && (
        <div className="border-t border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 px-5 py-3 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <label className="sr-only" htmlFor="reply-channel">Reply channel</label>
              <select
                id="reply-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                title="Choose how this reply is delivered"
                className="text-xs font-medium px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200"
              >
                <option value="in_app">In-app message</option>
                <option value="email" disabled={!hasEmail}>
                  {hasEmail ? 'Email' : 'Email (no address on file)'}
                </option>
                <option value="sms" disabled>SMS (coming soon)</option>
              </select>
              {templates.length > 0 && (
                <>
                  <label className="sr-only" htmlFor="reply-template">Insert a template</label>
                  <select
                    id="reply-template"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) applyTemplate(e.target.value)
                      e.target.value = ''
                    }}
                    title="Drop a saved reply into the box"
                    className="text-xs font-medium px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200"
                  >
                    <option value="">Insert template…</option>
                    {templates.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                </>
              )}
              {preferred && (
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300"
                  title={`${preferred.count} of ${preferred.totalInbound} inbound messages on ${CHANNEL_LABEL[preferred.channel]} (${Math.round(preferred.share * 100)}%)`}
                >
                  {thread.patientFirstName} prefers {CHANNEL_LABEL[preferred.channel]}
                </span>
              )}
              <span className="text-xs text-stone-500 dark:text-stone-400 ml-auto tabular-nums">
                ⌘ + Enter to send
              </span>
            </div>
            <label className="sr-only" htmlFor="reply-body">Your reply</label>
            <textarea
              id="reply-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend()
              }}
              placeholder={`Reply to ${thread.patientFirstName}…`}
              rows={3}
              className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 resize-none"
            />
            <div className="flex justify-end mt-2">
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
