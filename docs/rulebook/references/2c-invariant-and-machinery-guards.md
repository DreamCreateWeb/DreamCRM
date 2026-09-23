# §2c. The money, tenancy, CI-machinery and reviewability guards inside `test`

*`dreamcrm-conventions` §2c. `SKILL.md` is the map and carries §§4, 5, 7, 9 and 10 in full.*

**The `test` check also holds two money-and-tenancy invariants at ZERO** (PR #557
/ DREAMCRM-32, merged to `main` as `80f904f4` on 2026-09-14). Both are
source scans in `tests/guards/`, both carry **named per-match exemptions with a
reason each** plus a detector that fails when an exemption stops matching
anything, and neither carries a ceiling:

- `net-refunds.test.ts` — **refunded money is subtracted from every clinic-side
  total.** `lib/net-collected.ts` is the one place allowed to add a refundable
  money column up (`patientBalancePayment.amountCents`,
  `bookingDeposit.amountCents`, `shopOrder.totalCents`), and four shapes are
  banned because they are the four the defect actually took across eight
  surfaces: a SQL `sum()` straight over the raw column, a JS `+=`, a JS
  `reduce`, and the subtraction open-coded anywhere other than the rule. A
  value is legal the moment it goes through the rule — the guard is against the
  RAW column, not against adding money up.
- `public-action-tenancy.test.ts` — **a public clinic-site action resolves its
  own tenant.** Nothing exported under `app/site/[slug]/**` may DECLARE an
  org-id parameter: everything there is unauthenticated, so a client-supplied
  organization id is not a scope, it is a choice of victim. The
  insurance-card scanner took one, and each of its calls spends real money from
  a per-clinic monthly cap. A slug, a token, or an entity id re-validated
  against the resolved org are all fine — each costs the action a lookup before
  it can act.

Both are worth reading for one shared reason: **the exemption is keyed per
MATCH, not per file.** The tenancy guard's first version excused whole files,
which swept in the insurance-card scanner along with the intake form beside it
in the same file — and putting `orgId: string,` back into the scanner left every
case green. Net-refunds has the twin story: its first draft modelled two of the
three accumulate shapes, so the end-of-batch sweep found the appointment drawer
by hand while the guard reported clean. A file-wide exemption is a door.

**These two reached this document by the sweep, not by a mention.** They changed
what can merge with nothing under `.github/` touched — the shape named above —
and the sweep that opens every intake reads `main` rather than waiting to be
told, so they were routed within hours of landing. That is not an argument that
the sweep is sufficient: it caught these the same day and it caught the axe
ratchet after three days. Mention Forge anyway.

