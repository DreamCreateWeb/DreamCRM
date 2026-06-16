import { describe, it, expect } from 'vitest'
import {
  buildClinicPalette,
  clinicPaletteVars,
  clinicPaletteCss,
  PALETTE_VARS,
  type ClinicPalette,
} from '@/lib/clinic-site-theme'

/**
 * The clinic picks ONE brand color; `buildClinicPalette` derives the whole
 * harmonized site theme from it. These tests pin the two things that must never
 * regress no matter what color a clinic picks:
 *   1. every on-color ink clears the WCAG AA 4.5:1 floor (nothing unreadable);
 *   2. the deep band stays dark + the ground/strip stay light (roles preserved).
 */

// WCAG relative-luminance + contrast, recomputed here so the test is independent
// of the implementation it's checking.
function lin(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

// The real onboarding presets + a few adversarial extremes (pure primaries,
// bright yellow which is the classic contrast trap, and the no-brand fallback).
const BRANDS: [string, string | null][] = [
  ['Sage', '#9CAF9F'],
  ['Dusty blue', '#7C9CB8'],
  ['Terracotta', '#D4A284'],
  ['Coral', '#E87B5E'],
  ['Warm amber', '#F0A658'],
  ['Violet', '#7C3AED'],
  ['Pure red', '#DC2626'],
  ['Pure blue', '#1D4ED8'],
  ['Bright yellow', '#EAB308'],
  ['Near-white', '#F5F5F4'],
  ['Near-black', '#111111'],
  ['No brand', null],
]

describe('buildClinicPalette — readability floor (every brand a clinic can pick)', () => {
  for (const [name, hex] of BRANDS) {
    it(`${name}: all on-color text clears WCAG AA 4.5:1`, () => {
      const p = buildClinicPalette(hex)
      expect(contrast(p.heading, p.bg), 'heading on ground').toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.ink, p.bg), 'body ink on ground').toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.inkMuted, p.bg), 'muted ink on ground').toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.deepInk, p.deep), 'ink on deep band').toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.deepMuted, p.deep), 'muted on deep band').toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.stripInk, p.strip), 'ink on strip').toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.brandInk, p.brand), 'label on brand').toBeGreaterThanOrEqual(4.5)
      expect(contrast(p.brandSoftInk, p.brandSoft), 'ink on soft wash').toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('buildClinicPalette — roles preserved across brands', () => {
  for (const [name, hex] of BRANDS) {
    it(`${name}: deep is dark, ground + surface + strip are light`, () => {
      const p = buildClinicPalette(hex)
      // Deep band is genuinely dark (carries white text).
      expect(luminance(p.deep)).toBeLessThan(0.18)
      // Ground + cards + strip are genuinely light (carry dark text). The strip
      // floor is 0.45 not higher because deeply-saturated blue/violet hues are
      // perceptually light at HSL-L 85 yet score low luminance (blue is weighted
      // 0.0722) — a light lavender strip is still clearly a "bright" band, and
      // it sits far above the deep band (< 0.18) either way.
      expect(luminance(p.bg)).toBeGreaterThan(0.82)
      expect(luminance(p.surface)).toBeGreaterThan(0.9)
      expect(luminance(p.strip)).toBeGreaterThan(0.45)
      // Surface sits at/above the ground (cards never darker than the page).
      expect(luminance(p.surface)).toBeGreaterThanOrEqual(luminance(p.bg))
    })
  }
})

describe('buildClinicPalette — brand hue actually drives the theme', () => {
  it('a cool brand and a warm brand produce visibly different grounds', () => {
    const cool = buildClinicPalette('#1D4ED8') // blue
    const warm = buildClinicPalette('#E87B5E') // coral
    expect(cool.bg).not.toBe(warm.bg)
    expect(cool.deep).not.toBe(warm.deep)
  })

  it('keeps the exact brand color as `brand`', () => {
    expect(buildClinicPalette('#7C3AED').brand).toBe('#7c3aed')
  })

  it('falls back to the warm-neutral defaults with no brand', () => {
    const p = buildClinicPalette(null)
    expect(p.bg).toBe('#FAF7F2')
    expect(p.deep).toBe('#36514c')
    expect(p.ink).toBe('#1C1A17')
  })
})

describe('clinicPaletteVars / clinicPaletteCss', () => {
  it('emits one CSS custom property per palette role', () => {
    const vars = clinicPaletteVars('#9CAF9F')
    const keys = Object.keys(PALETTE_VARS) as (keyof ClinicPalette)[]
    for (const k of keys) {
      expect(vars[PALETTE_VARS[k]]).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
    expect(Object.keys(vars)).toHaveLength(keys.length)
  })

  it('serializes to a :root{…} block with the deep + bg vars', () => {
    const css = clinicPaletteCss('#7C9CB8')
    expect(css.startsWith(':root{')).toBe(true)
    expect(css).toContain('--c-deep:')
    expect(css).toContain('--c-bg:')
    expect(css.endsWith('}')).toBe(true)
  })
})
