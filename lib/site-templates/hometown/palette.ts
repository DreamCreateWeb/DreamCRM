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
 * The Hometown palette recipe — the trusted local practice.
 *
 * The design's whole job is to look finished WITHOUT photography, so color
 * carries more weight than in any other template: a deep, confident wash of
 * the clinic's brand hue paints the full-width hero and footer, the body
 * sits on warm paper (never clinical white), and ONE fixed marigold accent
 * (the same in every clinic — it's the template's signature, like the
 * cosmetic template's charcoal) powers the contact/hours card so phone and
 * hours read from across the room. Same 17 roles / CSS vars as every recipe;
 * every pairing WCAG-floored (the conformance harness pins it).
 */

// Warm charcoal-navy ink family — sturdier than gray, softer than black.
const TOWN_INK = '#27303B'
const TOWN_INK_MUTED = '#57616E'

// No-brand fallback: the classic trusted-practice navy.
const TRUST_NAVY = '#1F4E79'

// The signature marigold — fixed on purpose (see recipe doc above): the
// hours/contact card must pop against ANY brand hue, and a derived accent
// could land near the brand and disappear.
const MARIGOLD_H = 38

export function buildHometownPalette(brandHex: string | null | undefined): ClinicPalette {
  const rgb = parseHex(brandHex ?? '') ?? parseHex(TRUST_NAVY)!
  const { h, s } = rgbToHsl(rgb)
  const brand = toHex(rgb)

  // Warm paper neutrals with a whisper of the brand hue.
  const bg = hslToHex({ h, s: clamp(s * 0.25, 6, 14), l: 97 })
  const surface = hslToHex({ h, s: clamp(s * 0.15, 3, 8), l: 99 })
  const surfaceAlt = hslToHex({ h, s: clamp(s * 0.5, 10, 22), l: 93 })
  const border = hslToHex({ h, s: clamp(s * 0.4, 8, 18), l: 86 })

  // Buttons/nav: the brand, darkened only until white reads on it.
  const white = { r: 255, g: 255, b: 255 }
  const brandStrong =
    contrastRatio(white, rgb) >= 4.5
      ? brand
      : hslToHex(darkenUntilWhiteReadable({ h, s: clamp(s, 45, 80), l: Math.min(rgbToHsl(rgb).l, 44) }, 4.5))
  const brandStrongRgb = parseHex(brandStrong)!
  const brandInk = contrastRatio(white, brandStrongRgb) >= 4.5 ? '#FFFFFF' : TOWN_INK
  const brandSoft = hslToHex({ h, s: clamp(s, 22, 42), l: 92 })
  const brandSoftInk = readableInk(brand, brandSoft, 4.5)
  const heading = readableInk(brand, bg, 4.5)

  // The hero/footer: a deep, confident brand wash — the design's backbone.
  const deepHsl = darkenUntilWhiteReadable({ h, s: clamp(s, 36, 60), l: 27 }, 4.8)
  const deep = hslToHex(deepHsl)
  const deepInk = hslToHex({ h, s: clamp(s * 0.3, 2, 8), l: 98 })
  const deepMuted = hslToHex(lightenUntilReadable({ h, s: clamp(s * 0.5, 12, 28), l: 78 }, deep))

  // The signature marigold card + its dark readable ink.
  const strip = hslToHex({ h: MARIGOLD_H, s: 82, l: 57 })
  const stripInk = inkOn(strip, TOWN_INK)

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
    ink: TOWN_INK,
    inkMuted: TOWN_INK_MUTED,
    deep,
    deepInk,
    deepMuted,
    strip,
    stripInk,
  }
}
