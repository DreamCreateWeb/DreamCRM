import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PoweredBy from '@/components/clinic-site/powered-by'

describe('PoweredBy (the site credit — single home)', () => {
  it('renders the UTM-attributed link naming the clinic in the campaign', () => {
    render(<PoweredBy slug="acme-dental" />)
    const link = screen.getByRole('link', { name: /Powered by DreamCRM/ })
    const href = link.getAttribute('href') ?? ''
    expect(href).toContain('utm_source=powered_by')
    expect(href).toContain('utm_medium=referral')
    expect(href).toContain('utm_campaign=acme-dental')
  })

  it('is nofollow — widget-link SEO safety', () => {
    render(<PoweredBy slug="acme-dental" />)
    expect(screen.getByRole('link', { name: /Powered by DreamCRM/ }).getAttribute('rel')).toContain(
      'nofollow',
    )
  })
})
