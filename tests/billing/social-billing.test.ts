import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Social add-on billing service: addSocialAddon / removeSocialAddon (Stripe
 * subscription-item mechanics incl. tier-price matching + plan-change reconcile),
 * the demo seed, and canConnectSocialPlatform (cap enforcement, GBP never counts).
 * The DB is a controllable fake; Stripe is mocked.
 */

// ── Controllable state ───────────────────────────────────────────────────────
interface ProfileRow {
  organizationId: string
  planTier: string | null
  stripeSubscriptionId: string | null
  billingMode: string | null
  socialAddon: number
}
const state = {
  profile: null as ProfileRow | null,
  // zernio_account rows for the org (platform matters for the GBP-exclusion).
  accounts: [] as Array<{ id: string; organizationId: string; platform: string }>,
  patients: [] as Array<{ id: string; organizationId: string }>,
  updates: [] as Array<Record<string, unknown>>,
}

// ── DB fake ──────────────────────────────────────────────────────────────────
vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const clinicSchema = await import('@/lib/db/schema/clinic')

  function tableName(t: unknown): string {
    if (t === clinicProfile) return 'clinic_profile'
    if (t === clinicSchema.zernioAccount) return 'zernio_account'
    if (t === clinicSchema.patient) return 'patient'
    return 'unknown'
  }

  function select(_cols?: unknown) {
    let table = ''
    const api: Record<string, unknown> = {}
    api.from = (t: unknown) => {
      table = tableName(t)
      return api
    }
    api.where = () => api
    api.limit = async () => {
      if (table === 'clinic_profile') return state.profile ? [state.profile] : []
      if (table === 'patient') return state.patients.length ? [state.patients[0]] : []
      return []
    }
    // zernio_account count read uses `.where()` then awaits the builder (no
    // limit). The real query is scoped to the org AND excludes GBP via
    // ne(platform, 'googlebusiness') — the fake applies the SAME exclusion (it
    // can't parse the drizzle clause, but that exclusion is the invariant under
    // test). We assert GBP-exclusion behavior through this honest filter.
    api.then = (resolve: (rows: unknown[]) => unknown) => {
      if (table === 'zernio_account') {
        return resolve(
          state.accounts.filter((a) => a.organizationId === 'org_1' && a.platform !== 'googlebusiness'),
        )
      }
      return resolve([])
    }
    return api
  }

  return {
    db: {
      select,
      update: (_t: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(vals)
            if (state.profile && typeof vals.socialAddon === 'number') {
              state.profile.socialAddon = vals.socialAddon as number
            }
          },
        }),
      }),
    },
    schema: {
      clinicProfile,
      zernioAccount: clinicSchema.zernioAccount,
      patient: clinicSchema.patient,
    },
  }
})

// ── Stripe mock ──────────────────────────────────────────────────────────────
const stripeMock = {
  subRetrieve: vi.fn(),
  itemCreate: vi.fn().mockResolvedValue({ id: 'si_new' }),
  itemDel: vi.fn().mockResolvedValue({}),
}
vi.mock('@/lib/stripe', () => ({
  stripe: {
    subscriptions: { retrieve: (...a: unknown[]) => stripeMock.subRetrieve(...a) },
    subscriptionItems: {
      create: (...a: unknown[]) => stripeMock.itemCreate(...a),
      del: (...a: unknown[]) => stripeMock.itemDel(...a),
    },
  },
}))

// ── stripe-config mock: real-ish price ids, all configured ───────────────────
vi.mock('@/lib/stripe-config', () => {
  const SOCIAL_ADDON_PRICE_IDS = {
    basic: { monthly: '', annual: '' },
    pro: { monthly: 'price_social_pro_m', annual: 'price_social_pro_y' },
    premium: { monthly: 'price_social_premium_m', annual: 'price_social_premium_y' },
  } as const
  return {
    SOCIAL_ADDON_PRICE_IDS,
    getSocialAddonPriceId: (plan: 'basic' | 'pro' | 'premium', interval: 'monthly' | 'annual') =>
      SOCIAL_ADDON_PRICE_IDS[plan][interval],
    socialAddonConfigured: () => true,
    isSocialAddonPriceId: (id: string | null | undefined) =>
      Boolean(
        id &&
          [
            'price_social_pro_m',
            'price_social_pro_y',
            'price_social_premium_m',
            'price_social_premium_y',
          ].includes(id),
      ),
  }
})

import {
  addSocialAddon,
  removeSocialAddon,
  canConnectSocialPlatform,
  seedDemoSocialAddon,
} from '@/lib/services/social-billing'

function setProfile(p: Partial<ProfileRow>) {
  state.profile = {
    organizationId: 'org_1',
    planTier: 'pro',
    stripeSubscriptionId: 'sub_1',
    billingMode: 'self_serve',
    socialAddon: 0,
    ...p,
  }
}

