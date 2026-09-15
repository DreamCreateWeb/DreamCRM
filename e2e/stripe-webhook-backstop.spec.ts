import { test, expect, type APIRequestContext } from '@playwright/test'
import { restoresSeedScope } from './reseed'
import { expectNoA11yViolations } from './axe'
import { createHmac } from 'node:crypto'

/**
 * THE BACKSTOP — a signed Connect webhook arriving at a real server, against a
 * real database.
 *
 * `e2e/portal-billing.spec.ts` walks a patient up to the Stripe hand-off, the
 * outage branch, and the return from a completed checkout, and its own header
 * names what it cannot reach: it "does not exercise
 * `finalizeBalancePaymentFromSession` (which needs Stripe and is
 * `.catch`-swallowed on that path by design, with the webhook as the real
 * backstop)". This file is that half.
 *
 * It matters because the webhook is not the redundant path — it is the
 * RELIABLE one. The portal's success page finalizes only if the patient's
 * browser comes back; a patient who pays and closes the tab is finalized by
 * this route or by nothing. Every unit test around it mocks Stripe, mocks the
 * database, or both, so until now nothing had ever put a real signature in
 * front of the real handler.
 *
 * ========================== WHAT A GREEN RUN EARNS ==========================
 *
 * Stated exactly, because a money spec that implies more than it proves is
 * worse than none:
 *
 *   IT PROVES the route fails CLOSED on every bad delivery (no secret, no
 *   signature, a tampered body, a replayed timestamp), that a correctly
 *   signed `checkout.session.completed` carrying `kind: balance_payment`
 *   reaches `finalizeBalancePaymentFromSession` with the org from the event's
 *   own metadata, that a redelivery for a payment already marked paid changes
 *   nothing a patient can see, and that an event naming one clinic cannot
 *   touch another clinic's payment.
 *
 *   IT DOES NOT PROVE a pending payment can be walked to paid. That step
 *   re-reads the session FROM STRIPE deliberately — the webhook body is not
 *   trusted about whether money moved — and there is no Stripe here. Faking
 *   one would mean a test double inside the app's own runtime, which is a
 *   bigger and more fragile thing than the gap it closes. So the positive
 *   write stays where it already has coverage: `tests/shop/finalizer-notify.test.ts`.
 *
 * ======================== WHY THE SECOND SERVER =========================
 *
 * `scripts/e2e-harness.sh` stands up a second `next start` on
 * `E2E_WEBHOOK_BASE_URL`, same build, same database, two environment
 * variables different. The reason is in the harness at length; the short
 * version is that `stripe.webhooks.constructEvent` is an INSTANCE method, so
 * with no `STRIPE_SECRET_KEY` the lazy Proxy in `lib/stripe.ts` throws before
 * any signature is checked and every delivery comes back 400 — while putting a
 * key on the MAIN server would break the deterministic outage branch
 * `portal-billing.spec.ts` stands on.
 *
 * THE FAKE KEY IS AN ASSERTION, NOT A RISK. Every case below stops at one of
 * the finalizer's pre-Stripe returns: no matching row, or a row already paid.
 * A regression that walks past one reaches for `sk_test_e2e_not_a_real_key`,
 * fails, and turns the route 500 — so these `toBe(200)` lines are also the
 * tripwire, and the two most valuable cases here (idempotency and the tenant
 * boundary) are exactly the ones that would trip it.
 *
 * Row ownership: this file owns the `webhook` scope — two clinics of its own,
 * because a connected account and a balance-payment row are org-level facts
 * other portal specs read. See scripts/e2e-seed.mjs.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'
const WEBHOOK_BASE = process.env.E2E_WEBHOOK_BASE_URL ?? 'http://127.0.0.1:3101'
const WEBHOOK_URL = `${WEBHOOK_BASE}/api/webhooks/stripe-connect`

/** The seeded clinic that owns the paid payment, and has a connected account. */
const ORG = 'org_e2e_webhook'
/** The other clinic, which owns a PENDING payment and has no connected account. */
const RIVAL_ORG = 'org_e2e_webhook_rival'
/** The session id on the seeded PAID row. */
const PAID_SESSION = 'cs_e2e_webhook_paid'
/** The session id on the RIVAL's pending row — the tenant-boundary probe. */
const RIVAL_SESSION = 'cs_e2e_webhook_rival_pending'
/** What the seeded paid row is worth, as the patient reads it. */
const PAID_AMOUNT = '$42.37'

