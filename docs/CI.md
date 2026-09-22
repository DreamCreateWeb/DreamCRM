# CI — what gates what

Ten workflows, and three of them can stop something: `ci.yml` holds a merge,
`deploy.yml` holds a deploy, and `migration-check.yml` can fail a deploy run
without publishing a check of its own. The other seven are alarms and advisories.

This file covers what runs *before* a merge and on the way to production. What
gets checked *after* the deploy lands — the URLs the production watch sweep
loads, including the one real clinic site — is `docs/OPS.md`.

| Workflow | Trigger | Jobs | Protects | Blocking? |
| --- | --- | --- | --- | --- |
| `.github/workflows/ci.yml` | `pull_request` | `test`, `e2e` | the merge | yes — both are required checks |
| `.github/workflows/deploy.yml` | `push` to `main` | `test` → `deploy` | production | yes — `deploy` `needs:` `test` |
| `.github/workflows/post-merge-e2e.yml` | `push` to `main` | `e2e-post-merge` | the tree that just shipped | no — alert only |
| `.github/workflows/nightly.yml` | `schedule` 06:37 UTC nominal (lands hours later) + dispatch | `nightly-test`, `nightly-e2e`, `tz-canary` | finding clock/race failures before someone trips over them | no — signal only |
| `.github/workflows/review-gate.yml` | `pull_request` | `review-gate` | the pre-merge review gate | no — advisory only |
| `.github/workflows/read-check.yml` | `workflow_dispatch` + `schedule` 06:37 UTC | `read-check` | the read-only role's privileges in production | no — never runs on a PR |
| `.github/workflows/error-scan.yml` | `schedule` every 30 min + dispatch | `scan` | noticing errors inside the product | no — warns only |
| `.github/workflows/migration-check.yml` | `workflow_call` from `deploy.yml` + `schedule` 08:20 UTC + dispatch | `migration-check` | that a deploy's migrations actually applied | no required context — but it CAN fail the deploy run |
| `.github/workflows/rulebook-drift.yml` | `schedule` 06:17 UTC + dispatch | `rulebook-drift` | the rulebook still describing this repo | no — never runs on a PR |
| `.github/workflows/review-sweep.yml` | `schedule` 06:47 UTC + dispatch | `review-sweep` | that a PR owing Sentinel a review, or Forge an intake, did not merge without one | no — post-merge alarm, never runs on a PR |

## The deploy is not finished until the migrations are in

`migration-check.yml` (new 2026-09-14, DREAMCRM-46) is the odd one out in the
table above: it publishes no required context and cannot block a merge, and yet
it is the only alarm here that can turn a **deploy run** red.

The defect it closes: `main` auto-deploys and migrations apply on the new
container's BOOT, from a `Dockerfile` line that runs after App Runner has
already marked the container healthy and then swallows the exit code. `deploy.yml`
has no migration step, and `/api/admin/migrate` answers a 500 nothing reads. So a
migration that threw produced a green tick and no other signal anywhere — and
because drizzle only ever considers journal entries NEWER than the most recent
ledger row, every later migration was then blocked behind it, on every future
boot.

What it does: asks production which migrations it has actually applied (the
DREAMCRM-42 read path, catalog entry `migrations-applied`, so no runner holds a
database credential) and compares that to `lib/db/migrations/meta/_journal.json`
in the commit being checked. `scripts/migration-check.mjs` is the whole
implementation; the workflow supplies only the trigger and the secret.

Four things about it that are decisions rather than details:

- **It polls, for up to 12 minutes.** `deploy.yml` returns when CodeBuild
  succeeds; the App Runner rollout it triggers is still in flight at that moment
  and the migrations run later still. A check that asked once would be asking the
  OLD container.
