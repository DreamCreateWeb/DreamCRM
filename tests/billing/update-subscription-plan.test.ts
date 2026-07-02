import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * updateSubscriptionPlan — the in-place plan change for clinics that ALREADY
 * have a live subscription. Under test: Checkout is NEVER the path for an
 * existing subscriber (it would mint a second subscription and the old one
 * would keep billing); the existing subscription's plan item is price-swapped
 * with proration; dead/absent subscriptions fall through to Checkout (return
 * false); already-on-plan is a no-op update.
 */

const stripeMock = {
  subRetrieve: vi.fn(),
  subUpdate: vi.fn(),
}

const dbState = {
  profile: null as { stripeSubscriptionId: string | null; socialAddon?: number } | null,
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: (...a: unknown[]) => stripeMock.subRetrieve(...a),
      update: (...a: unknown[]) => stripeMock.subUpdate(...a),
    },
  },
}))

vi.mock('@/lib/stripe-config', () => {
  const PLANS = [
    { id: 'pro', name: 'Pro', priceIds: { monthly: 'price_pro_m', annual: 'price_pro_y' } },
    { id: 'premium', name: 'Premium', priceIds: { monthly: 'price_premium_m', annual: 'price_premium_y' } },
  ]
  // Real getPlanByPriceId returns a `{ plan, interval }` match object.
  const byPrice = new Map(PLANS.flatMap((p) => [
    [p.priceIds.monthly, { plan: p, interval: 'monthly' }],
    [p.priceIds.annual, { plan: p, interval: 'annual' }],
  ]))
  return {
    PLANS,
    getPlanByPriceId: (id: string) => byPrice.get(id),
    isSocialAddonPriceId: () => false,
  }
})

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => (dbState.profile ? [dbState.profile] : [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (set: Record<string, unknown>) => {
          dbState.updates.push(set)
          return { where: async () => undefined }
        },
      }),
    },
    schema,
  }
})

import { updateSubscriptionPlan } from '@/lib/services/billing'

function liveSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    metadata: { organizationId: 'org_1' },
    items: { data: [{ id: 'si_plan', price: { id: 'price_pro_m' } }] },
    ...overrides,
  }
}

beforeEach(() => {
  stripeMock.subRetrieve.mockReset()
  stripeMock.subUpdate.mockReset()
  dbState.profile = null
  dbState.updates = []
})

describe('updateSubscriptionPlan', () => {
  it('returns false (→ Checkout) when the clinic has no subscription', async () => {
    dbState.profile = { stripeSubscriptionId: null }
    const handled = await updateSubscriptionPlan({ organizationId: 'org_1', planId: 'premium', interval: 'monthly' })
    expect(handled).toBe(false)
    expect(stripeMock.subRetrieve).not.toHaveBeenCalled()
    expect(stripeMock.subUpdate).not.toHaveBeenCalled()
  })

  it('returns false when the subscription is dead (canceled)', async () => {
    dbState.profile = { stripeSubscriptionId: 'sub_1', socialAddon: 0 }
    stripeMock.subRetrieve.mockResolvedValue(liveSub({ status: 'canceled' }))
    const handled = await updateSubscriptionPlan({ organizationId: 'org_1', planId: 'premium', interval: 'monthly' })
    expect(handled).toBe(false)
    expect(stripeMock.subUpdate).not.toHaveBeenCalled()
  })

  it('swaps the plan item in place with proration — never a second subscription', async () => {
    dbState.profile = { stripeSubscriptionId: 'sub_1', socialAddon: 0 }
    // First retrieve: the current (pro) sub. After the update, the sync's
    // re-retrieve sees the swapped (premium) item — mirrors Stripe.
    stripeMock.subRetrieve
      .mockResolvedValueOnce(liveSub())
      .mockResolvedValue(liveSub({ items: { data: [{ id: 'si_plan', price: { id: 'price_premium_m' } }] } }))
    stripeMock.subUpdate.mockResolvedValue({})

    const handled = await updateSubscriptionPlan({ organizationId: 'org_1', planId: 'premium', interval: 'monthly' })

    expect(handled).toBe(true)
    expect(stripeMock.subUpdate).toHaveBeenCalledTimes(1)
    const [subId, params] = stripeMock.subUpdate.mock.calls[0] as [string, Record<string, unknown>]
    expect(subId).toBe('sub_1')
    expect(params.items).toEqual([{ id: 'si_plan', price: 'price_premium_m' }])
    expect(params.proration_behavior).toBe('create_prorations')
    // The tier is written immediately (sync ran) — the UI must not wait on
    // the webhook.
    expect(dbState.updates.some((u) => u.planTier === 'premium')).toBe(true)
  })

  it('is a no-op update when already on the target price (still returns true)', async () => {
    dbState.profile = { stripeSubscriptionId: 'sub_1', socialAddon: 0 }
    stripeMock.subRetrieve.mockResolvedValue(liveSub())
    const handled = await updateSubscriptionPlan({ organizationId: 'org_1', planId: 'pro', interval: 'monthly' })
    expect(handled).toBe(true)
    expect(stripeMock.subUpdate).not.toHaveBeenCalled()
  })
})
