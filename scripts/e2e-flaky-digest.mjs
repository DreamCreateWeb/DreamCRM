// NO SHEBANG, DELIBERATELY — the same lesson `scripts/e2e-flaky-summary.mjs`,
// `scripts/review-sweep.mjs`, `scripts/schedule-heartbeat.mjs` and three others
// all carry in their first line. The workflow runs `node
// scripts/e2e-flaky-digest.mjs`, so it was never load-bearing, and git hands
// this file to a Windows working tree with CRLF endings: vitest's SSR transform
// leaves the `\r` behind when it strips `#!…` and every test importing this
// module dies with a parse error at column 1.
/**
 * WHICH SPECS FLAKED THIS WEEK — ACROSS RUNS, NOT WITHIN ONE.
 *
 * `scripts/e2e-flaky-summary.mjs` closed the first half of this problem: a
 * retry no longer erases its own evidence. It names every test that passed only
 * on a second attempt, on that run's job summary, and makes CI keep the
 * Playwright report for a green run too.
 *
 * What it cannot do is COUNT. Each report is written into one run's summary and
 * one 7-day artifact, and nothing has ever read two of them together — so
 * "`portal-billing` flaked" was a sentence somebody happened to see on a
 * Tuesday, and "`portal-billing` flakes about once a day" was a guess. A flake
 * that appears in one run is weather. The same flake in four runs in a week is
 * a defect with a rate, and the difference between those two readings is the
 * only thing that decides whether anybody works on it.
 *
 * So: one weekly job that reads the week's own reports and asks whether any
 * spec is a REPEAT OFFENDER.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE IS THE SCHEDULE HEARTBEAT'S, DELIBERATELY.
 *
 *   * **It leads with what it looked at, never with a tick.** A digest that
 *     examined zero runs and printed "no flakes this week" is this file's own
 *     failure mode wearing its own uniform — and unlike most alarms it has a
 *     genuinely quiet steady state, so the census is the only thing that tells
 *     a clean week from a blind one.
 *   * **It goes RED on a finding**, and §2a's "a permanently red alarm is a
 *     disabled alarm" is satisfied rather than ignored: the window is one
 *     cadence wide, so a flake fixed on Tuesday reddens at most ONE more digest
 *     before the window rolls past it. There is no queue to work through entry
 *     by entry, which is the property that made `review-sweep`'s exit status
 *     need narrowing and leaves this one alone.
 *   * **It fails closed.** A lookup that did not come back, or a report the
 *     download could not produce, is a finding — not a quiet clean week. A
 *     digest cannot tell "nothing flaked" from "I could not see" without
 *     saying which one it is.
 *   * **Something watches it.** It has a `cron:`, so it is in
 *     `scripts/schedule-heartbeat.mjs`'s derived list and reports on its own
 *     silence like every other schedule. That is the standing convention: a
 *     check that cannot fail is not a check, and every new alarm ships with the
 *     thing that notices it stopped.
 *
 * ---------------------------------------------------------------------------
 * THE EVIDENCE HAD TO OUTLIVE THE WINDOW, AND IT DID NOT.
 *
 * The three producing workflows uploaded their reports with `retention-days:
 * 7`, sized for a person opening ONE report after a red run. A weekly digest
 * with a 7-day window and 7-day evidence is a race it loses every week:
 * GitHub's scheduler is best-effort and this repo has measured daily jobs
 * landing five and a half hours late, so the window's far end would always sit
 * just past the oldest surviving artifact and the digest would report a gap
 * every single week. That is a permanently-red alarm, which is the one thing
 * §2a forbids outright.
 *
 * So the retention moved to 14 days rather than the window shrinking. The
 * window is EIGHT days against a seven-day cadence — a day of slip allowance,
 * so consecutive digests overlap instead of leaving a hole the way a rolling
 * "last N hours" window does on a schedule that slips (the mistake
 * `review-sweep.yml`'s header records) — and the evidence now outlives it by
 * six days.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   * **It does not read `e2e-flake-hunt.yml`.** A hunt runs one spec fifty
 *     times at `--retries=0` on purpose; its failures are the deliverable, not
 *     an accident, and pooling them would put a number nobody should act on
 *     into the same column as the routine runs. The rate this file reports is
 *     the rate the SUITE flakes at, which is the only rate that means anything
 *     about whether the gate can be trusted.
 *   * **It does not re-derive flakiness.** `flakyTests` in
 *     `scripts/e2e-flaky-summary.mjs` is the one reader of Playwright's report
 *     shape, and it is graded by its own guard. A second parser here would be
 *     a second home that disagrees the first time either is touched.
 *   * **It does not judge a run that left no report.** The producers upload
 *     `if: failure() || flaky`, so a green-and-clean run has no artifact by
 *     design. Absence is a zero, not a hole — the hole is an artifact that
 *     EXISTS and could not be read, which is named.
 *
 * Usage:
 *   node scripts/e2e-flaky-digest.mjs --runs runs.json --artifacts artifacts.json \
 *                                     --reports reports/
 */
