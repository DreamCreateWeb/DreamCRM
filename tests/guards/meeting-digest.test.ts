import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  DOCKET_QUIET_DAYS,
  RUN_LOOKBACK,
  OPEN_VERDICT,
  PROCESS_PATHS,
  alarmTable,
  classifyFiles,
  firstTryRate,
  guardCensus,
  ledgerDelta,
  openVerdicts,
  parseBoundary,
  renderDigest,
  splitPrs,
} from '../../scripts/meeting-digest.mjs'

/**
 * THE MEETING DIGEST — the three things in it that can be WRONG rather than
 * merely absent.
 *
 * `team-operating-model` §7 sanctions the digest; this guard exists because
 * three of its derivations are the exact shapes §2d says go wrong quietly, and
 * because a digest is read ONCE, by a room, with nobody re-deriving it
 * afterwards. A number that is merely missing gets noticed. A number that is
 * present and wrong is the whole risk of compiling pre-work at all.
 *
 *   1. THE BOUNDARY. `--since` with no offset is read in the runtime's local
 *      zone, and this office has watched that silently empty two windows: on
 *      2026-09-15 a `--after='<date> 00:00'` sweep returned ZERO over fourteen
 *      commits, a new workflow file and three new zero-tolerance guards; at
 *      23:43 on 2026-09-13 the `--since=<YYYY-MM-DD>` spelling did the same
 *      over three gate-file commits. Both read as "nothing happened". This is
 *      the never-again guard for that, and §2d's rule puts it here rather than
 *      in a comment asking people to be careful.
 *   2. THE OPEN-VERDICT READER. It is an ABSENCE reader in the §2d sense: every
 *      count downstream of it gets SMALLER and greener if it narrows, and
 *      nothing anywhere goes red. So it is graded in both directions — the
 *      prose spellings it must refuse are asserted alongside the verdict
 *      spellings it must accept, from specimens taken out of the real
 *      `docs/RELEASE.md`.
 *   3. THE TWO CLASSIFIERS. Product-vs-process and first-try both reach the
 *      owner's scorecard, and each has a direction that would flatter the week:
 *      folding MIXED into either side, and counting a PR nobody could grade as
 *      a pass. Both are pinned.
 *
 * WHAT THIS GUARD DELIBERATELY DOES NOT DO: it never runs the collection. The
 * digest's collector shells out to `gh` and `git`, and a guard that needed a
 * network and a credential would be one §2d rejects on its own environment
 * rule. Every export under test here is pure and is fed its inputs.
 */

const RELEASE = readFileSync('docs/RELEASE.md', 'utf8')

describe('the boundary is RFC3339 with an explicit offset, or it is refused', () => {
  it('accepts the two spellings that name an instant without ambiguity', () => {
    expect(parseBoundary('2026-09-23T18:05:24Z')).toBe(Date.parse('2026-09-23T18:05:24Z'))
    expect(parseBoundary('2026-09-23T13:05:24-05:00')).toBe(Date.parse('2026-09-23T18:05:24Z'))
  })

  // THE THREE SPELLINGS THAT EMPTIED A REAL WINDOW. Each is refused by name so
  // that a later "be forgiving about input" edit has to delete an assertion
  // that says what forgiveness cost, rather than loosening a regex nobody reads.
  it.each([
    ['a bare date', '2026-09-15'],
    ['a date and a wall-clock time', '2026-09-15 00:00'],
    ['a zoneless timestamp', '2026-09-15T00:00:00'],
    ['an empty string', ''],
    ['not a string at all', null],
  ])('refuses %s', (_why, value) => {
    expect(() => parseBoundary(value as string)).toThrow(/EXPLICIT offset/)
  })

  // IT REFUSES RATHER THAN ASSUMING UTC, and that is the assertion, not a
  // detail of the message. Assuming UTC produces a window that is right on CI
  // and wrong on the author's box — the same defect with a longer fuse.
  it('does not quietly interpret a zoneless boundary as UTC', () => {
    let thrown: unknown = null
    try {
      parseBoundary('2026-09-15T00:00:00')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).message).toMatch(/Not widened, not assumed/)
  })
})

