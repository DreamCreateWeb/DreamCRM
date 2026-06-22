'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { trialHeadline, trialSubline, trialUrgency, type TrialUrgency } from '@/lib/trial'

/**
 * Once-a-day reminder popup for an owner/admin whose no-card trial is in its
 * final stretch (the shell only mounts it when daysLeft ≤ 3). The copy + accent
 * escalate by day via the shared `trialUrgency` knob, so it reads calmer on day
 * 3 and alarming on day 0 — without nagging more than once per calendar day
 * (dismissal is stored per-user so a shared browser doesn't cross-suppress).
 *
 * It's a nudge, not a wall: "Maybe later" always closes it. The hard lock is
 * the separate TrialEndedWall once the trial actually expires.
 */
const ACCENT: Record<TrialUrgency, { ring: string; chip: string; btn: string }> = {
  // 'calm' never mounts (shell gates at ≤3 days) but is mapped for totality.
  calm: { ring: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', chip: '⏳', btn: 'bg-violet-500 hover:bg-violet-600' },
  soon: { ring: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', chip: '⏳', btn: 'bg-amber-500 hover:bg-amber-600' },
  urgent: { ring: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', chip: '⏰', btn: 'bg-orange-500 hover:bg-orange-600' },
  final: { ring: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', chip: '⏰', btn: 'bg-rose-600 hover:bg-rose-700' },
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function TrialReminderModal({
  daysLeft,
  href,
  storageKey,
}: {
  daysLeft: number
  href: string
  /** Per-user key so dismissal doesn't carry across accounts on one browser. */
  storageKey: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) !== today()) setOpen(true)
    } catch {
      // Private mode / storage disabled → still show it (better to remind once
      // per page than to swallow the nudge entirely).
      setOpen(true)
    }
  }, [storageKey])

  function dismiss() {
    try {
      localStorage.setItem(storageKey, today())
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  if (!open) return null
  const urgency = trialUrgency(daysLeft)
  const accent = ACCENT[urgency]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[color:var(--color-ink-900)]/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Free trial reminder"
      onClick={dismiss}
    >
      <div
        className="section-enter w-full max-w-md rounded-[var(--r-lg)] bg-[color:var(--color-surface-2)] shadow-[var(--shadow-modal)] p-6 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full text-xl ${accent.ring}`} aria-hidden="true">
          {accent.chip}
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{trialHeadline(daysLeft)}</h2>
        <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300">{trialSubline(daysLeft)}</p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            href={href}
            onClick={dismiss}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors ${accent.btn}`}
          >
            Add payment &amp; choose a plan →
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {urgency === 'final' ? 'Not yet — remind me later' : 'Maybe later'}
          </button>
        </div>
      </div>
    </div>
  )
}
