import { test, expect } from '@playwright/test'

/**
 * The stranger test (release program R4, run early in R3's harness): a person
 * who has never seen the product signs up, walks the four onboarding steps,
 * and lands in their own empty clinic — the entire acquisition path as one
 * real browser journey, with nothing seeded on their side.
 *
 * The harness rebuilds the database from zero every run, so fixed
 * credentials are safe. The signup email is @example.com on purpose:
 * deliver() drops RFC-reserved test addresses, so no real send is attempted
 * even with a live email key.
 *
 * The last assertions are the multi-tenancy check this program exists for:
 * the new clinic's Patients page must NOT contain the OTHER seeded clinic's
 * patient, and its dashboard must carry its own name.
 */

test.describe('the stranger journey', () => {
  test('sign up → onboard → an empty clinic of your own', async ({ page }) => {
    test.setTimeout(180_000) // four server-action steps + org provisioning

    await page.goto('/signup')
    await page.getByLabel(/Your name/).fill('Sam Stranger')
    await page.getByLabel(/Work email/).fill('sam.stranger@example.com')
    await page.getByLabel(/Practice name/).fill('Stranger Dental')
    await page.getByLabel(/^Password/).fill('e2e-Str4nger-pass!')
    await page.locator('button[type="submit"]').click()

    // Step 1 — identity. Practice name carries over from signup.
    await page.waitForURL('**/onboarding-01', { timeout: 60_000 })
    await expect(page.getByLabel(/Practice name/)).toHaveValue('Stranger Dental')
    await page.getByLabel(/Front-desk phone/).fill('5550100200')
    await page.getByRole('button', { name: /Next step/ }).click()

    // Step 2 — address.
    await page.waitForURL('**/onboarding-02', { timeout: 30_000 })
    await page.getByLabel(/Street address/).fill('123 Main Street')
    await page.getByLabel(/City/).fill('Austin')
    await page.getByLabel(/State/).fill('TX')
    await page.getByLabel(/ZIP/).fill('78701')
    await page.getByRole('button', { name: /Next step/ }).click()

    // Step 3 — the web address. Wait for the availability check to say yes
    // (the submit stays disabled until it does).
    await page.waitForURL('**/onboarding-03', { timeout: 30_000 })
    const slugInput = page.getByLabel(/Web address/)
    await slugInput.fill('stranger-dental')
    await expect(page.getByText(/stranger-dental\.[^ ]+ is yours/)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Next step/ }).click()

    // Step 4 — the no-card trial.
    await page.waitForURL('**/onboarding-04', { timeout: 30_000 })
    await page.getByRole('button', { name: /Start my free trial/ }).click()

    // The completion page tells the TRUTH about the go-live lever: the site
    // is READY (private until published), not "live".
    await page.waitForURL('**/onboarding-complete', { timeout: 60_000 })
    await expect(page.getByText(/your site is ready/i)).toBeVisible()
    await expect(page.getByText(/site is live/i)).toHaveCount(0)

    // Into the dashboard: their own clinic, by name.
    await page.getByRole('link', { name: 'Go to dashboard' }).click()
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 60_000 })
    await expect(page.getByText('Stranger Dental').first()).toBeVisible({ timeout: 30_000 })

    // THE TENANT WALL: the other seeded clinic's patient must not exist here.
    await page.goto('/patients')
    await expect(page.locator('body')).not.toContainText('Casey Confirmable')
    await expect(page.locator('body')).not.toContainText('E2E Dental')

    // FIRST DAY OF WORK: add the clinic's first patient through the real
    // modal and land on their chart — staff CRUD, in a browser, same session.
    await page.getByRole('button', { name: /Add patient/ }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add patient' })
    await dialog.getByLabel('First name').fill('Pat')
    await dialog.getByLabel('Last name').fill('First')
    await dialog.getByLabel('Email').fill('pat.first@example.com')
    await dialog.getByLabel('Phone').fill('5550100300')
    await dialog.getByRole('button', { name: 'Save & open' }).click()
    await page.waitForURL('**/patients/*', { timeout: 30_000 })
    await expect(page.getByText('Pat First').first()).toBeVisible()
  })
})