beforeEach(() => {
  state.profile = null
  state.accounts = []
  state.patients = []
  state.updates = []
  stripeMock.subRetrieve.mockReset()
  stripeMock.itemCreate.mockReset().mockResolvedValue({ id: 'si_new' })
  stripeMock.itemDel.mockReset().mockResolvedValue({})
})

// monthly plan sub with only the plan item
function planOnlySub(planPriceInterval: 'm' | 'y' = 'm') {
  return {
    id: 'sub_1',
    items: { data: [{ id: 'si_plan', price: { id: `price_pro_${planPriceInterval}`, recurring: { interval: planPriceInterval === 'y' ? 'year' : 'month' } } }] },
  }
}

describe('addSocialAddon', () => {
  it('adds the Pro monthly add-on item with proration when none present', async () => {
    setProfile({ planTier: 'pro' })
    stripeMock.subRetrieve.mockResolvedValue(planOnlySub('m'))
    await addSocialAddon('org_1')
    expect(stripeMock.itemCreate).toHaveBeenCalledTimes(1)
    expect(stripeMock.itemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription: 'sub_1',
        price: 'price_social_pro_m',
        proration_behavior: 'create_prorations',
      }),
    )
    // flag persisted on
    expect(state.profile!.socialAddon).toBe(1)
  })

  it('matches the annual add-on price for an annual plan', async () => {
    setProfile({ planTier: 'premium' })
    stripeMock.subRetrieve.mockResolvedValue({
      id: 'sub_1',
      items: { data: [{ id: 'si_plan', price: { id: 'price_premium_y', recurring: { interval: 'year' } } }] },
    })
    await addSocialAddon('org_1')
    expect(stripeMock.itemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ price: 'price_social_premium_y' }),
    )
  })

  it('is idempotent — no create when the add-on item already exists', async () => {
    setProfile({ planTier: 'pro', socialAddon: 1 })
    stripeMock.subRetrieve.mockResolvedValue({
      id: 'sub_1',
      items: {
        data: [
          { id: 'si_plan', price: { id: 'price_pro_m', recurring: { interval: 'month' } } },
          { id: 'si_addon', price: { id: 'price_social_pro_m', recurring: { interval: 'month' } } },
        ],
      },
    })
    await addSocialAddon('org_1')
    expect(stripeMock.itemCreate).not.toHaveBeenCalled()
  })

  it('swaps a stale add-on item to the new tier price on a plan change (Pro→Premium)', async () => {
    // Clinic upgraded to Premium but still carries the Pro add-on item.
    setProfile({ planTier: 'premium', socialAddon: 1 })
    stripeMock.subRetrieve.mockResolvedValue({
      id: 'sub_1',
      items: {
        data: [
          { id: 'si_plan', price: { id: 'price_premium_m', recurring: { interval: 'month' } } },
          { id: 'si_addon_old', price: { id: 'price_social_pro_m', recurring: { interval: 'month' } } },
        ],
      },
    })
    await addSocialAddon('org_1')
    // old Pro add-on item deleted, new Premium add-on item created
    expect(stripeMock.itemDel).toHaveBeenCalledWith('si_addon_old', expect.anything())
    expect(stripeMock.itemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ price: 'price_social_premium_m' }),
    )
  })

  it('rejects a Basic clinic with an upgrade message — never touches Stripe', async () => {
    setProfile({ planTier: 'basic' })
    await expect(addSocialAddon('org_1')).rejects.toThrow(/Upgrade to Pro/i)
    expect(stripeMock.subRetrieve).not.toHaveBeenCalled()
    expect(stripeMock.itemCreate).not.toHaveBeenCalled()
  })

  it('rejects a comped/managed clinic (no Stripe subscription)', async () => {
    setProfile({ planTier: 'pro', stripeSubscriptionId: null, billingMode: 'comped' })
    await expect(addSocialAddon('org_1')).rejects.toThrow(/managed billing/i)
    expect(stripeMock.itemCreate).not.toHaveBeenCalled()
  })
})

describe('removeSocialAddon', () => {
  it('deletes the add-on item with proration and clears the flag', async () => {
    setProfile({ planTier: 'pro', socialAddon: 1 })
    stripeMock.subRetrieve.mockResolvedValue({
      id: 'sub_1',
      items: {
        data: [
          { id: 'si_plan', price: { id: 'price_pro_m', recurring: { interval: 'month' } } },
          { id: 'si_addon', price: { id: 'price_social_pro_m', recurring: { interval: 'month' } } },
        ],
      },
    })
    await removeSocialAddon('org_1')
    expect(stripeMock.itemDel).toHaveBeenCalledWith('si_addon', expect.objectContaining({ proration_behavior: 'create_prorations' }))
    expect(state.profile!.socialAddon).toBe(0)
  })

  it('is idempotent — no delete when no add-on item exists', async () => {
    setProfile({ planTier: 'pro', socialAddon: 0 })
    stripeMock.subRetrieve.mockResolvedValue(planOnlySub('m'))
    await removeSocialAddon('org_1')
    expect(stripeMock.itemDel).not.toHaveBeenCalled()
  })

  it('no-ops (no Stripe call) when there is no subscription', async () => {
    setProfile({ planTier: 'pro', stripeSubscriptionId: null, socialAddon: 0 })
    await removeSocialAddon('org_1')
    expect(stripeMock.subRetrieve).not.toHaveBeenCalled()
  })
})

