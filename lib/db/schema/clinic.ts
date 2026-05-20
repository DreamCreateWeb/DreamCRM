import { pgTable, text, timestamp, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'
import { clinicLocation } from './platform'

// Core patient record for a clinic tenant.
// Scoped to organizationId so each clinic only sees their own patients.
export const patient = pgTable('patient', {
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

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const appointment = pgTable('appointment', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  patientId: text('patient_id').notNull().references(() => patient.id, { onDelete: 'cascade' }),
  // Which location the appointment is at (optional — not all clinics use locations)
  locationId: text('location_id').references(() => clinicLocation.id, { onDelete: 'set null' }),

  title: text('title').notNull(),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),

  // 'checkup' | 'cleaning' | 'filling' | 'extraction' | 'root_canal' | 'consultation' | 'other'
  type: text('type').notNull().default('checkup'),
  // 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  status: text('status').notNull().default('scheduled'),

  notes: text('notes'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

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

export type Patient = typeof patient.$inferSelect
export type NewPatient = typeof patient.$inferInsert
export type Appointment = typeof appointment.$inferSelect
export type NewAppointment = typeof appointment.$inferInsert
export type FormTemplate = typeof formTemplate.$inferSelect
export type NewFormTemplate = typeof formTemplate.$inferInsert
export type FormSubmission = typeof formSubmission.$inferSelect
export type NewFormSubmission = typeof formSubmission.$inferInsert
