import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { A11Y_BASELINE } from './axe-baseline'
import {
  A11Y_HEADROOM_ANNOTATION,
  A11Y_NEEDS_REVIEW_ANNOTATION,
  NEEDS_REVIEW_TARGET_CAP,
  type NeedsReviewRule,
} from './axe-headroom'

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>
type Violation = AxeResults['violations'][number]
/** A result axe returned under `incomplete` — see `findA11yResults`. */
export type NeedsReview = AxeResults['incomplete'][number]

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
 *
 * AND ONE PART OF THE MACHINE-CHECKABLE PART IS STILL NOT GATED, NAMED RATHER
 * THAN LEFT TO BE DISCOVERED: what axe answers `incomplete` to. Those are
 * reported as their own class since DREAMCRM-107 and fail nothing — see
 * `findA11yResults` for why the gate never used to receive them at all, and
 * `expectNoA11yViolations` for why reporting rather than failing is the
 * decision.
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

/**
 * The decorative product mock-ups on the marketing site — miniature simulated
 * app screens at 7-10px, marked `aria-hidden` by their authors
 * (`components/marketing/ui.tsx`).
 *
 * WHY THIS EXEMPTION EXISTS, and why it is a selector rather than a number.
 * Vesper's DREAMCRM-28 burn-down established that all 41 `color-contrast`
 * findings on `marketing: home` are inside these, and left the ceiling alone
 * rather than lower it to a figure implying they had been fixed — correctly,
 * and then asked QA whether the scan should exclude them instead. It should,
 * for a reason that is about the GATE rather than about the pixels:
 *
 *   a ceiling of 41 on a rule means the 42nd instance is the first one that
 *   fails. On the busiest public page we have, that is 41 real contrast
 *   defects' worth of room to hide in. An exemption that names WHAT is exempt
 *   costs nothing and lets the ceiling go to zero, which is the only state in
 *   which a new defect on that page fails on arrival.
 *
 * WCAG 1.4.3 backs it: text that is part of a picture containing significant
 * other visual content has no contrast requirement, and restyling a deliberate
 * illustration to reach 4.5:1 at 7px helps nobody.
 *
 * THE RISK, NAMED — and then narrowed. `aria-hidden="true"` alone is the author
 * saying "not content", which is not the same claim as "this is a picture":
 * a bare `[aria-hidden="true"]` exempts every decorative wrapper on the page, so
 * faint text dropped into any of them later would lose its contrast check
 * silently. So each entry below pairs that attribute with the hero's own drift
 * wrappers — `.mkt-float` / `.mkt-float-slow` in `app/(marketing)/page.tsx`,
 * around mock components that put `aria-hidden="true"` on their outermost
 * element. Both halves have to hold, which is the whole of what makes these two
 * subtrees pictures and nothing else on the page one.
 *
 * That also makes the exemption able to ROT VISIBLY rather than silently. A bare
 * attribute selector matches something on almost any page forever; these stop
 * matching the moment a mock is replaced by a real screenshot or a readable
 * panel, and `expectNoA11yViolations` fails the stop by name when an exclusion
 * matches nothing (see `deadExclusions`). The failure direction is safe even
 * without that check: nothing gets excluded, the stop's ceiling is zero, and the
 * run goes red.
 *
 * THAT COVERS THE EXEMPTION'S SUBJECT. ITS PREMISE IS A SEPARATE QUESTION, and
 * since DREAMCRM-63 there is a separate check for it. A mock is not replaced
 * wholesale as often as it GROWS — a callout, a caption, a readable panel
 * added inside the illustration — and then the selectors still match, the
 * ceiling still holds, and the sentence above about 7px glyphs is pardoning
 * something a person reads. `exclusionsHidingReadableText` below measures what
 * this exclusion actually buys and reports any of it that is not picture-scale.
 *
 * Verified by narrowing it rather than asserted: the first baselined run
 * (actions/runs/34531475518) enumerated all 45 instances at this stop with
 * selectors and computed colours, and all 41 that remain after batch 55 resolve
 * inside these two roots, every one at font-size 5.8-8.2pt. The other 4 were the
 * marketing footer's column headings at 12px, which batch 55 fixed.
 */
