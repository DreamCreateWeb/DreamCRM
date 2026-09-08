import { describe, it, expect, vi, beforeEach } from 'vitest'

// House chain mock (acquisition-service.test.ts pattern). getDialsReport's
// select order: spend rows → signup rows. insert() records the upsert.
const state: {
  selectQueue: unknown[][]
  inserts: { values: unknown; conflict: unknown }[]
} = { selectQueue: [], inserts: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.groupBy = () => obj
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (v: unknown) => ({
          onConflictDoUpdate: async (c: { target: unknown }) => {
            state.inserts.push({ values: v, conflict: c.target })
          },
        }),
      }),
    },
  }
})

import { getDialsReport, recordSpend } from '@/lib/services/marketing-spend'

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
})

const NOW = new Date('2026-09-08T12:00:00Z')

describe('recordSpend', () => {
  it('stores a valid month × channel figure', async () => {
    const res = await recordSpend({ month: '2026-09', channel: 'google_ads', amountCents: 1000_00, note: '  set A ' })
    expect(res.ok).toBe(true)
    expect(state.inserts[0].values).toMatchObject({
      month: '2026-09',
      channel: 'google_ads',
      amountCents: 1000_00,
      note: 'set A',
    })
  })

  it('rejects junk without touching the DB — month, channel, amount all validated', async () => {
    expect((await recordSpend({ month: '2026-13', channel: 'google_ads', amountCents: 100 })).ok).toBe(false)
    expect((await recordSpend({ month: 'sept', channel: 'google_ads', amountCents: 100 })).ok).toBe(false)
    expect((await recordSpend({ month: '2026-09', channel: 'billboards', amountCents: 100 })).ok).toBe(false)
    expect((await recordSpend({ month: '2026-09', channel: 'google_ads', amountCents: -5 })).ok).toBe(false)
    expect((await recordSpend({ month: '2026-09', channel: 'google_ads', amountCents: NaN })).ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
  })
})

describe('getDialsReport', () => {
  it('joins recorded spend with signup cohorts by UTC month and grades paid like the billing wall', async () => {
    state.selectQueue.push([
      { month: '2026-06', channel: 'google_ads', amountCents: 1500_00, note: null },
    ])
    state.selectQueue.push([
      // June cohort: one paying (active + sub id), one trial-only, one untracked paying.
      {
        createdAt: new Date('2026-06-10T12:00:00Z'),
        attribution: { channel: 'google_ads', landing: '/', firstSeenAt: '2026-06-01T00:00:00.000Z' },
        subscriptionStatus: 'active',
        stripeSubscriptionId: 'sub_1',
      },
      {
        createdAt: new Date('2026-06-12T12:00:00Z'),
        attribution: { channel: 'google_ads', landing: '/', firstSeenAt: '2026-06-02T00:00:00.000Z' },
        subscriptionStatus: null,
        stripeSubscriptionId: null,
      },
      {
        createdAt: new Date('2026-06-20T12:00:00Z'),
        attribution: null,
        subscriptionStatus: 'active',
        stripeSubscriptionId: 'sub_2',
      },
    ])
    const report = await getDialsReport(NOW)
    const june = report.assessment.months.find((m) => m.month === '2026-06')!
    expect(june).toMatchObject({ spendCents: 1500_00, trials: 3, paying: 2, cacCents: 750_00, mature: true })
    expect(report.assessment.recommendation).toBe('dial_up')
    expect(report.spendRows).toEqual([
      { month: '2026-06', channel: 'google_ads', amountCents: 1500_00, note: null },
    ])
  })

  it('a spend row on an unknown channel is dropped, never a crash or a phantom channel', async () => {
    state.selectQueue.push([{ month: '2026-06', channel: 'billboards', amountCents: 900_00, note: null }])
    state.selectQueue.push([])
    const report = await getDialsReport(NOW)
    expect(report.spendRows).toHaveLength(0)
    expect(report.assessment.recommendation).toBe('no_spend')
  })

  it('empty everything reads as step one', async () => {
    state.selectQueue.push([], [])
    const report = await getDialsReport(NOW)
    expect(report.assessment.recommendation).toBe('no_spend')
  })
})
