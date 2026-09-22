import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { AA, contrast, DARK, LIGHT, over, ROOT, utilityColor } from './palette'

/**
 * THE APP DOES NOT DIM ITS OWN TEXT.
 *
 * The portal reached this rule first (`portal-ink-opacity.test.ts`, batch 62)
 * and could afford a blanket ban: the portal is one palette and had three
 * instances. The app cannot — it has 45 `opacity-*` sites that are entirely
 * correct — so this rule is the same idea aimed at the one shape that is not:
 * **a dimming applied to an element that has declared itself TEXT.**
 *
 * WHY DIMMING TEXT IS A DEFECT AND NOT A STYLE. `opacity` composites the ink
 * toward whatever is behind it, and nothing in the repo grades the result. The
 * measurements that motivated this rule (UI batch 66, DREAMCRM-62 part 3) split
 * cleanly along the ink it was applied TO:
 *
 *   - on the STRONG ink it survives — `gray-800` at 75% is **5.96**, at 80%
 *     **6.98**;
 *   - on any ink already chosen to be QUIET it fails — `gray-500` at 75% is
 *     **3.19**, at 70% **2.91**; `gray-600` at 80% is **4.25**;
 *   - and on a TONE or a brand fill it fails hardest: the shared `FilterChip`
 *     count was `gray-600` at 70% on its own `gray-100` chip = **3.15**, its
 *     active state `teal-800` at 70% on the teal wash = **3.84**, and a message
 *     SUBJECT in an outbound thread bubble was white at 75% on `teal-600` =
 *     **3.61**.
 *
 * So the defect is not "opacity" — it is **a second quietening on an ink that
 * was already the quiet answer**, which is word for word what the portal found.
 * The design system has ONE quiet step (`gray-500` / `dark:gray-400`, §2.2,
 * held at zero by `class-pairs.ts` rule 6) and one ornament step below it. An
 * opacity is a third, unnamed, ungraded one.
 *
 * THE FIX IS ALWAYS THE SAME and it is why this rule costs nothing to obey:
 * delete the dimming and let SIZE and WEIGHT carry the hierarchy, or name the
 * quiet ink. Every one of the 12 sites this rule was written for took the first
 * option, because each already carried `text-xs` or `font-semibold` doing the
 * same job twice.
 *
 * WHAT COUNTS AS "DECLARED ITSELF TEXT": the same class string carries a text
 * SIZE (`text-xs` … `text-[13px]`) or a numeral class (`tabular-nums`,
 * `font-mono-num`). That is deliberately narrow — see the blind spots below —
 * but it is unambiguous: an element that sets its own type scale is type.
 *
 * WHAT THIS RULE DELIBERATELY LEAVES ALONE, all of it verified against the
 * tree rather than assumed:
 *
 *   · **Inactive controls — 23 sites.** A `disabled` input, a `pending` row, a
 *     `pointer-events-none` panel, a disconnected channel logo. WCAG 1.4.3
 *     exempts an inactive component outright, and this is the largest
 *     population by far.
 *   · **Graphics and chrome — 22 sites.** Blurred background blobs, `<svg>`
 *     icons, a drag preview at `opacity-95`, an image overlay, hover-revealed
 *     affordances, and the `·` separators that are now the design system's
 *     named ORNAMENT step (§2.2).
 *   · **Variant-prefixed anything** (`hover:`, `group-hover:`, `disabled:`) and
 *     the `opacity-0`/`opacity-100` animation endpoints — a momentary state is
 *     not the settled colour a person reads.
 *
 * KNOWN BLIND SPOTS, named because a green run here is narrower than it looks:
 *
 *   · An opacity alone in a TERNARY BRANCH, where the size class lives in the
 *     static half of the template literal — the branches are separate chunks
 *     and this rule reads one at a time, exactly as `class-pairs.ts` does. Two
 *     of the twelve real defects had that shape (`muted ? 'italic opacity-60'`
 *     on the welcome chat bubble, and a read notification row) and were found
 *     by hand, not by this rule. Widening to join the branches would invent
 *     pairings that never render together.
 *   · An element whose text-ness comes from an ANCESTOR and which sets no size
 *     of its own.
 *   · It grades the SHAPE, not the ratio. It does not composite anything; it
 *     refuses the technique on type. That is why it needs no palette and no
 *     ceiling — and why a passing site is still an offender, the same call
 *     `portal-ink-opacity.test.ts` made about the one instance that measured
 *     10.98.
 */

