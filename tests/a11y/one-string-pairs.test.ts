import { describe, it, expect } from 'vitest'
import {
  describeFinding,
  gradeClasses,
  gradeSameStringPair,
  gradeToneFillClasses,
  isParitySubject,
  sameStringPairSites,
  scanForOffRegistryToneFills,
  scanForParityFailures,
  scanForUngradedStringPairs,
  scanForWhiteOnShallowBrand,
  UI_ROOTS,
} from './class-pairs'
import { AA, contrast, DARK, LIGHT, token, utilityColor } from './palette'

/**
 * THE ONE-STRING PAIR GUARD — rule 7.
 *
 * `./class-pairs.ts` carries the defect shape, the three ways a pair got past
 * rules 1–6, and how this rule partitions with the ones around it rather than
 * joining them on a line. This file is the gate, its red run, and the proof
 * that the partition actually holds over the real tree.
 *
 * IT HOLDS AT ZERO, for the reason `dark-mode-parity.test.ts` states at
 * length and one of its own. `e2e/axe-baseline.ts` is `{}` now, so a ceiling
 * here would be the only inventory of contrast debt in the repo — and this is
 * the shape that spent the whole program invisible precisely because three
 * separate rules each believed somebody else had it. A number here would be
 * room in the room nothing else can see into.
 *
 * THE POPULATION IT LANDED ON: 30 sites across 20 files, every one fixed in
 * the same batch (DREAMCRM-88, UI batch 68). Batch 64 measured 29 of them from
 * outside and wrote the reproduction into `docs/UI-BEST-VERSION.md`; the count
 * moved because the alpha-bail shape it had listed under one heading is
 * several sites, and because the tree moved under it in between. Zero is a
 * measured state of the tree, not an aspiration.
 */

/* ── the red run, kept permanently ───────────────────────────────────────── */

/**
 * A guard that has never failed has never been tested. The planted defects
 * below are one per way this scanner could be wrong, and the first three are
 * the three real gaps rather than variations on one:
 *
 *   1. BOTH halves overridden — the seven auth buttons, 4.01 in dark, the
 *      batch-58 defect surviving in the shape rule 1 treats as deliberate;
 *   2. NEITHER half overridden — an off-registry ramp on an off-registry wash,
 *      which `token-contrast` never sees because the design system does not
 *      declare it;
 *   3. exactly one half overridden BUT the override is a WASH — rule 1 bails
 *      on the whole chunk, taking a fully opaque, fully determined light
 *      rendering down with it;
 *   4. the CONDITIONAL form, because the last source guard in this repo whose
 *      red run passed (batch 57) matched only the literal spelling;
 *   5. a light side that passes and a dark side that does not, and
 *   6. the reverse, so the rule cannot degenerate into a one-theme checker.
 */
describe('the guard can actually fail', () => {
  it('reports BOTH halves overridden — the auth button, verbatim', () => {
    // As it sat on main on every sign-in, reset-password and accept-invite
    // screen. Rule 1 declined it by design ("a pair somebody chose"); nobody
    // had measured the pair they chose. White on teal-600 is 5.09 and fine;
    // near-black on teal-500 is 4.01, which is the batch-58 number.
    const found = gradeSameStringPair(
      '"btn w-full bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-gray-900"',
    )

    expect(found, 'the shape this rule was written for must be reported').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['dark'])
    expect(found!.failures[0].ratio).toBeCloseTo(4.01, 2)
  })

  it('reports NEITHER half overridden — a pair with no dark: anywhere', () => {
    // The public intake form's error line. `red` was never a v3 tone ramp, so
    // nothing in `TONE_PILL` or `TONE_FILL` declares this pairing and
    // `token-contrast` has no opinion about it. Both renderings are the same
    // two words, and both miss: the ramps are not re-tinted per theme, so the
    // defect renders identically in light and dark rather than only in one.
    const found = gradeSameStringPair('"text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"')

    expect(found, 'a single unprefixed pairing is graded by nobody else').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['light', 'dark'])
    expect(found!.failures[0].ratio).toBeCloseTo(2.94, 2)
  })

  it('reports the opaque LIGHT rendering under an alpha dark override', () => {
    // THE THIRD GAP, and the subtle one. Exactly one half carries the
    // override, so this looks like rule 1's — but the override is a wash, and
    // rule 1 skips the whole chunk rather than the one rendering it cannot
    // resolve. The light pair is fully determined at 4.12 and was graded by
    // nothing; the dark rendering is correctly left alone here too.
    const classes = '"mb-4 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded"'

    expect(gradeClasses(classes), 'rule 1 declines this chunk entirely').toBeNull()

    const found = gradeSameStringPair(classes)
    expect(found, 'the opaque half of it is still a real pairing').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['light'])
    expect(found!.failures[0].ratio).toBeCloseTo(4.12, 2)
  })

  it('reports the CONDITIONAL form, not just the literal one', () => {
    // batch 57's source scan passed its red run while the two worst real
    // instances were live, because both were conditional. Here the pair never
    // appears as one static string: it is a ternary branch inside a template
    // literal, which is how most of this repo's conditional styling is written.
    const source =
      "className={`rounded px-2 ${muted ? 'bg-gray-200 text-gray-500' : 'bg-white text-gray-800'}`}"

    const chunks = source.match(/(["'`])[^"'`]*\1/g) ?? []
    const found = chunks.map(gradeSameStringPair).filter((f) => f !== null)

    expect(found, 'a defect inside a ternary branch must be found').toHaveLength(1)
    expect(found[0]!.failures[0].ratio).toBeCloseTo(4.34, 2)
  })

  it('reports a pair that passes in light and fails only in dark', () => {
    // The kbd chip on the prospecting copilot bar. gray-500 on gray-100 is
    // 4.63 and clears; the overridden pair underneath it is 3.92. Both halves
    // moved, so rule 1 read the element as deliberate and never measured it.
    const found = gradeSameStringPair(
      "'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'",
    )

    expect(found, 'a dark-only failure must be reported').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['dark'])
  })

  it('reports a pair that passes in dark and fails only in light', () => {
    // The other direction, so the rule cannot become a dark-mode checker. The
    // prospecting pipeline's stage numeral: gray-500 on gray-200 is 4.34 in
    // light, and the dark override lands at 6.62.
    const found = gradeSameStringPair(
      "'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'",
    )

    expect(found, 'a light-only failure must be reported').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['light'])
  })
})

