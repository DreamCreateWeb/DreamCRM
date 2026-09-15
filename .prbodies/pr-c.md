## The gap it closes

`e2e/portal-billing.spec.ts` names it in its own header: the money journey walks
a patient up to the Stripe hand-off, through the outage branch, and back from a
completed checkout — and "does not exercise `finalizeBalancePaymentFromSession`
(which needs Stripe and is `.catch`-swallowed on that path by design, **with the
webhook as the real backstop**)".

The webhook is not the redundant path. It is the **reliable** one: the success
page finalizes only if the patient's browser comes back, so a patient who pays
and closes the tab is finalized by `app/api/webhooks/stripe-connect/route.ts` or
by nothing. Every unit test around it mocks Stripe, the database, or both —
nothing had ever put a real signature in front of the real handler.

## The six cases

At the HTTP boundary of a real server against a real Postgres:

| | |
| --- | --- |
| no `STRIPE_CONNECT_WEBHOOK_SECRET` | **500** — fails closed |
| no `stripe-signature` header | 400 |
| valid signature over a *different* body | 400 |
| valid signature, timestamp 15 minutes old | 400 |
| signed event, session we hold no row for | 200 `{received:true}` |
| signed redelivery for a payment already paid | 200, and the patient's history still shows exactly one `$42.37` "Paid online" |
| signed event naming clinic A about clinic B's session | 200, nothing touched |

The 500 on the first row is deliberate and worth the review: Stripe retries a
5xx and gives up on a 2xx, so an unconfigured endpoint that **acked** would
silently discard every payment notification it received and look healthy doing
it. The 200 on the fifth row is the same rule pointed the other way.

The redelivery case is checked through the portal's **own billing history**
rather than with a query — a second payment row, a doubled amount, or one
knocked back to "Processing" are all things the person who paid would read
there first.

## What a green run does NOT earn

Stated in the spec header and in `docs/E2E.md` rather than left to be assumed:
**it does not prove a pending payment can be walked to paid.** That step
re-reads the session *from Stripe* on purpose — the webhook body is not trusted
about whether money actually moved — and there is no Stripe in this harness.
Faking one would mean a test double inside the app's own runtime, which is a
bigger and more fragile thing than the gap it closes. The positive write keeps
its coverage in `tests/shop/finalizer-notify.test.ts`.

## The second server, and why the fake key is an assertion

`scripts/e2e-harness.sh` now starts a second `next start` on `E2E_PORT + 1` —
same build, same database, two environment variables different.

It cannot be one server. `stripe.webhooks.constructEvent` is an **instance**
method, so with no `STRIPE_SECRET_KEY` the lazy Proxy in `lib/stripe.ts` throws
before any signature is checked and *every* delivery returns 400; nothing past
the signature could be walked. But putting a key on the main server would break
the contract the harness's `unset STRIPE_SECRET_KEY` protects —
`portal-billing.spec.ts` asserts what a patient sees when Stripe is down, and a
server holding a key answers that by opening a socket to api.stripe.com. **The
existing boundary is untouched.**

**The fake key is the tripwire, not a risk.** Every case stops at one of the
finalizer's pre-Stripe returns (no matching row, or a row already paid), so a
regression that walks past one reaches for `sk_test_e2e_not_a_real_key`, fails,
and the route answers 500 — which is precisely what makes the idempotency and
tenant-boundary assertions capable of failing. It is also why the fixture is
**two** clinics: the cross-tenant case aims an event naming the clinic that HAS
a connected account at a session id owned by the clinic that does not, so a
finalizer that lost its org filter would find the row, reach for the account of
the org named in the event, and trip the wire.

## Classification

**Test-only → merges on green.** Riskiest file in the diff is
`scripts/e2e-harness.sh`. Checked against `scripts/review-gate.mjs` by hand:
`deploy-path` lists `scripts/db-migrate.mjs`, `scripts/migrate.mjs` and
`scripts/setup-cron-schedules.sh` by name, not `scripts/**` — the E2E harness
runs on a runner against a throwaway Postgres and touches no production path.
Nothing else in the diff is on any rule: `e2e/**`, `scripts/e2e-seed.mjs`,
`tests/guards/**`, `docs/E2E.md`. No product code changes.

Cost to the `e2e` check: one extra `next start` boot (health-checked, torn down
by the existing trap) on an already-built tree.

## Checks

- `pnpm typecheck` clean; `tests/guards/` 249 passed, including
  `e2e-seed-scopes.test.ts` with the new scope and `e2e-doc-axe-count.test.ts`
  over the `docs/E2E.md` edit.
- **The signature helper was verified against the real verifier, locally**, not
  assumed: the spec spells Stripe's wire format out by hand (`t=…,v1=HMAC-SHA256
  of "<t>.<payload>")` rather than borrowing the SDK's test helper, because a
  helper that signs with the same code that verifies would still pass if both
  halves broke in step. Run through `Stripe.webhooks.constructEvent`:
  - correctly signed → accepted, `checkout.session.completed` /
    `kind: balance_payment`;
  - tampered body → `No signatures found matching the expected signature…`;
  - 15-minute-old timestamp → `Timestamp outside the tolerance zone`.
- `e2e/axe-baseline.ts` gains one stop at `color-contrast: 1`, on the same
  reasoning (and with the same note) as the three money-journey stops already
  entered that way: it is the same page and the same muted-ink pair in a
  *quieter* state — no balance, so no pay form — which can only mean the same
  violation or fewer. If it is really zero the run's own shrink warning says so.
- **Red run: on CI, not here.** The browser harness needs Linux + Postgres and
  does not run on this machine, so the two tripwire cases are being proved the
  only honest way available — a scratch branch with the defects reintroduced in
  `lib/services/balance-payments.ts` (the org filter dropped, the paid
  short-circuit dropped), watched red, then thrown away. Result posted on
  DREAMCRM-48 before this merges; if either case comes back green, the spec is
  what gets fixed.

Part of DREAMCRM-48 (test-lane batch, item 3 of 4).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
