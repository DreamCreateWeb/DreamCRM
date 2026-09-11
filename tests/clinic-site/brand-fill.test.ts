import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { brandFill, buildClinicPalette, PALETTE_VARS } from '@/lib/clinic-site-theme'
import { buildCosmeticPalette } from '@/lib/site-templates/cosmetic/palette'
import { buildHometownPalette } from '@/lib/site-templates/hometown/palette'
import { buildPediatricPalette } from '@/lib/site-templates/pediatric/palette'

/**
 * BRAND-AS-FILL IS NEVER THE RAW BRAND.
 *
 * The clinic's brand colour is a fine background where nothing sits on top of
 * it — a decorative accent bar, an alpha tint, a letter-mark. The moment WHITE
 * TEXT lands on it, the brand itself is the wrong value: the seeded pale sage
 * gives white-on-#9CAF9F at 2.32:1 and a pale pink 1.75:1, against a 4.5:1
 * requirement. A clinic whose brand happens to be dark hides the whole class,
 * which is exactly why it survived so long.
 *
 * The runtime accessibility checks caught THREE instances of this, on the
 * public booking page (`booking: slot chosen, details filled in` — the
 * selected day chip's weekday and date, and the selected time slot). Reading
 * the source for the same shape found **22** across the public clinic site:
 * booking, about, careers and the job page, the apply form, intake, the intake
 * packet, intake-start, payment plans and four shop surfaces. Nineteen of them
 * sit on pages the browser suite never visits, so axe was never going to
 * report them — which is the whole argument for a source guard next to it.
 *
 * A SECOND, quieter half of the same consolidation: 37 places spelled the fill
 * `var(--c-brand-strong, ${brand})`, whose FALLBACK is the raw brand. Those
 * render correctly inside the site layout, where the variable is defined, and
 * would fall back to the defect anywhere it is not. They all read
 * `brandFill(brand)` now, so there is one spelling with one safe fallback.
 *
 * `brandFill()` is the one expression they all use now. This guard holds both
 * halves of it:
 *
 *   1. THE VALUE. `brandFill` returns `var(--c-brand-strong, <default>)`, and
 *      the ACTIVE template's recipe owns that variable — so the floor has to
 *      hold for EVERY registered recipe, not just the default one.
 *      `tests/clinic-site/palette.test.ts` asserted it for `buildClinicPalette`
 *      and the other three recipes were never checked; all four are checked
 *      here.
 *   2. THE CALL SITES. A source scan, because the fix is only worth what the
 *      next person does: a new `backgroundColor: brand` under white text would
 *      re-open the class silently on a page axe does not walk.
 *
 * ONE CONSTRAINT THAT IS NOT ASSERTED HERE, on purpose. `brandStrong` is
 * darkened only as far as FULL white needs, so a PARTLY TRANSPARENT white ink
 * on it composites back into failure — measured across all four recipes, white
 * at 85% lands between 3.54 and 4.88. That is why the booking day chip's
 * weekday label went from `rgba(255,255,255,0.85)` to `#FFFFFF`. It is left out
 * of this file because the only way to assert it is `expect(ratio).toBeLessThan`,
 * which would fail the day somebody legitimately darkens the palette — a guard
 * that breaks on an improvement is one people learn to delete. The real guard
 * for it is the axe ceiling on `booking: slot chosen, details filled in`, which
 * this batch takes to zero: put an alpha ink back on that chip and the E2E gate
 * says so.
 */

const ROOT = resolve(__dirname, '../..')
const AA = 4.5

