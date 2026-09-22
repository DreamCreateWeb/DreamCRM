import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FALLBACK_MINUTES,
  MAX_LOOKBACK_MINUTES,
  SCAN_STEP_NAME,
  countPerGroup,
  didScan,
  fingerprint,
  groupEvents,
  lastScanAt,
  renderSummary,
  resolveWindow,
} from '../../scripts/error-scan.mjs'

/**
 * THE PRODUCTION ERROR SCAN'S WINDOW, CHECKED.
 *
 * THE DEFECT THIS REPLACES, measured rather than suspected:
 * `.github/workflows/error-scan.yml` declared `cron: '*\/30 * * * *'`, scanned a
 * fixed 35 minutes, and carried a comment promising the extra five minutes
 * meant "nothing can fall between two runs". Over the last 40 scheduled fires
 * the gap between consecutive runs had a **median of 239 minutes, a minimum of
 * 117 and a maximum of 412**. The scan covered ~15% of production wall-clock
 * and said "No errors in the window" about the rest, in the same words, on the
 * same green tick.
 *
 * So the load-bearing property here is not "the window is bigger". It is:
 *
 *   1. CONSECUTIVE WINDOWS JOIN EXACTLY. Run N's window ends where run N+1's
 *      begins, at any cadence, with no gap and no overlap. Both directions are
 *      tested as a sequence rather than asserted on one window, because a
 *      one-sided version passes on a scan that double-counts and on one that
 *      drops.
 *   2. A WINDOW THAT WAS NOT FULLY SCANNED SAYS SO. The cap, a failed lookup
 *      and a truncated event list are all HOLES, and the summary leads with
 *      them. This is the rule `windowGap` in `scripts/review-sweep.mjs` states
 *      and `scripts/rulebook-drift.mjs` states again: a check that could not do
 *      its job must not report nothing to report.
 *   3. THE HOLE DOES NOT REDDEN THE RUN, and that is asserted rather than left
 *      to habit. Exit 1 here would be self-defeating — a red run is not a
 *      successful one, so the next run anchors further back, caps again, and
 *      reddens too. §2a records six such mornings and the PR that merged into
 *      the silence they became.
 *   4. THE ANCHOR IS THE LAST SUCCESSFUL RUN, not the last run. The degradation
 *      is a one-token YAML edit (`--status success`), after which a run that
 *      died before reaching CloudWatch closes a window nobody looked at. It is
 *      pinned twice — the flag in the workflow and the `conclusion` filter in
 *      the script — and the test drives the filter with a history whose newest
 *      run FAILED.
 *   5. DEDUPE COLLAPSES REPETITIONS, NOT DISTINCT ERRORS. Over-grouping is the
 *      dangerous direction: it hides a second error behind the first.
 *   6. THE RINGER MUST RING. Everything above grades pure functions, and pure
 *      functions can be perfect while the workflow never calls them — the
 *      failure Sentinel found by mutating `main()` four ways in #593. The last
 *      block runs the script as a process, and the block after it reads the
 *      workflow file for the three tokens the whole design rests on.
 */

const MIN = 60_000

