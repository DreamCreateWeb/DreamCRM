import { test, expect } from '@playwright/test'
import { DECORATIVE_MOCKS, expectNoA11yViolations } from './axe'

/**
 * Golden-path smoke — the first browser-level coverage this repo has had.
 *
 * These are deliberately seed-free so they run against a freshly migrated
 * database: they cover the things happy-dom structurally cannot see —
 * middleware rewrites and redirects, real navigation, real server rendering,
 * and the server/client boundary.
 */

test.describe('service health', () => {
  test('the health endpoint answers', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
  })
})

/**
 * ⚠ THIS FILE MAY NOT IMPORT A PAGE REGISTRY, and the constraint is enforced
 * rather than remembered. `tests/guards/review-gate.test.ts` asserts that
 * `sitewidePageRegistries('e2e/smoke.spec.ts', …)` returns EMPTY: this is a
 * bounded journey spec, and a browser-driven spec whose page list is derived
 * from a product registry is a different animal that the review gate routes
 * differently (§2's third intake derivation).
 *
 * Found the hard way on DREAMCRM-80: the docs stop below was first written
 * with `DOCS.find(…)` and `for (const c of DOC_CATEGORIES)` to avoid a
 * hand-typed slug going stale, and the full suite went red naming this file.
 * The guard is RIGHT — those really are registry expansions — so the fix is
 * here, not there. Hand-typed values in this file fail LOUDLY when content
 * moves, which is what a journey spec wants; the derived sweeps live in
 * `e2e/marketing-viewport.spec.ts`, which is registered for exactly that.
 */
