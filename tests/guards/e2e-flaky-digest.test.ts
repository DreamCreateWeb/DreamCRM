import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BROWSER_WORKFLOWS,
  REPEAT_OFFENDER_RUNS,
  REPORT_ARTIFACTS,
  WINDOW_DAYS,
  aggregate,
  assess,
  renderSummary,
  specKey,
} from '../../scripts/e2e-flaky-digest.mjs'
import { WORKFLOW_CENSUS } from '../../scripts/rulebook-drift.mjs'

/**
 * THE DIGEST THAT COUNTS WHAT THE PER-RUN REPORTER COULD ONLY NAME.
 *
 * `scripts/e2e-flaky-summary.mjs` closed half of this: a retry no longer erases
 * its own evidence. What it cannot do is COUNT — each report lands in one run's
 * summary and one artifact, and nothing had ever read two together. So
 * "portal-billing flaked" was a sentence somebody happened to see on a Tuesday
 * and "about once a day" was a guess, and a guess is not something anybody
 * schedules work against.
 *
 * The load-bearing properties, and why each is written against:
 *
 *   1. A REPEAT OFFENDER IS COUNTED IN RUNS, NOT OCCURRENCES. Forty flaky
 *      records from one run is one runner having a bad afternoon; two records
 *      from two runs is two runners, two throwaway databases and a property of
 *      the spec. Count occurrences instead and a single `--repeat-each` run
 *      could mint a finding out of nothing.
 *   2. IT LEADS WITH THE CENSUS. This alarm's steady state is genuinely quiet,
 *      so "nothing flaked" and "I read nothing" produce the same headline
 *      unless the denominators are on the page. A digest that examined zero
 *      runs and printed a tick is its own failure mode in its own uniform.
 *   3. IT FAILS CLOSED, AND IT GOES RED. A lookup that did not come back, an
 *      artifact that exists and could not be read, or a window with no browser
 *      runs at all, each reddens on its own terms — they make the number above
 *      them a lie of a different shape.
 *   4. IT DOES NOT RE-DERIVE FLAKINESS. `flakyTests` is the one reader of
 *      Playwright's report shape and has its own guard; a second parser here
 *      would be a second home that disagrees the first time either is touched.
 *   5. THE EVIDENCE OUTLIVES THE WINDOW. An eight-day window over seven-day
 *      artifacts loses that race every time GitHub's scheduler slips, and the
 *      digest would report a gap every single week — a permanently red alarm,
 *      which §2a forbids outright. So the producers' retention is graded here
 *      against the window, rather than the two numbers being set in four files
 *      and hoped about.
 *   6. THE RINGER RINGS. The last block drives the script as a process: every
 *      assertion above can pass while `main()` reports nothing, which is
 *      exactly what #593 found in the review sweep.
 */

const WORKFLOW_DIR = join(process.cwd(), '.github/workflows')
const DIGEST = 'e2e-flaky-digest.yml'
const digestSource = readFileSync(join(WORKFLOW_DIR, DIGEST), 'utf8')

/** A Playwright JSON report with one flaky test in it, in the real nested shape. */
function report(specs: Array<{ file: string; title: string; error?: string }>) {
  return {
    suites: specs.map((s) => ({
      title: s.file,
      file: s.file,
      specs: [
        {
          title: s.title,
          file: s.file,
          line: 42,
          tests: [
            {
              status: 'flaky',
              projectName: 'chromium',
              results: [
                { status: 'failed', error: { message: s.error ?? 'strict mode violation: resolved to 2 elements' } },
                { status: 'passed' },
              ],
            },
          ],
        },
      ],
      suites: [],
    })),
  }
}

const BILLING = { file: 'e2e/portal-billing.spec.ts', title: 'when the card processor is down' }
const RESCHEDULE = { file: 'e2e/portal-reschedule.spec.ts', title: 'a patient moves a visit' }

