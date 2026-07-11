// Shared palette for every clinic public-site surface.
//
// The clinic chooses ONE color (their brand). Everything else — the warm
// ground, the card surface, the hairline borders, the deep "rhythm-break" band
// (footer / testimonials / insurance), the bright announcement strip, and the
// readable inks that sit on each — is DERIVED from that one color by
// `buildClinicPalette` so the whole site harmonizes around the brand instead of
// pinning a fixed teal/beige scheme on every clinic. The derivation is pure,
// deterministic, and contrast-checked (no AI, no network, no persistence), so
// it runs at render time on the server and is unit-testable.
//
// These CLINIC_THEME constants are the DEFAULTS the derived values fall back to
// (and the literal fallbacks inside every `var(--c-*, <here>)` reference), kept
// so a surface rendered outside the site layout (e.g. a unit test) still paints.
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

// ── Palette derivation (one brand color → a whole harmonized site theme) ──────
//
// We work in HSL: keep the brand's HUE, then dial SATURATION + LIGHTNESS to
// hit a designed target for each role. Neutrals carry only a whisper of the
// brand hue (so a blue brand gets a cool ground, a terracotta brand a warm one
// — they read as "tinted near-white", never "colored"); the deep band + bright
// strip carry the brand at full presence. Every on-color ink is contrast-raised
// until it clears WCAG AA so nothing the clinic can pick produces unreadable
// text.

type Rgb = { r: number; g: number; b: number }
type Hsl = { h: number; s: number; l: number } // h 0-360, s/l 0-100

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h, s: s * 100, l: l * 100 }
}

function hslToHex({ h, s, l }: Hsl): string {
  const sn = clamp(s, 0, 100) / 100
  const ln = clamp(l, 0, 100) / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = ln - c / 2
  return toHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 })
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** White vs near-black: whichever has more contrast on `bgHex`. The dark option
 *  is the (hue-tinted) site ink so dark-on-color text still feels of-a-piece. */
function inkOn(bgHex: string, darkHex: string): string {
  const bg = parseHex(bgHex)
  if (!bg) return '#FFFFFF'
  const dark = parseHex(darkHex) ?? INK_RGB
  const white = { r: 255, g: 255, b: 255 }
  return contrastRatio(white, bg) >= contrastRatio(dark, bg) ? '#FFFFFF' : toHex(dark)
}

/** Darken a color (drop HSL lightness) until white text clears `minRatio` on it,
 *  so the deep band always carries legible white. */
function darkenUntilWhiteReadable(hsl: Hsl, minRatio = 4.8): Hsl {
  const out = { ...hsl }
  const white = { r: 255, g: 255, b: 255 }
  // 48 steps × 2L covers the full descent from a near-white start (L≈96) down
  // to the L=8 floor — the deep-band caller (seeded at L=25) converges in a
  // handful; brandStrong can start from ANY brand a clinic picks.
  for (let i = 0; i < 48; i++) {
    const rgb = parseHex(hslToHex(out))!
    if (contrastRatio(white, rgb) >= minRatio) break
    out.l = Math.max(8, out.l - 2)
    if (out.l <= 8) break
  }
  return out
}

/** Lighten a color until it clears `minRatio` against the (dark) `onHex`, so
 *  muted secondary text on the deep band stays readable. */
function lightenUntilReadable(hsl: Hsl, onHex: string, minRatio = 4.5): Hsl {
  const on = parseHex(onHex)
  if (!on) return hsl
  const out = { ...hsl }
  for (let i = 0; i < 24; i++) {
    const rgb = parseHex(hslToHex(out))!
    if (contrastRatio(rgb, on) >= minRatio) break
    out.l = Math.min(96, out.l + 2)
    if (out.l >= 96) break
  }
  return out
}

export interface ClinicPalette {
  brand: string
  brandInk: string // readable text ON a brand-filled surface (button labels)
  /** Solid CTA fill: the brand, darkened ONLY as far as needed for white text
   *  to clear AA (4.5:1). Dark brands pass through verbatim; a pale brand
   *  (sage, powder blue) deepens so "Book a Visit" never washes out. */
  brandStrong: string
  brandSoft: string // light brand wash (chip / pill backgrounds)
  brandSoftInk: string // readable text on brandSoft
  heading: string // brand-as-text on the ground (Fraunces H1/H2) — contrast-safe
  bg: string // page ground
  surface: string // cards
  surfaceAlt: string // cream tiles / hover fills
  border: string // hairlines
  ink: string // body text
  inkMuted: string // secondary text
  deep: string // the dark rhythm-break band (footer / testimonials / insurance)
  deepInk: string // text on deep
  deepMuted: string // secondary text on deep
  strip: string // bright announcement strip
  stripInk: string // text on strip
}

/**
 * Derive a complete, harmonized site palette from a single brand hex. Falls
 * back to the warm-neutral defaults (≈ the original fixed scheme) when the
 * brand is missing/unparseable, so an un-branded clinic still looks finished.
 */
