import { describe, it, expect, vi } from 'vitest'
import {
  startBudget,
  budgetSpent,
  resumeFrom,
  walkWithinBudget,
} from '@/lib/cron-budget'

/**
 * The nightly per-clinic sweeps used to walk every clinic with no time limit
 * and no memory. The failure mode that made this necessary is silent: the
 * route hits maxDuration, the request is killed mid-loop, and because the walk
 * always started at the same end of the same list, THE SAME clinics were
 * served every night and the ones past the cut-off were never reached. No
 * error, no log — a practice just stops getting its morning digest.
 *
 * These are the two decisions that fix it: stop on purpose, and start where
 * you left off.
 */

const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id)
const orgs = (...names: string[]) => names.map((id) => ({ id }))

describe('resumeFrom', () => {
  it('starts at the top when there is no cursor', () => {
    expect(ids(resumeFrom(orgs('c', 'a', 'b'), (o) => o.id, null))).toEqual(['a', 'b', 'c'])
  })

  it('resumes after the clinic the last run stopped on', () => {
    expect(ids(resumeFrom(orgs('a', 'b', 'c', 'd'), (o) => o.id, 'b'))).toEqual(['c', 'd', 'a', 'b'])
  })

  it('ROTATES rather than truncating — the tail is served, then the head', () => {
    // A queue that has to be drained before the front is served again would
    // starve the head; the round-robin is the whole point.
    const order = ids(resumeFrom(orgs('a', 'b', 'c', 'd', 'e'), (o) => o.id, 'c'))
    expect(order).toEqual(['d', 'e', 'a', 'b', 'c'])
    expect(order).toHaveLength(5)
  })

  it('wraps to the start when the cursor is past every clinic', () => {
    expect(ids(resumeFrom(orgs('a', 'b'), (o) => o.id, 'zzz'))).toEqual(['a', 'b'])
  })

  it('carries on from the next id when the cursor clinic was deleted', () => {
    // Clinics churn. A cursor is a position in an ordering, not a foreign key.
    expect(ids(resumeFrom(orgs('a', 'c', 'd'), (o) => o.id, 'b'))).toEqual(['c', 'd', 'a'])
  })

  it('is stable across runs regardless of the order the query returned', () => {
    const a = ids(resumeFrom(orgs('d', 'a', 'c', 'b'), (o) => o.id, 'a'))
    const b = ids(resumeFrom(orgs('b', 'c', 'a', 'd'), (o) => o.id, 'a'))
    expect(a).toEqual(b)
  })

  it('handles an empty list', () => {
    expect(resumeFrom([], (o: { id: string }) => o.id, 'a')).toEqual([])
  })
})

describe('budgetSpent', () => {
  it('is not spent before the deadline and is spent at it', () => {
    const b = startBudget(1_000, 0)
    expect(budgetSpent(b, 999)).toBe(false)
    expect(budgetSpent(b, 1_000)).toBe(true)
    expect(budgetSpent(b, 5_000)).toBe(true)
  })

  it('treats a negative budget as already spent rather than as time travel', () => {
    expect(budgetSpent(startBudget(-5_000, 0), 0)).toBe(true)
  })
})

