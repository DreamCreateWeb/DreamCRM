// NO SHEBANG, DELIBERATELY — same reason as scripts/review-gate.mjs. The
// workflow runs `node scripts/rulebook-drift.mjs`, so it was never
// load-bearing, and with CRLF endings on a Windows checkout vitest's SSR
// transform leaves the `\r` behind and every test importing this file dies
// with a parse error at column 1.
/**
 * DOES THE RULEBOOK STILL DESCRIBE THIS REPO?
 *
 * The `dreamcrm-conventions` skill states, in prose, a set of facts about how
 * this repository is wired: which checks are required, that admins are bound
 * by them, how many workflow files exist and which of them can block a merge,
 * how many areas the review gate enumerates. Those sentences were
 * true when somebody typed them. Nothing has ever checked whether they still
 * are — the skill lives outside the repo, so no test could fail when the repo
 * moved underneath it.
 *
 * SINCE DREAMCRM-114 IT ALSO GRADES A SENTENCE THAT IS MISSING, which is a
 * different question from a sentence that has gone stale and is the one every
 * claim above is blind to. `guards-census` asserts that every file in
 * `tests/guards/` is NAMED in the rulebook. #534 took three days to be
 * written up, #598 was found only by an unscoped sweep pass, and #698 landed
 * three blocking assertions at once — none of them moved a single fact the
 * other eight claims read, and all three reached the rulebook because a person
 * went looking.
 *
 * It moves often. The axe ratchet (#534) changed what could merge and took
 * three days to reach the skill. A meeting sweep found the skill three claims
 * stale two minutes after #565 merged. Both were caught by a person choosing
 * to look. That is the part this replaces.
 *
 * DREAMCRM-35's principle, pointed at the rulebook itself: everything the
 * sweep compares is machine-readable on both sides, so compare it on a
 * schedule instead of on a good day.
 *
 * ------------------------------------------------------------------------
 * WHAT THIS IS NOT: A SECOND SOURCE OF TRUTH.
 *
 * `CLAIMS` below is not where the rules live. Each entry is a transcription of
 * a sentence the skill states, recorded here in machine-readable form for the
 * sole purpose of being diffed against the repo. The repo is the truth; the
 * skill is the policy; this file is the tripwire strung between them.
 *
 * That is a real risk and worth naming, because this repo has been bitten by
 * exactly it: `docs/E2E.md` said 36 while `e2e/axe-baseline.ts` said 18, two
 * batches apart, and the fix was to stop restating the number and guard the
 * pointer (`tests/guards/e2e-doc-axe-count.test.ts`). The same medicine does
 * not work here, because a skill document cannot hold a pointer into a repo an
 * agent may not have checked out. So the mitigation is different and it is
 * honest about its limit:
 *
 *   * This closes the REPO ↔ CLAIM gap mechanically, daily, and loudly.
 *   * It does NOT close the CLAIM ↔ SKILL gap. That hop is Forge's, and it is
 *     the reason every claim carries `section` and `states`: a drift report
 *     names the skill section to open, so the follow-up is mechanical rather
 *     than a re-read of 700 lines.
 *   * Half of the claims are checkable without the network, and
 *     `tests/guards/rulebook-drift.test.ts` asserts those in the `test` gate.
 *     Adding a workflow file, or an area to the review gate, turns a required
 *     check RED until the claim is updated in the same PR. That is the point:
 *     the intake is no longer something to remember.
 *
 * Do not add a rule here that lives nowhere else. If this file is the only
 * place a fact is written down, it has become the second home it was built to
 * prevent.
 * ------------------------------------------------------------------------
 *
 * Usage:
 *   node scripts/rulebook-drift.mjs --repo repo.json --no-protection-credential
 *   node scripts/rulebook-drift.mjs --protection protection.json --repo repo.json
 *
 * Exit 0 when every claim that could be graded HELD and the only ungraded ones
 * were skipped for a stated, temporary reason. A claim that could not be graded
 * is never counted as a claim that held — see the note above `main()`.
 */
import { readFileSync, readdirSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GATE_RULES } from './review-gate.mjs'

const WORKFLOW_DIR = '.github/workflows'

/**
 * REGISTRATION BY LOCATION: the two directories the guards census compares.
 *
 * `tests/guards/` is where a never-again guard lives (§2d). The census below
 * asserts that every file in it is NAMED, by its own file name, somewhere in
 * the rulebook — so a machinery guard either reaches §2/§2c in the PR that
 * introduces it, or fails `test` by name.
 *
 * WHY A DIRECTORY AND NOT A PREDICATE, which is the design decision and was
 * measured before it was made. The tempting predicate — "a guard is a test
 * that reads source off disk" — matches 81 files OUTSIDE this directory, most
 * of them ordinary unit tests, and still misses `hero-lcp-paint`, which reads
 * its subject out of a rendered stylesheet. Over-broad by roughly ten times
 * AND blind to the case that prompted it. §2 is explicit that a false positive
 * here costs a red `test` run naming an innocent file, so the predicate was
 * not built. **A directory is self-declaring** — a file is in it because its
 * author put it there — so the false-positive rate is zero by construction.
 *
 * WHAT THIS DOES NOT COVER, said here rather than left to be discovered: the
 * design and accessibility guards in `tests/marketing/` and `tests/a11y/`.
 * They are registered by hand in §2b and nothing goes red if the next one is
 * forgotten. Moving such a guard into `tests/guards/` is how it earns
 * coverage; moving one OUT is how coverage is lost silently.
 */
const GUARD_DIR = 'tests/guards'
const RULEBOOK_DIR = 'docs/rulebook'

/**
 * NON-VACUITY FLOORS FOR THE CENSUS READER, and they are deliberately NOT
 * shares.
 *
 * #691's lesson is that a floor written as a COUNT stops being an assertion
 * once the population grows past it, and that a share keeps meaning the same
 * thing at any tree size. That lesson is about a claim on a POPULATION. This
 * is not one: it is a claim about the READER, and the only question it asks is
 * whether anything was read at all. An absence assertion over an empty list
 * passes — so a census whose directory moved, whose filter narrowed, or whose
 * walk threw and returned nothing would report a clean tree forever. A share
 * cannot express "you read nothing"; a floor can. They sit far below today's
 * numbers (34 guard files, ~560 KB of rulebook) on purpose: this is a
 * tripwire, not a second census.
 */
