import { modernTemplate } from './modern'
import { cosmeticTemplate } from './cosmetic'
import { pediatricTemplate } from './pediatric'
import type { SiteTemplateDef, SiteTemplateId } from './types'

/**
 * The template registry. Server-component territory (defs carry React
 * renderers) — client code wanting ids/labels imports `catalog.ts` instead.
 */
const TEMPLATES: Record<SiteTemplateId, SiteTemplateDef> = {
  modern: modernTemplate,
  cosmetic: cosmeticTemplate,
  pediatric: pediatricTemplate,
}

/**
 * Resolve a stored template id to its def. Unknown/null/unregistered ids fall
 * back to modern so a bad `clinic_profile.template` value can never 500 a
 * public site — the save action validates, but the DB is not trusted here.
 */
export function getSiteTemplate(id: string | null | undefined): SiteTemplateDef {
  if (id && Object.prototype.hasOwnProperty.call(TEMPLATES, id)) {
    return TEMPLATES[id as SiteTemplateId]
  }
  return modernTemplate
}

export function listSiteTemplates(): SiteTemplateDef[] {
  return Object.values(TEMPLATES)
}