describe('error scan — the window is sized from the previous run', () => {
  it('consecutive windows join exactly, at a cadence nothing like the cron', () => {
    // The measured shape: a "half-hourly" cron that actually fires at 117,
    // 239 and 412 minutes. Walk four runs and assert the windows tile the
    // timeline with no gap and no overlap.
    const fires = [0, 117, 117 + 239, 117 + 239 + 412].map((m) => Date.parse('2026-09-22T00:00:00Z') + m * MIN)

    let previous: { at: number; run: number; why: null } | null = null
    const windows: { start: number; end: number }[] = []
    for (const [i, createdAt] of Array.from(fires.entries())) {
      const win = resolveWindow({ lastScan: previous ?? { at: null, run: null, why: 'first run' }, endAt: createdAt })
      windows.push({ start: win.start, end: win.end })
      previous = { at: createdAt, run: i, why: null }
    }

    // Skip the first (it has no predecessor and is the documented fallback).
    for (let i = 2; i < windows.length; i++) {
      expect(
        windows[i].start,
        `window ${i} starts at ${new Date(windows[i].start).toISOString()} but window ${i - 1} ended at ` +
          `${new Date(windows[i - 1].end).toISOString()}. A window that starts LATER than the ` +
          `previous one ended is a gap — production nothing looked at. Earlier is an overlap — the ` +
          `same error reported twice. Both are the defect this rewrite is about.`,
      ).toBe(windows[i - 1].end)
    }

    // And the minutes actually follow the real cadence rather than a constant.
    expect(windows[2].end - windows[2].start).toBe(239 * MIN)
    expect(windows[3].end - windows[3].start).toBe(412 * MIN)
  })

  it('a 239-minute gap is scanned in full, which the old fixed window could not do', () => {
    const end = Date.parse('2026-09-22T12:00:00Z')
    const win = resolveWindow({ lastScan: { at: end - 239 * MIN, run: 1, why: null }, endAt: end })
    expect(win.minutes).toBe(239)
    expect(win.holes).toEqual([])
    // The regression this guards: a constant here means somebody re-hardcoded
    // the lookback.
    expect(win.minutes).not.toBe(35)
  })

  it('the anchor is the last SUCCESSFUL run, even when a later run failed', () => {
    // The history a throttled or broken run leaves behind: the newest entry
    // failed, so it scanned nothing and must not close a window.
    const runs = [
      { databaseId: 3, conclusion: 'failure', createdAt: '2026-09-22T11:00:00Z' },
      { databaseId: 2, conclusion: 'success', createdAt: '2026-09-22T07:00:00Z' },
      { databaseId: 1, conclusion: 'success', createdAt: '2026-09-22T03:00:00Z' },
    ]
    const found = lastScanAt(runs)
    expect(found.at, 'the failed run at 11:00 must not be treated as a completed scan').toBe(
      Date.parse('2026-09-22T07:00:00Z'),
    )
    expect(found.run).toBe(2)

    // And the window that follows covers the failed run's stretch too.
    const win = resolveWindow({ lastScan: found, endAt: Date.parse('2026-09-22T13:00:00Z') })
    expect(win.minutes).toBe(360)
    expect(win.holes).toEqual([])
  })

  it('an empty or unreadable run history fails towards scanning MORE, and names the hole', () => {
    for (const runs of [[], null, 'not an array', [{ conclusion: 'failure', createdAt: '2026-09-22T07:00:00Z' }]]) {
      const found = lastScanAt(runs as never)
      expect(found.at).toBeNull()
      expect(found.why, 'a failed lookup must say WHICH way it failed').toBeTruthy()

      const win = resolveWindow({ lastScan: found, endAt: Date.parse('2026-09-22T12:00:00Z') })
      expect(win.minutes, 'the safe direction for an error scan is more, not less').toBe(FALLBACK_MINUTES)
      expect(win.source).toBe('fallback')
      expect(win.holes.length, 'a fallback window is not a scanned window and must be named as a hole').toBe(1)
      expect(win.holes[0]).toContain('NOT looked at')
    }
  })

  it('the cap binds loudly: the unscanned minutes are counted and named', () => {
    const end = Date.parse('2026-09-22T12:00:00Z')
    // A workflow GitHub disabled for inactivity: the last completed scan is
    // three days back.
    const win = resolveWindow({ lastScan: { at: end - 3 * 24 * 60 * MIN, run: 9, why: null }, endAt: end })

    expect(win.minutes).toBe(MAX_LOOKBACK_MINUTES)
    expect(win.holes.length).toBe(1)
    expect(win.holes[0], 'the hole must carry the NUMBER of minutes nothing scanned').toContain(
      `${2 * 24 * 60} minutes of production were never scanned`,
    )
    // The summary leads with it rather than burying it under a tick.
    const summary = renderSummary(win, groupEvents([]), { scannedGroups: ['/aws/apprunner/x/application'] })
    expect(summary.indexOf('did not see its whole window')).toBeLessThan(summary.indexOf('No error lines'))
  })

  it('the upper bound is the run\'s own createdAt; losing it duplicates rather than drops', () => {
    const win = resolveWindow({ lastScan: { at: Date.now() - 60 * MIN, run: 1, why: null }, endAt: Number.NaN })
    // No hole — nothing was skipped. A note, because the next window will
    // re-read the queue wait.
    expect(win.holes).toEqual([])
    expect(win.notes.join(' ')).toContain('duplicated, never dropped')
  })

  it('a zero-length or inverted window is not reported as a scan of nothing', () => {
    const end = Date.parse('2026-09-22T12:00:00Z')
    // Two runs created in the same second, or a clock that went backwards.
    const win = resolveWindow({ lastScan: { at: end + 5 * MIN, run: 1, why: null }, endAt: end })
    expect(win.minutes).toBeGreaterThanOrEqual(1)
    expect(win.notes.join(' ')).toContain('not a window')
  })

  it('a dispatched fixed lookback is honoured, capped, and labelled as an override', () => {
    const end = Date.parse('2026-09-22T12:00:00Z')
    const win = resolveWindow({ lastScan: { at: end - 60 * MIN, run: 1, why: null }, endAt: end, overrideMinutes: 90 })
    expect(win.minutes).toBe(90)
    expect(win.source).toBe('override')
    expect(win.notes.join(' '), 'a dispatched window must not read as a scheduled one').toContain('explicitly')

    const over = resolveWindow({ lastScan: { at: end, run: 1, why: null }, endAt: end, overrideMinutes: 99999 })
    expect(over.minutes).toBe(MAX_LOOKBACK_MINUTES)
    expect(over.holes.length).toBe(1)
  })
})

/**
 * "CONCLUDED SUCCESS" IS NOT "SCANNED" — the correction from Sentinel's review
 * of #664, and the reason it is a whole block rather than a line.
 *
 * The first draft anchored the window on the last run whose `conclusion` was
 * `success`, reasoning that this workflow exits 0 on every path that looked.
 * That is true of a run that goes RED and **false of the one branch built
 * specifically so it does not**: `configure-aws-credentials` is
 * `continue-on-error`, the "Not configured yet" step prints a warning, the scan
 * step is skipped by its `if:`, and the job concludes `success` having read
 * nothing. That run would then close a window over logs nobody looked at — the
 * 35-minute defect this PR exists to fix, arriving through a different door.
 *
 * Latent while the IAM role does not exist, because every run takes that branch
 * and there is nothing to miss. It opens the day the role lands.
 */
