import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from '../a11y/palette'

/**
 * THE DRAWN-GRID VETO, HELD AT ZERO — `BRAND.md` Part 3, DREAMCRM-72.
 *
 * The owner vetoed it by name on DREAMCRM-67: *"i'm not a big fan of thin
 * black lines making up grids."* Move 1 deleted `NIGHT_GRID` and the veto was
 * recorded as closed. **It was closed at one call site.** A second drawn grid
 * — `HERO_DOT_GRID`, a `radial-gradient` dot tiled every 22px inside
 * `PageHero` — went on rendering on the other EIGHT marketing pages for three
 * more moves, because it lived under a different name in a different component
 * and the thing that said the veto was closed was a sentence in a document.
 *
 * That is the tone-tile census lesson arriving a second time (Part 8 move 3:
 * a number written in prose goes stale silently), so the answer is the same
 * one: something has to ask the tree. This file asks.
 *
 * WHY THE RULE IS NOT A NAME. `NIGHT_GRID` and `HERO_DOT_GRID` are both gone,
 * so asserting their absence would assert what `tsc` already asserts — green
 * forever, and blind to the way this comes back. It comes back as somebody
 * reaching for "just a subtle texture" and writing a fresh tiled gradient
 * under a fresh name.
 *
 * SO THE RULE IS STATED GEOMETRICALLY, IN ITS OWN TERMS: **a lattice is a
 * gradient that repeats on a fixed pitch.** Two spellings produce one:
 *
 *   1. a `backgroundImage` containing `gradient(` in the same object as a
 *      `backgroundSize` — the tile pitch, which is what turns one soft wash
 *      into a ruled field; and
 *   2. a `repeating-linear-gradient` / `repeating-radial-gradient`, which
 *      carries its own pitch and needs no `backgroundSize` at all.
 *
 * THE SECOND HAS ZERO INSTANCES TODAY and that is the argument for adding it
 * now rather than later (the #594 reasoning): a hole closed before anybody
 * writes one costs a test, and closed afterwards it costs a sweep as well.
 *
 * WHAT IT MUST NOT FIRE ON, AND THE DISTINCTION IS THE WHOLE GUARD. The film
 * grain (`DAY_GRAIN`, `components/marketing/ui.tsx`) is ALSO a tiled
 * background — an inline `feTurbulence` at 140px — and it is the opposite of
 * the vetoed thing: `BRAND.md` Part 1 asks for it by name, *"a fine film grain
 * so the light has a surface"*, and Part 7 grades the hero WITH it on. Noise
 * has no lattice in it; that is what makes it noise. The discrimination is
 * derived from the CONTENT of the declaration — does the tiled image paint a
 * `gradient(` or a data-URI — rather than from a name, a path or an exemption
 * entry, so the grain is safe by construction and moving it to another file
 * cannot break either half.
 *
 * The blooms (`DAYLIGHT_BLOOM`, `PAGE_BLOOM`) are gradients with NO
 * `backgroundSize`: one wash across the band, no pitch, not a lattice. That is
 * the case that proves the `backgroundSize` clause is doing real work rather
 * than banning gradients.
 *
 * BOTH SPELLINGS OF THE PITCH ARE GRADED — `backgroundSize` in a style object
 * and `background-size` in a stylesheet. The second was added on Sentinel's
 * review of #618 and it is the one that matters here: `ui.tsx` carries a
 * ~250-line raw `<style>` block (`SPINE_CSS`) with live `background:`
 * declarations, so the substrate for a CSS-spelled lattice was already inside
 * the file this guard was written for. A camelCase-only detector is a
 * style-object detector, and this tree has a stylesheet in it.
 *
 * WHAT IT CANNOT SEE, so nobody reads a green run as more than it is: a
 * lattice drawn as an `<svg>` of `<line>` elements, as a repeated
 * `border-right` down a flex row, as a pair of Tailwind ARBITRARY utilities —
 * an arbitrary background-image beside an arbitrary background-size — rather
 * than a declaration, or as the `background:` SHORTHAND carrying both image
 * and pitch in one value (`linear-gradient(…) 0 0 / 22px 22px`). None has ever
 * appeared in these trees. The shorthand is the cheapest of the four to add
 * and is named here rather than left out, because an entry claiming "a lattice
 * anywhere under the marketing roots" is broader than what the code holds —
 * and an overstated closure note is the precise failure this guard exists to
 * cure.
 *
 * (That last one is deliberately described rather than spelled. Tailwind 4
 * scans `tests/` along with everything else, so writing the class here would
 * MINT it — a real utility whose `url()` the CSS build then tries to resolve,
 * which breaks `next dev` and `next build` from inside a comment. Found the
 * hard way while writing this file.)
 *
 * WATCHED FAIL (§2d) against the real defect: `HERO_DOT_GRID` restored
 * verbatim to `components/marketing/ui.tsx` in its shipped spelling, which
 * this file named by file and by declaration. Both detector halves were also
 * mutated — forcing `isDrawnLattice` to always-true reddens on the grain
 * (proving the grain clause is load-bearing), forcing it to always-false
 * reddens the fixture cases below.
 */
