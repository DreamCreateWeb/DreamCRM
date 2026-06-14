import Link from 'next/link'

/**
 * The "Daily · Messages" surface tabs — Patients (the unified patient-comms
 * inbox at /messages) and Mailbox (the connected Gmail at /inbox). Inbox folded
 * into Messages at the nav level, so this strip is the ONLY way to move between
 * the two surfaces. It renders on BOTH /messages and /inbox (clinic tenants)
 * so neither is a one-way trip. The active tab is a plain span; the other is a
 * Link.
 */
export default function MessagesSurfaceTabs({ active }: { active: 'patients' | 'mailbox' }) {
  return (
    <div className="border-b border-[color:var(--color-hairline)] bg-[color:var(--color-surface-2)] px-4 pt-2 flex items-end gap-4 shrink-0">
      <div className="mr-1 shrink-0 pb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-400 leading-none">
          Daily · Messages
        </p>
      </div>
      <nav className="flex items-end gap-1 -mb-px" aria-label="Messages surfaces">
        {active === 'patients' ? (
          <span
            aria-current="page"
            className="inline-flex items-center px-3 py-2 text-sm font-semibold text-teal-700 dark:text-teal-300 border-b-2 border-teal-500"
          >
            Patients
          </span>
        ) : (
          <Link
            href="/messages"
            title="Patient conversations — in-app, email, and SMS, threaded by patient"
            className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 border-b-2 border-transparent hover:text-gray-700 dark:hover:text-gray-200 hover:border-[color:var(--color-hairline-strong)] transition-colors"
          >
            Patients
          </Link>
        )}
        {active === 'mailbox' ? (
          <span
            aria-current="page"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-teal-700 dark:text-teal-300 border-b-2 border-teal-500"
          >
            Mailbox <span className="text-xs text-teal-600/70 dark:text-teal-400/70">(Gmail)</span>
          </span>
        ) : (
          <Link
            href="/inbox"
            title="Your connected Gmail mailbox — staff email, triage, threading"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 border-b-2 border-transparent hover:text-gray-700 dark:hover:text-gray-200 hover:border-[color:var(--color-hairline-strong)] transition-colors"
          >
            Mailbox <span className="text-xs text-gray-400 dark:text-gray-500">(Gmail)</span>
          </Link>
        )}
      </nav>
    </div>
  )
}
