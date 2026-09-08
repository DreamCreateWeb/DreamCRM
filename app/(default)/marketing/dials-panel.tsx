import { MARKETING_CHANNEL_LABELS } from '@/lib/marketing-attribution'
import {
  CAC_DIAL_DOWN_CENTS,
  CAC_DIAL_UP_CENTS,
  CAC_LAG_DAYS,
  CHANNEL_TRIAL_BARS,
  STEP_ONE_PLAN,
  type DialRecommendation,
  type MonthDial,
} from '@/lib/marketing-dials'
import { getDialsReport, type DialsReport } from '@/lib/services/marketing-spend'
import { formatMoneyShort } from '@/lib/utils/format'
import SpendEntryForm from './spend-entry-form'

/**
 * The dials — slice 3's cockpit on the platform Marketing home (docs/
 * marketing-engine.md Part 3 + ruling #3). The machine computes blended CAC
 * on the 60-day lag and the per-channel cost-per-trial bars, and renders a
 * RECOMMENDATION; the owner types in what was spent and moves the money.
 * Platform tenant only (the page gates).
 */

const VERDICT: Record<DialRecommendation, { label: string; cls: string }> = {
  no_spend: { label: 'Step one', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300' },
  collecting: { label: 'Collecting', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  dial_up: { label: 'Dial up', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  dial_down: { label: 'Dial down', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  hold: { label: 'Hold', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
}

export default async function DialsPanel() {
  let report: DialsReport | null = null
  try {
    report = await getDialsReport()
  } catch {
    report = null
  }

  return (
    <div className="v2-card p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">The dials</h2>
        {report && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT[report.assessment.recommendation].cls}`}
          >
            {VERDICT[report.assessment.recommendation].label}
          </span>
        )}
      </div>
      {!report ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Couldn’t read the dials right now — refresh to try again.
        </p>
      ) : (
        <DialsBody report={report} />
      )}
    </div>
  )
}

function DialsBody({ report }: { report: DialsReport }) {
  const { assessment } = report
  const activeMonths = assessment.months.filter((m) => m.spendCents > 0 || m.trials > 0)

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 dark:text-gray-300">{assessment.reason}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        The rule: blended CAC (spend ÷ new paying clinics, judged {CAC_LAG_DAYS} days after the
        month ends) over {formatMoneyShort(CAC_DIAL_DOWN_CENTS)} two months running → dial down;
        under {formatMoneyShort(CAC_DIAL_UP_CENTS)} → dial up.
      </p>

      {assessment.recommendation === 'no_spend' && <StepOnePlan />}

      {activeMonths.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-4 font-semibold">Month</th>
                <th className="py-2 pr-4 text-right font-semibold">Spend</th>
                <th className="py-2 pr-4 text-right font-semibold">Signups</th>
                <th className="py-2 pr-4 text-right font-semibold">Paying</th>
                <th className="py-2 pr-4 text-right font-semibold">Blended CAC</th>
                <th className="py-2 text-right font-semibold">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-hairline)]">
              {[...activeMonths].reverse().map((m) => (
                <MonthRows key={m.month} m={m} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SpendEntryForm />
    </div>
  )
}

function MonthRows({ m }: { m: MonthDial }) {
  const spendChannels = m.channels.filter((c) => c.spendCents > 0)
  return (
    <>
      <tr>
        <td className="py-2 pr-4 font-medium text-gray-800 dark:text-gray-100">{m.month}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
          {m.spendCents > 0 ? formatMoneyShort(m.spendCents) : '—'}
        </td>
        <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">{m.trials}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">{m.paying}</td>
        <td className="py-2 pr-4 text-right tabular-nums text-gray-700 dark:text-gray-200">
          {m.cacCents != null ? formatMoneyShort(m.cacCents) : m.spendCents > 0 ? 'no converts yet' : '—'}
        </td>
        <td className="py-2 text-right">
          {!m.mature ? (
            <span className="text-xs text-violet-600 dark:text-violet-400">collecting</span>
          ) : m.overCeiling ? (
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400">over ceiling</span>
          ) : m.spendCents > 0 ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">judged</span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
          )}
        </td>
      </tr>
      {spendChannels.map((c) => (
        <tr key={`${m.month}:${c.channel}`}>
          <td className="py-1.5 pr-4 pl-4 text-xs text-gray-500 dark:text-gray-400">
            {MARKETING_CHANNEL_LABELS[c.channel]}
          </td>
          <td className="py-1.5 pr-4 text-right tabular-nums text-xs text-gray-500 dark:text-gray-400">
            {formatMoneyShort(c.spendCents)}
          </td>
          <td className="py-1.5 pr-4 text-right tabular-nums text-xs text-gray-500 dark:text-gray-400">
            {c.trials}
          </td>
          <td className="py-1.5 pr-4 text-right tabular-nums text-xs text-gray-400 dark:text-gray-500">—</td>
          <td className="py-1.5 pr-4 text-right tabular-nums text-xs text-gray-500 dark:text-gray-400">
            {c.costPerTrialCents != null ? `${formatMoneyShort(c.costPerTrialCents)}/trial` : '—'}
          </td>
          <td className="py-1.5 text-right">
            <ChannelBar bar={c.bar} channel={c.channel} />
          </td>
        </tr>
      ))}
    </>
  )
}

function ChannelBar({
  bar,
  channel,
}: {
  bar: 'within' | 'over' | 'no_trials' | null
  channel: keyof typeof CHANNEL_TRIAL_BARS
}) {
  if (bar === null) return <span className="text-xs text-gray-400 dark:text-gray-500">no bar</span>
  const limit = CHANNEL_TRIAL_BARS[channel]
  const limitLabel = limit != null ? formatMoneyShort(limit) : ''
  if (bar === 'within')
    return <span className="text-xs text-emerald-600 dark:text-emerald-400">within {limitLabel} bar</span>
  if (bar === 'over')
    return <span className="text-xs font-medium text-rose-600 dark:text-rose-400">over {limitLabel} bar</span>
  return <span className="text-xs text-amber-600 dark:text-amber-400">no trials yet</span>
}

function StepOnePlan() {
  return (
    <div className="rounded-lg bg-[color:var(--color-surface-sunk,#E9F0FC)] dark:bg-gray-900/40 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
        {STEP_ONE_PLAN.headline}
      </h3>
      <ul className="space-y-1">
        {STEP_ONE_PLAN.lines.map((line) => (
          <li key={line} className="flex gap-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="text-teal-600 dark:text-teal-400" aria-hidden="true">
              ·
            </span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
