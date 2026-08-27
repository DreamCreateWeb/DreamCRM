import Link from 'next/link'
import { MARKETING_CHANNEL_LABELS } from '@/lib/marketing-attribution'
import { getAcquisitionReport, type AcquisitionReport } from '@/lib/services/acquisition'
import { EmptyState } from '@/components/ui/empty-state'
import { TrendChart } from '@/components/ui/charts'
import { formatNumberShort } from '@/lib/utils/format'

/**
 * Acquisition — the sensor layer's read surface on the platform Marketing
 * home (docs/marketing-engine.md, slices 1+1b): www visits/sessions and
 * clinic signups by first-touch channel, graded through the same trial/paid
 * rules as the billing wall, plus the daily trend, top campaigns, and which
 * clinic sites drive Powered-by clicks. Platform tenant only (the page
 * already gates). The dials cockpit (slice 3) will grow out of this panel;
 * today it reports, only.
 */

const WINDOWS = [7, 30, 90] as const

export default async function AcquisitionPanel({ days = 30 }: { days?: number }) {
  let report: AcquisitionReport | null = null
  try {
    report = await getAcquisitionReport(days)
  } catch {
    report = null
  }

  return (
    <div className="v2-card p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Acquisition</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">First touch ·</span>
          {WINDOWS.map((w) => {
            const active = (report?.windowDays ?? days) === w
            return (
              <Link
                key={w}
                href={w === 30 ? '/marketing' : `/marketing?win=${w}`}
                aria-current={active ? 'true' : undefined}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-teal-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {w}d
              </Link>
            )
          })}
        </div>
      </div>
      {!report ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Couldn’t read acquisition right now — refresh to try again.
        </p>
      ) : report.totalVisits === 0 && report.totalSignups === 0 ? (
        <EmptyState
          icon="📡"
          title="The sensors are live."
          body={`Marketing-site visits and signups will land here by channel — nothing recorded in the last ${report.windowDays} days yet.`}
        />
      ) : (
        <AcquisitionBody report={report} />
      )}
    </div>
  )
}

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function AcquisitionBody({ report }: { report: AcquisitionReport }) {
  return (
    <div className="space-y-5">
      {/* The headline numbers — visits down to paying, with the one rate
          that decides every paid channel's viability. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Visits" value={formatNumberShort(report.totalVisits)} sub={`${formatNumberShort(report.totalSessions)} sessions`} />
        <MiniStat label="Signups" value={formatNumberShort(report.totalSignups)} sub={`${pct(report.totalSignups, report.totalSessions)} of sessions`} />
        <MiniStat label="Paying" value={formatNumberShort(report.totalPaying)} sub="in this window's cohort" />
        <MiniStat
          label="Untracked"
          value={formatNumberShort(report.untrackedSignups)}
          sub="signups without a source"
        />
      </div>

      {report.totalVisits > 0 && (
        <div className="text-gray-500 dark:text-gray-400">
          <TrendChart
            data={report.daily}
            kind="area"
            height={150}
            ariaLabel={`Daily marketing-site visits over the last ${report.windowDays} days`}
            label="visits"
          />
        </div>
      )}

      <ChannelTable report={report} />

      {report.campaigns.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Campaigns
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="py-1.5 pr-4 font-semibold">Campaign</th>
                  <th className="py-1.5 pr-4 font-semibold">Channel</th>
                  <th className="py-1.5 pr-4 text-right font-semibold">Visits</th>
                  <th className="py-1.5 pr-4 text-right font-semibold">Sessions</th>
                  <th className="py-1.5 text-right font-semibold">Signups</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-hairline)]">
                {report.campaigns.map((c) => (
                  <tr key={`${c.channel}:${c.campaign}`}>
                    <td className="py-1.5 pr-4 font-medium text-gray-800 dark:text-gray-100">{c.campaign}</td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400">
                      {MARKETING_CHANNEL_LABELS[c.channel]}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
                      {formatNumberShort(c.visits)}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
                      {formatNumberShort(c.sessions)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200">
                      {formatNumberShort(c.signups)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report.poweredBySources.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Powered-by sources
          </h3>
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {report.poweredBySources.map((s) => (
              <li key={s.slug} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-100">
                  {s.name ?? s.slug}
                  {s.name === null && (
                    <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">(unmatched slug)</span>
                  )}
                </span>
                <span className="tabular-nums text-gray-500 dark:text-gray-400">
                  {formatNumberShort(s.visits)} visits
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-[color:var(--color-surface-sunk,#E9F0FC)] dark:bg-gray-900/40 px-3 py-2.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums text-gray-800 dark:text-gray-100">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>
    </div>
  )
}

function ChannelTable({ report }: { report: AcquisitionReport }) {
  // Show channels with any activity; quiet channels stay off the table (a
  // wall of zeros is noise), but nothing is ever misattributed to hide it.
  const rows = report.channels.filter((r) => r.visits > 0 || r.signups > 0 || r.paying > 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <th className="py-2 pr-4 font-semibold">Channel</th>
            <th className="py-2 pr-4 text-right font-semibold">Visits</th>
            <th className="py-2 pr-4 text-right font-semibold">Sessions</th>
            <th className="py-2 pr-4 text-right font-semibold">Signups</th>
            <th className="py-2 pr-4 text-right font-semibold">Conv.</th>
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
                {formatNumberShort(r.sessions)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatNumberShort(r.signups)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-500 dark:text-gray-400">
                {pct(r.signups, r.sessions)}
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
              <td className="py-2 pr-4 text-right tabular-nums text-gray-400 dark:text-gray-500">—</td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
                {formatNumberShort(report.untrackedSignups)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-gray-400 dark:text-gray-500">—</td>
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
