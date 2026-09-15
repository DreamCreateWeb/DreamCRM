import { describe, it, expect } from 'vitest'
import {
  TONE_DOT,
  TONE_FILL,
  TONE_FILL_HOVER,
  TONE_PILL,
  TONE_TEXT,
  type Tone,
} from '@/lib/ui/encodings'
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
  deadGradientTextExemptions,
  describeFinding,
  gradeGradientClasses,
  gradeGradientTextClasses,
  GRADIENT_TEXT_EXEMPTIONS,
  gradientTextSites,
  scanForUnreadableGradientText,
  scanForWhiteOnShallowBrand,
  scanForWhiteOnShallowBrandGradient,
  scanForOffRegistryToneFills,
  SHALLOW_BRAND_FILLS,
  deadToneFillExemptions,
  gradeToneFillClasses,
  isToneFillSurface,
  toneFillSites,
  TONE_FILL_EXEMPTIONS,
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
    // Gradient TEXT, not a gradient fill — the ink is transparent, so there is
    // no white label for this rule to anchor on. Still correct, and no longer
    // the end of the story: that exact string is the homepage headline this
    // rule walked past, and RULE 4 below is what grades it. When a rule
    // declines to look at something, the answer is to build the rule that
    // does, not to record the silence as a pass.
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

