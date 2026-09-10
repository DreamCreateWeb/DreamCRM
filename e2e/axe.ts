import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number]

/**
 * Runtime accessibility checks at the stops the E2E suite already makes
 * (DREAMCRM-25 item 4, Vesper's proposal from the DREAMCRM-22 meeting).
 *
 * WHY THIS EXISTS, given we already have an a11y gate. `pnpm lint` runs
 * eslint-plugin-jsx-a11y (DREAMCRM-17), and that gate is static: it reads JSX
 * source. It structurally cannot see
 *
 *   - colour contrast, which depends on computed styles and the cascade;
 *   - focus order, which depends on the rendered DOM order;
 *   - duplicate ids, which only collide once components are composed on a page;
 *   - an accessible name assembled at runtime (aria-labelledby pointing at a
 *     node another component rendered, a label whose text comes from data);
 *   - anything inside a portal, a dialog, or a state the source never shows
 *     side by side.
 *
 * axe-core in a real browser sees all of it. The 12 specs already navigate the
 * portal, the public clinic site, booking, the staff day and the token
 * journeys, so the pages are already loaded and settled — the check is a line
 * per stop on top of a journey we are paying for anyway.
 *
 * WHAT IT DOES NOT DO. Automated checks catch somewhere around a third to a
 * half of real accessibility defects. A green run here is not a claim that a
 * page is accessible; it is a claim that it has not regressed on the machine-
 * checkable part. `docs/UI-BEST-VERSION.md` stays the program of record.
 */

/**
 * WCAG 2.1 A and AA only — the conformance level the repo targets.
 *
 * Deliberately NOT `best-practice`: those rules encode axe's house style
 * (every region in a landmark, no nested interactive controls) rather than a
 * standard we have committed to, and mixing them in makes a red run ambiguous
 * about whether something is broken or merely unfashionable. A gate people
 * have to interpret is a gate people learn to ignore.
 *
 * `color-contrast` lives in wcag2aa and is one of the main reasons this file
 * exists, so it is very much in scope.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

type A11yOptions = {
  /** Scan only this subtree (CSS selector) instead of the whole page. */
  include?: string
  /** Subtrees to leave out of the scan (CSS selectors). */
  exclude?: string[]
}

/**
 * Scan the current page state and return whatever axe found.
 *
 * Split out from the assertion below so the detection path — injection, the
 * tag selection, the include/exclude plumbing — is testable on its own. That
 * is what `e2e/axe-selftest.spec.ts` exercises: a check that has never been
 * seen to fail has not been tested, and this one would otherwise report clean
 * forever if somebody narrowed `WCAG_TAGS` to nothing.
 */
export async function findA11yViolations(
  page: Page,
  options: A11yOptions = {},
): Promise<Violation[]> {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
  if (options.include) builder = builder.include(options.include)
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector)

  const { violations } = await builder.analyze()
  return violations
}

/**
 * Scan the current page state and fail the test if axe finds anything.
 *
 * `stop` names the page AND the state — "portal: appointments, reschedule
 * panel open", not "portal". The state is the point: an empty dialog and an
 * open one are different pages as far as a screen reader is concerned, and the
 * name is what a reader of a red CI log has to work from.
 *
 * Uses a SOFT assertion on purpose. A run that stops at the first bad stop
 * tells you about one problem and hides the other twenty-odd; every stop
 * reporting means one CI run gives the whole picture. The test still fails at
 * the end — soft is about completeness, not leniency.
 *
 * Call it AFTER the spec's own assertions for that stop, so the page is
 * settled and the state under test is really on screen.
 */
export async function expectNoA11yViolations(
  page: Page,
  stop: string,
  options: A11yOptions = {},
): Promise<void> {
  const violations = await findA11yViolations(page, options)

  if (violations.length === 0) {
    console.log(`[a11y] ok — ${stop}`)
    return
  }

  // Print the detail to stdout before asserting: Playwright's own diff shows
  // WHICH rules failed, and this shows WHICH ELEMENTS and why, which is what
  // someone actually needs to fix it. The CI log is the only artefact for a
  // passing-but-noisy run, so make it worth reading.
  console.log(`[a11y] FAIL — ${stop}`)
  for (const v of violations) {
    console.log(`  ${v.id} (${v.impact ?? 'unknown'}) ×${v.nodes.length}: ${v.help}`)
    console.log(`    ${v.helpUrl}`)
    for (const node of v.nodes) {
      console.log(`    at: ${node.target.join(' ')}`)
      const why = (node.failureSummary ?? '').split('\n').filter(Boolean)
      for (const line of why) console.log(`      ${line}`)
    }
  }

  // Compare a summary array against [] rather than asserting a count: the
  // failure message then names the rules instead of saying "expected 0, got 3".
  const summary = violations.map((v) => `${v.id} (${v.impact ?? 'unknown'}) ×${v.nodes.length}`)
  expect
    .soft(summary, `accessibility violations at "${stop}" — see the [a11y] block above for elements`)
    .toEqual([])
}
