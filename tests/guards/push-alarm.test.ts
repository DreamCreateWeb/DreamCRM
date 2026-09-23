import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BENIGN_CONCLUSIONS,
  CANCELLED_DETAIL,
  PRODUCER_DETAIL,
  RED_CONCLUSIONS,
  assess,
  previousSettled,
  producerOf,
  renderSummary,
  wakeDecision,
} from '../../scripts/push-alarm.mjs'
import { WORKFLOW_CENSUS } from '../../scripts/rulebook-drift.mjs'

/**
 * THE ALARM THAT WATCHES THE PRODUCTION DEPLOY, CHECKED.
 *
 * THE GAP IT CLOSES (DREAMCRM-115): `main` auto-deploys to production, and on
 * 2026-09-23 a red `deploy.yml` went unnoticed for 21 minutes while production
 * shipped nothing for 77. Three consecutive runs failed on `test` between
 * 03:40Z and 04:03Z and the only surfaces carrying that fact were the Actions
 * tab and GitHub's default failed-run email to one account. No workflow in
 * `.github/workflows/**` used a `workflow_run` trigger, so a failed
 * push-triggered workflow had nowhere to route to.
 *
 * The load-bearing properties, and why each is written against rather than
 * noted:
 *
 *   1. THE TRIGGER MATCHES A DISPLAY NAME, NOT A FILENAME. This is the
 *      sharpest edge in the whole change and it is invisible at review time:
 *      `workflow_run.workflows:` takes the upstream's `name:`, so editing the
 *      first line of `deploy.yml` disconnects this alarm and GitHub reports
 *      nothing — a trigger that matches nothing is not an error, it is a
 *      workflow that never runs. So the guard reads BOTH files off disk and
 *      requires them to agree. This is the §2d rule "assert the ANSWER, not a
 *      proxy for it": the answer is whether the two strings are equal today.
 *   2. `cancelled` IS NOT A DEPLOY FAILURE. `deploy.yml`'s `deploy` job has
 *      `concurrency: { group: deploy-main, cancel-in-progress: false }`, and
 *      GitHub still cancels SUPERSEDED PENDING runs under that setting. Three
 *      merges inside one rollout produce a cancellation as routine behaviour,
 *      on the busiest hour of the day — which is the hour this alarm most
 *      needs to be believed. Reddening on it is a false positive by design.
 *   3. AN UNRECOGNISED CONCLUSION IS RED. The opposite default would make this
 *      check quietly pass a state nobody has looked at, which is the direction
 *      that makes an alarm blind.
 *   4. THE WAKE FIRES ONCE PER RED STREAK, AND FAILS OPEN. A broken `main`
 *      produces one red deploy per merge; 2026-09-23 was three in 23 minutes
 *      over ONE defect. The run reddens every time (colour is free) and the
 *      issue opens once. But a run that could not READ the history wakes
 *      anyway — the mirror of `scripts/review-sweep.mjs`'s `undated`
 *      suppression, because there the expensive mistake is the dispatch and
 *      here it is the silence.
 *   5. THE RINGER MUST RING. The pure functions can be perfect while `main()`
 *      never fails — Sentinel's #593 finding, and the reason the grading step
 *      in the workflow is `continue-on-error` with a restore step after it.
 *      The last blocks run the script as a process and read the workflow file.
 */

const RUN = {
  id: 35815260160,
  name: 'Deploy to AWS App Runner',
  path: '.github/workflows/deploy.yml',
  conclusion: 'failure',
  status: 'completed',
  html_url: 'https://github.com/DreamCreateWeb/DreamCRM/actions/runs/35815260160',
  head_branch: 'main',
  head_sha: '9e4ee5e6aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  display_title: 'DREAMCRM-109: the rulebook moves into the repo',
  event: 'push',
  created_at: '2026-09-23T03:40:28Z',
}

