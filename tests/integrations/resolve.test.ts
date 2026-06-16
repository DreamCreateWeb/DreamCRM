import { describe, it, expect } from 'vitest'
import {
  resolveIntegration,
  resolveCatalog,
  connectedCount,
  type LiveIntegrationState,
} from '@/lib/integrations/resolve'
import { integrationById, type IntegrationDef } from '@/lib/integrations/catalog'

/**
 * The runtime status resolver maps the pure catalog → live org state. These
 * tests pin every branch: connected / needs_attention / available / at_cap /
 * premium_locked / request_access / coming_soon / unavailable.
 */

function state(overrides: Partial<LiveIntegrationState> = {}): LiveIntegrationState {
  return {
    pmsEligible: true,
    zernioConfigured: true,
    connections: {},
    socialCap: { allowed: true, limit: 5, current: 0 },
    ...overrides,
  }
}

const OD = integrationById('open_dental')!
const GBP = integrationById('googlebusiness')!
const IG = integrationById('instagram')!
const GMAIL = integrationById('gmail')!
const SMS = integrationById('sms')!
const ASCEND = integrationById('dentrix_ascend')!

describe('resolveIntegration — connected states win', () => {
  it('connected → status connected + carries handle/title', () => {
    const r = resolveIntegration(
      GBP,
      state({ connections: { googlebusiness: { connected: true, title: 'Dream Dental', handle: 'dream-dental' } } }),
      'premium',
    )
    expect(r.runtime.status).toBe('connected')
    expect(r.runtime.connected).toBe(true)
    expect(r.runtime.title).toBe('Dream Dental')
    expect(r.runtime.handle).toBe('dream-dental')
  })

  it('connected + errored → needs_attention', () => {
    const r = resolveIntegration(
      OD,
      state({ connections: { open_dental: { connected: true, errored: true, title: 'Open Dental' } } }),
      'premium',
    )
    expect(r.runtime.status).toBe('needs_attention')
    expect(r.runtime.connected).toBe(true)
  })

  it('a connection wins even if the plan would otherwise lock it', () => {
    // Open Dental connected but pmsEligible false (e.g. downgraded) — still shown connected.
    const r = resolveIntegration(
      OD,
      state({ pmsEligible: false, connections: { open_dental: { connected: true, title: 'OD' } } }),
      'basic',
    )
    expect(r.runtime.status).toBe('connected')
  })

  it('errored but NOT connected (e.g. a dropped GBP / restricted Stripe) → needs_attention, connected:false', () => {
    const r = resolveIntegration(GBP, state({ connections: { googlebusiness: { connected: false, errored: true } } }), 'premium')
    expect(r.runtime.status).toBe('needs_attention')
    expect(r.runtime.connected).toBe(false)
  })

  it('carries isDemo through', () => {
    const r = resolveIntegration(
      OD,
      state({ connections: { open_dental: { connected: true, isDemo: true, title: 'Sandbox' } } }),
      'premium',
    )
    expect(r.runtime.isDemo).toBe(true)
  })
})

describe('resolveIntegration — lifecycle (not connectable)', () => {
  it('coming_soon def → coming_soon status', () => {
    expect(resolveIntegration(SMS, state(), 'premium').runtime.status).toBe('coming_soon')
  })

  it('request_access def → request_access status', () => {
    expect(resolveIntegration(ASCEND, state(), 'premium').runtime.status).toBe('request_access')
  })
})

describe('resolveIntegration — plan gating', () => {
  it('PMS-kind + not eligible → premium_locked', () => {
    expect(resolveIntegration(OD, state({ pmsEligible: false }), 'basic').runtime.status).toBe('premium_locked')
  })

  it('PMS-kind + eligible + not connected → available', () => {
    expect(resolveIntegration(OD, state({ pmsEligible: true }), 'premium').runtime.status).toBe('available')
  })

  it('a generic minPlan def below the plan → premium_locked', () => {
    const fakeDef: IntegrationDef = { ...GMAIL, id: 'fake_pro_only', minPlan: 'pro', connectKind: 'oauth' }
    expect(resolveIntegration(fakeDef, state(), 'basic').runtime.status).toBe('premium_locked')
    expect(resolveIntegration(fakeDef, state(), 'pro').runtime.status).toBe('available')
  })
})

describe('resolveIntegration — connectability', () => {
  it('zernio-kind + instance not configured → unavailable', () => {
    expect(resolveIntegration(GBP, state({ zernioConfigured: false }), 'premium').runtime.status).toBe('unavailable')
  })

  it('zernio-kind GBP + configured + not connected → available (never cap-gated)', () => {
    const r = resolveIntegration(GBP, state({ socialCap: { allowed: false, limit: 0, current: 0 } }), 'premium')
    expect(r.runtime.status).toBe('available')
  })

  it('social channel under the cap → available', () => {
    expect(resolveIntegration(IG, state({ socialCap: { allowed: true, limit: 5, current: 1 } }), 'premium').runtime.status).toBe(
      'available',
    )
  })

  it('social channel at the cap → at_cap', () => {
    expect(
      resolveIntegration(IG, state({ socialCap: { allowed: false, limit: 5, current: 5 } }), 'premium').runtime.status,
    ).toBe('at_cap')
  })

  it('oauth-kind (Gmail) + not connected → available regardless of cap/zernio', () => {
    const r = resolveIntegration(
      GMAIL,
      state({ zernioConfigured: false, socialCap: { allowed: false, limit: 0, current: 0 } }),
      'basic',
    )
    expect(r.runtime.status).toBe('available')
  })
})

describe('resolveCatalog + connectedCount', () => {
  it('resolves every def in the catalog', () => {
    const all = resolveCatalog(state(), 'premium')
    expect(all.length).toBeGreaterThanOrEqual(14)
    for (const r of all) expect(r.runtime.status).toBeTruthy()
  })

  it('connectedCount tallies only actively-connected integrations', () => {
    const all = resolveCatalog(
      state({
        connections: {
          open_dental: { connected: true },
          googlebusiness: { connected: true },
          instagram: { connected: true },
          facebook: { connected: false, errored: true }, // not connected
        },
      }),
      'premium',
    )
    expect(connectedCount(all)).toBe(3)
  })

  it('a basic clinic sees Open Dental premium_locked but GBP + Gmail available', () => {
    const all = resolveCatalog(state({ pmsEligible: false }), 'basic')
    const byId = Object.fromEntries(all.map((r) => [r.def.id, r.runtime.status]))
    expect(byId.open_dental).toBe('premium_locked')
    expect(byId.googlebusiness).toBe('available')
    expect(byId.gmail).toBe('available')
  })
})
