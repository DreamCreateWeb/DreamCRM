import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'
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

  // Editable site content stored as JSON for the MVP — avoids the join
  // overhead while we figure out which fields clinics actually customize.
  // services:      Array<{ id, name, description?, icon? }>
  // staff:         Array<{ id, name, title?, bio?, photoUrl? }>
  // testimonials:  Array<{ id, quote, authorName, authorLocation?, authorPhotoUrl? }>
  // stats:         Array<{ id, value, label }>
  // officePhotos:  Array<{ id, url, alt?, caption? }>
  services: jsonb('services'),
  staff: jsonb('staff'),
  testimonials: jsonb('testimonials'),
  stats: jsonb('stats'),
  officePhotos: jsonb('office_photos'),

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
