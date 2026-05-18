import 'server-only'
import { randomUUID } from 'crypto'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  getAccessToken,
  getMessage,
  listHistory,
  listInboxMessageIds,
  markMessageRead,
  modifyLabels as gmailModifyLabels,
  parseGmailMessage,
  sendMessage as gmailSend,
  stopWatch,
  trashMessage as gmailTrash,
  watchMailbox,
} from './gmail'
import { classifyBatch } from './ai-mailbox'
import type { EmailAccount, EmailMessage } from '@/lib/db/schema/email'

export type { EmailAccount, EmailMessage } from '@/lib/db/schema/email'

/**
 * Look up a patient in `organizationId` whose email matches `fromEmail`
 * (case-insensitive). Returns the patient id or null. The match is exact
 * on email; we don't try to fuzzy-match across multiple email addresses
 * per patient yet — practically rare for dental clinics.
 */
async function findPatientByEmail(organizationId: string, fromEmail: string): Promise<string | null> {
  if (!fromEmail) return null
  const normalized = fromEmail.trim().toLowerCase()
  if (!normalized) return null
  const [row] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        sql`lower(${schema.patient.email}) = ${normalized}`,
      ),
    )
    .limit(1)
  return row?.id ?? null
}

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
  intent: string | null
  category: string | null
  patientId: string | null
  patientFirstName: string | null
  patientLastName: string | null
}

export interface ListMessagesOpts {
  accountId?: string
  folder?: string
  limit?: number
  intent?: string         // filter by classified intent
  /**
   * Category tab filter. `'primary'` matches `category='primary'` AND
   * `category IS NULL` so freshly-ingested messages don't disappear into a
   * void while the classifier is still running. Other categories match
   * exactly.
   */
  category?: string
  unreadOnly?: boolean
  starredOnly?: boolean
  patientsOnly?: boolean  // only messages matched to a patient
}

export async function listMessagesForOrg(
  organizationId: string,
  opts: ListMessagesOpts = {},
): Promise<EmailMessageListItem[]> {
  try {
    const limit = opts.limit ?? 100
    const conditions = [eq(schema.emailMessage.organizationId, organizationId)]
    if (opts.accountId) conditions.push(eq(schema.emailMessage.accountId, opts.accountId))
    conditions.push(eq(schema.emailMessage.folder, opts.folder ?? 'inbox'))
    if (opts.intent) conditions.push(eq(schema.emailMessage.intent, opts.intent))
    if (opts.category) {
      if (opts.category === 'primary') {
        // Show unclassified mail in Primary so newly-ingested messages
        // don't vanish during the brief AI classification window.
        conditions.push(
          sql`(${schema.emailMessage.category} = 'primary' OR ${schema.emailMessage.category} IS NULL)`,
        )
      } else {
        conditions.push(eq(schema.emailMessage.category, opts.category))
      }
    }
    if (opts.unreadOnly) conditions.push(eq(schema.emailMessage.isRead, false))
    if (opts.starredOnly) conditions.push(eq(schema.emailMessage.isStarred, true))
    if (opts.patientsOnly) conditions.push(sql`${schema.emailMessage.patientId} is not null`)

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
        intent: schema.emailMessage.intent,
        category: schema.emailMessage.category,
        patientId: schema.emailMessage.patientId,
        patientFirstName: schema.patient.firstName,
        patientLastName: schema.patient.lastName,
      })
      .from(schema.emailMessage)
      .leftJoin(schema.emailAccount, eq(schema.emailAccount.id, schema.emailMessage.accountId))
      .leftJoin(schema.patient, eq(schema.patient.id, schema.emailMessage.patientId))
      .where(and(...conditions))
      .orderBy(desc(schema.emailMessage.receivedAt))
      .limit(limit)
    return rows as EmailMessageListItem[]
  } catch (err) {
    if (isMissingSchemaError(err)) return []
    throw err
  }
}

/**
 * Counts grouped by intent for the inbox triage filter chips. Returns one
 * entry per intent including 'other' and a synthetic 'unclassified' bucket
 * for messages with a null intent (Phase 1 leaves intent null; Phase 2's AI
 * classifier populates it on ingest).
 */
