import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SLIP_ALLOWANCE_MINUTES,
  assess,
  assessWorkflow,
  cronsIn,
  declaredSchedules,
  expectedWindowMinutes,
  nominalIntervalMinutes,
  parseCron,
  renderSummary,
} from '../../scripts/schedule-heartbeat.mjs'
import { WORKFLOW_CENSUS } from '../../scripts/rulebook-drift.mjs'

/**
 * THE HEARTBEAT THAT WATCHES THE OTHER ALARMS, CHECKED.
 *
 * THE GAP IT CLOSES: this repo has six scheduled workflows and nothing checked
 * that any of them ran. Every one is an alarm — the production error scan, the
 * nightly suite, the production read check, the post-merge review sweep, the
 * rulebook drift check, the migration check — and a stopped alarm is
 * indistinguishable from an alarm reporting that everything is fine. Both are
 * silence. `nightly.yml`'s own header records that GitHub disables scheduled
 * workflows after 60 quiet days and advises checking the Actions tab, which
 * works only while somebody chooses to look.
 *
 * The load-bearing properties, and why each is written against rather than
 * noted:
 *
 *   1. THE LIST IS DERIVED FROM THE TREE. A second list of workflow names is
 *      the exact failure this check exists to catch, one level up: it would go
 *      green about a schedule it had stopped looking at. So the test asserts
 *      the derived list against the real `.github/workflows/` directory, and
 *      that EVERY file declaring a cron is in it.
 *   2. THE CADENCE IS COMPUTED FROM THE CRON, not assumed daily. A
 *      half-hourly job and a daily one cannot share a window, and the cron
 *      parser is where that goes quietly wrong — `0 9 * * 1-5` is daily with a
 *      72-hour hole across the weekend, and standard cron ORs the two day
 *      fields when both are restricted. Getting the OR backwards under-reports
 *      fires and so OVERSTATES every interval, which is the direction that
 *      makes this check blind.
 *   3. THE WINDOW IS GENEROUS, DELIBERATELY. Measured 2026-09-22: five daily
 *      jobs nominally at 06:17–08:20 UTC fired at 11:34–13:26, five to five and
 *      a half hours late, on an ordinary day. This answers "has it stopped",
 *      not "did it run on time"; a tighter window reports GitHub's queue as a
 *      defect and the alarm is muted inside a fortnight.
 *   4. A `workflow_dispatch` RUN IS NOT EVIDENCE. Somebody pressing the button
 *      is the one signal this check must never accept as proof the SCHEDULE is
 *      alive — that is the whole question. Pinned on the workflow's `gh` call.
 *   5. IT FAILS CLOSED, AND IT GOES RED. A failed lookup, a disabled workflow
 *      and an unreadable cron all redden the run. Unlike `review-sweep.yml`
 *      there is no queue behind the red — every finding here is binary and
 *      single-action — so the §2a "permanently red alarm" argument does not
 *      apply and exit 0 would make this the thing it was built to detect.
 *   6. THE RINGER MUST RING. The pure functions can be perfect while `main()`
 *      never fails — Sentinel's #593 finding. The last blocks run the script as
 *      a process and read the workflow file.
 */

const DAY = 1440

