import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gateFindings, renderSummary as renderGateSummary } from '../../scripts/review-gate.mjs'
import {
  REVIEW_LABEL,
  SWEPT_SINCE,
  VERDICT_PATTERNS,
  VERDICT_REVIEW_STATES,
  renderSummary,
  reviewRecord,
  sweep,
  windowGap,
} from '../../scripts/review-sweep.mjs'
import { effectiveContexts, runsOnPullRequest } from '../../scripts/rulebook-drift.mjs'

/**
 * The post-merge review sweep, checked.
 *
 * `scripts/review-sweep.mjs` reads merged PRs and names the ones that carried
 * `needs-sentinel-review` and merged with no review recorded anywhere a reader
 * could point at. Its stated bar is **zero false positives** — a satisfied
 * review must never be flagged — because a sweep that cries wolf gets ignored
 * and then the miss it exists to catch goes back to being found by whoever
 * happens to look.
 *
 * So the load-bearing tests here are the ones that break it in each direction
 * and watch what happens:
 *
 *   1. EVERY WAY A REAL REVIEW CAN BE RECORDED must read as satisfied. This is
 *      the direction that costs the instrument its credibility.
 *   2. THE MISS MUST STILL BE SEEN. A classifier loosened until everything
 *      looks satisfied reports CLEAN forever and looks exactly like a repo with
 *      no misses in it — the failure mode `tests/guards/rulebook-drift.test.ts`
 *      calls a vacuous claim, and the reason `dreamcrm-conventions` will not
 *      count a guard nobody has watched fail.
 *   3. THE CUT-OFF MUST HOLD. `SWEPT_SINCE` is what makes (1) true against the
 *      repo's real history: before the "record the verdict on the PR"
 *      convention landed, #575, #579 and #580 were genuinely reviewed and carry
 *      no more on-PR evidence than #573 and #582, which were not.
 *
 *   4. THE RINGER MUST RING. Everything above grades the CLASSIFIER, and the
 *      classifier can be perfect while the alarm is mute — this sweep has
 *      exactly one channel, a red run, so `process.exitCode = 0` is a one-token
 *      edit after which it finds the miss, prints it into a job summary nobody
 *      opens, and reports green every morning forever. Sentinel's review of
 *      #593 mutated `main()` four ways and all 22 tests here passed, so the
 *      last two describe blocks run the script as a process. Precedent in this
 *      directory runs both ways: `review-gate.test.ts` already shells out, and
 *      `axe-headroom-table.test.ts` already grades its script's exit-code
 *      contract — in the opposite direction, that its reporter must NOT touch
 *      it.
 */

type Pr = Record<string, any>

/** A merged PR as `gh pr list --json number,title,url,mergedAt,author,labels,comments,reviews` returns it. */
function pr(overrides: Pr = {}): Pr {
  return {
    number: 600,
    title: 'DREAMCRM-61: a change on the gate list',
    url: 'https://github.com/DreamCreateWeb/DreamCRM/pull/600',
    mergedAt: '2026-09-20T09:00:00Z',
    author: { login: 'DreamCreateWeb' },
    labels: [{ name: REVIEW_LABEL }],
    comments: [],
    reviews: [],
    ...overrides,
  }
}

const comment = (body: string, login = 'DreamCreateWeb') => ({ author: { login }, body })

/** The review-gate job summary a gated PR actually gets, rendered by the real code. */
const gateSummaryForAGatedPr = () => {
  const files = ['.github/workflows/ci.yml']
  return renderGateSummary(gateFindings(files), files.length, [])
}

/** Run the script the way the workflow does, as a process, and read what it says and returns. */
function runSweep(prs: Pr[], limit = 500) {
  const file = join(mkdtempSync(join(tmpdir(), 'sweep-')), 'prs.json')
  writeFileSync(file, JSON.stringify(prs))
  const r = spawnSync(
    process.execPath,
    ['scripts/review-sweep.mjs', '--prs', file, '--limit', String(limit)],
    { cwd: process.cwd(), encoding: 'utf8' },
  )
  return { code: r.status, out: r.stdout ?? '' }
}

