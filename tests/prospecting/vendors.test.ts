import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectVendors, consolidationEstimate } from '@/lib/prospect-vendors'
import { PURCHASABLE_PLANS } from '@/lib/stripe-config'

/**
 * The deal room's brain — fingerprint the orbital-layer tools a practice runs
 * from their site HTML (who we'd displace), and turn that into the
 * consolidation / savings story.
 */

describe('detectVendors', () => {
  it('fingerprints real dental vendors across categories, deduped', () => {
    const html = `
      <script src="https://widget.nexhealth.com/booking.js"></script>
      <div class="podium-widget"></div>
      <script src="https://cdn.revenuewell.com/x.js"></script>
      <script src="https://widget.podium.com/again.js"></script>`
    const found = detectVendors(html).map((v) => v.name).sort()
    expect(found).toEqual(['NexHealth', 'Podium', 'RevenueWell'])
  })

  it('finds nothing in a plain custom site (no false positives)', () => {
    expect(detectVendors('<html><body><h1>Smile Dental</h1></body></html>')).toEqual([])
  })
})

describe('consolidationEstimate', () => {
  it('quotes the limited-time founding rate, not the struck-through list price', () => {
    const est = consolidationEstimate([
      { name: 'NexHealth', category: 'booking', estMonthly: 300 },
      { name: 'RevenueWell', category: 'marketing', estMonthly: 350 },
    ])
    expect(est.detectedMonthly).toBe(650)
    // The owner's decision (DREAMCRM-38): a prospect is quoted $200/mo. This
    // used to be 500 — the LIST price — from a copied tier->price map.
    expect(est.ourPlanPrice).toBe(200)
    expect(est.ourPlanListPrice).toBe(500)
    expect(est.ourPlanName).toBe('Premium')
    expect(est.monthlySavings).toBe(450)
  })

  it('reads the quote from stripe-config, so a reprice lands here too', () => {
    const plan = PURCHASABLE_PLANS[0]
    const est = consolidationEstimate([{ name: 'Wix', category: 'site', estMonthly: 30 }])
    expect(est.ourPlanPrice).toBe(plan.price)
    expect(est.ourPlanListPrice).toBe(plan.listPrice ?? null)
    expect(est.ourPlanName).toBe(plan.name)
  })

  it('quotes the one purchasable plan whatever stack they run', () => {
    // Before DREAMCRM-38 this picked a tier from the detected categories, so a
    // booking+reviews stack was quoted "Pro $250" and a site-only prospect
    // "Basic $150" - two plans that have not been sellable since the
    // 2026-07-19 single-plan collapse, one of them DEARER than the plan they
    // can actually buy.
    const stacks = [
      [{ name: 'LocalMed', category: 'booking' as const, estMonthly: 250 }],
      [
        { name: 'LocalMed', category: 'booking' as const, estMonthly: 250 },
        { name: 'Birdeye', category: 'reviews' as const, estMonthly: 300 },
      ],
      [{ name: 'Wix', category: 'site' as const, estMonthly: 30 }],
      [],
    ]
    for (const vendors of stacks) {
      const est = consolidationEstimate(vendors)
      expect(est.ourPlanName).toBe('Premium')
      expect(est.ourPlanPrice).toBe(200)
    }
  })

  it('still counts categories, and savings never go negative', () => {
    const est = consolidationEstimate([
      { name: 'LocalMed', category: 'booking', estMonthly: 250 },
      { name: 'Birdeye', category: 'reviews', estMonthly: 300 },
      { name: 'JotForm', category: 'forms', estMonthly: 40 },
    ])
    expect(est.categoryCount).toBe(3)
    expect(est.monthlySavings).toBe(590 - 200)
    // A prospect who runs one $30 site builder is not "saving" anything.
    expect(consolidationEstimate([{ name: 'Wix', category: 'site', estMonthly: 30 }]).monthlySavings).toBe(0)
  })

  it('carries no plan-price literal of its own', () => {
    // The defect this closes was a COPY of the plan prices that drifted. A
    // guard on the shape of the copy is not enough - a single
    // `const PREMIUM = 200` would pass tests/guards/one-mrr-number.ts - so pin
    // that the only plan money in this file arrives by import.
    const src = readFileSync(resolve(__dirname, '../../lib/prospect-vendors.ts'), 'utf8')
    const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(body).toContain("from '@/lib/stripe-config'")
    const planMoney = body.match(/\b(?:basic|pro|premium|plan|list)\w*\s*[:=]\s*\d+/gi) ?? []
    expect(planMoney, 'plan prices come from stripe-config, never a literal here').toEqual([])
  })
})
