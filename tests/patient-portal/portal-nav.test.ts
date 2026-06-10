import { describe, it, expect } from 'vitest'
import { buildPortalNav } from '@/components/patient-portal/nav'
import { DEFAULT_PORTAL_SETTINGS, resolvePortalSettings } from '@/lib/types/portal'

/**
 * buildPortalNav derives the portal's navigation from the clinic's feature
 * toggles — a feature switched off must disappear entirely (the hide-not-
 * disable promise), and the mobile bar caps at 4 primary + More.
 */

describe('buildPortalNav', () => {
  it('default settings: Home/Visits/Messages/Billing primary, rest in More', () => {
    const nav = buildPortalNav({ settings: DEFAULT_PORTAL_SETTINGS, hasShop: false, hasDependents: false })
    expect(nav.primary.map((i) => i.label)).toEqual(['Home', 'Visits', 'Messages', 'Billing'])
    expect(nav.more.map((i) => i.label)).toEqual(['Records', 'Forms', 'My info'])
  })

  it('a toggled-off feature produces NO nav item anywhere', () => {
    const settings = resolvePortalSettings({ features: { messages: false, billing: false } })
    const nav = buildPortalNav({ settings, hasShop: false, hasDependents: false })
    const all = [...nav.primary, ...nav.more].map((i) => i.label)
    expect(all).not.toContain('Messages')
    expect(all).not.toContain('Billing')
    // The next enabled items slide into the primary slots.
    expect(nav.primary.map((i) => i.label)).toEqual(['Home', 'Visits', 'Records', 'Forms'])
  })

  it('Family appears only when the feature is on AND dependents exist', () => {
    const on = buildPortalNav({ settings: DEFAULT_PORTAL_SETTINGS, hasShop: false, hasDependents: true })
    expect([...on.primary, ...on.more].map((i) => i.label)).toContain('Family')

    const noDeps = buildPortalNav({ settings: DEFAULT_PORTAL_SETTINGS, hasShop: false, hasDependents: false })
    expect([...noDeps.primary, ...noDeps.more].map((i) => i.label)).not.toContain('Family')

    const off = buildPortalNav({
      settings: resolvePortalSettings({ features: { family: false } }),
      hasShop: false,
      hasDependents: true,
    })
    expect([...off.primary, ...off.more].map((i) => i.label)).not.toContain('Family')
  })

  it('Shop appears only when the link is enabled AND the storefront exists', () => {
    const both = buildPortalNav({ settings: DEFAULT_PORTAL_SETTINGS, hasShop: true, hasDependents: false })
    expect([...both.primary, ...both.more].map((i) => i.label)).toContain('Shop')

    const noStore = buildPortalNav({ settings: DEFAULT_PORTAL_SETTINGS, hasShop: false, hasDependents: false })
    expect([...noStore.primary, ...noStore.more].map((i) => i.label)).not.toContain('Shop')

    const linkOff = buildPortalNav({
      settings: resolvePortalSettings({ features: { shopLink: false } }),
      hasShop: true,
      hasDependents: false,
    })
    expect([...linkOff.primary, ...linkOff.more].map((i) => i.label)).not.toContain('Shop')
  })

  it('Home, Visits, and My info are always present (core floor)', () => {
    const settings = resolvePortalSettings({
      features: {
        booking: false,
        reschedule: false,
        messages: false,
        billing: false,
        records: false,
        forms: false,
        family: false,
        shopLink: false,
        payments: false,
      },
    })
    const nav = buildPortalNav({ settings, hasShop: false, hasDependents: false })
    expect([...nav.primary, ...nav.more].map((i) => i.label)).toEqual(['Home', 'Visits', 'My info'])
  })

  it('primary never exceeds 4 entries', () => {
    const nav = buildPortalNav({ settings: DEFAULT_PORTAL_SETTINGS, hasShop: true, hasDependents: true })
    expect(nav.primary.length).toBeLessThanOrEqual(4)
  })
})
