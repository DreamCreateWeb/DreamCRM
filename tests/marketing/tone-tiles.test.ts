import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from '../a11y/palette'
import { TONE_TILE_TONE, TILE_TONE_CLASSES } from '@/lib/marketing/tone-tiles'

/**
 * THE CHECK-MARK VETO, HELD AT ZERO — `BRAND.md` Part 3, DREAMCRM-71.
 *
 * The owner vetoed *"bland check marks as icons"* on DREAMCRM-67, and the
 * count of call sites owing the fix went 11 → 10 → 9 across three issues
 * because two of them were removed by unrelated work while the number sat
 * written down in prose. The issue that closed it said the veto is finished
 * when the tree returns NOTHING, not when nine sites have been edited. That
 * sentence is only true if something keeps asking, so this file is what asks.
 *
 * WHY THE NAME IS NOT THE RULE, and this is the part worth reading before
 * changing anything here. `CheckIcon` is gone from
 * `components/marketing/ui.tsx`, so re-importing it is already a BUILD error
 * and a guard asserting its absence would be asserting what `tsc` asserts —
 * green forever, and blind to the way the defect will actually come back.
 * It comes back as somebody writing a fresh feature list and hand-rolling a
 * tick into an inline `<svg>`, under any name or none.
 *
 * SO THE RULE IS STATED IN ITS OWN TERMS, GEOMETRICALLY (§2d: "when your rule
 * is about a tool's behaviour, state the property in your own terms"). A bland
 * tick is a path that is *entirely* a check: one subpath, three points, x
 * always moving right, the middle point the lowest and the last the highest.
 * `isCheckPolyline` below computes exactly that from the `d` attribute, so it
 * catches a tick written with `l` or with implicit lineto, spaced or
 * comma-separated, at any scale, under any component name.
 *
 * WHAT THAT DEFINITION DELIBERATELY LETS THROUGH, because a guard that fires
 * on correct code is a guard people switch off:
 *
 *   - **A check that is PART of a composite glyph.** The homepage's "Online
 *     booking" pillar draws a calendar with a tick inside it. It has other
 *     subpaths, so it is not entirely a check — and it is not the vetoed
 *     thing either: it says "a booking, confirmed", which is the whole
 *     principle the tone tiles are built on. The "one subpath" clause is what
 *     draws that line, and it draws it without an exemption entry.
 *   - **`MatrixMark`**, which is exempted BY NAME below with its premise
 *     asserted, because it is the one place on this site where a tick is
 *     carrying information rather than decorating a bullet.
 *
 * WHAT IT CANNOT SEE, stated so nobody reads a green run as more than it is:
 *
 *   - **A FILLED tick.** The closed-path guard below rejects anything with a
 *     `Z`/`z`, so a solid check (`M13.5 4.2 6.1 11.6 2.5 8l-1.2 1.2 4.8 4.8
 *     8.6-8.6Z`) walks straight past. Stroked-polyline-only is a deliberate
 *     scope — the filled form has never appeared in these trees, and covering
 *     it means grading filled AREAS rather than three points, which is a
 *     different instrument. This limit is repeated in the
 *     `blocking-assertions` entry in `scripts/review-gate.mjs`, because that
 *     comment is what the rulebook entry gets written from and a gate rule
 *     recorded as stronger than it is, is wrong quietly.
 *   - A tick drawn as a `<polyline>`, as a background image, as a font glyph,
 *     or as the character "✓" in copy. The first three have never appeared
 *     here and the fourth is a copy decision rather than an icon.
 *
 * If any of them shows up, widen the detector rather than adding an exemption
 * for it.
 *
 * EVERY CASE HERE WAS WATCHED FAIL (§2d), and on the REAL shape rather than a
 * stand-in — the deleted `CheckIcon` body (`M2.5 8.5l3.5 3.5 7.5-8`) pasted
 * back into `app/(marketing)/pricing/page.tsx` as an inline `<svg>` with no
 * component around it, which is the shape the next regression will have. The
 * detector's own cases were mutated in both directions: forcing
 * `isCheckPolyline` to always-true reddens the tree scan, always-false reddens
 * the positive cases below.
 */

