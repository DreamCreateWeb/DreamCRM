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
  },
]

export const SITE_TEMPLATE_IDS = SITE_TEMPLATE_CATALOG.map((t) => t.id)

export function isSiteTemplateId(id: string | null | undefined): id is SiteTemplateId {
  return !!id && SITE_TEMPLATE_IDS.includes(id as SiteTemplateId)
}