function lin(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
/** Every registered template's palette recipe, by the id it ships under. */
const RECIPES: [string, (b: string | null | undefined) => { brandStrong: string }][] = [
  ['modern', buildClinicPalette],
  ['cosmetic', buildCosmeticPalette],
  ['hometown', buildHometownPalette],
  ['pediatric', buildPediatricPalette],
]

/** Real onboarding presets, the pale traps, and the degenerate cases. */
const BRANDS: (string | null)[] = [
  '#9CAF9F', // the seeded sage — 2.32:1 raw under white
  '#E7B7C8', // a pale pink — 1.75:1 raw
  '#BBD5F0',
  '#CFEDE0',
  '#F5E663', // bright yellow, the classic trap
  '#FFFFFF', // degenerate
  '#FF0000',
  '#2F6D62', // already dark enough — must pass through
  '#4C7DF0',
  null, // an un-branded clinic
]

describe('every template recipe keeps brandStrong safe under white text', () => {
  for (const [id, build] of RECIPES) {
    it(`${id}: white on brandStrong clears AA for every brand a clinic can pick`, () => {
      const failures: string[] = []
      for (const brand of BRANDS) {
        const strong = build(brand).brandStrong
        const ratio = contrast('#FFFFFF', strong)
        if (ratio < AA) failures.push(`${brand} → ${strong} = ${ratio.toFixed(2)}`)
      }
      expect(failures, failures.join('\n')).toEqual([])
    })
  }

})

describe('brandFill()', () => {
  it('reads the template variable, so the active template decides', () => {
    expect(brandFill('#9CAF9F')).toContain(`var(${PALETTE_VARS.brandStrong}`)
  })

  it('falls back to a white-safe value, never to the raw brand', () => {
    // The spelling this replaced was `var(--c-brand-strong, ${brand})`, whose
    // fallback WAS the defect. If the variable is ever missing, the fallback
    // still has to be legible.
    for (const brand of BRANDS) {
      const out = brandFill(brand)
      const fallback = out.slice(out.indexOf(',') + 1, -1).trim()
      expect(fallback, `fallback for ${brand}`).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(contrast('#FFFFFF', fallback), `white on ${brand} fallback ${fallback}`).toBeGreaterThanOrEqual(AA)
      // Only where the raw brand FAILS: one that already clears the floor is
      // supposed to pass through untouched, which the next test pins.
      if (brand && contrast('#FFFFFF', brand) < AA) {
        expect(fallback.toLowerCase(), `${brand} fails raw, so the fallback must differ`).not.toBe(
          brand.toLowerCase(),
        )
      }
    }
  })

  it('leaves a brand that already clears the floor as the clinic chose it', () => {
    expect(brandFill('#2F6D62')).toContain('#2f6d62')
  })
})

/* ── the call sites ───────────────────────────────────────────────────────── */

const SCAN_DIRS = ['app/site', 'components/clinic-site']

/**
 * Colour properties whose value must never be a bare `brand`.
 *
 * The FIRST version of this scan matched only the literal spelling
 * `backgroundColor: brand`, and its red run PASSED — it would not have caught
 * the defect it was written for. The booking page's two worst instances are
 * conditional (`backgroundColor: isSelected ? brand : SURFACE`), so the value
 * has to be parsed, not matched whole.
 */
const COLOUR_PROPS = ['backgroundColor', 'background']

/**
 * DELIBERATELY NOT `borderColor`, and deliberately not `color`.
 *
 * A border is non-text contrast (WCAG 1.4.11) at a 3:1 bar, not 4.5 — a
 * different criterion, and `brandFill` is not its answer. Brand-as-TEXT is
 * `readableInk`'s job, and there are 31 `color: brand` sites on the public
 * site, a mix of decorative SVG strokes and real copy that needs reading
 * one at a time. Both are recorded on DREAMCRM-28 rather than folded in here,
 * because a guard whose name says "fill" and whose scan covers three
 * different criteria is a guard nobody can act on.
 */

/**
 * The spellings of `brand` that are LEGITIMATE in a colour value — either
 * already-safe derivations, or alpha tints, which are washes sitting behind
 * dark ink rather than fills under white:
 *   `brandFill(brand)` · `brandInk` · `brandStrong` · `brandTint(brand, …)` ·
 *   `${brand}1A` · `brand + '22'`
 */
function strippedOfSafeForms(value: string): string {
  return (
    value
      // A custom-property NAME is not a value: `var(--c-brand-soft, #EFEAE1)`
      // says nothing about the brand identifier. Only the name goes — the
      // FALLBACK stays readable, because `var(--c-brand-strong, ${brand})` is
      // precisely the old unsafe spelling this guard has to keep catching.
      .replace(/--[a-z0-9-]+/g, '')
      .replace(/brandFill\([^)]*\)/g, '')
      .replace(/brandTint\([^)]*\)/g, '')
      .replace(/brand(?:Ink|Strong|Soft|SoftInk|Fill)\b/g, '')
      .replace(/\$\{brand\}[0-9a-fA-F]{2}/g, '')
      .replace(/brand\s*\+\s*'[0-9a-fA-F]{2}'/g, '')
      // Anything with an alpha suffix concatenated onto it is a TINT — a wash
      // behind dark ink, not a fill under white. (Three of these concatenate
      // onto a `var()`, which produces invalid CSS and therefore no background
      // at all; a separate cosmetic defect, reported on DREAMCRM-28 rather than
      // silently changed here, since what that well should look like is a
      // design call.)
      .replace(/.*\+\s*'[0-9a-fA-F]{2}'.*/g, '')
  )
}

/** Every colour-property value on a line, as raw expression text. */
function colourValues(line: string): string[] {
  const out: string[] = []
  for (const prop of COLOUR_PROPS) {
    const re = new RegExp(prop + '\\s*:\\s*([^;\\n]*)', 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) out.push(m[1])
  }
  return out
}

/** Does this line put a bare `brand` into a colour property? */
function paintsRawBrand(line: string): boolean {
  return colourValues(line).some((v) => /\bbrand\b/.test(strippedOfSafeForms(v)))
}

/**
 * Raw `brand` as a background is legal ONLY where nothing legible sits on it.
 * Each exemption names the reason, so the list cannot quietly grow.
 */
const ALLOWED: Record<string, string> = {
  'app/site/[slug]/careers/page.tsx':
    'aria-hidden left accent bar on a job card — decorative, carries no text',
  'app/site/[slug]/careers/[jobSlug]/page.tsx':
    'aria-hidden left accent bar on a related-job card — decorative, carries no text',
  'app/site/[slug]/icon.tsx':
    'the favicon letter-mark, generated as an image; a logotype, which WCAG 1.4.3 exempts',
  'app/site/[slug]/opengraph-image.tsx':
    'the OG card letter-mark, generated as an image; same logotype exemption',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('no public-site surface paints white text on the raw brand', () => {
  it('every brand-as-fill goes through brandFill()', () => {
    const hits: string[] = []
    for (const base of SCAN_DIRS) {
      for (const file of walk(join(ROOT, base))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/')
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (ALLOWED[rel]) return
            if (!paintsRawBrand(line)) return
            hits.push(
              `${rel}:${i + 1} — raw brand in a colour property. Use ` +
                `brandFill(brand) from lib/clinic-site-theme, or add an entry to ALLOWED ` +
                `here with the reason nothing legible sits on it.\n      ${line.trim()}`,
            )
          })
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('and every exemption is still real', () => {
    // An exemption that has outlived its call site is dead weight that would
    // silently cover a NEW raw fill in the same file.
    const stale: string[] = []
    for (const [rel, reason] of Object.entries(ALLOWED)) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      if (!src.split('\n').some(paintsRawBrand)) {
        stale.push(`${rel} no longer paints a raw brand background — drop it (${reason})`)
      }
    }
    expect(stale, stale.join('\n')).toEqual([])
  })
})
