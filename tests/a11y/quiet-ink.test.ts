import { describe, it, expect } from 'vitest'
import {
  bestCaseSurface,
  CHROME_FILES,
  CHROME_GROUND,
  chromeInkFindingsInSource,
  chromeInkSites,
  describeFinding,
  gradeChromeInkClasses,
  gradeQuietInkClasses,
  quietInkSites,
  scanForUnreadableChromeInk,
  scanForUnreadableQuietInk,
  UI_ROOTS,
} from './class-pairs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AA, contrast, DARK, LIGHT, ROOT, SURFACES, token, utilityColor } from './palette'

/**
 * THE QUIET INK GUARD — rule 6's gate and its red run.
 *
 * `./class-pairs.ts` carries the defect shape, the six axe findings it
 * produced, why the dark-mode parity rule structurally could not see any of
 * them, and what this rule deliberately leaves out. This file is the gate.
 *
 * IT HOLDS AT ZERO AND CARRIES NO CEILING, for the reason
 * `dark-mode-parity.test.ts` spells out at length: `e2e/axe-baseline.ts` is
 * already this repo's one inventory of contrast debt, and a second inventory
 * keyed by source location would overlap it with different keys — the first
 * time the two disagreed about whether something was fixed, neither would be
 * believed. It can afford zero because the batch that added it turned all 177
 * live instances the right way up in the same PR.
 */

/* ── the red run, kept permanently ───────────────────────────────────────── */

/**
 * A guard that has never been seen to fail has not been tested. §2d of the
 * conventions is blunt about it, and this repo has been bitten twice — batch
 * 57's brand-fill scan matched only the literal form of its defect and its red
 * run PASSED while the two worst instances, both conditional, were live.
 *
 * So these are not a token red run. Each is one way this scanner could be
 * wrong, and every one of them is a shape that was really in the tree:
 *
 *   1. the literal form — the upside-down pair as 164 places spelled it;
 *   2. the SPLIT form, the two halves separated by other utilities, which is
 *      how the remaining 13 were written and what a naive adjacent-string
 *      match would have missed entirely;
 *   3. THE CONDITIONAL FORM — inside a ternary branch, the shape that let the
 *      last source guard's red run pass;
 *   4. a pair reaching the named steps from the OTHER end (`gray-400`/
 *      `gray-600`), so the rule is grading the ratio rather than recognising
 *      one famous class string — this was live on three metadata separators;
 *   5. a light side that passes and a dark side that does not — the defect a
 *      person developing in light mode structurally cannot see, and the exact
 *      shape of the one real `dark:text-gray-500` typo this batch found; and
 *   6. its mirror, so the rule cannot be "fixed" by only ever looking at dark.
 */
const PLANTED: Array<{ why: string; classes: string }> = [
  { why: 'the literal upside-down pair', classes: 'text-xs text-gray-400 dark:text-gray-500 mr-0.5' },
  {
    why: 'the split form — the halves separated by other utilities',
    classes: 'rounded border border-gray-200 px-1.5 text-gray-400 dark:border-gray-700 dark:text-gray-500',
  },
  { why: 'the conditional form, inside a ternary branch', classes: 'text-gray-400 line-through dark:text-gray-500' },
  { why: 'a pair reaching a named step from the other end', classes: 'text-gray-400 dark:text-gray-600' },
  { why: 'light passes (6.91), dark does not (3.51)', classes: 'text-gray-600 dark:text-gray-500' },
  { why: 'dark passes (11.95), light does not (2.63)', classes: 'text-gray-400 dark:text-gray-300' },
]

/** Shapes that must NOT be reported — the false positives a blunter rule makes. */
const INNOCENT: Array<{ why: string; classes: string }> = [
  { why: 'the design system’s own spelling, the right way up', classes: 'text-xs text-gray-500 dark:text-gray-400' },
  { why: 'a bare light-only ink — the residual rule 6 leaves to the punch list', classes: 'text-xs text-gray-400' },
  { why: 'a bare dark-only override', classes: 'text-xs dark:text-gray-500' },
  {
    why: 'a coloured tone, which TONE_TEXT answers for rather than this rule',
    classes: 'text-amber-800 dark:text-amber-300',
  },
  {
    why: 'an element that brings its own surface — rule 1 grades this one',
    classes: 'bg-white text-gray-400 dark:text-gray-500',
  },
  {
    why: 'a wash, whose real background is a composite this scanner cannot resolve',
    classes: 'text-gray-400/70 dark:text-gray-500',
  },
  {
    why: 'variant-prefixed steps — a hover is not the settled colour a person reads',
    classes: 'text-gray-500 hover:text-gray-400 dark:text-gray-400 dark:hover:text-gray-500',
  },
  {
    why: 'a pair touching neither named step — chrome, not body ink (see rule 6’s header)',
    classes: 'text-gray-300 dark:text-gray-600',
  },
]

