import type { WinLossReport } from '@/lib/types/prospecting'
import { summarizeLearnings, LEARNINGS_MIN_SAMPLE } from '@/lib/prospect-learnings'

/**
 * The win/loss pipeline panel — the scoreboard for the hunt's close rate, why
 * we lose, which profile converts best, and the learning-loop callouts that
 * also feed back into outreach. Server component; all numbers from
 * getWinLossReport.
 */
export default function PipelinePanel({ report }: { report: WinLossReport }) {
  const decided = report.won + report.lost
  const learnings = summarizeLearnings(report)
  const maxLoss = report.lossReasons[0]?.count ?? 0

  if (decided === 0) {
    return (
      <section className="v2-card p-5 mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Win / loss</h2>
          <span className="text-xs text-gray-400">last {report.windowDays} days</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No decided prospects yet. As you convert wins and mark losses, this fills in with your
          close rate, why deals slip, and which profile converts best — and starts feeding those
          lessons back into the outreach copy.
        </p>
      </section>
    )
  }

  return (
    <section className="v2-card p-5 mb-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Win / loss</h2>
        <span className="text-xs text-gray-400">last {report.windowDays} days</span>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">Won</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-teal-700 dark:text-teal-300">
            {report.won}
          </div>
        </div>
        <div className="rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">Lost</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-700 dark:text-gray-300">
            {report.lost}
          </div>
        </div>
        <div className="rounded-[var(--r-xs)] bg-gray-50 dark:bg-gray-800/40 p-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">Win rate</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {report.winRatePct != null ? `${report.winRatePct}%` : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Why we lose */}
        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Why we lose</div>
          {report.lossReasons.length === 0 ? (
            <p className="text-xs text-gray-400">No losses recorded.</p>
          ) : (
            <ul className="space-y-1.5">
              {report.lossReasons.slice(0, 6).map((r) => (
                <li key={r.reason} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 dark:text-gray-300">{r.label}</span>
                      <span className="tabular-nums text-gray-400">{r.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-rose-400/70"
                        style={{ width: `${Math.round((r.count / Math.max(1, maxLoss)) * 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Which profile converts */}
        <div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
            Win rate by profile
          </div>
          {report.segments.length === 0 ? (
            <p className="text-xs text-gray-400">No attributed prospects yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {report.segments.map((s) => (
                <li key={s.segment} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 dark:text-gray-300">{s.label}</span>
                  <span className="tabular-nums text-gray-500 dark:text-gray-400">
                    {s.winRatePct != null ? `${s.winRatePct}%` : '—'}{' '}
                    <span className="text-gray-400">
                      ({s.won}W · {s.lost}L)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report.avgTouchesToWin != null && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Wins take ~
              <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                {report.avgTouchesToWin}
              </span>{' '}
              touches on average.
            </p>
          )}
        </div>
      </div>

      {/* Learning loop */}
      {learnings.length > 0 ? (
        <div className="mt-5 rounded-[var(--r-sm)] border border-teal-500/20 bg-teal-500/5 px-4 py-3">
          <div className="text-xs font-semibold text-teal-800 dark:text-teal-300 mb-1.5">
            ✨ What the data says — and what the outreach AI is now leaning into
          </div>
          <ul className="space-y-1">
            {learnings.map((l, i) => (
              <li key={i} className="text-xs text-gray-700 dark:text-gray-300">
                • {l}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 text-xs text-gray-400 dark:text-gray-500">
          {decided} of {LEARNINGS_MIN_SAMPLE} decided prospects — a few more wins and losses and the
          learning loop kicks in, sharpening the outreach copy automatically.
        </p>
      )}
    </section>
  )
}
