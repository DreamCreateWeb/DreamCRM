'use client'

/** The ⚠ inlines under a beat's talk track — THIS prospect's verified gaps
 *  that land on THIS beat (max 2 shown; the prep page has the full list). */
export default function GapCallouts({ gaps }: { gaps: string[] | undefined }) {
  if (!gaps || gaps.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {gaps.slice(0, 2).map((g) => (
        <li
          key={g}
          className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-300/90"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            Their practice today: <span className="font-medium">{g}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
