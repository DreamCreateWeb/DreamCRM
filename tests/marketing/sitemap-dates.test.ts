import { describe, it, expect, vi } from 'vitest'

/**
 * THE SITEMAP ONLY STATES A `lastmod` IT CAN STAND BEHIND.
 *
 * Every entry used to carry `new Date()` — the instant of the request — so
 * the file told a crawler that all sixty pages had changed since it last
 * asked, every time it asked. Search engines document that as the reason they
 * stop trusting the field for a site, which costs the pages that really did
 * change. Found on the 2026-11-23 crawl, where every `<lastmod>` in the live
 * file read the same second.
 *
 * So: a date where the tree holds a real one (a comparison's pricing check, a
 * guide's revision day, a post's own timestamps) and NO date anywhere else.
 */

const POSTED = new Date('2026-06-02T15:00:00Z')
const EDITED = new Date('2026-09-14T12:30:00Z')

vi.mock('@/lib/services/marketing-blog', () => ({
  getMarketingPosts: vi.fn(async () => [
    { slug: 'edited-post', publishedAt: POSTED, updatedAt: EDITED },
    { slug: 'never-edited', publishedAt: POSTED, updatedAt: null },
    { slug: 'no-dates-at-all', publishedAt: null, updatedAt: null },
  ]),
}))

import sitemap from '@/app/sitemap'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { DOCS } from '@/lib/marketing/docs'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import { RESOURCE_GUIDES } from '@/lib/marketing/resources'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const pathOf = (url: string) => new URL(url).pathname

describe('the marketing sitemap', () => {
  it('lists every public route, comparison, help article, guide and post exactly once', async () => {
    const entries = await sitemap()
    const paths = entries.map((e) => pathOf(e.url))
    expect(new Set(paths).size).toBe(paths.length)
    for (const p of MARKETING_PUBLIC_PATHS) expect(paths).toContain(p)
    expect(paths).toContain('/')
    for (const c of COMPARISONS) expect(paths).toContain(`/compare/${c.slug}`)
    for (const d of DOCS) expect(paths).toContain(`/docs/${d.slug}`)
    for (const g of RESOURCE_GUIDES) expect(paths).toContain(`/resources/${g.slug}`)
    expect(paths).toContain('/blog/edited-post')
  })

  it('never stamps an entry with the time of the request', async () => {
    const before = Date.now()
    const entries = await sitemap()
    for (const e of entries) {
      if (e.lastModified === undefined) continue
      const t = new Date(e.lastModified).getTime()
      expect(Number.isNaN(t), `${e.url}: unparseable lastmod`).toBe(false)
      // Anything within the last minute is the old behaviour coming back.
      expect(t, `${e.url} carries "now" as its lastmod`).toBeLessThan(before - 60_000)
    }
  })

  it('states no date for a page whose real one the tree does not hold', async () => {
    const byPath = new Map((await sitemap()).map((e) => [pathOf(e.url), e]))
    for (const p of ['/', ...MARKETING_PUBLIC_PATHS]) {
      expect(byPath.get(p)?.lastModified, `${p}`).toBeUndefined()
    }
    for (const d of DOCS) expect(byPath.get(`/docs/${d.slug}`)?.lastModified, d.slug).toBeUndefined()
    expect(byPath.get('/blog/no-dates-at-all')?.lastModified).toBeUndefined()
  })

  it('dates a comparison by its pricing check — and only a comparison that was checked', async () => {
    const byPath = new Map((await sitemap()).map((e) => [pathOf(e.url), e]))
    // The premise: at least one entry has been re-read, and at least one has
    // not, so both branches are exercised by the real registry.
    expect(COMPARISONS.some((c) => c.pricingChecked)).toBe(true)
    expect(COMPARISONS.some((c) => !c.pricingChecked)).toBe(true)
    for (const c of COMPARISONS) {
      const entry = byPath.get(`/compare/${c.slug}`)
      if (c.pricingChecked) {
        expect(c.pricingChecked.on, `${c.slug}: the check date is an ISO day`).toMatch(ISO_DAY)
        expect(entry?.lastModified, c.slug).toBe(c.pricingChecked.on)
      } else {
        expect(entry?.lastModified, `${c.slug} was never re-checked, so it has no date`).toBeUndefined()
      }
    }
  })

  it('dates a guide by its revision day and a post by its own timestamps', async () => {
    const byPath = new Map((await sitemap()).map((e) => [pathOf(e.url), e]))
    for (const g of RESOURCE_GUIDES) expect(byPath.get(`/resources/${g.slug}`)?.lastModified).toBe(g.datePublished)
    expect(byPath.get('/blog/edited-post')?.lastModified).toBe(EDITED)
    expect(byPath.get('/blog/never-edited')?.lastModified).toBe(POSTED)
  })
})