const raw = (name: string) => readFileSync(join(process.cwd(), '.github/workflows', name), 'utf8')

/**
 * A workflow file with every comment line removed.
 *
 * §2a's generalisable remedy, and this file needed it on its first run: the
 * header names `scripts/push-alarm.mjs`, so the unfiltered search for the
 * invocation found a SENTENCE ABOUT it instead of the invocation. Three of the
 * four blocking findings across #664 and #671 were that same shape. Every
 * assertion here is about what the workflow DOES, so every one of them reads
 * this rather than the file.
 */
const wf = (name: string) =>
  raw(name)
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n')

/** A workflow's top-level `name:` — the string `workflow_run` actually matches. */
const workflowName = (file: string) => /^name:\s*(.+)$/m.exec(wf(file))?.[1]?.trim() ?? ''

/**
 * Every workflow file whose `on:` block declares `push:` to `main`.
 *
 * THE DERIVATION THE TRIGGER IS GRADED AGAINST, and it deliberately reads the
 * `on:` block only. Matching `push:` anywhere in the file would be satisfied by
 * the word appearing in a job step or, worse, in one of these headers — the
 * "a guard over a YAML file is a guard over a file that is half prose" lesson
 * `wf` already exists for, one level deeper.
 *
 * The alarm itself is excluded by construction rather than by name: it has no
 * `push:` trigger, and if it ever grew one it SHOULD appear here and fail this
 * — a `workflow_run` alarm that also runs on push would be watching itself.
 */
function pushToMainWorkflows(dir = join(process.cwd(), '.github/workflows')): string[] {
  // THE DIRECTORY IS A PARAMETER so the fixture case below drives THIS
  // function rather than a copy of it. The first version of that test inlined
  // the predicate, which meant breaking the real one left the test GREEN — a
  // guard grading a duplicate of its subject, which is the shape this whole
  // file exists to refuse. Caught by mutating the real predicate and watching
  // nothing go red, which is the only reason it is written this way.
  const read = (f: string) =>
    readFileSync(join(dir, f), 'utf8')
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n')
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => {
      const onBlock = /^on:\n([\s\S]*?)(?=^\S)/m.exec(read(f))?.[1] ?? ''
      if (!/^ {2}push:/m.test(onBlock)) return false

      // A MISSING `branches:` MATCHES EVERY BRANCH, `main` INCLUDED.
      //
      // Sentinel's note 4 on #700, and it is the direction that matters: the
      // first version read the `branches:` line and required it to contain
      // `main`, so a workflow declaring a BARE `push:` — which fires on every
      // branch there is — produced `''`, failed the test, dropped out of the
      // expected set, and left `test` GREEN while the alarm did not watch it.
      // A third producer would have arrived unwatched and nothing would have
      // said so.
      //
      // Latent when it was found: all thirteen workflow files carried
      // `branches: [main]`. Closed anyway, while it was still latent and free
      // — the same call #686 made on the comma-thousands gap, and the same
      // reason: the fix is to widen the PREDICATE, never to add the file to an
      // allowlist.
      const branches = /^ {2}push:\n(?:\s+.*\n)*?\s+branches:\s*(.+)$/m.exec(onBlock)?.[1]
      if (branches === undefined) return true
      return branches.includes('main')
    })
}

