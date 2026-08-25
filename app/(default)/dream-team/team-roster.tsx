import { SPECIALISTS, CAPABILITY_ICON } from '@/lib/types/dream-team'
import { getCapability } from '@/lib/autonomy'
import { StatusPill } from '@/components/ui/status-pill'
import SectionHeading from './section-heading'

/**
 * THE ROSTER (docs/ai-operations.md, D3) — "the staff you hired." One card
 * per specialist: what they do, which of their jobs run on their own vs
 * ask first, and what they actually shipped last week (the standup's
 * per-capability counts — real ledger numbers, never a vibe).
 *
 * A REPORT, not a console (the North Star): nothing here is a switch. The
 * take-it-back controls stay on the grants strip above, where consent was
 * given; the roster only tells the truth about the arrangement.
 */
export interface RosterInput {
  /** Capabilities the clinic has switched to automatic. */
  grantedCapabilities: ReadonlySet<string>
  /** Prior clinic-week counts per capability (the standup's lines). */
  weeklyCounts: ReadonlyMap<string, number>
  /** Capabilities with a card waiting on a yes right now. */
  waitingCapabilities: ReadonlySet<string>
}

function laneMode(capability: string, granted: ReadonlySet<string>): 'auto' | 'ask' {
  if (granted.has(capability)) return 'auto'
  const def = getCapability(capability)
  return def?.defaultTrust === 'auto' ? 'auto' : 'ask'
}

export default function TeamRoster({ grantedCapabilities, weeklyCounts, waitingCapabilities }: RosterInput) {
  return (
    <section id="the-team" className="mt-10 scroll-mt-24">
      <SectionHeading
        title="The team"
        hint="On the clock around the clock — last week’s numbers are what they actually did."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SPECIALISTS.map((s) => {
          const lanes = s.capabilities
            .map((c) => ({ capability: c, def: getCapability(c) }))
            .filter((l) => l.def !== null)
          if (lanes.length === 0) return null
          const autoLanes = lanes.filter((l) => laneMode(l.capability, grantedCapabilities) === 'auto')
          const askLanes = lanes.filter((l) => laneMode(l.capability, grantedCapabilities) === 'ask')
          const weekly = lanes.reduce((sum, l) => sum + (weeklyCounts.get(l.capability) ?? 0), 0)
          const waiting = lanes.filter((l) => waitingCapabilities.has(l.capability)).length

          return (
            <article key={s.id} className="v2-card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-xl"
                >
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{s.name}</h3>
                    {waiting > 0 && (
                      <a
                        href="#sign-here"
                        className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
                        title="This teammate has finished work in the stack above"
                      >
                        <StatusPill
                          tone="warn"
                          label={waiting === 1 ? '1 waiting on you' : `${waiting} waiting on you`}
                        />
                      </a>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {s.blurb}
                  </p>
                </div>
              </div>

              {/* Last week, in real numbers — the honest line. Zero is said
                  plainly; a quiet lane must never look busy (Guardian law). */}
              <p className="mt-4 flex items-baseline gap-1.5 text-sm text-gray-700 dark:text-gray-200">
                {weekly > 0 ? (
                  <>
                    <span className="font-mono-num text-xl font-bold leading-none tabular-nums text-gray-900 dark:text-gray-100">
                      {weekly}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {weekly === 1 ? 'thing' : 'things'} handled last week
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    A quiet week — nothing to report.
                  </span>
                )}
              </p>

              {/* The arrangement, as PROSE rather than chip soup (D20): a
                  tone dot per lane, the job names as plain text. mt-auto
                  pins this footer so six cards of different content share
                  one baseline. */}
              <div className="mt-auto space-y-1.5 border-t border-[color:var(--color-hairline)] pt-3 text-xs">
                {autoLanes.length > 0 && (
                  <p className="flex items-baseline gap-1.5 leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 self-start translate-y-[5px] rounded-full bg-emerald-500"
                    />
                    {/* nowrap or the phrase folds word-per-line when the
                        job list beside it is long (screenshot D21). */}
                    <span className="shrink-0 whitespace-nowrap font-medium text-emerald-700 dark:text-emerald-300">On their own:</span>
                    <span className="min-w-0 text-gray-600 dark:text-gray-300">
                      {autoLanes.map((l, i) => (
                        <span key={l.capability}>
                          {i > 0 && <span className="text-gray-300 dark:text-gray-600"> · </span>}
                          <span>{l.def!.label}</span>
                        </span>
                      ))}
                    </span>
                  </p>
                )}
                {askLanes.length > 0 && (
                  <p className="flex items-baseline gap-1.5 leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 self-start translate-y-[5px] rounded-full bg-gray-300 dark:bg-gray-600"
                    />
                    <span className="shrink-0 whitespace-nowrap font-medium text-gray-500 dark:text-gray-400">Asks first:</span>
                    <span className="min-w-0 text-gray-600 dark:text-gray-300">
                      {askLanes.map((l, i) => (
                        <span key={l.capability}>
                          {i > 0 && <span className="text-gray-300 dark:text-gray-600"> · </span>}
                          <span>{l.def!.label}</span>
                        </span>
                      ))}
                    </span>
                  </p>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
