import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
// The shipping classifier, imported rather than grepped — see the note below.
import { gateFindings } from '../../scripts/review-gate.mjs'
import { A11Y_BASELINE } from '../../e2e/axe-baseline'
import { CEILING_RAISES, type CeilingRaise } from '../../e2e/axe-baseline-raises'
import {
  FETCH_MAIN_COMMAND,
  CHECKOUT_FULL_HISTORY,
  FETCH_MAIN_REFSPEC,
  MIN_WHY_LENGTH,
  splitJobs,
  checkRatchet,
  formatFindings,
  parseBaseline,
  type Baseline,
} from './axe-baseline-ratchet'

/**
 * AXE CEILINGS ONLY EVER GO DOWN — ENFORCED, AT LAST.
 *
 * `e2e/axe-baseline.ts` is a RATCHET. Every number in it is a ceiling on
 * violations a stop is allowed to carry, and its header says four times over
 * that the numbers only ever go down. The conventions say it twice more:
 * "ceilings only ever go down", and "raising a ceiling to get green is
 * weakening a failing test".
 *
 * None of that was enforced by anything. Raise an entry by one and `pnpm test`
 * was green, `e2e` was green, and no label fired — the baseline is deliberately
 * kept off the review gate's intake list, because a ceiling SHRINK is the end of
 * nearly every accessibility fix and labelling those would teach people the
 * label means nothing. So the one direction that matters was held up entirely by
 * whoever happened to be reading the diff. Sentinel filed it on DREAMCRM-49 as
 * the last remaining way to weaken a required check with nobody seeing it
 * (docs/RELEASE.md Part 5), and specified the instrument: read each entry's
 * value on `origin/main`, fail any increase, and give the rare legitimate raise
 * a written opt-out.
 *
 * This is the other half of the headroom table (#573). That made the SHRINK side
 * visible — every ceiling with room left in it, named at the end of every
 * browser run. This makes the RAISE side impossible to take quietly.
 *
 * FOUR THINGS ARE PINNED HERE and each of them is a way this guard could be
 * alive and useless:
 *
 *  1. **The comparison.** Every (stop, rule) on either side, with an absent
 *     entry read as ZERO — because that is the baseline's own rule, and a raise
 *     spelled as a brand-new line is the shape that does not look like editing a
 *     number.
 *  2. **The parser tells the truth about the file it parses.** It is the only
 *     way to read `origin/main`'s copy, which exists as a blob and not a module.
 *     A parser that silently stopped understanding the format would report main
 *     as empty and fail everything, or — one sign flip away — pass everything.
 *     So it is run against the file on disk and deep-equalled against the real
 *     imported object.
 *  3. **The opt-out cannot rot.** `CEILING_RAISES` entries are re-checked
 *     against the live baseline: the moment the ceiling an entry describes moves
 *     (which is what a fix landing looks like), the entry is pardoning something
 *     that is no longer there and `test` goes red until it is deleted. Three of
 *     this repo's four dead-exemption detectors ask only whether an exemption
 *     still MATCHES; not one asks whether its REASON still holds (#587). This
 *     one asks.
 *  4. **`origin/main` is actually fetched.** `actions/checkout@v4` on a
 *     `pull_request` fetches the merge ref and nothing else, so without an
 *     explicit fetch step this guard would have no previous value to read — in
 *     the one check it exists to defend, and nowhere else. Every workflow job
 *     that runs `pnpm test` is required to fetch first, derived from the
 *     workflow directory rather than from a list somebody keeps up to date.
 */

const ROOT = process.cwd()
const BASELINE_FILE = 'e2e/axe-baseline.ts'
const BASE_REF = 'origin/main'

/** GitHub Actions sets both; either is enough to mean "this run is the gate". */
const IN_CI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS)

/**
 * Events that, in this repo, only ever run a tree that is ALREADY on main:
 * `deploy.yml` fires on `push` to main, and `nightly.yml` on `schedule`, which
 * GitHub runs only from the default branch. Both absent locally, which is
 * correct — a local run is neither.
 *
 * The honest property is "HEAD is already on main", not the event name. It
 * cannot be tested directly with the history these jobs fetch, and this list is
 * the proxy that stands in for it — see `comparisonIsVacuous` for why this
 * particular proxy beats the two that look more principled.
 */
const ON_MAIN_EVENT = ['push', 'schedule'].includes(process.env.GITHUB_EVENT_NAME ?? '')

