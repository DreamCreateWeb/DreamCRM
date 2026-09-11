import { test, expect } from '@playwright/test'
import { findA11yViolations, rulesOverBaseline } from './axe'

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
