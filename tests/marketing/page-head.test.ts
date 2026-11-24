import { describe, it, expect, vi } from 'vitest'
import type { Metadata } from 'next'

/**
 * THE HEAD OF EVERY MARKETING PAGE — canonical, `og:url`, the share image and
 * the Twitter card, on all of them, agreeing with each other.
 *
 * WHY THIS FILE EXISTS. The live crawl on 2026-11-23 read every page in the sitemap
 * and found the HOMEPAGE and the grader with no canonical at all, and
 * `og:url` / `og:type` missing from every page that was not a blog post. Each
 * page had built its own `metadata` object by hand, and a hand-built object
 * is only ever as complete as the person typing it remembered to make it. The
 * site is reachable on three hosts and its ad landings will arrive carrying
 * `utm_*` and click-id query strings, which is exactly the situation a
 * canonical is for.
 *
 * THE LIST COMES FROM THE REGISTRIES, NOT FROM THIS FILE. `HEADS` is typed as
 * a `Record` over `MARKETING_PUBLIC_PATHS` — the same constant the middleware
 * allowlist and the sitemap read — so a new top-level marketing route cannot
 * be made public without a row here (it fails to compile, and the runtime
 * check below fails for a route added by widening the type). The comparison,
 * help and guide pages are driven from their own registries the same way. It
 * reads no directory, so it is a derived list rather than a tree walk.
 */

vi.mock('@/lib/auth/context', () => ({ getTenantContext: vi.fn(async () => null) }))
vi.mock('@/lib/session', () => ({ getServerSession: vi.fn(async () => null) }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  usePathname: () => '/',
}))

