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
 * a tick drawn as a `<polyline>`, as a background image, as a font glyph, or
 * as the character "✓" in copy. The first three have never appeared in this
 * tree and the fourth is a copy decision rather than an icon. If one shows up,
 * widen the detector rather than adding an exemption for it.
 *
 * EVERY CASE HERE WAS WATCHED FAIL (§2d), and on the REAL shape rather than a
 * stand-in — the deleted `CheckIcon` body (`M2.5 8.5l3.5 3.5 7.5-8`) pasted
 * back into `app/(marketing)/pricing/page.tsx` as an inline `<svg>` with no
 * component around it, which is the shape the next regression will have. The
 * detector's own cases were mutated in both directions: forcing
 * `isCheckPolyline` to always-true reddens the tree scan, always-false reddens
 * the positive cases below.
 */

/** The two trees `BRAND.md` governs. The dashboard's own `CheckIcon`s are a
 *  separate local definition in a different design language and are out of
 *  scope — `BRAND.md`'s scope boundary, and DREAMCRM-71 says so explicitly. */
const MARKETING_ROOTS = ['app/(marketing)', 'components/marketing']

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
 * One subpath, move + lines only, exactly three points, x strictly rightward,
 * the middle point the lowest on the canvas and the last the highest. In SVG
 * coordinates "lowest" is the largest y, which is the one thing here that
 * reads backwards and is why it is spelled out rather than left to a `<`.
 *
 * Exported shape is deliberate: the tests below feed it the real historical
 * spellings, because an absence assertion over a clean tree cannot tell a
 * working detector from one that has quietly stopped matching.
 */
export function isCheckPolyline(d: string): boolean {
  const body = d.trim()
  // A second `m`/`M` anywhere after the first is a second subpath, which is a
  // composite glyph rather than a bare tick.
  if (!/^[Mm]/.test(body)) return false
  if (/[MmZz]/.test(body.slice(1))) return false
  // Curves, arcs and axis-locked segments are not a tick.
  if (/[CcSsQqTtAaHhVv]/.test(body)) return false

  // Only M/m and L/l survived the checks above. Three points is six numbers;
  // anything else is a different shape.
  const nums = body.slice(1).match(/-?\d*\.?\d+/g)
  if (!nums || nums.length !== 6) return false
  const n = nums.map(Number)

  // Resolve to absolute points. A LOWERCASE line command is relative to the
  // running point, and so is an implicit lineto that follows a lowercase
  // `m`; an uppercase `L`, or an implicit lineto after `M`, is absolute.
  // Anything mixing the two cases falls out as "not a tick" — a false
  // negative, which is the safe direction for a detector whose misses are
  // caught by an eye at review and whose false POSITIVES would train people
  // to add exemptions.
  const relativeLines = /l/.test(body) || (/^m/.test(body) && !/L/.test(body))
  const pts: Array<[number, number]> = [[n[0], n[1]]]
  for (let i = 2; i < 6; i += 2) {
    const prev = pts[pts.length - 1]
    pts.push(relativeLines ? [prev[0] + n[i], prev[1] + n[i + 1]] : [n[i], n[i + 1]])
  }

  const [a, b, c] = pts
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
