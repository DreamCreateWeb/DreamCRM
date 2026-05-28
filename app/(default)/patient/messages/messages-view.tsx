'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { sendPatientMessageAction } from './actions'

interface SerializedMessage {
  id: string
  source: 'patient_message' | 'email_message'
  channel: 'in_app' | 'email' | 'sms'
  direction: 'inbound' | 'outbound'
  body: string
  subject: string | null
  fromName: string | null
  sentByUserName: string | null
  sentAtIso: string
}

const CHANNEL_LABEL: Record<string, string> = {
  in_app: 'Portal message',
  email: 'Email',
  sms: 'SMS',
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function PatientMessagesView({
  clinicName,
  brandColor,
  messages,
}: {
  clinicName: string
  brandColor: string | null
  messages: SerializedMessage[]
}) {
  const [draft, setDraft] = useState('')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  // Patient POV: messages from the clinic (direction='outbound' in DB)
  // appear as "from them" on the LEFT; messages from the patient
  // (direction='inbound') appear as "from me" on the RIGHT.

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [messages.length])

  function onSend(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setFeedback(null)
    const body = draft
    startTransition(async () => {
      const r = await sendPatientMessageAction(body)
      if (r.ok) {
        setDraft('')
        setFeedback({ kind: 'ok', msg: 'Sent. The clinic will reply during business hours.' })
        setTimeout(() => setFeedback(null), 5000)
      } else {
        setFeedback({ kind: 'err', msg: r.error })
      }
    })
  }

  // Group messages by day for the section dividers.
  const grouped: Array<{ day: string; rows: SerializedMessage[] }> = []
  for (const m of messages) {
    const k = dayKey(m.sentAtIso)
    const last = grouped[grouped.length - 1]
    if (last && last.day === k) last.rows.push(m)
    else grouped.push({ day: k, rows: [m] })
  }

  const accent = brandColor ?? '#0F766E'

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-2xl mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 4rem)' }}>
      <header className="mb-4">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Messages</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Direct line to {clinicName}. Front-desk replies typically arrive within a business day.
        </p>
      </header>

      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-[20rem]">
          {grouped.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">
                No messages yet
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                Send the first message to ask about appointments, billing, or anything else.
              </p>
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.day} className="space-y-2">
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
                    {g.day}
                  </span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                </div>
                {g.rows.map((m) => (
                  <MessageBubble key={m.id} message={m} accent={accent} clinicName={clinicName} />
                ))}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSend} className="border-t border-gray-100 dark:border-gray-700/60 p-3">
          <div className="flex gap-2 items-end">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSend(e as unknown as React.FormEvent)
              }}
              placeholder="Type a message…"
              rows={2}
              disabled={pending}
              className="flex-1 form-textarea text-sm bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:border-gray-300 dark:focus:border-gray-600 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="btn-sm shrink-0 self-stretch text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: accent }}
            >
              {pending ? 'Sending…' : 'Send'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">⌘+Enter to send</p>
          {feedback && (
            <p
              className={`text-[11px] mt-1 ${feedback.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {feedback.msg}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  accent,
  clinicName,
}: {
  message: SerializedMessage
  accent: string
  clinicName: string
}) {
  // From patient's POV: outbound (from clinic) = "from them" → left side.
  //                    inbound (from patient) = "from me" → right side.
  const isFromMe = message.direction === 'inbound'
  const senderName = isFromMe
    ? 'You'
    : message.sentByUserName || message.fromName || clinicName

  return (
    <div className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isFromMe ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className="flex items-baseline gap-2 px-1 mb-0.5">
          <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{senderName}</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{fmtTime(message.sentAtIso)}</span>
          {message.channel !== 'in_app' && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">· via {CHANNEL_LABEL[message.channel] ?? message.channel}</span>
          )}
        </div>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
            isFromMe
              ? 'text-white rounded-br-sm'
              : 'bg-gray-100 dark:bg-gray-700/60 text-gray-800 dark:text-gray-100 rounded-bl-sm'
          }`}
          style={isFromMe ? { backgroundColor: accent } : undefined}
        >
          {message.subject && (
            <p className="text-xs font-semibold opacity-80 mb-1">{message.subject}</p>
          )}
          {message.body}
        </div>
      </div>
    </div>
  )
}
