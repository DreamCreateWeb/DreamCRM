import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { user, organization } from './auth'
import { patient, appointment } from './clinic'

/**
 * Domain (CRM-style) tables that the Mosaic-template pages render. Every
 * tenant-scoped record carries `organization_id` so the same UI can serve
 * either the platform org (Dream Create) or a clinic org (each customer
 * clinic), with rows naturally segregated by `organization_id`.
 *
 * Tables that are intentionally platform-wide community (forum threads, feed
 * posts, meetups, jobs, campaigns) do NOT carry `organization_id`; the app
 * only renders them when the active org is the platform org.
 */

// ---------- Customers (CRM lead-style, not patients) ----------
// On the platform org this can be "prospects / external contacts". On a clinic
// org, prefer the `patient` table (in lib/db/schema/clinic.ts) for clinical
// records. The customers table is kept for non-clinical CRM use.
//
// Marketing-pipeline columns (`pipelineStage`, `leadSource`, `lifecycleStage`,
// `lastActivityAt`, `optedOut`, `notes`) extend this table into the lead
// pipeline used by the Marketing module. Pipeline stages are strings rather
// than an enum so platform and clinic tenants can use different stage sets
// without a schema migration.
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  // Once a customer is matched to a clinic-side `patient` row (by email, by
  // booking, by invite, …) we set this so cross-module joins (invoices →
  // patient, marketing campaigns → patient) don't have to fall back to
  // brittle email matching. Nullable so non-clinical CRM use still works.
  patientId: text('patient_id').references(() => patient.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  location: text('location'),
  imageUrl: text('image_url'),
  fav: boolean('fav').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  pipelineStage: text('pipeline_stage').notNull().default('new'),
  leadSource: text('lead_source'),
  lifecycleStage: text('lifecycle_stage').notNull().default('lead'),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
  optedOut: boolean('opted_out').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Products / Orders / Invoices (multi-tenant ecom) ----------
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  priceCents: integer('price_cents').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  imageUrl: text('image_url'),
  stock: integer('stock').notNull().default(0),
  category: text('category'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
])

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  orderNumber: text('order_number').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  status: orderStatusEnum('status').notNull().default('pending'),
  totalCents: integer('total_cents').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  location: text('location'),
  items: jsonb('items').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'pending',
  'paid',
  'overdue',
  'cancelled',
])

export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  invoiceNumber: text('invoice_number').notNull().unique(),
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  status: invoiceStatusEnum('status').notNull().default('draft'),
  totalCents: integer('total_cents').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  issueDate: date('issue_date').notNull().defaultNow(),
  dueDate: date('due_date'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cartItems = pgTable(
  'cart_items',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
    productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })]
)

// ---------- Tasks (kanban / list) ----------
export const taskStatusEnum = pgEnum('task_status', [
  'todo',
  'in_progress',
  'completed',
  'note',
])

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('todo'),
  priority: text('priority').notNull().default('medium'),
  position: integer('position').notNull().default(0),
  dueDate: timestamp('due_date', { withTimezone: true }),
  assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  attachments: integer('attachments').notNull().default(0),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const subtasks = pgTable('subtasks', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: boolean('done').notNull().default(false),
  position: integer('position').notNull().default(0),
})

// ---------- Calendar (generic events; clinic appointments live in clinic.ts) ----------
export const calendarEvents = pgTable('calendar_events', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  allDay: boolean('all_day').notNull().default(false),
  category: text('category').notNull().default('default'),
  // Optional RFC-5545 RRULE string for recurring events. Rendered by the
  // FullCalendar rrule plugin; null = single occurrence. Example:
  //   "FREQ=WEEKLY;BYDAY=MO,WE,FR"
  recurrenceRule: text('recurrence_rule'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Campaigns (tenant-scoped email marketing) ----------
// Extended from a tracker into a real send-and-measure tool. `subject`,
// `previewText`, `bodyHtml`, `bodyJson`, `audienceId`, `sendChannel`,
// `sentAt`, `scheduledAt`, `sendStats` drive the campaign editor and analytics.
// `sendChannel='resend'` blasts via Resend; `sendChannel='gmail'` sends one-by-one
// from the org's connected Gmail (warmer for cold sales sequences).
export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'active',
  'completed',
  'paused',
])