describe('error scan — a run that did not read the logs cannot close a window', () => {
  const job = (steps: { name: string; conclusion: string }[]) => ({ jobs: [{ steps }] })

  it('a run that assumed the role and scanned counts', () => {
    expect(
      didScan(
        job([
          { name: 'Configure AWS credentials (OIDC, keyless)', conclusion: 'success' },
          { name: SCAN_STEP_NAME, conclusion: 'success' },
        ]),
      ),
    ).toBe(true)
  })

  it('THE NOT-CONFIGURED RUN DOES NOT COUNT, even though the job concluded success', () => {
    // The exact shape: the credential step FAILS but is `continue-on-error`,
    // so the job is green; the scan step is skipped by its `if:`.
    const notConfigured = job([
      { name: 'Configure AWS credentials (OIDC, keyless)', conclusion: 'failure' },
      { name: 'Not configured yet', conclusion: 'success' },
      { name: SCAN_STEP_NAME, conclusion: 'skipped' },
    ])
    expect(
      didScan(notConfigured),
      'a run that skipped the scan must not be allowed to close a window. Its JOB is green — ' +
        'that is the whole trap — so the answer has to come from the STEP.',
    ).toBe(false)

    // And `lastScanAt` alone cannot tell the difference, which is why the
    // step-level check exists at all rather than a smarter conclusion filter.
    expect(
      lastScanAt([{ databaseId: 1, conclusion: 'success', createdAt: '2026-09-22T12:00:00Z' }]).at,
      'lastScanAt sees a green run and takes it — it is the belt, not the braces',
    ).toBe(Date.parse('2026-09-22T12:00:00Z'))
  })

  it('a failed scan step does not count either', () => {
    expect(didScan(job([{ name: SCAN_STEP_NAME, conclusion: 'failure' }]))).toBe(false)
    expect(didScan(job([{ name: SCAN_STEP_NAME, conclusion: 'cancelled' }]))).toBe(false)
  })

  it('an unreadable jobs payload errs towards NOT having scanned', () => {
    // Widening the next window is safe; closing one is not. Every unreadable
    // shape has to land on the safe side.
    for (const bad of [null, {}, { jobs: null }, { jobs: [{}] }, { jobs: [{ steps: 'nope' }] }]) {
      expect(didScan(bad as never), `${JSON.stringify(bad)} must not read as a completed scan`).toBe(false)
    }
  })

  it('the step name the anchor hangs off exists in the workflow', () => {
    // `SCAN_STEP_NAME` is a string matched against GitHub's jobs API. If the
    // step is renamed and this is not, every run reads as not-scanned — which
    // fails safe but silently widens every window forever. Pinned against the
    // file, so the two cannot drift.
    const wf = readFileSync(join(process.cwd(), '.github/workflows/error-scan.yml'), 'utf8')
    expect(
      wf,
      `scripts/error-scan.mjs looks for a step named "${SCAN_STEP_NAME}" to decide whether a run ` +
        'actually read the logs, and no step in error-scan.yml has that name.',
    ).toContain(`- name: ${SCAN_STEP_NAME}`)
  })

  it('the lookup message says the run did not READ, not that it failed', () => {
    // The reader of a red morning needs to know which of the two happened.
    expect(lastScanAt([]).why).toContain('actually READ the logs')
  })
})

/**
 * THE ANCHOR STEP, EXECUTED — not read.
 *
 * WHY THIS EXISTS, and it is the sharpest §2d lesson in this issue. Every other
 * guard here grades the workflow **as text** and the script **as a module**.
 * Nothing executed the shell that joins the two, and `bash -n` is a syntax
 * check that cannot see a wrong string constant. So this shipped:
 *
 *     fs.writeFileSync("candidates.txt", rows.map(…).join("\\n"))
 *
 * A YAML `run: |` block does not process escapes and neither do the shell's
 * single quotes, so node received a backslash and an `n`. `candidates.txt` came
 * out as ONE line — `111\n222\n333` — the loop asked GitHub for a run by that
 * name, failed, and ended. `last-green.json` stayed `[]`, every run took the
 * 24-hour fallback, and **the contiguous window this whole PR is about never
 * engaged once**. Found by Sentinel reviewing #664, reproduced here by pulling
 * the step out of the YAML byte-for-byte.
 *
 * Worse than a plain bug, and the reason it is worth a whole block: the run was
 * LOUD but the hole's sentence blamed the IAM role. A broken predicate that is
 * confidently wrong about why sends the reader to the wrong repair.
 *
 * Sentinel's generalisation, which is better than the "three for three" it
 * corrects: the recurring shape is **grading a representation of the thing
 * instead of the thing**. Comments quoting code is one representation; a string
 * in a YAML file standing in for the shell that will run it is another.
 * "Strip the comments" fixes the first. Only executing it fixes the second.
 *
 * So: the step's `run:` block is extracted from the real workflow, a stub `gh`
 * is put on PATH, and it runs in a temp directory. What is asserted is
 * `last-green.json` — the artefact the next step actually reads.
 */
