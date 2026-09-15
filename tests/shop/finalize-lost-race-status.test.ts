import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * What `finalizeOrderFromSession` REPORTS when it loses the claim race.
 *
 * The finalizer claims an order with a compare-and-swap and only the winner
 * runs the side-effects. The loser used to return `{ ...order, status:
 * 'paid' }` unconditionally, which was accurate while the only way to lose the
 * claim was another writer setting 'paid'.
 *
 * The claim predicate is now the POSITIVE `status = 'pending'` (the old
 * `ne(status, 'paid')` had to be widened by hand for every new status value
 * and was already letting 'cancelled' through). So a CANCELLED order whose
 * Stripe session still reads paid loses the claim too — and
 * `app/site/[slug]/shop/success/page.tsx` renders its headline straight off
 * this status: "Thank you — your order is confirmed!" for an order that is
 * not. Nothing is written and no money moves; the whole defect is what the
 * shopper is told.
 *
 * What these pin:
 *
 *  1. A lost race reports the row's REAL status, whatever it is.
 *  2. Winning the race still reports 'paid' — the fix must not cost the
 *     common case its answer.
 *  3. The re-read is scoped to the organization, like every other read here.
 *  4. A row that has gone missing falls back to what we read on the way in,
 *     never to 'paid'.
 *
 * RELEASE.md Part 5 · `shop-checkout.ts` lost-race branch.
 */

const state = {
  order: null as Record<string, unknown> | null,
  /** Row sets for the selects AFTER the order lookup (shop_config, items, ...). */
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ set: Record<string, unknown>; where: unknown }>,
  /** Every condition the re-read after a lost claim was built from. */
  whereConds: [] as Array<Record<string, unknown>>,
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
  // queue (the connected-account config, the patient match, the re-read).
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
    obj.where = (w: unknown) => {
      const walk = (v: unknown) => {
        if (!v || typeof v !== 'object') return
        const o = v as Record<string, unknown>
        if (o._kind === 'eq') state.whereConds.push(o)
        if (Array.isArray(o.conds)) o.conds.forEach(walk)
      }
      walk(w)
      return obj
    }
    obj.limit = async () => next()
    obj.then = (res: (v: unknown) => void) => res(next())
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
              // predicate does not match the row matches NO rows.
              return claimMatches(where) ? [{ id: 'order_1' }] : []
            }
            return p
          },
        }),
      }),
      insert: () => ({ values: async () => undefined }),
      transaction: async () => [],
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
  lte: vi.fn(() => ({})),
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
        // A cancellation does NOT change a session's payment_status — this is
        // why the finalizer gets as far as the claim at all.
        retrieve: async () => ({
          payment_status: 'paid',
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
  markCouponUsed: vi.fn(async () => undefined),
  releaseSingleUseCoupon: vi.fn(async () => undefined),
  claimSingleUseCoupon: vi.fn(async () => []),
  validateCoupon: vi.fn(async () => null),
}))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn(async () => undefined) }))
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
    couponId: null,
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

/** config lookup, patient-by-email lookup, then whatever the re-read finds. */
function queue(reread: unknown[]) {
  return [ACTIVE_CONFIG, [], reread]
}

beforeEach(async () => {
  const dbm = (await import('@/lib/db')) as unknown as { db: { __resetSelects: () => void } }
  dbm.db.__resetSelects()
  state.order = null
  state.selectQueue = []
  state.updates = []
  state.whereConds = []
})

describe('finalizeOrderFromSession — the claim race it lost', () => {
  it('a CANCELLED order is never reported as paid', async () => {
    // The row on disk is 'cancelled', so the `status = 'pending'` claim
    // matches nothing and this finalize is the loser.
    state.order = order({ status: 'cancelled' })
    state.selectQueue = queue([{ status: 'cancelled', patientId: null }])

    const out = await finalizeOrderFromSession('org_1', 'cs_1')

    // The success page renders "your order is confirmed!" off exactly this.
    expect(out?.status).toBe('cancelled')
    // ...and it really was the lost-race branch: nothing was written.
    expect(state.updates.filter((u) => u.set.status === 'paid').every((u) => !claimMatches(u.where))).toBe(true)
  })

  it('reports whatever the row actually says, not a fixed answer', async () => {
    for (const status of ['cancelled', 'refunded', 'pending']) {
      const dbm = (await import('@/lib/db')) as unknown as { db: { __resetSelects: () => void } }
      dbm.db.__resetSelects()
      state.order = order({ status: 'cancelled' })
      state.selectQueue = queue([{ status, patientId: null }])
      const out = await finalizeOrderFromSession('org_1', 'cs_1')
      expect(out?.status, status).toBe(status)
    }
  })

  it('carries the winner’s patient link through', async () => {
    state.order = order({ status: 'cancelled' })
    state.selectQueue = queue([{ status: 'cancelled', patientId: 'pat_9' }])

    const out = await finalizeOrderFromSession('org_1', 'cs_1')

    expect(out?.patientId).toBe('pat_9')
  })

  it('re-reads inside the organization, by order id', async () => {
    state.order = order({ status: 'cancelled' })
    state.selectQueue = queue([{ status: 'cancelled', patientId: null }])

    await finalizeOrderFromSession('org_1', 'cs_1')

    // The last WHERE built is the re-read's.
    const tail = state.whereConds.slice(-2)
    expect(tail.map((c) => [String(c.col), c.val])).toEqual([
      ['shopOrder.organizationId', 'org_1'],
      ['shopOrder.id', 'order_1'],
    ])
  })

  it('a row that vanished falls back to what we read on the way in, not to paid', async () => {
    state.order = order({ status: 'cancelled' })
    state.selectQueue = queue([])

    const out = await finalizeOrderFromSession('org_1', 'cs_1')

    expect(out?.status).toBe('cancelled')
  })

  it('WINNING the race still reports paid', async () => {
    // The row is 'pending', so the claim matches and this finalize wins.
    state.order = order({ status: 'pending' })
    state.selectQueue = [ACTIVE_CONFIG, [], []]

    const out = await finalizeOrderFromSession('org_1', 'cs_1')

    expect(out?.status).toBe('paid')
  })
})
