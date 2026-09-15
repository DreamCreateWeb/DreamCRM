Three small, unrelated, evidenced defects from the `docs/RELEASE.md` Part 5 ledger, batched at the DREAMCRM-55 planning meeting. Each has its own entry and its own verdict; nothing here is a refactor.

## 1. `submitIntakeForm` had no rate limit

It was the last public clinic-site action without one — written up rather than fixed alongside the card scanner (DREAMCRM-32) because it spends nothing, so it is not the scanner's defect. What it is, is an unauthenticated WRITE: every call inserts a `form_submission` row **and** fires `submitForm`'s `intake_submitted` notice to the org's owners and admins, so a script could bury a clinic's submissions list and their inbox together, for free, for as long as it liked.

**The decision the ledger flagged was the NUMBER, not whether to have one**, and it is sized against the legitimate traffic rather than against the other actions here:

- A clinic's waiting-room iPad and its front-desk machines sit behind **one egress IP**, so a per-IP cap on intake caps a whole practice at once. The failure mode is turning away a real patient at the desk, which is worse than the flood.
- **A packet is N submissions, not one.** `form_packet.formIds` has no cap and the flow submits each form independently — a "New Patient Packet" is realistically 6–10, most of them one-tap consents that go through in seconds. One parent completing packets for two children is already 20.

So: **40 per 10 minutes**, where the other public actions here sit at 3–8 per 5–10. Three people working through a ten-form packet on the same waiting-room wifi is 30 and still fits; an unbounded flood becomes 240/hour per IP. The comment says out loud that the right response to a real practice hitting this is to RAISE it. It runs first, ahead of the template lookup, and `checkRateLimit` already fails OPEN so a limiter outage never stands between a patient and their forms.

## 2. `discardUnstartedOrder` could not clean up its own `!session.url` path

That throw fires one line after the id-stamp UPDATE, so `stripe_checkout_session_id` was set, the cleanup's `IS NULL` predicate matched nothing, and the phantom `pending` order stayed in the clinic's Orders list — **with the shopper's single-use promo code locked to it for the full 24h reservation TTL**, because the survivor lookup then correctly read "not gone". Two symptoms, one predicate.

The ledger asked that the predicate's reasoning be re-earned rather than the predicate simply dropped. Re-earned, and it does not survive:

- It never did the job the comment credited it with ("cannot collide with the finalizer's lookup key"). The case it would have to catch is `sessions.create` succeeding and the id-stamp UPDATE then throwing — which leaves the column NULL and was deleted anyway.
- The guarantee is, and always was, **"no URL was ever handed out"**: the only caller is the catch block, which rethrows instead of returning, so the patient is never sent to the hosted page and the session can never be paid.
- The **coupon release** is re-derived against the wider delete, as three exhaustive cases in the doc comment: deleted → release; never written (the insert failed after the claim) → release; still there → which, with the session id no longer narrowing the delete, can only mean *no longer pending*, so the code stays held. The survivor lookup is what decides that, not the predicate.

Same choice, same reason, as `discardUnstartedBalancePayment` (DREAMCRM-20), which was deliberately built without this predicate and whose test already documented the shop's copy of it as the thing that stranded the shop. Both money paths now share one rule.

## 3. The legacy `billing_profiles` vanity write

`upsertBilling` was the table's only writer and nothing read it back for billing. `getBilling`, the two dead server actions behind them (`saveBilling`, `changePlan`) and their input schemas go with it — none had a caller left.

Worth more than dead-code removal: **`changePlan` took a plan name straight from its caller and wrote it**, so any signed-in user could set `billing_profiles.plan` to `'enterprise'`. That bought them nothing while nothing read the column, and it was one `select` away from self-serve plan escalation for whoever later wired a read to the near-identical table name. The truth is the org-scoped `clinic_profile` (`planTier`, `subscriptionStatus`), written by the Stripe webhook and read through `getTenantContext`.

The TABLE stays. Dropping it is a migration on the deploy path against rows the retired single-tenant Plans UI left behind, so it is queued in `docs/POST-1.0.md` rather than riding along with a correctness slice.

## Tests — each watched failing against the real defect

- `tests/intake-forms/submit-rate-limit.test.ts` (new, 5). Removing the limit fails four; shrinking it to 8/5min fails the cap assertion alone, which is the point of asserting the number.
- `tests/shop/checkout-stripe-outage.test.ts` — three new shop cases. **The first red run passed two of them while the defect was live**: the mock DB returned `deleteReturn` for any WHERE at all, so it could not see a predicate that matched nothing. The delete mock now evaluates `IS NULL` against whether an UPDATE stamped the column, and all three fail with the predicate restored. §2d's "the mutation that finds something is the second one" in miniature.
- `tests/billing/no-billing-profiles-write.test.ts` (new, 4). Three mutations run against the tree: the restored `upsertBilling`, a bare `db.select().from(schema.billingProfiles)` in `billing.ts`, and the write spelled through the raw table name. It fails on a **READ** as well as a write, deliberately — a read arriving is the risk, because it would give those stale rows a meaning they never had.

Full suite green: **7,976 passed**, 3 skipped. `typecheck`, `lint` and `build` clean.

## Deploy path / money risk note

Touches `main`, so it is a production release on merge. No migrations.

**Money — item 2 widens a DELETE on `shop_order`.** It can only ever reach a row this call minted (`eq(id, orderId)`, 10 random bytes, never reused), in the one situation where the call throws rather than returning a URL, and `status='pending'` still keeps a paid or refunded order out of reach entirely. No money moves on either path: the no-URL session cannot be paid, because the URL never left the function. Item 3 removes a write only; no money path read or wrote that table. Item 1 is a public write surface, not a money surface.

**Nothing a user can see changes**, other than the new refusal sentence a patient would read only if they tripped the intake cap.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
