import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  A11Y_HEADROOM_ANNOTATION,
  A11Y_NEEDS_REVIEW_ANNOTATION,
  foldHeadroom,
  foldNeedsReview,
  formatHeadroomTable,
  formatNeedsReviewTable,
  needsReviewFromAnnotations,
  scannedStops,
  NEEDS_REVIEW_TARGET_CAP,
  samplesFromAnnotations,
  type HeadroomSample,
  type NeedsReviewRule,
  type NeedsReviewSample,
} from '../../e2e/axe-headroom'

/**
 * THE CEILING-HEADROOM TABLE HAS TO STAY WIRED, AND HAS TO STAY POWERLESS.
 *
 * `e2e/axe-headroom.ts` prints one table at the end of the browser run naming
 * every axe ceiling that measured under itself — the case the `::warning` in
 * `e2e/axe.ts` deliberately stays quiet about, because its wobble allowance
 * means a ceiling exactly one too high produces no annotation at all. Four
 * ceilings stood a batch longer than they needed to for that reason.
 *
 * Two properties hold that up and NEITHER is visible from reading either file
 * alone:
 *
 *  1. IT IS WIRED. The emitter in `e2e/axe.ts` and the reader in the reporter
 *     have to agree on one annotation type, and the reporter has to be
 *     registered in `playwright.config.ts`. Break either and the failure is
 *     silent in the worst way — no table, no error, and a run that looks
 *     exactly like a run with no headroom to report. This is the same trap
 *     `tests/guards/e2e-flaky-summary.test.ts` exists for one lane over.
 *
 *  2. IT CANNOT GATE. It is attached to `e2e`, a required check. A reporting
 *     addition that grows the power to fail a run has changed what can merge,
 *     which is a policy change and routes to Forge — so the fold is pinned to
 *     be pure, and the reporter to have no assertion in it.
 *
 * Runs in the normal vitest suite, no browser: a broken wire should fail in the
 * two minutes before a merge rather than as a missing table nobody notices.
 */

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8')

const REPORTER_SRC = read('e2e/axe-headroom.ts')
const AXE_SRC = read('e2e/axe.ts')
const CONFIG_SRC = read('playwright.config.ts')

/**
 * The braced block that opens at `marker`, matched by counting braces.
 *
 * Not a regex, and not "everything up to the next `}`" — the branch this is
 * pointed at prints a template literal full of `${…}`, so the first closing
 * brace is four interpolations before the end of the block. Asking about the
 * nearest delimiter instead of the matching one is how the first draft of the
 * per-row `pending` rule (#559) reported CLEAN with both its defects live.
 */
function blockAfter(source: string, marker: string): string {
  const from = source.indexOf(marker)
  expect(from, `expected to find \`${marker}\` in the source under test`).toBeGreaterThan(-1)
  const open = source.indexOf('{', from)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1)
  }
  throw new Error(`unbalanced braces after \`${marker}\``)
}

/**
 * The named bindings `e2e/axe.ts` takes from `./axe-headroom`.
 *
 * WHY THIS IS A HELPER AND NOT A REGEX PER NAME. The first version of the
 * wiring assertion matched `import { A11Y_HEADROOM_ANNOTATION } from
 * './axe-headroom'` — a SINGLE-name import, spelled exactly. It was true for
 * as long as there was one thing to import and went red the moment
 * DREAMCRM-107 added a second, on a file that was importing the name
 * correctly. That is a false alarm, and §2's rule for one is to narrow the
 * PREDICATE to the property actually meant: the name arrives from that module
 * rather than being re-typed here. Reading the import CLAUSE says that for any
 * number of bindings and any formatting; the paired `not.toMatch` on a local
 * declaration closes the other half.
 */
const HEADROOM_IMPORT = (() => {
  const from = AXE_SRC.indexOf("} from './axe-headroom'")
  expect(from, 'e2e/axe.ts must import from ./axe-headroom at all').toBeGreaterThan(-1)
  const open = AXE_SRC.lastIndexOf('{', from)
  return AXE_SRC.slice(open, from + 1)
})()