export const CENSUS_FLOORS = { guardFiles: 20, rulebookFiles: 2, rulebookBytes: 100_000 }

/**
 * The non-vacuity floor for `intake-ordinals`. Nine markers exist on this tree
 * (49..57); five is a tripwire against a reader that stopped reading, not a
 * claim about how long the list should be.
 */
export const INTAKE_ORDINAL_FLOOR = 5

/**
 * ORDINAL WORD TO NUMBER, and it is DERIVED rather than typed out.
 *
 * A hand-typed table of ninety-nine entries is a hand-kept list guarding a
 * hand-kept list, which is the joke §2d would make at its own expense. The
 * units and the tens are the only facts; every compound is `TENS-UNIT`, which
 * is how English spells them and how this rulebook writes them.
 *
 * It runs to ninety-nine because the list is at fifty-seven and gains a handful
 * a week. Past that the claim says so out loud rather than going quiet — see
 * the `unknown` branch.
 */
export const ORDINAL_WORDS = (() => {
  const units = [
    'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH',
    'ELEVENTH', 'TWELFTH', 'THIRTEENTH', 'FOURTEENTH', 'FIFTEENTH', 'SIXTEENTH', 'SEVENTEENTH',
    'EIGHTEENTH', 'NINETEENTH',
  ]
  const tensOrdinal = {
    20: 'TWENTIETH', 30: 'THIRTIETH', 40: 'FORTIETH', 50: 'FIFTIETH',
    60: 'SIXTIETH', 70: 'SEVENTIETH', 80: 'EIGHTIETH', 90: 'NINETIETH',
  }
  const tensPrefix = {
    20: 'TWENTY', 30: 'THIRTY', 40: 'FORTY', 50: 'FIFTY',
    60: 'SIXTY', 70: 'SEVENTY', 80: 'EIGHTY', 90: 'NINETY',
  }
  const out = {}
  units.forEach((w, i) => { out[w] = i + 1 })
  for (const [tenStr, word] of Object.entries(tensOrdinal)) {
    const ten = Number(tenStr)
    out[word] = ten
    for (let u = 1; u <= 9; u++) out[`${tensPrefix[ten]}-${units[u - 1]}`] = ten + u
  }
  return out
})()

/**
 * Every `.md` under `docs/rulebook/`, recursively, as one string plus its file
 * list. One string because the question is "is this name written down
 * anywhere in the rulebook", and which file it landed in is the author's
 * judgement rather than the check's.
 */
