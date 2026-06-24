'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sendReviewRequestAction } from './actions'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FlashToast } from '@/components/ui/flash-toast'
import { TONE_TEXT } from '@/lib/ui/encodings'

interface EligibleRow {
  patientId: string
  patientName: string
  patientEmail: string | null
  appointmentId: string
  appointmentType: string
  appointmentCompletedAt: string  // ISO
}

interface Props {
  rows: EligibleRow[]
}

function fmtCompletedAt(iso: string): string {
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const h = Math.floor(ms / (60 * 60 * 1000))
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  return `${days}d ago`
}

export default function EligibleList({ rows }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [errorByPatient, setErrorByPatient] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'urgent' } | null>(null)

  function handleSend(row: EligibleRow) {
    if (sentIds.has(row.patientId)) return
    startTransition(async () => {
      try {
        await sendReviewRequestAction({
          patientId: row.patientId,
          appointmentId: row.appointmentId,
          channel: 'email',
        })
        setSentIds((s) => {
          const next = new Set(s)
          next.add(row.patientId)
          return next
        })
        setErrorByPatient((e) => {
          const next = { ...e }
          delete next[row.patientId]
          return next
        })
        setToast({ message: `Review request sent to ${row.patientName.split(' ')[0]}.`, tone: 'ok' })
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Send failed'
        setErrorByPatient((e) => ({ ...e, [row.patientId]: message }))
        setToast({ message, tone: 'urgent' })
      }
    })
  }

  return (
    <div className="v2-card overflow-hidden">
      <ul className="divide-y divide-[color:var(--color-hairline)]">
        {rows.map((r) => {
          const sent = sentIds.has(r.patientId)
          const err = errorByPatient[r.patientId]
          return (
            <li key={r.patientId} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/patients/${r.patientId}`}
                  className="text-sm font-medium text-gray-800 dark:text-gray-100 hover:underline"
                >
                  {r.patientName}
                </Link>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {r.patientEmail ?? <span className="italic">no email</span>}
                  <span className="mx-1.5 text-gray-400 dark:text-gray-500">·</span>
                  <span className="capitalize">{r.appointmentType.replace(/_/g, ' ')}</span>
                  <span className="mx-1.5 text-gray-400 dark:text-gray-500">·</span>
                  completed {fmtCompletedAt(r.appointmentCompletedAt)}
                </p>
                {err && (
                  <p className={`text-xs mt-1 ${TONE_TEXT.urgent}`}>{err}</p>
                )}
              </div>
              {sent ? (
                <StatusPill tone="ok" label="✓ Sent" />
              ) : (
                <ActionButton
                  variant="primary"
                  size="sm"
                  onClick={() => handleSend(r)}
                  disabled={pending}
                  className="shrink-0"
                >
                  {pending ? 'Sending…' : 'Send request'}
                </ActionButton>
              )}
            </li>
          )
        })}
      </ul>

      {toast && <FlashToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}
