'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  archiveThreadAction,
  reopenThreadAction,
  sendMessageAction,
  snoozeThreadAction,
} from './clinic-actions'
import { pickDefaultReplyChannel } from './pick-default-reply-channel'

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

interface Props {
  thread: ThreadHeader
  messages: SerializedMessage[]
  currentUserName: string | null
  templates: TemplateOption[]
  hasEmail: boolean
}

const SNOOZE_OPTIONS = [
  { label: '4 hours', hours: 4 },
  { label: 'Tomorrow', hours: 24 },
  { label: 'Next week', hours: 24 * 7 },
]

export default function ThreadDetailPanel({
  thread,
  messages,
  currentUserName,
  templates,
  hasEmail,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState('')
  // Auto-pick the reply channel from the last INBOUND message — replying
  // on the channel the patient wrote to us on is the right default. The
  // prior heuristic used `thread.lastMessageChannel`, which reflects the
  // last message of ANY direction; once staff replied via in-app to an
  // emailed patient, that bumped the default and we'd silently drop off
  // email even though that was still the patient's preferred channel.
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
      router.refresh()
    })
  }

  function handleSnooze(hours: number) {
    setShowSnooze(false)
    startTransition(async () => {
      await snoozeThreadAction(thread.id, hours)
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
      <div className="border-b border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0 flex-1">
          <Link
            href={`/patients/${thread.patientId}`}
            className="text-base font-bold text-stone-900 dark:text-stone-100 hover:underline truncate inline-block"
          >
            {thread.patientFirstName} {thread.patientLastName}
          </Link>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
            {thread.patientEmail ?? <span className="italic">no email on file</span>}
            {thread.patientPhone && <span> · {thread.patientPhone}</span>}
            {thread.assignedUserName && (
              <span className="ml-2 text-violet-600 dark:text-violet-400">Assigned to {thread.assignedUserName}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {thread.status === 'snoozed' ? (
            <button
              onClick={handleReopen}
              disabled={pending}
              className="text-[11px] font-medium px-2 py-1 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300"
            >
              Reopen (snoozed)
            </button>
          ) : thread.status === 'archived' ? (
            <button
              onClick={handleReopen}
              disabled={pending}
              className="text-[11px] font-medium px-2 py-1 rounded-md bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
            >
              Reopen (archived)
            </button>
          ) : (
            <>
              <div className="relative">
                <button
                  onClick={() => setShowSnooze(!showSnooze)}
                  disabled={pending}
                  className="text-[11px] font-medium px-2 py-1 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  💤 Snooze
                </button>
                {showSnooze && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg z-10 py-1 min-w-[10rem]">
                    {SNOOZE_OPTIONS.map((opt) => (
                      <button
                        key={opt.hours}
                        onClick={() => handleSnooze(opt.hours)}
                        className="block w-full text-left text-[12px] px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleArchive}
                disabled={pending}
                className="text-[11px] font-medium px-2 py-1 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Archive
              </button>
            </>
          )}
          <Link
            href={`/patients/${thread.patientId}`}
            className="text-[11px] font-medium px-2 py-1 rounded-md text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10"
          >
            View patient →
          </Link>
        </div>
      </div>

      {/* ── Message stream ────────────────────────────────────────── */}
      <div ref={streamRef} className="flex-1 overflow-y-auto px-5 py-4 bg-stone-50 dark:bg-stone-950">
        {messages.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
              No messages yet. Send the first one below.
            </p>
          </div>
        ) : (
          <ul className="space-y-3 max-w-3xl mx-auto">
            {messages.map((m) => (
              <li key={m.id} className={m.direction === 'outbound' ? 'flex justify-end' : 'flex justify-start'}>
                <div className="max-w-[80%]">
                  <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1 ${m.direction === 'outbound' ? 'text-right text-stone-500 dark:text-stone-400' : 'text-stone-500 dark:text-stone-400'}`}>
                    {m.direction === 'outbound' ? (m.sentByUserName ?? currentUserName ?? 'You') : `${thread.patientFirstName} ${thread.patientLastName}`}
                    <span className="ml-1.5 normal-case font-normal text-stone-400 dark:text-stone-500 tabular-nums">
                      · {new Date(m.sentAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span className={`ml-1.5 normal-case font-medium px-1 py-0.5 rounded text-[9px] ${
                      m.channel === 'email' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                      : m.channel === 'sms' ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
                      : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                    }`}>
                      {m.channel === 'in_app' ? 'In-app' : m.channel === 'email' ? 'Email' : 'SMS'}
                    </span>
                  </div>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.direction === 'outbound'
                      ? 'bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-900 rounded-tr-sm'
                      : 'bg-white border border-stone-200 dark:bg-stone-800 dark:border-stone-700 text-stone-800 dark:text-stone-100 rounded-tl-sm'
                  }`}>
                    {m.subject && m.channel === 'email' && (
                      <p className="font-semibold text-[12px] mb-1 opacity-75">{m.subject}</p>
                    )}
                    {m.body}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Composer (only when not archived) ─────────────────────── */}
      {thread.status !== 'archived' && (
        <div className="border-t border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900 px-5 py-3 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                className="text-[11px] font-medium px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200"
              >
                <option value="in_app">In-app message</option>
                <option value="email" disabled={!hasEmail}>
                  {hasEmail ? 'Email' : 'Email (no address on file)'}
                </option>
                <option value="sms" disabled>SMS (Phase B)</option>
              </select>
              {templates.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) applyTemplate(e.target.value)
                    e.target.value = ''
                  }}
                  className="text-[11px] font-medium px-2 py-1 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200"
                >
                  <option value="">Insert template…</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              )}
              <span className="text-[10px] text-stone-400 dark:text-stone-500 ml-auto">
                ⌘ + Enter to send
              </span>
            </div>
            <textarea
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
              <button
                onClick={handleSend}
                disabled={pending || !body.trim()}
                className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
              >
                {pending ? 'Sending…' : `Send ${channel === 'email' ? 'email' : channel === 'sms' ? 'SMS' : 'message'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
