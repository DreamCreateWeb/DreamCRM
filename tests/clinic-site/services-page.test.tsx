/**
 * Smoke tests for the /services index page. Confirms the H1 carries the clinic
 * name, services group into Core vs Special sections, the Special grid is
 * hidden when the clinic offers no special services, every card deep-links to
 * its detail page (/services/<slug>), and the tier-aware Book CTA points to
 * /book for pro+ and #contact on the homepage for basic.
 *
 * `resolveClinicServices` is NOT mocked — it falls back to SERVICE_LIBRARY_SEED
 * when the DB is unavailable (as in tests), so library-linked services resolve
 * real category + routing slugs.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { ClinicService } from '@/lib/types/clinic-content'

// Default services for most tests — a mix of core + special library-linked
// services so grouping is exercised.
const MIXED_SERVICES: ClinicService[] = [
  { id: 's1', name: 'Hygiene & Cleaning', librarySlug: 'dental-hygiene' },
  { id: 's2', name: 'Teeth Whitening', librarySlug: 'teeth-whitening' },
  { id: 's3', name: 'Oral Surgery', librarySlug: 'oral-surgery' },
  { id: 's4', name: 'Dental IV Sedation', librarySlug: 'iv-sedation' },
]

function makeData(
  overrides: Partial<ClinicSiteData['profile']> = {},
  services: ClinicService[] = MIXED_SERVICES,
): ClinicSiteData {
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
      city: 'Austin',
      state: 'TX',
      postalCode: null,
      country: 'US',
      hours: null,
      planTier: 'pro',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      logoUrl: null,
      heroImageUrl: null,
      differenceVideoUrl: null,
      services: services as never,
      staff: null,
      stats: null,
      testimonials: null,
      officePhotos: null,
      faq: null,
      acceptedInsuranceCarriers: null,
      paymentMethods: null,
      financingPartners: null,
      cancellationPolicy: null,
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
    // The template-dispatching chrome resolves the active template per
    // request; a null orgId short-circuits it to the modern default with no
    // cookie/auth reads.
    getClinicThemeBySlug: vi.fn(async () => ({ orgId: null, brand: null, template: null })),
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

vi.mock('@/lib/services/careers', () => ({
  getOpenJobs: vi.fn(async () => []),
}))

import ServicesPage from '@/app/site/[slug]/services/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'

async function renderPage(data: ClinicSiteData | null = makeData()) {
  ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(data)
  const ui = await ServicesPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
  return render(ui as React.ReactElement)
}

describe('ServicesPage', () => {
  it('renders the H1 with the clinic name', async () => {
    await renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Dental services at Acme Dental/i }),
    ).toBeInTheDocument()
  })

  it('groups services into Core and Special sections', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: /^Core services\.$/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Special services\.$/i })).toBeInTheDocument()
  })

  it('lists all configured services (core + special)', async () => {
    await renderPage()
    // Each name appears in the body card AND the nav dropdown → ≥1 match.
    expect(screen.getAllByText('Hygiene & Cleaning').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Teeth Whitening').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Oral Surgery').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Dental IV Sedation').length).toBeGreaterThanOrEqual(1)
  })

  it('hides the Special grid when the clinic offers no special services', async () => {
    const coreOnly: ClinicService[] = [
      { id: 's1', name: 'Hygiene & Cleaning', librarySlug: 'dental-hygiene' },
      { id: 's2', name: 'Teeth Whitening', librarySlug: 'teeth-whitening' },
    ]
    await renderPage(makeData({}, coreOnly))
    expect(screen.getByRole('heading', { name: /^Core services\.$/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /^Special services\.$/i }),
    ).not.toBeInTheDocument()
  })

  it('cards deep-link to the service detail page (/services/<slug>)', async () => {
    await renderPage()
    const links = screen.getAllByRole('link')
    const detailHrefs = links
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => Boolean(h && h.includes('/services/')))
    expect(detailHrefs).toContain('/site/acme-dental/services/teeth-whitening')
    expect(detailHrefs).toContain('/site/acme-dental/services/oral-surgery')
  })

  it('renders a "Learn more" CTA per card', async () => {
    await renderPage()
    expect(screen.getAllByText(/Learn more/i).length).toBeGreaterThanOrEqual(4)
  })

  it('tier-gated Book CTA points to /book for pro tier', async () => {
    await renderPage(makeData({ planTier: 'pro' }))
    const bookLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental/book')
    expect(bookLinks.length).toBeGreaterThan(0)
  })

  it('tier-gated Book CTA points to homepage #contact for basic tier', async () => {
    await renderPage(makeData({ planTier: 'basic' }))
    const bookLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/acme-dental#contact')
    expect(bookLinks.length).toBeGreaterThan(0)
    // …and there's no /book link anywhere on a basic-tier services page.
    expect(
      screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/site/acme-dental/book'),
    ).toHaveLength(0)
  })

  it('renders an honest empty state — never phantom services — when none are configured', async () => {
    await renderPage(makeData({ services: null as never }, []))
    // No placeholder/fallback services may appear: they had no library
    // content behind them and rendered broken detail pages on new clinics.
    expect(screen.queryByText('Cleanings & Exams')).not.toBeInTheDocument()
    expect(screen.queryByText('Cosmetic Dentistry')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Core services\.$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^Special services\.$/i })).not.toBeInTheDocument()
    // Honest public copy instead…
    expect(screen.getByText(/putting our full service menu together/i)).toBeInTheDocument()
    // …and a Studio-only (dc-edit-only) prompt to add services from the library.
    const prompt = screen.getByText(/\+ Add your services/i)
    expect(prompt.className).toContain('dc-edit-only')
  })

  // ── Wave 4: contrast floor ─────────────────────────────────────────────
  it('renders the H1 with a CONTRAST-SAFE fill for a pale brand (not the raw pale hex)', async () => {
    // A pale mint brand would be unreadable as a heading on the #FAF7F2 ground;
    // readableInk darkens it. The H1 must NOT carry the raw pale value.
    await renderPage(makeData({ brandColor: '#CFE8D6' }))
    const h1 = screen.getByRole('heading', { level: 1, name: /Dental services at/i })
    const color = (h1 as HTMLElement).style.color
    // happy-dom serializes the inline color; it should be a darkened value, not
    // the raw pale brand. Assert it's set and isn't the pale source.
    expect(color).toBeTruthy()
    expect(color.replace(/\s/g, '').toLowerCase()).not.toContain('#cfe8d6')
    // The pale-mint string also shouldn't appear (rgb form) — a crude guard
    // that we didn't fall through to the raw brand.
    expect(color.toLowerCase()).not.toBe('rgb(207, 232, 214)')
  })

  // ── Wave 4: continuous Core→Special numbering ──────────────────────────
  it('numbers services continuously across Core then Special (no restart at 01)', async () => {
    // MIXED_SERVICES → 2 core (Hygiene, Whitening) + 2 special (Oral Surgery,
    // IV Sedation). Continuous numbering means Special starts at 03, so we see
    // 01,02,03,04 — and crucially NOT two "01"s.
    const { container } = await renderPage()
    const nums = Array.from(container.querySelectorAll('span[aria-hidden="true"]'))
      .map((el) => el.textContent?.trim())
      .filter((t): t is string => !!t && /^\d{2}$/.test(t))
    expect(nums).toContain('01')
    expect(nums).toContain('03')
    // No duplicate "01" — the Special grid did NOT restart.
    expect(nums.filter((n) => n === '01')).toHaveLength(1)
  })

  // ── Wave 4: services ItemList JSON-LD ──────────────────────────────────
  it('emits an ItemList of MedicalProcedure JSON-LD for the services', async () => {
    const { container } = await renderPage()
    const scripts = Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    const parsed = scripts.map((s) => JSON.parse(s.textContent || '{}'))
    const itemList = parsed.find((p) => p['@type'] === 'ItemList')
    expect(itemList).toBeTruthy()
    const firstItem = itemList.itemListElement[0].item
    expect(firstItem['@type']).toBe('MedicalProcedure')
  })

  it('omits the services JSON-LD when there are no services', async () => {
    const { container } = await renderPage(makeData({ services: null as never }, []))
    const scripts = Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    const hasItemList = scripts
      .map((s) => JSON.parse(s.textContent || '{}'))
      .some((p) => p['@type'] === 'ItemList')
    expect(hasItemList).toBe(false)
  })
})
