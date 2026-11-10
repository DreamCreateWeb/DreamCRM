import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE QUALITY FLOOR (P-01) — which queues honour it, which bypass it, and
 * the one rule nobody bypasses: a number marked invalid / disconnected /
 * wrong is never a dial target. Asserted at the predicate level: the floor
 * is `quality_score >= floor` (so unverified NULLs never pass) and the
 * phone guard is `phone_status NOT IN (bad)`.
 */

const state = { selectQueue: [] as unknown[][] }

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.groupBy = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  const table = (name: string) => new Proxy({}, { get: (_t, k) => `${name}.${String(k)}` })
  return {
    db: { select: () => selectChain(), selectDistinctOn: () => selectChain() },
    schema: {
      prospect: table('prospect'),
      prospectCallLog: table('prospect_call_log'),
      outreachEvent: table('outreach_event'),
      prospectingConfig: table('prospecting_config'),
    },
  }
})

const spies = vi.hoisted(() => ({
  gte: vi.fn(() => ({ gte: true })),
  notInArray: vi.fn(() => ({ notInArray: true })),
}))
vi.mock('drizzle-orm', () => {
  const stub = () => vi.fn(() => ({}))
  return {
    and: stub(), asc: stub(), desc: stub(), eq: stub(), exists: stub(), ilike: stub(),
    inArray: stub(), isNotNull: stub(), isNull: stub(), or: stub(),
    gte: spies.gte,
    notInArray: spies.notInArray,
    sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
  }
})

import { getPhoneQueue, getCallQueue, getCallList, getQualityCounts } from '@/lib/services/prospecting'
import { BAD_PHONE_STATUSES } from '@/lib/db/schema/prospecting'

const BAD = ['invalid', 'disconnected', 'wrong_number']

beforeEach(() => {
  state.selectQueue = []
  spies.gte.mockClear()
  spies.notInArray.mockClear()
})

describe('the predicates', () => {
  it('BAD_PHONE_STATUSES is the one list every guard reads', () => {
    expect([...BAD_PHONE_STATUSES]).toEqual(BAD)
  })

  it('the phone-first queue serves only at/above the floor with a good number', async () => {
    await getPhoneQueue(100, { floor: 60 })
    expect(spies.gte).toHaveBeenCalledWith('prospect.qualityScore', 60)
    expect(spies.notInArray).toHaveBeenCalledWith('prospect.phoneStatus', BAD)
  })

  it('Call Mode: hand-raisers and follow-ups bypass the floor, phone-first honours it — every bucket refuses a bad number', async () => {
    await getCallQueue({ floor: 70 })
    expect(spies.gte).toHaveBeenCalledTimes(1)
    expect(spies.gte).toHaveBeenCalledWith('prospect.qualityScore', 70)
    expect(spies.notInArray).toHaveBeenCalledTimes(3)
    for (const c of spies.notInArray.mock.calls) expect(c).toEqual(['prospect.phoneStatus', BAD])
  })

  it('the call list (hand-raisers) never applies the floor — the card refuses the dial instead', async () => {
    await getCallList()
    expect(spies.gte).not.toHaveBeenCalled()
  })

  it('the floor comes from config when the caller passes none', async () => {
    state.selectQueue.push([{ config: { qualityFloor: 75 } }]) // getProspectingConfig
    await getPhoneQueue(100)
    expect(spies.gte).toHaveBeenCalledWith('prospect.qualityScore', 75)
  })
})

describe('getQualityCounts', () => {
  it('reads the bands, the never-verified backlog, the dialable best, and buckets the histogram by 5', async () => {
    state.selectQueue.push([{ band: 'best', n: 3 }, { band: 'parked', n: 2 }])
    state.selectQueue.push([{ n: 7 }])
    state.selectQueue.push([{ n: 2 }])
    state.selectQueue.push([{ score: 82, n: 2 }, { score: 95, n: 1 }, { score: 0, n: 2 }, { score: 100, n: 1 }])
    const q = await getQualityCounts()
    expect(q).toMatchObject({ best: 3, good: 0, weak: 0, parked: 2, unverified: 7, bestInQueue: 2 })
    expect(q.scoreBuckets).toHaveLength(21)
    expect(q.scoreBuckets[16]).toBe(2) // 80–84
    expect(q.scoreBuckets[19]).toBe(1) // 95–99
    expect(q.scoreBuckets[0]).toBe(2)
    expect(q.scoreBuckets[20]).toBe(1) // 100
  })
})
