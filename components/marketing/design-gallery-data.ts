import { SITE_TEMPLATE_CATALOG } from '@/lib/site-templates/catalog'
import { getSiteTemplate } from '@/lib/site-templates/registry'
import type { MarketingDesign } from './design-gallery'

/**
 * One entry per registered design, read from the catalog and the registry so a
 * seventh template appears here the day it is registered. The swatches are the
 * template's own palette recipe run on the default brand, not typed hexes.
 * Server-component territory: the registry carries React renderers.
 */
export function liveDesigns(): MarketingDesign[] {
  return SITE_TEMPLATE_CATALOG.map((entry) => {
    const p = getSiteTemplate(entry.id).buildPalette(null)
    return {
      id: entry.id,
      label: entry.label,
      bestFor: entry.bestFor,
      swatches: [
        { name: 'Brand', hex: p.brand },
        { name: 'Ground', hex: p.bg },
        { name: 'Deep band', hex: p.deep },
      ],
    }
  })
}