describe('deploy alarm — the trigger is wired to the workflow it thinks it is', () => {
  it('watches EVERY push-to-main workflow, derived from the tree rather than typed', () => {
    // THE LIST IS NOT WRITTEN HERE, and that is the whole point. Two defects
    // are refused by one assertion:
    //
    //   1. A RENAME. Somebody changes a producer's display name in a tidy-up
    //      PR, `workflow_run` silently stops matching, and the alarm never
    //      fires again with no error anywhere.
    //   2. A THIRD PRODUCER. Somebody adds a workflow on `push: [main]` and
    //      nobody remembers this file exists. The alarm would be correct about
    //      the two it knows and blind to the new one — which is exactly the
    //      shape of the gap DREAMCRM-115 was filed about, one level over.
    //
    // Both sides are read off disk, so neither can be satisfied by a string in
    // this test. The equality is deliberate rather than `toContain`: watching
    // something that no longer pushes to main is also drift, and reading a
    // stale name in the trigger tells the next reader the wrong thing about
    // what is covered.
    const expected = pushToMainWorkflows()
      .map((f) => workflowName(f))
      .sort()

    expect(
      expected.length,
      'no workflow in the tree declares `push:` to `main`. Either the repo changed shape or this ' +
        'derivation stopped matching — and a guard that derives an empty set passes vacuously, ' +
        'which is the failure this whole file is about.',
    ).toBeGreaterThanOrEqual(2)

    const alarm = wf('push-alarm.yml')
    const list = /workflow_run:[\s\S]*?workflows:\s*\[(.*?)\]/.exec(alarm)?.[1] ?? ''
    const watched = list
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
      .sort()

    expect(
      watched,
      "`push-alarm.yml`'s `workflow_run.workflows:` must equal the `name:` of every workflow that " +
        'triggers on `push:` to `main` — GitHub matches the DISPLAY NAME, and a trigger that ' +
        'matches nothing never runs. Derived set: ' +
        `[${expected.join(', ')}].`,
    ).toEqual(expected)
  })

  it('names a consequence for every producer it watches', () => {
    // The trigger decides what WAKES somebody; `PRODUCER_DETAIL` decides what
    // the first sentence says when it does. If they come apart, a woken reader
    // gets "this alarm does not recognise the workflow that produced this run"
    // — honest, and useless at the hour it arrives. The unknown branch stays
    // as the fail-safe; this keeps it from being the normal path.
    const files = pushToMainWorkflows().sort()
    const described = Object.keys(PRODUCER_DETAIL)
      .filter((k) => k !== 'unknown')
      .sort()
    expect(
      described,
      'every push-to-main workflow needs an entry in `PRODUCER_DETAIL` saying what ITS red means ' +
        '— a red deploy and a red post-merge browser run have different consequences and the ' +
        'reader needs the difference, not the average.',
    ).toEqual(files)
  })

  it('reads the producer from the event PATH, not the display name', () => {
    // The display name is the renameable thing — that is the hazard the
    // trigger comment is about — so the severity lookup must not depend on it.
    expect(producerOf({ path: '.github/workflows/deploy.yml' })).toBe('deploy.yml')
    expect(producerOf({ path: '.github/workflows/post-merge-e2e.yml' })).toBe('post-merge-e2e.yml')
    expect(producerOf({ path: '.github/workflows/something-else.yml' })).toBe('unknown')
    expect(producerOf({})).toBe('unknown')
  })

  it('looks the run history up PER PRODUCER, so one red streak cannot silence the other', () => {
    // A broken deploy and a broken browser journey are independent facts. If
    // the history lookup named one workflow, a red deploy streak would make
    // the first red post-merge run read as a continuation and nobody would be
    // woken for it.
    const code = wf('push-alarm.yml')
    expect(code).toContain('github.event.workflow_run.path')
    expect(
      code,
      'the history lookup must derive its `--workflow` from the event, never name one',
    ).not.toMatch(/gh run list[^\n]*--workflow\s+(deploy|post-merge-e2e)\.yml/)
  })

  it('fires on every completion, not only on failure', () => {
    // `types: [completed]` is wider than the alarm strictly needs and that is
    // deliberate twice over: GitHub has no `types: [failure]`, and a green run
    // reaching this workflow is what makes its run history a pairable record
    // of every deploy — which is how `schedule-heartbeat.yml` can tell the
    // alarm has stopped.
    expect(wf('push-alarm.yml')).toMatch(/types:\s*\[completed\]/)
  })

  it('does not share `deploy.yml`\'s concurrency group', () => {
    // Queueing the alarm behind the rollout it is reporting on is how an alarm
    // arrives after the incident.
    const alarm = wf('push-alarm.yml')
    const group = /concurrency:\s*\n\s*group:\s*(.+)/.exec(alarm)?.[1]?.trim()
    expect(group).toBeTruthy()
    expect(group).not.toContain('deploy-main')
  })

  it('holds no write scope and gates nothing', () => {
    const alarm = wf('push-alarm.yml')
    const block = /^permissions:\n((?:\s{2}\S+:.*\n)+)/m.exec(alarm)?.[1] ?? ''
    const scopes = block
      .trim()
      .split('\n')
      .map((l) => l.trim().split(/:\s*/) as [string, string])

    expect(scopes.length, 'the `permissions:` block must be explicit').toBeGreaterThan(0)
    for (const [scope, level] of scopes) {
      expect(level, `\`${scope}\` must be read-only on an alarm`).toBe('read')
      // `rulebook-drift.yml` shipped `administration: read`, which is not a
      // scope at all — GitHub rejected the whole file and published NO
      // check-run, twice, in 0 seconds.
      expect(['actions', 'contents', 'checks', 'pull-requests', 'issues']).toContain(scope)
    }

    expect(alarm).not.toMatch(/^\s*pull_request:/m)
    expect(alarm).not.toMatch(/^\s*push:/m)
  })

  it('does not publish a check named `test` or `e2e`', () => {
    // Main's two required contexts. A second producer of either name can
    // report a green check onto a commit the real suite never ran against.
    const alarm = wf('push-alarm.yml')
    for (const line of alarm.split('\n')) {
      const m = /^\s{2,}(?:name):\s*(.+?)\s*$/.exec(line)
      if (!m) continue
      expect(m[1].replace(/^['"]|['"]$/g, '')).not.toMatch(/^(test|e2e)$/)
    }
  })

  it('is in the workflow census, which is what §2 reads', () => {
    expect(
      'push-alarm.yml' in WORKFLOW_CENSUS,
      'a workflow file with no `WORKFLOW_CENSUS` entry in `scripts/rulebook-drift.mjs` is one ' +
        'nobody wrote down, and `rulebook-drift.yml` goes red on it the next morning.',
    ).toBe(true)
    expect(WORKFLOW_CENSUS['push-alarm.yml'].publishes).toEqual([])
  })

  it('tells the script where the event and the history are, on one line', () => {
    // A `\` continuation in the `run:` block would leave this regex matching
    // nothing while the workflow still worked — the shape `review-sweep.yml`
    // records. Asserted as one line for the same reason it is written as one.
    //
    // This is the test that caught the prose problem `wf` now solves for the
    // whole file: unfiltered, it found the header sentence naming the script
    // rather than the line that runs it.
    const line = wf('push-alarm.yml')
      .split('\n')
      .find((l) => l.includes('scripts/push-alarm.mjs'))
    expect(line).toBeTruthy()
    expect(line).toContain('--event event.json')
    expect(line).toContain('--history upstream-runs.json')
    expect(line).toContain('--wake-out wake.json')
  })

  it('passes the event payload through `env:` rather than interpolating it', () => {
    // `display_title` is the commit subject — attacker-influenced text — and
    // `${{ }}` inside a `run:` block is substituted before the shell sees it.
    const alarm = wf('push-alarm.yml')
    const runLines = alarm.split('\n').filter((l) => /^\s+(run:|\s{2,}\S)/.test(l))
    for (const line of runLines) {
      expect(line, 'never interpolate the upstream run object into a shell line').not.toMatch(
        /\$\{\{\s*github\.event\.workflow_run\.(display_title|head_branch|head_commit)/,
      )
    }
    expect(alarm).toMatch(/RUN_JSON:\s*\$\{\{\s*toJSON\(github\.event\.workflow_run\)\s*\}\}/)
  })

  it('restores the grading step\'s verdict after the wake', () => {
    // Without the restore step the whole alarm reports green while production
    // is down — the `process.exitCode = 0` mutation in workflow form.
    const alarm = wf('push-alarm.yml')
    expect(alarm).toMatch(/continue-on-error:\s*true/)
    expect(alarm).toMatch(/steps\.grade\.outcome == 'failure'/)
  })
})

describe('deploy alarm — which conclusions are red', () => {
  it('a failed deploy is a finding, and says production is behind', () => {
    const v = assess({ run: RUN, previous: null })
    expect(v.red).toBe(true)
    expect(v.producer).toBe('deploy.yml')
    expect(v.detail).toContain('The run FAILED.')
    expect(v.detail).toContain('production is serving an older commit')
  })

  it('a failed POST-MERGE run is a finding, and says the commit is already live', () => {
    // The severity difference that justifies one alarm rather than two: the
    // deploy holds production back, the browser suite does not. A reader woken
    // at 3am needs that in the first sentence, not after opening two tabs.
    const v = assess({
      run: {
        ...RUN,
        name: 'Post-merge E2E',
        path: '.github/workflows/post-merge-e2e.yml',
      },
      previous: null,
    })
    expect(v.red).toBe(true)
    expect(v.producer).toBe('post-merge-e2e.yml')
    expect(v.detail).toContain('ALREADY LIVE')
    expect(v.detail).not.toContain('production is serving an older commit')
  })

  it('an unrecognised producer is named as unrecognised, not described as one of them', () => {
    const v = assess({
      run: { ...RUN, name: 'Something new', path: '.github/workflows/something-new.yml' },
      previous: null,
    })
    expect(v.red).toBe(true)
    expect(v.detail).toContain('does not recognise the workflow')
  })

  it('a successful deploy is not', () => {
    expect(assess({ run: { ...RUN, conclusion: 'success' }, previous: null }).red).toBe(false)
  })

  it('CANCELLED is not a deploy failure — the concurrency group produces it', () => {
    // The false positive this refuses would fire on the busiest hour of any
    // given day. `cancel-in-progress: false` protects the RUNNING rollout;
    // GitHub still cancels superseded PENDING runs.
    const v = assess({ run: { ...RUN, conclusion: 'cancelled' }, previous: null })
    expect(v.red).toBe(false)
    expect(v.detail).toContain('deploy-main')
  })

  it('a TIMED OUT deploy is red', () => {
    expect(assess({ run: { ...RUN, conclusion: 'timed_out' }, previous: null }).red).toBe(true)
  })

  it('a STARTUP FAILURE is red — a 0-second run looks like one that never began', () => {
    const v = assess({ run: { ...RUN, conclusion: 'startup_failure' }, previous: null })
    expect(v.red).toBe(true)
    expect(v.detail).toContain('NEVER STARTED')
  })

  it('a conclusion nobody has looked at is RED, not silently passed', () => {
    const v = assess({ run: { ...RUN, conclusion: 'action_required' }, previous: null })
    expect(v.red).toBe(true)
    expect(v.known).toBe(false)
    expect(v.detail).toContain('does not recognise')
  })

  it('a missing conclusion is red rather than green', () => {
    expect(assess({ run: { ...RUN, conclusion: null }, previous: null }).red).toBe(true)
    expect(assess({ run: null, previous: null }).red).toBe(true)
  })

  it('the two lists do not overlap', () => {
    expect(RED_CONCLUSIONS.filter((c: string) => BENIGN_CONCLUSIONS.includes(c))).toEqual([])
  })
})

describe('deploy alarm — the wake fires once per streak and fails open', () => {
  const history = [
    { databaseId: 35816757446, conclusion: 'failure', status: 'completed', createdAt: '2026-09-23T04:03:13Z' },
    { databaseId: 35815939172, conclusion: 'failure', status: 'completed', createdAt: '2026-09-23T03:50:42Z' },
    { databaseId: 35815260160, conclusion: 'failure', status: 'completed', createdAt: '2026-09-23T03:40:28Z' },
    { databaseId: 35814438856, conclusion: 'success', status: 'completed', createdAt: '2026-09-23T03:28:07Z' },
  ]

  it('the FIRST red of a streak wakes', () => {
    const run = { ...RUN, id: 35815260160, created_at: '2026-09-23T03:40:28Z' }
    const v = assess({ run, previous: previousSettled(history, run) })
    expect(v.streak).toBe('new')
    expect(wakeDecision(v)).toEqual({ wake: true, reason: 'new-red' })
  })

  it('the SECOND and THIRD do not — one broken `main`, one issue', () => {
    for (const [id, at] of [
      [35815939172, '2026-09-23T03:50:42Z'],
      [35816757446, '2026-09-23T04:03:13Z'],
    ] as const) {
      const run = { ...RUN, id, created_at: at }
      const v = assess({ run, previous: previousSettled(history, run) })
      expect(v.streak, `run ${id}`).toBe('continuing')
      expect(wakeDecision(v).wake, `run ${id}`).toBe(false)
      // …but the run is still RED. The colour is free; the issue is not.
      expect(v.red).toBe(true)
    }
  })

  it('a green deploy never wakes anybody', () => {
    const run = { ...RUN, conclusion: 'success', created_at: '2026-09-23T04:47:57Z' }
    expect(wakeDecision(assess({ run, previous: previousSettled(history, run) }))).toEqual({
      wake: false,
      reason: 'green',
    })
  })

  it('an unreadable history WAKES rather than risking silence', () => {
    // The mirror of `scripts/review-sweep.mjs`'s `undated` suppression, and
    // the asymmetry is the point: a duplicate issue costs one agent run and a
    // sentence; a missed one costs the thing this alarm exists for.
    const v = assess({ run: RUN, previous: null, historyRead: false })
    expect(v.streak).toBe('unknown')
    expect(wakeDecision(v)).toEqual({ wake: true, reason: 'undated' })
  })

  it('a run still IN PROGRESS is not read as "the previous one was fine"', () => {
    // `conclusion: null` on an unsettled run would otherwise look benign, and
    // every deploy landing mid-rollout would mint a fresh edge.
    const withPending = [
      { databaseId: 99, conclusion: null, status: 'in_progress', createdAt: '2026-09-23T03:39:00Z' },
      ...history,
    ]
    const run = { ...RUN, id: 35815939172, created_at: '2026-09-23T03:50:42Z' }
    expect(previousSettled(withPending, run)?.databaseId).toBe(35815260160)
  })

  it('never pairs a run with itself', () => {
    const run = { ...RUN, id: 35815260160, created_at: '2026-09-23T03:40:28Z' }
    expect(previousSettled(history, run)?.databaseId).not.toBe(35815260160)
  })
})

describe('deploy alarm — the summary never reports a red deploy as a quiet morning', () => {
  it('names the run, the branch and what it means', () => {
    const v = assess({ run: RUN, previous: null, historyRead: false })
    const out = renderSummary(v, wakeDecision(v))
    expect(out).toContain('35815260160')
    expect(out).toContain('Deploy to AWS App Runner finished red on `main`')
    expect(out).toContain('Waking Quinn')
  })

  it('an unreadable event is reported as a non-result, not a clean one', () => {
    const v = assess({ run: null, previous: null })
    const out = renderSummary(v, wakeDecision(v))
    expect(out).toContain('This run graded nothing')
  })

  it('says out loud that a continuation was not woken for', () => {
    const v = assess({
      run: RUN,
      previous: { databaseId: 1, conclusion: 'failure', status: 'completed', createdAt: '2026-09-23T03:30:00Z' },
    })
    const out = renderSummary(v, wakeDecision(v))
    expect(out).toContain('CONTINUATION')
    expect(out).toContain('Nobody was woken (`still-red`)')
  })
})

describe('deploy alarm — the ringer rings (the script run as a process)', () => {
  function run(args: string[], cwd: string, env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [join(process.cwd(), 'scripts/push-alarm.mjs'), ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
  }

  function fixture(event: unknown, history: unknown) {
    const dir = mkdtempSync(join(tmpdir(), 'push-alarm-'))
    writeFileSync(join(dir, 'event.json'), JSON.stringify(event))
    if (history !== undefined) writeFileSync(join(dir, 'runs.json'), JSON.stringify(history))
    return dir
  }

  const args = ['--event', 'event.json', '--history', 'runs.json', '--wake-out', 'wake.json']

  it('a green deploy exits 0 and writes no wake', () => {
    const dir = fixture({ ...RUN, conclusion: 'success' }, [])
    const r = run(args, dir)
    expect(r.status).toBe(0)
    expect(JSON.parse(readFileSync(join(dir, 'wake.json'), 'utf8')).wake).toBe(false)
  })

  it('a red deploy exits 1 and reaches the annotations', () => {
    const dir = fixture(RUN, [])
    const r = run(args, dir)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('::error title=Deploy to AWS App Runner finished red on main::')
    expect(JSON.parse(readFileSync(join(dir, 'wake.json'), 'utf8')).wake).toBe(true)
  })

  it('a missing history file fails CLOSED on colour and OPEN on the wake', () => {
    const dir = fixture(RUN, undefined)
    const r = run(args, dir)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('could not ask its question')
    expect(JSON.parse(readFileSync(join(dir, 'wake.json'), 'utf8')).reason).toBe('undated')
  })

  it('a missing EVENT file is red, not a quiet pass', () => {
    const dir = mkdtempSync(join(tmpdir(), 'push-alarm-'))
    writeFileSync(join(dir, 'runs.json'), '[]')
    const r = run(args, dir)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('was not readable')
  })

  it('writes the summary to GITHUB_STEP_SUMMARY', () => {
    const dir = fixture(RUN, [])
    const summaryPath = join(dir, 'summary.md')
    writeFileSync(summaryPath, '')
    run(args, dir, { GITHUB_STEP_SUMMARY: summaryPath })
    expect(readFileSync(summaryPath, 'utf8')).toContain('Push-triggered alarm')
  })
})

/**
 * SENTINEL'S NOTES 3 AND 4 ON #700, both taken.
 *
 * Neither was blocking and both are real. They are grouped here because they
 * are the same family one level apart: a thing that is CORRECT and says
 * something FALSE about itself, and a predicate whose EYES are narrower than
 * its sentence claims.
 */
describe('push alarm — `cancelled` is benign for a reason that is true of THAT producer', () => {
  it('cites the deploy job\'s own concurrency for a cancelled deploy', () => {
    const v = assess({ run: { ...RUN, conclusion: 'cancelled' }, previous: null })
    expect(v.red).toBe(false)
    expect(v.detail).toContain('deploy-main')
    expect(v.detail).toContain('cancel-in-progress: false')
  })

  it('cites the BROWSER suite\'s own concurrency for a cancelled post-merge run', () => {
    // THE DEFECT THIS REFUSES: one justification printed for both producers.
    // The flags are OPPOSITE — `post-merge-e2e.yml` is `cancel-in-progress:
    // true` — so the old sentence handed a reader woken at 04:00 the wrong
    // file AND the wrong setting. No mutation finds this; only reading does.
    const v = assess({
      run: {
        ...RUN,
        conclusion: 'cancelled',
        name: 'Post-merge E2E',
        path: '.github/workflows/post-merge-e2e.yml',
      },
      previous: null,
    })
    expect(v.red).toBe(false)
    expect(v.detail).toContain('cancel-in-progress: true')
    expect(
      v.detail,
      'the browser suite has its own concurrency group; naming the deploy\'s sends the reader to ' +
        'the wrong file',
    ).not.toContain('deploy-main')
  })

  it('both justifications match what the workflow files actually say', () => {
    // BOTH SIDES READ OFF DISK. A sentence about a concurrency setting is
    // exactly the kind that rots when somebody edits the YAML, and the whole
    // point of this note was that such a sentence had already rotted.
    const deployOn = wf('deploy.yml')
    expect(deployOn).toContain('group: deploy-main')
    expect(deployOn).toMatch(/group: deploy-main\s*\n\s*cancel-in-progress: false/)

    const pmOn = wf('post-merge-e2e.yml')
    expect(pmOn).toMatch(/group: post-merge-e2e-[^\n]*\n\s*cancel-in-progress: true/)

    expect(CANCELLED_DETAIL['deploy.yml']).toContain('cancel-in-progress: false')
    expect(CANCELLED_DETAIL['post-merge-e2e.yml']).toContain('cancel-in-progress: true')
  })

  it('an unrecognised producer says it cannot name the rule, rather than naming the wrong one', () => {
    const v = assess({
      run: { ...RUN, conclusion: 'cancelled', path: '.github/workflows/zz-new.yml' },
      previous: null,
    })
    expect(v.red).toBe(false)
    expect(v.detail).toContain('does not recognise')
    expect(v.detail).not.toContain('deploy-main')
  })

  it('says out loud that a HUMAN cancellation is benign too', () => {
    // Deliberate and, until Sentinel asked, unstated: somebody pressing Cancel
    // leaves production on the old commit, and waking them to report their own
    // click is how an alarm gets muted.
    expect(CANCELLED_DETAIL['deploy.yml']).toContain('human pressing Cancel')
  })
})

describe('push alarm — the producer derivation sees a bare `push:` too', () => {
  it('a workflow with NO `branches:` filter counts as a producer', () => {
    // THE BLIND SPOT: a bare `push:` fires on EVERY branch, `main` included.
    // The first version read the `branches:` line, got `''`, and dropped the
    // file out of the expected set — so a third producer could arrive
    // unwatched with `test` staying green. Latent when found (all thirteen
    // files carried `branches: [main]`), closed while it was still free.
    const dir = mkdtempSync(join(tmpdir(), 'push-alarm-eyes-'))
    writeFileSync(
      join(dir, 'bare-push.yml'),
      ['name: Bare push', 'on:', '  push:', 'jobs:', '  a:', '    runs-on: ubuntu-latest', ''].join('\n'),
    )
    writeFileSync(
      join(dir, 'main-only.yml'),
      ['name: Main only', 'on:', '  push:', '    branches: [main]', 'jobs:', '  a:', '    runs-on: x', ''].join('\n'),
    )
    writeFileSync(
      join(dir, 'other-branch.yml'),
      ['name: Other', 'on:', '  push:', '    branches: [release]', 'jobs:', '  a:', '    runs-on: x', ''].join('\n'),
    )
    writeFileSync(
      join(dir, 'no-push.yml'),
      ['name: No push', 'on:', '  schedule:', "    - cron: '0 0 * * *'", 'jobs:', '  a:', '    runs-on: x', ''].join('\n'),
    )

    // THE REAL DERIVATION, pointed at a fixture tree.
    const matched = pushToMainWorkflows(dir).sort()

    expect(
      matched,
      'a bare `push:` fires on every branch and is a producer; a `branches: [release]` one is not',
    ).toEqual(['bare-push.yml', 'main-only.yml'])
  })

  it('and the real tree still resolves to exactly the two known producers', () => {
    // The widening must not have made the predicate promiscuous.
    expect(pushToMainWorkflows().sort()).toEqual(['deploy.yml', 'post-merge-e2e.yml'])
  })
})