/**
 * THE WHOLE PRODUCT TREE — walked, not enumerated.
 *
 * The first version of this rule listed seven `app/` route groups, and `app/`
 * has thirty-five top-level entries. Sixteen were never opened and, unlike the
 * exclusions below, carried NO STATED REASON — which is the part that mattered
 * (raised in review of #612). A new route group would have got zero coverage
 * silently, and the field-of-view test would not have noticed: it proves the
 * LISTED directories are not empty, which is a different claim.
 *
 * The repo has paid for this shape twice already. `legibility-floor` widened
 * from `components/ui` to all of `components` after 31 dashboard files turned
 * out never to have been swept, and `portal-tokens` widened specifically to
 * reach the token landing pages. Those same landings — `app/r/`, `app/b/`,
 * `app/c/`, `app/e/`, `app/g/`, `app/i/`, `app/n/`, `app/w/` — are pages a
 * patient reaches from a text message, and they were outside this rule with
 * nothing said about them. They are in scope now.
 */
const SCAN_ROOTS = ['app', 'components', 'lib']

/**
 * Out of scope, each for a reason that was MEASURED rather than assumed.
 *
 * Every entry here was checked by running this rule's own `gradeChunk` over the
 * excluded tree and reading what came back, so each reason names what is
 * actually there instead of gesturing at a category:
 *
 *   · `app/(portal)` + `components/patient-portal` — `portal-ink-opacity.test.ts`
 *     owns these and is STRICTER: it refuses the technique outright rather than
 *     only on type, and it resolves `aria-hidden` structurally, which a
 *     chunk-at-a-time rule cannot. The three hits in there today are the
 *     appointment page's `aria-hidden` emoji glyphs (🪪 💊 🕐), each sitting
 *     beside the sentence it decorates — genuinely covered, not merely skipped.
 *   · `components/clinic-site` — three hits, none of them body copy: an
 *     `aria-hidden` arrow at `opacity-30` that a `group-hover` takes to 100,
 *     and two `dc-edit-only` placeholders that render only for the site's
 *     EDITOR inside the Studio, prompting them to fill an empty section. A
 *     visitor never sees either. The tenant-derived palette is the second
 *     reason and the OPEN NOW entry is the record.
 * ~~· `components/marketing` — four hits, all inside the decorative product
 * MOCK-UPS at 7–9px.~~ **IN SCOPE since DREAMCRM-87**, and the four are still
 * pardoned — by CONTENT rather than by directory. See `isPictureScale` below.
 * The deferral this exclusion carried was never about the rule: it was
 * sequenced behind the Daylight Dream rebuild (`BRAND.md` Part 8), and moves
 * 1–7 are merged, so the reason expired.
 *
 * Note what is NOT here any more: `app/(marketing)` and `app/site` are IN
 * scope and clean. The rule grades a SHAPE rather than a ground, so the
 * Daylight Dream rebuild repainting the marketing surface does not change
 * whether dimming type is wrong there — that reason justified deferring the
 * marketing *measurements* (OPEN NOW entry 3), never a blind spot in this rule.
 */
const OUT_OF_SCOPE = ['app/(portal)', 'components/patient-portal', 'components/clinic-site']

