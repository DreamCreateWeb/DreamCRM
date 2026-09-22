import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  gateFindings,
  intakeFindings,
  INTAKE_RULES,
  renderSummary as renderGateSummary,
} from '../../scripts/review-gate.mjs'
import {
  INTAKE_LABEL,
  INTAKE_SWEPT_SINCE,
  REVIEW_LABEL,
  SWEPT_SINCE,
  VERDICT_PATTERNS,
  VERDICT_REVIEW_STATES,
  intakeRecord,
  intakeSweep,
  lastGreenAt,
  newSince,
  renderSummary,
  reviewRecord,
  sweep,
  wakeDecision,
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
 *   3a. THE SAME THREE, FOR THE INTAKE HALF (DREAMCRM-92). `needs-forge-intake`
 *      is graded the same way under its own later cut-off, and it needs its
 *      own copies rather than a shared loop: the record shape is different
 *      (`Forge intake:` plus a section reference, not a verdict word), and the
 *      cut-off's argument is its own — thirty merged PRs wore that label,
 *      unread, on the day this half arrived.
 *
 *   3b. THE WINDOW MUST BE THE LAST GREEN ONE, NOT THE LAST RUN. The exit
 *      status is keyed on what is new since the sweep last went green, and the
 *      degradation to *last run* is the failure mode written against rather
 *      than noted: it makes every miss a one-day alarm, red on the morning it
 *      appears and green every morning after with the finding untouched. Both
 *      directions run as a process — a standing miss leaves the run green
 *      while still printing, a new one reddens it — because a one-directional
 *      version of this passes on a sweep that has gone blind.
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
type Rule = { id: string; patterns: string[] }

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

/**
 * The same summary for a PR that owes an INTAKE, which is the half with its own
 * record shape.
 *
 * THE FILE LIST IS DERIVED FROM `INTAKE_RULES`, NOT HAND-PICKED (Sentinel, note
 * 3 on #648). The summary renders one `**area** — why` block per finding, and
 * those `why` strings are DATA THAT GROWS. A fixture naming one path trips
 * whatever rule that path happens to be on — today there is only one, so it
 * looked complete — and the day a second intake rule lands whose prose puts
 * `Forge intake` near a section number, a hand-picked fixture would not render
 * it and the canary below would go on passing about a body it never saw.
 *
 * Same move as the intake list's own derive-from-the-tree half: a list you
 * wrote is a list you will forget to extend. `intakeCoversEveryRule` is the
 * premise check that keeps the derivation honest — materialising a glob is
 * best-effort, so a future pattern shape that does not materialise has to say
 * so rather than quietly shrink the fixture.
 */
const materialise = (pattern: string) => pattern.replace(/\*\*/g, 'derived').replace(/\*/g, 'derived')

const everyIntakeArea = () => INTAKE_RULES.map((rule: Rule) => materialise(rule.patterns[0]))

const gateSummaryForAnIntakePr = () => {
  const files = everyIntakeArea()
  return renderGateSummary(gateFindings(files), files.length, intakeFindings(files))
}

/**
 * The `gh pr comment --body "…"` line the gate tells an INTAKE author to paste,
 * pulled out of the real rendered summary rather than copied from it.
 *
 * Picked by its marker rather than by position, because a PR owing both
 * obligations gets the review half's command in the same summary and the two
 * must not be confused for each other.
 */
const intakeCommandFromGateSummary = (): string | null => {
  const bodies: string[] = []
  const pattern = /--body "([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(gateSummaryForAnIntakePr())) !== null) bodies.push(match[1])
  return bodies.find((body) => /forge\s+intake/i.test(body)) ?? null
}

/** A `gh run list --json databaseId,conclusion,createdAt` row. */
const run = (conclusion: string, createdAt: string, databaseId = 1) => ({
  databaseId,
  conclusion,
  createdAt,
})

/**
 * Run the script the way the workflow does, as a process, and read what it says
 * and returns.
 *
 * `lastGreen` mirrors the `--last-green` file the workflow writes. Omitting it
 * is the FAILING-CLOSED path — no run history supplied, so every finding counts
 * as new — which is why every test written before DREAMCRM-92 still reads the
 * exit code it always did.
 */
function runSweep(prs: Pr[], limit = 500, lastGreen?: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), 'sweep-'))
  const file = join(dir, 'prs.json')
  writeFileSync(file, JSON.stringify(prs))

  const args = ['scripts/review-sweep.mjs', '--prs', file, '--limit', String(limit)]
  if (lastGreen) {
    const runsFile = join(dir, 'runs.json')
    writeFileSync(runsFile, JSON.stringify(lastGreen))
    args.push('--last-green', runsFile)
  }

  const r = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8' })
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

