import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ModernTemplate from '@/components/clinic-site/modern-template'
import type { ClinicSiteData } from '@/lib/services/clinic-site'

function makeData(overrides: Partial<ClinicSiteData['profile']> = {}): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Test Dental',
    slug: 'test-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      legalName: null,
      displayName: 'Test Dental',
      tagline: 'Caring for smiles',
      about: 'We are a friendly local dentist office.',
      npi: null,
      brandColor: '#6d28d9',
      template: 'modern',
      phone: '(555) 123-4567',
      email: 'hello@test.com',
      websiteDomain: null,
      addressLine1: null,
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: null,
      country: 'US',
      hours: { mon: { open: '09:00', close: '17:00' } },
      planTier: 'basic',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as ClinicSiteData['profile'],
  }
}

describe('ModernTemplate', () => {
  it('renders the clinic display name as the H1', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    expect(screen.getByRole('heading', { level: 1, name: /Test Dental/ })).toBeInTheDocument()
  })

  it('renders the tagline', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    expect(screen.getAllByText('Caring for smiles').length).toBeGreaterThan(0)
  })

  it('shows phone number and tel link', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const phoneLinks = screen.getAllByRole('link', { name: /\(555\) 123-4567/ })
    expect(phoneLinks.length).toBeGreaterThan(0)
    phoneLinks.forEach((link) => {
      expect(link).toHaveAttribute('href', 'tel:(555) 123-4567')
    })
  })

  it('uses Request CTA for basic-plan clinics (no booking link)', () => {
    render(<ModernTemplate data={makeData({ planTier: 'basic' })} basePath="/site/test" />)
    const requestLinks = screen.getAllByRole('link', { name: /Request/i })
    expect(requestLinks.length).toBeGreaterThan(0)
    // No links to /book on the basic tier
    expect(
      screen.queryAllByRole('link').filter((a) => a.getAttribute('href') === '/site/test/book'),
    ).toHaveLength(0)
  })

  it('shows Book CTA for pro+ clinics pointing to /book', () => {
    render(<ModernTemplate data={makeData({ planTier: 'pro' })} basePath="/site/test" />)
    const bookLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/test/book')
    expect(bookLinks.length).toBeGreaterThan(0)
  })

  it('shows booking link for premium clinics too', () => {
    render(<ModernTemplate data={makeData({ planTier: 'premium' })} basePath="/site/test" />)
    const bookLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/site/test/book')
    expect(bookLinks.length).toBeGreaterThan(0)
  })

  it('omits about section when not provided', () => {
    render(<ModernTemplate data={makeData({ about: null })} basePath="/site/test" />)
    expect(screen.queryByText('About Us')).not.toBeInTheDocument()
  })

  it('formats hours in 12-hour format', () => {
    render(
      <ModernTemplate
        data={makeData({ hours: { mon: { open: '09:00', close: '17:00' } } as never })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText(/9:00 AM – 5:00 PM/)).toBeInTheDocument()
  })

  it('shows "Closed" for closed days', () => {
    render(
      <ModernTemplate
        data={makeData({ hours: { sun: { closed: true } } as never })}
        basePath="/site/test"
      />,
    )
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('shows footer with current year and powered-by attribution', () => {
    render(<ModernTemplate data={makeData()} basePath="/site/test" />)
    const year = new Date().getFullYear().toString()
    expect(screen.getByText(new RegExp(`© ${year}`))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /DreamCreate/ })).toBeInTheDocument()
  })
})