/**
 * The trees `BRAND.md` governs. The dashboard's own `CheckIcon`s are a
 * separate local definition in a different design language and are out of
 * scope — `BRAND.md`'s scope boundary, and DREAMCRM-71 says so explicitly.
 *
 * `lib/marketing` is here because THIS CHANGE put marketing vocabulary in it
 * (`tone-tiles.ts`), and Sentinel's review made the point that an enumerated
 * root list stops matching the site the day content moves. The drawings live
 * in `components/marketing` today; the moment one follows the vocabulary into
 * `lib/`, a two-entry list would have gone quietly blind. #615 is the
 * precedent for that failure and it is cheaper to widen now than to discover.
 *
 * KEEPING THE `palette` IMPORT IS LOAD-BEARING, and not for the colour maths.
 * `tests/guards/review-gate.test.ts` derives the intake list two ways — files
 * that walk a product root, and files that grade the palette — and the
 * tree-walk half matches a BARE quoted root (`/(^|[^\w])'(app|components|lib)'/`).
 * Every root below is a subdirectory, so that half does not see this file; it
 * is the `ROOT` import on line 4 that puts it on the list. **Do not replace
 * that import with `process.cwd()`** — it reads like a harmless simplification
 * and it would drop this guard out of intake detection entirely. Forge found
 * this on the #617 sweep and is routing the underlying regex (it should match
 * a product root at a path boundary, so `'app'` and `'app/(marketing)'` both
 * count) to whoever owns the gate machinery; until that lands, this comment is
 * the tripwire.
 */
const MARKETING_ROOTS = ['app/(marketing)', 'components/marketing', 'lib/marketing']

/**
 * The one tick on this site that survives the veto, and why.
 *
 * Exact component rather than whole file (the `class-pairs` lesson: a
 * file-wide exemption is a door — `components/marketing/ui.tsx` is 1,400 lines
 * and pardoning all of it would pardon every list mark on the site).
 */
const CHECK_EXEMPTIONS = [
  {
    component: 'MatrixMark',
    file: 'components/marketing/ui.tsx',
    why:
      'The comparison matrix renders yes / partial / no, and the tick is the ' +
      'VALUE rather than a bullet ornament — it is the only check on the site ' +
      'a reader is meant to read rather than skim past. It is already a tone ' +
      'tint carrying that tone deep ink (the tone-tile shape, arrived at ' +
      'before the tiles existed) and it carries an `sr-only` word, so the ' +
      'meaning never rides on the glyph alone. Replacing it with a subject ' +
      'glyph would delete the distinction it exists to draw.',
  },
] as const

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const marketingFiles = MARKETING_ROOTS.flatMap((r) => walk(join(ROOT, r))).map((f) => ({
  file: relative(ROOT, f).replace(/\\/g, '/'),
  source: readFileSync(f, 'utf8'),
}))