/* ── the partition, asserted rather than described ───────────────────────── */

describe('rule 7 and its neighbours partition one population', () => {
  it('declines every chunk rule 1 grades, by reading rule 1s own condition', () => {
    // `isParitySubject` IS rule 1's grading condition — not a copy of it — so
    // these two cannot drift into overlapping or into leaving a new gap. Both
    // spellings of the unpaired override, and the passing case too: rule 7
    // must decline a chunk rule 1 GRADES, not merely one rule 1 REPORTS.
    for (const classes of [
      '"rounded-full bg-teal-500 text-white dark:text-gray-900"',
      '"bg-teal-600 text-white dark:bg-teal-500"',
      '"bg-gray-100 text-gray-800 dark:bg-gray-700"',
    ]) {
      expect(isParitySubject(classes), classes).toBe(true)
      expect(gradeSameStringPair(classes), classes).toBeNull()
    }
    // And the first of those really is a live rule 1 finding, so the deferral
    // is to a rule that is looking rather than to an empty chair.
    expect(gradeClasses('"rounded-full bg-teal-500 text-white dark:text-gray-900"')).not.toBeNull()
  })

  it('leaves white on the shallow brand ramp to rule 2, in both themes', () => {
    // Rule 2 owns the brand-ramp cutoff and the one BRAND_FILL_EXEMPTIONS
    // entry — the aria-hidden RecallFunnelMock bar. Grading it here would
    // re-report a site that is deliberately pardoned one rule over.
    expect(gradeSameStringPair("'bg-teal-400 text-white'")).toBeNull()
    expect(gradeSameStringPair('"bg-teal-600 text-white dark:bg-teal-500 dark:text-white"')).toBeNull()
  })

  it('leaves the BASE pairing of a solid tone fill to rule 5 — and only that one', () => {
    // Rule 5 grades the base pairing against the TONE_FILL registry. It never
    // looks at a `dark:` override, so deferring the overridden dark rendering
    // too would hand it to nobody — the gap this whole rule exists to close.
    const offRegistry = "'bg-amber-500 text-white'"
    expect(gradeToneFillClasses(offRegistry), 'rule 5 is looking at this').not.toBeNull()
    expect(gradeSameStringPair(offRegistry)).toBeNull()

    const darkOnly = "'bg-gray-100 text-gray-800 dark:bg-amber-500 dark:text-white'"
    const found = gradeSameStringPair(darkOnly)
    expect(found, 'a tone fill declared only for dark is nobody elses').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['dark'])
  })

  it('cannot collide with rule 6, which needs a chunk carrying no bg- at all', () => {
    // By construction rather than by agreement: rule 6 bails on any `bg-`,
    // this one requires a base `bg-<colour>`.
    expect(gradeSameStringPair('"text-gray-400 dark:text-gray-500"')).toBeNull()
  })

  it('has no ink to pair with on a clipped-text chunk, which is rule 4s', () => {
    // `text-transparent` is not a palette word, so the ink lookup finds
    // nothing and this rule declines the shape whose whole point is that the
    // background IS the letterforms.
    expect(
      gradeSameStringPair('"bg-teal-400 bg-clip-text text-transparent font-black"'),
    ).toBeNull()
  })
})

