import { pgTable, text, timestamp, integer, jsonb, index, uniqueIndex, boolean } from 'drizzle-orm/pg-core'
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
  // Second hero photo (the right-hand oval). A dedicated single-image field —
  // NOT an office-gallery photo. Falls back to officePhotos[0] when null for
  // back-compat with sites set up before this column existed.
  heroImageUrl2: text('hero_image_url_2'),
  // imagePositions: Record<fieldKey, "x% y%"> — per-image focal point applied as
  // CSS object-position so a photo shown in a small crop (e.g. the hero ovals)
  // can be repositioned to keep the right part in frame. Unset key → centred.
  imagePositions: jsonb('image_positions'),
  // leadForms: Partial<Record<'contact'|'insurance_verifier', LeadFormField[]>> —
  // clinic-edited field definitions for the public lead-capture forms. Unset for
  // a key → the built-in default fields render.
  leadForms: jsonb('lead_forms'),
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
  // paymentMethods:             Array<string> — clinic-set list of accepted
  //                             payment methods on /payment-financing. Null =
  //                             render DEFAULT_PAYMENT_METHODS (universal
  //                             list every US dental practice can claim).
  // financingPartners:          Array<JsonClinicFinancingPartner> — optional
  //                             CareCredit / Sunbit / Cherry / etc. partner
  //                             list. Null/empty = section hides entirely
  //                             (we don't push patients to financing if the
  //                             clinic has no partner).
  services: jsonb('services'),
  staff: jsonb('staff'),
  testimonials: jsonb('testimonials'),
  stats: jsonb('stats'),
  officePhotos: jsonb('office_photos'),
  faq: jsonb('faq'),
  // copyOverrides: Record<string, string> — per-clinic overrides for otherwise
  // hardcoded template copy (section headlines, etc.), keyed by a stable id
  // (e.g. 'home.differenceHeadline'). Null/missing for a key → the template
  // default renders. Powers "edit the important headlines" in the Website
  // Studio without a migration per string.
  copyOverrides: jsonb('copy_overrides'),
  // differenceChips: string[] — the "Why us" highlight chips on the homepage
  // difference section. Null/empty → auto-built from the clinic's top services
  // + standard reassurances; set → an explicit clinic-authored list.
  differenceChips: jsonb('difference_chips'),
  acceptedInsuranceCarriers: jsonb('accepted_insurance_carriers'),
  paymentMethods: jsonb('payment_methods'),
  financingPartners: jsonb('financing_partners'),
  // Plain longform "we ask for 24 hours notice..." paragraph rendered as a
  // soft-card on /payment-financing. Null = section hides (we don't fake a
  // cancellation policy, since specific dollar fees vary per clinic).
  cancellationPolicy: text('cancellation_policy'),
  // Per-page SEO title/description overrides (Settings → Search appearance).
  // Shape: PageSeoMeta keyed by page key (home/about/book/services/team/
  // insurance/payment-financing/faq/careers/blog-index) →
  // { title?, description? }. Null/missing key → each public page's
  // generateMetadata falls back to its derived title/description. Resolved by
  // resolveSeoMeta() in lib/types/seo-meta.ts so junk can't poison the column
  // and a new page key never needs a backfill.
  seoMeta: jsonb('seo_meta'),
  // Server-persisted draft of the post-checkout AI website interview (the
  // /welcome step). Shape: OnboardingInterviewDraft in
  // lib/types/onboarding-interview.ts — { answers: Record<string,string>,
  // step: number, serviceSlugs?: string[], updatedAt: string }. Saved
  // (debounced) on every step advance so a refresh resumes mid-interview;
  // CLEARED (set null) on successful completion. Null = no draft in flight.
  onboardingInterviewDraft: jsonb('onboarding_interview_draft'),
  // When the clinic finished the AI website interview (or explicitly skipped
  // it through to the end). Null = never completed. With Wave 1's day-0 floor
  // the old "siteUnfilled" heuristic is always false, so this timestamp (plus
  // "tagline still equals the starter constant") is what drives
  // siteNeedsPersonalization → the /welcome re-entry banner + cohort routing.
  onboardingInterviewCompletedAt: timestamp('onboarding_interview_completed_at', {
    withTimezone: true,
  }),
  // Patient-portal customization (Settings → Patient portal): feature
  // toggles + booking/reschedule notice windows + clinic-editable copy.
  // Shape: PortalSettings in lib/types/portal.ts. Null = defaults; partial
  // values merge over defaults via resolvePortalSettings(), so new settings
  // never need a backfill.
  portalSettings: jsonb('portal_settings'),

  // Automated appointment reminders (Settings → Reminders): enabled toggle +
  // how many hours before a visit the email goes out. Shape: ReminderSettings
  // in lib/types/reminders.ts. Null = REMINDER_DEFAULTS (enabled, 24h); partial
  // values merge over defaults via resolveReminderSettings(), so new knobs
  // never need a backfill. The booking confirmation email promises this; the
  // send engine lives in lib/services/reminder-automation.ts.
  reminderSettings: jsonb('reminder_settings'),

  // Contact
  phone: text('phone'),
  email: text('email'),
  websiteDomain: text('website_domain'),
  // Custom-domain provisioning state for `websiteDomain`. Null until the clinic
  // requests a custom domain. Shape: CustomDomainStatus in
  // lib/services/custom-domain.ts —
  //   { state: 'pending_dns' | 'active' | 'failed', requestedAt,
  //     dnsRecords: Array<{ name, type, value, purpose:'routing'|'certificate' }>,
  //     lastCheckedAt?, error? }
  // The dnsRecords are the exact CNAMEs the clinic adds at their registrar:
  // one routing record (points the host at App Runner) + the ACM
  // certificate-validation records returned by AssociateCustomDomain. When the
  // AWS call can't run (missing IAM / env), we still persist the domain +
  // `{ state:'pending_dns', error:'manual' }` so the clinic sees placeholder
  // instructions instead of an error.
  customDomainStatus: jsonb('custom_domain_status'),
  // Display name patients see in the "From" of clinic→patient email
  // ("Acme Dental"). Null = fall back to the clinic's display name. The email
  // address itself stays on the platform's verified sending domain (Tier 1 —
  // no per-clinic DNS); `email` above is used as the Reply-To.
  emailSenderName: text('email_sender_name'),
  // Tier 2 — when set, patient-facing email is sent FROM the clinic's own
  // connected Google mailbox (email_account.id) via the Gmail API, so the From
  // is the clinic's real address. Null = use the Tier 1 platform sender. No hard
  // FK (cross-schema-file); validated on read, falls back to Tier 1 if missing.
  emailSendingAccountId: text('email_sending_account_id'),

  // Address
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country').default('US'),

  // How many patients the clinic can see at the same time (operatories /
  // chairs). Drives online-booking availability: a slot is only "taken" once
  // the number of overlapping appointments reaches this count. Null = 1, which
  // preserves the original single-chair behavior for clinics set up before this
  // column existed. The PMS still owns operatory-level scheduling truth — this
  // is just our orbital-booking concurrency limit.
  chairCount: integer('chair_count'),
  // Per-clinic visit-type catalog (front-desk drawer + public widget + portal).
  // Shape: VisitTypeSettings in lib/types/visit-types.ts (an array of
  // { id, label, durationMinutes, bookablePublic, bookablePortal }). Null =
  // resolveVisitTypes() returns the universal defaults, so a clinic never needs
  // a backfill to start booking.
  visitTypeSettings: jsonb('visit_type_settings'),
  // Default recall cadence in months for patients with no per-patient override
  // and no PMS recall date. Null = RECALL_DEFAULT_MONTHS (6). The PMS recall
  // engine still wins when an Open Dental due date is synced.
  recallDefaultMonths: integer('recall_default_months'),

  // Public-website online self-scheduling switch. true (the default) = the
  // /book page shows the live slot picker and patients pick their own time.
  // false = the website's "Book a Visit" button leads to a request-only contact
  // form (email REQUIRED, phone optional) and the submission lands as an inbound
  // message in /messages instead of creating an appointment — the front desk
  // reaches out (email / SMS / in-app) to schedule. Plenty of practices never
  // want patients self-booking (PMS owns the chair); this is their switch.
  // NOT NULL default true so every existing clinic keeps self-booking on with
  // no backfill. Settings → Practice → "Patient self-scheduling".
  selfBookingEnabled: boolean('self_booking_enabled').notNull().default(true),

  // Operating hours stored as JSON: { mon: { open: '09:00', close: '17:00' }, ... }
  hours: jsonb('hours'),
  // IANA timezone the clinic's hours + appointment times are expressed in
  // (e.g. 'America/New_York'). Null = CLINIC_DEFAULT_TZ. The prod server runs
  // in UTC, so booking slots + appointment emails MUST resolve against this or
  // they render at the wrong wall-clock time.
  timezone: text('timezone'),

  // ── Google Business Profile sync provenance (Zernio, migration 0065) ──────
  // Per-field source flags so a Google sync NEVER silently clobbers a deliberate
  // manual edit. Values: 'manual' (the default — the clinic typed it / it was
  // never synced) | 'google' (last written by a Google Business Profile sync).
  // An automatic/background sync only overwrites fields whose source is 'google'
  // (or that were never synced); an explicit user-initiated "Sync from Google"
  // (force) MAY overwrite a manual field and flips its source to 'google'.
  // Saving the field through any editor flips its source back to 'manual'. The
  // public site / booking / footer / JSON-LD read the underlying columns
  // (`hours`, the address columns, `phone`) UNCHANGED — these flags are pure
  // provenance + UI-affordance metadata, never read by those consumers.
  hoursSource: text('hours_source').notNull().default('manual'),
  addressSource: text('address_source').notNull().default('manual'),
  phoneSource: text('phone_source').notNull().default('manual'),
  // When a Google Business Profile sync last applied any field for this clinic.
  // Null = never synced. Drives the "From Google · synced {date}" indicator.
  googleSyncedAt: timestamp('google_synced_at', { withTimezone: true }),
  // Photo URLs pulled from the clinic's Google Business Profile media. Kept
  // SEPARATE from the curated `officePhotos` — we surface these as an "Import
  // from Google" gallery the clinic picks from, never auto-clobbering their
  // curated gallery. Shape: Array<{ url, sourceUrl?, category? }> (defensive —
  // see resolveGooglePhotos in lib/services/gbp-sync.ts). Null = none pulled.
  googlePhotos: jsonb('google_photos'),

  // Which Dream Create plan tier this clinic is on. Drives module gating.
  // Mirrors Stripe subscription state; updated by the Stripe webhook.
  planTier: text('plan_tier').default('basic'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  subscriptionStatus: text('subscription_status'),

  // ── No-card free trial (migration 0070) ──────────────────────────────────
  // When the clinic's 7-day free trial ends. Set at signup / managed
  // provisioning; null = never on a trial (comped clinics, demo, legacy rows).
  // During the trial the clinic gets full Premium access with NO card on file;
  // on expiry WITHOUT a paid subscription they're locked to the "set up billing"
  // wall. A real paid subscription (stripeSubscriptionId + an active/past_due
  // status) always overrides the trial — see lib/trial.ts + getTenantContext.
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),

  // ── Social-connection add-on (Zernio social module, Phase 3, migration 0067)
  // 1 = the clinic has purchased the flat per-tier "extra social connections"
  // add-on (a Stripe subscription ITEM on top of the plan), which RAISES the
  // social-connection cap (Pro 1→3, Premium 2→5). 0 = not purchased (the base
  // free allotment applies). THE source of truth the entitlement math reads;
  // kept in sync by the Stripe webhook (detects the add-on price among the
  // subscription items) for real clinics, and set directly for the demo. GBP is
  // free + separate on every tier and never gated by this — see
  // lib/types/social-entitlements.ts.
  socialAddon: integer('social_addon').notNull().default(0),
  // When the social add-on was last activated (null when never / removed).
  socialAddonSince: timestamp('social_addon_since', { withTimezone: true }),

  // How this clinic's billing came to be: 'self_serve' = signed up through
  // onboarding; 'managed' = created by the platform admin, owner activates
  // billing from an invite; 'comped' = platform-granted tier, no Stripe sub.
  billingMode: text('billing_mode').default('self_serve'),
  // Managed clinics: the plan the platform admin reserved, awaiting owner
  // checkout. Cleared by the Stripe webhook when the subscription activates.
  pendingPlanId: text('pending_plan_id'),
  pendingBillingInterval: text('pending_billing_interval'),
  // Per-clinic custom pricing: a Stripe coupon pre-applied at activation
  // checkout (the platform admin's negotiated price).
  stripeCouponId: text('stripe_coupon_id'),
  // Internal operator note (why comped / pricing context). Never patient-facing.
  managedNote: text('managed_note'),

  // ── Referral partner attribution ─────────────────────────────────────────
  // Which partner (if any) referred this clinic. Set at provisioning or
  // retroactively from the clinic detail page. Null = no referral. The FK to
  // referral_partner (onDelete: set null) is added in the migration —
  // referral_partner lives in its own schema file, so we keep this column
  // FK-less here to avoid an import cycle.
  referralPartnerId: text('referral_partner_id'),
  // Per-clinic commission rate in basis points. Null = use the partner's
  // current default at accrual time. Set explicitly to lock a negotiated rate.
  referralPercentBps: integer('referral_percent_bps'),
  // Per-clinic term length in months. Null with a partner assigned = fall back
  // to the partner default (which may itself be null = forever).
  referralTermMonths: integer('referral_term_months'),
  // When this clinic was assigned to its partner — the clock the referral TERM
  // is measured from. Set on assignment, cleared on clear.
  referralStartedAt: timestamp('referral_started_at', { withTimezone: true }),

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

