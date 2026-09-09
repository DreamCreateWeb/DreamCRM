# CI — what gates what

Two workflows, one gate. Both run `pnpm typecheck` + the full vitest suite; the
difference is only what they protect.

| Workflow | Trigger | Jobs | Protects |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | `pull_request` | `test`, `e2e` | the merge |
| `.github/workflows/deploy.yml` | `push` to `main` | `test` → `deploy` | production |

The unit gate is deliberately duplicated rather than shared. `deploy` needs its
own `test` job so it can `needs:` it — that is what makes a red `main` unable to
reach CodeBuild, since `main` auto-deploys with migrations applying on boot.
Keeping it inside `deploy.yml` (instead of also firing `ci.yml` on push) means a
merge runs the suite once, not twice. **If you change one `test` job, change the
other** — they are meant to be identical.

`e2e` runs only on PRs. It is the expensive one (stands up a throwaway Postgres
from the runner image's binaries, applies every migration from zero — a
deploy-path rehearsal — then builds, serves, and runs Playwright). See
`docs/E2E.md`.

## Branch protection (configured 2026-09-09, DREAMCRM-10)

`main` requires the `test` and `e2e` checks to pass before a PR can merge, and
cannot be force-pushed or deleted. The settings and the reasoning behind each:

- **Required checks: `test`, `e2e`.** `test` is also enforced on `main` by
  `deploy.yml`, but `e2e` is not — a PR is the *only* place the browser suite
  runs, so without it required, nothing enforces E2E at all.
- **"Up to date before merging" is OFF** (`strict: false`). Turning it on makes
  every merge invalidate every other open PR's checks, which with several agents
  landing work in parallel becomes a rebase treadmill. The safety it would buy is
  already covered from the other side: `deploy.yml` re-runs the full suite
  against merged `main` before anything ships, so a semantic conflict between two
  green PRs is caught before prod, not after.
- **Reviews are NOT required.** Agents merge their own PRs here; requiring an
  approving review would deadlock the workflow rather than add a reader.
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
  `gh api repos/DreamCreateWeb/DreamCRM/branches/main/protection`.

## Suite health rules

Things that have already bitten this suite. Keep them true.

- **No network in unit tests.** happy-dom treats an `<iframe src>` as a real
  navigation and will fetch it; `vitest.config.ts` disables child-frame
  navigation to stop that. A unit test that reaches the network passes or fails
  based on what is listening on the dev box.
- **Timeouts are hang detectors, not assertions.** 111 test files load the module
  under test with `await import()` inside the first `it()`, so that test alone is
  billed for a cold module graph (next + drizzle + schema barrels) while its
  siblings report 0ms. The budget is 20s for exactly this reason — do not tune it
  back down to "make failures faster".
- **Never install packages while the suite is running.** pnpm relinks `next` into
  a new virtual-store path mid-run and mocks stop matching the runtime copy;
  it produced 78 bogus failures once.
- **`TZ=UTC` is pinned** in `vitest.config.ts` because prod's clock is UTC.
- **Windows is a supported dev platform.** Guard tests that scan the filesystem
  must normalize path separators before comparing against an allowlist.
