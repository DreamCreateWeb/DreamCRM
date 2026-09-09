import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'

/**
 * The sign-here stack — approve a proposal and see the artifact update
 * (docs/E2E.md item 4). Drives the real approve path: the atomic open →
 * approved claim, the executor, the ledger narration, and the durable
 * artifact change on the Leads board.
 *
 * The seeded card is an inquiry_response on purpose: it is the one capability
 * whose executor completes with no vendor keys, because deliver() silently
 * succeeds for RFC-reserved @example.com recipients before it ever looks for
 * RESEND_API_KEY. The consent checkbox ("From now on, handle these for me…")
 * is deliberately left untouched — ticking it would grant standing autonomy
 * on the shared fixture org and change the toast copy.
 */

const SESSION_TOKEN = 'e2e-staff-session-token'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

test.describe('the sign-here stack', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
  })

  test('approve an inquiry reply and see the lead flip to contacted', async ({ page }) => {
    await page.goto('/dream-team')
    const stack = page.locator('section[aria-label="Waiting on your yes"]')
    await expect(stack.getByRole('heading', { name: 'Waiting on your yes' })).toBeVisible({
      timeout: 30_000,
    })

    // The card renders its artifact: the inquiry quoted, the reply as the
    // email the patient would get, and the machine-added booking button
    // disclosure.
    await expect(stack.getByText('Answer website inquiries')).toBeVisible()
    await expect(stack.getByText('Do you take my insurance, and can I get in next week?')).toBeVisible()
    await expect(stack.getByText('Robin Inquirer')).toBeVisible()

    await stack.getByRole('button', { name: 'Approve — send it' }).click()

    // The ledger summary arrives as the toast; the emptied stack says so.
    await expect(page.getByRole('status')).toContainText(/website inquiry by email/, {
      timeout: 30_000,
    })
    await expect(
      stack.getByText('That’s all of them — nothing else is waiting on your yes.'),
    ).toBeVisible({ timeout: 30_000 })

    // The durable artifact update: the lead is now Contacted on the board.
    await page.goto('/leads')
    const lead = page.getByRole('row').filter({ hasText: 'Robin Inquirer' }).first()
    const leadAnywhere = page.locator('body').getByText('Robin Inquirer').first()
    await expect(lead.or(leadAnywhere).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Contacted', { exact: true }).first()).toBeVisible()
  })
})