/**
 * Whether grading this tree against `origin/main` can tell us anything.
 *
 * THE EVENT NAME IS A PROXY, AND IT IS THE RIGHT ONE HERE — which is worth
 * saying out loud, since `docs/GUARD-MUTATION-PASS.md` tells you to assert the
 * answer rather than a proxy for it. Both better-looking alternatives are worse:
 *
 *  - **HEAD equals the ref.** Reads like the real property and fails at the one
 *    case that motivated this: in the race, HEAD is on main but BEHIND the ref
 *    we just fetched, so the two differ precisely when the comparison is
 *    actively false rather than merely vacuous. It also silently disables local
 *    grading for anyone with uncommitted edits on `main` — which is this repo's
 *    documented way of working, so that is most local runs.
 *  - **HEAD is an ancestor of the ref.** This IS the property, and it covers
 *    every case including the race. It needs `git merge-base`, which needs
 *    shared history, which every job discards with `--depth=1`. Deepening the
 *    fetch to buy it is an open trade (see the block comment below), not an
 *    oversight.
 *
 * Known gap, left open deliberately: a `workflow_dispatch` on `main` still
 * compares, and is vacuous. No event-name list can tell it from a dispatch on a
 * branch, where the comparison is real and wanted, and a manual dispatch is
 * attended by definition — so the failure mode is a human seeing one confusing
 * red, not an unattended gate lying.
 */
function comparisonIsVacuous(): boolean {
  return ON_MAIN_EVENT
}

/** `e2e/axe-baseline.ts` as `origin/main` has it, or `null` if that ref is not here. */
function baselineSourceOnMain(): string | null {
  try {
    return execFileSync('git', ['show', `${BASE_REF}:${BASELINE_FILE}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return null
  }
}

/** A well-formed opt-out, for the fixtures to vary one field of at a time. */
function raise(over: Partial<CeilingRaise> = {}): CeilingRaise {
  return {
    stop: 'portal: billing, a balance waiting to be paid',
    rule: 'color-contrast',
    from: 0,
    to: 1,
    date: '2026-09-14',
    ref: 'DREAMCRM-33',
    why:
      'A new spec walks this stop for the first time, so its violations are pre-existing portal UI ' +
      'defects the scan REVEALED rather than anything this change introduced: #968f88 on #faf7f2 at ' +
      '12px measures 2.98:1 against a 4.5 floor, and it is the same muted ink every other portal stop ' +
      'already carries. Handed to the UI lane with the colours.',
    ...over,
  }
}

describe('the baseline parser', () => {
  it('reads e2e/axe-baseline.ts exactly as the module system does', () => {
    // THE LOAD-BEARING TEST. Everything else here compares two parses, and two
    // parses of the same broken parser agree perfectly. This is the only
    // assertion that ties the text reading to the real object, and it is what
    // makes a format change fail by name instead of turning the ratchet off.
    expect(
      parseBaseline(readFileSync(join(ROOT, BASELINE_FILE), 'utf8')),
      `Parsing ${BASELINE_FILE} as text no longer agrees with importing it. The ratchet can only ` +
        `read origin/main's copy as text — it is a blob, not a module — so a parser that has fallen ` +
        `behind the file's format stops being able to tell you what the ceilings used to be, and ` +
        `says nothing about it.`,
    ).toEqual(A11Y_BASELINE)
  })

  it('is not fooled by comments, quotes or apostrophes inside the literal', () => {
    // The real file carries a comment INSIDE the object and prose full of
    // apostrophes and backticks above it — the exact characters a regex-based
    // stripper mistakes for string delimiters.
    const source = [
      "/** A header with an apostrophe in it: don't, and a 'quoted' aside. */",
      '// export const A11Y_BASELINE: Record<string, Record<string, number>> = { decoy: { rule: 9 } }',
      'export const A11Y_BASELINE: Record<string, Record<string, number>> = {',
      "  'auth: sign-in showing the failure alert': { 'color-contrast': 1 }, // a trailing note",
      '  // NO `portal:` STOP APPEARS HERE ANY MORE — nine entries left in batch 62.',
      "  /* a block comment with a } brace in it */",
      "  'staff: the day agenda': { 'color-contrast': 1 },",
      '}',
    ].join('\n')

    expect(parseBaseline(source)).toEqual({
      'auth: sign-in showing the failure alert': { 'color-contrast': 1 },
      'staff: the day agenda': { 'color-contrast': 1 },
    })
  })

  it('reads an empty baseline as empty — the end state of the burn-down', () => {
    expect(
      parseBaseline('export const A11Y_BASELINE: Record<string, Record<string, number>> = {}'),
    ).toEqual({})
  })

  it('THROWS rather than guessing when the file stops looking like itself', () => {
    // Each of these would otherwise parse to `{}` — which reads as "main had no
    // ceilings", i.e. every current ceiling is a raise, or (with the comparison
    // written the other way round) nothing is. Silence is the one answer a
    // ratchet cannot survive.
    expect(() => parseBaseline('export const SOMETHING_ELSE = {}')).toThrow(
      /could not find `export const A11Y_BASELINE`/,
    )
    expect(() => parseBaseline('export const A11Y_BASELINE = Object.freeze({ ...LEGACY })')).toThrow(
      /does not understand/,
    )
    expect(() =>
      parseBaseline("export const A11Y_BASELINE = { 'staff: x': { 'color-contrast': COUNT } }"),
    ).toThrow(/does not understand/)
    expect(() => parseBaseline("export const A11Y_BASELINE = { 'staff: x': { 'r': 1 }")).toThrow(
      /unbalanced braces/,
    )
    // A PREFIX IS NOT A NAME, and this one was found by a red run that came
    // back GREEN. The marker was matched with `indexOf`, so renaming the export
    // to `A11Y_BASELINE_V2` and aliasing it still matched — the parser read the
    // old literal and reported success. Same family as the `\b` traps in
    // docs/GUARD-MUTATION-PASS.md.
    expect(() =>
      parseBaseline("export const A11Y_BASELINE_V2 = { 'staff: x': { 'color-contrast': 1 } }"),
    ).toThrow(/could not find/)
  })
})

