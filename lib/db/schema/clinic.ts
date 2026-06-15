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

    // Family access (patient portal): when set, the named patient (parent /
    // guardian — must have portal access themselves) can see and manage this
    // patient's visits and forms from their own portal login. Self-FK kept
    // soft (no .references) to avoid a self-referencing circular type; the
    // service layer enforces same-org integrity on write.
    guardianPatientId: text('guardian_patient_id'),

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

    // PMS-synced estimated patient balance (Integrations v1). Populated by the
    // Open Dental import; null = no PMS connected (or balance not yet synced).
    // The PMS owns clinical AR truth, so this is read-only here — surfaced on
    // the patient detail page as "Balance (from your PMS)", never merged with
    // DreamCRM's own shop/invoice totals.
    pmsBalanceCents: integer('pms_balance_cents'),
    pmsBalanceUpdatedAt: timestamp('pms_balance_updated_at'),

    // PMS-synced recall (Integrations Phase 1). The clinic's PMS owns the
    // recall engine; when present we prefer it for "who's due" over our
    // appointment-derived heuristic. pmsRecallDueAt = next due date,
    // pmsRecallInterval = cadence string (e.g. "6m").
    pmsRecallDueAt: timestamp('pms_recall_due_at'),
    pmsRecallInterval: text('pms_recall_interval'),

    // Per-patient recall cadence override in months (CRM-side, set in the
    // patient Edit modal). Null = fall back to clinic_profile.recall_default_months
    // (then to RECALL_DEFAULT_MONTHS=6). A synced PMS recall date still wins over
    // this when present; this drives the appointment-derived heuristic for
    // clinics not yet on a PMS, or patients with no PMS recall row.
    recallIntervalMonths: integer('recall_interval_months'),

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
  /**
   * The full review text the patient wrote in DreamCRM. Populated when the
   * patient submits the review form on `/r/<token>`. NULL when the request
   * hasn't been completed yet OR when the patient went straight to a
   * third-party platform without leaving a copy here. Staff can READ this
   * on /reviews/received but CANNOT edit it — only the patient owns their
   * own words.
   */
  reviewText: text('review_text'),
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