describe('schedule heartbeat — the list is derived, never typed', () => {
  it('finds every workflow in the real tree that declares a cron', () => {
    const declared = declaredSchedules()
    const files = declared.map((d) => d.file).sort()

    // Cross-checked against a SECOND, independent read of the same directory —
    // a grep for the cron key rather than the indentation-aware scanner — so a
    // scanner that silently stopped matching cannot pass by agreeing with
    // itself.
    const byGrep = Object.keys(WORKFLOW_CENSUS)
      .concat(['schedule-heartbeat.yml'])
      .filter((f) => {
        try {
          return /^\s*-\s*cron:/m.test(readFileSync(join(process.cwd(), '.github/workflows', f), 'utf8'))
        } catch {
          return false
        }
      })
      .sort()

    expect(
      files,
      'the scanner in scripts/schedule-heartbeat.mjs and a plain grep for `- cron:` must agree. ' +
        'They do not, which means the scanner is skipping a schedule — and a schedule nothing ' +
        'looks at is exactly what this job exists to prevent.',
    ).toEqual(Array.from(new Set(byGrep)))

    expect(files.length, 'this repo had six scheduled workflows before this one').toBeGreaterThanOrEqual(7)
  })

  it('every scheduled workflow this check watches is one the rulebook census knows about', () => {
    // The census is the OTHER derived list in this repo, and the two must not
    // drift apart silently: a schedule the census has never heard of is a
    // workflow file nobody wrote down.
    const declared = declaredSchedules().map((d) => d.file)
    const unknown = declared.filter((f) => !(f in WORKFLOW_CENSUS))
    expect(
      unknown,
      `these files declare a schedule but have no WORKFLOW_CENSUS entry in ` +
        `scripts/rulebook-drift.mjs: ${unknown.join(', ')}. Add one saying what the workflow does ` +
        `and what it publishes.`,
    ).toEqual([])
  })

  it('the scanner takes crons under `schedule:` and nothing else', () => {
    // The shapes that would fool a naive grep, each one real: a `cron` word in
    // a comment, a cron under a DIFFERENT key, and a dedent back out of the
    // block.
    const text = [
      'on:',
      '  schedule:',
      "    - cron: '17 6 * * *'",
      "    - cron: '47 6 * * *'",
      '  workflow_dispatch: {}',
      'jobs:',
      '  x:',
      '    steps:',
      "      # - cron: '0 0 * * *'  (commented out, must not count)",
      '      - name: not a schedule',
      '        with:',
      "          cron: '5 5 * * *'",
    ].join('\n')

    expect(cronsIn(text)).toEqual(['17 6 * * *', '47 6 * * *'])
  })

  it('CRLF line endings do not change what the scanner sees', () => {
    // This repo had no `.gitattributes` until DREAMCRM-99, so a Windows author
    // and the runner that gates the merge read different bytes for the same
    // commit. A guard that reads files off disk inherits that; this one strips
    // the `\r` and says so.
    const lf = "on:\n  schedule:\n    - cron: '7 7 * * *'\n"
    expect(cronsIn(lf.replace(/\n/g, '\r\n'))).toEqual(cronsIn(lf))
  })
})

describe('schedule heartbeat — the cadence comes from the cron', () => {
  it('reads this repo\'s real expressions', () => {
    expect(nominalIntervalMinutes('*/30 * * * *')).toBe(30)
    expect(nominalIntervalMinutes('20 8 * * *')).toBe(DAY)
    expect(nominalIntervalMinutes('37 6 * * *')).toBe(DAY)
    expect(nominalIntervalMinutes('47 6 * * *')).toBe(DAY)
    expect(nominalIntervalMinutes('17 6 * * *')).toBe(DAY)
    expect(nominalIntervalMinutes('7 7 * * *')).toBe(DAY)
  })

  it('takes the SHORTEST gap, which is the honest cadence for an irregular schedule', () => {
    // Weekdays at 09:00 promises daily four times a week and 72 hours once.
    // The conservative reading of "how often does this fire" is the small one;
    // the window doubles it anyway.
    expect(nominalIntervalMinutes('0 9 * * 1-5')).toBe(DAY)
    // Twice an hour at :00 and :45 — the gap is 15 minutes, not 45.
    expect(nominalIntervalMinutes('0,45 * * * *')).toBe(15)
  })

  it('ORs the two day fields when both are restricted, the way cron does', () => {
    // THE DIRECTION THAT MAKES THIS CHECK BLIND. ANDing them finds fewer fires,
    // which OVERSTATES the interval, which widens the window, which is how a
    // stopped schedule goes unnoticed. `1 0 1 * 0` fires on the 1st of the
    // month OR on any Sunday, so the shortest gap is the distance from a 1st
    // to the Sunday after it — three days in the reference month the walk
    // starts in. Under the wrong (AND) reading it is "a 1st that falls on a
    // Sunday", which is MONTHS, and the window would be months wide.
    expect(nominalIntervalMinutes('1 0 1 * 0'), 'both day fields restricted means OR, not AND').toBe(3 * DAY)

    // And one restricted field alone still behaves.
    expect(nominalIntervalMinutes('0 0 * * 0')).toBe(7 * DAY)
    expect(nominalIntervalMinutes('0 0 1 * *')).toBe(28 * DAY)
  })

  it('refuses an expression it cannot read rather than guessing one', () => {
    for (const bad of ['', 'not a cron', '* * * *', '*/0 * * * *', '99 * * * *', '@daily', '0 0 L * *']) {
      expect(parseCron(bad), `\`${bad}\` must not parse`).toBeNull()
      expect(nominalIntervalMinutes(bad)).toBeNull()
    }
  })

  it('the window is twice the cadence plus the measured slip', () => {
    expect(expectedWindowMinutes(30)).toBe(30 + SLIP_ALLOWANCE_MINUTES)
    expect(expectedWindowMinutes(DAY)).toBe(2 * DAY)

    // The measurement the allowance is set from: this repo's daily jobs were
    // 5h26m late on an ordinary day, and the half-hourly scan's worst observed
    // gap is 412 minutes. Both must sit comfortably inside their window, or
    // this alarm reports GitHub's queue and gets muted.
    expect(expectedWindowMinutes(DAY)).toBeGreaterThan(Math.round(5.5 * 60) + DAY)
    expect(expectedWindowMinutes(30)).toBeGreaterThan(412)
  })
})

