import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from '../a11y/palette'

/**
 * `data-mkt-mock` IS AN AXE EXCLUSION WEARING AN ATTRIBUTE, SO THE SOURCE HAS
 * TO SAY WHERE IT IS — DREAMCRM-87.
 *
 * WHAT IT BUYS AND WHY THAT NEEDS WATCHING. `PRODUCT_MOCKS` in `e2e/axe.ts` is
 * `[data-mkt-mock="true"][aria-hidden="true"]`, and the `marketing: product`
 * stop holds a ceiling of ZERO on the back of it — 103 `color-contrast` nodes
 * at 1440 disappear when it is applied. An exclusion is the one thing in that
 * harness that can only ever make a gate LOOSER, and this one is spelled as an
 * attribute a person could type anywhere, so the population has to be
 * enumerable from the source rather than only observable in a browser.
 *
 * THE THREE THINGS THIS ASSERTS, each closing a different way the marker could
 * quietly widen:
 *
 *   1. **BOTH HALVES, ON THE SAME ELEMENT.** The exclusion requires
 *      `aria-hidden="true"` beside the marker — the same both-halves
 *      discipline `DECORATIVE_MOCKS` uses (`.mkt-float >` AND the attribute) —
 *      so a half-declared element is not exempt. A call site carrying one
 *      without the other is a silent no-op today and a confusing red run
 *      later, so it fails here instead.
 *   2. **IT STILL MATCHES SOMETHING.** A marker nobody uses is an exclusion
 *      that matches nothing, which `deadExclusions` would fail the stop for —
 *      but only on a browser run. This catches the rename in `test`.
 *   3. **IT HAS NOT LEFT THE DRAWN SCREENS.** Every use is in
 *      `components/marketing/ui.tsx`, the file whose whole second half is
 *      product mocks. This is the one path-shaped assertion here and it is
 *      deliberate: the marker's claim is "I am a drawing of our own product at
 *      reduced scale", and that claim belongs to a mock component. A use
 *      anywhere else is not a lint failure to be waived — it is somebody about
 *      to exempt a real surface from a required accessibility check.
 *
 * WHAT THIS DOES NOT DO, so a green run is not mistaken for proof: it says
 * nothing about whether a marked subtree is still picture-scale. That question
 * needs a rendered page, and `exclusionsHidingReadableText` in `e2e/axe.ts`
 * answers it on every run of the stop — it measures what the exclusion
 * actually buys and fails on anything at or above the 12px picture-scale
 * ceiling that is also failing contrast. It found two the day the marker
 * shipped, and both were fixed rather than pardoned.
 *
 * WATCHED TO FAIL (§2d):
 *
 *   - Dropping `aria-hidden="true"` from `PortalMock`'s root — which is how a
 *     half-declaration would really arrive, by somebody tidying an attribute
 *     they read as redundant — reddens rule 1 naming `ui.tsx:1571`.
 *   - Moving one marker onto `<header>` in `components/marketing/chrome.tsx`
 *     reddens rule 3 naming the file.
 *   - Deleting all eleven reddens rule 2 rather than leaving the file scanning
 *     nothing.
 *   - Forcing `stripComments` to return its input reddens rule 2's exact
 *     count. That mutation is the reason the stripper is here at all: the
 *     first draft read `ui.tsx`'s own docblock — which quotes the marker while
 *     explaining it — as a twelfth element, and that phantom PASSED rule 1 by
 *     accident, because walking back to the nearest `<` from inside a comment
 *     lands somewhere arbitrary and the slice happened to contain somebody
 *     else's `aria-hidden`. §2d's "the right string in the wrong scope", found
 *     by checking a count rather than by reasoning about it.
 */

/** The marker, and the attribute it is required to travel with. */
const MARKER = 'data-mkt-mock="true"'
const HIDDEN = 'aria-hidden="true"'

/** The one file the marker belongs in — see rule 3 above for why this is a path. */
const MOCK_FILE = 'components/marketing/ui.tsx'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Blank every comment, preserving offsets so a hit still resolves to its real
 * line.
 *
 * Load-bearing rather than tidy, and it was found by reading the count rather
 * than by reasoning: `ui.tsx`'s own docblock quotes `data-mkt-mock="true"`
 * while explaining what it is for, so the first draft counted 12 uses for 11
 * elements. The twelfth "passed" rule 1 by accident — walking back to the
 * nearest `<` from inside a comment lands somewhere arbitrary, and the slice
 * happened to contain an `aria-hidden` belonging to somebody else. That is
 * §2d's "the right string in the wrong scope" exactly: the pattern was right
 * and the haystack was not.
 */
function stripComments(src: string): string {
  const out = src.split('')
  let i = 0
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') {
      let end = src.indexOf('*/', i + 2)
      end = end === -1 ? src.length : end + 2
      for (let k = i; k < end; k++) if (out[k] !== '\n') out[k] = ' '
      i = end
      continue
    }
    if (src[i] === '/' && src[i + 1] === '/' && src[i - 1] !== ':') {
      let end = src.indexOf('\n', i)
      end = end === -1 ? src.length : end
      for (let k = i; k < end; k++) out[k] = ' '
      i = end
      continue
    }
    i++
  }
  return out.join('')
}