/**
 * Is this `d` attribute ENTIRELY a check mark?
 *
 * One subpath, move + lines only, exactly three points, x monotonic, the
 * middle point the lowest on the canvas and the far end the highest. In SVG
 * coordinates "lowest" is the largest y, which is the one thing here that
 * reads backwards and is why it is spelled out rather than left to a `<`.
 *
 * TWO THINGS THE FIRST VERSION GOT WRONG, both found by Sentinel's review of
 * #617 and both worth keeping written down, because they are the difference
 * between a rule and a rule-shaped object:
 *
 *   - **Each segment is resolved against ITS OWN command letter.** The first
 *     version decided "is this path relative?" once for the whole `d` and ran
 *     every segment through that one answer. SVG lets a path mix them freely,
 *     and the single most common tick in this repo does exactly that
 *     (`M5 13l4 4L19 7` — absolute move, relative line, absolute line). Under
 *     one-mode arithmetic its points land somewhere else entirely and the
 *     shape test grades a triangle that was never drawn.
 *   - **Traversal direction is normalised before the shape is graded.** The
 *     first version demanded `a.x < b.x < c.x`. A tick drawn from the long
 *     tail's tip inward — Lucide's `check`, most icon fonts — runs leftward,
 *     and is the SAME MARK ON SCREEN. Grading the point order rather than the
 *     figure meant half the world's check marks read as "not a check mark".
 *
 * Both were false NEGATIVES, which is the direction that matters here: this
 * function is the whole veto, so a miss is the guard reporting CLEAN over a
 * live defect. The `M5 13l4 4L19 7` spelling is in this repo five times, twice
 * on public clinic-site surfaces next door to `app/(marketing)`.
 *
 * Exported shape is deliberate: the tests below feed it the real spellings,
 * because an absence assertion over a clean tree cannot tell a working
 * detector from one that has quietly stopped matching.
 */
export function isCheckPolyline(d: string): boolean {
  const body = d.trim()
  // A second `m`/`M` anywhere after the first is a second subpath, which is a
  // composite glyph rather than a bare tick. `Z`/`z` closes the figure, which
  // makes it a filled shape rather than a stroked polyline.
  if (!/^[Mm]/.test(body)) return false
  if (/[MmZz]/.test(body.slice(1))) return false
  // Curves, arcs and axis-locked segments are not a tick.
  if (/[CcSsQqTtAaHhVv]/.test(body)) return false

  // Split into command runs — only `M`/`m` and `L`/`l` can have survived the
  // guards above — and resolve each run against its OWN letter's case.
  const runs = body.match(/[MmLl][^MmLlZz]*/g)
  if (!runs) return false

  const pts: Array<[number, number]> = []
  let cursor: [number, number] = [0, 0]
  for (const run of runs) {
    const relative = run[0] === run[0].toLowerCase()
    const nums = (run.slice(1).match(/-?\d*\.?\d+/g) ?? []).map(Number)
    if (nums.length === 0 || nums.length % 2 !== 0) return false
    // Every pair after the first in a run is an implicit lineto, and it
    // inherits the run's own case — which is exactly what the SVG spec says
    // and exactly what the single-mode version could not express.
    for (let i = 0; i < nums.length; i += 2) {
      cursor = relative
        ? [cursor[0] + nums[i], cursor[1] + nums[i + 1]]
        : [nums[i], nums[i + 1]]
      pts.push(cursor)
    }
  }
  if (pts.length !== 3) return false

  // A tick drawn from its long tail inward traverses right to left and is the
  // same mark on screen. Normalise, then grade the FIGURE.
  let [a, b, c] = pts
  if (a[0] > b[0] && b[0] > c[0]) [a, b, c] = [c, b, a]

  const rightward = a[0] < b[0] && b[0] < c[0]
  const middleIsLowest = b[1] > a[1] && b[1] > c[1]
  const endIsHighest = c[1] < a[1]
  return rightward && middleIsLowest && endIsHighest
}

/** Every `d="…"` in a file, with the line it sits on. */
function pathsIn(source: string): Array<{ d: string; line: number }> {
  const out: Array<{ d: string; line: number }> = []
  const re = /\bd="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    out.push({ d: m[1], line: source.slice(0, m.index).split('\n').length })
  }
  return out
}

/**
 * Which top-level binding does this line sit inside?
 *
 * ARROW COMPONENTS COUNT, and that is not tidiness. The first version of this
 * matched `function X` only, and a mutation put a bare tick inside
 * `const FeatureTick = () => …` placed between `MatrixMark` and the next
 * `function` declaration: the tree scan went GREEN with the defect live,
 * because the nearest preceding `function` was still `MatrixMark` and its
 * exemption pardoned somebody else's element. That is §2d's "the right string
 * in the wrong scope" — the boundary a search needs was not inside the regex,
 * it was the region the regex ran over. Both declaration forms are matched
 * now, and the mutation reddens the scan.
 */
