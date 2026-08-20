import Link from 'next/link'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

/**
 * THE "what's happening" card shared by the Growth and Website hubs — a door
 * that earns its card space by carrying news. The NUMBER is the hero (mono,
 * tone-colored when it's a signal); the label whispers; there is no brochure
 * copy. Hoisted 2026-08-20: the two hubs had byte-identical local copies,
 * which is exactly how they drift.
 */
export function NewsCard({
  href,
  value,
  valueSuffix,
  label,
  tone,
  aria,
}: {
  href: string
  value: string
  /** Quiet unit tail (e.g. "★") rendered smaller beside the hero number. */
  valueSuffix?: string
  label: string
  tone?: Tone
  aria: string
}) {
  return (
    <Link href={href} aria-label={aria} className="block h-full group">
      <div className="v2-card-interactive p-4 sm:p-5 h-full flex flex-col">
        <div
          className={`text-3xl font-bold tabular-nums font-mono-num leading-none ${
            tone ? TONE_TEXT[tone] : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {value}
          {valueSuffix && (
            <span className="text-base font-semibold text-gray-400 dark:text-gray-500">{valueSuffix}</span>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-snug">{label}</span>
          <span
            className="text-gray-300 dark:text-gray-600 group-hover:text-teal-700 dark:group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all shrink-0"
            aria-hidden
          >
            →
          </span>
        </div>
      </div>
    </Link>
  )
}
