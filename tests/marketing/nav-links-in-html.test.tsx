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

import { MarketingHeader, panelAnchor } from '@/components/marketing/chrome'
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
    const hiddenPanels = html.match(/<div class="absolute top-full pt-1\.5 (?:left|right)-0" hidden="">/g) ?? []
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


/**
 * A WIDE PANEL NEVER HANGS OFF THE RIGHT EDGE OF THE WINDOW.
 *
 * Measured with the menu open on 2026-11-23, before the fix: the two-column
 * panel under the last trigger ran 23px past a 1280px window, 87px past 1152
 * and 191px past 1024, and the page scrolled sideways while it was open. No
 * check at rest can see that — a closed panel is `display:none` — so the rule
 * is stated on the function that decides the anchor, and on the markup the
 * real nav produces from it.
 */
describe('which edge a dropdown hangs from', () => {
  it('hangs a wide panel in the right half of the bar from its trigger’s RIGHT edge', () => {
    // Five triggers, index 4 is the last: two columns there must grow leftward.
    expect(panelAnchor(4, 9, 5)).toBe('right-0')
    expect(panelAnchor(3, 6, 5)).toBe('right-0')
    // The same wide panel on the left has the whole bar to its right.
    expect(panelAnchor(0, 9, 5)).toBe('left-0')
    // The middle trigger is not "the right half".
    expect(panelAnchor(2, 9, 5)).toBe('left-0')
  })

  it('leaves a one-column panel on the left edge wherever it is — 18rem fits', () => {
    expect(panelAnchor(4, 5, 5)).toBe('left-0')
    expect(panelAnchor(1, 5, 5)).toBe('left-0')
  })

  it('the real nav: every wide panel past the midpoint is right-anchored in the markup', () => {
    const wideOnTheRight = MARKETING_NAV.map((item, index) => ({ item, index })).filter(
      ({ item, index }) => (item.children?.length ?? 0) > 5 && index > (MARKETING_NAV.length - 1) / 2,
    )
    // The premise: the nav has such a panel today (Resources). If it stops
    // having one, this case is vacuous and should say so rather than pass.
    expect(wideOnTheRight.length).toBeGreaterThan(0)
    const rightAnchored = html.match(/<div class="absolute top-full pt-1\.5 right-0" hidden="">/g) ?? []
    expect(rightAnchored).toHaveLength(wideOnTheRight.length)
  })
})
