import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../a11y/palette'

/**
 * THE 12px FLOOR, HELD INSIDE THE SHARED MARKETING CHROME — `BRAND.md` Part 4,
 * DREAMCRM-72.
 *
 * Part 4 sets a floor for this site in plain words: *"No `text-[11px]`, no
 * sub-0.75rem literals."* Nothing enforced it here.
 * `tests/a11y/legibility-floor.test.ts` **skips `components/marketing`
 * entirely**, and for a good reason — the product mocks in `ui.tsx` imitate a
 * real screen at 7px, so a tree-wide floor over that file would report ~90
 * right answers to catch two wrong ones, which is the "208 places to catch 8"
 * shape that gets a guard switched off in a week.
 *
 * But the skip is keyed on a DIRECTORY and the exemption is about a KIND of
 * thing, and those two came apart: the shared chrome lives in the same
 * directory as the mocks and owes the floor like any other reading text. Two
 * literals were sitting under it when this guard was written — the footer's
 * CC BY line at `0.72rem` (11.52px) and the header megamenu's descriptions at
 * `0.74rem` (11.84px) — both in text a visitor is meant to read, on every page
 * of the site. Part 4 already records the same arithmetic slip against the
 * mono label, caught the same way: by multiplying it out rather than by
 * looking at it.
 *
 * SO THE SCOPE IS THE COMPONENTS, NOT THE DIRECTORY. This grades the shared
 * chrome by name and leaves the mocks alone by construction rather than by an
 * exemption list — there is nothing here to go stale into a blanket pardon,
 * because a mock is never inside one of these bodies. The trade is a false
 * NEGATIVE, stated rather than hidden: a new chrome component added to
 * `ui.tsx` and not added to `CHROME` below is not graded. That is why
 * `every component this guard names still exists` fails loudly on a rename
 * instead of quietly scanning nothing.
 *
 * WHAT IT DELIBERATELY DOES NOT SEE:
 *
 *   - **A size that is not a `text-[…]` literal.** `text-sm` and friends
 *     resolve through Tailwind's scale and none of them is under 12px, so
 *     there is nothing to grade; a size assembled through a variable is
 *     invisible, the same false-negative direction every source scanner in
 *     this repo has.
 *   - **`MONO_LABEL`**, which is a shared constant rather than a literal in
 *     these bodies. It is 0.75rem and Part 4 pins it there in prose; it is not
 *     re-derived here, because two guards grading one string is how they start
 *     disagreeing.
 *   - **Anything outside the chrome.** The mocks, the cinematic stage and the
 *     hero's detached pieces are all out of scope. `CinemaStage` in
 *     `components/marketing/cinematic-spine.tsx` carries two `0.72rem`
 *     literals at real reading size and they are recorded in
 *     `docs/RELEASE.md` Part 5 rather than absorbed here.
 *
 * WATCHED FAIL (§2d) against the real defect: both live literals — `0.72rem`
 * in `MarketingFooter` and `0.74rem` in `chrome.tsx` — were restored to their
 * shipped spellings and this file named both, by component and by px. The
 * extractor was mutated too: forcing `componentSource` to return the WHOLE
 * file reddens the run on the mocks (proving the scope is real, not
 * decorative), and forcing it to return an empty string reddens the premise
 * test rather than passing silently.
 */

/** Part 4's floor, in px, and the root size it is measured against. */
const FLOOR_PX = 12
const ROOT_FONT_PX = 16

/**
 * THE SHARED CHROME — every component that renders on a page the author of
 * that page did not write. `chrome.tsx` is scanned whole because the file IS
 * the header; `ui.tsx` is 1,600 lines of mostly product mock, so it is scanned
 * by component.
 */
const CHROME = [
  { file: 'components/marketing/chrome.tsx', components: null },
  {
    file: 'components/marketing/ui.tsx',
    components: [
      'MarketingFooter',
      'PageHero',
      'Eyebrow',
      'SectionTitle',
      'PrimaryCta',
      'GhostCta',
      'MarqueeStrip',
    ],
  },
] as const

/**
 * Pull one top-level function's body out of a source file.
 *
 * The parameter list is skipped by PAREN depth, not brace depth, which is the
 * whole subtlety: `PageHero({ eyebrow, title, sub, children }: { … })` opens
 * and closes braces twice before its body starts, so brace-matching from the
 * first `{` would return the destructuring pattern and report a clean
 * component forever.
 */
export function componentSource(source: string, name: string): string | null {
  const decl = new RegExp(`(?:^|\\n)(?:export )?function ${name}\\s*[(<]`).exec(source)
  if (!decl) return null
  let i = decl.index + decl[0].length - 1

  // Walk to the end of the parameter list.
  let paren = 0
  let sawParen = false
  for (; i < source.length; i++) {
    if (source[i] === '(') {
      paren++
      sawParen = true
    } else if (source[i] === ')') {
      paren--
      if (sawParen && paren === 0) {
        i++
        break
      }
    }
  }

  // The next `{` opens the body.
  const bodyStart = source.indexOf('{', i)
  if (bodyStart === -1) return null
  let depth = 0
  for (let j = bodyStart; j < source.length; j++) {
    if (source[j] === '{') depth++
    else if (source[j] === '}') {
      depth--
      if (depth === 0) return source.slice(bodyStart, j + 1)
    }
  }
  return null
}

