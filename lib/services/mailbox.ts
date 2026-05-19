import 'server-only'
import { randomUUID } from 'crypto'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  batchModifyLabels as gmailBatchModifyLabels,
  getAccessToken,
  getMessage,
  listHistory,
  listInboxMessageIds,
  parseGmailMessage,
  resolveInlineImages,
  sendMessage as gmailSend,
  stopWatch,
  trashMessage as gmailTrash,
  watchMailbox,
} from './gmail'
import { classifyBatch } from './ai-mailbox'
import { notifyInboxChange } from './inbox-events'
import {
  SYSTEM_ACTOR,
  logInboxAction,
  logInboxActionsBulk,
  type InboxActionEntry,
  type InboxActor,
} from './inbox-audit'
import type { InboxAction } from '@/lib/db/schema/email'
import type {
  EmailAccount,
  EmailCategory,
  EmailIntent,
  EmailMessage,
} from '@/lib/db/schema/email'

export type { EmailAccount, EmailMessage } from '@/lib/db/schema/email'

/**
 * Map Gmail's own labels onto our category buckets. Returns null when
 * Gmail hasn't decided — the AI classifier (or another heuristic) gets
 * to choose. Critically this is how we *stop overriding Gmail*: if it
 * says SPAM/PROMOTIONS/UPDATES/PERSONAL we honor it rather than re-running
 * Haiku and second-guessing.
 */
function categoryFromGmailLabels(
  labels: string[] | null | undefined,
): { category: EmailCategory; intent: EmailIntent } | null {
  if (!labels) return null
  if (labels.includes('SPAM')) return { category: 'spam', intent: 'other' }
  if (labels.includes('CATEGORY_PROMOTIONS')) return { category: 'promotions', intent: 'marketing' }
  if (labels.includes('CATEGORY_UPDATES')) return { category: 'updates', intent: 'other' }
  if (labels.includes('CATEGORY_SOCIAL')) return { category: 'updates', intent: 'other' }
  if (labels.includes('CATEGORY_FORUMS')) return { category: 'updates', intent: 'other' }
  // CATEGORY_PERSONAL is Gmail's "this is a real person writing to you"
  // signal. Trust it — the LLM has been mis-flagging meta-content (e.g.
  // emails that talk about spam testing) as spam, and Gmail's classifier
  // has years of training data behind it that ours doesn't.
  if (labels.includes('CATEGORY_PERSONAL')) return { category: 'primary', intent: 'follow_up' }
  // IMPORTANT is Gmail's learned-from-your-behavior signal. If Gmail
  // already promoted this email, treat it as primary rather than
  // letting the LLM second-guess.
  if (labels.includes('IMPORTANT')) return { category: 'primary', intent: 'follow_up' }
  return null
}

const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
])

