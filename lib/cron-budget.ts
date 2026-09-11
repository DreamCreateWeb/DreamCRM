/**
 * Wall-clock budgets + round-robin resumption for the per-clinic nightly
 * sweeps. Pure — no database, no clock beyond what you pass in.
 *
 * THE PROBLEM THIS SOLVES, precisely. `daily-digest`, `generate-proposals` and
 * `retention-automations` each walk every clinic one at a time with no time
 * limit and no memory. That is fine at today's clinic count and it fails in a
 * specific, silent way as the count grows: the route hits its `maxDuration`,
 * the request is killed mid-loop, and because the walk always starts at the
 * same end of the same list, THE SAME clinics are served every night and the
 * ones past the cut-off are never reached at all. Nothing errors. Nothing is
 * logged. A practice simply stops getting its morning digest and nobody can
 * say when it stopped.
 *
 * The fix is not to go faster or wider — the instance can't take parallelism,
 * and the risk here is cron overrun, not database load. It is to make the
 * sweep (a) stop on purpose before the platform stops it, and (b) start where
 * it left off. Every clinic is then reached within `ceil(N / clinics-per-run)`
 * runs no matter how big N gets, instead of the tail being reached never.
 *
 * WHAT AN OVERRUN COSTS A DEFERRED CLINIC — and it is NOT the same for all
 * three, so `completed: false` must not be read as uniformly benign:
 *
 *  - `generate-proposals` — a DELAY of one hour. Proposals file by `sourceKey`
 *    against windows measured in days or months, so the next tick does the
 *    work that this one didn't.
 *  - `retention-automations` — a DELAY of 24 hours for the month-keyed and
 *    week-keyed automations (reactivation, benefits, welcome), but a SKIP for
 *    the birthday campaign: its key is `birthday:<org>:<YYYY-MM-DD>`, so
 *    tomorrow's key is a different day and yesterday's birthday patients no
 *    longer match the audience. That campaign is not sent late; it is not sent.
 *  - `daily-digest` — a SKIP, for the same reason: `daily_digest_log.sentOn`
 *    is today's date, so a deferred clinic gets no digest that morning at all
 *    rather than a late one.
 *
 * The rotation is what makes the skips acceptable: it turns "the tail misses
 * EVERY night" into "every clinic misses OCCASIONALLY", which is a fair
 * schedule rather than a silent cliff. It does not turn a skip into a delay.
 * So if `retention-automations` (daily, and the tightest budget of the three)
 * ever genuinely runs out of time, the answer is a bigger budget or a split
 * route — never a shrug at `completed: false`.
 */

/** A wall-clock deadline for one sweep. */
export interface SweepBudget {
  /** ms since epoch after which no NEW clinic is started. */
  readonly deadline: number
}

export function startBudget(budgetMs: number, now: number = Date.now()): SweepBudget {
  return { deadline: now + Math.max(0, budgetMs) }
}

/** True once the budget is gone. Checked BETWEEN clinics, never inside one. */
export function budgetSpent(budget: SweepBudget, now: number = Date.now()): boolean {
  return now >= budget.deadline
}

/**
 * Rotate an ordered list so the sweep resumes after `cursor`.
 *
 * The list is sorted by id first, so "after" means something stable across
 * runs even as clinics are added and removed. It ROTATES rather than slicing:
 * a run that resumes in the middle still walks past the end and around to the
 * clinics it served last time, which is what makes the schedule round-robin
 * instead of a queue that has to be drained before anyone at the front is
 * served again.
 *
 * A cursor naming a clinic that no longer exists is not an error — the next id
 * above it is the right place to carry on from. A cursor above every id wraps
 * to the start, which is the same answer as "the last pass finished".
 */
export function resumeFrom<T>(items: T[], idOf: (item: T) => string, cursor: string | null): T[] {
  const ordered = [...items].sort((a, b) => (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0))
  if (!cursor || ordered.length === 0) return ordered
  const start = ordered.findIndex((item) => idOf(item) > cursor)
  if (start <= 0) return ordered
  return [...ordered.slice(start), ...ordered.slice(0, start)]
}

/** What a budgeted sweep did, for the cron's JSON response. */
export interface SweepProgress {
  /** How many clinics this run actually walked. */
  swept: number
  /** How many it left for the next tick (0 when the pass finished). */
  remaining: number
  /** False when the budget ran out before the list did. */
  completed: boolean
  /** Where the next run resumes; null once a full pass has finished. */
  resumeAt: string | null
}

/**
 * Walk `items` inside `budget`, starting after `cursor`.
 *
 * A clinic that THROWS still counts as walked, and the cursor still moves past
 * it. That isolation is load-bearing, not defensive tidiness: without it one
 * clinic whose staff query fails every night parks the cursor permanently in
 * front of itself and starves every clinic behind it — the exact starvation
 * this module exists to prevent, reintroduced through a different door. The
 * failure goes to `onError` so the caller can record it in its own result.
 *
 * ALWAYS walks at least one clinic. A budget already spent when the run starts
 * (a slow cold boot, a mis-set constant) would otherwise make no progress ever
 * — the cursor would never move and the sweep would be dead while reporting
 * success every tick.
 *
 * The budget bounds when a clinic STARTS, never mid-clinic: a clinic is the
 * atomic unit the cursor is expressed in, so a run can overshoot by one
 * clinic's work. Choose budgets so `budget + the slowest clinic` fits inside
 * the route's `maxDuration`.
 */
export async function walkWithinBudget<T>(
  items: T[],
  idOf: (item: T) => string,
  cursor: string | null,
  budget: SweepBudget,
  each: (item: T) => Promise<void>,
  now: () => number = Date.now,
  onError?: (item: T, err: unknown) => void,
): Promise<SweepProgress> {
  const ordered = resumeFrom(items, idOf, cursor)
  let swept = 0
  let last: string | null = null
  for (const item of ordered) {
    if (swept > 0 && budgetSpent(budget, now())) {
      return { swept, remaining: ordered.length - swept, completed: false, resumeAt: last }
    }
    try {
      await each(item)
    } catch (err) {
      if (onError) onError(item, err)
      else console.error(`[cron-budget] ${idOf(item)} threw; carrying on`, err)
    }
    swept++
    last = idOf(item)
  }
  // A finished pass clears the cursor, so the next run starts from the top
  // rather than from wherever this one happened to end.
  return { swept, remaining: 0, completed: true, resumeAt: null }
}
