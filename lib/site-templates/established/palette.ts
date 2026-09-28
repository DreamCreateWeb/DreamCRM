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
 * The Established palette recipe — the credentialed practice.
 *
 * The register is the one the owner is known for (the Arkansas State Dental
 * Association site, 2026-09): a cream ground, a deep navy ink family that
 * does the headings and the footer band, ONE accent that the clinic's brand
 * color supplies (the italic word in the headline, the eyebrows, the pill
 * buttons), and a fixed gold hairline that underlines the accent word and
 * rings the crest. The navy and the gold are the template's signature and
 * are the SAME for every clinic, exactly as the cosmetic template's charcoal
 * and the hometown template's marigold are; only the accent is theirs.
 *
 * Why the brand is the accent and not the ink: a practice that hands us
 * Cardinal red must not get a red website. It gets a navy-and-cream website
 * with red where a serious document puts red — one word, one button, one
 * eyebrow. A practice whose brand IS navy gets navy on navy on cream, which
 * is the most institutional version of the design and also correct.
 *
 * Same 17 roles / CSS vars as every recipe; every pairing WCAG-floored (the
 * conformance harness pins it for tame and hostile brands alike).
 */

// The fixed navy ink family — deep enough for headings on cream, warm enough
// not to read as corporate blue.
const NAVY_INK = '#152238'
const NAVY_MUTED = '#4B5568'
const NAVY_DEEP = '#0F1B2D'
const CREAM_ON_NAVY = '#F7F3EA'
const CREAM_MUTED_ON_NAVY = '#B9C0CC'

// The cream ground family — paper, not clinic white.
const CREAM_BG = '#FAF7F0'
const CREAM_SURFACE = '#FFFDF8'
const CREAM_TILE = '#F1ECE0'
const CREAM_BORDER = '#E3DCCB'

// The signature gold hairline — fixed on purpose (see the recipe doc): it has
// to sit beside ANY accent, and a derived second accent could land on top of
// the first and vanish.
const GOLD = '#C9A24A'
const GOLD_H = 42

// No-brand fallback: the accent becomes the association red the register
// was born with.
const ACCENT_FALLBACK = '#B5121B'

export function buildEstablishedPalette(brandHex: string | null | undefined): ClinicPalette {
  const rgb = parseHex(brandHex ?? '') ?? parseHex(ACCENT_FALLBACK)!
  const { h, s, l } = rgbToHsl(rgb)
  const white = { r: 255, g: 255, b: 255 }

  // The accent: the brand, darkened only until white reads on it, and given
  // enough saturation that a pale brand still registers as an accent rather
  // than a smudge. A brand with no chroma at all (white, gray) falls to the
  // register's own red — a gray accent word is not an accent.
  const chromaless = s < 8
  const accentHsl = chromaless
    ? rgbToHsl(parseHex(ACCENT_FALLBACK)!)
    : { h, s: clamp(s, 45, 85), l: Math.min(l, 46) }
  const accentStrongHsl = darkenUntilWhiteReadable(accentHsl, 4.5)
  const brandStrong = hslToHex(accentStrongHsl)
  const brandStrongRgb = parseHex(brandStrong)!
  const brandInk = contrastRatio(white, brandStrongRgb) >= 4.5 ? '#FFFFFF' : NAVY_INK

  // The soft accent wash for icon badges and hover fills, with its own ink.
  const brandSoft = hslToHex({ h: accentStrongHsl.h, s: clamp(accentStrongHsl.s * 0.6, 18, 40), l: 93 })
  const brandSoftInk = readableInk(brandStrong, brandSoft, 4.5)

  // Headings are NAVY, never the accent — the accent is one word, not the
  // headline. `heading` therefore ignores the brand entirely.
  const heading = NAVY_INK

  // The deep band (footer, hours card cap): navy, with cream ink. Fixed.
  const deep = NAVY_DEEP
  const deepInk = CREAM_ON_NAVY
  const deepMuted = hslToHex(lightenUntilReadable(rgbToHsl(parseHex(CREAM_MUTED_ON_NAVY)!), deep, 4.5))

  // The gold hairline + the crest ring. Its ink is navy (gold is light).
  const strip = hslToHex({ h: GOLD_H, s: 52, l: 54 })
  const stripInk = contrastRatio(parseHex(NAVY_INK)!, parseHex(strip)!) >= 4.5 ? NAVY_INK : NAVY_DEEP

  return {
    brand: brandStrong,
    brandInk,
    brandStrong,
    brandSoft,
    brandSoftInk,
    heading,
    bg: CREAM_BG,
    surface: CREAM_SURFACE,
    surfaceAlt: CREAM_TILE,
    border: CREAM_BORDER,
    ink: NAVY_INK,
    inkMuted: NAVY_MUTED,
    deep,
    deepInk,
    deepMuted,
    strip,
    stripInk,
  }
}

/** The fixed gold, exported for the crest's SVG strokes (it is also
 *  `--c-strip`; the constant exists so the ring can be drawn in a context
 *  where the var may not be set, e.g. the Studio's template thumbnails). */
export const ESTABLISHED_GOLD = GOLD
