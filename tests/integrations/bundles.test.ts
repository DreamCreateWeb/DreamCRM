import { describe, it, expect } from 'vitest'
import {
  BUNDLES,
  BUNDLE_ORDER,
  BUNDLE_BY_ID,
  bundleForCategory,
  bundleForIntegration,
  bundleMembers,
  bundleLogos,
  isBundleActive,
  activeBundleIds,
  type BundleId,
  type BundleSignals,
} from '@/lib/integrations/bundles'
import { INTEGRATIONS_CATALOG } from '@/lib/integrations/catalog'
import { applyBundleGate, getVisibleModules, getRegistry } from '@/lib/modules'

/**
 * Feature bundles layer over the catalog + drive auto-derived sidebar wiring.
 * These pin: (1) the catalog↔bundle mapping is a clean partition (no orphaned
 * or double-owned integration), (2) the pure active-state derive, and (3) the
 * `applyBundleGate` sidebar filter against the REAL clinic registry.
 */

function signals(overrides: Partial<BundleSignals> = {}): BundleSignals {
  return {
    pmsConnected: false,
    googleConnected: false,
    socialConnected: false,
    communicationConnected: false,
    paymentsActive: false,
    ...overrides,
  }
}

describe('bundle ↔ catalog mapping', () => {
  it('every catalog integration belongs to EXACTLY one bundle (no orphans, no overlap)', () => {
    for (const def of INTEGRATIONS_CATALOG) {
      const owners = BUNDLES.filter((b) => b.categories.includes(def.category))
      expect(owners.length, `${def.id} (category ${def.category}) must map to exactly one bundle`).toBe(1)
    }
  })

  it('no category is claimed by two bundles (the partition is clean)', () => {
    const cats = BUNDLES.flatMap((b) => b.categories)
    expect(new Set(cats).size).toBe(cats.length)
  })

  it('BUNDLE_BY_ID + BUNDLE_ORDER cover every bundle', () => {
    expect(BUNDLE_ORDER.length).toBe(BUNDLES.length)
    for (const b of BUNDLES) expect(BUNDLE_BY_ID[b.id]).toBe(b)
  })

  it('bundleForCategory / bundleForIntegration resolve correctly', () => {
    expect(bundleForCategory('pms')).toBe('pms')
    expect(bundleForCategory('social')).toBe('social')
    expect(bundleForCategory('payments')).toBe('payments')
    // A taxonomy category with no catalog entries + no bundle → null.
    expect(bundleForCategory('scheduling')).toBeNull()
    expect(bundleForIntegration(INTEGRATIONS_CATALOG.find((d) => d.id === 'open_dental')!)).toBe('pms')
    expect(bundleForIntegration(INTEGRATIONS_CATALOG.find((d) => d.id === 'instagram')!)).toBe('social')
    expect(bundleForIntegration(INTEGRATIONS_CATALOG.find((d) => d.id === 'stripe_connect')!)).toBe('payments')
  })

  it('bundleMembers derives members from the catalog by category', () => {
    const social = BUNDLE_BY_ID.social
    const ids = bundleMembers(social).map((d) => d.id).sort()
    expect(ids).toEqual(['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube'])
    // PMS bundle includes the live OD + the roadmap PMSs.
    expect(bundleMembers(BUNDLE_BY_ID.pms).map((d) => d.id)).toContain('open_dental')
    expect(bundleMembers(BUNDLE_BY_ID.pms).map((d) => d.id)).toContain('dentrix_ascend')
  })

  it('every bundle has at least one catalog member (no empty bundle)', () => {
    for (const b of BUNDLES) expect(bundleMembers(b).length, `${b.id} has members`).toBeGreaterThan(0)
  })

  it('bundleLogos returns capped, de-duped member logos', () => {
    const logos = bundleLogos(BUNDLE_BY_ID.social, 3)
    expect(logos.length).toBe(3)
    expect(new Set(logos).size).toBe(logos.length)
  })
})

describe('active-state derive (pure)', () => {
  it('nothing connected → no active bundles', () => {
    expect(activeBundleIds(signals()).size).toBe(0)
  })

  it.each([
    ['pmsConnected', 'pms'],
    ['googleConnected', 'google'],
    ['socialConnected', 'social'],
    ['communicationConnected', 'communication'],
    ['paymentsActive', 'payments'],
  ] as [keyof BundleSignals, BundleId][])('%s → activates %s', (signal, bundle) => {
    const s = signals({ [signal]: true })
    expect(isBundleActive(bundle, s)).toBe(true)
    expect(activeBundleIds(s).has(bundle)).toBe(true)
    // and nothing else
    expect(activeBundleIds(s).size).toBe(1)
  })

  it('multiple signals → multiple active bundles', () => {
    const active = activeBundleIds(signals({ googleConnected: true, paymentsActive: true }))
    expect(Array.from(active).sort()).toEqual(['google', 'payments'])
  })
})

describe('applyBundleGate — sidebar wiring against the real clinic registry', () => {
  // A Premium owner sees the widest registry (before the bundle gate).
  const premium = () => getVisibleModules('clinic', 'premium', 'owner')
  const ids = (set: ReadonlySet<BundleId>) => new Set(applyBundleGate(premium(), set).map((m) => m.id))

  // Social Posts folded into the Growth workspace (its hub door reflects
  // connected channels instead of a bundle-gated sidebar entry) — Shop is the
  // one remaining bundle-gated clinic module.
  it('Shop is gated; nothing connected hides it (Growth hub is always present)', () => {
    const visible = ids(new Set())
    expect(visible.has('shop')).toBe(false)
    // Ungated core modules are unaffected.
    expect(visible.has('overview')).toBe(true)
    expect(visible.has('patients')).toBe(true)
    expect(visible.has('growth')).toBe(true)
    expect(visible.has('integrations')).toBe(true)
  })

  it('Payments bundle active → Shop appears', () => {
    const visible = ids(new Set<BundleId>(['payments']))
    expect(visible.has('shop')).toBe(true)
  })

  it('all bundles active → Shop surfaces alongside the always-on hubs', () => {
    const visible = ids(new Set<BundleId>(['pms', 'google', 'social', 'communication', 'payments']))
    expect(visible.has('shop')).toBe(true)
    expect(visible.has('growth')).toBe(true)
    expect(visible.has('website')).toBe(true)
  })

  it('the gate is a no-op for tenants with no requiresBundle modules (platform)', () => {
    const platform = getVisibleModules('platform', 'premium', 'owner')
    expect(applyBundleGate(platform, new Set()).length).toBe(platform.length)
  })

  it('every requiresBundle on the clinic registry references a real bundle id', () => {
    const realIds = new Set(BUNDLE_ORDER)
    for (const m of getRegistry('clinic').modules) {
      for (const b of m.requiresBundle ?? []) expect(realIds.has(b)).toBe(true)
    }
  })
})
