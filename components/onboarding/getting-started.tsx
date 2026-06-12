'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { dismissChecklistAction } from '@/app/(default)/dashboard/onboarding-actions'
import type { ActivationChecklist } from '@/lib/types/onboarding'

/**
 * The Getting-started activation checklist on the clinic Overview. Tasks
 * derive their done-state from real org data server-side, so the list
 * ticks itself as work happens — no "mark as done" buttons to lie with.
 * Collapsible; dismissible; the Overview hides it entirely once every
 * task is done.
 */
export default function GettingStarted({ checklist }: { checklist: ActivationChecklist }) {
  const [hidden, setHidden] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [, startTransition] = useTransition()

  if (hidden) return null

  const dismiss = () => {
    setHidden(true)
    startTransition(async () => {
      await dismissChecklistAction()
    })
  }

  const pct = Math.round((checklist.doneCount / Math.max(checklist.totalCount, 1)) * 100)
  const next = checklist.tasks.find((t) => !t.done)

  return (
    <div className="mb-8 rounded-xl border border-violet-200 bg-white shadow-sm dark:border-violet-500/30 dark:bg-gray-800">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Getting started
            </h2>
            <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-bold text-violet-600 dark:text-violet-400">
              {checklist.doneCount} of {checklist.totalCount}
            </span>
          </div>
          {next && !collapsed && (
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              Next up: {next.label}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {collapsed ? 'Show' : 'Collapse'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            title="Hide this list permanently"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="h-1 w-full bg-gray-100 dark:bg-gray-700/60">
        <div className="h-1 rounded-r bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Re-entry to the post-checkout AI website interview. Shown while the
          site still needs personalization (the interview was never completed, or
          the tagline is still the day-0 starter sentence) — the only path back
          to /welcome for a clinic that skipped it, and the only path TO it for a
          managed clinic that never saw the post-checkout step. Auto-disappears
          once they finish the interview or hand-write a real tagline. */}
      {checklist.siteNeedsPersonalization && !collapsed && (
        <div className="mx-5 mt-4 flex flex-col gap-3 rounded-xl bg-violet-500/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              Let&apos;s build your website
            </p>
            <p className="mt-0.5 text-xs leading-snug text-violet-700/80 dark:text-violet-300/80">
              Answer a few quick questions and we&apos;ll draft the whole thing — free, about two
              minutes. You can edit anything after.
            </p>
          </div>
          <Link
            href="/welcome"
            className="btn-sm shrink-0 bg-violet-600 text-white hover:bg-violet-700"
          >
            Draft with AI →
          </Link>
        </div>
      )}

      {!collapsed && (
        <ul className="grid gap-x-6 px-5 py-4 sm:grid-cols-2">
          {checklist.tasks.map((task) => (
            <li key={task.id}>
              <Link
                href={task.href}
                className="group flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                {task.done ? (
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 6.5 4.5 9 10 3" />
                    </svg>
                  </span>
                ) : (
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-gray-300 group-hover:border-violet-400 dark:border-gray-600" />
                )}
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium ${
                      task.done
                        ? 'text-gray-400 line-through dark:text-gray-500'
                        : 'text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {task.label}
                  </span>
                  {!task.done && (
                    <span className="mt-0.5 block text-xs leading-snug text-gray-500 dark:text-gray-400">
                      {task.body}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
