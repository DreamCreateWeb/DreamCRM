import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Loyalty — the settings resolver clamps, the accrual sweep's idempotency
 * (unique-source inserts swallow duplicates) + demo skip, and redemption
 * (threshold guard, coupon mint, rollback when the mint fails).
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  deletes: 0,
  insertFail: null as null | ((table: string) => boolean),
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          const name = (table as { _n: string })._n
          if (state.insertFail?.(name)) throw new Error('duplicate key / boom')
          state.inserts.push({ table: name, values })
        },
      }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
      delete: () => ({ where: async () => { state.deletes++ } }),
    },
    schema: {
      clinicProfile: { organizationId: 'org', loyalty: 'loyalty' },
      organization: { id: 'id', isDemo: 'demo' },
      appointment: { id: 'id', organizationId: 'org', patientId: 'pid', status: 's', completedAt: 'c' },
      patient: { id: 'id', organizationId: 'org', referredByPatientId: 'ref', firstName: 'fn' },
      patientBalancePayment: { id: 'id', organizationId: 'org', patientId: 'pid', status: 's', paidAt: 'p' },
      loyaltyEvent: { _n: 'loyalty_event', id: 'id', organizationId: 'org', patientId: 'pid', points: 'pts', kind: 'k', createdAt: 'c', note: 'n' },
      shopCoupon: { _n: 'shop_coupon' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})), eq: vi.fn(() => ({})), gte: vi.fn(() => ({})),
  desc: vi.fn(() => ({})), isNotNull: vi.fn(() => ({})),
  sql: Object.assign((..._a: unknown[]) => ({}), { raw: () => ({}) }),
}))

import { resolveLoyaltySettings, LOYALTY_DEFAULTS } from '@/lib/types/loyalty'
import { runLoyaltyAccrual, redeemLoyaltyPoints, adjustLoyaltyPoints } from '@/lib/services/loyalty'

const ENABLED = { enabled: true, pointsPerVisit: 10, pointsPerReferral: 50, pointsPerPayment: 10, redeemPoints: 100, redeemValueCents: 1000 }

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.deletes = 0
  state.insertFail = null
  vi.clearAllMocks()
})

describe('resolveLoyaltySettings', () => {
  it('defaults OFF and clamps junk', () => {
    expect(resolveLoyaltySettings(null)).toEqual(LOYALTY_DEFAULTS)
    const r = resolveLoyaltySettings({ enabled: true, pointsPerVisit: -5, redeemPoints: 2, redeemValueCents: 9_999_999 })
    expect(r.enabled).toBe(true)
    expect(r.pointsPerVisit).toBe(0)
    expect(r.redeemPoints).toBe(10) // floor
    expect(r.redeemValueCents).toBe(100_000) // ceiling
  })
})

describe('runLoyaltyAccrual', () => {
  it('earns once per source — duplicate inserts are swallowed, not fatal', async () => {
    state.selectQueue.push([{ organizationId: 'org_1', loyalty: ENABLED }]) // profiles
    state.selectQueue.push([{ isDemo: false }]) // org
    state.selectQueue.push([
      { id: 'appt_1', patientId: 'p1' },
      { id: 'appt_2', patientId: 'p2' }, // will collide (already earned)
    ]) // visits
    state.selectQueue.push([]) // referrals
    state.selectQueue.push([]) // payments
    state.insertFail = () => {
      // Fail exactly the second loyalty insert (appt_2 = already earned).
      return state.inserts.length === 1
    }

    const r = await runLoyaltyAccrual({ now: new Date('2026-07-02T12:00:00Z') })
    expect(r).toEqual({ orgsScanned: 1, earned: 1 })
    expect(state.inserts[0].values).toMatchObject({ kind: 'visit', points: 10, sourceId: 'appt_1' })
  })

  it('skips demo orgs entirely', async () => {
    state.selectQueue.push([{ organizationId: 'org_demo', loyalty: ENABLED }])
    state.selectQueue.push([{ isDemo: true }])
    const r = await runLoyaltyAccrual({ now: new Date('2026-07-02T12:00:00Z') })
    expect(r).toEqual({ orgsScanned: 0, earned: 0 })
    expect(state.inserts).toHaveLength(0)
  })

  it('credits the REFERRER when their friend completes a first visit', async () => {
    state.selectQueue.push([{ organizationId: 'org_1', loyalty: { ...ENABLED, pointsPerVisit: 0, pointsPerPayment: 0 } }])
    state.selectQueue.push([{ isDemo: false }])
    state.selectQueue.push([{ id: 'p_emma', referredByPatientId: 'p_sophia', firstName: 'Emma' }]) // referrals join
    const r = await runLoyaltyAccrual({ now: new Date('2026-07-02T12:00:00Z') })
    expect(r.earned).toBe(1)
    expect(state.inserts[0].values).toMatchObject({
      patientId: 'p_sophia', // the referrer earns
      kind: 'referral',
      points: 50,
      sourceId: 'p_emma',
    })
  })
})

