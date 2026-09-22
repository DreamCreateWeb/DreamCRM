import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from '../a11y/palette'
import { stripComments } from './source-text'

/**
 * `BRAND.md` PART 4'S 12px FLOOR, OVER THE WHOLE MARKETING SITE — DREAMCRM-87,
 * widened from the shared-chrome guard this file shipped as on DREAMCRM-72.
 *
 * Part 4 sets a floor for this site in plain words: *"No `text-[11px]`, no
 * sub-0.75rem literals."* Two trees render it and until now NEITHER was held
 * to that floor as a tree:
 *
 *   - **`app/(marketing)`** was in no `SCAN_DIRS` any guard walks, under any
 *     exemption, for no stated reason. Eight literals were found there over
 *     four sweeps and every one closed because somebody happened to be
 *     rebuilding the element it sat on — which is the right way for a literal
 *     to get fixed and the wrong way for a FLOOR to get enforced.
 *   - **`components/marketing`** is skipped wholesale by
 *     `tests/a11y/legibility-floor.test.ts`, with a good reason: the product
 *     mocks in it imitate a real screen at 7px, so a tree-wide floor over
 *     `ui.tsx` would report ~100 right answers to catch two wrong ones, which
 *     is the "208 places to catch 8" shape that gets a guard switched off in a
 *     week. But the skip is keyed on a DIRECTORY while the exemption is about
 *     a KIND of thing, and those two came apart twice — first for the shared
 *     chrome (DREAMCRM-72, the version of this file that graded eight named
 *     components), then for `CinemaStage`, which is the product at full bleed
 *     at real reading size and carried two 11.52px literals for a week.
 *
 * SO THE SCOPE IS EVERY COMPONENT IN BOTH TREES, AND THE MOCKS ARE NAMED. That
 * is the inversion this widening is: the old version of this file listed the
 * components it GRADED and stated its cost as a false NEGATIVE — a new chrome
 * component nobody added to the list was not graded. A floor wants the other
 * direction. Now a component is graded the day it is written and the
 * exemptions are enumerated, so the cost is a false POSITIVE: a genuinely new
 * product mock fails this guard until somebody registers it and says why,
 * which is a sentence in a review rather than a hole nobody can see.
 *
 * WHY NOT JUST ADD `app/(marketing)` TO `legibility-floor`'s `SCAN_DIRS`. That
 * file's own header says the public site is swept separately, and it is right
 * to: the marketing tree needs the mock exemption and the dashboard tree does
 * not. Putting `app/(marketing)` in both would mean two guards grading one
 * string, which is how they start disagreeing — the constraint Quinn set on
 * DREAMCRM-34 when `palette.ts` was extracted. `legibility-floor`'s
 * `SKIP_DIRS` comment says `components/marketing` is "swept by their own
 * guards, against their own type systems"; as of this widening that sentence
 * is true of the whole lane.
 *
 * COMMENTS ARE BLANKED BEFORE ANYTHING IS COUNTED, and that is load-bearing
 * rather than tidy. `app/(marketing)/resources/guide-ui.tsx` carries
 * `text-[0.72rem]` **in a docblock**, quoting the literal while explaining its
 * removal — the `docs/RELEASE.md` entry warns about exactly this, because a
 * re-derivation that counts a comment reports a defect that is not there. The
 * blanking preserves offsets so a hit still resolves to its real line.
 *
 * WATCHED TO FAIL (§2d) against the real defects in their real shapes:
 *
 *   - The two `CinemaStage` literals DREAMCRM-82 fixed (`text-[0.72rem]` on
 *     the avatar initials and the status chips) were restored to their shipped
 *     spellings in `components/marketing/cinema-scenes.tsx`; this file named
 *     both, by component and by px. `legibility-floor` stayed green on them,
 *     which is the gap.
 *   - `app/(marketing)/resources/guide-ui.tsx:98`'s `text-[0.72rem]`
 *     (DREAMCRM-79's closure) restored in the `ScriptCard` caption: named.
 *     And the DOCBLOCK next to it that quotes the same literal is NOT named,
 *     which is the false positive this guard has to not have.
 *   - The extractor was mutated: forcing `componentRanges` to return `[]`
 *     reddens the run with 104 unattributable literals rather than passing
 *     silently, and forcing `stripComments` to return its input unchanged
 *     reddens it on the docblock.
 *   - The exemption detector was mutated in BOTH directions (the §2d rule for
 *     a derived exclusion): forcing every component to read as registered
 *     reddens the dead-exemption test, and forcing none to reddens the floor.
 *
 * WHAT IT DELIBERATELY DOES NOT SEE, so a green run is not mistaken for proof:
 *
 *   - **A size that is not a `text-[…]` literal.** `text-sm` and friends
 *     resolve through Tailwind's scale and none of them is under 12px; a size
 *     assembled through a variable is invisible, the same false-negative
 *     direction every source scanner in this repo has. Tailwind's explicit
 *     type hint — `text-[length:11px]` — IS read, since #642's review; it
 *     used to be in this list by accident rather than by decision.
 *   - **`MONO_LABEL`**, a shared constant rather than a literal in a component
 *     body. It is 0.75rem and Part 4 pins it there in prose; it is not
 *     re-derived here, because two guards grading one string is how they start
 *     disagreeing.
 *   - **A literal inside a nested arrow component.** Attribution walks
 *     top-level `function` declarations only. A sub-floor literal in no such
 *     body is reported as `<no component>` and FAILS — the safe direction, and
 *     the population is zero today.
 */

