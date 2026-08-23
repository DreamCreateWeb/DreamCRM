import { SPECIALISTS, CAPABILITY_ICON } from '@/lib/types/dream-team'
import { getCapability } from '@/lib/autonomy'
import { StatusPill } from '@/components/ui/status-pill'

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
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">The team</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          On the clock around the clock — last week&rsquo;s numbers are from your own diary.
        </p>
      </div>
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-xl"
                >
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{s.name}</h3>
                    {waiting > 0 && (
                      <StatusPill
                        tone="warn"
                        label={waiting === 1 ? '1 waiting on you' : `${waiting} waiting on you`}
                        title="This teammate has finished work in the stack above"
                      />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {s.blurb}
                  </p>
                </div>
              </div>

              {/* Last week, in real numbers — the honest line. Zero is said
                  plainly; a quiet lane must never look busy (Guardian law). */}
              <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                {weekly > 0 ? (
                  <>
                    <span className="font-mono-num font-semibold tabular-nums">{weekly}</span>{' '}
                    {weekly === 1 ? 'thing' : 'things'} handled last week
                  </>
                ) : (
                  <span className="text-gray-500 dark:text-gray-400">A quiet week — nothing to report.</span>
                )}
              </p>

              {/* The arrangement: which jobs run alone, which ask first. */}
              <div className="mt-3 space-y-1.5 border-t border-[color:var(--color-hairline)] pt-3 text-xs">
                {autoLanes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">
                      On their own:
                    </span>
                    {autoLanes.map((l) => (
                      <span
                        key={l.capability}
                        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface-sunk)] px-2 py-0.5 text-gray-600 dark:text-gray-300"
                        title={l.def!.label}
                      >
                        <span aria-hidden="true">{CAPABILITY_ICON[l.capability] ?? '·'}</span>
                        {l.def!.label}
                      </span>
                    ))}
                  </div>
                )}
                {askLanes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-gray-500 dark:text-gray-400">Asks first:</span>
                    {askLanes.map((l) => (
                      <span
                        key={l.capability}
                        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface-sunk)] px-2 py-0.5 text-gray-600 dark:text-gray-300"
                        title={l.def!.label}
                      >
                        <span aria-hidden="true">{CAPABILITY_ICON[l.capability] ?? '·'}</span>
                        {l.def!.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