describe('an OPEN verdict is not the word OPEN', () => {
  // ACCEPTED — every verdict spelling Part 5 actually uses, copied from it.
  it.each([
    'the RTO/RPO numbers. · OPEN (owner).',
    'assumed. · **OPEN — written, parked, waiting on one production read.**',
    'header. · OPEN.',
    'parks). · OPEN — **RANKED NOT 1.0 by the DREAMCRM-96 planning meeting,',
  ])('reads a verdict: %s', (line) => {
    expect(OPEN_VERDICT.test(line)).toBe(true)
  })

  // REFUSED — the prose spellings. A naive `grep OPEN` returns 25 against this
  // document and twelve of those are these; the planning meeting that first
  // needed the real number spent two agents establishing it by hand.
  it.each([
    'and it is FAIL-OPEN, so a delivery whose ledger',
    'which is how a closed item goes on reading OPEN for a year. A ledger item',
    'stays OPEN until the index is live, even though its code is written.',
    'on `main` in `11b52176` (DREAMCRM-24, #537) and left reading OPEN here until',
    'to dismiss one. Still correctly OPEN and still correctly not scheduled —',
  ])('refuses prose: %s', (line) => {
    expect(OPEN_VERDICT.test(line)).toBe(false)
  })

  // THE READER IS GRADED AGAINST THE REAL DOCUMENT, not only against specimens.
  // A specimen set is a hand-kept list and shares its failure mode: it cannot
  // see the shape nobody thought to paste into it. This pins the two readings
  // against each other on the tree as it stands.
  it('finds strictly fewer verdicts than the bare word, and finds some', () => {
    const verdicts = openVerdicts(RELEASE)
    const bare = RELEASE.split('\n').filter((l) => /\bOPEN\b/.test(l)).length
    expect(verdicts.length).toBeGreaterThan(0)
    expect(verdicts.length).toBeLessThan(bare)
  })

  it('tags every verdict with the lane it sits under', () => {
    for (const v of openVerdicts(RELEASE)) {
      expect(v.lane).not.toBe('(no lane)')
      expect(v.part).not.toBe('(before any part)')
    }
  })
})

describe('the ledger delta reports closed and opened, never only the net', () => {
  const before = ['## Part 5', '### Money paths', 'a. · OPEN.', 'b. · OPEN.'].join('\n')
  const after = ['## Part 5', '### Money paths', 'b. · OPEN.', 'c. · OPEN.'].join('\n')

  it('does not let one closed and one opened read as no movement', () => {
    const { rows, totalBefore, totalAfter } = ledgerDelta(before, after)
    expect([totalBefore, totalAfter]).toEqual([2, 2])
    const row = rows.find((r) => r.lane === 'Money paths')!
    expect(row.delta).toBe(0)
    expect(row.closed).toEqual(['a. · OPEN.'])
    expect(row.opened).toEqual(['c. · OPEN.'])
  })

  // A LANE THAT EMPTIED IS THE MOST INTERESTING ROW ON THE TABLE. Reporting
  // only lanes with something still open would drop exactly the weeks worth
  // reporting.
  it('keeps a lane that went to zero', () => {
    const { rows } = ledgerDelta(['### Gone', 'x. · OPEN.'].join('\n'), '### Gone')
    expect(rows.find((r) => r.lane === 'Gone')).toMatchObject({ before: 1, after: 0, delta: -1 })
  })
})

