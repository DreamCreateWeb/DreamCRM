'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { followupDueState, formatDueLabel, type FollowupDueState, type PatientFollowupView } from '@/lib/types/followups'
import { completeFollowupAction, reopenFollowupAction, updateFollowupAction } from '../patients/actions'
import { FlashToast } from '@/components/ui/flash-toast'
import { ActionButton } from '@/components/ui/action-button'
import { TickButton } from '@/components/ui/tick-button'

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
export default function MyDayFollowups({
  initial,
  currentUserId,
}: {
  initial: PatientFollowupView[]
  currentUserId: string
}) {
  const [items, setItems] = useState<PatientFollowupView[]>(initial)
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState<{
    message: string
    tone: 'ok' | 'urgent'
    action?: { label: string; onClick: () => void }
  } | null>(null)

  function complete(f: PatientFollowupView) {
    setItems((cur) => cur.filter((x) => x.id !== f.id))
    startTransition(async () => {
      const res = await completeFollowupAction(f.id, f.patientId)
      if (!res.ok) {
        // Honest failure — the silent full-list reset looked like a glitch.
        setItems((cur) => (cur.some((x) => x.id === f.id) ? cur : [f, ...cur]))
        setToast({ message: "Couldn't mark that done — please try again.", tone: 'urgent' })
        return
      }
      // Drop the sidebar "Follow-ups due" badge immediately on a successful tick.
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nav-badges:refresh'))
      // A mis-tap is one word away from undone (reopenFollowupAction existed;
      // nothing offered it).
      setToast({
        message: 'Done — nice.',
        tone: 'ok',
        action: {
          label: 'Undo',
          onClick: () => {
            setItems((cur) => (cur.some((x) => x.id === f.id) ? cur : [f, ...cur]))
            startTransition(async () => {
              const undo = await reopenFollowupAction(f.id, f.patientId)
              if (!undo.ok) {
                setItems((cur) => cur.filter((x) => x.id !== f.id))
                setToast({ message: "Couldn't undo that one — it stays done.", tone: 'urgent' })
              } else if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('nav-badges:refresh'))
              }
            })
          },
        },
      })
    })
  }
  function claim(f: PatientFollowupView) {
    setItems((cur) => cur.map((x) => (x.id === f.id ? { ...x, assignedUserId: currentUserId, assigneeName: 'You' } : x)))
    startTransition(async () => {
      const res = await updateFollowupAction(f.id, f.patientId, { assignedUserId: currentUserId })
      if (!res.ok) setItems(initial)
    })
  }

  const toastNode = toast ? (
    <FlashToast
      message={toast.message}
      tone={toast.tone}
      action={toast.action}
      duration={6000}
      onDone={() => setToast(null)}
    />
  ) : null

  if (items.length === 0) {
    return (
      <>
        <EmptyState
          icon="✅"
          title="Nothing on your plate"
          body="Follow-ups assigned to you (or left unclaimed) show up here. Add one from any patient."
        />
        {toastNode}
      </>
    )
  }

  return (
    <>
    <ul className="divide-y divide-[color:var(--color-hairline)]">
      {items.map((f) => {
        const due = followupDueState(f.dueDate)
        return (
          <li key={f.id} className="flex items-start gap-3 py-2.5">
            <TickButton pending={pending} onToggle={() => complete(f)} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800 dark:text-gray-100">{f.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <Link href={`/patients/${f.patientId}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">
                  {f.patientName}
                </Link>
                <span className={`ml-2 ${DUE_TONE[due]}`}>{formatDueLabel(f.dueDate)}</span>
                {!f.assignedUserId && <span className="ml-2 text-gray-400 dark:text-gray-500">· unclaimed</span>}
              </p>
            </div>
            {!f.assignedUserId && (
              <span className="shrink-0 self-center">
                <ActionButton variant="secondary" size="sm" onClick={() => claim(f)} pending={pending}>
                  Claim
                </ActionButton>
              </span>
            )}
          </li>
        )
      })}
    </ul>
    {toastNode}
    </>
  )
}
