# CI — what gates what

Four workflows. Only two of them can stop anything; the other two are alarms.

| Workflow | Trigger | Jobs | Protects | Blocking? |
| --- | --- | --- | --- | --- |
| `.github/workflows/ci.yml` | `pull_request` | `test`, `e2e` | the merge | yes — both are required checks |
| `.github/workflows/deploy.yml` | `push` to `main` | `test` → `deploy` | production | yes — `deploy` `needs:` `test` |
| `.github/workflows/post-merge-e2e.yml` | `push` to `main` | `e2e-post-merge` | the tree that just shipped | no — alert only |
| `.github/workflows/nightly.yml` | `schedule` 07:00 UTC + dispatch | `nightly-test`, `nightly-e2e`, `tz-canary` | finding clock/race failures before someone trips over them | no — signal only |

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
- **`nightly.yml`** runs the same gates on a schedule at 07:00 UTC (03:00 ET) —
  after the day's merges have landed, long before anyone starts work. Before it
  existed, nothing ran the suite except a PR or a merge, so a clock- or
  race-dependent failure could only be found by accident on somebody else's
  unrelated PR. Both flakes found in the DREAMCRM-19 cycle were found exactly
  that way.

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

## Branch protection (configured 2026-09-09, DREAMCRM-10; strict since 2026-09-10, DREAMCRM-19)

`main` requires the `test` and `e2e` checks to pass before a PR can merge,
requires branches to be up to date first, and cannot be force-pushed or deleted.
The settings and the reasoning behind each:

- **Required checks: `test`, `e2e`.** `test` is also enforced on `main` by
  `deploy.yml`, but `e2e` is not — a PR is the *only* place the browser suite
  gates anything, so without it required, nothing enforces E2E at all.
- **"Up to date before merging" is ON** (`strict: true`, since 2026-09-10). A PR
  must be current with `main` before it can merge, so its `test` and `e2e` runs
  are against effectively the tree that will exist after the merge. This closes
  most of the stale-merge gap described above at the PR, leaving
  `post-merge-e2e.yml` as the backstop for the rest (an admin override, a direct
  push, a race).

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
- **Admins are not included** (`enforce_admins: false`). The checks still block
  the normal merge path for everyone — an admin has to reach for an explicit
  override (`gh pr merge --admin`) to bypass, which is deliberate: it keeps an
  escape hatch for a GitHub Actions outage without making bypass the easy path.

Two consequences worth knowing:

- A PR opened **before** a workflow file existed never gets that check reported
  and can no longer merge. Push any commit to the branch to trigger a fresh run.
  (This is how PR #488 merged with no CI run at all on 2026-09-09, before
  protection was on.)
- Read the current settings with
  `gh api repos/DreamCreateWeb/DreamCRM/branches/main/protection`, and the
  repository-level merge settings (including `allow_update_branch` and
  `allow_auto_merge`) with `gh api repos/DreamCreateWeb/DreamCRM`.

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