/**
 * A real Vercel comment, trimmed. Every PR in this repo gets one, so if it ever
 * read as a verdict this whole check would go permanently and invisibly blind.
 */
const VERCEL_COMMENT = comment(
  '[vc]: #l35XeVYQjFpazn+Ri4Pwg/Pxoqc0/QiwDcfVpBF53T4=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIn0=\n' +
    'The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).\n\n' +
    '| Project | Deployment | Actions | Updated |\n| :--- | :----- | :------ | :------ |\n' +
    '| [dreamcrm](https://vercel.com/dreamcreatewebs-projects/dreamcrm) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready]() | [Inspect]() | Sep 15, 2026 4:02pm |',
  'vercel',
)

describe('what counts as a review that happened', () => {
  // DIRECTION 1: the expensive direction. Each of these is a real review, and
  // flagging any of them is the failure that gets this instrument switched off.
  const SATISFIED: Record<string, Pr> = {
    'a verdict comment, the convention': {
      comments: [VERCEL_COMMENT, comment('Sentinel review: APPROVE — https://multica/issue/DREAMCRM-61#c4')],
    },
    'approve with notes': {
      comments: [comment('Sentinel review: APPROVE WITH NOTES. The census entry should name what it publishes.')],
    },
    'a verdict spelled as a sentence': {
      comments: [comment('Sentinel reviewed this on the issue and approved it before the merge.')],
    },
    'changes requested, then merged after the fix': {
      comments: [comment('Sentinel: REQUEST CHANGES on the first round — fixed in 2f1c9ab, re-requested, approved.')],
    },
    'a GitHub review in a verdict state': {
      reviews: [{ author: { login: 'DreamCreateWeb' }, state: 'APPROVED', body: '' }],
    },
    'a GitHub review left as a comment, because you cannot approve your own PR': {
      reviews: [{ author: { login: 'DreamCreateWeb' }, state: 'COMMENTED', body: 'APPROVE — nothing to add.' }],
    },
  }

  it.each(Object.keys(SATISFIED))('reads "%s" as satisfied', (name) => {
    const record = reviewRecord(pr(SATISFIED[name]))
    expect(
      record,
      `this PR carries a real review record and the sweep does not see it. A sweep that flags a ` +
        `satisfied review is one people stop reading, and then the miss it exists to catch goes ` +
        `back to being found by whoever happens to look.`,
    ).not.toBeNull()
  })

  it('does not read a bot deployment comment as a verdict', () => {
    // THE INSTRUMENT CHECK. Every PR here gets a Vercel comment. If one ever
    // matched a verdict pattern, every PR in the repo would read as satisfied
    // and this check would report CLEAN forever with nothing to show it had
    // stopped working.
    expect(reviewRecord(pr({ comments: [VERCEL_COMMENT] }))).toBeNull()
  })

  it('does not read a dismissed review as a verdict', () => {
    // Dismissing a review is the one action that REMOVES a record. Counting it
    // would let it satisfy the check that looks for one.
    expect(VERDICT_REVIEW_STATES).not.toContain('DISMISSED')
    expect(reviewRecord(pr({ reviews: [{ author: { login: 'x' }, state: 'DISMISSED', body: '' }] }))).toBeNull()
  })

  it('keeps the verdict patterns able to match something', () => {
    // A pattern list narrowed until it matches nothing is how this decays
    // quietly: every gated PR becomes a finding, the alarm screams daily, and
    // the fix somebody reaches for under that pressure is to switch it off.
    expect(VERDICT_PATTERNS.length).toBeGreaterThan(0)
    for (const p of VERDICT_PATTERNS) {
      expect(['APPROVE', 'approved it', 'REQUEST CHANGES', 'changes requested'].some((s) => p.test(s))).toBe(true)
    }
  })
})

