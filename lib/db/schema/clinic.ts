import { pgTable, text, timestamp, integer, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'
import { clinicLocation } from './platform'

// Core patient record for a clinic tenant.
// Scoped to organizationId so each clinic only sees their own patients.
export const patient = pgTable(
  'patient',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    // Linked auth user — set when a patient accepts a portal invitation.
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),

    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dateOfBirth: text('date_of_birth'), // ISO date 'YYYY-MM-DD'
    email: text('email'),
    phone: text('phone'),

    addressLine1: text('address_line1'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),

    insuranceProvider: text('insurance_provider'),
    insurancePolicyNumber: text('insurance_policy_number'),
    insuranceGroupNumber: text('insurance_group_number'),

    notes: text('notes'),
    isActive: integer('is_active').notNull().default(1),

    // Acquisition + lifecycle. `source` is where the relationship started
    // ('website' | 'booking' | 'referral' | 'walk_in' | 'manual' | 'lead_form'
    // | 'invite'). `lifecycle` is the CRM-style stage; default 'active'
    // covers existing rows, and new bookings land as 'new' for the first
    // 30 days. Values: 'lead' | 'new' | 'active' | 'at_risk' | 'lapsed'
    // | 'archived'. Strings (not enum) so we can iterate without migrations.
    source: text('source'),
    lifecycle: text('lifecycle').notNull().default('active'),
    // First time this human appeared in our system (often = createdAt, but
    // could be earlier if we ever migrate from another system).
    firstSeenAt: timestamp('first_seen_at'),
    // Last interaction across appointments / messages / submissions / invoices.
    // Maintained by the service layer on write; reads use this directly so
    // the list page is O(1) per row.
    lastActivityAt: timestamp('last_activity_at'),

    // Marketing comms opt-in (Recall & Outreach v1). Email defaults to true
    // — patient gave us their address knowing we're a clinic, the unsub link
    // in every footer makes opting out one click. SMS defaults to false —
    // explicit opt-in required by TCPA, capture via intake form / booking
    // checkbox / one-time keyword reply. Opt-in/out timestamps preserve the
    // audit trail; source records WHERE the opt-in came from.
    marketingEmailOptIn: integer('marketing_email_opt_in').notNull().default(1),
    marketingEmailOptInAt: timestamp('marketing_email_opt_in_at'),
    marketingEmailOptOutAt: timestamp('marketing_email_opt_out_at'),
    marketingSmsOptIn: integer('marketing_sms_opt_in').notNull().default(0),
    marketingSmsOptInAt: timestamp('marketing_sms_opt_in_at'),
    marketingSmsOptOutAt: timestamp('marketing_sms_opt_out_at'),
    // 'backfill' | 'booking' | 'form' | 'invite' | 'manual' | 'lead_form'
    marketingOptInSource: text('marketing_opt_in_source'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // Sort/search on the list page hits these constantly.
    index('patient_org_name_idx').on(t.organizationId, t.lastName, t.firstName),
    index('patient_org_lifecycle_idx').on(t.organizationId, t.lifecycle),
    index('patient_org_last_activity_idx').on(t.organizationId, t.lastActivityAt),
    // For email-based lookups (booking flow, invite accept) — not unique
    // because parents/children commonly share an email in pediatric practices.
    index('patient_org_email_idx').on(t.organizationId, t.email),
    // For audience materialization in Recall & Outreach — fast "patients
    // with email opt-in" scans.
    index('patient_org_marketing_email_idx').on(t.organizationId, t.marketingEmailOptIn),
  ],
)

// Append-only relationship notes on a patient. Audit-friendly: rows are
// soft-deleted (deletedAt) rather than mutated, and every row carries the
// author. NOT clinical notes — these are CRM-side ("prefers morning",
// "anxious", "referred by Dr. Park").
export const patientNote = pgTable(
  'patient_note',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('patient_note_patient_created_idx').on(t.patientId, t.createdAt)],
)

