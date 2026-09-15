import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// The plain ESM script CI actually runs — imported rather than reimplemented,
// so this tests the shipping code and not a copy of it.
import { flakyTests, renderSummary, DEFAULT_RESULTS_PATH } from '../../scripts/e2e-flaky-summary.mjs'

/**
 * The flaky reporter has exactly one job — NOTICE something — and every other
 * check in this repo that asserts an absence has taught us the same lesson: a
 * detector nobody has watched detect anything is indistinguishable from one
 * that has quietly stopped looking. This one would be especially easy to lose,
 * because its failure mode is silence on a green run, which is what a healthy
 * run looks like too.
 *
 * Three things are pinned here, and each of them has broken something like it
 * before:
 *
 *  1. A `flaky` test in a Playwright JSON report is found, named, and carries
 *     the attempt that failed. (The detection itself.)
 *  2. A clean report yields nothing, so the reporter cannot cry wolf. (A
 *     reporter that warns on every green run is one people stop reading — the
 *     same argument `e2e/axe.ts` makes about its shrink warning.)
 *  3. The path `playwright.config.ts` WRITES is the path the script READS.
 *     Rename one and the reporter finds no file, says so in a log nobody
 *     opens, and every run keeps looking clean forever.
 *
 * The report shape is Playwright's, reproduced here rather than captured from
 * a run: a suite per file, nested suites for `describe` blocks, specs at the
 * leaves, one `test` per project, and a `results` entry per attempt.
 */

/** A minimal but shape-accurate Playwright JSON report. */
function report(specs: unknown[]) {
  return {
    config: {},
    suites: [
      {
        title: 'e2e/portal-reschedule.spec.ts',
        file: 'e2e/portal-reschedule.spec.ts',
        specs: [],
        suites: [{ title: 'portal reschedule', file: 'e2e/portal-reschedule.spec.ts', specs }],
      },
    ],
    errors: [],
  }
}

const FLAKY_SPEC = {
  title: 'a patient moves a consultation to a new time',
  file: 'e2e/portal-reschedule.spec.ts',
  line: 88,
  ok: true,
  tests: [
    {
      projectName: 'chromium',
      status: 'flaky',
      results: [
        {
          retry: 0,
          status: 'failed',
          error: { message: '\x1b[31mError:\x1b[39m expect(locator).toBeVisible() failed\n\n  at e2e/portal-reschedule.spec.ts:104' },
        },
        { retry: 1, status: 'passed' },
      ],
    },
  ],
}

const PASSING_SPEC = {
  title: 'a patient cancels a filling',
  file: 'e2e/portal-reschedule.spec.ts',
  line: 140,
  ok: true,
  tests: [{ projectName: 'chromium', status: 'expected', results: [{ retry: 0, status: 'passed' }] }],
}