export async function countMessagesByIntent(organizationId: string): Promise<Record<string, number>> {
  try {
    const rows = await db
      .select({
        intent: schema.emailMessage.intent,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.emailMessage)
      .where(
        and(
          eq(schema.emailMessage.organizationId, organizationId),
          eq(schema.emailMessage.folder, 'inbox'),
        ),
      )
      .groupBy(schema.emailMessage.intent)
    const map: Record<string, number> = {}
    for (const r of rows) {
      map[r.intent ?? 'unclassified'] = r.count
    }
    return map
  } catch (err) {
    if (isMissingSchemaError(err)) return {}
    throw err
  }
}

/**
 * Counts grouped by category — drives the tab badges in the inbox header.
 * Unclassified messages are folded into 'primary' to match listMessagesForOrg's
 * default behavior (so the Primary tab count matches what the user actually
 * sees on the Primary tab).
 */
export async function countMessagesByCategory(organizationId: string): Promise<Record<string, number>> {
  try {
    const rows = await db
      .select({
        category: schema.emailMessage.category,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.emailMessage)
      .where(
        and(
          eq(schema.emailMessage.organizationId, organizationId),
          eq(schema.emailMessage.folder, 'inbox'),
        ),
      )
      .groupBy(schema.emailMessage.category)
    const map: Record<string, number> = { primary: 0, updates: 0, promotions: 0, spam: 0 }
    for (const r of rows) {
      const key = r.category ?? 'primary' // null → primary (see listMessagesForOrg)
      map[key] = (map[key] ?? 0) + r.count
    }
    return map
  } catch (err) {
    if (isMissingSchemaError(err)) return { primary: 0, updates: 0, promotions: 0, spam: 0 }
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
        const patientId = await findPatientByEmail(organizationId, parsed.fromEmail)
        await db.insert(schema.emailMessage).values({
          id: randomUUID(),
          accountId,
          organizationId,
          patientId,
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
    // Classify any messages still pending category — runs even when no new
    // mail was added so a fresh schema migration (category=null on every
    // row) gets backfilled on the next page load. Awaited so Vercel doesn't
    // kill it after the function returns; bounded by the limit param so
    // latency is predictable (~5-10s for 50 emails at 8-way concurrency).
    await classifyPendingIntents(organizationId, { limit: 50 }).catch(() => {})
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

/**
 * Toggle the starred flag on a message. Mirrors to Gmail via the STARRED
 * label so the change shows up in the user's regular Gmail UI too.
 */
export async function setMessageStarred(messageId: string, organizationId: string, starred: boolean): Promise<void> {
  const [msg] = await db
    .select({
      providerMessageId: schema.emailMessage.providerMessageId,
      accountId: schema.emailMessage.accountId,
    })
    .from(schema.emailMessage)
    .where(and(eq(schema.emailMessage.id, messageId), eq(schema.emailMessage.organizationId, organizationId)))
    .limit(1)
  if (!msg) return
  await db
    .update(schema.emailMessage)
    .set({ isStarred: starred })
    .where(eq(schema.emailMessage.id, messageId))
  try {
    const accessToken = await getAccessToken(msg.accountId)
    await gmailModifyLabels(accessToken, msg.providerMessageId, starred ? ['STARRED'] : [], starred ? [] : ['STARRED'])
  } catch (err) {
    console.warn('[mailbox] could not sync star flag back to Gmail', err)
  }
}

/**
 * Archive a message: locally moves it out of the inbox folder; on Gmail
 * removes the INBOX label (which is how Gmail itself models "archive").
 */
export async function archiveMessage(messageId: string, organizationId: string): Promise<void> {
  const [msg] = await db
    .select({
      providerMessageId: schema.emailMessage.providerMessageId,
      accountId: schema.emailMessage.accountId,
    })
    .from(schema.emailMessage)
    .where(and(eq(schema.emailMessage.id, messageId), eq(schema.emailMessage.organizationId, organizationId)))
    .limit(1)
  if (!msg) return
  await db
    .update(schema.emailMessage)
    .set({ folder: 'archive' })
    .where(eq(schema.emailMessage.id, messageId))
  try {
    const accessToken = await getAccessToken(msg.accountId)
    await gmailModifyLabels(accessToken, msg.providerMessageId, [], ['INBOX'])
  } catch (err) {
    console.warn('[mailbox] could not archive on Gmail', err)
  }
}

/**
 * Move a message to trash. Mirrors to Gmail via users.messages.trash.
 */
export async function trashMessage(messageId: string, organizationId: string): Promise<void> {
  const [msg] = await db
    .select({
      providerMessageId: schema.emailMessage.providerMessageId,
      accountId: schema.emailMessage.accountId,
    })
    .from(schema.emailMessage)
    .where(and(eq(schema.emailMessage.id, messageId), eq(schema.emailMessage.organizationId, organizationId)))
    .limit(1)
  if (!msg) return
  await db
    .update(schema.emailMessage)
    .set({ folder: 'trash' })
    .where(eq(schema.emailMessage.id, messageId))
  try {
    const accessToken = await getAccessToken(msg.accountId)
    await gmailTrash(accessToken, msg.providerMessageId)
  } catch (err) {
    console.warn('[mailbox] could not trash on Gmail', err)
  }
}

export async function disconnectAccount(accountId: string, organizationId: string): Promise<void> {
  // Best-effort: tell Gmail to stop pushing for this mailbox. Don't block the
  // disconnect on it — if the token is already revoked we still want to mark
  // the row disabled locally.
  try {
    const accessToken = await getAccessToken(accountId)
    await stopWatch(accessToken)
  } catch (err) {
    console.warn('[mailbox.disconnect] failed to stop Gmail watch', err)
  }
  await db
    .update(schema.emailAccount)
    .set({ disabled: true, watchExpiresAt: null, updatedAt: new Date() })
    .where(
      and(eq(schema.emailAccount.id, accountId), eq(schema.emailAccount.organizationId, organizationId)),
    )
}

// ---------- Gmail push notifications: watch + history ingest ----------

function pubsubTopicName(): string {
  const topic = process.env.GMAIL_PUBSUB_TOPIC
  if (!topic) throw new Error('GMAIL_PUBSUB_TOPIC env var is not set')
  return topic
}

/**
 * Register (or re-register) a Gmail `users.watch()` for the account. Stores
 * the returned historyId as our incremental-sync cursor and the expiration
 * timestamp so the renewal cron knows when to refresh. Idempotent: calling
 * watch() again before expiration simply resets the clock.
 */
export async function registerWatch(accountId: string): Promise<{ historyId: string; expiresAt: Date }> {
  const accessToken = await getAccessToken(accountId)
  const result = await watchMailbox(accessToken, pubsubTopicName())
  const expiresAt = new Date(Number(result.expiration))
  await db
    .update(schema.emailAccount)
    .set({ historyId: result.historyId, watchExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(schema.emailAccount.id, accountId))
  return { historyId: result.historyId, expiresAt }
}

/**
 * Ingest a single Gmail message id into the local cache if we don't have it
 * yet. Returns true if a new row was created. Used by both the full sync
 * path and the push-driven history processing.
 */
async function ingestMessageById(
  accountId: string,
  organizationId: string,
  accessToken: string,
  providerMessageId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: schema.emailMessage.id })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.accountId, accountId),
        eq(schema.emailMessage.providerMessageId, providerMessageId),
      ),
    )
    .limit(1)
  if (existing[0]) return false

  try {
    const full = await getMessage(accessToken, providerMessageId)
    // Only ingest INBOX messages — the history filter already narrows this,
    // but defending against a label change between the history event and
    // the message fetch.
    if (!(full.labelIds ?? []).includes('INBOX')) return false
    const parsed = parseGmailMessage(full)
    const patientId = await findPatientByEmail(organizationId, parsed.fromEmail)
    await db.insert(schema.emailMessage).values({
      id: randomUUID(),
      accountId,
      organizationId,
      patientId,
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
    return true
  } catch (err) {
    console.warn(`[mailbox.ingest] ${providerMessageId} failed`, err)
    return false
  }
}

/**
 * Create a minimal patient record from an email sender and link the current
 * + any other unmatched messages from that address to it. Used by the
 * "Add as patient" right-column CTA in the inbox.
 *
 * Idempotent: if a patient with the same email already exists in the org,
 * just links the messages without inserting a duplicate.
 */
export async function addPatientFromEmail(opts: {
  organizationId: string
  fromEmail: string
  firstName: string
  lastName: string
  phone?: string | null
  messageId: string // the message that triggered the create — make sure it ends up linked even if email backfill misses it
}): Promise<{ patientId: string; linkedMessages: number }> {
  const normalized = opts.fromEmail.trim().toLowerCase()
  let patientId = await findPatientByEmail(opts.organizationId, normalized)
  if (!patientId) {
    patientId = randomUUID()
    await db.insert(schema.patient).values({
      id: patientId,
      organizationId: opts.organizationId,
      firstName: opts.firstName,
      lastName: opts.lastName,
      email: normalized,
      phone: opts.phone ?? null,
    })
  }

  // Link every existing message in this org from this sender to the patient
  // (the explicit messageId is a belt-and-suspenders include in case the
  // case-insensitive match misses some edge case).
  await db
    .update(schema.emailMessage)
    .set({ patientId })
    .where(
      and(
        eq(schema.emailMessage.organizationId, opts.organizationId),
        sql`lower(${schema.emailMessage.fromEmail}) = ${normalized}`,
      ),
    )
  await db
    .update(schema.emailMessage)
    .set({ patientId })
    .where(
      and(
        eq(schema.emailMessage.id, opts.messageId),
        eq(schema.emailMessage.organizationId, opts.organizationId),
      ),
    )

  return { patientId, linkedMessages: 0 } // count omitted — would need a separate query
}

/**
 * Classify pending (category IS NULL) inbox messages for an org using the AI
 * classifier in `ai-mailbox.ts`. Runs in parallel with bounded concurrency.
 * Safe to invoke repeatedly — completed rows are skipped on the next call.
 *
 * Called automatically at the end of syncAccount() and processHistoryEvent()
 * so newly-ingested messages get both `category` (which inbox tab) and
 * `intent` (what it's about) without needing a separate cron. Also callable
 * as a backfill from the inbox settings page.
 */
export async function classifyPendingIntents(
  organizationId: string,
  opts: { limit?: number } = {},
): Promise<{ classified: number }> {
  if (!process.env.ANTHROPIC_API_KEY) return { classified: 0 }
  const limit = opts.limit ?? 50
  const rows = await db
    .select({
      id: schema.emailMessage.id,
      fromEmail: schema.emailMessage.fromEmail,
      fromName: schema.emailMessage.fromName,
      subject: schema.emailMessage.subject,
      bodyText: schema.emailMessage.bodyText,
      bodyHtml: schema.emailMessage.bodyHtml,
      snippet: schema.emailMessage.snippet,
    })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.organizationId, organizationId),
        isNull(schema.emailMessage.category),
      ),
    )
    .limit(limit)
  if (rows.length === 0) return { classified: 0 }
  const results = await classifyBatch(rows)
  for (const [id, { category, intent }] of Array.from(results.entries())) {
    await db
      .update(schema.emailMessage)
      .set({ category, intent })
      .where(eq(schema.emailMessage.id, id))
  }
  return { classified: results.size }
}

/**
 * One-off backfill: scan all messages in an org that have a null patient_id
 * and try to match them to a patient by sender email. Runs in batches; safe
 * to invoke repeatedly. Returns the number of rows that got matched.
 */
export async function backfillPatientMatches(organizationId: string, opts: { limit?: number } = {}): Promise<{ matched: number }> {
  const limit = opts.limit ?? 500
  const rows = await db
    .select({ id: schema.emailMessage.id, fromEmail: schema.emailMessage.fromEmail })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.organizationId, organizationId),
        isNull(schema.emailMessage.patientId),
      ),
    )
    .limit(limit)
  let matched = 0
  // Cache by email to avoid re-querying the same address for every message.
  const cache = new Map<string, string | null>()
  for (const row of rows) {
    const key = row.fromEmail.trim().toLowerCase()
    let patientId = cache.get(key)
    if (patientId === undefined) {
      patientId = await findPatientByEmail(organizationId, row.fromEmail)
      cache.set(key, patientId)
    }
    if (patientId) {
      await db
        .update(schema.emailMessage)
        .set({ patientId })
        .where(eq(schema.emailMessage.id, row.id))
      matched++
    }
  }
  return { matched }
}