**The `test` check also holds the CI machinery itself in place** (since
2026-09-14, #552/#553/#554/#556, plus #573 on 2026-09-15). These are ordinary
vitest guards in `tests/guards/`, so they fail a required check like any other
test — and they are the reason a workflow edit, or an edit to the harness
config, that looks harmless can turn a PR red:

- `review-gate.test.ts` — the gate list in `scripts/review-gate.mjs` must keep
  matching the tree. Four directions, and the two that bite are the ones that
  fail as the repo grows: `MUST_BE_GATED` (a curated list of files that must
  trip a named rule) and the derived rule below. It also asserts that no job in
  `review-gate.yml` can publish a check named `test` or `e2e` — asserted on the
  effective context (job key **and** `name:`), because a job keyed
  `review-gate` carrying `name: test` would satisfy branch protection with a
  green tick the real suite never produced.
- **Every file importing `@/lib/stripe` must trip the `money` rule.** Derived
  from the tree, not remembered — add a module that reaches the Stripe client
  without putting it on the gate list and `test` fails naming your file. It is
  a necessary condition, not a definition of the area: fee math, cart totals
  and the payment-plan schedule never import the client, so the word patterns
  and the curated list still carry those.
- `e2e-flaky-summary.test.ts` — pins the reporter step and the widened artifact
  condition in **all three** harness workflows (`it.each`), not just `ci.yml`.
  Delete either hunk from `nightly.yml` and the PR goes red.
- `e2e-doc-axe-count.test.ts` — `docs/E2E.md` must point at
  `e2e/axe-baseline.ts` for the axe count rather than restating a number. The
  doc said 36 while the file said 18, two batches apart; the guard is what
  stops the two homes coming back.
- `axe-headroom-table.test.ts` — **new 2026-09-15** (#573 / DREAMCRM-48,
  `4d0eb2f7`). Pins the headroom reporter's wiring and its powerlessness: the
  reporter must be registered in **both** reporter lists in
  `playwright.config.ts`, `e2e/axe.ts` must emit a sample for every baselined
  rule at a stop under the annotation type the reporter reads, and the fold
  must take the worst count rather than the last. Drop the reporter from either
  list, or move the emit inside the `::warning` branch, and `test` goes red.
  The reporter itself gates nothing — **this guard does**, which is the
  distinction to hold: a reporting-only feature can still arrive with a
  blocking assertion attached to it, and this one did.
- `axe-baseline-ratchet.test.ts` — **in the suite since #588 merged**
  (`62acd835`, 2026-09-15), widened the same day by #595 (`3b9d1dd7`). It pins
  every ceiling in
  `e2e/axe-baseline.ts` against its value on `origin/main`, failing any increase,
  counting an entry absent from `main` as a raise from zero. Its opt-out list
  `e2e/axe-baseline-raises.ts` is graded on both sides — the raise must match an
  entry exactly (`from`/`to`, no rounding in your favour), **and** the entry must
  still describe the live tree, so a stale pardon fails `test` rather than going
  on pardoning. The comparison needs a fetched `origin/main`, which is why four
  jobs gained a step (§2a, the census note); delete that step from any workflow
  and the guard goes red rather than quiet — on **every** event, because the
  premise and the comparison are two assertions with two scopes and only the
  comparison is scoped off `push` or `schedule` (both are runs where HEAD is
  already on `main`; `schedule` only ever runs from the default branch). §2a has
  the reasoning, the race it avoids, and the general rule.
  Its mutation pass left two lessons, both written up in §2d and both now rules
  in `docs/GUARD-MUTATION-PASS.md`: **a prefix is not a name** (nine mutations
  red, the tenth GREEN — `A11Y_BASELINE_V2` aliased past an `indexOf` marker) and
  **assert the answer, not a proxy for it** (a test that grepped the gate's
  source for a filename stayed green when the pattern was deleted, because the
  filename survived in a comment).
- `axe-exclusion-premise.test.ts` — **in the suite since #594 merged**
  (`a90c6f64`, 2026-09-15). It pins the WIRING of the two axe-side exclusion
  checks: `test` goes red if `expectNoA11yViolations` stops calling either the
  dead-exclusion detector or the premise detector, so neither can be quietly
  unhooked from the harness while its own unit tests go on passing. It is a
  vitest guard rather than a Playwright one for a reason worth knowing before
  you write the next self-test: `expectNoA11yViolations` reports through
  `expect.soft`, and a soft failure marks the provoking test failed regardless
  of what it asserts next — so a spec that PROVOKES a violation in order to
  check the reporting cannot also pass. Same answer `axe-headroom-table.test.ts`
  gives one lane over. **A hand-watched red run is evidence; the vitest guard is
  the invariant** — do not read either bullet as saying the production path is
  under permanent test.
  Its review caught a hole in the guard itself, which is the §2d numeric-literal
  trap below: the ceiling pin was `toContain('const PICTURE_SCALE_CEILING_PX =
  12')`, which `= 120` satisfies. Now `toMatch(/… = 12(?![\d.])/)`, with the
  `= 120` mutation watched red and green on restore.
- `rulebook-drift.test.ts` — **in the suite since #571 merged** (`3ae1f612`,
  2026-09-14). The claims above that need no network — the workflow census, which
  workflows may publish a required context, the `GATE_RULES` area list — are now
  assertions on **every PR**: add a workflow file, or an area to the review gate,
  and `test` goes red until the claim moves in the same PR. It also pins that
  `rulebook-drift.yml` never runs on a `pull_request` and can never publish a
  `test` or `e2e` context, and it perturbs every claim so each must be SEEN to
  fail. What it still cannot see is the #534 shape — a new class of assertion
  inside `test` or `e2e` moves none of the facts it grades — so the fast-moving
  half of the intake rule is still the sweep and the mention. Do not let this
  bullet stand in for a guard that does not grade assertions.
- `rollout-check.test.ts` — **on the PR, not on `main` yet** (#639 /
  DREAMCRM-86, opened 2026-09-22). It pins the deploy job's rollout
  verification: that the step exists, that it cannot be made
  `continue-on-error`, and that `ROLLOUT_SINCE` is written to `$GITHUB_ENV`
  **before** `codebuild start-build` rather than after it. **It is the first
  guard here whose subject is the ORDER of two lines inside one shell step**,
  and the order is the whole assertion — a baseline taken after the build
  starts sits on the far side of the rollout it is meant to precede, so the
  check would adopt the PREVIOUS deploy's operation and certify that. Every
  other machinery guard above asks whether a thing is PRESENT; this one asks
  WHERE it is. Carry that shape to the next wiring guard: presence is the cheap
  half, and a guard that only asks "is it there" passes a workflow that has
  been reordered into uselessness. The mutation pass moved the line rather than
  only deleting it, which is what earned the claim (§2d).
  It also holds the repo's one deliberate green-while-unverified path NARROW.
  The degrade is keyed to authorization errors alone, so a throttle, a timeout,
  a missing service, a bad ARN or an unparseable response is a hard failure —
  and `AccessDeniedExceptionV2` does not match `AccessDeniedException`, which is
  §2d's a-prefix-is-not-a-name trap answered before it fired rather than after.
  `ROLLBACK_SUCCEEDED` is a FAILURE, looked up by exact key: a substring test on
  `SUCCEEDED` is the same trap one identifier over, and it is the exact status
  the 2026-09-21 incident most likely wore. An unrecognised status, no rollout
  at all, and a missing baseline are each a failure rather than a wildcard.
  **An escape hatch that can only widen review-free is the thing to watch here**
  — which is why `scripts/rollout-check.mjs` went onto `GATE_RULES` under
  `deploy-path` in the same PR.

