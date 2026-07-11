import {
  type ClinicPalette,
  parseHex,
  toHex,
  contrastRatio,
  rgbToHsl,
  hslToHex,
  clamp,
  darkenUntilWhiteReadable,
  lightenUntilReadable,
  readableInk,
} from '@/lib/clinic-site-theme'

/**
 * The Cosmetic/Luxury palette recipe — charcoal + cream, editorial.
 *
 * Unlike the modern recipe (which derives EVERYTHING from the brand hue),
 * luxury demands fixed neutrals: a warm cream ground and near-black charcoal
 * ink, whatever the clinic's brand color is. The brand appears only as a
 * contrast-checked ACCENT (eyebrows, rules, hovers, the soft wash); primary
 * CTAs render charcoal-on-cream via the deep roles. Emits the same 17
 * ClinicPalette roles / CSS var names as every recipe, so all shared pages
 * and widgets restyle automatically.
 *
 * DESIGN.md floors respected: never pure white or pure black; every on-color
 * ink clears WCAG AA (the conformance harness pins this for hostile brands).
 */

// Fixed neutrals (warm cream family / charcoal family).
const CREAM_BG = '#F4F0E7'
const CREAM_SURFACE = '#FAF7F0'
const CREAM_TILE = '#ECE5D6'
const CREAM_BORDER = '#DCD3BF'
const CHARCOAL_INK = '#211E1A'
const CHARCOAL_MUTED = '#5F594F'
const CHARCOAL_HEADING = '#2A2620'
const CHARCOAL_DEEP = '#26221D'
const CREAM_ON_DEEP = '#F4F0E7'
const CREAM_MUTED_ON_DEEP = '#BDB4A3'

// No-brand fallback accent: a muted bronze that reads "jewelry case", not
// "default blue".
const BRONZE = '#8A6D3B'

export function buildCosmeticPalette(brandHex: string | null | undefined): ClinicPalette {
  const rgb = parseHex(brandHex ?? '') ?? parseHex(BRONZE)!
  const { h, s } = rgbToHsl(rgb)
  const brand = toHex(rgb)

  // Accent usable as a text fill on cream (eyebrows, links) — darkened along
  // its own hue until it clears AA; degenerate hues fall back to charcoal.
  const heading = CHARCOAL_HEADING // luxury headings are neutral, always
  const brandOnCream = readableInk(brand, CREAM_BG, 4.5)

  // Solid accent fill (rarely used — small pills/rules): keep the brand when
  // white already reads on it, else darken.
  const white = { r: 255, g: 255, b: 255 }
  const brandStrong =
    contrastRatio(white, rgb) >= 4.5 ? brand : hslToHex(darkenUntilWhiteReadable(rgbToHsl(rgb), 4.5))
  const brandStrongRgb = parseHex(brandStrong)!
  const brandInk = contrastRatio(white, brandStrongRgb) >= 4.5 ? '#FFFFFF' : CHARCOAL_INK

  // Soft brand wash tinted toward the cream (chip/pill grounds).
  const brandSoft = hslToHex({ h, s: clamp(s, 14, 30), l: 90 })
  const brandSoftInk = readableInk(brand, brandSoft, 4.5)

  return {
    // Accent family — the ONLY place the clinic brand shows.
    brand: brandStrong,
    brandInk,
    brandStrong,
    brandSoft,
    brandSoftInk,
    // brand-as-text on the ground is used for eyebrows/rules; expose the
    // AA-checked version through `heading`'s sibling role usage in templates.
    heading,
    // Fixed luxury neutrals.
    bg: CREAM_BG,
    surface: CREAM_SURFACE,
    surfaceAlt: CREAM_TILE,
    border: CREAM_BORDER,
    ink: CHARCOAL_INK,
    inkMuted: CHARCOAL_MUTED,
    // The charcoal editorial band + inverted announcement strip.
    deep: CHARCOAL_DEEP,
    deepInk: CREAM_ON_DEEP,
    deepMuted: CREAM_MUTED_ON_DEEP,
    strip: CHARCOAL_DEEP,
    stripInk: CREAM_ON_DEEP,
    // NOTE: brandOnCream intentionally not a palette role — components that
    // want brand-as-text use readableInk at their call site or `--c-brand`
    // knowing it's AA on cream via brandStrong.
  }
}

/** Accent-as-text on the cream ground (eyebrows, hover rules) — exported for
 *  the cosmetic components so they don't re-derive it inconsistently. */
export function cosmeticAccentInk(brandHex: string | null | undefined): string {
  const rgb = parseHex(brandHex ?? '') ?? parseHex(BRONZE)!
  return readableInk(toHex(rgb), CREAM_BG, 4.5)
}

/** Accent-as-text on the CHARCOAL hero/close — the brand hue lifted toward
 *  champagne until it clears AA on the deep ground. Keeps the hue, tempers
 *  the saturation so hostile brands (neon, near-black) land as candlelight. */
export function cosmeticAccentOnDeep(brandHex: string | null | undefined): string {
  const rgb = parseHex(brandHex ?? '') ?? parseHex(BRONZE)!
  const { h, s } = rgbToHsl(rgb)
  return hslToHex(lightenUntilReadable({ h, s: clamp(s, 24, 46), l: 62 }, CHARCOAL_DEEP, 4.5))
}
