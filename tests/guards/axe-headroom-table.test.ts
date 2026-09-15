import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  A11Y_HEADROOM_ANNOTATION,
  foldHeadroom,
  formatHeadroomTable,
  samplesFromAnnotations,
  type HeadroomSample,
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
      AXE_SRC,
      'e2e/axe.ts must IMPORT A11Y_HEADROOM_ANNOTATION from ./axe-headroom. A second copy of the ' +
        'string is a rename away from an emitter and a reader that no longer agree, and neither ' +
        'side would say a word about it.',
    ).toMatch(/import\s*\{\s*A11Y_HEADROOM_ANNOTATION\s*\}\s*from\s*'\.\/axe-headroom'/)
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