- **That poll is why `deploy-main` moved onto the `deploy` job** (2026-09-14, in
  review of #575). It used to be workflow-level, which held the group open for
  everything after the rollout too — so the next merge's `test` and image build
  (~15 min of work that used to run *concurrently* with the rollout) would have
  been stalled behind the poll, and on a red result that is the full 12 minutes,
  at exactly the moment somebody is landing the fix-forward merge. An earlier
  draft of this section claimed the wait was free because the next build already
  waits on the rollout clearing: that is true of the buildspec's
  `start-deployment` retry and false of the queue. The rollout itself is still
  serialized exactly as before — App Runner allows one at a time, and that is
  the `deploy` job.
  The visible consequence is that run N's migration-check can overlap run N+1's
  deploy. Harmless: N+1's journal is a superset of N's, so every entry run N is
  asking about is applied whichever container answers, and production being
  AHEAD is explicitly not a failure.
- **The check workflow itself takes no concurrency group**, so a scheduled run
  can never queue in front of a deploy's. The 30s poll interval is what keeps two
  overlapping runs inside the read-check route's own rate limit.
- **A MISSING journal entry fails; production being AHEAD does not.** A newer
  merge deploying mid-check is normal, and a check that went red on busy days is
  one nobody would trust on the day it matters.
- **It distinguishes NOT VERIFIED from a pass, loudly.** Until the owner-side
  DREAMCRM-42 setup lands there is no secret to ask with, so *every* run prints
  `⚠️ NOT VERIFIED — nothing was checked` and exits 0. Read the job summary; the
  tick means nothing yet. A fifth verdict, `THE CHECK ITSELF IS BROKEN`, exists
  for the case where production rejects the secret — that one exits 1, because an
  alarm that cannot fire is not the same as one that has nothing to report.

The scheduled run is not redundant with the post-deploy one. The post-deploy run
can go red because a rollout was slow; the 08:20 UTC run cannot, so it is the
timing-free reading — and it is also the only thing that would ever notice a
migration silently SKIPPED for carrying a `when` at or below an already-applied
row, which no redeploy fixes.

A second, weaker signal covers the same failure from the other end: every failure
line `scripts/db-migrate.mjs` prints now starts with `ERROR`, so `error-scan.yml`
picks it up within 30 minutes. Before DREAMCRM-46 those two lines matched none of
that workflow's filter terms — the one alarm already pointed at those logs read
straight past a migration that never applied.

**The two production-read ones touch production but gate nothing** (DREAMCRM-42;
`docs/PROD-READ-ACCESS.md` is their runbook). Neither runs on a `pull_request`,
neither publishes a required context, and neither can stop a merge.

- **`read-check.yml`** runs one named entry from the catalog in
  `lib/read-checks.ts` against production under a `SELECT`-only role. Its
  scheduled run is `readonly-role-privileges`, and **a red run means a
  credential column is readable in production** — the one alarm here worth
  interrupting someone for. It shares 06:37 UTC with `nightly.yml`; they
  contend for nothing (different workflows, different runners), and they moved
  off the top of the hour together — see "When it really runs" below.
- **`error-scan.yml`** scans the App Runner log groups every 30 minutes and
  writes findings to the job summary. It warns, never fails, because an alarm
  that goes red on a transient is one people stop opening.

Both distinguish **not configured yet** from **something is wrong**: a missing
secret, a 503 from the route, or an un-assumable IAM role is a `::warning::`
and `exit 0`. That is deliberate — they merged before the owner-side setup
existed, and a workflow that has been failing daily for a fortnight for an
unrelated reason has already been trained into noise by the time it first
matters.

**Job names are load-bearing.** `test` and `e2e` are the required status-check
contexts on `main`. Nothing outside `ci.yml` and `deploy.yml` may use those two
names — that is why the nightly and post-merge jobs are called `nightly-test`,
`nightly-e2e` and `e2e-post-merge`. A second producer of a required context can
report a green check onto a commit the real gate never ran against.

## The two blocking gates

The unit gate is deliberately duplicated rather than shared. `deploy` needs its
own `test` job so it can `needs:` it — that is what makes a red `main` unable to
reach CodeBuild, since `main` auto-deploys with migrations applying on boot.
Keeping it inside `deploy.yml` (instead of also firing `ci.yml` on push) means a
merge runs the suite once, not twice. **The typecheck + suite steps in the two
`test` jobs are meant to stay identical — change one, change the other.**

**Both `test` jobs — and both jobs in `nightly.yml` that run the suite — fetch
`origin/main` before the suite runs** (2026-09-15, DREAMCRM-60). One line,
`git fetch --no-tags --depth=1 origin +refs/heads/main:refs/remotes/origin/main`,
immediately after the checkout. `tests/guards/axe-baseline-ratchet.test.ts`
compares every axe ceiling in `e2e/axe-baseline.ts` against its value on `main`
and fails any increase, and `actions/checkout` on a `pull_request` fetches
`refs/pull/N/merge` and nothing else — so without the step the ref does not
resolve, in the one check the guard exists to defend. It fails rather than skips
when the ref is missing under CI, and the step is pinned in every workflow that
runs `pnpm test`, derived from the workflow directory rather than a list. Depth 1
because the tip's tree is all it reads. `docs/E2E.md` owns the ratchet itself.

**The fetch runs on every event; the COMPARISON is skipped when the tree is
already on `main`.** Two different assertions, deliberately: that `origin/main`
resolves is the guard's premise and is checked everywhere, so a deleted fetch
step goes red wherever it was deleted. Grading the tree against main is the part
that only means something on a PR — on a push to `main` or a nightly
`schedule` run, HEAD *is* main. Skipping it
there costs nothing (every tree that reaches `main` was graded on its own PR)
and avoids a false red on the deploy path: `deploy.yml`'s `test` job has no
`cancel-in-progress` by design, so merges X then Y run overlapping jobs, and if
Y lands inside run-for-X's fetch window while *shrinking* a ceiling, run-for-X
would grade X against Y's lower number and report a raise that nobody made —
turning a green tree into a skipped deploy. It would be self-healing and rare,
but a red `test` on `main` reads as a real regression here, so the guard does not
get to cry wolf on the deploy path. The nightly jobs carry the same race for a
dismissible alarm rather than a deploy, and are covered by the same rule.

The check is `comparisonIsVacuous()` in `tests/guards/axe-baseline-ratchet.test.ts`,
and it keys on `GITHUB_EVENT_NAME` being `push` or `schedule` rather than on
anything that looks more like the real property. Both tempting alternatives are
worse. Testing *HEAD equals `origin/main`* fails at the very case this exists
for — in the race HEAD is on main but **behind** the ref just fetched, so the two
differ exactly when the comparison is wrong — and it would also switch off local
grading for anyone with uncommitted edits on `main`, which is how this repo says
to work. Testing *HEAD is an ancestor of `origin/main`* is the real property and
covers everything, but needs `git merge-base`, hence shared history, hence not
`--depth=1`. See "Depth 1" above: deepening the fetch is an open trade, not an
oversight.

One case is knowingly left open: a `workflow_dispatch` on `main` still compares
and is vacuous. No event-name list can tell it from a dispatch on a branch, where
the comparison is wanted, and a manual dispatch is attended by definition — so
the worst case is one person seeing one confusing red, not an unattended gate
lying.

They are not byte-identical, and the difference is deliberate: the `test` job in
`ci.yml` also runs `pnpm lint` (the `eslint-plugin-jsx-a11y` accessibility gate
added 2026-09-10, DREAMCRM-17) before the suite. That step is PR-side only. Every
write to `main` goes through a PR, so the gate is complete in practice, and
`deploy.yml` stays a pure production-safety gate — a missing accessible name
should not be able to hold up a deploy that already passed the check on the PR.

`e2e` also runs only on PRs. It is the expensive one (stands up a throwaway
Postgres from the runner image's binaries, applies every migration from zero — a
deploy-path rehearsal — then builds, serves, and runs Playwright). See
`docs/E2E.md`.

## The two suite alarms

Neither of these gates a merge or a deploy. That is the point: they can afford to
run the slower, noisier, more informative shape of the suite. (They are not the
only alarms in the file any more — `review-sweep.yml` and `rulebook-drift.yml`
watch the process rather than the suite, and have their own sections below.)

- **`post-merge-e2e.yml`** re-runs the browser suite against `main` after a merge
  lands. PR `e2e` runs against a *stale* merge — `main` as it stood when that run
  started — so two PRs green against yesterday's `main` can merge into a tree
  neither combination was tested on, and that tree auto-deploys. The gate in
  `deploy.yml` is typecheck + unit only. This tells us within minutes if the
  merged tree broke a browser journey; the deploy is not held back either way.
- **`nightly.yml`** runs the same gates on a schedule — asked for at 06:37 UTC
  (02:37 ET), actually arriving hours later; see "when it really runs" below,
  because the cron line is not what happens. Before it existed, nothing ran the
  suite except a PR or a merge, so a clock- or race-dependent failure could only
  be found by accident on somebody else's unrelated PR. Both flakes found in the
  DREAMCRM-19 cycle were found exactly that way.

### Reading the nightly

Two things about the nightly do not announce themselves. Check both rather than
reading silence as health.

- **`tz-canary` is `continue-on-error: true`.** It runs the unit suite under
  `TEST_TZ=America/New_York`, where local days and UTC days genuinely disagree,
  because the `TZ=UTC` pin (below) is correct *and* makes CI structurally blind
  to the bug class where a mapper buckets timestamps into local days
  (DREAMCRM-13, #500/#509). A red canary is an early warning — some test reads
  the local clock — not a broken build, and by design it leaves the run's overall
  conclusion green. **A green nightly does not mean the canary passed.** Open the
  run and read the job.
- **When it really runs: hours after the cron says.** Every unattended fire so
  far, `gh run list --workflow nightly.yml`:

  | Asked | Fired (UTC) | Late by | Last job finished |
  | --- | --- | --- | --- |
  | 07:00 | 2026-09-11 11:58:57 | +4h59m | 08:06 ET |
  | 07:00 | 2026-09-12 11:25:47 | +4h26m | 07:31 ET |
  | 07:00 | 2026-09-13 12:29:36 | +5h30m | 08:36 ET |
  | 07:00 | 2026-09-14 13:33:53 | +6h34m | 09:42 ET |

  This is GitHub's scheduler, not ours: `schedule` is best-effort and delayed
  under load, and the top of an hour is its busiest moment — `0 7` was both.
  Four samples, the first three against one frozen commit (the office was
  frozen 09-11 to 09-13), so treat the numbers as an order of magnitude and not
  a constant. But the direction is not noise: the fourth fire landed at 09:42
  ET, which is the mid-morning arrival the previous version of this note named
  as the trigger for spending a review round.

  **So the cron moved off the top of the hour on 2026-09-14 (DREAMCRM-48):
  `37 6` rather than `0 7`, in `nightly.yml` and `read-check.yml` both.** Asking
  at :37 asks when GitHub's queue is shorter; the 23 minutes earlier are
  incidental. It is a lever, not a fix — the delay belongs to GitHub's
  scheduler, and if the arrival keeps drifting the answer is not another minute
  but accepting that a nightly alarm arrives when it arrives.

  **Add a row above rather than re-deriving this from memory**, and note which
  cron each row was asked under — a table that silently mixes the two slots
  cannot show whether the move bought anything.

  **The grace period for a missing run is DATED, not open-ended** (Sentinel's
  note on #568). A schedule that silently failed to register and a schedule
  sitting in GitHub's queue look identical from here — both produce no run —
  and "read a missing run as normal for a while" lets the first one hide
  inside the second indefinitely. That is the shape this repo keeps getting
  caught by: a check that declines to answer, read as a check that answered
  fine. It matters most for `read-check.yml`, which already exits green when
  the setup is unfinished and which nobody is assigned to read — a dead
  schedule there is silence on top of silence.

  So: **each** workflow owes one real `event: schedule` fire under `37 6`, and
  if either has none by the end of **2026-09-16**, that is a defect in the
  cron rather than queue delay.

  ```bash
  gh run list --workflow nightly.yml    --json event,conclusion,createdAt
  gh run list --workflow read-check.yml --json event,conclusion,createdAt
  ```

  Delete this paragraph once both have fired — it is a one-off confirmation of
  a move, not a standing rule.

- **GitHub only runs `schedule` from the default branch**, and it disables
  scheduled workflows in a repository with 60 days of no activity. If nightly
  runs go quiet, check the Actions tab for the re-enable banner before assuming
  the suite is fine. `gh run list --workflow nightly.yml --json event,conclusion`
  shows whether a given run was a real `schedule` fire or a hand
  `workflow_dispatch`.

Nobody is assigned to read either alarm. Delivery is the default failed-run
notification GitHub sends to the account that pushed, plus the Actions tab — and
every merge here pushes as the same shared account, so that is one inbox. Named
here so the next person does not have to work out whether silence means healthy
or unwatched.

## A retry leaves a trace (added 2026-09-13, DREAMCRM-33)

`playwright.config.ts` sets `retries: 1` under CI and that stays. What changed
is that the retry no longer happens in silence.

Every job that runs the browser harness — `e2e`, `e2e-post-merge`, `nightly-e2e`
— now follows it with one step:

```yaml
- name: Name any test that only passed on a retry
  id: flaky
  if: always()
  run: node scripts/e2e-flaky-summary.mjs
```

and uploads the Playwright report on `failure() || steps.flaky.outputs.flaky ==
'true'` rather than on `failure()` alone.

The gap it closes: a spec that failed once and passed on the second attempt
reported the job **green**, and the `if: failure()` upload threw the trace and
the screenshot away with the runner. The evidence that would have named the
portal-reschedule flake (DREAMCRM-21) in minutes existed on three runners and
was deleted three times.

Mechanics:

- The CI reporter list gained `['json', { outputFile: 'e2e-results.json' }]`.
  It sits OUTSIDE `playwright-report/` deliberately — the html reporter clears
  that folder when it generates, and would delete a sibling written into it.
- `scripts/e2e-flaky-summary.mjs` reads that file, writes a table of the flaky
  tests to `$GITHUB_STEP_SUMMARY` **naming the check they flaked in** (a reader
  arriving from a green PR has no other way to tell `e2e` from `nightly-e2e`),
  emits a `::warning`, and sets `flaky` / `flaky-count` on `$GITHUB_OUTPUT`.
- **It never exits non-zero** — as a property, not a list. `main()` wraps its
  whole body in `try`/`catch`, so an unimagined throw (`appendFileSync` on a
  full disk, a report shape nobody pictured) cannot reach the process. The
  named paths — missing file, unparseable JSON, clean report — are handled
  individually on top of that. A reporting step that can turn a run red is a
  reporting step somebody eventually deletes, at the worst possible moment.
- **No shebang on the script**, and the guard pins it. git hands a Windows
  working tree CRLF endings, and vitest's transform leaves the `\r` when it
  strips `#!…` — so every test in the guard file died at column 1 on Windows
  while CI stayed green. The workflows invoke it as `node scripts/…`, so the
  shebang bought nothing. Same rule for `scripts/review-gate.mjs`.
- `if: always()` rather than `success()`: a run can be both red *and* flaky,
  and the flaky half is still worth naming.

**Nothing here changes what gates a merge.** `e2e` passes or fails exactly as
it did before; this only decides what gets written down and kept.

`tests/guards/e2e-flaky-summary.test.ts` pins the parts that could rot without
anyone noticing — the detection itself, that a clean run reports nothing, that
the path the config WRITES is the path the script READS, and that **all three**
harness workflows carry the step. That third one is the quiet one: rename either
half and the reporter finds no file, says so in a log nobody opens, and every
run keeps looking clean forever. The fourth matters because `nightly-e2e` and
`e2e-post-merge` are the unattended runs — the ones this is most for, and the
ones a workflow edit could revert with nobody watching.

Deliberately not done: `retries: 0`. It trades a quiet flake for a loud false
red on every PR, and a required check that goes red for reasons nobody caused
is a check people route around.

## The advisory: the review gate knows which files are risky (added 2026-09-13, DREAMCRM-33)

`review-gate.yml` reads which files a PR touches and answers **two** questions
on the run's job summary, each with its own label: does the PR owe Sentinel a
review before it merges (`needs-sentinel-review`), and does it change what
everyone else can merge, so Forge has to hear about it the same day
(`needs-forge-intake`, added 2026-09-14 — see "The second obligation" below).
A PR can owe both, either, or neither.

The gate list itself is policy and lives in the `dreamcrm-conventions` skill —
money, tenant scoping, auth and token surfaces, DB migrations,
`.github/workflows/**`, branch-protection settings, the deploy pipeline. Until
now **nothing in the repository knew it**, so nothing could ever object: a
forgotten review request on a fee calculation merged green with every check
passing. #517 is the worked example — a workflow-file edit riding along in a
UI-polish PR.

**It does not gate anything, and that is deliberate.** It adds no required
status-check context (the required ones stay exactly `test` and `e2e`), has no
`needs:` relationship, and cannot stop a merge:

- An advisory that is right 100% of the time beats a blocker that is right 95%.
  The gate list is an enumeration; the day it is slightly wrong should cost a
  conversation, not a blocked production fix.
- It cannot tell whether the review *happened*, only that one is *owed*. A check
  that blocks on a fact it cannot observe gets overridden routinely, and a
  routinely-overridden check is decoration.
- Making it required later is a branch-protection change, which is itself behind
  the review gate. Do not do it by editing the workflow file.

Mechanics: `gh pr diff --name-only` (so the file list is the one a reviewer
sees, independent of checkout depth) into `scripts/review-gate.mjs`, which holds
the patterns and the reason for each area. No `pnpm install` anywhere in the job
— it finishes in seconds. The label step is `continue-on-error` because an
advisory whose labelling hiccup paints the run red teaches people the check is
broken.

`tests/guards/review-gate.test.ts` pins the gate list in **both** directions,
and the second one is the one that decays:

- **Every pattern must still match a real tracked file.** A rename that orphans
  a pattern takes a whole area out of the gate with nothing going red — the
  classifier keeps answering confidently about a tree that moved.
- **Every file on a curated `MUST_BE_GATED` list must trip its rule.** This is
  the direction nobody thinks to test, and the first version of the list shipped
  without it — reporting `lib/services/refunds.ts`, `orders.ts`, `revenue.ts`
  and every nested token route (`app/api/calendar/[token]`, which hands out a
  clinic's whole agenda on a token alone) as clean. **A false clean is worse
  than silence**: before this check an author had to remember the gate; after
  it, something authoritative tells them they do not have to. Add to that list
  whenever a new money, auth or token surface arrives.
- **Every file that imports `@/lib/stripe` must trip `money` — derived from the
  tree, not remembered.** A curated list is a list somebody thought of; this one
  asks the repository. Reviewing the gate list by eye found one ungated
  Stripe-touching module; asking the tree found **four**, none of which carries
  a money word in its filename (`domain-purchase`, `clinic-provisioning`,
  `clinics`, `operations`). A new money module now fails on the day it arrives
  rather than the day somebody remembers it. It is a *necessary* condition, not
  a definition — fee math and cart totals never import the client, and the
  curated list stays responsible for those.
- **Every tree-wide scanner in the suite must be on the intake list — derived
  from the tree.** See the next section for what that list is. A suite file
  that walks a directory (`readdirSync`, `git ls-files`) and names a product
  root (`'app'`, `'components'`, `'lib'`) is asserting about the whole tree,
  and that is mechanical evidence rather than a judgement — the same bargain
  the Stripe test makes. It fails by name on the day such a file arrives,
  which is the one direction a path list cannot cover by itself.

### The second obligation: intake (added 2026-09-14, DREAMCRM-49)

The same run now answers a second question, separately: **does this PR change
what can merge?**

PR #566 added rule 4 to `tests/a11y/class-pairs.ts` — a new class of blocking
assertion inside the required `test` check, so a gradient-text chunk that merged
green yesterday fails today. It touched nothing under `.github/` and nothing on
the gate list, and this check printed *"✅ No review-gate files in this PR —
merges on green."* That was the right answer to the review question and no
answer at all to the one that mattered. Its author had predicted at the
DREAMCRM-45 planning meeting that it would need routing, remembered the rule by
hand, and routed it. The machine told them the opposite.

It is the fourth PR of that shape: the axe ratchet (#534, three days to reach
the skill), the shared-pending guard (#559), the brand ramp's solid-fill rule
(#555 — routed, but only the half its title described), and #566.

So `INTAKE_RULES` in `scripts/review-gate.mjs` names the files that hold a
repo-wide blocking assertion, and a PR touching one gets its own summary section
and a `needs-forge-intake` label. **Intake is not review**: it adds no reviewer
and holds up nothing. It says "tell Forge the same day so the rule reaches the
skill", which is what §2 of the conventions has always asked for and what
nothing in the repo could previously prompt.

Two shaping decisions worth keeping:

- **It is a separate answer, not a widened gate list.** Measured against the
  last 90 merged PRs, folding these files into `GATE_RULES` would have put
  roughly a third of them into a review queue of one. The money rule was
  narrowed deliberately to avoid exactly that, and this would have undone it
  faster. A PR can now be told "merges on green" *and* "tell Forge" in the same
  summary, which is the honest pair of answers.
- **`e2e/axe-baseline.ts` is deliberately NOT on it.** It is an inventory of
  existing debt, not a rule; shrinking it is the end of every accessibility fix
  and it moved in 10 of the last 90 PRs. The direction that matters there is a
  ceiling going *up*, which a path pattern cannot see. That wants a
  monotonicity guard, tracked as its own defect.

`e2e/axe.ts`, `vitest.config.ts`, `playwright.config.ts` and
`scripts/review-gate.mjs` went the *other* way — onto the review gate, as
`check-definitions`. They decide which assertions run and which are excluded,
which is the `.github/workflows/**` argument one level in; `e2e/axe.ts` in
particular carries the accessibility harness's exclusion list, and an exclusion
is the one edit to a gate that can only ever make it looser.

### Why `review-gate` is still not a required check (re-decided 2026-09-14, DREAMCRM-49)

Not carried over by habit — re-opened deliberately and answered the same way.
The blocking version needs a pass signal that can be set on the PR itself,
because the verdict lives on a Multica issue and a check that can never go green
hangs every risky PR forever. Every signal available — a label, a GitHub review
— can be minted by the single admin account the whole agent fleet authenticates
as, so it would read as enforcement while being weaker than an honest advisory.
The gate list has also been corrected three times in twelve days (#553, #559,
#565), which is not the precision record a blocker needs.

What would change the answer: a pass signal the shared admin credential cannot
mint (Sentinel reviewing from a distinct GitHub identity), plus a full batch with
no correction to the gate list. The full reasoning and the before/after table are
on the DREAMCRM-49 issue — a settings change has no diff, so that comment is the
review record.

## The sweep that asks whether the review happened (added 2026-09-15, DREAMCRM-61)

`review-sweep.yml` runs every morning and answers the question the advisory
above has never been able to answer: **did a PR that owed Sentinel a review
merge without one?**

The advisory was right twice and it did not matter. **#573 and #582 both merged
carrying `needs-sentinel-review` with no review** — the gate labelled them
correctly, author memory failed twice in the same batch, and the miss surfaced a
day later in a manual sweep somebody chose to run. This is that sweep, on a
schedule.

**It gates nothing.** No `pull_request` trigger, no required context, no
`needs:`, and it runs entirely after the merge commit is on `main` — usually
after the deploy. It cannot hold a merge and must never try to.

**Why a sweep works where a blocking gate did not.** The section above refuses a
blocking `review-gate` because every available pass signal can be minted by the
single admin account the whole agent fleet authenticates as. That argument is
what makes this shape correct rather than a way round the ruling:

- a **gate** has to survive an adversary, and a signal the author can mint is
  worthless in front of a merge — minting it is the cheapest way past;
- a **sweep** only has to survive *forgetting*, which is what actually happened,
  twice in one batch. Someone who types a fake verdict onto their own PR to dodge
  a reviewer has done something no check was going to stop; someone who forgot
  leaves exactly the trace this reads.

Do not "strengthen" this into a required check. That is DREAMCRM-49 re-argued
from the other end, and the answer is still no.

### The convention it depends on: write the verdict on the PR

Sentinel's verdicts live on Multica issues, which GitHub cannot see. On the day
this was built, **not one PR in the repository carried a GitHub review or a
verdict comment** — including #575, #579 and #580, which were genuinely
reviewed. A sweep that flagged "no review record on the PR" against that history
would have cried wolf three times out of five on its first run.

So the verdict gets written onto the PR before it merges:

```bash
gh pr comment <n> --body "Sentinel review: APPROVE — <link to the verdict comment>"
```

**The reviewer records it; the merger confirms it is there.** That split is
Sentinel's, from his review of #593, and it is the right way round: the first
draft put the whole obligation on the merger, who is exactly the person whose
memory already failed twice — that is the premise of the issue. Sentinel now
posts the line himself when he gives a verdict, so author memory is out of the
reviewed path entirely and the merger's check is a backstop. What is left in the
unsatisfied set is then exactly the #573/#582 shape: a PR that never reached a
reviewer at all.

The instruction is prompted by the review-gate summary itself — the obligation
arrives attached to the review request rather than living only here — and it
does not block the merge either.

### Zero false positives is the bar, and three things hold it there

A sweep that cries wolf gets ignored, and then the miss goes back to being found
by whoever happens to look.

| Mechanism | What it prevents |
| --- | --- |
| `SWEPT_SINCE` — a hard cut-off, `2026-09-15T16:00:00Z` | judging merges from before the record-keeping convention existed, when a reviewed PR and an unreviewed one were indistinguishable |
| `INTAKE_SWEPT_SINCE` — the intake half's own cut-off, `2026-09-22T08:00:00Z` | the same thing for the obligation whose record did not exist until DREAMCRM-91: thirty merged PRs wore `needs-forge-intake` unread that morning, #569 through #636, most of them routed long ago onto a Multica issue GitHub cannot see |
| the reviewer recording the verdict, not only the merger | the cut-off's own failure mode at the *other* end of the window — PRs already open when this landed, whose review-gate summaries were rendered before the instruction existed |
| generous satisfaction — a GitHub review carrying a verdict, or any PR comment with a verdict word in it, however phrased | firing at the one person who did the work because they wrote it differently |
| the **label** is the trigger, not a re-run of today's `GATE_RULES` over the diff | retro-flagging PRs that were correctly clean when they merged — that list has been widened four times in twelve days |

The skipped PRs are **counted and named** in the summary, never silently
dropped: `Examined N merged PRs` leads every run, and 15 pre-cut-off PRs are
listed as *not judged* rather than as passes. Same discipline as `Graded N/8`
above — a run that looked at nothing must not read like a run that found
nothing.

Being loose about what counts as satisfied buys **false negatives**, and that is
the deliberate direction: a missed miss costs the manual sweep we already had, a
false alarm costs the instrument. What it therefore cannot see is written down
at the top of `scripts/review-sweep.mjs` — a PR whose `continue-on-error` label
step hiccuped, a verdict comment with no review behind it, and an entry that
goes back to unsatisfied without a new merge (a deleted verdict comment), which
keeps printing but reads as standing rather than new.

### The intake half, and why its cut-off is a different date (added 2026-09-22, DREAMCRM-92)

`review-gate.yml` applies `needs-forge-intake` with exactly the same care and,
until this landed, **nothing read it**: the sweep excluded it by design, it is
never cleared at merge, and **thirty merged PRs carried it** on 2026-09-22,
#569 through #636. An obligation with no closing record is not a queue, it is a
note in a drawer — which is the argument #593 already made for the review half.

§2 gives it the same shape of record, mirrored where an instrument can see it:

```bash
gh pr comment <n> --body "Forge intake: §2b, §6 — <link to the issue comment>"
```

Two parts, and the second is what makes it gradeable rather than decorative: the
marker, and a **section reference** naming where the rule landed. A bare "routed
to Forge" does not satisfy it. An intake's real record lives in a skill document
outside this repo, so the section number is the only part of it a reader
standing at the PR can follow.

The cut-off is its own, and LATER. Those thirty are the review half's
#575/#579/#580 problem one obligation over — a routed PR and a forgotten one are
indistinguishable from GitHub — so judging them would have opened this half with
thirty findings, most of them wrong, on an instrument whose entire value is
being believed. They are counted and named as *not judged*, never as passes.
`SWEPT_SINCE` must stay the EARLIER of the two, because the truncation check
below grades the `gh pr list` window against it alone.

### The exit status is keyed on the last green run (added 2026-09-22, DREAMCRM-92)

The first version stayed red while any unremediated entry existed. Right for the
text, and a disaster in the exit status: **six consecutive red runs**,
`35094044453` (2026-09-16) through `35605207003` (2026-09-21), over four PRs,
three of which had genuinely been reviewed and never mirrored. After six
mornings the red read as wallpaper, and **#636 merged into that silence on
2026-09-22 carrying `needs-sentinel-review`, editing `scripts/review-gate.mjs`,
with no verdict anywhere.** A permanently-red alarm is a disabled alarm, and the
first thing this one disabled was the gate's own rule list.

So the two halves are split:

- **the summary** still prints every unremediated entry every morning, with
  Sentinel's property intact — an unremediated miss is not less true tomorrow —
  and still annotates each one (`::error` for the new, `::warning` for the
  standing);
- **the exit status** is keyed on the entries that merged after this sweep last
  went green.

### What that buys, and what it does not (Sentinel, reviewing #643)

**A red run does not advance the last-green instant.** So an unremediated entry
is still newer than `lastGreen` tomorrow, and the morning after, and every
morning until somebody clears it: the run stays red for as long as the queue is
dirty, exactly as it did before. The first draft of this section, and of the two
comments it is written from, claimed "it no longer stays red forever" — that is
wrong, and a maintainer who believes it will misread a legitimately red week.

The property it actually adds is narrower and still worth having: **once the
queue IS clear, a new miss is a NEW red rather than the continuation of an old
one**, and a green morning becomes a positive claim that nothing is outstanding.

Said the blunt way, because this check's whole discipline is stating what it
cannot see: **this change alone would not have prevented #636.** Those six red
mornings were over four *unremediated* entries; under the new code the lookup
finds no green, fails closed, and all four are fresh — six red mornings again,
and #636 merges into the same wallpaper. What prevents the recurrence is §2a's
other half — the standing issue that gives the red an owner — plus the queue
being kept at zero. The two halves were always meant to land together.

The consequence for reading the code: `newSince`'s `standing` branch is rare in
practice. It needs a record that DISAPPEARS after a green run (the
deleted-verdict-comment blind spot), a label applied to an already-merged PR by
hand, or a cut-off moving. The summary, not the exit code, is the channel that
catches those.

**The lookup is pinned to LAST GREEN and that word is load-bearing.** Degrade it
to *last run* and every miss becomes a one-day alarm — red the morning it
appears, green the morning after with the finding untouched — which is strictly
worse than the permanently-red version, because a green run is a positive claim
that nothing is new. The workflow asks `gh run list --branch main --status
success`, and `lastGreenAt` filters on `conclusion` itself rather than trusting
that flag; the guard drives it with a history whose newest run FAILED.

A failed lookup **fails closed**: an empty history, a throttled `gh`, a file the
step never wrote all mean every entry counts as new and the run stays red, with
the reason printed. The opposite default lets one rate-limited API call print a
quiet morning over a real miss.

On the day it landed the sweep had never been green — six runs, six failures —
so the first run after the merge is what establishes the window. That run is
green because the four standing entries were all remediated on DREAMCRM-85 and
§3 before this shipped; had they not been, clearing them once would have been
the price of the first green.

### Mechanics

`gh pr list --state merged --limit 500` into `scripts/review-sweep.mjs`, which
holds the classifier. No `pnpm install` anywhere in the job. It sweeps
**everything merged since the cut-off** rather than a rolling "last N hours"
window, because GitHub's scheduler is best-effort and this file's own table
shows a `0 7` schedule landing up to +6h34m late — a 24-hour window on a
six-hour slip drops merges into a gap and never looks at them again. The cost is
that a finding stays PRINTED until it is remediated, which is what an unresolved
miss should do — and RED too, until the queue is clear. What DREAMCRM-92 changed
is narrower than that; see the last-green window above.

The script is told the same `--limit` the `gh` call used and goes **red** if the
list came back truncated before reaching the cut-off, for the reason this
document keeps re-learning: a sweep with a hole in it and a sweep that found
nothing look identical from the outside. The limit is 500 rather than 200 for a
reason worth keeping: at this repo's rate (#553 to #593 in roughly two days) 200
is about a ten-day window, so the alarm's **first red run would most likely have
been about itself** — on a brand-new instrument whose entire value is being
believed. The query costs ~7.6s at 200 and GitHub returns 500 fine.

**What could blind it from outside, and the one thing holding that.** The
review-gate summary contains the literal word `APPROVE`, because it prints the
instruction above. It is safe for exactly one reason — that check writes to
`GITHUB_STEP_SUMMARY` and `GITHUB_OUTPUT` and never to `gh pr comment`. Give it
a comment channel and its own summary lands on every gated PR in the repo, all
of them read as satisfied, and this alarm goes blind, green and silent on the
same day. `tests/guards/review-sweep.test.ts` refuses that edit and will tell
you what to do instead; the answer is a scoped exclusion for that comment, never
a narrower verdict pattern.

**Who reads a red run** is the same honest answer `post-merge-e2e.yml` gives:
nothing in `.github/` routes a workflow failure anywhere, so it is GitHub's
default failed-run notification plus the Actions tab — one inbox. A comment on
the offending PR was the obvious louder channel and is deliberately not used: the
sweep is cumulative, so an unremediated PR would collect one comment a day
forever, and posting them needs a write scope on a job that otherwise holds only
two reads.

`tests/guards/review-sweep.test.ts` grades both directions inside the `test`
check — every way a real review can be recorded must read as satisfied, and the
#573/#582 shape must still be seen — plus the instrument checks: the Vercel
comment every PR carries must never read as a verdict, and the workflow must
stay unable to publish `test` or `e2e`, run on a PR, or ask for a write scope.

**It also runs the script as a process, and that half exists because it was
missing.** Sentinel's review of #593 mutated `main()` four ways — zeroing the
exit code, dropping the annotation loop, hard-coding the truncation gap to
null, sweeping an empty list — and **all 22 tests passed on every one**. This
alarm has exactly one channel, so `process.exitCode = 0` is a one-token edit
after which it finds the miss, writes it into a summary nobody opens, and
reports green forever: the quietest edit available was the one nothing graded,
on a file that is on the review gate precisely because the quiet edit is the
dangerous one. The generalisable half is §2d's, aimed one level out — **grading
a classifier is not grading the instrument it sits inside**.

## The alarm that watches the rulebook (added 2026-09-14, DREAMCRM-53)

`rulebook-drift.yml` asks one question every morning: **does the
`dreamcrm-conventions` skill still describe this repository?**

That skill states in prose which checks are required, that admins are bound by
them, how many workflow files exist and which of them can block a merge, and
how many areas the review gate enumerates. Those sentences were true when they
were typed. Nothing had ever checked whether they still were — the skill lives
outside the repo, so no test could go red when the repo moved underneath it.
It moves often: the axe ratchet (#534) changed what could merge and took three
days to reach the skill, and a meeting sweep found the skill three claims stale
two minutes after #565 merged. Both were caught because a person chose to look,
which is not a control.

`scripts/rulebook-drift.mjs` holds the transcribed claims — each with the skill
section that states it and the sentence it states — and grades all eight
against the live repository:

| Claim | Read from |
| --- | --- |
| the required set is exactly `test` and `e2e` | branch protection |
| `strict: true` paired with `allow_update_branch: true` | protection + repo settings |
| `enforce_admins: true` | branch protection |
| `allow_force_pushes: false`, `allow_deletions: false` | branch protection |
| the workflow census (which file gates what) | `.github/workflows/` |
| only the census's workflows may publish `test` or `e2e` | `.github/workflows/` |
| every required context has a PR-triggered producer | protection + workflows |
| the review gate enumerates eight areas | `GATE_RULES` |

**It gates nothing.** No `pull_request` trigger, no required context, no
`needs:`. A stale sentence in a document is not a reason to hold a production
fix. What it does is turn a daily red run into an intake, replacing the job
that currently depends on somebody remembering.

**The fast half is graded at the PR instead.**
`tests/guards/rulebook-drift.test.ts` runs every claim that needs no network
inside the `test` check, so adding a workflow file — or an area to the review
gate — turns a required check **red until the claim is updated in the same PR**.
The schedule is the backstop for what changes with no diff at all: a branch
protection setting flipped in the GitHub UI, most of all.

**An ungradeable claim fails here; it does not skip — with one bounded
exception.** The first version of this check had only two outcomes and argued
that the `read-check.yml` treatment did not apply, "because there is no
owner-side setup pending and nothing outside the repository to wait for". The
argument was sound and the premise was false: **branch protection is not
readable with the workflow token at any scope** (`administration` is not even a
valid `permissions:` key — asking for it made GitHub reject the whole file,
twice, in 0 seconds, publishing no check-run at all, which is why `gh pr checks`
showed nothing). So there are three outcomes:

| Outcome | Meaning | Run |
| --- | --- | --- |
| **not configured yet** | `RULEBOOK_PROTECTION_TOKEN` is unset; the five protection claims are skipped and named | green, `::warning::` |
| **could not be graded** | the secret exists and the read still came back empty — a revoked token, a renamed branch | **red** |
| **drift** | the repo and the skill disagree | **red** |

A skipped claim is never counted as a claim that held: every summary leads with
`Graded N/8` rather than with a tick, in all three cases. The exception lasts
exactly as long as the secret is missing.

**Owner setup (pending).** Until `RULEBOOK_PROTECTION_TOKEN` exists, the five
settings claims are off — which is the half that catches a branch-protection
change made in the GitHub UI, the one kind of change that leaves no diff
anywhere. To turn it on: a fine-grained personal access token scoped to this
repository alone, with **Repository permissions → Administration: Read-only**
and nothing else, saved as a repository secret named
`RULEBOOK_PROTECTION_TOKEN`. It reads settings; it can change none.

**What this does not close.** The repo↔claim gap is now mechanical. The
claim↔skill gap is not, and cannot be: a skill document cannot hold a pointer
into a repository an agent may not have checked out. That hop is Forge's, which
is why every finding names the skill section to open.

## Branch protection (configured 2026-09-09, DREAMCRM-10; strict since 2026-09-10, DREAMCRM-19; admins included since 2026-09-14, DREAMCRM-40)

`main` requires the `test` and `e2e` checks to pass before a PR can merge,
requires branches to be up to date first, and cannot be force-pushed or deleted.
Since 2026-09-14 every one of those rules binds **every** account, the repo
owner's included; there is no standing bypass. The one deliberate hatch and how
to use it is at the end of this section.
The settings and the reasoning behind each:

- **Required checks: `test`, `e2e`.** `test` is also enforced on `main` by
  `deploy.yml`, but `e2e` is not — a PR is the *only* place the browser suite
  gates anything, so without it required, nothing enforces E2E at all.
- **"Up to date before merging" is ON** (`strict: true`, since 2026-09-10). A PR
  must be current with `main` before it can merge, so its `test` and `e2e` runs
  are against effectively the tree that will exist after the merge. This closes
  most of the stale-merge gap described above at the PR, leaving
  `post-merge-e2e.yml` as the backstop for the rest (a race, or a fix landed
  through the emergency hatch below — until 2026-09-14 "an admin override" and
  "a direct push" belonged on this list too, and no longer do).

  The cost is real and was accepted knowingly: every merge invalidates every
  other open PR's checks. That is why **`allow_update_branch` is ON** (enabled
  2026-09-10, DREAMCRM-25) — GitHub now updates an auto-merge-armed branch
  itself when `main` advances, instead of parking it at
  `mergeStateStatus: BEHIND` until a human notices, which is exactly how PR #524
  stalled. That combination, not `strict` on its own, is what makes the rule
  survivable with several agents landing work in parallel; do not turn one off
  without the other.
- **Reviews are NOT required** by GitHub. Agents merge their own PRs here;
  requiring an approving review would deadlock the workflow rather than add a
  reader. The repo's own pre-merge review gate (see the `dreamcrm-conventions`
  skill) is a convention enforced by agents, not by branch protection.
- **Admins ARE included** (`enforce_admins: true`, since 2026-09-14,
  DREAMCRM-40). Everything above applies to every account without exception.

  This bullet used to say the opposite, and its rationale was wrong twice over
  — worth keeping, because both mistakes are easy to make again.

  **`enforce_admins: false` was never scoped to the checks.** It exempts admins
  from *every* restriction on the branch, not just the required contexts. So
  while this file advertised `allow_force_pushes: false` and
  `allow_deletions: false` above, neither actually bound the only account that
  touches this repo: a bare `git push origin main` was accepted, and so was a
  `push --force` rewriting the history of the branch that auto-deploys to
  production with migrations applying on boot. The old rationale — "an admin has
  to reach for an explicit override (`gh pr merge --admin`), so bypass is not
  the easy path" — described one path out of several and got the shape of the
  hole wrong. Bypass *was* the easy path; nothing had to be reached for.

  **It was not a human-scoped hatch either.**
  `gh api repos/DreamCreateWeb/DreamCRM/collaborators` returns exactly one
  principal (`DreamCreateWeb`, `role_name: admin`), and that is the same account
  every agent runtime authenticates as (`gh auth status`). "A human with admin
  rights could skip the tests" actually meant the entire agent fleet held the
  bypass, continuously, on every run. **Answer any future "who can bypass this"
  question from `/collaborators` and `gh auth status`, never from who you
  picture at the keyboard** — describing the bypass in terms of a *person* is
  precisely why it stayed mis-modelled here for five days.

  Nothing had actually gone wrong: the last forty-plus changes all went through
  a PR with the checks run. The change was made because a door held shut by
  habit is not a safeguard.

  Confirmed by watching it refuse rather than assuming it would — an
  `--allow-empty` commit pushed at `main` returned
  `GH006: Protected branch update failed for refs/heads/main. - 2 of 2 required
  status checks are expected`.

Two consequences worth knowing:

- A PR opened **before** a workflow file existed never gets that check reported
  and can no longer merge. Push any commit to the branch to trigger a fresh run.
  (This is how PR #488 merged with no CI run at all on 2026-09-09, before
  protection was on.)
- Read the current settings with
  `gh api repos/DreamCreateWeb/DreamCRM/branches/main/protection`, and the
  repository-level merge settings (including `allow_update_branch` and
  `allow_auto_merge`) with `gh api repos/DreamCreateWeb/DreamCRM`.

### The emergency hatch (for an Actions outage or a jammed runner)

`enforce_admins` does not govern who may *edit* branch protection — an admin
keeps that regardless. Closing it therefore converted an ambient always-open
bypass into a deliberate two-step that leaves a settings-change record; it did
not lock anyone out. Note that `gh pr merge --admin` no longer bypasses the
checks either, so these commands are the whole procedure:

```bash
# open the hatch (required checks stop applying to the admin account)
gh api -X DELETE repos/DreamCreateWeb/DreamCRM/branches/main/protection/enforce_admins
# ... land the emergency fix ...
# close it again — in the same sitting, not "later"
gh api -X POST repos/DreamCreateWeb/DreamCRM/branches/main/protection/enforce_admins
# verify
gh api repos/DreamCreateWeb/DreamCRM/branches/main/protection --jq '.enforce_admins.enabled'
```

Both directions were round-tripped on 2026-09-14 before being written down here,
so this is a path known to work, not one assumed to.

## Suite health rules

Things that have already bitten this suite. Keep them true.

- **No network in unit tests.** happy-dom treats an `<iframe src>` as a real
  navigation and will fetch it; `vitest.config.ts` disables child-frame
  navigation to stop that. A unit test that reaches the network passes or fails
  based on what is listening on the dev box.
- **Timeouts are hang detectors, not assertions.** A test file that loads the
  module under test with `await import()` *inside* a test bills that one test for
  a cold module graph (next + drizzle + the schema barrels) while its siblings
  report 0ms. 43 files did this — an earlier note here said 111, which counted
  `await import()` inside `vi.mock` factories; those are hoisted and cost a test
  nothing. DREAMCRM-19 pre-loaded 35 of the 43 during collection via
  `tests/prewarm.ts`, so the set of files that can be the unlucky one is now 8.
  **The budget stays 20s, and since 2026-09-14 that is a DECISION rather than a
  pending item.** Those remaining 8 defer on purpose and still reach ~4.3s on
  their first test under load; cutting to 10s would leave them barely 2x
  headroom. Lowering it is earned by pre-loading those 8 — each needs its own
  judgement about whether the module reads its env at import time or at call
  time — and re-measuring, not by deciding failures should be faster.

  That work was carried on the ledger twice, deferred twice, and struck on the
  third pass (DREAMCRM-48; `docs/RELEASE.md` Part 5 has the entry and the
  evidence). A timeout is a hang detector, so a lower number buys only a faster
  report of a hang that is not happening — and across the 200 Actions runs that
  span the whole life of this budget, nothing has hit it: no vitest timeout in
  `test`, none in `nightly-test`, and none in `tz-canary`, which is worth
  checking on its own because `continue-on-error: true` means a red one never
  shows up as a failed run. **One vitest timeout in any of those three reopens
  it** — and the answer then is still the pre-load work and a re-measure. The
  recipe stays in `vitest.config.ts`; striking the ledger entry costs nothing
  but the queue slot.
- **Never install packages while the suite is running.** pnpm relinks `next` into
  a new virtual-store path mid-run and mocks stop matching the runtime copy;
  it produced 78 bogus failures once.
- **`TZ=UTC` is pinned** in `vitest.config.ts` because prod's clock is UTC.
  `TEST_TZ` is the one deliberate way past the pin and has exactly one caller:
  the `tz-canary` job. An ambient `TZ` from a dev box or a runner image must
  never silently unpin the suite.
- **Windows is a supported dev platform.** Guard tests that scan the filesystem
  must normalize path separators before comparing against an allowlist.