/**
 * A RED INTAKE SWEEP WAKES FORGE (DREAMCRM-99 deliverable 3).
 *
 * THE GAP, and it is a pattern rather than an incident. `review-gate.yml`
 * applies `needs-forge-intake` correctly and this sweep grades it correctly.
 * The hop AFTER the label — somebody noticing the red and routing the rule into
 * the rulebook — was owned by nothing that runs. #534's shape cost three days;
 * #658 and #659 both merged with the label unsatisfied and sat until a planning
 * meeting happened to open, which is the only reason the wait was minutes
 * rather than days. §2 records a third instance.
 *
 * WHAT IS BEING GRADED HERE is a decision about spending money. A wake enqueues
 * a PAID RUN, so `wakeDecision` is scoped harder than the exit status, and each
 * narrowing has a failure mode written against it rather than noted:
 *
 *   1. THE INTAKE HALF ONLY. The review half already has an owner — §2a's
 *      standing issue, DREAMCRM-93, assigned to Sentinel. Waking Forge for it
 *      would be two owners for one queue, which is how both stop owning it.
 *   2. FRESH ENTRIES ONLY. A standing entry is printed every morning by design.
 *      Waking Forge for it every morning is the paid version of the
 *      permanently-red alarm §2a spent six mornings learning about.
 *   3. NOT AT ALL WHEN THE WINDOW IS UNDATED — the one place this diverges from
 *      the exit status, deliberately. The run still fails closed and goes red;
 *      that is free. With no green instant every entry reads as new, so one
 *      throttled API call would dispatch Forge over a queue he has already
 *      seen. Both directions are tested: it must not wake, AND it must SAY it
 *      did not, because a wake that silently never fires is this file's own
 *      failure mode wearing a different hat.
 *   4. THE PING MUST WAKE. It is the only thing that can tell a healthy wire
 *      from a rotated token — the healthy state of this wire is silence, which
 *      is exactly the state it exists to make impossible elsewhere.
 */
describe('the wake: which red runs cost Forge a run', () => {
  // After INTAKE_SWEPT_SINCE (08:00Z), so an entry can sit on either side of
  // the green instant and still be inside the intake window. A fixture where
  // "standing" also meant "out of window" would test the cut-off twice and
  // the freshness rule not at all.
  const green = { at: Date.parse('2026-09-22T12:00:00Z'), run: 1, why: null }
  const undated = { at: null, run: null, why: 'no run of this sweep concluded `success`' }

  const unrouted = (over: Pr = {}) =>
    pr({ number: 658, mergedAt: '2026-09-22T14:00:00Z', labels: [{ name: INTAKE_LABEL }], ...over })

  /** What `intakeSweep` hands the decision, built from real PR rows. */
  const half = (prs: Pr[]) => intakeSweep(prs, INTAKE_SWEPT_SINCE)

  it('wakes on a fresh unrouted intake, and names the PRs', () => {
    const d = wakeDecision({ intake: half([unrouted()]), lastGreen: green })
    expect(d.wake).toBe(true)
    expect(d.reason).toBe('intake')
    expect(d.prs.map((p: { number: number }) => p.number)).toEqual([658])
    // The payload has to carry enough for Forge to start without re-deriving
    // it: #658 sat 2h20m because nothing pointed anybody at it.
    expect(d.prs[0]).toHaveProperty('url')
    expect(d.prs[0]).toHaveProperty('title')
  })

  it('does NOT wake for the review half, which has its own owner', () => {
    // A PR owing a REVIEW and nothing else. Sentinel owns that queue through
    // DREAMCRM-93; a second agent woken for it is two owners, which is none.
    const reviewOnly = pr({ number: 700, mergedAt: '2026-09-22T14:00:00Z', labels: [{ name: REVIEW_LABEL }] })
    const d = wakeDecision({ intake: half([reviewOnly]), lastGreen: green })
    expect(d.wake, 'a review miss must not spend a Forge run').toBe(false)
    expect(d.reason).toBe('clean')
  })

  it('does NOT wake for an entry standing from before the last green run', () => {
    // Printed every morning by design; woken once, when it was new.
    const old = unrouted({ mergedAt: '2026-09-22T09:00:00Z' })
    const d = wakeDecision({ intake: half([old]), lastGreen: green })
    expect(d.wake).toBe(false)
    expect(d.reason).toBe('standing-only')
    expect(d.why).toContain('the paid version of an alarm nobody reads')
  })

  it('wakes for the fresh entry even when a standing one is alongside it', () => {
    // The mixed queue, which is the common real shape. Waking must not be
    // suppressed by an old entry sitting next to a new one — that is how the
    // #636 silence formed on the exit status, one channel over.
    const d = wakeDecision({
      intake: half([unrouted({ number: 600, mergedAt: '2026-09-22T09:00:00Z' }), unrouted()]),
      lastGreen: green,
    })
    expect(d.wake).toBe(true)
    expect(d.prs.map((p: { number: number }) => p.number), 'only the fresh one is the reason').toEqual([658])
  })

  it('does NOT wake when nothing dates the window — and SAYS it did not', () => {
    // THE DIVERGENCE FROM THE EXIT STATUS, and the asymmetry is the argument:
    // failing closed is free for a run's colour and expensive for a dispatch.
    // The second assertion is the load-bearing one — a suppression nobody is
    // told about is indistinguishable from a wake that quietly stopped
    // working.
    const d = wakeDecision({ intake: half([unrouted()]), lastGreen: undated })
    expect(d.wake).toBe(false)
    expect(d.reason).toBe('undated')
    expect(
      d.suppressed,
      'a suppressed wake must be announced, or a broken wire and a quiet week look identical',
    ).toBeTruthy()
    expect(d.suppressed).toContain('1 unrouted intake')
  })

  it('says nothing about suppression when there was nothing to suppress', () => {
    // The other direction: an `::error` every morning on a clean sweep is the
    // false alarm that gets the whole channel muted.
    expect(wakeDecision({ intake: half([]), lastGreen: undated }).suppressed).toBeNull()
    expect(wakeDecision({ intake: half([]), lastGreen: green }).suppressed).toBeNull()
  })

  it('a ping wakes unconditionally — it is what notices the wire has stopped', () => {
    // The healthy state of this wire is SILENCE, which is the exact state this
    // whole file exists to refuse elsewhere. Nothing else here can tell a quiet
    // week from a rotated token.
    const d = wakeDecision({ intake: half([]), lastGreen: undated, ping: true })
    expect(d.wake).toBe(true)
    expect(d.reason).toBe('ping')
  })

  it('a clean intake half wakes nobody', () => {
    const routed = unrouted({ comments: [comment('Forge intake: §2b — routed, landed there')] })
    expect(half([routed]).unsatisfied).toEqual([])
    expect(wakeDecision({ intake: half([routed]), lastGreen: green }).wake).toBe(false)
  })
})

