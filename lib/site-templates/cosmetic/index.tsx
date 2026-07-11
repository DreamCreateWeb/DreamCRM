import CosmeticHome from '@/components/clinic-site/templates/cosmetic/home'
import CosmeticHeader from '@/components/clinic-site/templates/cosmetic/header'
import CosmeticFooter from '@/components/clinic-site/templates/cosmetic/footer'
import CosmeticMobileActions from '@/components/clinic-site/templates/cosmetic/mobile-actions'
import { buildCosmeticPalette } from './palette'
import type { SiteTemplateDef } from '../types'

/**
 * Fraunces WITH the italic axis — the serif-italic display accents are the
 * variant's signature. Same runtime-<link> mechanism as every template
 * (never next/font; the build env can't reach Google Fonts — PR #166).
 */
const FRAUNCES_ITALIC_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&display=swap'

/**
 * Cosmetic/Luxury — DESIGN.md variant 2. Charcoal + cream editorial register,
 * doctor-as-hero, consultation voice, no pricing on the Home surface. Fixed
 * luxury neutrals; the clinic's brand color survives only as a
 * contrast-checked accent (see ./palette.ts).
 */
export const cosmeticTemplate: SiteTemplateDef = {
  id: 'cosmetic',
  label: 'Cosmetic Luxury',
  description:
    'Charcoal and cream, serif editorial, doctor-as-hero — for cosmetic and aesthetic-led practices. Consultation-first voice; never leads with pricing.',
  chrome: {
    Header: CosmeticHeader,
    Footer: CosmeticFooter,
    MobileActions: CosmeticMobileActions,
  },
  pages: { Home: CosmeticHome },
  extraMarketingPages: [],
  buildPalette: buildCosmeticPalette,
  fonts: [{ id: 'dc-fraunces-cosmetic', href: FRAUNCES_ITALIC_HREF }],
  fontCss: "--font-display: 'Fraunces', Georgia, serif;",
  bookLabel: 'Book a Consultation',
  copyKeys: [
    { key: 'cosmeticHome.heroStatement', label: 'Homepage hero statement (luxury)', fallback: 'Unhurried appointments, meticulous craft, and a plan built around your face — never a template. No judgment, ever.', page: '/' },
    { key: 'cosmeticHome.servicesEyebrow', label: 'Homepage services eyebrow (luxury)', fallback: 'The work', page: '/' },
    { key: 'cosmeticHome.servicesHeading', label: 'Homepage services headline (luxury)', fallback: 'A quiet mastery of the craft.', page: '/' },
    { key: 'cosmeticHome.galleryHeading', label: 'Homepage gallery eyebrow (luxury)', fallback: 'The space', page: '/' },
    { key: 'cosmeticHome.testimonialsHeading', label: 'Homepage testimonials eyebrow (luxury)', fallback: 'In their words', page: '/' },
    { key: 'cosmeticHome.closerHeading', label: 'Homepage closing headline (luxury)', fallback: 'Begin with a conversation.', page: '/' },
    { key: 'cosmeticHome.closerSub', label: 'Homepage closing subhead (luxury)', fallback: 'A consultation is simply that — your questions, honest answers, and a plan that is yours to keep.', page: '/' },
  ],
  copyDefaults: {},
}