describe('schedule heartbeat — a stopped schedule is a finding, lateness is not', () => {
  const now = Date.parse('2026-09-22T19:00:00Z')
  const wf = (over: Record<string, unknown> = {}) => ({
    file: 'nightly.yml',
    crons: ['37 6 * * *'],
    run: { databaseId: 1, conclusion: 'success', createdAt: '2026-09-22T11:59:48Z' },
    state: 'active',
    addedAt: '2026-05-01T00:00:00Z',
    now,
    ...over,
  })

  it('a daily job that fired seven hours late is OK — that is GitHub, not a defect', () => {
    // The real numbers off this repo on 2026-09-22.
    const r = assessWorkflow(wf())
    expect(r.verdict).toBe('ok')
    expect(r.ageMinutes).toBe(420)
  })

  it('a daily job silent for three days is STOPPED', () => {
    const r = assessWorkflow(wf({ run: { createdAt: '2026-09-19T11:00:00Z', conclusion: 'success' } }))
    expect(r.verdict).toBe('stopped')
    expect(r.detail, 'the message must distinguish itself from lateness in so many words').toContain(
      'This is not lateness',
    )
    expect(r.detail).toContain('2880 minutes')
  })

  it('GitHub reporting the workflow DISABLED is a finding whatever the run history says', () => {
    // The strongest signal available, and the one `gh run list` cannot give:
    // "has not run lately" versus "will never run again".
    const r = assessWorkflow(wf({ state: 'disabled_inactivity' }))
    expect(r.verdict).toBe('disabled')
    expect(r.detail, 'the 60-day case nightly.yml warns about must be named').toContain('60-day')

    const manual = assessWorkflow(wf({ state: 'disabled_manually' }))
    expect(manual.verdict).toBe('disabled')
    expect(manual.detail).toContain('by hand')
  })

  it('a workflow merged this morning is NOT reported as stopped before its first fire is due', () => {
    // The false positive that would arrive with this very PR. An instrument
    // whose entire value is being believed does not get to cry wolf on the day
    // it lands.
    const r = assessWorkflow(
      wf({ file: 'schedule-heartbeat.yml', crons: ['7 7 * * *'], run: null, addedAt: '2026-09-22T18:00:00Z' }),
    )
    expect(r.verdict).toBe('not-yet-due')
    expect(assess({ declared: [], runs: {}, states: {}, now }).findings).toEqual([])
  })

  it('a workflow with no run and no readable add date says WHICH lookup failed', () => {
    const r = assessWorkflow(wf({ run: null, addedAt: null }))
    expect(r.verdict).toBe('never-fired')
    expect(r.detail, 'pointing at fetch-depth: 0 is the actionable half').toContain('fetch-depth: 0')
  })

  it('a cron nobody can grade is a finding, never a skip', () => {
    // A schedule this check cannot read is a schedule it is not watching, and
    // silently skipping it is the failure mode one level up.
    const r = assessWorkflow(wf({ crons: ['0 0 L * *'] }))
    expect(r.verdict).toBe('unreadable-cron')
    expect(r.detail).toContain('cannot tell whether it stopped')
  })

  it('the WORST cron in a multi-schedule workflow sets the window', () => {
    // `nightly.yml` could grow a second cron tomorrow. The cadence that
    // matters is the most frequent one — anything slower is still inside it.
    const r = assessWorkflow(wf({ crons: ['37 6 * * *', '*/30 * * * *'] }))
    expect(r.interval).toBe(30)
    expect(r.window).toBe(30 + SLIP_ALLOWANCE_MINUTES)
  })
})