export const DECORATIVE_MOCKS = [
  '.mkt-float > [aria-hidden="true"]',
  '.mkt-float-slow > [aria-hidden="true"]',
]

/**
 * The same class of thing on `/product`, where the mocks are the page's
 * SUBJECT rather than decoration drifting beside it (DREAMCRM-87).
 *
 * WHY THE HOMEPAGE'S SELECTOR COULD NOT BE REUSED, which is the whole reason
 * the product tour had no stop for a week after its defect was written up. The
 * decision above was settled — WCAG 1.4.3 exempts text that is part of a
 * picture, and a ceiling of 103 on the second-busiest public page is 103 real
 * defects' worth of room to hide in. What was not settled was the SELECTOR.
 * `DECORATIVE_MOCKS` keys on the hero's drift wrapper (`.mkt-float >`), the
 * tour's nine mocks do not float, so that selector matches NOTHING there and
 * `deadExclusions` would fail the stop by name.
 *
 * AND THE OBVIOUS REPLACEMENT IS THE TRAP. A bare `[aria-hidden="true"]` is
 * the author saying "not content", which is a weaker claim than "this is a
 * picture", and it is on hundreds of unrelated decorative things in this repo
 * — the blanket allowance §2d's third rule is about. It would pardon every
 * decorative subtree on the site, forever, on the strength of an attribute
 * nobody would think twice about typing.
 *
 * SO THE CLAIM MOVED TO THE COMPONENT THAT MAKES IT. A page can place a mock
 * anywhere; only the mock knows it is a drawing of our own product at reduced
 * scale, so it says so — `data-mkt-mock` on its outermost element
 * (`components/marketing/ui.tsx`, which carries the full argument). Both
 * halves are still required, exactly as on the homepage: a half-declared
 * element is not exempt, and `tests/marketing/product-mocks.test.tsx` fails
 * any call site that carries one attribute without the other, so the
 * vocabulary cannot spread to a real surface without somebody seeing it.
 *
 * IT KEYS ON THE ATTRIBUTE'S PRESENCE, NOT ON `="true"`, and that is a
 * correction rather than a preference (Sentinel, review of #647). This
 * selector runs against the RENDERED DOM, and React renders a valueless JSX
 * attribute as `="true"` — so `<div data-mkt-mock aria-hidden="true">` and
 * `data-mkt-mock={true}` produce exactly the node `[data-mkt-mock="true"]`
 * would have pardoned, while the SOURCE guard's string search for
 * `data-mkt-mock="true"` saw neither. The gate was therefore wider than the
 * thing watching it, in the one spelling nobody had mutated: the shared
 * marketing header, which renders on every page of the site, could be taken
 * out of every rule at this stop with `test` green. Presence on both ends
 * makes the selector and the guard ONE predicate, which is what stops them
 * drifting again — and `product-mocks.test.tsx` asserts that agreement by
 * reading this line rather than trusting this paragraph.
 *
 * WHAT KEEPS IT HONEST IS NOT THIS COMMENT — it is
 * `exclusionsHidingReadableText` below, which measures what the exclusion
 * actually buys. It found TWO on `/product` the day this shipped:
 * `EditorMock`'s 16.8px hero headline and `BookingMock`'s 12.8px day numeral,
 * both the fictional clinic's sage at **2.97**. Both were FIXED rather than
 * pardoned — the first was unfaithful as well as illegible, since the real
 * template paints that line with a contrast-checked `headingInk` — which is
 * what let this stop hold ZERO rather than a ceiling.
 *
 * MEASURED BEFORE IT WAS ASSERTED, against the production build at 390 / 834 /
 * 1440, `wcag2a/2aa/21a/21aa`, after walking the page so every `ScrollReveal`
 * has fired: **89 / 103 / 103** violation nodes without it, `color-contrast`
 * only, every one inside an `aria-hidden` mock and ZERO on the page itself at
 * every width — reproducing the numbers `docs/RELEASE.md` Part 5 recorded. With
 * the exclusion and the two fixes: **0 / 0 / 0**.
 *
 * WHAT IT DOES NOT DEFEND, stated because an exclusion hides every rule and
 * not only the one it is argued for: `exclusionsHidingReadableText` measures
 * `color-contrast` alone, so an unlabelled control or a missing `alt` inside a
 * marked subtree would be excluded with nothing asking. Same residue the
 * homepage's exclusion carries; named here rather than discovered later.
 *
 * The homepage keeps `DECORATIVE_MOCKS` rather than being re-pointed at this
 * attribute. That stop holds ZERO today on a narrower selector, and swapping a
 * green stop's exclusion buys nothing.
 */