function isConsumerSender(fromEmail: string): boolean {
  const at = fromEmail.lastIndexOf('@')
  if (at < 0) return false
  return CONSUMER_EMAIL_DOMAINS.has(fromEmail.slice(at + 1).toLowerCase())
}

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
  /** Restrict to messages in these threads. Used by listThreadsForOrg
   *  to pull sent siblings of inbox-matched threads in a second query. */
  threadIds?: string[]
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
    if (opts.threadIds && opts.threadIds.length > 0) {
      conditions.push(inArray(schema.emailMessage.providerThreadId, opts.threadIds))
    } else if (opts.threadIds && opts.threadIds.length === 0) {
      // Caller explicitly passed an empty set — nothing should match.
      return []
    }

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
    // Count distinct threads, not messages — the inbox now lists one
    // row per thread, so the badge should agree. Falls back to message id
    // when provider_thread_id is null (legacy rows) so the message still
    // gets counted as its own thread-of-one.
    const rows = await db
      .select({
        intent: schema.emailMessage.intent,
        count: sql<number>`count(distinct coalesce(${schema.emailMessage.providerThreadId}, ${schema.emailMessage.id}))::int`,
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
        count: sql<number>`count(distinct coalesce(${schema.emailMessage.providerThreadId}, ${schema.emailMessage.id}))::int`,
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

/**
 * Thread-shaped variant of the inbox list — one row per conversation
 * rather than one per message. The sidebar renders these, the detail
 * pane loads the full thread.
 */
export interface EmailThreadListItem {
  threadId: string
  latestMessageId: string
  accountId: string
  accountEmail: string | null
  fromName: string | null
  fromEmail: string
  subject: string | null
  snippet: string | null
  receivedAt: Date
  /** All messages in the thread are read. */
  isRead: boolean
  /** Any message in the thread is starred. */
  isStarred: boolean
  intent: string | null
  category: string | null
  patientId: string | null
  patientFirstName: string | null
  patientLastName: string | null
  totalCount: number
  unreadCount: number
}

export async function listThreadsForOrg(
  organizationId: string,
  opts: ListMessagesOpts = {},
): Promise<EmailThreadListItem[]> {
  try {
    // Step 1: messages matching the user's tab/intent/account filters at
    // the configured folder (default inbox). These determine which threads
    // are visible in this view.
    const messageLimit = (opts.limit ?? 100) * 3
    const inboxMessages = await listMessagesForOrg(organizationId, {
      ...opts,
      limit: messageLimit,
    })

    // Step 2: pull sent siblings of those threads so the user's own
    // replies show up in the thread row's latest-message position and
    // in the stacked conversation view. No category/intent filter on
    // this query — sent messages don't have those fields populated.
    const threadIds = Array.from(
      new Set(
        inboxMessages
          .map((m) => m.providerThreadId)
          .filter((t): t is string => !!t),
      ),
    )
    const sentMessages = threadIds.length > 0
      ? await listMessagesForOrg(organizationId, {
          folder: 'sent',
          threadIds,
          limit: messageLimit,
        })
      : []

    // Merge + sort by receivedAt desc so the latest message (whether
    // inbox or sent) sits at the head of each thread's group.
    const allMessages = [...inboxMessages, ...sentMessages].sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )

    interface Acc {
      threadId: string
      latest: EmailMessageListItem
      latestInbound: EmailMessageListItem | null
      total: number
      unread: number
      starred: boolean
    }
    const byThread = new Map<string, Acc>()
    for (const m of allMessages) {
      const tid = m.providerThreadId ?? m.id
      const isSent = m.folder === 'sent'
      const existing = byThread.get(tid)
      if (!existing) {
        byThread.set(tid, {
          threadId: tid,
          latest: m,
          latestInbound: isSent ? null : m,
          total: 1,
          unread: !isSent && !m.isRead ? 1 : 0,
          starred: m.isStarred,
        })
      } else {
        existing.total++
        if (!isSent && !m.isRead) existing.unread++
        if (m.isStarred) existing.starred = true
        // latest is set by first-iteration (already sorted desc by
        // receivedAt). For latestInbound we may need to backfill the
        // first non-sent we encounter.
        if (!isSent && !existing.latestInbound) existing.latestInbound = m
      }
    }

    const limit = opts.limit ?? 100
    return Array.from(byThread.values())
      .sort((a, b) => b.latest.receivedAt.getTime() - a.latest.receivedAt.getTime())
      .slice(0, limit)
      .map((t) => {
        // Show the OTHER party (latest inbound sender) in the row, even
        // when the user's outbound is the most recent activity — matches
        // Gmail's inbox-list mental model where the avatar/name = "who's
        // in this conversation with you", not "who spoke last".
        const partyInfo = t.latestInbound ?? t.latest
        return {
          threadId: t.threadId,
          latestMessageId: t.latest.id,
          accountId: t.latest.accountId,
          accountEmail: t.latest.accountEmail,
          fromName: partyInfo.fromName,
          fromEmail: partyInfo.fromEmail,
          subject: t.latest.subject,
          snippet: t.latest.snippet,
          receivedAt: t.latest.receivedAt,
          isRead: t.unread === 0,
          isStarred: t.starred,
          intent: partyInfo.intent,
          category: partyInfo.category,
          patientId: partyInfo.patientId,
          patientFirstName: partyInfo.patientFirstName,
          patientLastName: partyInfo.patientLastName,
          totalCount: t.total,
          unreadCount: t.unread,
        }
      })
  } catch (err) {
    if (isMissingSchemaError(err)) return []
    throw err
  }
}

/**
 * All messages in a thread, oldest first, plus aggregate metadata.
 * Drives the stacked conversation view in the right pane.
 */
export interface EmailThreadDetail {
  threadId: string
  subject: string | null
  category: string | null
  intent: string | null
  patientId: string | null
  accountId: string
  messages: EmailMessage[]
}

export async function getThreadDetail(
  threadId: string,
  organizationId: string,
): Promise<EmailThreadDetail | null> {
  const direct = await db
    .select()
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.providerThreadId, threadId),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
    .orderBy(schema.emailMessage.receivedAt)
  if (direct.length === 0) return null

  // Gmail's send response sometimes assigns a NEW providerThreadId to
  // our outbound reply even when we set In-Reply-To correctly (timing
  // or threading heuristic quirks). The reply row in our DB does
  // carry the original's Message-ID in its `in_reply_to` field, so we
  // can still link them. Pull any sent messages whose In-Reply-To
  // points at one of the Message-IDs in this thread, and any thread
  // whose messages reference one of *our* sent rfc_message_ids.
  const rfcIds = direct
    .map((m) => m.rfcMessageId)
    .filter((id): id is string => !!id)
  const directIds = new Set(direct.map((m) => m.id))

  let linked: EmailMessage[] = []
  if (rfcIds.length > 0) {
    linked = await db
      .select()
      .from(schema.emailMessage)
      .where(
        and(
          eq(schema.emailMessage.organizationId, organizationId),
          inArray(schema.emailMessage.inReplyTo, rfcIds),
        ),
      )
  }
  const additional = linked.filter((m) => !directIds.has(m.id))

  const messages = additional.length > 0
    ? [...direct, ...additional].sort(
        (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
      )
    : direct

  const latest = messages[messages.length - 1]
  return {
    threadId,
    // First message's subject is the "real" thread subject — replies
    // typically just prefix Re: / Fwd: to the same line.
    subject: messages[0].subject,
    category: latest.category,
    intent: latest.intent,
    patientId: messages.find((m) => m.patientId)?.patientId ?? null,
    accountId: latest.accountId,
    messages,
  }
}

/**
 * Find the thread id that contains the given message id. Used by the
 * inbox page to derive the active thread from the URL's `m=` param.
 */
export async function getThreadIdForMessage(
  messageId: string,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ providerThreadId: schema.emailMessage.providerThreadId })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.id, messageId),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
    .limit(1)
  return row?.providerThreadId ?? null
}

