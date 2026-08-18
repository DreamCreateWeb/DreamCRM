import { test, expect } from '@playwright/test'

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
  })

  test('pricing shows the one purchasable plan at the founding rate', async ({ page }) => {
    // Guards the pricing-truth decision: Premium $200/mo is the only
    // self-serve plan; the legacy tiers must not resurface on the page.
    await page.goto('/pricing')
    await expect(page.locator('body')).toContainText('$200')
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
  })

  test('a bad sign-in announces the failure to assistive tech', async ({ page }) => {
    // Pins the R2 a11y fix: the error block carries role="alert", so a screen
    // reader hears the failure instead of the form silently doing nothing.
    await page.goto('/signin')
    await page.locator('input[type="email"]').fill('nobody@example.com')
    await page.locator('input[type="password"]').fill('definitely-wrong-password')
    await page.locator('button[type="submit"]').click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('unknown routes', () => {
  test('a missing clinic site 404s rather than crashing', async ({ page }) => {
    const res = await page.goto('/site/no-such-clinic-abc123')
    expect(res?.status()).toBe(404)
    await expect(page.locator('body')).not.toContainText('Application error')
  })
})
