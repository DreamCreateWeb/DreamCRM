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
