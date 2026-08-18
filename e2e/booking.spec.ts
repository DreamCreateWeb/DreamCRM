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

    // Walk forward through the day strip until a day offers an open slot.
    // The seeded clinic is closed at weekends, so "today" is not always
    // bookable — the test must behave like a patient, not assume a calendar.
    const slot = page.getByRole('button', { name: /— available$/ }).first()
    let found = false
    for (let attempt = 0; attempt < 10; attempt++) {
      if (await slot.count()) {
        found = true
        break
      }
      const next = page.getByRole('button', { name: 'More days' })
      if (!(await next.count())) break
      await next.click()
      await page.waitForTimeout(600)
    }
    expect(found, 'the seeded clinic should offer at least one open slot').toBe(true)

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
