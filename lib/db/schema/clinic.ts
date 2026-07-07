import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, integer, boolean, jsonb, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core'
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

    // Refer-a-friend attribution: the existing patient whose share link this
    // patient arrived through (soft self-FK, same rationale as guardian).
    // Set once at first booking/request; never overwritten.
    referredByPatientId: text('referred_by_patient_id'),

    // Tombstone: when this record was merged INTO another, points at the
    // survivor. Set + the row archived by the merge tool; excluded from the
    // patient list. Null for every live patient. Soft self-FK (no .references).
    mergedIntoPatientId: text('merged_into_patient_id'),

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

    // Preferred language for patient-facing communication ('en' | 'es';
    // null = English). Set in the Edit modal, or stamped automatically when
    // the patient fills their intake in Spanish. Drives the composer's
    // one-tap translate + the "prefers Spanish" chip.
    preferredLanguage: text('preferred_language'),

    // Demo-org seeded persona marker (1 = one of the 15 deterministic
    // personas). The persona-anchoring convention keyed off @example.com
    // emails; this column makes it explicit so anchoring survives an email
    // edit. Written by the seeder; always 0 outside the demo org.
    isDemoPersona: integer('is_demo_persona').notNull().default(0),

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
    // New-patient counts (Overview MTD trend) + recent-activity ordering.
    index('patient_org_created_idx').on(t.organizationId, t.createdAt),
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

// Files attached to a patient (referral letters, x-ray/photo exports, signed
// PDFs, insurance cards). Stored in S3; the row keeps the public URL + metadata.
// CRM-side document storage, NOT the clinical imaging system. Soft-deleted so a
// removed file's audit trail survives (the S3 object is left in place).
export const patientDocument = pgTable(
  'patient_document',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    // Original filename (display only) + the stored S3 URL.
    fileName: text('file_name').notNull(),
    fileUrl: text('file_url').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    // Optional staff-set label/category ("Insurance card", "Referral letter").
    label: text('label'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('patient_document_patient_created_idx').on(t.patientId, t.createdAt)],
)

// Staff follow-up tasks attached to a patient ("call about treatment plan",
// "rebook after no-show"). The dental-research pattern is patient-attached
// followups, not a generic kanban — these surface on the Overview morning
// huddle, the patient detail, and a dedicated /followups cockpit list. A
// follow-up can be assigned to a teammate (or left for anyone) and carries an
// optional due date (date-only, clinic-local, so "due today" is a calendar
// concept free of timezone drift).
export const patientFollowup = pgTable(
  'patient_followup',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // 'YYYY-MM-DD' date-only (clinic-local). Null = no due date ("someday").
    dueDate: text('due_date'),
    // Who's responsible. Null = unassigned (anyone on the team can pick it up).
    assignedUserId: text('assigned_user_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('open'), // 'open' | 'done'
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at'),
    completedBy: text('completed_by').references(() => user.id, { onDelete: 'set null' }),
    // Soft pointer to the appointment that spawned this (e.g. auto-created on a
    // no-show). No FK so deleting the appointment doesn't cascade the task.
    sourceAppointmentId: text('source_appointment_id'),
    // Deterministic idempotency key for rule-created follow-ups
    // (e.g. 'balance:<patientId>', 'recall:<patientId>:<YYYY-MM>'). Null for
    // manual + no-show follow-ups. The smart-rules engine skips creating a
    // follow-up whose ruleKey already exists for the org.
    ruleKey: text('rule_key'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('patient_followup_org_status_due_idx').on(t.organizationId, t.status, t.dueDate),
    index('patient_followup_patient_status_idx').on(t.patientId, t.status),
  ],
)

// Saved list views — a named filter+search combo a clinic re-opens in one
// click ("VIP with a balance", "My unconfirmed this week"). Org-scoped +
// shared across the team. Despite the `patient_view` table name (kept to avoid
// a rename migration), this is the GENERIC saved-views store for every list
// surface, discriminated by `surface` ('patients' | 'appointments' | 'leads').
// `filters` is the surface's own serialized filter subset; the patients shape
// can additionally be promoted into a marketing audience. The unique index is
// per (org, surface, name) so the same name can exist on more than one list.
export const patientView = pgTable(
  'patient_view',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    surface: text('surface').notNull().default('patients'),
    name: text('name').notNull(),
    filters: jsonb('filters').notNull().default(sql`'{}'::jsonb`),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('patient_view_org_surface_name_idx').on(t.organizationId, t.surface, sql`lower(${t.name})`),
  ],
)

