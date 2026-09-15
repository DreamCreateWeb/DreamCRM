import { test, expect } from '@playwright/test'
import {
  deadExclusions,
  DECORATIVE_MOCKS,
  exclusionsHidingReadableText,
  expectNoA11yViolations,
  findA11yViolations,
  rulesOverBaseline,
} from './axe'

/**
 * THE RED RUN FOR THE ACCESSIBILITY CHECKS, kept permanently.
 *
 * Every other `expectNoA11yViolations` call in `e2e/` asserts an ABSENCE, and
 * an absence assertion is indistinguishable from a check that has quietly
 * stopped looking. Narrow `WCAG_TAGS` to `[]`, mistype a tag, break the axe
 * injection, upgrade `@axe-core/playwright` into an API change — every one of
 * those turns the whole suite's a11y coverage into a no-op that reports green
 * forever, and nothing else in this repo would notice.
 *
 * So this spec makes the checks falsifiable: it feeds the scanner a document
 * with defects planted on purpose and fails if they are not found. Both halves
 * matter — the broken document proves the scanner can say no, the clean one
 * proves it does not simply say no to everything.
 *
 * Uses `page.setContent()` rather than a real route on purpose: this is a test
 * of OUR HARNESS, not of the product, and it must keep working even when every
 * page in the app is perfect.
 *
 * The three planted defects are one per reason this whole file exists — a
 * missing alt (the plain case the lint gate already covers, here as a control),
 * a missing document language, and colour contrast, which is the headline thing
 * static analysis structurally cannot see.
 */

const BROKEN = `<!doctype html>
<html>
  <head><title>Deliberately broken</title></head>
  <body>
    <h1 style="color:#111111;background:#ffffff">Planted defects</h1>
    <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
    <p style="color:#f2f2f2;background:#ffffff">Text at roughly 1.1:1 against its background.</p>
  </body>
</html>`

const CLEAN = `<!doctype html>
<html lang="en">
  <head><title>Deliberately fine</title></head>
  <body>
    <main>
      <h1 style="color:#111111;background:#ffffff">Nothing planted here</h1>
      <p style="color:#111111;background:#ffffff">Ordinary readable text.</p>
    </main>
  </body>
</html>`

test.describe('the accessibility checks can actually fail', () => {
  test('planted defects are found', async ({ page }) => {
    await page.setContent(BROKEN)

    const found = (await findA11yViolations(page)).map((v) => v.id)

    // `html-has-lang`: no `lang` on <html>. A screen reader guesses the
    // pronunciation rules for the whole page from this.
    expect(found, 'a document with no language must be reported').toContain('html-has-lang')

    // `image-alt`: an <img> with no alt attribute at all.
    expect(found, 'an image with no alt text must be reported').toContain('image-alt')

    // `color-contrast`: the reason this harness exists. If this one ever stops
    // appearing, the wcag2aa tag has fallen out of WCAG_TAGS and the checks
    // have lost the class of defect they were added for.
    expect(found, 'unreadable colour contrast must be reported').toContain('color-contrast')
  })

  test('a clean document reports nothing', async ({ page }) => {
    await page.setContent(CLEAN)

    // The other half: without this, a scanner that returned every rule id
    // unconditionally would satisfy the test above.
    expect(await findA11yViolations(page)).toEqual([])
  })
})

/**
 * THE FADE-IN TRAP, pinned so it cannot come back.
 *
 * `color-contrast` is measured from the colour on screen at the instant of the
 * scan. The clinic site fades its content in over 700ms
 * (`components/clinic-site/scroll-reveal.tsx`), so a scan that lands mid-fade
 * measures a blend of the real ink against the page behind it — always lighter
 * than the settled colour, and therefore a PASSING element reported as
 * failing. That false red reached a merge gate on PR #528 and was cleared by a
 * rerun, which is how a gate stops being believed.
 *
 * `findA11yViolations` now waits for finite animations to finish. These two
 * tests are that fix's red run, and they pin both directions: it must wait,
 * and waiting must not make it blind.
 *
 * Both fail without the wait, and the SECOND one is the more interesting
 * failure: an element still at opacity 0 when the scan lands is invisible to
 * axe and is not measured at all, so a real violation goes unreported. The
 * unsettled gate could produce a false red AND a false green.
 *
 * The animations are deliberately slower (1200ms) than anything real, so a
 * regression that removed the wait would be caught essentially every time
 * rather than occasionally.
 */