/**
 * THE ONE PARDON, AND IT IS DERIVED FROM THE CHUNK RATHER THAN FROM A PATH.
 *
 * `components/marketing` was excluded by DIRECTORY for a reason that was about
 * a KIND of thing — "the four hits are inside the decorative product mock-ups
 * at 7–9px, far below the repo's own legibility floor, so they are pictures
 * rather than small text". That gap between a directory and a kind is the same
 * one `legibility-floor`'s `SKIP_DIRS` opened twice, and it is why the
 * exclusion is gone and this is here instead.
 *
 * **An element that declares its own type scale BELOW the 12px floor is not
 * reading text.** That is not a number invented here: it is the repo's own
 * legibility floor, the same one `e2e/axe.ts` calls
 * `PICTURE_SCALE_CEILING_PX` and states in the same words — *"the size at
 * which text stops being part of a picture and starts being something a person
 * is meant to read"*. WCAG 1.4.3 exempts text that is part of a picture, and
 * compositing a 7px illustration glyph toward its background does not make a
 * sentence harder to read, because there is no sentence.
 *
 * **THE HOLE THIS OPENS, AND WHICH END IT IS CLOSED FROM** (§2d: derive an
 * exclusion from content, then close the hole it opens from the other side).
 * The hole is obvious — write `text-[0.7rem]` and the dimming rule stops
 * looking. It is closed from the FLOOR's end rather than from this rule's:
 * sub-12px type is itself banned across the dashboard, the portal and the
 * shared components by `tests/a11y/legibility-floor.test.ts`, and across both
 * marketing trees by `tests/marketing/type-floor.test.ts`. A chunk cannot buy
 * this pardon without failing one of those first. The test below asserts the
 * pardoned population by name, so a fifth site arrives as a red diff somebody
 * has to look at rather than as silence.
 *
 * It says nothing about a size named through a SCALE STEP (`text-xs` and
 * friends): none of Tailwind's scale is under 12px, so there is nothing to
 * pardon, and a size assembled through a variable is invisible to it — the
 * same false-negative direction as the rest of this file.
 */