export function readRulebook(root = process.cwd()) {
  const files = []
  const walk = (dir, prefix) => {
    const entries = readdirSync(join(root, dir), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`)
      else if (entry.name.endsWith('.md')) files.push({ path: `${prefix}${entry.name}`, file: join(dir, entry.name) })
    }
  }
  walk(RULEBOOK_DIR, '')
  const text = files.map((f) => readFileSync(join(root, f.file), 'utf8')).join('\n')
  return { files: files.map((f) => f.path), text }
}

/**
 * Is `file` named in the rulebook AS A FILE NAME?
 *
 * Matched with boundaries on both sides, and both sides earn their keep:
 *
 *   - LEADING, so `tests/guards/control-bytes.ts` and a bare
 *     `control-bytes.ts` both count. Which prefix an author wrote is style;
 *     requiring one would redden 16 correct citations to no purpose.
 *   - TRAILING, because `x.ts` is a prefix of `x.tsx` and a rulebook that
 *     names only the `.tsx` file would otherwise report the `.ts` one
 *     registered. §2d's a-prefix-is-not-a-name trap, answered before it fires
 *     rather than after.
 *
 * And the STEM is deliberately not enough. `migration-check` is the live case:
 * `scripts/migration-check.mjs` and `migration-check.yml` are both written up
 * at length while `tests/guards/migration-check.test.ts` was named nowhere, so
 * a stem match reported a guard registered when what was registered was a
 * script. That is the identity-looseness family pointed at this document's own
 * bookkeeping, and it is worth three false negatives to avoid.
 */
export function namedInRulebook(text, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // THE TWO BOUNDARIES ARE THE SAME CHARACTER CLASS, which the first version
  // got wrong in the false-GREEN direction (Sentinel, reviewing #701). The
  // leading class excluded `_` and `-`; the trailing lookahead excluded
  // neither, so `widget.test.ts-old`, `widget.test.ts_bak` and
  // `snap.control-bytes.ts` each reported the real file registered. For an
  // absence assertion the false green is the direction that matters.
  //
  // `.` is handled separately rather than folded into the class, because the
  // two cases it covers point opposite ways: `widget.test.ts.snap` and
  // `snap.control-bytes.ts` must NOT count — a sibling artefact standing in
  // for the guard — while a citation ending a sentence, `see
  // control-bytes.ts.`, must. So a dot is refused only where it JOINS two
  // name-shaped runs: something alphanumeric before it on the leading side,
  // something alphanumeric after it on the trailing side. A path separator, a
  // backtick, a space, a comma and a sentence-ending dot all still count.
  //
  // Both sides are lookarounds of the same shape, which is the point rather
  // than a style choice: the first version spelled the leading boundary as a
  // CONSUMING character class and the trailing one as a lookahead, and
  // asymmetry between two halves of one predicate is exactly where §2d's
  // identity-looseness family lives.
  const before = '(?<![A-Za-z0-9_-])(?<![A-Za-z0-9]\\.)'
  const after = '(?![A-Za-z0-9_-])(?!\\.[A-Za-z0-9])'
  return new RegExp(`${before}${escaped}${after}`).test(text)
}

/**
 * THE WORKFLOW CENSUS, as the skill states it.
 *
 * `publishes` is the set of REQUIRED status-check contexts this workflow can
 * report. It is the only thing that decides whether a workflow gates anything,
 * and it is why the census is a map rather than a count: "six of nine gate
 * nothing" is a summary of this table, not a fact of its own.
 *
 * `gates` is what it gates, and the three values are genuinely different:
 *   - 'merge'   — publishes a required context on a `pull_request`, so branch
 *                 protection will hold the merge until it is green.
 *   - 'deploy'  — can fail the deploy run. Either by publishing a required name
 *                 on a push to `main`, or by being a required job INSIDE that
 *                 run. Cannot stop a merge; stops a broken deploy shipping.
 *   - 'nothing' — reports, warns, labels. Cannot stop either.
 *
 * That second clause was added for `migration-check.yml` (#575), the first
 * workflow here that gates something while publishing nothing: `deploy.yml`
 * calls it with `uses:` under `needs: deploy` and no `continue-on-error`, so a
 * failure fails the deploy run. Under the old wording — "publishes the same
 * name on a push" — the honest answer would have been `'nothing'`, which is
 * literally consistent and substantively false. §2's "N of nine gate nothing"
 * sentence is DERIVED from this table, so the wrong value here writes a wrong
 * sentence into the skill. `publishes` and `gates` are independent for a
 * reason; this is the case that proves it.
 */
export const WORKFLOW_CENSUS = {
  'ci.yml': {
    gates: 'merge',
    publishes: ['e2e', 'test'],
    note: 'the merge gate: both required contexts, on every PR',
  },
  'deploy.yml': {
    gates: 'deploy',
    publishes: ['test'],
    note: 'the same suite on push to main, so a red main cannot auto-ship; it is past the merge',
  },
  'migration-check.yml': {
    gates: 'deploy',
    publishes: [],
    note: 'called by deploy.yml under needs: deploy with no continue-on-error, so it can fail the deploy run without publishing a check of its own',
  },
  'error-scan.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'reads the production log groups every 30 minutes and warns without ever failing',
  },
  'nightly.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'after the fact; its tz-canary job is continue-on-error, so a green nightly is not a passed canary',
  },
  'post-merge-e2e.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'after the fact; alerts, does not gate the deploy',
  },
  'e2e-flaky-digest.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'reads a WEEK of Playwright reports together and names any spec that flaked in two or more separate runs (DREAMCRM-105). The per-run reporter could only ever say "this flaked"; nothing could say how often, so a flake had an anecdote instead of a rate. Weekly cron plus dispatch, no PR trigger, so it cannot hold a merge. Goes red on a repeat offender - the window is one cadence wide, so there is no queue to keep it red for weeks',
  },
  'e2e-flake-hunt.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'runs one spec N times and reports the ratio (DREAMCRM-105): the instrument that turns "fails about once a day, can\'t reproduce" into a number. workflow_dispatch ONLY — no PR trigger, no push, no schedule — so it cannot hold a merge and costs nothing on a morning nobody is hunting. Its dispatch inputs are the repo\'s first user-controlled strings; they ride env: and are validated in scripts/e2e-harness.sh',
  },
  'read-check.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'reads production under the SELECT-only role; dispatch or schedule only, no PR trigger',
  },
  'review-gate.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'advisory by construction: no required context, no needs:, the label step is continue-on-error',
  },
  'review-sweep.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'the post-merge half of review-gate.yml: names PRs that merged carrying needs-sentinel-review with no review recorded, needs-forge-intake with no intake recorded, or (DREAMCRM-105) no DREAMCRM-<n> issue key in the title at all. The third half has no label - every merged PR in the window is in scope, because a label is exactly what untracked work has nobody to receive - and it never wakes Forge. Runs after the merge commit is on main, so it cannot hold one. Its exit status is keyed on what is new since it last went green; the summary still prints every unremediated entry',
  },
  'schedule-heartbeat.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'the alarm that watches the other alarms (DREAMCRM-99): one daily job asserting every scheduled workflow has a `schedule`-triggered run inside the window its own cron implies. Derives its list from the cron entries in this directory, so a schedule added tomorrow is watched tomorrow. No PR trigger, no required context, so it cannot hold a merge',
  },
  'rulebook-drift.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'this check, on a schedule; no PR trigger, so it cannot hold a merge on a stale sentence',
  },
}

/**
 * The areas `scripts/review-gate.mjs` enumerates, as §3 states them.
 *
 * It was eight when this file was written and nine before it merged —
 * `check-definitions` arrived with DREAMCRM-49 (#572) while #571 was in review.
 * That is §3's ruling working exactly as it reads: the enumeration leads, the
 * prose follows, and the direction to fix a disagreement is prose-ward. The
 * guard below is what makes "follows" mean something rather than "eventually".
 */
export const CLAIMED_GATE_AREAS = [
  'auth',
  'check-definitions',
  'ci-workflows',
  'db-migrations',
  'deploy-path',
  'money',
  'read-checks',
  'tenant-scoping',
  'token-surfaces',
]

/** The required status-check contexts §2 says are "exactly" the set. */
export const CLAIMED_REQUIRED_CHECKS = ['e2e', 'test']

const sorted = (xs) => [...xs].sort()
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

/**
 * Every claim the skill makes that the machine can grade.
 *
 * `needs` lists which parts of `live` a claim requires. A claim whose inputs
 * are absent is reported UNCHECKED — never as passing. The distinction is the
 * whole reason this file exists, so it is not allowed to blur here.
 *
 * `check` returns null when the claim holds, or `{ actual, fix }` when it does
 * not. `actual` is what the repo says today; `fix` is what to do about it, and
 * it is always the same shape of instruction: decide which side is wrong.
 */
