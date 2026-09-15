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

const SCAN_DIRS = [
  'app/(default)',
  'app/(double-sidebar)',
  'app/(auth)',
  'app/(onboarding)',
  'app/(partner)',
  'app/(partner-accept)',
  'components',
]

/**
 * Out of scope, each for a stated reason — not because they are clean.
 *
 * The portal has its own, stricter rule already. The public clinic sites and
 * the marketing site are DIFFERENT PALETTES on different grounds, and the
 * marketing one is mid-rebuild (BRAND.md's Daylight Dream build order, and
 * DREAMCRM-73 re-points the decorative-layer grader at the light hero) — so
 * measuring its ground today grades a surface that is about to move. Both are
 * carried as OPEN NOW entries in docs/UI-BEST-VERSION.md rather than silently
 * skipped.
 */
const OUT_OF_SCOPE = [
  'components/patient-portal',
  'components/clinic-site',
  'components/marketing',
]

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
  for (const m of Array.from(chunk.matchAll(DIMMING))) {
    const n = Number(m[1])
    if (n !== 0 && n !== 100) return n
  }
  return null
}

export function scanForDimmedText(): DimmedText[] {
  const found: DimmedText[] = []
  for (const base of SCAN_DIRS) {
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
  ]
  it.each(LEFT_ALONE)('leaves %s alone', (_why, chunk) => {
    expect(gradeChunk(chunk)).toBeNull()
  })
})

/* ── the gate ────────────────────────────────────────────────────────────── */

describe('the app never dims its own type', () => {
  it('has opacity sites to look at (the scan is not narrowed to nothing)', () => {
    // The field of view: the 45 correct uses are still in these directories, so
    // a rule that reported clean because it stopped reading would be visible.
    const anyOpacity = SCAN_DIRS.flatMap((base) =>
      walk(join(ROOT, base))
        .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
        .filter((rel) => !OUT_OF_SCOPE.some((d) => rel.startsWith(`${d}/`)))
        .filter((rel) => /(?:^|[\s'"`{])opacity-\d/.test(readFileSync(join(ROOT, rel), 'utf8'))),
    )
    expect(anyOpacity.length).toBeGreaterThan(20)
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