/** Part 4's floor, in px, and the root size it is measured against. */
const FLOOR_PX = 12
const ROOT_FONT_PX = 16

/** Both trees that render the public marketing site. */
const SCAN_DIRS = ['app/(marketing)', 'components/marketing'] as const

/**
 * THE PRODUCT MOCKS — the population `legibility-floor`'s directory skip is
 * actually about, named one at a time so the skip stops being a directory.
 *
 * **`aria-hidden` is NOT what earns the pardon.** `CinemaStage`'s own docblock
 * says so and `e2e/axe.ts` spends a paragraph on it: the author saying "not
 * content" is a weaker claim than "this is a picture", and a rule keyed on the
 * attribute alone would pardon every decorative subtree on the site forever.
 * What earns it is WCAG 1.4.3's actual subject — text that is part of a
 * picture containing significant other visual content — which here means a
 * component imitating a real app screen at real-screen scale. That is the
 * `why` on each row, and it is a sentence somebody has to write.
 *
 * `aria-hidden` on the component's OWN outermost element is the structural
 * PREMISE beside it, asserted below rather than assumed. An exemption that
 * describes its subject but not the condition it rests on goes on pardoning
 * the thing it was never meant to cover — the #587 shape, and the reason
 * `exclusionsHidingReadableText` exists in `e2e/axe.ts`.
 *
 * Two entries are `private-to-mocks` instead: file-local helpers that are not
 * exported and whose every call site is inside a registered mock. Their
 * premise is that derivation, re-run below — if either is ever exported or
 * called from outside a mock, its pardon fails rather than widening quietly.
 */
type MockPremise = 'aria-hidden-root' | 'private-to-mocks'
type MockEntry = { component: string; file: string; premise: MockPremise; why: string }

const FILE_UI = 'components/marketing/ui.tsx'