export const CLAIMS = [
  {
    id: 'required-checks',
    needs: ['protection'],
    section: '§2, "What actually gates a merge"',
    states: 'the required set is exactly `test` and `e2e`',
    check: (live) => {
      const actual = live.protection?.required_status_checks?.contexts ?? []
      if (same(actual, CLAIMED_REQUIRED_CHECKS)) return null
      return {
        actual: `branch protection requires [${sorted(actual).join(', ') || 'nothing'}]`,
        fix:
          'a required check was added or removed. That is a branch-protection change: it needed ' +
          "Sentinel's review and it needs an intake. Update §2 and CLAIMED_REQUIRED_CHECKS here.",
      }
    },
  },
  {
    id: 'strict-and-allow-update-branch',
    needs: ['protection', 'repo'],
    section: '§2, "What actually gates a merge"',
    states: '`strict: true` paired with `allow_update_branch: true` — the two move together',
    check: (live) => {
      const strict = live.protection?.required_status_checks?.strict
      const update = live.repo?.allow_update_branch
      if (strict === true && update === true) return null
      return {
        actual: `strict=${strict}, allow_update_branch=${update}`,
        fix:
          'strict without allow_update_branch is the rebase treadmill that parked #524 BEHIND ' +
          'until a person noticed. If this was deliberate, §2 says the opposite.',
      }
    },
  },
  {
    id: 'enforce-admins',
    needs: ['protection'],
    section: '§2, "Those checks bind every account, the owner\'s included"',
    states: '`enforce_admins: true` since 2026-09-14 (DREAMCRM-40)',
    check: (live) =>
      live.protection?.enforce_admins?.enabled === true
        ? null
        : {
            actual: `enforce_admins=${live.protection?.enforce_admins?.enabled}`,
            // Worth the loudest wording in the file. `enforce_admins: false`
            // is not scoped to the checks — it exempts the one account the
            // entire agent fleet authenticates as from EVERY restriction on
            // the branch, including the force-push and deletion bars below.
            fix:
              'the admin bypass is open again. Every restriction on `main` — the required checks, ' +
              'the force-push bar, the deletion bar — is off for the single account every agent ' +
              'runtime uses. Close it, or record who opened it and why (docs/CI.md owns the ' +
              'deliberate emergency hatch, which leaves it closed).',
          },
  },
  {
    id: 'force-push-and-deletion-bars',
    needs: ['protection'],
    section: '§2, "What actually gates a merge"',
    states: '`allow_force_pushes: false` and `allow_deletions: false` on `main`',
    check: (live) => {
      const fp = live.protection?.allow_force_pushes?.enabled
      const del = live.protection?.allow_deletions?.enabled
      if (fp === false && del === false) return null
      return {
        actual: `allow_force_pushes=${fp}, allow_deletions=${del}`,
        fix: '`main` auto-deploys with migrations applying on boot. Rewriting or deleting it is a production event.',
      }
    },
  },
  {
    id: 'workflow-census',
    needs: ['workflows'],
    // Hand-written, unlike `states` below, which is derived from the census and
    // so cannot go stale. No guard can see this string — keep it moving with
    // the prose it quotes. (It said "seven … five" for the length of one
    // review, describing the count this very PR changed.)
    section: '§2, "There are ten workflow files and seven of them gate nothing"',
    states: `${Object.keys(WORKFLOW_CENSUS).length} workflow files: ${Object.keys(WORKFLOW_CENSUS).join(', ')}`,
    check: (live) => {
      const actual = Object.keys(live.workflows)
      if (same(actual, Object.keys(WORKFLOW_CENSUS))) return null
      const added = actual.filter((f) => !(f in WORKFLOW_CENSUS))
      const gone = Object.keys(WORKFLOW_CENSUS).filter((f) => !actual.includes(f))
      return {
        actual: `${actual.length} files${added.length ? `; new: ${added.join(', ')}` : ''}${
          gone.length ? `; gone: ${gone.join(', ')}` : ''
        }`,
        fix:
          'a workflow file arrived or left. Add or remove its WORKFLOW_CENSUS entry — say what it ' +
          'publishes and what it therefore gates — and update §2. This is a `.github/workflows/**` ' +
          "change, so it also needed Sentinel's review.",
      }
    },
  },
  {
    id: 'who-can-publish-a-required-check',
    needs: ['workflows'],
    section: '§2, "Two checks can block a merge … both from `.github/workflows/ci.yml`"',
    states: 'only the workflows the census names may report a context called `test` or `e2e`',
    check: (live) => {
      const wrong = []
      for (const [file, source] of Object.entries(live.workflows)) {
        const claimed = WORKFLOW_CENSUS[file]?.publishes
        // A file the census has never heard of is the previous claim's
        // problem, not this one's — reporting it twice buries the real finding.
        if (!claimed) continue
        const publishes = effectiveContexts(source).filter((c) => CLAIMED_REQUIRED_CHECKS.includes(c))
        if (!same(publishes, claimed)) {
          wrong.push(`${file} publishes [${sorted(publishes).join(', ') || 'nothing'}], census says [${sorted(claimed).join(', ') || 'nothing'}]`)
        }
      }
      if (!wrong.length) return null
      return {
        actual: wrong.join('; '),
        fix:
          // The shape `tests/guards/review-gate.test.ts` already refuses for
          // review-gate.yml, generalised: a second producer of a required name
          // satisfies branch protection with a tick the real suite never made.
          'a job whose effective context (its `name:`, or its key when it has none) is a required ' +
          'check name can satisfy branch protection with a green tick the real suite never ' +
          'produced. If the new producer is legitimate, say so in the census AND in §2.',
      }
    },
  },
  {
    id: 'every-required-check-has-a-producer',
    needs: ['protection', 'workflows'],
    section: '§2, "What actually gates a merge"',
    states: 'each required context is produced by a job that runs on `pull_request`',
    check: (live) => {
      const required = live.protection?.required_status_checks?.contexts ?? []
      const produced = new Set()
      for (const [, source] of Object.entries(live.workflows)) {
        if (!runsOnPullRequest(source)) continue
        for (const c of effectiveContexts(source)) produced.add(c)
      }
      const orphans = required.filter((c) => !produced.has(c))
      if (!orphans.length) return null
      return {
        actual: `nothing on a PR produces: ${orphans.join(', ')}`,
        // Not a stale-prose finding like the rest — this one is an outage.
        fix:
          'a required context that no PR-triggered job reports never goes green, so EVERY pull ' +
          'request is unmergeable until somebody edits branch protection. Fix the workflow or ' +
          'drop the requirement; do not wait for the daily run to tell you twice.',
      }
    },
  },
  {
    id: 'gate-areas',
    needs: ['gateAreas'],
    section: '§3, "Since 2026-09-14 (#553) the list also lives in the repo"',
    states: `GATE_RULES enumerates ${CLAIMED_GATE_AREAS.length} areas: ${CLAIMED_GATE_AREAS.join(', ')}`,
    check: (live) => {
      if (same(live.gateAreas, CLAIMED_GATE_AREAS)) return null
      const added = live.gateAreas.filter((a) => !CLAIMED_GATE_AREAS.includes(a))
      const gone = CLAIMED_GATE_AREAS.filter((a) => !live.gateAreas.includes(a))
      return {
        actual: `GATE_RULES has ${live.gateAreas.length}${added.length ? `; new: ${added.join(', ')}` : ''}${
          gone.length ? `; gone: ${gone.join(', ')}` : ''
        }`,
        // The direction matters. §3 already rules that the enumeration leads
        // and the prose follows, so a NEW area here is the system working —
        // this finding is a reminder to write it down, not an objection.
        fix:
          'the enumeration is the source of truth for the gate areas and prose follows it, so a new ' +
          'area is correct and §3 is simply behind. Update §3, the project description list (via ' +
          'the owner), and CLAIMED_GATE_AREAS here. An area that VANISHED is the other story: ' +
          'something left the review gate.',
      }
    },
  },
  {
    id: 'guards-census',
    // `guardDir` IS AN INPUT, AND LEAVING IT OFF THIS LIST WAS THE BUG
    // (Sentinel, reviewing #707). The comparison below is between two
    // readings of the same directory, so BOTH are inputs — but the first
    // version listed only one and defaulted the other, which turned a missing
    // input into a vacuous pass instead of an ungradeable claim. See the
    // comment on `ungraded` for the shape.
    needs: ['guards', 'guardDir', 'rulebook'],
    section: '§2d, "A never-again guard lives in `tests/guards/`", with the list in §2c',
    states: 'every file in `tests/guards/**` is named, by its own file name, somewhere in `docs/rulebook/**`',
    // THE ONLY CLAIM HERE WHOSE SUBJECT IS THE RULEBOOK'S OWN COMPLETENESS.
    // The eight above ask whether a sentence about the repo is still true. This
    // one asks whether a sentence EXISTS, which is the shape the other eight
    // are blind to: #534 (three days), #598 (found only by an unscoped sweep
    // pass) and #698 (three assertions in one merge) all moved nothing any of
    // them grades. Measured on `main` at `66d087dc`: 34 guard files, 23 named.
    //
    // It is deliberately about NAMING and not about CORRECTNESS. Nothing here
    // can tell whether the paragraph describing a guard is any good — that is
    // §2d's sentence-versus-code family and it needs a reader. What this buys
    // is that the paragraph EXISTS and has a name to find it by, which is the
    // difference between an intake that happens and one that depends on
    // somebody choosing to look.
    check: (live) => {
      const { files, text } = live.rulebook

      // THE READER IS GRADED EXACTLY, NOT BY A FLOOR. Everything below is an
      // absence assertion, so a reader that narrows makes this claim GREENER
      // and no assertion downstream can feel it (§2d's reader family).
      //
      // THE FLOOR WAS NOT ENOUGH AND THIS IS THE MEASUREMENT (Sentinel,
      // reviewing #701). A floor catches a reader that lands on ZERO. It
      // cannot catch one that narrows PARTIALLY, which is the shape a
      // plausible refactor actually takes: skipping `e2e-*` and `axe-*`
      // dropped TWELVE of thirty-four guards out of the census, landed at 22
      // — comfortably above a floor of 20 — and left `guards-census` green
      // and all 35 tests passing. Twelve guards leave the census and nothing
      // anywhere goes red. That is #691's rule holding after all: a count
      // stops being an assertion the moment the population clears it, and the
      // gap between 20 and 34 was never a tripwire margin, it was 41% of the
      // census.
      //
      // So compare the filtered list against the UNFILTERED directory
      // listing. Every entry in `tests/guards/` is either graded or named as
      // the difference — neither a count nor a share, exact at any tree size.
      // It also closes two holes the floor could never see: `readdirSync` is
      // NON-RECURSIVE while `readRulebook`'s walk is recursive, so a guard at
      // `tests/guards/<subdir>/foo.test.ts` used to be invisible AND silent;
      // and a guard added with an extension nobody thought of now reddens
      // instead of vanishing.
      //
      // NO `??` FALLBACK HERE, AND THE FIRST VERSION HAD ONE (Sentinel,
      // reviewing #707). It read `(live.guardDir ?? live.guards).filter(f =>
      // !live.guards.includes(f))`, which with `guardDir` absent becomes
      // `guards.filter(f => !guards.includes(f))` — **empty by construction,
      // for any input whatsoever.** The comparison did not fail, it
      // DISAPPEARED, and because `guardDir` was missing from `needs` the
      // runner did not file the claim as ungradeable either. Measured: the
      // same partial narrowing that reddens naming twelve guards with
      // `guardDir` present went GREEN with it absent, ungradeable=false.
      //
      // That is the floor's own failure mode reached through a different
      // door, which makes it the third instance of one family: a check whose
      // subject quietly leaves its field of view reports CLEAN. The fix is
      // this file's own stated rule — A CLAIM THIS COULD NOT BE GRADED IS
      // NEVER A CLAIM THAT HELD — so the input goes in `needs` and the
      // default comes out. A defaulted input is a claim silently answering a
      // question it was not able to ask.
      //
      // It was unreachable when it was written (`readLocalReality` always
      // sets `guardDir`, and it has one production caller). It is fixed
      // anyway, on the precedent already set a few lines up in `main()`'s
      // `skipped` comment: a latent edge in the one classification this whole
      // file exists to keep sharp is not somewhere to leave a maybe.
      const ungraded = live.guardDir.filter((f) => !live.guards.includes(f))
      if (ungraded.length) {
        return {
          actual: `${GUARD_DIR} holds ${live.guardDir.length} entries and the census grades ${live.guards.length}; ungraded: ${ungraded.join(', ')}`,
          fix:
            'something in `tests/guards/` is not being graded by the census, so it could be added ' +
            'or changed with nothing going red. Either the extension filter narrowed, or a guard ' +
            'moved into a subdirectory (this listing is not recursive), or a guard arrived with an ' +
            'extension nobody anticipated. Widen the reader — never widen it by deleting this ' +
            'comparison, which is the one edit that makes the census silently partial.',
        }
      }

      // The floors below still earn their keep on the RULEBOOK side, where
      // there is no exact expected size to compare against — a corpus is not
      // a directory listing. They are tripwires against a walk that returned
      // nothing, and nothing more is claimed for them.
      if (
        live.guards.length < CENSUS_FLOORS.guardFiles ||
        files.length < CENSUS_FLOORS.rulebookFiles ||
        text.length < CENSUS_FLOORS.rulebookBytes
      ) {
        return {
          actual: `the census read ${live.guards.length} guard files and ${files.length} rulebook files (${text.length} bytes)`,
          fix:
            'the census reader found almost nothing, so its verdict means nothing. A directory ' +
            'moved, a filter narrowed, or a walk returned empty. Fix the reader — do NOT lower ' +
            'CENSUS_FLOORS, which is the one edit that makes this check permanently green.',
        }
      }

      const absent = live.guards.filter((f) => !namedInRulebook(text, f))
      if (!absent.length) return null
      return {
        actual: `${absent.length} of ${live.guards.length} guard files are named nowhere in the rulebook: ${absent.join(', ')}`,
        fix:
          'a guard that can fail a stranger\'s PR has reached the repo and not the rulebook. Write ' +
          'it up — §2c for a machinery or invariant guard, §2b for a design or contrast one — and ' +
          'cite it BY FILE NAME, including the extension. A bare stem does not count: ' +
          '`migration-check` is satisfied by a script and a workflow of the same name while the ' +
          'guard itself is registered nowhere. If the file is not a guard, it does not belong in ' +
          '\`tests/guards/\`; move it rather than writing a paragraph about it.',
      }
    },
  },
  {
    id: 'intake-ordinals',
    needs: ['rulebook'],
    section: '§2, the numbered intake list',
    states: 'every `**THE <ORDINAL>:` entry marker is unique, and the set has no gaps',
    /**
     * THE ORDINAL IS A HAND-KEPT COUNTER AND NOTHING COULD SEE IT DOUBLE.
     *
     * On 2026-09-23 THREE open PRs each claimed §2's FIFTY-SEVENTH entry —
     * #712, #713 and #714. All three were `MERGEABLE` against `main`, because
     * they insert at different offsets in the same file and git has no opinion
     * about what the words mean. Two fifty-sevenths would have landed and
     * neither author would have known. §2d says a hand-kept list drifts
     * exactly as a revert list does; this is that, in the document that says it.
     *
     * WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT. Uniqueness, and no
     * gaps between the lowest ordinal present and the highest. It does NOT
     * assert contiguity from ONE, and that is a MEASUREMENT rather than a
     * concession: on this tree the entry markers run 49..57, because the first
     * forty-eight entries predate the `**THE <ORDINAL>:` form and are written
     * as prose. A from-one claim would have reddened on its own first run —
     * which is §2d's newest rule (run the instrument on the case in front of
     * you) catching this one BEFORE it was written rather than after.
     *
     * THE CANDIDATE TEST IS THE ORDINAL SUFFIX, NOT THE MAP. `**THE FIX:` is a
     * real heading in this rulebook and is not an ordinal; keying on the map
     * alone would silently skip it — and would equally silently skip
     * `FIFTY-EIGTH`, a typo, which is the one thing a counter's guard must not
     * wave through. So anything shaped like an ordinal (ST/ND/RD/TH) is a
     * CANDIDATE, and a candidate the map cannot resolve is a FINDING rather
     * than a skip. Unrecognised is loud; not-an-ordinal is quiet.
     */
    check: (live) => {
      const { text } = live.rulebook
      const candidates = [...text.matchAll(/\*\*THE ([A-Z][A-Z-]*(?:ST|ND|RD|TH)):/g)].map((m) => m[1])

      // NON-VACUITY, because everything below is about a set this reader
      // built: a regex that stopped matching reports a perfectly unique,
      // perfectly contiguous EMPTY list. There is no independent census to
      // compare against here — unlike the guards, whose directory is a second
      // reading — so a floor is the honest instrument rather than a weaker
      // version of an exact one.
      if (candidates.length < INTAKE_ORDINAL_FLOOR) {
        return {
          actual: `found ${candidates.length} ordinal entry markers in the rulebook`,
          fix:
            'the reader found almost no numbered entries, so its verdict means nothing. The entry ' +
            'form is \`**THE <ORDINAL>:\` — if §2 changed how it writes them, teach this claim the ' +
            'new form. Do NOT lower the floor.',
        }
      }

      const unknown = candidates.filter((w) => ORDINAL_WORDS[w] === undefined)
      if (unknown.length) {
        return {
          actual: `ordinal marker(s) this claim cannot resolve: ${unknown.join(', ')}`,
          fix:
            'a word shaped like an ordinal is not in \`ORDINAL_WORDS\`. Either it is a typo in the ' +
            'rulebook — fix the entry — or the list has grown past the map, in which case extend ' +
            '\`ORDINAL_WORDS\`. Never make this quiet: an unresolvable ordinal is a counter nobody ' +
            'is counting.',
        }
      }

      const seen = new Map()
      candidates.forEach((w) => {
        const n = ORDINAL_WORDS[w]
        if (seen.has(n)) seen.get(n).push(w)
        else seen.set(n, [w])
      })

      const dupes = [...seen].filter(([, words]) => words.length > 1)
      if (dupes.length) {
        return {
          actual: `duplicate entry ordinal(s): ${dupes.map(([n, w]) => `${n} (x${w.length})`).join(', ')}`,
          fix:
            'two §2 entries claim the same number. That is what happens when concurrent PRs each ' +
            'take the next ordinal off the same base — three did on 2026-09-23 and git called all ' +
            'three mergeable, because they insert at different offsets in one file. The PR that ' +
            'lands SECOND renumbers: check \`origin/main\` before you merge rather than after.',
        }
      }

      const sorted = [...seen.keys()].sort((a, b) => a - b)
      const gaps = []
      for (let n = sorted[0]; n < sorted[sorted.length - 1]; n++) if (!seen.has(n)) gaps.push(n)
      if (gaps.length) {
        return {
          actual: `ordinals run ${sorted[0]}..${sorted[sorted.length - 1]} with ${gaps.length} missing: ${gaps.join(', ')}`,
          fix:
            'a numbered entry is missing from the middle of the list — most likely a renumber that ' +
            'skipped one, or an entry deleted rather than struck. Close the gap, or say in the ' +
            'entry itself why that number is retired.',
        }
      }
      return null
    },
  },
]