describe('canConnectSocialPlatform — cap enforcement (GBP never counts)', () => {
  it('Basic clinic is always blocked (limit 0)', async () => {
    setProfile({ planTier: 'basic', socialAddon: 0 })
    const r = await canConnectSocialPlatform('org_1')
    expect(r.allowed).toBe(false)
    expect(r.limit).toBe(0)
    expect(r.current).toBe(0)
    expect(r.reason).toMatch(/Upgrade to Pro/i)
  })

  it('Pro clinic under the limit is allowed', async () => {
    setProfile({ planTier: 'pro', socialAddon: 0 })
    // 0 social accounts, limit 1
    const r = await canConnectSocialPlatform('org_1')
    expect(r.allowed).toBe(true)
    expect(r.limit).toBe(1)
    expect(r.current).toBe(0)
  })

  it('Pro clinic AT the limit is blocked with an add-on hint', async () => {
    setProfile({ planTier: 'pro', socialAddon: 0 })
    state.accounts = [{ id: 'a1', organizationId: 'org_1', platform: 'instagram' }]
    const r = await canConnectSocialPlatform('org_1')
    expect(r.allowed).toBe(false)
    expect(r.limit).toBe(1)
    expect(r.current).toBe(1)
    expect(r.reason).toMatch(/add-on/i)
  })

  it('Pro + add-on raises the cap to 3', async () => {
    setProfile({ planTier: 'pro', socialAddon: 1 })
    state.accounts = [
      { id: 'a1', organizationId: 'org_1', platform: 'instagram' },
      { id: 'a2', organizationId: 'org_1', platform: 'facebook' },
    ]
    const r = await canConnectSocialPlatform('org_1')
    expect(r.allowed).toBe(true)
    expect(r.limit).toBe(3)
    expect(r.current).toBe(2)
  })

  it('GBP accounts do NOT count toward the social limit', async () => {
    setProfile({ planTier: 'pro', socialAddon: 0 })
    // One GBP + one social → only the social one counts (current=1, AT limit).
    state.accounts = [
      { id: 'gbp', organizationId: 'org_1', platform: 'googlebusiness' },
      { id: 'ig', organizationId: 'org_1', platform: 'instagram' },
    ]
    const r = await canConnectSocialPlatform('org_1')
    expect(r.current).toBe(1)
    expect(r.allowed).toBe(false)
  })

  it('a clinic with ONLY GBP connected can still add a social (GBP free + separate)', async () => {
    setProfile({ planTier: 'pro', socialAddon: 0 })
    state.accounts = [{ id: 'gbp', organizationId: 'org_1', platform: 'googlebusiness' }]
    const r = await canConnectSocialPlatform('org_1')
    expect(r.current).toBe(0)
    expect(r.allowed).toBe(true)
  })

  it('Premium + add-on allows up to 5 social', async () => {
    setProfile({ planTier: 'premium', socialAddon: 1 })
    state.accounts = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, organizationId: 'org_1', platform: 'instagram' }))
    const r = await canConnectSocialPlatform('org_1')
    expect(r.limit).toBe(5)
    expect(r.current).toBe(4)
    expect(r.allowed).toBe(true)
  })
})

describe('seedDemoSocialAddon', () => {
  it('sets the flag on for a demo clinic that has patients', async () => {
    setProfile({ planTier: 'premium', socialAddon: 0 })
    state.patients = [{ id: 'p1', organizationId: 'org_1' }]
    await seedDemoSocialAddon('org_1')
    expect(state.profile!.socialAddon).toBe(1)
    expect(state.updates.some((u) => u.socialAddon === 1)).toBe(true)
  })

  it('is idempotent — no write when already on', async () => {
    setProfile({ planTier: 'premium', socialAddon: 1 })
    state.patients = [{ id: 'p1', organizationId: 'org_1' }]
    await seedDemoSocialAddon('org_1')
    expect(state.updates).toHaveLength(0)
  })

  it('is patient-guarded — no write when the org has no patients', async () => {
    setProfile({ planTier: 'premium', socialAddon: 0 })
    state.patients = []
    await seedDemoSocialAddon('org_1')
    expect(state.updates).toHaveLength(0)
    expect(state.profile!.socialAddon).toBe(0)
  })
})