export const PRODUCT_MOCKS = ['[data-mkt-mock][aria-hidden="true"]']

type A11yOptions = {
  /** Scan only this subtree (CSS selector) instead of the whole page. */
  include?: string
  /**
   * Subtrees to leave out of the scan (CSS selectors). Every one is asserted to
   * still match something at the stop — see `deadExclusions`. An exclusion is
   * the only thing in this harness that makes the gate looser, so it is not
   * allowed to quietly stop describing anything.
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
 * Scan the current page state and return BOTH of axe's verdicts — what it
 * failed, and what it could not decide.
 *
 * Split out from the assertion below so the detection path — injection, the
 * tag selection, the include/exclude plumbing, and the animation settle — is
 * testable on its own. That is what `e2e/axe-selftest.spec.ts` exercises: a
 * check that has never been seen to fail has not been tested, and this one
 * would otherwise report clean forever if somebody narrowed `WCAG_TAGS` to
 * nothing.
 *
 * WHY `incomplete` IS READ AT ALL (DREAMCRM-107, raised by Sentinel reviewing
 * #669; ledger entry S3 in `docs/RELEASE.md`). This function used to be
 * `const { violations } = await builder.analyze()` and the rest of the result
 * went on the floor. axe reports a node under `incomplete` when it cannot
 * resolve the question rather than when the answer is "fine" — and for
 * `color-contrast` the commonest reason is exactly the one this whole harness
 * exists for: **there is no single background colour to measure against**,
 * because the ground is a gradient or an image. So every stop in the suite,
 * at a ceiling of zero or not, was silent about text over a gradient BY
 * CONSTRUCTION. Not a ceiling that needed shrinking — a category the gate
 * never received.
 *
 * The reachable case on `main` the day this landed: `app/g/[token]/
 * report-view.tsx`. `.dg-glow` is two radial gradients over the canvas, and at
 * the teal peak it composites to about `#0d2d32`, where that page's quiet ink
 * `#78849c` grades **3.87:1**. It does not bite today only because of where
 * the ellipse lands — move any `.dg-mono` label into the hero's right half
 * above y=444 and `token: practice grade report` stays GREEN.
 *
 * WHAT IS DONE WITH IT IS DELIBERATELY NOT "FAIL". See
 * `expectNoA11yViolations` — an undecidable result is not a violation, and a
 * required check that goes red on one is a gate people have to interpret,
 * which is a gate people learn to ignore. It is reported as its own class.
 */
export async function findA11yResults(
  page: Page,
  options: A11yOptions = {},
): Promise<{ violations: Violation[]; incomplete: NeedsReview[] }> {
  await settleAnimations(page)

  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
  if (options.include) builder = builder.include(options.include)
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector)

  const { violations, incomplete } = await builder.analyze()
  return { violations, incomplete }
}

/**
 * Just the failures, for the callers that only ever wanted those.
 *
 * `exclusionsHidingReadableText` is one: it measures what an exclusion buys in
 * `color-contrast` VIOLATIONS, and an undecidable node is not something the
 * WCAG 1.4.3 picture argument is pardoning. The self-test is the other.
 */
export async function findA11yViolations(
  page: Page,
  options: A11yOptions = {},
): Promise<Violation[]> {
  return (await findA11yResults(page, options)).violations
}

