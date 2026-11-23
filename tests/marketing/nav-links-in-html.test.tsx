import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * THE HEADER MENU'S LINKS ARE IN THE HTML THE SERVER SENDS.
 *
 * The three dropdown panels (Product / Compare / Resources) used to be
 * MOUNTED on hover — `{openMenu === item.label && <panel/>}`. Nothing hovers
 * on the server, so the document a crawler receives carried the five
 * top-level links and none of the twenty-odd behind them. The live link graph
 * on 2026-11-23 showed the cost: `/resources` reachable from three pages on
 * the whole site, and the grader, the calculator and four of the eight
 * comparisons reachable only through the footer or a hub. Search crawlers and
 * the AI assistants' fetchers read the raw HTML and do not open menus.
 *
 * The panels are now always in the document and closed with the `hidden`
 * attribute. This test renders the header the way the SERVER does
 * (`renderToStaticMarkup` — no effects, no hover, initial state) and reads the
 * string, because a DOM query after a client render cannot tell "in the
 * markup" from "mounted later".
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

import { MarketingHeader } from '@/components/marketing/chrome'
import { MARKETING_NAV } from '@/lib/marketing/site'

const html = renderToStaticMarkup(<MarketingHeader />)

/** How React writes an href into markup (`&` is the one character it escapes that these hrefs could carry). */
const inMarkup = (href: string) => `href="${href.replace(/&/g, '&amp;')}"`

describe('the marketing header, as the server sends it', () => {
  it('carries every dropdown link — not only the five triggers', () => {
    const children = MARKETING_NAV.flatMap((item) => item.children ?? [])
    // The premise: there IS a second tier to lose. If the nav is ever flattened
    // this fails loudly instead of passing over an empty list.
    expect(children.length).toBeGreaterThan(10)
    for (const child of children) {
      expect(html, `${child.label} (${child.href}) is not in the server HTML`).toContain(inMarkup(child.href))
    }
  })

  it('keeps every panel CLOSED at rest — in the document, out of sight and out of the tab order', () => {
    const withChildren = MARKETING_NAV.filter((item) => item.children && item.children.length > 0)
    // `hidden` is display:none — the same reach as an unmounted panel had for a
    // keyboard or a screen reader, which is what makes "always rendered" safe.
    const hiddenPanels = html.match(/<div class="absolute left-0 top-full pt-1\.5" hidden="">/g) ?? []
    expect(hiddenPanels).toHaveLength(withChildren.length)
    // And no trigger claims to be expanded before anybody opened it.
    expect(html).not.toContain('aria-expanded="true"')
  })

  it('still carries the top-level links and both calls to action', () => {
    for (const item of MARKETING_NAV) expect(html).toContain(inMarkup(item.href))
    expect(html).toContain(inMarkup('/signup'))
    expect(html).toContain(inMarkup('/signin'))
  })
})