describe('gradient TEXT, where the gradient IS the ink', () => {
  const white: Rgb = [255, 255, 255]

  /**
   * RULE 4 — the fourth blind spot in the same family, and the one rule 3
   * walks past on purpose. Its "stays quiet" case above IS this defect.
   *
   * `bg-clip-text text-transparent` inverts the pairing: there is no
   * `text-<colour>` to read, and the stops rule 3 grades as the SURFACE under
   * white text are painting the letterforms instead. So rule 2 misses it (the
   * fill is spelled `from-`/`to-`), rule 3 misses it (no `text-white` to
   * anchor on), and axe reports a gradient as `incomplete` rather than
   * failing — which is how `marketing: home` held ZERO in
   * `e2e/axe-baseline.ts` while the last two words of the homepage headline
   * sat at 2.42 on white. (DREAMCRM-44.)
   *
   * The planted defects come FIRST, for the reason they do under rule 3: the
   * zero assertion at the bottom is the one that gates, and an absence
   * assertion over a clean tree cannot tell a scanner that is looking from one
   * that has quietly stopped.
   */
  it('DERIVES its cutoff from rule 2 rather than opening a second one', () => {
    // The WCAG ratio is symmetric, so "white reads on this step" and "this
    // step reads on white" are one measurement. That is what lets rule 4 grade
    // INK against rule 2's FILL cutoff instead of the repo carrying two
    // numbers that can drift apart. Asserted, not assumed.
    for (const step of [...SHALLOW_BRAND_FILLS, 'teal-600', 'teal-700']) {
      const asFill = contrast(white, token(LIGHT, step))
      const asInk = contrast(token(LIGHT, step), white)
      expect(asInk, `${step} graded both ways`).toBeCloseTo(asFill, 10)
    }
  })

  it('catches the real defect, in the real shape it shipped in', () => {
    const found = gradeGradientTextClasses(
      '"bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent"',
    )
    expect(found).not.toBeNull()
    // Only the `to-` end. `from-teal-600` reads at 5.09 and is not a defect —
    // a rule that condemned the whole span would be telling the author to
    // change something that was already right.
    expect(found!.failures.map((f) => `${f.ink} ${f.ratio.toFixed(2)}`)).toEqual(['teal-400 2.42'])
  })

  it('reads a via- stop, so a pale middle cannot hide between two dark ends', () => {
    const found = gradeGradientTextClasses(
      '"bg-gradient-to-r from-teal-700 via-teal-400 to-teal-700 bg-clip-text text-transparent"',
    )
    expect(found).not.toBeNull()
    expect(found!.failures.map((f) => f.ink)).toEqual(['teal-400'])
  })

  it('grades any pale ink, not only the brand ramp', () => {
    // The defect is "too pale to read on the page", and nothing about that is
    // teal-specific. A tone-ramp gradient headline fails identically.
    const found = gradeGradientTextClasses(
      '"bg-gradient-to-r from-amber-400 to-amber-300 bg-clip-text text-transparent"',
    )
    expect(found).not.toBeNull()
    expect(found!.failures).toHaveLength(2)
  })

  it('stays quiet on the things it must not fire on', () => {
    // The fix that shipped: teal-700 (7.05) → teal-600 (5.09).
    expect(
      gradeGradientTextClasses(
        '"bg-gradient-to-r from-teal-700 to-teal-600 bg-clip-text text-transparent"',
      ),
    ).toBeNull()
    // A gradient FILL under white text is rule 3's business, not this one's —
    // no `bg-clip-text`, so the stops are the surface.
    expect(
      gradeGradientTextClasses('"bg-gradient-to-r from-teal-400 to-teal-600 text-white"'),
    ).toBeNull()
    // `bg-clip-text` without a transparent ink paints ordinary coloured text
    // over a clipped background nobody can see. Not this defect.
    expect(
      gradeGradientTextClasses(
        '"bg-gradient-to-r from-teal-400 to-teal-600 bg-clip-text text-gray-900"',
      ),
    ).toBeNull()
    // Alpha stops composite over an ancestor this scanner cannot resolve.
    expect(
      gradeGradientTextClasses(
        '"bg-gradient-to-r from-teal-400/60 to-teal-300/40 bg-clip-text text-transparent"',
      ),
    ).toBeNull()
    // The direction keyword is not a stop: `to-r` must not read as a colour.
    expect(gradeGradientTextClasses('"bg-gradient-to-r bg-clip-text text-transparent"')).toBeNull()
  })

  it('still points at something — the rule has a live subject', () => {
    // A rule narrowed until it matches nothing reports CLEAN forever, and this
    // one is narrow by construction: three utilities have to co-occur in one
    // quoted string. The zero assertion below is worth nothing without this
    // one beside it.
    const sites = gradientTextSites()
    expect(
      sites.map((site) => `${site.file}:${site.line}`),
      'rule 4 matches no gradient text anywhere in the product. Either the ' +
        'headline changed shape or the scanner stopped seeing it — find out ' +
        'which before believing the zero below.',
    ).not.toEqual([])
    expect(sites.some((site) => site.file === 'app/(marketing)/page.tsx')).toBe(true)
  })

  it('no gradient text in the product is too pale to read', () => {
    // THE GATE. Zero, no ceiling — the reason rules 1 and 3 hold there, in a
    // sharper form: this is the one contrast shape where the browser gate AND
    // all three source rules above were blind at once, so a number here would
    // be room in the only room nothing else can see into.
    expect(
      scanForUnreadableGradientText().map(describeFinding),
      'with bg-clip-text the gradient IS the ink, so every stop has to read ' +
        'as text on the page — teal-600 (5.09) or deeper on the brand ramp. ' +
        'axe reports a gradient as incomplete, so this is the only gate that ' +
        'will ever tell you.',
    ).toEqual([])
  })

  it('carries no exemption it has stopped describing', () => {
    // Empty today, and that is the honest state of the tree. The detector
    // exists so the first entry cannot outlive its subject — the same reason
    // rule 2 carries one.
    expect(
      deadGradientTextExemptions().map((e) => `${e.file} — ${e.classes}`),
      'this exemption no longer matches any call site. Re-derive it or delete it.',
    ).toEqual([])
    for (const e of GRADIENT_TEXT_EXEMPTIONS) {
      expect(e.why.length, 'every exemption states why in the source').toBeGreaterThan(80)
    }
  })
})

