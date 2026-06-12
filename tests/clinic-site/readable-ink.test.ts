/**
 * Contrast floor — `readableInk(brandHex, groundHex?)` must return a text fill
 * that clears WCAG AA (4.5:1) against the warm site ground, darkening the brand
 * hue when needed and falling back to ink for hues that can't carry contrast.
 * This is the keystone of Wave 4's "no unreadable pale-brand heading" sweep.
 */
import { describe, it, expect } from 'vitest'
import { readableInk, CLINIC_THEME } from '@/lib/clinic-site-theme'

// Local copy of the WCAG contrast math so the test is independent of the
// module's private helpers (we assert the OUTPUT clears the ratio).
function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function ratio(a: string, b: string): number {
  const la = luminance(parseHex(a))
  const lb = luminance(parseHex(b))
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const GROUND = CLINIC_THEME.BG // #FAF7F2

describe('readableInk', () => {
  it('returns a fill that clears 4.5:1 against the warm ground for the sage default', () => {
    const out = readableInk('#9CAF9F')
    expect(ratio(out, GROUND)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps an already-dark brand essentially as-is (still ≥4.5:1)', () => {
    // Deep teal — already high-contrast on a near-white ground.
    const out = readableInk('#2A7F8C')
    expect(ratio(out, GROUND)).toBeGreaterThanOrEqual(4.5)
  })

  it('darkens a PALE brand until it clears the floor (the core fix)', () => {
    // A pale mint that fails badly on #FAF7F2 raw.
    const pale = '#CFE8D6'
    expect(ratio(pale, GROUND)).toBeLessThan(4.5) // sanity: raw is unreadable
    const out = readableInk(pale)
    expect(ratio(out, GROUND)).toBeGreaterThanOrEqual(4.5)
  })

  it('handles a bright yellow (hue that can barely carry contrast) by clearing the floor', () => {
    const out = readableInk('#FFE600')
    expect(ratio(out, GROUND)).toBeGreaterThanOrEqual(4.5)
  })

  it('falls back to INK for null / undefined / unparseable input', () => {
    expect(readableInk(null)).toBe(CLINIC_THEME.INK)
    expect(readableInk(undefined)).toBe(CLINIC_THEME.INK)
    expect(readableInk('not-a-color')).toBe(CLINIC_THEME.INK)
    expect(readableInk('')).toBe(CLINIC_THEME.INK)
  })

  it('accepts 3-digit hex and with/without leading #', () => {
    expect(readableInk('#000')).toBeTruthy()
    expect(ratio(readableInk('123456'), GROUND)).toBeGreaterThanOrEqual(4.5)
  })

  it('respects a custom ground + minRatio', () => {
    // On a dark ground, a pale brand is ALREADY high-contrast → returned as-is.
    const out = readableInk('#CFE8D6', '#101010', 4.5)
    expect(ratio(out, '#101010')).toBeGreaterThanOrEqual(4.5)
  })

  it('never returns a value that fails the floor for a wide spread of brands', () => {
    const brands = ['#9CAF9F', '#4DCDC4', '#E87B5E', '#7E957F', '#B8D4E8', '#F0D9BD', '#36514c', '#FFFFFF', '#FAF7F2']
    for (const b of brands) {
      const out = readableInk(b)
      expect(ratio(out, GROUND)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
