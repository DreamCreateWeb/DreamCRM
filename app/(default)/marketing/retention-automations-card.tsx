'use client'

import { useState, useTransition } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { setRetentionAutomationAction } from './actions'
import type { RetentionKind } from '@/lib/services/retention-automation'

/**
 * "Set & forget" retention automations on the Recall & Outreach dashboard.
 *
 * Two clinic-wide auto-sends a clinic flips on once: a daily birthday greeting
 * and a monthly reactivation nudge to the newly-lapsed. Each toggle optimistic-
 * updates, then persists via the server action; a failure reverts + shows the
 * error. Owner/admin only — a `member` sees the state read-only with a hint.
 *
 * The copy is honest about HOW it sends: an automation queues a normal campaign
 * (same unsubscribe footer + tracking), so the clinic can see every auto-send
 * in their campaign list — never an invisible blast.
 */
export function RetentionAutomationsCard({
  initial,
  preview,
  canManage,
}: {
  initial: { birthdayAutoSend: boolean; lapsedReactivation: boolean }
  preview: { birthdaysThisMonth: number; newlyLapsed: number }
  canManage: boolean
}) {
  return (
    <div className="v2-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Automations
        </h2>
        <span className="text-[11px] font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 rounded-full px-2 py-0.5">
          Set &amp; forget
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Flip these on once and they run on their own. Each send is a normal campaign
        (with an unsubscribe link) you&apos;ll see in your campaign list.
      </p>

      <div className="divide-y divide-[color:var(--color-hairline)]">
        <AutomationRow
          kind="birthday"
          icon="🎂"
          title="Birthday greetings"
          description="A warm note on each patient's birthday, with a gentle nudge to book if they're due."
          cadence="Sends daily"
          countLabel={
            preview.birthdaysThisMonth > 0
              ? `${preview.birthdaysThisMonth} birthday${preview.birthdaysThisMonth === 1 ? '' : 's'} this month`
              : 'No birthdays this month'
          }
          initialOn={initial.birthdayAutoSend}
          canManage={canManage}
        />
        <AutomationRow
          kind="reactivation"
          icon="🔄"
          title="Reactivation nudge"
          description="A no-judgment 'come back for a cleaning' note to patients whose last visit was about 9 months ago."
          cadence="Sends monthly"
          countLabel={
            preview.newlyLapsed > 0
              ? `${preview.newlyLapsed} patient${preview.newlyLapsed === 1 ? '' : 's'} in the window now`
              : 'Nobody in the window right now'
          }
          initialOn={initial.lapsedReactivation}
          canManage={canManage}
        />
      </div>

      {!canManage && (
        <p className="mt-3 pt-3 border-t border-[color:var(--color-hairline)] text-xs text-gray-500 dark:text-gray-400">
          Only an owner or admin can change automations.
        </p>
      )}
    </div>
  )
}

function AutomationRow({
  kind,
  icon,
  title,
  description,
  cadence,
  countLabel,
  initialOn,
  canManage,
}: {
  kind: RetentionKind
  icon: string
  title: string
  description: string
  cadence: string
  countLabel: string
  initialOn: boolean
  canManage: boolean
}) {
  const [on, setOn] = useState(initialOn)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(next: boolean) {
    if (!canManage || pending) return
    setError(null)
    setOn(next) // optimistic
    startTransition(async () => {
      const res = await setRetentionAutomationAction(kind, next)
      if ('error' in res) {
        setOn(!next) // revert
        setError(res.error)
      }
    })
  }

  return (
    <div className="py-3 flex items-start gap-3">
      <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{title}</p>
          {on && (
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              On
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
          {cadence} · {countLabel}
        </p>
        {error && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">{error}</p>}
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle
          checked={on}
          onChange={toggle}
          disabled={!canManage || pending}
          srLabel={`${title} automation`}
        />
      </div>
    </div>
  )
}
