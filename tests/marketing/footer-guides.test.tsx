import { describe, it, expect, vi } from 'vitest'
import { render, within } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

import { MarketingFooter } from '@/components/marketing/ui'
import { GUIDE_SHORT_TITLES, RESOURCE_GUIDES } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS } from '@/lib/marketing/site'
import { publicPages } from '@/lib/marketing/public-pages'

/**
 * THE FOOTER'S GUIDES COLUMN — derived, so a new guide cannot be missing.
 *
 * The footer's Compare column has been derived from the comparison registry
 * since its hand-written list drifted once. The guides were still a
 * hand-kept list inside "Resources", and on 2026-11-26 that list took six new
 * links in a day, reached fourteen, and every one was typed twice: once in
 * the registry and once in `site.ts`. Each guide's own test checked that its
 * link was there, which holds a guide somebody remembered to add and says
 * nothing about one nobody did.
 *
 * So the guides get their own column, built from `RESOURCE_GUIDES`, each
 * under its name in `GUIDE_SHORT_TITLES`. A guide's slug is typed as a key of
 * that map, so a guide with no name does not compile, and that line is the
 * whole of adding it to the footer.
 *
 * THE NAME IS NOT A FIELD ON THE GUIDE, and the last block here holds why:
 * a guide's entry is what its page's search-notice key is computed from. The
 * first draft put `shortTitle` on the entry and would have told the search
 * engines that nine pages had changed when only the site's footer had.
 */

const column = (title: string) => FOOTER_COLUMNS.find((c) => c.title === title)!
const shortTitle = (slug: string) => (GUIDE_SHORT_TITLES as Record<string, string>)[slug]

