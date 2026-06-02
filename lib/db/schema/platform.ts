import { pgTable, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { organization } from './auth'

// Clinic-specific profile data that extends an organization where type='clinic'.
// One-to-one with organization. Created at signup, edited via clinic settings.
export const clinicProfile = pgTable('clinic_profile', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),

  // Public-facing details for the clinic's website
  legalName: text('legal_name'),
  displayName: text('display_name'),
  tagline: text('tagline'),
  about: text('about'),
  npi: text('npi'),

  // Branding
  brandColor: text('brand_color'),
  template: text('template').default('modern'),
  logoUrl: text('logo_url'),
  heroImageUrl: text('hero_image_url'),
  // Optional ambient background video for the "The {clinic} difference"
  // section on the public site. Plain mp4/webm URL — rendered as
  // <video autoplay muted loop playsInline> when set, falls back to
  // heroImageUrl when null. Keeps the section feeling alive without
  // demanding clinics shoot a video.
  differenceVideoUrl: text('difference_video_url'),

  // Editable site content stored as JSON for the MVP — avoids the join
  // overhead while we figure out which fields clinics actually customize.
  // services:                   Array<{ id, name, description?, icon? }>
  // staff:                      Array<{ id, name, title?, bio?, photoUrl? }>
  // testimonials:               Array<{ id, quote, authorName, authorLocation?, authorPhotoUrl? }>
  // stats:                      Array<{ id, value, label }>
  // officePhotos:               Array<{ id, url, alt?, caption? }>
  // faq:                        Array<{ id, category, question, answer }>
  // acceptedInsuranceCarriers:  Array<string> — PPO carriers shown on the
  //                             public site's Insurance section and on the
  //                             carrier dropdown in the verifier form.
  services: jsonb('services'),
  staff: jsonb('staff'),
  testimonials: jsonb('testimonials'),
  stats: jsonb('stats'),
  officePhotos: jsonb('office_photos'),
  faq: jsonb('faq'),
  acceptedInsuranceCarriers: jsonb('accepted_insurance_carriers'),

  // Contact
  phone: text('phone'),
  email: text('email'),
  websiteDomain: text('website_domain'),

  // Address
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country').default('US'),

  // Operating hours stored as JSON: { mon: { open: '09:00', close: '17:00' }, ... }
  hours: jsonb('hours'),

  // Which Dream Create plan tier this clinic is on. Drives module gating.
  // Mirrors Stripe subscription state; updated by the Stripe webhook.
  planTier: text('plan_tier').default('basic'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Multi-location support — a clinic may have several physical locations.
// Most clinics will have exactly one row here, mirroring clinic_profile address.
export const clinicLocation = pgTable('clinic_location', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  phone: text('phone'),
  isPrimary: integer('is_primary').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type ClinicProfile = typeof clinicProfile.$inferSelect
export type ClinicLocation = typeof clinicLocation.$inferSelect

// ─────────────────────────────────────────────────────────────────────────────
// Agency projects
//
// Dream Create is a web dev agency. Beyond the recurring clinic subscription
// (Basic/Pro/Premium), each clinic can have one-off or ongoing engagements
// for the agency's other offerings: ecommerce builds, patient intake forms,
// videography, photography. This table tracks those engagements per-clinic.
// ─────────────────────────────────────────────────────────────────────────────

export const agencyProject = pgTable('agency_project', {
  id: text('id').primaryKey(),
  // Which clinic the work is for. Nullable for internal Dream Create projects.
  organizationId: text('organization_id').references(() => organization.id, {
    onDelete: 'cascade',
  }),

  // 'website' | 'ecommerce' | 'intake_form' | 'videography' | 'photography' | 'content' | 'other'
  type: text('type').notNull().default('other'),

  title: text('title').notNull(),
  description: text('description'),

  // 'lead' | 'discovery' | 'in_progress' | 'review' | 'completed' | 'on_hold' | 'cancelled'
  status: text('status').notNull().default('lead'),

  // Optional money + dates so we can show pipeline value + due-date dashboards.
  budgetCents: integer('budget_cents'),
  dueDate: timestamp('due_date'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),

  // The Dream Create staffer who owns this engagement.
  ownerUserId: text('owner_user_id'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type AgencyProject = typeof agencyProject.$inferSelect
export type NewAgencyProject = typeof agencyProject.$inferInsert

// ─────────────────────────────────────────────────────────────────────────────
// Service library (platform-owned canonical catalog)
//
// The shared, Tend-style service catalog. One canonical entry per dental
// service (Teeth Whitening, Dental Implants, …); content is written ONCE here
// and customized per-clinic at render time (Checkpoint 1A: simple
// `{clinic}`/`{city}` token substitution; 1B: AI rewrites). A clinic's
// `clinic_profile.services` jsonb references these entries by `librarySlug`;
// `resolveClinicServices` (lib/services/service-library.ts) merges the library
// content with per-clinic overrides (photo / offer / category).
//
// `origin` distinguishes platform-authored canon ('platform') from
// clinic-authored additions ('clinic', used in 1B). `status` lets us stage
// AI-drafted entries ('pending') before they go 'active', and retire entries
// without deleting them ('archived').
// ─────────────────────────────────────────────────────────────────────────────

export const serviceLibrary = pgTable(
  'service_library',
  {
    id: text('id').primaryKey(),
    // Stable kebab-case identifier, e.g. 'teeth-whitening'. Routes to
    // {slug}.dreamcreatestudio.com/services/<slug> for clinics that offer it.
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    // 'core' | 'special' — nav taxonomy only (same detail template). Drives the
    // /services index grouping + the Core/Special nav dropdowns.
    category: text('category').notNull().default('core'),
    icon: text('icon'),
    // One-liner used on index + nav cards.
    shortDescription: text('short_description'),
    // 3-5 benefit bullets for the detail hero. string[]
    heroBullets: jsonb('hero_bullets'),
    // 2-3 sentence description-band paragraph.
    body: text('body'),
    // Array<{ title, body }> — the numbered "what to expect" walkthrough.
    processSteps: jsonb('process_steps'),
    // Array<{ question, answer }> — detail-page FAQ (pricing answered honestly,
    // no fabricated dollar figures).
    faq: jsonb('faq'),
    // string[] — curated adjacencies for the related-services carousel.
    relatedSlugs: jsonb('related_slugs'),
    // 'platform' | 'clinic'
    origin: text('origin').notNull().default('platform'),
    // 'active' | 'pending' | 'archived'
    status: text('status').notNull().default('active'),
    // Org that submitted this entry — null for platform-seeded canon, set for
    // clinic-authored additions (1B). The submitting clinic can use the entry
    // on their own site immediately even while status='pending'; other
    // clinics only see it once a platform admin approves (status→active).
    submittedByOrgId: text('submitted_by_org_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    // Optional note from the reviewing platform admin — stored on approve
    // and reject so the audit trail is honest about why an entry landed
    // where it did.
    reviewNotes: text('review_notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    // Status is the picker's hot-path filter (active + own-pending), so we
    // index it directly. Slug already has its own unique index for lookups.
    statusIdx: index('idx_service_library_status').on(t.status),
  }),
)

export type ServiceLibraryRow = typeof serviceLibrary.$inferSelect
export type NewServiceLibraryRow = typeof serviceLibrary.$inferInsert

export const AGENCY_PROJECT_TYPES = [
  'website',
  'ecommerce',
  'intake_form',
  'videography',
  'photography',
  'content',
  'other',
] as const
export type AgencyProjectType = (typeof AGENCY_PROJECT_TYPES)[number]

export const AGENCY_PROJECT_STATUSES = [
  'lead',
  'discovery',
  'in_progress',
  'review',
  'completed',
  'on_hold',
  'cancelled',
] as const
export type AgencyProjectStatus = (typeof AGENCY_PROJECT_STATUSES)[number]

export const AGENCY_PROJECT_TYPE_LABELS: Record<AgencyProjectType, string> = {
  website: 'Website',
  ecommerce: 'Ecommerce',
  intake_form: 'Patient Intake Form',
  videography: 'Videography',
  photography: 'Photography',
  content: 'Content',
  other: 'Other',
}

export const AGENCY_PROJECT_STATUS_LABELS: Record<AgencyProjectStatus, string> = {
  lead: 'Lead',
  discovery: 'Discovery',
  in_progress: 'In Progress',
  review: 'In Review',
  completed: 'Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
}