const PRODUCT_MOCKS: MockEntry[] = [
  {
    component: 'DashboardMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'the staff dashboard drawn at ~1/3 scale — sidebar, chair list, KPI tiles; its type is the imitated screen’s type, not a size we chose',
  },
  {
    component: 'PortalMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'the patient portal inside a drawn phone frame at 236px wide, status bar and notch included — a picture of a handset, not a panel anybody reads',
  },
  {
    component: 'EditorMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'the website Studio drawn inside a browser chrome with traffic-light dots — the imitated app’s own toolbar scale',
  },
  {
    component: 'BookingMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'a clinic’s public booking page in the fictional practice’s sage/cream palette — day chips and slot grid at the scale that page really renders',
  },
  {
    component: 'MessagesMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'a patient conversation drawn as the staff inbox shows it — avatar, thread bubbles and a waiting chip at message-list scale',
  },
  {
    component: 'ReviewsMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'a Google review card as Google renders it, borrowing that product’s own type scale the way the social post previews do',
  },
  {
    component: 'RecallFunnelMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'the recall funnel drawn as four stacked stage bars with their counts — a chart of a screen, at chart scale',
  },
  {
    component: 'ShopMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'the clinic storefront’s product grid at tile scale — four drawn cards with prices, an illustration of the shop rather than the shop',
  },
  {
    component: 'GoogleSocialMock',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'the connected-channel row drawn in each platform’s own brand colour — Google, Instagram, Facebook, TikTok at their own badge scale',
  },
  {
    component: 'HeroStatTile',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'two rows of DashboardMock pulled forward into the hero as drifting tiles; its own docblock says they are pieces of the mock and their content is the mock’s content',
  },
  {
    component: 'HeroReplyBubble',
    file: FILE_UI,
    premise: 'aria-hidden-root',
    why: 'the patient reply to the confirmation DashboardMock just sent, drifting beside it — the same illustration, one message pulled out of it',
  },
  {
    component: 'StatusPill',
    file: FILE_UI,
    premise: 'private-to-mocks',
    why: 'the chip the drawn screens label a row with — file-local, not exported, and rendered only inside DashboardMock, MessagesMock and RecallFunnelMock',
  },
  {
    component: 'Avatar',
    file: FILE_UI,
    premise: 'private-to-mocks',
    why: 'the initials disc inside the drawn screens — file-local, not exported, and rendered only inside DashboardMock, MessagesMock and ReviewsMock',
  },
]

/* ── the scanner ─────────────────────────────────────────────────────────── */

export type SizeLiteral = { raw: string; px: number; index: number }

export type ComponentRange = { name: string; start: number; end: number }

/**
 * Every top-level `function Name(…) { … }` in a source, by offset range.
 *
 * The parameter list is skipped by PAREN depth, not brace depth, which is the
 * whole subtlety: `PageHero({ eyebrow, title, sub, children }: { … })` opens
 * and closes braces twice before its body starts, so brace-matching from the
 * first `{` would return the destructuring pattern and report a clean
 * component forever.
 */
export function componentRanges(src: string): ComponentRange[] {
  const out: ComponentRange[] = []
  const decl = /(?:^|\n)(?:export )?function ([A-Za-z0-9_$]+)\s*[(<]/g
  for (const m of Array.from(src.matchAll(decl))) {
    let i = m.index + m[0].length - 1
    let paren = 0
    let sawParen = false
    for (; i < src.length; i++) {
      if (src[i] === '(') {
        paren++
        sawParen = true
      } else if (src[i] === ')') {
        paren--
        if (sawParen && paren === 0) {
          i++
          break
        }
      }
    }
    const bodyStart = src.indexOf('{', i)
    if (bodyStart === -1) continue
    let depth = 0
    for (let j = bodyStart; j < src.length; j++) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') {
        depth--
        if (depth === 0) {
          out.push({ name: m[1], start: bodyStart, end: j })
          break
        }
      }
    }
  }
  return out
}

/**
 * Every `text-[<n>rem]` / `text-[<n>px]` literal in a source, in px.
 *
 * `length:` IS READ, and that is a correction rather than a flourish
 * (Sentinel, review of #642). Tailwind lets an arbitrary value carry an
 * explicit type hint — `text-[length:11px]` — for the case where `text-[…]`
 * would otherwise be ambiguous between a size and a colour. It renders the
 * same 11px and the first version of this scanner could not see it. Zero uses
 * in either tree today, so nothing was hiding behind it; the blind-spot list
 * above read as though only NON-literal sizes escaped, and that spelling did
 * too. One alternation costs nothing and stops the list being wrong.
 */
