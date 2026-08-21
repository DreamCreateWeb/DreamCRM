import type { BrainRun } from '@/lib/shared-brain'
import { StatusPill } from '@/components/ui/status-pill'
import {
  brainStale,
  BRAIN_STALE_DAYS,
  EXPLORATION_SHARE,
  MIN_CLINICS_PER_HOUR,
  MIN_SENDS_PER_HOUR,
  type SharedBrain,
} from '@/lib/shared-brain'

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
export default function SharedBrainCard({
  brain,
  /** The read FAILED, and `brain` is the shipped floor rather than what the
   *  platform knows (round-9 sibling sweep). Same class as the Guardian's
   *  blind sweep: an error path that substitutes an empty value renders as
   *  a positive claim — here "Still learning" and "Has not run yet", both
   *  of which could be flatly untrue while a learned 3 PM was in force. */
  unreadable = false,
  /** What the LAST pass did, successful or not (round-16 audit). Without it
   *  a pass that ran every Monday and threw every Monday rendered as "the
   *  weekly pass has not run", sending the owner to EventBridge to find a
   *  rule that is firing perfectly. */
  run,
}: {
  brain: SharedBrain
  unreadable?: boolean
  run?: BrainRun
}) {
  if (unreadable) {
    return (
      <section className="mb-8" aria-label="What the platform has learned">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
          What the platform has learned
        </h2>
        <p className="rounded-[var(--r-lg)] bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 p-4 text-sm text-amber-800 dark:text-amber-200">
          I couldn&rsquo;t read what I&rsquo;ve learned just now. Clinics keep sending at whatever
          was already worked out &mdash; this is only the readout being down.
        </p>
      </section>
    )
  }
  return (
    <section className="mb-8" aria-label="What the platform has learned">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">
        What the platform has learned
      </h2>
      <div className="v2-card p-4">
        <div className="flex items-start gap-3">
          <span className="text-base shrink-0" aria-hidden="true">
            {brain.sendHourLearned ? '🧠' : '🌱'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                Best hour to send
              </span>
              <StatusPill
                tone={brain.sendHourLearned ? 'ok' : 'neutral'}
                label={brain.sendHourLearned ? 'Learned' : 'Still learning'}
              />
            </div>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{brain.sendHourWhy}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              The four automatic retention campaigns &mdash; win-back, birthday, benefits and
              new-patient welcome &mdash; aim at this hour, in each clinic&rsquo;s own time zone.
              Recall campaigns send when they are approved, and reminders and review asks stay
              tied to the appointment rather than to a good moment for reading email. Patterns
              only &mdash; no patient data leaves a practice.
            </p>
            {/* WHEN it last looked (round-1 in-phase gap). The weekly cron
                stamped learnedAt and nothing ever read it, so a learning
                pass that silently stopped firing would look exactly like a
                platform that had not learned anything yet — the same
                confusion the Guardian exists to remove, aimed at ourselves. */}
            {/* THE SAMPLE, against the floors it has to clear (round-10
                in-phase gap). The brain ships inert on purpose, so for
                months this card's only content is "Still learning" plus two
                thresholds — and a threshold with no reading against it is
                the magic number the card exists to replace. */}
            {/* THE EXPLORATION ARM (Phase 4 open item #2). The brain could
                never learn because every automated send aimed at the hour in
                force, so one bucket filled and nothing was comparable. A
                fifth of campaigns go elsewhere on purpose — and the owner
                should know that is happening rather than discover it in a
                send log. */}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              About {Math.round(EXPLORATION_SHARE * 100)}% of automated sends go at a different
              hour on purpose, so there is something to compare. Without that the platform can
              only ever confirm the hour it already uses.
            </p>
            {!brain.sendHourLearned && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {brain.sampleSends > 0
                  ? `${brain.sampleSends.toLocaleString('en-US')} sends looked at so far. An hour needs ${MIN_SENDS_PER_HOUR} of them, across ${MIN_CLINICS_PER_HOUR} different practices, before it counts.`
                  : `Nothing to weigh yet. An hour needs ${MIN_SENDS_PER_HOUR} sends across ${MIN_CLINICS_PER_HOUR} different practices before it counts.`}
              </p>
            )}
            {/* WHEN it last looked (round-1 in-phase gap), and whether it
                has STOPPED looking (round-10). A stored instant used to
                render as quiet grey text forever, never compared to now —
                but after the first pass "never ran" is no longer reachable
                and a dead schedule is the only real failure left. This repo
                has had exactly that (the EventBridge drift in CLAUDE.md). */}
            {run?.error ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                The last pass ran{run.ranAt ? ` ${new Date(run.ranAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : ''}{' '}
                and couldn&rsquo;t finish: {run.error}. The schedule is fine &mdash; this is mine
                to fix.
              </p>
            ) : null}
            {(() => {
              const stale = brainStale(brain, new Date())
              // A pass that RAN and failed is not a cron that stopped: the
              // amber "nothing since" line above would send the owner
              // hunting for a schedule that is firing perfectly.
              if (run?.error) return null
              return (
                <p
                  className={`mt-1 text-xs ${
                    stale
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {brain.learnedAt
                    ? `Last looked ${new Date(brain.learnedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'UTC',
                      })}.${
                        stale
                          ? ` Nothing since — the weekly pass has not run in over ${BRAIN_STALE_DAYS} days.`
                          : ''
                      }`
                    : 'Has not run yet.'}
                </p>
              )
            })()}
          </div>
        </div>
      </div>
    </section>
  )
}