/**
 * Handle a single Gmail Pub/Sub push event. Looks the account up by email
 * address, calls users.history.list from our stored cursor, ingests any new
 * inbox messages, and advances the cursor.
 *
 * If our stored historyId is older than 7 days Gmail returns 404 — in that
 * case we fall back to a full inbox sync and re-register the watch.
 */
export async function processHistoryEvent(opts: {
  emailAddress: string
  notificationHistoryId: string
}): Promise<{ ingested: number; resync?: boolean }> {
  const [account] = await db
    .select()
    .from(schema.emailAccount)
    .where(
      and(
        eq(schema.emailAccount.emailAddress, opts.emailAddress),
        eq(schema.emailAccount.disabled, false),
      ),
    )
    .limit(1)
  if (!account) {
    console.warn(`[mailbox.push] no account for ${opts.emailAddress}`)
    return { ingested: 0 }
  }

  // First-ever push for this mailbox — store the cursor and stop. Future
  // pushes will deliver actual deltas relative to this point.
  if (!account.historyId) {
    await db
      .update(schema.emailAccount)
      .set({ historyId: opts.notificationHistoryId, updatedAt: new Date() })
      .where(eq(schema.emailAccount.id, account.id))
    return { ingested: 0 }
  }

  const accessToken = await getAccessToken(account.id)

  let pageToken: string | undefined
  let ingested = 0
  let latestHistoryId = account.historyId
  try {
    do {
      const page = await listHistory(accessToken, account.historyId, { pageToken })
      latestHistoryId = page.historyId ?? latestHistoryId
      for (const record of page.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          const ok = await ingestMessageById(account.id, account.organizationId, accessToken, added.message.id)
          if (ok) ingested++
        }
      }
      pageToken = page.nextPageToken
    } while (pageToken)
  } catch (err) {
    // 404 means our cursor is too old (>7 days). Full-resync and re-watch.
    if (err instanceof Error && /\b404\b/.test(err.message)) {
      console.warn(`[mailbox.push] stale historyId for ${opts.emailAddress}, full resync`)
      await syncAccount(account.id, account.organizationId, { limit: 100 })
      await registerWatch(account.id)
      return { ingested: 0, resync: true }
    }
    throw err
  }

  await db
    .update(schema.emailAccount)
    .set({ historyId: latestHistoryId, lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.emailAccount.id, account.id))

  // Best-effort intent classification for any newly-ingested messages.
  if (ingested > 0) {
    await classifyPendingIntents(account.organizationId, { limit: 25 }).catch(() => {})
  }

  return { ingested }
}

