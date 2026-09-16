import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  ROOT,
  SURFACES,
  token,
  utilityColor,
  type Rgb,
} from './palette'
import {
  BRAND_FILL_EXEMPTIONS,
  deadBrandFillExemptions,
  deadClippedTextExemptions,
  describeFinding,
  gradeGradientClasses,
  gradeClippedTextClasses,
  isClippedText,
  CLIPPED_TEXT_EXEMPTIONS,
  clippedTextSites,
  scanForUnreadableClippedText,
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

  /**
   * THE EXEMPTION'S PREMISE, CHECKED STRUCTURALLY (DREAMCRM-63).
   *
   * `deadBrandFillExemptions` above asks whether the exemption still MATCHES
   * something. It does not ask whether its REASON is still true, and those are
   * different questions — #587 found that out about the night band, where
   * moving the hero back to `bg-white` left every dead-exemption detector in
   * this repo GREEN over a headline measuring 1.88. Same shape here, one rule
   * over: this entry's whole argument is WCAG 1.4.3, *text that is part of a
   * picture*, and the two facts that make the claim true are (a) the mock
   * marks itself `aria-hidden` and (b) the bar belongs to a designed
   * progression that restyling one step would break. Strip the `aria-hidden`
   * and those bars become content — a 2.42 label on a control — while the
   * class string carries on matching and the detector carries on saying
   * nothing.
   *
   * WHY IT READS THE OWNING COMPONENT RATHER THAN THE FILE.
   * `components/marketing/ui.tsx` is ~1,100 lines of mocks and most of them
   * are `aria-hidden`, so a whole-file search would pass on somebody else's
   * attribute. That is the bookkeeping version of this question. The function
   * the bar actually lives in is the smallest unit this file's own conventions
   * make available without an AST.
   *
   * What it does NOT prove: that the illustration still LOOKS like a picture,
   * or that `aria-hidden` is not undone deeper in the tree. Both are the safe
   * direction — it can fail on a real change of premise, and it cannot pass
   * one off as fine.
   */
  it('the exempted bar is still an aria-hidden picture, inside its progression', () => {
    // `filter` plus a length pin, not `find` (Quinn's review of #594): `find`
    // grades the FIRST entry for a file, so a second one added to the same file
    // gets no premise check at all and nothing says so. Each list is one entry
    // long today, which is exactly the condition that makes that invisible.
    const forFile = BRAND_FILL_EXEMPTIONS.filter((e) => e.file === 'components/marketing/ui.tsx')
    expect(
      forFile.length,
      'this test grades ONE exemption for components/marketing/ui.tsx. A second ' +
        'entry for the same file needs its own premise assertion — widen this ' +
        'test rather than raising the count.',
    ).toBe(1)
    const exemption = forFile[0]
    expect(exemption, 'the recall-funnel exemption is the subject of this test').toBeTruthy()

    const src = readFileSync(join(ROOT, exemption!.file), 'utf8')
    const at = src.indexOf(exemption!.classes)
    expect(at, 'the exempted class string is still in the file').toBeGreaterThan(-1)

    // `^` with the `m` flag: without it the anchor binds to the FILE, not to
    // the line, and this finds exactly one component (#557 paid for that one).
    const components: { name: string; index: number }[] = []
    const declaration = /^export function (\w+)\(/gm
    let m: RegExpExecArray | null
    while ((m = declaration.exec(src)) !== null) components.push({ name: m[1], index: m.index })

    const owner = components.filter((c) => c.index < at).pop()
    expect(owner, 'the exempted bar is no longer inside an exported component').toBeTruthy()
    const next = components.find((c) => c.index > at)
    const body = src.slice(owner!.index, next ? next.index : src.length)

    // Half one: the picture claim. WCAG 1.4.3 exempts text that is part of an
    // illustration, and `aria-hidden` on the mock's own root is the author
    // saying this is one.
    expect(
      body,
      `${owner!.name} no longer marks itself aria-hidden. The exemption above ` +
        'pardons white on teal-400 at 2.42, and its entire justification is ' +
        'WCAG 1.4.3 — text that is part of a PICTURE. Content is not a ' +
        'picture. Delete the exemption and fix the contrast, or restore the ' +
        'aria-hidden.',
    ).toContain('aria-hidden="true"')

    // Half two: the progression claim. "Restyling one bar would break the
    // progression" is only an argument while there is a progression — four
    // deliberate steps of one ramp, not one stray pale bar.
    // `(?![\w-])` rather than `\b`: a hyphen is a non-word character, so `\b`
    // after `400` matches inside `bg-teal-400-foo`. The trap the DREAMCRM-50
    // mutation pass paid for twice.
    for (const step of ['teal-200', 'teal-300', 'teal-400', 'teal-600']) {
      expect(
        body,
        `the teal-200/300/400/600 progression the exemption describes no longer ` +
          `includes bg-${step}. Re-derive the reason against the current ` +
          `markup — a single pale bar is not a designed ramp.`,
      ).toMatch(new RegExp(`bg-${step}(?![\\w-])`))
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

describe('CLIPPED TEXT, where the background IS the ink', () => {
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

  it('catches the GRADIENT defect, in the real shape it shipped in', () => {
    const found = gradeClippedTextClasses(
      '"bg-gradient-to-r from-teal-600 to-teal-400 bg-clip-text text-transparent"',
    )
    expect(found).not.toBeNull()
    // Only the `to-` end. `from-teal-600` reads at 5.09 and is not a defect —
    // a rule that condemned the whole span would be telling the author to
    // change something that was already right.
    expect(found!.failures.map((f) => `${f.ink} ${f.ratio.toFixed(2)}`)).toEqual(['teal-400 2.42'])
  })

  it('reads a via- stop, so a pale middle cannot hide between two dark ends', () => {
    const found = gradeClippedTextClasses(
      '"bg-gradient-to-r from-teal-700 via-teal-400 to-teal-700 bg-clip-text text-transparent"',
    )
    expect(found).not.toBeNull()
    expect(found!.failures.map((f) => f.ink)).toEqual(['teal-400'])
  })

  it('grades any pale ink, not only the brand ramp', () => {
    // The defect is "too pale to read on the page", and nothing about that is
    // teal-specific. A tone-ramp gradient headline fails identically.
    const found = gradeClippedTextClasses(
      '"bg-gradient-to-r from-amber-400 to-amber-300 bg-clip-text text-transparent"',
    )
    expect(found).not.toBeNull()
    expect(found!.failures).toHaveLength(2)
  })

  /**
   * RULE 4'S OWN INVERSE, closed (DREAMCRM-63).
   *
   * Rule 4 shipped requiring a base `from-`/`via-`/`to-` stop, which left the
   * SOLID spelling of the identical effect graded by nothing at all: rule 4
   * wanted a gradient, rule 2 wants `ink.word === 'white'` and the ink here is
   * `transparent`, rule 3 wants a `text-white` to anchor on, and axe cannot
   * see a clipped background in any spelling. Four gates, four reasons to say
   * nothing, one 2.42 headline — the same number that started DREAMCRM-44.
   *
   * Zero instances existed in the tree when this was closed, which is what
   * makes the planted cases below the only evidence there is. The watched red
   * run was the product shape: `bg-teal-400 bg-clip-text text-transparent`
   * dropped into `app/(marketing)/page.tsx`, green before and red after,
   * naming the file, the line and 2.42.
   */
  it('catches clipped text over a SOLID fill, which nothing graded before', () => {
    const found = gradeClippedTextClasses('"bg-teal-400 bg-clip-text text-transparent"')
    expect(found).not.toBeNull()
    expect(found!.failures.map((f) => `${f.ink} ${f.ratio.toFixed(2)}`)).toEqual(['teal-400 2.42'])
    expect(found!.classes).toBe('bg-teal-400')
    // The note has to say which shape was found: "a stop is too pale" sends a
    // reader looking for a gradient that is not in the chunk.
    expect(found!.note).toContain('solid fill')
  })

  it('leaves a solid fill alone at teal-600 and deeper, the same cutoff as a stop', () => {
    // One number, three rules — the solid spelling does not get its own.
    expect(gradeClippedTextClasses('"bg-teal-600 bg-clip-text text-transparent"')).toBeNull()
    expect(gradeClippedTextClasses('"bg-gray-900 bg-clip-text text-transparent"')).toBeNull()
  })

  it('grades the GRADIENT when a solid fill sits under it, not the fallback', () => {
    // `bg-clip-text` clips every background layer and a background-IMAGE paints
    // over a background-COLOR, so a solid fill beneath a gradient is a fallback
    // nobody sees. Failing this chunk for teal-400 would be condemning a colour
    // that never reaches the screen.
    expect(
      gradeClippedTextClasses(
        '"bg-teal-400 bg-gradient-to-r from-teal-700 to-teal-600 bg-clip-text text-transparent"',
      ),
    ).toBeNull()

    // And the other direction, so the precedence is not a way to hide a stop:
    // a legal fallback does not excuse a pale stop above it.
    const found = gradeClippedTextClasses(
      '"bg-teal-700 bg-gradient-to-r from-teal-700 to-teal-400 bg-clip-text text-transparent"',
    )
    expect(found).not.toBeNull()
    expect(found!.failures.map((f) => f.ink)).toEqual(['teal-400'])
  })

  it('stays quiet on the solid shapes it must not fire on', () => {
    // No background at all: `bg-clip-text` is not itself a fill, and neither is
    // the direction keyword. Both would be a false positive on every clipped
    // chunk in the tree if `COLOUR_WORD` were loose enough to read them.
    expect(gradeClippedTextClasses('"bg-clip-text text-transparent"')).toBeNull()
    // An alpha fill composites over an ancestor this scanner cannot resolve —
    // the same exclusion rules 1, 3 and 5 make.
    expect(gradeClippedTextClasses('"bg-teal-400/60 bg-clip-text text-transparent"')).toBeNull()
    // A `dark:` fill with no base one. The dark rendering is outside this
    // rule's field of view (module header), so there is nothing to grade.
    expect(gradeClippedTextClasses('"dark:bg-teal-400 bg-clip-text text-transparent"')).toBeNull()
    // A solid fill WITHOUT the clip is an ordinary surface — rule 2 and rule 5's
    // business, and grading it here would be two guards reporting one line.
    expect(gradeClippedTextClasses('"bg-teal-400 text-transparent"')).toBeNull()
  })

  it('stays quiet on the things it must not fire on', () => {
    // The fix that shipped: teal-700 (7.05) → teal-600 (5.09).
    expect(
      gradeClippedTextClasses(
        '"bg-gradient-to-r from-teal-700 to-teal-600 bg-clip-text text-transparent"',
      ),
    ).toBeNull()
    // A gradient FILL under white text is rule 3's business, not this one's —
    // no `bg-clip-text`, so the stops are the surface.
    expect(
      gradeClippedTextClasses('"bg-gradient-to-r from-teal-400 to-teal-600 text-white"'),
    ).toBeNull()
    // `bg-clip-text` without a transparent ink paints ordinary coloured text
    // over a clipped background nobody can see. Not this defect.
    expect(
      gradeClippedTextClasses(
        '"bg-gradient-to-r from-teal-400 to-teal-600 bg-clip-text text-gray-900"',
      ),
    ).toBeNull()
    // Alpha stops composite over an ancestor this scanner cannot resolve.
    expect(
      gradeClippedTextClasses(
        '"bg-gradient-to-r from-teal-400/60 to-teal-300/40 bg-clip-text text-transparent"',
      ),
    ).toBeNull()
    // The direction keyword is not a stop: `to-r` must not read as a colour.
    expect(gradeClippedTextClasses('"bg-gradient-to-r bg-clip-text text-transparent"')).toBeNull()
  })

  it('still points at something — the rule has a live subject', () => {
    // A rule narrowed until it matches nothing reports CLEAN forever, and this
    // one is narrow by construction: three utilities have to co-occur in one
    // quoted string. The zero assertion below is worth nothing without this
    // one beside it.
    const sites = clippedTextSites()
    expect(
      sites.map((site) => `${site.file}:${site.line}`),
      'rule 4 matches no clipped text anywhere in the product. Either the ' +
        'headline changed shape or the scanner stopped seeing it — find out ' +
        'which before believing the zero below.',
    ).not.toEqual([])
    expect(sites.some((site) => site.file === 'app/(marketing)/page.tsx')).toBe(true)

    // The field of view is wider than the tree currently exercises: every
    // `bg-clip-text` in the product today is a GRADIENT, so the solid half of
    // this rule matches nothing here and a count could never prove it works.
    // Pin the widening directly instead — same lesson rule 5 wrote down when
    // its own sweep removed its subjects.
    expect(isClippedText('"bg-teal-400 bg-clip-text text-transparent"')).toBe(true)
  })

  it('no clipped text in the product is too pale to read', () => {
    // THE GATE. Zero, no ceiling — the reason rules 1 and 3 hold there, in a
    // sharper form: this is the one contrast shape where the browser gate AND
    // all three source rules above were blind at once, so a number here would
    // be room in the only room nothing else can see into.
    expect(
      scanForUnreadableClippedText().map(describeFinding),
      'with bg-clip-text the BACKGROUND is the ink, so every colour it paints ' +
        'with — each gradient stop, or the one solid fill — has to read as ' +
        'text on the page: teal-600 (5.09) or deeper on the brand ramp. axe ' +
        'cannot see a clipped background in either spelling, so this is the ' +
        'only gate that will ever tell you.',
    ).toEqual([])
  })

  it('carries no exemption it has stopped describing', () => {
    // ZERO entries today. There was exactly one — the night-band headline
    // (DREAMCRM-54) — and this detector is what found it the moment its
    // subject went (DREAMCRM-69): the hero turned white, the class string
    // stopped matching, and this went red naming the row. That is the detector
    // doing its whole job, so it stays pointed at an empty list rather than
    // being deleted with the entry. The loop below is then vacuous by
    // construction and is left in deliberately — it is the `why`-quality bar a
    // future entry has to clear, and re-adding it later is how a row lands
    // without one.
    expect(
      deadClippedTextExemptions().map((e) => `${e.file} — ${e.classes}`),
      'this exemption no longer matches any call site. Re-derive it or delete it.',
    ).toEqual([])
    for (const e of CLIPPED_TEXT_EXEMPTIONS) {
      expect(e.why.length, 'every exemption states why in the source').toBeGreaterThan(80)
    }
  })

  /**
   * THE TWO ASSERTIONS THAT USED TO STAND HERE, AND WHY THEY ARE GONE.
   *
   * The night-band exemption shipped with two guards beside it (#587): a
   * NUMERIC half re-deriving its `why` from the palette (`teal-300` really is
   * 1.88 on white AND really is 9.36 on `gray-950` — both directions, because
   * the exemption disputed the ground rather than the measurement), and a
   * STRUCTURAL half asserting its PREMISE — the exempted span had to still sit
   * inside a `<section>` carrying `bg-gray-950` and rendering `NightSky`.
   *
   * That second one existed because moving the hero back to white left every
   * OTHER assertion in this file green, `deadClippedTextExemptions` included:
   * a detector that asks "does the class string still match something" cannot
   * notice that the GROUND under it changed. `BRAND.md` Part 7 wrote down, in
   * advance, that turning the hero white would turn these red on purpose.
   *
   * It did, and they did — both of them, naming the entry (DREAMCRM-69). The
   * exemption was then deleted rather than weakened, so both guards have no
   * subject left: an assertion about an entry that no longer exists is the
   * dead-guard shape they were built to prevent. Rule 4 now grades the
   * headline's stops against the ground they really ride and passes them on
   * the measurement (`teal-600` 5.09, `violet-700` 6.14, `fuchsia-700` 6.27),
   * which is the state an exemption is a detour from.
   *
   * WHAT SURVIVES THEM is the shape, and it is written on
   * `CLIPPED_TEXT_EXEMPTIONS` itself as step 4: an exemption owes a premise
   * assertion, not only a row. The next entry copies that, not this comment.
   */

  /**
   * THE REST OF BRAND.md PART 7, for the same reason.
   *
   * THE BAND RETIRED; THE FOOTER DID NOT (DREAMCRM-69). This test used to
   * grade the night hero's ten pairs. The owner reversed the dark hero on
   * DREAMCRM-67, so six of those pairs — the luminous accents, the raised
   * card, and the inverted dark-ink-on-a-teal-fill button — no longer paint
   * anywhere, and asserting them would be a guard describing a surface that
   * does not exist. They were dropped WITH their subject rather than left to
   * report green about nothing.
   *
   * What is left is the pairs that are still live, and they are all the
   * FOOTER's: `bg-gray-950` in both themes, and `BRAND.md` Part 7 is explicit
   * that its discipline "does NOT retire" there. The footer is the exact shape
   * this Part was written for — a dark band inside a light-mode page — and
   * every reason it defeats the automated graders still holds:
   *
   *   - no `.dark` scope, so `dark-mode-parity.test.ts` structurally cannot
   *     see it (it only fires where a `dark:` half and a light half disagree);
   *   - axe grades ink against `background-color` and reports a gradient as
   *     `incomplete` rather than failing it;
   *   - the pairs are assembled in `className` strings, not declared as
   *     design-system tokens.
   *
   * So the hand-graded table IS the gate for this surface, which means the
   * table itself needs something checking it or it is a list of numbers
   * somebody typed once. That is this test, and it re-derives every row from
   * `app/css/style.css` so a ramp edit re-grades the footer rather than
   * quietly invalidating a document.
   *
   * The daylight ground the rest of the site now sits on is NOT graded here on
   * purpose: rules 1-4 in `class-pairs.ts` grade white-ground pairs against the
   * ground they actually ride, automatically, at zero tolerance. A second
   * hand-maintained table over the same pairs is how two guards start
   * disagreeing about one line. The one daylight risk that stays invisible to
   * them is the BLOOM under dark ink — a `background-image` again — and that
   * is graded by rendering the page, not by arithmetic over tokens (Part 7's
   * decorative-layer grader, re-pointed in move 5).
   */
  it('every ink BRAND.md Part 7 allows on the marketing footer clears AA there', () => {
    // BRAND.md Part 2: the footer's ground is `gray-950`. Read from the
    // palette rather than written as #10182e, so a ramp edit re-grades this.
    const footer = token(LIGHT, 'gray-950')

    const pairs: Array<[string, Rgb, Rgb]> = [
      // Every ink `MarketingFooter` actually renders, in the order it renders
      // them: the forced-white wordmark, the column headings, the links and
      // the tagline body.
      ['white wordmark on the ground', hexToRgb('#ffffff'), footer],
      ['gray-300 column headings', token(LIGHT, 'gray-300'), footer],
      ['gray-400 links and body', token(LIGHT, 'gray-400'), footer],
    ]

    const failures = pairs
      .map(([what, fg, bg]) => [what, contrast(fg, bg)] as const)
      .filter(([, ratio]) => ratio < AA)
      .map(([what, ratio]) => `${what} = ${ratio.toFixed(2)}`)

    expect(
      failures,
      'BRAND.md Part 7 is the ONLY gate the marketing footer has — no source ' +
        'rule and no axe stop can see a dark band inside a light-mode page. A ' +
        'pair in that table that does not clear AA is a live defect on every ' +
        'marketing page.',
    ).toEqual([])

    // gray-500 is the pair that was actually live once: the marketing footer
    // rendered it on gray-950 at 3.42 for months, under a nightly contrast
    // gate, because a dark band in a light page has no `.dark` scope. Pinned
    // as a NEGATIVE so "labels and captions use gray-400, never gray-500" stays
    // a measured rule rather than a preference. It is the ONE assertion here
    // that survived the band unchanged, and it is the one whose defect was
    // real — which is the argument for keeping the footer hand-graded now that
    // it is the last dark surface on the site.
    expect(contrast(token(LIGHT, 'gray-500'), footer)).toBeLessThan(AA)

    // And the footer is still THERE. Without this the three rows above grade a
    // surface nobody renders — the same premise-versus-subject trap the
    // deleted night-band assertion was written for, one file over.
    const footerSrc = readFileSync(join(ROOT, 'components/marketing/ui.tsx'), 'utf8')
    expect(
      footerSrc,
      'MarketingFooter no longer rides bg-gray-950. Either it moved to the ' +
        'daylight ground — in which case these pairs are graded by ' +
        'class-pairs.ts rules 1-4 and this test should go with them — or ' +
        'something re-skinned it without re-grading it.',
    // `(?:[^"]*\s)?` rather than the `(?:^|[\s"])` spelling the night-band
    // assertion used: there the token sat mid-string after a space, here it
    // is the FIRST class in the attribute, so a leading-boundary alternative
    // that needs a character to match never fires. `(?![\w-])` rather than
    // `\b` — a hyphen is a non-word character, so `\b` would also match
    // inside `bg-gray-950-foo`. That is the trap the DREAMCRM-50 mutation
    // pass paid for twice.
    ).toMatch(/<footer className="(?:[^"]*\s)?bg-gray-950(?![\w-])/)
  })

  /**
   * THE STICKY HEADER'S FILL, GRADED AGAINST THE DARKEST THING IT EVER SLIDES
   * OVER — `BRAND.md` Part 7, DREAMCRM-72.
   *
   * The marketing header is `position: sticky` with a TRANSLUCENT fill, so the
   * surface under its nav ink is not `white` and not any declared token: it is
   * white composited at some alpha over whatever the page is showing at that
   * scroll position. Every gate in this repo grades ink against a declared
   * background on an ANCESTOR, and the thing under a sticky bar is a sibling
   * that happens to be passing beneath it — so axe, `dark-mode-parity` and
   * rules 1-6 in `class-pairs.ts` all correctly decline to see this pair. It
   * is the footer's problem in a second costume, and the answer is the same
   * one: grade it here, from the palette, on every run.
   *
   * THE WORST CASE IS THE FOOTER, and that is not hypothetical — it is what
   * the rail sits over for the last screenful of every page on the site.
   * `gray-950` is also the darkest surface the marketing site declares, so
   * nothing else can beat it.
   *
   * THE ALPHA IS READ OUT OF THE SOURCE rather than transcribed, which is the
   * whole point: the number this defends is a DECISION somebody could thin on
   * taste. The quietest nav ink (`gray-600`) over the footer lands at 5.63 /
   * **5.05** / 4.51 / **4.01** at `white/90` / `85` / `80` / `75`. The 80 row
   * is the one to read: it clears a 4.5 floor by ONE HUNDREDTH, which is Part
   * 7's "4.18 reads as nearly fine" in its sharpest form. Thinning the fill
   * turns this red naming the ratio; both directions were watched.
   *
   * THE ARITHMETIC IS EXACT FOR THE CASE IT GRADES, not a model of one: the
   * footer is a FLAT `gray-950` field, so `over()` is precisely what the
   * compositor does there. `backdrop-blur-xl` moves the mean of a flat field
   * by nothing, and over a varied field it averages toward the middle — i.e.
   * away from the extreme this grades. The bound is true either way, which is
   * the rule-6 method: when the real value is out of reach, grade against the
   * bound that makes your answer true whichever way it falls.
   */
  it('the sticky marketing header keeps its ink legal over the darkest surface it crosses', () => {
    const chrome = readFileSync(join(ROOT, 'components/marketing/chrome.tsx'), 'utf8')

    // ANCHORED TO EXACTLY ONE MATCH, not to the first one (Sentinel, #618).
    // Reading by `.exec` is correct today — `chrome.tsx` carries one
    // `bg-white/<alpha>` (the rail) and its other `bg-white` are opaque — but
    // the correctness is an ORDERING accident. If the megamenu card, the
    // mobile panel or the mobile Sign-in button ever takes an alpha AND sits
    // above the rail in the file, this assertion silently re-points at a
    // different element's number and goes on passing while the thing it names
    // is ungraded. That is the premise drifting out from under a test whose
    // whole argument is "the alpha is read out of the source rather than
    // transcribed", so the count is asserted rather than assumed.
    const fills = Array.from(chrome.matchAll(/bg-white\/(\d{1,3})/g))
    expect(
      fills.map((m) => m[0]),
      'MarketingHeader must carry EXACTLY ONE translucent `bg-white/<alpha>` ' +
        '— the sticky rail. None means it went opaque (its ink is then graded ' +
        'against a declared token and this test should go with the ' +
        'translucency) or the elevated state was re-spelled. More than one ' +
        'means this test can no longer tell which element it is grading: ' +
        'name the rail explicitly before adding a second translucent white.',
    ).toHaveLength(1)

    const alpha = Number(fills[0][1]) / 100
    const rail = over(hexToRgb('#ffffff'), alpha, token(LIGHT, 'gray-950'))

    // Every ink the header renders on that fill, in the order it renders them.
    const pairs: Array<[string, Rgb]> = [
      ['gray-950 active nav + ghost labels', token(LIGHT, 'gray-950')],
      ['gray-700 Sign in', token(LIGHT, 'gray-700')],
      ['gray-600 inactive nav + the menu button', token(LIGHT, 'gray-600')],
    ]

    const failures = pairs
      .map(([what, ink]) => [what, contrast(ink, rail)] as const)
      .filter(([, ratio]) => ratio < AA)
      .map(([what, ratio]) => `${what} = ${ratio.toFixed(2)} over white/${fills[0][1]} on gray-950`)

    expect(
      failures,
      'The sticky header composites over the page, and the darkest thing it ' +
        'ever crosses is the gray-950 footer. No source rule and no axe stop ' +
        'can see that pair — the surface is a sibling scrolling underneath, ' +
        'not an ancestor. Thinning the fill is a MEASUREMENT, never a ' +
        'preference: white/80 clears the floor by 0.01 and white/75 puts the ' +
        'nav ink at 4.01, which is the shape BRAND.md Part 7 keeps as its ' +
        'example of a failure that reads as passing.',
    ).toEqual([])
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

  it('has no opinion about a translucent tint on the night band', () => {
    // ASKED AND ANSWERED for DREAMCRM-54, rather than assumed. The night band
    // (BRAND.md) draws every chip as a TINT over the dark ground — an alpha
    // fill — not as a solid one, so rule 5's window is shut on it twice over:
    // `gradeToneFillClasses` returns null the moment either half carries an
    // alpha suffix, and a tint written as an inline `rgb(… / .13)` is not a
    // `bg-<ramp>-<step>` utility at all, so there is nothing for the scanner
    // to read.
    expect(gradeToneFillClasses('"rounded-full bg-emerald-400/13 text-emerald-200"')).toBeNull()
    expect(gradeToneFillClasses('"rounded-full bg-amber-400/15 text-amber-200"')).toBeNull()

    // Which is the right answer and NOT a licence: the registry's argument is
    // that a shape with one answer must not acquire a second, and it holds for
    // a tint too. It is just that the night band's tints have no registry
    // entry to be off — TONE_PILL is the wash for a LIGHT ground, and the ink
    // steps it pairs are unreadable on a dark one. So a solid tone chip on the
    // night band would fire this rule correctly, and the answer would be to
    // extend the registry rather than to write a local recipe.
    expect(gradeToneFillClasses('"rounded-full bg-emerald-400 text-emerald-200"')).not.toBeNull()
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

  /**
   * THE EXEMPTION'S PREMISE, CHECKED STRUCTURALLY (DREAMCRM-63).
   *
   * The detector above asks whether the exemption still MATCHES something.
   * Read the `why` and notice it never claims that: it claims the pairing is
   * **already decided in ONE place** — `VARIANT_CLASSES`, the design system's
   * own single home for a button fill — which is the exact thing rule 5
   * protects rather than the thing it forbids. That argument stops being true
   * the moment the string moves. Copy `bg-rose-600 hover:bg-rose-700
   * text-white` onto an ad-hoc element in this same file, delete
   * `VARIANT_CLASSES`, or fold `danger` into a `cn()` call, and the exemption
   * goes on pardoning a fresh local guess while the detector stays green —
   * the `public-action-tenancy` lesson wearing rule 5's clothes.
   *
   * So the fact asserted here is the one the `why` actually rests on: this
   * string is still the `danger` VALUE inside that record. Not present in the
   * file, not present in some object — that one.
   */
  it("the exempted danger fill is still VARIANT_CLASSES' own entry, not a loose copy", () => {
    // `filter` plus a length pin rather than `find` — see the brand-fill
    // premise test for why (Quinn's review of #594).
    const forFile = TONE_FILL_EXEMPTIONS.filter(
      (e) => e.file === 'components/ui/action-button.tsx',
    )
    expect(
      forFile.length,
      'this test grades ONE exemption for components/ui/action-button.tsx. A ' +
        'second tone-fill exemption in that file needs its own premise assertion.',
    ).toBe(1)
    const exemption = forFile[0]
    expect(exemption, "ActionButton's danger variant is the subject of this test").toBeTruthy()

    const src = readFileSync(join(ROOT, exemption!.file), 'utf8')
    const record = src.match(/const VARIANT_CLASSES\b[^=]*=\s*\{([\s\S]*?)\n\}/)
    expect(
      record,
      'VARIANT_CLASSES is gone from ' + exemption!.file + '. The exemption ' +
        'above is allowed ONLY because that record is the single home for a ' +
        'button fill; with no record there is no single home, and the pairing ' +
        'is the fresh local guess rule 5 exists to refuse.',
    ).toBeTruthy()

    const danger = record![1].match(/\bdanger:\s*'([^']*)'/)
    expect(
      danger?.[1],
      'the exempted class string is no longer the `danger` value of ' +
        'VARIANT_CLASSES. It may still appear somewhere in the file — that is ' +
        'what the detector above checks, and it is not the claim this ' +
        'exemption makes.',
    ).toBe(exemption!.classes)
  })

  /**
   * AND ITS NUMERIC HALF, re-derived rather than trusted from the `why`.
   *
   * The exemption is a NOTE on the punch list rather than a defect only
   * because the pairing clears AA — narrowly, at 4.53 against a 4.5 floor,
   * which is the margin `TONE_PILL` calls a coincidence. Re-point `rose-600`
   * by a hair and that sentence becomes false: rule 5 would still be quiet
   * (it is not a ratio rule) and the detector would still be green, and the
   * repo would be pardoning white text below the floor on the one button that
   * deletes things. Both halves, the way the night-band assertion does it.
   */
  it('the exempted danger fill still clears AA, which is what makes it a note', () => {
    const white = hexToRgb('#ffffff')
    const resting = contrast(white, token(LIGHT, 'rose-600'))
    const hover = contrast(white, token(LIGHT, 'rose-700'))

    expect(resting, 'white on rose-600, the resting danger fill').toBeGreaterThanOrEqual(AA)
    // The hover half is graded here because a hover class carries no ink of
    // its own for the scanner to pair with, and this exemption names both.
    expect(hover, 'white on rose-700, the hover danger fill').toBeGreaterThanOrEqual(AA)
    expect(hover, 'hover must not walk the label back toward the floor').toBeGreaterThan(resting)

    // The number the `why` and docs/UI-BEST-VERSION.md both quote.
    expect(resting.toFixed(2)).toBe('4.53')
  })

  /**
   * THE ONE SOLID FILL IN THE PRODUCT THAT NO REGISTRY WINDOW REACHES.
   *
   * The trial banner escalates violet → amber → orange → rose, and ORANGE IS
   * NOT ONE OF THE SIX v3 TONES. Three of those tiers point at `TONE_FILL`
   * (batch 64); the orange one cannot, because the registry has no entry for a
   * seventh hue — so it is hand-spelled at the call site, and rule 5's window
   * (the 300-600 steps of the six tone ramps) does not contain it either.
   *
   * That combination is the thing worth pinning: a deliberate deferral is fine,
   * an UNWATCHED line is not. Raised in review of #597 — "a future edit to that
   * line fails nothing." So this grades the recipe the way rule 5 would have,
   * by hand, on the one pairing rule 5 structurally cannot see.
   *
   * Whether the escalation should reach outside the tone set at all is a design
   * decision and is deferred in docs/UI-BEST-VERSION.md. Deleting this test is
   * not how that decision gets made.
   */
  it('pins the trial banner’s off-registry orange tier, which rule 5 cannot see', () => {
    const src = readFileSync(join(ROOT, 'components/ui/trial-banner.tsx'), 'utf8')
    const RESTING = 'bg-orange-500 text-gray-900 hover:bg-orange-400'
    expect(
      src,
      'the urgent tier’s recipe moved. It is the one solid fill outside every ' +
        'registry window, so re-measure it here rather than trusting the ramp.',
    ).toContain(RESTING)

    const ink = utilityColor(LIGHT, 'gray-900')!
    for (const fill of ['orange-500', 'orange-400']) {
      expect(
        contrast(ink, utilityColor(LIGHT, fill)!),
        `gray-900 on ${fill} — the ${fill === 'orange-500' ? 'resting' : 'hover'} pair`,
      ).toBeGreaterThanOrEqual(AA)
    }

    // The NEGATIVE half, so the pin grades the DECISION and not just a ratio:
    // white on this fill is what the tier used to spell, and it fails. Without
    // this, a revert to `text-white` would pass the assertions above.
    expect(
      contrast(utilityColor(LIGHT, 'white')!, utilityColor(LIGHT, 'orange-500')!),
      'white on orange-500 must stay below the floor — it is why the ink is dark',
    ).toBeLessThan(AA)
    expect(src).not.toContain('bg-orange-500 text-white')
  })
})
