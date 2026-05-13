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