import { existsSync, readFileSync, readdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { flakyTests } from './e2e-flaky-summary.mjs'

/**
 * How far back a digest looks, in days.
 *
 * EIGHT against a seven-day cadence. The extra day is slip allowance, and it is
 * measured rather than picked: GitHub's `schedule` queue put this repo's daily
 * jobs five to five and a half hours late on an ordinary Tuesday
 * (DREAMCRM-99), and `docs/CI.md` records a `0 7` schedule landing +6h34m. A
 * seven-day window on a seven-day cadence leaves a hole exactly that wide every
 * time the scheduler slips, and a run that falls in the hole is never examined
 * by any digest — the failure `review-sweep.yml` refuses a rolling window over.
 *
 * Overlapping is the safe direction: a flake counted in two consecutive digests
 * is a sentence printed twice, and a flake counted in neither is the thing this
 * file exists to prevent.
 */
export const WINDOW_DAYS = 8

/**
 * How many DISTINCT runs a spec must flake in before it is a finding.
 *
 * TWO, and the word that matters is DISTINCT. One flake in one run is weather —
 * the throwaway-Postgres harness carries genuine infrastructure noise, which is
 * the whole reason `retries: 1` exists — and the per-run reporter already names
 * it on the run where it happened. The same spec flaking in two separate runs,
 * on two separate runners, against two separate throwaway databases, is not
 * noise: it is a property of the spec or of the code under it.
 *
 * Counting RUNS rather than occurrences is load-bearing. A single run of a
 * `--repeat-each` hunt could produce forty flaky records for one spec and mean
 * nothing about the suite; forty records from forty runs is a rate. (The hunt
 * is excluded anyway — see the header — but the counting rule should be right
 * for its own reasons and not because of a filter somewhere else.)
 */
export const REPEAT_OFFENDER_RUNS = 2

/** Artifact names the digest reads. `playwright-report-flake-hunt` is NOT one. */
export const REPORT_ARTIFACTS = [
  'playwright-report',
  'playwright-report-post-merge',
  'playwright-report-nightly',
]

/**
 * The workflows whose browser runs make up the denominator.
 *
 * Kept as a list the guard test reads back against `WORKFLOW_CENSUS`, so a
 * fourth browser-running workflow cannot arrive and be silently left out of the
 * rate — which would make every rate this file prints quietly too high.
 */
export const BROWSER_WORKFLOWS = ['ci.yml', 'post-merge-e2e.yml', 'nightly.yml']

/** A stable identity for one test across runs: where it lives and what it is called. */
export const specKey = (t) => `${t.file} ${t.title}${t.project ? ` ${t.project}` : ''}`

/**
 * Fold every run's report into one entry per spec.
 *
 * `reports` is `{ [runId]: <playwright json report> }`. `runsById` is whatever
 * the run lookup returned, used only to label an entry with the check it flaked
 * in — a spec that only ever flakes in `nightly-e2e` and never on a PR is a
 * different animal from one that flakes everywhere, and the per-run summary
 * already made a point of naming the check for exactly that reason.
 */
export function aggregate(reports, runsById = {}) {
  const bySpec = new Map()

  for (const [runId, report] of Object.entries(reports)) {
    let flaky = []
    try {
      flaky = flakyTests(report)
    } catch {
      // A report shape nobody pictured must not take the digest down with it.
      // The run is still counted as examined; it simply contributes nothing.
      continue
    }
    for (const test of flaky) {
      const key = specKey(test)
      const entry = bySpec.get(key) ?? {
        file: test.file,
        title: test.title,
        project: test.project || '',
        runs: new Set(),
        checks: new Set(),
        occurrences: 0,
        messages: new Set(),
      }
      entry.runs.add(String(runId))
      entry.occurrences += 1
      const run = runsById[String(runId)]
      if (run?.workflowName) entry.checks.add(run.workflowName)
      if (test.firstFailure) entry.messages.add(test.firstFailure)
      bySpec.set(key, entry)
    }
  }

  return [...bySpec.values()]
    .map((e) => ({
      file: e.file,
      title: e.title,
      project: e.project,
      runs: [...e.runs],
      runCount: e.runs.size,
      checks: [...e.checks].sort(),
      occurrences: e.occurrences,
      messages: [...e.messages],
    }))
    .sort((a, b) => b.runCount - a.runCount || b.occurrences - a.occurrences || a.file.localeCompare(b.file))
}

/**
 * The verdict.
 *
 * `findings` are the repeat offenders — what reddens the run. `watchlist` is
 * every spec that flaked exactly once, printed and not judged: the per-run
 * reporter already named it where it happened, and promoting a single flake to
 * an alarm is how this digest would learn to be ignored.
 *
 * `blind` is the other kind of finding and it is NOT a subset of the first:
 * a lookup that did not come back, an artifact that exists and could not be
 * read, or a window with no browser runs in it at all. Each of those makes the
 * number above it a lie of a different shape, so each reddens the run on its
 * own terms.
 */
export function assess({ specs, census, lookupFailures = [] }) {
  const findings = specs.filter((s) => s.runCount >= REPEAT_OFFENDER_RUNS)
  const watchlist = specs.filter((s) => s.runCount < REPEAT_OFFENDER_RUNS)

  const blind = [...lookupFailures]

  if (census.unreadable?.length) {
    blind.push(
      `${census.unreadable.length} report ${census.unreadable.length === 1 ? 'artifact' : 'artifacts'} ` +
        `in the window could not be read (${census.unreadable.join(', ')}). Every run that left one ` +
        'had already failed or flaked, so these are exactly the runs with something to say.',
    )
  }

  if (census.runs === 0) {
    blind.push(
      `no browser-suite run at all in the last ${WINDOW_DAYS} days, across ` +
        `${BROWSER_WORKFLOWS.join(', ')}. That is not a quiet week — every PR runs \`e2e\` and ` +
        'every merge runs `e2e-post-merge`, so zero means the suite stopped running, the lookup ' +
        'is reading the wrong thing, or the window is wrong.',
    )
  }

  return { findings, watchlist, blind }
}

/* --------------------------------------------------------------- report -- */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The job summary.
 *
 * LEADS WITH THE CENSUS. This alarm's steady state is genuinely quiet, so
 * "nothing flaked" and "I read nothing" produce the same headline unless the
 * denominators are on the page. `scripts/schedule-heartbeat.mjs` and
 * `scripts/review-sweep.mjs` both open this way and for the same reason.
 */
export function renderSummary({ findings, watchlist, blind }, census) {
  const lines = ['### Weekly E2E flake digest', '']

  lines.push(
    `Read **${plural(census.reports, 'Playwright report', 'Playwright reports')}** from ` +
      `**${plural(census.runs, 'browser-suite run', 'browser-suite runs')}** in the last ` +
      `${WINDOW_DAYS} days (${BROWSER_WORKFLOWS.map((w) => `\`${w}\``).join(', ')}).`,
    '',
    '_A run that passed cleanly uploads no report — the producers upload `if: failure() || flaky`' +
      ' — so most of that gap is good news rather than missing evidence. The exception is named ' +
      'below if there is one._',
    '',
  )

  if (blind.length) {
    lines.push(`#### ${plural(blind.length, 'thing', 'things')} this digest could not see`, '')
    for (const why of blind) lines.push(`- ${why}`)
    lines.push(
      '',
      'Counted and named rather than dropped: a week this digest could not read is not a week it ' +
        'cleared. This run is red on that alone.',
      '',
    )
  }

  if (findings.length) {
    lines.push(
      `#### ${plural(findings.length, 'spec is', 'specs are')} a repeat offender`,
      '',
      `Each flaked in **${REPEAT_OFFENDER_RUNS} or more separate runs** this week — separate ` +
        'runners, separate throwaway databases. That is not harness weather; it is a defect in ' +
        'the spec or in the code under it, and it has been reporting **green** every time.',
      '',
      '| Test | Where | Runs | Occurrences | Checks | First attempt failed with |',
      '| --- | --- | --- | --- | --- | --- |',
    )
    for (const s of findings) {
      lines.push(
        `| ${s.title}${s.project ? ` _(${s.project})_` : ''} | \`${s.file}\` | **${s.runCount}** | ` +
          `${s.occurrences} | ${s.checks.join(', ') || '—'} | ` +
          `${s.messages[0] ? `\`${s.messages[0].replace(/\|/g, '\\|').slice(0, 120)}\`` : '—'} |`,
      )
    }
    lines.push(
      '',
      'Run one to ground with the hunt rather than guessing at a rate:',
      '',
      '```bash',
      `gh workflow run e2e-flake-hunt.yml -f spec=${findings[0].file} -f repeat=50`,
      '```',
      '',
    )
  }

  if (watchlist.length) {
    lines.push(
      `#### ${plural(watchlist.length, 'spec', 'specs')} flaked once — printed, not judged`,
      '',
      'One flake in one run is weather, and the run it happened on already named it. Here so the ' +
        'next digest has something to compare against.',
      '',
    )
    for (const s of watchlist) {
      lines.push(`- \`${s.file}\` — ${s.title}${s.project ? ` _(${s.project})_` : ''}`)
    }
    lines.push('')
  }

  if (!findings.length && !blind.length && !watchlist.length) {
    lines.push(
      `_No test needed a retry in any of the ${census.reports} reports this week. The count above ` +
        'is the denominator that makes that a claim rather than a shrug._',
      '',
    )
  }

  return lines.join('\n')
}

