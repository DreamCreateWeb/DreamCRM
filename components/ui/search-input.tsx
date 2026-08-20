'use client'

/**
 * The one dashboard search-input recipe: magnifier icon, sunk surface, and a
 * clear ✕ that both empties the box AND clears the active query (submitting
 * the empty search) — the "way out" affordance the bare inputs on Appointments
 * and Patients never had (the only exit was select-all-delete-Enter).
 *
 * Extracted from the Messages thread search, which was the canonical version.
 * Submit semantics stay with the CALLER: wrap it in a <form onSubmit> for
 * Enter-to-search (Appointments/Patients — the query is expensive), or drive
 * `onChange` directly for search-as-you-type (Messages).
 */
export function SearchInput({
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  enterHint = false,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  /** Clears the box; also clear the ACTIVE query here (e.g. setParam('q', null)). */
  onClear: () => void
  placeholder: string
  ariaLabel?: string
  /** Enter-to-search surfaces only: shows a quiet ↵ hint while text is typed
   *  but not yet submitted, so the "press Enter" contract is visible. Leave
   *  off for search-as-you-type callers (Messages). */
  enterHint?: boolean
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.4-3.4" />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={`w-full rounded-[var(--r-sm)] bg-[color:var(--color-surface-sunk)] py-1.5 pl-8 ${enterHint && value ? 'pr-14' : 'pr-7'} text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 shadow-[inset_0_0_0_1px_var(--color-hairline)] transition-shadow focus:outline-none focus:shadow-[inset_0_0_0_1px_theme(colors.teal.500/50%)]`}
      />
      {enterHint && value && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 rounded border border-[color:var(--color-hairline-strong)] bg-white dark:bg-gray-800 px-1 text-xs leading-4 text-gray-500 dark:text-gray-400"
          title="Press Enter to search"
        >
          ↵
        </kbd>
      )}
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