describe('the ratchet', () => {
  const main: Baseline = {
    'auth: sign-in showing the failure alert': { 'color-contrast': 1 },
    'staff: website hub, site published': { 'color-contrast': 3 },
  }

  it('says nothing when nothing moved', () => {
    expect(checkRatchet({ previous: main, current: main, raises: [] })).toEqual([])
  })

  it('says nothing when a ceiling comes down, or an entry leaves entirely', () => {
    expect(
      checkRatchet({
        previous: main,
        current: { 'staff: website hub, site published': { 'color-contrast': 2 } },
        raises: [],
      }),
      'shrinking is the expected end of every accessibility fix and needs no permission at all',
    ).toEqual([])
  })

  it('fails a ceiling that goes up', () => {
    const findings = checkRatchet({
      previous: main,
      current: { ...main, 'staff: website hub, site published': { 'color-contrast': 4 } },
      raises: [],
    })

    expect(findings).toEqual([
      {
        kind: 'unauthorised-raise',
        stop: 'staff: website hub, site published',
        rule: 'color-contrast',
        from: 3,
        to: 4,
      },
    ])
  })

  it('fails a BRAND-NEW entry, because an unlisted pair tolerates zero', () => {
    // The likeliest shape of the defect, and the one a diff reads most kindly:
    // it does not look like editing a number, it looks like adding a line.
    const findings = checkRatchet({
      previous: main,
      current: { ...main, 'staff: the day agenda': { 'color-contrast': 2 } },
      raises: [],
    })

    expect(findings).toEqual([
      { kind: 'unauthorised-raise', stop: 'staff: the day agenda', rule: 'color-contrast', from: 0, to: 2 },
    ])
    expect(
      formatFindings(findings),
      'the message has to say WHY a new line is a raise, or the author reads the failure as a bug',
    ).toContain('an unlisted (stop, rule) tolerates ZERO')
  })

  it('fails a NEW RULE at a stop that already carries debt', () => {
    const findings = checkRatchet({
      previous: main,
      current: {
        ...main,
        'auth: sign-in showing the failure alert': { 'color-contrast': 1, label: 2 },
      },
      raises: [],
    })

    expect(findings.map((f) => f.kind)).toEqual(['unauthorised-raise'])
  })

  it('allows exactly the raise its opt-out describes', () => {
    const entry = raise({ stop: 'staff: the day agenda', from: 0, to: 2 })

    expect(
      checkRatchet({
        previous: main,
        current: { ...main, 'staff: the day agenda': { 'color-contrast': 2 } },
        raises: [entry],
      }),
    ).toEqual([])
  })

  it('does not round in the author’s favour when the raise overshoots the entry', () => {
    const entry = raise({ stop: 'staff: the day agenda', from: 0, to: 2 })
    const findings = checkRatchet({
      previous: main,
      current: { ...main, 'staff: the day agenda': { 'color-contrast': 5 } },
      raises: [entry],
    })

    expect(findings.map((f) => f.kind)).toEqual(['raise-not-as-written'])
    expect(formatFindings(findings)).toContain('authorises 0 → 2')
  })

  it('carries a landed raise quietly, and fails it the moment its premise expires', () => {
    const entry = raise({ stop: 'staff: the day agenda', from: 0, to: 2 })
    const landed = { ...main, 'staff: the day agenda': { 'color-contrast': 2 } }

    // The PR after the raise merges: main and the tree agree, nothing moved.
    expect(checkRatchet({ previous: landed, current: landed, raises: [entry] })).toEqual([])

    // And the PR that fixes the defect: the ceiling comes down, so the entry is
    // now arguing about a tree that has moved. THIS is the assertion the other
    // three dead-exemption detectors in this repo do not have — they ask only
    // whether an allowance still matches something, never whether its reason
    // still holds, which is how an allowance outlives its subject.
    const shrunk = { ...main, 'staff: the day agenda': { 'color-contrast': 1 } }
    const findings = checkRatchet({ previous: landed, current: shrunk, raises: [entry] })

    expect(findings).toEqual([{ kind: 'dead-raise', entry, actual: 1 }])
    expect(formatFindings(findings)).toContain('Delete the entry')
  })

  it('fails an entry whose stop has left the baseline entirely', () => {
    const entry = raise({ stop: 'staff: the day agenda', from: 0, to: 2 })
    const findings = checkRatchet({ previous: main, current: main, raises: [entry] })

    expect(findings).toEqual([{ kind: 'dead-raise', entry, actual: 0 }])
  })

  it('refuses an opt-out that does not meet the bar, and authorises nothing on it', () => {
    const current = { ...main, 'staff: the day agenda': { 'color-contrast': 2 } }
    const cases: Array<[string, Partial<CeilingRaise>, RegExp]> = [
      ['a shrug for a reason', { why: 'flaky page' }, new RegExp(`at least ${MIN_WHY_LENGTH}`)],
      ['no issue or PR behind it', { ref: '  ' }, /ref is empty/],
      ['a date nobody can order', { date: 'last tuesday' }, /must be YYYY-MM-DD/],
      ['a "raise" that is really a shrink', { from: 3, to: 2 }, /must be greater than from/],
      ['a fractional ceiling', { to: 2.5 }, /whole number/],
    ]

    for (const [label, over, message] of cases) {
      const entry = raise({ stop: 'staff: the day agenda', from: 0, to: 2, ...over })
      const findings = checkRatchet({ previous: main, current, raises: [entry] })

      expect(findings.map((f) => f.kind), label).toEqual(['malformed-raise', 'unauthorised-raise'])
      expect(formatFindings(findings), label).toMatch(message)
    }
  })

  it('refuses two entries for one pair — the second could never be checked', () => {
    const first = raise({ stop: 'staff: the day agenda', from: 0, to: 2 })
    const second = raise({ stop: 'staff: the day agenda', from: 0, to: 9 })
    const findings = checkRatchet({
      previous: main,
      current: { ...main, 'staff: the day agenda': { 'color-contrast': 9 } },
      raises: [first, second],
    })

    expect(findings.map((f) => f.kind)).toEqual(['malformed-raise', 'raise-not-as-written'])
  })
})

