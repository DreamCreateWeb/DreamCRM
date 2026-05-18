import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'

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
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_message_account_idx').on(t.accountId),
    index('email_message_org_idx').on(t.organizationId),
    index('email_message_received_idx').on(t.receivedAt),
  ],
)

export type EmailAccount = typeof emailAccount.$inferSelect
export type EmailMessage = typeof emailMessage.$inferSelect

export const EMAIL_PROVIDERS = ['gmail'] as const // microsoft added later
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]

export const EMAIL_FOLDERS = ['inbox', 'sent', 'drafts', 'spam', 'trash', 'archive'] as const
export type EmailFolder = (typeof EMAIL_FOLDERS)[number]
