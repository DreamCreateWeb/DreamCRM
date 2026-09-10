import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * THE ONE-MRR-NUMBER GUARD (DREAMCRM-23).
 *
 * `TIER_PRICES_CENTS` existed in THREE copies. `clinics.ts` and `projects.ts`
 * said {basic 9900, pro 14900, premium 19900}; `platform-metrics.ts` said
 * {basic 15000, pro 25000, premium 20000}, with premium priced BELOW pro —
 * almost certainly a stale edit nobody noticed, because nothing made the
 * three agree. Two platform dashboards reported different MRR from the same
 * tenants, and neither matched what any clinic was actually charged.
 *
 * The rule: RECURRING REVENUE COMES FROM STRIPE. A hardcoded tier→price map
 * is a second source of truth for money, and a second source of truth for
 * money is how this happened. `lib/services/platform-mrr.ts` is the one
 * derivation; `lib/mrr.ts` is the one piece of cadence arithmetic.
 *
 * What is NOT an MRR price table and stays legal:
 *   - `lib/stripe-config.ts` — the DISPLAY prices on the pricing page and the
 *     Stripe Price ids. That file is about what we ASK for; MRR is about what
 *     clinics actually pay, which only Stripe knows.
 *   - Test fixtures, which have to say a number somewhere.
 */

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = ['app', 'lib', 'components']

/** Files allowed to carry per-tier money — each with the reason it is not MRR. */
const ALLOWLIST = new Set([
  // The pricing page's list prices + the Stripe Price ids. Display, not MRR.
  'lib/stripe-config.ts',
  // Per-tier social-CONNECTION caps and the add-on SKU's own prices. A
  // separate thing a clinic pays extra for, not the plan's recurring revenue.
  'lib/types/social-entitlements.ts',
  // The prospecting deal room's "what one DreamCRM plan would cost you"
  // comparison. Not MRR — it is a sales pitch about a practice that is not a
  // customer yet — but it IS a fourth copy of a tier→price map and it has
  // already drifted: it quotes premium at $500 while PLANS says $200 (500 is
  // the struck-through list price). Filed on the R1·S2 ledger for the
  // prospecting lane rather than repriced here; changing what a prospect is
  // quoted is a product decision, not a cleanup.
  'lib/prospect-vendors.ts',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

function sourceFiles(): Array<{ rel: string; src: string }> {
  return SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
    .map((full) => ({ rel: relative(ROOT, full).replace(/\\/g, '/'), src: readFileSync(full, 'utf8') }))
    .filter((f) => !ALLOWLIST.has(f.rel))
}

/** `{ basic: 9900, pro: 14900, premium: 19900 }` in any spacing or order. */
const TIER_PRICE_MAP =
  /\{[^{}]*\b(basic|pro|premium)\s*:\s*\d{3,}[^{}]*\b(basic|pro|premium)\s*:\s*\d{3,}[^{}]*\}/

describe('one MRR number', () => {
  it('no file hardcodes a tier→price map', () => {
    const offenders = sourceFiles()
      .filter((f) => TIER_PRICE_MAP.test(f.src))
      .map((f) => f.rel)
    expect(
      offenders,
      'Recurring revenue comes from Stripe (lib/services/platform-mrr.ts), not a price table',
    ).toEqual([])
  })

  it('nothing is named TIER_PRICES again', () => {
    const offenders = sourceFiles()
      .filter((f) => /TIER_PRICES/.test(f.src))
      .map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  it('only platform-mrr derives platform recurring revenue', () => {
    // Every MRR surface reads getPlatformMrr. A second module summing
    // subscriptions itself is how the dashboards drifted apart.
    const offenders = sourceFiles()
      .filter((f) => f.rel !== 'lib/services/platform-mrr.ts')
      .filter((f) => /monthlyContributionCents\s*\(/.test(f.src))
      .filter((f) => f.rel !== 'lib/services/stripe-admin.ts')
      .map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  it('the cadence arithmetic has exactly one home', () => {
    const offenders = sourceFiles()
      .filter((f) => f.rel !== 'lib/mrr.ts')
      // The historical shape: dividing an annual price by twelve by hand.
      .filter((f) => /unitAmount\w*\s*\/\s*12\b/.test(f.src))
      .map((f) => f.rel)
    expect(offenders).toEqual([])
  })
})
