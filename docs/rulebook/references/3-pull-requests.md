# §3. Pull requests

*`dreamcrm-conventions` §3. `SKILL.md` is the map and carries §§4, 5, 7, 9 and 10 in full.*

- Deliver work as PRs, not direct pushes.
- The PR title carries the issue key: `DREAMCRM-<n>: <what changed>`.
- No closing keyword (`Closes` / `Fixes`) unless the issue really should
  auto-close on merge.
- Small, reviewable batches beat one large PR.
- Call out explicitly in the PR description when a change:
  - touches the deploy path (`.github/workflows/deploy.yml`, migrations, boot);
  - touches money — fees, payouts, payment plans, loyalty, carts — with an
    explicit risk note;
  - changes anything a user can see.

## The pre-merge review gate

A change that touches **money** (fees, payouts, payment plans, loyalty, carts),
**tenant scoping**, **auth or token surfaces**, **DB migrations**, **CI workflow
files** (`.github/workflows/**`), **branch-protection or required-check
settings**, or the **deploy pipeline** must be reviewed by Sentinel before it
lands.

CI workflow files and branch-protection settings are on that list because they
are the gate every other gate stands on: a workflow file decides which checks
run, and branch protection decides which ones can be skipped. Weaken either and
every rule above it is enforced on paper only. PR #517 edited a workflow file review-free by riding along in a UI-polish
PR, and the DREAMCRM-19 branch-protection flip went in with no PR to review at
all.

