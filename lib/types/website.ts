/**
 * The website's publishable SECTIONS — client-safe. A staged draft column
 * belongs to exactly one section; Publish (and Discard) can act on a chosen
 * subset of sections and leave the rest staged. The key→section map is the
 * single source: lib/website-draft.ts derives the changed-section list from
 * it, and tests/website holds that every draftable column has a home.
 */

export interface WebsiteSectionDef {
  key: string
  label: string
}

export const WEBSITE_SECTIONS: readonly WebsiteSectionDef[] = [
  { key: 'hero', label: 'Hero' },
  { key: 'about', label: 'About' },
  { key: 'design', label: 'Design' },
  { key: 'services', label: 'Services' },
  { key: 'team', label: 'Meet the team' },
  { key: 'trust', label: 'Trust & highlights' },
  { key: 'photos', label: 'Photos' },
  { key: 'faq', label: 'FAQ' },
  { key: 'insurance', label: 'Insurance & payment' },
  { key: 'text', label: 'Page text' },
  { key: 'seo', label: 'Search appearance' },
  { key: 'forms', label: 'Forms' },
]

/** Draftable clinic_profile column → section key. */
export const WEBSITE_COLUMN_SECTION: Readonly<Record<string, string>> = {
  tagline: 'hero',
  heroImageUrl: 'hero',
  heroImageUrl2: 'hero',
  imagePositions: 'hero',
  differenceVideoUrl: 'hero',
  about: 'about',
  brandColor: 'design',
  template: 'design',
  services: 'services',
  staff: 'team',
  stats: 'trust',
  differenceChips: 'trust',
  officePhotos: 'photos',
  coloringPages: 'photos',
  faq: 'faq',
  acceptedInsuranceCarriers: 'insurance',
  paymentMethods: 'insurance',
  financingPartners: 'insurance',
  cancellationPolicy: 'insurance',
  copyOverrides: 'text',
  seoMeta: 'seo',
  leadForms: 'forms',
}

export function websiteSectionOf(column: string): string | null {
  return WEBSITE_COLUMN_SECTION[column] ?? null
}

export function websiteSectionLabel(key: string): string {
  return WEBSITE_SECTIONS.find((s) => s.key === key)?.label ?? key
}

/** The section keys (in display order) that the given columns touch. */
export function websiteSectionsOf(columns: readonly string[]): WebsiteSectionDef[] {
  const hit = new Set(columns.map(websiteSectionOf).filter((s): s is string => !!s))
  return WEBSITE_SECTIONS.filter((s) => hit.has(s.key))
}

/** The draftable columns that belong to any of the given section keys. */
export function websiteColumnsOfSections(sections: readonly string[]): string[] {
  const want = new Set(sections)
  return Object.entries(WEBSITE_COLUMN_SECTION)
    .filter(([, s]) => want.has(s))
    .map(([c]) => c)
}
