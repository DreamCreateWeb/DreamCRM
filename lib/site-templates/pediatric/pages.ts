import type { TemplateMarketingPage } from '../types'

/**
 * The Pediatric template's declared marketing pages — a LEAF module so both
 * the template def (registry side) and the Home renderer (which builds its
 * own nav) can import the same list without a circular import.
 *
 * /coloring is the first template-declared page in the system: the kids'
 * coloring corner (canon content — clinic_profile.coloringPages — so the
 * page itself works on ANY template; Pediatric is the one that puts it in
 * the nav). Gated on content so no clinic ever shows an empty corner.
 */
export const PEDIATRIC_EXTRA_PAGES: TemplateMarketingPage[] = [
  {
    path: '/coloring',
    label: 'Coloring Pages',
    navGroup: 'patients',
    gate: (g) => g.hasColoringPages,
  },
]