describe('the axe headroom table stays wired', () => {
  it('playwright.config.ts registers the reporter in BOTH the CI and local lists', () => {
    const reporterBlock = CONFIG_SRC.slice(CONFIG_SRC.indexOf('reporter:'), CONFIG_SRC.indexOf('use: {'))
    const registrations = reporterBlock.match(/AXE_HEADROOM_REPORTER/g) ?? []
    expect(
      registrations.length,
      'playwright.config.ts must register the headroom reporter in the CI reporter list AND the ' +
        'local one. Dropping it from either is silent — the run just stops printing the table, ' +
        'which is indistinguishable from a run where every ceiling was tight.',
    ).toBe(2)
    expect(
      CONFIG_SRC,
      "playwright.config.ts must point AXE_HEADROOM_REPORTER at './e2e/axe-headroom.ts'.",
    ).toContain("const AXE_HEADROOM_REPORTER = './e2e/axe-headroom.ts'")
  })

  it('e2e/axe.ts emits under the type the reporter reads, imported rather than spelled twice', () => {
    expect(
      HEADROOM_IMPORT,
      'e2e/axe.ts must IMPORT A11Y_HEADROOM_ANNOTATION from ./axe-headroom. A second copy of the ' +
        'string is a rename away from an emitter and a reader that no longer agree, and neither ' +
        'side would say a word about it.',
    ).toContain('A11Y_HEADROOM_ANNOTATION')
    expect(
      AXE_SRC,
      'and it must not ALSO declare its own — an import beside a local const is the two-copies ' +
        'hazard wearing a passing import statement.',
    ).not.toMatch(/(?:const|let|var)\s+A11Y_HEADROOM_ANNOTATION\b/)
    expect(
      AXE_SRC,
      'e2e/axe.ts must push the annotation onto test.info().annotations — that is the only channel ' +
        'a worker process has to the reporter in the main process.',
    ).toContain('test.info().annotations.push(')
  })

  it('emits a sample for EVERY baselined rule at a stop, not only the ones the warning fires on', () => {
    // The fold can only rule a (stop, rule) out for having reached its ceiling
    // on SOME attempt if it is shown that attempt. An emitter that ran only
    // where the `::warning` runs would go quiet in precisely the case this
    // table was built for: a ceiling exactly one too high, which the wobble
    // allowance keeps the warning silent about.
    const loop = AXE_SRC.slice(
      AXE_SRC.indexOf('for (const [rule, ceiling] of Object.entries(allowed))'),
      AXE_SRC.indexOf('if (over.length === 0)'),
    )
    const emit = 'recordHeadroomSample({ stop, rule, ceiling, observed: now })'
    expect(loop, 'the headroom emit must live in the loop over every baselined rule').toContain(emit)
    expect(
      blockAfter(loop, 'if (now === 0'),
      'the headroom emit must sit OUTSIDE the ::warning branch. Inside it, the table falls silent ' +
        'in exactly the case it exists for — a ceiling one too high prints no warning at all.',
    ).not.toContain(emit)
  })
})

describe('foldHeadroom', () => {
  const sample = (stop: string, rule: string, ceiling: number, observed: number): HeadroomSample => ({
    stop,
    rule,
    ceiling,
    observed,
  })

  it('reports the WORST count any attempt saw, never the last and never the lowest', () => {
    const rows = foldHeadroom([
      sample('portal: agenda', 'nested-interactive', 10, 7),
      sample('portal: agenda', 'nested-interactive', 10, 8),
      sample('portal: agenda', 'nested-interactive', 10, 7),
    ])
    expect(rows).toHaveLength(1)
    // 8, not 7 — shrinking to a lucky low sample fails a required check on the
    // next run, on a page nobody changed.
    expect(rows[0].observed).toBe(8)
    expect(rows[0].headroom).toBe(2)
    expect(rows[0].attempts).toBe(3)
  })

  it('drops a pair that reached its ceiling on any single attempt', () => {
    const rows = foldHeadroom([
      sample('booking: confirmation', 'color-contrast', 2, 1),
      sample('booking: confirmation', 'color-contrast', 2, 2),
    ])
    expect(
      rows,
      'one attempt at the ceiling means there is no room in it, whatever the other attempts said',
    ).toEqual([])
  })

  it('keeps stops and rules apart, and sorts the most room first', () => {
    const rows = foldHeadroom([
      sample('marketing: home', 'color-contrast', 41, 40),
      sample('portal: agenda', 'nested-interactive', 10, 2),
      sample('portal: agenda', 'color-contrast', 5, 4),
    ])
    expect(rows.map((r) => `${r.stop}/${r.rule}=${r.headroom}`)).toEqual([
      'portal: agenda/nested-interactive=8',
      'marketing: home/color-contrast=1',
      'portal: agenda/color-contrast=1',
    ])
  })

  it('says nothing when every ceiling is tight', () => {
    expect(foldHeadroom([sample('smoke: sign in', 'label', 3, 3)])).toEqual([])
    expect(foldHeadroom([])).toEqual([])
  })
})

