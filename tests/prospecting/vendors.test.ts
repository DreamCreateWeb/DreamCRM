import { describe, it, expect } from 'vitest'
import { detectVendors, consolidationEstimate } from '@/lib/prospect-vendors'

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
  it('sums cost and picks Premium when a marketing/recall tool is present', () => {
    const est = consolidationEstimate([
      { name: 'NexHealth', category: 'booking', estMonthly: 300 },
      { name: 'RevenueWell', category: 'marketing', estMonthly: 350 },
    ])
    expect(est.detectedMonthly).toBe(650)
    expect(est.ourPlanName).toBe('Premium')
    expect(est.ourPlanPrice).toBe(500)
    expect(est.monthlySavings).toBe(150)
  })

  it('picks Pro for a booking/reviews stack with no marketing', () => {
    const est = consolidationEstimate([
      { name: 'LocalMed', category: 'booking', estMonthly: 250 },
      { name: 'Birdeye', category: 'reviews', estMonthly: 300 },
    ])
    expect(est.ourPlanName).toBe('Pro')
    expect(est.monthlySavings).toBe(550 - 250)
  })

  it('picks Basic for a site host only, and never goes negative', () => {
    const est = consolidationEstimate([{ name: 'Wix', category: 'site', estMonthly: 30 }])
    expect(est.ourPlanName).toBe('Basic')
    expect(est.monthlySavings).toBe(0) // 30 - 150 floored at 0
  })

  it('3+ categories escalates to Premium', () => {
    const est = consolidationEstimate([
      { name: 'LocalMed', category: 'booking', estMonthly: 250 },
      { name: 'Birdeye', category: 'reviews', estMonthly: 300 },
      { name: 'JotForm', category: 'forms', estMonthly: 40 },
    ])
    expect(est.categoryCount).toBe(3)
    expect(est.ourPlanName).toBe('Premium')
  })
})