describe('the live baseline against origin/main', () => {
  /**
   * WHY THIS IS TWO TESTS, AND ONLY ONE OF THEM IS SCOPED.
   *
   * The PREMISE — `origin/main` is here to be read — is asserted on every
   * event, `push` and `schedule` included. A premise checked on only some
   * events is not pinned, and the fetch step exists precisely so this never
   * depends on what `actions/checkout` happens to do per event type. Nothing
   * below skips it.
   *
   * The COMPARISON is skipped when the tree is ALREADY ON MAIN, and it costs no
   * coverage: there HEAD is main, so the comparison grades main against itself
   * and has nothing to add. Every tree that reaches main was already graded by
   * this same test on its own PR, with the ref present and asserted.
   *
   * That covers `deploy.yml`'s push job and BOTH `nightly.yml` jobs, since
   * GitHub runs `schedule` only from the default branch. `comparisonIsVacuous`
   * says how it decides, which case it knowingly leaves open, and why the two
   * more principled-looking tests are both worse.
   *
   * What skipping BUYS is a false red on the deploy path. `deploy.yml` runs
   * `test` without `cancel-in-progress` on purpose (the DREAMCRM-46 comment
   * block explains why, and it is right), so merges X then Y run overlapping
   * `test` jobs. The fetch step in run-for-X lands ~30–60s in. If Y merges
   * inside that window and Y SHRINKS a ceiling — the baseline moved in 10 of
   * the last 90 PRs — run-for-X reads `origin/main` as Y and grades X's tree
   * against a ceiling that came down after X was written. That reports RAISED
   * on a tree that raised nothing: `test` red, `deploy` skipped, on a push run,
   * telling nobody in particular to update a branch that no longer exists. It
   * is self-healing (Y's own deploy carries X forward) and rare, but this repo
   * reads a red `test` on main as a real regression, and a guard that cries
   * wolf on the deploy path is a guard someone eventually routes around.
   *
   * The nightly jobs carry the IDENTICAL race at lower stakes — a dismissed
   * alarm rather than a skipped deploy — which is why they are covered by the
   * same clause rather than left as a known-and-tolerated case.
   *
   * Not fixed by comparing against `git merge-base origin/main HEAD` instead,
   * which would also close the stale-branch false red this guard honestly does
   * not close: merge-base needs shared history and every workflow fetches
   * `--depth=1`. Deepening the fetch on all four jobs to buy that is a trade
   * worth making deliberately, not inside this PR.
   */

  it(`can read ${BASELINE_FILE} on ${BASE_REF}`, () => {
    // NOT a quiet pass, and NOT scoped by event. In CI a missing ref is the
    // guard being unable to do its one job, which is exactly the state it
    // exists to make impossible — see the workflow pin below for the step that
    // keeps the ref present.
    if (baselineSourceOnMain()) return

    expect(
      IN_CI,
      `\`git show ${BASE_REF}:${BASELINE_FILE}\` failed, so there is nothing to ratchet against. ` +
        `Every workflow that runs \`pnpm test\` is supposed to run \`${FETCH_MAIN_COMMAND}\` first ` +
        `— on a pull_request, actions/checkout fetches the merge ref and nothing else, so ` +
        `${BASE_REF} does not exist without it. If that step is still there, the fetch failed.`,
    ).toBe(false)
    console.warn(
      `[axe-ratchet] ${BASE_REF} is not in this checkout. Run \`${FETCH_MAIN_COMMAND}\` ` +
        `to grade your ceilings locally; CI does it for you and will not skip.`,
    )
  })

  it('has no ceiling higher than the one on main, and no expired opt-out', () => {
    if (comparisonIsVacuous()) {
      // See the block comment above: this tree is already on main, so the
      // comparison grades main against itself — vacuous when it wins the race
      // with a concurrent merge, and a false red when it loses. The premise it
      // rests on is still asserted, by the test above, on this very run.
      console.warn(
        `[axe-ratchet] comparison skipped: this tree is already on main, so there is no previous ` +
          `value to ratchet against. Every tree here was graded on its own PR.`,
      )
      return
    }

    const source = baselineSourceOnMain()
    if (!source) return // already failed (in CI) or warned (locally), just above

    const findings = checkRatchet({
      previous: parseBaseline(source, `${BASE_REF}:${BASELINE_FILE}`),
      current: A11Y_BASELINE,
    })

    expect(
      formatFindings(findings),
      `${BASELINE_FILE} is a RATCHET: its numbers only ever go down, and an unlisted (stop, rule) ` +
        `tolerates zero. Raising a ceiling to clear a violation is weakening a failing test — fix ` +
        `the defect and shrink the entry instead. If this really is a stop nothing had ever ` +
        `scanned, and the violations were already live, write the argument down in ` +
        `e2e/axe-baseline-raises.ts (which is on the review gate, so Sentinel sees it).\n` +
        `If main has moved under you since you branched, update your branch and re-run.`,
    ).toBe('')
  })
})

