import { test, expect } from '@playwright/test'

/**
 * Seeded public-site journeys (fixture: scripts/e2e-seed.mjs).
 *
 *   e2e-dental   — a published clinic: the normal public journey
 *   e2e-prelive  — operating but NOT published: the go-live lever is the
 *                  thing under test, including the door it must NOT lock
 */

const LIVE = '/site/e2e-dental'
const PRELIVE = '/site/e2e-prelive'

test.describe('a published clinic site', () => {
  test('the home page serves the clinic, branded, with no error shell', async ({ page }) => {
    const res = await page.goto(LIVE)
    expect(res?.status()).toBe(200)
    await expect(page.locator('body')).toContainText('E2E Dental Studio')
    await expect(page.locator('body')).not.toContainText('Application error')
    // A published site must never show the pre-live gate.
    await expect(page.locator('body')).not.toContainText('on its way')
  })

  test('the booking page renders (the top conversion path)', async ({ page }) => {
    const res = await page.goto(`${LIVE}/book`)
    expect(res?.status()).toBe(200)
    await expect(page.locator('body')).not.toContainText('Application error')
    // The visit-type field carries a real accessible name (R2 a11y fix) —
    // it used to announce only its current option, not what it was for.
    await expect(page.getByLabel('Visit type')).toBeVisible()
  })

  test('the booking form fields are reachable by their names, not placeholders', async ({ page }) => {
    // Pins the R2 a11y fix: these inputs were placeholder-only, which vanishes
    // on input and is a weak accessible name.
    await page.goto(`${LIVE}/book`)
    await expect(page.getByLabel('First name')).toBeVisible()
    await expect(page.getByLabel('Last name')).toBeVisible()
    await expect(page.getByLabel('Phone number')).toBeVisible()
  })
})

test.describe('the go-live lever', () => {
  test('an unpublished clinic shows coming-soon instead of its marketing site', async ({ page }) => {
    await page.goto(PRELIVE)
    await expect(page.locator('body')).toContainText(/on its way|coming soon/i)
  })

  test('…but its PORTAL DOOR still opens (R2 slice 4)', async ({ page }) => {
    // The scar: a practice that was fully operating — patients synced, portal
    // in use — but had not published its marketing site was handing out portal
    // links and QR codes that dead-ended on a page with no navigation.
    // The doors are not the marketing site.
    await page.goto(`${PRELIVE}/portal`)
    await expect(page.locator('body')).not.toContainText(/on its way/i)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('a published clinic serves the same portal door', async ({ page }) => {
    await page.goto(`${LIVE}/portal`)
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })
})
