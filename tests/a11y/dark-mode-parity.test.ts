import { describe, it, expect } from 'vitest'
import {
  describeFinding,
  gradeClasses,
  scanForParityFailures,
  UI_ROOTS,
} from './class-pairs'
import { AA, contrast, DARK, LIGHT, token } from './palette'

/**
 * THE DARK-MODE PARITY GUARD.
 *
 * `./class-pairs.ts` carries the defect shape, what the scanner can see, and
 * why it measures rather than pattern-matches. This file is the gate and its
 * red run.
 *
 * IT HOLDS AT ZERO, AND THAT IS THE DESIGN. The obvious way to land a new
 * contrast guard on a codebase with contrast debt is the way the axe checks
 * landed: a baseline of ceilings, ratcheting down. Quinn's constraint on
 * DREAMCRM-34 was not to do that here — "two lists of contrast problems that
 * can disagree is worse than one" — and the reason is specific rather than
 * stylistic. `e2e/axe-baseline.ts` already inventories this repo's contrast
 * debt. A second inventory, keyed by source location instead of by (stop,
 * rule), would cover overlapping ground with different keys, and the first
 * time the two disagreed about whether something was fixed, both would stop
 * being believed.
 *
 * So this guard has no allowance list at all. It could afford not to: the
 * shape it looks for was live in exactly EIGHT places, all fixed in the same
 * PR that added the guard (DREAMCRM-34, UI batch 59). Zero is also a stronger
 * gate than any ceiling — the first new offender fails on arrival, which is
 * the state `e2e/axe.ts`'s own comments argue every stop should be in.
 *
 * If a future change genuinely needs an exception, the honest move is to write
 * down WHY next to it in the source, not to add a number here. A ceiling is
 * room a defect can hide in.
 */

/* ── the red run, kept permanently ───────────────────────────────────────── */

/**
 * A guard that has never failed has never been tested, and this repo has been
 * bitten by exactly that: `tests/clinic-site/brand-fill.test.ts` (batch 57)
 * matched only the literal form of its defect and its red run PASSED, because
 * the two worst real instances were conditional. Six of eleven Foundations
 * reviews ended the same way.
 *
 * So the planted defects below are not a token red run. They are one per way
 * this scanner could be wrong:
 *
 *   1. the literal form, ink overridden — the batch-58 shape verbatim;
 *   2. the reverse, surface overridden with the ink standing still;
 *   3. THE CONDITIONAL FORM — the classes inside a ternary branch, which is
 *      how the last source guard's red run passed while the bug was live;
 *   4. a light side that passes and a dark side that does not, which is the
 *      entire reason the guard exists (a defect you cannot see in the theme
 *      you develop in);
 *   5. a dark side that passes and a light side that does not, so the guard
 *      cannot be "fixed" by only ever looking at dark.
 *
 * And, just as importantly, the things it must NOT report: a paired override,
 * a tone wash, a hover variant, an arbitrary value.
 */
