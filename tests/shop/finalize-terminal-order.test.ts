import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A REFUNDED order must never be finalized back to paid.
 *
 * `finalizeOrderFromSession` runs from `app/site/[slug]/shop/success/page.tsx`
 * on EVERY load — an unauthenticated GET the shopper keeps in their browser
 * history — and from the Connect webhook, which Stripe can redeliver. A
 * Stripe refund does NOT change the Checkout Session's `payment_status`, so
 * that session still reads 'paid' forever.
 *
 * Before this guard, reopening that page after a refund ran the whole
 * finalize path again: the order was written back to 'paid', `paidAt` was
 * reset (losing the real paid time), a single-use coupon was burned a second
 * time, tracked stock was decremented a second time, and the clinic got a
 * second "Paid order" alert for money it had just sent back — next to a
 * non-zero refunded amount, so the record disagreed with itself.
 *
 * Found by Sentinel reviewing DREAMCRM-23 #528.
 */

const state = {
  order: null as Record<string, unknown> | null,
  /** Row sets for the selects AFTER the order lookup (shop_config, items, ...). */
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ set: Record<string, unknown>; where: unknown }>,
  couponBurns: 0,
  inventoryRuns: 0,
  notifies: 0,
  sessionPaymentStatus: 'paid',
}

/** Does this UPDATE's status predicate actually match the row on disk? */
function claimMatches(where: unknown): boolean {
  const status = String(state.order?.status ?? '')
  const conds: Array<Record<string, unknown>> = []
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o._kind === 'eq' || o._kind === 'ne') conds.push(o)
    if (Array.isArray(o.conds)) o.conds.forEach(walk)
  }
  walk(where)
  for (const c of conds) {
    if (!String(c.col).endsWith('.status')) continue
    if (c._kind === 'eq' && c.val !== status) return false
    if (c._kind === 'ne' && c.val === status) return false
  }
  return true
}

vi.mock('@/lib/db', () => {
  // The FIRST select is the order lookup; everything after it comes off the
  // queue (the connected-account config, the order items, ...).
  let first = true
  const next = () => {
    if (first) {
      first = false
      return state.order ? [state.order] : []
    }
    return state.selectQueue.shift() ?? []
  }
  const chain = () => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'leftJoin', 'innerJoin', 'orderBy']) obj[m] = () => obj
    obj.where = () => obj
    obj.limit = async () => next()
    obj.then = (res: (v: unknown) => void) => res(next())
    obj.__reset = () => {
      first = true
    }
    return obj
  }
  return {
    db: {
      select: () => chain(),
      __resetSelects: () => {
        first = true
      },
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: (where: unknown) => {
            const p = Promise.resolve(undefined) as Promise<unknown> & {
              returning?: () => Promise<unknown>
            }
            p.returning = async () => {
              state.updates.push({ set, where })
              // Model the compare-and-swap for real: a claim whose status
              // predicate does not match the row matches NO rows. Returning
              // a row unconditionally would let a broken predicate look like
              // a working one.
              return claimMatches(where) ? [{ id: 'order_1' }] : []
            }
            return p
          },
        }),
      }),
      insert: () => ({ values: async () => undefined }),
      // Reaching the inventory helper at all is already the bug.
      transaction: async () => {
        state.inventoryRuns++
        return []
      },
    },
    schema: new Proxy(
      {},
      { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) },
    ),
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conds: unknown[]) => ({ _kind: 'and', conds })),
  or: vi.fn(() => ({})),
  eq: vi.fn((col: unknown, val: unknown) => ({ _kind: 'eq', col, val })),
  ne: vi.fn((col: unknown, val: unknown) => ({ _kind: 'ne', col, val })),
  isNull: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
  desc: vi.fn((x) => x),
  asc: vi.fn((x) => x),
  ilike: vi.fn(() => ({})),
  count: vi.fn(() => ({})),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        // A refund does NOT change a session's payment_status.
        retrieve: async () => ({
          payment_status: state.sessionPaymentStatus,
          payment_intent: 'pi_1',
          amount_total: 5_000,
          amount_subtotal: 5_000,
          total_details: {},
          customer_details: {},
        }),
      },
    },
  },
}))

