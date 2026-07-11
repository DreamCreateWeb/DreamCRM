import { describe, it, expect } from 'vitest'
import { buildCosmeticPalette, cosmeticAccentInk } from '@/lib/site-templates/cosmetic/palette'
import { parseHex, contrastRatio } from '@/lib/clinic-site-theme'

const ratio = (a: string, b: string) => contrastRatio(parseHex(a)!, parseHex(b)!)

// Tame, pale, hostile, and missing brands — the recipe must hold for all.
const BRANDS = ['#1D4ED8', '#9CAF9F', '#FFE900', '#FFFFFF', '#000000', null, 'junk'] as const

describe('buildCosmeticPalette — charcoal/cream with brand-as-accent', () => {
  it('fixes the luxury neutrals regardless of brand (never pure white/black)', () => {
    for (const brand of BRANDS) {
      const p = buildCosmeticPalette(brand)
      expect(p.bg).toBe('#F4F0E7')
      expect(p.ink).toBe('#211E1A')
      expect(p.deep).toBe('#26221D')
      expect(p.bg.toLowerCase()).not.toBe('#ffffff')
      expect(p.ink.toLowerCase()).not.toBe('#000000')
    }
  })

  it('clears the WCAG floors for every brand input', () => {
    for (const brand of BRANDS) {
      const p = buildCosmeticPalette(brand)
      expect(ratio(p.ink, p.bg), `ink/bg @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.inkMuted, p.bg), `inkMuted/bg @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.heading, p.bg), `heading/bg @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.deepInk, p.deep), `deepInk/deep @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.deepMuted, p.deep), `deepMuted/deep @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.brandInk, p.brand), `brandInk/brand @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.brandSoftInk, p.brandSoft), `brandSoftInk/brandSoft @ ${brand}`).toBeGreaterThanOrEqual(4.5)
      expect(ratio(p.stripInk, p.strip), `stripInk/strip @ ${brand}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('no-brand falls back to the bronze accent family, not blue or teal', () => {
    const p = buildCosmeticPalette(null)
    // Bronze family: warm hue — red channel dominates blue.
    const rgb = parseHex(p.brand)!
    expect(rgb.r).toBeGreaterThan(rgb.b)
  })

  it('cosmeticAccentInk is AA-readable on the cream ground for hostile brands', () => {
    for (const brand of BRANDS) {
      const ink = cosmeticAccentInk(brand)
      expect(ratio(ink, '#F4F0E7'), `accent ink @ ${brand}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