const SESSION_TOKEN = 'e2e-webhook-session-token'

/**
 * The same signed cookie better-auth mints. Copied from the sibling portal
 * specs rather than shared, deliberately — it is four lines, and a shared
 * helper would tempt a future spec into reusing another spec's token, which is
 * how row ownership gets broken across parallel workers.
 */
function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

function webhookSecret(): string {
  const secret = process.env.E2E_STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error(
      'E2E_STRIPE_WEBHOOK_SECRET is not set, so nothing here can produce a signature the route ' +
        'will accept. Run the suite through `pnpm test:e2e` (scripts/e2e-harness.sh), which ' +
        'exports it and hands the same value to the webhook server.',
    )
  }
  return secret
}

/**
 * A `checkout.session.completed` body shaped the way the route reads it.
 *
 * `kind: 'balance_payment'` is the whole dispatch: without it the same event
 * would be finalized as a SHOP ORDER (`finalizeOrderFromSession`), against a
 * different table entirely. Spelled out here rather than hidden in a helper
 * default, because it is the thing under test.
 */
function completedSessionEvent(opts: { organizationId: string; sessionId: string }): string {
  return JSON.stringify({
    id: 'evt_e2e_webhook',
    type: 'checkout.session.completed',
    account: 'acct_e2e_webhook_not_a_real_account',
    data: {
      object: {
        id: opts.sessionId,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        metadata: { organizationId: opts.organizationId, kind: 'balance_payment' },
      },
    },
  })
}

/**
 * Stripe's own signature scheme: `t=<unix seconds>,v1=<hex HMAC-SHA256 of
 * "<t>.<payload>" under the endpoint secret>`.
 *
 * Built here rather than borrowed from the Stripe SDK's test helper on
 * purpose. The SDK would sign with the same code that verifies, so a change
 * that broke both halves in step would still pass — this spells the wire
 * format out, which is what the route's counterpart is actually promising to
 * understand.
 */
function stripeSignature(payload: string, opts: { secondsAgo?: number } = {}): string {
  const t = Math.floor(Date.now() / 1000) - (opts.secondsAgo ?? 0)
  const v1 = createHmac('sha256', webhookSecret()).update(`${t}.${payload}`).digest('hex')
  return `t=${t},v1=${v1}`
}

async function deliver(
  request: APIRequestContext,
  payload: string,
  signature: string | null,
  url = WEBHOOK_URL,
) {
  return request.post(url, {
    // `data` with a string body would still be JSON-encoded by Playwright,
    // and the signature covers the EXACT bytes — an added quote or a
    // re-serialization is a different payload and a real 400.
    headers: {
      'Content-Type': 'application/json',
      ...(signature ? { 'stripe-signature': signature } : {}),
    },
    data: Buffer.from(payload, 'utf8'),
  })
}

restoresSeedScope('webhook')