function enclosingBinding(source: string, line: number): string | undefined {
  const before = source.split('\n').slice(0, line).join('\n')
  const re = /^(?:export )?(?:function|const|class) (\w+)/gm
  let last: string | undefined
  let m: RegExpExecArray | null
  while ((m = re.exec(before))) last = m[1]
  return last
}

/** Which exemption, if any, owns the component this line sits inside. */
function owningExemption(source: string, line: number) {
  const binding = enclosingBinding(source, line)
  return CHECK_EXEMPTIONS.find((e) => e.component === binding)
}

describe('the check-mark veto stays closed (BRAND.md Part 3, DREAMCRM-71)', () => {
  it('the detector recognises every tick this site has actually shipped', () => {
    // The deleted `CheckIcon` body, verbatim from the commit that removed it.
    expect(isCheckPolyline('M2.5 8.5l3.5 3.5 7.5-8')).toBe(true)
    // `MatrixMark`'s yes-tick — implicit lineto, absolute, comma-free.
    expect(isCheckPolyline('M2 6.5 4.5 9 10 3')).toBe(true)
    // The same shape at dashboard scale and with commas, which is how the two
    // out-of-scope `app/(default)` copies are written.
    expect(isCheckPolyline('M4,12.5 9,17.5 20,6.5')).toBe(true)
  })

  /**
   * THE SPELLINGS THE FIRST VERSION WALKED PAST — Sentinel's REQUEST CHANGES
   * round on #617, and the reason this block exists separately from the one
   * above.
   *
   * The originals were the three ticks that happened to be IN HAND when the
   * rule was written, and all three share a habit: a single line-command case
   * throughout, drawn left to right. Grading only those proved the detector
   * could see the paths it had been shown — which is the asymmetry §2d keeps
   * naming. It could not see either of these, and both causes were geometric:
   *
   *   - **Mixed absolute/relative in one path.** The mode was resolved ONCE
   *     for the whole `d`, so `M…l…L…` ran every segment through the wrong
   *     arithmetic and the points came out somewhere else entirely.
   *   - **Right-to-left traversal.** The shape test demanded `a.x < b.x < c.x`,
   *     and a tick drawn from the long tail's tip inward runs leftward. Same
   *     mark on screen, reversed point order, detector silent.
   *
   * THE FIRST OF THOSE IS NOT HYPOTHETICAL: `M5 13l4 4L19 7` is in this
   * repository five times as of this commit, and two of them
   * (`components/clinic-site/success-well.tsx`,
   * `components/clinic-site/insurance-verifier-form.tsx`) are public
   * clinic-site surfaces — the nearest neighbour to `app/(marketing)` and the
   * likeliest thing an author building a new marketing section copies from. So
   * the realistic regression was: lift that tick, drop it in a feature list,
   * and the scan reports CLEAN with the defect live.
   */
  it('the detector recognises the tick spellings the first version missed', () => {
    // Heroicons v1 — mixed `l` then `L`. Five live copies in this repo.
    expect(isCheckPolyline('M5 13l4 4L19 7')).toBe(true)
    // Lucide `check`, verbatim — drawn right to left, then a relative segment.
    expect(isCheckPolyline('M20 6 9 17l-5-5')).toBe(true)
    // Ionicons-style, right to left at icon-font scale.
    expect(isCheckPolyline('M416 128L192 384l-96-96')).toBe(true)
  })

  it('the detector does NOT fire on the glyphs that replaced it', () => {
    // A composite glyph carrying a tick among other subpaths — the homepage's
    // "Online booking" pillar. Not the vetoed thing, and not matched.
    expect(
      isCheckPolyline('M3.5 10h17M8 2.5V7m8-4.5V7M8.5 14.5l2.5 2.5 4.5-5'),
    ).toBe(false)
    // Two tone-tile glyphs, one single-path and one multi-segment.
    expect(isCheckPolyline('M8.9 1.7 3.5 9.1h3.7l-.7 5.2 5.6-7.6H8.2Z')).toBe(false)
    expect(isCheckPolyline('M2.4 13.6h11.2M4.8 13.6V8.9M8 13.6V4.8M11.2 13.6V7.1')).toBe(false)
    // A three-point polyline that is NOT a tick: it goes down-right twice.
    expect(isCheckPolyline('M2 2l4 4 6 6')).toBe(false)
    // …and one that ends lower than it started, so it never rises into a tick.
    expect(isCheckPolyline('M2 4l4 6 6 -1')).toBe(false)
  })

  /**
   * THE NORMALISATION'S OWN BLAST RADIUS.
   *
   * Reversing right-to-left point order before grading is the fix for Lucide's
   * tick, and it is also the one change here that could make the detector
   * LOUDER than intended — every leftward three-point figure now reaches the
   * shape test where before it was rejected at the door. So the cases below
   * are the leftward twins of the negatives above, plus the shape most likely
   * to be mistaken for a tick.
   *
   * §2d's "mutate an exclusion detector in BOTH directions", applied to a
   * widening rather than to an exclusion: a guard that got broader owes proof
   * of where it still stops.
   */
  it('normalising direction does not make the detector fire on non-ticks', () => {
    // A CARET / chevron-up drawn right to left — middle is the HIGHEST point,
    // a tick upside down, and the nearest miss in the whole set.
    expect(isCheckPolyline('M14 12 8 5 2 12')).toBe(false)
    // The same caret drawn left to right.
    expect(isCheckPolyline('M2 12 8 5 14 12')).toBe(false)
    // A leftward descent — x monotonic, but it never rises at the end.
    expect(isCheckPolyline('M14 2 8 8 2 14')).toBe(false)
    // THE DISCRIMINATING ONE: leftward, x monotonic, middle genuinely the
    // lowest — everything a tick needs except that the far arm stops SHORT of
    // the near arm's height. That is a shallow V, not a check mark, and it is
    // `endIsHighest` alone that separates them.
    expect(isCheckPolyline('M14 6 8 12 2 4')).toBe(false)
    // Not x-monotonic at all — a zig-zag neither direction can normalise.
    expect(isCheckPolyline('M2 2 12 10 6 4')).toBe(false)
    // A mirrored tick IS a tick, and this is the assertion that keeps the
    // normalisation honest in the other direction — take it out and the three
    // spellings above go quiet again.
    expect(isCheckPolyline('M14 4 8 12 2 6')).toBe(true)
  })

  it('every glyph in the shipped tone-tile set stays clear of the detector', () => {
    // The registry is the population this guard runs over on every CI run, so
    // grading it here is not redundant with the tree scan — it names the
    // offending SUBJECT rather than a file and a line, which is what somebody
    // adding a glyph needs to see.
    const paths: string[] = []
    const ui = marketingFiles.find((f) => f.file === 'components/marketing/ui.tsx')!
    const registry = ui.source.slice(
      ui.source.indexOf('export const TONE_TILE_PATH'),
      ui.source.indexOf('const TILE_SIZE'),
    )
    for (const { d } of pathsIn(registry)) paths.push(d)
    expect(paths.length).toBeGreaterThan(20)
    expect(paths.filter(isCheckPolyline)).toEqual([])
  })

  it('no marketing file draws a bare check mark', () => {
    const offenders: string[] = []
    for (const { file, source } of marketingFiles) {
      for (const { d, line } of pathsIn(source)) {
        if (!isCheckPolyline(d)) continue
        if (owningExemption(source, line)) continue
        offenders.push(`${file}:${line} — d="${d}"`)
      }
    }
    expect(offenders, 'the owner vetoed bland check marks; use a ToneTile').toEqual([])
  })

  it('every exemption still names a component that exists, and still ticks', () => {
    // The premise, asserted rather than assumed (DREAMCRM-63's lesson): an
    // exemption whose subject has been renamed or has stopped drawing a check
    // is a door standing open onto nothing.
    for (const e of CHECK_EXEMPTIONS) {
      const entry = marketingFiles.find((f) => f.file === e.file)
      expect(entry, `${e.file} is gone — drop the exemption`).toBeDefined()
      const source = entry!.source
      expect(source).toMatch(new RegExp(`function ${e.component}\\b`))
      const ticks = pathsIn(source).filter(
        (p) => isCheckPolyline(p.d) && owningExemption(source, p.line)?.component === e.component,
      )
      expect(ticks.length, `${e.component} no longer draws a check — drop the exemption`).toBe(1)
    }
  })

  it('MatrixMark keeps the sr-only word its exemption rests on', () => {
    // The exemption's argument is "the meaning never rides on the glyph
    // alone". That is a claim about the markup, so it is checked rather than
    // recited — take the `sr-only` spans away and the pardon is unearned.
    const ui = marketingFiles.find((f) => f.file === 'components/marketing/ui.tsx')!.source
    const body = ui.slice(ui.indexOf('export function MatrixMark'))
    const matrix = body.slice(0, body.indexOf('\n/* ── Product mocks'))
    for (const word of ['Yes', 'Partial', 'No']) {
      expect(matrix).toContain(`<span className="sr-only">${word}</span>`)
    }
  })
})

