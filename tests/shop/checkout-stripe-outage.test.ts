import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

/**
 * Checkout during a Stripe outage — shop + membership.
 *
 * Both paths write the sale into OUR database BEFORE it exists at Stripe: the
 * shop inserts a 'pending' order (and reserves any single-use promo code to
 * it), membership inserts a 'pending' row. When the Stripe call then fails —
 * an outage is exactly this — the half-finished sale used to stay behind:
 *
 *   - a phantom 'pending' order in the clinic's Orders list, looking real;
 *   - the shopper's one-time promo code locked to that dead order for the full
 *     24h COUPON_RESERVATION_TTL_MS, reading "already used" on every retry;
 *   - a pending membership blocking a re-join for PENDING_REJOIN_WINDOW_MS, so
 *     the patient is told "you already have a join in progress" for an hour.
 *
 * These tests drive a real Stripe failure through both services and pin the
 * rollback AND its scope — the scope is the load-bearing half, because a
 * cleanup that reached one row too far would delete a real sale.
 */

const state = {
  selectQueue: [] as unknown[][],
  claimResult: [] as unknown[],
  deleteReturn: [] as Array<{ id: string }>,
  deleteCount: 0,
  updateCount: 0,
  stripeFailsWith: null as Error | null,
  insertFailsWith: null as Error | null,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy', 'for']) {
      obj[m] = () => obj
    }
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: async () => {
          if (state.insertFailsWith) throw state.insertFailsWith
        },
      }),
      update: () => ({
        set: () => ({
          where: () => {
            state.updateCount++
            const p = Promise.resolve(undefined) as Promise<unknown> & { returning?: () => Promise<unknown> }
            p.returning = async () => state.claimResult
            return p
          },
        }),
      }),
      delete: () => ({
        where: () => {
          state.deleteCount++
          return { returning: async () => state.deleteReturn }
        },
      }),
    },
    // schema.<table>.<column> resolves to the bare column name, so the
    // captured conditions can be read back by the column they scope on.
    schema: new Proxy({}, {
      get: () => new Proxy({}, { get: (_t, col) => String(col) }),
    }),
  }
})

// Capture the condition primitives so the DELETE's scope can be asserted.
const eqCalls: Array<{ col: unknown; val: unknown }> = []
const isNullCols: unknown[] = []
const sqlFragments: string[] = []

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conds: unknown[]) => ({ _kind: 'and', conds })),
  or: vi.fn((...conds: unknown[]) => ({ _kind: 'or', conds })),
  eq: vi.fn((col: unknown, val: unknown) => {
    eqCalls.push({ col, val })
    return { _kind: 'eq', col, val }
  }),
  ne: vi.fn(() => ({ _kind: 'ne' })),
  lt: vi.fn(() => ({ _kind: 'lt' })),
  gte: vi.fn(() => ({ _kind: 'gte' })),
  isNull: vi.fn((col: unknown) => {
    isNullCols.push(col)
    return { _kind: 'isNull', col }
  }),
  isNotNull: vi.fn(() => ({ _kind: 'isNotNull' })),
  inArray: vi.fn(() => ({ _kind: 'inArray' })),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  count: vi.fn(() => ({ _kind: 'count' })),
  ilike: vi.fn(() => ({ _kind: 'ilike' })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const frag = strings.join('?')
      sqlFragments.push(frag)
      return { _kind: 'sql', frag, vals }
    },
    { raw: vi.fn() },
  ),
}))

vi.mock('@/lib/stripe', () => ({
  stripe: {
    coupons: { create: async () => ({ id: 'stripe_coupon_1' }) },
    checkout: {
      sessions: {
        create: async () => {
          if (state.stripeFailsWith) throw state.stripeFailsWith
          return { id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }
        },
      },
    },
    products: { create: async () => ({ id: 'prod_1' }) },
    prices: { create: async () => ({ id: 'price_1' }) },
  },
  subscriptionPeriodEnd: () => null,
}))
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn() }))
vi.mock('@/lib/utils', () => ({ slugify: (s: string) => s }))
vi.mock('@/lib/contact-normalize', () => ({ normalizePhone: () => null, samePhone: () => false }))

import { createShopCheckoutSession } from '@/lib/services/shop-checkout'
import { createMembershipCheckout } from '@/lib/services/membership'
import { releaseSingleUseCoupon } from '@/lib/services/coupons'

/** What the Stripe SDK actually throws when it can't reach Stripe. */
function stripeOutage(): Error {
  const err = new Error('An error occurred with our connection to Stripe. Request was retried 1 times.')
  err.name = 'StripeConnectionError'
  return err
}

const ACTIVE_CONFIG = {
  accountId: 'acct_1',
  status: 'active',
  charges: 1,
  shippingEnabled: 0,
  pickupEnabled: 1,
  flatShippingCents: 0,
  freeShippingThresholdCents: null,
  taxEnabled: 0,
  platformFeeBps: 100,
  currency: 'usd',
}