describe('schedule heartbeat — the summary never reports silence as health', () => {
  const now = Date.parse('2026-09-22T19:00:00Z')

  it('leads with how many it looked at, and prints the age of each', () => {
    const graded = assess({
      declared: [{ file: 'nightly.yml', crons: ['37 6 * * *'] }],
      runs: { 'nightly.yml': { createdAt: '2026-09-22T11:59:48Z', conclusion: 'success' } },
      states: { 'nightly.yml': 'active' },
      now,
    })
    const out = renderSummary(graded)
    expect(out).toContain('Asked GitHub about **1 scheduled workflow**')
    expect(out).toContain('420m ago')
    expect(out).toContain('derived from the `cron:` entries')
  })

  it('a run that graded ZERO workflows is reported as a non-result, not a clean one', () => {
    // The shape this whole file distrusts: an alarm that examined nothing and
    // printed a tick.
    const out = renderSummary(assess({ declared: [], now }))
    expect(out).toContain('This run graded nothing')
    expect(out).not.toContain('Every scheduled workflow has a run')
  })

  it('a failed lookup is named in the summary rather than swallowed', () => {
    const out = renderSummary(assess({ declared: [{ file: 'a.yml', crons: ['*/30 * * * *'] }], now }), {
      lookupFailures: ['the workflow-state lookup produced nothing usable'],
    })
    expect(out).toContain('Some lookups did not come back')
    expect(out).toContain('is not a workflow this run cleared')
  })
})

describe('schedule heartbeat — the ringer rings (the script run as a process)', () => {
  function run(args: string[], cwd: string, env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [join(process.cwd(), 'scripts/schedule-heartbeat.mjs'), ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
  }

  /** A scratch repo root with a `.github/workflows` of our own. */
  function scratch(files: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), 'heartbeat-'))
    const wfDir = join(dir, '.github', 'workflows')
    spawnSync('node', ['-e', `require('fs').mkdirSync(${JSON.stringify(wfDir)}, { recursive: true })`])
    for (const [name, body] of Object.entries(files)) writeFileSync(join(wfDir, name), body)
    return dir
  }

  const daily = (cron: string) => `name: x\non:\n  schedule:\n    - cron: '${cron}'\njobs:\n  a:\n    runs-on: ubuntu-latest\n`

  it('a healthy tree exits 0', () => {
    const dir = scratch({ 'a.yml': daily('37 6 * * *') })
    writeFileSync(
      join(dir, 'runs.json'),
      JSON.stringify({ 'a.yml': { createdAt: new Date(Date.now() - 60 * 60_000).toISOString() } }),
    )
    writeFileSync(join(dir, 'workflows.json'), JSON.stringify([{ path: '.github/workflows/a.yml', state: 'active' }]))
    const out = run(['--runs', 'runs.json', '--workflows', 'workflows.json'], dir)
    expect(out.status, out.stdout).toBe(0)
    expect(out.stdout).toContain('Every scheduled workflow has a run inside the window')
  })

  it('a stopped schedule exits 1 and reaches the annotations', () => {
    // THE PROPERTY THIS BLOCK EXISTS FOR. `process.exitCode = 0` is a one-token
    // edit after which this finds the dead alarm, prints it into a job summary
    // nobody opens, and reports green every morning forever — which is the
    // exact defect it was written to detect, one level up.
    const dir = scratch({ 'a.yml': daily('37 6 * * *') })
    writeFileSync(
      join(dir, 'runs.json'),
      JSON.stringify({ 'a.yml': { createdAt: new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString() } }),
    )
    writeFileSync(join(dir, 'workflows.json'), JSON.stringify([{ path: '.github/workflows/a.yml', state: 'active' }]))
    const out = run(['--runs', 'runs.json', '--workflows', 'workflows.json'], dir)
    expect(out.status).toBe(1)
    expect(out.stdout).toContain('::error title=a.yml has stopped firing::')
  })

  it('a missing lookup file fails CLOSED — red, with the reason printed', () => {
    const dir = scratch({ 'a.yml': daily('37 6 * * *') })
    const out = run(['--runs', 'nope.json', '--workflows', 'nope.json'], dir)
    expect(out.status, 'one throttled API call must not print a quiet morning over a dead schedule').toBe(1)
    expect(out.stdout).toContain('Some lookups did not come back')
  })

  it('names WHICH lookup failed, one at a time', () => {
    // The mutation that got past the test above: it passed both files as
    // missing, so dropping the RUN lookup's failure still left the
    // workflow-state one to redden the run. Each has to be driven alone, or
    // either can be deleted under the cover of the other — the §2d shape where
    // a green run proves less than it looks like it proves.
    const dir = scratch({ 'a.yml': daily('37 6 * * *') })
    writeFileSync(join(dir, 'workflows.json'), JSON.stringify([{ path: '.github/workflows/a.yml', state: 'active' }]))
    const noRuns = run(['--runs', 'nope.json', '--workflows', 'workflows.json'], dir)
    expect(noRuns.status).toBe(1)
    expect(
      noRuns.stdout,
      'a run history that never came back must be reported as a failed LOOKUP, not silently as ' +
        '"this schedule has never fired" — the second reading points the reader at the wrong repair',
    ).toContain('the run lookup produced nothing usable')

    writeFileSync(join(dir, 'runs.json'), JSON.stringify({ 'a.yml': { createdAt: new Date().toISOString() } }))
    const noStates = run(['--runs', 'runs.json', '--workflows', 'nope.json'], dir)
    expect(noStates.status).toBe(1)
    expect(noStates.stdout).toContain('the workflow-state lookup produced nothing usable')
  })

  it('writes the summary to GITHUB_STEP_SUMMARY', () => {
    const dir = scratch({ 'a.yml': daily('37 6 * * *') })
    const summaryPath = join(dir, 'summary.md')
    writeFileSync(summaryPath, '')
    writeFileSync(join(dir, 'runs.json'), JSON.stringify({ 'a.yml': { createdAt: new Date().toISOString() } }))
    writeFileSync(join(dir, 'workflows.json'), JSON.stringify([{ path: '.github/workflows/a.yml', state: 'active' }]))
    run(['--runs', 'runs.json', '--workflows', 'workflows.json'], dir, { GITHUB_STEP_SUMMARY: summaryPath })
    expect(readFileSync(summaryPath, 'utf8')).toContain('Scheduled-workflow heartbeat')
  })
})