/**
 * The status-check context a job actually reports: its `name:` if it has one,
 * otherwise its key. Branch protection matches on that string and on nothing
 * else, which is why a job keyed `review-gate` carrying `name: test` would
 * satisfy the `test` requirement.
 *
 * A line-scanner rather than a YAML parser, deliberately: adding a parser
 * dependency during a feature freeze to read eight files we control is a worse
 * trade than a short reader whose assumptions are written down. What it
 * assumes — GitHub's own canonical layout, which every file here follows: a
 * top-level `jobs:`, job keys at two spaces, job-level keys at four. Steps
 * live at six behind a `-`, so a step's `name:` cannot be mistaken for a job's.
 *
 * ── WHAT IT USED TO MISS, AND WHY EACH ONE MATTERED ────────────────────────
 *
 * Found in review of #571, by running them rather than reading for them. Every
 * one was a FALSE NEGATIVE — a job that really can publish a required context
 * and that this reader could not see — which is the dangerous direction here,
 * because an invisible job satisfies the census and nothing goes red.
 *
 *   * `name: >-` (or `|`) with the value folded onto the next line returned
 *     the indicator itself. A job named `test` that way was invisible.
 *   * A job key with a trailing comment (`  evil: # shipped later`) did not
 *     match `^ {2}key:\s*$` at all, so the WHOLE job vanished — key, name and
 *     everything under it.
 *   * `on: [pull_request]` in flow style read as "does not run on PRs", which
 *     would have hidden a PR-triggered producer from the orphan check.
 *   * `pull_request_target` — a real PR trigger whose checks land on the PR and
 *     can therefore satisfy branch protection, and the more security-sensitive
 *     of the two, since it runs with the base repo's secrets. Both spellings
 *     read as false.
 *
 * All four are closed below. WHAT REMAINS UNCLOSED, and this list is kept
 * accurate in both directions — a blind-spot list that names a gap already
 * fixed spends the credibility it exists for:
 *
 *   * anchors and aliases (`*ref`);
 *   * a quoted `'on':` key, which YAML 1.1 implementations sometimes emit to
 *     dodge the `on`-is-true trap;
 *   * a fold indicator carrying an explicit indent (`>2-`);
 *   * reusable workflows called with `uses:`, whose published context is
 *     decided by the called file — which this reader never opens.
 *
 * A green run here is proof that nothing this reader can see publishes a
 * required name. It is not proof that nothing does.
 */
