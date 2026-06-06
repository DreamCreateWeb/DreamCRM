import { describe, it, expect } from 'vitest'
import { subscriptionPeriodEnd } from '@/lib/stripe'

/**
 * Stripe removed `current_period_end` from the Subscription object in API
 * version 2025-03-31.basil (moved to subscription items). We pin a newer
 * version, so reading the top-level field silently returned null renewal
 * dates. This guards the version-tolerant reader.
 */
describe('subscriptionPeriodEnd', () => {
  it('reads from the first subscription item (current Stripe API shape)', () => {
    expect(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 1800000000 }] } })).toBe(1800000000)
  })

  it('falls back to the legacy top-level field for older API responses', () => {
    expect(subscriptionPeriodEnd({ current_period_end: 1700000000 })).toBe(1700000000)
  })

  it('prefers the item value over the legacy top-level field', () => {
    expect(
      subscriptionPeriodEnd({ current_period_end: 1, items: { data: [{ current_period_end: 1800000000 }] } }),
    ).toBe(1800000000)
  })

  it('returns null when neither is present', () => {
    expect(subscriptionPeriodEnd({})).toBeNull()
    expect(subscriptionPeriodEnd({ items: { data: [] } })).toBeNull()
    expect(subscriptionPeriodEnd(null)).toBeNull()
    expect(subscriptionPeriodEnd(undefined)).toBeNull()
  })
})