describe('schedule heartbeat — the workflow asks the question the script answers', () => {
  const wf = () => readFileSync(join(process.cwd(), '.github/workflows/schedule-heartbeat.yml'), 'utf8')

  /**
   * The workflow with comment lines removed. Load-bearing for the same reason
   * `tests/guards/error-scan.test.ts` needs it: this file EXPLAINS
   * `--event schedule` and `fetch-depth: 0` in prose right above the lines that
   * use them, so a plain `toContain` over the raw text stays green when the
   * flag is deleted and the comment describing it survives.
   */
  const wfCode = () =>
    wf()
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n')

  it('counts only `schedule`-triggered runs, on main', () => {
    // A `workflow_dispatch` run proves somebody pressed the button, which is
    // the one thing this check must not accept as evidence the SCHEDULE is
    // alive — and GitHub only runs `schedule` from the default branch.
    expect(wfCode(), 'without --event schedule, a hand-dispatched run hides a dead cron').toContain(
      '--event schedule',
    )
    expect(wfCode()).toContain('--branch main')
  })

  it('asks GitHub directly whether each workflow is disabled', () => {
    expect(wfCode()).toContain('gh workflow list')
    expect(wfCode()).toContain('state')
  })

  it('checks out enough history to date a new workflow file', () => {
    // Without this the `git log --diff-filter=A` lookup returns nothing on
    // every workflow and a brand-new schedule reads as one that has never
    // worked.
    expect(wfCode()).toContain('fetch-depth: 0')
    expect(wfCode()).toContain('--diff-filter=A')
  })

  it('derives the files it asks about instead of naming them', () => {
    const code = wfCode()
    expect(code).toContain('.github/workflows/*.yml')
    for (const f of Object.keys(WORKFLOW_CENSUS)) {
      expect(code, `${f} is named in the workflow. The list must be derived — a hardcoded name is ` +
        `the failure this whole job exists to catch, one level up.`).not.toContain(f)
    }
  })

  it('holds no write scope and gates nothing', () => {
    const text = wf()
    const block = /permissions:\n((?:\s{2}\w[\w-]*:\s*\w+\n)+)/.exec(text)?.[1] ?? ''
    const scopes = Object.fromEntries(
      block
        .trim()
        .split('\n')
        .map((l) => l.trim().split(/:\s*/) as [string, string]),
    )
    expect(scopes.actions).toBe('read')
    expect(scopes.contents).toBe('read')
    expect(Object.values(scopes).filter((v) => v === 'write')).toEqual([])
    expect(text).not.toMatch(/^\s*pull_request:/m)
    expect(text).not.toMatch(/^\s*needs:/m)
  })

  it('does not publish a check named `test` or `e2e`', () => {
    // Main's two required contexts. A second producer of either name can report
    // a green check onto a commit the real suite never ran against.
    const jobs = Array.from(wf().matchAll(/^ {2}([a-z][\w-]*):$/gm)).map((m) => m[1])
    expect(jobs).not.toContain('test')
    expect(jobs).not.toContain('e2e')
  })
})
