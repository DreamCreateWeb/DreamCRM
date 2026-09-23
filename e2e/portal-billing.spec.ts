import { test, expect } from '@playwright/test'
import { restoresSeedScope } from './reseed'
import { expectNoA11yViolations } from './axe'
import { expectSole, watchForDuplicates } from './duplicate-watch'
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

/**
 * The elements the duplicate-render flake resolves to two of.
 *
 * It was one — the amount input — until the first hunt ran it to ground (run
 * `35811927552`, 9 failures in 200 repetitions). Three of those nine were
 * `getByText('Your balance')` resolving to two elements, which is a heading
 * three sections up the page. So whatever doubles is not the payment form; it
 * is the billing page's BODY, and a watcher pointed at one input could only
 * ever have reported a third of it.
 */
const WATCHED_SELECTORS = [
  'input[aria-label="Payment amount in dollars"]',
  '#portal-main h1',
]

async function signedInPatient(browser: import('@playwright/test').Browser) {
  const context = await browser.newContext({ baseURL: BASE })
  await context.addCookies([
    { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
  ])
  // Installed on the CONTEXT, before any navigation, because the render being
  // investigated is the first one (DREAMCRM-105). See `./duplicate-watch`: the
  // duplicate lives for ~500ms and a post-hoc `page.evaluate` reads a page that
  // has already healed, which is how two occurrences produced two dead ends.
  await watchForDuplicates(context, WATCHED_SELECTORS)
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

    await expectSole(page, page.getByText('Your balance'), 10_000)
    await expect(page.locator('#portal-main')).toContainText(BALANCE)

    // The pay form only renders when the portal's payments feature is on AND
    // the clinic has an active connected account. Both are seeded, so this
    // assertion is also the proof that `canTakeBalancePayments` agreed — the
    // alternative rendering is a "call us" paragraph with no controls at all.
    // This is the test that has never flaked — it settles on `Your balance`
    // and `#portal-main` content before locating the input, which is the lead
    // test 3's note is built on. Watched anyway: if the duplicate ever shows
    // up HERE, the settle is not the discriminator and that is worth knowing.
    const amount = await expectSole(page, page.getByLabel('Payment amount in dollars'))
    await expect(amount).toHaveValue('185.00')
    await expect(page.getByRole('button', { name: 'Pay online' })).toBeEnabled()

    await expectNoA11yViolations(page, 'portal: billing, a balance waiting to be paid')
    await context.close()
  })

  test('the floors say so in words, and nothing leaves the page', async ({ browser }) => {
    const { context, page } = await signedInPatient(browser)
    await page.goto('/patient/invoices')

    // THE SPEC THE FLAKE'S OWN LEAD PREDICTS IS NEXT (see test 3's note): this
    // and test 3 are the two that go `goto` -> straight to a strict locator,
    // with no settle in between. `expectSole` keeps the locator STRICT — two
    // forms still fail — and attaches what the watcher recorded.
    const amount = await expectSole(page, page.getByLabel('Payment amount in dollars'))

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

    // ⚠ FLAKE SEEN HERE, 2026-09-15 — handed to the QA lane rather than fixed,
    // because it is a spec/fixture question and nothing about it was mine.
    // Reproduction so nobody has to rediscover it (§10 — the thread is not in
    // your editor):
    //
    //   run 35028171588, job 104580103724, on a TEST-ONLY diff that the
    //   browser suite never loads. `getByLabel('Payment amount in dollars')`
    //   raised **strict mode violation: resolved to 2 elements**. Two pay
    //   forms were on `/patient/invoices` at once.
    //
    // WHAT MAKES IT INTERESTING rather than ordinary noise: it failed the first
    // attempt AND `retry #1`, then a plain re-run of the same job at the SAME
    // SHA passed. Playwright's retry reuses the same throwaway Postgres, so a
    // fault that survives the retry and dies with the database is seeded STATE,
    // not a timing race — most likely this patient carrying two unpaid
    // balances (a residue from a sibling spec that consumes the scope, or a
    // second row this file's own earlier test leaves behind) rather than the
    // one the fixture intends.
    //
    // That also means the retry buys nothing here: both attempts see the same
    // bad row. The fix is probably `.first()` plus a fixture assertion that the
    // patient has exactly ONE payable balance — but the assertion is the point,
    // since `.first()` alone would make a wrong fixture invisible.
    //
    // ── SECOND OCCURRENCE, 2026-09-22, AND THE HYPOTHESIS ABOVE IS WRONG ──
    //
    // It came back on DREAMCRM-99/#671: run `35789025973`, job
    // `106952776354`, again on a diff the browser suite never loads (a
    // workflow file, a node script and a vitest guard). Same strict-mode
    // violation, same two elements, first attempt AND `retry #1` — then a
    // plain re-run of the same job at the same SHA went green. Identical
    // signature to 2026-09-15, which makes this a recurrence rather than a
    // coincidence, and `main`'s own `post-merge-e2e` was green at every
    // commit either side of it.
    //
    // WHAT RULES THE SEEDED-STATE READING OUT. `PayBalanceForm` is rendered in
    // exactly ONE place — `app/(portal)/patient/invoices/page.tsx:170`, not in
    // a loop and not per invoice — and `aria-label="Payment amount in dollars"`
    // occurs exactly once in the whole product tree. So a second unpaid
    // balance, or any number of extra rows, CANNOT produce a second pay form.
    // Two of them in the DOM means two copies of the same single render, not
    // two invoices. The 2026-09-15 note reasoned from "the retry sees it too,
    // therefore state, not timing" — but Playwright's retry repeats the same
    // navigation on the same warm server, so a hydration or streaming
    // duplicate reproduces across attempts just as happily as a bad row does.
    //
    // WHICH MEANS `.first()` IS THE WRONG FIX and would be actively harmful:
    // it would hide two live payment forms on a patient's billing page, which
    // is a product defect worth seeing, behind a green tick. Whoever picks this
    // up should reproduce against the harness with the DOM dumped
    // (`error-context.md` is already saved by the failing run) and find out
    // WHERE the second copy comes from before choosing a locator.
    //
    // ── THE DUPLICATE IS TRANSIENT, AND THAT IS MEASURED ──
    //
    // The remaining question was whether the two forms coexist for a moment or
    // for the whole page life. It is a moment, and the evidence is already in
    // the failing runs: both attempts died in **525ms and 738ms** against a
    // `toBeVisible({ timeout: 30_000 })`.
    //
    // That timing is the tell, because a strict-mode violation does not retry.
    // Measured with Playwright 1.62.1 against `page.setContent`, no app and no
    // database needed — re-runnable in a minute by anyone:
    //
    //   two matching inputs from the start ....... throws in    24ms
    //   ONE input, genuinely late by 3s .......... PASSES after 3392ms
    //   two inputs, duplicate removed after 2s ... throws in     4ms
    //
    // The middle row is the control: the locator *does* wait for an element
    // that is merely late. The third row is this flake's shape — the page
    // becomes correct two seconds later and Playwright never finds out,
    // because it resolved two elements and threw on the spot. So the duplicate
    // only has to exist for an instant during the render, and 525ms is what
    // that looks like; a genuinely ABSENT form would have burned the full 30s.
    //
    // WHICH KILLS THE SEEDED-STATE READING A SECOND WAY. A stray unpaid row
    // would be there for the whole page, not for 500ms. Combined with the
    // single render site above, there is no version of "bad fixture" that
    // produces this.
    //
    // AND IT IS A SECOND REASON `.first()` IS WRONG: it would silently accept
    // a page that renders two payment forms mid-navigation, which is the thing
    // worth knowing about.
    //
    // THE LEAD, for whoever picks this up. The three tests in this file that
    // reach the form do not reach it the same way:
    //
    //   test 1 (passes)  clicks in from the dashboard, then asserts
    //                    `getByText('Your balance')` and `#portal-main`
    //                    content BEFORE locating the input — it settles first
    //   test 2           `goto` -> straight to `getByLabel`
    //   test 3 (this one, the one that fails)  `goto` -> straight to
    //                    `getByLabel`
    //
    // The two that skip the settle are the two with no barrier between
    // navigation and a strict locator, and one of them is the one that fails.
    // That predicts test 2 is next. Start by asserting a stable unique element
    // after the `goto` and see whether it goes away — but WATCH IT FAIL FIRST,
    // because a fix that only ever passed proves nothing here (§2d), and the
    // whole reason this comment is long is that the last hypothesis was
    // confidently written and wrong.
    //
    // ══════ REPRODUCED, WITH A RATE — hunt run 35811927552, 2026-09-23 ══════
    //
    // `gh workflow run e2e-flake-hunt.yml -f spec=e2e/portal-billing.spec.ts
    // -f repeat=50` — 200 repetitions at `--retries=0`:
    //
    //   9 of 200 failed .................................... 4.5%
    //     5x  getByLabel('Payment amount in dollars') → 2 elements
    //     3x  getByText('Your balance')               → 2 elements
    //     1x  a click on the dashboard's balance link that never navigated
    //
    // THREE THINGS THAT CHANGE, and each retires something written above.
    //
    // 1. IT IS NOT THE PAYMENT FORM. `Your balance` is a heading three
    //    sections up the page and it duplicates too. Whatever doubles is the
    //    billing page's BODY, so every sentence above that reasons about
    //    `PayBalanceForm` being rendered in one place is answering the wrong
    //    question. It was never about the form.
    //
    // 2. ALL FOUR TESTS FLAKE — 1/50, 3/50, 2/50, 3/50. The "test 1 settles
    //    first and has never flaked" lead below is dead: test 1 failed too,
    //    and its failure was the navigation, not the locator. The
    //    settle-versus-no-settle theory explained a sample of two.
    //
    // 3. THERE IS EXACTLY ONE `#portal-main`. Playwright named the first match
    //    `locator('#portal-main').getByText('Your balance')` and could only
    //    reach the second as `.nth(1)` — so one copy is inside the main
    //    landmark and the other is NOT, and the layout is not doubled. That is
    //    the shape of React streaming a Suspense boundary's content into a
    //    `<div hidden>` at the end of `<body>` before moving it into place,
    //    and `app/(portal)/loading.tsx` is the boundary. It is not yet PROVEN:
    //    see the next paragraph for why not.
    //
    // WHAT THE FIRST HUNT COULD NOT SAY, and it is this file's own fault: the
    // duplicate watcher reported `max: 0` on every one of the nine failures.
    // It observed `document.documentElement`, which is **null** at
    // `addInitScript` time — the observer never attached, and the diagnostic
    // built to end two dead ends produced a third. Fixed (it observes
    // `document`, which always exists) and pinned by a regression test that
    // removes the documentElement first. The next hunt gets the ancestor chain
    // and turns point 3 from an inference into a reading.
    //
    // Everything below this line is the investigation as it stood BEFORE the
    // hunt. Kept because the reasoning is the durable part and because two of
    // its conclusions were wrong in instructive ways.
    //
    // Still not reproduced end to end: that needs the Playwright harness and
    // its throwaway Postgres, and the blocker is specifically POSTGRES —
    // `initdb` is not on PATH, `/usr/lib/postgresql` does not exist and Docker
    // is unavailable on the box this was investigated from. Playwright and
    // Chromium are present, which is how the timing above was measured. It is
    // Quinn's, and the count of occurrences is two.
    //
    // ── DREAMCRM-105: THE NEXT OCCURRENCE ARRIVES WITH ITS EVIDENCE ──
    //
    // The 525ms measurement above is also what made both investigations dead
    // ends: a strict-mode violation throws on the spot, and by the time any
    // `page.evaluate` runs the page has healed and reports exactly one form.
    // So twice now we have known the duplicate EXISTED and nothing about what
    // it WAS — and the one diagnosis written down confidently was wrong.
    //
    // `./duplicate-watch` installs a MutationObserver through
    // `context.addInitScript`, running before any page script on the very
    // first render, and records the ancestor chain of every match the moment
    // the count goes above one. The locator below is still STRICT — `.first()`
    // would retire the only instrument reporting a possible money defect, and
    // that is not this file's decision to make — but the failure now carries
    // the recording.
    //
    // TWO CANDIDATES NEITHER EARLIER NOTE NAMED, both of which the chain tells
    // apart on sight, and both of which are properties of THIS segment rather
    // than of the fixture:
    //
    //   1. `app/(portal)/loading.tsx` exists, so the whole portal segment is a
    //      Suspense boundary and its content arrives OUT OF ORDER — React
    //      parks it in a `<div hidden>` at the end of `<body>` and an inline
    //      script moves it into place. A chain ending in `div[hidden]` is this.
    //   2. `PortalLiveRefresh` calls `router.refresh()` on realtime events and
    //      the portal chrome is server-rendered. TWO `#portal-main` elements
    //      means the LAYOUT doubled, not the form, and the question leaves
    //      this file.
    //
    // HOW TO MAKE IT HAPPEN ON PURPOSE, now that the harness takes arguments:
    //
    //   gh workflow run e2e-flake-hunt.yml \
    //     -f spec=e2e/portal-billing.spec.ts -f repeat=50
    //
    // A red run there is the good outcome. Read the recording in the failure
    // message before choosing a locator — the last hypothesis was confidently
    // written and wrong, which is why this comment is long.
    const amount = await expectSole(page, page.getByLabel('Payment amount in dollars'))
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
    await expectSole(page, page.getByText('Your balance'), 10_000)

    await expectNoA11yViolations(page, 'portal: billing, back from a completed checkout')
    await context.close()
  })
})
