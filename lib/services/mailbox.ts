import 'server-only'
import { randomUUID } from 'crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  getAccessToken,
  getMessage,
  listInboxMessageIds,
  markMessageRead,
  parseGmailMessage,
  sendMessage as gmailSend,
} from './gmail'
import type { EmailAccount, EmailMessage } from '@/lib/db/schema/email'

export type { EmailAccount, EmailMessage } from '@/lib/db/schema/email'

function isMissingSchemaError(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}

export interface EmailAccountSummary {
  id: string
  emailAddress: string
  displayName: string | null
  provider: string
  syncStatus: string
  syncError: string | null
  lastSyncAt: Date | null
  unreadCount: number
  connectedByUserId: string
  createdAt: Date
}

export async function listOrgEmailAccounts(organizationId: string): Promise<EmailAccountSummary[]> {
  try {
    const rows = await db
      .select({
        id: schema.emailAccount.id,
        emailAddress: schema.emailAccount.emailAddress,
        displayName: schema.emailAccount.displayName,
        provider: schema.emailAccount.provider,
        syncStatus: schema.emailAccount.syncStatus,
        syncError: schema.emailAccount.syncError,
        lastSyncAt: schema.emailAccount.lastSyncAt,
        connectedByUserId: schema.emailAccount.connectedByUserId,
        createdAt: schema.emailAccount.createdAt,
        unreadCount: sql<number>`(
          select count(*)::int from ${schema.emailMessage} m
          where m.account_id = ${schema.emailAccount.id}
            and m.is_read = false
            and m.folder = 'inbox'
        )`,
      })
      .from(schema.emailAccount)
      .where(
        and(eq(schema.emailAccount.organizationId, organizationId), eq(schema.emailAccount.disabled, false)),
      )
      .orderBy(desc(schema.emailAccount.createdAt))
    return rows as EmailAccountSummary[]
  } catch (err) {
    if (isMissingSchemaError(err)) return []
    throw err
  }
}

export interface EmailMessageListItem {
  id: string
  accountId: string
  accountEmail: string | null
  providerMessageId: string
  providerThreadId: string | null
  fromName: string | null
  fromEmail: string
  subject: string | null
  snippet: string | null
  receivedAt: Date
  isRead: boolean
  isStarred: boolean
  folder: string
}

export async function listMessagesForOrg(
  organizationId: string,
  opts: { accountId?: string; folder?: string; limit?: number } = {},
): Promise<EmailMessageListItem[]> {
  try {
    const limit = opts.limit ?? 100
    const conditions = [eq(schema.emailMessage.organizationId, organizationId)]
    if (opts.accountId) conditions.push(eq(schema.emailMessage.accountId, opts.accountId))
    conditions.push(eq(schema.emailMessage.folder, opts.folder ?? 'inbox'))

    const rows = await db
      .select({
        id: schema.emailMessage.id,
        accountId: schema.emailMessage.accountId,
        accountEmail: schema.emailAccount.emailAddress,
        providerMessageId: schema.emailMessage.providerMessageId,
        providerThreadId: schema.emailMessage.providerThreadId,
        fromName: schema.emailMessage.fromName,
        fromEmail: schema.emailMessage.fromEmail,
        subject: schema.emailMessage.subject,
        snippet: schema.emailMessage.snippet,
        receivedAt: schema.emailMessage.receivedAt,
        isRead: schema.emailMessage.isRead,
        isStarred: schema.emailMessage.isStarred,
        folder: schema.emailMessage.folder,
      })
      .from(schema.emailMessage)
      .leftJoin(schema.emailAccount, eq(schema.emailAccount.id, schema.emailMessage.accountId))
      .where(and(...conditions))
      .orderBy(desc(schema.emailMessage.receivedAt))
      .limit(limit)
    return rows as EmailMessageListItem[]
  } catch (err) {
    if (isMissingSchemaError(err)) return []
    throw err
  }
}

export async function getMessageDetail(messageId: string, organizationId: string): Promise<EmailMessage | null> {
  const [row] = await db
    .select()
    .from(schema.emailMessage)
    .where(
      and(eq(schema.emailMessage.id, messageId), eq(schema.emailMessage.organizationId, organizationId)),
    )
    .limit(1)
  return row ?? null
}

export async function getAccount(accountId: string, organizationId: string): Promise<EmailAccount | null> {
  const [row] = await db
    .select()
    .from(schema.emailAccount)
    .where(
      and(eq(schema.emailAccount.id, accountId), eq(schema.emailAccount.organizationId, organizationId)),
    )
    .limit(1)
  return row ?? null
}