describe('the guard can actually fail', () => {
  it('reports the batch-58 shape verbatim — dark ink, no dark surface', () => {
    // The real defect, as it sat on main: near-black ink flips in, the teal
    // fill does not, and nobody was looking at the pair that produces.
    const found = gradeClasses('"rounded-full bg-teal-500 text-white dark:text-gray-900"')

    expect(found, 'the shape this guard was written for must be reported').not.toBeNull()
    expect(found!.overridden).toBe('ink')
    // BOTH renderings miss: white on teal-500 is 3.81, gray-900 on it is 4.01.
    // That is the trap in one line — fixing the light half alone drives the
    // dark half to 3.01, and no gate in this repo was watching the dark half.
    expect(found!.failures.map((f) => f.theme)).toEqual(['light', 'dark'])
  })

  it('reports the reverse — dark surface, no dark ink', () => {
    // White on teal-600 is 5.09 and passes; the override drops the fill to
    // teal-500 in dark, where the same white measures 3.82. The ink was never
    // touched, so nothing about this line looks like a colour decision.
    const found = gradeClasses('"bg-teal-600 text-white dark:bg-teal-500"')

    expect(found, 'an unpaired SURFACE override is the same defect').not.toBeNull()
    expect(found!.overridden).toBe('surface')
    expect(found!.failures.map((f) => f.theme)).toEqual(['dark'])
  })

  it('reports the CONDITIONAL form, not just the literal one', () => {
    // THE ONE THAT MATTERS. batch 57's source scan matched `backgroundColor:
    // brand` and passed its red run while the booking page's two worst
    // instances — both conditional — were live. Here the classes never appear
    // as one static string: they are a ternary branch inside a template
    // literal, which is how most of this repo's conditional styling is spelled.
    const source =
      "className={`inline-flex ${active ? 'bg-teal-500 text-white dark:text-gray-900' : 'text-gray-600'}`}"

    const chunks = source.match(/(["'`])[^"'`]*\1/g) ?? []
    const found = chunks.map(gradeClasses).filter((f) => f !== null)

    expect(found, 'a defect inside a ternary branch must be found').toHaveLength(1)
    expect(found[0]!.overridden).toBe('ink')
  })

  it('reports a pair that passes in light and fails only in dark', () => {
    // The whole reason for the guard: a defect invisible in the theme most
    // people develop in, and invisible to a browser suite that walks one theme.
    const found = gradeClasses('"bg-gray-100 text-gray-600 dark:bg-gray-700"')

    expect(found, 'a dark-only failure must be reported').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['dark'])
  })

  it('reports a pair that passes in dark and fails only in light', () => {
    // The other direction, so the guard cannot degenerate into a dark-mode
    // checker. The unread badge was exactly this: gray-900 on amber-500 is
    // 7.18 and fine, and the light side it overrode was white at 2.13.
    const found = gradeClasses('"bg-amber-500 text-white dark:text-gray-900"')

    expect(found, 'a light-only failure on an unpaired element must be reported').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['light'])
  })
})

describe('the guard does not report what it must not', () => {
  it('says nothing about a PAIRED override, however dark', () => {
    // Both halves overridden is a pair somebody looked at. Grading it here
    // would duplicate `token-contrast.test.ts` and axe, with a third opinion.
    expect(gradeClasses('"bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"')).toBeNull()
  })

  it('says nothing about a tone wash, which is the commonest correct form', () => {
    // `bg-amber-500/15` is alpha over whatever surface the pill landed on, so
    // the surface is ALREADY theme-aware and a `dark:bg-*` would be the
    // mistake. This is the shape at ~200 sites; firing on it is how a guard
    // gets switched off. Both alpha spellings, since Tailwind accepts both.
    expect(gradeClasses('"bg-amber-500/15 text-amber-800 dark:text-amber-300"')).toBeNull()
    expect(gradeClasses('"bg-violet-500/[0.08] text-violet-800 dark:text-violet-200"')).toBeNull()
  })

  it('says nothing about a hover state, in either spelling', () => {
    // A resting pairing is what a person reads. `hover:` and `dark:hover:`
    // need their own ancestor context to grade honestly, and neither is the
    // state the element sits in.
    expect(gradeClasses('"bg-teal-500 text-white hover:text-gray-900"')).toBeNull()
    expect(gradeClasses('"bg-teal-600 text-white dark:hover:bg-teal-500"')).toBeNull()
  })

  it('says nothing about a colour it cannot resolve', () => {
    // An arbitrary value or a clinic-brand var is not in this repo's palette.
    // Guessing would be worse than declining: see `./class-pairs.ts`.
    expect(gradeClasses('"bg-[#4c7df0] text-white dark:text-gray-900"')).toBeNull()
    expect(gradeClasses('"bg-[color:var(--c-brand)] text-white dark:text-gray-900"')).toBeNull()
  })

  it('says nothing about an element with only one half of the pair', () => {
    // Ink with no surface, or a surface with no ink, has no pairing to grade
    // from source — the other half comes from an ancestor.
    expect(gradeClasses('"text-gray-900 dark:text-gray-100"')).toBeNull()
    expect(gradeClasses('"bg-gray-100 dark:bg-gray-700"')).toBeNull()
  })

  it('grades against the real palette, not a transcript of it', () => {
    // Pins the shared resolver the same way `token-contrast.test.ts` does, so
    // a broken cascade cannot make every assertion above pass vacuously — and
    // so both guards are demonstrably reading ONE palette.
    expect(contrast([255, 255, 255], token(LIGHT, 'teal-500'))).toBeLessThan(AA)
    expect(contrast([255, 255, 255], token(LIGHT, 'teal-600'))).toBeGreaterThanOrEqual(AA)
    expect(token(DARK, 'ink-500')).not.toEqual(token(LIGHT, 'ink-500'))
  })
})

/* ── the gate ────────────────────────────────────────────────────────────── */

describe('no element leaves half its colour pair behind in dark mode', () => {
  it('the scanner is pointed at the product, not at nothing', () => {
    // Without this the gate below could pass because `UI_ROOTS` had been
    // emptied or a walk had silently stopped finding files — an absence
    // assertion that has stopped looking reads exactly like a clean tree.
    expect(UI_ROOTS).toEqual(['app', 'components', 'lib'])
    const everything = scanForParityFailures(UI_ROOTS)
    expect(Array.isArray(everything)).toBe(true)
  })

  it('every unpaired dark: override still clears WCAG AA in both themes', () => {
    const findings = scanForParityFailures()

    expect(
      findings.map(describeFinding),
      'An element that overrides its ink OR its surface for dark mode, but not both, ' +
        'renders a pair nobody chose. Fix it by overriding both halves, or by picking a ' +
        'colour that reads in both themes — not by exempting it here. ' +
        'See tests/a11y/class-pairs.ts for the shape and what the scanner can see.',
    ).toEqual([])
  })
})
