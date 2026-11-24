import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * WHO IS CHARGED TODAY, AND WHO GETS FOURTEEN DAYS FIRST.
 *
 * Owner ruling 2026-11-23: the free trial is 14 days and a card is required
 * to sign up. The whole ruling lands in two places in `lib/services/billing.ts`
 * and this file holds both:
 *
 *  1. `createCheckoutSession` — a signup that has not added its card gets
 *     `subscription_data.trial_period_days`, so Stripe takes the card, charges
 *     nothing, and bills the plan itself when the trial ends. EVERY OTHER
 *     clinic reaching Checkout is charged on completion. The dangerous
 *     mistakes are both directions: a second free trial for a clinic that
 *     cancelled, and — worse — no trial for a signup the card step just told
 *     "nothing is charged today".
 *
 *  2. `syncSubscriptionFromStripe` — a Stripe trial's end date is mirrored
 *     into `trial_ends_at`, so the countdown, the pre-charge emails and
 *     Settings → Billing quote the day the card is actually charged.
 *
 * Stripe and the database are mocked: what is asserted is the REQUEST we
 * build and the ROW we write, which is all of this that is ours.
 */

const state = {
  profile: null as { subscriptionStatus: string | null; stripeCustomerId: string | null } | null,
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const chain = () => {
    const api: Record<string, unknown> = {}
    api.from = () => api
    api.where = () => api
    api.limit = async () => (state.profile ? [{ ...state.profile, socialAddon: 0, planTier: 'premium' }] : [])
    return api
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(vals)
          },
        }),
      }),
    },
    schema: { clinicProfile },
  }
})

vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: vi.fn() },
    customers: { create: vi.fn(async () => ({ id: 'cus_new' })) },
    checkout: { sessions: { create: vi.fn(async () => ({ url: 'https://checkout.stripe.test/s' })) } },
  },
}))

vi.mock('@/lib/stripe-config', () => {
  const PLANS = [
    {
      id: 'premium',
      name: 'Premium',
      price: 1,
      annualPrice: 10,
      color: 'violet',
      features: [],
      priceIds: { monthly: 'price_premium_m', annual: 'price_premium_y' },
    },
  ]
  return {
    PLANS,
    getPlanByPriceId: (priceId: string) =>
      priceId === 'price_premium_m' ? { plan: PLANS[0], interval: 'monthly' } : undefined,
    isSocialAddonPriceId: () => false,
  }
})

vi.mock('@/lib/services/clinic-site-cache', () => ({
  invalidateClinicSiteForOrgUnlessRendering: vi.fn(async () => undefined),
}))

import { createCheckoutSession, checkoutReturnOf, syncSubscriptionFromStripe } from '@/lib/services/billing'
import { stripe } from '@/lib/stripe'
import { AWAITING_CARD_STATUS, TRIAL_DAYS, trialDaysAtCheckout } from '@/lib/trial'

const ARGS = {
  organizationId: 'org_1',
  email: 'owner@example.com',
  name: 'Maple Dental',
  planId: 'premium' as const,
  interval: 'monthly' as const,
}

type SessionParams = {
  success_url: string
  cancel_url: string
  payment_method_collection?: string
  subscription_data: { trial_period_days?: number; metadata: Record<string, string> }
}

/** The one Checkout request the call built. */
function sentToStripe(): SessionParams {
  const calls = vi.mocked(stripe.checkout.sessions.create).mock.calls
  expect(calls).toHaveLength(1)
  return calls[0][0] as unknown as SessionParams
}

beforeEach(() => {
  state.profile = null
  state.updates = []
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test'
})

describe('trialDaysAtCheckout — the table of who is charged today', () => {
  it('only a signup awaiting its card gets the trial days', () => {
    expect(trialDaysAtCheckout(AWAITING_CARD_STATUS)).toBe(TRIAL_DAYS)
  })

  it('everybody else is charged on completion', () => {
    // A no-card trial choosing its plan, a resubscribe after a cancel, a
    // dunning clinic, a legacy row with nothing in the column.
    for (const status of ['trialing', 'canceled', 'active', 'past_due', 'unpaid', 'incomplete', '', null, undefined]) {
      expect(trialDaysAtCheckout(status), `status ${String(status)}`).toBeNull()
    }
  })
})

