// The learning loop — turns the win/loss report into (1) a promptable block
// that feeds back into outreach so the machine leans into what converts and
// preempts the top objection, and (2) the suppression→loss-reason mapping.
// Pure + client-safe (imported by the pipeline panel, the outreach prompt
// builder, and the tests).

import {
  LOSS_REASON_LABELS,
  type ProspectLossReason,
  type WinLossReport,
} from '@/lib/types/prospecting'

/** Map a suppression reason string to a coded loss reason. The suppression
 *  path uses free-ish strings (unsub | bounce | complaint | manual |
 *  existing_customer | reply_not_interested); everything else → 'other'. */
export function lossReasonForSuppression(reason: string): ProspectLossReason {
  switch (reason) {
    case 'unsub':
    case 'unsubscribe':
      return 'unsubscribed'
    case 'bounce':
    case 'hard_bounce':
      return 'bounced'
    case 'complaint':
    case 'reply_not_interested':
      return 'replied_no'
    case 'existing_customer':
      return 'no_need'
    default:
      return 'other'
  }
}

/** Minimum decided outcomes before we trust the numbers enough to (a) show the
 *  learning callouts and (b) feed them back into the AI. Below this, one loss
 *  looks like a trend. */
export const LEARNINGS_MIN_SAMPLE = 8

/**
 * A compact, promptable "market learnings" block for the outreach + demo AI —
 * or '' when there isn't enough decided data to trust yet (the caller then
 * injects nothing, so a thin sample never skews the pitch). Grounded entirely
 * in the report; never invents.
 */
export function buildOutreachLearnings(report: WinLossReport): string {
  const decided = report.won + report.lost
  if (decided < LEARNINGS_MIN_SAMPLE) return ''

  const lines: string[] = []
  lines.push(
    `WHAT'S WORKING (from ${report.won} wins / ${report.lost} losses so far — use it to sharpen the pitch, never to overpromise):`,
  )

  // Best-converting segment (needs a real denominator).
  const rankedSegments = report.segments
    .filter((s) => s.winRatePct != null && s.won + s.lost >= 3)
    .sort((a, b) => (b.winRatePct ?? 0) - (a.winRatePct ?? 0))
  if (rankedSegments.length > 0) {
    const best = rankedSegments[0]
    lines.push(
      `- Best-converting profile: ${best.label} (${best.winRatePct}% win rate). Lead into the angle that fits this prospect.`,
    )
  }

  // Top loss reason → a preempt instruction (only the objections we can act on).
  const actionable = report.lossReasons.find((r) =>
    (['price', 'using_competitor', 'no_need', 'bad_timing'] as ProspectLossReason[]).includes(r.reason),
  )
  if (actionable) {
    lines.push(
      `- Most common reason we lose: ${actionable.label.toLowerCase()} (${actionable.count}). Where natural, defuse it early with an honest, specific line.`,
    )
  }

  if (lines.length === 1) return '' // nothing actionable surfaced
  return lines.join('\n')
}

/** Human-facing one-liners for the pipeline panel's "what the data says" strip.
 *  Returns [] below the min sample. */
export function summarizeLearnings(report: WinLossReport): string[] {
  const decided = report.won + report.lost
  if (decided < LEARNINGS_MIN_SAMPLE) return []
  const out: string[] = []

  if (report.winRatePct != null) {
    out.push(`You're closing ${report.winRatePct}% of decided prospects.`)
  }
  const rankedSegments = report.segments
    .filter((s) => s.winRatePct != null && s.won + s.lost >= 3)
    .sort((a, b) => (b.winRatePct ?? 0) - (a.winRatePct ?? 0))
  if (rankedSegments.length > 0 && (rankedSegments[0].winRatePct ?? 0) > 0) {
    out.push(
      `${rankedSegments[0].label} converts best (${rankedSegments[0].winRatePct}%) — worth hunting more of them.`,
    )
  }
  const topLoss = report.lossReasons[0]
  if (topLoss) {
    out.push(`Top reason you lose: ${LOSS_REASON_LABELS[topLoss.reason].toLowerCase()} (${topLoss.count}).`)
  }
  if (report.avgTouchesToWin != null) {
    out.push(`Wins take about ${report.avgTouchesToWin} touch${report.avgTouchesToWin === 1 ? '' : 'es'} on average.`)
  }
  return out
}
