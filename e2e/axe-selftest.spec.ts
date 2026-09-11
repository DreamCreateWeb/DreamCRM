import { test, expect } from '@playwright/test'
import {
  deadExemptions,
  expectNoA11yViolations,
  findA11yViolations,
  rulesOverBaseline,
} from './axe'
import { A11Y_INCIDENTAL } from './axe-baseline'

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
 * THE RED RUN FOR THE INCIDENTAL EXEMPTIONS.
 *
 * `A11Y_INCIDENTAL` is the only thing in this harness that makes the gate
 * LOOSER — it takes a subtree out of the scan entirely. Every other mechanism
 * here can only fail closed; this one, wrong, reports a page clean that is not.
 * So it gets the same treatment as the baseline comparison: pinned in both
 * directions against a synthetic document, so the pin holds when every page in
 * the app is perfect and when the exemption has been broken.
 *
 * The documents below reproduce the shape the real selectors were written
 * against — `app/(marketing)/page.tsx`'s two drift wrappers, each around a mock
 * component whose own root carries `aria-hidden="true"` — and plant faint text
 * on BOTH sides of that boundary. Two are pictures, one is prose, and the whole
 * value of the exemption is that it can tell them apart.
 */
function hero(caption: string): string {
  return `<!doctype html>
<html lang="en">
  <head><title>A hero with decorative mocks in it</title></head>
  <body>
    <main>
      <div class="mkt-float">
        <div aria-hidden="true" style="background:#ffffff">
          <span style="color:#93a0bc;font-size:7.7px">8:00 Mia Hayes . Cleaning</span>
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
const HERO = hero('<p style="color:#93a0bc;background:#ffffff">The caption underneath, which a person reads.</p>')

/** Both illustrations and nothing else — a page whose ONLY faint text is exempt. */
const HERO_PICTURES_ONLY = hero('<p style="color:#111111;background:#ffffff">Perfectly readable.</p>')

test.describe('the incidental exemptions discount pictures, not prose', () => {
  const exempt = A11Y_INCIDENTAL['marketing: home']

  function contrastTargets(violations: Awaited<ReturnType<typeof findA11yViolations>>): string[] {
    return violations
      .filter((v) => v.id === 'color-contrast')
      .flatMap((v) => v.nodes.map((n) => n.target.join(' ')))
  }

  test('the real selectors are the ones under test', () => {
    // If this entry is ever renamed or removed, the tests below would pass
    // vacuously — `exclude: undefined` excludes nothing, and a scan that
    // excludes nothing still reports the planted defect outside the mocks.
    expect(exempt, 'marketing: home must still carry its decorative-mock exemption').toBeTruthy()
    expect(exempt).toHaveLength(2)
  })

  test('without the exemption the document reports all three', async ({ page }) => {
    await page.setContent(HERO)

    // The control, and the half that matters most: the mock text really IS a
    // contrast failure by axe's reckoning — it is merely WCAG-exempt. Without
    // this, a browser that had quietly stopped measuring 7.7px text, or an
    // exemption that had grown to cover the whole page, would satisfy the test
    // below while proving nothing.
    expect(contrastTargets(await findA11yViolations(page))).toHaveLength(3)
  })

  test('faint text inside the decorative mocks is not reported', async ({ page }) => {
    await page.setContent(HERO)

    // Same document, same browser, exemption applied: only the prose survives.
    // Verified red by widening the first selector to `main *`, the shape of an
    // exemption that has crept past its illustration: this becomes [] and the
    // caption — the one thing on the page a person reads — goes unchecked.
    const targets = contrastTargets(await findA11yViolations(page, { exclude: exempt }))
    expect(targets, 'only the readable caption may be reported').toEqual(['p'])
  })

  test('the stop itself passes on a page whose only faint text is a picture', async ({ page }) => {
    // THE PRODUCTION PATH, end to end. The two tests above prove the selectors
    // are right; this one proves `expectNoA11yViolations` actually applies them,
    // which is a different claim and the one the suite depends on.
    // `marketing: home` carries no ceiling any more, so if the harness stopped
    // reading A11Y_INCIDENTAL this stop would report two violations against a
    // ceiling of zero and this test would fail.
    await page.setContent(HERO_PICTURES_ONLY)
    await expectNoA11yViolations(page, 'marketing: home')
  })
})

/**
 * A dead exemption is how this mechanism rots into a blanket pardon: the
 * selector stays in the file claiming a subtree is a picture long after the
 * picture has been replaced by something a person is meant to read.
 * `expectNoA11yViolations` asserts against this at every stop; here is the
 * proof that the detector detects.
 */
test.describe('an exemption cannot outlive what it describes', () => {
  test('present markup leaves no exemption dead', async ({ page }) => {
    await page.setContent(HERO)
    expect(await deadExemptions(page, 'marketing: home')).toEqual([])
  })

  test('a page without the illustrations reports every selector by name', async ({ page }) => {
    await page.setContent(CLEAN)
    expect(await deadExemptions(page, 'marketing: home')).toEqual(
      A11Y_INCIDENTAL['marketing: home'],
    )
  })

  test('a stop with no exemptions has nothing to go stale', async ({ page }) => {
    await page.setContent(CLEAN)
    expect(await deadExemptions(page, 'staff: the day agenda')).toEqual([])
  })
})
