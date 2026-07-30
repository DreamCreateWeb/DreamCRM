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
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const text = strings.join('') + vals.map((v) => String((v as { __raw?: string })?.__raw ?? '')).join('')
      if (text.includes("'failure'")) store.captured.failureFilter = true
      return { op: 'sql' }
    },
    { raw: (t: string) => ({ __raw: t }), join: () => ({ op: 'sql' }) },
  ),
}))

import { recordEngineFailure, isWorkEntry } from '@/lib/services/action-ledger'

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

describe('recordEngineFailure', () => {
  it('marks the entry as a failure so it is never counted as work', async () => {
    await recordEngineFailure(failure())
    expect(store.inserted).toHaveLength(1)
    const detail = store.inserted[0].detail as Record<string, unknown>
    expect(detail.failure).toBe(true)
    // The law the Guardian depends on: a broken clinic must not look busy.
    expect(isWorkEntry(detail)).toBe(false)
  })

  it('preserves the caller’s own detail alongside the marker', async () => {
    await recordEngineFailure(failure({ detail: { reason: 'token expired' } }))
    const detail = store.inserted[0].detail as Record<string, unknown>
    expect(detail.reason).toBe('token expired')
    expect(detail.failure).toBe(true)
  })

  it('with NO window it records every time — the primitive stays a primitive', async () => {
    store.rows = [{ id: 'act_1' }]
    await recordEngineFailure(failure())
    await recordEngineFailure(failure())
    expect(store.inserted).toHaveLength(2)
  })
})

describe('recordEngineFailure — the once-a-day window', () => {
  it('records the first break of the day', async () => {
    store.rows = []
    expect(await recordEngineFailure(failure({ onceWithin: DAY_MS }))).toBe(true)
    expect(store.inserted).toHaveLength(1)
  })

  it('SUPPRESSES the same break an hour later — 24 rows a day is not a story', async () => {
    store.rows = [{ id: 'act_earlier' }]
    expect(await recordEngineFailure(failure({ onceWithin: DAY_MS }))).toBe(false)
    expect(store.inserted).toHaveLength(0)
  })

  it('looks back exactly one window, for this capability, at failures only', async () => {
    await recordEngineFailure(failure({ onceWithin: DAY_MS }))
    expect(store.captured.since).toEqual(new Date(NOW.getTime() - DAY_MS))
    expect(store.captured.capability).toBe('review_reply')
    // Without the failure filter a normal work entry would suppress the
    // alarm — a clinic whose reviews are working AND failing would go quiet.
    expect(store.captured.failureFilter).toBe(true)
  })

  it('a DIFFERENT capability breaking is its own strike', async () => {
    store.rows = []
    await recordEngineFailure(failure({ onceWithin: DAY_MS }))
    await recordEngineFailure(failure({ capability: 'social_post', onceWithin: DAY_MS }))
    expect(store.inserted).toHaveLength(2)
  })

  it('dedupeAcrossOrg drops the capability filter — one break wearing five hats is one break', async () => {
    // ROUND-9 AUDIT: this branch had zero EXECUTED coverage. Deleting it
    // left the whole suite green, which meant the fix it encodes (a flaky
    // provider failing review drafting at 09:00 and social drafting at
    // 10:00 buying a fresh strike each hour, clearing the three-strike
    // alarm inside a morning) could silently regress.
    store.rows = []
    await recordEngineFailure(failure({ onceWithin: DAY_MS, dedupeAcrossOrg: true }))
    // No capability predicate was issued at all — the org-wide question.
    expect(store.captured.capability).toBeNull()

    store.captured.capability = null
    await recordEngineFailure(failure({ onceWithin: DAY_MS }))
    expect(store.captured.capability).toBe('review_reply')
  })

  it('org-wide de-dup SUPPRESSES a different capability that would otherwise strike again', async () => {
    // The behavioural half: the earlier row is a `social_post` break, and
    // the new one is `review_reply`. Per-capability that is two strikes;
    // org-wide it is the same underlying break, and only one row is written.
    store.rows = [{ id: 'act_social_break' }]
    expect(
      await recordEngineFailure(
        failure({ capability: 'review_reply', onceWithin: DAY_MS, dedupeAcrossOrg: true }),
      ),
    ).toBe(false)
    expect(store.inserted).toHaveLength(0)
  })

  it('an unreadable ledger records ANYWAY — going blind is the failure we refuse', async () => {
    store.selectThrows = true
    expect(await recordEngineFailure(failure({ onceWithin: DAY_MS }))).toBe(true)
    // A duplicate row costs nothing; a swallowed break costs the clinic.
    expect(store.inserted).toHaveLength(1)
  })

  it('a failed write reports false and never throws at the caller', async () => {
    store.insertThrows = true
    expect(await recordEngineFailure(failure({ onceWithin: DAY_MS }))).toBe(false)
  })

  it('a zero or negative window is treated as no window, not as “always suppress”', async () => {
    store.rows = [{ id: 'act_earlier' }]
    expect(await recordEngineFailure(failure({ onceWithin: 0 }))).toBe(true)
    expect(await recordEngineFailure(failure({ onceWithin: -1 }))).toBe(true)
    expect(store.inserted).toHaveLength(2)
  })

  it('the window rides the entry’s OWN timestamp, not wall-clock now', async () => {
    const backdated = new Date('2026-07-01T00:00:00Z')
    await recordEngineFailure(failure({ occurredAt: backdated, onceWithin: DAY_MS }))
    expect(store.captured.since).toEqual(new Date(backdated.getTime() - DAY_MS))
  })

  it('never leaks the window into the stored row', async () => {
    await recordEngineFailure(failure({ onceWithin: DAY_MS }))
    expect(store.inserted[0]).not.toHaveProperty('onceWithin')
    expect(store.inserted[0].detail).not.toHaveProperty('onceWithin')
  })
})