describe('a repeat offender is counted in RUNS, not occurrences', () => {
  it('names a spec that flaked in two separate runs', () => {
    const specs = aggregate({ '100': report([BILLING]), '200': report([BILLING]) })
    expect(specs).toHaveLength(1)
    expect(specs[0].runCount).toBe(2)

    const { findings, watchlist } = assess({ specs, census: { runs: 9, reports: 2, unreadable: [] } })
    expect(findings.map((f) => String(f.file))).toEqual(['e2e/portal-billing.spec.ts'])
    expect(watchlist).toEqual([])
  })

  it('leaves a spec that flaked once on the watchlist, and does not redden the run', () => {
    // ONE FLAKE IN ONE RUN IS WEATHER. The harness carries genuine
    // infrastructure noise — that is why `retries: 1` exists at all — and the
    // run it happened on already named it. Promoting it to an alarm here is how
    // a weekly digest learns to be ignored.
    const specs = aggregate({ '100': report([BILLING]) })
    const { findings, watchlist, blind } = assess({
      specs,
      census: { runs: 9, reports: 1, unreadable: [] },
    })
    expect(findings).toEqual([])
    expect(watchlist).toHaveLength(1)
    expect(blind).toEqual([])
  })

  it('does not let one run mint a finding out of many occurrences', () => {
    // THE DIRECTION THE THRESHOLD EXISTS FOR. A single run carrying the same
    // spec twice — two projects, or a `--repeat-each` pass — is still ONE
    // runner and ONE database. Counting occurrences would call that a rate.
    const twiceInOneRun = {
      suites: [
        {
          title: BILLING.file,
          file: BILLING.file,
          specs: [
            {
              title: BILLING.title,
              file: BILLING.file,
              tests: [
                { status: 'flaky', projectName: 'chromium', results: [{ status: 'failed' }, { status: 'passed' }] },
                { status: 'flaky', projectName: 'chromium', results: [{ status: 'failed' }, { status: 'passed' }] },
              ],
            },
          ],
          suites: [],
        },
      ],
    }
    const specs = aggregate({ '100': twiceInOneRun })
    expect(specs[0].occurrences).toBe(2)
    expect(specs[0].runCount, 'two records, one run').toBe(1)
    expect(assess({ specs, census: { runs: 9, reports: 1, unreadable: [] } }).findings).toEqual([])
  })

  it('keeps two different specs apart, and sorts the worst first', () => {
    const specs = aggregate({
      '100': report([BILLING, RESCHEDULE]),
      '200': report([BILLING]),
      '300': report([BILLING]),
    })
    expect(specs.map((s) => s.runCount)).toEqual([3, 1])
    expect(specs[0].file).toBe(BILLING.file)
    expect(specKey(specs[0])).not.toBe(specKey(specs[1]))
  })

  it('labels an entry with the checks it flaked in', () => {
    // A spec that only ever flakes overnight is a different animal from one
    // that flakes on PRs. The per-run reporter makes a point of naming the
    // check for the same reason.
    const specs = aggregate(
      { '100': report([BILLING]), '200': report([BILLING]) },
      { '100': { workflowName: 'CI' }, '200': { workflowName: 'Nightly' } },
    )
    expect(specs[0].checks).toEqual(['CI', 'Nightly'])
  })

  it('survives a report shape nobody pictured', () => {
    // A digest that throws on one malformed report loses the whole week's
    // count. The run is still counted as examined; it contributes nothing.
    const specs = aggregate({ '100': { suites: 'not an array' }, '200': report([BILLING]) })
    expect(specs).toHaveLength(1)
  })
})

describe('the digest says what it could not see', () => {
  const specs: Array<Record<string, unknown>> = []

  it('reddens on an artifact that existed and did not arrive', () => {
    // NOT THE SAME AS "no artifact". A clean run uploads nothing by design, so
    // absence is a zero. An artifact that EXISTS belongs to a run that had
    // already failed or flaked — exactly the runs with something to say.
    const { blind } = assess({
      specs,
      census: { runs: 40, reports: 3, unreadable: ['35789025973'] },
    })
    expect(blind).toHaveLength(1)
    expect(blind[0]).toContain('35789025973')
  })

  it('reddens on a window with no browser runs in it at all', () => {
    // Zero is not a quiet week: every PR runs `e2e` and every merge runs
    // `e2e-post-merge`. Zero means the suite stopped, the lookup is reading the
    // wrong thing, or the window is wrong — and all three are worth a red run.
    const { blind } = assess({ specs, census: { runs: 0, reports: 0, unreadable: [] } })
    expect(blind.join(' ')).toMatch(/no browser-suite run at all/)
  })

  it('passes a failed lookup straight through rather than treating it as clean', () => {
    const { blind } = assess({
      specs,
      census: { runs: 40, reports: 3, unreadable: [] },
      lookupFailures: ['the artifact lookup produced nothing usable'],
    })
    expect(blind).toHaveLength(1)
  })

  it('is quiet when there is genuinely nothing to say — but prints the denominator', () => {
    const graded = assess({ specs, census: { runs: 41, reports: 0, unreadable: [] } })
    expect(graded.blind).toEqual([])
    const summary = renderSummary(graded, { runs: 41, reports: 0, unreadable: [] })
    expect(
      summary,
      'a clean week must still show what it looked at — otherwise "no flakes" and "I read ' +
        'nothing" are the same sentence',
    ).toContain('41')
  })
})

