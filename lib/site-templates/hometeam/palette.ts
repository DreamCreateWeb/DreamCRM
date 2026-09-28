import {
  type ClinicPalette,
  parseHex,
  contrastRatio,
  rgbToHsl,
  hslToHex,
  clamp,
  darkenUntilWhiteReadable,
  lightenUntilReadable,
  readableInk,
} from '@/lib/clinic-site-theme'

/**
 * The Home Team palette recipe — the practice everyone in town knows.
 *
 * Built for Complete Family Dentistry in Jacksonville, AR (2026-09-28), a
 * clinic decorated like a ballpark inside, with a sky-blue-and-gray logo.
 * The recipe treats the clinic's brand color the way a team treats its
 * color: it IS the identity, so it goes on the trim, the scoreboard digits,
 * the pennants and the buttons, and everything else is the uniform — a
 * charcoal ink (jersey gray-black), "home whites" paper with a whisper of
 * the brand hue, and a charcoal scoreboard band. No second accent: a team
 * has one color, and the white and the charcoal are what make it read.
 *
 * Roles, in team terms:
 *   strip / stripInk   the TEAM COLOR itself (the brand at jersey strength)
 *                      with charcoal on it — trim stripes, scoreboard digits,
 *                      pennants
 *   brandStrong        the same hue driven deep enough for white ink —
 *                      buttons and links
 *   deep / deepInk     the scoreboard: charcoal with white
 *   bg / surface       home whites
 *
 * Same 17 roles / CSS vars as every recipe; every pairing WCAG-floored (the
 * conformance harness pins it for tame and hostile brands alike).
 */

const CHARCOAL_INK = '#2A2E33'
const CHARCOAL_DEEP = '#1F2327'
const WHITE_ON_CHARCOAL = '#F5F7F8'
const GRAY_ON_CHARCOAL = '#B4BAC0'

// No-brand fallback: a sky blue, since that is the team this was built for.
const TEAM_FALLBACK = '#40C0E0'

export function buildHometeamPalette(brandHex: string | null | undefined): ClinicPalette {
  const rgb = parseHex(brandHex ?? '') ?? parseHex(TEAM_FALLBACK)!
  const { h, s } = rgbToHsl(rgb)
  const white = { r: 255, g: 255, b: 255 }

  // A chromaless brand (white, gray) has no team color; fall to the sky.
  const chromaless = s < 8
  const src = chromaless ? rgbToHsl(parseHex(TEAM_FALLBACK)!) : { h, s }
  const teamHsl = { h: src.h, s: clamp(src.s, 55, 90), l: 58 }
  const teamH = teamHsl.h

  // Home whites: paper with a whisper of the team hue.
  const bg = hslToHex({ h: teamH, s: clamp(teamHsl.s * 0.18, 6, 14), l: 98 })
  const surface = hslToHex({ h: teamH, s: clamp(teamHsl.s * 0.1, 3, 8), l: 99.4 })
  const surfaceAlt = hslToHex({ h: teamH, s: clamp(teamHsl.s * 0.3, 10, 22), l: 95 })
  const border = hslToHex({ h: teamH, s: clamp(teamHsl.s * 0.25, 8, 18), l: 88 })

  // The team color at jersey strength, with charcoal on it. Pushed lighter
  // if charcoal cannot read on it (a very dark brand), never darker: the
  // deep-ink job belongs to brandStrong.
  let stripHsl = { ...teamHsl }
  const charcoal = parseHex(CHARCOAL_INK)!
  while (contrastRatio(charcoal, parseHex(hslToHex(stripHsl))!) < 4.5 && stripHsl.l < 90) {
    stripHsl = { ...stripHsl, l: stripHsl.l + 2 }
  }
  const strip = hslToHex(stripHsl)
  const stripInk = CHARCOAL_INK

  // Buttons and links: the same hue, driven deep enough for white ink.
  const strongHsl = darkenUntilWhiteReadable({ h: teamH, s: clamp(teamHsl.s, 50, 85), l: Math.min(teamHsl.l, 42) }, 4.5)
  const brandStrong = hslToHex(strongHsl)
  const brandInk = contrastRatio(white, parseHex(brandStrong)!) >= 4.5 ? '#FFFFFF' : CHARCOAL_INK

  // The soft wash (the stands) and its ink.
  const brandSoft = hslToHex({ h: teamH, s: clamp(teamHsl.s * 0.5, 20, 45), l: 93 })
  const brandSoftInk = readableInk(brandStrong, brandSoft, 4.5)

  // The scoreboard.
  const deep = CHARCOAL_DEEP
  const deepInk = WHITE_ON_CHARCOAL
  const deepMuted = hslToHex(lightenUntilReadable(rgbToHsl(parseHex(GRAY_ON_CHARCOAL)!), deep, 4.5))

  return {
    brand: brandStrong,
    brandInk,
    brandStrong,
    brandSoft,
    brandSoftInk,
    heading: CHARCOAL_INK,
    bg,
    surface,
    surfaceAlt,
    border,
    ink: CHARCOAL_INK,
    inkMuted: '#5F6670',
    deep,
    deepInk,
    deepMuted,
    strip,
    stripInk,
  }
}

/** Exported for the palette test. */
export const HOMETEAM_INK = CHARCOAL_INK
export const HOMETEAM_DEEP = CHARCOAL_DEEP
