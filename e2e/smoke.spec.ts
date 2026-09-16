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