// One Google Search Console connection per clinic org (OAuth, user-delegated —
// mirrors email_account). Stores the encrypted refresh token + the selected
// verified property. The clinic connects their OWN Search Console; a single
// service account can't read every clinic's data.
export const gscConnection = pgTable('gsc_connection', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  connectedByUserId: text('connected_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  // The chosen GSC property, e.g. 'sc-domain:example.com' or 'https://example.com/'.
  siteUrl: text('site_url'),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  accessToken: text('access_token'),
  accessExpiresAt: timestamp('access_expires_at'),
  scope: text('scope'),
  // 'needs_site' = connected but no property picked yet | 'connected' | 'error'
  status: text('status').notNull().default('needs_site'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
export type GscConnection = typeof gscConnection.$inferSelect

// ── Careers: job postings on the clinic's own site (the trunk) ──────────────
// Each open role renders on {slug}.../careers with JobPosting JSON-LD so
// Google for Jobs + Indeed index it for free (no partner API needed).
export const jobPosting = pgTable(
  'job_posting',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    locationId: text('location_id').references(() => clinicLocation.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    // 'hygienist' | 'dental_assistant' | 'front_desk' | 'office_manager'
    //   | 'associate_dentist' | 'treatment_coordinator' | 'other'
    role: text('role').notNull().default('other'),
    // 'full_time' | 'part_time' | 'contract' | 'temporary' | 'per_diem'
    employmentType: text('employment_type').notNull().default('full_time'),
    description: text('description').notNull().default(''),
    responsibilities: text('responsibilities'),
    requirements: text('requirements'),
    benefits: text('benefits'),
    // Optional compensation display, stored in cents.
    compMinCents: integer('comp_min_cents'),
    compMaxCents: integer('comp_max_cents'),
    compPeriod: text('comp_period').notNull().default('hour'), // 'hour' | 'year'
    showComp: integer('show_comp').notNull().default(1),
    // 'draft' | 'open' | 'closed' | 'filled'
    status: text('status').notNull().default('draft'),
    // 'in_app' (apply form → job_application) | 'external' (externalApplyUrl)
    applyMethod: text('apply_method').notNull().default('in_app'),
    externalApplyUrl: text('external_apply_url'),
    validThrough: timestamp('valid_through'), // JobPosting JSON-LD expiry
    postedAt: timestamp('posted_at'),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('job_posting_org_slug_idx').on(t.organizationId, t.slug),
    index('job_posting_org_status_idx').on(t.organizationId, t.status),
  ],
)
export type JobPosting = typeof jobPosting.$inferSelect

export const jobApplication = pgTable(
  'job_application',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    jobPostingId: text('job_posting_id').notNull().references(() => jobPosting.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    resumeUrl: text('resume_url'),
    linkedinUrl: text('linkedin_url'),
    coverNote: text('cover_note'),
    // 'new' | 'reviewing' | 'interview' | 'offer' | 'hired' | 'rejected' | 'archived'
    status: text('status').notNull().default('new'),
    // 'career_site' | 'indeed' | 'referral' | 'manual'
    source: text('source').notNull().default('career_site'),
    rating: integer('rating'), // optional internal 1-5
    reviewedAt: timestamp('reviewed_at'),
    decidedAt: timestamp('decided_at'),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('job_application_org_status_idx').on(t.organizationId, t.status),
    index('job_application_job_idx').on(t.jobPostingId),
  ],
)
export type JobApplication = typeof jobApplication.$inferSelect

// ── Shop: dental product retail + membership plans on the clinic's site ─────
// Purpose-built dental commerce (separate from the generic Mosaic
// products/orders tables). Revenue lands in the clinic's own Stripe via
// Connect Standard — the platform only facilitates.

// One commerce config per org: Stripe Connect account + fulfillment/tax toggles.
export const shopConfig = pgTable('shop_config', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  stripeAccountId: text('stripe_account_id'),
  // 'none' | 'pending' | 'active' | 'restricted'
  stripeAccountStatus: text('stripe_account_status').notNull().default('none'),
  chargesEnabled: integer('charges_enabled').notNull().default(0),
  payoutsEnabled: integer('payouts_enabled').notNull().default(0),
  pickupEnabled: integer('pickup_enabled').notNull().default(1),
  shippingEnabled: integer('shipping_enabled').notNull().default(0),
  flatShippingCents: integer('flat_shipping_cents'),
  freeShippingThresholdCents: integer('free_shipping_threshold_cents'),
  taxEnabled: integer('tax_enabled').notNull().default(0),
  // Optional platform fee (basis points) skimmed via Connect application fee.
  platformFeeBps: integer('platform_fee_bps').notNull().default(0),
  currency: text('currency').notNull().default('usd'),
  storefrontEnabled: integer('storefront_enabled').notNull().default(0),
  membershipEnabled: integer('membership_enabled').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
export type ShopConfig = typeof shopConfig.$inferSelect

export const shopProduct = pgTable(
  'shop_product',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    // 'whitening' | 'brushes' | 'flossers' | 'kids' | 'merch' | 'other'
    category: text('category').notNull().default('other'),
    images: jsonb('images').$type<string[]>().notNull().default([]),
    // 'draft' | 'active' | 'archived'
    status: text('status').notNull().default('draft'),
    // 'pickup' | 'ship' | 'both' — per-product fulfillment availability
    fulfillment: text('fulfillment').notNull().default('both'),
    fsaEligible: integer('fsa_eligible').notNull().default(0),
    featured: integer('featured').notNull().default(0),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('shop_product_org_slug_idx').on(t.organizationId, t.slug),
    index('shop_product_org_status_idx').on(t.organizationId, t.status),
  ],
)
export type ShopProduct = typeof shopProduct.$inferSelect

// Every product has >= 1 variant (a "Default" one when there are no options).
// Price + inventory live here.
export const shopProductVariant = pgTable(
  'shop_product_variant',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').notNull().references(() => shopProduct.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Default'),
    sku: text('sku'),
    priceCents: integer('price_cents').notNull(),
    compareAtCents: integer('compare_at_cents'),
    // null = inventory not tracked (unlimited)
    inventoryQty: integer('inventory_qty'),
    options: jsonb('options').$type<Record<string, string>>().notNull().default({}),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('shop_variant_product_idx').on(t.productId)],
)
export type ShopProductVariant = typeof shopProductVariant.$inferSelect

export const shopCoupon = pgTable(
  'shop_coupon',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    // 'percent' | 'amount'
    discountType: text('discount_type').notNull().default('percent'),
    discountValue: integer('discount_value').notNull(), // percent (1-100) or cents
    // Targeted coupons (e.g. birthday) bind to a patient; null = open code.
    patientId: text('patient_id').references(() => patient.id, { onDelete: 'set null' }),
    // 'manual' | 'birthday' | 'loyalty'
    source: text('source').notNull().default('manual'),
    singleUse: integer('single_use').notNull().default(1),
    minSubtotalCents: integer('min_subtotal_cents'),
    active: integer('active').notNull().default(1),
    expiresAt: timestamp('expires_at'),
    usedAt: timestamp('used_at'),
    usedOrderId: text('used_order_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('shop_coupon_org_code_idx').on(t.organizationId, t.code)],
)
export type ShopCoupon = typeof shopCoupon.$inferSelect

export const shopOrder = pgTable(
  'shop_order',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    // Guest checkout allowed → patientId nullable; linked when email/phone matches.
    patientId: text('patient_id').references(() => patient.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    name: text('name'),
    phone: text('phone'),
    // 'pickup' | 'ship'
    fulfillmentType: text('fulfillment_type').notNull().default('pickup'),
    shippingAddress: jsonb('shipping_address').$type<Record<string, string>>(),
    // 'pending' | 'paid' | 'cancelled' | 'refunded'
    status: text('status').notNull().default('pending'),
    // 'unfulfilled' | 'ready_for_pickup' | 'picked_up' | 'shipped' | 'delivered'
    fulfillmentStatus: text('fulfillment_status').notNull().default('unfulfilled'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    shippingCents: integer('shipping_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    couponId: text('coupon_id').references(() => shopCoupon.id, { onDelete: 'set null' }),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    trackingNumber: text('tracking_number'),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    paidAt: timestamp('paid_at'),
    fulfilledAt: timestamp('fulfilled_at'),
    cancelledAt: timestamp('cancelled_at'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('shop_order_org_status_idx').on(t.organizationId, t.status),
    index('shop_order_patient_idx').on(t.patientId),
  ],
)
export type ShopOrder = typeof shopOrder.$inferSelect

export const shopOrderItem = pgTable(
  'shop_order_item',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id').notNull().references(() => shopOrder.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    variantId: text('variant_id'), // snapshot pointer — variant may be deleted later
    productName: text('product_name').notNull(),
    variantName: text('variant_name'),
    sku: text('sku'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('shop_order_item_order_idx').on(t.orderId)],
)
export type ShopOrderItem = typeof shopOrderItem.$inferSelect

// ── Membership plans (recurring, cash-pay alternative to insurance) ─────────
export const membershipPlan = pgTable(
  'membership_plan',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    // 'monthly' | 'annual'
    billingInterval: text('billing_interval').notNull().default('annual'),
    priceCents: integer('price_cents').notNull(),
    // [{ label: '2 cleanings / yr', qty: 2 }, { label: '2 exams / yr', qty: 2 }, …]
    benefits: jsonb('benefits').$type<Array<{ label: string; qty?: number }>>().notNull().default([]),
    discountPercent: integer('discount_percent').notNull().default(0), // % off other treatment
    stripeProductId: text('stripe_product_id'),
    stripePriceId: text('stripe_price_id'),
    // 'draft' | 'active' | 'archived'
    status: text('status').notNull().default('draft'),
    featured: integer('featured').notNull().default(0),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('membership_plan_org_slug_idx').on(t.organizationId, t.slug)],
)
export type MembershipPlan = typeof membershipPlan.$inferSelect

// A patient's enrollment in a plan.
export const membership = pgTable(
  'membership',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull().references(() => membershipPlan.id, { onDelete: 'restrict' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    // 'pending' | 'active' | 'past_due' | 'cancelled'
    status: text('status').notNull().default('pending'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    // Benefit redemption this period, e.g. { cleanings: 1 }
    benefitsUsed: jsonb('benefits_used').$type<Record<string, number>>().notNull().default({}),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    startedAt: timestamp('started_at'),
    cancelledAt: timestamp('cancelled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('membership_org_status_idx').on(t.organizationId, t.status),
    index('membership_patient_idx').on(t.patientId),
  ],
)
export type Membership = typeof membership.$inferSelect

// ── PMS Integrations (Phase 4 — wrap, don't replace) ────────────────────────
// DreamCRM is the orbital layer over the clinic's existing Practice Management
// System (Open Dental first). We sync the RELATIONSHIP layer only — patients,
// appointments, providers, balances — and deliberately never touch clinical
// data (charting, treatment plans, procedures, claims) which the PMS owns.
//
// The whole design is "sanctioned, audit-clean": we read + write ONLY through
// the PMS's official API, so every write lands in the clinic's own PMS Audit
// Trail. This is the explicit opposite of direct-database scrapers (the
// pattern Open Dental publicly warns its customers against). pms_write_op is
// the durable record of every record we created in their PMS, via the API.

// One PMS connection per clinic org (keyed on org id, like gsc_connection).
export const pmsConnection = pgTable('pms_connection', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  connectedByUserId: text('connected_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  // 'open_dental' | 'dentrix_ascend' | 'dentrix_desktop' | 'eaglesoft' | 'curve' | 'demo'
  // Only 'open_dental' (real) and 'demo' (Acme sandbox) are wired in v1; the
  // others render as honest "roadmap / request access" rows in the catalog.
  provider: text('provider').notNull(),
  // 'not_connected' | 'connected' | 'error'
  status: text('status').notNull().default('not_connected'),
  // Open Dental Customer Key (per-office), AES-256-GCM encrypted at rest
  // (mirrors gsc_connection.refresh_token_encrypted). The Developer Key is a
  // platform-level secret in env (PMS_OPEN_DENTAL_DEVELOPER_KEY), never stored
  // per-org.
  customerKeyEncrypted: text('customer_key_encrypted'),
  // 'import' (PMS → DreamCRM only) | 'two_way' (also push DreamCRM-originated
  // bookings into the PMS). Default two_way per the v1 decision.
  syncDirection: text('sync_direction').notNull().default('two_way'),
  autoSyncEnabled: integer('auto_sync_enabled').notNull().default(1),
  // Last inbound sync attempt.
  lastSyncAt: timestamp('last_sync_at'),
  // 'success' | 'partial' | 'error'
  lastSyncStatus: text('last_sync_status'),
  lastError: text('last_error'),
  // testConnection diagnostics surfaced in the status card:
  // { practiceTitle?, version?, eConnectorReachable?, scopeNote? }
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
export type PmsConnection = typeof pmsConnection.$inferSelect
export type NewPmsConnection = typeof pmsConnection.$inferInsert

// Durable 1:1 link between a PMS-side record and our row. Lets re-syncs be
// idempotent (upsert on external id) and lets write-back record the external
// id the PMS assigned to a DreamCRM-originated booking. internalId is a soft
// pointer (no FK) because it spans patient/appointment/clinic_provider tables
// by entityType, and deleting our row shouldn't erase the sync audit.
export const pmsEntityMap = pgTable(
  'pms_entity_map',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    // 'patient' | 'appointment' | 'provider'
    entityType: text('entity_type').notNull(),
    // PMS primary key as text (Open Dental PatNum / AptNum / ProvNum).
    externalId: text('external_id').notNull(),
    // Our row id (patient.id / appointment.id / clinic_provider.id).
    internalId: text('internal_id').notNull(),
    // 'pms' (imported from the PMS) | 'dreamcrm' (we created it, then pushed).
    origin: text('origin').notNull().default('pms'),
    // Hash of the last-synced profile fields → skip no-op updates on re-sync.
    contentHash: text('content_hash'),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pms_entity_map_external_idx').on(t.organizationId, t.entityType, t.externalId),
    uniqueIndex('pms_entity_map_internal_idx').on(t.organizationId, t.entityType, t.internalId),
    index('pms_entity_map_org_type_idx').on(t.organizationId, t.entityType),
  ],
)
export type PmsEntityMap = typeof pmsEntityMap.$inferSelect
export type NewPmsEntityMap = typeof pmsEntityMap.$inferInsert

// Audit header for each inbound sync job (PMS → DreamCRM).
export const pmsSyncRun = pgTable(
  'pms_sync_run',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    // 'manual' | 'scheduled' | 'initial'
    trigger: text('trigger').notNull().default('manual'),
    // 'running' | 'success' | 'partial' | 'error'
    status: text('status').notNull().default('running'),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    finishedAt: timestamp('finished_at'),
    // { patients: { created, updated, skipped }, appointments: {…}, providers: {…} }
    counts: jsonb('counts').$type<Record<string, { created: number; updated: number; skipped: number }>>().notNull().default({}),
    error: text('error'),
    triggeredByUserId: text('triggered_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [index('pms_sync_run_org_started_idx').on(t.organizationId, t.startedAt)],
)
export type PmsSyncRun = typeof pmsSyncRun.$inferSelect
export type NewPmsSyncRun = typeof pmsSyncRun.$inferInsert

// Outbound write audit + retry queue (DreamCRM → PMS). One row per attempt to
// create/update a record in the PMS via its API. This IS the "every record we
// created in your PMS, all via the API" trust log. Best-effort writes that
// fail (PMS unreachable at booking time) stay 'pending'/'error' and get
// retried by the next sync run.
export const pmsWriteOp = pgTable(
  'pms_write_op',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    // 'patient' | 'appointment'
    entityType: text('entity_type').notNull(),
    // Our row id being pushed.
    internalId: text('internal_id').notNull(),
    // The id the PMS assigned, once confirmed.
    externalId: text('external_id'),
    // 'create' | 'update'
    operation: text('operation').notNull().default('create'),
    // 'pending' | 'success' | 'error'
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    // Full request/response for traceability (PHI-light: ids + scheduling, no
    // clinical data ever leaves to/from these endpoints).
    requestPayload: jsonb('request_payload').$type<Record<string, unknown>>(),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>(),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (t) => [
    index('pms_write_op_org_status_idx').on(t.organizationId, t.status),
    index('pms_write_op_org_created_idx').on(t.organizationId, t.createdAt),
    index('pms_write_op_internal_idx').on(t.organizationId, t.entityType, t.internalId),
  ],
)
export type PmsWriteOp = typeof pmsWriteOp.$inferSelect
export type NewPmsWriteOp = typeof pmsWriteOp.$inferInsert

// One row per online balance payment a patient makes through the portal
// (Settings → Patient portal → "Online payments"). Money moves through the
// clinic's connected Stripe account (direct charge, same as the shop) — the
// PMS still owns the clinical ledger, so the front desk posts these to the
// PMS after they land. DreamCRM records the payment for the patient's
// history and the clinic's reconciliation list; it never mutates
// patient.pmsBalanceCents (the next PMS sync is the truth).
export const patientBalancePayment = pgTable(
  'patient_balance_payment',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    // 'pending' | 'paid' | 'failed'
    status: text('status').notNull().default('pending'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    // What the patient saw at pay time ("Balance as of Jun 3") — audit aid
    // for reconciliation when the PMS balance has since moved.
    balanceCentsAtPayment: integer('balance_cents_at_payment'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    paidAt: timestamp('paid_at'),
  },
  (t) => [
    index('balance_payment_org_status_idx').on(t.organizationId, t.status),
    index('balance_payment_patient_idx').on(t.patientId, t.createdAt),
  ],
)
export type PatientBalancePayment = typeof patientBalancePayment.$inferSelect

// Per-staff-member onboarding state for the clinic dashboard tutorial
// system: the first-run welcome tour, the Getting-started checklist
// dismissal, and per-module hint dismissals. One row per (org, user) —
// progress itself is NOT stored here: the checklist derives done/not-done
// from real org data (a patient exists, a logo is set, ...) so it can
// never lie.
export const staffOnboarding = pgTable(
  'staff_onboarding',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    // First-run welcome modal acknowledged.
    welcomeSeenAt: timestamp('welcome_seen_at'),
    // Getting-started checklist hidden by the user (it also auto-hides when
    // every task is done).
    checklistDismissedAt: timestamp('checklist_dismissed_at'),
    // Ids of per-module hint banners this user has dismissed.
    dismissedHints: jsonb('dismissed_hints').$type<string[]>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('staff_onboarding_org_user_idx').on(t.organizationId, t.userId)],
)
export type StaffOnboarding = typeof staffOnboarding.$inferSelect

// ── Zernio (Google Business + future social) connection ─────────────────────
// Zernio is a unified social / Google Business Profile API (hosted OAuth — we
// never run Google's API-access verification). One Zernio "profile" per clinic
// org; connected accounts (GBP / IG / FB / …) hang off it. The platform
// ZERNIO_API_KEY is a server secret; per-clinic scoping is by zernioProfileId.
// FOUNDATION: connection plumbing + Google Business only. Reviews / hours /
// metrics sync land in later PRs.
export const zernioConnection = pgTable('zernio_connection', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  // The clinic's Zernio profile id (find-or-created on first connect). Null
  // until we've ensured one.
  zernioProfileId: text('zernio_profile_id'),
  // 'disconnected' | 'connected' | 'error'
  status: text('status').notNull().default('disconnected'),
  // Last sync/connect error surfaced to the clinic.
  lastError: text('last_error'),
  // 1 for the demo (Dream Dental) — demo connections NEVER hit the network.
  isDemo: integer('is_demo').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
export type ZernioConnection = typeof zernioConnection.$inferSelect

// One row per connected Zernio account (a clinic's GBP location, or — later —
// an Instagram/Facebook/… account). Keyed by Zernio's internal account id.
export const zernioAccount = pgTable(
  'zernio_account',
  {
    // Zernio's internal account id (`_id` from /accounts).
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Platform slug — 'googlebusiness' for the foundation; others reserved.
    platform: text('platform').notNull(),
    // Zernio's account id again (the id we call the API with — mirrors `id` for
    // now, kept distinct so a future schema where they diverge needs no
    // migration). Part of the uniqueness key.
    accountId: text('account_id').notNull(),
    username: text('username'),
    displayName: text('display_name'),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('zernio_account_org_platform_account_idx').on(t.organizationId, t.platform, t.accountId)],
)
export type ZernioAccountRow = typeof zernioAccount.$inferSelect

// ── Google Business reviews (synced from the clinic's GBP via Zernio) ─────────
// REAL reviews patients left on Google, pulled through the Zernio GBP connection
// (cron + on-demand). Distinct from `review_request` (the first-party "patient
// writes the review inside Dream Create" flow) — these we don't own the text of,
// we just mirror + reply. The synced rating drives the public-site
// `AggregateRating` JSON-LD (sourced ONLY from real Google data, never faked).
// Idempotent upsert is keyed by (organizationId, externalReviewId).
export const googleReview = pgTable(
  'google_review',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Google's stable review id (Zernio's `id`/`reviewId`/`name`).
    externalReviewId: text('external_review_id').notNull(),
    // The Zernio GBP account id the review was pulled from (audit + re-sync key).
    accountId: text('account_id').notNull(),
    reviewerName: text('reviewer_name'),
    reviewerPhotoUrl: text('reviewer_photo_url'),
    // Integer 1–5 (null when Google omitted a rating — rare comment-only state).
    starRating: integer('star_rating'),
    // Google allows rating-only reviews, so the comment is nullable.
    comment: text('comment'),
    reviewCreatedAt: timestamp('review_created_at', { withTimezone: true }),
    reviewUpdatedAt: timestamp('review_updated_at', { withTimezone: true }),
    // The clinic's owner reply (posted from the dashboard), null when none.
    replyComment: text('reply_comment'),
    replyUpdatedAt: timestamp('reply_updated_at', { withTimezone: true }),
    // Best-effort link to a CRM patient by reviewer name — weak/optional, fine to
    // leave null in v1 (a Google reviewer name rarely maps 1:1 to a patient row).
    patientId: text('patient_id').references(() => patient.id, { onDelete: 'set null' }),
    // 1 for the demo (Dream Dental) — demo reviews NEVER hit the network.
    isDemo: integer('is_demo').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('google_review_org_external_idx').on(t.organizationId, t.externalReviewId)],
)
export type GoogleReviewRow = typeof googleReview.$inferSelect

// ── Google Business posts (Phase 2 — GBP posting) ─────────────────────────────
// Updates / Offers / Events the clinic publishes to their Google Business
// Profile through the Zernio connection. We persist a row BEFORE the Zernio call
// so a publish failure is durable (status='failed' + lastError) and the history
// view never depends on a live read. Zernio publishes scheduled posts itself, so
// a 'scheduled' row needs no publish cron on our side — it stays as a record.
// Demo rows (isDemo=1) are seeded as published with synthetic ids + a fake
// googleUrl and NEVER hit the network.
export const gbpPost = pgTable(
  'gbp_post',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // The Zernio GBP account id the post targets (audit + delete key).
    accountId: text('account_id').notNull(),
    // Zernio's post id (`_id`), set on a successful publish/schedule. Null for a
    // draft or a failed create.
    zernioPostId: text('zernio_post_id'),
    // 'standard' (What's new) | 'event' | 'offer'.
    postType: text('post_type').notNull().default('standard'),
    // The post body (≤1500 chars, validated in the service).
    summary: text('summary').notNull(),
    // A public image URL (S3) attached to the post, null when none.
    imageUrl: text('image_url'),
    // Call-to-action button: action type ('LEARN_MORE'|'BOOK'|…) + URL ('CALL'
    // needs no URL). Both null when no CTA.
    ctaType: text('cta_type'),
    ctaUrl: text('cta_url'),
    // EVENT fields (null unless postType='event').
    eventTitle: text('event_title'),
    eventStartAt: timestamp('event_start_at', { withTimezone: true }),
    eventEndAt: timestamp('event_end_at', { withTimezone: true }),
    // OFFER fields (null unless postType='offer').
    offerCouponCode: text('offer_coupon_code'),
    offerRedeemUrl: text('offer_redeem_url'),
    offerTerms: text('offer_terms'),
    // 'draft' | 'scheduled' | 'published' | 'failed'.
    status: text('status').notNull().default('draft'),
    // When set, the post is scheduled (Zernio publishes it at this time).
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    // When the post went live (published-now) — set on a successful publish.
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // The live GBP post permalink when Zernio returns one (often null — Google
    // doesn't always surface a stable URL synchronously).
    googleUrl: text('google_url'),
    // The last publish error surfaced to the clinic (set when status='failed').
    lastError: text('last_error'),
    // 1 for the demo (Dream Dental) — demo posts NEVER hit the network.
    isDemo: integer('is_demo').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('gbp_post_org_created_idx').on(t.organizationId, t.createdAt)],
)
export type GbpPostRow = typeof gbpPost.$inferSelect
