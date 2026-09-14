import { test, expect } from '@playwright/test'
import { restoresSeedScope } from './reseed'
import { expectNoA11yViolations } from './axe'
import { createHmac } from 'node:crypto'

/**
 * THE MONEY JOURNEY — a patient paying what they owe, in a real browser.
 *
 * Why this spec and not another: by unit count the payment code is the
 * best-tested area in the repo, and until now it was the least walked
 * through. Every assertion about what a patient actually SEES while paying —
 * the balance on the dashboard, the amount field, what appears when the card
 * processor is down — lived in happy-dom or nowhere.
 *
 * ============================ THE STRIPE BOUNDARY ============================
 *
 * `scripts/e2e-harness.sh` stands up a throwaway Postgres and a real
 * `next start` with NO external network, so the hosted Stripe Checkout page
 * itself is unreachable by construction. The journey is therefore walked in
 * three pieces, and it is worth being exact about what each one proves:
 *
 *   1. UP TO THE HAND-OFF, for real. Sign-in, the dashboard's balance strip,
 *      the billing page, the amount field, the client-side floors, the server
 *      action, the connected-account check, the pending payment row, and the
 *      moment the Stripe call is made. All of that is this app's code and all
 *      of it runs.
 *
 *   2. THE OUTAGE BRANCH, deterministically. The harness sets no
 *      STRIPE_SECRET_KEY (and now `unset`s any inherited one, deliberately —
 *      see the harness), so `lib/stripe.ts`'s lazy Proxy throws on first
 *      property access: synchronously, no socket, no timeout to wait out.
 *      That is the stub. The patient gets `CHECKOUT_UNAVAILABLE_MESSAGE` and
 *      nothing is charged, which is exactly the state a real outage produces.
 *
 *   3. THE RETURN FROM A COMPLETED CHECKOUT, by driving the `success_url`
 *      Stripe would send the patient back to. `createBalancePaymentSession`
 *      builds it as `/patient/invoices?session_id={CHECKOUT_SESSION_ID}`, so
 *      this navigates there directly.
 *
 * WHAT PART 3 DOES NOT PROVE, stated so nobody reads more into a green run
 * than it earns: it does not prove a payment was taken, and it does not
 * exercise `finalizeBalancePaymentFromSession` (which needs Stripe and is
 * `.catch`-swallowed on that path by design, with the webhook as the real
 * backstop). What it proves is that a patient returning from a successful
 * checkout lands on a page that renders, is still signed in, and tells them
 * the payment went through — rather than an error shell, a redirect to
 * sign-in, or a silent no-op. Each of those has been a real failure mode of a
 * return URL somewhere, and none of them is visible to happy-dom.
 *
 * THE OUTAGE HALF IS THE HALF WORTH HAVING. A patient whose payment succeeds
 * finds out from their bank. A patient whose payment cannot start finds out
 * only from this page, and if it says nothing they will either try again — or
 * assume they have paid.
 *
 * Row ownership: this file owns the `billing` scope, which is its own clinic
 * (`org_e2e_billing`). It needs `features.payments` ON and an active connected
 * account, both org-level facts other portal specs read, so it cannot share a
 * clinic with them. See scripts/e2e-seed.mjs.
 */

const SESSION_TOKEN = 'e2e-billing-session-token'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

/**
 * The seeded balance as the patient reads it — must match BILLING_BALANCE_CENTS.
 *
 * `$185` and not `$185.00`, because the product renders it BOTH ways and this
 * substring is the honest intersection. `fmtMoney` (components/patient-portal/
 * format.ts) sets `minimumFractionDigits` to 0 on a whole number of dollars, so
 * the billing page says "$185"; the dashboard's task strip builds its own
 * string with `.toFixed(2)` and says "$185.00". A spec pinned to either
 * spelling passes on one surface and fails on the other — which is how the
 * first run of this file went red.
 *
 * (That the two disagree is a real, if small, product inconsistency. It is a UI
 * copy question, not a test question, so this spec reports what is there rather
 * than asserting what it wishes were there.)
 */
const BALANCE = '$185'

/**
 * The same signed cookie better-auth mints: token + "." + base64 HMAC-SHA256
 * of the token under BETTER_AUTH_SECRET, URI-encoded. Copied from
 * e2e/portal.spec.ts rather than shared, deliberately — it is four lines, and
 * a shared helper would tempt a future spec into reusing another spec's token,
 * which is how row ownership gets broken across parallel workers.
 */
function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

async function signedInPatient(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ baseURL: BASE })
  await context.addCookies([
    { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
  ])
  return { context, page: await context.newPage() }
}

/**
 * Every attempt inserts a pending `patient_balance_payment` row before it
 * reaches Stripe and rolls it back best-effort when Stripe throws. A leftover
 * row would show up in the next attempt's billing history, so the scope clears
 * them — this is a spec that genuinely consumes its fixture.
 */
restoresSeedScope('billing')

