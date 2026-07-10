/**
 * One numbered "teleprompter" stage — the cockpit language shared by Call
 * Mode's script, the demo prep brief, and the sequence editor: a tinted
 * numbered circle, an uppercase micro-label, then the content. Server-safe
 * (no client hooks).
 */
export function Stage({
  n,
  tone,
  label,
  children,
}: {
  n: number
  tone: 'teal' | 'gray' | 'violet'
  label: string
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'teal'
      ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
      : tone === 'violet'
        ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
        : 'bg-[color:var(--color-surface-sunk)] text-gray-500 dark:text-gray-400'
  const labelClass =
    tone === 'teal'
      ? 'text-teal-600 dark:text-teal-400'
      : tone === 'violet'
        ? 'text-violet-600 dark:text-violet-400'
        : 'text-gray-500 dark:text-gray-400'
  return (
    <div className="grid grid-cols-[26px_1fr] gap-3 border-t border-[color:var(--color-hairline)] py-4 first:border-t-0 first:pt-1 last:pb-1">
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${toneClass}`}
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className={`mb-1 text-[0.68rem] font-bold uppercase tracking-wider ${labelClass}`}>{label}</p>
        {children}
      </div>
    </div>
  )
}