describe('quiet ink — the red run', () => {
  it.each(PLANTED)('reports $why', ({ classes }) => {
    const graded = gradeQuietInkClasses(classes)
    expect(graded, `"${classes}" should have been reported`).not.toBeNull()
    expect(graded!.failures.length).toBeGreaterThan(0)
    for (const f of graded!.failures) expect(f.ratio).toBeLessThan(AA)
  })

  it.each(INNOCENT)('leaves $why alone', ({ classes }) => {
    expect(gradeQuietInkClasses(classes), `"${classes}" should not have been reported`).toBeNull()
  })

  it('names the theme, the ink, the surface and the measured ratio', () => {
    const graded = gradeQuietInkClasses('text-gray-400 dark:text-gray-500')!
    const line = describeFinding({ file: 'x.tsx', line: 1, ...graded })
    expect(line).toContain('light: gray-400 on')
    expect(line).toContain('dark: gray-500 on')
    // Both themes, because the whole point of this pair is that it is wrong twice.
    expect(graded.failures.map((f) => f.theme).sort()).toEqual(['dark', 'light'])
  })
})

/* ── the rule's own inputs, derived rather than trusted ──────────────────── */

describe('quiet ink — the best-case surface', () => {
  it('is the lightest declared surface in light mode and the darkest in dark', () => {
    // Derived here the same way the rule derives it, but stated as the claim a
    // reader would want checked: no other surface in the theme is friendlier.
    for (const [theme, mode] of [
      [LIGHT, 'light'],
      [DARK, 'dark'],
    ] as const) {
      const best = bestCaseSurface(theme, mode)
      const ink = utilityColor(theme, 'gray-500')!
      const bestRatio = contrast(ink, token(theme, best))
      for (const s of SURFACES) {
        expect(
          contrast(ink, token(theme, s)),
          `${s} is friendlier than the "best case" ${best} in ${mode}`,
        ).toBeLessThanOrEqual(bestRatio + 1e-9)
      }
    }
  })

  it('makes the design system’s own line true, and its inverse false', () => {
    // DESIGN-SYSTEM.md §2.2: gray-500 lightest meaningful on white,
    // dark:gray-400 lightest on dark. The rule is only worth having if the
    // palette actually says that, so derive it rather than assert the prose.
    const lightBest = token(LIGHT, bestCaseSurface(LIGHT, 'light'))
    const darkBest = token(DARK, bestCaseSurface(DARK, 'dark'))

    expect(contrast(utilityColor(LIGHT, 'gray-500')!, lightBest)).toBeGreaterThanOrEqual(AA)
    expect(contrast(utilityColor(DARK, 'gray-400')!, darkBest)).toBeGreaterThanOrEqual(AA)
    // The NEGATIVE half — the cutoff is derived, not remembered.
    expect(contrast(utilityColor(LIGHT, 'gray-400')!, lightBest)).toBeLessThan(AA)
    expect(contrast(utilityColor(DARK, 'gray-500')!, darkBest)).toBeLessThan(AA)
  })
})

/* ── the gate ────────────────────────────────────────────────────────────── */

describe('quiet ink — the product', () => {
  it('still has two-sided neutral inks to look at (the rule is not narrowed to nothing)', () => {
    // A rule that matches nothing reports CLEAN forever. This is the field of
    // view, not the verdict: hundreds of elements declare a neutral ink in
    // both themes, and every one of them is graded below.
    expect(quietInkSites(UI_ROOTS).length).toBeGreaterThan(50)
  })

  it('has no neutral ink that misses AA on the best-case surface of its own theme', () => {
    const findings = scanForUnreadableQuietInk(UI_ROOTS)
    expect(findings.map(describeFinding), findings.map(describeFinding).join('\n')).toEqual([])
  })
})

