import type { SiteTemplateId } from './types'

/**
 * Client-safe template catalog — ids + display metadata ONLY (no React
 * components, no server imports), so the Studio's design picker and zod
 * validators can import it from client components and actions alike.
 * The full defs (components + palette recipes) live in `registry.ts`.
 */
/** Practice-type categories the template gallery organizes by. A template can
 *  suit more than one; the gallery's category chips filter on these. */
export type SitePracticeType = 'general' | 'cosmetic' | 'pediatric' | 'ortho'

export const PRACTICE_TYPE_LABELS: Record<SitePracticeType, string> = {
  general: 'General & family',
  cosmetic: 'Cosmetic & aesthetic',
  pediatric: 'Pediatric',
  ortho: 'Orthodontics',
}

/**
 * Which optional media slots a design actually RENDERS (2026-10-26). The
 * Design page and the Content rail read this so an editing card never
 * offers a photo the site cannot show: a Home Team practice uploaded a
 * "Second hero image", saw Saved, got the "Unpublished change" pill,
 * published — and nothing on the site changed, because only Modern reads
 * that column. The columns themselves stay universal (content never
 * belongs to a design; switching is instant and reversible) — this gates
 * the EDITOR'S cards, never the data. Pinned against each template's source
 * by tests/site-templates/conformance.test.tsx.
 */
export interface SiteTemplateMedia {
  /** Home renders `heroImageUrl2` (the right-hand hero photo). */
  heroImage2: boolean
  /** Home renders `differenceVideoUrl` (the ambient "why us" clip). */
  introVideo: boolean
  /** Home renders the trust stats (otherwise they show on /about). */
  homeStats: boolean
  /** Home renders the office photos (otherwise they show on /about). */
  homePhotos: boolean
}

export interface SiteTemplateCatalogEntry {
  id: SiteTemplateId
  label: string
  description: string
  /** Which practice types this design was built for (gallery categories). */
  practiceTypes: SitePracticeType[]
  /** Style filter chips ('warm', 'editorial', 'playful', …). */
  styleTags: string[]
  /** One warm sentence of fit guidance on the gallery card. */
  bestFor: string
  /** The optional media slots this design's Home renders. */
  media: SiteTemplateMedia
}

export const SITE_TEMPLATE_CATALOG: SiteTemplateCatalogEntry[] = [
  {
    id: 'modern',
    label: 'Modern Family',
    description:
      'Warm, welcoming, family-first — cream ground, brand-derived palette, lifestyle photography. The default every clinic starts on.',
    practiceTypes: ['general', 'ortho'],
    styleTags: ['warm', 'photography-led', 'brand-color'],
    bestFor:
      'Family and general practices that want a warm, welcoming site painted in their own brand color.',
    media: { heroImage2: true, introVideo: true, homeStats: true, homePhotos: true },
  },
  {
    id: 'cosmetic',
    label: 'Cosmetic Luxury',
    description:
      'Charcoal and cream, serif editorial, doctor-as-hero — for cosmetic and aesthetic-led practices. Consultation-first voice; never leads with pricing.',
    practiceTypes: ['cosmetic'],
    styleTags: ['editorial', 'dark', 'serif'],
    bestFor:
      'Cosmetic and aesthetic-led practices where the doctor’s credentials and a consultation-first voice carry the site.',
    media: { heroImage2: false, introVideo: false, homeStats: false, homePhotos: true },
  },
  {
    id: 'pediatric',
    label: 'Pediatric Play',
    description:
      'Soft pastels, rounded type, cartoon touches — built for kids’ practices. Parent-reassuring voice, plus a coloring corner kids can print or color online.',
    practiceTypes: ['pediatric'],
    styleTags: ['playful', 'pastel', 'rounded'],
    bestFor:
      'Kids’ practices that want parents reassured and kids delighted — down to a printable coloring corner.',
    media: { heroImage2: false, introVideo: false, homeStats: false, homePhotos: false },
  },
  {
    id: 'hometown',
    label: 'Hometown Classic',
    description:
      'Straightforward and trustworthy — solid brand hero, phone and hours front and center, checkmark clarity. Looks complete without a single photo upload.',
    practiceTypes: ['general', 'ortho'],
    styleTags: ['classic', 'straightforward', 'no-photos-needed'],
    bestFor:
      'Practices without a photo library — color, type, and plain talk do the work, so the site looks finished on day one.',
    media: { heroImage2: false, introVideo: false, homeStats: false, homePhotos: false },
  },
  {
    id: 'established',
    label: 'Established',
    description:
      'Cream, navy and one accent — a lettered crest, serif numerals, editorial sections. For the practice that wants to look like it sits on the board.',
    practiceTypes: ['general', 'ortho'],
    styleTags: ['serious', 'editorial', 'serif', 'brand-accent'],
    bestFor:
      'Established practices and credentialed doctors who want a serious, sharp site — the register of a professional association, in their own accent color.',
    media: { heroImage2: false, introVideo: false, homeStats: true, homePhotos: true },
  },
  {
    id: 'hometeam',
    label: 'Home Team',
    description:
      'Your color as the team color — a home-plate crest, a scoreboard for the numbers, pennant eyebrows, the lineup. Team spirit with a straight face.',
    practiceTypes: ['general', 'pediatric'],
    styleTags: ['team-spirit', 'bold', 'slab', 'brand-color'],
    bestFor:
      'The practice everyone in town knows — a clinic with a personality (a ballpark, a hometown, a mascot) that wants the site to feel like the building, and stay serious.',
    media: { heroImage2: false, introVideo: false, homeStats: true, homePhotos: true },
  },
]

export const SITE_TEMPLATE_IDS = SITE_TEMPLATE_CATALOG.map((t) => t.id)

export function isSiteTemplateId(id: string | null | undefined): id is SiteTemplateId {
  return !!id && SITE_TEMPLATE_IDS.includes(id as SiteTemplateId)
}

/** The media map for a stored template id; an unknown/null id reads as the
 *  default design, the same fallback the registry's `getSiteTemplate` makes. */
export function templateMedia(id: string | null | undefined): SiteTemplateMedia {
  return (SITE_TEMPLATE_CATALOG.find((t) => t.id === id) ?? SITE_TEMPLATE_CATALOG[0]).media
}
