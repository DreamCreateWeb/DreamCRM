import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as axeHarness from '../../e2e/axe'

/**
 * AN AXE EXCLUSION IS CHECKED BOTH WAYS, AND BOTH CHECKS HAVE TO STAY WIRED.
 *
 * An exclusion is the only thing in the browser harness that makes the gate
 * LOOSER — it takes a subtree out of the scan entirely, which is what lets
 * `marketing: home` and `marketing: product` each hold a ceiling of ZERO. Two
 * different questions keep that honest, and `expectNoA11yViolations` has to
 * ask BOTH at every stop:
 *
 *  1. `deadExclusions` — does the selector still MATCH something? An exclusion
 *     outliving the illustration it was written for is a blanket pardon.
 *  2. `exclusionsHidingReadableText` — is the REASON still true? The selector
 *     claims a subtree is a PICTURE, which is what WCAG 1.4.3 exempts. A
 *     readable panel growing inside it keeps the selector matching while the
 *     argument stops describing anything (DREAMCRM-63).
 *
 * WHY THIS GUARD IS IN `test` AND NOT IN `e2e/axe-selftest.spec.ts` WITH THE
 * REST. `expectNoA11yViolations` reports through `expect.soft`, and a soft
 * failure marks the test that provoked it failed regardless of what that test
 * then asserts about it — so the FAILING direction of the production path
 * cannot be a passing Playwright test. It was watched by hand instead (the
 * selftest names the exact document), and this file is what stops the wiring
 * coming undone afterwards: delete either assertion from
 * `expectNoA11yViolations` and every browser stop goes on reporting clean,
 * which is exactly what a run with nothing to report looks like. Same trap,
 * and the same answer, as `tests/guards/axe-headroom-table.test.ts` one lane
 * over.
 *
 * It reads source rather than running the browser deliberately: a broken wire
 * should fail in the two minutes before a merge, not as an absent check
 * nobody can see.
 */

const AXE_SRC = readFileSync(resolve(process.cwd(), 'e2e/axe.ts'), 'utf8')

/** The body of `expectNoA11yViolations`, matched by counting braces. */
function expectNoA11yViolationsBody(): string {
  const from = AXE_SRC.indexOf('export async function expectNoA11yViolations(')
  expect(from, 'expectNoA11yViolations is gone from e2e/axe.ts').toBeGreaterThan(-1)
  // Not "everything up to the next `}`": the body is full of template literals
  // carrying `${…}`, so the first closing brace lands mid-message. Ask about
  // the MATCHING delimiter, never the nearest one — the trap the #559 per-row
  // rule paid for.
  const open = AXE_SRC.indexOf('{', AXE_SRC.indexOf(')', from))
  let depth = 0
  for (let i = open; i < AXE_SRC.length; i++) {
    if (AXE_SRC[i] === '{') depth++
    else if (AXE_SRC[i] === '}' && --depth === 0) return AXE_SRC.slice(open, i + 1)
  }
  throw new Error('unbalanced braces in expectNoA11yViolations')
}