export const appointment = pgTable('appointment', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
  // Which location the appointment is at (optional — not all clinics use locations)
  locationId: text('location_id').references(() => clinicLocation.id, { onDelete: 'set null' }),
  // Which staff member the patient is coming to see. Nullable — many demo
  // and small-practice rows won't have one assigned. NOT a clinical
  // provider record (no NPI / license / signature) — strictly a CRM-side
  // "with [name]" label for the agenda. The PMS still owns the truth.
  providerId: text('provider_id').references(() => clinicProvider.id, { onDelete: 'set null' }),

  title: text('title').notNull(),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),

  // 'checkup' | 'cleaning' | 'filling' | 'extraction' | 'root_canal' | 'consultation' | 'other'
  type: text('type').notNull().default('checkup'),
  // 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  status: text('status').notNull().default('scheduled'),

  notes: text('notes'),

  // Confirmation + lifecycle audit. Per DESIGN.md principle 13, every
  // state change is timestamped so we have a real trail (vs. relying on
  // `status` + `updatedAt` which is one-bit).
  confirmedAt: timestamp('confirmed_at'),
  cancelledAt: timestamp('cancelled_at'),
  completedAt: timestamp('completed_at'),
  noShowedAt: timestamp('no_showed_at'),
  // How the confirmation came in: 'sms' | 'email' | 'manual' | 'auto_sms_keyword'
  confirmedVia: text('confirmed_via'),
  // If this row replaced an earlier appointment via reschedule, points back.
  // Soft pointer (no FK) since the original row may have been deleted.
  rescheduledFromAppointmentId: text('rescheduled_from_appointment_id'),
  // Where the booking originated. Mirrors patient.source.
  // 'booking_widget' | 'manual' | 'recall_campaign' | 'phone' | 'invite'
  source: text('source'),
  // Source attribution captured at booking time on the public widget (mirrors
  // the lead table) so the SEO module can attribute organic search → bookings.
  sourcePage: text('source_page'),
  referrer: text('referrer'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('appointment_org_start_idx').on(t.organizationId, t.startTime),
  index('appointment_org_status_idx').on(t.organizationId, t.status),
  index('appointment_patient_start_idx').on(t.patientId, t.startTime),
  index('appointment_org_provider_idx').on(t.organizationId, t.providerId),
])

// Clinic staff who patients can be booked "with". Intentionally lightweight:
// a CRM-side display label (name, role, photo, email). NOT a PMS provider
// record — no NPI, no license, no signature, no clinical permissions. The
// PMS still owns clinical provider truth; this exists only so the agenda
// can render "Cleaning with Dr. Patel" and the calendar can filter by who.
export const clinicProvider = pgTable('clinic_provider', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  // 'dentist' | 'hygienist' | 'assistant' | 'specialist' | 'admin'
  role: text('role').notNull().default('dentist'),
  email: text('email'),
  photoUrl: text('photo_url'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('clinic_provider_org_idx').on(t.organizationId)])

// One row per reminder/confirmation sent for an appointment. Audit-friendly:
// every send is recorded, replies are appended in place (deliveredAt /
// repliedAt set when Resend / Twilio webhooks land — for v1 only sentAt
// is populated since Twilio isn't wired). Powers the "Reminder activity"
// stripe in the appointment drawer + drives the ⏱ "reminder sent recently"
// glyph on the agenda row.
export const appointmentReminderLog = pgTable('appointment_reminder_log', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  appointmentId: text('appointment_id').notNull().references(() => appointment.id, { onDelete: 'cascade' }),
  // 'sms' | 'email'
  channel: text('channel').notNull(),
  // Template key (e.g. 'default_24h', 'recall_new_patient'). Nullable for
  // ad-hoc one-off sends.
  template: text('template'),
  sentAt: timestamp('sent_at').notNull().defaultNow(),
  // Null when sent by an automated job. Else the staff member who clicked send.
  sentByUserId: text('sent_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  deliveredAt: timestamp('delivered_at'),
  repliedAt: timestamp('replied_at'),
  replyBody: text('reply_body'),
}, (t) => [index('appt_reminder_appt_sent_idx').on(t.appointmentId, t.sentAt)])

// Reusable intake form definition. Sections + fields stored as JSON for
// the v1 — the structure is rich enough (text / textarea / email / tel /
// date / select / radio / checkbox / yes_no / signature) that a relational
// shape would add a lot of joins without buying much. Trade off when we
// hit the limits.
export const formTemplate = pgTable(
  'form_template',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    // Stable per-org slug; used in the public URL /site/[slug]/intake/[formSlug]
    slug: text('slug').notNull(),
    // Schema: { sections: Array<{ id, title, description?, fields: FormField[] }> }
    schema: jsonb('schema').notNull(),
    // Marks this template as the clinic's default — first one sent post-booking
    // when there's no per-appointment-type mapping yet. Exactly one default
    // per org, enforced at the service layer (not in SQL — partial unique
    // would require a more complex constraint).
    isDefault: integer('is_default').notNull().default(0),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('form_template_org_slug_idx').on(t.organizationId, t.slug)],
)

