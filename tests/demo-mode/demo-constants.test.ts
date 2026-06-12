import { describe, it, expect } from 'vitest'
import { slugify } from '@/lib/utils'
import { DEMO_CLINIC_SLUG } from '@/lib/services/demo-constants'

/**
 * Drift guard for the demo clinic's slug.
 *
 * As of the 2026-06 Acme→Dream Dental rename, the demo org NAME ('Dream Dental
 * Demo') is DECOUPLED from its SLUG: createDemoClinic() sets the slug to the
 * explicit DEMO_CLINIC_SLUG constant rather than slugify(name), so the already-
 * deployed `acme-dental-demo` subdomain + every isDemo self-heal key stays put
 * even though the public name changed. enterDemoMode's self-heal trigger keys
 * off the same constant, so as long as createDemoClinic uses DEMO_CLINIC_SLUG
 * (asserted by tests/demo-mode/seeder.test.ts via out.organizationSlug) the two
 * can never diverge.
 */
describe('DEMO_CLINIC_SLUG', () => {
  it('is the stable deployed literal (decoupled from the org name)', () => {
    expect(DEMO_CLINIC_SLUG).toBe('acme-dental-demo')
  })

  it('does NOT track the renamed org name (slug is intentionally fixed)', () => {
    // The new name would slugify to a DIFFERENT value — proof the slug is
    // pinned to the constant, not re-derived from the (renamed) name.
    expect(slugify('Dream Dental Demo')).not.toBe(DEMO_CLINIC_SLUG)
    expect(slugify('Dream Dental Demo')).toBe('dream-dental-demo')
  })
})