// Org-scoped tag catalog — reusable labels a clinic puts on patients
// ("VIP", "Anxious", "Needs follow-up", "Pediatric"). CRM-side organization,
// NOT clinical coding. `color` is one of a fixed tone palette
// (lib/types/patient-tags.ts) so chips stay on-brand. Unique per org by
// case-insensitive name so "VIP" and "vip" can't both exist.
export const patientTag = pgTable(
  'patient_tag',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('gray'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('patient_tag_org_name_idx').on(t.organizationId, sql`lower(${t.name})`),
  ],
)

// Many-to-many link between a patient and a tag. Composite PK (patientId, tagId)
// makes a duplicate assignment impossible (idempotent assign via
// onConflictDoNothing). organizationId is denormalized for fast scoped scans +
// a defense-in-depth scope check; both FKs cascade so deleting a tag or a
// patient cleans up its links.
export const patientTagAssignment = pgTable(
  'patient_tag_assignment',
  {
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    tagId: text('tag_id').notNull().references(() => patientTag.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => user.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.patientId, t.tagId] }),
    index('patient_tag_assignment_tag_idx').on(t.tagId),
    index('patient_tag_assignment_org_idx').on(t.organizationId),
  ],
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
  // In-office flow (the lean arrival board): front desk marks the patient
  // arrived, then seated. Timestamps, not a status enum — the visit's real
  // status field stays the lifecycle truth; these are same-day operational
  // breadcrumbs shown on today's agenda + My Day.
  arrivedAt: timestamp('arrived_at'),
  seatedAt: timestamp('seated_at'),
  // How the confirmation came in: 'sms' | 'email' | 'manual' | 'auto_sms_keyword' | 'portal'
  confirmedVia: text('confirmed_via'),
  // Token-IS-auth for the public one-click confirm landing (/c/[token]) linked
  // from reminder emails — same pattern as /r and /w. Minted lazily at the
  // first reminder send; reused across the journey's touches.
  confirmToken: text('confirm_token'),
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
  // Bookings-today count (Overview trend) + recent-activity ordering.
  index('appointment_org_created_idx').on(t.organizationId, t.createdAt),
  // Public confirm-landing lookup (token IS the auth).
  uniqueIndex('appointment_confirm_token_idx').on(t.confirmToken),
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

// ── Fast-pass waitlist (ASAP list) ─────────────────────────────────────────
// Patients who want an EARLIER opening. When a cancellation frees a slot,
// matching entries are offered the slot (email now; SMS-ready) — first
// one-click claim wins, the slot books through the same race-guarded insert
// the public widget uses, and the claimer's old visit (if linked) is
// released and re-offered. The mechanic every orbital-layer competitor
// leads with (NexHealth Waitlist, Lighthouse Fill-in, Weave Quick-Fill).
export const appointmentWaitlist = pgTable('appointment_waitlist', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
  // The future visit they'd move up FROM (null = no visit yet, wants any
  // opening). Offers only fire for slots EARLIER than this visit.
  appointmentId: text('appointment_id').references(() => appointment.id, { onDelete: 'set null' }),
  // Visit type they want (appointment.type values). Null = any type.
  visitType: text('visit_type'),
  // Preferred provider. Null = anyone.
  providerId: text('provider_id').references(() => clinicProvider.id, { onDelete: 'set null' }),
  // 'active' | 'fulfilled' | 'removed'
  status: text('status').notNull().default('active'),
  // Who added it: 'staff' | 'portal'
  source: text('source').notNull().default('staff'),
  fulfilledAt: timestamp('fulfilled_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('appt_waitlist_org_status_idx').on(t.organizationId, t.status),
  index('appt_waitlist_patient_idx').on(t.patientId),
])