vi.mock('@/lib/services/coupons', () => ({
  markCouponUsed: vi.fn(async () => {
    state.couponBurns++
  }),
  releaseSingleUseCoupon: vi.fn(async () => undefined),
  claimSingleUseCoupon: vi.fn(async () => []),
  validateCoupon: vi.fn(async () => null),
}))
vi.mock('@/lib/services/notifications', () => ({
  notifyOrgMembers: vi.fn(async () => {
    state.notifies++
  }),
}))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn(async () => undefined) }))
vi.mock('@/lib/contact-normalize', () => ({ normalizePhone: () => null, samePhone: () => false }))
vi.mock('@/lib/services/loyalty', () => ({ awardLoyaltyForOrder: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/pms/write-back', () => ({ queueCommLogWriteBack: vi.fn(() => ({ catch: () => undefined })) }))

import { finalizeOrderFromSession } from '@/lib/services/shop-checkout'

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'order_1',
    organizationId: 'org_1',
    email: 'a@x.com',
    phone: null,
    patientId: null,
    status: 'pending',
    fulfillmentType: 'pickup',
    couponId: 'coupon_1',
    subtotalCents: 5_000,
    shippingCents: 0,
    totalCents: 5_000,
    stripeCheckoutSessionId: 'cs_1',
    refundedAmountCents: 0,
    ...over,
  }
}

const ACTIVE_CONFIG = [
  { accountId: 'acct_1', status: 'active', charges: 1, platformFeeBps: 100, currency: 'usd' },
]

beforeEach(async () => {
  const dbm = (await import('@/lib/db')) as unknown as { db: { __resetSelects: () => void } }
  dbm.db.__resetSelects()
  state.order = null
  state.selectQueue = []
  state.updates = []
  state.couponBurns = 0
  state.inventoryRuns = 0
  state.notifies = 0
  state.sessionPaymentStatus = 'paid'
})

describe('finalizeOrderFromSession — terminal states', () => {
  it('a REFUNDED order is never written back to paid', async () => {
    state.order = order({ status: 'refunded', refundedAmountCents: 5_000, paidAt: new Date('2026-09-01') })
    // A live connected account and a paid session, so the ONLY thing that can
    // stop the finalize is the terminal-state guard under test.
    state.selectQueue = [ACTIVE_CONFIG, []]

    const out = await finalizeOrderFromSession('org_1', 'cs_1')

    expect(out?.status).toBe('refunded')
    // Nothing was written, so paidAt keeps the real paid time.
    expect(state.updates.map((u) => u.set.status)).not.toContain('paid')
    expect(state.updates).toEqual([])
  })

  it('...and burns no coupon, moves no stock, and tells the clinic nothing', async () => {
    state.order = order({ status: 'refunded', refundedAmountCents: 5_000 })
    state.selectQueue = [ACTIVE_CONFIG, []]

    await finalizeOrderFromSession('org_1', 'cs_1')

    expect(state.couponBurns).toBe(0)
    expect(state.inventoryRuns).toBe(0)
    expect(state.notifies).toBe(0)
  })

  it('an already-paid order is still a no-op (the guard this joined)', async () => {
    state.order = order({ status: 'paid' })
    state.selectQueue = [ACTIVE_CONFIG, []]
    const out = await finalizeOrderFromSession('org_1', 'cs_1')
    expect(out?.status).toBe('paid')
    expect(state.updates).toEqual([])
  })

  it('the race guard claims only a PENDING order', async () => {
    // The early return covers the sequential path; this predicate is what
    // holds under a race. A negative `ne(status,'paid')` let every other
    // value through and had to be widened by hand each time one was added.
    state.order = order({ status: 'pending' })
    state.selectQueue = [ACTIVE_CONFIG, []]

    await finalizeOrderFromSession('org_1', 'cs_1')

    const claim = state.updates.find((u) => u.set.status === 'paid')
    expect(claim, 'a pending order should still finalize').toBeDefined()
    const conds = (claim!.where as { conds: Array<{ _kind: string; col: unknown; val: unknown }> }).conds
    expect(
      conds.some((c) => c._kind === 'eq' && String(c.col).endsWith('.status') && c.val === 'pending'),
    ).toBe(true)
    expect(conds.some((c) => c._kind === 'ne')).toBe(false)
  })

  it('a CANCELLED order cannot be claimed either — the same hole', async () => {
    // 'cancelled' was already falling through the old negative predicate;
    // 'refunded' just made it a state every refund reaches. The positive
    // predicate closes both at once, so the claim matches nothing and none
    // of the downstream side effects run.
    state.order = order({ status: 'cancelled' })
    state.selectQueue = [ACTIVE_CONFIG, []]

    await finalizeOrderFromSession('org_1', 'cs_1')

    expect(state.couponBurns).toBe(0)
    expect(state.inventoryRuns).toBe(0)
    expect(state.notifies).toBe(0)
  })
})
