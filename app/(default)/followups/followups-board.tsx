'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { FilterChip } from '@/components/ui/filter-chip'
import { StatusPill } from '@/components/ui/status-pill'
import { ActionButton } from '@/components/ui/action-button'
import { FollowupRow, DUE_TONE, type SnoozeChoice } from '@/components/followups/followup-row'
import { runAction } from '@/lib/run-action'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import { PendingVeil } from '@/components/ui/pending-veil'
import { MiniTrend } from '@/components/ui/charts'
import type { FollowupsCompletedPerWeekPoint } from '@/lib/services/patient-followups'
import {
  followupDueState,
  type FollowupDueState,
  type FollowupOutcome,
  type PatientFollowupView,
} from '@/lib/types/followups'
import { completeFollowupAction, reopenFollowupAction, snoozeFollowupAction, updateFollowupAction } from '../patients/actions'
import FollowupRulesCard from './followup-rules-card'
import type { FollowupRuleConfig } from '@/lib/types/followup-rules'

/** Nudge the sidebar to re-poll its "Follow-ups due" badge immediately, so
 *  ticking one off drops the count without waiting for the 60s poll. */
function pingNavBadges() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nav-badges:refresh'))
}

const GROUP_ORDER: FollowupDueState[] = ['overdue', 'today', 'soon', 'later', 'none']
const GROUP_LABEL: Record<FollowupDueState, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  soon: 'This week',
  later: 'Later',
  none: 'No due date',
}

