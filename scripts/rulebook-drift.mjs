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
    note: 'the post-merge half of review-gate.yml: names PRs that merged carrying needs-sentinel-review with no review recorded, or needs-forge-intake with no intake recorded. Runs after the merge commit is on main, so it cannot hold one. Its exit status is keyed on what is new since it last went green; the summary still prints every unremediated entry',
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
  return { workflows, gateAreas: GATE_RULES.map((r) => r.id) }
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
 * "Graded N/8" instead of a tick, in all three cases.
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
