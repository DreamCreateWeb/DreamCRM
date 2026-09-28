import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
 *   Plan    | GBP | Free social | Add-on | Social limit (base → +addon)
 *   Basic   |  ✓  |     0       |  none  |  0
 *   Pro     |  ✓  |     1       | $30/mo |  1 → 3
 *   Premium |  ✓  |     2       | $20/mo |  2 → 5
 * GBP is free + separate on every tier and never counts toward the social limit.
 *
 * THE PLAN PRICES ARE GONE FROM THAT TABLE — see the pin at the bottom of this
 * file. This copy of it said `Basic ($99) | Pro ($149) | Premium ($199)`, which
 * is a THIRD set of numbers: not the live config ($200), and not even the stale
 * set the module's own docblock carried ($150/$250/$500). Two files, three
 * prices, one plan. That is what a number copied for readability costs
 * (DREAMCRM-122).
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

/**
 * THE PIN, AND WHY IT IS A PIN RATHER THAN A RULE (DREAMCRM-122).
 *
 * This module's header priced the tiers `Basic ($150) | Pro ($250) | Premium
 * ($500)` — the 2026-07-02 reprice that was never executed Stripe-side. Two of
 * those tiers are retired out of self-serve and the third costs $200, so a
 * reader trusting the table would have quoted a price no clinic can buy.
 *
 * The tree-wide rule (`tests/marketing/pricing-price-source.test.tsx`)
 * deliberately does NOT grade comments, and that was re-measured rather than
 * assumed: inverting the stripper over the same three roots returns 39 hits,
 * 38 of them sentences explaining that very rule, and the narrow predicates
 * that fit this one case return exactly the lines of the file they were
 * written against. A rule fitted to one instance is the hand-kept list in a
 * regex, so the class is declined with its number written down and THIS file
 * is pinned instead. The trigger for revisiting is a SECOND price-in-a-docblock
 * defect — read the header of `plan-price-literals.ts`.
 *
 * Scope is deliberately this module only, and the subject is the PLAN. The
 * add-on prices below stay: `SOCIAL_ADDON_PRICE_CENTS` is their one home, so
 * naming them here is a docblock describing its own file.
 */
describe('the docblock does not price the plan — DREAMCRM-122', () => {
  const source = readFileSync(join(process.cwd(), 'lib/types/social-entitlements.ts'), 'utf8')

  it('prices no plan tier in the entitlements table', () => {
    // The `\|` is what makes this the TABLE rather than any sentence opening
    // with a tier name — `totalConnectionLimitIncludingGbp`'s own docblock
    // starts a line "Basic 1, Pro 2 (→4 with add-on)…", which is prose about
    // connection counts and has no business in this count.
    const table = source
      .split('\n')
      .filter((l) => /^\s*\*\s+(Basic|Pro|Premium)\b.*\|/.test(l))
    expect(table.length, 'the spec table moved — re-point this pin at wherever it lives').toBe(3)
    for (const row of table) {
      // The row may still name the ADD-ON price; what it may not do is put a
      // price on the TIER, which is the `Premium ($500)` shape.
      expect(
        row,
        'A plan price on a tier row. The plan price lives in lib/stripe-config.ts and is ' +
          'resolved through getQuotedPlan(); a copy here goes stale silently, because nothing ' +
          'renders this table and nobody re-reads a docblock at a reprice.',
      ).not.toMatch(/(Basic|Pro|Premium)\s*\(\s*\$/)
    }
  })

  it('still names the ADD-ON prices, which this module IS the home of', () => {
    // The premise check: an assertion that something is ABSENT passes just as
    // well over a table somebody deleted. If these go, the test above is
    // grading nothing.
    expect(source).toContain('$30/mo')
    expect(source).toContain('$20/mo')
    expect(socialAddonPriceCents('pro')).toBe(3000)
    expect(socialAddonPriceCents('premium')).toBe(2000)
  })
})