// One patient submission of a form template. Linked optionally to a
// patient and / or an appointment so future visits can prefill.
export const formSubmission = pgTable('form_submission', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  formTemplateId: text('form_template_id').notNull().references(() => formTemplate.id, { onDelete: 'cascade' }),
  patientId: text('patient_id').references(() => patient.id, { onDelete: 'set null' }),
  appointmentId: text('appointment_id').references(() => appointment.id, { onDelete: 'set null' }),
  // { [fieldId]: value } — value type depends on the field kind
  data: jsonb('data').notNull(),
  // Submitter's name + contact captured at submit time (in case patientId is null)
  submitterName: text('submitter_name'),
  submitterEmail: text('submitter_email'),
  submitterPhone: text('submitter_phone'),
  submittedAt: timestamp('submitted_at').notNull().defaultNow(),
})

// Public website contact-form submissions. Distinct from `patient` —
// these are inbound prospects who have not yet converted. Once a lead
// becomes a patient (front-desk clicks "Convert"), a `patient` row is
// created and `lead.convertedToPatientId` is set; the lead row stays
// for audit + source attribution + analytics ("how many website leads
// converted last month?").
export const lead = pgTable('lead', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),

  // Contact info — matches what the public form collects. Name is a
  // single string by design (matches how the form prompts for it +
  // avoids forcing a brittle first/last split until conversion time).
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  preferredDate: text('preferred_date'),
  message: text('message'),

  // Source attribution. Captured at submit time via hidden form fields
  // populated by JS from window.location + document.referrer + utm_*
  // query params. All optional — older form versions won't have them.
  sourcePage: text('source_page'),
  referrer: text('referrer'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),

  // Lifecycle. 'new' (just landed, untouched), 'contacted' (staff
  // reached out — phone/email), 'converted' (now a patient row exists),
  // 'archived' (spam / not interested / wrong number / duplicate).
  status: text('status').notNull().default('new'),
  convertedToPatientId: text('converted_to_patient_id').references(() => patient.id, { onDelete: 'set null' }),
  contactedAt: timestamp('contacted_at'),
  convertedAt: timestamp('converted_at'),
  archivedAt: timestamp('archived_at'),
  archivedReason: text('archived_reason'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('lead_org_status_idx').on(t.organizationId, t.status),
  index('lead_org_created_idx').on(t.organizationId, t.createdAt),
])