test.describe('paying a balance from the portal', () => {
  test('a patient is told what they owe and can reach the pay form', async ({ browser }) => {
    const { context, page } = await signedInPatient(browser)

    // The dashboard task strip is the entry point — the first place a patient
    // learns they owe anything without going looking for it.
    await page.goto('/patient/dashboard')
    await expect(page.locator('#portal-main')).toContainText(BALANCE, { timeout: 30_000 })

    // Follow the patient's own route in rather than deep-linking: the strip
    // being a working link to Billing is part of the journey, and a link that
    // renders but does not navigate is invisible to a `goto`.
    //
    // Matched on the AMOUNT, not on the word "balance": the verbs grid below
    // carries a "Billing — Balance & history" link too, and `/balance/i` would
    // be two matches and a strict-mode violation the first time the grid moved
    // above the strip.
    await page.getByRole('link', { name: /\$185\.00 balance/ }).click()
    await expect(page).toHaveURL(/\/patient\/invoices/)

    await expect(page.getByText('Your balance')).toBeVisible()
    await expect(page.locator('#portal-main')).toContainText(BALANCE)

    // The pay form only renders when the portal's payments feature is on AND
    // the clinic has an active connected account. Both are seeded, so this
    // assertion is also the proof that `canTakeBalancePayments` agreed — the
    // alternative rendering is a "call us" paragraph with no controls at all.
    const amount = page.getByLabel('Payment amount in dollars')
    await expect(amount).toBeVisible()
    await expect(amount).toHaveValue('185.00')
    await expect(page.getByRole('button', { name: 'Pay online' })).toBeEnabled()

    await expectNoA11yViolations(page, 'portal: billing, a balance waiting to be paid')
    await context.close()
  })

  test('the floors say so in words, and nothing leaves the page', async ({ browser }) => {
    const { context, page } = await signedInPatient(browser)
    await page.goto('/patient/invoices')

    const amount = page.getByLabel('Payment amount in dollars')
    await expect(amount).toBeVisible({ timeout: 30_000 })

    // Over the balance. The server refuses this too, but the client refusal is
    // the one a patient meets, and it must be a sentence rather than a silent
    // dead button — a form that appears to do nothing on click is how somebody
    // concludes the practice's payment page is broken.
    await amount.fill('999.00')
    await page.getByRole('button', { name: 'Pay online' }).click()
    await expect(page.locator('#portal-main').getByRole('alert')).toContainText('more than your balance')

    // Under the $1 floor.
    await amount.fill('0.50')
    await page.getByRole('button', { name: 'Pay online' }).click()
    await expect(page.locator('#portal-main').getByRole('alert')).toContainText('minimum online payment is $1')

    // Durable: refused amounts never became a payment. The balance is
    // unchanged after a fresh load, and the history carries nothing.
    await page.reload()
    await expect(page.locator('#portal-main')).toContainText(BALANCE)
    await expect(page.getByText('Balance payment')).toHaveCount(0)

    await context.close()
  })

  test('when the card processor is down, the patient is told nothing was charged', async ({
    browser,
  }) => {
    const { context, page } = await signedInPatient(browser)
    await page.goto('/patient/invoices')

    const amount = page.getByLabel('Payment amount in dollars')
    await expect(amount).toBeVisible({ timeout: 30_000 })
    await amount.fill('50.00')
    await page.getByRole('button', { name: 'Pay online' }).click()

    // The written sentence from lib/services/checkout-error.ts. Asserted in
    // pieces rather than whole: the string carries typographic apostrophes, and
    // a spec that pins punctuation fails on a copy edit that changed nothing
    // that matters. The two claims that DO matter are both here.
    const alert = page.locator('#portal-main').getByRole('alert')
    await expect(alert).toContainText('couldn’t start checkout')
    await expect(
      alert,
      'a patient who is not told nothing was charged will either pay twice or assume they have paid',
    ).toContainText('nothing has been charged')

    // And it stays on this page: no redirect to a Stripe URL that does not
    // exist, no navigation away from the amount they typed.
    await expect(page).toHaveURL(/\/patient\/invoices/)

    await expectNoA11yViolations(page, 'portal: billing, checkout could not start')

    // THE DURABLE HALF. The failed attempt wrote a pending payment row before
    // calling Stripe and rolled it back when Stripe threw; after a fresh load
    // the balance is untouched and no payment appears in the history. An
    // assertion on the alert alone would also pass if the rollback had failed
    // and left a phantom "Processing" payment on the patient's record.
    await page.reload()
    await expect(page.locator('#portal-main')).toContainText(BALANCE)
    await expect(page.getByText('Balance payment')).toHaveCount(0)

    await context.close()
  })

  test('coming back from a completed checkout, the patient sees it went through', async ({
    browser,
  }) => {
    const { context, page } = await signedInPatient(browser)

    // The success_url createBalancePaymentSession hands Stripe, with the
    // session id Stripe substitutes. See the file header for what this does
    // and does not prove — it is the RETURN, not the payment.
    await page.goto('/patient/invoices?session_id=cs_test_e2e_returned_from_checkout')

    await expect(page.locator('#portal-main').getByRole('status')).toContainText('your payment went through', {
      timeout: 30_000,
    })
    // Still the billing page, still signed in — not an error shell and not a
    // bounce to sign-in, which is what a return URL that loses its session
    // looks like to a patient who has just paid.
    await expect(page.getByText('Your balance')).toBeVisible()

    await expectNoA11yViolations(page, 'portal: billing, back from a completed checkout')
    await context.close()
  })
})
