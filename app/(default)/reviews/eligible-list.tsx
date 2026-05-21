'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sendReviewRequestAction } from './actions'

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
        router.refresh()
      } catch (err) {
        setErrorByPatient((e) => ({
          ...e,
          [row.patientId]: err instanceof Error ? err.message : 'Send failed',
        }))
      }
    })
  }

  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
      <ul className="divide-y divide-stone-100 dark:divide-stone-700/40">
        {rows.map((r) => {
          const sent = sentIds.has(r.patientId)
          const err = errorByPatient[r.patientId]
          return (
            <li key={r.patientId} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-stone-50 dark:hover:bg-stone-800/30">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/patients/${r.patientId}`}
                  className="text-[13px] font-medium text-stone-800 dark:text-stone-100 hover:underline"
                >
                  {r.patientName}
                </Link>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                  {r.patientEmail ?? <span className="italic">no email</span>}
                  <span className="mx-1.5 text-stone-300 dark:text-stone-600">·</span>
                  <span className="capitalize">{r.appointmentType.replace(/_/g, ' ')}</span>
                  <span className="mx-1.5 text-stone-300 dark:text-stone-600">·</span>
                  completed {fmtCompletedAt(r.appointmentCompletedAt)}
                </p>
                {err && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">{err}</p>
                )}
              </div>
              {sent ? (
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                  ✓ Sent
                </span>
              ) : (
                <button
                  onClick={() => handleSend(r)}
                  disabled={pending}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 disabled:opacity-50 shrink-0"
                >
                  {pending ? 'Sending…' : 'Send request'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
