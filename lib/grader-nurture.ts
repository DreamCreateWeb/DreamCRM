import { GRADE_AXES, GRADE_AXIS_LABELS, type PracticeGradeResult } from '@/lib/practice-grade'

/**
 * Grader-lead nurture — the PURE half (marketing-engine Part 9 C①). Two
 * touches, both about the report the person ASKED for, both carrying a
 * one-click unsubscribe. This is the warm loop, not cold email: the
 * address came to us attached to a request, the follow-ups stay on that
 * subject, and a standing suppression is honored forever (the service
 * checks it at send time, same as the Hunter).
 *
 *  - Day 3: "your report's still here" + THE ONE FIX that moves their
 *    score most (from their own stored result — never generic).
 *  - Day 14: "re-grade and see what moved" — the delta strip (B①) is the
 *    payload; a report that tracks progress is worth re-running.
 */

export const NURTURE_REPORT_DAYS = 3
export const NURTURE_REGRADE_DAYS = 14
/** A touch that never happened by this age is stale — nobody wants a
 *  "your report's still here" for a report from last quarter. Also the
 *  first-deploy guard: the backlog of old rows ages out instead of
 *  getting a surprise blast. */
export const NURTURE_REPORT_MAX_DAYS = 10
export const NURTURE_REGRADE_MAX_DAYS = 28
/** Per-run send cap — gentle by design; the daily cadence catches up. */
export const NURTURE_BATCH_CAP = 50

const DAY_MS = 24 * 60 * 60 * 1000

/** Is a row inside a touch's [minDays, maxDays) age window? */
export function inNurtureWindow(
  createdAt: Date,
  now: Date,
  minDays: number,
  maxDays: number,
): boolean {
  const age = now.getTime() - createdAt.getTime()
  return age >= minDays * DAY_MS && age < maxDays * DAY_MS
}

export interface TopFix {
  /** 'Your website' etc. */
  axisLabel: string
  /** What a patient hits today. */
  text: string
  /** The shipped-feature remedy. */
  after: string
}

/**
 * The one finding worth an email: from the worst-scored axis, the first
 * finding carrying a shipped-feature remedy. Falls back to any remedied
 * finding anywhere; null when the report has nothing fixable to say
 * (a clean A, or an all-unknown run) — and then the day-3 touch simply
 * isn't sent, because a nudge with nothing to offer is noise.
 */
export function topFixFor(result: PracticeGradeResult): TopFix | null {
  const scored = GRADE_AXES.filter((a) => result.axes[a]?.score != null).sort(
    (a, b) => (result.axes[a].score ?? 100) - (result.axes[b].score ?? 100),
  )
  const ordered = [...scored, ...GRADE_AXES.filter((a) => !scored.includes(a))]
  for (const axis of ordered) {
    const f = result.axes[axis]?.findings.find((x) => x.after)
    if (f?.after) return { axisLabel: GRADE_AXIS_LABELS[axis], text: f.text, after: f.after }
  }
  return null
}
