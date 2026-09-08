import { describe, it, expect } from 'vitest'
import {
  SITE_URL,
  organizationLd,
  websiteLd,
  softwareApplicationLd,
  faqPageLd,
  breadcrumbLd,
} from '@/lib/marketing/seo'
import { PLANS } from '@/lib/stripe-config'
import { COMPARISONS, buildComparisonFaq } from '@/lib/marketing/comparisons'

/**
 * Structured-data builders for the marketing site. They drive what Google
 * shows in the SERP (rich results), so the shapes must stay schema.org-valid
 * and the prices/offers must mirror the real PLANS config.
 */

describe('marketing structured data', () => {
  it('Organization carries name, url, and logo', () => {
    const ld = organizationLd()
    expect(ld['@type']).toBe('Organization')
    expect(ld.name).toBe('Dream Create')
    expect(ld.url).toBe(SITE_URL)
    expect(ld.logo.startsWith(SITE_URL)).toBe(true)
  })

  it('WebSite points at the canonical site url', () => {
    const ld = websiteLd()
    expect(ld['@type']).toBe('WebSite')
    expect(ld.url).toBe(SITE_URL)
  })

  it('SoftwareApplication mirrors the real PLANS price band + offers', () => {
    const ld = softwareApplicationLd(PLANS)
    expect(ld['@type']).toBe('SoftwareApplication')
    const prices = PLANS.map((p) => p.price)
    expect(ld.offers.lowPrice).toBe(Math.min(...prices))
    expect(ld.offers.highPrice).toBe(Math.max(...prices))
    expect(ld.offers.offerCount).toBe(PLANS.length)
    expect(ld.offers.offers).toHaveLength(PLANS.length)
    expect(ld.offers.priceCurrency).toBe('USD')
  })

  it('FAQPage maps every Q/A to a Question with an acceptedAnswer', () => {
    const faqs = [
      { q: 'Is there a contract?', a: 'No.' },
      { q: 'Can I cancel?', a: 'Anytime.' },
    ]
    const ld = faqPageLd(faqs)
    expect(ld['@type']).toBe('FAQPage')
    expect(ld.mainEntity).toHaveLength(2)
    expect(ld.mainEntity[0]).toMatchObject({
      '@type': 'Question',
      name: 'Is there a contract?',
      acceptedAnswer: { '@type': 'Answer', text: 'No.' },
    })
  })

  it('BreadcrumbList numbers items from 1 with absolute item URLs', () => {
    const ld = breadcrumbLd([
      { name: 'Home', path: '/' },
      { name: 'Compare', path: '/compare' },
      { name: 'DreamCRM vs Weave', path: '/compare/weave' },
    ])
    expect(ld['@type']).toBe('BreadcrumbList')
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2, 3])
    expect(ld.itemListElement[2].item).toBe(`${SITE_URL}/compare/weave`)
  })
})

describe('the comparison FAQ (slice 4a — derived, honest, schema-twinned)', () => {
  it('every vendor gets the four buyer questions, derived from its own registry entry', () => {
    for (const c of COMPARISONS) {
      const faq = buildComparisonFaq(c)
      expect(faq).toHaveLength(4)
      // The pricing answer quotes the SAME hedged pricing line the page
      // shows, and always states our published price beside it.
      expect(faq[0].q).toBe(`How much does ${c.name} cost?`)
      expect(faq[0].a).toContain(c.reportedPricing)
      expect(faq[0].a).toContain('$200/mo')
      // The alternatives answer names the vendor (the query it exists for).
      expect(faq[1].q).toContain(`${c.name} alternative`)
      // The when-they-win answer concedes their real strengths — the
      // honesty bar, machine-checkable.
      expect(faq[2].a.toLowerCase()).toContain(c.theirStrengths[0].title.toLowerCase())
      // Every answer survives the FAQPage builder.
      expect(faqPageLd(faq).mainEntity).toHaveLength(4)
    }
  })

  it('the retired "official API" OD-direct claim stays out of the registry — NexHealth is THE one PMS door', () => {
    const text = JSON.stringify(COMPARISONS)
    expect(text).not.toMatch(/official API|official-API|official-path/)
    expect(text).toContain('NexHealth bridge')
  })
})