const MARKETING_ROOTS = ['app/(marketing)', 'components/marketing', 'lib/marketing']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/**
 * Brace-match outward from an index to the object literal that encloses it.
 * The tile pitch and the image it tiles are two properties of ONE declaration,
 * so the object is the unit that has to be read — a window of N lines would
 * pair a `backgroundSize` with whichever `backgroundImage` happened to sit
 * near it.
 */
export function enclosingObject(source: string, at: number): string {
  let depth = 0
  let start = -1
  for (let i = at; i >= 0; i--) {
    if (source[i] === '}') depth++
    else if (source[i] === '{') {
      if (depth === 0) {
        start = i
        break
      }
      depth--
    }
  }
  if (start === -1) return ''
  depth = 0
  for (let j = start; j < source.length; j++) {
    if (source[j] === '{') depth++
    else if (source[j] === '}') {
      depth--
      if (depth === 0) return source.slice(start, j + 1)
    }
  }
  return source.slice(start)
}

/** A tiled gradient — a lattice. Noise tiled at the same pitch is not one. */
export function isDrawnLattice(declaration: string): boolean {
  return /gradient\(/.test(declaration)
}

export type Lattice = { file: string; why: string; snippet: string }

export function findLattices(file: string, source: string): Lattice[] {
  const found: Lattice[] = []

  // BOTH SPELLINGS OF THE PITCH, and the second one is not hypothetical
  // (Sentinel, #618). `components/marketing/ui.tsx` opens a ~250-line raw
  // `<style>{`…`}</style>` block of real CSS — `SPINE_CSS`, with live
  // `background:` declarations in it — so a lattice written there in CSS
  // (`background-image: linear-gradient(…); background-size: 22px 22px`) sat
  // inside the very file this guard was written for and matched nothing. A
  // camelCase-only detector is a style-object detector, and this tree has a
  // stylesheet in it.
  //
  // `enclosingObject` needs no change for the CSS spelling: walking backwards
  // from a CSS `background-size`, the nearest unmatched `{` is the rule's own
  // brace, which is exactly the unit to read.
  //
  // `Array.from` for the same TS2802 reason as the chrome-legibility scanner.
  for (const m of Array.from(source.matchAll(/background-?[sS]ize\s*:/g))) {
    const obj = enclosingObject(source, m.index)
    if (isDrawnLattice(obj)) {
      found.push({
        file,
        why: 'a gradient tiled on a fixed pitch (backgroundImage + backgroundSize)',
        snippet: obj.replace(/\s+/g, ' ').slice(0, 160),
      })
    }
  }

  for (const m of Array.from(source.matchAll(/repeating-(?:linear|radial)-gradient\(/g))) {
    found.push({
      file,
      why: 'a repeating gradient carries its own pitch',
      snippet: source.slice(m.index, m.index + 120).replace(/\s+/g, ' '),
    })
  }

  return found
}

describe('BRAND.md Part 3 — no drawn grid anywhere on the marketing site', () => {
  const files = MARKETING_ROOTS.flatMap((r) => walk(join(ROOT, r)))

  it('finds no lattice in app/(marketing), components/marketing or lib/marketing', () => {
    const found = files.flatMap((f) =>
      findLattices(relative(ROOT, f).replace(/\\/g, '/'), readFileSync(f, 'utf8')),
    )

    expect(
      found.map((f) => `${f.file} — ${f.why}: ${f.snippet}`),
      'BRAND.md Part 3: "No drawn grid. Owner veto, DREAMCRM-67." A gradient ' +
        'tiled on a fixed pitch is a lattice ruled across the page, which is ' +
        'the thing the owner vetoed by name — precision now lives in alignment ' +
        'and type, not in geometry drawn behind the words. The film grain is ' +
        'NOT this: noise has no lattice in it, and BRAND.md Part 1 asks for it ' +
        'by name. If you need texture, tile noise; if you need rhythm, align ' +
        'to the column.',
    ).toEqual([])
  })

  it('is still looking at something — the grain proves the walk reaches the decorative layers', () => {
    const tiled = files.filter((f) => /backgroundSize\s*:/.test(readFileSync(f, 'utf8')))
    expect(
      tiled.map((f) => relative(ROOT, f).replace(/\\/g, '/')),
      'No tiled background exists anywhere under the marketing roots, which ' +
        'means either the film grain moved out of these trees or the walk is ' +
        'no longer reaching them. Both leave this guard reporting CLEAN over ' +
        'nothing — the deadExclusions failure mode. Re-point the roots.',
    ).not.toEqual([])
  })
})

describe('the field of view — the lattice detector, on the real declarations', () => {
  /** `HERO_DOT_GRID` exactly as it shipped, deleted on DREAMCRM-72. */
  const DOT_GRID = `const HERO_DOT_GRID = {
    backgroundImage: 'radial-gradient(circle, #c1d6ff 1px, transparent 1px)',
    backgroundSize: '22px 22px',
  } as const`

  /** `DAY_GRAIN` as it stands — tiled, and legitimate. */
  const GRAIN = `const DAY_GRAIN = {
    backgroundImage: "url(\\"data:image/svg+xml,%3Csvg%3E%3CfeTurbulence/%3E%3C/svg%3E\\")",
    backgroundSize: '140px 140px',
    opacity: 0.045,
  } as const`

  /** A bloom — a gradient with no pitch. */
  const BLOOM = `const PAGE_BLOOM = {
    backgroundImage: 'radial-gradient(40rem 20rem at 2% -58%, rgb(76 125 240 / 0.46), transparent 70%)',
  } as const`

  it('catches the dot grid it was written for', () => {
    const hits = findLattices('fixture.tsx', DOT_GRID)
    expect(hits).toHaveLength(1)
    expect(hits[0].why).toMatch(/fixed pitch/)
  })

  it('leaves the film grain alone — tiled noise is not a lattice', () => {
    expect(findLattices('fixture.tsx', GRAIN)).toEqual([])
  })

  it('leaves a bloom alone — a gradient with no pitch is a wash, not a grid', () => {
    expect(findLattices('fixture.tsx', BLOOM)).toEqual([])
  })

  it('catches a repeating gradient, which needs no backgroundSize at all', () => {
    const hits = findLattices(
      'fixture.tsx',
      `style={{ backgroundImage: 'repeating-linear-gradient(0deg, #eee 0 1px, transparent 1px 56px)' }}`,
    )
    expect(hits).toHaveLength(1)
    expect(hits[0].why).toMatch(/own pitch/)
  })

  it('pairs a pitch with its OWN image, not with a neighbouring one', () => {
    const twoObjects = `${BLOOM}\n${GRAIN}`
    // The bloom's gradient sits three lines above the grain's backgroundSize.
    // A line-window scanner would pair them and report a false lattice.
    expect(findLattices('fixture.tsx', twoObjects)).toEqual([])
  })
})
