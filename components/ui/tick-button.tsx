'use client'

/**
 * THE follow-up tick circle — one recipe for "mark done" / "reopen" so the
 * Follow-ups board and My Day can't drift (they had: different hover
 * previews, different disable behavior, different done states).
 *
 * States:
 *  - open: hollow circle; hovering previews a faint check so the target
 *    reads as a checkbox BEFORE you commit.
 *  - done: filled emerald with the check; clicking reopens.
 * Always disabled while `pending` so a double-tap can't fire twice.
 */
export function TickButton({
  done = false,
  pending = false,
  onToggle,
  className = '',
}: {
  done?: boolean
  pending?: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-label={done ? 'Reopen' : 'Mark done'}
      className={`group h-5 w-5 shrink-0 rounded-full border grid place-items-center disabled:opacity-50 transition-colors ${
        done
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-gray-300 dark:border-gray-600 hover:border-teal-500'
      } ${className}`}
    >
      {done ? (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M2 6l2.5 2.5L10 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span
          aria-hidden="true"
          className="text-xs leading-none text-teal-600 opacity-0 group-hover:opacity-60 transition-opacity"
        >
          ✓
        </span>
      )}
    </button>
  )
}
