import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

/**
 * THE PLAN-GATE GUARD (2026-07-25).
 *
 * DreamCRM sells ONE plan. `PURCHASABLE_PLANS` is Premium-only, every clinic
 * creation path provisions `planTier: 'premium'`, and the trial is full
 * Premium — so tier comparison is a branch that always resolves the same way.
 * Worse, the old `?? 'basic'` fallbacks were live trapdoors: a null tier
 * silently cost a clinic its public booking page, the booking links in its
 * appointment + campaign email, and half its sidebar.
 *
 * The rule: ACCESS TO THE APP IS ACCESS TO THE WHOLE APP. This test fails the
 * build if plan gating creeps back in any of its historical shapes.
 *
 * What is NOT plan gating and stays legal (see ALLOWLIST):
 *   - ADD-ON entitlements — the social-connection cap someone actually pays
 *     extra for (lib/services/social-billing.ts, lib/types/social-entitlements).
 *   - BILLING STATE — trial/past-due/canceled walls ("are you a customer",
 *     not "which tier").
 *   - Stripe plan CONFIG + platform-side reporting that counts orgs by tier.
 */

const ROOT = resolve(__dirname, '../..')
const SCAN_DIRS = ['app', 'lib', 'components']

/** Files allowed to mention a tier — add-on entitlements, billing config,
 *  platform reporting, and this guard's own documentation. */
const ALLOWLIST = [
  'lib/stripe-config.ts', // the plan catalog itself (Premium-only purchase)
  'lib/types/social-entitlements.ts', // add-on caps per tier
  'lib/services/social-billing.ts', // add-on purchase/cancel
  'lib/modules/types.ts', // PlanTier type still exists for the column
  'lib/modules/index.ts', // carries the "no plan gating" doctrine comment
  'lib/services/projects.ts', // platform reporting: count clinics by tier
  'lib/services/clinic-provisioning.ts', // provisioning writes the tier
  'lib/db/schema/platform.ts', // the column + its comment
  'app/(default)/settings/billing', // the purchase surface
  'app/(default)/ecommerce', // platform-side subscription views
  'app/(onboarding)', // signup writes premium
  'app/(marketing)', // public pricing page
  'lib/services/platform-metrics.ts', // platform reporting: clinics by tier
  'lib/prospect-vendors.ts', // outbound sales copy naming OUR plan
  'lib/services/billing.ts', // maps a Stripe price back to its plan
  'lib/services/clinics.ts', // platform clinic-list row display
  'lib/services/referrals.ts', // partner commission reporting
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

const FILES = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
  .map((f) => relative(ROOT, f))
  .filter((f) => !ALLOWLIST.some((a) => f.startsWith(a)))

function offenders(pattern: RegExp): string[] {
  const hits: string[] = []
  for (const f of FILES) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    for (const [i, line] of Array.from(src.split('\n').entries())) {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue
      if (pattern.test(line)) hits.push(`${f}:${i + 1}  ${line.trim()}`)
    }
  }
  return hits
}

describe('no plan gating (single-plan reality)', () => {
  it('no module declares a minPlan', () => {
    expect(offenders(/\bminPlan\b/)).toEqual([])
  })

  it('no requirePlan / planAllows gate exists', () => {
    expect(offenders(/\b(requirePlan|planAllows|planAtLeast|planMeets)\s*\(/)).toEqual([])
  })

  it('nothing branches on a plan tier', () => {
    // e.g. `planTier === 'premium'`, `tier !== 'basic'`, `plan === 'pro'`
    expect(offenders(/\b(planTier|tier|plan)\s*[=!]==?\s*['"](basic|pro|premium)['"]/)).toEqual([])
  })

  it("no ?? 'basic' fallback (the silent-downgrade trapdoor)", () => {
    expect(offenders(/\?\?\s*['"]basic['"]/)).toEqual([])
  })

  it('no PLAN_ORDER / plan-rank ladder outside the allowlist', () => {
    expect(offenders(/\b(PLAN_ORDER|PLAN_RANK)\b/)).toEqual([])
  })

  it('the plan column defaults to premium (not the old basic trapdoor)', () => {
    const schema = readFileSync(join(ROOT, 'lib/db/schema/platform.ts'), 'utf8')
    expect(schema).toContain("planTier: text('plan_tier').default('premium')")
  })

  it('only Premium is purchasable — the premise this guard rests on', () => {
    const cfg = readFileSync(join(ROOT, 'lib/stripe-config.ts'), 'utf8')
    expect(cfg).toContain("PLANS.filter((p) => p.id === 'premium')")
  })
})
