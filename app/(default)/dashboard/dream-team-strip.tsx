import Link from 'next/link'
import { CAPABILITY_ICON, expiryTone } from '@/lib/types/dream-team'
import { TONE_DOT } from '@/lib/ui/encodings'

/**
 * THE SUMMONS STRIP (docs/ai-operations.md, D2). The Overview's whole word
 * on the Dream Team: one calm row — the employee stopping by your desk with
 * a short stack of papers — that deep-links to /dream-team where the actual
 * sitting-down work lives. Renders NOTHING when nothing waits: the huddle
 * stays a glance.
 *
 * Design contract: the moon tile is BRAND chrome (the team's identity, not
 * a status); urgency rides the standard tone dots on the chips, and only
 * an expiring card earns one.
 */
export interface StripProposal {
  id: string
  capability: string
  capabilityLabel: string
  expiresAt: Date | null
}

const MAX_CHIPS = 4

export default function DreamTeamStrip({ proposals }: { proposals: StripProposal[] }) {
  if (proposals.length === 0) return null
  const n = proposals.length
  const chips = proposals.slice(0, MAX_CHIPS)
  const rest = n - chips.length
  const urgent = proposals.some((p) => expiryTone(p.expiresAt) === 'urgent')

  return (
    <section className="mb-6">
      <Link
        href="/dream-team"
        className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--r-lg)] bg-[color:var(--color-surface-2,white)] p-4 ring-1 ring-[color:var(--color-hairline)] transition-shadow hover:shadow-[var(--shadow-raised,0_2px_8px_rgba(0,0,0,0.06))]"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-xl"
        >
          🌙
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
            The Dream Team has {n === 1 ? 'one thing' : `${n} things`} ready for your sign-off
            {urgent && (
              <span className="ml-2 align-middle text-xs font-medium text-rose-600 dark:text-rose-400">
                · one retires within a day
              </span>
            )}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {chips.map((p) => {
              const tone = expiryTone(p.expiresAt)
              return (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-surface-sunk)] px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300"
                >
                  <span aria-hidden="true">{CAPABILITY_ICON[p.capability] ?? '📄'}</span>
                  {p.capabilityLabel}
                  {tone && (
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`}
                      title={tone === 'urgent' ? 'Retires within a day' : 'Retires within a few days'}
                    />
                  )}
                </span>
              )
            })}
            {rest > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                +{rest} more
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 rounded-[var(--r-sm)] border border-[color:var(--color-hairline-strong)] px-3.5 py-2 text-sm font-medium text-teal-700 group-hover:bg-teal-500/10 dark:text-teal-300">
          Review &amp; approve →
        </span>
      </Link>
    </section>
  )
}