describe('an axe exclusion is asked both questions at every stop', () => {
  const body = expectNoA11yViolationsBody()

  it('asserts that no exclusion has stopped MATCHING anything', () => {
    expect(
      body,
      'expectNoA11yViolations must call deadExclusions and assert on the result. Without the ' +
        'assertion the call is a measurement nobody reads, and an exclusion left standing over a ' +
        'subtree that has gone pardons whatever lands there next.',
    ).toContain('await deadExclusions(page, options.exclude)')
    expect(body, 'the dead-exclusion result must be asserted, not merely computed').toMatch(
      /expect\s*\n?\s*\.soft\(\s*\n?\s*dead,/,
    )
  })

  it('asserts that no exclusion has stopped being TRUE', () => {
    expect(
      body,
      'expectNoA11yViolations must call exclusionsHidingReadableText and assert on the result. ' +
        'This is the half that asks whether the exemption REASON survives — three of the four ' +
        'dead-exemption detectors in this repo asked only whether it still matched, and #587 ' +
        'showed what that costs: every one of them green over a headline at 1.88.',
    ).toContain('await exclusionsHidingReadableText(page, options.exclude)')
    expect(body, 'the pardoned-finding result must be asserted, not merely computed').toMatch(
      /expect\s*\n?\s*\.soft\(\s*\n?\s*pardoned\./,
    )
  })

  it('grades against the repo legibility floor rather than a number typed here', () => {
    // 12px is not this guard's opinion; it is what
    // `tests/a11y/legibility-floor.test.ts` already enforces at the source, so
    // "text a person is meant to read" means one thing in both places. A
    // separate number here would be a second cutoff that drifts.
    //
    // `(?![\d.])` rather than a bare `toContain`, and this is the #588 mutation
    // class in a NUMERIC costume — found by Quinn reviewing this very file.
    // `toContain('… = 12')` is satisfied by `= 120`, `= 126`, `= 128`, and
    // 120-and-up is precisely the range that neuters the check: nothing in a
    // marketing mock can reach a 120px floor, so `exclusionsHidingReadableText`
    // returns [] at every stop forever while the assertion NAMED for catching
    // that says nothing. §2d's rule is "try `<MARKER>_V2`"; a bare numeric
    // literal is the same shape — a prefix is not a value.
    expect(
      AXE_SRC,
      'e2e/axe.ts must keep the picture-scale ceiling at the repo 12px legibility floor. ' +
        'A larger number does not loosen this check by degrees — past ~120 it switches it off, ' +
        'because no glyph in an illustration is that tall.',
    ).toMatch(/const PICTURE_SCALE_CEILING_PX = 12(?![\d.])/)
  })

  it('skips the extra scan when a stop carries no exclusions', () => {
    // The premise check costs a second axe pass. Two stops in the suite pass
    // exclusions (`marketing: home` and, since DREAMCRM-87, `marketing:
    // product`), and paying for it at the other thirty-odd would be a reason
    // to take the check back out.
    const fn = AXE_SRC.slice(
      AXE_SRC.indexOf('export async function exclusionsHidingReadableText('),
      AXE_SRC.indexOf('export async function expectNoA11yViolations('),
    )
    expect(
      fn,
      'exclusionsHidingReadableText must return early when there is nothing to check.',
    ).toContain('if (exclude.length === 0) return []')
  })
})

/**
 * AND THE THIRD QUESTION, WHICH NEITHER OF THE ABOVE ASKS: IS THE SELECTOR
 * STILL A CLAIM THAT THE SUBTREE IS A PICTURE? - Quinn's review of #647,
 * DREAMCRM-87.
 *
 * `deadExclusions` asks whether a selector still MATCHES. The premise check
 * asks whether what it matches is still picture-scale. Neither asks whether
 * the SELECTOR ITSELF still says anything.
 *
 * THE HISTORY MATTERS HERE, because the instance this was written for is
 * closed and the CLASS is wider than it looked. The first draft reproduced it
 * by replacing `PRODUCT_MOCKS` wholesale; #647 then grew a fourth rule in
 * `tests/marketing/product-mocks.test.tsx` pinning that constant's literal,
 * which closes that spelling properly.
 *
 * IT DOES NOT CLOSE THE SHAPE, and Sentinel found the reason while reviewing
 * #647: rule 4 reads only `PRODUCT_MOCKS[0]`. An exclusion list is an ARRAY,
 * so the blanket pardon does not have to replace anything - it can simply be
 * APPENDED. Measured on `main` at `71f4037e` with this guard absent:
 *
 *     export const PRODUCT_MOCKS = ['[data-mkt-mock][aria-hidden="true"]',
 *                                   '[aria-hidden="true"]']
 *
 *   -> `tests/guards` + `tests/marketing` + `tests/a11y`: **86 files, 1,177
 *   tests, all green.** One comma from pardoning every `aria-hidden` subtree
 *   on the site, with the suite clean. Rule 4 is not weak here; it is looking
 *   at element 0 and the defect is at element 1.
 *
 * The same run, same subset, same tree, also green with the OTHER list
 * blanketed - `DECORATIVE_MOCKS` reduced to `['[aria-hidden="true"]']`, which
 * is the HOMEPAGE exclusion: **1,177 passed**. `e2e/axe-selftest.spec.ts`
 * catches that one, but only there, and only because someone hand-wrote
 * `toMatch(/^\.mkt-float/)` for that one name. And a NEW third list arriving
 * blanketed is invisible to everything - that case is not hypothetical, it is
 * exactly how `PRODUCT_MOCKS` itself arrived unpinned.
 *
 * So the pattern is: pinning is per-constant, per-element and hand-written,
 * and it therefore covers exactly what somebody remembered to look at. This
 * grades the PROPERTY over every selector in every exported list.
 *
 * THE PROPERTY, stated in its own terms rather than as a spelling.
 * `[aria-hidden="true"]` is the author saying "not content". WCAG 1.4.3
 * exempts something stronger - "this is a picture" - and only the second claim
 * justifies taking a subtree out of a required accessibility check. So the
 * attribute may be a necessary HALF of an exclusion and never the whole of
 * one: strip it, and what remains must still restrict to something.
 *
 * Grading the PROPERTY rather than a literal also survives the case a literal
 * pin cannot: rule 4 compares `PRODUCT_MOCKS` against an expected string
 * written beside it, so widening the selector AND updating that string is a
 * two-line edit that passes. It fails here.
 *
 * DERIVED, NOT ENUMERATED (§2d, and the same move as the intake list's tree
 * walk). Every exported `string[]` in `e2e/axe.ts`, not the two that exist
 * today.
 *
 * IT IMPORTS THE MODULE RATHER THAN GREPPING IT, which is §2d's "a guard that
 * greps a module it could have imported is testing the file, not the rule" -
 * the assertions above read source only because a function BODY cannot be.
 * #647's rule 4 reads source instead, on the stated grounds that importing
 * `e2e/axe.ts` drags Playwright into a vitest process. That cost is real and
 * it was measured rather than assumed: the import resolves in ~0.3s, the full
 * suite and CI's `test` job are both green with it, and `tests/guards/`
 * already imports four other `e2e/` modules. It is also not optional here -
 * this guard needs the RUNTIME VALUE of every exported array, and parsing
 * arbitrary array literals out of source is the fragile thing §2d is warning
 * about. Rule 4 reads a single known literal, so the cheaper shape is right
 * there and wrong here.
 *
 * WATCHED TO FAIL, six ways, each red naming the constant and the offending
 * selector: the blanket APPENDED to `PRODUCT_MOCKS` as a second element (the
 * one rule 4 cannot see); `DECORATIVE_MOCKS` and `PRODUCT_MOCKS` each
 * blanketed wholesale; `['* > [aria-hidden="true"]']`, the
 * remainder-is-a-combinator dodge; the `aria-hidden` half dropped; and a new
 * list arriving blanketed, which reddens the census AND the property.
 */
describe('no axe exclusion is satisfiable by aria-hidden alone', () => {
  const HIDDEN = '[aria-hidden="true"]'

  /** Every exclusion list the harness exports, derived rather than named. */
  const exclusionLists = Object.entries(axeHarness).filter(
    (entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) && entry[1].every((s) => typeof s === 'string'),
  )

  it('finds the exclusion lists it is meant to grade', () => {
    // The anti-vacuity control, and the same reason the selftest pins
    // `DECORATIVE_MOCKS.length`: a derivation that silently resolves to []
    // makes every assertion below pass while grading nothing. Naming the two
    // that exist today ALSO closes the escape hatch — un-exporting a list to
    // duck the rule fails here rather than going quiet.
    expect(
      exclusionLists.map(([name]) => name).sort(),
      'The set of axe exclusion lists in e2e/axe.ts has changed, and that is a deliberate edit ' +
        'rather than a failure. ADDING one: an exclusion is the only thing in this harness that ' +
        'makes a required gate LOOSER, so a new one costs a line here and the review that comes ' +
        'with it — the same cost direction #642 chose for product mocks, where a new mock fails ' +
        '`test` until somebody registers it. REMOVING or RENAMING one: update this list, and ' +
        'check the stop that passes it — an un-exported list is still passed to `exclude` at ' +
        'its call site while nothing grades its selectors any more.',
    ).toEqual(['DECORATIVE_MOCKS', 'PRODUCT_MOCKS'])
  })

  it.each(exclusionLists)(
    '%s pairs aria-hidden with a claim that the subtree is a picture',
    (name, selectors) => {
      expect(selectors.length, `${name} is empty — an exclusion list with no selectors`).toBeGreaterThan(0)

      for (const selector of selectors) {
        const why =
          `${name} contains "${selector}". An axe exclusion takes a subtree out of a REQUIRED ` +
          `accessibility check, so it has to carry the claim WCAG 1.4.3 actually exempts — ` +
          `"this is a picture". \`aria-hidden="true"\` is the weaker claim "not content", it is ` +
          `on hundreds of unrelated decorative things in this repo, and on its own it would ` +
          `pardon every one of them forever on the strength of an attribute nobody would think ` +
          `twice about typing. Pair it with something that identifies the subtree — the drift ` +
          `wrapper (DECORATIVE_MOCKS) or the mock's own marker (PRODUCT_MOCKS).`

        expect(selector, why).toContain(HIDDEN)

        // What the selector still restricts to once the attribute is removed.
        const remainder = selector.split(HIDDEN).join('').trim()
        expect(remainder, why).not.toBe('')

        // A combinator is not a restriction: `* > [aria-hidden="true"]` and
        // `[aria-hidden="true"] *` leave a non-empty remainder and pardon just
        // as widely. Require a class, an id or a second attribute.
        expect(remainder, why).toMatch(/[.#[]/)
      }
    },
  )
})
