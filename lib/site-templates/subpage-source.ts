import { SUBPAGE_KEYS, type SubpageKey } from './subpage-props'
import type { SiteTemplateId } from './types'

/** Provenance map: every subpage key sourced from one template ('self' or a
 *  sibling's id), with optional per-key overrides. */
export function subpageSource(
  base: SiteTemplateId | 'self',
  overrides: Partial<Record<SubpageKey, SiteTemplateId | 'self'>> = {},
): Record<SubpageKey, SiteTemplateId | 'self'> {
  const out = {} as Record<SubpageKey, SiteTemplateId | 'self'>
  for (const k of SUBPAGE_KEYS) out[k] = overrides[k] ?? base
  return out
}
