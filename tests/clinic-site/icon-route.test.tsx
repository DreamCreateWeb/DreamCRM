/**
 * Tests for the clinic-site favicon route (`app/site/[slug]/icon.tsx`). We mock
 * `next/og`'s ImageResponse (rendering a real PNG needs the satori/resvg
 * pipeline) to capture the element tree, so we can assert the route renders the
 * logo when present and the brand-color letter-mark fallback otherwise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const captured: { element: ReactElement | null } = { element: null }

vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactElement) {
      captured.element = element
    }
  },
}))

const site: { data: unknown } = { data: null }
vi.mock('@/lib/services/clinic-site', () => ({
  getClinicSiteBySlug: vi.fn(async () => site.data),
}))

import Icon from '@/app/site/[slug]/icon'

async function render(profile: Record<string, unknown> | null, orgName = 'Bright Smiles') {
  site.data = profile ? { orgName, profile } : null
  await Icon({ params: Promise.resolve({ slug: 'x' }) })
  return renderToStaticMarkup(captured.element as ReactElement)
}

beforeEach(() => {
  captured.element = null
})

describe('clinic-site icon route', () => {
  it('renders the clinic logo when logoUrl is set', async () => {
    const html = await render({ logoUrl: 'https://cdn/logo.png', brandColor: '#123456' })
    expect(html).toContain('https://cdn/logo.png')
    expect(html).toContain('<img')
  })

  it('falls back to a brand-color letter-mark when there is no logo', async () => {
    const html = await render({ logoUrl: null, brandColor: '#0F766E', displayName: 'Acme Dental' })
    // First letter of the display name, on the brand-color tile, no <img>.
    expect(html).toContain('A')
    expect(html).toContain('#0F766E')
    expect(html).not.toContain('<img')
  })

  it('renders cleanly for an unknown slug (no profile)', async () => {
    const html = await render(null)
    // Default letter "D" + default brand color — never crashes.
    expect(html).toContain('D')
    expect(html).not.toContain('<img')
  })
})
