import { describe, it, expect } from 'vitest'
import { TONE_PILL, TONE_TEXT, type Tone } from '@/lib/ui/encodings'
import {
  AA,
  contrast,
  DARK,
  hexToRgb,
  LIGHT,
  over,
  SURFACES,
  token,
  type Rgb,
} from './palette'
import {
  BRAND_FILL_EXEMPTIONS,
  deadBrandFillExemptions,
  describeFinding,
  gradeGradientClasses,
  scanForWhiteOnShallowBrand,
  scanForWhiteOnShallowBrandGradient,
  SHALLOW_BRAND_FILLS,
} from './class-pairs'

/**
 * THE SOURCE-LEVEL CONTRAST GUARD — the one the repo did not have.
 *
 * `tests/a11y/legibility-floor.test.ts` enforces the 12px SIZE floor.
 * `pnpm lint` (jsx-a11y) is static and structurally cannot see colour at all.
 * The runtime axe checks (e2e/axe.ts) DO measure contrast, but only at the 35
 * stops the browser suite happens to walk, only for the states those specs put
 * on screen, and they cost a full E2E run. Nothing anywhere read the design
 * system's own numbers and asked whether they clear 4.5:1 — which is how 176
 * `color-contrast` violations accumulated quietly, and why several of them sat
 * at 4.48–4.49 against a 4.5 requirement: a palette picked by eye passes every
 * gate that never looks.
 *
 * This test computes them, from the REAL values `./palette` resolves out of
 * the two files that define them — this repo's `app/css/style.css` and
 * Tailwind's own `theme.css` — so it follows a token edit or a Tailwind
 * upgrade instead of pinning a copy that goes stale. Every ratio below is
 * derived, none is transcribed. The resolution and the colour maths live in
 * `./palette` rather than here because `./dark-mode-parity.test.ts` grades the
 * same palette, and two copies of the maths is two guards that can disagree
 * about the same pair.
 *
 * WHAT IT DOES NOT COVER, so nobody mistakes it for a full contrast gate:
 * only the pairs the design system DECLARES — a semantic ink on a semantic
 * surface, and a tone's ink on that tone's own wash. It cannot see a component
 * that puts `text-gray-400` on a photo, or a dark band hand-built inside a
 * light page (the marketing footer's headings were exactly that, and axe found
 * them, not this). Runtime checks stay the backstop for composition; this is
 * the guard for the palette itself.
 */

/** Which Tailwind step a tone class names, and the ramp it names it on. */
function inkOf(recipe: string): string {
  const m = recipe.match(/(?:^|\s)text-([a-z]+-\d+)/)
  if (!m) throw new Error(`no light text- class in "${recipe}"`)
  return m[1]
}
function darkInkOf(recipe: string): string {
  const m = recipe.match(/dark:text-([a-z]+-\d+)/)
  if (!m) throw new Error(`no dark:text- class in "${recipe}"`)
  return m[1]
}
/** `bg-amber-500/15` → the ramp step and the alpha it washes at. */
function washOf(recipe: string): { step: string; alpha: number } | null {
  const m = recipe.match(/(?:^|\s)bg-([a-z]+-\d+)\/(\d+)/)
  return m ? { step: m[1], alpha: Number(m[2]) / 100 } : null
}

const TONES = Object.keys(TONE_PILL) as Tone[]

/* ── the guards ──────────────────────────────────────────────────────────── */

describe('the sanity of the palette itself', () => {
  it('parses both stylesheets and resolves oklch the way a browser does', () => {
    // Pins the conversion against values read out of a real Chromium via
    // canvas, so a wrong matrix cannot make everything below pass.
    expect(token(LIGHT, 'amber-700')).toEqual(hexToRgb('#bb4d00'))
    expect(token(LIGHT, 'amber-800')).toEqual(hexToRgb('#973c00'))
    expect(token(LIGHT, 'rose-800')).toEqual(hexToRgb('#a50036'))
    // And that the app's `@theme` really does beat Tailwind's ramp.
    expect(token(LIGHT, 'violet-700')).toEqual(hexToRgb('#5d47de'))
    // And that `.dark` really does beat the light value.
    expect(token(DARK, 'ink-500')).not.toEqual(token(LIGHT, 'ink-500'))
    expect(LIGHT.size).toBeGreaterThan(100)
  })
})

describe('semantic ink on semantic surface clears WCAG AA', () => {
  // ink-400 is absent on purpose: the stylesheet marks it "disabled only",
  // and it measures 2.63 on white. It is not a text colour, and listing it
  // here would either fail forever or license using it as one.
  const INKS = ['ink-900', 'ink-800', 'ink-700', 'ink-600', 'ink-500'] as const

  const passes: [string, Map<string, Rgb>][] = [
    ['light', LIGHT],
    ['dark', DARK],
  ]
  for (const [themeName, theme] of passes) {
    it(`${themeName}: every ink reads on every surface`, () => {
      const failures: string[] = []
      for (const ink of INKS) {
        for (const surface of SURFACES) {
          const ratio = contrast(token(theme, ink), token(theme, surface))
          if (ratio < AA) failures.push(`${ink} on ${surface} = ${ratio.toFixed(2)}`)
        }
      }
      expect(failures, failures.join('\n')).toEqual([])
    })
  }
})