describe('the summary leads with what it looked at', () => {
  it('prints both denominators before any verdict', () => {
    const specs = aggregate({ '100': report([BILLING]), '200': report([BILLING]) })
    const census = { runs: 41, reports: 2, unreadable: [] }
    const summary = renderSummary(assess({ specs, census }), census)

    const censusAt = summary.indexOf('41')
    const verdictAt = summary.indexOf('repeat offender')
    expect(censusAt).toBeGreaterThan(-1)
    expect(verdictAt).toBeGreaterThan(-1)
    expect(censusAt, 'the census must come before the finding, not after it').toBeLessThan(verdictAt)
  })

  it('tells the reader how to turn a finding into a rate', () => {
    // A digest that names a flake and stops has handed somebody the same
    // problem in a bigger font. The hunt is the next step and the command is
    // the deliverable.
    const specs = aggregate({ '100': report([BILLING]), '200': report([BILLING]) })
    const census = { runs: 41, reports: 2, unreadable: [] }
    const summary = renderSummary(assess({ specs, census }), census)
    expect(summary).toContain('gh workflow run e2e-flake-hunt.yml')
    expect(summary).toContain('e2e/portal-billing.spec.ts')
  })
})

describe('the evidence outlives the window', () => {
  // THE TWO NUMBERS ARE SET IN FIVE FILES AND HAVE TO AGREE. An eight-day
  // window over seven-day artifacts loses that race every time GitHub's
  // scheduler slips — measured at five and a half hours on an ordinary day —
  // and the digest would report a gap every single week. A permanently red
  // alarm is a disabled alarm, which is the one thing §2a forbids outright.
  const producers = ['ci.yml', 'post-merge-e2e.yml', 'nightly.yml']

  it('every workflow that uploads a report keeps it longer than the window', () => {
    for (const file of producers) {
      const source = readFileSync(join(WORKFLOW_DIR, file), 'utf8')
      const retentions = (source.match(/retention-days:\s*\d+/g) ?? []).map((m) => Number(/\d+/.exec(m)?.[0]))
      expect(retentions.length, `${file} uploads a report, so it must set a retention`).toBeGreaterThan(0)
      for (const days of retentions) {
        expect(
          days,
          `${file} keeps its Playwright report ${days} days, and the digest looks back ` +
            `${WINDOW_DAYS}. The digest would then name a gap every week it ran, and an alarm ` +
            'that is always red is one nobody reads. Raise the retention, do not shrink the window.',
        ).toBeGreaterThan(WINDOW_DAYS)
      }
    }
  })

  it('the window is wider than the cadence it runs on', () => {
    // A window exactly one cadence wide leaves a hole the size of the
    // scheduler's slip, and a run in the hole is examined by no digest ever —
    // the rolling-window failure `review-sweep.yml` refuses in its header.
    const cron = /-\s*cron:\s*'([^']+)'/.exec(digestSource)?.[1]
    expect(cron, 'the digest must declare a schedule, or nothing runs it').toBeTruthy()
    const dayField = String(cron).trim().split(/\s+/)[4]
    expect(dayField, 'a weekly cron pins the day of week').not.toBe('*')
    expect(WINDOW_DAYS, 'eight days against a seven-day cadence — one day of slip allowance').toBeGreaterThan(7)
  })

  it('reads every artifact name the producers actually write', () => {
    // DERIVED FROM THE PRODUCERS, not from memory. A fourth browser workflow,
    // or a renamed artifact, would otherwise leave the digest reading a subset
    // and reporting a rate that is quietly too low.
    for (const file of producers) {
      const source = readFileSync(join(WORKFLOW_DIR, file), 'utf8')
      for (const line of source.match(/name:\s*playwright-report[\w-]*/g) ?? []) {
        const artifact = line.replace(/^name:\s*/, '')
        expect(
          REPORT_ARTIFACTS,
          `${file} uploads \`${artifact}\` and the digest does not read it, so every rate it ` +
            'prints is too low by whatever that workflow contributes.',
        ).toContain(artifact)
      }
    }
  })

  it('does NOT read the hunt — its failures are a deliverable, not a flake rate', () => {
    // A hunt runs one spec fifty times at --retries=0 on purpose. Pooling its
    // numbers would put a figure nobody should act on in the same column as the
    // routine runs, and the rate that matters is the rate the SUITE flakes at.
    expect(REPORT_ARTIFACTS).not.toContain('playwright-report-flake-hunt')
    expect(BROWSER_WORKFLOWS).not.toContain('e2e-flake-hunt.yml')
    expect(digestSource).not.toMatch(/--workflow\s+"?e2e-flake-hunt\.yml/)
  })

  it('names every browser-running workflow the census knows about', () => {
    // Cross-checked against WORKFLOW_CENSUS rather than against itself: the
    // list here is what the denominator is made of, and a browser workflow
    // missing from it makes every rate too high.
    for (const file of BROWSER_WORKFLOWS) {
      expect(WORKFLOW_CENSUS, `${file} must be a workflow this repo actually has`).toHaveProperty(file)
    }
  })
})

