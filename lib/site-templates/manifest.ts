import type { SiteTemplateId } from './types'

/**
 * Source-file manifest for the scanning test suites (field-wiring,
 * tokens-only, legibility, purity). Plain data, no imports beyond types —
 * tests read files from disk, so paths are repo-relative.
 *
 * - `shared`: chrome/components every template's canvas can mount.
 * - `base`:   the shared page bodies (today still inline in their page.tsx
 *             shells; they migrate to components/clinic-site/base/ in the
 *             shell/renderer split).
 * - `byTemplate`: files exclusive to one template. Scans for template <id>
 *             cover `shared + base + byTemplate[<id>]`.
 */
export interface SiteTemplateManifest {
  shared: string[]
  base: string[]
  byTemplate: Record<SiteTemplateId, string[]>
}

export const SITE_TEMPLATE_MANIFEST: SiteTemplateManifest = {
  shared: [
    'components/clinic-site/site-header.tsx',
    'components/clinic-site/site-footer.tsx',
    'components/clinic-site/numbered-steps.tsx',
    'components/clinic-site/closing-cta.tsx',
  ],
  base: [
    'app/site/[slug]/about/page.tsx',
    'app/site/[slug]/faq/page.tsx',
    'app/site/[slug]/insurance/page.tsx',
    'app/site/[slug]/new-patients/page.tsx',
    'app/site/[slug]/payment-financing/page.tsx',
    'app/site/[slug]/team/page.tsx',
    'app/site/[slug]/team/[staffSlug]/page.tsx',
    'app/site/[slug]/services/page.tsx',
    'app/site/[slug]/services/[serviceSlug]/page.tsx',
    'app/site/[slug]/careers/page.tsx',
    'app/site/[slug]/careers/[jobSlug]/page.tsx',
    'app/site/[slug]/dental-plans/page.tsx',
    'app/site/[slug]/blog/page.tsx',
    'app/site/[slug]/blog/[postSlug]/page.tsx',
    'app/site/[slug]/book/page.tsx',
  ],
  byTemplate: {
    modern: ['components/clinic-site/templates/modern/home.tsx'],
    cosmetic: [
      'components/clinic-site/templates/cosmetic/home.tsx',
      'components/clinic-site/templates/cosmetic/header.tsx',
      'components/clinic-site/templates/cosmetic/footer.tsx',
      'components/clinic-site/templates/cosmetic/mobile-actions.tsx',
    ],
    pediatric: [
      'components/clinic-site/templates/pediatric/home.tsx',
      'components/clinic-site/templates/pediatric/header.tsx',
      'components/clinic-site/templates/pediatric/footer.tsx',
      'components/clinic-site/templates/pediatric/mobile-actions.tsx',
    ],
  },
}
