import { describe, it, expect, vi, beforeEach } from 'vitest'

interface UpdateCall {
  table: string
  set: Record<string, unknown>
  whereOrg: string | null
}

let updates: UpdateCall[] = []
let inserts: Array<{ table: string; values: unknown }> = []

const stubProfileByCustomer: { organizationId: string } | null = null
const stubs = {
  profileByCustomer: null as { organizationId: string } | null,
  profileBySubscription: null as { organizationId: string } | null,
  profileByOrg: null as { stripeCustomerId: string | null } | null,
}

// Read the column being eq'd on by inspecting the eq() result. Drizzle stores
// the column reference on the SQL chunk; we walk it to find a `.name` field.
function colNameFrom(clause: unknown): string | null {
  const seen = new Set<unknown>()
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (!v || typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (typeof obj.name === 'string' && typeof obj.columnType === 'string') return obj.name as string
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return null
}

// Read the literal value being eq'd against, similar walk for primitives.
function literalFrom(clause: unknown): string | null {
  const seen = new Set<unknown>()
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string') return v
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    // Drizzle param object: { value: '...', encoder: ... }
    if (typeof obj.value === 'string') return obj.value as string
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return null
}

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { billingProfiles } = await import('@/lib/db/schema/domain')

  // Per-select dispatch by the column we filtered on.
  const chain = () => {
    let filterCol: string | null = null
    const obj: any = {}
    obj.from = () => obj
    obj.where = (clause: unknown) => {
      filterCol = colNameFrom(clause)
      return obj
    }
    obj.limit = async () => {
      const stub =
        filterCol === 'stripe_subscription_id'
          ? stubs.profileBySubscription
          : filterCol === 'stripe_customer_id'
            ? stubs.profileByCustomer
            : stubs.profileByOrg
      return stub ? [stub] : []
    }
    return obj
  }

  return {
    db: {
      select: () => chain(),
      update: (table: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: async (clause: unknown) => {
            updates.push({
              table:
                table === clinicProfile
                  ? 'clinic_profile'
                  : table === billingProfiles
                    ? 'billing_profiles'
                    : 'unknown',
              set: vals,
              whereOrg: literalFrom(clause),
            })
          },
        }),
      }),
      insert: (table: unknown) => ({
        values: async (vals: unknown) => {
          inserts.push({
            table:
              table === clinicProfile
                ? 'clinic_profile'
                : table === billingProfiles
                  ? 'billing_profiles'
                  : 'unknown',
            values: vals,
          })
        },
      }),
    },
    schema: { clinicProfile, billingProfiles },
  }
})

vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: {
      retrieve: vi.fn(),
    },
    customers: {
      create: vi.fn(),
    },
    checkout: {
      sessions: { create: vi.fn() },
    },
    billingPortal: {
      sessions: { create: vi.fn() },
    },
  },
}))

vi.mock('@/lib/stripe-config', () => {
  const PLANS = [
    {
      id: 'basic',
      name: 'Basic',
      price: 99,
      annualPrice: 990,
      color: 'green',
      features: [],
      priceIds: { monthly: 'price_basic_m', annual: 'price_basic_y' },
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 149,
      annualPrice: 1490,
      color: 'sky',
      features: [],
      priceIds: { monthly: 'price_pro_m', annual: 'price_pro_y' },
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 199,
      annualPrice: 1990,
      color: 'violet',
      features: [],
      priceIds: { monthly: 'price_premium_m', annual: 'price_premium_y' },
    },
  ]
  const ADDON_PRICES = new Set([
    'price_social_pro_m',
    'price_social_pro_y',
    'price_social_premium_m',
    'price_social_premium_y',
  ])
  return {
    PLANS,
    getPlanByPriceId: (priceId: string) => {
      for (const plan of PLANS) {
        if (plan.priceIds.monthly === priceId) return { plan, interval: 'monthly' }
        if (plan.priceIds.annual === priceId) return { plan, interval: 'annual' }
      }
      return undefined
    },
    getPlanById: (id: string) => PLANS.find((p) => p.id === id),
    isSocialAddonPriceId: (priceId: string | null | undefined) => Boolean(priceId && ADDON_PRICES.has(priceId)),
  }
})

import { syncSubscriptionFromStripe, clearSubscription } from '@/lib/services/billing'
import { stripe } from '@/lib/stripe'

beforeEach(() => {
  updates = []
  inserts = []
  stubs.profileByCustomer = null
  stubs.profileBySubscription = null
  stubs.profileByOrg = null
  vi.clearAllMocks()
})

function fakeSub(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    metadata: { organizationId: 'org_1' },
    items: { data: [{ price: { id: 'price_pro_m' } }] },
    ...overrides,
  } as never
}

