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
  inkOn,
} from '@/lib/clinic-site-theme'

/**
 * The Pediatric palette recipe — soft pastels + one bright, bouncy accent.
 *
 * A middle path between the modern recipe (everything brand-derived) and the
 * cosmetic one (fixed neutrals): the GROUND is a soft pastel wash of the
 * clinic's brand hue (so a purple-brand practice gets lavender air, a teal
 * one gets seafoam), the INK is a warm friendly navy-brown rather than harsh
 * black, and the brand itself turns up saturated and happy on buttons, the
 * deep band, and the announcement strip. Same 17 roles / CSS vars as every
 * recipe; every pairing WCAG-floored (the conformance harness pins it).
 *
 * DESIGN.md floors: never pure white/black grounds; playful ≠ illegible.
 */

// Friendly near-navy ink family — softer than charcoal, still 4.5:1+ on the
// pastel grounds.
const PLAY_INK = '#2B2745'
const PLAY_INK_MUTED = '#5B5675'

// No-brand fallback accent: a cheerful bubblegum-teal.
const SPLASH = '#17BEBB'

export function buildPediatricPalette(brandHex: string | null | undefined): ClinicPalette {
  const rgb = parseHex(brandHex ?? '') ?? parseHex(SPLASH)!
  const { h, s } = rgbToHsl(rgb)
  const brand = toHex(rgb)

  // Pastel neutrals — the brand hue at whisper saturation, airy lightness.
  const bg = hslToHex({ h, s: clamp(s, 18, 34), l: 95 })
  const surface = hslToHex({ h, s: clamp(s * 0.5, 4, 12), l: 99 })
  const surfaceAlt = hslToHex({ h: (h + 40) % 360, s: clamp(s, 24, 44), l: 91 })
  const border = hslToHex({ h, s: clamp(s, 16, 30), l: 84 })

  // Bright bouncy accent: keep the brand saturated; darken only until white
  // reads on it so buttons stay vivid.
  const white = { r: 255, g: 255, b: 255 }
  const brandStrong =
    contrastRatio(white, rgb) >= 4.5
      ? brand
      : hslToHex(darkenUntilWhiteReadable({ h, s: clamp(s, 55, 90), l: Math.min(rgbToHsl(rgb).l, 46) }, 4.5))
  const brandStrongRgb = parseHex(brandStrong)!
  const brandInk = contrastRatio(white, brandStrongRgb) >= 4.5 ? '#FFFFFF' : PLAY_INK
  const brandSoft = hslToHex({ h, s: clamp(s, 36, 64), l: 90 })
  const brandSoftInk = readableInk(brand, brandSoft, 4.5)
  const heading = readableInk(brand, bg, 4.5)

  // The deep band goes rich playful-dark in the brand hue (storybook night
  // sky, not corporate charcoal).
  const deepHsl = darkenUntilWhiteReadable({ h, s: clamp(s, 34, 58), l: 28 }, 4.8)
  const deep = hslToHex(deepHsl)
  const deepInk = hslToHex({ h, s: clamp(s, 0, 14), l: 97 })
  const deepMuted = hslToHex(lightenUntilReadable({ h, s: clamp(s * 0.6, 14, 32), l: 76 }, deep))

  // Announcement strip: a sunny second pastel (hue-shifted) with dark ink.
  const strip = hslToHex({ h: (h + 40) % 360, s: clamp(s * 1.1, 48, 88), l: 86 })
  const stripInk = inkOn(strip, PLAY_INK)

  return {
    brand: brandStrong,
    brandInk,
    brandStrong,
    brandSoft,
    brandSoftInk,
    heading,
    bg,
    surface,
    surfaceAlt,
    border,
    ink: PLAY_INK,
    inkMuted: PLAY_INK_MUTED,
    deep,
    deepInk,
    deepMuted,
    strip,
    stripInk,
  }
}