describe('error scan — the anchor step, executed against a stub `gh`', () => {
  type StubOpts = { ids: string[]; scannedId: string | null; noTrailingNewline?: boolean }

  /** One step's `run:` block, dedented, straight out of the workflow file. */
  function runBlock(name: string): string {
    const lines = readFileSync(join(process.cwd(), '.github/workflows/error-scan.yml'), 'utf8').split(/\r?\n/)
    const start = lines.findIndex((l) => l.trimStart().startsWith('- name:') && l.includes(name))
    expect(start, `no step named ${name} in error-scan.yml`).toBeGreaterThan(-1)
    const runAt = lines.findIndex((l, i) => i > start && /^\s*run: \|\s*$/.test(l))
    expect(runAt, `step ${name} has no \`run: |\` block`).toBeGreaterThan(-1)

    const body: string[] = []
    const indent = lines[runAt + 1].length - lines[runAt + 1].trimStart().length
    for (let i = runAt + 1; i < lines.length; i++) {
      const l = lines[i]
      if (l.trim() && l.length - l.trimStart().length < indent) break
      body.push(l.slice(indent))
    }
    return body.join('\n')
  }

  /**
   * A stub `gh` that answers the three calls this step makes, from fixtures.
   *
   * It is a script on PATH rather than a mock, because the defect this block
   * exists for lived in the ARGUMENTS and the QUOTING — exactly the layer a
   * mock replaces.
   */
  function stubGh(dir: string, opts: StubOpts) {
    const gh = [
      '#!/usr/bin/env bash',
      'set -e',
      'case "$1 $2" in',
      '  "run list")',
      // `printf '%s\n'` repeats its format once per argument, so this is one id
      // per line WITH a trailing newline — what `gh --jq` really produces.
      // `noTrailingNewline` produces the shape `while read` silently truncates.
      opts.noTrailingNewline
        ? // Escapes are interpreted in printf's FORMAT, not in its arguments —
          // so the ids go in the format here. (Getting that backwards produced
          // a literal `111\n222` and reproduced the very bug this stub is meant
          // to distinguish itself from, which is a small joke at my expense.)
          `    printf '${opts.ids.join('\\n')}'`
        : `    printf '%s\\n' ${opts.ids.map((i) => `'${i}'`).join(' ')}`,
      '    ;;',
      '  "run view")',
      '    printf \'[{"databaseId":%s,"conclusion":"success","createdAt":"2026-09-22T06:00:00Z"}]\' "$3"',
      '    ;;',
      '  "api "*|"api")',
      '    RUN=$(echo "$2" | sed -E "s#.*/runs/([^/]+)/jobs#\\\\1#")',
      `    if [ "$RUN" = "${opts.scannedId ?? '__none__'}" ]; then`,
      '      printf \'{"jobs":[{"steps":[{"name":"%s","conclusion":"success"}]}]}\' "$SCAN_STEP"',
      '    else',
      '      printf \'{"jobs":[{"steps":[{"name":"%s","conclusion":"skipped"}]}]}\' "$SCAN_STEP"',
      '    fi',
      '    ;;',
      '  *) echo "unexpected gh invocation: $*" >&2; exit 9 ;;',
      'esac',
    ].join('\n')
    writeFileSync(join(dir, 'gh'), gh + '\n', { mode: 0o755 })
  }

  function runAnchorStep(opts: StubOpts) {
    const dir = mkdtempSync(join(tmpdir(), 'anchor-'))
    stubGh(dir, opts)
    const script = runBlock('Where did the last run that actually scanned start?')
      // The two GitHub expressions the runner would have substituted.
      .replace(/\$\{\{ github\.repository \}\}/g, 'DreamCreateWeb/DreamCRM')
      // `node scripts/error-scan.mjs` is relative to the repo root.
      .replace(/node scripts\//g, `node ${JSON.stringify(join(process.cwd(), 'scripts')).slice(1, -1)}/`)
    writeFileSync(join(dir, 'step.sh'), script)

    const r = spawnSync('bash', ['step.sh'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SCAN_STEP: SCAN_STEP_NAME },
    })
    let lastGreen: unknown = null
    try {
      lastGreen = JSON.parse(readFileSync(join(dir, 'last-green.json'), 'utf8'))
    } catch {
      /* left null — the assertions say what that means */
    }
    return { ...r, lastGreen, candidates: (() => {
      try {
        return readFileSync(join(dir, 'candidates.txt'), 'utf8')
      } catch {
        return ''
      }
    })() }
  }

  it('writes one candidate PER LINE (the defect: `\\n` as two characters)', () => {
    const { candidates } = runAnchorStep({ ids: ['111', '222', '333'], scannedId: null })
    expect(
      candidates.split('\n').filter(Boolean),
      'the candidate list is not newline-separated, so the loop asks GitHub for a run whose id is ' +
        'the whole list joined together, fails once, and ends — leaving the anchor unresolved and ' +
        'every run on the fallback window.',
    ).toEqual(['111', '222', '333'])
    expect(candidates, 'without a trailing newline `while read` drops the last candidate').toMatch(/\n$/)
  })

  it('anchors on the newest run that actually scanned, walking past the ones that did not', () => {
    const { lastGreen, stdout } = runAnchorStep({ ids: ['111', '222', '333'], scannedId: '222' })
    expect(lastGreen, 'last-green.json is what the window step reads; an empty one is the fallback').toEqual([
      { databaseId: 222, conclusion: 'success', createdAt: '2026-09-22T06:00:00Z' },
    ])
    expect(stdout).toContain('Anchoring this window on run 222')
  })

  it('checks the LAST candidate too', () => {
    // The second bug in the same line: `while read` drops a final line with no
    // newline after it, so the twentieth candidate would never be examined.
    const { lastGreen } = runAnchorStep({ ids: ['111', '222', '333'], scannedId: '333' })
    expect(lastGreen).toEqual([
      { databaseId: 333, conclusion: 'success', createdAt: '2026-09-22T06:00:00Z' },
    ])
  })

  it('checks the last candidate even when the list has no trailing newline', () => {
    // `while read -r ID` alone drops a final line with no newline after it.
    // `gh --jq` does emit one, so this is belt to that braces — and it is the
    // half that survives somebody changing how the list is produced, which is
    // exactly what happened once already in this file.
    const { lastGreen } = runAnchorStep({ ids: ['111', '222', '333'], scannedId: '333', noTrailingNewline: true })
    expect(
      lastGreen,
      'the last candidate was never examined. `while read -r ID || [ -n "$ID" ]` is what reads a ' +
        'final line with no newline after it.',
    ).toEqual([{ databaseId: 333, conclusion: 'success', createdAt: '2026-09-22T06:00:00Z' }])
  })

  it('leaves an empty anchor — the loud fallback — when nothing scanned', () => {
    const { lastGreen } = runAnchorStep({ ids: ['111', '222'], scannedId: null })
    expect(lastGreen, 'that is the honest answer, and the window step turns it into a named hole').toEqual([])
  })

  it('survives a run history that comes back empty', () => {
    const { lastGreen, status } = runAnchorStep({ ids: [], scannedId: null })
    expect(status, 'a quiet history must not fail the step').toBe(0)
    expect(lastGreen).toEqual([])
  })
})

