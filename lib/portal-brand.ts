import { parseHex, readableInk } from '@/lib/clinic-site-theme'

/**
 * The clinic's brand colour, made safe to render on the patient-facing
 * surfaces — the portal, and the five token pages a patient reaches from a
 * text or an email (confirm, pay, payment plan, survey, review).
 *
 * WHY THIS EXISTS. The clinic public site derives a whole palette from the one
 * brand colour (`buildClinicPalette`), and every role it emits is contrast-
 * checked: `heading` for brand-as-text, `brandStrong` for a brand fill under
 * white text. The portal never adopted that derivation. It read
 * `clinicProfile.brandColor` RAW and used it two ways it must not —
 *
 *   • as TEXT on the warm #FAF7F2 ground and on white cards
 *     (`PortalHeading color={brand}`, the phone links, "Reschedule"), and
 *   • as a BUTTON FILL under a hard-coded `text-white`
 *     (`BrandButton`, `ProviderFace`, the nav's active pill).
 *
 * A dark brand hides that; a pale one is unreadable. The seeded sage
 * `#9CAF9F` lands at 2.17:1 as text and 2.32:1 under white — against a 4.5:1
 * requirement — and a pale pink at 1.64:1. It is not a fixture artefact: every
 * clinic that picks a light brand gets an illegible portal.
 *
 * WHY ONE VALUE AND NOT TWO. The two roles look like they need two colours,
 * and on the clinic site they get them. On the portal they don't have to,
 * because one value provably covers both: a colour dark enough to clear 4.5:1
 * as text on #FAF7F2 has a relative luminance of at most 0.170, and white on
 * anything that dark clears 4.5:1 too (1.05 / 0.220 = 4.78). So the single
 * `readableInk(brand, PORTAL_GROUND)` result is safe as a text fill AND as a
 * background under white — which is what let this land as an eight-line change
 * at the eight places the brand enters, instead of threading a second colour
 * through 100-odd call sites. `tests/a11y/portal-brand.test.ts` asserts the
 * implication rather than trusting the algebra.
 *
 * The ground is #FAF7F2 and not #FFFFFF on purpose: the cream is the DARKER of
 * the two light surfaces a brand-coloured thing sits on here, so clearing it
 * clears the white cards as well.
 *
 * Decorative uses — the next-visit card's left accent bar, the loyalty card's
 * border, the profile toggle's track, `brandTint(brand, 0.12)` — get the same
 * derived value. They carry no text, so they were never broken; they follow
 * the brand so the page stays one colour rather than two shades of one.
 */

/** The portal's warm ground. Single-homed here because the derivation is
 *  defined against it; `PORTAL_BG` in patient-portal/ui.tsx re-exports it. */
export const PORTAL_GROUND = '#FAF7F2'

/** The sage every patient surface already fell back to for a brandless clinic. */
export const PORTAL_BRAND_FALLBACK = '#9CAF9F'

/**
 * Derive the portal-safe brand from a clinic's stored `brandColor`.
 *
 * Dark-enough brands pass through verbatim (the clinic keeps its exact
 * identity colour); a pale one is darkened along its own hue until it clears
 * AA, so a sage clinic reads deep sage rather than grey. Missing or
 * unparseable input falls back to the sage default first, so a bad DB value
 * cannot land the portal on near-black.
 *
 * Idempotent: passing an already-derived value back in returns it unchanged.
 */
export function portalBrand(brandColor: string | null | undefined): string {
  const raw = parseHex(brandColor ?? '') ? (brandColor as string) : PORTAL_BRAND_FALLBACK
  return readableInk(raw, PORTAL_GROUND, 4.5)
}