describe('the footer’s guide links', () => {
  it('every registered guide is in the Guides column, in registry order, under its short title', () => {
    expect(column('Guides').links).toEqual(
      RESOURCE_GUIDES.map((g) => ({ label: shortTitle(g.slug), href: `/resources/${g.slug}` })),
    )
    expect(column('Guides').links).toHaveLength(RESOURCE_GUIDES.length)
  })

  it('every guide has a name and no name is left over', () => {
    expect(Object.keys(GUIDE_SHORT_TITLES).sort()).toEqual(RESOURCE_GUIDES.map((g) => g.slug).sort())
  })

  it('a short title is short, plain and one of a kind', () => {
    const titles = Object.values(GUIDE_SHORT_TITLES) as string[]
    expect(new Set(titles).size).toBe(titles.length)
    for (const [slug, t] of Object.entries(GUIDE_SHORT_TITLES) as Array<[string, string]>) {
      expect(t.length, `${slug}: too short to mean anything`).toBeGreaterThanOrEqual(12)
      // Measured 2026-11-26: a column is 189px at full width and 163px at
      // 1024, where a label this long takes two lines. Longer, and the column
      // stops reading as a list.
      expect(t.length, `${slug}: “${t}” is too long for the column`).toBeLessThanOrEqual(32)
      expect(t, `${slug}: reads as a sentence`).not.toMatch(/[.:(]/)
      expect(t[0], `${slug}: starts lower-case`).toBe(t[0]!.toUpperCase())
    }
  })

  it('Resources keeps the tools and the hub — and no single guide', () => {
    const resources = column('Resources').links
    expect(resources).toContainEqual({ label: 'All guides', href: '/resources' })
    expect(resources).toContainEqual({ label: 'Grade your practice', href: '/grade' })
    for (const l of resources) {
      expect(l.href.startsWith('/resources/'), `${l.label} is a guide, in the wrong column`).toBe(false)
    }
  })
})

describe('the rendered footer', () => {
  const COLUMNS = ['Product', 'Compare', 'Guides', 'Resources', 'Get started']

  it('has five link columns, each a labelled landmark, and every guide is a link in its own', () => {
    const { container } = render(<MarketingFooter />)
    const navs = Array.from(container.querySelectorAll('footer .grid > nav'))
    expect(navs.map((n) => n.getAttribute('aria-label'))).toEqual(COLUMNS)
    // The legal row under them is the footer's only other landmark, so no two
    // share a name.
    const every = Array.from(container.querySelectorAll('footer nav')).map((n) => n.getAttribute('aria-label'))
    expect(every).toEqual([...COLUMNS, 'Legal'])
    const guides = navs.find((n) => n.getAttribute('aria-label') === 'Guides') as HTMLElement
    for (const g of RESOURCE_GUIDES) {
      expect(within(guides).getByRole('link', { name: shortTitle(g.slug) })).toHaveAttribute(
        'href',
        `/resources/${g.slug}`,
      )
    }
    expect(within(guides).getAllByRole('link')).toHaveLength(RESOURCE_GUIDES.length)
  })

  it('no page is linked twice from the columns', () => {
    // Read from the RENDERED footer: the Compare column is rebuilt from the
    // comparison registry inside the component, so the data alone is not what
    // a visitor gets.
    const { container } = render(<MarketingFooter />)
    const hrefs = Array.from(container.querySelectorAll('footer .grid > nav a')).map((a) => a.getAttribute('href'))
    expect(hrefs.length).toBeGreaterThan(20)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it('gives the five columns a row of their own at desktop and three across at tablet', () => {
    const { container } = render(<MarketingFooter />)
    const grid = container.querySelector('footer .grid') as HTMLElement
    // The old class was `md:grid-cols-[1.2fr_repeat(4,1fr)]`: the brand block
    // and four columns in one row. A fifth column under it wrapped alone onto
    // a second row; a sixth track in that row left each column about 146px at
    // full width, where nearly every guide label wraps. So the brand block
    // takes its own row from `lg` and the five columns share the next.
    const classes = grid.className.split(/\s+/)
    expect(classes).toContain('lg:grid-cols-5')
    expect(classes).toContain('md:grid-cols-3')
    expect(grid.className).not.toMatch(/repeat\(/)
    expect(grid.children).toHaveLength(6)
    const brand = grid.children[0] as HTMLElement
    expect(brand.tagName).toBe('DIV')
    expect(brand.className.split(/\s+/)).toContain('lg:col-span-5')
    for (const nav of Array.from(grid.children).slice(1)) {
      expect(nav.tagName).toBe('NAV')
      expect(nav.className).not.toMatch(/col-span/)
    }
  })
})

describe('a footer label is chrome, not content', () => {
  /**
   * The search-notice pass tells the engines a page changed when its content
   * key moves (`lib/marketing/public-pages.ts`), and a guide's key is computed
   * from its registry ENTRY. A footer label on the entry would move the key of
   * a page whose content did not change, every time somebody renamed one. So
   * the entry is held to the fields that say what the page says, and the
   * names live beside it.
   */
  const CONTENT_FIELDS = ['contains', 'datePublished', 'description', 'glyph', 'readMinutes', 'slug', 'title']

  it('a guide’s entry carries only what its page says', () => {
    for (const g of RESOURCE_GUIDES) {
      expect(
        Object.keys(g).sort(),
        `${g.slug}: a new field on a guide’s entry moves its page’s search-notice key. If the field is not part of what the page says, it belongs beside GUIDE_SHORT_TITLES.`,
      ).toEqual(CONTENT_FIELDS)
      // And the name has not come back under another key.
      for (const [field, value] of Object.entries(g)) {
        expect(value, `${g.slug}.${field} is its footer label`).not.toBe(shortTitle(g.slug))
      }
    }
  })

  it('so renaming one moves no page’s search-notice key', async () => {
    const before = new Map(publicPages([]).map((p) => [p.path, p.contentKey]))
    vi.resetModules()
    vi.doMock('@/lib/marketing/resources', async (original) => {
      const real = await original<typeof import('@/lib/marketing/resources')>()
      return {
        ...real,
        GUIDE_SHORT_TITLES: Object.fromEntries(Object.keys(real.GUIDE_SHORT_TITLES).map((slug) => [slug, `Renamed ${slug}`])),
      }
    })
    const renamed = await import('@/lib/marketing/public-pages')
    const site = await import('@/lib/marketing/site')
    // The rename took: the footer's data now reads the new names…
    const labels = site.FOOTER_COLUMNS.find((c) => c.title === 'Guides')!.links.map((l) => l.label)
    expect(labels).toHaveLength(RESOURCE_GUIDES.length)
    for (const label of labels) expect(label).toMatch(/^Renamed /)
    // …and not one page's key moved.
    const after = new Map(renamed.publicPages([]).map((p) => [p.path, p.contentKey]))
    expect(after.size).toBe(before.size)
    before.forEach((key, path) => expect(after.get(path), path).toBe(key))
    vi.doUnmock('@/lib/marketing/resources')
    vi.resetModules()
  })
})
