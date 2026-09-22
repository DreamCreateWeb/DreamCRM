import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from '../a11y/palette'
import { stripComments } from './source-text'

/**
 * `data-mkt-mock` IS AN AXE EXCLUSION WEARING AN ATTRIBUTE, SO THE SOURCE HAS
 * TO SAY WHERE IT IS — DREAMCRM-87.
 *
 * WHAT IT BUYS AND WHY THAT NEEDS WATCHING. `PRODUCT_MOCKS` in `e2e/axe.ts` is
 * `[data-mkt-mock][aria-hidden="true"]`, and the `marketing: product` stop
 * holds a ceiling of ZERO on the back of it — 99 `color-contrast` nodes at
 * 1440 disappear when it is applied. An exclusion is the one thing in that
 * harness that can only ever make a gate LOOSER, and this one is spelled as an
 * attribute a person could type anywhere, so the population has to be
 * enumerable from the source rather than only observable in a browser.
 *
 * THE MATCH IS ON THE ATTRIBUTE NAME, NOT ON A SPELLING OF IT, and that is the
 * correction this file exists in its current form for (Sentinel, review of
 * #647). The first version searched for the literal string
 * `data-mkt-mock="true"`. The exclusion runs against the RENDERED DOM, and
 * React renders a valueless JSX attribute as `="true"` — so
 * `<header data-mkt-mock aria-hidden="true">` and `data-mkt-mock={true}` each
 * produce a node the exclusion pardons, and the string search saw NEITHER.
 * Reproduced before it was fixed: the marker planted valueless on the shared
 * marketing header — which renders on every page of the site — took that
 * header out of every axe rule at the stop, and this file reported **4
 * passed**. §2d's identity-looseness family, one step over from the spellings
 * it already lists: the VALUE has no fixed form either.
 *
 * THE THREE THINGS THIS ASSERTS, each closing a different way the marker could
 * quietly widen:
 *
 *   1. **BOTH HALVES, ON THE SAME ELEMENT.** The exclusion requires
 *      `aria-hidden="true"` beside the marker — the same both-halves
 *      discipline `DECORATIVE_MOCKS` uses (`.mkt-float >` AND the attribute) —
 *      so a half-declared element is not exempt. A call site carrying one
 *      without the other is a silent no-op today and a confusing red run
 *      later, so it fails here instead. And the marker has to be the FLAG
 *      spelling, because `data-mkt-mock="false"` reads as "not a mock" to a
 *      person and is pardoned by a presence selector all the same.
 *   2. **IT STILL MATCHES SOMETHING, AND EXACTLY WHAT.** A marker nobody uses
 *      is an exclusion that matches nothing, which `deadExclusions` would fail
 *      the stop for — but only on a browser run. This catches the rename in
 *      `test`, and pins the count at eleven.
 *   3. **IT HAS NOT LEFT THE DRAWN SCREENS.** Every use is in
 *      `components/marketing/ui.tsx`, the file whose whole second half is
 *      product mocks. This is the one path-shaped assertion here and it is
 *      deliberate: the marker's claim is "I am a drawing of our own product at
 *      reduced scale", and that claim belongs to a mock component. A use
 *      anywhere else is not a lint failure to be waived — it is somebody about
 *      to exempt a real surface from a required accessibility check.
 *
 * AND A FOURTH, WHICH IS THE ONE THAT KEEPS THE OTHER THREE HONEST: the
 * exclusion in `e2e/axe.ts` and this guard have to be grading the SAME
 * attribute. Two files naming one string is how they start disagreeing, and
 * the review that found the spelling bug found them already disagreeing — the
 * docblocks said presence, the selector said `="true"`. `e2e/axe.ts` is read
 * here rather than imported, because importing it pulls Playwright into a
 * vitest process; that is the `token-contrast.test.ts` sticky-fill shape,
 * where a source read is the instrument because the module cannot be run.
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
 *   - **The valueless spelling on the site header** — `<header data-mkt-mock`
 *     in `components/marketing/chrome.tsx`, the exact shape that was green
 *     before this correction. Rule 3 reddens naming the file, and rule 1
 *     reddens too because that header has no `aria-hidden`. This is the
 *     mutation that would have found the defect, so it is first.
 *   - Dropping `aria-hidden="true"` from `PortalMock`'s root — how a
 *     half-declaration would really arrive, by somebody tidying an attribute
 *     they read as redundant — reddens rule 1 naming the line.
 *   - `data-mkt-mock="false"` on a mock root reddens rule 1 with a message
 *     naming the VALUE rather than a missing `aria-hidden`, so the two
 *     failures it can report are distinguishable from each other.
 *   - Deleting all eleven reddens rule 2 rather than leaving the file scanning
 *     nothing.
 *   - Changing `PRODUCT_MOCKS` to `[data-mkt-mock="true"][aria-hidden="true"]`
 *     reddens rule 4 — the disagreement that shipped, caught by name.
 *   - Forcing `stripComments` to return its input reddens rule 2's exact
 *     count: `ui.tsx`'s own docblock names the marker while explaining it, and
 *     the first draft read that as a twelfth element. §2d's "the right string
 *     in the wrong scope".
 */

/** The attribute, by NAME. Every spelling of its value renders the same node. */
const MARKER_NAME = 'data-mkt-mock'
/** Every use of it, however the value is (or is not) written. */
const MARKER = new RegExp(`${MARKER_NAME}(?![\\w-])`, 'g')
/** The attribute it is required to travel with. */
const HIDDEN = 'aria-hidden="true"'