describe('the sweep', () => {
  // DIRECTION 2: the miss must still be seen. This is the #573 / #582 shape —
  // labelled by the gate, merged, nothing on the PR at all.
  it('names a PR that merged owing a review with nothing recorded', () => {
    const { unsatisfied } = sweep([pr({ number: 573, comments: [VERCEL_COMMENT] })], '2026-09-01T00:00:00Z')

    expect(
      unsatisfied.map((p: Pr) => p.number),
      'a labelled PR merged with no review record must be named. If this reports nothing, the ' +
        'check is vacuous and its daily green run means only that it stopped looking.',
    ).toEqual([573])
  })

  it('says nothing about a merged PR that never owed a review', () => {
    const { unsatisfied, ungated } = sweep([pr({ labels: [{ name: 'needs-forge-intake' }] })], '2026-09-01T00:00:00Z')
    expect(unsatisfied).toEqual([])
    expect(ungated).toBe(1)
  })

  // DIRECTION 3: the cut-off, replayed against the history that motivated it.
  it('does not judge the merges that predate the record-keeping convention', () => {
    // THE FALSE POSITIVE THIS CHECK WOULD OTHERWISE HAVE SHIPPED WITH. On the
    // day it was written, NOT ONE PR in the repository carried a GitHub review
    // or a verdict comment — verdicts live on Multica issues, which GitHub
    // cannot see. #575, #579 and #580 were reviewed; #573 and #582 were not;
    // from GitHub they are identical. Flagging all five would have been three
    // false alarms out of five on the instrument's first run.
    const history = [575, 579, 580, 573, 582].map((number) =>
      pr({ number, mergedAt: '2026-09-15T04:00:00Z', comments: [VERCEL_COMMENT] }),
    )
    const result = sweep(history)

    expect(
      result.unsatisfied,
      'a merge that predates SWEPT_SINCE cannot be judged: reviewed and unreviewed PRs are ' +
        'indistinguishable from GitHub before the convention existed.',
    ).toEqual([])
    expect(
      result.outOfWindow.map((p: Pr) => p.number).sort(),
      'skipped is not passed — every unjudged PR is named in the summary',
    ).toEqual([573, 575, 579, 580, 582])
  })

  it('names the skipped PRs in the summary rather than dropping them', () => {
    const result = sweep([pr({ number: 573, mergedAt: '2026-09-15T04:00:00Z' })])
    const text = renderSummary(result)
    expect(text).toContain('not judged')
    expect(text).toContain('#573')
    expect(text, 'a run that examined nothing must not read as a run that found nothing').toContain('Examined **0**')
  })

  it('pins the cut-off to a real instant that is not in the future', () => {
    // Moving SWEPT_SINCE forward is how a red run gets quietened without a
    // finding being fixed — the axe-ceiling mistake in a different costume.
    // Nothing can stop that by itself; this at least makes it a deliberate
    // edit to a constant with a test beside it.
    const t = Date.parse(SWEPT_SINCE)
    expect(Number.isFinite(t), 'SWEPT_SINCE must be a parseable RFC3339 instant').toBe(true)
    expect(t, 'a cut-off in the future silently exempts everything').toBeLessThan(Date.now())
  })
})

describe('the sweep knows when it could not see its whole window', () => {
  // A truncated `gh pr list` and a clean sweep look identical from the outside.
  // This repo has now had to write that rule down three times.
  it('goes red when the list was truncated before it reached the cut-off', () => {
    const recent = Array.from({ length: 3 }, (_, i) => pr({ number: 700 + i, mergedAt: '2026-10-01T09:00:00Z' }))
    expect(windowGap(recent, 3)).toMatch(/never looked at/)
  })

  it('is quiet when the list reaches back past the cut-off', () => {
    const spanning = [pr({ mergedAt: '2026-10-01T09:00:00Z' }), pr({ mergedAt: '2026-09-01T09:00:00Z' })]
    expect(windowGap(spanning, 200)).toBeNull()
  })

  it('goes red when nothing came back at all', () => {
    expect(windowGap([], 200)).toMatch(/graded nothing/)
  })
})