export type SizeLiteral = { raw: string; px: number }

/** Every `text-[<n>rem]` / `text-[<n>px]` literal in a source, in px. */
export function textSizeLiterals(source: string): SizeLiteral[] {
  const out: SizeLiteral[] = []
  // `Array.from` rather than iterating the iterator directly: this repo's
  // tsconfig target makes a bare `for…of` over `matchAll` a TS2802.
  for (const m of Array.from(source.matchAll(/text-\[([0-9]*\.?[0-9]+)(rem|px)\]/g))) {
    const n = Number(m[1])
    out.push({ raw: m[0], px: m[2] === 'rem' ? n * ROOT_FONT_PX : n })
  }
  return out
}

export function underFloor(source: string): SizeLiteral[] {
  return textSizeLiterals(source).filter((s) => s.px < FLOOR_PX)
}

describe('the shared marketing chrome holds BRAND.md Part 4’s 12px floor', () => {
  it('names every sub-12px text literal in the header, the footer and PageHero', () => {
    const failures: string[] = []
    for (const scope of CHROME) {
      const src = readFileSync(join(ROOT, scope.file), 'utf8')
      if (scope.components === null) {
        for (const s of underFloor(src)) {
          failures.push(`${scope.file} — ${s.raw} = ${s.px.toFixed(2)}px`)
        }
        continue
      }
      for (const name of scope.components) {
        const body = componentSource(src, name)
        if (body === null) continue // the premise test below owns this case
        for (const s of underFloor(body)) {
          failures.push(`${scope.file} · ${name} — ${s.raw} = ${s.px.toFixed(2)}px`)
        }
      }
    }

    expect(
      failures,
      'BRAND.md Part 4: "No text-[11px], no sub-0.75rem literals." These sit ' +
        'in the shared chrome, which renders on every marketing page, so a ' +
        'literal under the floor here is under the floor eight pages at once. ' +
        'tests/a11y/legibility-floor.test.ts cannot see them — it skips ' +
        'components/marketing because the PRODUCT MOCKS in that directory ' +
        'imitate a real screen at 7px. The mocks are the exemption; the chrome ' +
        'is not.',
    ).toEqual([])
  })

  it('every component this guard names still exists, so a rename cannot empty the scan', () => {
    const missing: string[] = []
    for (const scope of CHROME) {
      const src = readFileSync(join(ROOT, scope.file), 'utf8')
      if (scope.components === null) {
        // The whole-file scope owes only that the file is there and non-trivial.
        if (src.length < 500) missing.push(`${scope.file} is empty or a stub`)
        continue
      }
      for (const name of scope.components) {
        const body = componentSource(src, name)
        if (body === null) missing.push(`${scope.file} · ${name} not found`)
        else if (!body.includes('return')) missing.push(`${scope.file} · ${name} has no body`)
      }
    }

    expect(
      missing,
      'A component named above no longer resolves, so this guard is silently ' +
        'grading a smaller surface than it claims to — the shape a scanner ' +
        'narrowed until it matches nothing reports CLEAN forever. Rename the ' +
        'entry or delete it, do not leave it dangling.',
    ).toEqual([])
  })
})

describe('the field of view — the scanner and the extractor, on fixtures', () => {
  const FIXTURE = [
    "export function Chrome({ a, b }: { a: string; b: string }) {",
    '  return <p className="text-[0.72rem] text-gray-600">{a}{b}</p>',
    '}',
    '',
    'export function ProductMock() {',
    '  return <span className="text-[0.48rem]">7px, on purpose</span>',
    '}',
  ].join('\n')

  it('catches a literal under the floor and leaves 0.75rem alone', () => {
    expect(underFloor('text-[0.72rem]').map((s) => s.px)).toEqual([11.52])
    expect(underFloor('text-[11px]').map((s) => s.px)).toEqual([11])
    expect(underFloor('text-[0.75rem]')).toEqual([])
    expect(underFloor('text-[1.05rem] text-sm text-gray-600')).toEqual([])
  })

  it('extracts the named component and NOTHING around it', () => {
    const chrome = componentSource(FIXTURE, 'Chrome')!
    expect(chrome).toContain('text-[0.72rem]')
    // The destructured parameter list must not be mistaken for the body.
    expect(chrome).toContain('return')
    // The mock next door is a real sub-floor literal the scope must not reach.
    expect(chrome).not.toContain('text-[0.48rem]')
    expect(underFloor(chrome)).toHaveLength(1)
    expect(underFloor(FIXTURE)).toHaveLength(2)
  })

  it('returns null for a component that is not there', () => {
    expect(componentSource(FIXTURE, 'Renamed')).toBeNull()
  })
})