describe('error scan — a log group it could not read is a hole, not a quiet group', () => {
  it('names the group in the summary, above the findings', () => {
    // Sentinel, reviewing #664: the old `|| echo '[]'` turned a throttle or an
    // expired token into an empty result with stderr discarded, and the group
    // was still reported as scanned and clean. Same defect as the 35-minute
    // window, one scale down, in this PR's own new code.
    const win = resolveWindow({ lastScan: { at: 0, run: 1, why: null }, endAt: 239 * MIN })
    const summary = renderSummary(win, groupEvents([]), {
      scannedGroups: ['/aws/apprunner/a/application'],
      unreadableGroups: 'the CloudWatch query failed for `/aws/apprunner/b/application`',
    })
    expect(summary).toContain('did not see its whole window')
    expect(summary).toContain('/aws/apprunner/b/application')
    expect(summary.indexOf('did not see its whole window')).toBeLessThan(summary.indexOf('No error lines'))
  })

  it('the workflow separates the groups it read from the ones it could not', () => {
    const wf = readFileSync(join(process.cwd(), '.github/workflows/error-scan.yml'), 'utf8')
    const code = wf
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n')

    expect(
      code,
      'a failed CloudWatch query must not add the group to the SCANNED list — that reports an ' +
        'unread group as a clean one.',
    ).toContain('FAILED="${FAILED} ${G}"')
    expect(
      code,
      'the script is not told which groups failed, so the hole is computed and thrown away',
    ).toContain('--failed-groups')
    expect(
      code,
      'stderr is discarded again, so the summary cannot say WHY the group could not be read',
    ).not.toMatch(/filter-log-events[\s\S]{0,600}2>\/dev\/null/)
  })
})

