import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The PMS API meter + circuit breaker (onboarding overhaul §2.7). NexHealth
 * bills $0.10/call past the free tier, so these pins are spend control:
 * the counter upserts per (org, UTC day), counting NEVER breaks the call it
 * measures, the breaker throws loudly at budget, and an unreadable meter
 * fails OPEN (a DB blip must not also take the sync down).
 */

const state = {
  selectQueue: [] as unknown[],
  selectError: null as Error | null,
  inserts: [] as Array<{ values: Record<string, unknown>; conflict: Record<string, unknown> | null }>,
  insertError: null as Error | null,
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: Record<string, unknown> = {}
    const self = () => obj
    obj.from = self
    obj.where = self
    obj.limit = self
    ;(obj as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      if (state.selectError) return Promise.reject(state.selectError).then(onF, onR)
      return Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    }
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async (conflict: Record<string, unknown>) => {
            if (state.insertError) throw state.insertError
            state.inserts.push({ values, conflict })
          },
        }),
      }),
    },
    schema: {
      pmsApiUsage: { organizationId: 'org', day: 'day', calls: 'calls', updatedAt: 'updated_at' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn(() => ({})) }),
}))

import {
  DEFAULT_DAILY_CALL_BUDGET,
  dailyCallBudget,
  PmsApiBudgetExceededError,
  recordPmsApiCall,
  getTodayCalls,
  getMonthCalls,
  assertPmsApiBudget,
} from '@/lib/services/pms/api-meter'

const NOW = new Date('2026-08-10T15:30:00Z')

beforeEach(() => {
  state.selectQueue = []
  state.selectError = null
  state.inserts = []
  state.insertError = null
})
afterEach(() => {
  delete process.env.NEXHEALTH_DAILY_CALL_BUDGET
})

describe('recordPmsApiCall — upsert one call onto the (org, UTC day) counter', () => {
  it('inserts calls=1 keyed on the org and the UTC day string', async () => {
    await recordPmsApiCall('org_1', NOW)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].values).toMatchObject({ organizationId: 'org_1', day: '2026-08-10', calls: 1 })
    // Conflict path increments — the set clause must exist.
    expect(state.inserts[0].conflict?.set).toBeTruthy()
  })

  it('NEVER throws when the write fails — metering must not break the call it measures', async () => {
    state.insertError = new Error('db down')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordPmsApiCall('org_1', NOW)).resolves.toBeUndefined()
    spy.mockRestore()
  })
})

describe('getTodayCalls / getMonthCalls', () => {
  it('returns the day row count, and 0 when no row exists yet', async () => {
    state.selectQueue = [[{ calls: 17 }]]
    expect(await getTodayCalls('org_1', NOW)).toBe(17)
    state.selectQueue = [[]]
    expect(await getTodayCalls('org_1', NOW)).toBe(0)
  })

  it('month total sums the rows and coalesces to 0', async () => {
    state.selectQueue = [[{ total: 342 }]]
    expect(await getMonthCalls('org_1', NOW)).toBe(342)
    state.selectQueue = [[{ total: null }]]
    expect(await getMonthCalls('org_1', NOW)).toBe(0)
  })
})

describe('dailyCallBudget — env override with a safe default', () => {
  it('defaults to 60 (worst month ≈ $75, inside the stated tolerance)', () => {
    expect(DEFAULT_DAILY_CALL_BUDGET).toBe(60)
    expect(dailyCallBudget()).toBe(60)
  })

  it('honors a positive integer override and ignores junk', () => {
    process.env.NEXHEALTH_DAILY_CALL_BUDGET = '120'
    expect(dailyCallBudget()).toBe(120)
    process.env.NEXHEALTH_DAILY_CALL_BUDGET = 'lots'
    expect(dailyCallBudget()).toBe(DEFAULT_DAILY_CALL_BUDGET)
    process.env.NEXHEALTH_DAILY_CALL_BUDGET = '-5'
    expect(dailyCallBudget()).toBe(DEFAULT_DAILY_CALL_BUDGET)
  })
})

describe('assertPmsApiBudget — the breaker', () => {
  it('passes under budget', async () => {
    state.selectQueue = [[{ calls: 59 }]]
    await expect(assertPmsApiBudget('org_1', NOW)).resolves.toBeUndefined()
  })

  it('throws PmsApiBudgetExceededError AT budget (>= — the 60th call already went out)', async () => {
    state.selectQueue = [[{ calls: 60 }]]
    await expect(assertPmsApiBudget('org_1', NOW)).rejects.toBeInstanceOf(PmsApiBudgetExceededError)
  })

  it('fails OPEN when the meter is unreadable — spend protection must not take the sync down', async () => {
    state.selectError = new Error('db down')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(assertPmsApiBudget('org_1', NOW)).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
