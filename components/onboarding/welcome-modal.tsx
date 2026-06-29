'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { markWelcomeSeenAction } from '@/app/(default)/dashboard/onboarding-actions'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

/**
 * First-run welcome for clinic staff — one warm screen that explains how
 * the sidebar thinks (five sections, one mental model) and points at the
 * Getting-started list. One screen, one button: research on product tours
 * is unambiguous that multi-step modal tours get skipped.
 */

const SECTIONS: Array<{ name: string; blurb: string; tint: string }> = [
  { name: 'Daily', blurb: 'Your every-morning cockpit — patients, schedule, leads, messages.', tint: 'bg-sky-500' },
  { name: 'Growth', blurb: 'Weekly rhythm — recall campaigns, reviews, analytics.', tint: 'bg-emerald-500' },
  { name: 'Website', blurb: 'Your storefront — edit it live, post to the blog, watch search.', tint: 'bg-violet-500' },
  { name: 'Business', blurb: 'Your shop, memberships, and PMS sync.', tint: 'bg-amber-500' },
  { name: 'Settings', blurb: 'The set-once things — team, portal, billing.', tint: 'bg-gray-400' },
]

export default function WelcomeModal({ clinicName }: { clinicName: string }) {
  const [open, setOpen] = useState(true)
  const [pending, startTransition] = useTransition()
  const dialogRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => {
    // Optimistic: hide immediately, persist in the background.
    setOpen(false)
    startTransition(async () => {
      await markWelcomeSeenAction()
    })
  }, [])

  useFocusTrap(open, dialogRef, { onEscape: close })

  if (!open) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Welcome to ${clinicName}'s dashboard`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 py-4 sm:items-center"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="overflow-y-auto px-6 pb-2 pt-7 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-wider text-violet-500">Welcome</p>
          <h2 className="mt-1.5 text-xl font-bold text-gray-800 dark:text-gray-100">
            This is {clinicName}&apos;s new front office
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            Everything lives in the sidebar, grouped by how your day actually runs. Start each
            morning right here on the Overview — it shows today&apos;s chair, who needs a
            confirmation, and what came in overnight.
          </p>

          <ul className="mt-5 space-y-2.5">
            {SECTIONS.map((s) => (
              <li key={s.name} className="flex items-start gap-3">
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.tint}`} />
                <p className="text-sm leading-snug">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{s.name}</span>
                  <span className="text-gray-500 dark:text-gray-400"> — {s.blurb}</span>
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-5 rounded-xl bg-violet-500/10 px-4 py-3 text-sm leading-relaxed text-violet-700 dark:text-violet-300">
            Below this, your <span className="font-semibold">Getting started</span> list walks you
            through setup one step at a time — it checks itself off as you go, and each page
            explains itself the first time you open it.
          </p>
        </div>
        <div className="flex justify-end px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="btn bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            Let&apos;s go
          </button>
        </div>
      </div>
    </div>
  )
}