describe('the sweep workflow', () => {
  const wf = () => readFileSync(join(process.cwd(), '.github/workflows/review-sweep.yml'), 'utf8')

  it('runs the script and tells it the limit it asked GitHub for', () => {
    // The `--limit` argument is what lets the script detect its own truncated
    // window. Drop it and the gap check above can never fire in production.
    const source = wf()
    expect(source).toContain('node scripts/review-sweep.mjs')

    const asked = source.match(/gh pr list[\s\S]*?--limit (\d+)/)
    const told = source.match(/scripts\/review-sweep\.mjs[^\n]*--limit (\d+)/)
    expect(asked, 'the sweep must ask GitHub for a bounded list').toBeTruthy()
    expect(told, 'without --limit the script cannot detect its own truncated window').toBeTruthy()
    expect(
      told![1],
      'the script is told a different limit than the gh call used, so its truncation check is ' +
        'grading the wrong number and a sweep with a hole in it would report clean.',
    ).toBe(asked![1])
  })

  it('cannot publish a required check name', () => {
    expect(
      effectiveContexts(wf()).filter((c: string) => ['test', 'e2e'].includes(c)),
      'a job in this workflow reporting `test` or `e2e` would satisfy branch protection with a ' +
        'tick the real suite never produced.',
    ).toEqual([])
  })

  it('never runs on a pull request', () => {
    // It reports on merges that already happened. A PR trigger would make it
    // capable of holding a merge, which is the DREAMCRM-49 decision reversed by
    // accident rather than on purpose.
    expect(
      runsOnPullRequest(wf()),
      'review-sweep.yml must not run on pull_request — it is a post-merge alarm, not a gate.',
    ).toBe(false)
  })

  it('asks only for permissions that exist, and only for read', () => {
    // `rulebook-drift.yml` shipped a draft asking for `administration: read`,
    // which is not a scope: GitHub rejected the whole file and published no
    // check-run at all, twice, in 0 seconds. Nothing in CI validates workflow
    // syntax before GitHub does, so the list is written out here. From
    // GitHub's workflow-syntax documentation.
    const VALID_SCOPES = [
      'actions', 'artifact-metadata', 'attestations', 'checks', 'code-quality', 'contents',
      'deployments', 'discussions', 'id-token', 'issues', 'packages', 'pages', 'pull-requests',
      'security-events', 'statuses', 'vulnerability-alerts',
    ]
    // `\r?\n`, not `\n`: `core.autocrlf` is true on a Windows checkout and this
    // repo has no `.gitattributes`, so a literal `\n` matches nothing there and
    // the test fails for a reason unrelated to permissions.
    const block = wf().match(/^permissions:\r?\n((?: {2}\S.*\r?\n)+)/m)
    expect(block, 'review-sweep.yml must declare its permissions rather than inherit them').toBeTruthy()
    const asked = block![1]
      .split(/\r?\n/)
      .map((l) => l.match(/^ {2}([a-z-]+):\s*(\S+)/))
      .filter((m): m is RegExpMatchArray => Boolean(m))

    expect(asked.map((m) => m[1]).filter((s) => !VALID_SCOPES.includes(s)), 'not a real permissions scope').toEqual([])
    expect(
      asked.map((m) => m[2]).filter((v) => v !== 'read'),
      'this job reads merged PRs and writes nothing back. A write scope here would let a daily ' +
        'alarm comment on the same PR forever.',
    ).toEqual([])
  })

  it('carries no shebang, so this file can be imported on a Windows checkout', () => {
    // The scripts/review-gate.mjs lesson, inherited: git gives a Windows tree
    // CRLF endings and vitest's transform leaves the `\r` behind when it strips
    // `#!…`, killing every test in this file on Windows only.
    expect(readFileSync(join(process.cwd(), 'scripts/review-sweep.mjs'), 'utf8').startsWith('#!')).toBe(false)
  })
})