function variantRow(over: Record<string, unknown> = {}) {
  return {
    variantId: 'v1',
    priceCents: 5000,
    variantName: 'Default',
    inventoryQty: null,
    productId: 'p1',
    productName: 'Whitening Kit',
    productSlug: 'whitening-kit',
    status: 'active',
    ...over,
  }
}

function singleUseCoupon(over: Record<string, unknown> = {}) {
  return {
    id: 'coupon_1',
    code: 'BIRTHDAY',
    discountType: 'amount',
    discountValue: 500,
    active: 1,
    singleUse: 1,
    minSubtotalCents: null,
    expiresAt: null,
    usedAt: null,
    ...over,
  }
}

const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  state.selectQueue.length = 0
  state.claimResult = []
  state.deleteReturn = []
  state.deleteCount = 0
  state.updateCount = 0
  state.stripeFailsWith = null
  state.insertFailsWith = null
  eqCalls.length = 0
  isNullCols.length = 0
  sqlFragments.length = 0
  warn.mockClear()
})

afterAll(() => {
  warn.mockRestore()
})

// ── Shop ─────────────────────────────────────────────────────────────────────

describe('createShopCheckoutSession — Stripe outage', () => {
  it('deletes the pending order it had already written', async () => {
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow()])
    state.stripeFailsWith = stripeOutage()
    state.deleteReturn = [{ id: 'order_1' }]

    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 1 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
      }),
    ).rejects.toThrow(/connection to Stripe/)

    expect(state.deleteCount).toBe(1)
  })

  it('scopes that delete to an order still pending with NO Stripe session recorded', async () => {
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow()])
    state.stripeFailsWith = stripeOutage()
    state.deleteReturn = [{ id: 'order_1' }]

    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 1 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
      }),
    ).rejects.toThrow()

    // Tenant-scoped, and only ever a 'pending' row — a paid/refunded order can
    // never match.
    expect(eqCalls.some((c) => c.val === 'org_1')).toBe(true)
    expect(eqCalls.some((c) => c.val === 'pending')).toBe(true)
    // The boundary that makes this safe: we only delete an order we never
    // managed to attach a Stripe session to. Once a session id is recorded the
    // row is the local half of something that exists at Stripe.
    expect(isNullCols).toContain('stripeCheckoutSessionId')
  })

  it('hands a reserved single-use promo code back so a retry is not told it is used', async () => {
    // config → variant → the coupon lookup; the atomic claim then wins.
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow()], [singleUseCoupon()])
    state.claimResult = [{ id: 'coupon_1' }]
    state.stripeFailsWith = stripeOutage()
    state.deleteReturn = [{ id: 'order_1' }]

    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 1 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
        couponCode: 'BIRTHDAY',
      }),
    ).rejects.toThrow()

    // The release is an UPDATE clearing used_order_id. Two updates ran: the
    // claim, and the release.
    expect(state.updateCount).toBe(2)
    expect(eqCalls.some((c) => c.col === 'usedOrderId')).toBe(true)
    expect(isNullCols).toContain('usedAt')
  })

  it('hands the code back when the ORDER INSERT is what failed (nothing to delete)', async () => {
    // The claim runs BEFORE the order insert. If the insert is what blows up,
    // the delete matches nothing — and gating the release on "we deleted a row"
    // alone would leave the code locked for 24h via Postgres instead of Stripe.
    // The order-absent lookup is what closes that.
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow()], [singleUseCoupon()])
    state.claimResult = [{ id: 'coupon_1' }]
    state.insertFailsWith = new Error('relation "shop_order" does not exist')
    state.deleteReturn = []
    // The order-absent lookup finds nothing → the order was never written.
    state.selectQueue.push([])

    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 1 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
        couponCode: 'BIRTHDAY',
      }),
    ).rejects.toThrow(/shop_order/)

    // The claim, then the release.
    expect(state.updateCount).toBe(2)
    expect(eqCalls.some((c) => c.col === 'usedOrderId')).toBe(true)
  })

  it('does NOT hand the code back when the order was not actually removed', async () => {
    // The delete matched nothing — the order had already moved on. Giving the
    // code back here would free a discount that is still attached to a live
    // order.
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow()], [singleUseCoupon()])
    state.claimResult = [{ id: 'coupon_1' }]
    state.stripeFailsWith = stripeOutage()
    state.deleteReturn = []
    // ...and the order is still sitting there, so it was NOT ours to free.
    state.selectQueue.push([{ id: 'order_1' }])

    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 1 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
        couponCode: 'BIRTHDAY',
      }),
    ).rejects.toThrow()

    // Only the claim ran — no release.
    expect(state.updateCount).toBe(1)
  })

  it('still surfaces the original Stripe failure when the cleanup itself fails', async () => {
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow()])
    state.stripeFailsWith = stripeOutage()
    const dbDown = new Error('db is gone')
    state.deleteReturn = []
    // Make the cleanup's own delete blow up.
    Object.defineProperty(state, 'deleteReturn', {
      get() {
        throw dbDown
      },
      configurable: true,
    })

    await expect(
      createShopCheckoutSession('org_1', 'https://x', {
        items: [{ variantId: 'v1', qty: 1 }],
        fulfillmentType: 'pickup',
        email: 'a@x.com',
      }),
      // The patient must hear about the outage, not about our cleanup.
    ).rejects.toThrow(/connection to Stripe/)

    Object.defineProperty(state, 'deleteReturn', { value: [], writable: true, configurable: true })
    expect(warn).toHaveBeenCalled()
  })

  it('leaves the order alone on a successful checkout', async () => {
    state.selectQueue.push([ACTIVE_CONFIG], [variantRow()])

    const res = await createShopCheckoutSession('org_1', 'https://x', {
      items: [{ variantId: 'v1', qty: 1 }],
      fulfillmentType: 'pickup',
      email: 'a@x.com',
    })

    expect(res.url).toBe('https://checkout.stripe.test/cs_test_1')
    expect(state.deleteCount).toBe(0)
  })
})