test.describe('the marketing site (the storefront)', () => {
  test('the home page renders real content, not an error shell', async ({ page }) => {
    const res = await page.goto('/')
    expect(res?.status()).toBe(200)
    await expect(page.locator('body')).not.toContainText('Application error')
    // A real page has a title and a first heading.
    await expect(page).toHaveTitle(/.+/)
    await expect(page.locator('h1').first()).toBeVisible()

    // The decorative product mock-ups are excluded, and that is the ONLY
    // reason this stop can hold a ceiling of zero. See DECORATIVE_MOCKS in
    // e2e/axe.ts for what is exempted and why — the short version is that
    // WCAG 1.4.3 does not apply to text inside an illustration, and a ceiling
    // of 41 that carried them was absorbing 41 real defects' worth of room on
    // the busiest public page we have.
    await expectNoA11yViolations(page, 'marketing: home', { exclude: DECORATIVE_MOCKS })
  })

  test('pricing shows the one purchasable plan at the founding rate', async ({ page }) => {
    // Guards the pricing-truth decision: Premium $200/mo is the only
    // self-serve plan; the legacy tiers must not resurface on the page.
    await page.goto('/pricing')
    await expect(page.locator('body')).toContainText('$200')

    await expectNoA11yViolations(page, 'marketing: pricing')
  })

  /**
   * THE MANIFESTO — the third marketing stop, added with the page's Daylight
   * Dream rebuild (Neon, DREAMCRM-78).
   *
   * IT IS HERE BECAUSE IT IS THE ONE SUBPAGE THAT CAN HOLD A CEILING OF ZERO
   * WITH NO EXCLUSION AT ALL, which is the condition `e2e/axe-baseline.ts`
   * spends a whole note explaining that `/product` cannot meet. The blocker
   * there is the exclusion's SHAPE: `DECORATIVE_MOCKS` keys on the drift
   * wrapper (`.mkt-float >`) and the tour's nine mocks do not float, so the
   * selector matches nothing and `deadExclusions` would fail the stop by
   * name. `/why` renders no mock of any kind — it is prose, tone tiles and
   * type — so there is nothing to exempt and nothing to derive. A stop with
   * no exemption is the only kind whose zero means what it says.
   *
   * MEASURED BEFORE IT WAS ASSERTED: 0 rules / 0 nodes at 390, 834 and 1440
   * against the production build, `wcag2a/2aa/21a/21aa`. Zero is the state in
   * which the FIRST violation to arrive fails on arrival, which is the whole
   * argument the home stop's 41 → 0 move was about.
   *
   * WATCHED TO FAIL (§2d) against the defect this page is actually at risk
   * of, rather than a synthetic one: the receipt links are the only quiet-ink
   * interactive text on it, so dropping them from `teal-700` to `teal-400`
   * (3.82 flat, the identity step that is not a white-text or ink step —
   * `BRAND.md` Part 7) reddens the stop `color-contrast (serious) x2`,
   * naming `#7ca5ff on #ffffff` at **2.41** and "baseline allows 0". Both
   * receipts, nothing else on the page. Restored and re-run green.
   *
   * The three widths are `marketing-viewport.spec.ts`'s job; one stop here is
   * the accessibility question, and axe's findings on this page do not move
   * with the viewport (there is no reflow that changes what is in the tree).
   */
  test('the manifesto renders its beliefs and the price it publishes', async ({ page }) => {
    await page.goto('/why')
    await expect(page.locator('h1').first()).toBeVisible()
    // The honesty tenets, as a visitor meets them: the gaps named, the terms
    // named, the price named. `tests/marketing/marketing-site.test.tsx` pins
    // the same three at render; this is the browser-level twin.
    await expect(page.locator('body')).toContainText('No SMS yet')
    await expect(page.locator('body')).toContainText('Month-to-month, no contract, no setup fee')
    await expect(page.locator('body')).toContainText('$200')

    await expectNoA11yViolations(page, 'marketing: why')
  })

  /**
   * THE RESOURCE LIBRARY — the fourth and fifth marketing stops, added with
   * the pages' Daylight Dream rebuild (Neon, DREAMCRM-79, move 6 page 5).
   *
   * THEY MEET THE SAME CONDITION `/why` DOES, which is the only condition
   * that earns a ceiling of zero: no exemption. `e2e/axe-baseline.ts` spends
   * a note explaining why `/product` cannot have a stop — `DECORATIVE_MOCKS`
   * keys on the drift wrapper (`.mkt-float >`) and the tour's nine mocks do
   * not float, so the selector would match nothing and `deadExclusions`
   * would fail the stop by name. Neither of these pages renders a mock of
   * any kind: the hub is type, tone tiles and hairlines, and a guide is that
   * plus prose. There is nothing to exempt and nothing to derive.
   *
   * TWO STOPS RATHER THAN ONE, because they are two different pages under
   * one route. The hub is an index; the ARTICLE carries everything this move
   * actually built — the script cards, the amber caveat notes and the
   * chapter rail, which is the only NAV landmark on the marketing site
   * outside the chrome. A stop on the hub would scan none of it.
   *
   * MEASURED BEFORE THEY WERE ASSERTED, against the production build:
   * 0 rules / 0 nodes on all four resource routes at 390, 834 and 1440,
   * `wcag2a/2aa/21a/21aa`. Twelve stops, zero findings.
   *
   * WATCHED TO FAIL (§2d) against the defect these pages are actually at
   * risk of rather than a synthetic one — the quiet-ink step, which is what
   * every restyle of a reading page reaches for. Dropping the chapter rail's
   * links from `gray-600` to `gray-400` reddens the guide stop
   * `color-contrast (serious) x6` — one per rail link — naming `#93a0bc on
   * #ffffff` at **2.62** as rendered (14.4px, regular), and leaves the hub
   * stop at 0 rules / 0 nodes. Both halves matter: a mutation that reddened
   * BOTH stops would mean they are not scanning different pages, which is
   * the only thing that makes two stops worth their runtime. Restored and
   * re-run green.
   *
   * The three widths are `marketing-viewport.spec.ts`'s job. Axe's findings
   * here do not move with the viewport except for the rail, which is
   * `hidden` below `lg` — so the guide stop runs at the DEFAULT viewport,
   * where the rail is in the tree and gets scanned.
   */
  test('the library indexes its guides, and a guide carries its scripts', async ({ page }) => {
    await page.goto('/resources')
    await expect(page.locator('h1').first()).toBeVisible()
    // The row index is the move — a shelf that says what is on it.
    await expect(page.locator('body')).toContainText('The recall email, subject line and body')
    await expectNoA11yViolations(page, 'marketing: resources')

    await page.goto('/resources/dental-recall-scripts')
    await expect(page.locator('h1').first()).toBeVisible()
    // The original material, and the compliance caveat that must stay visible.
    await expect(page.locator('body')).toContainText('Has it been a minute?')
    await expect(page.locator('body')).toContainText('TCPA')
    // The chapter rail, derived from the article's own headings.
    await expect(page.getByRole('navigation', { name: 'In this guide' })).toBeVisible()
    await expectNoA11yViolations(page, 'marketing: resource guide')
  })

  /**
   * THE THREE TOOLS — the sixth, seventh and eighth marketing stops, added
   * with the pages' Daylight Dream rebuild (Neon, DREAMCRM-80, move 6 page 6).
   *
   * THEY MEET THE CONDITION `/why` AND THE RESOURCE PAGES MEET, which is the
   * only one that earns a ceiling of zero: NO EXEMPTION. `e2e/axe-baseline.ts`
   * spends a note explaining why `/product` cannot have a stop —
   * `DECORATIVE_MOCKS` keys on the drift wrapper (`.mkt-float >`) and the
   * tour's nine mocks do not float, so the selector would match nothing and
   * `deadExclusions` would fail the stop by name. None of these three renders
   * a product mock of any kind: they are type, tone tiles, hairlines and
   * FORMS.
   *
   * THE FORMS ARE WHY THESE ARE WORTH THEIR RUNTIME, and it is a different
   * argument from the five stops above. Every marketing stop so far has been
   * a READING page, where the only realistic finding is `color-contrast`.
   * These three carry the only real INPUT surfaces on the marketing site —
   * eleven labelled fields, a `<textarea>`, three `type=range` sliders and
   * three submit buttons across `grade-form.tsx`, `roi-calculator.tsx` and
   * `apply-form.tsx` — so `label`, `form-field-multiple-labels`,
   * `aria-input-field-name` and the focus-order rules are live here and
   * nowhere else on this site. That is a class of defect the other five stops
   * structurally cannot see.
   *
   * MEASURED BEFORE THEY WERE ASSERTED, against the production build: 0 rules
   * / 0 nodes on all three routes at 390, 834 and 1440,
   * `wcag2a/2aa/21a/21aa`. Nine stops, zero findings.
   *
   * WATCHED TO FAIL (§2d) once per stop, against the defect each page is
   * actually at risk of rather than a synthetic one — the quiet-ink step,
   * which is what every restyle of these pages reaches for. `gray-400`
   * (`#93a0bc` on white, **2.62** as rendered) on the grader's three check
   * bodies reddens `marketing: grade` `color-contrast (serious) x3`; on the
   * calculator's three scenario labels it reddens `marketing: roi` x3; on the
   * partner steps' three bodies it reddens `marketing: partner program` x3.
   * **Each mutation reddened exactly one stop and left the other two at 0
   * rules / 0 nodes**, which is the half that matters: three stops are only
   * worth three runs if they are scanning three pages, and nothing about a
   * green run tells you that.
   *
   * ONE STOP PER ROUTE RATHER THAN ONE FOR THE SET, for the reason the
   * resource pages took two: these are three different pages with three
   * different forms under one heading in this file, and a stop on `/grade`
   * would scan neither of the others.
   *
   * The three widths are `marketing-viewport.spec.ts`'s job. Axe's findings
   * here do not move with the viewport — every one of these pages reflows by
   * stacking a grid, and nothing enters or leaves the tree.
   */
  test('the three tools open, and their forms are usable', async ({ page }) => {
    await page.goto('/grade')
    await expect(page.locator('h1').first()).toBeVisible()
    // The grader's promise, and the three things it actually checks.
    await expect(page.locator('body')).toContainText('Your Google listing')
    await expect(page.getByLabel('Practice name')).toBeVisible()
    await expectNoA11yViolations(page, 'marketing: grade')

    await page.goto('/roi')
    await expect(page.locator('h1').first()).toBeVisible()
    // The honesty line the whole page rests on, and the hedging beside it.
    await expect(page.locator('body')).toContainText('Scenarios, not promises')
    await expect(page.locator('body')).toContainText('Nothing you type is sent')
    await expectNoA11yViolations(page, 'marketing: roi')

    await page.goto('/partner-program')
    await expect(page.locator('h1').first()).toBeVisible()
    // The published terms, and the hedge that keeps them honest.
    await expect(page.locator('body')).toContainText('10% of every payment')
    await expect(page.locator('body')).toContainText('written into your partner agreement')
    await expectNoA11yViolations(page, 'marketing: partner program')
  })

  /**
   * THE CHANGELOG AND THE HELP DOCS — the ninth, tenth and eleventh marketing
   * stops, added with the pages' Daylight Dream rebuild (Neon, DREAMCRM-80,
   * move 6 page 6b).
   *
   * THEY MEET THE CONDITION EVERY STOP ON THIS SITE MEETS EXCEPT `/product`:
   * NO EXEMPTION. `e2e/axe-baseline.ts` explains why `/product` cannot have a
   * stop — `DECORATIVE_MOCKS` keys on the drift wrapper (`.mkt-float >`) and
   * the tour's nine mocks do not float, so the selector would match nothing
   * and `deadExclusions` would fail the stop by name. None of these three
   * renders a mock: they are type, tone tiles, hairlines and status chips.
   *
   * THREE STOPS RATHER THAN ONE, and the doc pair is the reason. The docs
   * INDEX is a shelf — four group headers and thirty-one rows. The doc
   * ARTICLE carries everything else this move built: the numbered step
   * markers, the hero spine, and the `More in <category>` margin column. A
   * stop on the index would scan none of it. (This route has NO chapter rail
   * — see the page's own header: no doc in the registry has more than one
   * heading, so a rail gated on two would have rendered nowhere.) `/changelog` is a third page again — the
   * only marketing surface with STATUS CHIPS (`New` / `Improved` / `Fixed`)
   * and the only one carrying an animated emoji, so `image-alt` and the
   * chips' tint/ink pairs are live here and nowhere else on this site.
   *
   * `/blog` IS DELIBERATELY ABSENT, for the reason `marketing-viewport.spec.ts`
   * and `decorative-layer-grade.mjs` both give: its body comes out of the
   * DATABASE and this suite is seed-free by design, so it would scan an empty
   * state rather than the page a reader gets. When the blog gets a seeded
   * stop, add it in all three places.
   *
   * MEASURED BEFORE THEY WERE ASSERTED, against the production build: 0 rules
   * / 0 nodes on all three routes at 390, 834 and 1440, `wcag2a/2aa/21a/21aa`.
   * Nine stops, zero findings.
   *
   * WATCHED TO FAIL (§2d) once per stop, against the defect each page is
   * actually at risk of rather than a synthetic one — the quiet-ink step,
   * which is what every restyle of a reading page reaches for. `gray-400`
   * (`#93a0bc` on white, **2.62** as rendered) on the four group-header mono
   * labels reddens `marketing: docs` `color-contrast (serious) x4`; on the
   * margin column's links it reddens `marketing: doc article` x3; on the
   * changelog item bodies it reddens `marketing: changelog` x19. **Each
   * mutation reddened exactly one stop and left the other two at 0 rules / 0
   * nodes** — three stops are only worth three runs if they are scanning
   * three pages, and nothing about a green run tells you that.
   *
   * The three widths are `marketing-viewport.spec.ts`'s job. Axe's findings
   * here do not move with the viewport: unlike the resource guide's rail,
   * nothing on these three pages leaves the tree at a narrow width — the
   * margin column STACKS rather than hiding, which is the whole reason it is
   * allowed to carry content nothing else says.
   */
  test('the changelog reads as weeks, and the docs index its articles', async ({ page }) => {
    await page.goto('/changelog')
    await expect(page.locator('h1').first()).toBeVisible()
    // The cadence promise, which is the owner's directive on the page.
    await expect(page.locator('body')).toContainText('One entry per week, always')
    await expectNoA11yViolations(page, 'marketing: changelog')

    await page.goto('/docs')
    await expect(page.locator('h1').first()).toBeVisible()
    // The four category groups the shelf replaced a two-column card grid to
    // show. HAND-TYPED, not derived from `DOC_CATEGORIES`, and that is a
    // deliberate constraint rather than laziness — see the note above the
    // describe block on why this file may not import a page registry.
    await expect(page.locator('body')).toContainText('Getting started')
    await expect(page.locator('body')).toContainText('Front desk, daily')
    await expect(page.locator('body')).toContainText('Patient-facing')
    await expect(page.locator('body')).toContainText('Money & integrations')
    await expectNoA11yViolations(page, 'marketing: docs')

    // A doc with siblings in its category, so the margin column is in the tree
    // to be scanned rather than correctly absent. Named rather than derived:
    // if this slug is ever renamed the stop goes RED, which is the loud
    // failure a bounded journey spec wants — not the silent vacuity a derived
    // `.find()` would give if it stopped matching.
    await page.goto('/docs/connecting-your-pms')
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('body')).toContainText('More in Money & integrations')
    await expect(page.locator('body')).toContainText('4-minute read')
    await expectNoA11yViolations(page, 'marketing: doc article')
  })
})