export default function FollowupsBoard({
  rows,
  orgName,
  dueNowCount = 0,
  completedPerWeek8 = [],
  snoozedCount = 0,
  filters,
  staff,
  currentUserId,
  ruleConfig,
  digestEnabled,
  canManageRules,
}: {
  rows: PatientFollowupView[]
  orgName: string
  /** overdue + due-today (clinic-local) — the same number the sidebar badge
   *  counts, so the board and the badge always agree at a glance. */
  dueNowCount?: number
  /** Follow-ups completed per clinic-local week, last 8 weeks — the board's
   *  one heartbeat (law 7): it celebrates work done, not backlog. */
  completedPerWeek8?: FollowupsCompletedPerWeekPoint[]
  /** How many open follow-ups are resting until a later day (the chip). */
  snoozedCount?: number
  /** closedByMe = the ?closedBy=me view — done-only, completed BY the signed-in
   *  user (My Day's "You closed N this week" link lands here). */
  filters: { mine: boolean; due?: 'overdue' | 'today' | 'upcoming'; includeDone: boolean; closedByMe?: boolean; snoozed?: boolean }
  staff: Array<{ userId: string; name: string }>
  currentUserId: string
  ruleConfig: FollowupRuleConfig
  digestEnabled: boolean
  canManageRules: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [items, setItems] = useState<PatientFollowupView[]>(rows)
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'urgent' } | null>(null)
  // Two transitions on purpose: filter NAVIGATION must not freeze the rows
  // (one shared flag disabled every tick-box while a chip click resolved),
  // and row ACTIONS must not veil the board.
  const [rowPending, startRowTransition] = useTransition()
  const [navPending, startNavTransition] = useTransition()
  // ONE row's action, not the whole board: `rowPending` is shared by every
  // Row, so ticking the first follow-up put a spinner on every tick-box and
  // disabled every assignee picker. `activeRow` is the row actually working.
  const [activeRow, setActiveRow] = useState<string | null>(null)

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null) next.delete(key)
    else next.set(key, value)
    startNavTransition(() => router.push(`/followups?${next.toString()}`))
  }

  function complete(f: PatientFollowupView, outcome: FollowupOutcome | null) {
    setItems((cur) =>
      filters.includeDone ? cur.map((x) => (x.id === f.id ? { ...x, status: 'done' } : x)) : cur.filter((x) => x.id !== f.id),
    )
    setActiveRow(f.id)
    startRowTransition(async () => {
      try {
        const res = await runAction(() => completeFollowupAction(f.id, f.patientId, outcome))
        if (!res.ok) { setItems(rows); setToast({ message: res.error, tone: 'urgent' }) }
        else { setToast({ message: 'Nice — one less thing.', tone: 'ok' }); pingNavBadges() }
      } finally { setActiveRow(null) }
    })
  }
  function reopen(f: PatientFollowupView) {
    setItems((cur) => cur.map((x) => (x.id === f.id ? { ...x, status: 'open' } : x)))
    setActiveRow(f.id)
    startRowTransition(async () => {
      try {
        const res = await runAction(() => reopenFollowupAction(f.id, f.patientId))
        if (!res.ok) { setItems(rows); setToast({ message: res.error, tone: 'urgent' }) }
        else pingNavBadges()
      } finally { setActiveRow(null) }
    })
  }
  function snooze(f: PatientFollowupView, choice: SnoozeChoice) {
    // Leaves the list (the default view hides snoozed rows); the server picks
    // the clinic-local day, so no optimistic date is invented here.
    setItems((cur) => (filters.snoozed ? cur : cur.filter((x) => x.id !== f.id)))
    setActiveRow(f.id)
    startRowTransition(async () => {
      try {
        const res = await runAction(() => snoozeFollowupAction(f.id, f.patientId, choice))
        if (!res.ok) { setItems(rows); setToast({ message: res.error, tone: 'urgent' }) }
        else { setToast({ message: 'Resting until then — it will be back.', tone: 'ok' }); pingNavBadges() }
      } finally { setActiveRow(null) }
    })
  }
  function reassign(f: PatientFollowupView, userId: string | null) {
    const name = userId
      ? userId === currentUserId
        ? 'You'
        : staff.find((s) => s.userId === userId)?.name ?? null
      : null
    setItems((cur) => {
      const mapped = cur.map((x) => (x.id === f.id ? { ...x, assignedUserId: userId, assigneeName: name } : x))
      // Under the "Mine" filter, a follow-up reassigned away from me leaves the list.
      if (filters.mine && userId !== currentUserId) return mapped.filter((x) => x.id !== f.id)
      return mapped
    })
    setActiveRow(f.id)
    startRowTransition(async () => {
      try {
        const res = await runAction(() => updateFollowupAction(f.id, f.patientId, { assignedUserId: userId }))
        if (!res.ok) { setItems(rows); setToast({ message: res.error, tone: 'urgent' }) }
      } finally { setActiveRow(null) }
    })
  }

  // Group open items by due-state (unless a specific due filter is on, in which
  // case a flat list reads cleaner).
  const grouped = new Map<FollowupDueState, PatientFollowupView[]>()
  for (const f of items) {
    if (f.status === 'done') continue
    const g = followupDueState(f.dueDate)
    const arr = grouped.get(g) ?? []
    arr.push(f)
    grouped.set(g, arr)
  }
  const doneItems = items.filter((f) => f.status === 'done')
  const openCount = items.filter((f) => f.status === 'open').length

  // The board's ONE heartbeat (law 7): the 8-week completed-follow-ups flow —
  // it celebrates the work the team finished, not the pile that's left.
  // Decorative — hidden from AT (the title + label carry the meaning) and
  // omitted entirely when fewer than 2 weeks carry any completions (a flat or
  // single-blip line says nothing worth drawing). Mirrors the Patients page's
  // 12-week spark.
  const showFlow = completedPerWeek8.filter((p) => p.value > 0).length >= 2

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title="Follow-ups"
        subtitle="Reminders to call, rebook, or check in — attached to the patient and ticked off when done."
        legend={
          dueNowCount > 0 ? (
            // The sidebar badge's number, spelled out — board and badge agree.
            // Lives in the legend zone: it's a FACT, not an action, so it
            // stays out of the header's one-primary slot.
            <StatusPill tone="warn" label={`${dueNowCount} due now`} title="Overdue + due today — the sidebar badge's number" />
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        <FilterChip active={!filters.mine} onClick={() => setParam('mine', null)}>Everyone</FilterChip>
        <FilterChip active={filters.mine} onClick={() => setParam('mine', filters.mine ? null : '1')}>Mine</FilterChip>
        <span className="mx-1 h-4 w-px bg-[color:var(--color-hairline)]" aria-hidden="true" />
        <FilterChip active={filters.due === 'overdue'} onClick={() => setParam('due', filters.due === 'overdue' ? null : 'overdue')}>Overdue</FilterChip>
        <FilterChip active={filters.due === 'today'} onClick={() => setParam('due', filters.due === 'today' ? null : 'today')}>Due today</FilterChip>
        <FilterChip active={filters.due === 'upcoming'} onClick={() => setParam('due', filters.due === 'upcoming' ? null : 'upcoming')}>Upcoming</FilterChip>
        <span className="mx-1 h-4 w-px bg-[color:var(--color-hairline)]" aria-hidden="true" />
        <FilterChip active={filters.includeDone} onClick={() => setParam('done', filters.includeDone ? null : '1')}>Show done</FilterChip>
        {(snoozedCount > 0 || filters.snoozed) && (
          <FilterChip
            active={!!filters.snoozed}
            onClick={() => setParam('snoozed', filters.snoozed ? null : '1')}
            title="Follow-ups resting until a later day"
          >
            Snoozed ({snoozedCount})
          </FilterChip>
        )}
        <FilterChip
          active={!!filters.closedByMe}
          onClick={() => setParam('closedBy', filters.closedByMe ? null : 'me')}
          title="Only follow-ups you ticked off yourself, newest first — the same count as My Day's heartbeat"
        >
          Closed by me
        </FilterChip>
        {showFlow && (
          <div
            className="flex items-center gap-2 shrink-0 ml-auto"
            title="Follow-ups your team finished each week over the last 8 weeks"
          >
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              Completed · 8 weeks
            </span>
            {/* The spark itself stays desktop-only; the label carries the
                meaning on the tablet the front desk actually holds. */}
            <span aria-hidden="true" className="hidden lg:inline">
              <MiniTrend data={completedPerWeek8} width={104} height={26} />
            </span>
          </div>
        )}
      </div>

      <div className="mb-6">
        <FollowupRulesCard initial={ruleConfig} digestEnabled={digestEnabled} canManage={canManageRules} />
      </div>

      {openCount === 0 && doneItems.length === 0 ? (
        <div className="v2-card">
          <EmptyState
            icon="✅"
            title={filters.mine || filters.due || filters.closedByMe ? 'Nothing here' : "You're all caught up"}
            body={
              filters.mine || filters.due || filters.closedByMe
                ? 'No follow-ups match these filters.'
                : 'Add a follow-up from any patient — a reminder to call, rebook, or check in — and it lands here until it’s done.'
            }
            action={
              filters.mine || filters.due || filters.closedByMe ? (
                <ActionButton
                  variant="secondary"
                  onClick={() => startNavTransition(() => router.push('/followups'))}
                >
                  Clear filters
                </ActionButton>
              ) : (
                // The body says "add one from any patient" — hand over the door
                // it names instead of leaving the sentence to do the work.
                <ActionButton variant="secondary" href="/patients">
                  Open patients
                </ActionButton>
              )
            }
          />
        </div>
      ) : (
        <div className="relative space-y-6">
          {navPending && <PendingVeil />}
          {GROUP_ORDER.map((g) => {
            const list = grouped.get(g)
            if (!list || list.length === 0) return null
            return (
              <section key={g}>
                <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${DUE_TONE[g]}`}>
                  {GROUP_LABEL[g]} <span className="text-gray-500 dark:text-gray-400 font-normal">{list.length}</span>
                </h2>
                <ul className="v2-card divide-y divide-[color:var(--color-hairline)]">
                  {list.map((f) => (
                    <FollowupRow
                      key={f.id}
                      f={f}
                      onComplete={(o) => complete(f, o)}
                      onSnooze={(c) => snooze(f, c)}
                      onReassign={(u) => reassign(f, u)}
                      staff={staff}
                      currentUserId={currentUserId}
                      pending={rowPending && activeRow === f.id}
                      disabled={rowPending}
                    />
                  ))}
                </ul>
              </section>
            )
          })}

          {(filters.includeDone || filters.closedByMe) && doneItems.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {filters.closedByMe ? 'Closed by you' : 'Done'} <span className="font-normal">{doneItems.length}</span>
              </h2>
              <ul className="v2-card divide-y divide-[color:var(--color-hairline)]">
                {doneItems.map((f) => (
                  <FollowupRow key={f.id} f={f} onReopen={() => reopen(f)} pending={rowPending && activeRow === f.id} disabled={rowPending} done />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {toast && <FlashToast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  )
}
