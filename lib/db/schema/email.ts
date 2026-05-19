import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'
import { patient } from './clinic'

/**
 * Email accounts connected to an org via OAuth (Gmail today, Microsoft later).
 * Each row represents one connected mailbox — an org can connect multiple
 * (info@, billing@, support@, …). The refresh token is encrypted at rest
 * with the EMAIL_ENCRYPTION_KEY env var (see lib/crypto.ts).
 */
export const emailAccount = pgTable(
  'email_account',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    connectedByUserId: text('connected_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(), // 'gmail' | (later: 'microsoft')
    emailAddress: text('email_address').notNull(),
    displayName: text('display_name'),
    refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
    accessToken: text('access_token'),
    accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }),
    scope: text('scope'),
    historyId: text('history_id'), // Gmail-side cursor for incremental sync
    watchExpiresAt: timestamp('watch_expires_at', { withTimezone: true }), // when the users.watch() registration lapses; renewed by cron
    syncStatus: text('sync_status').notNull().default('pending'), // pending | syncing | ready | error
    syncError: text('sync_error'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    disabled: boolean('disabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_account_org_idx').on(t.organizationId)],
)

/**
 * Cached email messages from connected accounts. Provider-agnostic shape:
 * we store enough to render a list + thread view without hitting Gmail on
 * every request. Bodies are stored lazily (fetched on click).
 */
export const emailMessage = pgTable(
  'email_message',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => emailAccount.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Matched patient when the sender's email maps to a patient record in
    // this org. Set on ingest; backfilled for existing messages by a one-off
    // helper. Used by the inbox UI to surface a patient-context card next to
    // every clinic-related email.
    patientId: text('patient_id').references(() => patient.id, { onDelete: 'set null' }),
    providerMessageId: text('provider_message_id').notNull(),
    providerThreadId: text('provider_thread_id'),
    folder: text('folder').notNull().default('inbox'), // inbox | sent | drafts | spam | trash
    fromName: text('from_name'),
    fromEmail: text('from_email').notNull(),
    toEmails: jsonb('to_emails').$type<string[]>().notNull().default([]),
    ccEmails: jsonb('cc_emails').$type<string[]>().notNull().default([]),
    subject: text('subject'),
    snippet: text('snippet'),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    isRead: boolean('is_read').notNull().default(false),
    isStarred: boolean('is_starred').notNull().default(false),
    labels: jsonb('labels').$type<string[]>().notNull().default([]),
    // AI-classified intent: 'booking' | 'insurance' | 'billing' | 'records' |
    // 'marketing' | 'follow_up' | 'other'. Populated by Phase 2 classifier;
    // null until then. Drives the triage filter chips in the inbox UI.
    intent: text('intent'),
    // AI-classified category: 'primary' | 'updates' | 'promotions' | 'spam'.
    // Decides which inbox tab the message lands in — Primary is the "real
    // emails that need a response" view, Updates is automated/transactional,
    // Promotions is marketing/newsletters, Spam is suspicious. Populated by
    // the classifier in the same call that sets `intent`.
    category: text('category'),
    // How the category got there. Decides whether the auto-classifier is
    // allowed to overwrite it. 'auto' = Haiku decided, fair game to
    // reclassify. 'user' = a person clicked "Move to X", treat as ground
    // truth and never overwrite. 'inherit' = inherited from another message
    // in the same thread (user-locked or known-sender heuristic).
    // 'gmail' = Gmail's own label put it here (SPAM, CATEGORY_*).
    categorySource: text('category_source').notNull().default('auto'),
    // RFC 5322 Message-ID header value (e.g. "<CABx...@mail.gmail.com>").
    // Distinct from `providerMessageId` (Gmail's internal id). Used as the
    // target for In-Reply-To / References on outbound replies — critical
    // for thread continuity in recipient clients and for deliverability.
    rfcMessageId: text('rfc_message_id'),
    // The Message-ID this message is replying to, if any. Lets us walk a
    // conversation chain client-side without re-fetching headers.
    inReplyTo: text('in_reply_to'),
    // AI-generated one-liner summary for threads > 3 messages. Populated on
    // demand when the user opens a long thread.
    threadSummary: text('thread_summary'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_message_account_idx').on(t.accountId),
    index('email_message_org_idx').on(t.organizationId),
    index('email_message_patient_idx').on(t.patientId),
    index('email_message_received_idx').on(t.receivedAt),
    index('email_message_category_idx').on(t.category),
    index('email_message_thread_idx').on(t.providerThreadId),
    // Speeds up the In-Reply-To chain lookup in getThreadDetail
    // (matches sent replies back to their parent thread even when
    // Gmail didn't thread them on its side).
    index('email_message_in_reply_to_idx').on(t.inReplyTo),
  ],
)

/**
 * Org-scoped canned-response templates. Body can include {{patient_first_name}},
 * {{next_appt_date}}, {{clinic_name}} placeholders that are expanded at
 * send-time. Optional single-character `shortcut` lets users insert a
 * snippet via keyboard from the compose pane.
 */
export const emailSnippet = pgTable(
  'email_snippet',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    body: text('body').notNull(),
    shortcut: text('shortcut'), // single character e.g. '1', '2'
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_snippet_org_idx').on(t.organizationId)],
)

export type EmailAccount = typeof emailAccount.$inferSelect
export type EmailMessage = typeof emailMessage.$inferSelect
export type EmailSnippet = typeof emailSnippet.$inferSelect

export const EMAIL_PROVIDERS = ['gmail'] as const // microsoft added later
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]

export const EMAIL_FOLDERS = ['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive'] as const
export type EmailFolder = (typeof EMAIL_FOLDERS)[number]

// Intent buckets used by the AI classifier + triage UI.
export const EMAIL_INTENTS = [
  'booking',     // Patient wants to book / reschedule / cancel an appointment
  'insurance',   // Insurance questions, coverage, claims
  'billing',     // Bills, payments, statements
  'records',     // Asking for records, x-rays, prescriptions
  'marketing',   // Promotional / newsletters / vendor pitches
  'follow_up',   // Needs a response from the practice
  'other',       // Catch-all
] as const
export type EmailIntent = (typeof EMAIL_INTENTS)[number]

// Inbox tab the message belongs to. Distinct from `intent` — answers
// "where does this live?" not "what is it about?".
export const EMAIL_CATEGORIES = [
  'primary',     // Real personal/business email written by a human, needs attention
  'updates',     // Automated / transactional from a known service (receipts, alerts)
  'promotions',  // Marketing, newsletters, sales pitches, bulk announcements
  'spam',        // Suspicious / phishing / junk that slipped past Gmail spam filter
] as const
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number]
