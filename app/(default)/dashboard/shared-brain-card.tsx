import type { SharedBrain } from '@/lib/shared-brain'

/**
 * WHAT THE PLATFORM HAS LEARNED (Transformation Phase 4 — the shared brain).
 *
 * "No individual clinic has to be smart, because the platform already
 * knows." This is where the owner can check that the claim is true — and,
 * just as importantly, where it admits when it is not yet. A learned default
 * nobody can inspect is indistinguishable from a magic number, and the first
 * time it sent everybody's mail at the wrong hour there would be no way to
 * tell which one it was.
 *
 * Deliberately not a control. There is nothing to tune here; the platform
 * either has enough evidence or it does not, and saying "still learning" out
 * loud is the honest half of the feature.
 */
export default function SharedBrainCard({ brain }: { brain: SharedBrain }) {
  return (
    <section className="mb-8" aria-label="What the platform has learned">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
        What the platform has learned
      </h2>
      <div className="rounded-[var(--r-lg)] border border-[color:var(--color-hairline)] bg-white dark:bg-gray-800 p-4">
        <div className="flex items-start gap-3">
          <span className="text-base shrink-0" aria-hidden="true">
            {brain.sendHourLearned ? '🧠' : '🌱'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Best hour to send
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  brain.sendHourLearned
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-gray-500/15 text-gray-700 dark:text-gray-300'
                }`}
              >
                {brain.sendHourLearned ? 'Learned' : 'Still learning'}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{brain.sendHourWhy}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Every clinic&rsquo;s automatic campaigns aim at this hour, in their own time zone.
              Patterns only &mdash; no patient data leaves a practice.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