const PAGE = (finalColor: string) => `<!doctype html>
<html lang="en">
  <head>
    <title>Fading in</title>
    <style>
      body { background: #faf7f2; }
      /* Mirrors ScrollReveal: starts invisible, fades to its real colour. */
      .reveal {
        color: ${finalColor};
        background: #faf7f2;
        opacity: 0;
        animation: reveal 1200ms linear forwards;
      }
      @keyframes reveal { to { opacity: 1; } }
    </style>
  </head>
  <body>
    <main><p class="reveal">Measured mid-fade, this text is lighter than it ends up.</p></main>
  </body>
</html>`

test.describe('a fade-in is measured settled, not mid-flight', () => {
  test('an element that fades in to a PASSING colour is not reported', async ({ page }) => {
    // #6B635A on #faf7f2 settles at 5.52:1 — comfortably over the 4.5 bar.
    // It passes through roughly 1.5:1 to 4:1 on the way there, which is what
    // the booking page was being failed for.
    await page.setContent(PAGE('#6B635A'))

    expect(
      (await findA11yViolations(page)).map((v) => v.id),
      'a scan that lands mid-fade measures a blend, not the colour anyone reads',
    ).toEqual([])
  })

  test('an element that fades in to a FAILING colour is still reported', async ({ page }) => {
    // The other direction, and the reason this is a wait and not a blanket
    // exemption for animated content: #a8a199 on #faf7f2 settles at 2.39:1 and
    // is a real violation. Waiting must not turn the check off.
    await page.setContent(PAGE('#a8a199'))

    expect(
      (await findA11yViolations(page)).map((v) => v.id),
      'settling must not hide a violation that is real once it settles',
    ).toContain('color-contrast')
  })
})

/**
 * The baseline in `e2e/axe-baseline.ts` carries 214 pre-existing violations so
 * the checks could land without merging red. That makes its comparison the
 * most safety-critical line in this harness: get the direction wrong and every
 * a11y check in the suite silently becomes decorative.
 *
 * Written against literal allowances rather than real entries on purpose — a
 * self-test coupled to today's numbers would break on the one PR it must never
 * obstruct, the one that FIXES something.
 */
test.describe('the baseline ratchets down, never up', () => {
  const allowed = { 'color-contrast': 7 }

  test('at the ceiling is allowed, one above is not', () => {
    expect(rulesOverBaseline(allowed, { 'color-contrast': 7 })).toEqual([])
    expect(rulesOverBaseline(allowed, { 'color-contrast': 6 })).toEqual([])
    expect(rulesOverBaseline(allowed, { 'color-contrast': 8 })).toEqual(['color-contrast'])
  })

  test('a rule the baseline does not list has a ceiling of zero', () => {
    // The property that stops the baseline becoming a blanket pardon: a stop
    // that already carries a contrast debt still fails on a NEW kind of defect.
    expect(rulesOverBaseline(allowed, { 'color-contrast': 7, 'image-alt': 1 })).toEqual([
      'image-alt',
    ])
  })

  test('a stop with no entry at all tolerates nothing', () => {
    // A new stop, or a renamed one, starts at zero rather than inheriting a
    // pardon. Renaming a stop is therefore safe in the strict direction.
    expect(rulesOverBaseline({}, { 'color-contrast': 1 })).toEqual(['color-contrast'])
    expect(rulesOverBaseline({}, {})).toEqual([])
  })
})