describe('every workflow that runs the suite fetches main first', () => {
  // Derived from the workflow directory rather than from a list: a new job that
  // runs `pnpm test` without the fetch would otherwise run this guard in its
  // skipped-and-silent shape, which is the failure mode the whole file argues
  // against. `e2e-flaky-summary.test.ts` pins its reporter across three
  // workflows for the same reason and had to be widened once to get there.
  //
  // WHICH PROPERTY THIS PIN LEANS ON — read before widening the regex. This
  // census is deliberately imperfect in two known ways, and BOTH are survivable
  // only because a missing `origin/main` FAILS rather than skips:
  //
  //  - `RUNS_SUITE` matches a `run:` line, so a job invoking the suite inside a
  //    `run: |` block is invisible here — including to the `toEqual([...])`
  //    assertion that exists to catch a pattern which has stopped matching.
  //  - `fetches`/`runs` are counted per FILE, not per job, so a job with a
  //    fetch and no suite run donates a spare count to a later job in the same
  //    file with a suite run and no fetch. Nothing in the tree does this today.
  //    Nothing stops it either.
  //
  // Under fail-on-missing, a job this census fails to cover goes red AT RUNTIME
  // with the ref-missing message, which is a bad afternoon and a clear one.
  // Under skip-on-missing, both holes would be silent, and the guard would be
  // off in exactly the job nobody checked. If you ever make the live comparison
  // skip when the ref is absent, these two gaps stop being survivable and this
  // census has to become exact first.
  const WORKFLOWS = readdirSync(join(ROOT, '.github/workflows'))
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()

  const RUNS_SUITE = /^\s+run: pnpm test\b/
  const files = WORKFLOWS.map((name) => ({
    name,
    lines: readFileSync(join(ROOT, '.github/workflows', name), 'utf8').split('\n'),
  }))
  const suiteFiles = files.filter(({ lines }) => lines.some((l) => RUNS_SUITE.test(l)))

  it('finds the workflows that run it at all', () => {
    // If this list ever empties, every `it.each` below silently stops running.
    expect(
      suiteFiles.map((f) => f.name),
      'no workflow appears to run `pnpm test` any more, which is either a very large change or a ' +
        'pattern that has stopped matching. Either way the assertions below are now vacuous.',
    ).toEqual(['ci.yml', 'deploy.yml', 'nightly.yml'])
  })

  it.each(suiteFiles.map((f) => f.name))('%s fetches main before every suite run', (name) => {
    const { lines } = suiteFiles.find((f) => f.name === name)!
    let fetches = 0
    let runs = 0
    for (const line of lines) {
      if (line.includes(FETCH_MAIN_REFSPEC)) fetches++
      if (!RUNS_SUITE.test(line)) continue
      runs++
      expect(
        fetches,
        `.github/workflows/${name} runs \`pnpm test\` ${runs} time(s) but has only fetched ${BASE_REF} ` +
          `${fetches} time(s) by that point. Each job needs its own \`${FETCH_MAIN_COMMAND}\` step ` +
          `after its checkout — a job without one runs the axe ratchet against a ref that is not ` +
          `there, and a guard that cannot read the previous value cannot enforce anything.`,
      ).toBeGreaterThanOrEqual(runs)
    }
    expect(runs, `expected .github/workflows/${name} to run the suite`).toBeGreaterThan(0)
  })
})