describe('createCheckoutSession — the trial starts at the card step', () => {
  it('a signup awaiting its card: 14 trial days, and the card is REQUIRED though nothing is due', async () => {
    state.profile = { subscriptionStatus: AWAITING_CARD_STATUS, stripeCustomerId: 'cus_1' }
    await createCheckoutSession(ARGS)
    const sent = sentToStripe()
    expect(sent.subscription_data.trial_period_days).toBe(14)
    expect(sent.payment_method_collection).toBe('always')
    // The org metadata the webhook resolves the clinic by must survive the
    // new key sitting beside it.
    expect(sent.subscription_data.metadata).toMatchObject({ organizationId: 'org_1', planId: 'premium' })
  })

  it('a NO-card trial choosing its plan is charged now — it already had its free weeks', async () => {
    state.profile = { subscriptionStatus: 'trialing', stripeCustomerId: 'cus_1' }
    await createCheckoutSession(ARGS)
    const sent = sentToStripe()
    expect(sent.subscription_data).not.toHaveProperty('trial_period_days')
    expect(sent).not.toHaveProperty('payment_method_collection')
  })

  it('ONE TRIAL PER CLINIC: resubscribing after a cancel carries no second trial', async () => {
    // clearSubscription writes Stripe's 'canceled' over our 'awaiting_card',
    // so the status that grants the days cannot be reached twice.
    state.profile = { subscriptionStatus: 'canceled', stripeCustomerId: 'cus_1' }
    await createCheckoutSession(ARGS)
    expect(sentToStripe().subscription_data).not.toHaveProperty('trial_period_days')
  })

  it('FAILS CLOSED: with no profile row to read, no Checkout is opened at all', async () => {
    // The card step said "nothing is charged today". If we cannot read the
    // row that makes that true, a Checkout that charges today is the one
    // thing we must not create.
    state.profile = null
    await expect(createCheckoutSession(ARGS)).rejects.toThrow(/No clinic profile/)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(stripe.customers.create).not.toHaveBeenCalled()
  })
})

describe('createCheckoutSession — where Stripe sends the clinic back', () => {
  it('defaults to Settings → Billing, with the session id for the on-landing sync', async () => {
    state.profile = { subscriptionStatus: 'trialing', stripeCustomerId: 'cus_1' }
    await createCheckoutSession(ARGS)
    const sent = sentToStripe()
    expect(sent.success_url).toBe(
      'https://app.example.test/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    )
    expect(sent.cancel_url).toBe('https://app.example.test/settings/billing?checkout=cancelled')
  })

  it('the last signup step returns to onboarding, not to a billing page', async () => {
    state.profile = { subscriptionStatus: AWAITING_CARD_STATUS, stripeCustomerId: 'cus_1' }
    await createCheckoutSession({ ...ARGS, returnTo: 'onboarding' })
    const sent = sentToStripe()
    expect(sent.success_url).toBe(
      'https://app.example.test/onboarding-complete?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    )
    expect(sent.cancel_url).toBe('https://app.example.test/onboarding-complete?checkout=cancelled')
  })

  it('the destination is a NAME from a closed set — a URL or anything else falls back to billing', () => {
    // It arrives through a server action's arguments, which are client input.
    expect(checkoutReturnOf('onboarding')).toBe('onboarding')
    for (const bad of ['https://evil.example/x', '//evil.example', '/dashboard', 'billing', '', null, undefined, 7, {}]) {
      expect(checkoutReturnOf(bad), `value ${JSON.stringify(bad)}`).toBe('billing')
    }
  })
})

describe('syncSubscriptionFromStripe — the trial end date is Stripe’s', () => {
  const sub = (over: Record<string, unknown>) =>
    ({
      id: 'sub_1',
      customer: 'cus_1',
      metadata: { organizationId: 'org_1' },
      items: { data: [{ price: { id: 'price_premium_m' } }] },
      ...over,
    }) as never

  it('a trialing subscription writes its trial_end as trial_ends_at', async () => {
    state.profile = { subscriptionStatus: AWAITING_CARD_STATUS, stripeCustomerId: null }
    const trialEnd = Date.UTC(2026, 11, 7, 18, 0, 0) / 1000
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub({ status: 'trialing', trial_end: trialEnd }))
    await syncSubscriptionFromStripe('sub_1')
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({
      subscriptionStatus: 'trialing',
      stripeSubscriptionId: 'sub_1',
      planTier: 'premium',
      trialEndsAt: new Date(trialEnd * 1000),
    })
  })

  it('an ACTIVE subscription never touches trial_ends_at — a no-card trial that paid keeps its own history', async () => {
    state.profile = { subscriptionStatus: 'trialing', stripeCustomerId: 'cus_1' }
    // Stripe keeps reporting the old trial_end on an active subscription.
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      sub({ status: 'active', trial_end: Date.UTC(2026, 10, 1) / 1000 }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(state.updates[0]).not.toHaveProperty('trialEndsAt')
    expect(state.updates[0]).toMatchObject({ subscriptionStatus: 'active' })
  })

  it('a trialing subscription with no trial_end leaves the column alone rather than write an invalid date', async () => {
    state.profile = { subscriptionStatus: AWAITING_CARD_STATUS, stripeCustomerId: null }
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(sub({ status: 'trialing', trial_end: null }))
    await syncSubscriptionFromStripe('sub_1')
    expect(state.updates[0]).not.toHaveProperty('trialEndsAt')
  })
})
