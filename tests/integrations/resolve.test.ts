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
    )
    expect(r.runtime.status).toBe('needs_attention')
    expect(r.runtime.connected).toBe(true)
  })

  it('a live connection always shows as connected', () => {
    // A live connection always wins.
    const r = resolveIntegration(
      OD,
      state({connections: { open_dental: { connected: true, title: 'OD' } } }),
    )
    expect(r.runtime.status).toBe('connected')
  })

  it('errored but NOT connected (e.g. a dropped GBP / restricted Stripe) → needs_attention, connected:false', () => {
    const r = resolveIntegration(GBP, state({ connections: { googlebusiness: { connected: false, errored: true } } }))
    expect(r.runtime.status).toBe('needs_attention')
    expect(r.runtime.connected).toBe(false)
  })

  it('carries isDemo through', () => {
    const r = resolveIntegration(
      OD,
      state({ connections: { open_dental: { connected: true, isDemo: true, title: 'Sandbox' } } }),
    )
    expect(r.runtime.isDemo).toBe(true)
  })
})

describe('resolveIntegration — lifecycle (not connectable)', () => {
  it('coming_soon def → coming_soon status', () => {
    expect(resolveIntegration(SMS, state()).runtime.status).toBe('coming_soon')
  })

  it('request_access def → request_access status', () => {
    expect(resolveIntegration(ASCEND, state()).runtime.status).toBe('request_access')
  })
})

describe('resolveIntegration — no plan gating (single-plan reality)', () => {
  it('PMS-kind + not connected → available (no tier can lock it)', () => {
    expect(resolveIntegration(OD, state()).runtime.status).toBe('available')
  })

  it('an oauth def + not connected → available', () => {
    const fakeDef: IntegrationDef = { ...GMAIL, id: 'fake_oauth', connectKind: 'oauth' }
    expect(resolveIntegration(fakeDef, state()).runtime.status).toBe('available')
  })
})

describe('resolveIntegration — connectability', () => {
  it('zernio-kind + instance not configured → unavailable', () => {
    expect(resolveIntegration(GBP, state({ zernioConfigured: false })).runtime.status).toBe('unavailable')
  })

  it('zernio-kind GBP + configured + not connected → available (never cap-gated)', () => {
    const r = resolveIntegration(GBP, state({ socialCap: { allowed: false, limit: 0, current: 0 } }))
    expect(r.runtime.status).toBe('available')
  })

  it('social channel under the cap → available', () => {
    expect(resolveIntegration(IG, state({ socialCap: { allowed: true, limit: 5, current: 1 } })).runtime.status).toBe(
      'available',
    )
  })

  it('social channel at the cap → at_cap', () => {
    expect(
      resolveIntegration(IG, state({ socialCap: { allowed: false, limit: 5, current: 5 } })).runtime.status,
    ).toBe('at_cap')
  })

  it('oauth-kind (Gmail) + not connected → available regardless of cap/zernio', () => {
    const r = resolveIntegration(
      GMAIL,
      state({ zernioConfigured: false, socialCap: { allowed: false, limit: 0, current: 0 } }),
    )
    expect(r.runtime.status).toBe('available')
  })
})

describe('resolveCatalog + connectedCount', () => {
  it('resolves every def in the catalog', () => {
    const all = resolveCatalog(state())
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
    )
    expect(connectedCount(all)).toBe(3)
  })

  it('every clinic sees Open Dental, GBP + Gmail available (no tiers)', () => {
    const all = resolveCatalog(state({}))
    const byId = Object.fromEntries(all.map((r) => [r.def.id, r.runtime.status]))
    expect(byId.open_dental).toBe('available')
    expect(byId.googlebusiness).toBe('available')
    expect(byId.gmail).toBe('available')
  })
})