describe('product vs process keeps MIXED as its own bucket', () => {
  it('classifies the three cases and the ungradeable fourth', () => {
    expect(classifyFiles(['.github/workflows/ci.yml', 'scripts/review-sweep.mjs'])).toBe('process')
    expect(classifyFiles(['app/(marketing)/page.tsx'])).toBe('product')
    expect(classifyFiles(['app/(marketing)/page.tsx', 'scripts/review-sweep.mjs'])).toBe('mixed')
    expect(classifyFiles([])).toBe('unknown')
  })

  // THE FOLD IS THE RISK, NOT THE PATHS. A reader can check a path list; nobody
  // can check a tie-break. This asserts mixed is never silently absorbed.
  it('never folds a mixed PR into product or process', () => {
    const split = splitPrs([{ files: ['app/page.tsx', 'scripts/x.mjs'] }, { files: ['lib/a.ts'] }])
    expect(split.mixed).toHaveLength(1)
    expect(split.product).toHaveLength(1)
    expect(split.process).toHaveLength(0)
  })

  // `docs/` IS SPLIT, NOT TAKEN WHOLE. The process record and the product
  // documentation live in the same directory and land on opposite sides.
  it('splits docs/ between the process record and product documentation', () => {
    expect(classifyFiles(['docs/rulebook/SKILL.md'])).toBe('process')
    expect(classifyFiles(['docs/RELEASE.md'])).toBe('process')
    expect(classifyFiles(['docs/BRAND.md'])).toBe('product')
    expect(PROCESS_PATHS.some((re) => re.test('docs/BRAND.md'))).toBe(false)
  })
})

describe('first-try never counts a PR nobody could grade as a pass', () => {
  const prs = [
    { number: 1, checkRuns: [{ name: 'test', conclusion: 'success' }] },
    { number: 2, checkRuns: [{ name: 'test', conclusion: 'failure' }, { name: 'test', conclusion: 'success' }] },
    { number: 3, checkRuns: [] },
    { number: 4, checkRuns: [{ name: 'axe-report', conclusion: 'failure' }] },
  ]

  it('grades only PRs with a required-check run, and names the rest', () => {
    const r = firstTryRate(prs)
    expect(r.firstTry.map((p) => p.number)).toEqual([1])
    expect(r.retried.map((p) => p.number)).toEqual([2])
    expect(r.ungradeable.map((p) => p.number)).toEqual([3, 4])
    expect(r.graded).toBe(2)
    expect(r.rate).toBe(0.5)
  })

  // THE DENOMINATOR IS THE METRIC'S SOFT SPOT. Counting the ungradeable as
  // passes would make the rate climb exactly when the collection broke, which
  // is the one time a reader most needs it to drop.
  it('reports no rate at all rather than 100% when nothing was gradeable', () => {
    expect(firstTryRate([{ number: 9, checkRuns: [] }]).rate).toBeNull()
  })

  // A RED ADVISORY JOB NEVER BLOCKED ANYTHING. #4's only failure is a
  // non-required check and it must not read as a retry.
  it('ignores checks outside the required list', () => {
    expect(firstTryRate([prs[3]], ['test']).retried).toHaveLength(0)
  })
})

describe('the alarm table is a lookup, and it refuses to be a recommendation', () => {
  const now = Date.parse('2026-09-28T12:00:00Z')
  const wf = (file: string) => ({ file, name: file, crons: ['0 12 * * *'] })
  const run = (createdAt: string, conclusion: string) => ({ createdAt, conclusion })

  it('reports FIRED as the last FAILED run, not the last run', () => {
    const table = alarmTable([wf('a.yml')], {
      'a.yml': [run('2026-09-28T11:00:00Z', 'success'), run('2026-09-01T11:00:00Z', 'failure')],
    }, now)
    expect(table[0].lastFiredAt).toBe('2026-09-01T11:00:00Z')
    expect(table[0].quietDays).toBe(27)
    expect(table[0].docketEligible).toBe(true)
  })

  it('does not docket an alarm that fired inside the window', () => {
    const table = alarmTable([wf('a.yml')], {
      'a.yml': [run('2026-09-28T11:00:00Z', 'success'), run('2026-09-20T11:00:00Z', 'failure')],
    }, now)
    expect(table[0].quietDays).toBeLessThan(DOCKET_QUIET_DAYS)
    expect(table[0].docketEligible).toBe(false)
  })

  // BLOCKED IS NOT IDLE (Quinn's carve-out). A workflow that is red right now
  // is not quiet in any sense, and must never reach the docket on a timer.
  it('never dockets an alarm that is red right now', () => {
    const table = alarmTable([wf('a.yml')], {
      'a.yml': [run('2026-09-28T11:00:00Z', 'failure'), run('2026-09-27T11:00:00Z', 'failure')],
    }, now)
    expect(table[0].state).toBe('red since its first run')
    expect(table[0].docketEligible).toBe(false)
  })

  // ABSENT IS NOT SILENT. A workflow with no run history has never had the
  // chance to fire, and folding it into "quiet" would docket the one thing that
  // most needs investigating instead.
  it('names a workflow that never ran rather than calling it quiet', () => {
    const table = alarmTable([wf('a.yml')], { 'a.yml': [] }, now)
    expect(table[0].state).toBe('never ran')
    expect(table[0].docketEligible).toBe(false)
  })
})