**The `test` check also holds every tracked file REVIEWABLE** (#603,
`5322a489`, DREAMCRM-66, merged 2026-09-15). `tests/guards/control-bytes.ts` is
the scanner and `control-bytes.test.ts` the `git ls-files` walk: **no tracked
text file may carry a raw C0 control byte other than tab, LF and CR.** It is the
widest assertion in the suite — every tracked file, 2,751 of them, `docs/**`
included — and the first one here that grades files nobody would call code.

- **What it prevents.** A `NUL` anywhere in a file's first 8000 bytes makes git
  call the blob binary, and the file then renders in every diff view as
  `Binary files … differ` with a `-  -` line count. #588 shipped
  `tests/guards/axe-baseline-ratchet.ts` with a `NUL` at byte 7636 — all 13,413
  bytes of the axe ratchet's comparator invisible in its own PR, on a path that
  routes to intake rather than to a reviewer, so a later weakening of that
  ratchet would have been unreviewable by construction.
- **It is not a carelessness rule, which is why it is a check and not a note.**
  The byte arrives on its own: prose or source quoting an escape or an ANSI
  colour regex loses its backslash somewhere on the way to disk. Three
  independent reproductions in `docs/` inside one afternoon (`docs/RELEASE.md`
  lost a word to a raw `0x08` while recording this very lesson), then nine more
  control bytes landed in the guard's own two new files as they were being
  written.
- **When it fires, escape the byte — do not reach for an exclusion.** `\u0000`,
  `\x1b`: identical string value, zero behaviour change. #603 carried seven such
  sites across three files in the same PR (three composite map-key separators in
  `lib/services/acquisition.ts`, four ANSI colour regexes in
  `scripts/e2e-flaky-summary.mjs` and its test), because a guard that is red on
  arrival cannot land. Ship the escapes and the guard together, escapes first.
- **Its three design decisions are rules for the next tree-wide guard, not facts
  about this one, and they live in §2d**: do not re-derive the tool's own cutoff,
  derive exclusions from content rather than from a path list, and never let the
  tool whose blind spot IS the defect be the instrument that gates.