describe('the digest workflow cannot gate a merge', () => {
  it('has no PR or push trigger, and does have a schedule', () => {
    expect(digestSource).not.toMatch(/^\s{2}pull_request:/m)
    expect(digestSource).not.toMatch(/^\s{2}push:/m)
    expect(
      digestSource,
      'without a cron it is a button nobody presses — and the schedule is also what puts it in ' +
        "scripts/schedule-heartbeat.mjs's derived list, which is the thing that notices it stopped",
    ).toMatch(/^\s{2}schedule:/m)
  })

  it('publishes neither required status-check context', () => {
    for (const required of ['test', 'e2e']) {
      expect(digestSource).not.toMatch(new RegExp(`^\\s{2}${required}:\\s*$`, 'm'))
      expect(digestSource).not.toMatch(new RegExp(`^\\s+name:\\s*${required}\\s*$`, 'm'))
    }
  })

  it('asks for read scopes only, spelled the way GitHub spells them', () => {
    // `rulebook-drift.yml` once shipped `administration: read`, which is not a
    // scope: GitHub rejected the whole file and published NO check-run, twice,
    // in 0 seconds — a failure `gh pr checks` cannot show.
    const block = /permissions:\n((?:\s{2}\w[\w-]*:\s*\w+\n)+)/.exec(digestSource)?.[1] ?? ''
    const scopes = (block.match(/\w[\w-]*:\s*\w+/g) ?? []).map((l) => l.split(/:\s*/))
    expect(scopes.length, 'the digest must declare an explicit permissions block').toBeGreaterThan(0)
    for (const [name, level] of scopes) {
      expect(['actions', 'contents']).toContain(name)
      expect(level, 'this job writes nothing back to GitHub').toBe('read')
    }
  })

  it('caps its own wall time', () => {
    expect(digestSource).toMatch(/^\s+timeout-minutes:\s*\d+/m)
  })
})