describe('error scan — dedupe collapses repetitions, not distinct errors', () => {
  const event = (over: Record<string, unknown> = {}) => ({
    eventId: Math.random().toString(36).slice(2),
    timestamp: Date.parse('2026-09-22T10:00:00Z'),
    message: 'ERROR  Unhandled rejection in /api/appointments',
    logGroup: '/aws/apprunner/dreamcrm/x/application',
    ...over,
  })

  it('one error 400 times is ONE row with a count', () => {
    const events = Array.from({ length: 400 }, (_, i) =>
      event({
        timestamp: Date.parse('2026-09-22T10:00:00Z') + i * 1000,
        message:
          `2026-09-22T10:0${i % 6}:00.123Z  4f6b1d7e-1aaa-4bbb-8ccc-9dddeeeffaaa  ERROR  ` +
          `connect ETIMEDOUT 10.0.${i % 4}.${i % 7}:5432 after ${100 + i}ms`,
      }),
    )
    const grouped = groupEvents(events)
    expect(grouped.total).toBe(400)
    expect(
      grouped.distinct.length,
      'the same connection timeout with a rolling timestamp, request id, host and duration is ONE error',
    ).toBe(1)
    expect(grouped.distinct[0].count).toBe(400)
    // The verbatim line survives, so nobody has to trust the normaliser.
    expect(grouped.distinct[0].sample).toContain('ETIMEDOUT')
  })

  it('a quieter SECOND error is not swallowed by the loud first one', () => {
    // The direction that actually matters. The old scan printed the first 50
    // raw lines, so one noisy exception pushed every other distinct error out
    // of the report — the window got bigger and the summary got less useful.
    const noisy = Array.from({ length: 300 }, () => event({ message: 'ERROR  connect ETIMEDOUT 10.0.0.4:5432' }))
    const quiet = [event({ message: 'FATAL  drizzle migration 0160 failed: relation already exists' })]
    const grouped = groupEvents([...noisy, ...quiet])

    expect(grouped.distinct.length).toBe(2)
    const shapes = grouped.distinct.map((g) => g.sample)
    expect(shapes.some((s) => s.includes('migration 0160'))).toBe(true)

    const summary = renderSummary(
      resolveWindow({ lastScan: { at: 0, run: 1, why: null }, endAt: 239 * MIN }),
      grouped,
      { scannedGroups: ['/aws/apprunner/x/application'] },
    )
    expect(summary, 'the one-off FATAL must reach the summary past 300 copies of the timeout').toContain(
      'migration 0160',
    )
  })

  it('does not merge two genuinely different errors', () => {
    const grouped = groupEvents([
      event({ message: 'ERROR  Tenant scope missing on getAppointments' }),
      event({ message: 'ERROR  Stripe webhook signature verification failed' }),
      event({ message: 'ERROR  Tenant scope missing on getPatients' }),
    ])
    expect(grouped.distinct.length, 'three distinct messages must stay three rows').toBe(3)
  })

  it('a repeated eventId is dropped and counted, never grouped as a repetition', () => {
    const one = event()
    const grouped = groupEvents([one, { ...one }, event({ message: 'ERROR  something else' })])
    expect(grouped.total).toBe(2)
    expect(grouped.duplicateIds).toBe(1)
  })

  it('an event with no readable message is counted and named, never silently dropped', () => {
    const grouped = groupEvents([event(), { eventId: 'x', timestamp: 1 }, null as never])
    expect(grouped.unreadable).toBe(2)
    const summary = renderSummary(resolveWindow({ lastScan: { at: 0, run: 1, why: null }, endAt: MIN }), grouped, {
      scannedGroups: ['/aws/apprunner/x/application'],
    })
    expect(summary).toContain('carried no readable message')
  })

  it('the fingerprint keeps specific shapes from being eaten by the generic ones', () => {
    // Ordered widest-first in the source: a uuid is also a run of hex and a
    // timestamp is also a run of digits.
    expect(fingerprint('2026-09-22T10:00:00.123Z x')).toBe('<ts> x')
    expect(fingerprint('req 4f6b1d7e-1aaa-4bbb-8ccc-9dddeeeffaaa done')).toBe('req <uuid> done')
    expect(fingerprint('took 1234ms')).toBe('took <dur>')
  })

  it('truncation is graded PER LOG GROUP, so two quiet groups cannot fake a hole', () => {
    const a = Array.from({ length: 6 }, () => event({ logGroup: '/a/application' }))
    const b = Array.from({ length: 6 }, () => event({ logGroup: '/b/application' }))
    const counts = Object.fromEntries(countPerGroup([...a, ...b]))
    expect(counts['/a/application']).toBe(6)
    expect(counts['/b/application']).toBe(6)
    // Twelve events against a ceiling of ten is NOT a truncated query when no
    // single group reached ten.
    expect(countPerGroup([...a, ...b]).filter(([, n]) => n >= 10)).toEqual([])
  })
})

describe('error scan — the summary never reports a hole as a clean run', () => {
  const win = () => resolveWindow({ lastScan: { at: 0, run: 7, why: null }, endAt: 239 * MIN })

  it('leads with what it looked at, and names the anchor run', () => {
    const summary = renderSummary(win(), groupEvents([]), { scannedGroups: ['/aws/apprunner/x/application'] })
    expect(summary).toContain('239 minutes')
    expect(summary).toContain('run `7`')
    expect(summary).toContain('no gap and no overlap')
  })

  it('a truncated query is a hole, printed before the findings', () => {
    const summary = renderSummary(win(), groupEvents([]), {
      scannedGroups: ['/aws/apprunner/x/application'],
      truncated: '`/aws/apprunner/x/application` returned 2000 events',
    })
    expect(summary).toContain('did not see its whole window')
    expect(summary).toContain('2000 events')
  })

  it('"not configured yet" is reported as SKIPPED, never as a quiet window', () => {
    const summary = renderSummary(win(), groupEvents([]), { notConfigured: true })
    expect(summary).toContain('nothing was scanned')
    expect(summary).toContain('Skipped, not passed')
    expect(summary).not.toContain('No error lines')
  })
})