describe('the flaky-run reporter', () => {
  it('finds a test that failed and then passed on a retry', () => {
    const flaky = flakyTests(report([PASSING_SPEC, FLAKY_SPEC]))

    expect(
      flaky.map((t: { title: string }) => t.title),
      'A `status: "flaky"` test in the report must be found. If this is empty the reporter has ' +
        'stopped looking, and a green-but-flaky run will discard its evidence again.',
    ).toEqual(['portal reschedule › a patient moves a consultation to a new time'])

    const [t] = flaky
    expect(t.file).toBe('e2e/portal-reschedule.spec.ts')
    expect(t.line).toBe(88)
    expect(t.attempts, 'both attempts are the evidence — a count of 1 means the failed one was dropped').toBe(2)
    expect(
      t.firstFailure,
      'the FIRST attempt is the one that failed; reporting the passing retry tells a reader nothing',
    ).toBe('Error: expect(locator).toBeVisible() failed')
  })

  it('reports nothing at all for a clean run', () => {
    expect(
      flakyTests(report([PASSING_SPEC])),
      'A reporter that fires on a healthy run is one people learn to scroll past.',
    ).toEqual([])
    expect(renderSummary([], { check: 'e2e' })).toBe('')
  })

  it('names the check in the summary, because that is all a reader of a green PR has', () => {
    const summary = renderSummary(flakyTests(report([FLAKY_SPEC])), { check: 'e2e' })

    expect(summary).toContain('`e2e`')
    expect(summary).toContain('a patient moves a consultation to a new time')
    expect(summary).toContain('e2e/portal-reschedule.spec.ts:88')
    expect(
      summary,
      'terminal colour codes render as literal garbage in a job summary',
    ).not.toMatch(/\x1b\[/)
  })

  it('reads the same results file playwright.config.ts writes', () => {
    const config = readFileSync(join(process.cwd(), 'playwright.config.ts'), 'utf8')
    const written = config.match(/^const E2E_RESULTS_JSON = '([^']+)'/m)

    expect(
      written,
      'playwright.config.ts no longer declares E2E_RESULTS_JSON in the expected shape — the json ' +
        'reporter path is what scripts/e2e-flaky-summary.mjs consumes, so it needs a home this can read.',
    ).toBeTruthy()
    expect(
      DEFAULT_RESULTS_PATH,
      `playwright.config.ts writes its json report to '${written?.[1]}' but ` +
        `scripts/e2e-flaky-summary.mjs reads '${DEFAULT_RESULTS_PATH}'. The reporter would find no ` +
        `file and report every run clean — silently, because "no report" and "no flakes" look the same.`,
    ).toBe(written![1])
  })

  // Every workflow that runs the browser harness. Pinned as a set rather than
  // just `ci.yml` (review of #552): the other two carry the same two hunks with
  // nothing holding them there, and by this file's own argument the NIGHTLY is
  // the run it matters most for, because nobody is watching it. A future
  // workflow edit that quietly reverted the two unattended ones would have gone
  // unnoticed for exactly as long as the flake they exist to catch.
  const HARNESS_WORKFLOWS = [
    '.github/workflows/ci.yml',
    '.github/workflows/post-merge-e2e.yml',
    '.github/workflows/nightly.yml',
  ]

  it.each(HARNESS_WORKFLOWS)('%s runs the reporter and keys its upload off it', (file) => {
    const wf = readFileSync(join(process.cwd(), file), 'utf8')

    expect(
      wf,
      `${file} runs the E2E harness, so it must also run the flaky reporter — otherwise a retry ` +
        `there still happens in silence.`,
    ).toContain('node scripts/e2e-flaky-summary.mjs')
    expect(
      wf,
      `${file}'s Playwright report upload must fire on a flaky-but-GREEN run too — ` +
        '`if: failure()` alone is the condition that threw away the portal-reschedule evidence ' +
        'three times.',
    ).toContain("if: failure() || steps.flaky.outputs.flaky == 'true'")
  })

  it('has no shebang, so this guard runs on a Windows checkout too', () => {
    // Found the hard way, on this very file. git gives a Windows working tree
    // CRLF endings, and vitest's SSR transform leaves the `\r` behind when it
    // strips `#!…` — every test here died with a parse error at column 1, on
    // Windows only, while CI (Linux, LF) stayed green. `docs/CI.md` says
    // Windows is a supported dev platform, and this is the guard on the flake
    // detector: losing it on one OS is exactly the kind of silent gap the rest
    // of this file argues against.
    const src = readFileSync(join(process.cwd(), 'scripts/e2e-flaky-summary.mjs'), 'utf8')
    expect(
      src.startsWith('#!'),
      'scripts/e2e-flaky-summary.mjs must not start with a shebang: with CRLF line endings it ' +
        'breaks vitest’s transform and this whole guard file stops running on Windows. The ' +
        'workflows invoke it as `node scripts/e2e-flaky-summary.mjs`, so it buys nothing.',
    ).toBe(false)
  })

  it('never exits non-zero, whatever happens inside it', () => {
    // The three known paths are covered by running the CLI; this pins the
    // PROPERTY rather than the enumeration (review of #552). `main()` wraps the
    // whole body, so an unimagined throw — `appendFileSync` on a full disk, a
    // report shape nobody pictured — cannot reach the process and turn an
    // `if: always()` step red.
    const src = readFileSync(join(process.cwd(), 'scripts/e2e-flaky-summary.mjs'), 'utf8')
    expect(
      /function main\(\)\s*\{\s*try\s*\{/.test(src),
      'main() must wrap its whole body in try/catch. Guarding only the failure paths somebody ' +
        'thought of leaves this step able to fail a build — which is how a reporting step gets ' +
        'deleted, at the worst possible moment.',
    ).toBe(true)
  })
})