describe('redeemLoyaltyPoints', () => {
  it('below the threshold → friendly error, nothing written', async () => {
    state.selectQueue.push([{ loyalty: ENABLED }]) // settings
    state.selectQueue.push([{ total: 60 }]) // balance
    const r = await redeemLoyaltyPoints('org_1', 'p1')
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('100 points') })
    expect(state.inserts).toHaveLength(0)
  })

  it('redeems: negative ledger row + a patient-bound single-use coupon', async () => {
    state.selectQueue.push([{ loyalty: ENABLED }])
    state.selectQueue.push([{ total: 130 }])
    const r = await redeemLoyaltyPoints('org_1', 'p1')
    expect(r).toMatchObject({ ok: true, valueCents: 1000, newBalance: 30 })
    const ledger = state.inserts.find((i) => i.table === 'loyalty_event')
    expect(ledger!.values).toMatchObject({ kind: 'redeem', points: -100 })
    const coupon = state.inserts.find((i) => i.table === 'shop_coupon')
    expect(coupon!.values).toMatchObject({
      patientId: 'p1',
      source: 'loyalty',
      singleUse: 1,
      discountType: 'amount',
      discountValue: 1000,
    })
    if (r.ok) expect(coupon!.values.code).toBe(r.couponCode)
  })

  it('rolls the ledger row back when the coupon mint fails (points never burn silently)', async () => {
    state.selectQueue.push([{ loyalty: ENABLED }])
    state.selectQueue.push([{ total: 130 }])
    state.insertFail = (table) => table === 'shop_coupon'
    const r = await redeemLoyaltyPoints('org_1', 'p1')
    expect(r).toMatchObject({ ok: false })
    expect(state.deletes).toBe(1) // the negative row was removed
  })

  it('disabled program → no redemption', async () => {
    state.selectQueue.push([{ loyalty: { ...ENABLED, enabled: false } }])
    const r = await redeemLoyaltyPoints('org_1', 'p1')
    expect(r).toMatchObject({ ok: false })
  })
})

describe('adjustLoyaltyPoints', () => {
  it('requires a nonzero delta and a note', async () => {
    expect(await adjustLoyaltyPoints('o', 'p', 0, 'x', 'u')).toMatchObject({ ok: false })
    expect(await adjustLoyaltyPoints('o', 'p', 50, '   ', 'u')).toMatchObject({ ok: false })
    expect(state.inserts).toHaveLength(0)
  })

  it('writes the adjust row and returns the fresh balance', async () => {
    state.selectQueue.push([{ total: 90 }]) // post-insert balance
    const r = await adjustLoyaltyPoints('org_1', 'p1', 40, 'Welcome bonus', 'user_1')
    expect(r).toEqual({ ok: true, newBalance: 90 })
    expect(state.inserts[0].values).toMatchObject({ kind: 'adjust', points: 40, createdByUserId: 'user_1' })
  })
})
