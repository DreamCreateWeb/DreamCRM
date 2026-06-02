/**
 * Smoke tests for the /faq page. Confirms the H1, the category-tab nav, and
 * that the universal DEFAULT_FAQ_ITEMS render when the clinic has no
 * customized FAQ — and that clinic-customized FAQ items replace the defaults
 * when the column is populated.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import { DEFAULT_FAQ_ITEMS } from '@/lib/types/clinic-content'

function makeData(overrides: Partial<ClinicSiteData['profile']> = {}): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Acme Dental',
    slug: 'acme-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      legalName: null,
      displayName: 'Acme Dental',
      tagline: null,
      about: null,
      npi: null,
      brandColor: '#9CAF9F',
      template: 'modern',
      phone: '(555) 555-0100',
      email: null,
      websiteDomain: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      country: 'US',
      hours: null,
      planTier: 'pro',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      logoUrl: null,
      heroImageUrl: null,
      services: null,
      staff: null,
      stats: null,
      testimonials: null,
      officePhotos: null,
      faq: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as ClinicSiteData['profile'],
  }
}

vi.mock('@/lib/services/clinic-site', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/clinic-site')>(
    '@/lib/services/clinic-site',
  )
  return {
    ...actual,
    getClinicSiteBySlug: vi.fn(),
    resolveSiteBasePath: vi.fn(async () => '/site/acme-dental'),
    appBaseUrl: vi.fn(() => 'https://app.example.com'),
    publicSiteUrl: vi.fn(() => 'https://dreamcreatestudio.com/site/acme-dental'),
  }
})

vi.mock('@/lib/services/blog', () => ({
  listPublishedPosts: vi.fn(async () => []),
}))

vi.mock('@/lib/services/membership', () => ({
  listActivePlans: vi.fn(async () => []),
}))

import FaqPage from '@/app/site/[slug]/faq/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(data: ClinicSiteData | null = makeData()) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  const ui = await FaqPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('FaqPage', () => {
  it('renders the H1 "Frequently asked questions"', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Frequently asked questions/i }),
    ).toBeInTheDocument()
  })

  it('renders category-tab nav links jumping to each category anchor', async () => {
    await renderPage()
    const links = screen.getAllByRole('link')
    expect(links.some((a) => a.getAttribute('href') === '#category-booking')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '#category-your-visit')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '#category-insurance')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '#category-office')).toBe(true)
    expect(links.some((a) => a.getAttribute('href') === '#category-billing')).toBe(true)
  })

  it('renders every DEFAULT_FAQ_ITEMS question when faq column is null', async () => {
    await renderPage()
    for (const item of DEFAULT_FAQ_ITEMS) {
      expect(screen.getByText(item.question)).toBeInTheDocument()
    }
  })

  it('renders the actual answers in the accordion bodies', async () => {
    await renderPage()
    // Pick a couple distinctive default answers to spot-check.
    expect(
      screen.getByText(/New patients usually find a time within the same week/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/We accept most major PPO plans/i),
    ).toBeInTheDocument()
  })

  it('renders clinic-customized FAQ items when the faq column is populated', async () => {
    const custom = [
      {
        id: 'c1',
        category: 'Booking',
        question: 'Do you offer Saturday hours?',
        answer: 'Yes — Saturdays 9 to 1 every other week.',
      },
      {
        id: 'c2',
        category: 'Office',
        question: 'Where do I park?',
        answer: 'Free lot behind the building, accessible via Pearl Street.',
      },
    ]
    await renderPage(makeData({ faq: custom as never }))
    expect(screen.getByText('Do you offer Saturday hours?')).toBeInTheDocument()
    expect(screen.getByText(/Saturdays 9 to 1 every other week/)).toBeInTheDocument()
    expect(screen.getByText('Where do I park?')).toBeInTheDocument()
    // …and none of the default questions are shown when the clinic has its own.
    expect(screen.queryByText('How do I book my first visit?')).not.toBeInTheDocument()
  })

  it('treats an empty faq array as "no custom faq" and renders the defaults', async () => {
    // Edge case: an empty array is semantically the same as null — the clinic
    // has no overrides — so the universal DEFAULT_FAQ_ITEMS must still surface
    // instead of leaving the page empty.
    await renderPage(makeData({ faq: [] as never }))
    for (const item of DEFAULT_FAQ_ITEMS) {
      expect(screen.getByText(item.question)).toBeInTheDocument()
    }
  })

  it('emits FAQPage JSON-LD that mirrors the rendered FAQ items', async () => {
    const { container } = await renderPage()
    const scripts = container.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    )
    expect(scripts.length).toBeGreaterThan(0)
    const payload = JSON.parse(scripts[0].textContent || '{}') as {
      '@context'?: string
      '@type'?: string
      mainEntity?: Array<{
        '@type'?: string
        name?: string
        acceptedAnswer?: { '@type'?: string; text?: string }
      }>
    }
    expect(payload['@context']).toBe('https://schema.org')
    expect(payload['@type']).toBe('FAQPage')
    expect(payload.mainEntity).toBeInstanceOf(Array)
    expect(payload.mainEntity!.length).toBe(DEFAULT_FAQ_ITEMS.length)
    expect(payload.mainEntity![0]['@type']).toBe('Question')
    expect(payload.mainEntity![0].name).toBe(DEFAULT_FAQ_ITEMS[0].question)
    expect(payload.mainEntity![0].acceptedAnswer?.['@type']).toBe('Answer')
    expect(payload.mainEntity![0].acceptedAnswer?.text).toBe(DEFAULT_FAQ_ITEMS[0].answer)
  })
})
