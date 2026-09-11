import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import { A11Y_BASELINE, A11Y_INCIDENTAL } from './axe-baseline'

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
  /**
   * Subtrees to leave out of the scan (CSS selectors), on top of the stop's own
   * `A11Y_INCIDENTAL` entry. For a one-off at a call site — a third-party embed,
   * a state a spec deliberately drives into. Anything standing permanently
   * belongs in `e2e/axe-baseline.ts` next to its reason, not here.
   */
  exclude?: string[]
}

/**
 * Longest we will wait for entrance animations before measuring anyway.
 *
 * The slowest real one is `components/clinic-site/scroll-reveal.tsx` at 700ms
 * plus a per-item stagger delay. 3s is generous headroom on a loaded runner
 * without turning a stuck animation into a stuck suite.
 */
const ANIMATION_BUDGET_MS = 3_000

/**
 * Let entrance animations finish before measuring anything.
 *
 * WHY THIS EXISTS — it is the fix for a false RED that reached a merge gate
 * (PR #528, 2026-09-10, found by Rio). `color-contrast` is computed from the
 * colour on screen AT THE INSTANT OF THE SCAN, and the clinic site fades its
 * content in with `opacity` over 700ms. Scan mid-fade and axe faithfully
 * measures a blend of the real ink against the page behind it, which is always
 * LIGHTER than the settled colour — so a passing element reports as failing,
 * with a ratio that depends on which frame you caught.
 *
 * The booking page proved it beyond argument: one run reported the SAME
 * selector at #979089 (2.95:1) on one attempt and #827b73 (3.91:1) on the
 * next, and the settled colour is `INK_MUTED` #6B635A at 5.52:1 — comfortably
 * passing. Solving each sample for opacity gives 0.69 and 0.84. They were
 * frames of one fade, not two independent measurements agreeing.
 *
 * That matters for how a red run is read. Two mid-fade samples are BOTH
 * guaranteed to sit below the settled value, so "both attempts measured it
 * failing" is not evidence the element fails — it is what a fade always looks
 * like. Only the settled state is a WCAG fact, because only the settled state
 * is what a person reads.
 *
 * IT CUTS BOTH WAYS, which is the part worth keeping. An element still at
 * opacity 0 when the scan lands is INVISIBLE to axe, so it is not measured at
 * all — a genuine violation on late-revealing content would simply not be
 * reported. Without this wait the second self-test case fails for exactly that
 * reason. So the wait closes a false red AND a false green; the gate was
 * capable of both.
 *
 * Infinite animations are skipped deliberately: `mkt-float` and `mkt-marquee`
 * in `components/marketing/ui.tsx` never finish, and waiting on them would
 * spend the whole budget on every marketing stop for nothing.
 */
async function settleAnimations(page: Page, budgetMs = ANIMATION_BUDGET_MS): Promise<void> {
  await page.evaluate(async (budget) => {
    const finishing = document.getAnimations().filter((a) => {
      // A CSS transition reports iterations 1; a spinner reports Infinity.
      const iterations = a.effect?.getComputedTiming().iterations
      return iterations !== Infinity
    })
    if (finishing.length === 0) return
    await Promise.race([
      // `.finished` rejects if an animation is cancelled — that is a settled
      // outcome for our purposes, so swallow it rather than failing the scan.
      Promise.all(finishing.map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, budget)),
    ])
  }, budgetMs)
}

/**
 * Scan the current page state and return whatever axe found.
 *
 * Split out from the assertion below so the detection path — injection, the
 * tag selection, the include/exclude plumbing, and the animation settle — is
 * testable on its own. That is what `e2e/axe-selftest.spec.ts` exercises: a
 * check that has never been seen to fail has not been tested, and this one
 * would otherwise report clean forever if somebody narrowed `WCAG_TAGS` to
 * nothing.
 */
export async function findA11yViolations(
  page: Page,
  options: A11yOptions = {},
): Promise<Violation[]> {
  await settleAnimations(page)

  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
  if (options.include) builder = builder.include(options.include)
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector)

  const { violations } = await builder.analyze()
  return violations
}

