import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * NO CHECK, NO DATE — held on a comparison nobody has read.
 *
 * `pricingChecked` is optional on purpose (see the field's own comment in
 * lib/marketing/comparisons.ts): a date on a line nobody re-read would be a
 * stale fact wearing a timestamp. Until 2026-11-24 the registry itself had
 * unread entries, and the tests for this rule simply picked one. That day the
 * last of them was re-read, which would have left the rule with nothing to
 * stand on — and the next comparison somebody adds WILL arrive unread.
 *
 * So the unread vendor is planted here: one synthetic entry, added to the
 * real registry through a module mock, and every surface that reads the
 * field is asked what it does with it.
 */

vi.mock('@/lib/marketing/comparisons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketing/comparisons')>()
  const { pricingChecked: _dropped, ...template } = actual.COMPARISONS[0]
  const unread = {
    ...template,
    slug: 'unread-vendor',
    name: 'Unread Vendor',
    reportedPricing: 'Reported ~$123/mo (third-party reviews, 2026)',
  }
  const COMPARISONS = [...actual.COMPARISONS, unread]
  return {
    ...actual,
    COMPARISONS,
    getComparison: (slug: string) => COMPARISONS.find((c) => c.slug === slug),
  }
})
vi.mock('@/lib/services/marketing-blog', () => ({ getMarketingPosts: vi.fn(async () => []) }))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import ComparePage from '@/app/(marketing)/compare/[vendor]/page'
import sitemap from '@/app/sitemap'
import { googleCompetitorCampaign } from '@/lib/marketing/ad-campaigns'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { publicPages } from '@/lib/marketing/public-pages'

describe('a comparison nobody has re-read', () => {
  it('the premise: the planted entry is in the registry and carries no check', () => {
    const unread = COMPARISONS.find((c) => c.slug === 'unread-vendor')
    expect(unread).toBeTruthy()
    expect(unread!.pricingChecked).toBeUndefined()
  })

  it('its page shows NO "last checked" line — while a checked page beside it still does', async () => {
    const { unmount } = render(await ComparePage({ params: Promise.resolve({ vendor: 'unread-vendor' }) }))
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.queryByText(/pricing last checked/i)).not.toBeInTheDocument()
    unmount()
    render(await ComparePage({ params: Promise.resolve({ vendor: 'weave' }) }))
    expect(screen.getByText(/pricing last checked/i)).toBeInTheDocument()
  })

  it('its page data and its head claim no review day either — neither invents one', async () => {
    // Two more places learned to speak the dated check on 2026-11-25: the
    // `lastReviewed` field in the page's data, and "(checked …)" in its meta
    // description. Both must say nothing here, not today's date.
    const { container, unmount } = render(await ComparePage({ params: Promise.resolve({ vendor: 'unread-vendor' }) }))
    const nodes = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((el) =>
      JSON.parse(el.textContent ?? '{}'),
    )
    const page = nodes.find((n) => n['@type'] === 'WebPage')
    expect(page, 'the page still describes itself').toBeTruthy()
    expect('lastReviewed' in page).toBe(false)
    unmount()

    const { generateMetadata } = await import('@/app/(marketing)/compare/[vendor]/page')
    const unread = (await generateMetadata({ params: Promise.resolve({ vendor: 'unread-vendor' }) })) as { description?: string }
    expect(unread.description).not.toMatch(/checked/i)
    const read = (await generateMetadata({ params: Promise.resolve({ vendor: 'weave' }) })) as { description?: string }
    expect(read.description).toMatch(/\(checked [A-Z][a-z]+ \d{1,2}, \d{4}\)/)
  })

  it('the sitemap lists it with no date', async () => {
    const entry = (await sitemap()).find((e) => new URL(e.url).pathname === '/compare/unread-vendor')
    expect(entry, 'the page is still listed').toBeTruthy()
    expect(entry!.lastModified).toBeUndefined()
    const page = publicPages([]).find((p) => p.path === '/compare/unread-vendor')!
    expect(page.lastModified).toBeUndefined()
    // It is still announced to the search engines — it has content, and a key.
    expect(page.contentKey).toBeTruthy()
  })

  it('no ad is ever pointed at it', () => {
    const groups = googleCompetitorCampaign(COMPARISONS).adGroups
    expect(groups.some((g) => g.vendorSlug === 'unread-vendor')).toBe(false)
    expect(groups.length).toBeGreaterThan(0)
  })
})
