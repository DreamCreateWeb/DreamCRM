import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * AN AXE EXCLUSION IS CHECKED BOTH WAYS, AND BOTH CHECKS HAVE TO STAY WIRED.
 *
 * `DECORATIVE_MOCKS` is the only thing in the browser harness that makes the
 * gate LOOSER — it takes a subtree out of the scan entirely, which is what
 * lets `marketing: home` hold a ceiling of ZERO. Two different questions keep
 * that honest, and `expectNoA11yViolations` has to ask BOTH at every stop:
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
    // The premise check costs a second axe pass. Exactly one stop in the suite
    // passes exclusions, and paying for it at the other thirty-odd would be a
    // reason to take the check back out.
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
