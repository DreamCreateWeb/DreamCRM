import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'

/**
 * The patient-portal journey — the second persona, signed in for real.
 *
 * No magic-link email round-trip: the seed creates Casey's auth user + a live
 * session row (scripts/e2e-seed.mjs), and this spec mints the SIGNED session
 * cookie the same way better-auth does (token + "." + base64 HMAC-SHA256 of
 * the token with BETTER_AUTH_SECRET, URI-encoded) — so the browser walks the
 * portal exactly as a signed-in patient would.
 *
 * Covers: the auth wall (no cookie → bounced), the branded dashboard, and a
 * real WRITE — confirming a visit from the portal — persisted across reload.
 * The portal spec owns appt_e2e_portal (the cleaning); the /c token spec owns
 * appt_e2e_confirm (the checkup) — parallel workers, separate rows.
 */

const SESSION_TOKEN = 'e2e-patient-session-token'

function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

test.describe('patient portal', () => {
  test('without a session, the portal door bounces to sign-in', async ({ page }) => {
    await page.goto('/patient/dashboard')
    await expect(page).not.toHaveURL(/\/patient\/dashboard/)
    await expect(page.locator('body')).not.toContainText('Casey')
  })

  test('a signed-in patient sees their branded home and confirms a visit', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE })
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: signedSessionCookie(),
        url: BASE,
      },
    ])
    const page = await context.newPage()

    // The branded portal home: greeting + the next-visit rail.
    await page.goto('/patient/dashboard')
    await expect(page.getByText('Your next visit')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('body')).toContainText('Casey')

    // The visits page: the seeded cleaning is waiting to be confirmed.
    // (div.rounded-2xl is the VisitCard root — filtering generic divs picks
    // an inner wrapper that excludes the action row.)
    await page.goto('/patient/appointments')
    const card = page.locator('div.rounded-2xl').filter({ hasText: /Cleaning/i }).first()
    await expect(card).toBeVisible()
    await expect(card.getByText('Needs confirming')).toBeVisible()

    // The WRITE: confirm it from the portal.
    await card.getByRole('button', { name: 'Confirm visit' }).click()
    await expect(page.getByText(/you.re confirmed/i).first()).toBeVisible({ timeout: 30_000 })

    // Persisted: a fresh load shows the cleaning as Confirmed, its confirm
    // button gone. (Scoped to the cleaning card — the checkup card belongs to
    // the /c token spec and may be in either state.)
    await page.reload()
    const cleaningCard = page.locator('div.rounded-2xl').filter({ hasText: /Cleaning/i }).first()
    await expect(cleaningCard).toBeVisible()
    await expect(cleaningCard.getByText('Confirmed')).toBeVisible()
    await expect(cleaningCard.getByRole('button', { name: 'Confirm visit' })).toHaveCount(0)

    await context.close()
  })
})