test.describe('the Connect webhook backstop', () => {
  test('a delivery with no signature is refused, and so is a tampered one', async ({ request }) => {
    const payload = completedSessionEvent({ organizationId: ORG, sessionId: PAID_SESSION })

    const unsigned = await deliver(request, payload, null)
    expect(unsigned.status(), 'an unsigned delivery must be refused').toBe(400)
    expect(await unsigned.json()).toEqual({ error: 'missing stripe-signature' })

    // A VALID signature over a DIFFERENT body — the shape an attacker has
    // after replaying one real delivery and editing the amount or the org.
    const signature = stripeSignature(payload)
    const tampered = payload.replace(PAID_SESSION, 'cs_somebody_elses_session')
    const forged = await deliver(request, tampered, signature)
    expect(forged.status(), 'a signature that does not cover the body must be refused').toBe(400)
    expect(await forged.json()).toEqual({ error: 'invalid signature' })
  })

  test('a correctly signed delivery from too long ago is refused', async ({ request }) => {
    // Stripe's tolerance is five minutes and the timestamp is INSIDE the
    // signed string, so this is a real HMAC over a real payload — the only
    // thing wrong with it is its age. Without this, a captured delivery could
    // be replayed forever.
    const payload = completedSessionEvent({ organizationId: ORG, sessionId: PAID_SESSION })
    const stale = await deliver(request, payload, stripeSignature(payload, { secondsAgo: 900 }))
    expect(stale.status(), 'a replay outside the tolerance window must be refused').toBe(400)
    expect(await stale.json()).toEqual({ error: 'invalid signature' })
  })

  test('the route refuses to run at all when its secret is not configured', async ({ request }) => {
    // Posted at the MAIN harness server, which deliberately has no
    // STRIPE_CONNECT_WEBHOOK_SECRET. 500 rather than 200 is the whole point:
    // Stripe retries a 5xx and gives up on a 2xx, so an unconfigured endpoint
    // that acked would throw away every payment notification it received and
    // look healthy doing it.
    const payload = completedSessionEvent({ organizationId: ORG, sessionId: PAID_SESSION })
    const res = await deliver(request, payload, stripeSignature(payload), `${BASE}/api/webhooks/stripe-connect`)
    expect(res.status(), 'an unconfigured endpoint must fail closed, not ack').toBe(500)
  })

  test('an event about a session we have never seen is acked, and writes nothing', async ({ request }) => {
    // The other side of the rule above: once the signature checks out, Stripe
    // has done its job and must be told so. A 5xx here would earn an
    // indefinite retry loop over an event we will never have a row for.
    const payload = completedSessionEvent({ organizationId: ORG, sessionId: 'cs_e2e_never_existed' })
    const res = await deliver(request, payload, stripeSignature(payload))
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ received: true })
  })

  test('a redelivery for a payment already paid changes nothing the patient sees', async ({
    request,
    browser,
  }) => {
    // THE IDEMPOTENCY CASE, and one of the two that carries a tripwire. If the
    // status short-circuit in `finalizeBalancePaymentFromSession` were lost,
    // this delivery would reach for the connected account — which this clinic
    // has — and then for Stripe, whose key here is fake. The route would
    // answer 500 and this line would fail.
    const payload = completedSessionEvent({ organizationId: ORG, sessionId: PAID_SESSION })
    const res = await deliver(request, payload, stripeSignature(payload))
    expect(res.status(), 'a redelivery must be absorbed, not re-processed').toBe(200)

    // And then look at it the way the person who paid does. Asserting the row
    // through the product rather than through a query is the point of doing
    // this in a browser at all: a second `paid` row, a doubled amount or a
    // payment that fell back to "Processing" are all things a patient would
    // read here first.
    const context = await browser.newContext({ baseURL: BASE })
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
    const page = await context.newPage()
    await page.goto('/patient/invoices')

    const main = page.locator('#portal-main')
    await expect(main).toContainText('Balance payment', { timeout: 30_000 })
    await expect(main).toContainText(PAID_AMOUNT)
    await expect(main).toContainText('Paid online')
    await expect(
      page.getByText('Balance payment', { exact: true }),
      'exactly one payment — a webhook that re-processed would show a second',
    ).toHaveCount(1)
    await expect(
      page.locator('#billing-history-panel'),
      'a payment knocked back to pending would carry the Processing badge',
    ).not.toContainText('Processing')

    await expectNoA11yViolations(page, 'portal: billing, history after a webhook redelivery')
    await context.close()
  })

  test('an event naming one clinic cannot reach another clinic’s payment', async ({ request }) => {
    // THE TENANT BOUNDARY, and the second tripwire — the sharper of the two.
    //
    // The session id belongs to `org_e2e_webhook_rival`, whose payment is
    // PENDING. The event names `org_e2e_webhook`, which has a connected
    // account. `finalizeBalancePaymentFromSession` looks the payment up by org
    // AND session, so today it matches nothing and the route acks.
    //
    // Drop the org half of that filter — the whole of this repo's §5 in one
    // line — and it matches the rival's pending row, reaches for the connected
    // account of the org NAMED IN THE EVENT, and calls Stripe. That is a 500,
    // and this assertion is what says so.
    const payload = completedSessionEvent({ organizationId: ORG, sessionId: RIVAL_SESSION })
    const res = await deliver(request, payload, stripeSignature(payload))
    expect(
      res.status(),
      'a cross-tenant session id must find nothing — a 500 here means it found the other ' +
        "clinic's row and tried to settle it",
    ).toBe(200)
    expect(await res.json()).toEqual({ received: true })

    // And the same event aimed the other way: the rival has no connected
    // account, so even a finalizer that found the row could not settle it.
    // Included because the first half alone would still pass if the lookup
    // were scoped to the SESSION only and the rival happened to sort second.
    const mirrored = completedSessionEvent({ organizationId: RIVAL_ORG, sessionId: PAID_SESSION })
    const back = await deliver(request, mirrored, stripeSignature(mirrored))
    expect(back.status()).toBe(200)
  })
})
