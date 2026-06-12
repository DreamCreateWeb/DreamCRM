/**
 * MinimalSiteChrome — the shared warm shell for focused public flows
 * (/intake-start, /r/[token] review, the clinic-site 404). Wave 4 unified these
 * three onto it. Pure (no DB), so we can render it directly.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import MinimalSiteChrome from '@/components/clinic-site/minimal-site-chrome'

describe('MinimalSiteChrome', () => {
  it('renders the clinic name, children, and a back link when homeHref is set', () => {
    render(
      <MinimalSiteChrome clinicName="Acme Dental" brand="#9CAF9F" homeHref="/site/acme">
        <p>flow body</p>
      </MinimalSiteChrome>,
    )
    expect(screen.getAllByText('Acme Dental').length).toBeGreaterThan(0)
    expect(screen.getByText('flow body')).toBeTruthy()
    const back = screen.getByText(/Back to site/i)
    expect(back.closest('a')?.getAttribute('href')).toBe('/site/acme')
  })

  it('renders the logo image when logoUrl is provided (eager, for the focused flow)', () => {
    render(
      <MinimalSiteChrome clinicName="Acme Dental" logoUrl="https://img/logo.png" homeHref="/site/acme">
        <p>x</p>
      </MinimalSiteChrome>,
    )
    const img = screen.getByAltText('Acme Dental') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://img/logo.png')
    expect(img.getAttribute('loading')).toBe('eager')
  })

  it('falls back to a brand letter-mark when no logo', () => {
    render(
      <MinimalSiteChrome clinicName="Bright Smiles" brand="#9CAF9F" homeHref="/site/x">
        <p>x</p>
      </MinimalSiteChrome>,
    )
    // First letter of the name in the avatar chip.
    expect(screen.getAllByText('B').length).toBeGreaterThan(0)
  })

  it('renders a neutral "Dental Care" fallback + no back link on a 404 (homeHref null)', () => {
    render(
      <MinimalSiteChrome homeHref={null}>
        <p>not found body</p>
      </MinimalSiteChrome>,
    )
    expect(screen.getAllByText('Dental Care').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Back to site/i)).toBeNull()
    expect(screen.getByText('not found body')).toBeTruthy()
  })
})
