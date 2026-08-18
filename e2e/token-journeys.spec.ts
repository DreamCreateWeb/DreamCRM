import { test, expect } from '@playwright/test'

/**
 * The token-IS-auth patient journeys — the two email touches a patient acts on
 * without ever signing in, and the writes behind them:
 *
 *   /c/[token]  one-click visit confirm (reminder email's button)
 *   /n/[token]  post-visit 0–10 survey
 *
 * Both are REAL writes against the seeded rows (scripts/e2e-seed.mjs resets
 * them to unanswered on every seed, so the journeys are repeatable). The
 * confirm test also pins two prior fixes in a real browser: confirmation must
 * be a POST (a GET/prefetch must never confirm), and the confirmed state must
 * offer Add-to-calendar (polish batch 3).
 */

test.describe('one-click visit confirm (/c)', () => {
  test('landing on the page does NOT confirm — the button does', async ({ page }) => {
    await page.goto('/c/e2e-confirm-token')

    // Still pending after a GET: the button is offered, not consumed. This is
    // the inbox-prefetcher guard — a mail scanner following the link must not
    // confirm the visit.
    const button = page.getByRole('button', { name: 'Confirm my visit' })
    await expect(button).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Confirm my visit' })).toBeVisible()

    // Now the deliberate act.
    await page.getByRole('button', { name: 'Confirm my visit' }).click()
    await expect(page.getByText(/You.re confirmed, Casey/i)).toBeVisible({ timeout: 30_000 })

    // The confirmed state hands over the natural next act.
    await expect(page.getByRole('link', { name: 'Add to calendar' })).toBeVisible()

    // The write stuck: a fresh load lands on the confirmed state, not the button.
    await page.reload()
    await expect(page.getByText(/You.re confirmed, Casey/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm my visit' })).toHaveCount(0)
  })

  test('an unknown token 404s instead of leaking a shell', async ({ page }) => {
    const res = await page.goto('/c/not-a-real-token')
    expect(res?.status()).toBe(404)
  })
})

test.describe('post-visit survey (/n)', () => {
  test('a patient can tap a score and it is recorded', async ({ page }) => {
    await page.goto('/n/e2e-nps-token')

    await page.getByRole('radio', { name: '9 out of 10' }).click()
    await expect(page.getByText(/Got it — 9\/10/)).toBeVisible({ timeout: 30_000 })

    // Re-opening the email lands on the already-answered THANKS state (the
    // score persisted server-side, so the page never re-asks).
    await page.reload()
    await expect(page.getByText(/Thank you, Casey/)).toBeVisible()
  })

  test('an unknown survey token 404s', async ({ page }) => {
    const res = await page.goto('/n/not-a-real-token')
    expect(res?.status()).toBe(404)
  })
})
