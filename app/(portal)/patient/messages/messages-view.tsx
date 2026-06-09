'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendPortalMessageAction } from '../actions'
import { PortalHeading } from '@/components/patient-portal/ui'

/**
 * Patient ↔ front desk conversation, portal-side. One thread, plain
 * language, honest reply expectations. The clinic sees this same stream
 * in /messages (unified Patient Communications).
 */

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

const INK = '#1C1A17'
const MUTED = '#6B635A'
const BORDER = '#E8E2D9'

const CHANNEL_LABEL: Record<string, string> = {
  in_app: 'portal',
  email: 'email',
  sms: 'text',
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function PortalMessagesView({
  clinicName,
  clinicPhone,
  brand,
  messages,
}: {
  clinicName: string
  clinicPhone: string | null
  brand: string
  messages: SerializedMessage[]
}) {
  const router = useRouter()
  const [draft, setDraft] = useState('')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [messages.length])

  function onSend(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    setFeedback(null)
    const body = draft
    startTransition(async () => {
      const r = await sendPortalMessageAction(body)
      if (r.ok) {
        setDraft('')
        setFeedback({ kind: 'ok', msg: 'Sent — the front desk will reply during office hours.' })
        router.refresh()
        setTimeout(() => setFeedback(null), 5000)
      } else {
        setFeedback({ kind: 'err', msg: r.error })
      }
    })
  }

  const grouped: Array<{ day: string; rows: SerializedMessage[] }> = []
  for (const m of messages) {
    const k = dayKey(m.sentAtIso)
    const last = grouped[grouped.length - 1]
    if (last && last.day === k) last.rows.push(m)
    else grouped.push({ day: k, rows: [m] })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ minHeight: 'calc(100dvh - 12rem)' }}>
      <header className="mb-4">
        <PortalHeading color={brand}>Messages</PortalHeading>
        <p className="mt-1.5 text-[0.95rem]" style={{ color: MUTED }}>
          A direct line to the {clinicName} front desk — we usually reply within a business day.
          {clinicPhone && (
            <>
              {' '}
              Urgent?{' '}
              <a href={`tel:${clinicPhone}`} className="font-semibold" style={{ color: brand }}>
                Call us
              </a>
              .
            </>
          )}
        </p>
      </header>

      <div
        className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white"
        style={{ border: `1px solid ${BORDER}`, boxShadow: '0 1px 2px rgba(28,26,23,0.04)' }}
      >
        <div className="min-h-[18rem] flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {grouped.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[1rem] font-semibold" style={{ color: INK }}>
                No messages yet
              </p>
              <p className="mx-auto mt-1 max-w-xs text-[0.85rem]" style={{ color: MUTED }}>
                Ask about visits, billing, or anything else — a real person reads these.
              </p>
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.day} className="space-y-2.5">
                <div className="my-2 flex items-center gap-3">
                  <div className="h-px flex-1" style={{ backgroundColor: BORDER }} />
                  <span className="text-[0.68rem] font-bold uppercase tracking-[0.1em]" style={{ color: MUTED }}>
                    {g.day}
                  </span>
                  <div className="h-px flex-1" style={{ backgroundColor: BORDER }} />
                </div>
                {g.rows.map((m) => {
                  const isFromMe = m.direction === 'inbound'
                  const senderName = isFromMe ? 'You' : m.sentByUserName || m.fromName || clinicName
                  return (
                    <div key={m.id} className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[82%] flex-col ${isFromMe ? 'items-end' : 'items-start'}`}>
                        <div className="mb-0.5 flex items-baseline gap-2 px-1">
                          <span className="text-[0.72rem] font-semibold" style={{ color: INK }}>
                            {senderName}
                          </span>
                          <span className="text-[0.66rem]" style={{ color: '#B9B0A5' }}>
                            {fmtTime(m.sentAtIso)}
                            {m.channel !== 'in_app' ? ` · via ${CHANNEL_LABEL[m.channel] ?? m.channel}` : ''}
                          </span>
                        </div>
                        <div
                          className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[0.92rem] ${
                            isFromMe ? 'rounded-br-md text-white' : 'rounded-bl-md'
                          }`}
                          style={
                            isFromMe
                              ? { backgroundColor: brand }
                              : { backgroundColor: '#FAF7F2', color: INK }
                          }
                        >
                          {m.subject && <p className="mb-1 text-[0.78rem] font-semibold opacity-80">{m.subject}</p>}
                          {m.body}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSend} className="p-3" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSend(e as unknown as React.FormEvent)
              }}
              placeholder="Write to the front desk…"
              rows={2}
              disabled={pending}
              className="flex-1 resize-none rounded-2xl px-4 py-3 text-[0.92rem] outline-none disabled:opacity-50"
              style={{ border: `1px solid ${BORDER}`, color: INK, backgroundColor: '#FAF7F2' }}
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              className="shrink-0 rounded-full px-5 py-3 text-[0.88rem] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: brand }}
            >
              {pending ? 'Sending…' : 'Send'}
            </button>
          </div>
          {feedback && (
            <p
              className="mt-1.5 text-[0.78rem] font-medium"
              style={{ color: feedback.kind === 'ok' ? '#2F6B3C' : '#9B4434' }}
            >
              {feedback.msg}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