/**
 * THE RED RUN FOR THE DECORATIVE-MOCK EXEMPTION (#545).
 *
 * `DECORATIVE_MOCKS` is the only thing in this harness that makes the gate
 * LOOSER — it takes a subtree out of the scan entirely, which is what lets
 * `marketing: home` hold a ceiling of zero. Every other mechanism here can only
 * fail closed; this one, wrong, reports a page clean that is not. It landed
 * without a test, and an exemption nobody has watched fail is exactly the shape
 * this file exists to refuse.
 *
 * The document below reproduces what the selectors were written against —
 * `app/(marketing)/page.tsx`'s two drift wrappers, each around a mock whose own
 * root carries `aria-hidden="true"` — and plants faint text on BOTH sides of
 * that boundary. Two are pictures, one is prose, and the entire value of the
 * exemption is that it can tell them apart. `page.setContent()` rather than a
 * real route because this tests OUR HARNESS: it has to keep working when every
 * page in the app is perfect.
 */
function hero(caption: string): string {
  return `<!doctype html>
<html lang="en">
  <head><title>A hero with decorative mocks in it</title></head>
  <body>
    <main>
      <div class="mkt-float">
        <div aria-hidden="true" style="background:#ffffff">
          <span style="color:#93a0bc;font-size:7.7px">8:00 Mia Hayes - Cleaning</span>
        </div>
      </div>
      <div class="mkt-float-slow">
        <div aria-hidden="true" style="background:#ffffff">
          <span style="color:#93a0bc;font-size:8.3px">Your next visit</span>
        </div>
      </div>
      ${caption}
    </main>
  </body>
</html>`
}

/** Both illustrations, plus a faint caption that is real prose. */
const HERO = hero(
  '<p style="color:#93a0bc;background:#ffffff">The caption underneath, which a person reads.</p>',
)

/** Both illustrations and nothing else — a page whose ONLY faint text is exempt. */
const HERO_PICTURES_ONLY = hero(
  '<p style="color:#111111;background:#ffffff">Perfectly readable.</p>',
)

test.describe('the decorative-mock exemption discounts pictures, not prose', () => {
  function contrastTargets(violations: Awaited<ReturnType<typeof findA11yViolations>>): string[] {
    return violations
      .filter((v) => v.id === 'color-contrast')
      .flatMap((v) => v.nodes.map((n) => n.target.join(' ')))
  }

  test('the real selectors are the ones under test', () => {
    // Without this, the tests below could pass vacuously: `exclude: []` excludes
    // nothing, and a scan that excludes nothing still reports the planted defect
    // outside the mocks.
    expect(DECORATIVE_MOCKS).toHaveLength(2)
    for (const selector of DECORATIVE_MOCKS) {
      // The narrowing that distinguishes a picture from any decorative wrapper.
      // A bare `[aria-hidden="true"]` would exempt the whole hero.
      expect(selector, 'each exemption must pair a structural hook with aria-hidden').toContain(
        '[aria-hidden="true"]',
      )
      expect(selector).toMatch(/^\.mkt-float/)
    }
  })

  test('without the exemption the document reports all three', async ({ page }) => {
    await page.setContent(HERO)

    // The control, and the half that matters most: the mock text really IS a
    // contrast failure by axe's reckoning — it is merely WCAG-exempt. Without
    // this, a browser that had quietly stopped measuring 7.7px text would
    // satisfy the test below while proving nothing at all.
    expect(contrastTargets(await findA11yViolations(page))).toHaveLength(3)
  })

  test('faint text inside the decorative mocks is not reported', async ({ page }) => {
    await page.setContent(HERO)

    // Same document, same browser, exemption applied: only the prose survives.
    // Verified red by widening the first selector to `main *` — the shape of an
    // exemption that has crept past its illustration: this becomes [] and the
    // caption, the one thing on the page a person reads, goes unchecked.
    const targets = contrastTargets(await findA11yViolations(page, { exclude: DECORATIVE_MOCKS }))
    expect(targets, 'only the readable caption may be reported').toEqual(['p'])
  })

  test('the stop passes on a page whose only faint text is a picture', async ({ page }) => {
    // THE PRODUCTION PATH, end to end. The tests above prove the selectors are
    // right; this proves `expectNoA11yViolations` applies them, which is a
    // different claim and the one `marketing: home`'s ceiling of zero rests on.
    await page.setContent(HERO_PICTURES_ONLY)
    await expectNoA11yViolations(page, 'marketing: home', { exclude: DECORATIVE_MOCKS })
  })
})