describe('the alarm actually raises the alarm', () => {
  // THE BLOCKING FINDING FROM SENTINEL'S REVIEW OF #593. Every test above this
  // point imports the classifier; none of them executed the script. So four
  // separate mutations to `main()` — zeroing the exit code, dropping the
  // annotation loop, hard-coding `gap = null`, sweeping an empty list — passed
  // all 22 of them, and every one silently disables the instrument in
  // production.
  //
  // `scripts/review-sweep.mjs` is on the review gate in this same PR precisely
  // because the quiet edit is the dangerous one here. The quietest edit
  // available was the one nothing graded.
  it('exits non-zero and annotates when a PR merged owing a review', () => {
    const { code, out } = runSweep([pr({ number: 573 }), pr({ number: 900, mergedAt: '2026-06-01T00:00:00Z' })])

    expect(
      out,
      'the ::error annotation is half the channel — without it a reader has to open the job ' +
        'summary to find out which PR the red run is even about.',
    ).toContain('::error title=PR #573')
    expect(
      code,
      'a red run is the ONLY channel this sweep has. Exit 0 here and it finds the miss, writes it ' +
        'into a job summary nobody opens, and reports green every morning forever.',
    ).toBe(1)
  })

  it('exits zero when every in-window gated PR carries a record', () => {
    const { code } = runSweep([pr({ comments: [comment('APPROVE')] })])
    expect(code, 'a clean sweep must not cry wolf').toBe(0)
  })

  it('exits non-zero when the list truncated before reaching the cut-off', () => {
    // Grades the WIRING, not just `windowGap`. #593's mutation table claimed
    // this path was covered; `const gap = null` at the call site passed every
    // test that existed at the time.
    const { code, out } = runSweep([pr({ comments: [comment('APPROVE')] })], 1)

    expect(out).toMatch(/could not see its whole window/)
    expect(code, 'a sweep with a hole in it must not report clean').toBe(1)
  })

  it('names a row it could not read a merge time from', () => {
    // Unreachable under `--state merged`, and named anyway: this file's stated
    // discipline is "counted and named, never silently dropped", and a bare
    // `continue` was the one place that was not literally true.
    const { out } = runSweep([pr({ number: 901, mergedAt: null })])

    expect(out).toContain('#901')
    expect(out).toContain('no readable merge time')
  })
})

describe('what could blind this sweep from outside', () => {
  it('refuses to let the review-gate check post its summary as a PR comment', () => {
    // THE SHARPEST EDGE IN THE DESIGN, found by Sentinel reviewing #593 and
    // pinned here rather than left to be rediscovered.
    //
    // `scripts/review-gate.mjs` renders the instruction telling authors to
    // record a verdict, so its summary contains the literal word `APPROVE` and
    // matches `VERDICT_PATTERNS`. It is safe today for exactly one reason: that
    // check writes to `GITHUB_STEP_SUMMARY` and `GITHUB_OUTPUT` and never to
    // `gh pr comment`. Give it a comment channel — an entirely
    // reasonable-looking improvement — and its summary lands on EVERY gated PR
    // in the repo, every one of them reads as satisfied, and this alarm goes
    // blind, green and silent on the same day.
    //
    // The fix if that day comes is a scoped exclusion for that comment's
    // marker, NOT narrowing the verdict patterns: narrowing them takes the
    // false-alarm risk back on, which is the trade this instrument refuses.
    const wf = readFileSync(join(process.cwd(), '.github/workflows/review-gate.yml'), 'utf8')

    expect(
      wf.includes('gh pr comment'),
      'review-gate.yml gained a PR-comment channel. Its summary contains the word APPROVE, so ' +
        'posting it would make every gated PR read as already reviewed and this sweep would stop ' +
        'seeing anything at all. Exclude that comment in scripts/review-sweep.mjs before landing it.',
    ).toBe(false)

    // The instrument check on the instrument check: if that summary ever stops
    // carrying a verdict word, the assertion above is guarding nothing.
    expect(
      VERDICT_PATTERNS.some((p) => p.test(gateSummaryForAGatedPr())),
      'the review-gate summary no longer carries a verdict word, so the guard above is vacuous — ' +
        'either restore the instruction or delete this pair deliberately.',
    ).toBe(true)
  })
})