describe('TONE_FILL — the one answer for a solid fill with a label on it', () => {
  /**
   * THE REGISTRY HALF OF DREAMCRM-52.
   *
   * `TONE_PILL` homes a tone's wash, `TONE_TEXT` its plain ink, `TONE_DOT` a
   * swatch with nothing written on it — and the shape that is BOTH a saturated
   * fill AND carries a label had no home, so it was picked by hand every time
   * it came up. UI batch 59 picked it four times, measured every time, and
   * landed on two different answers recorded nowhere a person would look.
   *
   * Everything below DERIVES the table from the palette and from `TONE_DOT`
   * rather than transcribing it, the same way `SHALLOW_BRAND_FILLS` derives
   * rule 2's cutoff. A transcription is what goes stale the day somebody
   * re-tunes a ramp; a derivation fails that day instead.
   */
  const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

  function split(recipe: string): { ramp: string; step: number; ink: string } {
    const bg = recipe.match(/(?:^|\s)bg-([a-z]+)-(\d+)(?![\w-])/)
    const ink = recipe.match(/(?:^|\s)text-([a-z]+-\d+|white|black)(?![\w-])/)
    if (!bg || !ink) throw new Error(`TONE_FILL recipe is not a fill + ink: "${recipe}"`)
    return { ramp: bg[1], step: Number(bg[2]), ink: ink[1] }
  }

  function ratio(theme: typeof LIGHT, ink: string, fill: string): number {
    return contrast(token(theme, ink), token(theme, fill))
  }

  it('every tone fill carries its label at AA, in BOTH themes', () => {
    const failures: string[] = []
    for (const tone of TONES) {
      const { ramp, step, ink } = split(TONE_FILL[tone])
      for (const [name, theme] of [['light', LIGHT], ['dark', DARK]] as const) {
        const r = ratio(theme, ink, `${ramp}-${step}`)
        if (r < AA) failures.push(`${tone} (${name}): ${ink} on ${ramp}-${step} = ${r.toFixed(2)}`)
      }
    }
    expect(failures, 'a solid tone fill is the surface its label sits on').toEqual([])
  })

  it('resolves identically in both themes, which is why no recipe carries a dark: half', () => {
    // An opaque fill composites over nothing, so there is no theme-dependent
    // ancestor to track — and a lone `dark:text-*` or `dark:bg-*` on one of
    // these is not parity work, it is the exact defect rule 1 exists to catch
    // (three chips shipped `dark:text-gray-900` with no `dark:bg-*` at 4.01).
    for (const tone of TONES) {
      const { ramp, step, ink } = split(TONE_FILL[tone])
      expect(ratio(LIGHT, ink, `${ramp}-${step}`)).toBeCloseTo(ratio(DARK, ink, `${ramp}-${step}`), 6)
      expect(TONE_FILL[tone], `${tone} must not carry a dark: override`).not.toMatch(/\bdark:/)
      expect(TONE_FILL_HOVER[tone], `${tone} hover must not carry a dark: override`).not.toMatch(/\bdark:/)
    }
  })

  it('uses ONE ink across all six tones', () => {
    // The argument TONE_PILL makes for holding every tone's ink at the 800
    // step, pointed at a literal colour: a label on a warn fill and a label on
    // an urgent fill are the same colour, so "a solid tone fill" reads as one
    // thing rather than six.
    const inks = new Set(TONES.map((tone) => split(TONE_FILL[tone]).ink))
    expect(Array.from(inks), 'one ink, or the vocabulary is two vocabularies').toHaveLength(1)
  })

  it('DERIVES the dark ink instead of preferring it — white clears on no tone fill', () => {
    // Why the ink is dark at all. Reaching white means driving every hue to
    // the 600/700 end, where amber stops being amber; the measurement is what
    // rules it out, not the taste.
    for (const tone of TONES) {
      const { ramp, step } = split(TONE_FILL[tone])
      expect(
        ratio(LIGHT, 'white', `${ramp}-${step}`),
        `white on ${ramp}-${step} — if this now CLEARS, the ink choice is worth re-opening`,
      ).toBeLessThan(AA)
    }
  })

  it('DERIVES each fill: the tone DOT step, or one step lighter when the dot cannot carry the ink', () => {
    // The whole table out of one rule — start where TONE_DOT already puts the
    // tone's identity, and step LIGHTER, never deeper, if it cannot carry the
    // shared ink. Three tones stay put and three move; this asserts WHICH is
    // which out of the palette rather than trusting the table to be right.
    for (const tone of TONES) {
      const fill = split(TONE_FILL[tone])
      const dot = TONE_DOT[tone].match(/bg-([a-z]+)-(\d+)/)
      expect(dot, `${tone}: TONE_DOT should be a bare ramp fill`).toBeTruthy()
      const [, dotRamp, dotStep] = dot!
      expect(fill.ramp, `${tone}: the fill must stay on the tone's own hue`).toBe(dotRamp)

      const dotRatio = ratio(LIGHT, fill.ink, `${dotRamp}-${dotStep}`)
      if (fill.step === Number(dotStep)) {
        expect(
          dotRatio,
          `${tone}: the fill sits on the dot's step, so that step must carry the ink`,
        ).toBeGreaterThanOrEqual(AA)
      } else {
        expect(
          dotRatio,
          `${tone}: the fill left the dot's step, so that step must FAIL — otherwise ` +
            'the tone gave up its identity step for nothing',
        ).toBeLessThan(AA)
        expect(
          fill.step,
          `${tone}: exactly one step lighter than the dot, never deeper`,
        ).toBe(STEPS[STEPS.indexOf(Number(dotStep)) - 1])
      }
    }
  })

  it('hovers one step LIGHTER, which is the direction that stays readable', () => {
    // Deepening on hover is the reflex and here it walks the label back toward
    // the floor: amber-600 under gray-900 is 4.79 where the resting pair was
    // 7.18, and rose-500 under it fails outright. Asserted as a measured fact
    // about the step BELOW each fill, so the direction cannot be re-picked by
    // eye later.
    for (const tone of TONES) {
      const fill = split(TONE_FILL[tone])
      const hover = TONE_FILL_HOVER[tone].match(/^hover:bg-([a-z]+)-(\d+)$/)
      expect(hover, `${tone}: the hover recipe is a bare hover:bg- and no ink`).toBeTruthy()
      const [, hoverRamp, hoverStep] = hover!
      expect(hoverRamp, `${tone}: hover stays on the same hue`).toBe(fill.ramp)
      expect(Number(hoverStep), `${tone}: exactly one step lighter than the resting fill`).toBe(
        STEPS[STEPS.indexOf(fill.step) - 1],
      )
      const hoverRatio = ratio(LIGHT, fill.ink, `${hoverRamp}-${hoverStep}`)
      expect(hoverRatio, `${tone}: hover must clear AA too`).toBeGreaterThanOrEqual(AA)
      expect(
        hoverRatio,
        `${tone}: lighter must be the SAFER direction, or this rule is backwards`,
      ).toBeGreaterThan(ratio(LIGHT, fill.ink, `${fill.ramp}-${fill.step}`))
    }
  })

  it('catches the real defects, in the real shapes they shipped in', () => {
    // Red-verified against the tree as it stood before the sweep. Each of
    // these is a string lifted off a live call site, not a simplified
    // stand-in — batch 57's red run passed because its plant was simpler than
    // the defect.
    const shipped = [
      // components/ui/tenant-sidebar.tsx — the attention count badge, 2.13.
      '"ml-2 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold tabular-nums text-white"',
      // components/onboarding/getting-started.tsx — "Draft with AI", 4.42.
      '"btn-sm shrink-0 bg-violet-600 text-white hover:bg-violet-700"',
      // components/ui/tick-button.tsx — the done tick, 2.47.
      "'border-emerald-500 bg-emerald-500 text-white'",
      // app/(default)/dashboard/proposal-artifacts.tsx — a neutral avatar well
      // that CLEARED at 5.30 and was still a fresh guess.
      '"inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white bg-gray-500 dark:bg-gray-600"',
    ]
    for (const classes of shipped) {
      expect(gradeToneFillClasses(classes), `rule 5 must see: ${classes}`).not.toBeNull()
    }
  })

  it('fails a pairing that CLEARS but is not the registry answer', () => {
    // The point of the rule. A second passing answer is how a single source of
    // truth stops being one, so "it measures fine" is not a defence.
    const clears = gradeToneFillClasses('"rounded bg-emerald-400 text-gray-900"')
    expect(clears).not.toBeNull()
    expect(clears!.failures[0].ratio).toBeGreaterThanOrEqual(AA)
    expect(clears!.note).toMatch(/its own route/)
  })

  it('stays quiet on the things it must not fire on', () => {
    // The registry's own recipes, obviously.
    for (const tone of TONES) {
      expect(gradeToneFillClasses(`"rounded-full px-2 ${TONE_FILL[tone]}"`)).toBeNull()
    }
    // A tone WASH at the pale end — the opaque spelling of a pill, eight of
    // which are live and read fine on the tone's own deep ink.
    expect(gradeToneFillClasses('"rounded bg-emerald-100 text-emerald-700"')).toBeNull()
    expect(gradeToneFillClasses('"rounded bg-amber-50 text-amber-800"')).toBeNull()
    // A dark band at the deep end, whose ink is white for a footer's reasons.
    expect(gradeToneFillClasses('"rounded bg-gray-900 text-gray-100"')).toBeNull()
    expect(gradeToneFillClasses('"rounded bg-violet-800 text-white"')).toBeNull()
    // A surface, not a tone fill — gray is both ramps and only the fill steps
    // are this rule's business.
    expect(gradeToneFillClasses('"rounded bg-gray-100 text-gray-500"')).toBeNull()
    // Alpha on either half composites over an ancestor this scanner cannot
    // resolve — rule 1's constraint, for rule 1's reason.
    expect(gradeToneFillClasses('"bg-amber-500/15 text-amber-800"')).toBeNull()
    // The BRAND ramp belongs to rules 2 and 3. Two guards grading one line is
    // how they start disagreeing about it.
    expect(gradeToneFillClasses('"rounded bg-teal-500 text-white"')).toBeNull()
    // A fill with no label on it is TONE_DOT's business.
    expect(gradeToneFillClasses('"h-2 w-2 rounded-full bg-rose-500"')).toBeNull()
  })

  it('pins the window it looks through, at both edges', () => {
    // The two arrays behind `isToneFillSurface` are the rule's whole scope, so
    // they are asserted rather than trusted to say what they mean.
    expect(isToneFillSurface('amber-300')).toBe(true)
    expect(isToneFillSurface('amber-600')).toBe(true)
    expect(isToneFillSurface('amber-200')).toBe(false)
    expect(isToneFillSurface('amber-700')).toBe(false)
    expect(isToneFillSurface('gray-400')).toBe(true)
    expect(isToneFillSurface('teal-500')).toBe(false)
    expect(isToneFillSurface('white')).toBe(false)
  })

  it('still walks the product tree, not just lib/', () => {
    // The field-of-view check, and it needs reading carefully: a COMPLETE
    // sweep makes this rule's subjects nearly vanish. Once a call site says
    // `${TONE_FILL.warn}` the fill lives only in the registry, so the scanner
    // — which reads one quoted string at a time — cannot see it any more. What
    // is left in the window is the registry's own six recipe strings plus the
    // one exemption, and that is the expected end state rather than a scanner
    // that has stopped matching.
    //
    // So the proof that rule 5 can still SEE is the red-verified block above,
    // which feeds it four strings lifted off live call sites. This test only
    // pins the cheaper half: the walk still reaches product files outside
    // `lib/`, so a broken root list cannot report a clean tree.
    const sites = toneFillSites()
    expect(
      sites.map((s) => `${s.file}:${s.line}`),
      'rule 5 matches no solid tone fill anywhere — not even the registry ' +
        'recipes it is derived from. The scanner is broken, not the tree.',
    ).not.toEqual([])
    expect(sites.some((s) => s.file === 'lib/ui/encodings.ts')).toBe(true)
    expect(
      sites.some((s) => s.file === 'components/ui/action-button.tsx'),
      'the walk must reach components/ — the exemption lives there, and it is ' +
        'the only literal tone fill left outside the registry',
    ).toBe(true)
  })

  it('no solid tone fill in the product is off the registry', () => {
    // THE GATE. Zero with named exemptions and no ceiling — a number here
    // would count places still answering a question that has one answer, and
    // a count is something people manage down rather than a rule that holds.
    expect(
      scanForOffRegistryToneFills().map(describeFinding),
      'a solid fill with a label on it comes from TONE_FILL in ' +
        'lib/ui/encodings.ts. If this one genuinely should not, add it to ' +
        'TONE_FILL_EXEMPTIONS with the reason — do not re-measure a new pair.',
    ).toEqual([])
  })

  it('carries no exemption it has stopped describing', () => {
    expect(
      deadToneFillExemptions().map((e) => `${e.file} — ${e.classes}`),
      'this exemption no longer matches any call site. Re-derive it or delete it.',
    ).toEqual([])
    for (const e of TONE_FILL_EXEMPTIONS) {
      expect(e.why.length, 'every exemption states why in the source').toBeGreaterThan(80)
    }
  })
})