/**
 * Shape stored inside `clinic_profile.financing_partners` jsonb. Optional
 * per-clinic list of CareCredit / Sunbit / Cherry / etc. apply-here partners.
 * `applyUrl` should point at the partner's homepage (NOT a hotlink-protected
 * affiliate apply URL we don't control). The whole financing section on
 * /payment-financing hides when this is null/empty — we don't push patients
 * to financing if the clinic doesn't have a partner.
 */
export interface JsonClinicFinancingPartner {
  id: string
  name: string
  description?: string | null
  applyUrl?: string | null
  logoUrl?: string | null
}

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
    // True once a platform admin hand-edits this entry's canonical content in
    // the dashboard. The deploy-time seedServiceLibrary() then STOPS refreshing
    // this row from the in-code SERVICE_LIBRARY_SEED, so the dashboard edit
    // becomes the durable default every clinic starts from.
    editedByAdmin: boolean('edited_by_admin').notNull().default(false),
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

// ─────────────────────────────────────────────────────────────────────────────
// AI usage counter
//
// A lightweight per-org, per-month tally of metered AI generations (today:
// website-copy rewrites). Powers the tier-baked allowance in the Website
// Editor — manual editing and the one-time onboarding draft are always free
// and NEVER increment this; only an on-demand "Rewrite with AI" does. The
// unique (organization_id, period, kind) index lets us do an atomic
// INSERT … ON CONFLICT DO UPDATE SET count = count + 1, and read the current
// month's usage in one row. `period` is a 'YYYY-MM' string in UTC.
// ─────────────────────────────────────────────────────────────────────────────

export const aiUsageCounter = pgTable(
  'ai_usage_counter',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // 'YYYY-MM' (UTC) — the billing-month bucket the allowance resets on.
    period: text('period').notNull(),
    // Metered action class. v1: 'website_rewrite'. Extensible (e.g. future
    // 'blog_draft') without a migration.
    kind: text('kind').notNull().default('website_rewrite'),
    count: integer('count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    orgPeriodKind: uniqueIndex('idx_ai_usage_org_period_kind').on(
      t.organizationId,
      t.period,
      t.kind,
    ),
  }),
)

export type AiUsageCounter = typeof aiUsageCounter.$inferSelect