/**
 * Which rules exceed what the baseline carries. THE RATCHET, in one function.
 *
 * Takes the allowance rather than the stop name so `e2e/axe-selftest.spec.ts`
 * can pin the direction against its own literals — otherwise the self-test
 * would encode today's real numbers and break every time somebody fixes
 * something, which is the one PR it must never obstruct.
 *
 * A rule absent from `allowed` has a ceiling of ZERO, which is what makes a
 * new kind of violation, and an entirely new stop, fail on arrival.
 */
export function rulesOverBaseline(
  allowed: Record<string, number>,
  counts: Record<string, number>,
): string[] {
  return Object.entries(counts)
    .filter(([rule, n]) => n > (allowed[rule] ?? 0))
    .map(([rule]) => rule)
}

/** Print a violation with every offending element and axe's own explanation. */
function report(prefix: string, v: Violation): void {
  console.log(`${prefix} ${v.id} (${v.impact ?? 'unknown'}) ×${v.nodes.length}: ${v.help}`)
  console.log(`    ${v.helpUrl}`)
  for (const node of v.nodes) {
    console.log(`    at: ${node.target.join(' ')}`)
    for (const line of (node.failureSummary ?? '').split('\n').filter(Boolean)) {
      console.log(`      ${line}`)
    }
  }
}

/**
 * Which of a stop's incidental exemptions no longer match anything on the page.
 *
 * AN EXEMPTION THAT MATCHES NOTHING IS A DEAD EXEMPTION, and a dead exemption
 * is the one way this mechanism can rot into a blanket pardon: the selector
 * keeps sitting in `e2e/axe-baseline.ts` claiming a subtree is WCAG-incidental
 * while the illustration it was written for has been replaced by something a
 * person is genuinely meant to read. Nothing else in the suite would notice —
 * the scan would simply carry on reporting the stop clean.
 *
 * Returned rather than asserted so `e2e/axe-selftest.spec.ts` can pin BOTH
 * directions: a document containing the shape yields none, and a document
 * without it yields every selector by name. An exemption is the only thing in
 * this harness that makes the gate LOOSER, so it is the one that most needs a
 * test that has been seen to fail.
 */
export async function deadExemptions(page: Page, stop: string): Promise<string[]> {
  const dead: string[] = []
  for (const selector of A11Y_INCIDENTAL[stop] ?? []) {
    // `count()` is DOM presence, not visibility, on purpose: the portal mock is
    // `hidden lg:block`, so a narrower viewport would make a visibility check
    // report it dead when it is merely off-screen.
    if ((await page.locator(selector).count()) === 0) dead.push(selector)
  }
  return dead
}