/**
 * A dead exclusion is how the exemption rots into a blanket pardon — the
 * selector outliving the illustration it describes. `expectNoA11yViolations`
 * asserts against it at every stop; here is the proof that the detector detects.
 */
test.describe('an exemption cannot outlive what it describes', () => {
  test('present markup leaves no exclusion dead', async ({ page }) => {
    await page.setContent(HERO)
    expect(await deadExclusions(page, DECORATIVE_MOCKS)).toEqual([])
  })

  test('a page without the illustrations reports every selector by name', async ({ page }) => {
    await page.setContent(CLEAN)
    expect(await deadExclusions(page, DECORATIVE_MOCKS)).toEqual(DECORATIVE_MOCKS)
  })

  test('a stop with no exclusions has nothing to go stale', async ({ page }) => {
    await page.setContent(CLEAN)
    expect(await deadExclusions(page)).toEqual([])
  })
})

/**
 * THE OTHER HALF OF THE SAME QUESTION (DREAMCRM-63).
 *
 * Every dead-exemption detector in this repo — the three in
 * `tests/a11y/class-pairs.ts` and `deadExclusions` above — asks whether an
 * allowance still MATCHES something. Not one of them asked whether its REASON
 * was still true, and #587 found out what that costs: moving the marketing
 * hero off its dark ground left every one of them GREEN over a headline
 * measuring 1.88 on white.
 *
 * `DECORATIVE_MOCKS`'s reason is WCAG 1.4.3 — *text that is part of a
 * picture*. The two documents below are the same hero with one thing changed:
 * a readable-size caption moved INSIDE the illustration. `deadExclusions` is
 * green on both (the selectors still match), the stop still holds its ceiling
 * of zero, and a real contrast failure on text a person reads goes unreported
 * — which is precisely the rot the exclusion's own header says it cannot have.
 *
 * Watched red by running the second test against the harness without
 * `exclusionsHidingReadableText`: the pardoned finding came back `[]` and
 * `expectNoA11yViolations` reported the stop clean.
 */
function heroWithInsideCaption(captionStyle: string): string {
  return `<!doctype html>
<html lang="en">
  <head><title>A hero whose mock grew something readable</title></head>
  <body>
    <main>
      <div class="mkt-float">
        <div aria-hidden="true" style="background:#ffffff">
          <span style="color:#93a0bc;font-size:7.7px">8:00 Mia Hayes - Cleaning</span>
          <p style="${captionStyle}">The panel a person actually reads.</p>
        </div>
      </div>
      <div class="mkt-float-slow">
        <div aria-hidden="true" style="background:#ffffff">
          <span style="color:#93a0bc;font-size:8.3px">Your next visit</span>
        </div>
      </div>
    </main>
  </body>
</html>`
}

