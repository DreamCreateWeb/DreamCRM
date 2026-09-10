import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The platform's cut is not clinic-editable.
 *
 * `shop_config.platform_fee_bps` is Dream Create's Connect application fee on
 * every clinic sale (shop checkout, balance payments, booking deposits,
 * payment-plan installments, memberships). `updateShopConfigAction` used to
 * forward the whole client patch to the service, and the patch type carried
 * `platformFeeBps` — so a clinic owner crafting a request to the server action
 * could set their own fee to 0 and keep 100% of every sale.
 *
 * A server action is a public RPC endpoint: the TypeScript parameter type is
 * documentation, not a control. These tests exercise the RUNTIME gate by
 * calling the action with an off-type payload and asserting what reaches the
 * database `SET`.
 */

const state: {
  updates: Array<Record<string, unknown>>
  inserts: Array<{ table: string; values: unknown }>
} = { updates: [], inserts: [] }

vi.mock('@/lib/db', () => {
  const tableName = (t: any) => (t && t[Symbol.for('drizzle:Name')]) || 'unknown'
  return {
    db: {
      select: () => {
        const obj: any = {}
        obj.from = () => obj
        obj.where = () => obj
        obj.limit = async () => []
        obj.then = (r: (v: unknown) => void) => r([])
        return obj
      },
      insert: (t: unknown) => ({
        values: (vals: unknown) => {
          state.inserts.push({ table: tableName(t), values: vals })
          return { onConflictDoNothing: () => Promise.resolve() }
        },
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => {
          state.updates.push(vals)
          return { where: async () => {} }
        },
      }),
    },
    schema: new Proxy(
      {},
      {
        get: (_t, prop) => ({
          [Symbol.for('drizzle:Name')]: String(prop).replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
          organizationId: 'organization_id',
        }),
      },
    ),
  }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const tenant = {
  value: { tenantType: 'clinic', role: 'owner', organizationId: 'org_1', planTier: 'premium' } as {
    tenantType: string
    role: string
    organizationId: string
    planTier: string
  },
}
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => tenant.value),
}))

import { pickClinicShopConfigPatch } from '@/lib/services/shop'
import { updateShopConfigAction } from '@/app/(default)/shop/actions'

/** Call the action with whatever a hand-crafted client could POST. */
const callAction = (patch: unknown) => updateShopConfigAction(patch as never)

beforeEach(() => {
  state.updates.length = 0
  state.inserts.length = 0
})

describe('updateShopConfigAction — platform fee is unreachable', () => {
  it('never writes platformFeeBps, even when the client sends it', async () => {
    await callAction({ storefrontEnabled: true, platformFeeBps: 0 })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).not.toHaveProperty('platformFeeBps')
    // The legitimate toggle in the same payload still lands.
    expect(state.updates[0].storefrontEnabled).toBe(1)
  })

  it('drops a fee-only payload without touching the fee', async () => {
    await callAction({ platformFeeBps: 0 })
    expect(state.updates[0]).not.toHaveProperty('platformFeeBps')
    // Nothing but the bookkeeping timestamp changed.
    expect(Object.keys(state.updates[0])).toEqual(['updatedAt'])
  })

  it('ignores a snake_case spelling of the fee column', async () => {
    await callAction({ platform_fee_bps: 0, taxEnabled: true })
    expect(state.updates[0]).not.toHaveProperty('platformFeeBps')
    expect(state.updates[0]).not.toHaveProperty('platform_fee_bps')
    expect(state.updates[0].taxEnabled).toBe(1)
  })

  it('still applies every clinic-owned toggle', async () => {
    await callAction({
      pickupEnabled: true,
      shippingEnabled: true,
      taxEnabled: false,
      storefrontEnabled: true,
      membershipEnabled: true,
      flatShippingCents: 799,
      freeShippingThresholdCents: 5000,
    })
    expect(state.updates[0]).toMatchObject({
      pickupEnabled: 1,
      shippingEnabled: 1,
      taxEnabled: 0,
      storefrontEnabled: 1,
      membershipEnabled: 1,
      flatShippingCents: 799,
      freeShippingThresholdCents: 5000,
    })
  })
})

describe('pickClinicShopConfigPatch', () => {
  it('strips platform-owned and unknown fields', () => {
    expect(
      pickClinicShopConfigPatch({
        taxEnabled: true,
        platformFeeBps: 0,
        currency: 'eur',
        stripeAccountStatus: 'active',
        organizationId: 'org_evil',
      }),
    ).toEqual({ taxEnabled: true })
  })

  it('returns {} for non-object input', () => {
    expect(pickClinicShopConfigPatch(null)).toEqual({})
    expect(pickClinicShopConfigPatch(undefined)).toEqual({})
    expect(pickClinicShopConfigPatch('platformFeeBps=0')).toEqual({})
    expect(pickClinicShopConfigPatch(42)).toEqual({})
  })

  it('drops wrong-typed toggles rather than coercing them', () => {
    // `'false'` is truthy — coercion here would silently flip a setting on.
    expect(pickClinicShopConfigPatch({ taxEnabled: 'false', shippingEnabled: 1 })).toEqual({})
  })

  it('accepts null to clear the shipping money fields', () => {
    expect(pickClinicShopConfigPatch({ flatShippingCents: null, freeShippingThresholdCents: null })).toEqual({
      flatShippingCents: null,
      freeShippingThresholdCents: null,
    })
  })

  it('rejects negative, fractional and non-numeric shipping amounts', () => {
    expect(pickClinicShopConfigPatch({ flatShippingCents: -500 })).toEqual({})
    expect(pickClinicShopConfigPatch({ flatShippingCents: 1.5 })).toEqual({})
    expect(pickClinicShopConfigPatch({ flatShippingCents: NaN })).toEqual({})
    expect(pickClinicShopConfigPatch({ freeShippingThresholdCents: '0' })).toEqual({})
  })

  it('keeps an explicit false (it is a real setting, not a missing one)', () => {
    expect(pickClinicShopConfigPatch({ storefrontEnabled: false })).toEqual({ storefrontEnabled: false })
  })
})
