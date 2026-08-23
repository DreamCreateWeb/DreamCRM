'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ActionButton } from '@/components/ui/action-button'
import { useToast } from '@/components/ui/toast'
import { StatusPill } from '@/components/ui/status-pill'
import { MAX_ACTIVE_GOALS, OBJECTIVE_MAX } from '@/lib/goals'
import SectionHeading from './section-heading'
import { createGoalAction, setGoalStatusAction } from './actions'

/**
 * GOALS (docs/ai-operations.md, D6) — "tell the team what you want more of."
 *
 * One line of intent that flavors every draft the team writes. The section is
 * a REPORT with one input, not a planner: no dates, no milestones, no
 * task tree — those would be a queue of work wearing a goal's clothes.
 *
 * Progress is stated honestly (patients seated since you set this) and
 * NEVER as causation — the copy says "since", never "because".
 */
export interface GoalCardData {
  id: string
  objective: string
  serviceFocus: string | null
  status: 'active' | 'paused' | 'achieved' | 'retired'
  /** Pre-computed, server-side, in the practice's own numbers. */
  progressLine: string
}

export default function GoalsSection({
  goals,
  canEdit,
}: {
  goals: GoalCardData[]
  /** Only owners/admins point the team; the server action re-checks. */
  canEdit: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [objective, setObjective] = useState('')

  const active = goals.filter((g) => g.status === 'active')
  const resting = goals.filter((g) => g.status === 'paused' || g.status === 'achieved')
  const atCap = active.length >= MAX_ACTIVE_GOALS

  function submit() {
    const text = objective.trim()
    if (!text) return
    setActiveId('new')
    startTransition(async () => {
      try {
        const r = await createGoalAction({ objective: text })
        toast(r.message, r.ok ? undefined : { tone: 'urgent' })
        if (r.ok) {
          setObjective('')
          setAdding(false)
          router.refresh()
        }
      } finally {
        setActiveId(null)
      }
    })
  }

  function move(goalId: string, status: GoalCardData['status']) {
    setActiveId(goalId)
    startTransition(async () => {
      try {
        const r = await setGoalStatusAction({ goalId, status })
        toast(r.message, r.ok ? undefined : { tone: 'urgent' })
        if (r.ok) router.refresh()
      } finally {
        setActiveId(null)
      }
    })
  }

  return (
    <section id="goals" className="mt-8 scroll-mt-24">
      <SectionHeading
        title="What you want more of"
        hint="The team aims its writing and outreach here."
      />

      {active.length === 0 && !adding ? (
        <div className="v2-card p-6">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Tell the team what you want more of.
          </p>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            One line — &ldquo;more implant patients&rdquo;, &ldquo;more families&rdquo;,
            &ldquo;more Invisalign&rdquo;. Every post, article, and invitation they write will aim
            there where it fits naturally.
          </p>
          {canEdit && (
            <ActionButton variant="secondary" size="sm" className="mt-3" onClick={() => setAdding(true)}>
              Set a goal
            </ActionButton>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((g) => (
            <article key={g.id} className="v2-card flex flex-wrap items-start gap-4 p-5">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-lg"
              >
                🎯
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{g.objective}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{g.progressLine}</p>
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                  Seated patients since you set this — a count, not a claim that the goal caused them.
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    pending={pending && activeId === g.id}
                    onClick={() => move(g.id, 'achieved')}
                  >
                    Reached it
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => move(g.id, 'paused')}
                  >
                    Pause
                  </ActionButton>
                </div>
              )}
            </article>
          ))}

          {canEdit && !adding && !atCap && (
            <ActionButton variant="ghost" size="sm" onClick={() => setAdding(true)}>
              + Add another goal
            </ActionButton>
          )}
          {canEdit && atCap && !adding && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {MAX_ACTIVE_GOALS} goals is the most the team runs at once — a team pointed everywhere
              is pointed nowhere.
            </p>
          )}
        </div>
      )}

      {adding && canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            autoFocus
            value={objective}
            maxLength={OBJECTIVE_MAX}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="e.g. more implant patients"
            aria-label="What do you want more of?"
            className="form-input min-w-[16rem] flex-1 text-sm"
          />
          <ActionButton
            type="submit"
            variant="primary"
            size="sm"
            pending={pending && activeId === 'new'}
            disabled={pending || objective.trim().length === 0}
          >
            Set the goal
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setAdding(false)
              setObjective('')
            }}
          >
            Cancel
          </ActionButton>
        </form>
      )}

      {resting.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Not running:</span>
          {resting.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-surface-sunk)] px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300"
            >
              {g.objective}
              <StatusPill
                tone={g.status === 'achieved' ? 'ok' : 'neutral'}
                label={g.status === 'achieved' ? 'reached' : 'paused'}
              />
              {canEdit && g.status === 'paused' && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => move(g.id, 'active')}
                  className="underline decoration-dotted underline-offset-2 hover:text-teal-700 disabled:opacity-50 dark:hover:text-teal-300"
                >
                  start again
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