/* ── rule 6b: the chrome ─────────────────────────────────────────────────── */

/**
 * The red run for rule 6b (`class-pairs.ts` carries the rule and why the
 * tree-wide bail does not apply to the shell). Each planted case is a shape
 * that was really in the chrome, or the mirror a blunter rule would get wrong.
 */
const PLANTED_6B: Array<{ why: string; classes: string }> = [
  { why: 'the disabled step as copy — the Add group’s module names', classes: 'text-ink-400 hover:bg-ink-900/[0.04] hover:text-ink-700' },
  { why: 'the same step on the gray ramp', classes: 'text-xs font-semibold uppercase tracking-wider text-gray-400' },
  { why: 'a gray step that is readable in light and fails the dark surface (the gray ramp does not invert)', classes: 'text-sm text-gray-500' },
]

const INNOCENT_6B: Array<{ why: string; classes: string }> = [
  { why: 'ink-500 — the readable step, in both themes, because the ink ramp inverts', classes: 'text-xs font-semibold text-ink-500' },
  { why: 'a two-sided pair — rule 6’s', classes: 'text-gray-500 dark:text-gray-400' },
  { why: 'a wash, whose real background this scanner cannot resolve', classes: 'fill-current text-gray-500/80' },
  { why: 'an element with its own surface — rules 1 and 7', classes: 'bg-white text-gray-400' },
  { why: 'a tone, which TONE_TEXT answers for', classes: 'text-amber-700 dark:text-amber-300' },
  { why: 'strong ink', classes: 'text-sm font-semibold text-ink-900' },
]

describe('quiet ink — rule 6b, the chrome', () => {
  it.each(PLANTED_6B)('reports $why', ({ classes }) => {
    const graded = gradeChromeInkClasses(classes)
    expect(graded, `"${classes}" should have been reported`).not.toBeNull()
    for (const f of graded!.failures) expect(f.ratio).toBeLessThan(AA)
  })

  it.each(INNOCENT_6B)('leaves $why alone', ({ classes }) => {
    expect(gradeChromeInkClasses(classes), `"${classes}" should not have been reported`).toBeNull()
  })

  it('derives the fact the fix relies on: ink-500 clears the chrome ground in BOTH themes, ink-400 in neither', () => {
    expect(contrast(utilityColor(LIGHT, 'ink-500')!, token(LIGHT, CHROME_GROUND))).toBeGreaterThanOrEqual(AA)
    expect(contrast(utilityColor(DARK, 'ink-500')!, token(DARK, CHROME_GROUND))).toBeGreaterThanOrEqual(AA)
    expect(contrast(utilityColor(LIGHT, 'ink-400')!, token(LIGHT, CHROME_GROUND))).toBeLessThan(AA)
    expect(contrast(utilityColor(DARK, 'ink-400')!, token(DARK, CHROME_GROUND))).toBeLessThan(AA)
  })

  it('skips ornaments (aria-hidden) and pictures (svg), grades everything else on the element', () => {
    const src = [
      '<span className="mr-1.5 text-ink-400" aria-hidden="true">·</span>',
      '<svg className="h-3 w-3 fill-current text-ink-400"><path d="" /></svg>',
      '<NavIcon className={`shrink-0 fill-current ${active ? "text-white" : "text-ink-400"}`} />',
      '<kbd className="rounded border text-xs text-ink-400">⌘K</kbd>',
    ].join('\n')
    const found = chromeInkFindingsInSource(src, 'planted.tsx')
    expect(found.map((f) => f.line)).toEqual([3, 4])
  })

  it('only lists shell files, each of which exists', () => {
    for (const file of CHROME_FILES) {
      expect(file.startsWith('components/'), file).toBe(true)
      expect(() => readFileSync(join(ROOT, file), 'utf8'), `${file} is gone — drop it from CHROME_FILES`).not.toThrow()
    }
  })

  it('still has one-sided neutral inks in the chrome to look at', () => {
    expect(chromeInkSites().length).toBeGreaterThan(5)
  })

  it('has no one-sided neutral ink in the chrome that misses AA on its ground', () => {
    const findings = scanForUnreadableChromeInk()
    expect(findings.map(describeFinding), findings.map(describeFinding).join('\n')).toEqual([])
  })
})