describe('samplesFromAnnotations', () => {
  it('reads our own annotations and ignores everything else', () => {
    const payload: HeadroomSample = { stop: 'portal: agenda', rule: 'label', ceiling: 4, observed: 1 }
    expect(
      samplesFromAnnotations([
        { type: 'skip', description: 'unrelated' },
        { type: A11Y_HEADROOM_ANNOTATION, description: JSON.stringify(payload) },
        { type: A11Y_HEADROOM_ANNOTATION },
        { type: A11Y_HEADROOM_ANNOTATION, description: 'not json at all' },
        { type: A11Y_HEADROOM_ANNOTATION, description: JSON.stringify({ stop: 'x' }) },
      ]),
    ).toEqual([payload])
  })
})

describe('the reporter cannot gate anything', () => {
  it('formatHeadroomTable returns text, and nothing else — no throw, no exit code', () => {
    const before = process.exitCode
    const table = formatHeadroomTable(
      foldHeadroom([{ stop: 'portal: agenda', rule: 'label', ceiling: 4, observed: 1 }]),
    )
    expect(table).toContain('| portal: agenda | `label` | 4 | 1 | **3** | 1 |')
    expect(table).toContain('Axe ceilings with room left in them')
    expect(process.exitCode, 'the headroom report must never touch the process exit code').toBe(before)
  })

  it('has no assertion in it', () => {
    // A table is reporting. The moment it can fail a run it has changed what
    // can merge, which is a policy change and routes to Forge (conventions §2).
    expect(
      REPORTER_SRC,
      'e2e/axe-headroom.ts must not import expect, throw, or set an exit code — it reports, it ' +
        'does not gate. `rulesOverBaseline` in e2e/axe.ts is the only thing that decides what fails.',
    ).not.toMatch(/\bexpect\(|\bthrow new |process\.exitCode\s*=|process\.exit\(/)
  })

  it('no table when there is no headroom — but the reporter still says so out loud', () => {
    expect(formatHeadroomTable([])).toBeNull()
    // A tight ratchet and a reporter that never ran produce identical silence,
    // and the second is the likelier bug. The first CI run of this reporter
    // printed no table because every ceiling really was tight, and nothing in
    // the log distinguished that from a broken wire.
    const quiet = REPORTER_SRC.slice(REPORTER_SRC.indexOf('onEnd()'))
    expect(
      quiet,
      'the reporter must distinguish "every ceiling is tight" from "nothing was measured" — ' +
        'silence that could mean either is the failure this whole file argues against.',
    ).toContain('no axe ceilings were measured in this run')
    expect(quiet).toContain('every measured ceiling is tight')
  })
})

/**
 * THE SECOND TABLE: WHAT AXE COULD NOT DECIDE (DREAMCRM-107).
 *
 * Same two properties as the headroom table above, for the same reasons, and
 * one of them is sharper here.
 *
 * IT IS WIRED — and the wire it needs is stranger than the headroom one,
 * because the emit fires at EVERY stop rather than only where there is
 * something to say. That is not verbosity: the only way an end-of-run table
 * can distinguish "axe decided everything" from "the emitter has come
 * unhooked" is if a clean stop still reports that it was scanned. Move the
 * emit inside the finding branch and both states collapse to the same silence,
 * which is §2a's standing rule (`every alarm ships with the thing that notices
 * it STOPPED`) failing in the quietest possible way.
 *
 * IT CANNOT GATE — and here the reason is on the merits rather than only on
 * policy. An `incomplete` result is axe declining to answer, not axe saying
 * no. Failing a required check on one would make `e2e` red for a question,
 * which is the "gate people have to interpret" `e2e/axe.ts` refuses in its own
 * header. The powerlessness assertion for the reporter covers this table too,
 * since it grades the whole file.
 */
describe('the needs-review table stays wired', () => {
  it('e2e/axe.ts emits under the type the reporter reads, imported rather than spelled twice', () => {
    expect(
      HEADROOM_IMPORT,
      'e2e/axe.ts must IMPORT A11Y_NEEDS_REVIEW_ANNOTATION from ./axe-headroom, for the same ' +
        'reason the headroom type is imported: a second copy of the string is a rename away from ' +
        'an emitter and a reader that no longer agree, and neither side would say a word.',
    ).toContain('A11Y_NEEDS_REVIEW_ANNOTATION')
    expect(
      AXE_SRC,
      'and it must not ALSO declare its own.',
    ).not.toMatch(/(?:const|let|var)\s+A11Y_NEEDS_REVIEW_ANNOTATION\b/)
    expect(
      AXE_SRC,
      'e2e/axe.ts must push the needs-review annotation onto test.info().annotations.',
    ).toContain('type: A11Y_NEEDS_REVIEW_ANNOTATION,')
  })

  it('reads axe incomplete results at all — the defect this class exists for', () => {
    // THE ORIGINAL DEFECT, PINNED. `findA11yResults` destructured
    // `const { violations }` and dropped the rest, so a node axe could not
    // decide about reached nothing: not a ceiling, not a log line, not a
    // table. Text over a gradient is reported that way, which made every stop
    // in the suite silent about a whole category by construction.
    //
    // Asserted on the destructure rather than on a downstream absence, because
    // an absence is exactly what the defect looks like from every other angle.
    expect(
      AXE_SRC,
      'e2e/axe.ts must read `incomplete` off the axe result. Dropping it restores the ledger S3 ' +
        'defect: every stop reports clean about text over a gradient, at a ceiling of zero, ' +
        'forever.',
    ).toContain('const { violations, incomplete } = await builder.analyze()')
  })

  it('emits a sample at EVERY stop, not only where something needed review', () => {
    // The load-bearing half. The emit must sit OUTSIDE the branch that reports
    // a finding, or the reporter's "nothing was measured" line becomes
    // unreachable and its "axe decided everything" line becomes a lie.
    const body = AXE_SRC.slice(
      AXE_SRC.indexOf('const needsReview = summariseNeedsReview(incomplete)'),
      AXE_SRC.indexOf('const WOBBLE = 1'),
    )
    const emit = 'recordNeedsReviewSample({ stop, rules: needsReview })'
    expect(body, 'the needs-review emit must run at the stop').toContain(emit)
    expect(
      blockAfter(body, 'if (needsReview.length > 0)'),
      'the needs-review emit must sit OUTSIDE the reporting branch. Inside it, a run where axe ' +
        'decided everything and a run where this emitter is unhooked produce identical silence ' +
        'in the end-of-run table — and the second is the likelier bug.',
    ).not.toContain(emit)
  })

  it('the emitter and the reporter agree on the selector cap', () => {
    // `NEEDS_REVIEW_TARGET_CAP` is what makes a row readable; a second copy in
    // e2e/axe.ts would let the two drift into rows that claim a cap the table
    // does not apply.
    expect(AXE_SRC, 'the target cap must be imported, not re-typed').toContain(
      'NEEDS_REVIEW_TARGET_CAP',
    )
    expect(AXE_SRC).not.toMatch(/const NEEDS_REVIEW_TARGET_CAP\s*=/)
  })
})

describe('foldNeedsReview', () => {
  const sample = (stop: string, rules: NeedsReviewRule[]): NeedsReviewSample => ({ stop, rules })
  const rule = (r: string, nodes: number, targets: string[] = []): NeedsReviewRule => ({
    rule: r,
    nodes,
    targets,
  })

  it('reports the WORST count any attempt saw, and unions the elements', () => {
    // Same direction as foldHeadroom, same argument: a retry that landed
    // before a gradient painted must not erase what the first attempt saw.
    const rows = foldNeedsReview([
      sample('token: grade report', [rule('color-contrast', 3, ['#a', '#b'])]),
      sample('token: grade report', [rule('color-contrast', 5, ['#c'])]),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].nodes).toBe(5)
    expect(rows[0].attempts).toBe(2)
    expect(rows[0].targets).toEqual(['#a', '#b', '#c'])
  })

  it('caps the elements it names without capping the count', () => {
    const rows = foldNeedsReview([
      sample('s', [rule('color-contrast', 9, ['#a', '#b'])]),
      sample('s', [rule('color-contrast', 9, ['#c', '#d'])]),
    ])
    expect(rows[0].targets).toHaveLength(NEEDS_REVIEW_TARGET_CAP)
    expect(rows[0].nodes, 'a capped row still says how much it stands for').toBe(9)
  })

  it('keeps stops and rules apart, worst first', () => {
    const rows = foldNeedsReview([
      sample('a', [rule('color-contrast', 2), rule('aria-hidden-focus', 7)]),
      sample('b', [rule('color-contrast', 4)]),
    ])
    expect(rows.map((r) => `${r.stop}/${r.rule}=${r.nodes}`)).toEqual([
      'a/aria-hidden-focus=7',
      'b/color-contrast=4',
      'a/color-contrast=2',
    ])
  })

  it('a run of clean stops folds to nothing — which is not the same as no run', () => {
    // The distinction the whole emit-always design exists for. Both of these
    // fold to zero rows; only the reporter can tell them apart, and it does it
    // by counting SAMPLES rather than rows.
    expect(foldNeedsReview([sample('a', []), sample('b', [])])).toEqual([])
    expect(foldNeedsReview([])).toEqual([])
  })
})

describe('needsReviewFromAnnotations', () => {
  it('reads our own annotations and ignores everything else', () => {
    const payload: NeedsReviewSample = {
      stop: 'token: grade report',
      rules: [{ rule: 'color-contrast', nodes: 2, targets: ['#a'] }],
    }
    expect(
      needsReviewFromAnnotations([
        { type: A11Y_HEADROOM_ANNOTATION, description: '{"stop":"x","rule":"y","ceiling":1,"observed":0}' },
        { type: A11Y_NEEDS_REVIEW_ANNOTATION, description: JSON.stringify(payload) },
        { type: A11Y_NEEDS_REVIEW_ANNOTATION },
        { type: A11Y_NEEDS_REVIEW_ANNOTATION, description: 'not json at all' },
        { type: A11Y_NEEDS_REVIEW_ANNOTATION, description: JSON.stringify({ stop: 'no rules key' }) },
      ]),
    ).toEqual([payload])
  })

  it('keeps an EMPTY sample rather than dropping it', () => {
    // A clean stop's sample is the whole basis of the "nothing was measured"
    // line. A tolerant parser that skipped it would delete the signal at the
    // reading end instead of the writing end.
    expect(
      needsReviewFromAnnotations([
        { type: A11Y_NEEDS_REVIEW_ANNOTATION, description: JSON.stringify({ stop: 's', rules: [] }) },
      ]),
    ).toEqual([{ stop: 's', rules: [] }])
  })
})

describe('the needs-review table cannot gate anything', () => {
  it('formatNeedsReviewTable returns text, and says out loud that it gates nothing', () => {
    const before = process.exitCode
    const table = formatNeedsReviewTable(
      foldNeedsReview([
        { stop: 'token: grade report', rules: [{ rule: 'color-contrast', nodes: 4, targets: ['#a'] }] },
      ]),
    )
    expect(table).toContain('| token: grade report | `color-contrast` | 4 | `#a` | 1 |')
    expect(table).toContain('Axe could not decide')
    // The sentence a reader needs most: a green run is not a claim about
    // anything in this table. Without it the table reads like a defect list
    // somebody forgot to fail on.
    expect(table).toContain('This table gates nothing')
    expect(process.exitCode, 'the needs-review report must never touch the exit code').toBe(before)
  })

  it('counts distinct STOPS in the all-clear line, not samples', () => {
    // A sample arrives per ATTEMPT and CI retries once, so a stop that failed
    // and retried contributes two. This is the line a reader uses to judge
    // whether the emitter is alive, so counting attempts would report broader
    // coverage than the run had. (Sentinel, reviewing #682.)
    const s = (stop: string): NeedsReviewSample => ({ stop, rules: [] })
    expect(scannedStops([s('portal: agenda'), s('portal: agenda'), s('marketing: home')])).toBe(2)
    expect(scannedStops([])).toBe(0)

    // And the reporter must use it rather than a `.length` beside it — the
    // whole point of extracting the function.
    const quiet = REPORTER_SRC.slice(REPORTER_SRC.indexOf('private reportNeedsReview('))
    expect(quiet).toContain('scannedStops(this.needsReview)')
    expect(
      quiet,
      'the all-clear line must not branch on how many SAMPLES arrived',
    ).not.toContain('this.needsReview.length')
  })

  it('no table when axe decided everything — but the reporter still says so out loud', () => {
    expect(formatNeedsReviewTable([])).toBeNull()
    const quiet = REPORTER_SRC.slice(REPORTER_SRC.indexOf('private reportNeedsReview('))
    expect(
      quiet,
      'the reporter must distinguish "axe decided everything" from "nothing was scanned" — the ' +
        'emitter fires at every stop precisely so those two are distinguishable here.',
    ).toContain('no stop reported whether axe could decide')
    expect(quiet).toContain('axe decided every node it saw')
  })

  it('one report falling over does not take the other with it', () => {
    // They answer different questions and are printed from onEnd in their own
    // try blocks. A single shared try would let a bug in either erase both
    // tables — the same "silence that could mean anything" this file refuses,
    // arriving through an exception instead of a bad wire.
    const onEnd = blockAfter(REPORTER_SRC, 'onEnd(): void')
    expect(onEnd).toContain('this.reportHeadroom()')
    expect(onEnd).toContain('this.reportNeedsReview()')
    expect(onEnd, 'onEnd must not do the work itself — each report owns its own try').not.toContain(
      'try {',
    )
  })
})