describe('the sweep workflow', () => {
  const wf = () => readFileSync(join(process.cwd(), '.github/workflows/review-sweep.yml'), 'utf8')

  /**
   * THE SHELL COMMAND containing `anchor`, following `\` continuations.
   *
   * Comment lines are skipped, and that is the whole point of this existing
   * rather than a regex over the file. The first draft of the green-lookup
   * guard below matched `/gh run list[\s\S]*?--json/`, which anchored on the
   * `permissions:` block's comment — it explains what `gh run list` needs the
   * `actions` scope FOR — and then swallowed half the file, including the real
   * command. Deleting `--status success` from the command left it green: the
   * guard was reading a sentence ABOUT the command. Watched fail (DREAMCRM-92,
   * §2d), which is how it was found rather than shipped.
   */
  function shellCommand(source: string, anchor: string): string | null {
    const lines = source.split(/\r?\n/)
    const start = lines.findIndex((l) => !l.trimStart().startsWith('#') && l.includes(anchor))
    if (start === -1) return null

    const out = [lines[start]]
    while (out[out.length - 1].trimEnd().endsWith('\\') && start + out.length < lines.length) {
      out.push(lines[start + out.length])
    }
    return out.join('\n')
  }

  it('runs the script and tells it the limit it asked GitHub for', () => {
    // The `--limit` argument is what lets the script detect its own truncated
    // window. Drop it and the gap check above can never fire in production.
    const source = wf()
    expect(source).toContain('node scripts/review-sweep.mjs')

    const list = shellCommand(source, 'gh pr list')
    const told = source.match(/scripts\/review-sweep\.mjs[^\n]*--limit (\d+)/)
    expect(list, 'the sweep must ask GitHub for a bounded list').toBeTruthy()
    const asked = list!.match(/--limit (\d+)/)
    expect(asked, 'the sweep must ask GitHub for a bounded list').toBeTruthy()
    expect(told, 'without --limit the script cannot detect its own truncated window').toBeTruthy()
    expect(
      told![1],
      'the script is told a different limit than the gh call used, so its truncation check is ' +
        'grading the wrong number and a sweep with a hole in it would report clean.',
    ).toBe(asked![1])
  })

  it('looks its own run history up, and asks for GREEN runs specifically', () => {
    // THE FAILURE MODE §2a NAMES, graded at the place it would actually
    // happen. `lastGreenAt` filters on `conclusion` itself, so dropping
    // `--status success` cannot silently change the answer — but the flag
    // going missing is the first symptom of somebody "simplifying" this toward
    // the last RUN, and that degradation turns every miss into a one-day
    // alarm. Both halves of the belt-and-braces are asserted: here, and in
    // `when the sweep last went green` above.
    const source = wf()
    const lookup = shellCommand(source, 'gh run list')

    expect(lookup, 'the sweep must look up when it last went green, or it cannot key on it').toBeTruthy()
    expect(
      lookup!,
      'the run-history lookup stopped asking for successful runs. Keyed on the last RUN rather ' +
        'than the last GREEN one, a miss is red for one morning and green every morning after ' +
        'with nothing remediated — worse than the permanently-red alarm this replaced.',
    ).toContain('--status success')
    expect(
      lookup!,
      'a green workflow_dispatch run from a feature branch graded a different version of this file',
    ).toContain('--branch main')
    expect(
      source,
      'the script is not told where the run history is, so it fails closed every morning and the ' +
        'whole last-green window is dead code in production.',
    ).toMatch(/scripts\/review-sweep\.mjs[^\n]*--last-green/)
  })

  it('asks for the scope its own run-history lookup needs', () => {
    // `gh run list` cannot read a private repo's Actions history on `contents`
    // alone. Without `actions: read` the lookup 403s, the `|| true` swallows
    // it, the script fails CLOSED — and the sweep is back to permanently red
    // with nobody able to tell from the summary why. That is a silent
    // regression to the exact behaviour this change removed.
    expect(
      wf(),
      'review-sweep.yml calls `gh run list` without `actions: read`, so the green lookup 403s ' +
        'every morning and the sweep fails closed forever.',
    ).toMatch(/^ {2}actions: read$/m)
  })

  /**
   * THE WAKE STEP (DREAMCRM-99 deliverable 3).
   *
   * The decision itself is graded above, against fixtures. What is graded here
   * is the WIRING, and it has one property that is more dangerous than
   * anything else in this file: to let the wake run after a RED sweep — the
   * only kind of run that has anything to wake anybody for — the grading step
   * is `continue-on-error: true`, and the job's real verdict is restored by a
   * later step.
   *
   * Delete that restore step and this whole alarm reports GREEN every morning
   * while finding everything. That is the same `process.exitCode = 0` mutation
   * the ringer block refuses at the script level, moved into YAML where no test
   * of the script can see it. Both halves are pinned.
   */
  it('lets the wake run after a red sweep — AND restores the sweep\'s own verdict', () => {
    const source = wf()

    expect(
      source,
      'the grading step must be `continue-on-error` or the wake never runs on the only kind of ' +
        'run that needs it',
    ).toMatch(/^ {8}continue-on-error: true$/m)

    // THE HALF THAT MATTERS. `continue-on-error` without this makes the job
    // green forever.
    expect(
      source,
      'the sweep step is `continue-on-error` and NOTHING restores its verdict, so this alarm ' +
        'reports green every morning while finding everything. Add a final step keyed on ' +
        "`steps.sweep.outcome == 'failure'` that exits 1.",
    ).toMatch(/steps\.sweep\.outcome == 'failure'/)
    expect(source, 'the restore step must actually fail the job').toMatch(/exit 1/)
  })

  it('posts the wake to a SECRET url, and never echoes it', () => {
    const source = wf()
    expect(
      source,
      'GitHub cannot dispatch anybody — the wake has to leave GitHub. Without the POST this is ' +
        'back to a red run in one inbox, which is the state #658 and #659 sat in.',
    ).toContain('secrets.FORGE_INTAKE_WAKE_URL')

    // The Multica webhook token lives in the URL path, so the URL IS the
    // credential. Anything that prints it puts it in a public run log.
    const post = shellCommand(source, 'curl')
    expect(post, 'the wake must actually POST something').toBeTruthy()
    expect(post!).toContain('-X POST')

    // GRADED OVER THE WHOLE FILE, not just the POST command — and that is a
    // mutation finding rather than caution. The first draft checked only the
    // curl invocation, so moving the leak one line down into the success
    // `::notice` left it green. A credential printed anywhere in this job is a
    // credential in a run log.
    const leaks = source
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      // The EXPANSION, not the name. Saying `FORGE_INTAKE_WAKE_URL is not set`
      // in a summary is the correct thing to print; `${WAKE_URL}` is the
      // credential itself.
      .filter((l) => /(?:echo|printf)\b/.test(l) && /\$\{?WAKE_URL\}?|\$\{\{\s*secrets\./.test(l))
    expect(
      leaks,
      'the wake URL is a credential — the Multica webhook token is in its path — and these lines ' +
        'print it into a run log:\n  ' + leaks.join('\n  '),
    ).toEqual([])
  })

  it('a rejected POST is LOUD, not swallowed', () => {
    // A wake that silently 404s is indistinguishable from a quiet week, which
    // is the failure class this entire file is about. `--fail-with-body` is
    // what makes a 4xx a non-zero exit at all; without it curl reports success
    // on an error page.
    const post = shellCommand(wf(), 'curl')!
    expect(post, 'without --fail-with-body curl exits 0 on a 404 and the wake fails silently').toContain(
      '--fail-with-body',
    )
    expect(wf()).toMatch(/::error::the wake POST failed/)
  })

  it('an unset secret is SKIPPED, not a failure', () => {
    // The same contract `error-scan.yml` carries for its IAM role. A wake that
    // is not configured yet must not turn a working sweep red every morning —
    // a workflow red for a fortnight for an unrelated reason is one nobody
    // reads on the day it finally means something.
    const source = wf()
    expect(source).toMatch(/if \[ -z "\$\{WAKE_URL\}" \]/)
    expect(source, 'an unconfigured wake must say it is unconfigured, not pass quietly').toContain(
      'Skipped, not passed',
    )
  })

  it('the wake runs even when the sweep step failed outright', () => {
    // `continue-on-error` covers a non-zero exit; `if: always()` also covers
    // the step erroring before it gets that far. Either way the decision file
    // is checked for existence first, and a missing one is reported rather
    // than read as "no wake needed".
    const source = wf()
    expect(source).toMatch(/^ {8}if: always\(\)$/m)
    expect(source).toMatch(/the sweep wrote no wake decision/)
  })

  it('the script is told where to write its wake decision', () => {
    // Without `--wake-out` the decision is computed and thrown away, and the
    // wake step reads a file that never appears — the whole wire is dead code
    // in production while every test above still passes.
    expect(
      wf(),
      'scripts/review-sweep.mjs is not given --wake-out, so the wake decision is never written ' +
        'and the POST step can never fire.',
    ).toMatch(/scripts\/review-sweep\.mjs[^\n]*--wake-out/)
  })

  it('exposes a ping, because the healthy state of this wire is silence', () => {
    // The only thing that can tell a live wake from a rotated token. Run it by
    // hand after touching the secret or the autopilot.
    const source = wf()
    expect(source).toMatch(/^ {6}ping:$/m)
    expect(source).toMatch(/scripts\/review-sweep\.mjs[^\n]*--ping/)
  })

  it('gained no write scope for any of it', () => {
    // The wake leaves GitHub entirely, which is the point: it needs no
    // `pull-requests: write`, no `issues: write`, nothing. The three read
    // scopes this job has always had are still all it has.
    const block = /permissions:\n((?:\s{2}\w[\w-]*:\s*\w+\n)+)/.exec(wf())?.[1] ?? ''
    const scopes = Object.fromEntries(
      block
        .trim()
        .split('\n')
        .map((l) => l.trim().split(/:\s*/) as [string, string]),
    )
    expect(Object.values(scopes).filter((v) => v === 'write')).toEqual([])
    expect(Object.keys(scopes).sort()).toEqual(['actions', 'contents', 'pull-requests'])
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

/**
 * THE WINDOW THE RUN'S COLOUR IS KEYED ON (DREAMCRM-92).
 *
 * The first version of this sweep stayed red while ANY unremediated entry
 * existed. That is right for the TEXT and it was a disaster in the exit status:
 * six consecutive red runs — `35094044453` (2026-09-16) through `35605207003`
 * (2026-09-21) — turned the alarm into wallpaper, and #636 merged into that
 * silence carrying `needs-sentinel-review` and editing the gate's own rule
 * list, with no verdict anywhere.
 *
 * The named failure mode of the fix is the one graded hardest below: **if the
 * lookup degrades from LAST GREEN to LAST RUN, every miss becomes a one-day
 * alarm** — red the morning it appears, green the morning after with the
 * finding untouched, which is strictly worse than the permanently-red version
 * it replaced. A green run is a positive claim that nothing is new, so that
 * degradation does not merely lose a signal, it fabricates one.
 */
describe('when the sweep last went green', () => {
  it('reaches past a newer FAILED run to the last green one', () => {
    // THE DEGRADATION THIS EXISTS TO REFUSE. Every run since the green one
    // failed — that is exactly the repo's real history — and a lookup keyed on
    // the last RUN would date the window at yesterday, making every standing
    // finding "old" overnight and the run green with nothing remediated.
    const history = [
      run('failure', '2026-09-21T13:22:34Z', 35605207003),
      run('failure', '2026-09-20T11:50:11Z', 35508928448),
      run('success', '2026-09-15T12:00:00Z', 35000000001),
      run('failure', '2026-09-14T12:00:00Z', 34999999999),
    ]

    const green = lastGreenAt(history)
    expect(
      green.at,
      'the lookup landed on a run that was not green. Keyed on the last RUN instead of the last ' +
        'GREEN one, every miss is red for one morning and green forever after with nothing fixed.',
    ).toBe(Date.parse('2026-09-15T12:00:00Z'))
    expect(green.run).toBe(35000000001)
  })

  it('reports no green rather than guessing when the history holds none', () => {
    // This is the repo's state on the day this landed: six runs, all failures.
    // "No green yet" must read as UNKNOWN and fail closed, never as "nothing
    // is new".
    const green = lastGreenAt([run('failure', '2026-09-21T13:22:34Z')])
    expect(green.at).toBeNull()
    expect(green.why).toMatch(/success/)
  })

  it('treats every finding as new when there is no green to measure against', () => {
    // FAIL CLOSED. `newSince` is what the exit status reads, so a null window
    // that produced an empty `fresh` set would be a silent green morning.
    const entries = [pr({ number: 594, mergedAt: '2026-09-15T20:00:16Z' })]
    expect(newSince(entries, lastGreenAt([])).fresh.map((p: Pr) => p.number)).toEqual([594])
    expect(newSince(entries, { at: null }).fresh).toHaveLength(1)
  })

  it('counts a PR that merged while the green run was executing as new', () => {
    // `createdAt` is the conservative end of a run, and `>=` is the
    // conservative side of the boundary: a merge the green run never examined
    // must not inherit its silence.
    const green = { at: Date.parse('2026-09-20T12:00:00Z') }
    const split = newSince(
      [
        pr({ number: 700, mergedAt: '2026-09-20T12:00:00Z' }),
        pr({ number: 699, mergedAt: '2026-09-20T11:59:59Z' }),
      ],
      green,
    )
    expect(split.fresh.map((p: Pr) => p.number)).toEqual([700])
    expect(split.standing.map((p: Pr) => p.number)).toEqual([699])
  })
})

/**
 * BOTH DIRECTIONS OF THE NEW RULE, RUN AS A PROCESS.
 *
 * §2d: a guard counts only once you have watched it fail. A one-directional
 * test here passes on a sweep that has quietly gone blind — "standing findings
 * do not redden the run" is satisfied by an instrument that reddens for
 * nothing at all — so both are graded, on the exit code, through `main()`.
 */
describe('the exit status is keyed on what is new since the last green run', () => {
  const GREEN = [run('success', '2026-09-20T12:00:00Z', 42)]

  it('stays GREEN on a standing miss, and prints it anyway', () => {
    const { code, out } = runSweep([pr({ number: 594, mergedAt: '2026-09-18T20:00:00Z' })], 500, GREEN)

    expect(
      out,
      'the summary must keep naming an unremediated entry every morning — Sentinel\'s property: ' +
        'an unremediated miss is not less true tomorrow.',
    ).toContain('#594')
    expect(out).toContain('unremediated miss is not less true tomorrow')
    expect(out).toContain('standing from before the last green run')
    expect(
      code,
      'a finding that predates the last green run must not hold the run red forever. That is the ' +
        'six-day wallpaper this change exists to end — and #636 merged into it.',
    ).toBe(0)
  })

  it('goes RED on a miss that merged after the last green run', () => {
    const { code, out } = runSweep([pr({ number: 640, mergedAt: '2026-09-21T09:00:00Z' })], 500, GREEN)

    expect(out).toContain('::error title=PR #640')
    expect(out).toContain('new since the last green run')
    expect(
      code,
      'a NEW miss must always be a NEW red. If this reports green, the alarm has gone blind in ' +
        'the quietest possible way.',
    ).toBe(1)
  })

  it('goes RED on the new miss even when a standing one is sitting beside it', () => {
    // The realistic morning: an old entry nobody has cleared, plus today's.
    // The old one must not mask the new one, in either direction.
    const { code, out } = runSweep(
      [
        pr({ number: 594, mergedAt: '2026-09-18T20:00:00Z' }),
        pr({ number: 640, mergedAt: '2026-09-21T09:00:00Z' }),
      ],
      500,
      GREEN,
    )

    expect(out).toContain('::error title=PR #640')
    expect(out, 'the standing entry is still annotated, as a warning rather than an error').toContain(
      '::warning title=PR #594',
    )
    expect(code).toBe(1)
  })

  it('fails closed when the run-history lookup came back empty', () => {
    // A throttled `gh run list`, an empty history, a file the step never
    // wrote. All of them are UNKNOWN, and unknown stays red: the alternative
    // lets one bad API call print a green morning over a real miss.
    const { code, out } = runSweep([pr({ number: 594, mergedAt: '2026-09-18T20:00:00Z' })], 500, [])

    expect(out).toContain('Failing closed')
    expect(code, 'an unknown window must never be read as a clean one').toBe(1)
  })
})

/**
 * THE INTAKE HALF (DREAMCRM-92).
 *
 * `needs-forge-intake` was applied correctly by the gate from #553 onward and
 * read by nothing: never cleared at merge, THIRTY merged PRs wearing it on the
 * day this landed. §2's answer is the same shape as the review half's — the
 * record is mirrored onto the PR, where an instrument can see it — and this is
 * the instrument.
 *
 * Same three directions as the review half, for the same reasons: a real
 * record must never be flagged, a real miss must still be seen, and the
 * cut-off must hold against a history that cannot be judged.
 */
describe('what counts as an intake that happened', () => {
  const SATISFIED: Record<string, string> = {
    'the convention, as §2 writes it':
      'Forge intake: §2b, §6 — https://multica/issue/DREAMCRM-91#c7',
    'several sections, folded': 'Forge intake: §§2, 2a — routed and landed, see the issue',
    'sections spelled out': 'Forge intake — landed in sections 2b and 6 of the rulebook.',
  }

  it.each(Object.keys(SATISFIED))('reads "%s" as satisfied', (name) => {
    expect(
      intakeRecord(pr({ comments: [VERCEL_COMMENT, comment(SATISFIED[name])] })),
      'this PR carries a real intake record and the sweep does not see it. Same cost as the ' +
        'review half: an alarm that fires at the person who did the work is one people stop reading.',
    ).not.toBeNull()
  })

  it('does not count a marker and a section reference that never meet on one line', () => {
    // THE TIGHTENING THAT CAME WITH DREAMCRM-94, and the one pattern in this
    // file that got narrower rather than looser — so it is asserted rather
    // than left implied.
    //
    // Matching the two independently over the whole body counted a comment
    // that mentioned a Forge intake in one paragraph and cited a section in
    // another. That is not a record of anything, and reading it as one is a
    // MISSED MISS: the sweep reports an unrecorded PR as routed. The body
    // below is the realistic shape — a mirrored issue update that talks about
    // the intake and, separately, about where a rule lives.
    //
    // THE FIRST DRAFT OF THIS FIXTURE PASSED AGAINST THE OLD CODE, which is
    // the §2d trap written down rather than quietly fixed: it said "Told Forge
    // about the intake", and `INTAKE_MARKER` wants the two words ADJACENT, so
    // the body matched neither test and the guard proved nothing. Both halves
    // of a negative fixture have to be live — this one really does carry the
    // marker, and really does carry a section reference, just never together.
    expect(
      intakeRecord(
        pr({
          comments: [
            comment(
              'Forge intake handled — I told them on the issue today.\n\n' +
                'For anyone reading later: the rule this PR adds belongs under §2b.',
            ),
          ],
        }),
      ),
      'a comment that mentions an intake in one paragraph and a section in another is not a ' +
        'record — counting it retires an obligation nobody paid, silently.',
    ).toBeNull()
  })

  it('does not accept a record that never names where the rule landed', () => {
    // §2: "name the sections it landed in, not merely that it landed." That is
    // what makes the record gradeable rather than decorative — an intake's real
    // record lives in a skill outside this repo, and the section number is the
    // only part of it a reader standing at the PR can follow.
    expect(intakeRecord(pr({ comments: [comment('Forge intake: routed, all done.')] }))).toBeNull()
  })

  it('does not read a verdict comment as an intake record', () => {
    // The two obligations are separate and a PR can owe both. A mirrored
    // VERDICT satisfying the INTAKE half would silently retire an obligation
    // nobody paid — #636 owed both and paid neither.
    expect(intakeRecord(pr({ comments: [comment('Sentinel review: APPROVE — link')] }))).toBeNull()
  })

  it('does not read a bot deployment comment as an intake record', () => {
    expect(intakeRecord(pr({ comments: [VERCEL_COMMENT] }))).toBeNull()
  })

  it('names a PR that merged owing an intake with nothing recorded', () => {
    // DIRECTION 2, the #636 shape: labelled by the gate, merged, nothing on
    // the PR at all.
    const { unsatisfied } = intakeSweep(
      [pr({ number: 640, labels: [{ name: INTAKE_LABEL }], comments: [VERCEL_COMMENT] })],
      '2026-09-01T00:00:00Z',
    )
    expect(unsatisfied.map((p: Pr) => p.number)).toEqual([640])
  })

  it('says nothing about a merged PR that only owed a review', () => {
    const { unsatisfied, ungated } = intakeSweep([pr()], '2026-09-01T00:00:00Z')
    expect(unsatisfied).toEqual([])
    expect(ungated).toBe(1)
  })

  it('goes red as a process when an intake miss is new', () => {
    // Grades the WIRING, not just the classifier — the #593 lesson, applied to
    // the half that did not exist when it was learned. `intakeSweep` could be
    // perfect while `main()` never consults it.
    const { code, out } = runSweep(
      [
        pr({
          number: 641,
          labels: [{ name: INTAKE_LABEL }],
          mergedAt: '2026-09-23T09:00:00Z',
        }),
      ],
      500,
      [run('success', '2026-09-22T12:00:00Z', 43)],
    )

    expect(out).toContain('::error title=PR #641 merged owing an intake')
    expect(code, 'an intake nobody recorded must reach the one channel this sweep has').toBe(1)
  })
})

describe('the intake cut-off', () => {
  it('does not judge the thirty PRs that were labelled before the record existed', () => {
    // THE FALSE-POSITIVE CLASS THIS HALF WOULD OTHERWISE HAVE SHIPPED WITH.
    // Thirty merged PRs wore `needs-forge-intake` on 2026-09-22, #569 through
    // #636, most of them routed to Forge long ago with the routing recorded on
    // a Multica issue GitHub cannot see. Judging them would have opened the
    // instrument with thirty findings, most of them wrong.
    const history = [569, 593, 617, 636].map((number) =>
      pr({ number, labels: [{ name: INTAKE_LABEL }], mergedAt: '2026-09-16T04:00:00Z' }),
    )
    const result = intakeSweep(history)

    expect(result.unsatisfied).toEqual([])
    expect(
      result.outOfWindow.map((p: Pr) => p.number).sort(),
      'skipped is not passed — every unjudged PR is named in the summary',
    ).toEqual([569, 593, 617, 636])
  })

  it('opens after #636, the last merge that wore the label unjudged', () => {
    // A cut-off that landed one merge too early would have opened this half
    // with a finding against the very PR §2 uses as its worked example — and
    // #636's intake is a lesson about the label, not a debt to collect.
    expect(Date.parse(INTAKE_SWEPT_SINCE)).toBeGreaterThan(Date.parse('2026-09-22T01:24:20Z'))
  })

  it('pins the cut-off to a real instant that is not in the future', () => {
    const t = Date.parse(INTAKE_SWEPT_SINCE)
    expect(Number.isFinite(t), 'INTAKE_SWEPT_SINCE must be a parseable RFC3339 instant').toBe(true)
    expect(t, 'a cut-off in the future silently exempts everything').toBeLessThan(Date.now())
  })

  it('stays LATER than the review cut-off, which is what keeps the truncation check honest', () => {
    // `windowGap` grades the `gh pr list` truncation against SWEPT_SINCE only.
    // That covers both halves for exactly one reason: SWEPT_SINCE is the
    // earlier of the two. Add a third obligation with an older cut-off and the
    // truncation check starts grading the wrong number, silently, which is the
    // "a sweep with a hole in it looks like a clean sweep" failure this file
    // has now written down three times.
    expect(
      Date.parse(SWEPT_SINCE),
      'the truncation check reads SWEPT_SINCE, so it must be the earliest cut-off any obligation ' +
        'uses — otherwise a truncated list can hide merges the intake half needed to see.',
    ).toBeLessThanOrEqual(Date.parse(INTAKE_SWEPT_SINCE))
  })
})

/**
 * THE OTHER HALF OF AN ALARM: SOMEBODY HAS TO BE TOLD (DREAMCRM-94).
 *
 * Everything above grades whether this sweep can SEE a record. None of it
 * grades whether anyone was ever asked to leave one — and for the intake half
 * that was the live defect, not a hypothetical. `renderIntakeSection` told an
 * author to mention Forge on their issue and said nothing about the PR, so the
 * sweep graded a record whose only home was §2 of a skill document. #644
 * merged carrying the label with no record and opened this half's finding
 * list; its author had done everything the summary in front of them asked.
 *
 * That is the #575/#579/#580 shape pointed forwards instead of backwards, and
 * an alarm that fires at somebody nobody told is the exact thing the
 * zero-false-positives bar exists to prevent. So the contract is asserted
 * ACROSS the two files rather than in either one: the command the gate prints,
 * filled in, must satisfy the classifier the sweep runs. Grading the gate's
 * wording alone would pass on a template the sweep rejects, which is the
 * "assert the answer, not a proxy for it" rule from the conventions.
 */
describe('the gate asks for the record this sweep grades', () => {
  it('prints a mirroring command in the summary an intake-owing PR actually gets', () => {
    expect(
      intakeCommandFromGateSummary(),
      'the review-gate summary no longer tells an intake author to record anything on the PR, ' +
        'so this sweep is back to grading a record nothing asks for and every finding it raises ' +
        'lands on somebody who was never told. Restore the command in renderIntakeSection in ' +
        'scripts/review-gate.mjs.',
    ).not.toBeNull()
  })

  it('prints a command that satisfies this sweep once its placeholders are filled in', () => {
    // THE CROSS-FILE CONTRACT, and the reason this is not a wording check.
    // `scripts/review-gate.mjs` and `scripts/review-sweep.mjs` can each be
    // internally perfect while the thing one tells you to paste is not the
    // thing the other accepts — reword the template to "Forge routing:", or
    // tighten `carriesIntake` a shade further, and the repo starts flagging
    // authors who followed the instruction to the letter.
    const filled = intakeCommandFromGateSummary()!
      .replace('<sections>', '§2b, §6')
      .replace('<link to the issue comment>', 'https://multica/issue/DREAMCRM-94#c3')

    expect(
      filled,
      'the placeholders in the gate\'s command were renamed, so this test filled in nothing and ' +
        'is about to assert on a template. Update the replacements above to match.',
    ).not.toContain('<')

    expect(
      intakeRecord(pr({ comments: [comment(filled)] })),
      'the command the review gate tells an author to paste does not satisfy intakeRecord. An ' +
        'author who follows the instruction exactly still gets named by the sweep the next ' +
        'morning — the DREAMCRM-94 defect, pointing the other way.',
    ).not.toBeNull()
  })

  it('prints a template that does not satisfy the sweep until somebody fills it in', () => {
    // WHY THE PLACEHOLDER CARRIES NO SECTION DIGIT. The gate's intake section
    // cites `§2` in its own prose, so the template itself must never complete
    // a record on its own — otherwise the summary reads as an intake record,
    // and the canary below (plus the comment-channel guard beside it) is all
    // that stands between this alarm and every intake-labelled PR in the repo
    // reading as routed.
    expect(
      intakeRecord(pr({ comments: [comment(intakeCommandFromGateSummary()!)] })),
      'the unfilled template already reads as an intake record. Put the sections back behind a ' +
        'placeholder with no digit in it — do NOT narrow the record pattern to compensate.',
    ).toBeNull()
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
    //
    // MORE DURABLE THAN IT LOOKS, and worth writing down because a reader could
    // draw the opposite conclusion from a green run (Sentinel, re-auditing
    // #593). The summary carries a verdict word by TWO independent routes: the
    // DREAMCRM-61 instruction block, and "on `REQUEST CHANGES`, fix and
    // re-request", which predates it by forty PRs. Replacing every `APPROVE` in
    // `scripts/review-gate.mjs` leaves this green; only removing both spellings
    // makes it red. So deleting the newer block alone cannot silently vacate
    // the guard above — this pairing does not rest on the sentence this PR
    // added, which is the good news rather than a gap.
    expect(
      VERDICT_PATTERNS.some((p) => p.test(gateSummaryForAGatedPr())),
      'the review-gate summary no longer carries a verdict word by ANY route, so the guard above ' +
        'is vacuous — restore a verdict word to that summary, or delete this pair deliberately.',
    ).toBe(true)
  })

  it('grades that summary with every intake area rendered into it, not just one', () => {
    // THE PREMISE UNDER THE CANARY BELOW (Sentinel, note 3 on #648). The
    // fixture derives its file list from `INTAKE_RULES`, so the summary it
    // grades carries EVERY area's `why` prose — but materialising a glob is
    // best-effort, and a future pattern shape that does not materialise would
    // silently drop its area out of the body while the canary went on passing.
    //
    // Asserting the CLASSIFIER's answer rather than the fixture's shape, for
    // the reason §2d gives: a guard that greps a module it could have imported
    // is testing the file, not the rule.
    expect(
      intakeFindings(everyIntakeArea())
        .map((f: { id: string }) => f.id)
        .sort(),
      'an INTAKE_RULES area no longer renders into the canary fixture, so the guard below is ' +
        'grading a summary with that area missing. Teach `materialise` the new pattern shape.',
    ).toEqual(INTAKE_RULES.map((rule: Rule) => rule.id).sort())
  })

  it('does not let the review-gate summary read as an intake record', () => {
    // THE SAME HAZARD, ONE OBLIGATION OVER (DREAMCRM-92). The gate's intake
    // section is the thing that tells an author an intake is owed, so it talks
    // about Forge, about intake, and about §2 — three of the four ingredients
    // of the record this sweep now looks for.
    //
    // SINCE DREAMCRM-94 THAT SUMMARY PRINTS THE MARKER ON PURPOSE — it is
    // where an author is now told to record the intake — so the margin this
    // canary watches has changed and is worth restating. It is safe because
    // the marker and a section reference never land on the SAME LINE: the
    // command carries `Forge intake:` with a digitless `<sections>`
    // placeholder, and the prose that cites §2 carries no marker.
    // `carriesIntake` reads one line at a time, so neither completes a record.
    // The assertion above already refuses the comment CHANNEL, so this is the
    // canary on the other side — reword the summary so one line says
    // "Forge intake: §2 …" and the channel guard becomes the only thing
    // standing between this alarm and every intake-labelled PR in the repo
    // reading as routed.
    //
    // If that day comes the fix is a scoped exclusion for that comment's
    // marker, NOT a narrower record pattern: narrowing takes the false-alarm
    // risk back on, which is the trade this instrument refuses. (The one-line
    // rule itself is a tightening and owes its own argument — it is in
    // `carriesIntake`, and it shipped WITH the instruction rather than as a
    // reaction to a blinding, which is the distinction that permits it.)
    expect(
      intakeRecord(pr({ comments: [comment(gateSummaryForAnIntakePr())] })),
      'the review-gate summary now reads as an intake record. If it ever gains a comment channel, ' +
        'every intake-labelled PR reads as routed and this half of the alarm goes blind on the ' +
        'same day. Reword the summary, or exclude that comment by its marker in ' +
        'scripts/review-sweep.mjs.',
    ).toBeNull()

    // The instrument check on the instrument check: the summary this is
    // grading must actually be the one an intake-owing PR gets, or the
    // assertion above is about an empty string.
    expect(
      gateSummaryForAnIntakePr(),
      'the fixture no longer renders the intake section, so the guard above is vacuous',
    ).toContain('Forge')
  })
})
