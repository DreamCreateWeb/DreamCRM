import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RESOURCE_GUIDES, getResourceGuide } from '@/lib/marketing/resources'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import ResourcesIndexPage from '@/app/(marketing)/resources/page'
import RecallScriptsGuide from '@/app/(marketing)/resources/dental-recall-scripts/page'
import MembershipPricingGuide from '@/app/(marketing)/resources/dental-membership-plan-pricing/page'
import MorePatientsGuide from '@/app/(marketing)/resources/how-to-get-more-dental-patients/page'

/**
 * The practice-growth resource library (marketing-engine slice 4b). The
 * guides are BOFU/long-tail landing content — these tests pin that every
 * registry entry has a real page, the pages carry their original material
 * (the scripts ARE the content), and the wiring (public path) holds.
 */

describe('the resource registry', () => {
  it('every guide has a unique slug and honest metadata', () => {
    const slugs = RESOURCE_GUIDES.map((g) => g.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const g of RESOURCE_GUIDES) {
      expect(g.title.length).toBeGreaterThan(20)
      expect(g.description.length).toBeGreaterThan(50)
      expect(g.readMinutes).toBeGreaterThan(0)
      expect(g.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('/resources is a public marketing path — a guide behind the auth wall has shipped twice before', () => {
    expect(MARKETING_PUBLIC_PATHS).toContain('/resources')
  })

  it('getResourceGuide resolves known slugs and rejects junk', () => {
    expect(getResourceGuide('dental-recall-scripts')?.slug).toBe('dental-recall-scripts')
    expect(getResourceGuide('nope')).toBeUndefined()
  })
})

describe('the hub', () => {
  it('lists every registered guide with a door', () => {
    render(<ResourcesIndexPage />)
    for (const g of RESOURCE_GUIDES) {
      expect(screen.getByText(g.title)).toBeInTheDocument()
    }
    // The grader cross-link — the library feeds the same funnel.
    expect(screen.getByText('Grade your practice free')).toBeInTheDocument()
  })
})

describe('the guides carry their original material', () => {
  it('recall scripts: the real product templates + the TCPA caveat', () => {
    render(<RecallScriptsGuide />)
    // The actual reactivation subject line that ships in the product.
    expect(screen.getByText(/Has it been a minute\? Let’s get you scheduled\./)).toBeInTheDocument()
    // The compliance note is visible content, not a footnote.
    expect(screen.getByText(/TCPA/)).toBeInTheDocument()
    expect(screen.getAllByText(/Reply STOP to opt out/i).length).toBeGreaterThanOrEqual(1)
  })

  it('membership pricing: the worked math + the state-regulation caveat', () => {
    render(<MembershipPricingGuide />)
    expect(screen.getByText(/Worked example/i)).toBeInTheDocument()
    expect(screen.getByText(/illustrative numbers/i)).toBeInTheDocument()
    // The honest legal hedge stays on the page.
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument()
  })

  it('patient growth: ordered playbook, grader + recall cross-links, no rank promises', () => {
    render(<MorePatientsGuide />)
    expect(screen.getByText(/The Google listing is the front door/)).toBeInTheDocument()
    expect(screen.getByText(/Run the free grade/)).toBeInTheDocument()
    expect(screen.getByText(/dental recall scripts that get patients back/)).toBeInTheDocument()
    // The guide itself warns against rank promises — and makes none.
    expect(screen.getByText(/Nobody can promise that honestly/)).toBeInTheDocument()
  })
})
