import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'

/**
 * The staff day — confirm / complete / cancel from the appointments drawer
 * (docs/E2E.md item 3). This is the desk's side of the same machinery the
 * portal specs drive from the patient's side: the agenda list, the drawer,
 * the confirm dialog, and the optimistic status flips, all in a real browser.
 *
 * Signs in as Dana Frontdesk (owner of the live clinic, seeded session).
 * One patient, three visits, one per action — confirm and cancel are
 * terminal-adjacent, so a single row cannot be walked through all three. The
 * rows share an aria-label ("Open Riley Staffday's visit"); the visit TYPE
 * text tells them apart.
 */

const SESSION_TOKEN = 'e2e-staff-session-token'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

test.describe('the staff day (appointments drawer)', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
  })

  /** An agenda row: the <li role="button"> carrying the whole row's text. */
  function row(page: import('@playwright/test').Page, type: string) {
    return page
      .getByRole('button', { name: "Open Riley Staffday's visit" })
      .filter({ hasText: type })
      .first()
  }

  const drawer = (page: import('@playwright/test').Page) =>
    page.getByRole('dialog', { name: 'Appointment' })

  test('confirm a visit from the drawer', async ({ page }) => {
    await page.goto('/appointments')
    const visit = row(page, 'checkup')
    await expect(visit).toBeVisible({ timeout: 30_000 })
    await visit.click()

    await drawer(page).getByRole('button', { name: 'Mark confirmed' }).click()
    await expect(page.getByRole('status')).toContainText('Confirmed.', { timeout: 30_000 })

    // Durable, past the optimistic flip.
    await page.reload()
    await expect(row(page, 'checkup')).toBeVisible({ timeout: 30_000 })
    await expect(row(page, 'checkup').getByText('Confirmed', { exact: true })).toBeVisible()
  })

  test('complete a past visit from the drawer', async ({ page }) => {
    // "Mark completed" only appears once the visit is in the past — the
    // seeded cleaning was yesterday, reachable via the Past 30 days chip.
    await page.goto('/appointments?window=past_30d')
    const visit = row(page, 'cleaning')
    await expect(visit).toBeVisible({ timeout: 30_000 })
    await visit.click()

    await drawer(page).getByRole('button', { name: 'Mark completed' }).click()
    await expect(page.getByRole('status')).toContainText('Marked completed.', { timeout: 30_000 })

    await page.goto('/appointments?window=past_30d')
    await expect(row(page, 'cleaning')).toBeVisible({ timeout: 30_000 })
    await expect(row(page, 'cleaning').getByText('Completed', { exact: true })).toBeVisible()
  })

  test('cancel a visit from the drawer, through the confirm dialog', async ({ page }) => {
    await page.goto('/appointments')
    const visit = row(page, 'consultation')
    await expect(visit).toBeVisible({ timeout: 30_000 })
    await visit.click()

    await drawer(page).getByRole('button', { name: 'Cancel appointment' }).click()
    // The dialog's confirm button shares its accessible name with the drawer
    // button that opened it — scope to the dialog.
    const confirm = page.getByRole('dialog', { name: 'Cancel this appointment?' })
    await expect(confirm.getByText('The patient will not be notified automatically.')).toBeVisible()
    await confirm.getByRole('button', { name: 'Cancel appointment' }).click()

    await expect(page.getByRole('status')).toContainText('Cancelled.', { timeout: 30_000 })

    await page.reload()
    await expect(row(page, 'consultation')).toBeVisible({ timeout: 30_000 })
    await expect(row(page, 'consultation').getByText('Cancelled', { exact: true })).toBeVisible()
  })
})
