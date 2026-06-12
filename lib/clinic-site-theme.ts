// Shared warm-neutral palette for every clinic public-site surface.
// Imported by modern-template.tsx, blog-chrome.tsx, and the new /about,
// /services, /faq pages. Brand color (clinic-chosen) layers on top for
// CTAs and accent strips — these constants stay the same regardless.
export const CLINIC_THEME = {
  BG: '#FAF7F2',
  INK: '#1C1A17',
  INK_MUTED: '#6B635A',
  SURFACE: '#FFFFFF',
  BORDER: '#E8E2D9',
  // Forest-teal — the signature deep band used (sparingly, one per page) for a
  // rhythm break on subpages, the footer, and testimonial cards. Always carries
  // white text, so it's a *background* color, never a text fill. Matches the
  // `'teal'` variant in ClosingCTA.
  TEAL: '#36514c',
} as const

// ── Contrast floor (WCAG AA body text = 4.5:1) ───────────────────────────────
//
// The clinic-chosen brand color is used two ways on the public site:
//   • as a BACKGROUND (bands, pills, CTAs) with white text on top, and
//   • as a TEXT FILL on display headings (the Fraunces serif H1/H2s).
// The first is fine at any saturation. The second breaks for pale brands
// (a light mint heading on the #FAF7F2 ground is unreadable). `readableInk`
// darkens the brand hue until it clears 4.5:1 against the ground, preserving
// the brand's hue/identity where possible, and falls back to INK when the hue
// simply can't get dark enough (e.g. pure yellow). Pure (no DOM, no canvas) so
// it runs in server components and is unit-testable.

/** sRGB hex (#rgb / #rrggbb, with or without leading #) → {r,g,b} 0-255.
 *  Returns null for anything unparseable so callers can fall back. */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== 'string') return null
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Relative luminance per WCAG 2.x (sRGB → linear → weighted). */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two colors (1:1 … 21:1). */
function contrastRatio(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const INK_RGB = parseHex(CLINIC_THEME.INK)!

/**
 * Return a heading-safe text fill derived from `brandHex` that meets the WCAG
 * AA contrast floor (default 4.5:1) against `groundHex` (default the warm site
 * ground #FAF7F2).
 *
 * Strategy:
 *   1. If the raw brand already clears the floor, return it untouched (keep the
 *      clinic's exact identity color).
 *   2. Otherwise darken it toward black in small steps; the first step that
 *      clears the floor wins (preserves hue while gaining contrast).
 *   3. If even near-black-in-hue can't clear it (degenerate cases), fall back
 *      to the neutral INK — guaranteed readable.
 *
 * Backgrounds / accents must NOT use this (white-on-brand is already legible);
 * it's exclusively for brand-as-text-fill on the light ground.
 */
export function readableInk(
  brandHex: string | null | undefined,
  groundHex: string = CLINIC_THEME.BG,
  minRatio: number = 4.5,
): string {
  const brand = parseHex(brandHex ?? '')
  if (!brand) return CLINIC_THEME.INK
  const ground = parseHex(groundHex) ?? parseHex(CLINIC_THEME.BG)!

  if (contrastRatio(brand, ground) >= minRatio) return toHex(brand)

  // Darken toward black, preserving hue, until we clear the floor.
  for (let f = 0.92; f >= 0; f -= 0.06) {
    const candidate = { r: brand.r * f, g: brand.g * f, b: brand.b * f }
    if (contrastRatio(candidate, ground) >= minRatio) return toHex(candidate)
  }

  // The hue can't carry the contrast (e.g. a bright yellow against near-white).
  // INK is the guaranteed-readable neutral; only fall back to it if it actually
  // clears the floor against this ground (it does for the warm default).
  if (contrastRatio(INK_RGB, ground) >= minRatio) return CLINIC_THEME.INK
  return '#000000'
}