describe('every JOB that runs the suite can actually see main', () => {
  /**
   * THE ASSERTION THAT WOULD HAVE PREVENTED THE 2026-09-23 DEPLOY BLOCK.
   *
   * The census above asks whether a fetch-of-main STEP appears before each
   * `pnpm test`. It did, in every job, correctly spelled — and on a `push`
   * event it transferred nothing, because `actions/checkout` had already left
   * main at depth 1 with its tip equal to the remote tip. `origin/main`
   * resolved with one commit, `rulebook-state.test.ts`'s eyes-floor fired,
   * and `deploy.yml`'s `test` job went red on every push to main, which
   * `deploy: needs: test` turns into a blocked production deploy.
   *
   * Two things make this the right shape for the fix:
   *
   *  - it is PER JOB, which closes the per-file imprecision the census above
   *    documents and never closed;
   *  - it is STATIC. The dynamic half (the eyes-floor) can only fail where
   *    the bad state actually occurs, and that is on `main` AFTER the merge —
   *    the most expensive place to find out. This one fails on the PR.
   */
  const WORKFLOW_FILES = readdirSync(join(ROOT, '.github/workflows'))
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .sort()

  const suiteJobs = WORKFLOW_FILES.flatMap((name) =>
    splitJobs(readFileSync(join(ROOT, '.github/workflows', name), 'utf8'))
      .filter((job) => job.lines.some((l) => /^\s+run: pnpm test\b/.test(l)))
      .map((job) => ({ file: name, job })),
  )

  it('finds the jobs that run it at all', () => {
    // Vacuity guard: if the splitter or the pattern stops matching, every
    // assertion below silently stops running.
    expect(suiteJobs.map((s) => `${s.file}:${s.job.name}`)).toEqual([
      'ci.yml:test',
      'deploy.yml:test',
      'nightly.yml:nightly-test',
      'nightly.yml:tz-canary',
    ])
  })

  it.each(suiteJobs.map((s) => `${s.file}:${s.job.name}`))(
    '%s checks out full history',
    (id) => {
      const { job } = suiteJobs.find((s) => `${s.file}:${s.job.name}` === id)!
      expect(
        job.lines.some((l) => l.trim() === CHECKOUT_FULL_HISTORY),
        `${id} runs \`pnpm test\` but its checkout does not set \`${CHECKOUT_FULL_HISTORY}\`. ` +
          'On a `push` event the fetch-main step below it is a NO-OP — the depth-1 tip already ' +
          'equals the remote tip — so `origin/main` resolves with one commit and every guard that ' +
          'reads main\'s history is blind. That is what blocked two production deploys on ' +
          '2026-09-23.',
      ).toBe(true)
    },
  )

  it.each(suiteJobs.map((s) => `${s.file}:${s.job.name}`))(
    '%s also fetches main into origin/main',
    (id) => {
      const { job } = suiteJobs.find((s) => `${s.file}:${s.job.name}` === id)!
      expect(
        job.lines.some((l) => l.includes(FETCH_MAIN_REFSPEC)),
        `${id} does not fetch ${BASE_REF}. Full history is not enough on its own — on a ` +
          '`pull_request` the checkout holds `refs/pull/N/merge` and `origin/main` is not a ref ' +
          'this clone has at all.',
      ).toBe(true)
    },
  )
})

