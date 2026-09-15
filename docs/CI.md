# CI — what gates what

Seven workflows. Only two of them can stop anything; the other five are alarms
and advisories.

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

**The two newest ones touch production but gate nothing** (DREAMCRM-42;
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

## The two alarms

Neither of these gates a merge or a deploy. That is the point: they can afford to
run the slower, noisier, more informative shape of the suite.

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

`review-gate.yml` reads which files a PR touches and says, on the run's job
summary and as a `needs-sentinel-review` label, whether the PR owes Sentinel a
review before it merges.

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
  **The budget stays 20s.** Those remaining 8 defer on purpose and still reach
  ~4.3s on their first test under load; cutting to 10s would leave them barely
  2x headroom. Lowering it is earned by pre-loading those 8 — each needs its own
  judgement about whether the module reads its env at import time or at call
  time — and re-measuring, not by deciding failures should be faster.
- **Never install packages while the suite is running.** pnpm relinks `next` into
  a new virtual-store path mid-run and mocks stop matching the runtime copy;
  it produced 78 bogus failures once.
- **`TZ=UTC` is pinned** in `vitest.config.ts` because prod's clock is UTC.
  `TEST_TZ` is the one deliberate way past the pin and has exactly one caller:
  the `tz-canary` job. An ambient `TZ` from a dev box or a runner image must
  never silently unpin the suite.
- **Windows is a supported dev platform.** Guard tests that scan the filesystem
  must normalize path separators before comparing against an allowlist.