export type MarkerUse = { file: string; line: number; withHidden: boolean }

/**
 * Every `data-mkt-mock` in the product tree, and whether its own JSX element
 * also carries `aria-hidden="true"`.
 *
 * The element is bounded by walking back to the opening `<` and forward to the
 * matching `>`, NOT by reading the line: `HeroStatTile` spreads its attributes
 * over several lines and `PortalMock` puts a 200-character class string on
 * one, so a line-at-a-time reader would answer differently for two call sites
 * that are spelled identically.
 */
export function markerUses(roots = ['app', 'components', 'lib']): MarkerUse[] {
  const uses: MarkerUse[] = []
  for (const base of roots) {
    for (const file of walk(join(ROOT, base))) {
      const rel = relative(ROOT, file).split('\\').join('/')
      const src = stripComments(readFileSync(file, 'utf8'))
      let at = src.indexOf(MARKER)
      while (at !== -1) {
        const open = src.lastIndexOf('<', at)
        const close = src.indexOf('>', at)
        const element = open === -1 || close === -1 ? '' : src.slice(open, close + 1)
        uses.push({
          file: rel,
          line: src.slice(0, at).split('\n').length,
          withHidden: element.includes(HIDDEN),
        })
        at = src.indexOf(MARKER, at + MARKER.length)
      }
    }
  }
  return uses
}

describe('the product-mock marker an axe exclusion is derived from', () => {
  it('never appears without aria-hidden on the same element', () => {
    const halves = markerUses()
      .filter((u) => !u.withHidden)
      .map((u) => `${u.file}:${u.line}`)

    expect(
      halves,
      'PRODUCT_MOCKS in e2e/axe.ts is `[data-mkt-mock="true"][aria-hidden=' +
        '"true"]` — BOTH halves, the same discipline DECORATIVE_MOCKS uses. An ' +
        'element carrying only the marker is exempt from nothing, which is a ' +
        'silent no-op now and a confusing red stop later. Add aria-hidden, or ' +
        'remove the marker if this is not a drawn screen.',
    ).toEqual([])
  })

  it('still marks the drawn screens, so a rename cannot empty the exclusion', () => {
    // A rule narrowed until it matches nothing reports CLEAN forever, and the
    // browser-side detector for that (`deadExclusions`) only runs in `e2e`.
    const uses = markerUses()
    expect(
      uses.length,
      'nothing carries data-mkt-mock any more. `marketing: product` holds a ' +
        'ceiling of ZERO on an exclusion that would now match nothing — ' +
        'deadExclusions fails that stop by name, but only on a browser run. ' +
        'This is the same fact, caught in `test`.',
    ).toBeGreaterThanOrEqual(9)
    // ELEVEN, not twelve: the nine drawn screens on /product plus the two
    // pieces of DashboardMock the homepage hero pulls forward. The exact
    // number is asserted because the comment-stripping above exists for a
    // COUNT that was wrong — `ui.tsx`'s docblock quotes the marker, and the
    // first draft read that quotation as a twelfth element.
    expect(uses).toHaveLength(11)
  })

  it('has not left the drawn screens for a real surface', () => {
    const strays = Array.from(new Set(markerUses().map((u) => u.file))).filter(
      (f) => f !== MOCK_FILE,
    )

    expect(
      strays,
      `the marker exempts a subtree from every axe rule at the ` +
        `marketing: product stop. Its claim is "I am a drawing of our own ` +
        `product at reduced scale", which belongs to a mock component in ` +
        `${MOCK_FILE}. A use anywhere else is somebody about to exempt a real ` +
        `surface from a required accessibility check — which may well be the ` +
        `right call, and is exactly the decision that should cost a review ` +
        `rather than a diff nobody reads.`,
    ).toEqual([])
  })

  it('the reader actually reads the ELEMENT, not the line', () => {
    // The field of view. `HeroStatTile` spreads its attributes over several
    // lines and `PortalMock` puts a 200-character class string on one; a
    // line-at-a-time reader answers differently for two call sites spelled the
    // same way, which is the "right string in the wrong scope" trap (§2d).
    const uses = markerUses()
    expect(uses.every((u) => u.withHidden)).toBe(true)
    // Both spellings are present in the real file, which is what makes the
    // assertion above evidence rather than a coincidence.
    //
    // Matched with a line-ending-agnostic regex rather than a literal, because
    // the first draft used `\n      ` and went red on a Windows checkout the
    // moment git handed the file over with CRLF — a guard that only tells the
    // truth on Linux is half a guard, which is the same reason
    // `scripts/review-gate.mjs` carries no shebang.
    const src = readFileSync(join(ROOT, MOCK_FILE), 'utf8')
    expect(src, 'the single-line spelling').toContain(`${MARKER} ${HIDDEN}>`)
    expect(
      new RegExp(`${MARKER}\\s*\\r?\\n\\s*${HIDDEN}`).test(src),
      'the multi-line spelling',
    ).toBe(true)
  })
})