export function textSizeLiterals(source: string): SizeLiteral[] {
  const out: SizeLiteral[] = []
  // `Array.from` rather than iterating the iterator directly: this repo's
  // tsconfig target makes a bare `for…of` over `matchAll` a TS2802.
  for (const m of Array.from(source.matchAll(/text-\[(?:length:)?([0-9]*\.?[0-9]+)(rem|px)\]/g))) {
    const n = Number(m[1])
    out.push({ raw: m[0], px: m[2] === 'rem' ? n * ROOT_FONT_PX : n, index: m.index })
  }
  return out
}

export function underFloor(source: string): SizeLiteral[] {
  return textSizeLiterals(source).filter((s) => s.px < FLOOR_PX)
}

export type Hit = { file: string; line: number; component: string; raw: string; px: number }

/** Every sub-floor literal in a source, attributed to its enclosing component. */
export function attributedHits(file: string, raw: string): Hit[] {
  const src = stripComments(raw)
  const ranges = componentRanges(src)
  return underFloor(src).map((s) => {
    const owner = ranges.find((r) => s.index > r.start && s.index < r.end)
    return {
      file,
      line: src.slice(0, s.index).split('\n').length,
      component: owner ? owner.name : '<no component>',
      raw: s.raw,
      px: s.px,
    }
  })
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

export function scannedFiles(): string[] {
  return SCAN_DIRS.flatMap((base) => walk(join(ROOT, base))).map((f) =>
    relative(ROOT, f).split('\\').join('/'),
  )
}

export function allHits(): Hit[] {
  return scannedFiles().flatMap((rel) => attributedHits(rel, readFileSync(join(ROOT, rel), 'utf8')))
}

/** Is this (file, component) a registered product mock? */
export function isRegisteredMock(file: string, component: string): boolean {
  return PRODUCT_MOCKS.some((m) => m.file === file && m.component === component)
}

/* ── the rules ───────────────────────────────────────────────────────────── */

describe('the marketing site holds BRAND.md Part 4’s 12px floor', () => {
  it('names every sub-12px text literal outside a registered product mock', () => {
    const failures = allHits()
      .filter((h) => !isRegisteredMock(h.file, h.component))
      .map((h) => `${h.file}:${h.line} · ${h.component} — ${h.raw} = ${h.px.toFixed(2)}px`)

    expect(
      failures,
      'BRAND.md Part 4: "No text-[11px], no sub-0.75rem literals." The product ' +
        'MOCKS are the exemption and they are named in PRODUCT_MOCKS above, one ' +
        'at a time with a reason each — a component imitating a real app screen ' +
        'at real-screen scale is a picture under WCAG 1.4.3. Everything else on ' +
        'this site is reading text on eight public pages. If what you added is ' +
        'genuinely another mock, register it and write the sentence; do not ' +
        'raise the floor.',
    ).toEqual([])
  })

  it('every registered mock still exists and still marks its own root aria-hidden', () => {
    const broken: string[] = []
    for (const m of PRODUCT_MOCKS.filter((e) => e.premise === 'aria-hidden-root')) {
      const src = stripComments(readFileSync(join(ROOT, m.file), 'utf8'))
      const range = componentRanges(src).find((r) => r.name === m.component)
      if (!range) {
        broken.push(`${m.file} · ${m.component} not found`)
        continue
      }
      // Asserted on the OWNING component's body, never on the file: `ui.tsx`
      // carries `aria-hidden` in a dozen places, so a file-wide search would be
      // satisfied by somebody else's attribute while this component quietly
      // became content (§2d, the sixth identity-looseness entry).
      const body = src.slice(range.start, range.end + 1)
      if (!body.includes('aria-hidden="true"')) {
        broken.push(`${m.file} · ${m.component} no longer marks anything aria-hidden`)
      }
    }

    expect(
      broken,
      'A product-mock exemption rests on the component being presented as a ' +
        'PICTURE rather than as content. aria-hidden on its own root is the ' +
        'structural half of that claim (the `why` is the other half), and an ' +
        'exemption whose premise has gone on pardoning text a person reads is ' +
        'the #587 shape. Re-measure the component or delete its entry.',
    ).toEqual([])
  })

  it('the two private helpers are still private, and still only called from mocks', () => {
    const broken: string[] = []
    for (const m of PRODUCT_MOCKS.filter((e) => e.premise === 'private-to-mocks')) {
      const src = stripComments(readFileSync(join(ROOT, m.file), 'utf8'))
      if (new RegExp(`export function ${m.component}(?![\\w$])`).test(src)) {
        broken.push(`${m.file} · ${m.component} is exported now — it can render anywhere`)
      }
      const ranges = componentRanges(src)
      const uses = Array.from(src.matchAll(new RegExp(`<${m.component}(?![\\w$])`, 'g')))
      if (uses.length === 0) broken.push(`${m.file} · ${m.component} is rendered nowhere`)
      for (const u of uses) {
        const owner = ranges.find((r) => u.index > r.start && u.index < r.end)
        const name = owner?.name ?? '<no component>'
        if (!isRegisteredMock(m.file, name)) {
          broken.push(`${m.file} · ${m.component} is rendered inside ${name}, which is not a mock`)
        }
      }
    }

    expect(
      broken,
      'These two carry sub-floor type because the drawn screens that contain ' +
        'them do. That pardon is derived from WHERE they render, so exporting ' +
        'one or calling it from a real surface has to fail here rather than ' +
        'widen the exemption silently.',
    ).toEqual([])
  })

  it('every registered mock still has a sub-floor literal and a real reason', () => {
    // An exemption that stops matching anything is a blanket pardon waiting to
    // happen: the component gets cleaned up, nobody removes the entry, and the
    // next sub-12px size added there is exempt for a reason that no longer
    // exists. Same rule as ALLOWED in tests/a11y/legibility-floor.test.ts.
    const hits = allHits()
    for (const m of PRODUCT_MOCKS) {
      expect(m.why.length, `${m.file} · ${m.component} needs a real reason`).toBeGreaterThan(40)
      expect(
        hits.some((h) => h.file === m.file && h.component === m.component),
        `${m.file} · ${m.component} no longer carries a sub-floor literal — delete its exemption`,
      ).toBe(true)
    }
  })

  it('reads both marketing trees, not just the one with the mocks in it', () => {
    // The scope miss the old version of this guard shipped with, and the one
    // `legibility-floor` shipped with before it: a bare count would not catch
    // either, so name files from both trees.
    const files = scannedFiles()
    expect(files.length).toBeGreaterThan(30)
    expect(files).toContain('components/marketing/chrome.tsx')
    expect(files).toContain('components/marketing/cinema-scenes.tsx')
    expect(files).toContain('app/(marketing)/page.tsx')
    expect(files).toContain('app/(marketing)/resources/guide-ui.tsx')
  })
})

describe('the field of view — the scanner, the stripper and the extractor', () => {
  const FIXTURE = [
    '/**',
    ' * A docblock quoting text-[0.72rem] while explaining why it went away.',
    ' */',
    'export function Chrome({ a, b }: { a: string; b: string }) {',
    '  return <p className="text-[0.72rem] text-gray-600">{a}{b}</p>',
    '}',
    '',
    'export function ProductMock() {',
    '  // a line comment mentioning text-[0.4rem]',
    '  return <span className="text-[0.48rem]">7px, on purpose</span>',
    '}',
  ].join('\n')

  it('catches a literal under the floor and leaves 0.75rem alone', () => {
    expect(underFloor('text-[0.72rem]').map((s) => s.px)).toEqual([11.52])
    expect(underFloor('text-[11px]').map((s) => s.px)).toEqual([11])
    expect(underFloor('text-[0.75rem]')).toEqual([])
    expect(underFloor('text-[1.05rem] text-sm text-gray-600')).toEqual([])
  })

  it('reads Tailwind’s explicit length: hint, which renders the same px', () => {
    // #642's review: `text-[length:11px]` is the disambiguating spelling of an
    // arbitrary size, it renders 11px, and the first scanner could not see it.
    // Zero uses in either tree — the point is that the blind-spot list said
    // only non-literal sizes escaped, and this one did too.
    expect(underFloor('text-[length:11px]').map((s) => s.px)).toEqual([11])
    expect(underFloor('text-[length:0.72rem]').map((s) => s.px)).toEqual([11.52])
    expect(underFloor('text-[length:0.75rem]')).toEqual([])
    // …and the hint is not a licence to match anything in brackets.
    expect(underFloor('text-[color:var(--x)] text-[length:14px]')).toEqual([])
  })

  it('does not count a literal quoted in a docblock or a line comment', () => {
    // The guide-ui.tsx trap, in miniature: the RELEASE.md entry records a
    // re-derivation that counted a comment and reported a defect that was not
    // there.
    const hits = attributedHits('fixture.tsx', FIXTURE)
    expect(hits.map((h) => `${h.component} ${h.raw}`)).toEqual([
      'Chrome text-[0.72rem]',
      'ProductMock text-[0.48rem]',
    ])
  })

  it('strips a comment without moving any offset', () => {
    const stripped = stripComments(FIXTURE)
    expect(stripped).toHaveLength(FIXTURE.length)
    expect(stripped.split('\n')).toHaveLength(FIXTURE.split('\n').length)
    // A URL's `//` is not a comment — stripping it could hide a real literal
    // later on the same line.
    expect(stripComments('const u = "https://x.test" // text-[0.5rem]')).toContain('https://x.test')
    expect(stripComments('const u = "https://x.test" // text-[0.5rem]')).not.toContain('0.5rem')

    // A COMMENT-SHAPED SUBSTRING INSIDE A STRING is not a comment either
    // (#642's review). Blanking forward from it to the next closing marker
    // deletes real code from the scanner's view, which is the false-NEGATIVE
    // direction — the one that reports CLEAN forever. Latent when it was
    // found, in two copies of this function at once, which is why the
    // stripper now lives in `./source-text` and is imported twice.
    const trap = 'const s = "/* not a comment"\nconst t = "text-[0.5rem]"'
    expect(stripComments(trap)).toContain('text-[0.5rem]')
    expect(underFloor(stripComments(trap)).map((s) => s.px)).toEqual([8])
  })

  it('attributes a literal to the component whose body it is in, and flags one in none', () => {
    const ranges = componentRanges(FIXTURE)
    expect(ranges.map((r) => r.name)).toEqual(['Chrome', 'ProductMock'])
    const orphan = attributedHits('fixture.tsx', 'const X = "text-[0.6rem]"')
    expect(orphan.map((h) => h.component)).toEqual(['<no component>'])
  })

  it('the exemption detector pardons the registered mocks and nothing else', () => {
    // THE MUTATION THIS EXISTS FOR, and it is the reason §2d says to mutate an
    // exclusion detector in BOTH directions. Forcing `isRegisteredMock` to
    // always-FALSE reddens the floor immediately — 104 literals arrive. Forcing
    // it to always-TRUE left all ten tests GREEN, because every sub-floor
    // literal in the tree today is already inside a registered mock, so a
    // pardon-everything detector and a correct one produce the same set. A
    // widened pardon has to fail on a constructed case or it cannot fail at all.
    expect(isRegisteredMock(FILE_UI, 'DashboardMock')).toBe(true)
    expect(isRegisteredMock(FILE_UI, 'Avatar')).toBe(true)
    // Not a mock, in the same file — the shared chrome this guard used to be
    // named after, and the population the floor is actually for.
    expect(isRegisteredMock(FILE_UI, 'PageHero')).toBe(false)
    expect(isRegisteredMock(FILE_UI, 'MarketingFooter')).toBe(false)
    // The same component NAME in another file is a different component:
    // `cinema-scenes.tsx` has its own `Avatar`, and it is not pardoned.
    expect(isRegisteredMock('components/marketing/cinema-scenes.tsx', 'Avatar')).toBe(false)
    expect(isRegisteredMock(FILE_UI, 'NotAThing')).toBe(false)
  })

  it('every hit in the real tree resolves to a component, so nothing is graded by accident', () => {
    // If this ever fails, the extractor has lost a declaration shape (an arrow
    // component, a generic) and the floor above is grading `<no component>`
    // rows rather than the code.
    expect(allHits().filter((h) => h.component === '<no component>')).toEqual([])
  })
})