import { MARKETING, MARKETING_PUBLIC_PATHS, usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { DOCS } from '@/lib/marketing/docs'
import { RESOURCE_GUIDES } from '@/lib/marketing/resources'
import { pageMetadata } from '@/lib/marketing/seo'

type PageModule = { metadata?: Metadata }
type TopLevelPath = '/' | (typeof MARKETING_PUBLIC_PATHS)[number]

const HEADS: Record<TopLevelPath, () => Promise<PageModule>> = {
  '/': () => import('@/app/(marketing)/page'),
  '/product': () => import('@/app/(marketing)/product/page'),
  '/why': () => import('@/app/(marketing)/why/page'),
  '/about': () => import('@/app/(marketing)/about/page'),
  '/pricing': () => import('@/app/(marketing)/pricing/page'),
  '/compare': () => import('@/app/(marketing)/compare/page'),
  '/docs': () => import('@/app/(marketing)/docs/page'),
  '/blog': () => import('@/app/(marketing)/blog/page'),
  '/grade': () => import('@/app/(marketing)/grade/page'),
  '/resources': () => import('@/app/(marketing)/resources/page'),
  '/roi': () => import('@/app/(marketing)/roi/page'),
  '/partner-program': () => import('@/app/(marketing)/partner-program/page'),
  '/changelog': () => import('@/app/(marketing)/changelog/page'),
  '/privacy': () => import('@/app/(marketing)/privacy/page'),
  '/terms': () => import('@/app/(marketing)/terms/page'),
}

const GUIDE_HEADS: Record<string, () => Promise<PageModule>> = {
  'dental-recall-scripts': () => import('@/app/(marketing)/resources/dental-recall-scripts/page'),
  'dental-membership-plan-pricing': () => import('@/app/(marketing)/resources/dental-membership-plan-pricing/page'),
  'how-to-get-more-dental-patients': () => import('@/app/(marketing)/resources/how-to-get-more-dental-patients/page'),
}

/** The four things every head must carry, graded against the path it claims. */
function expectCompleteHead(meta: Metadata | undefined, path: string) {
  expect(meta, `${path} exports no metadata`).toBeTruthy()
  const m = meta as Metadata
  expect(String(m.title ?? '').length, `${path}: empty title`).toBeGreaterThan(10)
  expect(String(m.description ?? '').length, `${path}: empty description`).toBeGreaterThan(40)

  // The canonical is the page's own address — not absent, and not a parent's.
  expect(m.alternates?.canonical, `${path}: canonical`).toBe(path)

  const og = m.openGraph as Record<string, unknown> | undefined
  expect(og, `${path}: no openGraph block`).toBeTruthy()
  expect(og?.url, `${path}: og:url`).toBe(path)
  expect(og?.siteName, `${path}: og:site_name`).toBe(MARKETING.productName)
  expect(og?.type, `${path}: og:type`).toBeTruthy()
  // A page-level openGraph REPLACES the inherited one, file-convention image
  // included — so the image has to be restated or the share card has none.
  const images = og?.images as Array<{ url?: string }> | undefined
  expect(images?.[0]?.url, `${path}: og:image`).toBe('/opengraph-image')

  const tw = m.twitter as Record<string, unknown> | undefined
  expect(tw?.card, `${path}: twitter:card`).toBe('summary_large_image')
  // One story on both cards.
  expect(tw?.title, `${path}: twitter title`).toBe(og?.title)
  expect(tw?.description, `${path}: twitter description`).toBe(og?.description)
}

describe('pageMetadata — the one shape of a marketing head', () => {
  it('writes the canonical, og:url, the share image and a matching Twitter card from one input', () => {
    const m = pageMetadata({ title: 'A title long enough', description: 'A description that is comfortably long enough to grade.', path: '/somewhere' })
    expectCompleteHead(m, '/somewhere')
    expect((m.openGraph as { type?: string }).type).toBe('website')
  })

  it('lets the link-preview line differ from the search snippet without touching the snippet', () => {
    const m = pageMetadata({
      title: 'Search title, long enough',
      description: 'The search snippet, which is comfortably long enough to grade here.',
      path: '/',
      social: { description: 'The warmer line for a link preview.' },
    })
    expect(m.description).toBe('The search snippet, which is comfortably long enough to grade here.')
    expect((m.openGraph as { description?: string }).description).toBe('The warmer line for a link preview.')
    expect((m.twitter as { description?: string }).description).toBe('The warmer line for a link preview.')
    // The title was not overridden, so both cards inherit the page's.
    expect((m.openGraph as { title?: string }).title).toBe('Search title, long enough')
  })
})

describe('every top-level marketing route carries a complete head', () => {
  it('has a row here for every public path — the registry, not this file, is the list', () => {
    expect(Object.keys(HEADS).sort()).toEqual(['/', ...MARKETING_PUBLIC_PATHS].sort())
  })

  for (const path of Object.keys(HEADS) as TopLevelPath[]) {
    it(`${path}`, async () => {
      const mod = await HEADS[path]()
      expectCompleteHead(mod.metadata, path)
    })
  }

  it('keeps the homepage search snippet inside what a result page shows', async () => {
    const mod = await HEADS['/']()
    const description = String(mod.metadata?.description ?? '')
    // ~160 characters is where a desktop result truncates. The price and the
    // trial used to sit at character 230 of a 290-character description.
    expect(description.length).toBeLessThanOrEqual(160)
    expect(description).toMatch(/\$\d+\/mo/)
    expect(description).toMatch(/free trial/i)
  })
})

describe('a title says what the page is', () => {
  /**
   * `/pricing` was titled "Pricing — DreamCRM", `/product` "Platform tour —
   * DreamCRM", `/blog` "Blog — DreamCRM". A section name and a brand tells a
   * searcher, and an assistant reading the result, nothing about the subject —
   * and on a brand name that collides with unrelated products ("DreamCRM" is
   * also an iOS app and a SugarCRM reseller's product), nothing that says
   * dental either. The floor is a length, because every way of naming the
   * subject is longer than a section label; the ceiling is roughly where a
   * result page stops showing the title at all.
   */
  it('is longer than a section label and short enough to be read — on every top-level route', async () => {
    for (const path of Object.keys(HEADS) as TopLevelPath[]) {
      const title = String((await HEADS[path]()).metadata?.title ?? '')
      expect(title.length, `${path}: "${title}"`).toBeGreaterThanOrEqual(30)
      expect(title.length, `${path}: "${title}"`).toBeLessThanOrEqual(75)
      expect(title, `${path}: the brand is missing`).toMatch(/DreamCRM|dental/i)
    }
  })

  it('pricing carries the RESOLVED monthly price, never a typed one', async () => {
    const title = String((await HEADS['/pricing']()).metadata?.title ?? '')
    expect(title).toContain(`${usd(getQuotedPlan().price)}/mo`)
  })

  it('the comparison hub names the first two vendors the registry lists', async () => {
    const title = String((await HEADS['/compare']()).metadata?.title ?? '')
    expect(title).toContain(COMPARISONS[0]!.name)
    expect(title).toContain(COMPARISONS[1]!.name)
  })
})

describe('the registry-driven pages carry one too', () => {
  it('every comparison page', async () => {
    const { generateMetadata } = await import('@/app/(marketing)/compare/[vendor]/page')
    for (const c of COMPARISONS) {
      const meta = (await generateMetadata({ params: Promise.resolve({ vendor: c.slug }) })) as Metadata
      expectCompleteHead(meta, `/compare/${c.slug}`)
      // The queries the page exists for stay in the title.
      expect(String(meta.title)).toContain(c.name)
      expect(String(meta.title)).toMatch(/pricing/i)
    }
  })

  it('every help article', async () => {
    const { generateMetadata } = await import('@/app/(marketing)/docs/[slug]/page')
    for (const d of DOCS) {
      const meta = (await generateMetadata({ params: Promise.resolve({ slug: d.slug }) })) as Metadata
      expectCompleteHead(meta, `/docs/${d.slug}`)
    }
  })

  it('every growth guide — and every registered guide has a page to grade', async () => {
    expect(Object.keys(GUIDE_HEADS).sort()).toEqual(RESOURCE_GUIDES.map((g) => g.slug).sort())
    for (const g of RESOURCE_GUIDES) {
      const mod = await GUIDE_HEADS[g.slug]!()
      expectCompleteHead(mod.metadata, `/resources/${g.slug}`)
      expect(mod.metadata?.description).toBe(g.description)
    }
  })
})