// One row per offer sent for a freed slot. The token IS the auth for the
// public one-click claim page (/w/[token]) — same pattern as the review
// landing. Sibling offers for the same slot flip to 'lost' when one claims.
export const appointmentWaitlistOffer = pgTable('appointment_waitlist_offer', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  waitlistId: text('waitlist_id').notNull().references(() => appointmentWaitlist.id, { onDelete: 'cascade' }),
  patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
  // The freed slot being offered.
  slotStart: timestamp('slot_start').notNull(),
  slotEnd: timestamp('slot_end'),
  providerId: text('provider_id').references(() => clinicProvider.id, { onDelete: 'set null' }),
  visitType: text('visit_type').notNull(),
  // The cancelled appointment that freed the slot (soft pointer, audit).
  freedByAppointmentId: text('freed_by_appointment_id'),
  token: text('token').notNull(),
  // 'pending' | 'claimed' | 'lost' | 'expired'
  status: text('status').notNull().default('pending'),
  sentAt: timestamp('sent_at'),
  claimedAt: timestamp('claimed_at'),
  // The appointment created by a successful claim.
  claimedAppointmentId: text('claimed_appointment_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('appt_waitlist_offer_token_idx').on(t.token),
  index('appt_waitlist_offer_org_status_idx').on(t.organizationId, t.status),
  index('appt_waitlist_offer_waitlist_idx').on(t.waitlistId),
  // Sibling lookup: all pending offers for the same freed slot.
  index('appt_waitlist_offer_freedby_idx').on(t.freedByAppointmentId),
])

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
    // Smart auto-send audience: 'all' | 'new' | 'returning'. Decides which form
    // rides a booking confirmation for a given patient (new patients get the
    // full intake; returning patients a short update). Default 'all'.
    autoSendAudience: text('auto_send_audience').notNull().default('all'),
    // Cached per-locale translations of the form's display strings, keyed by
    // locale → a parallel FormTemplateSchema (same field ids, translated
    // labels/help/options/body/section titles). { es?: FormTemplateSchema }.
    translations: jsonb('translations'),
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
  // AI pre-visit summary (generated on demand, cached): a one-line summary + a
  // list of medical alerts (allergies / meds / conditions / anxiety) for the
  // provider. jsonb so the shape can grow; null until generated.
  aiSummary: jsonb('ai_summary'),
  aiSummaryAt: timestamp('ai_summary_at'),
}, (t) => [
  // Postgres does NOT auto-index FK columns, and this is the module's
  // highest-volume table (one row per form fill, forever). These two composites
  // cover every hot read: the per-template stats GROUP BY + the form-edit
  // submissions list + return-visit prefill (org, template, recent-first), and
  // the every-30-min forms-reminder cron's per-patient "already submitted?"
  // check + the patient timeline (org, patient).
  index('form_submission_org_template_idx').on(t.organizationId, t.formTemplateId, t.submittedAt),
  index('form_submission_org_patient_idx').on(t.organizationId, t.patientId),
])

// A named bundle of intake forms a patient completes in one sitting (e.g. a
// "New Patient Packet" = intake + financial policy + consent). The public
// packet flow walks them through each form in `formIds` order; each form still
// submits independently (its own form_submission), so there are no field-id
// collisions across forms.
export const formPacket = pgTable(
  'form_packet',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    // Ordered array of form_template ids.
    formIds: jsonb('form_ids').notNull(),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('form_packet_org_slug_idx').on(t.organizationId, t.slug)],
)

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
    // Staff "flag for priority" toggle — surfaces a Starred filter + a star
    // marker on the row. Independent of status/unread.
    starred: boolean('starred').notNull().default(false),
    // AI urgency triage on the LATEST inbound message: 'urgent' when it reads
    // like same-day clinical need (pain, swelling, bleeding, trauma) — the
    // list pins urgent threads first + shows the reason. Cleared to null when
    // staff reply (handled) or the classifier reads it as routine. Always
    // best-effort: classification never blocks recording the message.
    urgency: text('urgency'),
    urgencyReason: text('urgency_reason'),
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