test.describe('the auth gate (middleware, invisible to happy-dom)', () => {
  const PROTECTED = ['/dashboard', '/patients', '/appointments', '/settings']

  for (const path of PROTECTED) {
    test(`${path} is not reachable signed-out`, async ({ page }) => {
      await page.goto(path)
      // Must land on sign-in, carrying where we were headed.
      await expect(page).toHaveURL(/\/signin/)
      expect(page.url()).toContain('redirect=')
    })
  }

  test('the sign-in page renders a usable form', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeEnabled()

    await expectNoA11yViolations(page, 'auth: sign-in')
  })

  test('a bad sign-in announces the failure to assistive tech', async ({ page }) => {
    // Pins the R2 a11y fix: the error block carries role="alert", so a screen
    // reader hears the failure instead of the form silently doing nothing.
    await page.goto('/signin')
    await page.locator('input[type="email"]').fill('nobody@example.com')
    await page.locator('input[type="password"]').fill('definitely-wrong-password')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 })

    // The error STATE, not just the empty form. A failure message is exactly
    // the kind of runtime-composed node the static gate never sees: it does
    // not exist in the JSX until a request comes back.
    await expectNoA11yViolations(page, 'auth: sign-in showing the failure alert')
  })
})

test.describe('unknown routes', () => {
  test('a missing clinic site 404s rather than crashing', async ({ page }) => {
    const res = await page.goto('/site/no-such-clinic-abc123')
    expect(res?.status()).toBe(404)
    await expect(page.locator('body')).not.toContainText('Application error')

    // 404s are the least-looked-at page in any product and the easiest place
    // for a heading level or a contrast slip to live undisturbed.
    await expectNoA11yViolations(page, 'public: unknown clinic 404')
  })
})