/**
 * Fold axe's `incomplete` results into the per-rule shape the annotation and
 * the end-of-run table take.
 *
 * Pure and exported so the self-test can pin it without a browser, and so the
 * emitter and the reporter cannot drift into two ideas of what a row is.
 * `targets` is capped at `NEEDS_REVIEW_TARGET_CAP`; `nodes` is the true count,
 * so a capped row still says how much it is standing for.
 */
export function summariseNeedsReview(incomplete: NeedsReview[]): NeedsReviewRule[] {
  return incomplete
    .map((r) => ({
      rule: r.id,
      nodes: r.nodes.length,
      targets: r.nodes.slice(0, NEEDS_REVIEW_TARGET_CAP).map((n) => n.target.join(' ')),
    }))
    .sort((a, b) => b.nodes - a.nodes || a.rule.localeCompare(b.rule))
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
 * Which of a stop's exclusions no longer match anything on the page.
 *
 * AN EXCLUSION THAT MATCHES NOTHING IS A DEAD EXCLUSION, and it is the one way
 * an exemption rots into a blanket pardon: the selector keeps sitting in the
 * harness claiming a subtree is a picture long after the illustration it was
 * written for has been replaced by something a person is meant to read. Nothing
 * else in the suite would notice — the scan would carry on reporting the stop
 * clean, because the thing it stopped excluding is also the thing that stopped
 * existing.
 *
 * Returned rather than asserted so `e2e/axe-selftest.spec.ts` can pin BOTH
 * directions: a document containing the shape yields none, and a document
 * without it yields every selector by name. An exclusion is the only thing in
 * this harness that makes the gate LOOSER, so it is the one that most needs a
 * check that has been seen to fail.
 */
export async function deadExclusions(page: Page, exclude: string[] = []): Promise<string[]> {
  const dead: string[] = []
  for (const selector of exclude) {
    // `count()` is DOM presence, not visibility, on purpose: the portal mock is
    // `hidden lg:block`, so a narrower viewport would report it dead when it is
    // merely off-screen.
    if ((await page.locator(selector).count()) === 0) dead.push(selector)
  }
  return dead
}

/**
 * The size at which text stops being part of a picture and starts being
 * something a person is meant to read.
 *
 * Not a number invented here: it is the repo's own legibility floor, enforced
 * at the source by `tests/a11y/legibility-floor.test.ts`. Every contrast
 * finding `DECORATIVE_MOCKS` discounts today measures 5.8–8.2pt (7–11px), and
 * the mocks' own type scale tops out around 0.68rem inside the illustration
 * chrome. Anything AT this floor inside an excluded subtree is, by the repo's
 * own definition, content — and WCAG 1.4.3 does not exempt content.
 */
const PICTURE_SCALE_CEILING_PX = 12

/** A contrast finding an exclusion is discounting that is not picture-scale. */
export type PardonedFinding = {
  selector: string
  target: string
  fontSizePx: number
  text: string
}

/**
 * THE EXCLUSION'S PREMISE, as opposed to its subject (DREAMCRM-63).
 *
 * `deadExclusions` above asks whether a selector still MATCHES something. It
 * does not ask whether the REASON for it is still true, and #587 proved those
 * are different questions the expensive way: moving the marketing hero off its
 * dark ground left every dead-exemption detector in this repo green over a
 * headline measuring 1.88. Same shape here. `DECORATIVE_MOCKS` does not say
 * "skip this div"; it says *this subtree is a PICTURE*, which is the one thing
 * WCAG 1.4.3 exempts from contrast. Drop a readable panel inside
 * `.mkt-float > [aria-hidden="true"]` — a real screenshot, a callout somebody
 * is meant to read — and the selector keeps matching, the stop keeps holding
 * its ceiling of ZERO, and a genuine contrast defect on the busiest public
 * page we have is pardoned by a sentence about 7px illustration glyphs.
 *
 * SO IT MEASURES WHAT THE EXCLUSION ACTUALLY BUYS: the `color-contrast`
 * findings that disappear when it is applied. Each one's element is resolved
 * in the page and its COMPUTED font size taken; anything at or above the
 * legibility floor is reported by selector, size and text. That is narrower
 * than "all the text in there is small" on purpose — the real mocks carry a
 * 16.8px headline that reads fine, and a rule firing on it would be the "208
 * places to catch 8" failure that gets a guard switched off. A big element in
 * there only trips this if it is ALSO failing contrast, in which case it is a
 * real defect being pardoned rather than a picture.
 *
 * COSTS ONE EXTRA SCAN, at the one stop in the suite that passes exclusions
 * (`marketing: home`). Skipped entirely when there are none.
 *
 * WHAT IT DOES NOT SEE: a finding whose axe target does not resolve back to a
 * single element (a frame chain), and any rule other than `color-contrast` —
 * contrast is what the WCAG 1.4.3 argument is about, and the exclusion's other
 * effects are not defended by it. Both are false NEGATIVES, the safe direction.
 *
 * AND IT DROPS `options.include`, which is the one that is not (Quinn's review
 * of #594). The unfiltered scan is a bare `findA11yViolations(page)`, so a stop
 * passing BOTH `include` and `exclude` would have its premise pass read the
 * whole page rather than the named subtree. No stop does today — there is no
 * `include` anywhere in `e2e/` — and the `closest(exclude)` filter bounds most
 * of what it could report, so the residue is a false RED naming the element
 * rather than a false green. Latent, and written here rather than fixed
 * speculatively: the day a stop needs both, thread `include` through and give
 * it a red run, do not assume this paragraph was already right about it.
 */
export async function exclusionsHidingReadableText(
  page: Page,
  exclude: string[] = [],
): Promise<PardonedFinding[]> {
  if (exclude.length === 0) return []

  const unfiltered = await findA11yViolations(page)
  const targets = unfiltered
    .filter((v) => v.id === 'color-contrast')
    .flatMap((v) => v.nodes.map((n) => n.target))
    // A plain element target is a one-entry array; more than one means a frame
    // chain this cannot resolve with a single `querySelector`.
    .filter((t): t is string[] => t.length === 1)
    .map((t) => String(t[0]))
  if (targets.length === 0) return []

  return page.evaluate(
    ({ selectors, found, ceiling }) => {
      const pardoned: PardonedFinding[] = []
      for (const target of found) {
        let el: Element | null = null
        try {
          el = document.querySelector(target)
        } catch {
          continue
        }
        if (!el) continue
        const selector = selectors.find((s) => el!.closest(s))
        if (!selector) continue
        const fontSizePx = parseFloat(getComputedStyle(el).fontSize)
        if (!(fontSizePx >= ceiling)) continue
        pardoned.push({
          selector,
          target,
          fontSizePx,
          text: (el.textContent ?? '').trim().slice(0, 60),
        })
      }
      return pardoned
    },
    { selectors: exclude, found: targets, ceiling: PICTURE_SCALE_CEILING_PX },
  )
}

/**
 * Hand one (stop, rule) measurement to `e2e/axe-headroom.ts` for the
 * end-of-run table.
 *
 * Swallows everything. This is REPORTING attached to a gate, and it must not
 * be able to become the reason a gate fails: `test.info()` throws when there
 * is no test running (the self-test exercises these helpers directly), and an
 * annotation channel that is not worth a red run is not worth a thrown error
 * either.
 */
function recordHeadroomSample(sample: {
  stop: string
  rule: string
  ceiling: number
  observed: number
}): void {
  try {
    test.info().annotations.push({
      type: A11Y_HEADROOM_ANNOTATION,
      description: JSON.stringify(sample),
    })
  } catch {
    // No test context, or a Playwright version that will not take one. The
    // table simply has one fewer row.
  }
}

/**
 * Hand one stop's needs-review status to `e2e/axe-headroom.ts`.
 *
 * CALLED AT EVERY STOP, INCLUDING THE ONES WITH AN EMPTY `rules` — that is
 * what makes the reporter able to tell "axe decided everything" from "this
 * emitter has come unhooked", which is §2a's standing rule that an alarm ships
 * with the thing that notices it stopped. An alarm only ever heard from when
 * it fires is one whose silence means nothing.
 *
 * Swallows everything, for the same reason `recordHeadroomSample` does: this
 * is REPORTING attached to a required check, and it must never be the reason
 * one fails.
 */
function recordNeedsReviewSample(sample: { stop: string; rules: NeedsReviewRule[] }): void {
  try {
    test.info().annotations.push({
      type: A11Y_NEEDS_REVIEW_ANNOTATION,
      description: JSON.stringify(sample),
    })
  } catch {
    // No test context. The table simply has one fewer stop in it.
  }
}

/**
 * Print what axe declined to grade at a stop, as lines a reader of a red — or
 * green — CI log can act on.
 *
 * Returned rather than printed from inside the assertion for the same reason
 * `deadExclusions` and `exclusionsHidingReadableText` are returned: an
 * absence is only evidence if something has watched it become a presence, and
 * the self-test can only watch a value it is handed.
 */
export function describeNeedsReview(stop: string, incomplete: NeedsReview[]): string[] {
  const out: string[] = []
  for (const r of incomplete) {
    out.push(`${stop} — ${r.id} ×${r.nodes.length}: ${r.help}`)
    for (const node of r.nodes) {
      // Axe's summary is a heading line ("Fix any of the following:") and then
      // indented reasons. Drop the heading and flatten the rest — the reason
      // is the part that tells a reader this is undecidable rather than red.
      const why = (node.failureSummary ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(1)
        .join(' ')
      out.push(`    at: ${node.target.join(' ')}${why ? ` — ${why}` : ''}`)
    }
  }
  return out
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
 * IT ALSO REPORTS A SECOND CLASS AND GATES NOTHING ON IT: what axe could not
 * DECIDE (DREAMCRM-107). `incomplete` results — text over a gradient, most
 * often — are printed, annotated, and folded into the end-of-run needs-review
 * table by `e2e/axe-headroom.ts`. They never fail a stop. Read the block
 * beside `summariseNeedsReview` below for why both halves of that are
 * deliberate.
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
  const dead = await deadExclusions(page, options.exclude)
  expect
    .soft(
      dead,
      `DEAD exclusion at "${stop}" — these selectors match nothing on the page any ` +
        `more, so whatever they were written for has changed. Re-derive them against the ` +
        `current markup or delete them; do not leave an exemption standing over a subtree ` +
        `it no longer describes.`,
    )
    .toEqual([])

  // And the other half of the same question: not "does it still match", but
  // "is the REASON still true". See `exclusionsHidingReadableText`.
  const pardoned = await exclusionsHidingReadableText(page, options.exclude)
  expect
    .soft(
      pardoned.map((p) => `${p.selector} → ${p.target} at ${p.fontSizePx}px: "${p.text}"`),
      `An exclusion at "${stop}" is discounting a contrast failure on READABLE text. ` +
        `These selectors are allowed to take a subtree out of the scan because it is a ` +
        `PICTURE — WCAG 1.4.3 exempts text that is part of an illustration, and every ` +
        `finding they were written for measures 5.8-8.2pt. Text at ${PICTURE_SCALE_CEILING_PX}px ` +
        `or more is content by this repo's own legibility floor, so this is a real defect ` +
        `being pardoned by an argument that no longer describes it. Fix the contrast, or ` +
        `narrow the exclusion so it stops covering the readable part.`,
    )
    .toEqual([])

  const { violations, incomplete } = await findA11yResults(page, options)
  const allowed = A11Y_BASELINE[stop] ?? {}

  // ── WHAT AXE COULD NOT DECIDE (DREAMCRM-107) ────────────────────────────
  //
  // Its own class, reported and never asserted. `findA11yResults` carries the
  // argument for reading `incomplete` at all; this is what is done with it.
  //
  // NOT A VIOLATION, ON PURPOSE. `incomplete` means axe declined to answer —
  // overwhelmingly, for `color-contrast`, because the ground is a gradient or
  // an image and there is no single background colour to compute a ratio
  // against. Some of those are fine and some are not, and only a person at the
  // stop can tell which. Failing a required check on every one would make
  // `e2e` red for a question rather than for a defect, and this file's own
  // rule is that a gate people have to interpret is a gate people learn to
  // ignore. Reporting it is the other half of that rule: a category the gate
  // silently drops is not neutral either.
  //
  // THE SAMPLE GOES OUT EVEN WHEN THERE IS NOTHING TO SAY — see
  // `recordNeedsReviewSample`. That is what lets the end-of-run table tell an
  // all-decidable run from an unhooked emitter.
  //
  // IT READS THE FILTERED SCAN, so a subtree an exclusion removed is out of
  // this too. That is consistent — an excluded subtree is out of the gate by
  // argument — and it is a residue worth naming: the WCAG 1.4.3 picture
  // argument those exclusions rest on is about text a person is not meant to
  // read, and `exclusionsHidingReadableText` polices it over VIOLATIONS only.
  // A readable panel inside a mock, on a gradient, is pardoned by both halves.
  // No instance exists today (no stop that passes `exclude` has a gradient
  // ground); written here rather than fixed speculatively.
  //
  // THE WHOLE BLOCK IS WRAPPED, not just the annotation push (Sentinel's
  // review of #682). `recordNeedsReviewSample` has its own `try` and says why
  // — reporting attached to a required check must never be the reason one
  // fails — and leaving the larger half of the same block bare made the file
  // state a rule it then did not apply. The risk was small (every field read
  // here is guaranteed or defaulted); the asymmetry was the defect.
  //
  // IT CANNOT SWALLOW A GATE FAILURE, which is the thing to check before
  // wrapping anything in this file: nothing inside computes `counts`,
  // `overIds` or `over`, and the soft assertions are all below it. A throw in
  // here loses one stop's needs-review line and changes no verdict.
  try {
    const needsReview = summariseNeedsReview(incomplete)
    recordNeedsReviewSample({ stop, rules: needsReview })
    if (needsReview.length > 0) {
      const nodes = needsReview.reduce((n, r) => n + r.nodes, 0)
      console.log(`[a11y] NEEDS REVIEW — ${stop}`)
      for (const line of describeNeedsReview(stop, incomplete)) console.log(`  ${line}`)
      // ONE `::warning` PER STOP, AND GITHUB PRINTS TEN PER LEVEL PER JOB.
      // So this is a log artefact rather than the delivery channel — the
      // end-of-run table in `e2e/axe-headroom.ts` carries every row and goes
      // to the job summary, which is where a reader should be sent. Named
      // here so nobody later reads "a warning per stop" as "a person sees
      // every stop". (Sentinel, reviewing #682.)
      console.log(
        `::warning title=axe could not decide::"${stop}" — ${nodes} node${nodes === 1 ? '' : 's'} came ` +
          `back incomplete (${needsReview.map((r) => `${r.rule} ×${r.nodes}`).join(', ')}). ` +
          `These are NOT counted by any ceiling and this run is not red for them. Text over a ` +
          `gradient or an image is the usual cause — the full list is in the needs-review table at ` +
          `the end of the run; measure it by hand at this stop and either fix it or leave it, but ` +
          `do not read the green tick as covering it.`,
      )
    }
  } catch (err) {
    console.log(`[a11y] could not report what axe left undecided at "${stop}": ${String(err)}`)
  }

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
    // AND THE SAME MEASUREMENT, ANNOTATED, WHATEVER IT SAID — including the
    // ones the wobble allowance deliberately keeps quiet about.
    //
    // The annotation is not the report. `e2e/axe-headroom.ts` folds every one
    // of these into a single table at the end of the run, which is how a
    // ceiling that is exactly one too high finally becomes visible: it prints
    // no warning above, by design, and four of them stood a whole batch longer
    // than they needed to for that reason.
    //
    // EVERY measurement is emitted, not just the ones under the ceiling. A
    // (stop, rule) that reaches its ceiling on any attempt has no room in it,
    // and the fold can only know that if it sees that attempt too.
    recordHeadroomSample({ stop, rule, ceiling, observed: now })
  }

  if (over.length === 0) {
    const carried = violations.reduce((n, v) => n + v.nodes.length, 0)
    console.log(`[a11y] ok — ${stop}${carried ? ` (${carried} carried by the baseline)` : ''}`)
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