// Scheduled (send-later) patient messages. A staff member can compose a reply
// now and have it delivered at a future time (e.g. draft an after-hours answer
// to go out when the office opens). Kept in its OWN table — not patient_message
// — so an unsent message never pollutes the thread read path. A cron flushes
// due 'pending' rows by calling sendMessageToPatient (atomic claim → no
// double-send). Cancelable from the composer until it fires.
export const scheduledMessage = pgTable(
  'scheduled_message',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(), // 'in_app' | 'email'
    body: text('body').notNull().default(''),
    attachments: jsonb('attachments').notNull().default([]),
    scheduledFor: timestamp('scheduled_for').notNull(),
    // 'pending' → 'sent' | 'canceled' | 'failed'
    status: text('status').notNull().default('pending'),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    // The patient_message row id once delivered (audit back-ref).
    sentMessageId: text('sent_message_id'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // Cron flush: pending rows whose time has come.
    index('scheduled_message_status_due_idx').on(t.status, t.scheduledFor),
    // Thread view: a patient's pending scheduled sends.
    index('scheduled_message_org_patient_idx').on(t.organizationId, t.patientId),
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
  // Auto-trigger: when an appointment.status flips to 'completed', a review
  // request is sent. ON by default (the whole module is built around this
  // loop). When autoSendDelayHours === 0 the request fires immediately from
  // markCompleted(); a positive delay defers it to the hourly cron. Clinics
  // can turn this off in the reviews config.
  autoSendEnabled: integer('auto_send_enabled').notNull().default(1),
  autoSendDelayHours: integer('auto_send_delay_hours').notNull().default(0),
  // Minimum star rating a synced Google review needs to auto-feature on the
  // public site. Default 4 (feature 4★ + 5★); clinics can raise it to 5 for
  // "5★ only". Reviews below this, rating-only reviews, and individually
  // hidden reviews never appear on the site.
  featureMinStars: integer('feature_min_stars').notNull().default(4),
  // Whether the /r/<token> landing shows the optional "rather tell us
  // privately?" path (routes feedback to staff, never public). Shown to
  // EVERY patient equally when on (FTC-clean — not rating gating). Default on.
  showPrivateFeedback: integer('show_private_feedback').notNull().default(1),
  // Optional "How was your visit?" star ask BEFORE the platform links.
  // FTC-clean by construction: every rating sees the SAME public platform
  // links — a low rating merely LEADS with the private-feedback form (the
  // public path stays one tap away, never hidden). Off by default.
  starGateEnabled: integer('star_gate_enabled').notNull().default(0),
  // Where private feedback lands. Falls back to clinicProfile.email when unset.
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
  // Platform fee (basis points) taken via Connect application fee on EVERY
  // money path through the clinic's account — shop, balance payments, booking
  // deposits, payment-plan installments, memberships. Default 100 (1%),
  // decided 2026-07-02; per-org override for negotiated deals. The demo org
  // never charges, so its value is moot.
  platformFeeBps: integer('platform_fee_bps').notNull().default(100),
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
    // Cascade so deleting a clinic (org → membership_plan) doesn't get blocked
    // by a member still referencing the plan — the whole org-delete cascade was
    // aborting on a 'restrict' here, leaving the org row + its slug stranded.
    // Accidental single-plan deletion is already guarded at the app level
    // (membership.ts deletePlan archives a plan that has members instead of
    // deleting it), so this is a safe backstop.
    planId: text('plan_id').notNull().references(() => membershipPlan.id, { onDelete: 'cascade' }),
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

// Early-access demand capture for the roadmap PMSs (Dentrix Ascend/desktop,
// Eaglesoft, Curve). A clinic on one of those clicks "Notify me when this is
// ready" on the integrations catalog; we record who wants which PMS so the
// founder can prioritize the vendor partnerships that unblock the most
// practices — and email each clinic the day their PMS goes live. One row per
// (org, provider); re-requesting is idempotent.
export const pmsInterest = pgTable(
  'pms_interest',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // The roadmap provider id — matches the PmsProviderId vocabulary.
    provider: text('provider').notNull(),
    requestedByUserId: text('requested_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    // The email we'll notify — snapshot at request time (the requester may
    // leave the practice before the PMS ships).
    notifyEmail: text('notify_email'),
    // Set once the founder has emailed this clinic that their PMS is live, so
    // the notify sweep never double-pings.
    notifiedAt: timestamp('notified_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pms_interest_org_provider_uq').on(t.organizationId, t.provider)],
)
export type PmsInterest = typeof pmsInterest.$inferSelect
export type NewPmsInterest = typeof pmsInterest.$inferInsert

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

// One share link per patient for refer-a-friend: /site/{slug}/book?ref={token}.
// The token IS the attribution — a new patient booking through it gets
// referred_by_patient_id stamped. Minted lazily from the portal's share card.
export const patientReferralLink = pgTable(
  'patient_referral_link',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('patient_referral_link_token_idx').on(t.token),
    uniqueIndex('patient_referral_link_patient_idx').on(t.organizationId, t.patientId),
  ],
)
export type PatientReferralLink = typeof patientReferralLink.$inferSelect

// One row per "email-to-pay" pay-link sent to a patient (staff-clicked or the
// opt-in automated balance-reminder cadence). The token IS the auth for the
// public /b/[token] pay landing — same pattern as /r, /w, /c. The landing
// always shows the LIVE pmsBalanceCents (the snapshot here is an audit aid);
// an actual payment rides the existing patient_balance_payment rails.
export const balancePaymentRequest = pgTable(
  'balance_payment_request',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    // Balance shown in the email at send time (audit aid — the landing reads live).
    balanceCentsAtSend: integer('balance_cents_at_send'),
    // 'sent' | 'paid'
    status: text('status').notNull().default('sent'),
    // 'staff' | 'auto' (the cadence)
    source: text('source').notNull().default('staff'),
    sentByUserId: text('sent_by_user_id'),
    // The patient_balance_payment this request produced (soft pointer).
    paymentId: text('payment_id'),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('balance_pay_request_token_idx').on(t.token),
    index('balance_pay_request_org_idx').on(t.organizationId, t.sentAt),
    index('balance_pay_request_patient_idx').on(t.patientId, t.sentAt),
  ],
)
export type BalancePaymentRequest = typeof balancePaymentRequest.$inferSelect

// Loyalty ledger (DI's points program, with the redemption moat no vendor
// can match: points spend in OUR shop). One row per earn/redeem/adjust;
// balance = sum(points). Earning is a daily idempotent sweep (unique
// (org, kind, source_id) — a visit/referral/payment earns exactly once);
// redemption mints a single-use patient-bound shop coupon. Opt-in per clinic
// (clinic_profile.loyalty jsonb, default OFF).
export const loyaltyEvent = pgTable(
  'loyalty_event',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    // 'visit' | 'referral' | 'payment' | 'redeem' | 'adjust'
    kind: text('kind').notNull(),
    // Positive = earned; negative = redeemed/adjusted away.
    points: integer('points').notNull(),
    // Idempotency anchor: the appointment/referred-patient/payment id that
    // earned the points ('adjust'/'redeem' rows use their own event id).
    sourceId: text('source_id').notNull(),
    note: text('note'),
    createdByUserId: text('created_by_user_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('loyalty_event_source_idx').on(t.organizationId, t.kind, t.sourceId),
    index('loyalty_event_patient_idx').on(t.patientId, t.createdAt),
    index('loyalty_event_org_idx').on(t.organizationId, t.createdAt),
  ],
)
export type LoyaltyEvent = typeof loyaltyEvent.$inferSelect

// Post-visit NPS survey responses ("How likely are you to recommend us?",
// 0–10 + an optional comment). One row per SENT survey; score null until the
// patient answers at the public /n/[token] landing (token IS the auth — the
// /r /w /c /b /i pattern). Sends are opt-in (clinic_review_config.nps_enabled,
// default OFF), ride the daily retention cron 3 days after a completed visit,
// and are throttled per patient so surveys never read as spam. Detractor
// scores (0–6) escalate to staff the same way 1–2★ review feedback does.
export const npsResponse = pgTable(
  'nps_response',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    appointmentId: text('appointment_id'),
    token: text('token').notNull(),
    // 0–10; null = sent but not yet answered.
    score: integer('score'),
    comment: text('comment'),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('nps_response_token_idx').on(t.token),
    index('nps_response_org_idx').on(t.organizationId, t.sentAt),
    index('nps_response_patient_idx').on(t.patientId, t.sentAt),
  ],
)
export type NpsResponse = typeof npsResponse.$inferSelect

