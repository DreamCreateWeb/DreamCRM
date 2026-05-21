import Link from 'next/link'

/**
 * Generic "Coming soon" placeholder for sidebar items that have a roadmap
 * slot but no implementation yet. Renders the module name + the role it
 * plays in the broader DreamCRM story (per DESIGN.md), and links the
 * user to whichever existing surface most closely fills the gap today.
 *
 * Reasoning surfaced honestly — clinic owners deciding whether to commit
 * to the platform see WHAT is coming + WHY it matters + which competitor
 * we're displacing. Trust signal. No fake-feature screenshots.
 */
export interface ComingSoonProps {
  title: string
  /** One-sentence promise of what this module does. */
  oneLiner: string
  /** Bulleted description of what's coming. 2-5 items, sentence-case. */
  features: string[]
  /** Competitor we're matching/displacing — keeps positioning honest. */
  matching?: string
  /** What clinic users can do today instead, with a link. */
  todayAlternative?: { label: string; href: string }
  /** Optional rough timing — "Phase 2", "Next quarter", etc. */
  phase?: string
}

export default function ComingSoon({
  title,
  oneLiner,
  features,
  matching,
  todayAlternative,
  phase,
}: ComingSoonProps) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-10 w-full max-w-3xl mx-auto">
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700/60 p-8 md:p-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400">
            Coming soon
          </span>
          {phase && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
              {phase}
            </span>
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mb-2">
          {title}
        </h1>
        <p className="text-[15px] text-stone-600 dark:text-stone-300 leading-relaxed mb-6">
          {oneLiner}
        </p>

        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            What this will do
          </p>
          <ul className="space-y-1.5 text-[13px] text-stone-700 dark:text-stone-200">
            {features.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-stone-400 dark:text-stone-500 shrink-0">·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {matching && (
          <p className="text-[12px] text-stone-500 dark:text-stone-400 mb-6">
            <span className="font-medium text-stone-600 dark:text-stone-300">Reference:</span> matching what {matching} ships today.
          </p>
        )}

        {todayAlternative && (
          <div className="border-t border-stone-100 dark:border-stone-700/40 pt-5 mt-5">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
              In the meantime
            </p>
            <Link
              href={todayAlternative.href}
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-stone-800 dark:text-stone-100 hover:text-stone-600 dark:hover:text-stone-300"
            >
              {todayAlternative.label} →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