describe('the guard census reports age and claims nothing about firing', () => {
  it('ages a guard from the commit that added it', () => {
    const [g] = guardCensus([{ file: 'x.test.ts', addedAt: '2026-09-01T00:00:00Z' }], Date.parse('2026-09-28T00:00:00Z'))
    expect(g.ageDays).toBe(27)
  })

  it('leaves age null rather than zero when the add commit is unreadable', () => {
    expect(guardCensus([{ file: 'x.test.ts', addedAt: null }])[0].ageDays).toBeNull()
  })

  // THE SENTENCE IS PART OF THE CHECK (§2d's predicate-right/sentence-wrong
  // family). The rendered table must SAY that age is not a firing record,
  // because the docket's timer next to a column of numbers reads as one.
  it('says in the rendered table that a guard has no last-fired lookup', () => {
    const text = renderDigest({
      since: Date.parse('2026-09-23T16:00:00Z'),
      until: Date.parse('2026-09-28T16:00:00Z'),
      prs: [],
      split: { product: [], process: [], mixed: [], unknown: [] },
      firstTry: { firstTry: [], retried: [], ungradeable: [], graded: 0, rate: null },
      ledger: { rows: [], totalBefore: 0, totalAfter: 0, open: [] },
      alarms: [],
      guards: [{ file: 'x.test.ts', addedAt: '2026-09-01T00:00:00Z', ageDays: 27 }],
      sweep: null,
      collectionErrors: [],
    })
    expect(text).toMatch(/Age only/)
    expect(text).toMatch(/mutation, not a date/)
  })
})

describe('an incomplete collection is announced above the numbers it damages', () => {
  it('prints the collection errors before section 1', () => {
    const text = renderDigest({
      since: Date.parse('2026-09-23T16:00:00Z'),
      until: Date.parse('2026-09-28T16:00:00Z'),
      prs: [],
      split: { product: [], process: [], mixed: [], unknown: [] },
      firstTry: { firstTry: [], retried: [], ungradeable: [], graded: 0, rate: null },
      ledger: { rows: [], totalBefore: 0, totalAfter: 0, open: [] },
      alarms: [],
      guards: [],
      sweep: null,
      collectionErrors: ['#1: check runs unavailable (rate limited)'],
    })
    expect(text.indexOf('Collected incompletely')).toBeLessThan(text.indexOf('### 1.'))
    expect(text).toContain('rate limited')
  })
})

describe('the alarm table states the window it read', () => {
  // `never fired` MEANS "not in the last RUN_LOOKBACK runs", and the docket is
  // exactly the reader who would take the stronger reading. The denominator is
  // printed on the row rather than in a footnote, and the caption says which
  // of the two claims it is — §2d's predicate-right/sentence-wrong family.
  it('prints the runs-read denominator beside every never-fired claim', () => {
    const text = renderDigest({
      since: Date.parse('2026-09-23T16:00:00Z'),
      until: Date.parse('2026-09-28T16:00:00Z'),
      prs: [],
      split: { product: [], process: [], mixed: [], unknown: [] },
      firstTry: { firstTry: [], retried: [], ungradeable: [], graded: 0, rate: null },
      ledger: { rows: [], totalBefore: 0, totalAfter: 0, open: [] },
      alarms: alarmTable([{ file: 'a.yml' }], { 'a.yml': [{ createdAt: '2026-09-28T11:00:00Z', conclusion: 'success' }] }, Date.parse('2026-09-28T16:00:00Z')),
      guards: [],
      sweep: null,
      collectionErrors: [],
    })
    expect(text).toMatch(new RegExp(`not in the last ${RUN_LOOKBACK} runs, never "not ever"`))
    expect(text).toMatch(/\| never fired \| 1 \|/)
  })
})
