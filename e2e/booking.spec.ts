import { test, expect } from '@playwright/test'

/**
 * The public booking journey — the product's top conversion path, and the one
 * flow where a silent failure costs the practice a real patient.
 *
 * This is a genuine WRITE test: it drives the browser through slot selection
 * and submission, and asserts the confirmation the patient actually sees. It
 * exercises the server action, the slot re-validation, and the atomic claim —
 * none of which happy-dom can reach.
 */

const BOOK = '/site/e2e-dental/book'

test.describe('public booking', () => {
  test('a patient can pick an open time and book it end to end', async ({ page }) => {
    await page.goto(BOOK)

    // "Today" is not always bookable — evenings and weekends the day is
    // honestly empty and the page offers the rescue button ("See Tuesday's
    // openings →", the funnel fix that jumps to the first day WITH slots).
    // Behave like a patient: take a slot if one is showing, otherwise take
    // the rescue. This also gives the rescue feature real browser coverage.
    const slot = page.getByRole('button', { name: /— available$/ }).first()
    const rescue = page.getByRole('button', { name: /openings →/ }).first()
    await expect(slot.or(rescue).first()).toBeVisible({ timeout: 20_000 })
    if (!(await slot.count())) await rescue.click()
    await expect(slot, 'the seeded clinic should offer at least one open slot').toBeVisible({
      timeout: 20_000,
    })

    await slot.click()
    await expect(slot).toHaveAttribute('aria-pressed', 'true')

    await page.getByLabel('First name').fill('Avery')
    await page.getByLabel('Last name').fill('Testpatient')
    await page.getByLabel('Phone number').fill('5551234567')

    const submit = page.locator('button[type="submit"]')
    await expect(submit).toBeEnabled() // enabled only once a slot is chosen
    await submit.click()

    // The patient's own record of the booking.
    await expect(page.getByText(/you.re booked|we.ll see you|booked|confirmed/i).first()).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  test('the submit button stays disabled until a time is picked', async ({ page }) => {
    // Guards against a half-filled form posting a booking with no slot.
    await page.goto(BOOK)
    await page.getByLabel('First name').fill('Avery')
    await page.getByLabel('Last name').fill('Testpatient')
    await page.getByLabel('Phone number').fill('5551234567')
    await expect(page.locator('button[type="submit"]')).toBeDisabled()
  })
})
