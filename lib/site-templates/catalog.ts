import type { SiteTemplateId } from './types'

/**
 * Client-safe template catalog — ids + display metadata ONLY (no React
 * components, no server imports), so the Studio's design picker and zod
 * validators can import it from client components and actions alike.
 * The full defs (components + palette recipes) live in `registry.ts`.
 */
export interface SiteTemplateCatalogEntry {
  id: SiteTemplateId
  label: string
  description: string
}

export const SITE_TEMPLATE_CATALOG: SiteTemplateCatalogEntry[] = [
  {
    id: 'modern',
    label: 'Modern Family',
    description:
      'Warm, welcoming, family-first — cream ground, brand-derived palette, lifestyle photography. The default every clinic starts on.',
  },
]

export const SITE_TEMPLATE_IDS = SITE_TEMPLATE_CATALOG.map((t) => t.id)

export function isSiteTemplateId(id: string | null | undefined): id is SiteTemplateId {
  return !!id && SITE_TEMPLATE_IDS.includes(id as SiteTemplateId)
}