// Payment plans: a balance split into N monthly installments auto-charged to
// a card on file. Staff PROPOSE (amount + months) → the patient ACCEPTS at
// the public /i/[token] page (token IS the auth, /b's sibling) via a Stripe
// Checkout SETUP session on the clinic's connected account (saves the card,
// charges nothing) → the first installment charges off-session on accept,
// the rest via the daily cron. Every successful charge records a normal
// patient_balance_payment row (source of truth for reconciliation — the PMS
// ledger still rules; we never touch pms_balance_cents). Card declines mark
// the plan past_due and retry every 3 days up to 3 attempts before parking
// it for staff follow-up.
export const paymentPlan = pgTable(
  'payment_plan',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    totalCents: integer('total_cents').notNull(),
    // Per-installment amount; the LAST installment takes the remainder so the
    // sum always equals totalCents exactly.
    installmentCents: integer('installment_cents').notNull(),
    installments: integer('installments').notNull(),
    installmentsPaid: integer('installments_paid').notNull().default(0),
    // 'proposed' | 'active' | 'past_due' | 'completed' | 'canceled'
    status: text('status').notNull().default('proposed'),
    // All three live on the clinic's CONNECTED account, not the platform.
    stripeCustomerId: text('stripe_customer_id'),
    stripePaymentMethodId: text('stripe_payment_method_id'),
    stripeSetupSessionId: text('stripe_setup_session_id'),
    nextChargeAt: timestamp('next_charge_at'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lastError: text('last_error'),
    proposedByUserId: text('proposed_by_user_id'),
    acceptedAt: timestamp('accepted_at'),
    completedAt: timestamp('completed_at'),
    canceledAt: timestamp('canceled_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_plan_token_idx').on(t.token),
    index('payment_plan_org_status_idx').on(t.organizationId, t.status),
    index('payment_plan_patient_idx').on(t.patientId, t.createdAt),
    // The cron's scan: due active/past_due plans across all orgs.
    index('payment_plan_due_idx').on(t.status, t.nextChargeAt),
  ],
)
export type PaymentPlan = typeof paymentPlan.$inferSelect

