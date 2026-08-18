/**
 * The faint ink veil shown while a filter/sort NAVIGATION resolves — feedback
 * that the click registered, without a modal scrim and without touching the
 * list underneath (the never-animate-list law: rows still snap into place).
 *
 * One canonical recipe (extracted from the Patients list) so sibling surfaces
 * stop answering the same problem differently. Render it conditionally:
 *
 *   {isPending && <PendingVeil />}
 */
export function PendingVeil() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 bg-[color:var(--color-ink-900)]/5 dark:bg-white/5 pointer-events-none z-20"
    />
  )
}
