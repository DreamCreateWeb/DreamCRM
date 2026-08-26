import { MARKETING_CHANNEL_LABELS } from '@/lib/marketing-attribution'
import { getAcquisitionReport, type AcquisitionReport } from '@/lib/services/acquisition'
import { EmptyState } from '@/components/ui/empty-state'
import { formatNumberShort } from '@/lib/utils/format'

/**
 * Acquisition — the sensor layer's read surface on the platform Marketing
 * home (docs/marketing-engine.md, slice 1): www visits and clinic signups by
 * first-touch channel, graded through the same trial/paid rules as the
 * billing wall. Platform tenant only (the page already gates). The dials
 * cockpit (slice 3) will grow out of this panel; today it reports, only.
 */
export default async function AcquisitionPanel() {
  let report: AcquisitionReport | null = null
  try {
    report = await getAcquisitionReport(30)
  } catch {
    report = null
  }

  return (
    <div className="v2-card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Acquisition</h2>
        <span className="text-xs text-gray-500 dark:text-gray-400">Last 30 days · first touch</span>
      </div>
      {!report ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Couldn’t read acquisition right now — refresh to try again.
        </p>
      ) : report.totalVisits === 0 && report.totalSignups === 0 ? (
        <EmptyState
          icon="📡"
          title="The sensors are live."
          body="Marketing-site visits and signups will land here by channel — nothing recorded in the last 30 days yet."
        />
      ) : (
        <AcquisitionTable report={report} />
      )}
    </div>
  )
}

function AcquisitionTable({ report }: { report: AcquisitionReport }) {
  // Show channels with any activity; quiet channels stay off the table (a
  // wall of zeros is noise), but nothing is ever misattributed to hide it.
  const rows = report.channels.filter(
    (r) => r.visits > 0 || r.signups > 0 || r.paying > 0,
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <th className="py-2 pr-4 font-semibold">Channel</th>
            <th className="py-2 pr-4 text-right font-semibold">Visits</th>
            <th className="py-2 pr-4 text-right font-semibold">Signups</th>
            <th className="py-2 pr-4 text-right font-semibold">On trial</th>
            <th className="py-2 text-right font-semibold">Paying</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--color-hairline)]">
          {rows.map((r) => (
            <tr key={r.channel}>
              <td className="py-2 pr-4 font-medium text-gray-800 dark:text-gray-100">
                {MARKETING_CHANNEL_LABELS[r.channel]}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatNumberShort(r.visits)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatNumberShort(r.signups)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatNumberShort(r.trialing)}
              </td>
              <td className="py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatNumberShort(r.paying)}
              </td>
            </tr>
          ))}
          {report.untrackedSignups > 0 && (
            <tr>
              <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">
                Untracked
                <span className="ml-1.5 text-xs">(pre-sensor, blocked cookies, or provisioned)</span>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-400 dark:text-gray-500">—</td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatNumberShort(report.untrackedSignups)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-400 dark:text-gray-500">—</td>
              <td className="py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatNumberShort(report.untrackedPaying)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