// One row per booking deposit collected at PUBLIC online booking (per-visit-
// type `depositCents` in clinic_profile.visit_type_settings; off by default).
// Money moves through the clinic's connected Stripe account (direct charge,
// same rails as balance payments) and is credited toward the visit — the
// front desk posts it to the PMS ledger from the reconciliation list, we
// never mutate the PMS balance. The appointment books FIRST (deposit-free
// fail-open); a paid deposit auto-confirms it.
export const bookingDeposit = pgTable(
  'booking_deposit',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
    // The visit the deposit reserves. set null so deleting an appointment
    // never erases a money record.
    appointmentId: text('appointment_id').references(() => appointment.id, { onDelete: 'set null' }),
    visitType: text('visit_type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    // 'pending' | 'paid' | 'failed'
    status: text('status').notNull().default('pending'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    paidAt: timestamp('paid_at'),
  },
  (t) => [
    index('booking_deposit_org_status_idx').on(t.organizationId, t.status),
    index('booking_deposit_appt_idx').on(t.appointmentId),
    index('booking_deposit_session_idx').on(t.stripeCheckoutSessionId),
  ],
)
export type BookingDeposit = typeof bookingDeposit.$inferSelect

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

// Per-staff-member notification preferences (org+user scoped). Today just the
// morning-digest opt-out: the clinic enables the digest org-wide
// (clinic_profile.daily_digest_enabled), but an individual can mute their own
// email here without turning it off for the team. A missing row = default
// (opted IN, i.e. they get the digest when the clinic has it on).
export const staffNotificationPref = pgTable(
  'staff_notification_pref',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    // 1 = this user has muted their own morning digest email.
    dailyDigestOptOut: integer('daily_digest_opt_out').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('staff_notification_pref_org_user_idx').on(t.organizationId, t.userId)],
)

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
  // Multi-location Google accounts: the zernio_account id the clinic chose
  // as THEIR location (reviews/metrics/posting all resolve through it).
  // Null = single-location default (the stably-ordered first account).
  preferredGbpAccountId: text('preferred_gbp_account_id'),
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

