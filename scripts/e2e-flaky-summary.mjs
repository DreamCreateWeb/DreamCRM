#!/usr/bin/env node
/**
 * A TEST THAT PASSED ON THE SECOND TRY HAS TO LEAVE A TRACE.
 *
 * `playwright.config.ts` sets `retries: 1` under CI, deliberately — the
 * throwaway-Postgres harness carries genuine infrastructure noise, and a suite
 * that goes red on it is a suite people learn to ignore. The cost of that
 * retry, until now, was that it also ERASED the evidence: a spec that failed
 * once and passed on the retry reported the job green, and `ci.yml` uploaded
 * `playwright-report/` only `if: failure()`, so the trace, the screenshot and
 * the first attempt's error were thrown away with the runner.
 *
 * That is not hypothetical. The portal-reschedule flake (DREAMCRM-21) survived
 * for weeks exactly this way: three full-suite runs failed, `retries: 1`
 * absorbed every one of them, and the only reason anybody found it was that
 * somebody happened to be looking at a red run for another reason. The
 * evidence that would have named it in minutes existed on three runners and
 * was deleted three times.
 *
 * So the retry stays and the silence goes. This reads Playwright's own JSON
 * report, finds the tests it marked `flaky` (failed, then passed on retry),
 * writes them to the run's job summary naming the check they flaked in, and
 * tells the workflow to keep the report artifact for a green run too.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   - It does not set `retries: 0`. That trades a quiet flake for a loud false
 *     red on every PR, which is worse.
 *   - It never fails the build. A reporting step that can turn a green run red
 *     is a reporting step someone eventually deletes. Every failure path here
 *     (missing file, unparseable JSON, an unexpected report shape) prints and
 *     exits 0. The signal is the summary and the retained artifact.
 *
 * Usage:  node scripts/e2e-flaky-summary.mjs [path-to-results.json]
 *
 * Outside Actions it just prints. Inside Actions it also appends to
 * `$GITHUB_STEP_SUMMARY` and writes `flaky` / `flaky-count` to `$GITHUB_OUTPUT`
 * so the artifact-upload step can key off it.
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Where `playwright.config.ts` points its CI json reporter. */
export const DEFAULT_RESULTS_PATH = 'e2e-results.json'

/** Playwright's own name for "failed at least once, then passed". */
const FLAKY = 'flaky'

/** Drop terminal colour codes — a job summary renders them as literal noise. */
function plain(text) {
  // eslint-disable-next-line no-control-regex
  return String(text ?? '').replace(/\[[0-9;]*m/g, '')
}

/** First line of an error, which is the part that identifies it. */
function firstLine(text) {
  return plain(text).split('\n').find((l) => l.trim().length > 0)?.trim() ?? ''
}

/**
 * Every test Playwright marked flaky, with the attempt that failed.
 *
 * Exported for `tests/guards/e2e-flaky-summary.test.ts`: the whole value of
 * this file is that it notices something, and a detector nobody has watched
 * detect anything is indistinguishable from one that always reports clean.
 *
 * The report is a tree — a suite per file, nested suites for `describe`
 * blocks, specs at the leaves, and one `test` per project per spec. The file
 * lives on the top-level suite and is echoed onto each spec; the describe
 * titles only exist on the suites in between, so they are accumulated on the
 * way down.
 */
export function flakyTests(report) {
  const found = []

  const walk = (suite, titlePath) => {
    // The top-level suite's title IS the file path; nested ones are describes.
    const path = suite.title && suite.title !== suite.file ? [...titlePath, suite.title] : titlePath

    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status !== FLAKY) continue
        const results = test.results ?? []
        const failed = results.find((r) => r.status !== 'passed')
        found.push({
          title: [...path, spec.title].join(' › '),
          file: spec.file ?? suite.file ?? '(unknown file)',
          line: spec.line,
          project: test.projectName || '',
          attempts: results.length,
          firstFailure: firstLine(failed?.error?.message ?? failed?.errors?.[0]?.message ?? ''),
        })
      }
    }

    for (const child of suite.suites ?? []) walk(child, path)
  }

  for (const suite of report?.suites ?? []) walk(suite, [])
  return found
}

/**
 * The job-summary markdown.
 *
 * NAMES THE CHECK, on purpose. A reader arriving at a summary from a green PR
 * has no other way to tell which required check absorbed the retry — `e2e` on
 * a PR, `e2e-post-merge` on main, `nightly-e2e` overnight all produce the same
 * shape of evidence and mean very different things about what is wobbling.
 */
export function renderSummary(flaky, { check = 'the browser suite' } = {}) {
  if (flaky.length === 0) return ''

  const n = flaky.length
  const lines = [
    `### ⚠️ ${n} flaky ${n === 1 ? 'test' : 'tests'} in the \`${check}\` check`,
    '',
    `${n === 1 ? 'This test' : 'These tests'} failed and then passed on a retry, so ` +
      `\`${check}\` reported **green**. The Playwright report is kept as an artifact on ` +
      `this run — the first attempt's trace and screenshot are in it.`,
    '',
    '| Test | Where | Attempts | First attempt failed with |',
    '| --- | --- | --- | --- |',
  ]

  for (const t of flaky) {
    const where = t.line ? `\`${t.file}:${t.line}\`` : `\`${t.file}\``
    const why = t.firstFailure ? `\`${t.firstFailure.replace(/\|/g, '\\|').slice(0, 160)}\`` : '—'
    const title = t.project ? `${t.title} _(${t.project})_` : t.title
    lines.push(`| ${title} | ${where} | ${t.attempts} | ${why} |`)
  }

  lines.push(
    '',
    'A flake is a defect in the suite or in the code under it, not weather. Open the ' +
      'artifact before the retention window closes (7 days) — the evidence is gone after ' +
      'that, which is how the portal-reschedule flake survived three runs.',
    '',
  )
  return lines.join('\n')
}

function githubOutput(key, value) {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  appendFileSync(file, `${key}=${value}\n`)
}

function main() {
  const path = process.argv[2] ?? process.env.E2E_RESULTS_JSON ?? DEFAULT_RESULTS_PATH
  const check = process.env.FLAKY_CHECK_NAME || process.env.GITHUB_JOB || 'the browser suite'

  // Every exit from here is a zero. See the header: this must never be the
  // reason a run is red.
  if (!existsSync(path)) {
    console.log(`[flaky] no Playwright JSON report at ${path} — nothing to report.`)
    githubOutput('flaky', 'false')
    githubOutput('flaky-count', '0')
    return
  }

  let flaky = []
  try {
    flaky = flakyTests(JSON.parse(readFileSync(path, 'utf8')))
  } catch (err) {
    console.log(`[flaky] could not read ${path}: ${err instanceof Error ? err.message : err}`)
    githubOutput('flaky', 'false')
    githubOutput('flaky-count', '0')
    return
  }

  githubOutput('flaky', flaky.length > 0 ? 'true' : 'false')
  githubOutput('flaky-count', String(flaky.length))

  if (flaky.length === 0) {
    console.log('[flaky] no test needed a retry.')
    return
  }

  const summary = renderSummary(flaky, { check })
  console.log(summary)
  console.log(
    `::warning title=${flaky.length} flaky test(s) in ${check}::` +
      `${flaky.map((t) => t.title).join('; ')} — passed only on a retry. The Playwright report ` +
      `is attached to this run; see the job summary.`,
  )

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  }
}

// Only run the CLI when invoked directly, so the guard test can import the
// parser without the script also trying to read a report and write outputs.
// `pathToFileURL` rather than string-building a file:// URL: Windows is a
// supported dev platform here and a backslashed path does not survive one.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