describe('error scan — the ringer rings (the script run as a process)', () => {
  function run(args: string[], cwd: string, env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [join(process.cwd(), 'scripts/error-scan.mjs'), ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
  }

  it('the `window` command writes a window file and an annotation for a hole', () => {
    const dir = mkdtempSync(join(tmpdir(), 'error-scan-'))
    // An empty history: the fallback path, which is a hole.
    writeFileSync(join(dir, 'last-green.json'), '[]')
    writeFileSync(join(dir, 'this-run.json'), JSON.stringify({ createdAt: '2026-09-22T12:00:00Z' }))

    const out = run(['window', '--last-green', 'last-green.json', '--this-run', 'this-run.json'], dir)
    expect(out.status).toBe(0)
    expect(out.stdout, 'a hole must reach the run annotations, not only the summary').toContain('::error title=')

    const win = JSON.parse(readFileSync(join(dir, 'window.json'), 'utf8'))
    expect(win.minutes).toBe(FALLBACK_MINUTES)
    expect(win.end).toBe(Date.parse('2026-09-22T12:00:00Z'))
  })

  it('a hole does NOT redden the run — exit 0, with the reason printed', () => {
    // THE PROPERTY THIS BLOCK EXISTS FOR. Exit 1 on a capped window is
    // self-defeating: a red run is not a successful run, so `--status success`
    // would skip it, the next window would anchor further back, cap again, and
    // redden too. That is a permanently red alarm, which is a disabled one.
    const dir = mkdtempSync(join(tmpdir(), 'error-scan-'))
    writeFileSync(
      join(dir, 'last-green.json'),
      JSON.stringify([{ databaseId: 1, conclusion: 'success', createdAt: '2026-09-15T12:00:00Z' }]),
    )
    writeFileSync(join(dir, 'this-run.json'), JSON.stringify({ createdAt: '2026-09-22T12:00:00Z' }))
    const w = run(['window', '--last-green', 'last-green.json', '--this-run', 'this-run.json'], dir)
    expect(w.status).toBe(0)
    expect(w.stdout).toContain('::error title=')

    writeFileSync(join(dir, 'events.json'), '[]')
    const r = run(['report', '--window', 'window.json', '--events', 'events.json', '--groups', '/a/application'], dir)
    expect(r.status, 'a reported hole must not fail the run').toBe(0)
    expect(r.stdout).toContain('did not see its whole window')
  })

  it('errors found are a ::warning and still exit 0 — this job reports, it does not gate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'error-scan-'))
    writeFileSync(
      join(dir, 'window.json'),
      JSON.stringify(resolveWindow({ lastScan: { at: 0, run: 1, why: null }, endAt: 239 * MIN })),
    )
    writeFileSync(
      join(dir, 'events.json'),
      JSON.stringify([
        { eventId: 'a', timestamp: 1, message: 'ERROR boom', logGroup: '/a/application' },
        { eventId: 'b', timestamp: 2, message: 'ERROR boom', logGroup: '/a/application' },
      ]),
    )
    const r = run(['report', '--window', 'window.json', '--events', 'events.json', '--groups', '/a/application'], dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('::warning title=')
    expect(r.stdout).toContain('1 distinct error')
  })

  it('a missing window file produces a loud non-report rather than a quiet clean one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'error-scan-'))
    const r = run(['report', '--window', 'nope.json', '--events', 'nope.json'], dir)
    expect(r.stdout).toContain('nothing was graded')
    expect(r.stdout).toContain('::error title=')
    expect(r.stdout).not.toContain('No error lines')
  })

  it('writes the summary to GITHUB_STEP_SUMMARY and the window to GITHUB_OUTPUT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'error-scan-'))
    const summaryPath = join(dir, 'summary.md')
    const outputPath = join(dir, 'output.txt')
    writeFileSync(summaryPath, '')
    writeFileSync(outputPath, '')
    writeFileSync(join(dir, 'last-green.json'), JSON.stringify([{ conclusion: 'success', createdAt: '2026-09-22T11:00:00Z', databaseId: 4 }]))
    writeFileSync(join(dir, 'this-run.json'), JSON.stringify({ createdAt: '2026-09-22T12:00:00Z' }))

    run(['window', '--last-green', 'last-green.json', '--this-run', 'this-run.json'], dir, {
      GITHUB_OUTPUT: outputPath,
    })
    const outputs = readFileSync(outputPath, 'utf8')
    expect(outputs, 'the shell needs both ends of the window to bound the AWS query').toMatch(/start=\d+/)
    expect(outputs).toMatch(/end=\d+/)

    writeFileSync(join(dir, 'events.json'), '[]')
    run(['report', '--window', 'window.json', '--events', 'events.json', '--groups', '/a/application'], dir, {
      GITHUB_STEP_SUMMARY: summaryPath,
    })
    expect(readFileSync(summaryPath, 'utf8')).toContain('Production error scan')
  })
})

