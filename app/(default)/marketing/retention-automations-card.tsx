'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
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
  initial: { birthdayAutoSend: boolean; lapsedReactivation: boolean; benefitsAutoSend: boolean }
  preview: { birthdaysThisMonth: number; newlyLapsed: number; benefitsEligible: number }
  canManage: boolean
}) {
  return (
    <div className="v2-card p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Automations
        </h2>
        <span className="text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 rounded-full px-2 py-0.5">
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
          countHref={preview.birthdaysThisMonth > 0 ? '/marketing/outreach?tier=birthday' : null}
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
          countHref={preview.newlyLapsed > 0 ? '/marketing/outreach?tier=lapsed' : null}
          initialOn={initial.lapsedReactivation}
          canManage={canManage}
        />
        <AutomationRow
          kind="benefits"
          icon="💎"
          title="Use-your-benefits reminder"
          description="October through December: insured patients with no visit on the books get a 'your benefits reset January 1' note. The year-end revenue driver."
          cadence="Sends monthly, Oct–Dec"
          countLabel={
            preview.benefitsEligible > 0
              ? `${preview.benefitsEligible} insured patient${preview.benefitsEligible === 1 ? '' : 's'} eligible now`
              : 'Nobody eligible right now'
          }
          countHref={null}
          initialOn={initial.benefitsAutoSend}
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
  countHref,
  initialOn,
  canManage,
}: {
  kind: RetentionKind
  icon: string
  title: string
  description: string
  cadence: string
  countLabel: string
  countHref: string | null
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
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              On
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
          {cadence} ·{' '}
          {countHref ? (
            <Link href={countHref} className="text-teal-700 dark:text-teal-400 hover:underline">
              {countLabel} →
            </Link>
          ) : (
            countLabel
          )}
        </p>
        {error && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{error}</p>}
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