/* ----------------------------------------------------------------- main -- */

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Read a JSON file, saying which way it failed rather than pretending it was empty. */
export function readJson(path) {
  if (!path || !existsSync(path)) return { value: null, why: `the file \`${path}\` was not written` }
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), why: null }
  } catch (err) {
    return { value: null, why: `the file \`${path}\` is not JSON (${err.message})` }
  }
}

/**
 * Every `<runId>.json` the workflow managed to download, keyed by run id.
 *
 * A directory that does not exist is not the same as a directory with nothing
 * in it, and the caller is told which.
 */
export function readReports(dir) {
  if (!dir || !existsSync(dir)) return { reports: {}, why: `no report directory at \`${dir}\`` }
  const reports = {}
  const failed = []
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue
    const runId = name.replace(/\.json$/, '')
    try {
      reports[runId] = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    } catch {
      failed.push(runId)
    }
  }
  return { reports, failed, why: null }
}

function main() {
  const runsFile = readJson(argValue('--runs'))
  const artifactsFile = readJson(argValue('--artifacts'))
  const { reports, failed = [], why: reportsWhy } = readReports(argValue('--reports'))

  const lookupFailures = []
  if (runsFile.why) lookupFailures.push(`the browser-run lookup produced nothing usable — ${runsFile.why}`)
  if (artifactsFile.why) lookupFailures.push(`the artifact lookup produced nothing usable — ${artifactsFile.why}`)
  if (reportsWhy) lookupFailures.push(`the downloaded reports were not there — ${reportsWhy}`)

  const runs = Array.isArray(runsFile.value) ? runsFile.value : []
  const runsById = {}
  for (const r of runs) if (r?.databaseId != null) runsById[String(r.databaseId)] = r

  // An artifact that EXISTS in the window and produced no local file is the
  // one real hole: every run that uploads one had already failed or flaked, so
  // these are exactly the runs with something to say.
  const expected = (Array.isArray(artifactsFile.value) ? artifactsFile.value : [])
    .filter((a) => REPORT_ARTIFACTS.includes(a?.name))
    .map((a) => String(a?.runId ?? ''))
    .filter(Boolean)
  const unreadable = [...new Set(expected.filter((id) => !(id in reports)))].concat(failed)

  const census = { runs: runs.length, reports: Object.keys(reports).length, unreadable }
  const specs = aggregate(reports, runsById)
  const graded = assess({ specs, census, lookupFailures })
  const summary = renderSummary(graded, census)

  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')

  for (const s of graded.findings) {
    console.log(
      `::error title=${s.file} flaked in ${s.runCount} separate runs this week::` +
        `"${s.title}" passed only on a retry in ${s.runCount} runs (${s.occurrences} occurrences). ` +
        `Every one of those runs reported green. Hunt it: gh workflow run e2e-flake-hunt.yml ` +
        `-f spec=${s.file} -f repeat=50`,
    )
  }
  for (const why of graded.blind) {
    console.log(`::error title=The flake digest could not read its own week::${why}`)
  }

  // RED IS THE RIGHT SIGNAL. Same argument as `scripts/schedule-heartbeat.mjs`:
  // the findings are single-action and the window is one cadence wide, so there
  // is no queue to keep this red for weeks — a flake fixed on Tuesday reddens
  // at most one more digest. A digest that cannot fail is the thing it was
  // written to detect.
  process.exitCode = graded.findings.length || graded.blind.length ? 1 : 0
}

// Direct invocation only, so the guard test can import the pure halves.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