**Since 2026-09-14 (#553) the list also lives in the repo.**
`scripts/review-gate.mjs` holds `GATE_RULES` — **nine** areas as path patterns
with a `why` on each: the seven above, plus two the prose list never named.
`read-checks` (the production read-check catalog — `lib/read-checks.ts`,
`app/api/admin/read-check/**`, `scripts/readonly-role.sql`) arrived with the
catalog itself in #565, because a follow-up PR adding one entry matched nothing
on the list and reported *merges on green*. `check-definitions` arrived with #572
and is the same argument one level in: `.github/workflows/**` names the
JOB, and `vitest.config.ts`, `playwright.config.ts`, `e2e/axe.ts` and
`scripts/review-gate.mjs` name the WORK inside it — which specs run, with what
retries, which accessibility violations the harness is told to ignore, and which
PRs reach a reviewer at all. (A fifth pattern, `scripts/rulebook-drift.mjs`,
arrived with #571 on 2026-09-14 — it holds the transcription of §2's claims, so
loosening it is the same kind of edit. A sixth, `e2e/axe-baseline-raises.ts`,
arrived with #588 / DREAMCRM-60 on 2026-09-15 (`62acd835`), and it is the
sharpest case on this list: every entry in that file is an argued RAISE of an
axe ceiling, a required check being told to tolerate more than it did yesterday.
Note what it is NOT: `GATE_RULES` gained a pattern, not an area, so the count
below is still nine and `rulebook-drift.test.ts` — which grades the area list —
stayed green through it, correctly.
The baseline file itself stays off every list on purpose; §2 has the reasoning.
A seventh, `scripts/review-sweep.mjs`, arrived with #593 / DREAMCRM-61 later the
same day (`9c96b0b7`) and is the same shape again — a pattern, not an area, so
the count below is still nine. It decides which merged PRs get reported as
having skipped a review, and the edit that breaks it is the quiet one: widen what
counts as "satisfied" and the sweep goes on running green every morning while
seeing nothing.) **An exclusion is the one edit to a gate that can only ever make it
looser, and it leaves no trace under `.github/`.**

**`GATE_RULES` is the source of truth for the gate's areas; prose follows it,
never the reverse.** Chair's ruling on DREAMCRM-45, 2026-09-14, under
bias-to-action. The enumeration running one area ahead of the prose is the right
direction rather than a defect — add the pattern the day you find the hole, and
do not wait for the list above, or the project description's list, to catch up.
When the two disagree, the enumeration is right and the prose is behind: fix the
prose.

That says which way to fix a disagreement. It does not license leaving one. An
area that reaches `GATE_RULES` and never reaches this section is a rule only a
file-reader knows, so it routes to Forge the same day (§2). **Since #571 merged
(2026-09-14) that hop has a guard under it**: `tests/guards/rulebook-drift.test.ts`
grades `GATE_RULES`' area list against the claim in `scripts/rulebook-drift.mjs`,
so adding an area turns `test` red until the claim moves in the same PR. It grades
the transcription, not this prose — keeping the two equal is still Forge's hop,
which is why every drift finding names the section to open. The project description's list is the owner's own copy and only he
edits it, so that half goes up as an FYI rather than sitting here as a silent
disagreement — `read-checks` and `check-definitions` are exactly that gap today,
**nine** areas in the repo against seven in the project description.

And `review-gate.yml` runs it against every
PR's file list, writes a job summary naming the area and the reason, and adds
or removes the `needs-sentinel-review` label. Read it when you are unsure
whether a file is on the gate: it is the enumeration, and it is kept honest by
the guards in §2.

**The gate list covers the gate's own machinery, through `check-definitions`
rather than `ci-workflows`.** `scripts/review-gate.mjs` — this list's own
subject, the thing that decides which PRs reach a reviewer at all — is on the
`check-definitions` patterns and pinned in `MUST_BE_GATED` to that rule.
Deleting an area from the gate list is the one edit in this repo that weakens a
control while telling its author nothing is at stake, which is why it is
covered at all. (#571 proposed moving the same coverage onto `ci-workflows`; it
merged without that move, so the answer to "which rule catches a change to the
gate script" is still `check-definitions` — with `scripts/rulebook-drift.mjs` now
beside it on the same patterns and in `MUST_BE_GATED`.)

Two things it is not:

- **It does not gate.** Advisory by construction — no required context, no
  `needs:`, and the label step is `continue-on-error`. It reports that a review
  is *owed*; it cannot observe whether one *happened*. **Something else does
  now, after the fact** — `review-sweep.yml` (#593, 2026-09-15) reads the label
  it wrote against the record on the merged PR. That is a morning alarm, not a
  second gate: it cannot hold a merge either, and the step below that puts the
  verdict on the PR is what makes it able to tell the two apart at all.
- **A clean result is not an exemption.** The list is a policy enumeration and
  the day it is slightly wrong it is wrong quietly — its first version reported
  "merges on green" on refunds, order totals, revenue and the token routes that
  let patients see their appointments without signing in. You still classify by
  the riskiest file in the diff yourself. If the check misses something that
  should be on it, fix the pattern in the same PR and add the file to
  `MUST_BE_GATED`.

**The `money` rule reaches the money UI, not only `lib/**`** (widened with #559,
`b3147d96`, 2026-09-14). Until batch 60 it was `lib/**` plus the two Stripe
webhooks, so a diff containing the button that *fires* a partner payout was
reported "merges on green" — found by Sentinel reviewing a PR whose author had
already classified it correctly by hand, which is the machine half telling the
next author the opposite. It now also covers the money server actions
(`app/(default)/shop/**/actions.ts`, `app/(default)/payments/**/actions.ts`,
`app/(default)/partners/**/admin-actions.ts`, `app/(partner)/**/actions.ts`),
`app/(portal)/patient/invoices/**`, and two named client surfaces:
`partners/delete-partner-modal.tsx` and `partner/partner-payout.tsx`. The shop
and payments trees are deliberately **not** on it wholesale — they are mostly
presentation, and gating every UI-polish PR on them would put the gate in the
way often enough to get it routed around. Practical effect on the UI lane: a
"design-system-conformant UI polish" PR no longer merges on green if its diff
touches either of those two components. That is classify-by-riskiest-file
working, not a technicality.

**And it reaches the PATIENT-FACING half of the same test** — added on round 2
of the #559 review and never written down here until now, which is why the
enumeration is the source of truth. The first pass applied "gate where money is
SET IN MOTION" only to the staff route groups; these meet it exactly and are
`actions.ts` FILES rather than trees, so they cost a UI-polish PR nothing, which
was the whole objection the trees raised. On the rule today:
`app/site/[slug]/shop/actions.ts` (`startCheckout` plus the `applyCoupon`
discount arithmetic — carts), `app/site/[slug]/membership/actions.ts`
(`startMembershipCheckout`, a recurring charge), `app/i/[token]/actions.ts`
(`startPlanSetupAction` — payment plans, on a token-is-auth landing),
`app/b/[token]/actions.ts` (a patient-supplied `amountCents`, bounds-checked in
that file), `app/(default)/billing/activate/actions.ts`
(`createActivationCheckout`) and `app/(onboarding)/actions.ts` (provisions the
plan tier at signup).

**The booking deposit joined that half** (#599, `23d8214e`, 2026-09-15).
`app/site/[slug]/actions.ts` matched nothing, so a PR changing what a patient is
charged to hold an appointment reported *merges on green* —
`submitBookingRequest` prices the clinic's per-visit-type deposit through
`visitTypeDepositCents` and opens a Stripe Checkout session for it via
`createBookingDepositSession`. Its two siblings above were already on the rule
for that reason; this one was missed on the pass that added them. Pinned in
`MUST_BE_GATED` as `money`. Arrived the way #569's did and for the same reason it
is recorded here: found by its author while fixing an unrelated defect in the
same file, widened in that PR rather than deferred, and routed on merge day
rather than left for the enumeration to carry alone.

Note what it is NOT, and why that does not discharge the hop: `GATE_RULES`
gained a PATTERN, not an area, so the count stays **nine**,
`tests/guards/rulebook-drift.test.ts` — which grades the area list — stayed green
through it, correctly, and `scripts/rulebook-drift.mjs` needed no edit. A green
drift check says nothing about a pattern. **That is an argument for routing a
pattern widening by hand, not against it** — nothing in the repo will carry one
here. §2's intake half fires on what a change does to the gate, regardless of
which file it lives in.

**The `money` rule reaches the clinic's OWN subscription** (DREAMCRM-97, PR #663,
opened 2026-09-22, Rio). `app/(default)/settings/actions.ts` matched nothing, so a
PR changing how a clinic buys, cancels, swaps or adds to the plan it pays us for
reported *merges on green* — while `app/(default)/billing/activate/actions.ts`,
which opens a Stripe checkout for the same clinic two files away, was already on
the rule. That file holds `startStripeCheckout` (a Checkout session, or an
in-place price swap with proration when the clinic already has a live
subscription), `openBillingPortal` (the surface that cancels the subscription and
changes the card), `cancelSubscriptionAction` / `reactivateSubscriptionAction`,
and `buySocialAddonAction` (a paid subscription item). **The
`lib/services/*billing*.ts` pattern covers the SERVICE those call and never the
ACTION that decides to call it**, which is why the sibling being on the rule did
not cover this one. Read it as the quiet-wrong case rather than a near miss: the
primary purchase path in a subscription business reported safe while the
secondary one was gated.

The file rather than `app/(default)/settings/**`, on the shop and payments trees'
own reasoning: the settings tree is overwhelmingly presentation, and gating it
wholesale is the objection those trees already raised and won. An `actions.ts`
FILE costs a UI-polish PR nothing.

**STATE: MERGED — `a5166156` (#663), 2026-09-22 20:29:06Z.** Pinned in
`MUST_BE_GATED` as `money` in the same PR, and live now: a PR touching that file
is a money PR and owes Sentinel a review. Written down before the merge on the DREAMCRM-60 precedent §2 sets
out — write it down early, say what state it is in, and own the flip; the flip is
Forge's at the next sweep, not the author's. And note what it is NOT, for the same
reason #599's entry does: `GATE_RULES` gained a PATTERN, not an area, so the count
stays **nine**, `tests/guards/rulebook-drift.test.ts` stayed green through it,
correctly, and `scripts/rulebook-drift.mjs` needed no edit. That is the argument
FOR routing a pattern widening by hand — nothing in the repo will carry one here.

**The `money` rule reaches the NETTING RULE'S OWN HOME** (DREAMCRM-122, PR
opened 2026-09-23, Rio). `lib/net-collected.ts` matched NOTHING, so a PR
changing whether refunded money comes out of a clinic's totals reported *merges
on green* — while `lib/services/refunds.ts`, which WRITES the refund truth that
file reads, has been on the rule since the first pass. This is the widest reach
of any file added to this rule: `sumNetCollectedSql` is in the collections
header, the revenue figures, the reconciliation pages and the patient timeline
at once, so a one-line change to `netCollectedCents` moves every "collected"
number in the product at the same time. §2c holds the invariant at zero
tolerance and `tests/guards/net-refunds.test.ts` fails any clinic-side money
total summed without going through it — the rule was graded and the file that
IS the rule was not gated.

**Two independent reasons nothing caught it, both worth knowing.** There is no
money word in the filename, which is what the word-pattern list is built on.
And it does not import `@/lib/stripe` — it is pure arithmetic plus a Drizzle
SQL fragment, deliberately client-safe like `lib/mrr.ts` — so the derived
one-hop check in `tests/guards/review-gate.test.ts`, which found eleven files
by asking the tree who reaches Stripe, structurally could not see it either.
**A file can be money without touching Stripe**: this one decides what a number
MEANS rather than moving a charge, and the ledger it corrects is the clinic's
own reconciliation.

It arrived the way #569's, #599's and #663's did and is recorded here for the
same reason: found by its author while making an unrelated change in the same
file (the ⌘K refund note), widened in that PR rather than deferred, and routed
by hand on merge day rather than left for the enumeration to carry alone.

**STATE: MERGED — PR #711, `f8c642da`, 2026-09-23 13:01:48Z.** Pinned in
`MUST_BE_GATED` as `money` in the same PR. Written down before the merge on the
DREAMCRM-60 precedent §2 sets out — write it down early, say what state it is
in, and own the flip; the flip is Forge's at the next sweep, not the author's.
Note what it is NOT: `GATE_RULES` gained a PATTERN, not an area, so the count
stays **nine**, `tests/guards/rulebook-drift.test.ts` stays green through it,
correctly, and `scripts/rulebook-drift.mjs` needs no edit. Nothing in the repo
will carry a pattern widening here, which is the argument for routing one by
hand.

**The `auth` rule reaches the demo-context minter** (widened with #569,
`498a2cda`, 2026-09-14). Beside `lib/session.ts`, `lib/auth/context.ts`,
`middleware.ts`, `app/(auth)/**` and `app/api/auth/**`, the rule now also matches
`app/(default)/ecommerce/customers/admin-actions.ts` — the file holding
`enterDemoMode`, which writes the `demo_context` cookie that `getTenantContext`
reads **ahead of** real organization membership. That cookie decides which
organization the whole app renders as, for seven days, so a PR changing which
clinic a platform admin can become was reporting *merges on green*. Pinned in
`MUST_BE_GATED` as `auth`, because the path says "ecommerce customers" and
nothing about auth — which is exactly why a rule built on words in filenames
missed it. Two things worth copying from how it arrived: it was found by its
author while fixing a different defect in the same function and widened in the
same PR rather than deferred, and it was flagged for review and routed here the
day it merged rather than left for the enumeration to carry alone. The practical
effect: a change to which organization a platform admin can become is no longer
a change the machine calls safe.

**The `deploy-path` rule reaches the post-deploy migration assertion** (#575,
`1d426787`). `scripts/migration-check.mjs` decides whether a deploy is allowed
to report success, so loosening it is a deploy-path change even though it runs
after the deploy rather than during it. Pinned in `MUST_BE_GATED`; §2's entry
for `migration-check.yml` covers what it actually asserts.

The `tenant-scoping` rule is the one to read carefully: it is a single pattern
(`lib/db/index.ts`) standing in for an area that actually lives across ~190
files in `lib/services/**`. Its own `why` says so. A clean result there is not
coverage — `tests/tenant-scoping/**` is the real enforcement.

**Reviewing those settings is one thing; deciding them is Sentinel's too.**
Ruled 2026-09-14 on DREAMCRM-31: when the question is how much escape hatch to
leave — the admin bypass, who may skip a required check, how strict is too
strict — Sentinel recommends, then applies his own recommendation and posts
what changed in plain English. It does not go up to the owner; he ruled that he
never pushes directly himself, so either answer serves him and the call is
Sentinel's. §8 carries the closed list of what does go up.

First exercised the same day on DREAMCRM-40: the admin bypass, closed — see §2.
A settings change has no diff, so the rationale comment **is** the review record
and carries the before/after table. That is what lets §2 state what binds today
without anyone re-opening the GitHub settings page.

Request a review by commenting on your issue with the PR link and this mention:

```markdown
[@Sentinel](mention://agent/030cc8a2-06a9-415d-a419-e8d5d7c01969)
```

- Merge after `APPROVE` or `APPROVE WITH NOTES`.
- On `REQUEST CHANGES`, fix and re-request.
- **The verdict gets written onto the PR before it merges** — see below; this
  step is new since 2026-09-15 and it binds everyone who merges a gated PR.
- Test-only, docs-only, and design-system-conformant UI-polish PRs merge on green
  without review.
- **A gate-affecting settings change with no PR still gets reviewed.** Branch
  protection and required-check settings have no diff to hang a review on, so
  post the review request on your issue instead: what you changed, from what to
  what, and why. "There was nothing to review" is how the last one skipped the
  gate. §2 draws the line between the settings this covers and the merge-only
  settings that are intake without a review.

### The verdict is written onto the PR before it merges (new 2026-09-15, #593)

Sentinel's verdicts live on Multica issues. **GitHub cannot see them**, and on
the day this was written **not one merged PR in the repository carried a GitHub
review or a verdict comment** — including #575, #579 and #580, which were
genuinely reviewed. From the outside, a PR that went through review and a PR
whose author forgot looked exactly alike, and that is not a reporting nicety: it
is why #573 and #582 could merge owing a review with nothing noticing until
somebody went looking the next day.

So one line lands on the PR itself:

```bash
gh pr comment <n> --body "Sentinel review: APPROVE — <link to the verdict comment>"
```

**The reviewer records it; the merger confirms it is there before merging.**
That split is Sentinel's, from his review of #593, and the reasoning is the part
to carry: the first draft put the obligation on the merger, who is *exactly the
person whose memory already failed twice* — the premise of the whole problem. An
obligation placed on the party the failure is about is not a fix. Sentinel now
posts the line when he gives a verdict, so author memory is out of the reviewed
path entirely and the merger's check is a backstop rather than the primary. What
is left unsatisfied is then the #573/#582 shape only: a PR that never reached a
reviewer at all.

**And the verdict comment mentions the PR's author** (new 2026-09-22,
DREAMCRM-91). The line above is a *record*; a record is not a *wake-up*. Quinn on
DREAMCRM-81 and Vesper on DREAMCRM-62 each had an approved PR sit unmerged
because the `APPROVE` landed after the author's run had already ended — four PRs
between them, all four caught by Rio's ops sweep, which is a sweep doing a
wake-up's job at the cost of a sweep plus a re-run instead of one wake.

So the verdict comment on the issue carries the author:

```markdown
[@Author](mention://agent/<id>) — verdict above.
```

**Scope it to the verdict itself** — `APPROVE`, `APPROVE WITH NOTES`,
`REQUEST CHANGES` — and to nothing else. A mention enqueues a paid run, which is
exactly right for "your PR is clear to merge" and exactly wrong for a discussion
reply, a clarifying question or a follow-up remark. The mention rides the
**Multica** verdict comment, which is where the author's next run starts; the
mirrored line on the PR is the GitHub-side record and GitHub cannot dispatch
anybody. Two artefacts, two jobs — do not collapse them.

It blocks nothing and it is prompted where you need it — the `review-gate`
summary prints the instruction, so it arrives attached to the review request
rather than living only in a document. What reads it is `review-sweep.yml`, the
morning sweep in §2a; **a missing record is the thing it reports**, so skipping
this turns a reviewed PR into a red run naming you. `docs/CI.md` owns the
mechanics under "The sweep that asks whether the review happened".


### Reviewer provenance: two lines a verdict owes (new 2026-09-22, DREAMCRM-100)

*Both from Sentinel's own account of the day's two misses. A verdict is
evidence, and evidence that does not say what it was taken against cannot be
re-checked by anyone — including the person who wrote it.*

**A verdict states the head SHA and the CI conclusion it was written against.**
Sentinel approved #657 on a check that was still running: his own fetch returned
`{"conclusion":"","name":"test"}`, he read it, and he approved anyway. An empty
conclusion is not a green one, and at a glance the two look identical — which is
the same instrument lesson §2a states for a missing run (**the SHA, not the
colour**), arriving from the reviewer's side instead of the author's. So:

```markdown
Reviewed at `<head SHA>`; `test` / `e2e` conclusion at the time of writing: <…>.
```

It costs ten seconds and it closes a hole the gate exists to prevent. Two things
it also buys, both after the fact: a verdict written against a stale SHA is
visible as stale rather than merely wrong, and a verdict written against a
still-running check is readable as provisional rather than silently counted by
`review-sweep.yml` as a review that happened.

**A reviewer's reproduction says which tree it read.** The second miss is
sharper, because it defeated a reviewer who had deliberately built an
independent instrument: both instruments read the working tree, which is **CRLF
on this machine**, while CI ships LF. **Independent of each other is not
independent of the source.** Two tools agreeing tells you nothing when they
share an input, and a shared input is the easiest thing in a reproduction to
stop noticing — it is §2d's *a guard that leans on a tool's verdict inherits
that tool's blind spot*, one level up, with the tool being the checkout itself.

State the tree in the reproduction — the platform, the line endings if they can
matter, and whether you read the working tree, the index or a clean checkout at
the head SHA. The three come apart routinely here: §2d's staged-file blindness is
the index disagreeing with the working tree, and this is the working tree
disagreeing with what CI receives. **When a result could depend on which of the
three you read, read the one the gate reads.**

**And for a PR that changes a CHECK DEFINITION or a workflow file, the green
run must be on the EXACT HEAD THAT MERGES** (new 2026-09-23, DREAMCRM-114,
Sentinel's intake, ACCEPTED as written). The two rules above are about what a
verdict says; this one is about what a verdict may CONCLUDE. "Merge on green" is
not a verifiable instruction, and this is how the pipeline broke: #685 was
approved at head `995fbf11` on a `test` success independently confirmed at
`7bc4fc77` — an ANCESTOR. The head that actually merged was never green, and
what reddened `main` was in the delta between them. Two agents then merged into
the red pipeline before anything noticed, and production shipped nothing for 77
minutes.

So for this class of PR the reviewer names the SHA rather than delegating the
check to the merger's judgement:

```markdown
`test` / `e2e` green at `<head SHA>` — merge THIS head. A new commit needs a new
green run and a re-read.
```

**Why the rule is scoped to check definitions and workflow files rather than to
every PR.** On an ordinary PR a stale-green approval is caught by branch
protection: `strict: true` forces the branch up to date and the checks re-run
before the merge button works. The class this rule covers is the one where that
backstop is the thing being edited — a change to what `test` asserts, or to the
workflow that publishes it, can be green on the parent and red on the child
while the tick on the PR page looks identical. Pair it with §2a's **read the
check NAMES, not the colour**: same family, both cases where the PR page makes
"never started" and "green" indistinguishable.


### Who reviews Sentinel's own gated PRs (new 2026-09-22, DREAMCRM-91)

Sentinel cannot be the second pair of eyes on his own diff, and until now the
gate had no answer for that. #594 (DREAMCRM-63, his) is the one entry the
post-merge sweep in §2a is still red over, and DREAMCRM-85 deliberately left it
out of scope for exactly this reason.

**Quinn reviews Sentinel-authored gated PRs.** Same verdict vocabulary —
`APPROVE`, `APPROVE WITH NOTES`, `REQUEST CHANGES` — same record written onto the
PR before it merges, same author mention above. Sentinel requests it the same way
anyone requests him, by commenting on the issue with the PR link and:

```markdown
[@Quinn](mention://agent/b145be29-5191-4073-90e3-c099c4eef643)
```

**A disagreement goes to the owner rather than being settled between the two of
them.** The author arguing the reviewer out of a `REQUEST CHANGES` is the same
missing third party this rule exists to supply.

**And when Quinn is a co-author of the same diff, it escalates to the owner
directly** — no substitute reviewer, no chain down the roster. Without that line
the rule quietly re-creates the hole it closes: the point is that nobody reviews
a diff they wrote, and a default that stops one name short reproduces the gap for
the next pair.

Note what this is NOT, so it does not get read as a sixth item on §8's closed
list: the owner here is the **reviewer of last resort**, not an approval gate.
Ordinary work still does not wait on him. This fires only when every agent who
could review the diff also wrote part of it — which is a fact about the roster,
not about the stakes.

The remediation of #594 is this rule's first application.

**Classify a change by the riskiest file in its diff, not by its headline.**
"Test-only" and "UI polish" describe PRs that touch *only* tests or *only*
conformant UI. One `.github/workflows/**` hunk, one migration, or one line of fee
math riding along in an otherwise exempt PR puts the whole PR through review —
that is precisely how #517 got in. If you find yourself arguing that the risky
file is a small part of the change, that is the gate working, not a technicality.

**And classify the diff you are about to MERGE, not the one you set out to
write.** A PR's class can change between its first commit and its last. PR #597
(DREAMCRM-62, 2026-09-15) opened as design-system-conformant UI polish —
merges-on-green by the list above — and stopped being that after the product
work was finished, when registering its new guard on the intake list put
`scripts/review-gate.mjs` into the diff and so brought `check-definitions` with
it. Nothing about the brief changed; the diff did. What caught it was a guard
going red by name rather than anybody re-reading this section, which is the
argument for re-classifying **when you push the last commit**, not when you write
the plan.

**Requesting the gate does not end your run.** After you post the mention, stay in
the run and wait for the verdict — poll the issue's comments rather than exiting
and leaving the merge to whoever happens to pick the issue up next. Then act on it
in that same run: merge on `APPROVE` / `APPROVE WITH NOTES`, or start the fix on
`REQUEST CHANGES`. A request posted and abandoned turns a review into a stall, and
the work sits finished-but-unmerged until someone notices.

**Arm a wakeup in the same breath as requesting the review** (new 2026-09-23,
DREAMCRM-114, Quinn's intake, ACCEPTED). Polling inside the run is the right
thing to do while you are still in it; a wakeup is what covers you when you are
not. Post the mention and arm the event in one step:

```bash
multica issue wakeup create <issue-id> --event comment.created \
  --filter-actor-type agent --filter-actor-id 030cc8a2-06a9-415d-a419-e8d5d7c01969 \
  --instruction-file ./wake.md
```

(That id is Sentinel's; for a PR he authored, use Quinn's — see "Who reviews
Sentinel's own gated PRs" above.)

**THE INSTRUCTION IS REQUIRED AND THE FLAG IS EASY TO LEAVE OFF.** Without it
the CLI refuses with `instruction must contain 1-12000 bytes` — which reads
like a length complaint about a string you never wrote, and is the kind of
error that sends you to the wrong end of the problem. Use
`--instruction-file` with a UTF-8 file in your working directory, for the
`## Comment Formatting` reason: PowerShell 5.1 can replace a non-ASCII
character in an inline string with `?`.

**Write it for a reader with none of today's context, because it IS the next
run's brief.** Name the PR, the conditions for merging, and everything the
verdict leaves you owing — a `STATE:` flip, a publication, the intake record
mirrored onto the PR. A wakeup whose instruction says "check the review" wakes
somebody up to re-derive what you already knew.

**The measurement this comes from:** two hand-offs stalled on one issue
(DREAMCRM-105) and both needed an ops sweep to rescue them — two paid rescue
runs where one armed wakeup would have cost nothing, and the pattern is not
specific to one agent. The verdict mention in §3 above is the reviewer's half of
the same problem; this is the author's half, and they are independent. The
mention wakes you when Sentinel remembers to write it; the wakeup wakes you
whatever the verdict comment looks like. **Arm both and neither depends on the
other holding.**

If the verdict genuinely has not arrived by the time you must stop, say so plainly
in your closing comment and leave the issue at `in_review` — awaiting a Sentinel
verdict is one of the two things `in_review` is for (see §9). What is not
acceptable is exiting silently as though the work were handed off.

The gate is about the risk the diff carries, not about who wrote it or how big it
is. A one-line change to a fee calculation goes through review; a 600-line test
refactor does not.

## A batch that introduces a new invariant ends with a sweep

An invariant is a rule that everything of some kind must now obey — "refunded
money is subtracted from the total", "every public form returns its refusal
rather than throwing". When a PR introduces one mid-batch, that rule is
retroactive: the code that merged earlier in the same batch was written, and
approved, before the rule existed.

So **the batch's last PR is preceded by one sweep of everything the invariant
touches — including what already merged in that batch — and the review request
says the sweep ran and what it covered.**

This is Sentinel's own review gap, and his proposal. He approved the Collections
total before the refund columns existed; a later PR in the same batch introduced
"refunded money must be subtracted," and nobody went back over the earlier
merges against it. Reviewing each PR correctly is not enough when the standard
moves mid-batch — those earlier approvals were right when they were given and
wrong afterwards, and only a sweep finds that.

Naming the sweep in the request is the half that matters to the reviewer: it is
what distinguishes a sweep that found nothing from one that never ran.

## Delivered means merged

A PR that is open, green, or armed with auto-merge is **not delivered**. Under
strict branch protection, arming auto-merge and walking away parks the PR the
moment anything else lands on `main`: the branch falls behind, its required
checks go stale, and it sits there indefinitely while the issue reads as
finished. That is not hypothetical — it is where the ops sweep keeps finding
completed work.

The sequence, all inside your own run:

1. Update the branch against `main`.
2. Merge it.
3. **Confirm the merge commit is on `main`** — `gh pr view <n> --json
   state,mergedAt,mergeCommit`, or find it in `git log origin/main`.
4. *Then* write the delivery summary and set the issue status.

Steps 3 and 4 are in that order deliberately. The summary asserts the work
shipped, so it has to follow the evidence that it did, never precede it. The
metric this rule exists to move: merge rescues per cycle found by the ops sweep —
currently 2, target 0.

If you must stop before that merge commit exists, say so in plain words and name
what you are waiting on. An unannounced stop at an open PR is the failure mode; a
stated one is a hand-off.

**The unannounced START is the same failure one step earlier, and it costs
more.** Post the PR link to the issue when you OPEN it, not only when it lands.
DREAMCRM-63 is the worked example: a run opened #590 at 07:54 and never said so
on the issue, so the issue read as untouched, a later run built the same change
from scratch, and #590 was closed as superseded — the whole PR paid for twice,
and the only reason anyone noticed is that both runs had the same author. The
stop rule above protects work that is finished; this protects work that is
*started*, and an issue is the only place either is visible. **Before you begin,
read the issue's comments for an existing claim; as soon as you have a branch or
a PR, put it there.** One line is enough — the link and what it covers.

Two things that do NOT substitute for it. A PR existing on GitHub is not a claim
on the issue: nobody reads `gh pr list` before starting, and the sweeps that do
read it (§2, `review-sweep.mjs`) grade MERGED PRs for a review they owed, not
open ones for whether anybody knows about them. Nor does assignment — that
routes the work, it does not report that a branch exists. The salvage rule when
it happens anyway: the superseded PR is still evidence. #590's
`unjustifiedExclusions` asked a better question than the version that shipped —
whether anything *reachable* sits inside an excluded subtree, which catches a
premise failure that contrast measurement structurally cannot — and that was
filed as a follow-up rather than closed with the branch. **Read the duplicate
before you delete it; two independent attempts at one problem is expensive, and
throwing away the half you did not ship wastes the only thing it bought.**

(Repo-side branch auto-update has been on since 2026-09-10, so a branch no
longer parks `BEHIND` forever — see §2. It does not remove this rule: confirming
the merge commit is on `main` stays yours.)

## Work that never reaches the board at all

*New 2026-09-22 (DREAMCRM-96/100). Two halves — Sentinel's and Neon's — landed
as ONE rule because they are two ends of a single event, and fixing either alone
leaves the other open.*

The section below is about an issue that exists and is missing a field. This one
is about work with **no issue at all**, which every mechanism in this rulebook
is downstream of: the review gate reads a diff, the sweeps read merged PRs and
the board, the planning meeting reads the candidate pool. Work that never
reaches any of them is not lightly tracked — it is **untracked**, and it still
ships to production.

**An unkeyed PR has no one to chase.** Sentinel's half. The PR title carries the
issue key (`DREAMCRM-<n>: …`) — that is the first bullet of this section and it
is not decoration. The key is the only link from a merged commit back to
somebody who can answer for it, which is why #659 merged with
`needs-forge-intake` and nobody recorded the intake: no issue owned it, so there
was nobody the label could be about. **Second unkeyed PR in one day** (#636 at
01:24Z, #659 at 17:54Z, from `claude/*` branches), which upgrades this from an
observation to a pattern. When you find an unkeyed PR that has already merged,
the repair is an issue after the fact carrying the PR link — not a note on a
thread.

**Brand and gate work gets a board issue even when it starts in a direct owner
session.** Neon's half, and it is the one that names the real generator. #636
and #659 came out of a direct session rather than off the board, and between
them they changed the **largest visible surface on the site** (the homepage
living stage), **registered a new blocking guard** in `scripts/review-gate.mjs`,
and **amended `BRAND.md` Part 6** — the marketing surface's binding language,
§6. None of it was visible to the board, to the gate, or to that day's planning
meeting until the sweep went red the following morning.

So: **before the PR, open the issue** — with `--project` set (below) — when the
work does any of these, whoever asked for it and wherever the session started:

- amends `BRAND.md`, `DESIGN.md` or anything else §6 treats as binding;
- registers or edits a blocking assertion, a guard, or anything on `GATE_RULES`;
- changes a visible marketing surface beyond design-system-conformant polish;
- touches anything on the review-gate list above.

**Why an owner session is not an exception, said plainly**, because that is the
half everyone gets wrong: a direct session is a fast way to DECIDE something, not
a way for the decision to reach anybody. The owner's involvement makes the work
authorized; it does nothing at all to make it *visible*, and every downstream
mechanism here grades visibility. The gate does not ask who asked for the change.

**And the two halves are load-bearing on each other.** An issue with no PR key
still leaves a merged commit nobody can route; a keyed PR whose issue was never
created has nothing to key to. Sentinel's half closes the retrospective end,
Neon's closes the prospective one, and the cost of either being open is the same
shape: `#534` reached nobody for three days, `#636` for one, `#659` for twenty
minutes because a meeting happened to open. **The variance is luck, not
process.**

**The instances, so the pattern is countable rather than remembered.** `#534`
reached nobody for three days; `#636` for one; `#659` for twenty minutes
because a meeting happened to open; and `#674` ("The living stage, pass 2")
merged off-board on 2026-09-22 with no issue key in its title — its
after-the-fact record is **DREAMCRM-111**, "Record: PR #674 'The living stage,
pass 2' — merged off-board (§3 repair clause)", created by the chair at the
2026-09-22/23 planning meeting under the repair clause above. Four in under
three weeks, all from `claude/*` branches out of
direct sessions. The repair is cheap and it is not the fix: **the fix is the
issue before the PR**, and the count is here so the next person to argue that
this is rare has something to argue with.

## An issue with no project is invisible to the ops sweep

The sweep that opens every planning meeting reads the **project board** — the
same sweep that keeps finding the unmerged work above. An issue with no project
set is not on that board, so nothing about it is swept: not its open PR, not a
review request nobody answered, not the merge-gate change it carried.

**Gate-bearing work carries the project.** Pass `--project` when you create an
issue, and check the field on any issue handed to you before you start. If an
issue you are working turns out to have none, set it — that is a one-command fix
and it is not somebody else's job.

Neon's lane is the worked example (DREAMCRM-55, 2026-09-15). Four issues —
DREAMCRM-43, -44, -54, -56 — sat off the board from the day that agent joined
the workspace, and a change to what can merge came out of that lane while the
board showed nothing at all. It reached this document by the sweep that reads
`main`, not by the sweep that reads the board; the chair reparented all four
onto the project the day it surfaced. Two things generalise from it:

- **A new agent's first issues are the ones most likely to be off the board**,
  because whoever created them was not yet thinking about the sweep — which is
  exactly when that agent's work is least familiar to everyone else.
- **"It is assigned, so it is tracked" is a different claim.** Assignment routes
  the work to one runtime. The project is what makes it visible to everyone who
  is not the assignee, and every invariant in this document that depends on
  somebody noticing — the merge rescues in "Delivered means merged", the
  repo-policy intake in §2, the review gate above — depends on that visibility.
