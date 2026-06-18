'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { followupDueState, formatDueLabel, type FollowupDueState, type PatientFollowupView } from '@/lib/types/followups'
import { completeFollowupAction } from '../patients/actions'

const DUE_TONE: Record<FollowupDueState, string> = {
  overdue: 'text-rose-600 dark:text-rose-400',
  today: 'text-amber-700 dark:text-amber-300',
  soon: 'text-gray-500 dark:text-gray-400',
  later: 'text-gray-400 dark:text-gray-500',
  none: 'text-gray-400 dark:text-gray-500',
}

/**
 * The interactive "my follow-ups" list on /my-day — tick one off without
 * leaving the page. Optimistic; reverts on error.
 */
export default function MyDayFollowups({ initial }: { initial: PatientFollowupView[] }) {
  const [items, setItems] = useState<PatientFollowupView[]>(initial)
  const [, startTransition] = useTransition()

  function complete(f: PatientFollowupView) {
    setItems((cur) => cur.filter((x) => x.id !== f.id))
    startTransition(async () => {
      const res = await completeFollowupAction(f.id, f.patientId)
      if (!res.ok) setItems(initial)
    })
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="Nothing on your plate"
        body="Follow-ups assigned to you (or left unclaimed) show up here. Add one from any patient."
      />
    )
  }

  return (
    <ul className="divide-y divide-[color:var(--color-hairline)]">
      {items.map((f) => {
        const due = followupDueState(f.dueDate)
        return (
          <li key={f.id} className="flex items-start gap-3 py-2.5">
            <button
              type="button"
              onClick={() => complete(f)}
              aria-label="Mark done"
              className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-gray-300 dark:border-gray-600 hover:border-teal-500 grid place-items-center"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800 dark:text-gray-100">{f.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <Link href={`/patients/${f.patientId}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                  {f.patientName}
                </Link>
                <span className={`ml-2 ${DUE_TONE[due]}`}>{formatDueLabel(f.dueDate)}</span>
                {!f.assigneeName && <span className="ml-2 text-gray-400 dark:text-gray-500">· unclaimed</span>}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