export const campaignChannelEnum = pgEnum('campaign_channel', [
  'resend',
  'gmail',
  // Phase B (Twilio integration). Phase A creates the enum value so we don't
  // need another migration when Twilio gets wired; sends through this channel
  // no-op + record a 'failed' event until clinicSmsConfig.a2pStatus='approved'.
  'twilio_sms',
])

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: campaignStatusEnum('status').notNull().default('draft'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  budgetCents: integer('budget_cents').notNull().default(0),
  subject: text('subject'),
  previewText: text('preview_text'),
  bodyHtml: text('body_html'),
  bodyJson: jsonb('body_json'),
  audienceId: integer('audience_id'),
  sendChannel: campaignChannelEnum('send_channel').notNull().default('resend'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sendStats: jsonb('send_stats').notNull().default(sql`'{}'::jsonb`),
  // Which entity the audience materializes against. 'customers' = SaaS lead
  // pipeline (platform tenant); 'patients' = dental patient table (clinic
  // tenant Recall & Outreach). Discriminator drives `lib/services/marketing.ts`
  // `resolveAudience` between two schemas.
  recipientSource: text('recipient_source').notNull().default('customers'),
  // Soft pointer to the template a campaign was created from (analytics +
  // "save changes as new template"). Null for ad-hoc campaigns.
  templateId: integer('template_id'),
  // Idempotency key for retention automations (birthday / reactivation). When a
  // cron auto-creates a campaign it stamps a deterministic key
  // (e.g. 'birthday:org_x:2026-06-18') so a re-run in the same window finds the
  // existing row and never double-creates. Null for all human-made campaigns.
  automationKey: text('automation_key'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // One automation campaign per org per window — the partial unique index makes
  // a concurrent double-create from overlapping cron runs impossible (the loser
  // hits a unique violation and skips). Only constrains automation rows; human
  // campaigns leave automationKey null and are unaffected.
  uniqueIndex('campaigns_org_automation_key_idx')
    .on(t.organizationId, t.automationKey)
    .where(sql`${t.automationKey} is not null`),
])

export const campaignMembers = pgTable(
  'campaign_members',
  {
    campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })]
)

// ---------- Audiences (saved segments) ----------
// `recipient_source` discriminates between the two filter shapes:
//
//   - 'customers' — SaaS lead pipeline (platform tenant). `filter` is
//     {stages, sources, lifecycleStages, lastActivityWithinDays, includeOptedOut}.
//
//   - 'patients' — dental patient table (clinic tenant Recall & Outreach v1).
//     `patient_filter` is the active shape: {status, hasBalance, missingIntake,
//     birthdayThisMonth, sources, recallStatus, channelHasOptIn[]}. Mirrors
//     `PatientListFilters` in lib/services/patients.ts so segments use the
//     same predicates the patient list does.
//
// Two columns rather than one polymorphic JSON so we can preserve the
// existing platform-tenant `filter` shape verbatim and not break in-flight
// audiences when Phase A lands.
export const audiences = pgTable('audiences', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  recipientSource: text('recipient_source').notNull().default('customers'),
  filter: jsonb('filter').notNull().default(sql`'{}'::jsonb`),
  patientFilter: jsonb('patient_filter').notNull().default(sql`'{}'::jsonb`),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Reusable starter copy for new campaigns. System templates ship with the
// product (organizationId = null, kind = 'system') and every tenant can use
// them. Custom templates (organizationId set, kind = 'custom') are
// per-org saves the clinic created themselves. The seeder lays down three
// systems on every install: Reactivation, Birthday, New-patient welcome.
export const campaignTemplates = pgTable('campaign_templates', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  // 'system' (ships with product, all orgs see, can't be edited)
  // 'custom' (per-org)
  kind: text('kind').notNull().default('custom'),
  // 'reactivation' | 'birthday' | 'welcome' | 'recall' | 'general' — drives
  // the "Choose a template" picker grouping + the suggested-audience hint.
  category: text('category').notNull().default('general'),
  name: text('name').notNull(),
  description: text('description'),
  subject: text('subject').notNull(),
  previewText: text('preview_text'),
  bodyHtml: text('body_html').notNull(),
  bodyJson: jsonb('body_json'),
  defaultChannel: campaignChannelEnum('default_channel').notNull().default('resend'),
  // Hint at the audience to pre-select when a clinic creates a campaign from
  // this template (e.g. 'lapsed_180d' for Reactivation). Just a slug; the
  // UI resolves to a real audience by name or falls through to "pick one".
  defaultAudienceSlug: text('default_audience_slug'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('campaign_template_org_name_idx').on(t.organizationId, t.name),
])

// ---------- Campaign events (sent / open / click / bounce / unsub) ----------
// One row per recipient interaction. Aggregations roll into `campaigns.sendStats`
// for fast dashboard reads; the raw rows back per-recipient analytics + audit.
export const campaignEventTypeEnum = pgEnum('campaign_event_type', [
  'sent',
  'delivered',
  'open',
  'click',
  'bounce',
  'complaint',
  'unsubscribe',
  'failed',
  // Outcome attribution: recipient booked an appointment after a campaign send.
  // Written either by `lib/services/booking.ts` when the booking carries a
  // tracked-link campaign id, or by a follow-up reconciliation job that joins
  // last-30d sends → last-30d new appointments per patient.
  'booked',
])

export const campaignEvents = pgTable(
  'campaign_events',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    // Patient-source attribution. Set when the recipient came from the
    // `patient` table (clinic Recall & Outreach) instead of `customers`.
    // Soft pointer (no `notNull` so the existing platform-tenant rows
    // continue to write with patientId = null).
    patientId: text('patient_id').references(() => patient.id, { onDelete: 'set null' }),
    // For 'booked' events only — points at the appointment that resulted.
    // Lets the campaign stats panel show "Bookings: 4" with click-through
    // to the actual rows.
    bookedAppointmentId: text('booked_appointment_id').references(() => appointment.id, { onDelete: 'set null' }),
    bookedAt: timestamp('booked_at', { withTimezone: true }),
    type: campaignEventTypeEnum('type').notNull(),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('campaign_events_campaign_recipient_type_idx').on(t.campaignId, t.recipientEmail, t.type, t.occurredAt),
    // Per-patient timeline lookup ("show me all marketing events for Sophia")
    // — used by patient-timeline.ts.
    uniqueIndex('campaign_events_campaign_patient_type_idx').on(t.campaignId, t.patientId, t.type, t.occurredAt),
  ]
)