describe('every semantic tone reads on its own wash', () => {
  const passes: [string, Map<string, Rgb>, (recipe: string) => string][] = [
    ['light', LIGHT, inkOf],
    ['dark', DARK, darkInkOf],
  ]
  for (const [themeName, theme, ink] of passes) {
    it(`${themeName}: TONE_PILL ink on the tinted background, on all four surfaces`, () => {
      const failures: string[] = []
      for (const tone of TONES) {
        const recipe = TONE_PILL[tone]
        const wash = washOf(recipe)
        expect(wash, `TONE_PILL.${tone} should carry a bg-<ramp>-<step>/<alpha> wash`).toBeTruthy()
        const fg = token(theme, ink(recipe))
        for (const surface of SURFACES) {
          const bg = over(token(theme, wash!.step), wash!.alpha, token(theme, surface))
          const ratio = contrast(fg, bg)
          if (ratio < AA) {
            failures.push(
              `${tone}: ${ink(recipe)} on ${wash!.step}/${wash!.alpha * 100} over ${surface} = ${ratio.toFixed(2)}`,
            )
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([])
    })

    it(`${themeName}: TONE_TEXT ink on the plain surfaces`, () => {
      const failures: string[] = []
      for (const tone of TONES) {
        const fg = token(theme, ink(TONE_TEXT[tone]))
        for (const surface of SURFACES) {
          const ratio = contrast(fg, token(theme, surface))
          if (ratio < AA) {
            failures.push(`${tone}: ${ink(TONE_TEXT[tone])} on ${surface} = ${ratio.toFixed(2)}`)
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([])
    })
  }

  it('a pill and a plain sentence say the same tone in the same colour', () => {
    // The registry exists so one meaning has one appearance. Letting the two
    // recipes drift a step apart is the cheapest way to lose that, and it is
    // exactly what happens when somebody fixes only the pair axe reported.
    for (const tone of TONES) {
      expect(inkOf(TONE_TEXT[tone]), `${tone} light ink`).toBe(inkOf(TONE_PILL[tone]))
    }
  })
})

describe('white-on-brand fills', () => {
  const white: Rgb = [255, 255, 255]

  it('names which steps of the blue ramp may carry white text', () => {
    // The brand ramp is a FILL ramp, and only its deep end is a white-text
    // fill. Batch 58 moved 44 call sites onto these steps.
    for (const step of ['teal-600', 'teal-700', 'teal-800', 'teal-900']) {
      const ratio = contrast(white, token(LIGHT, step))
      expect(ratio, `white on ${step} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA)
    }
  })

  it('DERIVES the cutoff instead of asserting it', () => {
    // The negative half, and the reason the list above is a fact rather than a
    // preference: teal-400 (2.42) and teal-500 (3.82) really are under the bar.
    // Without this, a future re-tint that made teal-500 safe would leave the
    // scanner below still refusing it, and nothing would say so.
    for (const step of SHALLOW_BRAND_FILLS) {
      const ratio = contrast(white, token(LIGHT, step))
      expect(ratio, `white on ${step} = ${ratio.toFixed(2)}`).toBeLessThan(AA)
    }
  })

  it('no call site paints white on those steps, in either theme', () => {
    // THE SOURCE RULE — the half batch 58's write-up said had shipped and had
    // not (see `./class-pairs.ts`). The assertion above grades the PALETTE and
    // can never fail on a component; this one reads every className in the
    // product. It holds at zero: batch 58's 44 fixes were real and complete.
    expect(
      scanForWhiteOnShallowBrand().map(describeFinding),
      'teal-400 and teal-500 are identity steps, not white-text fills. A solid ' +
        'fill with a white label is teal-600 (5.09) or deeper. Do not re-label ' +
        'the token to match the call site — that is how this reached 44 places.',
    ).toEqual([])
  })

  it('the one exemption still describes something real', () => {
    // The rule above holds at zero only because ONE site is exempt: the
    // marketing recall-funnel illustration. An exemption is the only thing here
    // that makes the gate looser, so it is not allowed to quietly stop
    // describing anything — that is how a narrow allowance becomes a pardon.
    // Verified red by editing the exempt class string: the entry goes dead AND
    // the rule above goes red, which is the pair of failures that means the
    // illustration changed rather than the guard breaking.
    expect(BRAND_FILL_EXEMPTIONS).toHaveLength(1)
    expect(
      deadBrandFillExemptions().map((e) => `${e.file} — ${e.classes}`),
      'this exemption no longer matches any call site. Re-derive it against the ' +
        'current markup or delete it; do not leave one standing over something ' +
        'that has changed.',
    ).toEqual([])
    for (const e of BRAND_FILL_EXEMPTIONS) {
      expect(e.why.length, 'every exemption states why in the source').toBeGreaterThan(80)
    }
  })
})

describe('white text on a brand GRADIENT', () => {
  /**
   * RULE 3 — the defect class no gate in this repo could see, and the reason
   * the product's most prominent element carried it for the whole program.
   *
   * axe reports a gradient fill as INCOMPLETE rather than failing, so
   * `e2e/axe-baseline.ts` has never carried one. Rule 2 above reads
   * `bg-<ramp>-<step>` and a gradient spells its fill `from-`/`via-`/`to-`, so
   * it could not see one either. `ActionButton`'s primary was
   * `from-teal-400 to-teal-600` under white text — 2.42 at the light end, 3.46
   * at the midpoint, 4.19 at 75%, clearing only at the final pixel-column
   * (5.09). Hand-measured on DREAMCRM-28 because nothing automated was.
   *
   * The planted defects below come FIRST on purpose. The zero assertion at the
   * bottom is the one that gates, and an absence assertion over a clean tree
   * cannot tell a scanner that is looking from one that has quietly stopped —
   * which is exactly how batch 58's write-up came to claim a rule that was not
   * there. These feed the scanner each shape it claims to catch, so it has to
   * keep proving it can see them on every run rather than on the one afternoon
   * somebody watched it go red.
   */
  it('catches the real defect, in the real shape it shipped in', () => {
    const found = gradeGradientClasses(
      '"bg-gradient-to-br from-teal-400 to-teal-600 hover:from-teal-500 hover:to-teal-600 text-white"',
    )
    expect(found).not.toBeNull()
    // The resting light end (2.42) AND the hover end (3.82) — deepening only
    // the resting state would have left the hover half live, which is why this
    // rule grades hover where rule 1 deliberately does not.
    const worst = found!.failures.map((f) => `${f.theme} ${f.surface} ${f.ratio.toFixed(2)}`)
    expect(worst).toContain('light teal-400 2.42')
    expect(worst).toContain('light:hover teal-500 3.82')
  })

  it('reads a via- stop, so the breath skin cannot hide in the middle', () => {
    // The page's single primary renders BREATH_CLASSES, not the `primary`
    // recipe — its old `from-teal-400 via-teal-600 to-teal-400` drifted white
    // text between 2.42 and 5.09 twice every six seconds.
    const found = gradeGradientClasses(
      '"breath bg-gradient-to-r from-teal-400 via-teal-600 to-teal-400 text-white"',
    )
    expect(found).not.toBeNull()
    expect(found!.failures.map((f) => f.surface)).toContain('teal-400')
  })

  it('resolves dark: and dark:hover: stops over the base, the way the cascade does', () => {
    const found = gradeGradientClasses('"bg-gradient-to-r from-teal-700 dark:from-teal-500 text-white"')
    expect(found).not.toBeNull()
    expect(found!.failures.map((f) => `${f.theme} ${f.surface}`)).toEqual([
      'dark teal-500',
      'dark:hover teal-500',
    ])
  })

  it('stays quiet on the things it must not fire on', () => {
    // Legal: white on teal-600 and deeper, which is where the batch moved
    // every one of these.
    expect(
      gradeGradientClasses('"bg-gradient-to-br from-teal-600 to-teal-800 hover:from-teal-700 text-white"'),
    ).toBeNull()
    // Alpha stops composite over an ancestor this scanner cannot resolve.
    expect(gradeGradientClasses('"bg-gradient-to-t from-teal-500/65 to-teal-400/90 text-white"')).toBeNull()
    // Gradient TEXT, not a gradient fill — the ink is transparent.
    expect(
      gradeGradientClasses('"bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent"'),
    ).toBeNull()
    // The direction keyword is not a stop: `to-br`/`to-r` must not be read as
    // `to-<colour>`, and a variant this rule does not model stays out.
    expect(gradeGradientClasses('"bg-gradient-to-br group-hover:from-teal-400 text-white"')).toBeNull()
    // A hover ink this scanner does not resolve — skip the hover renderings
    // rather than grade them against the resting ink.
    expect(
      gradeGradientClasses('"bg-gradient-to-r from-teal-700 hover:from-teal-500 text-white hover:text-gray-900"'),
    ).toBeNull()
    // No gradient at all is rule 2's business, not this one's.
    expect(gradeGradientClasses('"bg-teal-400 text-white"')).toBeNull()
  })

  it('no call site paints white text across the shallow brand ramp', () => {
    // THE GATE. Holds at ZERO with no ceiling and no exemption — the same
    // reason the dark-mode parity guard does: a number here is room for the
    // next one to hide in, and nothing else in the repo is looking at this.
    expect(
      scanForWhiteOnShallowBrandGradient().map(describeFinding),
      'a gradient under white text must run entirely on teal-600 (5.09) or ' +
        'deeper, in every rendering including hover. axe cannot measure a ' +
        'gradient — it reports one as incomplete — so this is the only gate ' +
        'that will ever tell you.',
    ).toEqual([])
  })
})