describe('the tone-tile vocabulary', () => {
  it('every subject resolves to a tone that has a graded recipe', () => {
    // The union, the tone map and the path map are keyed
    // `Record<ToneTileGlyph, …>` so TypeScript already makes them exhaustive.
    // What it does NOT check is that a tone map entry points at a family that
    // exists, which is the one way the split across two files can rot.
    for (const [glyph, tone] of Object.entries(TONE_TILE_TONE)) {
      expect(TILE_TONE_CLASSES[tone], `${glyph} → ${tone}`).toBeDefined()
    }
  })

  it('no tile reaches for a tone the brand book withholds', () => {
    // `BRAND.md` Part 2: fuchsia has exactly two homes and a feature bullet is
    // neither; rose and amber are the registry's urgency signals and nothing
    // on a marketing benefit list is urgent. A tile wearing one of those would
    // pass every contrast guard in the repo and still be wrong.
    const withheld = ['rose', 'amber', 'fuchsia']
    for (const [tone, recipe] of Object.entries(TILE_TONE_CLASSES)) {
      for (const ramp of withheld) {
        expect(recipe.tile, `${tone} tile`).not.toContain(`-${ramp}-`)
        expect(recipe.tile, `${tone} tile`).not.toContain(`${ramp}-`)
        expect(recipe.dash, `${tone} dash`).not.toContain(`${ramp}-`)
      }
    }
  })

  it('every tile is a tone WASH carrying deep ink, which is what keeps it outside rule 5', () => {
    // `BRAND.md` Part 7, "Rule 5 and the tone tiles". `FILL_STEPS` in
    // `tests/a11y/class-pairs.ts` is 300–600, so a tile fill at 200 sits
    // outside that window BY CONSTRUCTION rather than by an exemption. If
    // somebody warms a tint to `-300` this fails, and it should: at that point
    // the recipe belongs in `TONE_FILL`, not here.
    for (const [tone, recipe] of Object.entries(TILE_TONE_CLASSES)) {
      const fill = recipe.tile.match(/bg-[a-z]+-(\d+)(?![\d.])/)
      const ink = recipe.tile.match(/text-[a-z]+-(\d+)(?![\d.])/)
      expect(fill, `${tone} has no fill`).not.toBeNull()
      expect(ink, `${tone} has no ink`).not.toBeNull()
      expect(Number(fill![1]), `${tone} fill is inside rule 5's window`).toBeLessThan(300)
      expect(Number(ink![1]), `${tone} ink is not the deep end`).toBeGreaterThanOrEqual(800)
    }
  })
})
