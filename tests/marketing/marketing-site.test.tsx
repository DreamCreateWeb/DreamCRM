import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * Marketing site v2 — multi-page SaaS site. Covers: the home page's
 * conversion path (signed-out render, sign-in/up entries, pricing from the
 * real PLANS config), the pricing matrix, vendor comparison pages, docs
 * rendering, and the content-config integrity rules (unique slugs, honest
 * structure) that keep /compare and /docs coherent as they grow.
 */

vi.mock('@/lib/auth/context', () => ({
  getTenantContext: vi.fn(async () => null),
}))
vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(async () => null),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import MarketingHome from '@/app/(marketing)/page'
import PricingPage from '@/app/(marketing)/pricing/page'
import ComparePage from '@/app/(marketing)/compare/[vendor]/page'
import DocArticlePage from '@/app/(marketing)/docs/[slug]/page'
import { PLANS } from '@/lib/stripe-config'
import { COMPARISONS, getComparison } from '@/lib/marketing/comparisons'
import { DOCS, DOC_CATEGORIES, getDoc } from '@/lib/marketing/docs'
import { MARKETING_NAV } from '@/lib/marketing/site'

describe('marketing home', () => {
  it('renders the hero + plan prices from the real PLANS config for signed-out visitors', async () => {
    render(await MarketingHome())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/one calm system/i)
    for (const plan of PLANS) {
      expect(screen.getAllByText(`$${plan.price}`).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('links every comparison teaser to its page', async () => {
    render(await MarketingHome())
    for (const c of COMPARISONS) {
      const links = screen
        .getAllByRole('link')
        .filter((l) => l.getAttribute('href') === `/compare/${c.slug}`)
      expect(links.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('redirects signed-in clinic staff to the dashboard', async () => {
    const { getTenantContext } = await import('@/lib/auth/context')
    vi.mocked(getTenantContext).mockResolvedValueOnce({ tenantType: 'clinic' } as never)
    await expect(MarketingHome()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
  })

  it('redirects patients to the portal', async () => {
    const { getTenantContext } = await import('@/lib/auth/context')
    vi.mocked(getTenantContext).mockResolvedValueOnce({ tenantType: 'patient' } as never)
    await expect(MarketingHome()).rejects.toThrow('NEXT_REDIRECT:/patient/dashboard')
  })

  it('sends a session without an org to resume onboarding', async () => {
    const { getServerSession } = await import('@/lib/session')
    vi.mocked(getServerSession).mockResolvedValueOnce({ user: { id: 'u1' } } as never)
    await expect(MarketingHome()).rejects.toThrow('NEXT_REDIRECT:/onboarding-01')
  })
})

describe('pricing page', () => {
  it('renders every plan with its monthly price and the tier matrix', () => {
    render(<PricingPage />)
    for (const plan of PLANS) {
      expect(screen.getAllByText(`$${plan.price}`).length).toBeGreaterThanOrEqual(1)
    }
    // Annual prices are live in Stripe checkout — the page advertises 2 months free.
    expect(screen.queryByText(/annual billing coming soon/i)).toBeNull()
    for (const plan of PLANS) {
      expect(
        screen.getByText(`or $${plan.annualPrice.toLocaleString('en-US')}/yr — 2 months free`),
      ).toBeInTheDocument()
    }
    // Plan-card CTAs carry the picked plan into signup → onboarding.
    for (const plan of PLANS) {
      expect(screen.getByRole('link', { name: `Choose ${plan.name}` })).toHaveAttribute(
        'href',
        `/signup?plan=${plan.id}`,
      )
    }
    // Premium-only rows render in the matrix (also present in plan-card
    // feature lists, hence getAllByText).
    expect(screen.getByText('Open Dental two-way sync (official API)')).toBeInTheDocument()
    expect(screen.getAllByText('Recall & outreach campaigns').length).toBeGreaterThanOrEqual(1)
  })
})

describe('comparison pages', () => {
  it('renders the Weave comparison with both columns + honest strengths', async () => {
    render(await ComparePage({ params: Promise.resolve({ vendor: 'weave' }) }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('DreamCRM vs Weave')
    expect(screen.getByText(/Where Weave shines/i)).toBeInTheDocument()
    expect(screen.getByText(/Where DreamCRM wins/i)).toBeInTheDocument()
    // The matrix shows our honest "no"s too.
    expect(screen.getByText('VoIP phones')).toBeInTheDocument()
    expect(screen.getByText(/Keep your existing phone system/i)).toBeInTheDocument()
  })

  it('404s an unknown vendor', async () => {
    await expect(ComparePage({ params: Promise.resolve({ vendor: 'dentrix-cloud-9000' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })
})

describe('docs pages', () => {
  it('renders an article with numbered steps and related links', async () => {
    render(await DocArticlePage({ params: Promise.resolve({ slug: 'connecting-open-dental' }) }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connecting Open Dental')
    expect(screen.getByText(/official API/i)).toBeInTheDocument()
    expect(screen.getByText(/What never syncs/i)).toBeInTheDocument()
  })

  it('404s an unknown slug', async () => {
    await expect(DocArticlePage({ params: Promise.resolve({ slug: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('content config integrity', () => {
  it('comparison slugs are unique and resolvable', () => {
    const slugs = COMPARISONS.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('every comparison has the full 13-row matrix and at least 3 honest vendor strengths', () => {
    for (const c of COMPARISONS) {
      expect(c.matrix).toHaveLength(13)
      expect(c.theirStrengths.length).toBeGreaterThanOrEqual(3)
      expect(c.ourStrengths.length).toBeGreaterThanOrEqual(3)
      expect(c.reportedPricing.toLowerCase()).toMatch(/reported|custom/)
    }
  })

  it('our SMS row is honestly "no" in every comparison until the channel ships', () => {
    for (const c of COMPARISONS) {
      const sms = c.matrix.find((r) => r.feature.includes('SMS'))
      expect(sms, `${c.slug} must keep an SMS row`).toBeDefined()
      expect(sms!.dreamcrm).toBe('no')
      // And never claim registration is in progress — it has not started.
      expect(sms!.dreamcrmNote ?? '').not.toMatch(/registration/i)
    }
  })

  it('doc slugs are unique, categorized, and resolvable', () => {
    const slugs = DOCS.map((d) => d.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const d of DOCS) {
      expect(DOC_CATEGORIES).toContain(d.category)
      expect(d.sections.length).toBeGreaterThan(0)
    }
  })

  it('nav links point at real top-level marketing routes', () => {
    const tops = MARKETING_NAV.map((n) => n.href)
    expect(tops).toEqual(['/product', '/compare', '/pricing', '/docs'])
    // Every Compare child resolves to a real comparison page.
    for (const child of MARKETING_NAV.find((n) => n.label === 'Compare')!.children!) {
      expect(getComparison(child.href.replace('/compare/', ''))).toBeDefined()
    }
    // Every internal Resources doc link resolves to a real article.
    for (const child of MARKETING_NAV.find((n) => n.label === 'Resources')!.children!) {
      if (child.href.startsWith('/docs/')) {
        expect(getDoc(child.href.replace('/docs/', ''))).toBeDefined()
      }
    }
    // Product megamenu anchors all point into /product.
    for (const child of MARKETING_NAV.find((n) => n.label === 'Product')!.children!) {
      expect(child.href.startsWith('/product#')).toBe(true)
    }
  })
})