export function buildClinicPalette(brandHex: string | null | undefined): ClinicPalette {
  const rgb = parseHex(brandHex ?? '')
  if (!rgb) {
    // No/!parseable brand → the original warm-neutral scheme verbatim.
    return {
      brand: CLINIC_THEME.INK,
      brandInk: '#FFFFFF',
      brandStrong: CLINIC_THEME.INK,
      brandSoft: '#EFEAE1',
      brandSoftInk: CLINIC_THEME.INK,
      heading: CLINIC_THEME.INK,
      bg: CLINIC_THEME.BG,
      surface: CLINIC_THEME.SURFACE,
      surfaceAlt: '#F4EBDD',
      border: CLINIC_THEME.BORDER,
      ink: CLINIC_THEME.INK,
      inkMuted: CLINIC_THEME.INK_MUTED,
      deep: CLINIC_THEME.TEAL,
      deepInk: '#FFFFFF',
      deepMuted: '#C5CFCC',
      strip: '#E7FB7E',
      stripInk: CLINIC_THEME.INK,
    }
  }

  const { h, s } = rgbToHsl(rgb)
  const brand = toHex(rgb)

  // Neutrals — brand HUE, tiny saturation, near-white / near-black lightness.
  const bg = hslToHex({ h, s: clamp(s, 7, 15), l: 96.5 })
  const surface = hslToHex({ h, s: clamp(s * 0.5, 0, 8), l: 99.6 })
  const surfaceAlt = hslToHex({ h, s: clamp(s, 10, 24), l: 92.5 })
  const border = hslToHex({ h, s: clamp(s, 8, 18), l: 88 })
  const ink = hslToHex({ h, s: clamp(s, 6, 14), l: 11 })
  const inkMuted = hslToHex({ h, s: clamp(s, 6, 12), l: 40 })

  // Brand surfaces.
  const brandInk = inkOn(brand, ink)
  // Solid-CTA fill: pass the brand through untouched when white already clears
  // AA on it; otherwise darken the brand's own hue just far enough. Keeps
  // primary buttons bold on pale brands without shifting good dark brands.
  const white = { r: 255, g: 255, b: 255 }
  const brandStrong =
    contrastRatio(white, rgb) >= 4.5
      ? brand
      : hslToHex(darkenUntilWhiteReadable(rgbToHsl(rgb), 4.5))
  const brandSoft = hslToHex({ h, s: clamp(s, 28, 62), l: 93 })
  const brandSoftInk = readableInk(brand, brandSoft, 4.5)
  const heading = readableInk(brand, bg, 4.5)

  // Deep rhythm-break band — rich + dark, white text guaranteed.
  const deepHsl = darkenUntilWhiteReadable({ h, s: clamp(s, 26, 48), l: 25 })
  const deep = hslToHex(deepHsl)
  const deepInk = hslToHex({ h, s: clamp(s, 0, 12), l: 97 })
  const deepMuted = hslToHex(lightenUntilReadable({ h, s: clamp(s * 0.6, 12, 30), l: 76 }, deep))

  // Bright announcement strip — light, lively, brand-tinted; dark text.
  const strip = hslToHex({ h, s: clamp(s * 1.1, 42, 88), l: 85 })
  const stripInk = inkOn(strip, ink)

  return {
    brand,
    brandInk,
    brandStrong,
    brandSoft,
    brandSoftInk,
    heading,
    bg,
    surface,
    surfaceAlt,
    border,
    ink,
    inkMuted,
    deep,
    deepInk,
    deepMuted,
    strip,
    stripInk,
  }
}

/** CSS custom-property name for each palette role. Single source of truth so
 *  the layout injector and the component `var(--c-*)` references can't drift. */
export const PALETTE_VARS: Record<keyof ClinicPalette, string> = {
  brand: '--c-brand',
  brandInk: '--c-brand-ink',
  brandStrong: '--c-brand-strong',
  brandSoft: '--c-brand-soft',
  brandSoftInk: '--c-brand-soft-ink',
  heading: '--c-heading',
  bg: '--c-bg',
  surface: '--c-surface',
  surfaceAlt: '--c-surface-alt',
  border: '--c-border',
  ink: '--c-ink',
  inkMuted: '--c-ink-muted',
  deep: '--c-deep',
  deepInk: '--c-deep-ink',
  deepMuted: '--c-deep-muted',
  strip: '--c-strip',
  stripInk: '--c-strip-ink',
}

/** `buildClinicPalette` → a `{ '--c-bg': '#…', … }` map ready to spread into a
 *  React `style` prop (or serialize into a `:root { … }` block). */
export function clinicPaletteVars(
  brandHex: string | null | undefined,
): Record<string, string> {
  const p = buildClinicPalette(brandHex)
  const out: Record<string, string> = {}
  for (const key of Object.keys(PALETTE_VARS) as (keyof ClinicPalette)[]) {
    out[PALETTE_VARS[key]] = p[key]
  }
  return out
}

/** Serialize any ClinicPalette to a `:root{…}` CSS string for a `<style>`
 *  tag. Template palette recipes all emit the same roles, so this is the one
 *  injector no matter which template built the palette. */
export function paletteCss(p: ClinicPalette): string {
  const body = (Object.keys(PALETTE_VARS) as (keyof ClinicPalette)[])
    .map((key) => `${PALETTE_VARS[key]}:${p[key]}`)
    .join(';')
  return `:root{${body}}`
}

/** Serialize the palette to a `:root{…}` CSS string for a `<style>` tag (the
 *  site layout injects it once so every page + subpage inherits the theme). */
export function clinicPaletteCss(brandHex: string | null | undefined): string {
  return paletteCss(buildClinicPalette(brandHex))
}