describe('walkWithinBudget', () => {
  /**
   * A clock where every clinic costs `step` ms. The budget is checked BEFORE
   * each clinic after the first, so the Nth check reads N*step — hence the
   * `start = step`.
   */
  function clock(step: number, start = step) {
    let t = start
    return () => {
      const now = t
      t += step
      return now
    }
  }

  it('walks everyone and clears the cursor when the budget is ample', async () => {
    const seen: string[] = []
    const p = await walkWithinBudget(
      orgs('a', 'b', 'c'),
      (o) => o.id,
      null,
      startBudget(10_000, 0),
      async (o) => {
        seen.push(o.id)
      },
      clock(1),
    )
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(p).toEqual({ swept: 3, remaining: 0, completed: true, resumeAt: null })
  })

  it('stops at the budget and reports where to resume', async () => {
    const seen: string[] = []
    // 100ms of budget, 40ms per clinic. The third STARTS at 80ms — still
    // inside — and the fourth is refused at 120ms.
    const p = await walkWithinBudget(
      orgs('a', 'b', 'c', 'd'),
      (o) => o.id,
      null,
      startBudget(100, 0),
      async (o) => {
        seen.push(o.id)
      },
      clock(40),
    )
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(p).toEqual({ swept: 3, remaining: 1, completed: false, resumeAt: 'c' })
  })

  it('the budget bounds when a clinic STARTS, so a run can overshoot by one', async () => {
    // Worth pinning because it is how the budget constants have to be chosen:
    // budget + the longest single clinic must fit inside the route's
    // maxDuration, not budget alone. Stopping mid-clinic is not on the table —
    // a clinic is the atomic unit the cursor is expressed in.
    let elapsed = 0
    const p = await walkWithinBudget(
      orgs('a', 'b'),
      (o) => o.id,
      null,
      startBudget(50, 0),
      async () => {
        elapsed += 1_000 // one very slow clinic
      },
      () => elapsed,
    )
    expect(p.swept).toBe(1)
    expect(elapsed).toBe(1_000) // ran 20x over budget rather than abandoning it
  })

  it('the next run picks up exactly where that one stopped', async () => {
    const seen: string[] = []
    const p = await walkWithinBudget(
      orgs('a', 'b', 'c', 'd'),
      (o) => o.id,
      'b',
      startBudget(100, 0),
      async (o) => {
        seen.push(o.id)
      },
      clock(40),
    )
    expect(seen).toEqual(['c', 'd', 'a'])
    // The pass wrapped past the end but the budget stopped it before it got
    // back round to b, so it says so.
    expect(p.completed).toBe(false)
    expect(p.resumeAt).toBe('a')
  })

  it('ALWAYS walks at least one clinic, even with a budget already spent', async () => {
    // Otherwise a slow cold boot or a mis-set constant means the cursor never
    // moves: the sweep is dead while reporting success on every tick.
    const seen: string[] = []
    const p = await walkWithinBudget(
      orgs('a', 'b'),
      (o) => o.id,
      null,
      startBudget(0, 0),
      async (o) => {
        seen.push(o.id)
      },
      clock(1_000, 1_000),
    )
    expect(seen).toEqual(['a'])
    expect(p).toMatchObject({ swept: 1, completed: false, resumeAt: 'a' })
  })

  it('a clinic that THROWS does not park the cursor in front of itself', async () => {
    // The starvation this module exists to prevent, reintroduced through a
    // different door: without isolation, one clinic whose staff query fails
    // every night blocks every clinic behind it forever.
    const seen: string[] = []
    const failures: string[] = []
    const p = await walkWithinBudget(
      orgs('a', 'b', 'c'),
      (o) => o.id,
      null,
      startBudget(10_000, 0),
      async (o) => {
        seen.push(o.id)
        if (o.id === 'a') throw new Error('staff query failed')
      },
      clock(1),
      (o, err) => failures.push(o.id + ': ' + (err as Error).message),
    )
    expect(seen).toEqual(['a', 'b', 'c'])
    expect(p).toEqual({ swept: 3, remaining: 0, completed: true, resumeAt: null })
    // Reported, not swallowed.
    expect(failures).toEqual(['a: staff query failed'])
  })

  it('a throw is reported to the console when the caller passes no onError', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = await walkWithinBudget(
      orgs('a'),
      (o) => o.id,
      null,
      startBudget(10_000, 0),
      async () => {
        throw new Error('boom')
      },
      clock(1),
    )
    expect(p.completed).toBe(true)
    expect(err).toHaveBeenCalledOnce()
    err.mockRestore()
  })

  it('over several budget-limited runs every clinic gets a turn', async () => {
    // The property that actually matters: no starvation as the clinic count
    // grows past what one tick can carry.
    const all = orgs('a', 'b', 'c', 'd', 'e', 'f', 'g')
    const counts = new Map(all.map((o) => [o.id, 0]))
    let cursor: string | null = null
    for (let run = 0; run < 4; run++) {
      const p: Awaited<ReturnType<typeof walkWithinBudget>> = await walkWithinBudget(
        all,
        (o) => o.id,
        cursor,
        startBudget(100, 0),
        async (o) => {
          counts.set(o.id, counts.get(o.id)! + 1)
        },
        clock(40),
      )
      cursor = p.resumeAt
    }
    // 4 runs × 3 clinics = 12 turns over 7 clinics: everyone served at least
    // once, and nobody more than twice — the rotation, not a queue.
    expect(Array.from(counts.values()).every((n) => n >= 1)).toBe(true)
    expect(Array.from(counts.values()).every((n) => n <= 2)).toBe(true)
    expect(Array.from(counts.values()).reduce((a, b) => a + b, 0)).toBe(12)
  })

  it('an empty list is a completed pass, not a stalled one', async () => {
    const p = await walkWithinBudget([], (o: { id: string }) => o.id, 'a', startBudget(0, 0), async () => {}, clock(1))
    expect(p).toEqual({ swept: 0, remaining: 0, completed: true, resumeAt: null })
  })
})