describe('the digest is told the same limit it fetched with', () => {
  // THE HALF THAT MAKES THE LIMIT A CHECK RATHER THAN A GUESS. Raising
  // `RUN_LIMIT` without raising `--run-limit` leaves the truncation detector
  // grading against a number the fetch no longer uses — it would then either
  // cry wolf on every run or, in the dangerous direction, never fire again.
  // `review-sweep.yml` carries the identical contract for `gh pr list`.
  const fetched = /RUN_LIMIT:\s*'(\d+)'/.exec(digestSource)?.[1]
  const told = /--run-limit\s+(\d+)/.exec(digestSource)?.[1]

  it('declares a fetch limit and passes it to the script', () => {
    expect(fetched, 'the fetch limit must be a declared value, not inline in the gh call').toBeTruthy()
    expect(told, 'the script must be told the limit or it cannot detect truncation').toBeTruthy()
  })

  it('uses the same number in both places', () => {
    expect(
      told,
      `the run list is fetched at --limit ${fetched} and the script is told ${told}. They are the ` +
        'same number twice on purpose: the detector grades the count against what was actually ' +
        'asked for, and a mismatch makes it either permanently red or permanently blind.',
    ).toBe(fetched)
  })

  it('fetches enough for the measured window', () => {
    // Measured 2026-09-23 over the real 8-day window: 423 ci.yml runs, 127
    // post-merge-e2e, 9 nightly. It was 200, which kept the last ~4 days of
    // ci.yml under a headline saying 8. This floor is a reminder that the
    // number is measured rather than picked — the detector is what catches it
    // being outgrown, and this is what stops it shipping already outgrown.
    expect(Number(fetched)).toBeGreaterThan(423 * 2)
  })

  it('filters the run list server-side, so the limit is the only truncation signal', () => {
    // `--created` is what makes the count-at-limit test valid: everything
    // returned is inside the window by construction, so `windowGap`'s
    // oldest-row comparison would prove nothing here. Drop this flag and the
    // list is the newest N runs of all time, the window becomes a fiction, and
    // the truncation check silently starts grading something else.
    expect(digestSource).toMatch(/--created\s+"?>=/)
  })
})

describe('the alarm actually raises the alarm', () => {
  // #593's lesson, applied before it costs anything: every assertion above
  // imports the classifier and none of them executed the script, so zeroing the
  // exit code or dropping the annotation loop would pass all of them while
  // silently disabling the instrument in production.
  function runDigest(opts: {
    runs?: unknown
    artifacts?: unknown
    reports?: Record<string, unknown>
    omitRuns?: boolean
    /** Lines the workflow wrote about lookups that died. `null` omits the file. */
    lookups?: string[] | null
    noJson?: string[]
    runLimit?: number
  }) {
    const dir = mkdtempSync(join(tmpdir(), 'digest-'))
    const runsPath = join(dir, 'runs.json')
    const artifactsPath = join(dir, 'artifacts.json')
    const lookupsPath = join(dir, 'lookup-failures.txt')
    const noJsonPath = join(dir, 'no-json.txt')
    const reportsDir = join(dir, 'reports')
    mkdirSync(reportsDir)

    if (!opts.omitRuns) writeFileSync(runsPath, JSON.stringify(opts.runs ?? []))
    writeFileSync(artifactsPath, JSON.stringify(opts.artifacts ?? []))
    // The workflow truncates this file at the top of its first step, so the
    // DEFAULT here is an empty file — present and clean — not an absent one.
    if (opts.lookups !== null) writeFileSync(lookupsPath, (opts.lookups ?? []).join('\n'))
    writeFileSync(noJsonPath, (opts.noJson ?? []).join('\n'))
    for (const [id, value] of Object.entries(opts.reports ?? {})) {
      writeFileSync(join(reportsDir, `${id}.json`), JSON.stringify(value))
    }

    const r = spawnSync(
      process.execPath,
      [
        'scripts/e2e-flaky-digest.mjs',
        '--runs', runsPath,
        '--artifacts', artifactsPath,
        '--reports', reportsDir,
        '--lookups', lookupsPath,
        '--no-json', noJsonPath,
        '--run-limit', String(opts.runLimit ?? 1000),
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    )
    return { code: r.status, out: r.stdout ?? '' }
  }

  const runs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ databaseId: 100 + i, workflowName: 'CI', conclusion: 'success' }))

  it('exits non-zero and annotates when a spec flaked in two runs', () => {
    const { code, out } = runDigest({
      runs: runs(9),
      reports: { '100': report([BILLING]), '101': report([BILLING]) },
    })
    expect(out).toContain('::error title=e2e/portal-billing.spec.ts flaked in 2 separate runs')
    expect(
      code,
      'a red run is the only channel this digest has. Exit 0 and it finds the repeat offender, ' +
        'writes it into a job summary nobody opens, and reports green every Monday forever.',
    ).toBe(1)
  })

  it('exits zero on a week where one spec flaked once', () => {
    const { code, out } = runDigest({ runs: runs(9), reports: { '100': report([BILLING]) } })
    expect(out).toMatch(/flaked once/)
    expect(code, 'a single flake must not cry wolf').toBe(0)
  })

  it('exits zero on a genuinely clean week, and still prints the denominator', () => {
    const { code, out } = runDigest({ runs: runs(41) })
    expect(out).toContain('41')
    expect(code).toBe(0)
  })

  it('exits non-zero when an artifact it was told about never arrived', () => {
    const { code, out } = runDigest({
      runs: runs(9),
      artifacts: [{ name: 'playwright-report', runId: 999, expired: false }],
    })
    expect(out).toMatch(/could not be DOWNLOADED/)
    expect(code, 'a week it could not read is not a week it cleared').toBe(1)
  })

  it('exits non-zero when the run lookup never produced a file', () => {
    const { code, out } = runDigest({ omitRuns: true })
    expect(out).toMatch(/produced nothing usable/)
    expect(code).toBe(1)
  })

  it('exits non-zero when the window contains no browser run at all', () => {
    const { code, out } = runDigest({ runs: [] })
    expect(out).toMatch(/no browser-suite run at all/)
    expect(code).toBe(1)
  })

  it('exits non-zero when a run lookup came back AT its limit — the truncated denominator', () => {
    // BLOCKING FINDING 1 ON #684, driven end to end. At `--limit 200` the real
    // window's 423 `ci.yml` runs came back as 200, most-recent-first, and the
    // artifact filter is built from that list — so every report belonging to a
    // discarded run was dropped before the download step, nothing reached
    // `unreadable`, and the digest exited 0 over the half it never looked at.
    const atLimit = Array.from({ length: 50 }, (_, i) => ({
      databaseId: 100 + i,
      workflowName: 'CI',
      workflowFile: 'ci.yml',
      conclusion: 'success',
    }))
    const { code, out } = runDigest({ runs: atLimit, runLimit: 50 })

    expect(out).toMatch(/TRUNCATED/)
    expect(out).toContain('ci.yml')
    expect(
      code,
      'a silently short denominator is the one outcome worse than no digest, because the whole ' +
        'argument for this file is "a number instead of a hunch"',
    ).toBe(1)
  })

  it('exits zero when the same list comes back short of its limit', () => {
    // The other direction: the truncation check must not fire on an ordinary
    // week, or it is a weekly red and nobody reads it.
    const { code, out } = runDigest({ runs: runs(41), runLimit: 1000 })
    expect(out).not.toMatch(/TRUNCATED/)
    expect(code).toBe(0)
  })

  it('exits non-zero when a lookup died, even though it left valid JSON behind', () => {
    // BLOCKING FINDING 2 ON #684, and the shape matters: the old workflow
    // wrote `[]` on failure. `[]` is VALID JSON, so `readJson` reported no
    // problem, `lookupFailures` stayed empty, `expected` was `[]`, `unreadable`
    // was `[]`, and the run printed "No test needed a retry in any of the 0
    // reports this week" and exited 0 — a quiet clean week over evidence it
    // could not read, in the file whose header says it fails closed.
    //
    // The ringer previously only covered the artifacts file being MISSING,
    // which is not the shape the `||` produced.
    const { code, out } = runDigest({
      runs: runs(41),
      artifacts: [], // exactly what the old `|| echo '[]'` wrote
      lookups: ['the artifact lookup failed (gh api exited non-zero)'],
    })

    expect(out).toMatch(/could not see/)
    expect(out).toMatch(/gh api exited non-zero/)
    expect(code, 'valid JSON from a dead lookup must not read as a clean week').toBe(1)
  })

  it('exits non-zero when the workflow never wrote its lookup record at all', () => {
    // The file is created at the top of the first step, so its absence means
    // that step did not run — a run that cannot say whether its lookups
    // succeeded. Fail closed.
    const { code, out } = runDigest({ runs: runs(41), lookups: null })
    expect(out).toMatch(/never wrote its lookup record/)
    expect(code).toBe(1)
  })

  it('names an artifact with no results JSON — and does NOT redden on it', () => {
    // Sentinel's non-blocking note, and the classification is the point. The
    // producers upload on `failure()`, which includes a run that died before
    // playwright wrote its JSON. The artifact downloads fine and holds no test
    // results, so nothing was lost and nothing could have been learned. Filing
    // that as "could not be read" would redden this alarm most weeks.
    const { code, out } = runDigest({
      runs: runs(41),
      artifacts: [{ name: 'playwright-report', runId: 777, expired: false }],
      noJson: ['777'],
    })

    expect(out).toContain('777')
    expect(out).toMatch(/no `e2e-results.json` inside/)
    expect(out, 'it is not a hole, so it must not be filed as one').not.toMatch(/could not be DOWNLOADED/)
    expect(code, 'a run that failed before playwright wrote anything is not a blind spot').toBe(0)
  })

  it('still reddens when an artifact was listed and simply did not arrive', () => {
    // The distinction above must not swallow the real hole: an artifact the
    // digest was told about, that is neither on disk nor on the no-json list,
    // is evidence it could not read.
    const { code, out } = runDigest({
      runs: runs(41),
      artifacts: [{ name: 'playwright-report', runId: 999, expired: false }],
      noJson: ['777'],
    })
    expect(out).toMatch(/could not be DOWNLOADED/)
    expect(out).toContain('999')
    expect(code).toBe(1)
  })

  it('keeps the threshold honest against the constant', () => {
    // Guards the one edit that silently disables this: raising
    // REPEAT_OFFENDER_RUNS makes the digest go quiet without anything else
    // changing shape.
    expect(REPEAT_OFFENDER_RUNS).toBe(2)
  })
})
