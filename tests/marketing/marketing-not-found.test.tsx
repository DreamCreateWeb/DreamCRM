import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'

import MarketingNotFound from '@/app/(marketing)/not-found'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import { MARKETING_EMOJI } from '@/lib/marketing/emoji'

/**
 * THE MARKETING SITE ANSWERS ITS OWN 404 — `BRAND.md` Parts 3 and 5.
 *
 * THE DEFECT. Six marketing routes can miss — `/blog/[slug]`,
 * `/compare/[vendor]`, `/docs/[slug]` and the three resource guides — and the
 * `(marketing)` group had no `not-found.tsx`, so every one of them fell
 * through to the chrome-less `app/not-found.tsx`. A visitor arriving from a
 * stale link got no header, no footer, no nav and one way out.
 *
 * WHERE THE CHROME COMES FROM, AND WHY THIS FILE ASSERTS A PATH. Next resolves
 * `notFound()` to the NEAREST `not-found.tsx` walking up from the missing
 * route, and wraps it in that segment's layout. The mechanism IS the file's
 * location — there is no import, no registration, nothing a render can
 * observe. So the path is asserted here (moving the file back out is exactly
 * how the defect returns), and whether the header and footer actually paint on
 * a real 404 response is proved in a browser by `e2e/smoke.spec.ts`, which
 * also carries its axe stop and its 390px width probe. Neither half is
 * sufficient alone and this comment is the reason both exist.
 *
 * THE ROOT 404 MUST STAY CHROME-LESS. It is what a clinic tenant and every
 * non-marketing route gets, and the marketing header is not their nav — the
 * assertion below is what stops a future "let's just share one 404".
 */

const root = resolve(__dirname, '../..')

describe('the marketing 404', () => {
  it('lives inside the (marketing) group, which is the whole mechanism', () => {
    expect(
      existsSync(resolve(root, 'app/(marketing)/not-found.tsx')),
      'moved out of the route group — every marketing miss falls back to the chrome-less root 404 again',
    ).toBe(true)
  })

  it('leaves the root 404 chrome-less, for the tenants it belongs to', () => {
    const rootNotFound = readFileSync(resolve(root, 'app/not-found.tsx'), 'utf8')
    expect(
      rootNotFound,
      'the root 404 grew marketing chrome — a clinic tenant would get our nav',
    ).not.toMatch(/components\/marketing/)
  })

  it('offers real destinations, not a dead end', () => {
    render(<MarketingNotFound />)
    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((h): h is string => !!h)

    // Home is the one destination not in the public-paths registry (it is the
    // root), so it is named separately rather than loosening the check below.
    expect(hrefs, 'no way back to the homepage').toContain('/')

    const elsewhere = hrefs.filter((h) => h !== '/')
    expect(elsewhere.length, 'a 404 with one exit is still a dead end').toBeGreaterThanOrEqual(4)

    // A recovery link that 404s is the joke writing itself. Graded against the
    // registry the header and middleware already share, so a route renamed out
    // from under this page fails here rather than on the page.
    for (const href of elsewhere) {
      expect(
        MARKETING_PUBLIC_PATHS as readonly string[],
        `"${href}" is not a public marketing path — a 404 page must not link to one`,
      ).toContain(href)
    }
  })

  it('has exactly one h1, and it says what happened without apologising', () => {
    const { container } = render(<MarketingNotFound />)
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)

    const body = container.textContent ?? ''
    // Part 5's copy voice: errors stay completely straight. No apology
    // theatre, and none of the banned marketing verbs.
    for (const banned of [/we&?'?re sorry/i, /oops/i, /whoops/i, /uh[- ]oh/i, /our bad/i]) {
      expect(body, `apology theatre on a 404: ${banned}`).not.toMatch(banned)
    }
    for (const banned of [/leverage/i, /seamless/i, /unlock/i, /empower/i, /supercharge/i]) {
      expect(body, `banned marketing verb: ${banned}`).not.toMatch(banned)
    }
  })

  it('marks the moment with the ambient glyph, and only that one', () => {
    const { container } = render(<MarketingNotFound />)
    const imgs = Array.from(container.querySelectorAll('img'))
    const emoji = imgs.filter((i) => (i.getAttribute('src') ?? '').includes('/images/emoji/'))

    expect(emoji, 'the marketing 404 should carry exactly one animated glyph').toHaveLength(1)

    // WHY `planet` AND NOTHING ELSE. Part 5 bans emoji from error copy, and a
    // 404 is one line from that ban. The registry's own `use` field is what
    // makes this glyph legal here — it is the one entry that marks a PLACE
    // rather than reacting to the visitor, so it cannot read as celebrating a
    // dead link the way 🎉 or ✨ would. Read off the registry rather than
    // hard-coded, so editing that field forces this test to be re-argued.
    expect(MARKETING_EMOJI.planet.use.toLowerCase()).toMatch(/mark and not a mood/)
    expect(emoji[0].getAttribute('src')).toBe('/images/emoji/planet.webp')

    // Decorative: the label beside it already says what this section is.
    expect(emoji[0].getAttribute('alt')).toBe('')
    expect(emoji[0].getAttribute('aria-hidden')).toBe('true')
  })

  it('tells crawlers not to keep the page', async () => {
    // The status code says this already; the meta says it to the crawlers that
    // read one and not the other. An indexed 404 is a 404 that keeps arriving.
    const mod = await import('@/app/(marketing)/not-found')
    expect(mod.metadata.robots).toEqual({ index: false, follow: true })
    expect(mod.metadata.title).toMatch(/not found/i)
  })
})
