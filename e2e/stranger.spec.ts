import { test, expect } from '@playwright/test'
import { expectNoA11yViolations } from './axe'
import { applySeedScope, restoresSeedScope } from './reseed'

// Owns the `stranger` scope: restoring it before the test is a no-op (the
// clinic does not exist yet); the journey APPLIES it at the card step, where
// it stands in for Stripe. See the scope header in scripts/e2e-seed.mjs.
restoresSeedScope('stranger')

/**
 * The stranger test (release program R4, run early in R3's harness): a person
 * who has never seen the product signs up, walks the four onboarding steps,
 * and lands in their own empty clinic — the entire acquisition path as one
 * real browser journey, with nothing seeded on their side.
 *
 * THE CARD STEP (owner ruling 2026-11-23: a 14-day free trial, card required
 * to sign up). The fourth step is a card, and adding one happens on Stripe's
 * hosted Checkout, which this harness cannot reach (docs/E2E.md, "The Stripe
 * boundary"). So the journey walks everything on OUR side of that boundary
 * for real — the card step says what it costs, nothing in the product opens
 * without it, and a Stripe that cannot be reached is a sentence under the
 * button rather than a dead click — and then one seed scope writes what
 * Stripe's webhook would have. What a green run does NOT prove is the
 * Checkout session itself or the webhook that follows it; those are
 * `tests/billing/checkout-trial.test.ts` and `tests/billing/sync.test.ts`.
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
    test.setTimeout(180_000) // three setup screens + org provisioning

    await page.goto('/signup')
    await expectNoA11yViolations(page, 'auth: sign-up')
    await page.getByLabel(/Your name/).fill('Sam Stranger')
    await page.getByLabel(/Work email/).fill('sam.stranger@example.com')
    await page.getByLabel(/Practice name/).fill('Stranger Dental')
    await page.getByLabel(/^Password/).fill('e2e-Str4nger-pass!')
    await page.locator('button[type="submit"]').click()

    // Step 1 — identity. Practice name carries over from signup.
    await page.waitForURL('**/onboarding-01', { timeout: 60_000 })
    await expect(page.getByLabel(/Practice name/)).toHaveValue('Stranger Dental')

    // Onboarding is a stranger's first five minutes with the product and has
    // no other browser a11y coverage anywhere.
    await expectNoA11yViolations(page, 'onboarding: step 1, practice identity')

    await page.getByLabel(/Front-desk phone/).fill('5550100200')
    await page.getByLabel(/Street address/).fill('123 Main Street')
    await page.getByLabel(/City/).fill('Austin')
    await page.getByLabel(/State/).fill('TX')
    await page.getByLabel(/ZIP/).fill('78701')
    await page.getByRole('button', { name: /Next step/ }).click()

    // Step 2 — the software question and the web address. Wait for the
    // availability check to say yes (the submit stays disabled until it does).
    await page.waitForURL('**/onboarding-02', { timeout: 30_000 })
    await page.getByLabel('Not sure').check()
    const slugInput = page.getByLabel(/Web address/)
    await slugInput.fill('stranger-dental')
    await expect(page.getByText(/stranger-dental\.[^ ]+ is yours/)).toBeVisible({ timeout: 15_000 })

    // The availability verdict is announced by an element that did not exist
    // a moment ago — a runtime-composed status if ever there was one.
    await expectNoA11yViolations(page, 'onboarding: step 3, web address confirmed available')

    // This screen is no longer the last one, and no longer says "no card".
    await expect(page.getByText(/no card/i)).toHaveCount(0)
    await page.getByRole('button', { name: /Save and continue/ }).click()

    // Step 4 — THE CARD. The practice exists; the trial has not started. The
    // page says what the card costs today and does not call the site ready.
    await page.waitForURL('**/onboarding-complete', { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: /one step left: start your 14-day free trial/i })).toBeVisible()
    await expect(page.getByText(/Your card is saved, not charged/)).toBeVisible()
    await expect(page.getByText(/your site is ready/i)).toHaveCount(0)
    const startTrial = page.getByRole('button', { name: /add a card & start my 14-day free trial/i })
    await expect(startTrial).toBeVisible()

    await expectNoA11yViolations(page, 'onboarding: step 4, the card that starts the trial')

    // NOTHING OPENS WITHOUT IT. The dashboard is the same step in place of
    // the page, and the AI interview sends the practice back here.
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: /one step left: start your 14-day free trial/i })).toBeVisible()
    await expect(page.getByText(/has ended/i)).toHaveCount(0)
    await expectNoA11yViolations(page, 'staff: the card step in place of the dashboard')
    await page.goto('/welcome')
    await page.waitForURL('**/onboarding-complete', { timeout: 30_000 })

    // STRIPE CANNOT BE REACHED HERE (the harness has no key and no network),
    // which is this button's outage branch, deterministically: a sentence
    // under it that says nothing was charged — never a dead click.
    // (Filtered by its text: Next's route announcer is also a role="alert".)
    await startTrial.click()
    await expect(page.getByRole('alert').filter({ hasText: /nothing has been charged/i })).toBeVisible({
      timeout: 30_000,
    })
    // …and NOT the plan-change message: nothing changed, and "open Settings"
    // is behind the wall this practice is standing at.
    await expect(page.getByText(/couldn’t confirm that plan change/i)).toHaveCount(0)

    // STRIPE'S HALF, STOOD IN FOR: the card went on file and the trial began.
    applySeedScope('stranger')
    await page.goto('/onboarding-complete')

    // The completion page tells the TRUTH about the go-live lever: the site
    // is READY (private until published), not "live" — and about the money:
    // the trial has started and the card is charged when it ends, not before.
    await expect(page.getByText(/your site is ready/i)).toBeVisible()
    await expect(page.getByText(/site is live/i)).toHaveCount(0)
    await expect(page.getByText(/Your free trial has started/)).toBeVisible()
    await expect(page.getByText(/your card is charged then, and\s+not before/)).toBeVisible()

    await expectNoA11yViolations(page, 'onboarding: the finished page')

    // Into the dashboard: their own clinic, by name.
    await page.getByRole('link', { name: 'Go to dashboard' }).click()
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 60_000 })
    await expect(page.getByText('Stranger Dental').first()).toBeVisible({ timeout: 30_000 })

    // THE TENANT WALL: the other seeded clinic's patient must not exist here.
    await page.goto('/patients')
    await expect(page.locator('body')).not.toContainText('Casey Confirmable')
    await expect(page.locator('body')).not.toContainText('E2E Dental')

    // A brand-new clinic's patients list is the EMPTY state — a different
    // component tree from the populated list the tenant-boundary spec checks.
    await expectNoA11yViolations(page, 'staff: patients list, brand-new empty clinic')

    // FIRST DAY OF WORK: add the clinic's first patient through the real
    // modal and land on their chart — staff CRUD, in a browser, same session.
    await page.getByRole('button', { name: /Add patient/ }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add patient' })
    await dialog.getByLabel('First name').fill('Pat')
    await dialog.getByLabel('Last name').fill('First')
    await dialog.getByLabel('Email').fill('pat.first@example.com')
    await dialog.getByLabel('Phone').fill('5550100300')

    await expectNoA11yViolations(page, 'staff: add-patient dialog, filled in')

    await dialog.getByRole('button', { name: 'Save & open' }).click()
    await page.waitForURL('**/patients/*', { timeout: 30_000 })
    await expect(page.getByText('Pat First').first()).toBeVisible()
  })
})
