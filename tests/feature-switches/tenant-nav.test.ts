import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE ONE NAV RESOLVER (docs/ACTIVATION.md S3, lib/services/tenant-nav.ts).
 * Pins: other tenants pass through untouched; a clinic's switched-off
 * modules move to `addable`; and a switch WINS over the bundle gate —
 * Payments turned on shows without a Stripe account (the hub's connect
 * card is the next step), while an un-switched bundle module keeps its
 * gate.
 */

const state = {
  bundles: new Set<string>(),
  switches: {} as Record<string, boolean>,
}
vi.mock('@/lib/services/integration-bundles', () => ({ getActiveBundlesForSidebar: async () => state.bundles }))
vi.mock('@/lib/services/feature-switches', async () => {
  const { ALL_OFF } = await import('@/lib/feature-switches')
  return { getFeatureSwitchState: async () => ({ ...ALL_OFF, ...state.switches }) }
})

import { getTenantNav } from '@/lib/services/tenant-nav'
import { platformModules } from '@/lib/modules/platform'
import { FEATURE_SWITCHES } from '@/lib/feature-switches'

const clinic = { tenantType: 'clinic' as const, role: 'owner' as const, platformAdmin: false, organizationId: 'org_a' }

beforeEach(() => {
  state.bundles = new Set()
  state.switches = {}
})

describe('getTenantNav', () => {
  it('leaves the platform tenant alone — no switches, nothing addable', async () => {
    const nav = await getTenantNav({ ...clinic, tenantType: 'platform', role: 'owner' })
    expect(nav.addable).toEqual([])
    expect(nav.modules.map((m) => m.id)).toEqual(platformModules.modules.map((m) => m.id))
  })

  it('a new clinic sees the day-one set and every switched module in "Add"', async () => {
    const nav = await getTenantNav(clinic)
    const ids = nav.modules.map((m) => m.id)
    for (const id of ['overview', 'dream_team', 'messages', 'appointments', 'patients', 'website', 'integrations', 'settings']) {
      expect(ids, id).toContain(id)
    }
    expect(nav.addable.map((m) => m.id)).toEqual(FEATURE_SWITCHES.map((f) => f.moduleId))
  })

  it('a switch beats the bundle gate: Payments on with no Stripe still shows', async () => {
    state.switches = { payments: true }
    const nav = await getTenantNav(clinic)
    expect(nav.modules.some((m) => m.id === 'payments_hub')).toBe(true)
    expect(nav.addable.some((m) => m.id === 'payments_hub')).toBe(false)
    // Shop is still off → in Add, not shown, bundle or no bundle.
    state.bundles = new Set(['payments'])
    const again = await getTenantNav(clinic)
    expect(again.modules.some((m) => m.id === 'shop')).toBe(false)
    expect(again.addable.some((m) => m.id === 'shop')).toBe(true)
  })

  it('role gating still applies before the split', async () => {
    const nav = await getTenantNav({ ...clinic, role: 'member' })
    const all = [...nav.modules, ...nav.addable]
    for (const m of all) if (m.roles) expect(m.roles).toContain('member')
  })
})