/**
 * Renew Gmail watches that are about to expire (within `withinHours` from
 * now). Returns one result per account attempted. Designed to be called by
 * a daily cron — Gmail watches last 7 days so daily renewal keeps a 6-day
 * buffer.
 */
export async function renewExpiringWatches(
  withinHours = 36,
): Promise<{ accountId: string; emailAddress: string; ok: boolean; error?: string }[]> {
  const cutoff = new Date(Date.now() + withinHours * 60 * 60 * 1000)
  const due = await db
    .select({
      id: schema.emailAccount.id,
      emailAddress: schema.emailAccount.emailAddress,
      watchExpiresAt: schema.emailAccount.watchExpiresAt,
    })
    .from(schema.emailAccount)
    .where(
      and(
        eq(schema.emailAccount.disabled, false),
        eq(schema.emailAccount.provider, 'gmail'),
      ),
    )

  const results: { accountId: string; emailAddress: string; ok: boolean; error?: string }[] = []
  for (const account of due) {
    // Skip accounts whose watch is still healthy enough.
    if (account.watchExpiresAt && account.watchExpiresAt.getTime() > cutoff.getTime()) continue
    try {
      await registerWatch(account.id)
      results.push({ accountId: account.id, emailAddress: account.emailAddress, ok: true })
    } catch (err) {
      results.push({
        accountId: account.id,
        emailAddress: account.emailAddress,
        ok: false,
        error: (err as Error).message,
      })
    }
  }
  return results
}
