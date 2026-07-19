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
import { MARKETING_NAV, MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import WhyPage from '@/app/(marketing)/why/page'

describe('marketing home', () => {
  it('renders the hero + the single founding-rate teaser for signed-out visitors', async () => {
    render(await MarketingHome())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/one calm system/i)
    // One plan (2026-07-19): the $500 list price struck through next to $200.
    expect(screen.getAllByText('$200').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$500').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/founding practice rate/i).length).toBeGreaterThanOrEqual(1)
    // Never sold as unfinished: the word "beta" must not appear anywhere.
    expect(screen.queryByText(/beta/i)).toBeNull()
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
  it('renders the single founding-rate card with the struck list price and everything included', () => {
    render(<PricingPage />)
    // One plan (2026-07-19): $500 struck through, $200 founding rate, with a
    // monthly/annual toggle (annual = 2 months free per the house convention).
    expect(screen.getAllByText('$200').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$500').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/founding practice rate/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: /monthly/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /annual/i })).toBeInTheDocument()
    // No tier names, no "beta" — the platform is one finished product.
    expect(screen.queryByText(/most popular/i)).toBeNull()
    expect(screen.queryByText(/beta/i)).toBeNull()
    // Formerly premium-gated rows now sit in the everything-included list.
    expect(screen.getByText('Open Dental two-way sync (official API)')).toBeInTheDocument()
    expect(screen.getByText('Recall & outreach campaigns')).toBeInTheDocument()
    expect(screen.getByText('Careers page + applicant tracking')).toBeInTheDocument()
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

describe('why page (the manifesto)', () => {
  it('renders the identity claim and the beliefs, and is publicly routable', () => {
    render(<WhyPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /patient-relationship platform for dental practices/i,
    )
    expect(screen.getByText('Dental-only, on purpose, forever')).toBeInTheDocument()
    expect(screen.getByText(/We wrap your PMS/i)).toBeInTheDocument()
    expect(screen.getByText('Our gaps are marked')).toBeInTheDocument()
    expect(screen.getByText('Leaving is allowed')).toBeInTheDocument()
    // Middleware allowlist: a nav'd marketing page absent from
    // MARKETING_PUBLIC_PATHS ships auth-walled — pin the membership.
    expect(MARKETING_PUBLIC_PATHS).toContain('/why')
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
    expect(tops).toEqual(['/product', '/compare', '/why', '/pricing', '/docs'])
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
