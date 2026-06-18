'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { FlashToast } from '@/components/ui/flash-toast'
import {
  followupDueState,
  formatDueLabel,
  type FollowupDueState,
  type PatientFollowupView,
} from '@/lib/types/followups'
import { completeFollowupAction, reopenFollowupAction } from '../patients/actions'
import FollowupRulesCard from './followup-rules-card'
import type { FollowupRuleConfig } from '@/lib/types/followup-rules'

const GROUP_ORDER: FollowupDueState[] = ['overdue', 'today', 'soon', 'later', 'none']
const GROUP_LABEL: Record<FollowupDueState, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  soon: 'This week',
  later: 'Later',
  none: 'No due date',
}
const DUE_TONE: Record<FollowupDueState, string> = {
  overdue: 'text-rose-600 dark:text-rose-400',
  today: 'text-amber-700 dark:text-amber-300',
  soon: 'text-gray-500 dark:text-gray-400',
  later: 'text-gray-400 dark:text-gray-500',
  none: 'text-gray-400 dark:text-gray-500',
}

export default function FollowupsBoard({
  rows,
  orgName,
  filters,
  ruleConfig,
  digestEnabled,
  canManageRules,
}: {
  rows: PatientFollowupView[]
  orgName: string
  filters: { mine: boolean; due?: 'overdue' | 'today' | 'upcoming'; includeDone: boolean }
  ruleConfig: FollowupRuleConfig
  digestEnabled: boolean
  canManageRules: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [items, setItems] = useState<PatientFollowupView[]>(rows)
  const [toast, setToast] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString())
    if (value === null) next.delete(key)
    else next.set(key, value)
    startTransition(() => router.push(`/followups?${next.toString()}`))
  }

  function complete(f: PatientFollowupView) {
    setItems((cur) =>
      filters.includeDone ? cur.map((x) => (x.id === f.id ? { ...x, status: 'done' } : x)) : cur.filter((x) => x.id !== f.id),
    )
    startTransition(async () => {
      const res = await completeFollowupAction(f.id, f.patientId)
      if (!res.ok) { setItems(rows); setToast(res.error) }
      else setToast('Nice — one less thing.')
    })
  }
  function reopen(f: PatientFollowupView) {
    setItems((cur) => cur.map((x) => (x.id === f.id ? { ...x, status: 'open' } : x)))
    startTransition(async () => {
      const res = await reopenFollowupAction(f.id, f.patientId)
      if (!res.ok) { setItems(rows); setToast(res.error) }
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

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <PageHeader
        eyebrow={`Daily · ${orgName}`}
        title="Follow-ups"
        subtitle="Reminders to call, rebook, or check in — attached to the patient and ticked off when done."
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
      </div>

      <div className="mb-6">
        <FollowupRulesCard initial={ruleConfig} digestEnabled={digestEnabled} canManage={canManageRules} />
      </div>

      {openCount === 0 && doneItems.length === 0 ? (
        <div className="v2-card">
          <EmptyState
            icon="✅"
            title={filters.mine || filters.due ? 'Nothing here' : "You're all caught up"}
            body={
              filters.mine || filters.due
                ? 'No follow-ups match these filters. Try clearing one.'
                : 'Add a follow-up from any patient — a reminder to call, rebook, or check in — and it lands here until it’s done.'
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {GROUP_ORDER.map((g) => {
            const list = grouped.get(g)
            if (!list || list.length === 0) return null
            return (
              <section key={g}>
                <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider ${DUE_TONE[g]}`}>
                  {GROUP_LABEL[g]} <span className="text-gray-400 dark:text-gray-500 font-normal">{list.length}</span>
                </h2>
                <ul className="v2-card divide-y divide-[color:var(--color-hairline)]">
                  {list.map((f) => (
                    <Row key={f.id} f={f} onComplete={() => complete(f)} pending={pending} />
                  ))}
                </ul>
              </section>
            )
          })}

          {filters.includeDone && doneItems.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Done <span className="font-normal">{doneItems.length}</span>
              </h2>
              <ul className="v2-card divide-y divide-[color:var(--color-hairline)]">
                {doneItems.map((f) => (
                  <Row key={f.id} f={f} onReopen={() => reopen(f)} pending={pending} done />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {toast && <FlashToast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function Row({
  f,
  onComplete,
  onReopen,
  pending,
  done = false,
}: {
  f: PatientFollowupView
  onComplete?: () => void
  onReopen?: () => void
  pending: boolean
  done?: boolean
}) {
  const due = followupDueState(f.dueDate)
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <button
        type="button"
        onClick={done ? onReopen : onComplete}
        disabled={pending}
        aria-label={done ? 'Reopen' : 'Mark done'}
        className={`h-5 w-5 shrink-0 rounded-full border grid place-items-center ${
          done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-teal-500'
        }`}
      >
        {done && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 6l2.5 2.5L10 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-800 dark:text-gray-100'}`}>
          {f.title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <Link href={`/patients/${f.patientId}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">
            {f.patientName}
          </Link>
          {!done && <span className={`ml-2 ${DUE_TONE[due]}`}>{formatDueLabel(f.dueDate)}</span>}
          {f.assigneeName && <span className="ml-2 text-gray-400 dark:text-gray-500">· {f.assigneeName}</span>}
        </p>
      </div>
    </li>
  )
}
