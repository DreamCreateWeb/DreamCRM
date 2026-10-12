import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { listSiteTemplates } from '@/lib/site-templates/registry'
import type { SiteTemplateDef } from '@/lib/site-templates/types'
import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { ClinicFinancingPartner } from '@/lib/types/clinic-content'

/**
 * THE FINANCING WIDGETS UNDER EVERY TEMPLATE (2026-10-12). The payment /
 * financing page is one shared shell that wears the active template's
 * chrome, palette and fonts — so the provider widgets have to come out
 * right under all six, not only the default. This iterates every REGISTERED
 * template (a new def auto-enrolls) and, with Cherry as the primary partner,
 * pins per template:
 *   - the page leads with Cherry's four containers, inside the template's chrome
 *     (the template's own booking voice is on the page);
 *   - the queued `_hw('init')` carries the template's REAL display face and
 *     the site body face (the widget quotes what it is given, so a keyword
 *     would silently fall back to the browser default);
 *   - the primary colour is the palette's AA-floored CTA fill, not the raw
 *     brand — Cherry paints white text on it.
 */

let current: SiteTemplateDef | null = null

vi.mock('@/lib/site-templates/resolve', () => ({
  resolveActiveSiteTemplate: vi.fn(async () => ({ def: current!, isPreview: false, isFrame: false })),
}))

vi.mock('@/lib/services/clinic-site', async () => {
  const actual = await vi.importActual<typeof import('@/lib/services/clinic-site')>('@/lib/services/clinic-site')
  return {
    ...actual,
    getClinicThemeBySlug: vi.fn(async () => ({ orgId: null, brand: null, template: null })),
    getClinicSiteBySlug: vi.fn(),
    resolveSiteBasePath: vi.fn(async () => '/site/acme-dental'),
    appBaseUrl: vi.fn(() => 'https://app.example.com'),
    publicSiteUrl: vi.fn(() => 'https://dreamcreatestudio.com/site/acme-dental'),
  }
})
vi.mock('@/lib/services/blog', () => ({ listPublishedPosts: vi.fn(async () => []) }))
vi.mock('@/lib/services/membership', () => ({ listActivePlans: vi.fn(async () => []) }))
vi.mock('@/lib/services/careers', () => ({ getOpenJobs: vi.fn(async () => []) }))

import PaymentFinancingPage from '@/app/site/[slug]/payment-financing/page'
import { getClinicSiteBySlug } from '@/lib/services/clinic-site'
import { widgetFontsFromTemplate } from '@/lib/financing-providers'

// A pale sage brand: the raw hex fails AA under white text, the palette's
// brandStrong does not — which is the whole point of passing the latter.
const BRAND = '#9CAF9F'

const PARTNERS: ClinicFinancingPartner[] = [
  { id: 'p1', name: 'Cherry', description: null, applyUrl: null, logoUrl: null, provider: 'cherry', slug: 'acme-dental', showWidget: true, floatingButton: true },
  { id: 'p2', name: 'CareCredit', description: null, applyUrl: 'https://www.carecredit.com/go/ABC123/', logoUrl: null, provider: 'carecredit' },
]

function makeData(template: string): ClinicSiteData {
  return {
    orgId: 'org_1',
    orgName: 'Acme Dental',
    slug: 'acme-dental',
    primaryLocation: null,
    locations: [],
    profile: {
      organizationId: 'org_1',
      displayName: 'Acme Dental',
      brandColor: BRAND,
      template,
      phone: '(555) 555-0100',
      city: 'Austin',
      state: 'TX',
      country: 'US',
      planTier: 'premium',
      financingPartners: PARTNERS,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ClinicSiteData['profile'],
  }
}

type HwFn = ((...args: unknown[]) => void) & { q?: unknown[][] }

afterEach(() => {
  cleanup()
  delete (window as unknown as { _hw?: HwFn })._hw
  document.getElementById('_hw')?.remove()
})

describe('the financing page under every registered template', () => {
  for (const def of listSiteTemplates()) {
    it(`${def.id}: leads with Cherry's widget in the template's own chrome, fonts and CTA fill`, async () => {
      current = def
      ;(getClinicSiteBySlug as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(makeData(def.id))
      const ui = await PaymentFinancingPage({ params: Promise.resolve({ slug: 'acme-dental' }) })
      render(ui as React.ReactElement)

      expect(screen.getByTestId('financing-primary-widget')).toBeInTheDocument()
      for (const id of ['hero', 'calculator', 'howitworks', 'faq']) {
        expect(document.getElementById(id), `${def.id} is missing Cherry's #${id} container`).not.toBeNull()
      }
      // The template's chrome is on the page: its booking voice appears somewhere.
      expect(document.body.textContent).toContain(def.bookLabel)

      const hw = (window as unknown as { _hw?: HwFn })._hw
      expect(hw?.q?.length, `${def.id} queued no Cherry init`).toBeGreaterThan(0)
      const [, config] = hw!.q![0] as [string, { styles: { primaryColor: string; fontFamily: string; headerFontFamily: string } }]
      const fonts = widgetFontsFromTemplate(def.fontCss)
      expect(config.styles.fontFamily).toBe(fonts.body)
      expect(config.styles.headerFontFamily).toBe(fonts.display)
      expect(config.styles.fontFamily).not.toBe('inherit')
      expect(config.styles.primaryColor).toBe(def.buildPalette(BRAND).brandStrong)
      // The apply button still goes to the pay link under every template.
      expect(screen.getByTestId('financing-apply-cherry').getAttribute('href')).toBe(
        'https://pay.withcherry.com/acme-dental?utm_source=merchant&utm_medium=website',
      )
    })
  }
})