/**
 * The spellings that mean "yes" — a bare attribute, `={true}`, or `="true"`.
 * React renders all three as `="true"`, so all three are pardoned; anything
 * else is a value a reader would take at face value and the DOM would not.
 */
const FLAG_VALUE = /^(?:|=\{true\}|="true")$/

/** The one file the marker belongs in — see rule 3 above for why this is a path. */
const MOCK_FILE = 'components/marketing/ui.tsx'

/** Where the exclusion this guard is about actually lives. */
const AXE_FILE = 'e2e/axe.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

export type MarkerUse = {
  file: string
  line: number
  /** Exactly what followed the attribute name — `""`, `="true"`, `={x}`. */
  value: string
  withHidden: boolean
}

/**
 * Every use of the marker attribute in the product tree, with the value as
 * written and whether its own JSX element also carries `aria-hidden="true"`.
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
      for (const m of Array.from(src.matchAll(MARKER))) {
        const at = m.index
        const after = src.slice(at + MARKER_NAME.length)
        // What this attribute was given, if anything: `="true"`, `={true}`,
        // `={someVar}`, or nothing at all before the next whitespace or `>`.
        const value = /^=(?:"[^"]*"|'[^']*'|\{[^}]*\})/.exec(after)?.[0] ?? ''
        const open = src.lastIndexOf('<', at)
        const close = src.indexOf('>', at)
        const element = open === -1 || close === -1 ? '' : src.slice(open, close + 1)
        uses.push({
          file: rel,
          line: src.slice(0, at).split('\n').length,
          value,
          withHidden: element.includes(HIDDEN),
        })
      }
    }
  }
  return uses
}

/** The `PRODUCT_MOCKS` selector as `e2e/axe.ts` actually spells it. */
export function productMocksSelector(): string | null {
  const src = readFileSync(join(ROOT, AXE_FILE), 'utf8')
  return /export const PRODUCT_MOCKS = \[\s*'([^']+)'/.exec(src)?.[1] ?? null
}

describe('the product-mock marker an axe exclusion is derived from', () => {
  it('never appears without aria-hidden on the same element, and is always the flag spelling', () => {
    const broken = markerUses()
      .filter((u) => !u.withHidden || !FLAG_VALUE.test(u.value))
      .map(
        (u) =>
          `${u.file}:${u.line} — ${MARKER_NAME}${u.value || ' (no value)'}` +
          `${u.withHidden ? '' : ', no aria-hidden on this element'}`,
      )

    expect(
      broken,
      'PRODUCT_MOCKS in e2e/axe.ts is `[data-mkt-mock][aria-hidden="true"]` — ' +
        'BOTH halves, the same discipline DECORATIVE_MOCKS uses. An element ' +
        'carrying only the marker is exempt from nothing, which is a silent ' +
        'no-op now and a confusing red stop later. And the marker is a FLAG: ' +
        'React renders a bare attribute, ={true} and ="true" identically, so ' +
        'any other value reads as something the DOM will not honour — ' +
        'data-mkt-mock="false" says "not a mock" to a person and is pardoned ' +
        'all the same. Add aria-hidden, or remove the marker if this is not a ' +
        'drawn screen.',
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
    // number is asserted because the comment-stripping exists for a COUNT that
    // was wrong — `ui.tsx`'s docblock names the marker, and the first draft
    // read that as a twelfth element.
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

  it('grades the same attribute the axe exclusion does', () => {
    // The fourth rule, and the one that keeps the other three honest. Two
    // files naming one string is how they start disagreeing — and they DID:
    // the docblocks said presence while the selector said `="true"`, which is
    // the gap the spelling bug lived in.
    const selector = productMocksSelector()
    expect(selector, `PRODUCT_MOCKS not found in ${AXE_FILE}`).not.toBeNull()
    expect(
      selector,
      'the exclusion must key on the attribute NAME, the same predicate this ' +
        'guard matches. Keyed on a value (`[data-mkt-mock="true"]`) the two ' +
        'drift apart the moment somebody writes the attribute another way — ' +
        'which React renders identically and this guard would then be ' +
        'grading a different population than the gate.',
    ).toBe(`[${MARKER_NAME}][${HIDDEN}]`)
  })

  it('the reader sees every spelling, and reads the ELEMENT rather than the line', () => {
    // The field of view. A guard whose scanner cannot see the defect reports
    // CLEAN forever, and this one could not see two of the three spellings.
    const uses = markerUses()
    expect(uses.every((u) => u.withHidden)).toBe(true)
    expect(uses.every((u) => FLAG_VALUE.test(u.value))).toBe(true)

    // Both LAYOUTS are present in the real file, which is what makes the
    // element-bounded read evidence rather than a coincidence. Matched with a
    // line-ending-agnostic regex: a literal `\n      ` went red on a Windows
    // checkout the moment git handed the file over with CRLF, and a guard that
    // only tells the truth on Linux is half a guard.
    const src = readFileSync(join(ROOT, MOCK_FILE), 'utf8')
    expect(src, 'the single-line spelling').toContain(`${MARKER_NAME}="true" ${HIDDEN}>`)
    expect(
      new RegExp(`${MARKER_NAME}="true"\\s*\\r?\\n\\s*${HIDDEN}`).test(src),
      'the multi-line spelling',
    ).toBe(true)
  })
})
