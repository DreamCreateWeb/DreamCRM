import Link from 'next/link'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'
import { ActionButton } from '@/components/ui/action-button'
import { A1_TARGET_HOURS, describeHours } from '@/lib/activation-metrics'
import type { ActivationMetricsRead } from '@/lib/services/activation'

/**
 * ACTIVATION, MEASURED (docs/ACTIVATION.md law 7, S8) — the program's
 * number on the owner's home page. "A program with no number is a mood."
 *
 * The cohort is every real clinic created inside the window; the clock
 * starts the day the org was made (the setup call). Time-to-A1 is the
 * number the program lives or dies on, so it leads, with the share that
 * made it inside the Part-3 line (48 hours) beside it and the count still
 * without data past the stuck day — those are the calls to make today.
 *
 * A REPORT, not a console: nothing here is a control. An unreadable read
 * says so rather than rendering zeros, which would read as "nobody
 * activated" — the one sentence this card must never say by accident.
 */
export default function ActivationCard({ metrics }: { metrics: ActivationMetricsRead }) {
  const a1 = metrics.events.find((e) => e.key === 'a1')
  if (metrics.unreadable) {
    return (
      <section className="mb-8" aria-label="Activation">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">The first week, measured</h2>
        <p className="rounded-[var(--r-lg)] bg-amber-500/10 ring-1 ring-inset ring-amber-500/20 p-4 text-sm text-amber-800 dark:text-amber-200">
          I couldn&rsquo;t read the activation stamps just now &mdash; the numbers are missing, not zero. The first-week board
          still reads each clinic live.
        </p>
      </section>
    )
  }
  return (
    <section className="mb-8" aria-label="Activation" data-testid="activation-card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          The first week, measured{' '}
          <span className="font-normal text-gray-500 dark:text-gray-400">· clinics signed up in the last {metrics.cohortDays} days</span>
        </h2>
        <Link href="/platform/first-week" className="text-xs font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 whitespace-nowrap">
          Open the first-week board →
        </Link>
      </div>
      {metrics.clinics === 0 ? (
        <EmptyState
          title="No clinics in the window yet"
          body={`Time to data, time to the first message, booking, review ask and form — each shows up here the day the first clinic inside ${metrics.cohortDays} days reaches it.`}
          action={
            <ActionButton variant="secondary" size="sm" href="/ecommerce/customers">
              Add a clinic
            </ActionButton>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <KpiStat
              label="Time to data (A1), median"
              value={describeHours(a1?.medianHours ?? null)}
              sub={a1 && a1.reached > 0 ? `${a1.reached} of ${metrics.clinics} connected` : `none of ${metrics.clinics} connected yet`}
              tone={a1 && a1.reached === 0 ? 'warn' : undefined}
              href="/platform/first-week"
            />
            <KpiStat
              label={`Data within ${A1_TARGET_HOURS}h`}
              value={metrics.a1Within.share == null ? '—' : `${Math.round(metrics.a1Within.share * 100)}%`}
              sub={`${metrics.a1Within.reached} of ${metrics.clinics} — the Part-3 line`}
              tone={metrics.a1Within.share != null && metrics.a1Within.share < 0.5 ? 'warn' : undefined}
              href="/platform/first-week"
            />
            <KpiStat
              label="No data, past day 3"
              value={metrics.noDataPastDue}
              sub={metrics.noDataPastDue === 0 ? 'nobody is stuck on data' : 'the calls to make today'}
              tone={metrics.noDataPastDue > 0 ? 'warn' : 'ok'}
              href="/platform/first-week"
            />
            <KpiStat
              label="Signed up"
              value={metrics.clinics}
              sub={`in the last ${metrics.cohortDays} days`}
              href="/ecommerce/customers"
            />
          </div>
          <div className="v2-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]">
                <tr className="text-left text-xs uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2 text-right">Reached</th>
                  <th className="px-4 py-2 text-right">Median time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-hairline)]" data-testid="activation-events">
                {metrics.events.map((e) => (
                  <tr key={e.key}>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-100">
                      <span className="font-mono-num tabular-nums text-gray-500 dark:text-gray-400">{e.short}</span> {e.label}
                    </td>
                    <td className="px-4 py-2 text-right font-mono-num tabular-nums text-gray-800 dark:text-gray-100">
                      {e.reached}
                      <span className="text-gray-500 dark:text-gray-400"> / {metrics.clinics}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono-num tabular-nums text-gray-800 dark:text-gray-100">{describeHours(e.medianHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
