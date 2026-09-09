import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createLockingDb, schemaProxy, type LockingDb, type StoredRow } from '../helpers/locking-db'

/**
 * Loyalty redemption must not double-spend.
 *
 * `redeemLoyaltyPoints` read the balance, then wrote the negative ledger row as
 * a separate statement. A patient sitting on exactly one reward's worth of
 * points who double-taps "Redeem" in the portal (or has it open on a phone and
 * a laptop) fires two requests that BOTH read the pre-spend balance and BOTH
 * mint a coupon — two rewards off one balance, ledger driven negative, real
 * money out of the clinic's till.
 *
 * The fix serializes the read and the write with the same per-entity
 * `pg_advisory_xact_lock` idiom the booking path uses against double-booking.
 * These tests run the two requests through a db fake that models transaction
 * isolation + real advisory locking (tests/helpers/locking-db.ts), so the race
 * genuinely interleaves: without the lock the second request sees the stale
 * balance, with it the second request waits and sees the spent one.
 */

const REDEEM_POINTS = 100
const REDEEM_VALUE_CENTS = 1_000

let fake: LockingDb

vi.mock('@/lib/db', () => ({
  get db() {
    return fake.db
  },
  schema: schemaProxy(),
}))

import { redeemLoyaltyPoints } from '@/lib/services/loyalty'

/** Sum the points ledger the way the service's balance query does. */
function resolve(table: string, rows: StoredRow[]): unknown[] {
  if (table === 'clinic_profile') {
    return [{ loyalty: { enabled: true, redeemPoints: REDEEM_POINTS, redeemValueCents: REDEEM_VALUE_CENTS } }]
  }
  if (table === 'loyalty_event') {
    const total = rows.reduce((s, r) => s + Number(r.points ?? 0), 0)
    return [{ total }]
  }
  return []
}

function seedPoints(points: number) {
  fake.store.set('loyalty_event', [{ id: 'loy_seed', points, kind: 'visit' }])
}

/** Make the coupon INSERT throw, leaving the ledger row already written. */
function failCouponInsert() {
  const handle = fake.db as { transaction: (cb: (tx: any) => Promise<unknown>) => Promise<unknown> }
  const inner = handle.transaction.bind(handle)
  handle.transaction = (cb) =>
    inner((tx) =>
      cb({
        ...tx,
        insert: (t: unknown) =>
          (t as Record<symbol, unknown>)[Symbol.for('drizzle:Name')] === 'shop_coupon'
            ? { values: async () => { throw new Error('duplicate coupon code') } }
            : tx.insert(t),
      }),
    )
}

beforeEach(() => {
  fake = createLockingDb({ resolve })
})

describe('redeemLoyaltyPoints — concurrency', () => {
  it('two simultaneous redemptions on one reward mint exactly one coupon', async () => {
    seedPoints(REDEEM_POINTS) // exactly enough for ONE reward

    const [a, b] = await Promise.all([
      redeemLoyaltyPoints('org_1', 'pat_1'),
      redeemLoyaltyPoints('org_1', 'pat_1'),
    ])

    const wins = [a, b].filter((r) => r.ok)
    expect(wins).toHaveLength(1)
    expect(fake.rows('shop_coupon')).toHaveLength(1)

    // The loser is told why, in the patient's own words.
    const loser = [a, b].find((r) => !r.ok)!
    expect(loser.ok).toBe(false)
    expect('error' in loser && loser.error).toMatch(/points to redeem/)
  })

  it('never drives the points balance negative', async () => {
    seedPoints(REDEEM_POINTS)
    await Promise.all([
      redeemLoyaltyPoints('org_1', 'pat_1'),
      redeemLoyaltyPoints('org_1', 'pat_1'),
      redeemLoyaltyPoints('org_1', 'pat_1'),
    ])
    const balance = fake.rows('loyalty_event').reduce((s, r) => s + Number(r.points ?? 0), 0)
    expect(balance).toBe(0)
    expect(balance).toBeGreaterThanOrEqual(0)
    expect(fake.rows('shop_coupon')).toHaveLength(1)
  })

  it('takes a per-patient lock, so a different patient is never blocked by it', async () => {
    seedPoints(REDEEM_POINTS)
    await redeemLoyaltyPoints('org_1', 'pat_1')
    expect(fake.locksTaken).toContain('loyalty:org_1:pat_1')
  })

  it('lets three redemptions through when the balance covers three', async () => {
    seedPoints(REDEEM_POINTS * 3)
    const results = await Promise.all([
      redeemLoyaltyPoints('org_1', 'pat_1'),
      redeemLoyaltyPoints('org_1', 'pat_1'),
      redeemLoyaltyPoints('org_1', 'pat_1'),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(3)
    expect(fake.rows('shop_coupon')).toHaveLength(3)
  })

  it('mints coupons with distinct codes', async () => {
    seedPoints(REDEEM_POINTS * 2)
    await Promise.all([redeemLoyaltyPoints('org_1', 'pat_1'), redeemLoyaltyPoints('org_1', 'pat_1')])
    const codes = fake.rows('shop_coupon').map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('redeemLoyaltyPoints — single-request behaviour is unchanged', () => {
  it('spends the points and mints a patient-bound single-use coupon', async () => {
    seedPoints(250)
    const res = await redeemLoyaltyPoints('org_1', 'pat_1')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.valueCents).toBe(REDEEM_VALUE_CENTS)
    expect(res.newBalance).toBe(150)
    expect(res.couponCode).toMatch(/^REWARD-/)

    const [coupon] = fake.rows('shop_coupon')
    expect(coupon).toMatchObject({
      organizationId: 'org_1',
      patientId: 'pat_1',
      code: res.couponCode,
      discountType: 'amount',
      discountValue: REDEEM_VALUE_CENTS,
      source: 'loyalty',
      singleUse: 1,
    })

    const [, spend] = fake.rows('loyalty_event')
    expect(spend).toMatchObject({ kind: 'redeem', points: -REDEEM_POINTS })
  })

  it('refuses below the threshold and writes nothing', async () => {
    seedPoints(REDEEM_POINTS - 1)
    const res = await redeemLoyaltyPoints('org_1', 'pat_1')
    expect(res.ok).toBe(false)
    expect(fake.rows('loyalty_event')).toHaveLength(1) // just the seed
    expect(fake.rows('shop_coupon')).toHaveLength(0)
  })

  it('burns no points when the coupon mint fails (the whole thing rolls back)', async () => {
    seedPoints(REDEEM_POINTS)
    failCouponInsert()

    const res = await redeemLoyaltyPoints('org_1', 'pat_1')
    expect(res.ok).toBe(false)
    // The negative ledger row went down with the transaction — the patient's
    // points are still on the card, no compensating delete required.
    expect(fake.rows('loyalty_event')).toHaveLength(1)
    expect(fake.rows('shop_coupon')).toHaveLength(0)
  })
})