describe('the guard does not report what it must not', () => {
  it('says nothing about a wash on either half of a rendering', () => {
    // An alpha ink or an alpha surface composites against an ancestor no
    // source scanner can resolve. Both spellings Tailwind accepts.
    expect(gradeSameStringPair('"bg-amber-500/15 text-amber-800"')).toBeNull()
    expect(gradeSameStringPair('"bg-violet-500/[0.08] text-violet-600"')).toBeNull()
    expect(gradeSameStringPair('"bg-gray-100 text-gray-400/70"')).toBeNull()
  })

  it('says nothing about a hover state, in either spelling', () => {
    // A resting pairing is what a person reads; a hover needs its own ancestor
    // context to grade honestly. `BOUNDARY` is what keeps these out — a `:`
    // before the utility is not a boundary character.
    expect(gradeSameStringPair('"bg-white text-gray-800 hover:text-gray-300"')).toBeNull()
    expect(gradeSameStringPair('"bg-white text-gray-800 dark:hover:bg-gray-100"')).toBeNull()
  })

  it('says nothing about a colour it cannot resolve', () => {
    // An arbitrary hex or a clinic-brand var is not in this repo's palette,
    // and guessing would be worse than declining.
    expect(gradeSameStringPair('"bg-[#4c7df0] text-gray-400"')).toBeNull()
    expect(gradeSameStringPair('"bg-[color:var(--c-brand)] text-gray-400"')).toBeNull()
  })

  it('says nothing about half a pair', () => {
    // Ink with no surface is rule 6's question; a surface with no ink has no
    // pairing at all. A `dark:`-only half with no base spelling is not a pair
    // either — the cascade fills the other end from somewhere unreadable here.
    expect(gradeSameStringPair('"text-gray-400"')).toBeNull()
    expect(gradeSameStringPair('"bg-gray-100"')).toBeNull()
    expect(gradeSameStringPair('"dark:bg-gray-700 dark:text-gray-400"')).toBeNull()
  })

  it('says nothing about a pair that reads', () => {
    expect(gradeSameStringPair('"bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-300"')).toBeNull()
    expect(gradeSameStringPair("'bg-rose-50 text-rose-700'")).toBeNull()
  })

  it('grades against the real palette, not a transcript of it', () => {
    // Pins the shared resolver the same way the sibling guards do, so a broken
    // cascade cannot make every assertion above pass vacuously.
    expect(contrast(utilityColor(DARK, 'gray-900')!, token(DARK, 'teal-500'))).toBeLessThan(AA)
    expect(contrast(utilityColor(LIGHT, 'rose-700')!, token(LIGHT, 'rose-50'))).toBeGreaterThanOrEqual(AA)
  })
})

/* ── the gate ────────────────────────────────────────────────────────────── */

describe('no ink and surface written together miss AA', () => {
  it('the scanner is pointed at the product, not at nothing', () => {
    // A rule narrowed until it matches nothing reports CLEAN forever, and an
    // absence assertion cannot tell that apart from a clean tree. The field of
    // view is the other half of the zero below.
    expect(UI_ROOTS).toEqual(['app', 'components', 'lib'])
    const sites = sameStringPairSites()
    expect(sites.length, 'rule 7 must still be able to see pairs at all').toBeGreaterThan(200)
  })

  it('every ink/surface pair written in one class string clears WCAG AA', () => {
    const findings = scanForUngradedStringPairs()

    expect(
      findings.map(describeFinding),
      'An element that writes its ink and its surface in the same class string ' +
        'carries both ends of its own pairing, so the pair is a fact rather than ' +
        'an estimate. Fix the colour — do not add an exemption here. ' +
        'See tests/a11y/class-pairs.ts rule 7 for the shape and the partition.',
    ).toEqual([])
  })

  it('no line in the tree is reported by this rule AND by a neighbour', () => {
    // The partition asserted over the real product rather than over six
    // planted strings. Two rules reporting one line is how a repo ends up
    // arguing about whose number is right instead of fixing a defect.
    const key = (f: { file: string; line: number }) => `${f.file}:${f.line}`
    const mine = new Set(scanForUngradedStringPairs().map(key))
    const neighbours = [
      ...scanForParityFailures(),
      ...scanForWhiteOnShallowBrand(),
      ...scanForOffRegistryToneFills(),
    ].map(key)

    expect(neighbours.filter((k) => mine.has(k))).toEqual([])
  })
})