test.describe('an exemption cannot outlive the REASON it was given', () => {
  test('picture-scale glyphs inside the mocks are what it is allowed to discount', async ({
    page,
  }) => {
    // The control, and the half that keeps this from firing on the real hero:
    // the mocks are ~7-11px illustration chrome, which is exactly what WCAG
    // 1.4.3 exempts. Nothing is reported, and the exclusion is doing its job.
    await page.setContent(HERO)
    expect(await exclusionsHidingReadableText(page, DECORATIVE_MOCKS)).toEqual([])
  })

  test('a readable panel that has grown inside a mock is reported by name', async ({ page }) => {
    // 14px, failing contrast, inside the excluded subtree. This is the shape
    // the exclusion stops describing, and the one nothing in this repo could
    // see before.
    await page.setContent(heroWithInsideCaption('color:#93a0bc;background:#ffffff;font-size:14px'))

    const pardoned = await exclusionsHidingReadableText(page, DECORATIVE_MOCKS)
    expect(pardoned, 'the pardoned finding must be reported').toHaveLength(1)
    expect(pardoned[0].selector).toBe('.mkt-float > [aria-hidden="true"]')
    expect(pardoned[0].fontSizePx).toBe(14)
    expect(pardoned[0].text).toContain('a person actually reads')

    // The point of the whole test: the detector that already existed is happy.
    // "The selector still matches" was never the question.
    expect(await deadExclusions(page, DECORATIVE_MOCKS)).toEqual([])
  })

  test('a readable panel that PASSES contrast is not reported', async ({ page }) => {
    // The size alone is not the defect — a mock is allowed to carry a legible
    // headline, and the real DashboardMock/PortalMock both do (16-16.8px). The
    // rule fires only where a finding is being discounted, so a guard widened
    // to "no big text in there" would report the product's own illustrations.
    await page.setContent(heroWithInsideCaption('color:#111111;background:#ffffff;font-size:14px'))
    expect(await exclusionsHidingReadableText(page, DECORATIVE_MOCKS)).toEqual([])
  })

  test('a failing caption OUTSIDE the mocks is not this rule\'s business', async ({ page }) => {
    // HERO's caption is faint prose on the page itself, at the default 16px —
    // over the floor and failing contrast, so it clears every bar this rule
    // tests for EXCEPT being inside an excluded subtree. No exclusion is
    // pardoning it, so this rule must stay quiet or it would double-report
    // every contrast defect on the page.
    //
    // Both halves, or this is the same test as the one above wearing a second
    // name (Quinn's review of #594): the caption really must BE a finding, and
    // this rule really must not claim it.
    await page.setContent(HERO)

    const reported = (await findA11yViolations(page, { exclude: DECORATIVE_MOCKS }))
      .filter((v) => v.id === 'color-contrast')
      .flatMap((v) => v.nodes.map((n) => n.target.join(' ')))
    expect(reported, 'the caption is a live contrast finding outside the mocks').toEqual(['p'])

    expect(await exclusionsHidingReadableText(page, DECORATIVE_MOCKS)).toEqual([])
  })

  test('a stop with no exclusions is not scanned twice', async ({ page }) => {
    // The extra axe pass costs a scan, so it is skipped where there is nothing
    // to check the premise of — which is every stop in the suite but one.
    await page.setContent(HERO)
    expect(await exclusionsHidingReadableText(page)).toEqual([])
  })

  test('the production path stays quiet when the mocks are still pictures', async ({ page }) => {
    // The passing half of the production path, the same shape the
    // dead-exclusion suite pins one describe up. `marketing: home` holds a
    // ceiling of ZERO and this extra scan runs on every one of its stops, so
    // "it does not fire on the real hero" is a claim worth an assertion.
    await page.setContent(HERO_PICTURES_ONLY)
    await expectNoA11yViolations(page, 'marketing: home', { exclude: DECORATIVE_MOCKS })
  })

  /*
   * THE FAILING half of the production path is NOT a test here, and the reason
   * is a Playwright fact rather than a gap: `expectNoA11yViolations` reports
   * through `expect.soft`, and a soft failure marks the test that provoked it
   * failed no matter what the test then asserts about it. There is no way to
   * observe a deliberate soft red from inside the same test and still pass.
   *
   * So it was watched by hand instead, which is what §2d actually asks for:
   * this spec, with the test above pointed at
   * `heroWithInsideCaption('color:#93a0bc;background:#ffffff;font-size:14px')`,
   * failed at `axe.ts` naming the stop, the selector, `14px` and the caption's
   * own text. What keeps that wiring from quietly coming undone afterwards is
   * `tests/guards/axe-exclusion-premise.test.ts`, which fails `test` if
   * `expectNoA11yViolations` stops asserting on either detector — the same
   * answer `axe-headroom-table.test.ts` gives for its reporter.
   */
})