describe('the opt-out list itself', () => {
  it('is empty, or every entry in it earns its place', () => {
    // An empty list is the ratchet working, and it is empty today. The branch
    // coverage lives in the fixtures above, on purpose: asserting `[]` here
    // proves nothing about whether the checks that police an entry still work,
    // which is the shape "a note saying a guard shipped is not a guard" warns
    // about. What this adds is that the LIVE list is graded by the same code.
    expect(checkRatchet({ previous: A11Y_BASELINE, current: A11Y_BASELINE }).map(formatOne)).toEqual([])
  })

  function formatOne(finding: Parameters<typeof formatFindings>[0][number]): string {
    return formatFindings([finding])
  }

  it('is reachable from the review gate, so a raise cannot merge unseen', () => {
    // The reason the opt-out is a separate file at all: `e2e/axe-baseline.ts`
    // is deliberately off the gate because shrinking it is routine, and a path
    // pattern cannot tell a shrink from a raise. Nothing shrinks a ceiling by
    // editing THIS file, so every diff touching it is a raise.
    // Asked of the CLASSIFIER, not of the file's text. The first version of
    // this grepped scripts/review-gate.mjs for the filename and passed with the
    // pattern deleted, because the name still appeared in a `why` and in a
    // comment — a proxy for the answer instead of the answer, which is the
    // exact shape §2 warns about ("assert what the reader actually gets").
    expect(
      gateFindings(['e2e/axe-baseline-raises.ts']).map((f: { id: string }) => f.id),
      'scripts/review-gate.mjs must put e2e/axe-baseline-raises.ts behind the review gate, or a ' +
        'deliberate weakening of a required check reaches main with a "merges on green" summary — ' +
        'the exact hole this guard was built to close, one file over.',
    ).toContain('check-definitions')
    expect(
      gateFindings([BASELINE_FILE]),
      `${BASELINE_FILE} must stay OFF the gate: shrinking a ceiling is the end of nearly every ` +
        'accessibility fix, and a queue that catches all of those is one people route around.',
    ).toEqual([])
    expect(CEILING_RAISES, 'CEILING_RAISES must stay an array the guard can read').toBeInstanceOf(Array)
  })
})