describe('error scan — the workflow still asks the question the script answers', () => {
  const wf = () => readFileSync(join(process.cwd(), '.github/workflows/error-scan.yml'), 'utf8')

  /**
   * The workflow with every comment line removed.
   *
   * LOAD-BEARING, and it is here because the first draft of this block was a
   * test that passed while its defect was live — the §2d shape exactly. This
   * file EXPLAINS `--end-time` and `--status success` in prose right above the
   * lines that use them, so a plain `toContain` over the raw text stays green
   * when the flag is deleted and the comment describing it survives. Deleting
   * the flag is precisely the edit that matters; the comment is the thing that
   * then lies about it.
   */
  const wfCode = () =>
    wf()
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .join('\n')

  it('bounds BOTH ends of the CloudWatch query', () => {
    // `--end-time` is what makes consecutive windows join rather than overlap.
    // Without it every run reads to the present and re-reports whatever the
    // next one is about to start at — the duplicate class the dedupe here
    // deliberately does NOT cover, because the window is supposed to.
    const code = wfCode()
    expect(code).toContain('--start-time "${START_MS}"')
    expect(code, 'without --end-time the window runs to the present and overlaps the next one').toContain(
      '--end-time "${END_MS}"',
    )
  })

  it('asks for the last SUCCESSFUL run, not the last run', () => {
    // Pinned in both places on purpose: dropping the flag is a one-token edit,
    // and `lastScanAt` re-filters on `conclusion` so the script survives it.
    // It is no longer the load-bearing check — see the next test.
    expect(wfCode()).toContain('--status success')
    expect(wfCode()).toContain('--branch main')
  })

  it('asks each candidate run whether it actually SCANNED', () => {
    // THE CORRECTION FROM #664's REVIEW. `--status success` alone lets the
    // "not configured yet" run — which is green by construction and read
    // nothing — close a window over unread logs. The anchor therefore asks the
    // jobs API per candidate and takes the first that really scanned.
    const code = wfCode()
    expect(
      code,
      'the anchor is back to trusting a run CONCLUSION. The not-configured branch concludes ' +
        'success having read nothing, so it would close a window over logs nobody looked at.',
    ).toContain('/jobs')
    expect(code).toContain('scripts/error-scan.mjs scanned')
    // Enough candidates to walk past a run of unconfigured mornings.
    expect(code, 'one candidate is not a walk — the anchor needs a history to search').toMatch(
      /--limit (?:[2-9]\d|\d{3,})/,
    )
  })

  it('reads its own run history and holds no write scope', () => {
    const text = wf()
    const block = /permissions:\n((?:\s{2}\w[\w-]*:\s*\w+\n)+)/.exec(text)?.[1] ?? ''
    const scopes = Object.fromEntries(
      block
        .trim()
        .split('\n')
        .map((l) => l.trim().split(/:\s*/) as [string, string]),
    )
    expect(scopes.actions, 'the window anchor comes from this workflow\'s own run history').toBe('read')
    expect(scopes.contents).toBe('read')
    // `id-token: write` is the OIDC handshake, not a repository write — it is
    // how this job avoids holding an AWS credential at all (DREAMCRM-42).
    const repoWrites = Object.entries(scopes).filter(([k, v]) => v === 'write' && k !== 'id-token')
    expect(repoWrites, 'this job writes nothing back to GitHub').toEqual([])
  })

  it('does not publish a check named `test` or `e2e`', () => {
    // Main's two required contexts. A second producer of either name can
    // report a green check onto a commit the real suite never ran against —
    // the same pin `review-sweep.test.ts`, `review-gate.test.ts` and
    // `rulebook-drift.test.ts` each carry.
    const jobs = Array.from(wf().matchAll(/^ {2}([a-z][\w-]*):$/gm)).map((m) => m[1])
    expect(jobs).not.toContain('test')
    expect(jobs).not.toContain('e2e')
  })

  it('does not interpolate a dispatch input straight into the shell', () => {
    // Restored in review of #664. This job holds `id-token: write` and can
    // assume the production read-only role; it is not the place to turn a typed
    // input into shell text, and the version this file replaced already used
    // `env:`. Losing that was a regression, not a simplification.
    // Graded LINE BY LINE rather than with one regex over the file: the only
    // question is whether a `${{ … }}` expression ends up on a line the shell
    // runs, and `env:` lines are exactly where it is supposed to be.
    const shellLines = wfCode()
      .split('\n')
      .filter((l) => /--minutes|--out window\.json|error-scan\.mjs window/.test(l))
    const interpolated = shellLines.filter((l) => l.includes('${{'))
    expect(
      interpolated,
      'a `${{ … }}` expression is being interpolated straight into the window command. This job ' +
        'holds `id-token: write` and can assume the production read-only role; pass the input ' +
        'through `env:` and read it as "$MINUTES".\n  ' + interpolated.join('\n  '),
    ).toEqual([])
    expect(wfCode()).toMatch(/MINUTES: \$\{\{ inputs\.minutes \}\}/)
    expect(wfCode()).toContain('--minutes "$MINUTES"')
  })

  it('no longer claims a 35-minute window overlaps a half-hourly cron', () => {
    // The sentence that was false by an order of magnitude. It is not enough
    // to change the code: the comment was the thing a reader believed.
    // The fixed default is graded over the CODE. The comment above the `env:`
    // block quotes the old `MINUTES: ${{ inputs.minutes || '35' }}` line on
    // purpose — it is why the input rides `env:` again — and a file-wide match
    // reads that history as a reinstatement. (Which it did, once.)
    expect(wfCode()).not.toMatch(/MINUTES:\s*\$\{\{\s*inputs\.minutes\s*\|\|\s*'35'/)
    // This half IS about the prose: the sentence that was false by an order of
    // magnitude, replaced by the measurement.
    expect(wf(), 'the measured cadence belongs in the file, not only in a PR body').toContain(
      'median gap 239 minutes',
    )
  })

  it('gates nothing: no pull_request trigger and no required-context name', () => {
    const text = wf()
    expect(text).not.toMatch(/^\s*pull_request:/m)
    expect(text).not.toMatch(/^\s*needs:/m)
  })
})
