import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { portalBrand, PORTAL_GROUND, PORTAL_BRAND_FALLBACK } from '@/lib/portal-brand'
import { PORTAL_BG } from '@/components/patient-portal/ui'

/**
 * The patient portal renders the clinic's brand color two ways that carry
 * text: as a TEXT FILL on the warm ground and on white cards (headings, phone
 * links, "Reschedule"), and as a BUTTON BACKGROUND under a hard-coded white
 * label. It used to take `clinicProfile.brandColor` raw for both, so a clinic
 * that picked a pale brand got an unreadable portal — the seeded sage at
 * 2.17:1 and a pale pink at 1.64:1, against a 4.5:1 requirement.
 *
 * `portalBrand()` routes it through the contrast derivation the clinic public
 * site already had. This guard is what keeps that true for colors nobody
 * thought to try: it sweeps the whole hue wheel at every lightness a clinic
 * could plausibly choose and asserts all three pairings on each — not just the
 * handful of brands that happened to be in a fixture.
 *
 * It also asserts the ONE-VALUE claim the derivation rests on: that clearing
 * 4.5:1 as text on the cream implies white-on-it clears 4.5:1 too. That is why
 * the portal threads one derived color rather than a second one through every
 * call site, and it is algebra, so it gets a test.
 *
 * Contrast is recomputed here from the WCAG formula so the guard is
 * independent of the implementation it checks.
 */

const WHITE = '#FFFFFF'
const AA = 4.5

