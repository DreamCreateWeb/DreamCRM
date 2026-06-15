import { describe, it, expect } from 'vitest'
import {
  GBP_ALLOWED_ALL_PLANS,
  socialAddonAvailable,
  socialAddonPriceCents,
  socialConnectionLimit,
  totalConnectionLimitIncludingGbp,
} from '@/lib/types/social-entitlements'
import type { PlanTier } from '@/lib/modules/types'

/**
 * The locked product spec (FINALIZED 2026-06-15):
 *   Plan          | GBP | Free social | Add-on | Social limit (base → +addon)
 *   Basic ($99)   |  ✓  |     0       |  none  |  0
 *   Pro ($149)    |  ✓  |     1       | $30/mo |  1 → 3
 *   Premium ($199)|  ✓  |     2       | $20/mo |  2 → 5
 * GBP is free + separate on every tier and never counts toward the social limit.
 */

const TIERS: PlanTier[] = ['basic', 'pro', 'premium']

describe('socialConnectionLimit — every plan × add-on combination', () => {
  const cases: Array<[PlanTier, boolean, number]> = [
    ['basic', false, 0],
    ['basic', true, 0], // Basic can't buy the add-on; it stays 0.
    ['pro', false, 1],
    ['pro', true, 3],
    ['premium', false, 2],
    ['premium', true, 5],
  ]
  it.each(cases)('%s (addon=%s) → %i social connections', (tier, addon, expected) => {
    expect(socialConnectionLimit(tier, addon)).toBe(expected)
  })
})

describe('socialAddonAvailable', () => {
  it('is false for Basic', () => {
    expect(socialAddonAvailable('basic')).toBe(false)
  })
  it('is true for Pro and Premium', () => {
    expect(socialAddonAvailable('pro')).toBe(true)
    expect(socialAddonAvailable('premium')).toBe(true)
  })
})

describe('socialAddonPriceCents', () => {
  it('is null for Basic (not available)', () => {
    expect(socialAddonPriceCents('basic')).toBeNull()
  })
  it('is $30/mo for Pro', () => {
    expect(socialAddonPriceCents('pro')).toBe(3000)
  })
  it('is $20/mo for Premium', () => {
    expect(socialAddonPriceCents('premium')).toBe(2000)
  })
})

describe('totalConnectionLimitIncludingGbp (= social limit + 1)', () => {
  const cases: Array<[PlanTier, boolean, number]> = [
    ['basic', false, 1],
    ['pro', false, 2],
    ['pro', true, 4],
    ['premium', false, 3],
    ['premium', true, 6],
  ]
  it.each(cases)('%s (addon=%s) → %i total including GBP', (tier, addon, expected) => {
    expect(totalConnectionLimitIncludingGbp(tier, addon)).toBe(expected)
  })
})

describe('GBP invariant', () => {
  it('Google Business is allowed on every plan tier', () => {
    expect(GBP_ALLOWED_ALL_PLANS).toBe(true)
  })
  it('GBP never counts toward the social limit (total = social + 1 on every tier)', () => {
    for (const tier of TIERS) {
      for (const addon of [false, true]) {
        expect(totalConnectionLimitIncludingGbp(tier, addon)).toBe(
          socialConnectionLimit(tier, addon) + 1,
        )
      }
    }
  })
})