// Per-org Twilio config for SMS sends. One row per organization, keyed on
// org id. Phase A creates the table but leaves it empty — Phase B writes
// the Twilio account info + A2P 10DLC registration state into it once the
// clinic provisions a number. The a2pStatus stays at 'none' until the
// clinic completes brand + campaign registration in Twilio's console;
// 'pending' while carriers review (5-14 business days); 'approved' unlocks
// the SMS send button in the UI.
export const clinicSmsConfig = pgTable('clinic_sms_config', {
  organizationId: text('organization_id').primaryKey().references(() => organization.id, { onDelete: 'cascade' }),
  twilioPhoneNumber: text('twilio_phone_number'),
  twilioPhoneNumberSid: text('twilio_phone_number_sid'),
  a2pBrandSid: text('a2p_brand_sid'),
  a2pCampaignSid: text('a2p_campaign_sid'),
  // 'none' | 'pending' | 'approved' | 'rejected'
  a2pStatus: text('a2p_status').notNull().default('none'),
  a2pStatusUpdatedAt: timestamp('a2p_status_updated_at'),
  // Rolling 30-day window counters. Reset by a cron once a month.
  monthlySendCount: integer('monthly_send_count').notNull().default(0),
  monthlySendCountResetAt: timestamp('monthly_send_count_reset_at'),
  // Soft cap in dollars; UI shows a banner at 80% utilization.
  monthlySendBudgetCents: integer('monthly_send_budget_cents'),
  // Last Twilio API error stored for diagnostics ({ code, message, sid }).
  lastErrorMeta: jsonb('last_error_meta'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Patient Communications v1 — unified per-patient threads with channel-
// tagged messages. The Front-style team-inbox abstraction translated to
// dental: one thread per (organization, patient); each message carries
// a channel discriminator ('in_app' | 'email' | 'sms' Phase B).
//
// Coexists with the existing `email_message` table (Gmail integration —
// owns the technical email shape: rfc ids, threading, labels). The
// service layer joins both into a unified thread view; we don't dupe
// rows. New outbound messages go into `patient_message`; existing Gmail
// inbox messages stay where they are.
export const patientThread = pgTable(
  'patient_thread',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    // 'open' = needs attention or actively in-progress
    // 'snoozed' = will reappear at snoozedUntil
    // 'archived' = done, no longer in default inbox view
    status: text('status').notNull().default('open'),
    assignedUserId: text('assigned_user_id').references(() => user.id, { onDelete: 'set null' }),
    snoozedUntil: timestamp('snoozed_until'),
    // Denormalized for inbox sort + preview. Updated by the service on every
    // message insert; on initial thread creation = createdAt.
    lastMessageAt: timestamp('last_message_at'),
    lastMessageDirection: text('last_message_direction'), // 'inbound' | 'outbound'
    lastMessageChannel: text('last_message_channel'),     // 'in_app' | 'email' | 'sms'
    // Front-style "needs reply" counter — incremented on inbound messages,
    // reset to 0 when a clinic user marks the thread read.
    unreadCountForClinic: integer('unread_count_for_clinic').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // Inbox list sort: org + status + recency
    index('patient_thread_org_status_last_idx').on(t.organizationId, t.status, t.lastMessageAt),
    // Per-patient lookup — one thread per patient per org
    uniqueIndex('patient_thread_org_patient_idx').on(t.organizationId, t.patientId),
    // Assignment filtering ("mine")
    index('patient_thread_org_assigned_idx').on(t.organizationId, t.assignedUserId),
  ],
)

export const patientMessage = pgTable(
  'patient_message',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id').notNull().references(() => patientThread.id, { onDelete: 'cascade' }),
    // Denormalized for fast org-scoped queries without join through thread
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    // 'in_app' = sent in DreamCRM portal/web
    // 'email' = sent via Gmail (Phase A) or branded Resend (later)
    // 'sms' = Twilio (Phase B; stubbed for now)
    channel: text('channel').notNull(),
    // 'inbound' = from patient to clinic
    // 'outbound' = from clinic staff to patient
    direction: text('direction').notNull(),
    body: text('body').notNull(),
    // Null on inbound. On outbound, the staff member who hit send.
    sentByUserId: text('sent_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at'),
    readByPatientAt: timestamp('read_by_patient_at'),
    repliedAt: timestamp('replied_at'),
    // External ID for back-reference: Gmail provider_message_id when ingested
    // from email_message, Twilio MessageSid (Phase B), null for in-app.
    externalId: text('external_id'),
    // Attachments, link previews, related campaign id, etc.
    meta: jsonb('meta').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('patient_message_thread_sent_idx').on(t.threadId, t.sentAt),
    index('patient_message_org_sent_idx').on(t.organizationId, t.sentAt),
  ],
)

// Reviews & Reputation v1 — post-visit review requests.
//
// Per-org config (one row per org, keyed on org id). Stores the review-
// site identifiers + rate limit + Phase 2 NPS toggle. Empty by default;
// the /reviews dashboard prompts the user to fill it on first visit.
export const clinicReviewConfig = pgTable('clinic_review_config', {
  organizationId: text('organization_id').primaryKey().references(() => organization.id, { onDelete: 'cascade' }),
  // Google: Place ID feeds into the writereview deep link
  // (https://search.google.com/local/writereview?placeid=<id>).
  // Per research, Google is ~80% of dental review value; we make it
  // the primary platform on the public landing page.
  googlePlaceId: text('google_place_id'),
  // Healthgrades: the dental-specific review platform. Higher signal
  // than Facebook for healthcare reputation; ranks well in dentist
  // search SERPs. URL slug from the practice's Healthgrades page.
  healthgradesUrl: text('healthgrades_url'),
  // Facebook: still relevant for older / family-clinic demographics.
  facebookPageId: text('facebook_page_id'),
  // Yelp: stored for orgs that explicitly want it, but DELIBERATELY
  // OMITTED from the default landing page — Yelp filters solicited
  // reviews into a hidden "not recommended" bucket, so prompts hurt
  // more than they help (industry consensus: Birdeye / Weave / Swell
  // all exclude Yelp from their auto-routers). Only surfaced when the
  // clinic manually adds the slug.
  yelpBusinessSlug: text('yelp_business_slug'),
  // Minimum days between two requests to the same patient. Default 365
  // (one year) matches NiceJob's 6-month lockout dialed conservative
  // for dental — most patients see the dentist once or twice a year and
  // re-asking within the same year reads as spam. Configurable per org.
  minDaysBetweenRequests: integer('min_days_between_requests').notNull().default(365),
  // Phase 2 NPS triage: ask "How was your visit?" first. 4-5 stars
  // routes to public review platforms; 1-3 stars routes to private
  // feedback. Off for v1 — we send the platform picker directly to
  // avoid the FTC "review gating" anti-pattern (soliciting only
  // positive reviews is illegal in some jurisdictions). NPS done right
  // (ALL responses public when configured) lands in v1.1.
  npsEnabled: integer('nps_enabled').notNull().default(0),
  // Phase 2 auto-trigger: when an appointment.status flips to
  // 'completed', schedule a review request for autoSendDelayHours later.
  // Off for v1 — staff manually click "Request review" per appointment.
  autoSendEnabled: integer('auto_send_enabled').notNull().default(0),
  autoSendDelayHours: integer('auto_send_delay_hours').notNull().default(48),
  // Where private 1-3 star NPS feedback lands. Falls back to
  // clinicProfile.email when unset.
  privateFeedbackEmail: text('private_feedback_email'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// One row per review request sent (or queued). Status tracks the funnel
// from creation → send → click → completed-tap. `token` is a signed
// opaque string used in the public /r/<token> redirect URL so we can
// attribute clicks back to the right row.
export const reviewRequest = pgTable('review_request', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
  // The visit that triggered the request, when one exists. Nullable so
  // staff can send an ad-hoc request for any patient.
  appointmentId: text('appointment_id').references(() => appointment.id, { onDelete: 'set null' }),
  requestedByUserId: text('requested_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  // 'email' | 'sms' (sms is Phase B; no-ops with a clear error in v1)
  channel: text('channel').notNull(),
  // Funnel state:
  //   'pending'   — created, not yet sent
  //   'sent'      — delivered to patient
  //   'clicked'   — patient tapped the link in the email/SMS
  //   'completed' — patient picked a public-review platform on the
  //                 landing page (the "left a review" proxy — we can't
  //                 verify on the external site)
  //   'skipped'   — staff manually skipped (rate-limit, or unhappy
  //                 patient shouldn't be asked)
  //   'failed'    — send failed
  status: text('status').notNull().default('pending'),
  sentAt: timestamp('sent_at'),
  clickedAt: timestamp('clicked_at'),
  completedAt: timestamp('completed_at'),
  // 'google' | 'healthgrades' | 'facebook' | 'yelp' | 'private_feedback'
  // — which destination the patient picked on the landing page.
  // Null until the redirect lands.
  selectedSite: text('selected_site'),
  // Opaque random token for the public /r/<token> URL.
  token: text('token').notNull(),
  errorMessage: text('error_message'),
  // For Phase 2 NPS triage: 1-5 rating + private feedback body.
  rating: integer('rating'),
  privateFeedback: text('private_feedback'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('review_request_token_idx').on(t.token),
  index('review_request_org_status_idx').on(t.organizationId, t.status),
  index('review_request_org_sent_idx').on(t.organizationId, t.sentAt),
  index('review_request_patient_idx').on(t.organizationId, t.patientId),
])

// Blog & content marketing v1 — original, clinician-approved posts that live
// on the clinic's own public website (the "trunk"). Deliberately NOT a shared
// content library (the ProSites / RevenueWell model that recycles the same
// boilerplate across hundreds of practices, which Google discounts as
// duplicate content) — every post is the clinic's own, AI-drafted-then-
// reviewed. Dental is YMYL, so the author byline references a
// clinicProfile.staff[] entry by id and carries the same name / title /
// photo / bio the clinic already curates for "Meet the Team" (E-E-A-T).
export const blogPost = pgTable(
  'blog_post',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // Stable per-org slug; used in the public URL /site/[slug]/blog/[postSlug].
    slug: text('slug').notNull(),
    // Short summary for index cards + the meta-description fallback.
    excerpt: text('excerpt'),
    // Sanitized HTML rendered on the public page — re-sanitized on every write
    // (see lib/blog-sanitize.ts). bodyJson keeps the exact Tiptap ProseMirror
    // doc for lossless re-editing in the admin editor.
    bodyHtml: text('body_html').notNull().default(''),
    bodyJson: jsonb('body_json'),
    coverImageUrl: text('cover_image_url'),
    // Single free-text category (e.g. 'Oral Health'); tags is a string[] for
    // finer topical grouping. Strings, not enums, so we can iterate without a
    // migration.
    category: text('category'),
    tags: jsonb('tags'),
    // 'draft' | 'published'. Soft-deleted rows carry archivedAt.
    status: text('status').notNull().default('draft'),
    // Provenance — drives the "AI draft · needs review" badge and keeps the
    // clinician-review gate honest. 'manual' | 'ai_draft' | 'seed'.
    source: text('source').notNull().default('manual'),
    // Author byline. authorStaffId is a soft pointer into clinicProfile.staff
    // (a jsonb array — no FK is possible); authorName is snapshotted at write
    // time so the byline survives a later staff-list edit.
    authorStaffId: text('author_staff_id'),
    authorName: text('author_name'),
    // Per-post SEO overrides; fall back to title / excerpt when null.
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    // Optional FAQ section: Array<{ q, a }>. Rendered on the post + emitted as
    // FAQPage JSON-LD (a strong AI-Overview / voice-search signal for dental).
    faq: jsonb('faq'),
    // Alt text for the cover image (accessibility + image SEO).
    coverImageAlt: text('cover_image_alt'),
    // Optional second byline for clinical posts (E-E-A-T): a soft pointer into
    // clinicProfile.staff, surfaced publicly as "Medically reviewed by".
    medicallyReviewedByStaffId: text('medically_reviewed_by_staff_id'),
    medicallyReviewedAt: timestamp('medically_reviewed_at'),
    // Pageview counter, incremented by a client beacon on the public post so
    // SSR / bot renders don't inflate it. Powers the "N reads" adoption signal.
    viewCount: integer('view_count').notNull().default(0),
    // When set + status='scheduled', the publish-scheduled-posts cron flips the
    // (already review-approved) post live at this time. Never auto-publishes
    // unreviewed AI — scheduling requires passing the publish gate first.
    scheduledFor: timestamp('scheduled_for'),
    publishedAt: timestamp('published_at'),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('blog_post_org_slug_idx').on(t.organizationId, t.slug),
    index('blog_post_org_status_published_idx').on(t.organizationId, t.status, t.publishedAt),
  ],
)

export type Patient = typeof patient.$inferSelect
export type NewPatient = typeof patient.$inferInsert
export type PatientNote = typeof patientNote.$inferSelect
export type NewPatientNote = typeof patientNote.$inferInsert
export type Appointment = typeof appointment.$inferSelect
export type NewAppointment = typeof appointment.$inferInsert
export type ClinicProvider = typeof clinicProvider.$inferSelect
export type NewClinicProvider = typeof clinicProvider.$inferInsert
export type AppointmentReminderLog = typeof appointmentReminderLog.$inferSelect
export type NewAppointmentReminderLog = typeof appointmentReminderLog.$inferInsert
export type FormTemplate = typeof formTemplate.$inferSelect
export type NewFormTemplate = typeof formTemplate.$inferInsert
export type FormSubmission = typeof formSubmission.$inferSelect
export type NewFormSubmission = typeof formSubmission.$inferInsert
export type Lead = typeof lead.$inferSelect
export type NewLead = typeof lead.$inferInsert
export type ClinicSmsConfig = typeof clinicSmsConfig.$inferSelect
export type NewClinicSmsConfig = typeof clinicSmsConfig.$inferInsert
export type PatientThread = typeof patientThread.$inferSelect
export type NewPatientThread = typeof patientThread.$inferInsert
export type PatientMessage = typeof patientMessage.$inferSelect
export type NewPatientMessage = typeof patientMessage.$inferInsert
export type ClinicReviewConfig = typeof clinicReviewConfig.$inferSelect
export type NewClinicReviewConfig = typeof clinicReviewConfig.$inferInsert
export type ReviewRequest = typeof reviewRequest.$inferSelect
export type NewReviewRequest = typeof reviewRequest.$inferInsert
export type BlogPost = typeof blogPost.$inferSelect
export type NewBlogPost = typeof blogPost.$inferInsert
