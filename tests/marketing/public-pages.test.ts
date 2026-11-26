import { describe, it, expect, vi } from 'vitest'

/**
 * ONE LIST OF WHAT THE MARKETING SITE PUBLISHES (lib/marketing/public-pages.ts).
 *
 * The sitemap and the IndexNow notice are both views of it. The first half of
 * this file holds the list; the second holds the claim that makes it worth
 * having — that the two views name the same pages.
 */

const POSTS = vi.hoisted(() => [
  {
    slug: 'edited-post',
    title: 'Edited post',
    excerpt: 'An excerpt',
    publishedAt: new Date('2026-06-02T15:00:00Z'),
    updatedAt: new Date('2026-09-14T12:30:00Z'),
  },
  {
    slug: 'never-edited',
    title: 'Never edited',
    excerpt: null,
    publishedAt: new Date('2026-06-02T15:00:00Z'),
    updatedAt: null,
  },
  { slug: 'no-dates-at-all', title: 'No dates', excerpt: null, publishedAt: null, updatedAt: null },
])

vi.mock('@/lib/services/marketing-blog', () => ({
  getMarketingPosts: vi.fn(async () => POSTS),
}))

import sitemap from '@/app/sitemap'
import { contentKey } from '@/lib/indexnow'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { DOCS } from '@/lib/marketing/docs'
import { LEGAL_UPDATED } from '@/lib/marketing/legal'
import { HAND_WRITTEN_KEY, publicPages, type PublicPost } from '@/lib/marketing/public-pages'
import { RESOURCE_GUIDES } from '@/lib/marketing/resources'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import { desiredIndexNowMap } from '@/lib/services/indexnow'

const pages = publicPages(POSTS)
const byPath = new Map(pages.map((p) => [p.path, p]))
const keyOf = (path: string, posts: readonly PublicPost[] = POSTS) =>
  publicPages(posts).find((p) => p.path === path)!.contentKey

describe('the list', () => {
  it('names the home page, every public route, comparison, help article, guide and post — each exactly once', () => {
    const paths = pages.map((p) => p.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths).toContain('/')
    for (const p of MARKETING_PUBLIC_PATHS) expect(paths, p).toContain(p)
    for (const c of COMPARISONS) expect(paths).toContain(`/compare/${c.slug}`)
    for (const d of DOCS) expect(paths).toContain(`/docs/${d.slug}`)
    for (const g of RESOURCE_GUIDES) expect(paths).toContain(`/resources/${g.slug}`)
    for (const post of POSTS) expect(paths).toContain(`/blog/${post.slug}`)
    expect(paths).toHaveLength(
      1 + MARKETING_PUBLIC_PATHS.length + COMPARISONS.length + DOCS.length + RESOURCE_GUIDES.length + POSTS.length,
    )
  })

  it('every path is root-relative — the shape an engine is sent', () => {
    for (const p of pages) {
      expect(p.path.startsWith('/'), p.path).toBe(true)
      expect(p.path.startsWith('//'), p.path).toBe(false)
      expect(p.path, p.path).not.toMatch(/\s|\?|#/)
    }
  })

  it('every page has a content key, and it is deterministic', () => {
    const again = new Map(publicPages(POSTS).map((p) => [p.path, p.contentKey]))
    for (const p of pages) {
      expect(p.contentKey, p.path).toBeTruthy()
      expect(again.get(p.path), p.path).toBe(p.contentKey)
    }
  })
})

describe('a content key moves exactly when the page’s content does', () => {
  it('a page built from a registry is keyed on its own entry', () => {
    for (const c of COMPARISONS) expect(keyOf(`/compare/${c.slug}`), c.slug).toBe(contentKey(c))
    for (const d of DOCS) expect(keyOf(`/docs/${d.slug}`), d.slug).toBe(contentKey(d))
    // A guide is keyed on its own entry — except the ones whose BODY is built
    // from another registry, which must move when that registry does: the
    // pricing guide (the comparison registry — held in
    // tests/marketing/pricing-guide.test.tsx) and the no-show policy guide
    // (the outside pages it quotes — tests/marketing/no-show-policy-guide.test.tsx).
    const builtFromElsewhere = [
      'dental-software-pricing',
      'dental-cancellation-no-show-policy',
      'dental-appointment-reminder-templates',
      'dental-review-request-templates',
      'dental-new-patient-welcome-letter',
      'how-to-get-more-dental-patients',
    ]
    for (const g of RESOURCE_GUIDES) {
      if (builtFromElsewhere.includes(g.slug)) {
        expect(keyOf(`/resources/${g.slug}`), g.slug).not.toBe(contentKey(g))
        continue
      }
      expect(keyOf(`/resources/${g.slug}`), g.slug).toBe(contentKey(g))
    }
    // …so re-reading a competitor's pricing moves that page's key and no other.
    const [first] = COMPARISONS
    expect(contentKey({ ...first, summary: `${first.summary}!` })).not.toBe(contentKey(first))
  })

  it('pricing, the legal pages, the changelog and the index pages are keyed on data, not typed', () => {
    for (const path of ['/pricing', '/privacy', '/terms', '/compare', '/docs', '/resources', '/changelog', '/blog']) {
      expect(keyOf(path), path).not.toBe(HAND_WRITTEN_KEY)
    }
    expect(keyOf('/privacy')).toBe(`legal:${LEGAL_UPDATED}`)
    expect(keyOf('/terms')).toBe(`legal:${LEGAL_UPDATED}`)
  })

  it('a hand-written page carries the constant: announced once, then left to ordinary crawling', () => {
    for (const path of ['/', '/product', '/why', '/grade', '/roi', '/partner-program']) {
      expect(keyOf(path), path).toBe(HAND_WRITTEN_KEY)
    }
  })

  it('an article is keyed on its own last change', () => {
    expect(keyOf('/blog/edited-post')).toBe('2026-09-14T12:30:00.000Z')
    expect(keyOf('/blog/never-edited')).toBe('2026-06-02T15:00:00.000Z')
    expect(keyOf('/blog/no-dates-at-all')).toBe('undated')
  })

  it('the blog index moves when its cards do — a new post, a new title — and NOT when only a body was edited', () => {
    const base = keyOf('/blog')
    const bodyEdited = POSTS.map((p) => (p.slug === 'never-edited' ? { ...p, updatedAt: new Date('2026-11-24T10:00:00Z') } : p))
    expect(keyOf('/blog', bodyEdited)).toBe(base)

    const retitled = POSTS.map((p) => (p.slug === 'never-edited' ? { ...p, title: 'A better title' } : p))
    expect(keyOf('/blog', retitled)).not.toBe(base)
    const added = [...POSTS, { ...POSTS[0], slug: 'one-more' }]
    expect(keyOf('/blog', added)).not.toBe(base)
    expect(keyOf('/blog', POSTS.slice(1))).not.toBe(base)
  })
})

describe('the sitemap and the notice are the same list', () => {
  it('name exactly the same pages', async () => {
    const inSitemap = (await sitemap()).map((e) => new URL(e.url).pathname).sort()
    const inNotice = Object.keys(await desiredIndexNowMap()).sort()
    expect(inNotice).toEqual(inSitemap)
    expect(inNotice).toEqual(pages.map((p) => p.path).sort())
  })

  it('the sitemap states a date only where the list holds one', async () => {
    for (const entry of await sitemap()) {
      const page = byPath.get(new URL(entry.url).pathname)!
      expect(entry.lastModified, entry.url).toEqual(page.lastModified)
    }
  })
})
