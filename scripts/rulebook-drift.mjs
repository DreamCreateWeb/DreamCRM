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
 * by them, that there are seven workflow files and only one of them can block
 * a merge, that the review gate enumerates eight areas. Those sentences were
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
 *   node scripts/rulebook-drift.mjs                     # local claims only
 *   node scripts/rulebook-drift.mjs \
 *     --protection protection.json --repo repo.json     # every claim
 *
 * Exit 0 only when every claim was CHECKED and every checked claim HELD.
 * A claim that could not be checked is a failure here, not a pass — see the
 * note above `main()`.
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
 * and it is why the census is a map rather than a count: "five of seven gate
 * nothing" is a summary of this table, not a fact of its own.
 *
 * `gates` is what it gates when it does publish one, and the two values are
 * genuinely different things:
 *   - 'merge'   — publishes a required context on a `pull_request`, so branch
 *                 protection will hold the merge until it is green.
 *   - 'deploy'  — publishes the same name on a push to `main`, AFTER the merge.
 *                 It cannot stop a merge; it stops a red `main` auto-shipping.
 *   - 'nothing' — reports, warns, labels. Cannot stop either.
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
  'rulebook-drift.yml': {
    gates: 'nothing',
    publishes: [],
    note: 'this check, on a schedule; no PR trigger, so it cannot hold a merge on a stale sentence',
  },
}

/** The eight areas `scripts/review-gate.mjs` enumerates, as §3 states them. */
export const CLAIMED_GATE_AREAS = [
  'auth',
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
    section: '§2, "There are seven workflow files and five of them gate nothing"',
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
 * dependency during a feature freeze to read seven files we control is a worse
 * trade than a 20-line reader whose assumptions are written down. What it
 * assumes — GitHub's own canonical layout, which every file here follows: a
 * top-level `jobs:`, job keys at two spaces, job-level keys at four. Steps
 * live at six behind a `-`, so a step's `name:` cannot be mistaken for a job's.
 */
export function effectiveContexts(source) {
  const jobs = []
  let inJobs = false
  let current = null

  for (const line of source.split(/\r?\n/)) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true
      continue
    }
    if (!inJobs) continue
    // Any non-indented, non-blank line ends the jobs block.
    if (/^\S/.test(line)) break

    const key = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/)
    if (key) {
      current = { key: key[1], name: null }
      jobs.push(current)
      continue
    }
    const name = line.match(/^ {4}name:\s*(.+?)\s*$/)
    if (name && current && current.name === null) {
      current.name = name[1].replace(/^['"]|['"]$/g, '')
    }
  }

  return jobs.map((j) => j.name ?? j.key)
}

/** Does this workflow run on pull requests? Only those can gate a merge. */
export function runsOnPullRequest(source) {
  return /^ {2}pull_request:/m.test(source)
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
 * A CLAIM THIS COULD NOT GRADE IS A FAILURE, NOT A PASS.
 *
 * `read-check.yml` makes the opposite call for good reasons — it warns and
 * exits 0 when its secret is missing, because it merged before the owner-side
 * setup existed and a workflow red for a fortnight for an unrelated reason is
 * noise by the time it first matters.
 *
 * Nothing about that applies here. This job's inputs are the repo's own API
 * and its own checked-out files; there is no owner-side setup pending and
 * nothing outside the repository to wait for. If the protection read comes
 * back empty, the cause is inside this workflow — a permission it no longer
 * has, a renamed branch, a token change — and every one of those is a defect
 * in the check that must be fixed rather than tolerated. A drift detector that
 * reports green when it detected nothing is the failure mode it exists to
 * prevent, aimed at itself.
 */
function main() {
  const live = { ...readLocalReality(), protection: loadJson('--protection'), repo: loadJson('--repo') }
  const { findings, unchecked } = drift(live)
  const checked = CLAIMS.length - unchecked.length

  const lines = ['### Rulebook drift check', '']
  lines.push(`Graded ${checked}/${CLAIMS.length} claims the \`dreamcrm-conventions\` skill makes about this repo.`, '')

  if (unchecked.length) {
    lines.push('#### Could not be graded', '')
    for (const u of unchecked) {
      lines.push(`- **${u.id}** — missing \`${u.missing.join('`, `')}\`. ${u.section}: "${u.states}"`)
    }
    lines.push(
      '',
      'This is a failure, not a skip. These inputs are the repository\'s own API and files — ' +
        'nothing external is pending — so an empty read means this workflow lost a permission or ' +
        'is reading the wrong branch. Fix the check.',
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

  if (!findings.length && !unchecked.length) {
    lines.push('Every claim held. The rulebook still describes this repo.')
  }

  summary(lines)
  process.exitCode = findings.length || unchecked.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