// ── Platform reviews (synced from the clinic's GBP + Facebook via Zernio) ──────
// REAL reviews/recommendations patients left on Google Business or Facebook,
// pulled through the Zernio connection (cron + on-demand). Distinct from
// `review_request` (the first-party "patient writes the review inside Dream
// Create" flow) — these we don't own the text of, we just mirror (and reply,
// where the platform's API allows). The synced Google rating drives the
// public-site `AggregateRating` JSON-LD (sourced ONLY from real Google data,
// never faked — Facebook is deliberately excluded from the rich-snippet rating).
//
// Generalizes the Phase-1 `google_review` table (renamed → `platform_review` in
// migration 0069: a `platform` column was added defaulting 'googlebusiness', and
// every existing Google row was migrated). Facebook uses a recommend / don't-
// recommend model rather than 1–5 stars, so `starRating` is null for FB rows and
// `recommendationType` carries 'recommended' | 'not_recommended' (null for GBP).
// Idempotent upsert is keyed by (organizationId, platform, externalReviewId).
export const platformReview = pgTable(
  'platform_review',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // The platform this review came from: 'googlebusiness' | 'facebook'.
    platform: text('platform').notNull().default('googlebusiness'),
    // The platform's stable review id (Zernio's `id`/`reviewId`/`name`).
    externalReviewId: text('external_review_id').notNull(),
    // The Zernio account id the review was pulled from (audit + re-sync key).
    accountId: text('account_id').notNull(),
    reviewerName: text('reviewer_name'),
    reviewerPhotoUrl: text('reviewer_photo_url'),
    // Integer 1–5 (null when the platform omitted a rating — Google's rare
    // comment-only state, OR a Facebook recommendation which has no star value).
    starRating: integer('star_rating'),
    // Facebook recommendation: 'recommended' | 'not_recommended'. Null for GBP
    // (which uses starRating instead).
    recommendationType: text('recommendation_type'),
    // The platform allows rating-only / comment-only reviews, so this is nullable.
    comment: text('comment'),
    reviewCreatedAt: timestamp('review_created_at', { withTimezone: true }),
    reviewUpdatedAt: timestamp('review_updated_at', { withTimezone: true }),
    // The clinic's owner reply (posted from the dashboard), null when none. Only
    // GBP supports replies via Zernio today; FB rows stay null (read-only).
    replyComment: text('reply_comment'),
    replyUpdatedAt: timestamp('reply_updated_at', { withTimezone: true }),
    // Best-effort link to a CRM patient by reviewer name — weak/optional, fine to
    // leave null in v1 (a reviewer name rarely maps 1:1 to a patient row).
    patientId: text('patient_id').references(() => patient.id, { onDelete: 'set null' }),
    // Staff toggled this review OFF the public site. Qualifying reviews (star
    // rating >= featureMinStars, with a comment) auto-feature UNLESS hidden here.
    hiddenFromSite: integer('hidden_from_site').notNull().default(0),
    // 1 for the demo (Dream Dental) — demo reviews NEVER hit the network.
    isDemo: integer('is_demo').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('platform_review_org_platform_external_idx').on(
      t.organizationId,
      t.platform,
      t.externalReviewId,
    ),
  ],
)
export type PlatformReviewRow = typeof platformReview.$inferSelect

// Back-compat aliases — the original Google-only names. Kept so existing imports
// (`schema.googleReview`, `GoogleReviewRow`) keep resolving against the
// generalized table without a wide rename. New code should prefer the
// `platformReview` / `PlatformReviewRow` names.
export const googleReview = platformReview
export type GoogleReviewRow = PlatformReviewRow