describe('syncSubscriptionFromStripe', () => {
  it('writes plan_tier=pro to clinic_profile when subscription is active on pro plan', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(fakeSub())
    await syncSubscriptionFromStripe('sub_1')
    expect(updates).toHaveLength(1)
    expect(updates[0].table).toBe('clinic_profile')
    expect(updates[0].set.planTier).toBe('pro')
    expect(updates[0].set.subscriptionStatus).toBe('active')
    expect(updates[0].set.stripeSubscriptionId).toBe('sub_1')
    expect(updates[0].whereOrg).toBe('org_1')
    // Managed-clinic provisioning: an activated sub ends the pending state.
    expect(updates[0].set.pendingPlanId).toBeNull()
    expect(updates[0].set.pendingBillingInterval).toBeNull()
  })

  it('writes plan_tier=premium for the premium price', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ items: { data: [{ price: { id: 'price_premium_m' } }] } }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.planTier).toBe('premium')
  })

  it('writes plan_tier=basic when subscription status is not active/trialing', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ status: 'past_due' }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.planTier).toBe('basic')
    // Not active → the managed-clinic pending reservation stays.
    expect('pendingPlanId' in updates[0].set).toBe(false)
  })

  it('keeps plan_tier=pro for trialing subscriptions', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ status: 'trialing' }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.planTier).toBe('pro')
  })

  it('falls back to clinic_profile.stripe_customer_id when subscription has no org metadata', async () => {
    stubs.profileByCustomer = { organizationId: 'org_from_lookup' }
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ metadata: {} }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].whereOrg).toBe('org_from_lookup')
  })

  it('falls back to expanded customer.metadata.organizationId when no other source resolves', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({
        metadata: {},
        customer: { id: 'cus_1', metadata: { organizationId: 'org_from_cust' } },
      }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].whereOrg).toBe('org_from_cust')
  })

  it('does not update anything when no org can be resolved', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ metadata: {} }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates).toHaveLength(0)
  })

  it('throws when subscription has no customer', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ customer: null }),
    )
    await expect(syncSubscriptionFromStripe('sub_1')).rejects.toThrow(/customer/i)
  })

  it('never writes to billing_profiles', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(fakeSub())
    await syncSubscriptionFromStripe('sub_1')
    expect(updates.find((u) => u.table === 'billing_profiles')).toBeUndefined()
    expect(inserts.find((i) => i.table === 'billing_profiles')).toBeUndefined()
  })
})

describe('clearSubscription', () => {
  it('downgrades clinic to basic and clears subscription id', async () => {
    stubs.profileBySubscription = { organizationId: 'org_1' }
    await clearSubscription('sub_1')
    expect(updates).toHaveLength(1)
    expect(updates[0].set.planTier).toBe('basic')
    expect(updates[0].set.subscriptionStatus).toBe('canceled')
    expect(updates[0].set.stripeSubscriptionId).toBeNull()
    expect(updates[0].whereOrg).toBe('org_1')
  })

  it('drops the social add-on flag on cancellation', async () => {
    stubs.profileBySubscription = { organizationId: 'org_1' }
    await clearSubscription('sub_1')
    expect(updates[0].set.socialAddon).toBe(0)
    expect(updates[0].set.socialAddonSince).toBeNull()
  })

  it('no-ops when subscription id matches no clinic', async () => {
    stubs.profileBySubscription = null
    await clearSubscription('sub_unknown')
    expect(updates).toHaveLength(0)
  })
})

describe('syncSubscriptionFromStripe — social add-on flag', () => {
  it('sets social_addon=1 when an add-on price is among the items', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({
        items: { data: [{ price: { id: 'price_pro_m' } }, { price: { id: 'price_social_pro_m' } }] },
      }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.planTier).toBe('pro')
    expect(updates[0].set.socialAddon).toBe(1)
    // First activation stamps the since timestamp (profileByOrg stub is null → wasOn=false).
    expect(updates[0].set.socialAddonSince).toBeInstanceOf(Date)
  })

  it('clears social_addon=0 when no add-on price is present', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ items: { data: [{ price: { id: 'price_pro_m' } }] } }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.socialAddon).toBe(0)
    expect(updates[0].set.socialAddonSince).toBeNull()
  })

  it('resolves the plan tier from the plan item even when the add-on item is first', async () => {
    // Add-on item at index 0, plan item second — tier must still resolve to pro.
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({
        items: { data: [{ price: { id: 'price_social_pro_m' } }, { price: { id: 'price_pro_m' } }] },
      }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.planTier).toBe('pro')
    expect(updates[0].set.socialAddon).toBe(1)
  })

  it('treats the add-on as OFF when the subscription is not live (past_due)', async () => {
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({
        status: 'past_due',
        items: { data: [{ price: { id: 'price_pro_m' } }, { price: { id: 'price_social_pro_m' } }] },
      }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.socialAddon).toBe(0)
  })

  it('keeps the existing since timestamp when the add-on was already on (idempotent on retry)', async () => {
    // profileByOrg stub reports the add-on already on → no new since timestamp.
    stubs.profileByOrg = { stripeCustomerId: 'cus_1', socialAddon: 1 } as never
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({
        items: { data: [{ price: { id: 'price_pro_m' } }, { price: { id: 'price_social_pro_m' } }] },
      }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.socialAddon).toBe(1)
    // since is left untouched (key absent) so the original activation time stands.
    expect('socialAddonSince' in updates[0].set).toBe(false)
  })

  it('reconciles the add-on off when a clinic drops to a tier-removed item (plan-change)', async () => {
    // The webhook keeps the flag in sync regardless of how the add-on changed:
    // a sub now carrying only a plan price → add-on cleared.
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue(
      fakeSub({ items: { data: [{ price: { id: 'price_premium_m' } }] } }),
    )
    await syncSubscriptionFromStripe('sub_1')
    expect(updates[0].set.planTier).toBe('premium')
    expect(updates[0].set.socialAddon).toBe(0)
  })
})
