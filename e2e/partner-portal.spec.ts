import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { restoresSeedScope } from './reseed'
import { expectNoA11yViolations } from './axe'

/**
 * THE FOURTH PERSONA, SIGNED IN (DREAMCRM-98).
 *
 * DreamCRM has four personas — platform, clinic, patient portal, referral
 * partner — and until this file the browser suite walked three. The public
 * `/partner-program` SALES page has been scanned since the first batch of
 * stops; the thing a partner actually logs into had none at all.
 *
 * That gap is easy to under-rate because the surface is small: one page, one
 * table, one payout panel. But it is the whole product for the person using
 * it, it is where they read what they are owed, and it is the only
 * authenticated surface in the app besides the dashboard — so nothing else's
 * coverage says anything about it.
 *
 * WHAT MAKES IT ITS OWN SHAPE rather than another dashboard page: a partner is
 * NOT an organization member. `requirePartner` looks the row up by
 * `referral_partner.user_id` directly, the session carries no active
 * organization, and the chrome is a deliberately minimal single column with no
 * sidebar. A stop on any clinic surface exercises none of that.
 *
 * As with the token landings, this spec asserts the state is on screen and
 * then scans. It never starts a payout — that is a real money path, and a scan
 * does not need one.
 */

const SESSION_TOKEN = 'e2e-partner-session-token'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

/**
 * The signed session cookie better-auth itself would set: the token, a dot,
 * and the base64 HMAC-SHA256 of the token under BETTER_AUTH_SECRET, URI-
 * encoded. Same construction as `e2e/portal.spec.ts` — the seed creates the
 * user and a live session row, and this mints the cookie that names it, so no
 * magic-link email round trip is needed.
 */
function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

// The scope THIS file owns — see scripts/e2e-seed.mjs.
restoresSeedScope('partner')

test.describe('the referral-partner portal', () => {
  test('without a session, the partner door does not open', async ({ page }) => {
    await page.goto('/partner')
    await expect(page).not.toHaveURL(/\/partner$/)
    await expect(page.locator('body')).not.toContainText('Marchetti')
  })

  /**
   * The portal with something in it. The seed gives this partner a referred
   * clinic, two accrued commissions and one paid — all three deliberately:
   *
   *   - no referred clinic and the table is an empty state,
   *   - no accrued balance and the payout panel has nothing to offer,
   *   - no paid row and the lifetime figure is a dash.
   *
   * Scanning that version of the page would be scanning three empty states
   * rather than the portal a partner logs into.
   */
  test('a signed-in partner sees their clinics, balance and payout panel', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE })
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
    const page = await context.newPage()

    await page.goto('/partner')
    await expect(page.getByRole('heading', { name: /Welcome back, Jules/ })).toBeVisible({
      timeout: 30_000,
    })
    // The referred clinic really is on the page — the difference between the
    // portal and its empty state.
    await expect(page.locator('body')).toContainText('E2E Referred Dental')

    await expectNoA11yViolations(page, 'partner: portal home, one referred clinic and a balance')

    await context.close()
  })
})