// ── Social posts (Phase 3 — unified multi-platform composer) ──────────────────
// One composed post (text + optional image + optional schedule) fanned out to
// one or MORE connected channels (Google Business + Instagram / Facebook /
// TikTok / YouTube / LinkedIn) through the Zernio connection. Generalizes the
// Phase-2 `gbp_post` table (renamed → `social_post` in migration 0068): a
// GBP-only post is now just a 1-target social post.
//
// The PARENT row (`social_post`) holds the shared composed content. The CHILD
// rows (`social_post_target`) hold the per-channel publish outcome — so one
// channel can fail while another succeeds (per-target status isolation).
//
// Discipline carried over from Phase 2: we persist the parent + targets BEFORE
// the Zernio call, so a publish failure is durable (target status='failed' +
// lastError) and the history/calendar never depend on a live read. Zernio
// publishes scheduled posts itself, so a 'scheduled' row needs no publish cron.
// Demo rows (isDemo=1) seed as published with synthetic ids + a fake permalink
// and NEVER hit the network.
//
// The GBP-specific fields (postType / event* / offer*) live on the parent and
// only apply when Google Business is one of the targets — they're ignored for a
// social-only post.
export const socialPost = pgTable(
  'social_post',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // 'standard' (What's new) | 'event' | 'offer'. Only meaningful for the GBP
    // target; social channels ignore it. Default 'standard' covers a plain post.
    postType: text('post_type').notNull().default('standard'),
    // The post body (≤1500 chars, validated in the service).
    summary: text('summary').notNull(),
    // A public image URL (S3) attached to the post, null when none.
    imageUrl: text('image_url'),
    // Call-to-action button (GBP only): action type ('LEARN_MORE'|'BOOK'|…) +
    // URL ('CALL' needs no URL). Both null when no CTA.
    ctaType: text('cta_type'),
    ctaUrl: text('cta_url'),
    // EVENT fields (GBP only; null unless postType='event').
    eventTitle: text('event_title'),
    eventStartAt: timestamp('event_start_at', { withTimezone: true }),
    eventEndAt: timestamp('event_end_at', { withTimezone: true }),
    // OFFER fields (GBP only; null unless postType='offer').
    offerCouponCode: text('offer_coupon_code'),
    offerRedeemUrl: text('offer_redeem_url'),
    offerTerms: text('offer_terms'),
    // Parent-level status ROLLUP across the targets (for list ordering/filtering):
    // 'failed' if any target failed, else 'scheduled' if scheduled, else
    // 'published' once any target went live, else 'draft'. The authoritative
    // per-channel state lives on the child rows.
    status: text('status').notNull().default('draft'),
    // When set, the post is scheduled (Zernio publishes it at this time).
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    // When the post went live (published-now) — set on a successful publish.
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // 1 for the demo (Dream Dental) — demo posts NEVER hit the network.
    isDemo: integer('is_demo').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('social_post_org_created_idx').on(t.organizationId, t.createdAt)],
)
export type SocialPostRow = typeof socialPost.$inferSelect

// Per-channel publish outcome for a `social_post`. One row per targeted channel.
// Persisted up-front (status='draft' for a real post, 'published'/'scheduled'
// for a demo) then updated with the Zernio post id + permalink on success, or
// status='failed' + lastError on failure — so a single failing channel never
// blocks the others.
export const socialPostTarget = pgTable(
  'social_post_target',
  {
    id: text('id').primaryKey(),
    socialPostId: text('social_post_id')
      .notNull()
      .references(() => socialPost.id, { onDelete: 'cascade' }),
    // Denormalized org id so target reads scope without a parent join.
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // The platform slug ('googlebusiness'|'instagram'|'facebook'|…).
    platform: text('platform').notNull(),
    // The Zernio account id this target publishes to (audit + delete key).
    accountId: text('account_id').notNull(),
    // Zernio's post id (`_id`), set on a successful publish/schedule. Null for a
    // draft or a failed create.
    zernioPostId: text('zernio_post_id'),
    // 'draft' | 'scheduled' | 'published' | 'failed'.
    status: text('status').notNull().default('draft'),
    // The live post permalink when Zernio returns one (often null — Google + the
    // socials don't always surface a stable URL synchronously).
    googleUrl: text('google_url'),
    // The last publish error surfaced to the clinic (set when status='failed').
    lastError: text('last_error'),
    // When this channel went live — set on a successful publish.
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('social_post_target_post_idx').on(t.socialPostId),
    index('social_post_target_org_idx').on(t.organizationId),
  ],
)
export type SocialPostTargetRow = typeof socialPostTarget.$inferSelect