// ── Membership ───────────────────────────────────────────────────────────────

const PLAN = {
  id: 'mplan_1',
  organizationId: 'org_1',
  name: 'Basic Care',
  slug: 'basic-care',
  status: 'active',
  billingInterval: 'monthly',
  priceCents: 3000,
  stripePriceId: 'price_1',
  stripeProductId: 'prod_1',
  benefits: [],
  discountPercent: 0,
  featured: 0,
  position: 0,
}

/** connectedAccountId → plan → patient email match → existing memberships → fee row. */
function membershipSelects(existingMemberships: unknown[] = []) {
  return [
    [{ accountId: 'acct_1', status: 'active', charges: 1 }],
    [PLAN],
    [{ id: 'pat_1' }],
    existingMemberships,
    [{ platformFeeBps: 100 }],
  ]
}

describe('createMembershipCheckout — Stripe outage', () => {
  it('deletes the pending membership so the patient is not locked out of retrying', async () => {
    state.selectQueue.push(...membershipSelects())
    state.stripeFailsWith = stripeOutage()

    await expect(
      createMembershipCheckout('org_1', 'https://x', { planSlug: 'basic-care', email: 'a@x.com' }),
    ).rejects.toThrow(/connection to Stripe/)

    // Without this the 'pending' row survives and PENDING_REJOIN_WINDOW_MS
    // answers the next attempt with "you already have a join in progress".
    expect(state.deleteCount).toBe(1)
  })

  it('scopes that delete to org + this exact membership + pending + no subscription', async () => {
    state.selectQueue.push(...membershipSelects())
    state.stripeFailsWith = stripeOutage()

    await expect(
      createMembershipCheckout('org_1', 'https://x', { planSlug: 'basic-care', email: 'a@x.com' }),
    ).rejects.toThrow()

    expect(eqCalls.some((c) => c.col === 'organizationId' && c.val === 'org_1')).toBe(true)
    expect(eqCalls.some((c) => c.col === 'id' && String(c.val).startsWith('mem_'))).toBe(true)
    expect(eqCalls.some((c) => c.col === 'status' && c.val === 'pending')).toBe(true)
    // A pending row that already carries a subscription is mid-activation —
    // the finalizer is about to flip it and it must never be swept.
    expect(sqlFragments.some((f) => /is null$/.test(f))).toBe(true)
  })

  it('leaves the membership alone on a successful join', async () => {
    state.selectQueue.push(...membershipSelects())

    const res = await createMembershipCheckout('org_1', 'https://x', {
      planSlug: 'basic-care',
      email: 'a@x.com',
    })

    expect(res.url).toBe('https://checkout.stripe.test/cs_test_1')
    expect(state.deleteCount).toBe(0)
  })
})

// ── The reservation release, on its own ──────────────────────────────────────

describe('releaseSingleUseCoupon', () => {
  it('clears only a reservation still held by THIS order and not yet burned', async () => {
    await releaseSingleUseCoupon('org_1', 'coupon_1', 'order_1')

    expect(eqCalls.some((c) => c.col === 'organizationId' && c.val === 'org_1')).toBe(true)
    expect(eqCalls.some((c) => c.col === 'id' && c.val === 'coupon_1')).toBe(true)
    // Still held by this order — if another checkout reclaimed the stale
    // reservation in the meantime, this matches nothing.
    expect(eqCalls.some((c) => c.col === 'usedOrderId' && c.val === 'order_1')).toBe(true)
    // Never un-burns a code a payment already consumed.
    expect(isNullCols).toContain('usedAt')
  })
})