// ---------- Community (platform-wide; no org scoping) ----------
export const forumThreads = pgTable('forum_threads', {
  id: serial('id').primaryKey(),
  authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  category: text('category').notNull().default('general'),
  views: integer('views').notNull().default(0),
  pinned: boolean('pinned').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const forumReplies = pgTable('forum_replies', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').notNull().references(() => forumThreads.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  parentId: integer('parent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const feedPosts = pgTable('feed_posts', {
  id: serial('id').primaryKey(),
  authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  imageUrl: text('image_url'),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const meetups = pgTable('meetups', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  location: text('location'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  imageUrl: text('image_url'),
  hostId: text('host_id').references(() => user.id, { onDelete: 'set null' }),
  capacity: integer('capacity'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const meetupRsvps = pgTable(
  'meetup_rsvps',
  {
    meetupId: integer('meetup_id').notNull().references(() => meetups.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('going'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.meetupId, t.userId] })]
)

// ---------- Jobs (platform-wide by default) ----------
export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  website: text('website'),
  logoUrl: text('logo_url'),
  location: text('location'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  location: text('location'),
  type: text('type').notNull().default('full-time'),
  remote: boolean('remote').notNull().default(false),
  salaryMinCents: integer('salary_min_cents'),
  salaryMaxCents: integer('salary_max_cents'),
  postedById: text('posted_by_id').references(() => user.id, { onDelete: 'set null' }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Conversations / Messages (org-scoped) ----------
// In a clinic org these are patient ↔ staff DMs. In the platform org these
// are clinic-owner ↔ Dream Create staff DMs.
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: integer('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })]
)

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Inbox (per-user mailbox) ----------
export const inboxFolderEnum = pgEnum('inbox_folder', [
  'inbox',
  'sent',
  'drafts',
  'starred',
  'archived',
  'spam',
  'trash',
])

export const inboxMessages = pgTable('inbox_messages', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
  fromName: text('from_name').notNull(),
  fromEmail: text('from_email').notNull(),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  folder: inboxFolderEnum('folder').notNull().default('inbox'),
  read: boolean('read').notNull().default(false),
  starred: boolean('starred').notNull().default(false),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Per-user billing profile ----------
// NOTE: For clinic orgs, the source of truth for subscription state is
// `clinicProfile` (see lib/db/schema/platform.ts). This per-user table is
// retained for backwards-compatibility with the single-tenant Plans UI and
// will be reconciled into clinicProfile in a follow-up.
export const billingPlanEnum = pgEnum('billing_plan', ['free', 'pro', 'team', 'enterprise'])

export const billingProfiles = pgTable('billing_profiles', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  plan: billingPlanEnum('plan').notNull().default('free'),
  cardLast4: text('card_last4'),
  cardBrand: text('card_brand'),
  cardExpMonth: integer('card_exp_month'),
  cardExpYear: integer('card_exp_year'),
  billingEmail: text('billing_email'),
  billingAddress: text('billing_address'),
  renewsAt: timestamp('renews_at', { withTimezone: true }),
  stripeCustomerId: text('stripe_customer_id').unique(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  stripePriceId: text('stripe_price_id'),
  stripeStatus: text('stripe_status'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Notification prefs / connected apps (per-user) ----------
export const notificationPrefs = pgTable('notification_prefs', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  comments: boolean('comments').notNull().default(true),
  candidates: boolean('candidates').notNull().default(true),
  offers: boolean('offers').notNull().default(false),
  pushEverything: boolean('push_everything').notNull().default(false),
  pushEmail: boolean('push_email').notNull().default(true),
  pushNothing: boolean('push_nothing').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const connectedApps = pgTable(
  'connected_apps',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    appKey: text('app_key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.appKey] })]
)

export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  category: text('category').notNull().default('general'),
  rating: integer('rating'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Notifications ----------
// One row per surface-able in-app notification. The `bucket` column maps onto
// the three boolean toggles in `notification_prefs` (comments / candidates /
// offers) so the dispatcher can short-circuit by checking `prefs[bucket]`.
// `organization_id` is nullable for system-wide notifications that don't
// belong to a tenant context.
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
    bucket: text('bucket').notNull(), // 'comments' | 'candidates' | 'offers'
    type: text('type').notNull(), // e.g. 'campaign_sent', 'lead_added', 'inbox_message'
    title: text('title').notNull(),
    body: text('body'),
    linkPath: text('link_path'),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notifications_user_created_idx').on(t.userId, t.createdAt),
  ],
)

// ---------- Fintech (per-user demo accounts) ----------
export const accountsFinance = pgTable('finance_accounts', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull().default('checking'),
  balanceCents: integer('balance_cents').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const finCards = pgTable('finance_cards', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  brand: text('brand').notNull(),
  last4: varchar('last4', { length: 4 }).notNull(),
  expMonth: integer('exp_month').notNull(),
  expYear: integer('exp_year').notNull(),
  nickname: text('nickname'),
  primary: boolean('primary').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: integer('account_id').references(() => accountsFinance.id, { onDelete: 'set null' }),
  merchant: text('merchant').notNull(),
  category: text('category').notNull().default('other'),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  status: text('status').notNull().default('completed'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- Analytics ----------
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: serial('id').primaryKey(),
    // Cascade so a deleted clinic's analytics events go with it (the column stays
    // nullable for internal Dream Create events, which have no org). Was set-null,
    // which left orphaned rows behind on clinic deletion.
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    properties: jsonb('properties').notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('analytics_events_name_time_idx').on(t.name, t.occurredAt)]
)

// ---------- Public-site pageviews (daily rollup) ----------
// One row per (organization, day, path) — a daily counter, NOT a raw event log
// (no per-visit row, no PII, no IP/UA stored). The public-site beacon
// (POST /api/site-view) upserts here: INSERT … ON CONFLICT (org,day,path)
// DO UPDATE views = views + 1. This is the clinic's FIRST real "how many people
// visit my site" number — GSC clicks (search-only, ~2-day lag) were the only
// proxy before. `path` is normalized (query string stripped). `?edit=1` Studio
// canvases + obvious bots are excluded at the route, so the count reflects real
// visitors. Surfaced on /analytics (Acquisition) + /seo (Visits vs GSC clicks).
export const sitePageview = pgTable(
  'site_pageview',
  {
    id: serial('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Calendar day the views were counted (UTC date — a daily bucket, not a
    // timestamp). `date` mode 'string' keeps it a 'YYYY-MM-DD' string app-side.
    day: date('day', { mode: 'string' }).notNull(),
    // Normalized request path (query stripped, trailing slash trimmed). '/' for
    // the homepage. Capped in the route so a hostile path can't bloat the row.
    path: text('path').notNull(),
    views: integer('views').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('site_pageview_org_day_path_idx').on(t.organizationId, t.day, t.path)]
)
export type SitePageview = typeof sitePageview.$inferSelect
export type NewSitePageview = typeof sitePageview.$inferInsert

export type Customer = typeof customers.$inferSelect
export type NewCustomer = typeof customers.$inferInsert
export type Order = typeof orders.$inferSelect
export type Invoice = typeof invoices.$inferSelect
export type Product = typeof products.$inferSelect
export type Task = typeof tasks.$inferSelect
export type CalendarEvent = typeof calendarEvents.$inferSelect
export type Campaign = typeof campaigns.$inferSelect
export type Audience = typeof audiences.$inferSelect
export type NewAudience = typeof audiences.$inferInsert
export type CampaignEvent = typeof campaignEvents.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
export type ForumThread = typeof forumThreads.$inferSelect
export type FeedPost = typeof feedPosts.$inferSelect
export type Meetup = typeof meetups.$inferSelect
export type Job = typeof jobs.$inferSelect
export type Company = typeof companies.$inferSelect
export type Message = typeof messages.$inferSelect
export type InboxMessage = typeof inboxMessages.$inferSelect
export type FinCard = typeof finCards.$inferSelect
export type Transaction = typeof transactions.$inferSelect