The defect, the byte offsets and the reproductions are in the module header of
`tests/guards/control-bytes.ts` and in the `docs/RELEASE.md` Part 5 entry (now
`FIXED (#603, 5322a489)`, reconciled by #605 — §1). Read those, not a retelling
here.

**The `test` check also holds a DORMANT TABLE at zero — in BOTH directions**
(#606, `71e2992a`, DREAMCRM-58, merged 2026-09-15).
`tests/billing/no-billing-profiles-write.test.ts` walks `app`, `lib`, `scripts`
and `components` and fails on any INSERT, UPDATE, DELETE **or SELECT** naming
`billing_profiles` — through the Drizzle symbol or through the raw table name,
which is how a guard on the symbol alone gets walked around. `lib/db/schema/domain.ts`,
the definition, is the only file allowed to say the name at all.

**The read half is why this is a new CLASS and not another scanner.** Every
other entry on `blocking-assertions` bans a way of WRITING something: a native
dialog, a retired tone, an unescaped JSON-LD string, a plan gate. This one also
bans reading, because the rows the retired single-tenant Plans UI left behind
only become dangerous once something reads them. `billing_profiles` is
user-keyed legacy from the single-tenant template; the truth about a clinic's
plan is the org-scoped `clinic_profile` (`planTier`, `subscriptionStatus`),
written by the Stripe webhook and read through `getTenantContext`. The one write
the table had was reachable from a `'use server'` action that took the plan name
from its caller, so any signed-in user could set `plan` to `'enterprise'` — which
bought them nothing while nothing read the column, and was **one `select` away
from self-serve plan escalation**. So the defect this guard exists to prevent is
not the write coming back on its own. It is a READ arriving to meet it.

**The rule to carry to the next table this team stops using: a retired table may
be referenced by NOTHING AT ALL, and that is a different kind of zero from "no
product code writes X".** When you retire a table, answer both questions — what
may write it, and what may read it — and say which zero you mean in the guard's
name and in its failure message, because the next person standing over a dormant
table will not think to look under a write rule. Dropping the table is the other
answer and usually the better one; this one could not take it yet, since the drop
is a migration on the deploy path and the rows are whatever the legacy UI wrote,
so it is queued in `docs/POST-1.0.md` (§1). The guard holds the line until the
migration can run.

The defect, the three mutations and the red run are in the module header of
`tests/billing/no-billing-profiles-write.test.ts` and in the `docs/RELEASE.md`
Part 5 entry. Read those, not a retelling here.

`docs/CI.md` is the single home for the mechanics — read it before changing a
workflow, and update it in the same PR rather than restating it here.

## The machinery guards this rulebook had never named

*Forge's intake, 2026-09-23 (DREAMCRM-114), and the reason the guards census in
§2 exists.* Measured on `main` at `66d087dc`: `tests/guards/` held 34 files and
this document named 23 of them by their own file name. **The eleven below could
each fail a stranger's PR and none of them appeared anywhere in the rulebook.**
Three had been quietly miscounted as present because a SCRIPT or a workflow of
the same stem was named — `migration-check` is the live example, where
`scripts/migration-check.mjs` and `migration-check.yml` are both written up at
length in §2a and §3 while the guard holding them in place was not. That is
§2d's identity-looseness family pointed at this document's own bookkeeping, and
it is why the census matches on the FULL file name rather than on the stem.

Nine of these are written up below and all eleven are now covered by that
census, so this list cannot go eleven short again without `test` saying so. The
other two — `no-native-dialogs.test.ts` and `server-only-services.test.ts` —
were already described in §2d and only needed their citations written as file
names rather than as stems.

- `cron-auth-shared.test.ts` — **the `CRON_SECRET` gate, and its adoption.**
  Every `/api/cron/*` route and the `/api/admin/*` one-shots sit in the
  middleware public-path allowlist, because EventBridge has no session. So the
  only thing between the open internet and "email every patient", "run the
  migrations" or "reseed the demo org" is one bearer check. It used to be 25
  hand-rolled copies of the same string compare — non-constant-time, so it
  leaks the secret prefix by prefix through response timing, and 25 chances to
  forget the fail-closed branch on the next route. The durable half is the
  ADOPTION assertion: a new route that hand-rolls the guard again fails `test`
  by name. Read it as the shape to copy when a security primitive gets
  consolidated — consolidating is the easy half, and the guard is what stops
  the 26th copy.
- `read-check-catalog.test.ts` — **the catalog IS the security argument.**
  `/api/admin/read-check` is defensible only because the SQL it runs cannot come
  from the caller: on a leaked `ADMIN_READ_SECRET` an attacker gets exactly
  these entries and nothing else. The guard pins the properties that claim rests
  on — ids unique and looked up EXACTLY (a trailing space, a case flip,
  `__proto__` and `toString` all resolve to nothing), no bind placeholder and no
  template interpolation in any entry's SQL, every entry a single statement
  starting `select`, with no semicolon and no write verb. **The day somebody
  adds a parameter "just for this one check", it fails a required check instead
  of passing review on a reviewer's attention.**
- `migration-check.test.ts` — **a failed migration must not deploy green**
  (DREAMCRM-46). The check itself runs against production and cannot be
  exercised in the suite, so what this pins is everything the check is MADE of:
  the ledger comparison, the wording of its three verdicts, the catalog entry
  that supplies the answer, the read-only grant without which that entry errors
  instead of answering, and the wiring that lets a red result reach the deploy
  run. Its comparison tests are named after the DEFECT SHAPES rather than after
  cases — a batch rolled back, an entry skipped for being out of order,
  production running ahead of the commit — which is §2d's rule that a test name
  states the case it actually exercises, applied well.
- `one-mrr-number.test.ts` — **recurring revenue comes from Stripe**
  (DREAMCRM-23). The tier-to-price map existed in THREE copies, and one of them
  priced premium BELOW pro, so two platform dashboards reported different MRR
  from the same tenants and neither matched what any clinic was charged. A
  hardcoded tier-to-price map anywhere under `app`, `lib` or `components` fails.
  `lib/stripe-config.ts` is allowed because it is about what we ASK for, and MRR
  is about what clinics actually pay, which only Stripe knows — **that is the
  distinction to carry, not the allowlist entry**. Its allowlist also carries
  the rulebook's favourite kind of comment: a REMOVED entry, with the reason it
  was removed and an instruction not to put it back.
- `timestamp-aggregate-mapping.test.ts` — **an aggregate over a timestamp
  column keeps that column's driver mapper.** A `timestamp` column has no zone,
  so drizzle's mapper reads the driver's text as UTC; a bare `sql` expression is
  not a column, gets no mapper, and the same text is then parsed in the HOST's
  zone. Same string, different instant. **This is the class that is invisible to
  every ordinary test here**, because production is UTC and `vitest.config.ts`
  pins `TZ=UTC` — it surfaces on somebody's laptop or in a future non-UTC
  runtime. Its scope is stated rather than implied: the scan keys on the two
  aggregate helpers BY NAME, so a `coalesce()` or a `least()` that drops the
  mapper identically is NOT covered, and that boundary is written in the guard
  rather than left to be inferred as a guarantee.
- `ops-clinic-site-url.test.ts` — **the production watch sweep's target URL is
  assembled, not typed.** The sweep loads one real clinic site every 30 minutes
  and the only place it can learn which one is `docs/OPS.md`, because a clinic
  slug is production data and nothing else in the repo carries it. A URL written
  by hand in prose rots the moment either half moves — the demo slug or the
  production host — and then the sweep quietly checks a 404 and reports the site
  is down, or checks nothing at all. So the doc's URL must be derivable from the
  two constants that are actually true, and moving either one tells you to move
  the doc in the same PR. **A silent alarm pointed at the wrong address is §2a's
  "a check that cannot fail is not a check" in its most ordinary clothes.**
- `e2e-flaky-digest.test.ts` — **the weekly digest that COUNTS what the per-run
  reporter could only name** (DREAMCRM-105, #684). Six load-bearing properties,
  four of them general enough to copy: a repeat offender is counted in RUNS
  rather than occurrences (forty records from one run is one runner having a bad
  afternoon); the digest LEADS WITH ITS CENSUS, because "nothing flaked" and "I
  read nothing" otherwise print the same headline; it fails CLOSED on a lookup
  that did not return, an artifact that exists and could not be read, or a
  window with no browser runs at all; and the producers' artifact retention is
  graded AGAINST the window, so an eight-day window over seven-day artifacts
  cannot quietly become a permanently red alarm — which §2a forbids outright.
  The last block drives the script as a process, because every assertion above
  it can pass while `main()` reports nothing.
- `e2e-past-visit-window.test.ts` — **a fixture that has to be past in the
  CLINIC's calendar, not in UTC.** The staff-day spec completes a past visit
  through the `past_30d` chip, whose window ends at the clinic-local day start;
  the E2E clinics are `America/New_York`, and a seed placing the visit one UTC
  day back is TODAY in New York for the four hours between 00:00 and 04:00 UTC.
  The visit was genuinely past, the chip's window genuinely excluded it, and the
  spec went red on the clock alone — nightly, until the seed moved to two days
  back. It reads the offset out of the seed script rather than restating it, and
  it runs in the ordinary vitest suite with no database and no browser,
  **because the point is to fail in the two minutes before a merge rather than
  in the E2E job four hours a night.**
- `e2e-reschedule-settled-signal.test.tsx` — **a PENDING action must not
  satisfy a "the action finished" assertion** (DREAMCRM-21). The portal
  reschedule spec moves a visit, waits for the move to settle, reloads, then
  asserts the durable truth; the wait in the middle is load-bearing, and it used
  to be "the Move my visit button is gone" — which looks like a settled signal
  and is not, because the accessible name changes on the CLICK while the request
  is still in the air. Three full-suite runs failed on a loaded box, three
  isolated runs passed, and `retries: 1` absorbed it, which is how it survived.
  The guard pins BOTH halves: the component behaviour the spec's wait depends
  on, and the spec's own wording. **Carry the shape: a browser assertion whose
  premise is a component's behaviour can be pinned in vitest, and the E2E job is
  the wrong place to learn that an E2E assertion is vacuous.**

- `rulebook-publish.test.ts` — **the publisher's verify, verified**
  (DREAMCRM-128, §2's fifty-seventh entry). `scripts/rulebook-publish.mjs` is the
  only thing between `main`'s `docs/rulebook/` and the copy of
  `dreamcrm-conventions` in the Multica skill store that every agent actually
  opens, and it cannot be a required check — verifying needs a credentialed
  `multica` CLI, so a version of it running here would report GREEN without
  reaching its subject. This file is the half that does live in the gate. It
  perturbs all four of the publisher's predicates and watches each redden (the
  byte compare on a SAME-LENGTH one-character change, which is the 2026-09-14
  shape a length check passes); it runs the publisher's preflight over the real
  `docs/rulebook/**`, which is what puts the inverse-of-the-defect mojibake
  detector over the authored copy as well as the published one; and it asserts
  that `docs/RELEASE.md` R5 still names the command, because a release gate
  whose only record is a sentence can be deleted by anybody tidying a
  paragraph. It also grades the WRITE path's precondition — that the tree being
  published IS `origin/main`, iterating BOTH collections so a file missing from
  the tree is caught rather than silently deleted from the store — which is the
  half §2's entry records as having been paid for twice: once for the rule and
  once for the precondition's own missing eyes. **What it cannot cover
  is whether the store matches `main` right now** — nothing without a credential
  can know that, and the evidence for that claim is a `--verify-only` run
  recorded on an issue, owed again at R5.

## The pricing page quotes the billing config — PRICE PROVENANCE, graded

`tests/marketing/pricing-price-source.test.tsx` (#620, `e9c58e44`, merged
2026-09-16). **The first guard in this repo that grades where a rendered NUMBER
came from.** DREAMCRM-38 is the defect it exists for: three surfaces had each
drifted to quoting the $500 list price for a plan that costs $200, and the fix
was `getQuotedPlan()` — every surface that displays the price resolves it there
instead of copying the number. The public pricing page, the loudest of those
surfaces, went on holding its own copy of all four numbers until move 6.

**Two assertions, because either alone proves nothing.** Both were watched fail
against the real pre-move-6 page rather than a synthetic one (§2d):

1. **The page FOLLOWS the config.** Mock the plan to numbers no literal in the
   repo could coincidentally match, and check the page renders those. An
   equality check against *today's* config is deliberately not the test — a page
   that merely happens to agree today passes that one.
2. **No plan price is spelled as a literal under the pricing route.** This is
   what catches the drift arriving BACK. A `$200` typed into a new paragraph
   agrees with the config on the day it is written, so assertion 1 stays green
   through the entire life of the defect and goes red only at the reprice —
   which is the moment the page is already wrong in production.

**The split between them is not the one you would guess, and that is the
transferable part.** The old `price-card.tsx` held the numbers as
`const LIST_MONTHLY = 500` with no dollar sign and printed them through
`toLocaleString()`, so the SOURCE SCAN saw nothing wrong with the file that was
most wrong and named only the FAQ prose. Assertion 1 is what caught the card.
Neither half is the other's safety net; they see different halves of one defect.

It carries the dead-exclusion premise check too — the #587 / #594 family in its
fourth pointing: a test that the route still holds money literals which are NOT
the plan (Open Dental's ~$30 API fee, the $20 add-on), because **a scan that has
stopped finding anything looks exactly like a clean one.**

**It fired neither intake derivation, owed no §3 review, and is owed an entry
here anyway** — the #610 ruling, worked through in §2.

### THE INVARIANT — defined on DREAMCRM-100, IMPLEMENTED on DREAMCRM-102

*Forge's intake, 2026-09-22 (DREAMCRM-100), from Sentinel's `RELEASE.md` Part 5
entry S3 raised in review of DREAMCRM-38. Intake before implementation was the
meeting's explicit ordering, so what follows is the RULE; the implementation is
DREAMCRM-102 (Quinn).*

**IMPLEMENTATION STATE: MERGED.** #665 (`c8a0f094`, 2026-09-22 20:46:28Z,
Sentinel APPROVE WITH NOTES) landed the rule; #676 (`6709e799`, same day)
answered the five review notes and is a CASE on it rather than a new rule.
`PRICE_QUOTING_ROUTES` is **gone**. §2's blocking-assertions list carries the
full intake argument as its FORTY-FOURTH entry, with #676's three changes
written up beneath it.

**The rule as it stands on `main` today**, which is what you are subject to:

- **Eyes.** `tests/marketing/plan-price-literals.ts` derives its field of view
  from `git ls-files` over `app`, `components` and `lib` — bare roots, so a new
  top-level division is graded the day it is created. 1,345 tracked
  `.ts`/`.tsx` files at the time of writing, and the count moved 1,342 → 1,345
  between the PR head and `main` with no edit to the guard, which is the whole
  point of deriving it.
- **Subject.** The four values come from `getQuotedPlan()` at run time, never a
  copy. A reprice moves what the guard looks for.
- **Spellings, three.** A `$`-prefixed literal; a bare CADENCE (`200/mo`,
  `200 a month`, `2,000 per year`); and an ASSIGNMENT to a price-shaped name
  (`const LIST_MONTHLY = 500`, `price={200}`). `nameIsPricey` matches a WORD,
  split on the camel/snake boundary — not a substring, so `fee` inside
  `FEED_PAST_DAYS` and `rate` inside `generate` are innocent.
- **The band skip**, structural: two numbers joined by a dash on ONE line, the
  far end money-shaped. It pardons 8 sites on `main`, every one a competitor or
  tool-stack band, and it is what lets `/compare` sit INSIDE the field of view
  instead of being a file-shaped hole.
- **The allowlist**, four per-MATCH entries, each anchored to a substring that
  must still be on its line and each carrying its sentence. A DEAD allowance —
  one that has stopped pardoning anything — fails.
- **Measured on `main`: 0 offenders, 0 dead allowances.**

**One latent gap, known and open** (Forge, 2026-09-22, reproduced at intake):
the band's far-end test cannot see a comma-thousands number, because it asks for
a `$` followed by a digit or three CONSECUTIVE digits and `\d{3}` will not cross
the comma in `2,000`. A competitor band with our price on the LOW end and a
thousands number on the high end — `$200-2,000/mo`, `$500-1,500/mo` — is graded
rather than pardoned, and would fail `test` naming an innocent line. Nothing is
red today: the live `$800-2,000/mo` in `lib/prospect-product-knowledge.ts`
survives only because 800 is not a plan price and its `2,000` is pardoned from
the other direction, where the pattern *does* tolerate a comma. **The two
directions disagree about what a price looks like.** The fix is one character
class, never an allowlist entry.

**What follows is the rule as it was SPECIFIED, before the implementation, and
it is kept because the argument is the durable part** — particularly part 4,
which is what decided that a competitor band is not our price. The census
numbers below are the pre-fix tree and are historical.

**The invariant: the plan's price exists once, in `lib/stripe-config.ts`.
Everything else that says the number resolves it there.** Not "the pricing page
resolves it" — everything. The defect has now been found on ten surfaces over
four moves, and the guard above still decides what it looks at from
`PRICE_QUOTING_ROUTES`, **a hand-written list of eleven file paths** —
ten when this section was written; #660 added the eleventh the same day, and
that widening is written up in §2. Its own
header records the population going up "in every single move that opened a file
DREAMCRM-38 never looked at", which is a guard confessing to the §2b/§2d defect
this rulebook keeps writing up: *a guard whose field of view is a hand-kept list
drifts exactly as a revert list does.* The assertion is right. Its EYES are the
problem — §2d's reader family, in the one place where the money is literal.

**Measured on `main` at `12fc04e4`, outside the ten listed files** (scan of
`app`, `lib`, `components`, comments stripped, for `$200` / `$500` / `$2,000` /
`$5,000`, the `/mo` `/month` `a month` `per month` prose spellings, and a bare
`… = 200` on a price-shaped identifier):

- **`app/(marketing)/page.tsx` — the HOMEPAGE, ten sites**, including the
  pricing teaser rendering `$500` struck through beside `$200` as two literal
  JSX text nodes, plus the page metadata description and a hero chip. This is
  the loudest surface on the site and the guard has never been able to see it.
- **`lib/marketing/comparisons.ts` — twenty sites.** The same registry shape as
  `docs.ts`, which is already on the list, and eight times the population.
- **`lib/prospect-product-knowledge.ts` — seventeen sites**, prose a model reads
  back to a prospect in our voice.
- **`app/g/[token]/report-view.tsx` — two sites**, a page a prospect reaches
  from a link.

None of these resolves anything from `lib/stripe-config.ts`.

**Read that census against ELEVEN listed files, not ten** (Forge, 2026-09-22,
19:0x intake). #660 (`53c8bd23`, DREAMCRM-101) added `lib/services/marketing-blog.ts`
to `PRICE_QUOTING_ROUTES` after the measurement above was taken at `12fc04e4`. It
changes nothing in the four surfaces named — the added file is not one of them, and
the numbers still stand — but it is the list growing again, in exactly the move
point 3 below says should have deleted it instead. It is also the proof of point 3
in the sharpest form yet: the defect #660 fixed was a RANGE (`$150–500`), which
neither of this guard's assertions could see even with the file listed, because
`$150` is nobody's price and the `500` carries no dollar sign. **The list grew and
the guard still could not have found it.** A human writing a ledger entry did.

**What the invariant has to say to be implementable, in four parts:**

1. **The subject is a PLAN price, not a number.** `$200`, `$500`, `$2,000`,
   `$5,000` today; the four values come from `PLANS`, never from a copy in the
   test. A reprice must move the guard's subject automatically or the guard
   retires itself the day it is needed most.
2. **The spellings include prose.** `$200/mo`, `$200 a month`, `$200 per
   month`, `200/month`, and the dollar-signless `const LIST_MONTHLY = 500` that
   the original source scan walked straight past — §2b's identity-looseness
   family, in money.
3. **The field of view is DERIVED, not listed** — `app`, `lib` and `components`
   entire, with `PRICE_QUOTING_ROUTES` deleted rather than extended. §2d is
   explicit that an exclusion is derived from what identifies the SUBJECT and
   never from the property the check itself grades, and it is equally explicit
   that a declared vocabulary costs a review to widen while nobody pays to
   forget one.
4. **The allowlist is REASONED, entry by entry, and each entry carries the
   sentence that makes it not-a-plan-price.** This is the part that decides
   whether the rule survives, because the tree genuinely contains numbers that
   are not our price and a guard that fires on them is a guard somebody turns
   off (§2d). The four classes found in the census:
   - **`lib/stripe-config.ts`** — the one home. Exempt by definition.
   - **Competitor and market BANDS.** `'$200–350/mo'` for a booking vendor,
     `$800–$2,000/mo` for a tool stack, `$150–500 a month` in an archived blog
     post. The low end of the first is the same integer as our rate TODAY and is
     not our price at all. `/compare` is already off the current list for exactly
     this reason, argued on the rule's field of view rather than on cost — read
     that paragraph before widening. **A range is the discriminator that does
     the most work**, and it is structural rather than nominal.
   - **Non-plan money on a pricing surface** — Open Dental's ~$30 API fee, the
     $20 social add-on. Already discriminated by the existing extractor; that
     logic is the part worth keeping when the eyes are replaced.
   - **Published external copy that is historically fixed.** Archived blog posts
     state what was true when published. Whether that is an exemption or a
     defect is a CONTENT decision, not a guard decision. The post at
     `/blog/dreamcrm-is-live` still opens with "for $150–500 a month" and is
     being corrected on DREAMCRM-101, which settles this instance and leaves
     the class open.

**Two things the implementation owes beyond a green run.** First, the
two-assertion split above is not optional and does not transfer: assertion 1
(the page FOLLOWS the config, proved against a mocked plan) is what catches a
file that resolves the number through arithmetic, and assertion 2 (no literal)
is what catches the drift arriving back. Widening the eyes changes assertion 2
only. Second, a price that is an **input to a calculation** is the worst shape
this rule has caught — `lib/recall-roi.ts` divided by `PLAN_PRICE_MONTHLY = 200`,
so a reprice would not have made the page stale, it would have made its
break-even arithmetic wrong — and a derived scan finds those only if part 2's
dollar-signless spelling is in it.

**A red run here is a red `test` naming a file** (§2, rule-3 false-positive
cost), so the allowlist is where the care goes, and the remedy for a false
positive is to narrow the predicate — never to register the file.

---

**The `test` check also holds the PUBLIC CLINIC SITE's per-request cost and its
cache-invalidation phase** (DREAMCRM-90, PR #654, merged
2026-09-22 as `34ed75e7`). Two guards, and
they are in §2c rather than §2b because neither grades a colour: one holds a
COST at zero, the other holds a money path from being truncated. §2's
blocking-assertions list carries them as entries 35 and 36 with the intake
argument; what follows is the rule itself.

- `tests/clinic-site/layout-reads-the-cache.test.ts` — **no layout under
  `app/site` opens its own database query.** A layout renders on every page
  beneath it, so a query there is one round trip per page view of an entire
  clinic site, forever, for every visitor. The load-sanity run
  (`docs/LOAD-SANITY.md`) is what makes that concrete rather than tidy:
  `/site/[slug]` saturated at concurrency 8 while `/pricing` scaled cleanly, so
  the ceiling was per-request work. **This is the first guard in the repo whose
  subject is a COST rather than a way of writing something** — `db.select()` is
  correct everywhere else, and what makes it wrong here is the multiplier, not
  the call. When you write the next one of these, the docblock owes the
  multiplier: *renders once per page beneath it* is the whole argument, and
  without it the rule reads as arbitrary and gets exempted away.

- `tests/clinic-site/no-render-phase-invalidation.test.ts` — **nothing a Server
  Component can reach may call the STRICT clinic-site invalidator.** Next throws
  E7 on `revalidateTag` during a render, and `lib/services/clinic-site-cache.ts`
  deliberately rethrows everything except "no request scope" — a design this
  rulebook endorses, because an invalidation that silently did nothing is a
  cache that is quietly wrong. The consequence is that a render-reachable call
  site **truncates the function it sits in.** The guard walks the import graph
  transitively from all 228 page / layout / template roots, stopping at
  `'use server'` / `'use client'`, and grades the 939 modules that remain. Its
  three blind spots — module- rather than function-granular, the `'use server'`
  directive read from the first 400 bytes, and silence about the other phases
  Next refuses in — are written beside the `INTAKE_RULES` entry as well as in
  the test, and all three fail in the safe direction.

**The defect that produced the second one is the transferable part, and it is a
money defect wearing cache clothing.** `syncSubscriptionFromStripe` has two
callers: the Stripe webhook, and — by design, so activation does not hinge on
webhook timing — the `/settings/billing` landing a clinic returns to from
Stripe Checkout. That second one is a **render**. An `await
invalidateClinicSiteForOrg(...)` placed mid-function threw there, and the throw
ate the rest of the function: `enforceSocialConnectionCap` never ran, so a
clinic dropping from the full-Premium trial to a smaller plan **kept social
connections the platform is billed for**, and `syncCheckoutSuccess` logged a
successful activation as a failure. Caught in review on a branch; nothing
shipped.

**Three things fixed it and the rulebook wants all three, because any one alone
is an edit away from the same bug:** a named render-tolerant variant
(`invalidateClinicSiteForOrgUnlessRendering`, with `tolerateRender` opt-in so
E181 / E306 / E1127 still surface from both variants); **the call moved to the
END of the money function, after enforcement** — the structural half, worth
having even with the tolerance, because cache bookkeeping in the middle of a
money path can truncate it for a reason nobody has thought of yet; and the guard
above, which is what found the second instance (`publishWebsiteDraft`, one
page-level import away) that the author had not.

**Do not read the tolerant variant as permission to wrap an invalidator in a
blanket `catch`.** That is the exact pattern `clinic-site-cache.ts`'s doc
comment exists to forbid, and it leaves behind a call site that always refuses,
invisibly. A named variant says which caller and why; the guard stops a second
one appearing.

**AND THE INSTRUMENT LESSON, which is §2d's and belongs in front of it:** this
survived a green suite because `chrome-writers-invalidate.test.ts` asserted the
paying direction by **grepping `billing.ts` for the invalidator's name.** The
name was present. The call threw. **A guard that asserts a call EXISTS has
asserted nothing about whether it RUNS** — a source-text assertion cannot see
the phase a call executes in, and that is a blind spot no amount of careful
regex closes. The replacement drives the real `revalidate()` through Next's own
async-local stores at `phase: 'render'`, asserts E7, and then feeds *that actual
error object* to our catch, with an action-phase control and an E181 case
proving the tolerance did not become a blanket catch. **When the property is
about execution rather than about text, drive the real thing.** (One operational
note carried so it is not rediscovered: happy-dom has no `AsyncLocalStorage`, so
Next's shim returns a fake whose `run()` throws E504 — the global is installed at
module scope, before Next captures it.)

**PR #651 gave `tests/guards/read-only-role-revokes.test.ts` a BENIGN
exemption** (DREAMCRM-89, `48fa9271`, merged 2026-09-22): `notifications.dedupe_key`,
with its reason, beside `campaigns.automation_key` — the identical class, a
deterministic dedupe key rather than a credential. **A CASE on an existing rule,
not a rule** — no new assertion class, no widened pattern, no new field of view.
Recorded here rather than left implicit because §2's list is per-file and cannot
tell a new assertion inside a registered file from an edit to an old one, and
because a case-only intake still owes a named section: this one. The false-alarm
it exposed in `carriesIntake` — a case has no NEW section to name, and the sweep
demands one anyway — is worked through in §2.

**THE ONE LATENT GAP ABOVE IS CLOSED — #686, `53586aaa`, 2026-09-22
23:49:47Z (DREAMCRM-105).** The band's two ends were graded by different rules
and nobody chose that: `MONEYISH` wanted three CONSECUTIVE digits, and a
thousands separator breaks a run of them, so `$800-2,000/mo` (ours at the far
end) was pardoned while `$200-2,000/mo` (ours at the NEAR end) read as a plain
quote of our rate — a red `test` naming a competitor's number on `/compare`,
the page whose whole job is printing somebody else's prices. Closed with
`\d[\d,]*\d\d` rather than the tempting one-character `[\d,]{3}`, which grades
three CHARACTERS and would have quietly falsified the comment above it. Watched
to fail in both directions: the new case returns `[200]` against the old
predicate and `[]` against the new one. **Latent when it was closed, and that
was the point** — §2d's remedy for a false positive is to narrow the predicate
and never to register the file, and the moment to do that is before an innocent
line is in front of somebody with a red `test` behind it.