const FOLD_INDICATORS = /^[>|][-+]?\d*$/

export function effectiveContexts(source) {
  const jobs = []
  const lines = source.split(/\r?\n/)
  let inJobs = false
  let current = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^jobs:\s*(#.*)?$/.test(line)) {
      inJobs = true
      continue
    }
    if (!inJobs) continue
    // Any non-indented, non-blank line ends the jobs block.
    if (/^\S/.test(line)) break

    // `\s*(#.*)?$` rather than `\s*$`: a trailing comment on a job key used to
    // make the entire job invisible to this reader.
    const key = line.match(/^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/)
    if (key) {
      current = { key: key[1], name: null }
      jobs.push(current)
      continue
    }
    const name = line.match(/^ {4}name:\s*(.+?)\s*$/)
    if (name && current && current.name === null) {
      let value = name[1].replace(/^['"]|['"]$/g, '')
      // A block scalar (`>-`, `|`, `>2`) puts the value on the following
      // lines. Take the first non-blank one that is indented past the key —
      // enough to see a one-line folded name, which is the shape that hides a
      // required-context producer.
      if (FOLD_INDICATORS.test(value)) {
        value = ''
        for (let j = i + 1; j < lines.length; j++) {
          if (!lines[j].trim()) continue
          const folded = lines[j].match(/^ {5,}(.*\S)\s*$/)
          value = folded ? folded[1].replace(/^['"]|['"]$/g, '') : ''
          break
        }
      }
      current.name = value
    }
  }

  return jobs.map((j) => (j.name ? j.name : j.key))
}

/**
 * Does this workflow run on pull requests? Only those can gate a merge.
 *
 * Four spellings, because all four really do put a check on the PR:
 * `pull_request` and `pull_request_target`, each in the block form this repo
 * uses and in the flow form (`on: [push, pull_request]`) a new file could
 * perfectly well arrive in.
 *
 * `pull_request_target` counts. It is a genuine PR trigger — its checks land on
 * the PR and can satisfy branch protection — and it is the more
 * security-sensitive of the two, since it runs against the base repo with its
 * secrets. Treating it as "not a PR trigger" would have hidden a producer from
 * the orphan check in the one case worth seeing most.
 */
const PR_TRIGGERS = ['pull_request', 'pull_request_target']

export function runsOnPullRequest(source) {
  if (PR_TRIGGERS.some((t) => new RegExp(`^ {2}${t}:`, 'm').test(source))) return true
  const flow = source.match(/^on:\s*\[(.*?)\]/m)
  return Boolean(flow && flow[1].split(',').some((t) => PR_TRIGGERS.includes(t.trim())))
}

/** Everything gradeable without the network. The guard test uses exactly this. */
export function readLocalReality(root = process.cwd()) {
  const dir = join(root, WORKFLOW_DIR)
  const workflows = {}
  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    workflows[file] = readFileSync(join(dir, file), 'utf8')
  }
  // BOTH LISTS, and the unfiltered one is the load-bearing half. See
  // `guards-census` for why the filtered list alone cannot be trusted.
  const guardDir = readdirSync(join(root, GUARD_DIR)).sort()
  const guards = guardDir.filter((f) => /\.tsx?$/.test(f))
  return {
    workflows,
    gateAreas: GATE_RULES.map((r) => r.id),
    guards,
    guardDir,
    rulebook: readRulebook(root),
  }
}

/**
 * Grade every claim against `live`.
 *
 * Returns `{ findings, unchecked }`. A claim lands in exactly one of them —
 * held, drifted, or ungradeable — and the caller decides what an ungradeable
 * claim means. Here it always means failure; see `main()`.
 */
export function drift(live) {
  const findings = []
  const unchecked = []

  for (const claim of CLAIMS) {
    const missing = claim.needs.filter((n) => live[n] == null)
    if (missing.length) {
      unchecked.push({ ...claim, missing })
      continue
    }
    const result = claim.check(live)
    if (result) findings.push({ ...claim, ...result })
  }

  return { findings, unchecked }
}

function summary(lines) {
  const out = lines.join('\n')
  console.log(out)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + '\n')
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? null : process.argv[i + 1]
}

function loadJson(flag) {
  const path = argValue(flag)
  if (!path) return null
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf8').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * A CLAIM THIS COULD NOT GRADE IS NEVER A CLAIM THAT HELD.
 *
 * It can, however, be a claim that was deliberately SKIPPED, and the first
 * version of this file refused to draw that distinction — it treated every
 * ungradeable claim as red, arguing that "there is no owner-side setup pending
 * and nothing outside the repository to wait for."
 *
 * The argument was sound and the premise was false. Branch protection is not
 * readable with the workflow token at any scope, so the five protection claims
 * need a credential this repository does not have yet. Shipped that way, the
 * daily run would have been red every morning from day one for a reason that
 * was not drift — which is precisely what `read-check.yml` warns and exits 0 to
 * avoid, and precisely how an alarm gets ignored before it first matters.
 *
 * So there are three outcomes, and the summary never merges any two:
 *
 *   * NOT CONFIGURED YET (`--no-protection-credential`) — skipped, named, and
 *     counted OUT of the graded total. Exit 0. Lasts exactly as long as the
 *     secret is missing.
 *   * COULD NOT BE GRADED — an input that should have been there was not. The
 *     cause is inside this check (a revoked token, a renamed branch), so it is
 *     a defect to fix rather than tolerate. Exit 1.
 *   * DRIFT — the repo and the skill disagree. Exit 1.
 *
 * The rule the first version was reaching for survives all of this: a drift
 * detector that reports green when it detected NOTHING is the failure it
 * exists to catch, aimed at itself. Which is why every summary leads with
 * "Graded N/9" instead of a tick, in all three cases.
 */
function main() {
  const credentialAbsent = process.argv.includes('--no-protection-credential')
  const live = { ...readLocalReality(), protection: loadJson('--protection'), repo: loadJson('--repo') }
  const { findings, unchecked } = drift(live)

  // ONLY a claim missing the protection read and NOTHING ELSE is allowed to be
  // "not configured yet". `includes('protection')` was the first spelling and
  // it was too generous: `strict-and-allow-update-branch` needs `repo` as well,
  // so an empty `repo.json` would have filed it as a deliberate skip rather
  // than as the defect it is. Unreachable today — that step has no
  // `continue-on-error`, so the job dies before this runs — but a latent edge
  // in the one classification this whole file exists to keep sharp is not
  // somewhere to leave a maybe.
  const skipped = credentialAbsent
    ? unchecked.filter((u) => u.missing.length === 1 && u.missing[0] === 'protection')
    : []
  const broken = unchecked.filter((u) => !skipped.includes(u))
  const graded = CLAIMS.length - unchecked.length

  const lines = ['### Rulebook drift check', '']
  lines.push(`Graded ${graded}/${CLAIMS.length} claims the \`dreamcrm-conventions\` skill makes about this repo.`, '')

  if (skipped.length) {
    lines.push('#### Not graded yet — no branch-protection credential', '')
    for (const u of skipped) {
      lines.push(`- **${u.id}** — ${u.section}: "${u.states}"`)
    }
    lines.push(
      '',
      'Skipped, not passed. `RULEBOOK_PROTECTION_TOKEN` (a fine-grained PAT with ' +
        'Administration:read on this repo) is not set, and the workflow token cannot read branch ' +
        'protection at any scope. Until it exists, the settings half of this check is off and ' +
        'a settings change made in the GitHub UI reaches nobody. Setup: `docs/CI.md`.',
      '',
    )
  }

  if (broken.length) {
    lines.push('#### Could not be graded', '')
    for (const u of broken) {
      lines.push(`- **${u.id}** — missing \`${u.missing.join('`, `')}\`. ${u.section}: "${u.states}"`)
    }
    lines.push(
      '',
      'This is a failure, not a skip: an input that should have been here was not, and there is ' +
        'no pending credential to blame. A revoked token, a renamed branch, a lost permission — ' +
        'the cause is inside this check. Fix the check.',
      '',
    )
  }

  if (findings.length) {
    lines.push('#### The skill and the repo disagree', '')
    for (const f of findings) {
      lines.push(`- **${f.id}** — ${f.section} states: _${f.states}_`)
      lines.push(`  - the repo today: **${f.actual}**`)
      lines.push(`  - ${f.fix}`)
    }
    lines.push(
      '',
      'Route this into `dreamcrm-conventions` today (Forge owns that hop), then update the ' +
        'matching claim in `scripts/rulebook-drift.mjs` in the same change. Decide which side is ' +
        'wrong first: the repo moving is usually correct and the prose is behind, but a required ' +
        'check or an admin bypass changing on its own is the other kind of finding.',
    )
  }

  if (!findings.length && !broken.length) {
    lines.push(
      skipped.length
        ? `Every claim this run could grade held (${graded} of ${CLAIMS.length}). The rest are listed above; they were not checked.`
        : 'Every claim held. The rulebook still describes this repo.',
    )
  }

  summary(lines)
  process.exitCode = findings.length || broken.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