const PICTURE_SCALE_PX = 12
const REM_PX = 16
const ARBITRARY_SIZE = /(?:^|[\s'"`{])text-\[(\d*\.?\d+)(px|rem)\](?![\w-])/

/** The size this chunk declares in px, or null when it names none this rule can read. */
export function declaredSizePx(chunk: string): number | null {
  const m = ARBITRARY_SIZE.exec(chunk)
  if (!m) return null
  return m[2] === 'rem' ? Number(m[1]) * REM_PX : Number(m[1])
}

/** Is this chunk's own type scale below the floor — i.e. part of a picture? */
export function isPictureScale(chunk: string): boolean {
  const px = declaredSizePx(chunk)
  return px !== null && px < PICTURE_SCALE_PX
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** An UNPREFIXED `opacity-N` that is neither animation endpoint. */
const DIMMING = /(?:^|[\s'"`{])opacity-(\d{1,3})(?![\w-])/g
/** The element declaring its own type scale. */
const IS_TEXT = /(?:^|[\s'"`{])(?:text-(?:xs|sm|base|lg|xl|\dxl|\[[^\]]+\])|tabular-nums|font-mono-num)(?![\w-])/

export type DimmedText = { file: string; line: number; value: number; chunk: string }

/** One quoted class string — the same unit `class-pairs.ts` reads. */
function quotedChunks(line: string): string[] {
  return Array.from(line.matchAll(/(['"`])((?:[^'"`\\\n]|\\.)*)\1/g)).map((m) => m[2])
}

export function gradeChunk(chunk: string): number | null {
  if (!IS_TEXT.test(chunk)) return null
  // Picture-scale type is not reading text — the pardon, derived from the
  // chunk's own declared size. See `isPictureScale` above for the floor it
  // borrows and which end the hole is closed from.
  if (isPictureScale(chunk)) return null
  for (const m of Array.from(chunk.matchAll(DIMMING))) {
    const n = Number(m[1])
    if (n !== 0 && n !== 100) return n
  }
  return null
}

/**
 * Every site the picture-scale pardon is actually buying — the other half of a
 * derived exclusion. A pardon nobody can enumerate is a pardon nobody can
 * review.
 */
export function scanForPardonedDimming(): DimmedText[] {
  const found: DimmedText[] = []
  for (const base of SCAN_ROOTS) {
    for (const file of walk(join(ROOT, base))) {
      const rel = relative(ROOT, file).replace(/\\/g, '/')
      if (OUT_OF_SCOPE.some((d) => rel.startsWith(`${d}/`))) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const chunk of quotedChunks(line)) {
            if (!IS_TEXT.test(chunk) || !isPictureScale(chunk)) continue
            for (const m of Array.from(chunk.matchAll(DIMMING))) {
              const n = Number(m[1])
              if (n === 0 || n === 100) continue
              found.push({ file: rel, line: i + 1, value: n, chunk: chunk.trim().slice(0, 90) })
              break
            }
          }
        })
    }
  }
  return found
}

export function scanForDimmedText(): DimmedText[] {
  const found: DimmedText[] = []
  for (const base of SCAN_ROOTS) {
    for (const file of walk(join(ROOT, base))) {
      const rel = relative(ROOT, file).replace(/\\/g, '/')
      if (OUT_OF_SCOPE.some((d) => rel.startsWith(`${d}/`))) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const chunk of quotedChunks(line)) {
            const n = gradeChunk(chunk)
            if (n !== null) found.push({ file: rel, line: i + 1, value: n, chunk: chunk.trim().slice(0, 90) })
          }
        })
    }
  }
  return found
}

/* ── the measurements the rule rests on ──────────────────────────────────── */

describe('why dimming type is a defect', () => {
  const dimmed = (theme: typeof LIGHT, ink: string, surface: string, alpha: number) => {
    const bg = utilityColor(theme, surface)!
    return contrast(over(utilityColor(theme, ink)!, alpha, bg), bg)
  }

  it('survives on the STRONG ink and fails on every quiet one — derived, not recalled', () => {
    // The half that makes this a rule about the INK rather than about opacity.
    expect(dimmed(LIGHT, 'gray-800', 'surface-2', 0.75)).toBeGreaterThanOrEqual(AA)
    expect(dimmed(LIGHT, 'gray-800', 'surface-2', 0.8)).toBeGreaterThanOrEqual(AA)
    // …and the NEGATIVE half: the design system's own quiet step cannot take it.
    expect(dimmed(LIGHT, 'gray-500', 'surface-2', 0.75)).toBeLessThan(AA)
    expect(dimmed(LIGHT, 'gray-500', 'surface-2', 0.7)).toBeLessThan(AA)
    expect(dimmed(LIGHT, 'gray-600', 'surface-2', 0.8)).toBeLessThan(AA)
  })

  it('pins the shared FilterChip count, which is what made this a batch', () => {
    // `gray-600` at 70% on the chip's own `gray-100` fill. One primitive, every
    // filtered list in the product.
    expect(dimmed(LIGHT, 'gray-600', 'gray-100', 0.7).toFixed(2)).toBe('3.15')
  })

  it('pins the outbound message subject — white on the brand bubble', () => {
    // The staff twin of the portal defect batch 62 found on a patient's own
    // brand-filled bubble. Same shape, different surface, same arithmetic.
    expect(dimmed(LIGHT, 'white', 'teal-600', 0.75).toFixed(2)).toBe('3.61')
  })

  it('catches a DARK-ONLY failure the browser suite structurally cannot see', () => {
    // The welcome interview's muted chat bubble: fine in light at 6.39, and
    // 4.24 in dark. The E2E suite walks one theme, so this was invisible to it.
    expect(dimmed(LIGHT, 'white', 'stone-800', 0.6)).toBeGreaterThanOrEqual(AA)
    expect(dimmed(DARK, 'stone-900', 'stone-200', 0.6)).toBeLessThan(AA)
  })
})

/* ── the red run ─────────────────────────────────────────────────────────── */

describe('dimmed text — the red run', () => {
  const CAUGHT: Array<[string, string]> = [
    ['a count chip, the shared primitive', 'tabular-nums opacity-70'],
    ['sized copy', 'text-xs opacity-75'],
    ['sized + weighted', 'font-semibold text-xs mb-1 opacity-75'],
    ['a numeral class with no size', 'ml-1 tabular-nums opacity-70'],
    ['an arbitrary size', 'text-[13px] opacity-80'],
    ['the mono numeral class', 'font-mono-num opacity-80'],
  ]
  it.each(CAUGHT)('reports %s', (_why, chunk) => {
    expect(gradeChunk(chunk)).not.toBeNull()
  })

  const LEFT_ALONE: Array<[string, string]> = [
    ['an animation endpoint', 'text-xs opacity-0'],
    ['the other endpoint', 'text-sm opacity-100'],
    ['a variant-prefixed dimming', 'text-xs hover:opacity-70'],
    ['a group-hover reveal', 'text-xs opacity-0 group-hover:opacity-100'],
    ['a graphic with no type scale', 'h-3.5 w-3.5 shrink-0 opacity-70'],
    ['a blurred background blob', 'absolute h-[30rem] w-[30rem] rounded-full opacity-60 blur-[90px]'],
    ['an ornament separator', 'opacity-40'],
    ['text alignment is not a type scale', 'py-3 pl-4 text-left opacity-75'],
    ['picture-scale type inside a drawn screen', 'text-[0.44rem] font-semibold opacity-80'],
  ]
  it.each(LEFT_ALONE)('leaves %s alone', (_why, chunk) => {
    expect(gradeChunk(chunk)).toBeNull()
  })

  /**
   * THE PARDON'S OWN FIELD OF VIEW. An exclusion that is looser than it claims
   * reports CLEAN forever, so grade the boundary from both sides rather than
   * trusting the arithmetic — §2d's "when you mutate a number, try an order of
   * magnitude before you try off-by-one" read from the other end.
   */
  it('pardons only BELOW the floor, and the floor is the repo’s own 12px', () => {
    expect(declaredSizePx('text-[0.44rem] opacity-80')).toBeCloseTo(7.04, 5)
    expect(declaredSizePx('text-[11px] opacity-80')).toBe(11)
    expect(declaredSizePx('text-xs opacity-80')).toBeNull()
    expect(declaredSizePx('tabular-nums opacity-70')).toBeNull()

    // Under the floor — a picture.
    expect(gradeChunk('text-[11px] opacity-80')).toBeNull()
    expect(gradeChunk('text-[0.56rem] font-semibold opacity-80')).toBeNull()
    // AT the floor and above — reading text, and still a defect. `text-[13px]`
    // is in CAUGHT above; these two are the pardon's exact edge.
    expect(gradeChunk('text-[12px] opacity-80')).toBe(80)
    expect(gradeChunk('text-[0.75rem] opacity-80')).toBe(80)
    // A named scale step buys nothing: none of Tailwind's scale is sub-12px.
    expect(gradeChunk('text-xs opacity-75')).toBe(75)
  })
})

/* ── the gate ────────────────────────────────────────────────────────────── */

describe('the app never dims its own type', () => {
  /** Every file this rule actually opens — the instrument's field of view. */
  const swept = (): string[] =>
    SCAN_ROOTS.flatMap((base) =>
      walk(join(ROOT, base))
        .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
        .filter((rel) => !OUT_OF_SCOPE.some((d) => rel.startsWith(`${d}/`))),
    )

  it('has opacity sites to look at (the scan is not narrowed to nothing)', () => {
    // The 45 correct uses are still in these trees, so a rule that reported
    // clean because it stopped reading would be visible here.
    const anyOpacity = swept().filter((rel) =>
      /(?:^|[\s'"`{])opacity-\d/.test(readFileSync(join(ROOT, rel), 'utf8')),
    )
    expect(anyOpacity.length).toBeGreaterThan(20)
  })

  it('reaches the surfaces an enumeration kept missing — named, so widening cannot regress', () => {
    // The whole point of walking rather than listing. `legibility-floor` and
    // `portal-tokens` both had to be widened after the fact to reach exactly
    // these, so they are pinned by name rather than trusted to a glob: a
    // patient opens them from a text message, and a route group that quietly
    // fell out of scope is the failure this rule was rewritten to prevent.
    const files = swept()
    const reaches = (dir: string) => files.some((f) => f.startsWith(`${dir}/`))
    for (const landing of ['app/r', 'app/b', 'app/c', 'app/e', 'app/g', 'app/i', 'app/n', 'app/w']) {
      expect(reaches(landing), `${landing} — a token landing page — must be swept`).toBe(true)
    }
    // And the two surfaces whose EXCLUSION would be about a moving ground
    // rather than about this rule: both are in scope, because the rule grades a
    // shape and a shape does not move when a palette does.
    expect(reaches('app/(marketing)'), 'app/(marketing) is in scope').toBe(true)
    expect(reaches('app/site'), 'app/site is in scope').toBe(true)
    // DREAMCRM-87: the marketing COMPONENTS joined them. The exclusion that
    // kept them out was sequenced behind the Daylight Dream rebuild
    // (BRAND.md Part 8) and moves 1–7 are merged, so the reason expired. The
    // four sites it covered are pardoned by `isPictureScale` instead, which is
    // what the exclusion's own stated reason was actually about.
    expect(reaches('components/marketing'), 'components/marketing is in scope').toBe(true)
  })

  /**
   * WHAT THE DERIVED PARDON IS ACTUALLY BUYING — the other end of §2d's
   * "derive an exclusion from content, then close the hole it opens".
   *
   * The hole is obvious: write `text-[0.7rem]` and this rule stops looking. It
   * is closed from the FLOOR's end — sub-12px type is banned across the
   * dashboard, the portal and the shared components by `legibility-floor` and
   * across both marketing trees by `type-floor`, so a chunk cannot buy the
   * pardon without failing one of those first. This is the second lock: the
   * population is enumerated, so a fifth site arrives as a red diff somebody
   * has to look at rather than as silence.
   */
  it('pardons four sites, all picture-scale, all inside the drawn product screens', () => {
    const pardoned = scanForPardonedDimming()
    expect(
      pardoned.map((p) => `${p.file} — opacity-${p.value} at ${declaredSizePx(p.chunk)!.toFixed(2)}px`),
      'the picture-scale pardon covers a different set than it did. Every ' +
        'entry has to be type inside a DRAWN SCREEN — an illustration at 7–9px ' +
        'where there is no sentence to make harder to read. If a new one is ' +
        'reading text at a size the floor guards should have caught, fix the ' +
        'size; the pardon is not the place to argue about it.',
    ).toEqual([
      'components/marketing/ui.tsx — opacity-80 at 7.04px',
      'components/marketing/ui.tsx — opacity-90 at 8.00px',
      'components/marketing/ui.tsx — opacity-80 at 7.68px',
      'components/marketing/ui.tsx — opacity-80 at 8.96px',
    ])
    // Every one of them is under the floor by construction, asserted rather
    // than read off the list above.
    for (const p of pardoned) expect(declaredSizePx(p.chunk)!).toBeLessThan(12)
  })

  it('carries no exclusion it has stopped describing', () => {
    // A dead exclusion is how an exemption rots into a blanket pardon — the
    // same detector `e2e/axe.ts` and the tone-fill rule both carry.
    const all = SCAN_ROOTS.flatMap((base) =>
      walk(join(ROOT, base)).map((f) => relative(ROOT, f).replace(/\\/g, '/')),
    )
    for (const dir of OUT_OF_SCOPE) {
      expect(
        all.some((f) => f.startsWith(`${dir}/`)),
        `${dir} matches nothing any more — re-derive the exclusion or delete it`,
      ).toBe(true)
    }
  })

  it('dims no element that declares its own type scale', () => {
    const found = scanForDimmedText()
    expect(
      found.map((f) => `${f.file}:${f.line} — opacity-${f.value} on type (${f.chunk})`),
      'An opacity on text is a SECOND quietening of an ink that was already ' +
        'chosen: gray-500 at 75% measures 3.19, gray-600 at 80% 4.25, and the ' +
        'shared FilterChip count measured 3.15. Nothing grades the composite. ' +
        'Delete the dimming and let size and weight carry the hierarchy, or name ' +
        'the quiet ink (DESIGN-SYSTEM.md §2.2) — every site this rule was ' +
        'written for already carried text-xs or font-semibold doing the same job.',
    ).toEqual([])
  })
})
