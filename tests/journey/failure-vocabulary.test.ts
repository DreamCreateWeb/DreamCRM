import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE FAILURE VOCABULARY, DE-DUPED (Phase 4 slice 4).
 *
 * Slice 1 built `recordFailure` and the Guardian's three-strikes-is-blocked
 * rule, and then nothing called it — so the failure branch of the whole
 * primitive was dead in production. Slice 4 wires the proposal engine into
 * it, and the load-bearing part is the window: the cron runs HOURLY, so
 * without de-duplication one stuck generator writes 24 rows a day into a
 * clinic's own story and trips the alarm before lunch on day one.
 */

const store = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  selectThrows: false,
  insertThrows: false,
  captured: { since: null as Date | null, capability: null as unknown, failureFilter: false },
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  return {
    db: {
      select: () => {
        const api: Record<string, unknown> = {}
        api.from = () => api
        api.where = () => api
        api.limit = async () => {
          if (store.selectThrows) throw new Error('db down')
          return store.rows
        }
        return api
      },
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          if (store.insertThrows) throw new Error('insert failed')
          store.inserted.push(v)
        },
      }),
    },
  }
})

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ __col: name })
  return {
    actionLedger: {
      id: col('id'),
      organizationId: col('organization_id'),
      capability: col('capability'),
      patientId: col('patient_id'),
      summary: col('summary'),
      detail: col('detail'),
      occurredAt: col('occurred_at'),
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  desc: () => ({ op: 'desc' }),
  eq: (c: { __col: string }, v: unknown) => {
    if (c.__col === 'capability') store.captured.capability = v
    return { op: 'eq' }
  },
  gte: (c: { __col: string }, v: Date) => {
    if (c.__col === 'occurred_at') store.captured.since = v
    return { op: 'gte' }
  },
  lt: () => ({ op: 'lt' }),
  sql: (strings: TemplateStringsArray) => {
    if (strings.join('').includes("'failure'")) store.captured.failureFilter = true
    return { op: 'sql' }
  },
}))

import { recordFailure, isWorkEntry } from '@/lib/services/action-ledger'

const NOW = new Date('2026-07-29T14:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  store.rows = []
  store.inserted = []
  store.selectThrows = false
  store.insertThrows = false
  store.captured = { since: null, capability: null, failureFilter: false }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const failure = (over: Record<string, unknown> = {}) => ({
  organizationId: 'org_1',
  capability: 'review_reply',
  summary: 'Couldn’t draft a reply just now.',
  occurredAt: NOW,
  ...over,
})

describe('recordFailure', () => {
  it('marks the entry as a failure so it is never counted as work', async () => {
    await recordFailure(failure())
    expect(store.inserted).toHaveLength(1)
    const detail = store.inserted[0].detail as Record<string, unknown>
    expect(detail.failure).toBe(true)
    // The law the Guardian depends on: a broken clinic must not look busy.
    expect(isWorkEntry(detail)).toBe(false)
  })

  it('preserves the caller’s own detail alongside the marker', async () => {
    await recordFailure(failure({ detail: { reason: 'token expired' } }))
    const detail = store.inserted[0].detail as Record<string, unknown>
    expect(detail.reason).toBe('token expired')
    expect(detail.failure).toBe(true)
  })

  it('with NO window it records every time — the primitive stays a primitive', async () => {
    store.rows = [{ id: 'act_1' }]
    await recordFailure(failure())
    await recordFailure(failure())
    expect(store.inserted).toHaveLength(2)
  })
})

describe('recordFailure — the once-a-day window', () => {
  it('records the first break of the day', async () => {
    store.rows = []
    expect(await recordFailure(failure({ onceWithin: DAY_MS }))).toBe(true)
    expect(store.inserted).toHaveLength(1)
  })

  it('SUPPRESSES the same break an hour later — 24 rows a day is not a story', async () => {
    store.rows = [{ id: 'act_earlier' }]
    expect(await recordFailure(failure({ onceWithin: DAY_MS }))).toBe(false)
    expect(store.inserted).toHaveLength(0)
  })

  it('looks back exactly one window, for this capability, at failures only', async () => {
    await recordFailure(failure({ onceWithin: DAY_MS }))
    expect(store.captured.since).toEqual(new Date(NOW.getTime() - DAY_MS))
    expect(store.captured.capability).toBe('review_reply')
    // Without the failure filter a normal work entry would suppress the
    // alarm — a clinic whose reviews are working AND failing would go quiet.
    expect(store.captured.failureFilter).toBe(true)
  })

  it('a DIFFERENT capability breaking is its own strike', async () => {
    store.rows = []
    await recordFailure(failure({ onceWithin: DAY_MS }))
    await recordFailure(failure({ capability: 'social_post', onceWithin: DAY_MS }))
    expect(store.inserted).toHaveLength(2)
  })

  it('an unreadable ledger records ANYWAY — going blind is the failure we refuse', async () => {
    store.selectThrows = true
    expect(await recordFailure(failure({ onceWithin: DAY_MS }))).toBe(true)
    // A duplicate row costs nothing; a swallowed break costs the clinic.
    expect(store.inserted).toHaveLength(1)
  })

  it('a failed write reports false and never throws at the caller', async () => {
    store.insertThrows = true
    expect(await recordFailure(failure({ onceWithin: DAY_MS }))).toBe(false)
  })

  it('a zero or negative window is treated as no window, not as “always suppress”', async () => {
    store.rows = [{ id: 'act_earlier' }]
    expect(await recordFailure(failure({ onceWithin: 0 }))).toBe(true)
    expect(await recordFailure(failure({ onceWithin: -1 }))).toBe(true)
    expect(store.inserted).toHaveLength(2)
  })

  it('the window rides the entry’s OWN timestamp, not wall-clock now', async () => {
    const backdated = new Date('2026-07-01T00:00:00Z')
    await recordFailure(failure({ occurredAt: backdated, onceWithin: DAY_MS }))
    expect(store.captured.since).toEqual(new Date(backdated.getTime() - DAY_MS))
  })

  it('never leaks the window into the stored row', async () => {
    await recordFailure(failure({ onceWithin: DAY_MS }))
    expect(store.inserted[0]).not.toHaveProperty('onceWithin')
    expect(store.inserted[0].detail).not.toHaveProperty('onceWithin')
  })
})
