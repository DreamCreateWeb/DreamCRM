import Link from 'next/link'
import type { ReactNode } from 'react'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

/**
 * Standard KPI / stat tile. Every number is drillable when it has somewhere
 * to go — pass `href` and the whole tile links to the filtered view that
 * explains it. Labels never drop below text-xs; zero values keep full
 * contrast (an empty queue is information, not decoration).
 */
export function KpiStat({
  label,
  value,
  sub,
  tone,
  href,
  className = '',
}: {
  label: string
  value: ReactNode
  /** One-line context under the number ("3 need a reminder"). */
  sub?: ReactNode
  /** Tone for `sub` (e.g. 'warn' when the number needs action). */
  tone?: Tone
  /** Where clicking the number takes you — the filtered list behind it. */
  href?: string
  className?: string
}) {
  const card = (
    <div
      className={`rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800 p-4 h-full ${
        href ? 'transition-colors hover:border-violet-300 dark:hover:border-violet-700' : ''
      } ${className}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-100">{value}</div>
      {sub && <div className={`mt-0.5 text-xs ${tone ? TONE_TEXT[tone] : 'text-gray-500 dark:text-gray-400'}`}>{sub}</div>}
    </div>
  )
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {card}
      </Link>
    )
  }
  return card
}