/**
 * Fetch the latest messages from Gmail and upsert into the local cache.
 * Skips messages we already have. Marks the account ready / error.
 */
export async function syncAccount(
  accountId: string,
  organizationId: string,
  opts: { limit?: number } = {},
): Promise<{ added: number }> {
  const account = await getAccount(accountId, organizationId)
  if (!account) throw new Error('Account not found')

  await db
    .update(schema.emailAccount)
    .set({ syncStatus: 'syncing', syncError: null, updatedAt: new Date() })
    .where(eq(schema.emailAccount.id, accountId))

  try {
    const accessToken = await getAccessToken(accountId)
    const ids = await listInboxMessageIds(accessToken, opts.limit ?? 30)
    if (ids.length === 0) {
      await db
        .update(schema.emailAccount)
        .set({ syncStatus: 'ready', lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.emailAccount.id, accountId))
      return { added: 0 }
    }

    const existing = await db
      .select({ providerMessageId: schema.emailMessage.providerMessageId })
      .from(schema.emailMessage)
      .where(
        and(
          eq(schema.emailMessage.accountId, accountId),
          inArray(
            schema.emailMessage.providerMessageId,
            ids.map((m) => m.id),
          ),
        ),
      )
    const have = new Set(existing.map((r) => r.providerMessageId))
    const toFetch = ids.filter((m) => !have.has(m.id))

    let added = 0
    for (const item of toFetch) {
      try {
        const full = await getMessage(accessToken, item.id)
        const parsed = parseGmailMessage(full)
        await db.insert(schema.emailMessage).values({
          id: randomUUID(),
          accountId,
          organizationId,
          providerMessageId: parsed.providerMessageId,
          providerThreadId: parsed.providerThreadId,
          folder: 'inbox',
          fromName: parsed.fromName,
          fromEmail: parsed.fromEmail,
          toEmails: parsed.toEmails,
          ccEmails: parsed.ccEmails,
          subject: parsed.subject,
          snippet: parsed.snippet,
          bodyText: parsed.bodyText,
          bodyHtml: parsed.bodyHtml,
          isRead: parsed.isRead,
          labels: parsed.labels,
          receivedAt: parsed.receivedAt,
        })
        added++
      } catch (err) {
        console.warn(`[mailbox.sync] failed to ingest ${item.id}`, err)
      }
    }

    await db
      .update(schema.emailAccount)
      .set({ syncStatus: 'ready', lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.emailAccount.id, accountId))
    return { added }
  } catch (err) {
    await db
      .update(schema.emailAccount)
      .set({ syncStatus: 'error', syncError: (err as Error).message, updatedAt: new Date() })
      .where(eq(schema.emailAccount.id, accountId))
    throw err
  }
}

export async function sendEmail(opts: {
  accountId: string
  organizationId: string
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  bodyHtml?: string
  inReplyTo?: string
  references?: string
}) {
  const account = await getAccount(opts.accountId, opts.organizationId)
  if (!account) throw new Error('Account not found')
  if (account.provider !== 'gmail') throw new Error('Only Gmail is supported right now')
  const accessToken = await getAccessToken(opts.accountId)
  const from = account.displayName ? `${account.displayName} <${account.emailAddress}>` : account.emailAddress
  return gmailSend(accessToken, {
    from,
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    bodyText: opts.bodyText,
    bodyHtml: opts.bodyHtml,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  })
}

export async function setMessageRead(messageId: string, organizationId: string, read: boolean): Promise<void> {
  const [msg] = await db
    .select({
      providerMessageId: schema.emailMessage.providerMessageId,
      accountId: schema.emailMessage.accountId,
    })
    .from(schema.emailMessage)
    .where(
      and(eq(schema.emailMessage.id, messageId), eq(schema.emailMessage.organizationId, organizationId)),
    )
    .limit(1)
  if (!msg) return
  await db
    .update(schema.emailMessage)
    .set({ isRead: read })
    .where(eq(schema.emailMessage.id, messageId))
  try {
    const accessToken = await getAccessToken(msg.accountId)
    await markMessageRead(accessToken, msg.providerMessageId, read)
  } catch (err) {
    console.warn('[mailbox] could not sync read flag back to Gmail', err)
  }
}

export async function disconnectAccount(accountId: string, organizationId: string): Promise<void> {
  await db
    .update(schema.emailAccount)
    .set({ disabled: true, updatedAt: new Date() })
    .where(
      and(eq(schema.emailAccount.id, accountId), eq(schema.emailAccount.organizationId, organizationId)),
    )
}