/**
 * Scan the current page state and fail the test on anything the baseline in
 * `e2e/axe-baseline.ts` does not already account for.
 *
 * `stop` names the page AND the state — "portal: appointments, reschedule
 * panel open", not "portal". The state is the point: an empty dialog and an
 * open one are different pages as far as a screen reader is concerned, and the
 * name is what a reader of a red CI log has to work from. It is also the
 * baseline's key, so renaming a stop resets it to zero-tolerance — which is
 * the safe direction to be wrong in.
 *
 * THE BASELINE IS A CEILING PER (STOP, RULE) AND ONLY EVER SHRINKS. Read
 * `e2e/axe-baseline.ts` for what is in it and why it exists at all; the short
 * version is that the first run over real pages found 214 pre-existing
 * violations in UI code that QA does not change. Anything above a ceiling,
 * any rule not listed, and any stop not listed fails.
 *
 * A CEILING AND AN EXEMPTION ARE DIFFERENT CLAIMS, and the same file holds
 * both. A ceiling says "this is a real defect we have not fixed yet"; an
 * `A11Y_INCIDENTAL` entry says "WCAG does not ask this of us" — today, the
 * marketing hero's `aria-hidden` product illustrations, whose 8px simulated
 * screen text 1.4.3 exempts as incidental. Exempt subtrees are dropped from the
 * scan and every exemption is asserted to still match something, so it cannot
 * outlive the illustration it describes.
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
  // The stop's WCAG-incidental exemptions come first, then whatever the caller
  // asked for. Both are plain `exclude` selectors — the exemption is not a
  // second mechanism, it is the same one with its reason written down next to
  // the ceilings instead of buried at a call site.
  const incidental = A11Y_INCIDENTAL[stop] ?? []
  const dead = await deadExemptions(page, stop)
  expect
    .soft(
      dead,
      `DEAD incidental exemption at "${stop}" — these selectors in e2e/axe-baseline.ts ` +
        `match nothing on the page any more, so whatever they were written for has changed. ` +
        `Re-derive them against the current markup or delete them; do not leave an exemption ` +
        `standing over a subtree it no longer describes.`,
    )
    .toEqual([])

  const violations = await findA11yViolations(page, {
    ...options,
    exclude: [...incidental, ...(options.exclude ?? [])],
  })
  const allowed = A11Y_BASELINE[stop] ?? {}

  const counts = Object.fromEntries(violations.map((v) => [v.id, v.nodes.length]))
  const overIds = new Set(rulesOverBaseline(allowed, counts))
  const over = violations.filter((v) => overIds.has(v.id))

  // Improvements. A fixed rule is not a failure — making somebody's a11y FIX
  // turn their PR red is how a young gate gets bypassed — but an unshrunk
  // ceiling is dead weight that quietly re-opens room for regressions, so say
  // so loudly enough to be seen on the run summary.
  //
  // NOT on any drop, though. Some counts wobble by an element depending on
  // what is on screen: the first baselined run reported 8 nested-interactive
  // at the three agenda stops and 7 on the next, and the booking confirmation
  // went 2 then 1. Warning on those would have put a "shrink me" annotation on
  // roughly half of all runs within a day of shipping, and an annotation that
  // is usually wrong is one people stop reading — the exact failure this file
  // argues against everywhere else. So: a rule reaching ZERO is unambiguous
  // (it is fixed, the ceiling is dead weight), and below that only a drop
  // bigger than the observed wobble counts as evidence of a real fix.
  const WOBBLE = 1
  const found = new Map(violations.map((v) => [v.id, v.nodes.length]))
  for (const [rule, ceiling] of Object.entries(allowed)) {
    const now = found.get(rule) ?? 0
    if (now === 0 || now <= ceiling - WOBBLE - 1) {
      console.log(
        `::warning title=Shrink the a11y baseline::"${stop}" / ${rule} is down to ${now} ` +
          `from a ceiling of ${ceiling}. Lower it in e2e/axe-baseline.ts (delete the entry at 0) ` +
          `in the same PR as the fix, or the room stays open for a regression.`,
      )
    }
  }

  if (over.length === 0) {
    const carried = violations.reduce((n, v) => n + v.nodes.length, 0)
    const notes = [
      carried ? `${carried} carried by the baseline` : '',
      incidental.length ? `${incidental.length} incidental subtree(s) exempt` : '',
    ].filter(Boolean)
    console.log(`[a11y] ok — ${stop}${notes.length ? ` (${notes.join(', ')})` : ''}`)
    return
  }

  // Print the detail before asserting: Playwright's own diff shows WHICH rules
  // failed, and this shows WHICH ELEMENTS and why, which is what someone
  // actually needs to fix it. The CI log is the only artefact anyone gets.
  console.log(`[a11y] FAIL — ${stop}`)
  for (const v of over) report(' ', v)

  // Compare a summary array against [] rather than asserting a count: the
  // failure message then names the rules instead of saying "expected 0, got 3".
  const summary = over.map(
    (v) => `${v.id} ×${v.nodes.length} (baseline allows ${allowed[v.id] ?? 0})`,
  )
  expect
    .soft(
      summary,
      `NEW accessibility violations at "${stop}" — see the [a11y] block above for the elements. ` +
        `These are above what e2e/axe-baseline.ts already carries; fix them rather than raising it.`,
    )
    .toEqual([])
}
