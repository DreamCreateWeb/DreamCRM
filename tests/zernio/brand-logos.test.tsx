import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

/**
 * The Integrations brand-logo set — recognizable, brand-accurate inline SVGs
 * (the single biggest fix vs the old generic plug/emoji icons). These tests
 * assert each integration id renders its brand-tagged SVG, that logos are
 * decorative (aria-hidden), that roadmap PMSs render monogram tiles, and that
 * the brand-accent + title maps cover every id.
 */

import {
  BrandLogo,
  BrandLogoWell,
  BRAND_ACCENTS,
  brandLogoTitle,
  type BrandLogoId,
} from '@/components/integrations/brand-logos'

const TRADEMARK_IDS: BrandLogoId[] = ['googlebusiness', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'open_dental']
const MONOGRAM_IDS: BrandLogoId[] = ['dentrix_ascend', 'dentrix_desktop', 'eaglesoft', 'curve']
const ALL_IDS: BrandLogoId[] = [...TRADEMARK_IDS, 'demo', ...MONOGRAM_IDS]

describe('BrandLogo', () => {
  it('renders a brand-tagged SVG for each trademark integration', () => {
    for (const id of TRADEMARK_IDS) {
      const { container } = render(<BrandLogo id={id} />)
      expect(container.querySelector(`svg[data-brand-logo="${id}"]`)).toBeTruthy()
    }
  })

  it('renders a monogram tile for each roadmap PMS (no trademark mark)', () => {
    for (const id of MONOGRAM_IDS) {
      const { container } = render(<BrandLogo id={id} />)
      expect(container.querySelector('svg[data-brand-logo="monogram"]')).toBeTruthy()
    }
  })

  it('the demo sandbox reuses the Open Dental mark', () => {
    const { container } = render(<BrandLogo id="demo" />)
    expect(container.querySelector('svg[data-brand-logo="open_dental"]')).toBeTruthy()
  })

  it('every logo is decorative (aria-hidden) — the card carries the label', () => {
    for (const id of ALL_IDS) {
      const { container } = render(<BrandLogo id={id} />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('honors the size prop', () => {
    const { container } = render(<BrandLogo id="instagram" size={40} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('40')
    expect(svg.getAttribute('height')).toBe('40')
  })
})

describe('BRAND_ACCENTS + titles', () => {
  it('has an accent hex for every id', () => {
    for (const id of ALL_IDS) {
      expect(BRAND_ACCENTS[id]).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('has a human title for every id', () => {
    expect(brandLogoTitle('googlebusiness')).toBe('Google Business Profile')
    expect(brandLogoTitle('open_dental')).toBe('Open Dental')
    expect(brandLogoTitle('demo')).toBe('Open Dental')
    expect(brandLogoTitle('curve')).toBe('Curve Dental')
  })
})

describe('BrandLogoWell', () => {
  it('seats the brand logo in a tinted well keyed to the id', () => {
    const { container } = render(<BrandLogoWell id="facebook" />)
    expect(container.querySelector('[data-brand-well="facebook"]')).toBeTruthy()
    expect(container.querySelector('svg[data-brand-logo="facebook"]')).toBeTruthy()
  })
})
