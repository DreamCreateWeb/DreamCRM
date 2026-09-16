import { test, expect } from '@playwright/test'
import { COMPARISONS } from '../lib/marketing/comparisons'
import { DOCS } from '../lib/marketing/docs'
import { RESOURCE_GUIDES } from '../lib/marketing/resources'

/**
 * ZERO HORIZONTAL SCROLL ON THE MARKETING SITE, AT THE THREE WIDTHS
 * `BRAND.md` Part 10 names — 390, 834, 1440.
 *
 * Part 10 has said this is build-blocking since the brand book was written:
 *
 *   "Zero horizontal scroll at any width. The full-bleed effect is achieved by
 *    CLIPPING, not by letting the document get wider. That bug appeared while
 *    building round B and is exactly what ships if nobody checks — check it by
 *    measuring `scrollWidth` against `clientWidth`, not by looking at it."
 *
 * Nothing checked. The rule was enforced by whoever remembered to open a
 * browser at the end of a move, which is how `/compare/[vendor]` shipped
 * dragging **212px** sideways at 390 and stayed that way across three moves
 * and two ledger entries (`docs/RELEASE.md` Part 5, closed by DREAMCRM-76).
 * Move 3 found it by hand, move 4 re-measured twelve pages by hand and found
 * it still there, and both hand sweeps were right — the cost was that the
 * answer expired the moment the run ended.
 *
 * ── WHAT THIS ASSERTS, AND WHY IT IS THE DOCUMENT ────────────────────────
 *
 * `documentElement.scrollWidth - clientWidth`, exactly as Part 10 words it,
 * plus the pan probe: `scrollTo(9999, 0)` must leave `scrollX` at 0. The
 * second one is not redundant. It is the difference between a measurement and
 * a symptom — a reader's complaint is "the page slides under my thumb", and
 * `scrollX` is that sentence in a number.
 *
 * **Grade the DOCUMENT, never the elements.** The obvious implementation —
 * walk the DOM for anything whose right edge clears the viewport and has no
 * `overflow-x` ancestor — is the one that was already tried, in the ledger
 * entry for this very defect, and it returned ZERO while the page was panning
 * 212px. It was not a sloppy scan; it was asking a question whose answer does
 * not determine the one that matters. Scrollable overflow follows the
 * CONTAINING-BLOCK chain, and for an absolutely-positioned element — every
 * `sr-only` span on the site is one — that chain and the DOM ancestry come
 * apart. The spans were inside the scroll container in the DOM and outside it
 * for layout, so they widened the document while every element-level probe
 * reported the page contained.
 *
 * The document's own number cannot be fooled that way, because it is not an
 * inference about a mechanism — it is the thing the reader experiences. Any
 * future cause (a `min-w-` table, a bleeding mock, a wide `<pre>`, a mechanism
 * nobody here has thought of) fails this the same way.
 *
 * ── THE PAGE LIST IS DERIVED, NOT TYPED ──────────────────────────────────
 *
 * The dynamic routes read the same registries their own `generateStaticParams`
 * reads, so a ninth comparison or a new doc is covered the day it is added
 * rather than the day somebody remembers this file. That is the tone-tile
 * census lesson (`BRAND.md` Part 8 move 3) applied to a page list: a number —
 * or a list — written by hand goes stale silently, and this repo has watched
 * one do it twice.
 *
 * WHAT IS DELIBERATELY NOT COVERED, and it is exactly one thing: the pages
 * whose bodies come out of the DATABASE — `/blog` and `/blog/[slug]`. This
 * spec is seed-free by design, like `smoke.spec.ts` beside it, so on a freshly
 * migrated database those render an empty state that is not the page a reader
 * gets. Covering them means seeding a post, and a width guard that depends on
 * fixture data is a width guard that goes red for fixture reasons. When the
 * blog gets a seeded stop, add it here. The `docs` and `resources` articles
 * are code, not content, which is why they are in.
 *
 * ── WATCHED TO FAIL (§2d) ────────────────────────────────────────────────
 *
 * Against the real defect rather than a stand-in: run against
 * `origin/main`'s `app/(marketing)/compare/[vendor]/page.tsx` — the
 * `overflow-x-auto` wrapper around a `min-w-[42rem]` table — every
 * `/compare/<slug>` stop fails at 390 reporting `+212` and `scrollX 212`, and
 * the other eleven pages pass. Both halves matter: a guard that reddens
 * everything is not measuring the defect, and one that reddens nothing after
 * the fix is not measuring anything. Eight of the twelve failing stops were
 * the eight vendor slugs, which is also how the derived page list was checked
 * to be resolving rather than quietly returning an empty array.
 */

/** `BRAND.md` Part 10 — phone, tablet, desktop. Not a sample; the deliverable. */
const WIDTHS = [390, 834, 1440] as const

/**
 * Every marketing page whose content is CODE. The static paths first, then the
 * three dynamic families expanded from their own registries.
 */
const PAGES: string[] = [
  '/',
  '/pricing',
  '/product',
  '/why',
  '/compare',
  '/resources',
  '/changelog',
  '/docs',
  '/grade',
  '/roi',
  '/partner-program',
  ...COMPARISONS.map((c) => `/compare/${c.slug}`),
  ...DOCS.map((d) => `/docs/${d.slug}`),
  ...RESOURCE_GUIDES.map((g) => `/resources/${g.slug}`),
]

test.describe('BRAND.md Part 10 — zero horizontal scroll on the marketing site', () => {
  // A cheap assertion that the derived list resolved. An empty registry import
  // would make every loop below vacuous, and a suite that asserts nothing
  // looks exactly like a suite that passes.
  test('the page list is derived and non-empty', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(11 + 8)
    expect(PAGES).toContain('/compare/weave')
    expect(PAGES.filter((p) => p.startsWith('/docs/')).length).toBeGreaterThan(0)
    expect(PAGES.filter((p) => p.startsWith('/resources/')).length).toBeGreaterThan(0)
  })

  for (const width of WIDTHS) {
    test.describe(`at ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } })

      for (const path of PAGES) {
        test(`${path} does not scroll sideways`, async ({ page }) => {
          const res = await page.goto(path)
          // A 404/500 measures 0 and would pass silently — the one way this
          // guard could go green while seeing nothing.
          expect(res?.status(), `${path} did not render`).toBe(200)

          const { overflow, panned } = await page.evaluate(() => {
            const de = document.documentElement
            const overflow = de.scrollWidth - de.clientWidth
            window.scrollTo(9999, 0)
            const panned = Math.round(window.scrollX)
            window.scrollTo(0, 0)
            return { overflow, panned }
          })

          expect(
            overflow,
            `${path} at ${width}px: documentElement.scrollWidth exceeds clientWidth by ${overflow}px`,
          ).toBeLessThanOrEqual(0)
          expect(
            panned,
            `${path} at ${width}px: the document really pans ${panned}px — a reader can drag it sideways`,
          ).toBe(0)
        })
      }
    })
  }
})
