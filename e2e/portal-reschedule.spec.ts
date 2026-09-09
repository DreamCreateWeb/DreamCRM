import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'

/**
 * Portal reschedule + cancel — the self-serve visit changes docs/E2E.md names
 * next, with the notice window exercised from both sides.
 *
 * The card only offers Reschedule/Cancel OUTSIDE the clinic's notice window
 * (24h by default); INSIDE it both pills give way to a "Need to change it?"
 * fallback — so the journey here is: change freely three weeks out, and see
 * the door honestly closed 20 hours out.
 *
 * Signs in as Morgan Moveable (own session row + own visits, seeded in
 * scripts/e2e-seed.mjs) so nothing here can shadow e2e/portal.spec.ts, which
 * owns Casey's rows in a parallel worker. Cards carry no title — the visit
 * TYPE label (Consultation / Filling / Extraction) is how each is addressed.
 */

const SESSION_TOKEN = 'e2e-move-session-token'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

test.describe('portal reschedule and cancel', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
  })

  /** The VisitCard root — same scoping the portal spec uses (filtering generic
   *  divs picks an inner wrapper that excludes the action row, so .first()). */
  function card(page: import('@playwright/test').Page, label: string | RegExp) {
    return page.locator('div.rounded-2xl').filter({ hasText: label }).first()
  }

  test('inside the notice window the card offers a call, not a change', async ({ page }) => {
    await page.goto('/patient/appointments')
    const soon = card(page, 'Extraction')
    await expect(soon).toBeVisible({ timeout: 30_000 })
    // 20 hours out < the 24h default window: no self-serve pills, the
    // fallback instead (the seeded clinic has no phone, so "Message us").
    await expect(soon.getByText(/Need to change it\?/)).toBeVisible()
    await expect(soon.getByRole('button', { name: 'Reschedule' })).toHaveCount(0)
    await expect(soon.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  })

  test('a patient moves a visit to a new open time', async ({ page }) => {
    await page.goto('/patient/appointments')
    const visit = card(page, 'Consultation')
    await expect(visit).toBeVisible({ timeout: 30_000 })

    await visit.getByRole('button', { name: 'Reschedule' }).click()
    await expect(visit.getByText(/Pick a new time/)).toBeVisible()

    // The new time must itself clear the 24h notice window, and weekends are
    // closed — walk the panel's day strip from two days out until a day shows
    // an open slot (at most Sat+Sun stand between us and one).
    const slot = visit.getByRole('button', { name: /— available/ }).first()
    const days = visit.getByRole('button', { name: /^(Today, )?[A-Z][a-z]{2} \d+$/ })
    for (let i = 2; i <= 8 && !(await slot.count()); i++) {
      await days.nth(i).click()
      await expect(days.nth(i)).toHaveAttribute('aria-pressed', 'true')
      await expect(
        slot.or(visit.getByText(/closed this day|done seeing patients|taken this day|need a quick call/i)).first(),
      ).toBeVisible({ timeout: 20_000 })
    }
    await expect(slot, 'some weekday in the window should have an opening').toBeVisible()
    await slot.click()

    await visit.getByRole('button', { name: 'Move my visit' }).click()
    await expect(page.getByText('All moved — your new time is confirmed in email too.')).toBeVisible({
      timeout: 30_000,
    })

    // Durable: the reschedule mints a NEW visit (unconfirmed) and retires the
    // original — after a fresh load exactly one Consultation card remains and
    // it needs confirming again.
    await page.reload()
    const moved = card(page, 'Consultation')
    await expect(moved).toBeVisible({ timeout: 30_000 })
    await expect(moved.getByText('Needs confirming')).toBeVisible()
  })

  test('a patient cancels a visit, no judgment', async ({ page }) => {
    await page.goto('/patient/appointments')
    const visit = card(page, 'Filling')
    await expect(visit).toBeVisible({ timeout: 30_000 })

    await visit.getByRole('button', { name: 'Cancel' }).click()
    await expect(visit.getByText(/no judgment. Want us to cancel this visit\?/)).toBeVisible()
    await visit.getByRole('button', { name: 'Yes, cancel it' }).click()
    await expect(page.getByText(/Cancelled\. Whenever you.re ready/)).toBeVisible({ timeout: 30_000 })

    // Durable: a future cancelled visit leaves "Coming up" entirely.
    await page.reload()
    await expect(page.locator('div.rounded-2xl').filter({ hasText: 'Filling' })).toHaveCount(0, {
      timeout: 30_000,
    })
  })
})
