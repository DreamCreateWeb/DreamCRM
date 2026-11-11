import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

/**
 * THE DEMO PREP PAGE AND AN UNREAD CRAWL (P-04 fix pass III, W4). A crawl
 * that was tried and read nothing — robots.txt refused us, the site could
 * not be read — is stored with every page fact at its zero so the record
 * can say why. The walk-up story must not turn those zeros into an URGENT
 * "Not mobile-friendly" and a "No online booking" for a page nobody read,
 * nor call the practice "healthy online". A read page keeps its pills.
 */

vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ({ tenantType: 'platform', platformAdmin: true, userId: 'u_1' })),
}))
const detailMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/services/prospecting', () => ({ getProspectDetail: detailMock }))
vi.mock('@/lib/services/demo-brief', () => ({ getDemoBrief: vi.fn(async () => null) }))
// The client strips are their own surfaces; here they are inert.
vi.mock('@/app/(default)/platform/prospecting/demo/[id]/brief-panel', () => ({ default: () => null }))
vi.mock('@/app/(default)/platform/prospecting/demo/[id]/prep-actions', () => ({ default: () => null }))
vi.mock('@/app/(default)/platform/prospecting/demo/[id]/track-picker', () => ({ default: () => null }))

import DemoPrepPage from '@/app/(default)/platform/prospecting/demo/[id]/page'
import type { ProspectCrawlSignals } from '@/lib/types/prospecting'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const UNREAD: ProspectCrawlSignals = {
  ssl: true,
  mobileViewport: false,
  copyrightYear: null,
  titleTag: null,
  metaDescription: null,
  bookingWidget: false,
  socialLinks: {},
  builder: null,
  stack: null,
  pageWeightKb: 0,
  emails: [],
  fetchedAt: new Date().toISOString(),
  error: 'fetch_failed',
}

function detail(enrichment: ProspectCrawlSignals | null) {
  return {
    prospect: {
      id: 'pros_1',
      name: 'Smile Dental PC',
      status: 'enriched',
      city: 'Atlanta',
      state: 'GA',
      phone: '4045551212',
      websiteUrl: 'https://smiledental.com',
      authorizedOfficialName: 'DR. JANE SMITH',
      googleRatingTenths: 47,
      reviewCount: 220,
      opportunityScore: 60,
      scoreBand: 'warm',
      scoreReasons: [],
      enrichment,
      aiVerdict: { hasWebsite: true, websiteQuality: 80, websiteReasons: [], socialPresence: 60, onlineBooking: true, weaknesses: [], summary: '' },
    },
    contacts: [],
    touches: [],
    events: [],
    calls: [],
    assignedCaller: null,
    mergedInto: null,
    duplicates: [],
  }
}

async function renderPage(enrichment: ProspectCrawlSignals | null) {
  detailMock.mockResolvedValueOnce(detail(enrichment))
  const el = await DemoPrepPage({ params: Promise.resolve({ id: 'pros_1' }) })
  return render(el)
}

describe('the demo prep page (W4)', () => {
  it('an UNREAD crawl shows no "Not mobile-friendly" / "No online booking" pill — one neutral "Site not read" pill names the reason, the header says so, and the ammunition line does not call the practice healthy', async () => {
    const { container } = await renderPage(UNREAD)
    expect(container.textContent).not.toContain('Not mobile-friendly')
    expect(container.textContent).not.toContain('No online booking')
    expect(container.textContent).not.toContain('Mobile-ready')
    expect(container.textContent).not.toContain('Has online booking')
    const pill = container.querySelector('[title="The site could not be read when we looked — Re-enrich tries again"]')
    expect(pill?.textContent).toBe('Site not read')
    expect(pill?.getAttribute('data-tone')).toBe('neutral')
    expect(container.textContent).toContain('Walk-up story · site not read')
    expect(container.textContent).not.toMatch(/crawled today/)
    expect(container.textContent).not.toMatch(/looks healthy online/)
    expect(container.textContent).toContain('tap ↻ Re-enrich in the header to crawl their site first')
    cleanup()
    const robots = await renderPage({ ...UNREAD, error: 'robots_disallow' })
    expect(robots.container.querySelector('[title="Their robots.txt refuses crawlers — we never read the page"]')?.textContent).toBe('Site not read')
    expect(robots.container.textContent).not.toContain('Not mobile-friendly')
  })

  it('a READ page keeps its pills — the same zeros on a page somebody read are findings', async () => {
    const { container } = await renderPage({ ...UNREAD, error: undefined, stack: [] })
    expect(container.textContent).toContain('Not mobile-friendly')
    expect(container.textContent).toContain('No online booking')
    expect(container.textContent).toContain('Walk-up story · crawled today')
    expect(container.querySelector('[title="The site could not be read when we looked — Re-enrich tries again"]')).toBeNull()
  })
})
