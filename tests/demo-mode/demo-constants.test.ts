import { describe, it, expect } from 'vitest'
import { slugify } from '@/lib/utils'
import { DEMO_CLINIC_SLUG } from '@/lib/services/demo-constants'

/**
 * Drift guard: createDemoClinic() derives the demo org slug via
 * slugify('Acme Dental Demo'). DEMO_CLINIC_SLUG is used by enterDemoMode's
 * self-heal trigger. If they ever diverge, the self-heal would stop firing
 * and (pre-isDemo-flag) the demo would silently re-pollute. Keep them locked.
 */
describe('DEMO_CLINIC_SLUG', () => {
  it('matches the slug createDemoClinic actually produces', () => {
    expect(slugify('Acme Dental Demo')).toBe(DEMO_CLINIC_SLUG)
  })

  it('is the expected literal', () => {
    expect(DEMO_CLINIC_SLUG).toBe('acme-dental-demo')
  })
})