/**
 * Expand a list of thread ids to every message id in those threads,
 * scoped to one org. Used by the thread-level bulk ops below.
 */
async function expandThreadsToMessages(
  threadIds: string[],
  organizationId: string,
): Promise<string[]> {
  if (threadIds.length === 0) return []
  const rows = await db
    .select({ id: schema.emailMessage.id })
    .from(schema.emailMessage)
    .where(
      and(
        inArray(schema.emailMessage.providerThreadId, threadIds),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
  return rows.map((r) => r.id)
}

export async function bulkArchiveThreads(
  threadIds: string[],
  organizationId: string,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ count: number }> {
  const ids = await expandThreadsToMessages(threadIds, organizationId)
  return bulkArchive(ids, organizationId, actor)
}

export async function bulkTrashThreads(
  threadIds: string[],
  organizationId: string,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ count: number }> {
  const ids = await expandThreadsToMessages(threadIds, organizationId)
  return bulkTrash(ids, organizationId, actor)
}

export async function bulkSetThreadRead(
  threadIds: string[],
  organizationId: string,
  read: boolean,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ count: number }> {
  const ids = await expandThreadsToMessages(threadIds, organizationId)
  return bulkSetRead(ids, organizationId, read, actor)
}

export async function bulkSetThreadStarred(
  threadIds: string[],
  organizationId: string,
  starred: boolean,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ count: number }> {
  const ids = await expandThreadsToMessages(threadIds, organizationId)
  return bulkSetStarred(ids, organizationId, starred, actor)
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
        const resolvedHtml = await resolveInlineImages(accessToken, item.id, parsed.bodyHtml, full.payload)
        const gmailCat = categoryFromGmailLabels(parsed.labels)
        await db.insert(schema.emailMessage).values({
          id: randomUUID(),
          accountId,
          organizationId,
          patientId,
          providerMessageId: parsed.providerMessageId,
          providerThreadId: parsed.providerThreadId,
          rfcMessageId: parsed.rfcMessageId,
          inReplyTo: parsed.inReplyTo,
          folder: 'inbox',
          fromName: parsed.fromName,
          fromEmail: parsed.fromEmail,
          toEmails: parsed.toEmails,
          ccEmails: parsed.ccEmails,
          subject: parsed.subject,
          snippet: parsed.snippet,
          bodyText: parsed.bodyText,
          bodyHtml: resolvedHtml,
          isRead: parsed.isRead,
          labels: parsed.labels,
          category: gmailCat?.category ?? null,
          intent: gmailCat?.intent ?? null,
          categorySource: gmailCat ? 'gmail' : 'auto',
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
    // Notify connected SSE clients so they refresh without polling.
    // One notify per sync batch is enough — clients refresh and pull the
    // full updated thread list in one shot.
    if (added > 0) {
      await notifyInboxChange(organizationId, 'new_message')
    }
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
  actor?: InboxActor
}): Promise<{ id: string; threadId: string; localRecord: 'stored' | 'failed'; localError?: string }> {
  const account = await getAccount(opts.accountId, opts.organizationId)
  if (!account) throw new Error('Account not found')
  if (account.provider !== 'gmail') throw new Error('Only Gmail is supported right now')
  const accessToken = await getAccessToken(opts.accountId)
  const from = account.displayName ? `${account.displayName} <${account.emailAddress}>` : account.emailAddress
  const result = await gmailSend(accessToken, {
    from,
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    bodyText: opts.bodyText,
    bodyHtml: opts.bodyHtml,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
  })

  // Record the sent message in our local DB directly from the inputs +
  // Gmail's response. We deliberately don't re-fetch via getMessage:
  // Gmail's send isn't strongly consistent and the immediate read
  // frequently 404s, leaving the reply in Gmail but missing from our
  // thread view. The trade-off is no rfcMessageId yet — backfill picks
  // it up on the next page load.
  if (!result.id) {
    console.error('[mailbox.send] gmailSend returned no id', result)
    return { id: '', threadId: '', localRecord: 'failed', localError: 'gmail-send-no-id' }
  }
  try {
    const patientId = opts.to[0]
      ? await findPatientByEmail(opts.organizationId, opts.to[0])
      : null
    const snippet = opts.bodyText.replace(/\s+/g, ' ').trim().slice(0, 200)
    await db.insert(schema.emailMessage).values({
      id: randomUUID(),
      accountId: opts.accountId,
      organizationId: opts.organizationId,
      patientId,
      providerMessageId: result.id,
      providerThreadId: result.threadId ?? null,
      rfcMessageId: null,
      inReplyTo: opts.inReplyTo ?? null,
      folder: 'sent',
      fromName: account.displayName ?? null,
      fromEmail: account.emailAddress,
      toEmails: opts.to,
      ccEmails: opts.cc ?? [],
      subject: opts.subject,
      snippet,
      bodyText: opts.bodyText,
      bodyHtml: opts.bodyHtml ?? null,
      isRead: true,
      isStarred: false,
      labels: result.labelIds ?? [],
      category: null,
      intent: null,
      categorySource: 'auto',
      receivedAt: new Date(),
    })
    const actor = opts.actor ?? SYSTEM_ACTOR
    await logInboxAction({
      organizationId: opts.organizationId,
      messageId: result.id,
      threadId: result.threadId ?? null,
      action: 'send',
      actor,
      meta: { subject: opts.subject, replyTo: opts.inReplyTo ?? null },
    })
    // Notify any open inbox tabs so the sent reply shows up in the
    // thread without a manual refresh on other devices/tabs.
    await notifyInboxChange(opts.organizationId, 'updated', {
      messageId: result.id,
      threadId: result.threadId,
      actor,
    })
    return { id: result.id, threadId: result.threadId ?? '', localRecord: 'stored' }
  } catch (err) {
    // Don't throw — the send already succeeded on Gmail's side; the user
    // shouldn't be told their reply failed. Surface the local-write
    // failure to the caller so the UI can react (refresh, show a
    // warning, log diagnostics).
    const msg = (err as Error).message ?? String(err)
    console.error('[mailbox.send] failed to record sent message locally', err)
    return { id: result.id, threadId: result.threadId ?? '', localRecord: 'failed', localError: msg }
  }
}

/**
 * Bulk variants are the single source of truth for per-message
 * mutations. One SQL UPDATE for the local state, then one Gmail
 * batchModify per affected account (or per-id fallback for trash since
 * Gmail has no batch-trash endpoint). All Gmail calls are best-effort;
 * local state always wins. Single-row callers pass a 1-element array.
 */

async function fetchMessageRefs(
  messageIds: string[],
  organizationId: string,
): Promise<Array<{ id: string; accountId: string; providerMessageId: string; providerThreadId: string | null }>> {
  if (messageIds.length === 0) return []
  return db
    .select({
      id: schema.emailMessage.id,
      accountId: schema.emailMessage.accountId,
      providerMessageId: schema.emailMessage.providerMessageId,
      providerThreadId: schema.emailMessage.providerThreadId,
    })
    .from(schema.emailMessage)
    .where(
      and(
        inArray(schema.emailMessage.id, messageIds),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
}

/**
 * Build audit-log entries from a fetched ref list. One entry per
 * message, with thread context so an agent can query by thread.
 */
function refsToAuditEntries(
  refs: Array<{ id: string; providerThreadId: string | null }>,
  organizationId: string,
  action: InboxAction,
  actor: InboxActor,
  meta?: Record<string, unknown>,
): InboxActionEntry[] {
  return refs.map((r) => ({
    organizationId,
    messageId: r.id,
    threadId: r.providerThreadId,
    action,
    actor,
    meta,
  }))
}

function groupByAccount<T extends { accountId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const list = m.get(r.accountId)
    if (list) list.push(r)
    else m.set(r.accountId, [r])
  }
  return m
}

async function mirrorLabelsToGmail(
  refs: Array<{ accountId: string; providerMessageId: string }>,
  add: string[],
  remove: string[],
): Promise<void> {
  const byAccount = groupByAccount(refs)
  await Promise.allSettled(
    Array.from(byAccount.entries()).map(async ([accountId, items]) => {
      try {
        const token = await getAccessToken(accountId)
        await gmailBatchModifyLabels(token, items.map((i) => i.providerMessageId), add, remove)
      } catch (err) {
        console.warn('[mailbox] bulk gmail label sync failed', err)
      }
    }),
  )
}

export async function bulkSetRead(
  messageIds: string[],
  organizationId: string,
  read: boolean,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ count: number }> {
  const refs = await fetchMessageRefs(messageIds, organizationId)
  if (refs.length === 0) return { count: 0 }
  await db
    .update(schema.emailMessage)
    .set({ isRead: read })
    .where(
      and(
        inArray(schema.emailMessage.id, refs.map((r) => r.id)),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
  await mirrorLabelsToGmail(refs, read ? [] : ['UNREAD'], read ? ['UNREAD'] : [])
  await logInboxActionsBulk(refsToAuditEntries(refs, organizationId, read ? 'mark_read' : 'mark_unread', actor))
  return { count: refs.length }
}

export async function bulkSetStarred(
  messageIds: string[],
  organizationId: string,
  starred: boolean,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ count: number }> {
  const refs = await fetchMessageRefs(messageIds, organizationId)
  if (refs.length === 0) return { count: 0 }
  await db
    .update(schema.emailMessage)
    .set({ isStarred: starred })
    .where(
      and(
        inArray(schema.emailMessage.id, refs.map((r) => r.id)),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
  await mirrorLabelsToGmail(refs, starred ? ['STARRED'] : [], starred ? [] : ['STARRED'])
  await logInboxActionsBulk(refsToAuditEntries(refs, organizationId, starred ? 'star' : 'unstar', actor))
  return { count: refs.length }
}

export async function bulkArchive(
  messageIds: string[],
  organizationId: string,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ count: number }> {
  const refs = await fetchMessageRefs(messageIds, organizationId)
  if (refs.length === 0) return { count: 0 }
  await db
    .update(schema.emailMessage)
    .set({ folder: 'archive' })
    .where(
      and(
        inArray(schema.emailMessage.id, refs.map((r) => r.id)),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
  await mirrorLabelsToGmail(refs, [], ['INBOX'])
  await logInboxActionsBulk(refsToAuditEntries(refs, organizationId, 'archive', actor))
  return { count: refs.length }
}

export async function bulkTrash(
  messageIds: string[],
  organizationId: string,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ count: number }> {
  const refs = await fetchMessageRefs(messageIds, organizationId)
  if (refs.length === 0) return { count: 0 }
  await db
    .update(schema.emailMessage)
    .set({ folder: 'trash' })
    .where(
      and(
        inArray(schema.emailMessage.id, refs.map((r) => r.id)),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
  // Gmail has no batch-trash endpoint — fall back to parallel per-message
  // calls. Still cheap enough for typical bulk sizes (a few dozen) and
  // best-effort if any individual call fails.
  await Promise.allSettled(
    refs.map(async (r) => {
      try {
        const token = await getAccessToken(r.accountId)
        await gmailTrash(token, r.providerMessageId)
      } catch (err) {
        console.warn('[mailbox] bulk gmail trash sync failed', err)
      }
    }),
  )
  await logInboxActionsBulk(refsToAuditEntries(refs, organizationId, 'trash', actor))
  return { count: refs.length }
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
    const resolvedHtml = await resolveInlineImages(accessToken, providerMessageId, parsed.bodyHtml, full.payload)
    const gmailCat = categoryFromGmailLabels(parsed.labels)
    const localId = randomUUID()
    await db.insert(schema.emailMessage).values({
      id: localId,
      accountId,
      organizationId,
      patientId,
      providerMessageId: parsed.providerMessageId,
      providerThreadId: parsed.providerThreadId,
      rfcMessageId: parsed.rfcMessageId,
      inReplyTo: parsed.inReplyTo,
      folder: 'inbox',
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail,
      toEmails: parsed.toEmails,
      ccEmails: parsed.ccEmails,
      subject: parsed.subject,
      snippet: parsed.snippet,
      bodyText: parsed.bodyText,
      bodyHtml: resolvedHtml,
      isRead: parsed.isRead,
      labels: parsed.labels,
      category: gmailCat?.category ?? null,
      intent: gmailCat?.intent ?? null,
      categorySource: gmailCat ? 'gmail' : 'auto',
      receivedAt: parsed.receivedAt,
    })
    await logInboxAction({
      organizationId,
      messageId: localId,
      threadId: parsed.providerThreadId,
      action: 'ingest',
      actor: SYSTEM_ACTOR,
      meta: { fromEmail: parsed.fromEmail, subject: parsed.subject },
    })

    // Surface to org members. Use the `comments` bucket — that's the
    // "Patient activity / Customer activity" toggle on the prefs page.
    // We intentionally fire before classification runs so the team sees
    // new mail immediately; the classifier later may move it to a Promotions
    // tab, but the user-facing notification was already accurate at moment
    // of arrival.
    const fromLabel = parsed.fromName
      ? `${parsed.fromName} <${parsed.fromEmail}>`
      : parsed.fromEmail
    const { notifyOrgMembers } = await import('./notifications')
    await notifyOrgMembers(
      organizationId,
      {
        bucket: 'comments',
        type: 'inbox_message',
        title: parsed.subject?.trim() || '(no subject)',
        body: `From ${fromLabel}${parsed.snippet ? ` — ${parsed.snippet.slice(0, 120)}` : ''}`,
        linkPath: `/inbox?m=${parsed.providerMessageId}`,
        meta: { providerMessageId: parsed.providerMessageId, accountId },
      },
      { roles: ['owner', 'admin'] },
    )
    // Push to any open inbox tabs — this is the path that fires when
    // Gmail Pub/Sub delivers a new-mail event in real time.
    await notifyInboxChange(organizationId, 'new_message', {
      messageId: localId,
      threadId: parsed.providerThreadId,
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
 * Backfill: find messages whose HTML body still contains `cid:` references
 * (i.e. ingested before resolveInlineImages was wired in) and re-process
 * them. Each re-process is one Gmail getMessage + N attachment fetches, so
 * we cap aggressively to bound page-load latency. Self-terminates once the
 * backlog is drained — subsequent runs return immediately since resolved
 * HTML no longer contains `cid:`.
 */
export async function resolvePendingInlineImages(
  organizationId: string,
  opts: { limit?: number } = {},
): Promise<{ resolved: number }> {
  const limit = opts.limit ?? 10
  const rows = await db
    .select({
      id: schema.emailMessage.id,
      accountId: schema.emailMessage.accountId,
      providerMessageId: schema.emailMessage.providerMessageId,
    })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.organizationId, organizationId),
        sql`${schema.emailMessage.bodyHtml} LIKE '%cid:%'`,
      ),
    )
    .limit(limit)
  if (rows.length === 0) return { resolved: 0 }
  let resolved = 0
  for (const row of rows) {
    try {
      const accessToken = await getAccessToken(row.accountId)
      const full = await getMessage(accessToken, row.providerMessageId)
      const parsed = parseGmailMessage(full)
      const newHtml = await resolveInlineImages(accessToken, row.providerMessageId, parsed.bodyHtml, full.payload)
      if (newHtml && !newHtml.includes('cid:')) {
        // All cids resolved — write back.
        await db
          .update(schema.emailMessage)
          .set({ bodyHtml: newHtml })
          .where(eq(schema.emailMessage.id, row.id))
        resolved++
      } else if (newHtml && newHtml !== parsed.bodyHtml) {
        // Partial resolution still beats none — save what we got.
        await db
          .update(schema.emailMessage)
          .set({ bodyHtml: newHtml })
          .where(eq(schema.emailMessage.id, row.id))
        resolved++
      }
    } catch (err) {
      console.warn(`[mailbox.inline-backfill] ${row.providerMessageId} failed:`, (err as Error).message)
    }
  }
  return { resolved }
}

/**
 * Just-in-time backfill of one message's RFC headers right before a Reply
 * goes out. Avoids the race where the page-load backfill hasn't reached
 * this specific row yet — the reply path *must* have a Message-ID to
 * pass to In-Reply-To, otherwise Gmail starts a new thread on the
 * recipient side and our own sent-ingest stores it under a different
 * providerThreadId. Returns the updated values or the originals if the
 * fetch fails (best-effort).
 */
export async function ensureRfcMessageId(
  messageId: string,
  organizationId: string,
): Promise<{ rfcMessageId: string | null; inReplyTo: string | null } | null> {
  const [row] = await db
    .select({
      id: schema.emailMessage.id,
      accountId: schema.emailMessage.accountId,
      providerMessageId: schema.emailMessage.providerMessageId,
      rfcMessageId: schema.emailMessage.rfcMessageId,
      inReplyTo: schema.emailMessage.inReplyTo,
    })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.id, messageId),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!row) return null
  if (row.rfcMessageId) {
    return { rfcMessageId: row.rfcMessageId, inReplyTo: row.inReplyTo }
  }
  try {
    const accessToken = await getAccessToken(row.accountId)
    const full = await getMessage(accessToken, row.providerMessageId)
    const parsed = parseGmailMessage(full)
    if (parsed.rfcMessageId) {
      await db
        .update(schema.emailMessage)
        .set({ rfcMessageId: parsed.rfcMessageId, inReplyTo: parsed.inReplyTo })
        .where(eq(schema.emailMessage.id, row.id))
      return { rfcMessageId: parsed.rfcMessageId, inReplyTo: parsed.inReplyTo }
    }
  } catch (err) {
    console.warn('[mailbox.ensure-rfc-id] fetch failed', err)
  }
  return { rfcMessageId: null, inReplyTo: row.inReplyTo }
}

/**
 * Re-fetch headers for messages that were ingested before we started
 * storing the RFC 5322 Message-ID + In-Reply-To. Bounded per call so the
 * inbox page can fire-and-forget it. Without this, Reply on any older
 * thread sends without In-Reply-To/References and the recipient's mail
 * client opens it as a brand-new conversation (and the spam filter
 * notices).
 */
export async function backfillRfcMessageIds(
  organizationId: string,
  opts: { limit?: number } = {},
): Promise<{ updated: number; checked: number }> {
  const limit = opts.limit ?? 30
  const rows = await db
    .select({
      id: schema.emailMessage.id,
      accountId: schema.emailMessage.accountId,
      providerMessageId: schema.emailMessage.providerMessageId,
    })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.organizationId, organizationId),
        isNull(schema.emailMessage.rfcMessageId),
      ),
    )
    .limit(limit)
  if (rows.length === 0) return { updated: 0, checked: 0 }
  let updated = 0
  for (const row of rows) {
    try {
      const accessToken = await getAccessToken(row.accountId)
      const full = await getMessage(accessToken, row.providerMessageId)
      const parsed = parseGmailMessage(full)
      if (parsed.rfcMessageId || parsed.inReplyTo) {
        await db
          .update(schema.emailMessage)
          .set({
            rfcMessageId: parsed.rfcMessageId,
            inReplyTo: parsed.inReplyTo,
          })
          .where(eq(schema.emailMessage.id, row.id))
        if (parsed.rfcMessageId) updated++
      }
    } catch (err) {
      console.warn(`[mailbox.rfc-backfill] ${row.providerMessageId} failed:`, (err as Error).message)
    }
  }
  return { updated, checked: rows.length }
}

/**
 * Move a message to a different category as a manual override.
 * Propagates to every other message in the same thread so the whole
 * conversation moves together (matches Gmail's mental model).
 * categorySource reflects the actor — 'user' or 'agent' — so the
 * classifier never overwrites this and other code paths can attribute
 * the change.
 */
export async function setMessageCategory(
  messageId: string,
  organizationId: string,
  category: EmailCategory,
  actor: InboxActor = SYSTEM_ACTOR,
): Promise<{ updated: number }> {
  const [msg] = await db
    .select({
      providerThreadId: schema.emailMessage.providerThreadId,
    })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.id, messageId),
        eq(schema.emailMessage.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!msg) return { updated: 0 }

  // Agent and system both write authoritative source='agent' / 'user'
  // values so the classifier won't undo them. We only ever set 'user'
  // for actor.kind==='user' to keep the existing semantic.
  const source =
    actor.kind === 'user' ? 'user' : actor.kind === 'agent' ? 'agent' : 'user'

  let updatedIds: string[] = []
  if (msg.providerThreadId) {
    const result = await db
      .update(schema.emailMessage)
      .set({ category, categorySource: source })
      .where(
        and(
          eq(schema.emailMessage.providerThreadId, msg.providerThreadId),
          eq(schema.emailMessage.organizationId, organizationId),
        ),
      )
      .returning({ id: schema.emailMessage.id })
    updatedIds = result.map((r) => r.id)
  } else {
    await db
      .update(schema.emailMessage)
      .set({ category, categorySource: source })
      .where(
        and(
          eq(schema.emailMessage.id, messageId),
          eq(schema.emailMessage.organizationId, organizationId),
        ),
      )
    updatedIds = [messageId]
  }

  await logInboxAction({
    organizationId,
    messageId,
    threadId: msg.providerThreadId ?? null,
    action: 'category_set',
    actor,
    meta: { category, applied: updatedIds.length },
  })
  await notifyInboxChange(organizationId, 'updated', {
    messageId,
    threadId: msg.providerThreadId,
    actor,
  })
  return { updated: updatedIds.length }
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
): Promise<{ classified: number; pending: number; viaHeuristic: number }> {
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
      providerThreadId: schema.emailMessage.providerThreadId,
      patientId: schema.emailMessage.patientId,
      labels: schema.emailMessage.labels,
    })
    .from(schema.emailMessage)
    .where(
      and(
        eq(schema.emailMessage.organizationId, organizationId),
        isNull(schema.emailMessage.category),
      ),
    )
    .limit(limit)
  if (rows.length === 0) return { classified: 0, pending: 0, viaHeuristic: 0 }

  // Pull thread-level category state in one query so we can inherit
  // user/inherit/gmail decisions without an N+1 lookup. Only consider
  // threads that have at least one "sticky" classification (user choice,
  // inherited from one, or Gmail's own label) — pure-auto siblings are
  // not authoritative.
  const threadIds = Array.from(
    new Set(rows.map((r) => r.providerThreadId).filter((t): t is string => !!t)),
  )
  type ThreadHint = { category: EmailCategory; intent: EmailIntent }
  const threadHints = new Map<string, ThreadHint>()
  if (threadIds.length > 0) {
    const siblings = await db
      .select({
        providerThreadId: schema.emailMessage.providerThreadId,
        category: schema.emailMessage.category,
        intent: schema.emailMessage.intent,
        categorySource: schema.emailMessage.categorySource,
      })
      .from(schema.emailMessage)
      .where(
        and(
          eq(schema.emailMessage.organizationId, organizationId),
          inArray(schema.emailMessage.providerThreadId, threadIds),
          inArray(schema.emailMessage.categorySource, ['user', 'inherit', 'gmail', 'agent']),
        ),
      )
    for (const s of siblings) {
      if (!s.providerThreadId || !s.category) continue
      // First sibling wins; in practice they should all agree because
      // inherit/user propagate to the whole thread when they're set.
      if (!threadHints.has(s.providerThreadId)) {
        threadHints.set(s.providerThreadId, {
          category: s.category as EmailCategory,
          intent: (s.intent ?? 'other') as EmailIntent,
        })
      }
    }
  }

  // Apply cheap heuristics first. Anything that lands here doesn't hit
  // Haiku — that's both faster and more accurate (we know more about
  // the sender than the LLM does from from/subject/body alone).
  const heuristicHits: Array<{
    id: string
    category: EmailCategory
    intent: EmailIntent
    source: 'inherit' | 'auto' | 'gmail'
  }> = []
  const needsLlm: typeof rows = []
  for (const row of rows) {
    // Gmail's own SPAM / CATEGORY_* labels — most authoritative signal
    // we have. Already applied at ingest, but lives here too so a
    // reclassify pass over older messages picks it up.
    const gmailCat = categoryFromGmailLabels(row.labels)
    if (gmailCat) {
      heuristicHits.push({ id: row.id, category: gmailCat.category, intent: gmailCat.intent, source: 'gmail' })
      continue
    }
    const hint = row.providerThreadId ? threadHints.get(row.providerThreadId) : undefined
    if (hint) {
      heuristicHits.push({ id: row.id, category: hint.category, intent: hint.intent, source: 'inherit' })
      continue
    }
    // Known sender (already linked to a patient/customer) → almost
    // certainly a real human writing to us. Treat as primary, mark as
    // an auto decision so the user can still override.
    if (row.patientId) {
      heuristicHits.push({ id: row.id, category: 'primary', intent: 'follow_up', source: 'auto' })
      continue
    }
    // Consumer-domain sender (gmail.com, yahoo.com, etc.) → almost
    // always a real person. Marketing blasts come from owned domains
    // with newsletter infrastructure, not personal gmail accounts.
    // This catches prospects, partners, and self-sent test emails
    // (which the LLM has been mis-flagging as spam because the body
    // mentions the word "spam").
    if (isConsumerSender(row.fromEmail)) {
      heuristicHits.push({ id: row.id, category: 'primary', intent: 'follow_up', source: 'auto' })
      continue
    }
    needsLlm.push(row)
  }

  // Batch the heuristic UPDATEs by their (category, intent, source)
  // tuple so we issue a handful of queries instead of one per row.
  // In practice 50 ingested messages typically split across 3-4 tuples
  // → 3-4 UPDATEs instead of 50. Same trick below for the LLM results.
  const viaHeuristic = await applyClassificationGroups(heuristicHits)

  if (needsLlm.length === 0) {
    return { classified: viaHeuristic, pending: 0, viaHeuristic }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[mailbox.classify] ANTHROPIC_API_KEY not set — heuristics only')
    return { classified: viaHeuristic, pending: needsLlm.length, viaHeuristic }
  }

  const results = await classifyBatch(needsLlm)
  const llmHits = Array.from(results.entries()).map(([id, { category, intent }]) => ({
    id,
    category,
    intent,
    source: 'auto' as const,
  }))
  const classifiedByLlm = await applyClassificationGroups(llmHits)

  return {
    classified: viaHeuristic + classifiedByLlm,
    pending: needsLlm.length - classifiedByLlm,
    viaHeuristic,
  }
}

/**
 * Bulk-apply a list of { id, category, intent, source } classifications.
 * Groups by (category, intent, source) so all rows in the same bucket
 * get one UPDATE with `WHERE id IN (...)` instead of one query per row.
 */
async function applyClassificationGroups(
  hits: Array<{ id: string; category: EmailCategory; intent: EmailIntent; source: string }>,
): Promise<number> {
  if (hits.length === 0) return 0
  const groups = new Map<string, { category: EmailCategory; intent: EmailIntent; source: string; ids: string[] }>()
  for (const hit of hits) {
    const key = `${hit.category}|${hit.intent}|${hit.source}`
    const existing = groups.get(key)
    if (existing) existing.ids.push(hit.id)
    else groups.set(key, { category: hit.category, intent: hit.intent, source: hit.source, ids: [hit.id] })
  }
  let updated = 0
  for (const g of Array.from(groups.values())) {
    await db
      .update(schema.emailMessage)
      .set({ category: g.category, intent: g.intent, categorySource: g.source })
      .where(inArray(schema.emailMessage.id, g.ids))
    updated += g.ids.length
  }
  return updated
}

/**
 * One-shot backlog repair: nulls out the category on every message that
 * was set by the auto-classifier (leaving user / inherit / gmail rows
 * untouched), then runs classifyPendingIntents in batches over the whole
 * org until the backlog drains. Used by the "Reclassify everything"
 * button in inbox settings after we ship classifier improvements so
 * historical mis-categorizations get corrected.
 */
export async function reclassifyAll(
  organizationId: string,
  opts: { batchSize?: number; maxBatches?: number } = {},
): Promise<{ reset: number; classified: number; viaHeuristic: number; remaining: number }> {
  const batchSize = opts.batchSize ?? 200
  const maxBatches = opts.maxBatches ?? 50

  // Reset everything the user / Gmail / thread didn't decide on. Returns
  // the row ids so we can report how many were reset.
  const resetRows = await db
    .update(schema.emailMessage)
    .set({ category: null, intent: null })
    .where(
      and(
        eq(schema.emailMessage.organizationId, organizationId),
        eq(schema.emailMessage.categorySource, 'auto'),
      ),
    )
    .returning({ id: schema.emailMessage.id })
  const reset = resetRows.length
  if (reset === 0) return { reset: 0, classified: 0, viaHeuristic: 0, remaining: 0 }

  let totalClassified = 0
  let totalHeuristic = 0
  let remaining = reset
  for (let i = 0; i < maxBatches && remaining > 0; i++) {
    const result = await classifyPendingIntents(organizationId, { limit: batchSize })
    if (result.classified === 0 && result.pending === 0) break
    totalClassified += result.classified
    totalHeuristic += result.viaHeuristic
    remaining = result.pending
    if (result.classified === 0) break // nothing moved → bail to avoid infinite loop
  }
  return {
    reset,
    classified: totalClassified,
    viaHeuristic: totalHeuristic,
    remaining,
  }
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
