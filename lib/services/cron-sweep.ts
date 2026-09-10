import 'server-only'
import { readPlatformConfig, writePlatformConfig } from '@/lib/services/platform-config'
import {
  startBudget,
  walkWithinBudget,
  type SweepProgress,
} from '@/lib/cron-budget'

/**
 * The one home for "walk every clinic, stop before the platform stops you,
 * pick up where you left off next tick". `lib/cron-budget.ts` holds the pure
 * decisions; this holds the one side effect they need — a durable cursor.
 *
 * WHERE THE CURSOR LIVES. `platform_config`, one TOP-LEVEL key per job
 * (`cronCursor:daily-digest`, …), never a shared `cronCursors` object. That is
 * not tidiness: `writePlatformConfig` merges SHALLOWLY, so two jobs sharing a
 * sub-object would be a read-modify-write across concurrent crons, and the
 * hourly generator finishing mid-way through the daily digest's write would
 * silently drop the digest's cursor. A key per writer is the law that file
 * already states; this follows it rather than being the exception that proves
 * it needs restating.
 *
 * A cursor is a HINT, never truth. Every read floors to null (start from the
 * top) and every write is best-effort, because losing a cursor costs one
 * clinic a delayed tick while a thrown cron costs every clinic the whole run.
 */

/**
 * How long each sweep may spend walking clinics, chosen against the route's
 * own `maxDuration` with room left for the work that follows the walk:
 *
 *  - `daily-digest`   — route 300s; the prospecting digest and the Monday
 *                       standup ride the same tick after this returns.
 *  - `generate-proposals` — route 300s; the walk IS the job, so it takes most
 *                       of it and leaves only the bookkeeping tail.
 *  - `retention-automations` — route 120s, and FOUR best-effort jobs run after
 *                       this one (balance cadence, due plan charges, NPS,
 *                       loyalty). Bounding this walk is what leaves them room;
 *                       today an unbounded retention walk can eat the tick and
 *                       silently take the charges down with it.
 */
export const SWEEP_BUDGET_MS = {
  'daily-digest': 180_000,
  'generate-proposals': 240_000,
  'retention-automations': 60_000,
} as const

export type SweepJob = keyof typeof SWEEP_BUDGET_MS

function cursorKey(job: SweepJob): string {
  return `cronCursor:${job}`
}

/** The clinic this job stopped after last run, or null to start from the top. */
export async function readSweepCursor(job: SweepJob): Promise<string | null> {
  try {
    const config = await readPlatformConfig()
    const value = config[cursorKey(job)]
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    // Unreadable → start from the top. A repeated failure here degrades to
    // exactly today's behaviour (always the same clinics first), which is the
    // right floor: never worse than what we had.
    return null
  }
}

export async function writeSweepCursor(job: SweepJob, cursor: string | null): Promise<void> {
  try {
    await writePlatformConfig({ [cursorKey(job)]: cursor })
  } catch (e) {
    console.warn(`[cron-sweep] could not record the ${job} cursor; next run restarts from the top`, e)
  }
}

/**
 * Walk `items` for `job` inside its budget, resuming where the last run
 * stopped and recording where this one did.
 *
 * A clinic that throws still counts as walked and the cursor still moves past
 * it, so a permanently broken one cannot park the cursor in front of itself and
 * starve every clinic behind it. Pass `onError` to record the failure in your
 * own result rather than in the console.
 */
export async function sweepClinics<T>(
  job: SweepJob,
  items: T[],
  idOf: (item: T) => string,
  each: (item: T) => Promise<void>,
  opts?: { budgetMs?: number; now?: () => number; onError?: (item: T, err: unknown) => void },
): Promise<SweepProgress> {
  const now = opts?.now ?? Date.now
  const cursor = await readSweepCursor(job)
  const budget = startBudget(opts?.budgetMs ?? SWEEP_BUDGET_MS[job], now())
  const progress = await walkWithinBudget(items, idOf, cursor, budget, each, now, opts?.onError)
  // Only write when it changed — a completed pass on a platform that already
  // had no cursor is the common case and deserves no write at all.
  if (progress.resumeAt !== cursor) await writeSweepCursor(job, progress.resumeAt)
  if (!progress.completed) {
    console.warn(
      `[cron-sweep] ${job} ran out of time after ${progress.swept} clinic(s); ` +
        `${progress.remaining} left, resuming after ${progress.resumeAt} next tick`,
    )
  }
  return progress
}