function lin(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  return (
    0.2126 * lin(parseInt(h.slice(0, 2), 16)) +
    0.7152 * lin(parseInt(h.slice(2, 4), 16)) +
    0.0722 * lin(parseInt(h.slice(4, 6), 16))
  )
}
function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** HSL to #rrggbb, so the sweep can generate brands no fixture ever had. */
function hsl(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = ln - c / 2
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// The real brands, then the adversarial ones. Every entry is a color a clinic
// can actually save in Settings → Website → Brand color.
const NAMED_BRANDS: [string, string][] = [
  ['the seeded sage (2.17:1 raw as text)', '#9CAF9F'],
  ['a pale pink (1.64:1 raw as text)', '#E7B7C8'],
  ['a powder blue', '#BBD5F0'],
  ['a pale mint', '#CFEDE0'],
  ['a mid blue (3.81:1 raw under white)', '#4C7DF0'],
  ['bright yellow, the classic contrast trap', '#F5E663'],
  ['near-white, the degenerate case', '#FFFFFF'],
  ['a dark teal that must pass through untouched', '#2F6D62'],
  ['near-black', '#111111'],
]

describe('portalBrand — the clinic brand made readable on patient surfaces', () => {
  it.each(NAMED_BRANDS)('%s clears AA as text and as a fill under white', (_label, brand) => {
    const derived = portalBrand(brand)
    expect(contrast(derived, PORTAL_GROUND)).toBeGreaterThanOrEqual(AA)
    expect(contrast(derived, WHITE)).toBeGreaterThanOrEqual(AA)
    expect(contrast(WHITE, derived)).toBeGreaterThanOrEqual(AA)
  })

  it('clears AA for every brand on the hue wheel, at every plausible lightness', () => {
    const failures: string[] = []
    for (let h = 0; h < 360; h += 6) {
      for (const s of [8, 24, 45, 70, 95, 100]) {
        for (const l of [12, 30, 45, 60, 72, 84, 92, 97]) {
          const brand = hsl(h, s, l)
          const derived = portalBrand(brand)
          const onGround = contrast(derived, PORTAL_GROUND)
          const onCard = contrast(derived, WHITE)
          const whiteOnFill = contrast(WHITE, derived)
          if (onGround < AA || onCard < AA || whiteOnFill < AA) {
            failures.push(
              `${brand} -> ${derived}: ground ${onGround.toFixed(2)}, ` +
                `card ${onCard.toFixed(2)}, white-on-fill ${whiteOnFill.toFixed(2)}`,
            )
          }
        }
      }
    }
    expect(
      failures,
      `${failures.length} brands render unreadable:\n${failures.slice(0, 20).join('\n')}`,
    ).toEqual([])
  })

  it('one value covers both roles: text-safe on the cream implies white-safe on top', () => {
    // The reason the portal threads ONE derived color instead of two. If this
    // ever fails, BrandButton needs its own brandStrong-style value.
    let checked = 0
    for (let h = 0; h < 360; h += 15) {
      for (const s of [0, 30, 60, 100]) {
        for (let l = 0; l <= 100; l += 4) {
          const c = hsl(h, s, l)
          if (contrast(c, PORTAL_GROUND) < AA) continue
          checked++
          expect(
            contrast(WHITE, c),
            `${c} reads on the cream but white on it does not`,
          ).toBeGreaterThanOrEqual(AA)
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('leaves a brand that already clears the floor exactly as the clinic chose it', () => {
    expect(portalBrand('#2F6D62').toLowerCase()).toBe('#2f6d62')
    expect(portalBrand('#BB4D00').toLowerCase()).toBe('#bb4d00')
  })

  it('darkens along the brand hue rather than dropping to grey', () => {
    // A sage clinic should read deep sage, not slate — keeping the identity
    // color's hue is the whole point of deriving here instead of substituting
    // a neutral ink.
    const derived = portalBrand('#9CAF9F')
    const h = derived.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    expect(g, `${derived} should stay green-dominant`).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
  })

  it('is idempotent — re-deriving an already-safe brand changes nothing', () => {
    for (const [, brand] of NAMED_BRANDS) {
      const once = portalBrand(brand)
      expect(portalBrand(once)).toBe(once)
    }
  })

  it('falls back to the sage default for a missing or unparseable brand', () => {
    const fallback = portalBrand(PORTAL_BRAND_FALLBACK)
    for (const bad of [null, undefined, '', '   ', 'teal', '#GGG', '#12345']) {
      expect(portalBrand(bad), `${JSON.stringify(bad)} should land on the sage default`).toBe(
        fallback,
      )
    }
    // …and NOT on near-black, which is what the bare contrast helper returns
    // for unparseable input. A bad DB value must not repaint the portal.
    expect(contrast(fallback, PORTAL_GROUND)).toBeGreaterThanOrEqual(AA)
    expect(fallback.toLowerCase()).not.toBe('#1c1a17')
  })

  it('derives against the same ground the portal primitives paint', () => {
    expect(PORTAL_BG).toBe(PORTAL_GROUND)
  })
})

/**
 * Source guard — the derivation only helps if it sits on every path the brand
 * takes to a patient. These are those surfaces: the portal itself, its
 * staff-facing preview, and the five token pages that arrive by text or email
 * (confirm a visit, pay a balance, set up a plan, a survey, a review request).
 */
const ROOT = resolve(__dirname, '../..')
const PATIENT_SURFACES = [
  'app/(portal)',
  'app/(preview)/settings/portal',
  'app/b/[token]',
  'app/c/[token]',
  'app/i/[token]',
  'app/n/[token]',
  'app/r/[token]',
  'components/patient-portal',
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('every patient-facing surface reads the brand through the derivation', () => {
  it('no raw brandColor reaches a patient surface', () => {
    const hits: string[] = []
    for (const base of PATIENT_SURFACES) {
      for (const file of walk(join(ROOT, base))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/')
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (!line.includes('brandColor')) return
            if (line.includes('portalBrand(')) return
            hits.push(
              `${rel}:${i + 1} — reads brandColor raw; wrap it in portalBrand() from lib/portal-brand`,
            )
          })
      }
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('and every one of them is actually wired to it', () => {
    // The mirror of the rule above: a surface that stopped reading the brand
    // at all would pass the negative check silently. All eight entry points
    // must still be present and derived.
    const wired = PATIENT_SURFACES.flatMap((base) =>
      walk(join(ROOT, base)).filter((f) => readFileSync(f, 'utf8').includes('portalBrand(')),
    )
    expect(wired.map((f) => relative(ROOT, f).replace(/\\/g, '/')).sort()).toEqual([
      'app/(portal)/layout.tsx',
      'app/(portal)/patient/portal-data.ts',
      'app/(preview)/settings/portal/preview/page.tsx',
      'app/b/[token]/page.tsx',
      'app/c/[token]/page.tsx',
      'app/i/[token]/page.tsx',
      'app/n/[token]/page.tsx',
      'app/r/[token]/page.tsx',
    ])
  })
})
