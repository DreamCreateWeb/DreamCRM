import type { clinicProfile } from '@/lib/db/schema/platform'

/**
 * The Draft→Publish layer for the clinic website — pure, client-safe core.
 *
 * Every Website-workspace save STAGES its values into the
 * `clinic_profile.website_draft` jsonb blob instead of writing the live
 * column; "Publish" applies the blob to the live columns in one shot and
 * clears it. A verified editor (owner/admin of THIS clinic) sees the merged
 * view everywhere on their own site — visitors always see published values.
 * This is the Wix/Squarespace model: finish your edits, then update the live
 * site, rather than the live site showing work in real time.
 *
 * The blob is keyed by TS column name (camelCase — exactly what a drizzle
 * `.set()` takes), values are the staged column values (JSON `null` = "clear
 * this column on publish"). Only columns in WEBSITE_DRAFT_COLUMNS ever stage;
 * everything else — the clinic's shared IDENTITY (names, contact, address,
 * hours, logo, timezone) — stays live-immediate, because it drives booking
 * slots, reminder times, and the email "From", not just the website. The
 * chat-widget toggle also stays live: it's a functional switch, not content.
 *
 * Server plumbing (stage/publish/discard/effective reads) lives in
 * lib/services/website-draft.ts; this module is imported by client
 * components (hub publish card, Studio publish bar) for labels + types.
 */

type ProfileRow = typeof clinicProfile.$inferSelect

/** Columns that stage to the draft instead of writing live. */
export const WEBSITE_DRAFT_COLUMNS = new Set<string>([
  // Voice + story
  'tagline',
  'about',
  // Design
  'brandColor',
  'template',
  'heroImageUrl',
  'heroImageUrl2',
  'imagePositions',
  'differenceVideoUrl',
  // Content sections
  'services',
  'staff',
  'stats',
  'officePhotos',
  'coloringPages',
  'faq',
  'acceptedInsuranceCarriers',
  'paymentMethods',
  'financingPartners',
  'cancellationPolicy',
  'differenceChips',
  // Page-level copy + meta + forms
  'copyOverrides',
  'seoMeta',
  'leadForms',
])

/** Owner-readable labels for staged columns — the hub publish card + Studio
 *  publish bar + undo history all speak these. */
export const WEBSITE_COLUMN_LABELS: Record<string, string> = {
  tagline: 'Hero tagline',
  about: 'About your practice',
  brandColor: 'Brand color',
  template: 'Site design',
  heroImageUrl: 'Hero image',
  heroImageUrl2: 'Second hero image',
  imagePositions: 'Photo focus point',
  differenceVideoUrl: 'Intro video',
  services: 'Services',
  staff: 'Meet the team',
  stats: 'Trust stats',
  officePhotos: 'Office photos',
  coloringPages: 'Coloring pages',
  faq: 'FAQ',
  acceptedInsuranceCarriers: 'Insurance carriers',
  paymentMethods: 'Payment methods',
  financingPartners: 'Financing partners',
  cancellationPolicy: 'Cancellation policy',
  differenceChips: '“Why us” highlights',
  copyOverrides: 'Text edits',
  seoMeta: 'Search appearance',
  leadForms: 'Form fields',
  // Live-immediate columns that still ride the undo history via writeSection.
  displayName: 'Clinic name',
  legalName: 'Legal name',
  phone: 'Phone',
  email: 'Email',
  logoUrl: 'Logo',
  hours: 'Office hours',
  addressLine1: 'Address',
  addressLine2: 'Address',
  city: 'Address',
  state: 'Address',
  postalCode: 'Address',
  country: 'Address',
}

export function websiteColumnLabel(column: string): string {
  return WEBSITE_COLUMN_LABELS[column] ?? column
}

/** One staged-but-unpublished change, for the publish surfaces. */
export interface WebsiteDraftChange {
  column: string
  label: string
}

/** Split a mixed set of column writes into what stages vs what writes live. */
export function splitWebsiteValues(values: Record<string, unknown>): {
  staged: Record<string, unknown>
  direct: Record<string, unknown>
} {
  const staged: Record<string, unknown> = {}
  const direct: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (WEBSITE_DRAFT_COLUMNS.has(key)) staged[key] = value ?? null
    else direct[key] = value
  }
  return { staged, direct }
}

/**
 * The merged "what the editor sees" view: draft values win over live columns.
 * Only draftable keys apply — junk keys in a blob can never leak into other
 * columns. A key present with `null` means "cleared" and overrides live.
 */
export function mergeWebsiteDraft<T extends Partial<ProfileRow>>(
  profile: T,
  draft: unknown,
): T {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return profile
  const merged: Record<string, unknown> = { ...(profile as Record<string, unknown>) }
  for (const [key, value] of Object.entries(draft as Record<string, unknown>)) {
    if (WEBSITE_DRAFT_COLUMNS.has(key)) merged[key] = value ?? null
  }
  return merged as T
}

/** The draftable keys present in a blob (order-stable, junk filtered). */
export function websiteDraftKeys(draft: unknown): string[] {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return []
  return Object.keys(draft as Record<string, unknown>).filter((k) =>
    WEBSITE_DRAFT_COLUMNS.has(k),
  )
}

/**
 * The honest change list: staged keys whose value actually DIFFERS from the
 * live column (an undo can walk a staged value back to exactly what's live —
 * that's not an unpublished change, and we never claim it is).
 */
export function websiteDraftChanges(
  draft: unknown,
  profile: Partial<ProfileRow>,
): WebsiteDraftChange[] {
  const keys = websiteDraftKeys(draft)
  if (keys.length === 0) return []
  const blob = draft as Record<string, unknown>
  const live = profile as Record<string, unknown>
  const changes: WebsiteDraftChange[] = []
  for (const key of keys) {
    const staged = blob[key] ?? null
    const current = live[key] ?? null
    if (JSON.stringify(staged) !== JSON.stringify(current)) {
      changes.push({ column: key, label: websiteColumnLabel(key) })
    }
  }
  return changes
}
