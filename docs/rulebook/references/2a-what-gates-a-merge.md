# §2a. What actually gates a merge (re-verified against the live repo 2026-09-22)

*`dreamcrm-conventions` §2a. `SKILL.md` is the map and carries §§4, 5, 7, 9 and 10 in full.*

Two checks can block a merge to `main`: the required contexts `test` and `e2e`,
both from `.github/workflows/ci.yml`. **Re-read off the API on 2026-09-22 and
unchanged**: `contexts: ["test", "e2e"]`, `strict: true`,
`enforce_admins: true`, `allow_force_pushes: false`, `allow_deletions: false`,
`required_linear_history: false`, fourteen workflow files (the count below was
stale at TWELVE when this page said it had not drifted — see there), nine §3 review areas in
`GATE_RULES`, and the four merge-method toggles plus `allow_update_branch` and
`delete_branch_on_merge` all as described below. Nothing on this page drifted. Branch protection is `strict: true` (a
branch must be up to date with `main` before it merges) and the repository's
`allow_update_branch` is `true`.

**WHAT `allow_update_branch` ACTUALLY DOES, corrected against observation
(Vesper's intake, 2026-09-23, DREAMCRM-109).** This page used to say GitHub
"refreshes an auto-merge-armed branch itself when `main` advances", full stop.
That is what the setting is for and it is not what a busy queue looks like:
**#669 took FIVE `update-branch` cycles over half an hour with auto-merge
armed.** Each refresh re-runs the required checks, `main` moves again while
they run, and the branch is behind before they finish. So the honest sentence
is that the setting removes the need for a human to PRESS the button, not the
need for the branch to be brought forward repeatedly — and on a queue moving
faster than `test` + `e2e` take, arming auto-merge and walking away can burn
half an hour without merging anything. Watch it, or merge it by hand when you
are next in line.

The two settings still move together — `strict: true` without
`allow_update_branch` is a rebase treadmill, and it is what parked #524
`BEHIND` until a person noticed. What is NOT decided here is the lever that
would actually fix the throughput problem, which is Sentinel's recommendation
on its own issue this slate; this entry is the corrected description, and the
decision is pending rather than absent.

**Those checks bind every account, the owner's included** (`enforce_admins:
true`, set 2026-09-14 on DREAMCRM-40 — Sentinel's call under the ruling in §3).
Until then it was `false`, and how that was *described* is why it stayed wrong,
so both halves are worth carrying:

- **`enforce_admins: false` was never scoped to the checks.** It exempts admins
  from *every* restriction on the branch. So `allow_force_pushes: false` and
  `allow_deletions: false` — advertised here and in `docs/CI.md` — did not bind
  the one account that touches this repo: a bare `git push origin main` was
  accepted, and so was a `push --force` rewriting the history of the branch that
  auto-deploys with migrations applying on boot. Those settings are binding now,
  as written.
- **Answer "who can bypass this" from `/collaborators` and `gh auth status`, not
  from who you picture at the keyboard.** The repo has exactly one collaborator
  (`DreamCreateWeb`, admin) and that is the account every agent runtime
  authenticates as. "A human with admin rights could skip the tests" therefore
  meant the whole agent fleet held the bypass, continuously, on every run. The
  rulebook framed a fleet-wide standing exemption as one person's prerogative,
  and nobody re-examined it for five days. Nothing had gone wrong — forty-plus
  changes had all gone through a PR with the checks run — but that was habit,
  not a safeguard.

The escape hatch survives, now deliberate instead of ambient: `enforce_admins`
does not govern who may *edit* protection, so an admin can still open it, land
an emergency fix, and close it — two commands, leaving a settings-change record.
`gh pr merge --admin` no longer bypasses anything either. `docs/CI.md` owns the
procedure under "The emergency hatch"; do not restate the commands here.

There are fourteen workflow files and **twelve of them gate nothing** — only
`ci.yml` and `deploy.yml` publish a required context, which is the only thing
that decides it (`WORKFLOW_CENSUS` in `scripts/rulebook-drift.mjs` is where
that is asserted against the tree, and it is the copy a test can fail on).
`e2e-flake-hunt.yml` is the twelfth, new 2026-09-23 on #680: `workflow_dispatch`
only, so it cannot hold a merge. `push-alarm.yml` is the fourteenth, new
2026-09-23 on DREAMCRM-115 — the repository's FIRST `workflow_run`-triggered
file; it runs entirely after `deploy.yml` has finished, so it cannot hold a
merge either.

**THIS PARAGRAPH'S COUNT WAS WRONG BY ONE WHEN DREAMCRM-115 OPENED IT, AND THE
WAY IT WAS WRONG IS the more useful half.** It said TWELVE while the tree held
thirteen: `schedule-heartbeat.yml` (#666) landed the same evening this page was
re-verified and never reached the sentence. Both numbers here are prose — the
graded copy is `WORKFLOW_CENSUS`, and #666 DID update that, so
`rulebook-drift.yml` was green every morning while this line was false. That is
the cost of a restated number written next to a derived one, and it is the
third time this repository has paid it (`docs/E2E.md`'s 36-against-18, and
`docs/CI.md`'s own "ten" which the same PR missed). The count stays prose
because there is nowhere better to put it; what changed is that it now says
where the truth is, one line up.
`nightly.yml` and `post-merge-e2e.yml` run after the fact, and `nightly.yml`'s
`tz-canary` job is `continue-on-error: true` — **a green nightly does not mean
the canary passed**; open the run and read that job. `review-gate.yml` (new
2026-09-14, #553) runs on every PR and is advisory by construction: its job is
named `review-gate (advisory, does not block the merge)`, it adds no required
context, has no `needs:`, and cannot stop a merge — see §3 for what it does do.

`read-check.yml` and `error-scan.yml` (new 2026-09-14, #565 / DREAMCRM-42) are
the other two, and they are a **new kind** of alarm here: the first that read
**production** rather than a CI run. Neither runs on a `pull_request`, neither
publishes a context, and both are dispatch-or-schedule only, so neither can
stop a merge. `read-check.yml` runs one named entry from the catalog in
`lib/read-checks.ts` under a `SELECT`-only role; its scheduled run is
`readonly-role-privileges`, and **a red run there means a credential column is
readable in production** — the one alarm in this repo worth interrupting
someone for. `error-scan.yml` scans the App Runner log groups every 30 minutes
and warns without ever failing.

 No `.yaml` workflow exists today, so
nothing is mis-graded yet.

**A local green is a claim about the STAGED tree, not the tree in front of
you.** Vesper's intake, 2026-09-15 (DREAMCRM-62 part 3): the repo's tree-walking
guards resolve their file list through `trackedFiles()`, which reads `git
ls-files` — so a file you have written but not `git add`ed **does not exist to
them**. The suite was run before staging, and the new guard could not see the
very file it was about to object to; CI, which grades a commit, saw it
immediately. That is the same family as the #597 miss (a local run reading a
different tree than CI, there by a file count) and it has a one-line habit as the
fix: **stage first, then run the guards.** The general rule is worth more than the
habit — when a check derives its input from git rather than from the filesystem,
"it passes locally" is scoped to what git can see, and an untracked file is the
one state where the working tree and the index disagree silently.

**And a green check SET is not evidence that a run happened for the commit you
are looking at.** Vesper's report, 2026-09-15 (DREAMCRM-62): one force-push to
PR #597 produced **no GitHub Actions run at all** — no `test`, no `e2e`, only
Vercel — while other branches' workflows ran normally in the same minutes. It
looks like a dropped `synchronize` event rather than anything about that branch:
the next push fired normally, and `gh workflow run ci.yml --ref <branch>`
recovered it.

**The consequence this paragraph first claimed was checked, and it did NOT
happen — read the correction as the method.** The original wording said the PR
was left carrying the previous commit's green ticks. Sentinel checked the other
side and all five check runs on #597 were bound to `94a4f03b` itself, so nothing
was stale-but-green there; the missing run was real and its dangerous sequel was
not. Both halves are worth keeping, because the check that settled it is exactly
the one this paragraph asks you to run: **check the run's head SHA rather than
the colour of the tick** (`gh pr checks <n>` against the PR's `headRefOid`, or
`gh run list --branch <branch>`), and dispatch a run if the head commit has none.
Branch protection will not do it for you — `strict: true` asks whether the branch
is up to date with `main`, not whether the checks on it ran against the head
commit. A missing run and a passing one look identical at a glance, so the
instrument is the SHA, not the colour. And note what produced the correction: a
reported symptom plus an inferred consequence, one of which somebody verified.
**Report the symptom you saw and mark the consequence you inferred as
inferred** — §10's measured-hex rule, one level up from colours.

**A green run on either is not evidence the check ran.** Both report *not
configured yet* — missing secret, a 503 from the route, an un-assumable IAM
role — as a `::warning::` and `exit 0`, deliberately, because they merged
before the owner-side setup existed and an alarm that has been red for a
fortnight for an unrelated reason is noise by the time it first matters. Until
Dustin finishes that setup (DREAMCRM-42), *every* run is the quiet kind. Open
the job summary; do not read the tick. `docs/CI.md` owns their table and
`docs/PROD-READ-ACCESS.md` is their runbook — do not restate either here.

`migration-check.yml` is the eighth (2026-09-14, #575 / DREAMCRM-46) and it is
the first workflow here that **gates something while publishing nothing**:
`deploy.yml` calls it with `uses:` under `needs: deploy` with no
`continue-on-error`, so a failed post-deploy migration check fails the deploy
run. It publishes no context and never runs on a PR, so it cannot hold a merge —
but "publishes nothing" and "gates nothing" have come apart, and they are not
the same question any more. Ask what a workflow can FAIL, not what it reports.

**The `deploy` job itself gained a SECOND thing it can fail on, and it changes
what the `deploy-main` concurrency group means** (#639 / DREAMCRM-86, on the PR
as of 2026-09-22, not yet on `main`). Until now the job exited the moment the
BUILD reported `SUCCEEDED`; the App Runner rollout fires from the buildspec's
`POST_BUILD` after that point, so a rollout that was accepted and then rolled
back looked exactly like one that served — which is how a merge on 2026-09-21
reported green on `test`, `e2e`, this job and `migration-check` while production
served the previous build for 2h 40m (measured by etag, not inferred;
`docs/RELEASE.md` Part 5). A final step runs `scripts/rollout-check.mjs`: it
polls the operation THIS run started — identified by a `ROLLOUT_SINCE` baseline
written before `start-build`, then latched by operation id — and requires
`describe-service` to report `RUNNING`, which is what turns "the rollout
finished" into "the new version is serving".

Two things follow for reading a deploy run. **The job now holds `deploy-main`
until the rollout is genuinely done**, which is what that group always claimed
to do — the real serialization had been the buildspec's 30x30s
`start-deployment` retry. A back-to-back merge's image build queues behind this
instead of racing it, and `migration-check` stays outside the group either way.
And **until the owner-side IAM grant lands, every run prints
`rollout UNVERIFIED` and stays GREEN** — `apprunner:ListOperations`,
`ListServices` and `DescribeService` on `DreamCRMGitHubActionsDeploy`, on
DREAMCRM-65's setup list. That is the DREAMCRM-42 shape one lane over and it
takes the same rule: **open the job summary, do not read the tick.** The degrade
is keyed to authorization errors alone, so it cannot spread — a throttle or a
timeout still fails the run — and it starts verifying on its own the moment the
grant lands, with no further change.

**`rulebook-drift.yml` is the ninth, and it is on `main`** — PR #571 /
DREAMCRM-53, `3ae1f612`, merged 2026-09-14. It is the only workflow pointed at
**this document**: every morning it reads branch protection, the repo's merge
settings, the workflow directory and `GATE_RULES` and diffs them against the
claims this section makes in prose, with `scripts/rulebook-drift.mjs` holding the
transcription, each claim tagged with the section that states it and the sentence
it states. It gates nothing — no `pull_request` trigger, no context, no `needs:`
— because a stale sentence in a document is not a reason to hold a production
fix. `docs/CI.md` owns its claim table and its setup; do not restate either here.

For the days before it merged **this section described it as live while it sat on
a branch**, and the claim was load bearing in three places: the census count
above, the guards list below, and the §3 sentence that told you an area reaching
`GATE_RULES` without reaching §3 turns `test` red. The rulebook had done to
itself precisely what §1 forbids of the defect ledger and §3 of a PR — written
fixed-but-unmerged down as live — written by the workflow's own author, about his
own branch, on the day it opened, which is the failure mode to watch for rather
than one to argue is unlikely. Both corrections came from the gate sweep, which
reads the workflow directory rather than the section describing it.

**The half of it that runs on every PR is the half that will stop your merge.**
`tests/guards/rulebook-drift.test.ts` is in the `test` check and grades every
claim readable off the checked-out tree — the workflow census, which workflows
may publish a required context, and `GATE_RULES`' area list. **Add a workflow
file, or an area to the review gate, and `test` goes red until the claim moves in
the same PR.** It also pins that `rulebook-drift.yml` never runs on a
`pull_request` and can never publish a `test` or `e2e` context, and it perturbs
every claim so each one must be SEEN to fail — a claim rewritten until it is
vacuously true looks exactly like a claim that holds.

**The settings half of it is OFF until the owner issues a token, and that is a
worked example of the not-configured-yet rule rather than an exception to it.**
It was drafted arguing the opposite — that an input it could not read should go red,
since "nothing external is pending" — and the argument was sound while the
premise was false: branch protection is not readable with the workflow token at
any scope, so the five protection claims need a credential this repo does not
have. Shipped as written, the alarm would have been red every morning from day
one for a reason that was not drift. It has **three** outcomes:
*not configured yet* (skipped, named, green), *could not be graded* (the secret
exists and the read still failed — red), and *drift* (red). A skipped claim is
never counted as a claim that held; every summary leads with `Graded N/8` rather
than a tick. The reusable half: **check the premise of a "this case is
different" argument against the environment it will actually run in.** This one
was caught in review; its first two runs had already failed in 0 seconds,
publishing no check-run, so `gh pr checks` showed nothing at all.

What it does not do is close the loop by itself, and there are two gaps worth
knowing. It compares the repo against a *transcription* of this prose, and
keeping that transcription equal to the prose is still a hop somebody makes —
Forge's — which is why every finding names the section to open. And **it cannot
see the #534 shape at all**: a new class of assertion inside an existing
required check moves none of the eight facts it grades, so `test` gaining a new
zero-tolerance rule still reaches this document by the sweep and the mention.
It closes the settings-and-census half. The assertion half stays human either
way. A green run means the repo has not drifted from what was written down — not
that what was written down is what this document says, and not that nothing new
can fail your PR. Note what it would still not have caught: this section was
wrong about the workflow census twice, and the drift check is the thing that
grades the census. A control cannot grade the sentence that claims the control
exists.

**`review-sweep.yml` is the tenth** — PR #593 / DREAMCRM-61, `9c96b0b7`, merged
2026-09-15. It is `review-gate.yml`'s post-merge half, and it answers the one
question that file's own header says it cannot: **not "is a review owed" but
"did the review happen".** Every morning at 06:47 UTC it lists the PRs merged
since a hard cut-off, and names the ones that merged carrying
`needs-sentinel-review` with no review recorded on them. It gates nothing — no
`pull_request` trigger, no context, no `needs:`, two read scopes, and it runs
after the merge commit is already on `main`. Do not "strengthen" it into a
required check; DREAMCRM-49's refusal of a blocking `review-gate` still holds and
this is not a way round it.

**Why the same forgeable signal that disqualified a gate is the right instrument
for an alarm** is the reusable half, and it is Sentinel's reading rather than an
argument reopened: a gate has to survive an **adversary**, and minting a pass
signal is the cheapest way past one; a sweep only has to survive **forgetting**,
which is what actually happened — #573 and #582 both merged owing a review, on
the same day, found a day later by a manual sweep somebody chose to run. Ask what
a control has to survive before deciding a weak signal disqualifies it.

**It depends on a convention, and that convention binds you when you merge** —
the verdict is written onto the PR itself. §3 carries it, because it is a rule
about how a PR is reviewed and landed rather than about what a workflow does.
Read it before you merge anything gated; without it a reviewed PR and a forgotten
one are indistinguishable from GitHub, which is the state this sweep found the
repo in. `docs/CI.md` owns the mechanics, the cut-off and the false-positive
table under "The sweep that asks whether the review happened"; do not restate
them here.

**Its value is one inbox deep, and the file says so rather than leaving it
assumed** — a red run is GitHub's default failed-run notification plus the
Actions tab, exactly like `post-merge-e2e.yml`. "We find out the same day" is
true only while somebody reads that. If it starts getting ignored, give it a real
addressee; do not delete it.

**It has one now, and the red state gets an owner** (new 2026-09-22,
DREAMCRM-91). That warning came true rather than staying hypothetical: six
consecutive red runs, `35094044453` (2026-09-16) through `35605207003`
(2026-09-21), over four PRs — #618, #599, #596, #594 — three of which had
genuinely been reviewed and never mirrored. Nobody owned clearing it, so after
six days the alarm read as wallpaper, and **PR #636 merged into that silence on
2026-09-22 carrying `needs-sentinel-review`, editing `scripts/review-gate.mjs`,
with no verdict anywhere.** A permanently-red alarm is a disabled alarm, and the
first thing this one disabled was the gate's own rule list.

- **A red sweep updates ONE standing issue assigned to Sentinel** — updated,
  never a new issue per run. It is DREAMCRM-93, "Standing: the post-merge review
  sweep's red entries", opened 2026-09-22 with #594 as its first entry. A new
  issue every morning is a second permanently-red alarm, not an owner. Whoever
  clears an entry says so on that issue; it closes when the run goes green and
  reopens the next time it is red.
- **The run's exit status is keyed on the set that is NEW since the sweep last
  went green, while the summary keeps printing every unremediated entry.** The
  text keeps Sentinel's property that an unremediated miss is not less true
  tomorrow. **Pin the lookup to LAST GREEN, explicitly.** Degrade it to *last
  run* and every miss becomes a one-day alarm, which is worse than the thing it
  replaced.

**Both halves shipped 2026-09-22 in #643 (`778adb3f`, DREAMCRM-92), and what the
second half buys is NARROWER than it first reads.** This is the correction worth
reading before you interpret a red week, and it is Sentinel's, from his
`APPROVE WITH NOTES` on that PR — the first draft of this section, the workflow
comment, `docs/CI.md` and the script's own docblock all claimed the sweep "no
longer stays red forever", and that is false.

**A red run does not advance the last-green instant.** So an unremediated entry
is newer than *last green* again tomorrow, and every morning after, until
somebody clears it — the run stays red for exactly as long as the queue is
dirty, precisely as before. The `standing` branch is only reachable when a record
DISAPPEARS after a green run, which is the deleted-verdict blind spot, not a
state the running system reaches on its own.

The true property is the narrow one, and it is still worth having: **once the
queue IS clear, a new miss is a NEW red rather than the continuation of an old
one, and a green morning is a positive claim that nothing is outstanding.** The
blunt corollary, stated because this file's whole discipline is stating what a
control cannot see: **this change alone would not have prevented #636.** Those six
red mornings were over four *unremediated* entries; under the new code the lookup
finds no green, fails closed, and all four are fresh — six red mornings again.
**The half that actually prevents the recurrence is the standing issue above,
plus somebody keeping the queue at zero.** A mechanism cannot substitute for an
owner; it can only make the owner's job legible.

Four more things the shipped version fixed in place, none of them optional
reading if you touch this file:

- **A failed last-green lookup FAILS CLOSED** — empty history, a throttled `gh`,
  a missing file all mean every entry counts as new and the run stays red, with
  the reason printed. The lookup is pinned twice over: the workflow asks
  `gh run list --branch main --status success` and `lastGreenAt` re-filters on
  `conclusion === 'success'` itself rather than trusting the flag.
- **`review-sweep.yml` gained `actions: read`** so the job can read its own run
  history. Three read scopes now, still no write scope, still no `pull_request`
  trigger, no required context and no `needs:` — it gates nothing and nothing on
  the deploy path is touched. It is on `.github/workflows/**`, so it went through
  §3's gate; that is the intake, not an exception to it.
- **`needs-forge-intake` is graded under its OWN later cut-off**,
  `INTAKE_SWEPT_SINCE = 2026-09-22T08:00:00Z`, because thirty merged PRs wore the
  label unread and judging them retroactively would open the half with thirty
  mostly-wrong findings. It was deliberately NOT nudged past #644 to make the
  first run green — that is the axe-ceiling mistake `SWEPT_SINCE`'s own docblock
  names, and #593 graded itself on the same precedent. **Special-pleading a
  cut-off to clear the one entry that is red is fixing the thermometer.**
- **Annotations truncate silently.** GitHub caps a step at 10 `::error` plus 10
  `::warning`, so a large standing queue loses the tail of the annotation list.
  The summary still carries everything; read that, not the annotations, when the
  queue is long.

**`schedule-heartbeat.yml` is the eleventh, and it is the alarm that watches the
other alarms** — DREAMCRM-99, PR #666 / Quinn, `82f365fd`, merged 2026-09-22
20:20:09Z on a Sentinel APPROVE. One daily job asserts every scheduled workflow
has a `schedule`-triggered run inside the window its own cron implies, with the
list derived from the cron entries in this directory rather than typed, so a
schedule added tomorrow is watched tomorrow. It gates nothing — no
`pull_request` trigger, no required context, no `needs:`. **It fails closed and
goes RED**, unlike `error-scan.yml`, and the discriminator is worth carrying:
there is no queue behind the red here, every finding is binary and
single-action, so the permanently-red-alarm argument at the foot of this section
does not apply and exit 0 would make this job the thing it was built to detect.

**What it changes for everyone else, which is bigger than the job itself.** The
guard cross-checks the derived list against `WORKFLOW_CENSUS`, so from this
merge **a new scheduled workflow with no census entry fails `test` by name.**
The census stops being a claim this document makes and becomes one the suite
enforces.

**Read the previous sentence precisely, because the distinction is the whole
reason the intake hop exists.** What the suite enforces is `WORKFLOW_CENSUS` in
`scripts/rulebook-drift.mjs` against the tree — a repo file, graded by a repo
test. **The count in THIS document is not graded by anything and cannot be.**
`scripts/rulebook-drift.mjs`'s own docblock says it outright: the skill lives
outside the repo, so no test can fail when the repo drifts from it; that file is
a tripwire strung between the two, not a check on this one. Forge asserted the
opposite on #666's intake record — that the merge would turn `test` red until
this paragraph moved — and that was **wrong**: Quinn shipped the census entry in
the same PR, `test` stayed green, and the prose here went stale silently, which
is exactly the failure the claim was meant to describe and the opposite of the
mechanism claimed for it. **The number below is therefore maintained by the
same-day intake hop and by nothing else.** That is not a gap to be closed by a
cleverer test; it is the reason the hop is a rule.

**One live defect in it, found at intake, owned by Quinn as its own small PR.**
The workflow's shell loop globs `.github/workflows/*.yml` while
`declaredSchedules` in `scripts/schedule-heartbeat.mjs` accepts `/\.ya?ml$/`.
Verified on `main`: a `.yaml` workflow carrying a cron would be derived by the
script, find no run entry, and be graded `never-fired`. **The direction is safe
— it fails closed — and that is what makes it worth writing down rather than
leaving to the fix**: the reader is sent to the 60-day-quiet-repository
re-enable banner when the cause is a file extension. A fail-closed bug that
misnames its own cause costs a morning, and the guard cannot catch it because
both halves are correct in isolation.

The required set is still **exactly `test` and `e2e`**. Making `review-gate`
required would be a branch-protection change, which is itself behind the review
gate; it is not done by editing that file. `ci.yml`'s `test` job additionally
runs `pnpm lint` (the jsx-a11y gate), PR-side only, so a lint failure blocks a
PR but not a push to `main`.

**#588 moved neither the census count nor the area list, and it is the reason to
say out loud that neither number is the question.** That PR (DREAMCRM-60,
`62acd835`, 2026-09-15)
touched three workflow files and added none: `ci.yml`, `deploy.yml` and both
suite-running jobs in `nightly.yml` each gained a single `git fetch` step before
`pnpm install`, so the axe ratchet below has a previous value to compare
against — four jobs, one line apiece. `rulebook-drift.test.ts` grades the census
COUNT and the `GATE_RULES` area list, so a change of this shape leaves it green,
and that is correct rather than a miss. Take the general form with you: **a
workflow diff that moves neither number is still a change to what your PR runs.**
Ask what the job can fail, not whether the directory listing moved. `docs/CI.md`
owns the step and the reason `actions/checkout` does not supply the ref on a
`pull_request`.
**One conditional worth pinning, because it is the kind that gets lost.** The
guard's workflow pin derives its job list from the workflow directory and is
deliberately INEXACT — it has a `run: |` blind spot and counts per file rather
than per job. What makes that survivable is the fail-on-missing decision above:
a job that lost the step is caught by the premise going red, not by the census
being complete. So if anyone ever makes the comparison skip on a missing ref,
**the census has to become exact first**, or a job could quietly lose the step
and the guard would report green. Do not move one without the other.

**A green `e2e` does not mean every spec passed.** `playwright.config.ts` sets
**What a surviving retry tells you, and it is more than "still flaky."**
Playwright's retry reuses the SAME throwaway Postgres, so the two attempts do not
differ in state — only in timing. Read the combination: a fault that fails the
first attempt **and** `retry #1` and then passes on a plain re-run at the same
SHA **is seeded STATE, not a timing race**, because the only thing that changed
between the failing pair and the passing run is the database. Vesper's hand-off
on `e2e/portal-billing.spec.ts:176` (2026-09-15, run `35028171588`) is the worked
example — `getByLabel('Payment amount in dollars')` resolving to two elements,
most likely a fixture patient carrying two unpaid balances rather than the one
intended. The trap in the obvious fix is worth as much as the diagnosis:
`.first()` makes a wrong fixture INVISIBLE, so the assertion that matters is that
the patient has exactly ONE payable balance. **A retry is an instrument, not just
a second chance — what it holds constant is what it tells you.**

`retries: 1` under CI, and that is deliberate — `retries: 0` trades a quiet flake
for a loud false alarm on a required check. The cost is that a spec which fails
once and passes on the second attempt reports `e2e` **green**, and until
2026-09-14 the failed attempt's trace and screenshot were deleted with the
runner. Since #552/#556 all three places the harness runs (`ci.yml`,
`nightly.yml`, `post-merge-e2e.yml`) end with a step that names any test that
only passed on a retry — a job-summary table, a `::warning`, and the Playwright
report now kept on `failure() || flaky` rather than `failure()`. The reporter
never exits non-zero, so it cannot itself gate anything. **Read the job summary,
not just the green tick**: the first `e2e` run of the PR that shipped this caught
`booking.spec.ts` flaking on `color-contrast` — a real contrast miss, live,
under a required check that had already gone green.

**The `e2e` check also enforces accessibility** (since 2026-09-10, #534).
Every spec that loads a page runs axe-core at that stop, and
`e2e/axe-baseline.ts` holds a per-(stop, rule) **ceiling** for the violations
that were already live when the checks arrived. The part that catches people
out: a rule not listed for a stop, and a stop not listed at all, tolerate
**zero** — so a new contrast miss, or a new *kind* of violation at a stop that
already carries debt, fails a required check on arrival. Ceilings only ever go
down; shrink or delete the entry in the same PR as the fix. **Raising a ceiling
to get green is weakening a failing test** — the rule above applies to a number
exactly as it does to an assertion. `docs/E2E.md` owns the mechanics, the
exemptions and the current count; do not restate the number here.

**That last rule stopped being an honour rule on 2026-09-15.** #588
(DREAMCRM-60, `62acd835`, with the follow-through #595 `3b9d1dd7`) added
`tests/guards/axe-baseline-ratchet.test.ts` to `test`: it reads every entry's
value as `origin/main` has it and fails any increase, **including a (stop, rule)
absent from `main` entirely**, because an unlisted pair tolerates zero and adding
`{ 'color-contrast': 2 }` to a clean stop is a raise from 0 to 2 wearing the
clothes of a new line. That is the likeliest shape of the defect and the one to
watch for in a diff. For four batches before it the state was the opposite:
raise a number by one and `pnpm test` was green, no guard read it and no label
fired, which is what made it the last remaining way to weaken a required check
with
nobody seeing it (`docs/RELEASE.md` Part 5, filed by Sentinel on DREAMCRM-49).
Three parts of its design outlive the merge and are worth knowing before you meet
it:

- **It fails rather than skips when `origin/main` is missing under CI.** That is
  the deliberate opposite of the not-configured-yet answer above, and it is
  defensible for one reason only — unlike branch protection, the input here IS
  readable in the environment it runs in, given one line of workflow. So the
  fetch step is pinned in every job that runs the suite (see the census note
  above), and the premise is made true rather than assumed. Outside CI it skips
  loudly and prints the fetch command. Read the pair as the rule: **an input you
  cannot make readable gets a named skip; an input you can gets a hard failure
  and the line of setup that earns it.**
  It is **two assertions with two different scopes**, and that split is the more
  portable half of the lesson. The PREMISE — `origin/main` is here to be read —
  is asserted on **every** event, `push` and `schedule` included; nothing skips
  it, so a deleted fetch step still goes red on the runs where it would otherwise
  hide. The COMPARISON is scoped off **`push` or `schedule`**, because on both
  HEAD is already on `main`: the comparison grades main against itself, which is
  vacuous when it wins the race with a concurrent merge and a **false red** when
  it loses. `deploy.yml` runs `test` without `cancel-in-progress` deliberately,
  so two merges inside a minute overlap — and if the second SHRINKS a ceiling
  (the baseline moved in 10 of the last 90 PRs) the first one's run reads
  `origin/main` as the second and reports RAISED on a tree that raised nothing:
  red `test`, skipped deploy, about a branch that no longer exists. Nothing is
  lost by skipping, because every tree that reaches `main` was graded on its own
  PR with the ref present. **`schedule` came second, in #595, and it came from
  the rule rather than from a new symptom**: GitHub runs `schedule` only from the
  default branch, so `nightly-test` and `tz-canary` were grading main against
  main and carrying the identical race — nobody had reported it. A conclusion
  scoped by a *property* rather than by the event that first showed it is a
  conclusion you can re-derive the rest of the way. One gap is knowingly left
  open and written into the code: a `workflow_dispatch` on `main` still compares
  and is still vacuous, because no event name separates it from a dispatch on a
  branch — and a manual dispatch is attended by definition.
  **The rule to carry: a guard can be uniformly premised and still be
  selectively conclusive — scope the conclusion, never the premise.** A premise
  checked on only some events is not pinned.
  **And the honest-looking property was the wrong instrument — worth a paragraph,
  because it is the trap this whole bullet walks past.** The property the code
  describes is *HEAD is already on main*, so the obvious test is `HEAD ===
  origin/main`. It was tried and it **fails at the exact case it exists for**: in
  the race HEAD is on main but BEHIND the fetched ref, so the two differ
  precisely when the comparison is wrong. It also silently switched off local
  grading for anyone with uncommitted edits on `main`, which is how this repo
  documents working. It read correctly and only failed when run — §2d's point
  about a guard being evidence only in proportion to what it has been shown,
  arriving one level up, in the guard's own design. The genuine property is
  `git merge-base --is-ancestor`, and it needs shared history that all four jobs
  deliberately do not fetch (`--depth=1`); deepening them is a real trade and an
  open decision, not a defect. The event name is a **proxy**, and here it is the
  right one.
  That sits oddly beside §2d's *assert the answer, not a proxy for it*, so hold
  both with the boundary stated: **a proxy is right when the answer needs state
  you have deliberately chosen not to fetch — and then you name it as a proxy and
  record what it cannot see.** This one is named, and what it cannot see is
  written down: `workflow_dispatch` on `main`, above. A proxy you reached for
  because the real answer was inconvenient to compute is the §2d case; a proxy
  you reached for because the real answer needs data you chose not to have is
  this one. The difference is whether the cost was chosen and recorded.
- **The rare legitimate raise is written down in `e2e/axe-baseline-raises.ts`** —
  stop, rule, `from`, `to`, date, `ref` and an argument. The bar is that the
  violations are PRE-EXISTING: a stop nothing had ever scanned, which is how the
  three portal-billing stops arrived on 2026-09-14. "A new one needs somewhere to
  go" is not an argument and there is no wording of it that becomes one. `from`
  and `to` must match `origin/main` and this tree exactly — an entry authorising
  1 → 2 does not authorise 1 → 5.
- **The entry's PREMISE is re-asserted every run, not merely its match.** Once
  the ceiling it describes moves off `to` — which is what happens the moment
  somebody fixes the defect and shrinks it — `test` goes red until the entry is
  deleted. This is the §2b dead-exemption lesson (#587) applied before the gap
  could reopen: three of this repo's four dead-exemption detectors still ask only
  whether an exemption matches something, never whether its reason still holds.
  This is the second that asks both.

**When the baseline EMPTIES, the ratchet stops being a monotonicity rule and
becomes a zero, and it has.** PR #597 (DREAMCRM-62, UI batch 64, **MERGED
2026-09-15, `3819a61e`**) took `A11Y_BASELINE` to `{}`, and batch 65 (#610,
`bd102e11`) then moved every clinic-site brand ink underneath it and still
reported `[a11y] ok` at all 39 stops with zero carried — the empty baseline
surviving a colour change is better evidence than the day it was emptied. It
carried 214
carried violations at switch-on five days earlier, then eight, then none, with
the `e2e` log reporting `[a11y] ok` at **all 39 stops and nothing carried by the
baseline** — which is the proof, rather than the file merely being empty. Read
that together with the ratchet above and the gate changes character: with no
entries left every (stop, rule) tolerates zero, and "absent from `main` is a
raise from 0" means the only way to carry a new violation is an argued entry in
`e2e/axe-baseline-raises.ts`, which is on §3's review gate. From that merge the
accessibility gate is zero-tolerance **by construction rather than by
diligence** — and the headroom table having nothing to report is the "no table
is not silence" case below, not a broken reporter.

**The stop count is not a constant, and the "39" above is a measurement, not a
fact about the suite.** It is **48 as of 2026-09-16** (#626-#629, DREAMCRM-78 /
79 / 80): nine marketing stops arrived in one batch and took the marketing site
from two scanned pages to eleven — `home`, `pricing`, `why`, `resources`,
`resource guide`, `grade`, `roi`, `partner program`, `changelog`, `docs`,
`doc article`. Every one of them holds a ceiling of ZERO with no exclusion at
all, which is the only kind of stop whose zero means what it says. Count the
`expectNoA11yViolations` call sites rather than quoting a number from here; what
this section is for is the shape. **Exactly one marketing page has no stop —
`/product`** — and the reason is an exclusion's SHAPE rather than a decision:
`DECORATIVE_MOCKS` keys on the drift wrapper (`.mkt-float >`), the tour's nine
mocks do not float, so the selector matches nothing there and `deadExclusions`
would fail the stop by name.

**DREAMCRM-87 / PR #647 closes that** — a `marketing: product` stop at ZERO on
`PRODUCT_MOCKS`, an exclusion derived from what the mocks say they are
(`[data-mkt-mock="true"][aria-hidden="true"]`) rather than from where the page
puts them. **STATE: MERGED — `71f4037e` (#647), 2026-09-22 11:55:16Z**, with
Sentinel's blocking finding CLOSED rather than carried. Flipped at the
2026-09-22T23:5xZ sweep, having said REQUEST CHANGES for eleven hours after the
merge because the STATE re-read pass was grepping §2 only. **So the census above is NO LONGER exact: `/product` has
a stop now, and every marketing page has one.** Two details from it are worth
carrying whatever happens to the PR. **A stop that loads a page and scans grades
roughly the first screenful** — every chapter illustration on the tour sits
inside a `ScrollReveal` at `opacity-0`, and an element at opacity 0 is not
measured by axe at all, so the spec walks the page first. And **where the walk
ENDS is part of the instrument**: the first draft finished at `scrollTo(0, 0)`,
where the chapter rail has no active chip, so the planted defect had nothing
carrying its ink and the watched-fail run came back GREEN with the defect live
(§2d's "a red run that passes is a broken test"). It now ends at `#frontdesk`
and asserts an `[aria-current="true"]` is visible before scanning — grading MORE
of the page than the first draft, not less. Zero rather than a ceiling cost two
real fixes rather than a pardon, which is the standard the other eleven stops
set.

**The two populations this section called uncovered are covered by DREAMCRM-98
(PR #669, OPEN as of 2026-09-22, Vesper).** Counted the way this section asks —
`expectNoA11yViolations` call sites rather than a number quoted from here — the
product stop population moves **49 → 58** on that branch: eight in
`e2e/token-landings.spec.ts` for the single-letter pages somebody opens from a
text (`/b` pay your balance, `/i` your payment plan, `/r` leave a review, `/w`
an earlier opening, `/g` the practice grade, `/d` book a demo, `/e` and `/h`
the two conference-headshot pages — `token-journeys.spec.ts` already walked `/c`
and `/n`), and ONE in `e2e/partner-portal.spec.ts`, the fourth persona signed
in, which had no stop at all while its public sales page has had one since the
first batch. **Nine, not ten** — the partner spec's closed-door test asserts the
redirect and never scans, and the two are easy to miscount together.

Two things about that batch are the shape rather than the number. **Every one of
the nine holds a ceiling of ZERO with no exclusion**, so `e2e/axe-baseline.ts`
stays `{}` and `e2e/axe-baseline-raises.ts` was not opened — the zero-tolerance-
by-construction claim above surviving nine new stops on never-scanned pages is
better evidence than the day the baseline emptied. And **the state each page is
scanned in is chosen, not incidental**: `/b` and `/i` render a "call us" apology
without an active connected account, a started slot reads EXPIRED at `/w`, and
`/d` draws one sentence instead of the picker unless booking is on. Get the seed
wrong and the page under the stop silently swaps for its empty state while the
suite goes on passing — which is a stop that cannot fail, the standing
convention at the top of this section, arriving by way of a fixture rather than
a workflow. `docs/E2E.md` carries the table of chosen states; read it before
changing that seed.


`/blog` and `/blog/[slug]` are out for the other
standing reason — database-backed bodies under a seed-free suite. Both are
written down beside the baseline, which is what makes them gaps rather than
holes (§2).

**One thing to know before you inherit a ceiling you did not write: a carried
violation prints NOTHING.** `expectNoA11yViolations` details elements and colours
only for violations ABOVE a ceiling, so eight real defects sat behind eight
ceilings with no way to say what any of them were — a number that means "room
to hide in" and no description of who is hiding. The way out is cheap and worth
copying: **zero the baseline on a throwaway branch and dispatch `ci.yml` at
it.** Four minutes (`actions/runs/34993335573`) printed all eight with selectors
and measured colours, and revealed that six of the eight were one shape — which
no amount of reading the ceilings could have told anybody.

**Do not rely on the `::warning` to tell you a ceiling has gone stale — read the
headroom table instead.** The harness tolerates a wobble of one, so a ceiling
that is now exactly one too high prints no "shrink me" annotation at all, and
four ceilings stood a batch longer than they needed to for exactly that reason.
Since 2026-09-15 (#573 / DREAMCRM-48, `4d0eb2f7`) every harness run **ends with
one table naming each (stop, rule) that measured under its ceiling**, on the job
summary and in the log. It is reporting only — it cannot fail a run and holds no
opinion about what should be shrunk — so the `::warning` and what fails are both
exactly as they were. Two things to know before you shrink on it: the count it
shows is the **worst** any attempt saw (shrinking to a lucky low sample fails a
required check on the next run, on a page nobody changed), and **no table is not
silence** — a run where every measured ceiling is tight says so, and a run that
measured nothing says something louder, because a tight ratchet and an unhooked
reporter would otherwise look identical. `docs/E2E.md` owns the mechanics under
"The headroom table"; do not restate them here.

## `e2e` gates LAYOUT too

**STATE: MERGED — `57e289fa` (#621), 2026-09-16 13:31:01Z.** Everything in this
section describes a check that is LIVE and can fail a stranger's PR today; it was
written before the merge for the reason §2 gives under its eleventh intake —
routing early costs one extra hop and buys the rule not waiting on a second
trigger, so long as the state line says what state it is in. **This line is the
worst instance of the failure that rule carries: it said OPEN for six days after
the merge**, and it is why the sweep's STATE re-read pass was widened from §2 to
every reference file (§2's 2026-09-22T23:5xZ entry). It also shows what made it
survive: the line named no merge SHA, so there was nothing for a later reader to
re-check. A state line nobody re-reads is worse than no state line, because it
is believed.

`e2e/marketing-viewport.spec.ts` asserts `BRAND.md` Part 10's
zero-horizontal-scroll rule on every code-backed marketing page at **390, 834
and 1440**: `documentElement.scrollWidth` must not exceed `clientWidth`, and
`scrollTo(9999, 0)` must leave `scrollX` at 0. Part 10 has called that
build-blocking since the brand book was written and nothing checked it, which
is how `/compare/[vendor]` shipped dragging 212px sideways at 390 and stayed
that way across three moves. **So there are now three kinds of thing `e2e` can
fail your PR for**: a broken journey, an accessibility violation over its
ceiling (#534), and a marketing page wider than the viewport.

Two properties matter when you read a failure from it.

- **It grades the DOCUMENT, not the elements, and that is not a stylistic
  choice.** The element-level form of the question — anything whose right edge
  clears the viewport with no `overflow-x` ancestor — was tried against this
  exact defect and returned ZERO while the page panned 212px, because
  scrollable overflow follows the containing-block chain and an absolutely
  positioned element's containing block is not its DOM ancestor. **A failure
  therefore tells you the page is wide and does not tell you which element did
  it** — and the element scan you will reach for next is the one already known
  to lie about this. Bisect the rendered page instead.
- **The page list is derived, not typed.** The dynamic families expand from the
  same registries their own `generateStaticParams` reads, so a ninth comparison
  or a new doc is covered the day it is added rather than the day somebody
  remembers the spec. Exactly one thing is deliberately uncovered: `/blog` and
  `/blog/[slug]`, whose bodies come out of the database and render an empty
  state under a seed-free spec.

**Its retries are `e2e`'s retries**, so everything above about reading the job
summary rather than the tick applies to it unchanged: a viewport failure that
passes on the second attempt reports the check green and names itself only in
the flaky table.

## Read the check NAMES, not the colour

*Sentinel's intake, 2026-09-23 (DREAMCRM-109). Branch protection caught #677;
an enumerating reviewer caught it first, and that ordering is the whole point
of writing this down.*

**A DIRTY head's never-started checks and a green head's passed checks look
identical on the PR page.** When a branch is behind `main` under
`strict: true`, the required contexts for the new head have not been reported
yet — and the page happily shows you the LAST head's ticks. Nothing on it is
red. Nothing is pending in a way the eye picks up. The merge button is the only
thing that behaves differently, and by then you have already decided.

So before you merge anything gated, **enumerate the checks by NAME against the
HEAD SHA** rather than glancing at the colour:

```
gh pr checks <n>          # names, states, and the SHA they belong to
gh pr view <n> --json headRefOid,mergeStateStatus,statusCheckRollup
```

`test` and `e2e` must both be there, both `SUCCESS`, and both against the head
you are about to merge. A context that is ABSENT is not a context that passed
— that is the entire failure mode, and "absent" has no colour.

**Branch protection is the backstop and not the control.** It refused #677, so
nothing bad merged; the reason this is an intake rather than a shrug is that
the reviewer who enumerated the names knew half an hour earlier, and the gap
between "a person can tell" and "the gate will refuse" is where a
`--admin` merge, a settings change or a protection lapse does its damage. The
gate is the thing that cannot be talked out of it. The enumeration is the thing
that stops you arguing with it.

This is the same claim §3 makes about a verdict owing its head SHA and its CI
conclusion, seen from the merger's side instead of the reviewer's: **a tick you
did not attribute to a SHA is not evidence about anything.**

## Every alarm ships with the thing that notices it stopped

**A check that cannot fail is not a check.** Quinn's formulation, the one
standing convention the 2026-09-22 planning meeting (DREAMCRM-96) sent to
intake, and it earned that place by having **four independent faces in a single
day across three lanes** — which is as strong as this kind of case gets. The
diagnosis underneath it: *we are good at building alarms and have no convention
for proving an alarm still works.*

The four, each already written up in its own place above:

- **The six-day red.** `review-sweep.yml` ran red every morning from
  2026-09-16 to 2026-09-21 over four unremediated entries. Nobody owned clearing
  it, so it read as wallpaper, and PR #636 merged into that silence carrying
  `needs-sentinel-review` and editing `scripts/review-gate.mjs`. **A
  permanently-red alarm is a disabled alarm.**
- **The fresh red that proves the fix.** The 2026-09-22 12:03Z sweep went red on
  exactly ONE actionable entry. Same mechanism, opposite reading — that is the
  difference between an alarm and wallpaper, and it is the property #643 bought.
- **The error-scan window.** `error-scan.yml` declares `cron: '*/30 * * * *'`
  and scans a 35-minute window, with a comment saying the extra five minutes
  exist "so nothing can fall between two runs." Quinn measured the last 40
  scheduled fires: **median gap 239 minutes, min 117, max 412.** GitHub's
  scheduler is best-effort and drifts; the overlap guarantee is false by
  roughly an order of magnitude. A 35-minute window fired every ~4 hours reads
  about **15% of production wall-clock** and then reports "No errors in the
  window", which a human reads as *production is healthy*.
- **The quiet-workflow gap.** Six scheduled workflows, and **nothing checks that
  any of them still fires.** `nightly.yml`'s own comment tells a human to check
  the Actions tab for the re-enable banner — the class of manual step that does
  not happen. Quinn verified all six had fired that day **by hand, which is the
  point.**

**The rule, and it binds when you ship an alarm, not when someone later
complains about one:**

> Every new alarm ships with the thing that notices it stopped — and that thing
> is a mechanism, not a person's intention to look.

Three concrete obligations it carries, all of them cheap at authoring time and
expensive afterwards:

1. **Name the addressee and the clearing path.** A red run whose value is "one
   inbox deep" is a decision, and the file says so rather than leaving it
   assumed; a red run with an owner is `review-sweep.yml` after #643 — ONE
   standing issue, assigned, cleared entry by entry. An alarm nobody owns
   degrades into the six-day red above on a schedule.
2. **Size a window from what actually happened, not from what the cron
   declares.** `*/30` is a request, not a guarantee. Derive the lookback from
   the previous SUCCESSFUL run and dedupe, so a late fire widens the window
   instead of opening a hole in it. This generalises past cron: any alarm whose
   coverage is computed from its intended cadence is asserting something nobody
   has measured. **The daily alarms drift five to six hours too** — invisible at
   a daily cadence and fatal at a half-hourly one, which is why the defect hid
   for as long as it did.
3. **Assert that the alarm RAN.** A scheduled job that silently stops firing is
   indistinguishable from good news, and every other property in this file — the
   sweep's last-green window, the ratchet's direction, the read-check's
   credential column — is downstream of the run having happened at all. This is
   the §2d rule *assert the ANSWER, not a proxy for it*, pointed at liveness:
   "the workflow file is present and its cron is correct" is a proxy; "there is
   a run inside the expected window" is the answer.

**Where this is not yet true, stated rather than implied**, because a convention
whose live counterexamples are unlisted is its own failure mode. **Two of the
four faces above are closed as of 2026-09-22 evening; two are still open**, and
each one's STATE line lives on its §2 entry rather than here:

- **The alarms-still-ringing check — PR #666, MERGED `82f365fd` 20:20:09Z.
  CLOSED.** `schedule-heartbeat.yml` is the eleventh workflow file, described
  above. Obligation 3 now has a mechanism behind it for the first time.
- **The bytes every guard reads — PR #661, MERGED `c29c195b` 20:11:01Z.
  CLOSED.** `.gitattributes` and `tests/guards/line-endings.test.ts` are on
  `main`. Not one of the four faces, but it sat underneath all of them: a
  Windows author's working tree was CRLF while the runner that gates the merge
  was LF, for the same commit, and every guard that reads files off disk
  inherited the split. **A reproduction run on Windows is evidence about CI
  again** — but only in a FRESH checkout: `text` normalises on check-in, so an
  existing tree keeps its CRLF and `git status` stays clean. `.gitattributes`
  carries the refresh incantation; the guard deliberately does not grade the
  working-tree column, so a stale tree will not tell you it is stale.
- **The error-scan window — PR #664, MERGED `1b34d257`, 2026-09-22T21:38:38Z.
  CLOSED.** `error-scan.yml` derives its lookback from the previous SUCCESSFUL
  run instead of from the fixed 35 minutes its cron implied on a measured
  239-minute median cadence.
- **The intake hop — PR #671, MERGED `94a36ba0`, 2026-09-22T22:06:23Z.
  CLOSED.** Obligation 1 applied to the rulebook's own queue:
  `review-gate.yml` labels `needs-forge-intake`, the sweep grades it, and the
  hop AFTER the label now wakes Forge. **Note what makes it an instance
  rather than a fifth alarm:** it adds no new thing to watch, it gives an
  existing red run an addressee that is a mechanism.

  **BOTH OF THE ABOVE SAID `OPEN` UNTIL 2026-09-23 AND BOTH HAD MERGED THE
  NIGHT BEFORE** — found by Quinn on DREAMCRM-115, while reading this section
  for the rule it states. Worth one sentence because of WHICH guard missed
  them: `tests/guards/rulebook-state.ts` grades `**STATE: …**` claims and these
  two are written as inline `— PR #NNN, OPEN`, so they are outside its unit by
  construction, not by a bug. That is the same shape as the count above: the
  graded copy was right and a second, ungraded copy of the same fact was
  wrong. If you write a verdict about a PR anywhere on this page, write it as a
  `STATE:` claim or expect nothing to check it.

- **A red push-triggered workflow on `main` — DREAMCRM-115,
  `push-alarm.yml`. THE FIFTH
  FACE, and the first one found after the convention existed.** `main`
  auto-deploys, and on 2026-09-23 a red `deploy.yml` went unnoticed for 21
  minutes while production shipped nothing for 77. Nothing in
  `.github/workflows/**` used a `workflow_run` trigger, so a failed
  push-triggered workflow routed nowhere — and `schedule-heartbeat.yml` cannot
  see one by construction, since it grades the AGE of a cron's newest run and a
  deploy fires when somebody merges. **Read what obligation 3 cost here**: the
  heartbeat was WIDENED rather than a second watcher built, and it needed a
  different question, because an alarm with no cadence cannot be late. The
  question is PAIRING — is there a run of the alarm at or after the newest
  settled run of the workflow it watches — and a quiet week of merges is
  explicitly not a finding. **It watches BOTH push-triggered producers**
  (`deploy.yml` and `post-merge-e2e.yml`) from one file, and the guard derives
  that list from the tree rather than taking two typed strings — so a third
  push-triggered workflow fails `test` by name until it is watched.
  `docs/CI.md`, "A red push-triggered workflow has to reach somebody",
  carries the rest.

**The two that were open are where the convention earned its keep, and the
evidence is in their review history rather than in this paragraph.** Between
them the two PRs took four blocking findings across two Sentinel rounds, and
**three of the four were the same shape: a guard reading a sentence ABOUT the
thing instead of the thing.** A pin that matched anywhere in a workflow file was
satisfied by the comment quoting the very token it was meant to require; a
credential scan satisfied by prose; an assertion that a defaulted `35` was gone,
satisfied — and then FAILED on a correct file — because the new comment quoted
the old line as history. The remedy was identical all three times and is the
generalisable part: **strip the comments, or scope the read to the step's own
block.** A guard over a YAML file is a guard over a file that is half prose.

The cheap moment for the two that remain is still now, and #664 shows why: the
scan cannot assume its read-only role yet (owner setup,
`docs/PROD-READ-ACCESS.md`), so it **skips rather than lies** — the window math
gets fixed before the role lands instead of being discovered from the first real
incident it misses.

**The boundary, so this does not become a reason to build alarms about
alarms.** The watcher may be far simpler than the thing it watches; it is
usually one assertion. What it may not be is a sentence in a runbook telling
somebody to look. The four faces above are four instances of exactly that
sentence being written and not followed.
