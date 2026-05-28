import 'server-only'
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'

/**
 * Patient Communications service. Unified per-patient threads across
 * channels (in-app, email, sms-Phase-B). Front-style team-inbox
 * abstraction translated to dental.
 *
 * Design choices:
 *   - One thread per (organization, patient) — enforced by unique index.
 *     Channel is per-message, not per-thread. Replies pick channel based
 *     on the last inbound channel.
 *   - Existing email_message rows (Gmail integration) are aggregated into
 *     the thread view at read time via the patientId FK that's already
 *     set on ingest. We do NOT dupe email rows into patient_message.
 *   - Outbound messages always create a patient_message row. If channel
 *     is 'email', the existing Gmail send path (lib/services/gmail.ts)
 *     should fire alongside this insert; for v1 we just record the row
 *     and let a follow-up wire the actual delivery.
 */

// ── Shared filters ───────────────────────────────────────────────────

/**
 * The "Open" inbox filter — what shows in the default thread list and
 * what the "Open N" badge counts. Used by both `listPatientThreads` and
 * `getInboxStats` so the count never drifts from the rendered list.
 *
 * Includes:
 *   - threads with `status='open'`
 *   - threads with `status='snoozed'` whose `snoozedUntil` has passed
 *     (the auto-resurface behavior — the snooze timer expired, the
 *     thread is back in the inbox, but `status` hasn't been flipped
 *     to 'open' yet because nobody's opened it post-resurface)
 */
function openThreadFilter(now: Date) {
  return or(
    eq(schema.patientThread.status, 'open'),
    and(
      eq(schema.patientThread.status, 'snoozed'),
      isNotNull(schema.patientThread.snoozedUntil),
      lte(schema.patientThread.snoozedUntil, now),
    ),
  )!
}

// ── Types ────────────────────────────────────────────────────────────

export type ThreadStatus = 'open' | 'snoozed' | 'archived'
export type MessageChannel = 'in_app' | 'email' | 'sms'
export type MessageDirection = 'inbound' | 'outbound'

export interface ThreadRow {
  id: string
  patientId: string
  patientFirstName: string
  patientLastName: string
  patientEmail: string | null
  patientPhone: string | null
  status: ThreadStatus
  assignedUserId: string | null
  assignedUserName: string | null
  snoozedUntil: Date | null
  lastMessageAt: Date | null
  lastMessageDirection: MessageDirection | null
  lastMessageChannel: MessageChannel | null
  lastMessagePreview: string | null
  unreadCount: number
  createdAt: Date
}

export interface ThreadMessage {
  id: string
  /** Which table the row came from — drives action permissions. */
  source: 'patient_message' | 'email_message'
  channel: MessageChannel
  direction: MessageDirection
  body: string
  /** Email-only fields, undefined for in-app/sms. */
  subject?: string | null
  fromName?: string | null
  fromEmail?: string | null
  sentAt: Date
  sentByUserId?: string | null
  sentByUserName?: string | null
  externalId?: string | null
}

export interface ThreadFilters {
  status?: ThreadStatus | 'all'
  assignedTo?: 'me' | 'unassigned' | 'all'
  search?: string
  hasUnread?: boolean
  /** Default: open + non-snoozed first */
  sort?: 'recent' | 'oldest_unanswered'
}

export interface InboxStats {
  open: number
  unread: number
  snoozedAvailable: number    // snoozed threads whose snoozedUntil has passed
  archived: number
}

// ── ID helpers ───────────────────────────────────────────────────────

function newThreadId(): string {
  return `pthread_${randomBytes(10).toString('hex')}`
}

function newMessageId(): string {
  return `pmsg_${randomBytes(10).toString('hex')}`
}

// ── Validation helpers ───────────────────────────────────────────────

/**
 * Defensive cross-tenant check. Several entry points take a patientId
 * from a caller-supplied value (sendMessageAction, future SMS webhooks)
 * — if the patientId belongs to a different org we'd silently create a
 * thread for that foreign patient inside this org, leaking the patient's
 * name/email/phone back to the caller via the inbox JOINs. Every write
 * path that takes a caller-supplied patientId runs this first.
 */
async function assertPatientInOrg(organizationId: string, patientId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.id, patientId),
        eq(schema.patient.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!row) throw new Error('Patient not found in this organization')
}

/**
 * Same shape as assertPatientInOrg, but for the `member` table. Used to
 * gate thread assignment so a clinic admin can't assign a thread to a
 * user from a different org (which would surface that user's name via
 * the inbox JOIN).
 */
async function assertUserInOrg(organizationId: string, userId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.userId, userId),
        eq(schema.member.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!row) throw new Error('Assignee is not a member of this organization')
}

const VALID_CHANNELS: ReadonlySet<MessageChannel> = new Set<MessageChannel>(['in_app', 'email', 'sms'])

function assertValidChannel(channel: string): asserts channel is MessageChannel {
  if (!VALID_CHANNELS.has(channel as MessageChannel)) {
    throw new Error(`Invalid channel: ${channel}`)
  }
}

/**
 * Generous upper bound on a single message body. Patient + staff text
 * runs at most a few paragraphs in practice; this is a defensive cap
 * against pathological / accidental megabyte-sized inputs hitting the
 * DB. Real SMS will need its own per-segment limit at the send adapter.
 */
const MAX_MESSAGE_LENGTH = 8000

function assertBodyWithinLimit(body: string): void {
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message body exceeds ${MAX_MESSAGE_LENGTH} character limit`)
  }
}

// ── Inbox list ───────────────────────────────────────────────────────

/**
 * List patient threads in the org's unified inbox, filtered + sorted.
 * Joins patient (for name/contact preview) + assignee + the most-recent
 * patient_message (for body preview). Excludes archived by default.
 */
export async function listPatientThreads(
  organizationId: string,
  currentUserId: string,
  filters: ThreadFilters = {},
): Promise<ThreadRow[]> {
  const where = [eq(schema.patientThread.organizationId, organizationId)]

  if (filters.status === 'archived') {
    where.push(eq(schema.patientThread.status, 'archived'))
  } else if (filters.status === 'snoozed') {
    where.push(eq(schema.patientThread.status, 'snoozed'))
  } else if (filters.status === 'open' || filters.status === undefined) {
    where.push(openThreadFilter(new Date()))
  }
  // 'all' = no status filter

  if (filters.assignedTo === 'me') {
    where.push(eq(schema.patientThread.assignedUserId, currentUserId))
  } else if (filters.assignedTo === 'unassigned') {
    where.push(isNull(schema.patientThread.assignedUserId))
  }

  if (filters.hasUnread) {
    where.push(sql`${schema.patientThread.unreadCountForClinic} > 0`)
  }

  // Join patient + assignee + latest message preview.
  // Latest preview is fetched in a subquery for efficiency vs. a JS roll-up.
  const rows = await db
    .select({
      id: schema.patientThread.id,
      patientId: schema.patient.id,
      patientFirstName: schema.patient.firstName,
      patientLastName: schema.patient.lastName,
      patientEmail: schema.patient.email,
      patientPhone: schema.patient.phone,
      status: schema.patientThread.status,
      assignedUserId: schema.patientThread.assignedUserId,
      assignedUserName: schema.user.name,
      snoozedUntil: schema.patientThread.snoozedUntil,
      lastMessageAt: schema.patientThread.lastMessageAt,
      lastMessageDirection: schema.patientThread.lastMessageDirection,
      lastMessageChannel: schema.patientThread.lastMessageChannel,
      unreadCount: schema.patientThread.unreadCountForClinic,
      createdAt: schema.patientThread.createdAt,
      lastMessagePreview: sql<string | null>`(
        select body from ${schema.patientMessage} m
        where m.thread_id = ${schema.patientThread.id}
        order by m.sent_at desc limit 1
      )`,
    })
    .from(schema.patientThread)
    .innerJoin(schema.patient, eq(schema.patientThread.patientId, schema.patient.id))
    .leftJoin(schema.user, eq(schema.patientThread.assignedUserId, schema.user.id))
    .where(and(...where))
    .orderBy(desc(schema.patientThread.lastMessageAt))

  let filtered = rows
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase()
    // Strip non-digits from the phone for a forgiving phone search —
    // "(512) 555-9117" should match a query of "5125559117" or "9117".
    const qDigits = q.replace(/\D/g, '')
    filtered = rows.filter((r) => {
      const name = `${r.patientFirstName} ${r.patientLastName}`.toLowerCase()
      const preview = (r.lastMessagePreview ?? '').toLowerCase()
      const phoneDigits = (r.patientPhone ?? '').replace(/\D/g, '')
      return name.includes(q)
        || (r.patientEmail ?? '').toLowerCase().includes(q)
        || preview.includes(q)
        || (qDigits.length > 0 && phoneDigits.includes(qDigits))
    })
  }

  return filtered.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientFirstName: r.patientFirstName,
    patientLastName: r.patientLastName,
    patientEmail: r.patientEmail,
    patientPhone: r.patientPhone,
    status: r.status as ThreadStatus,
    assignedUserId: r.assignedUserId,
    assignedUserName: r.assignedUserName,
    snoozedUntil: r.snoozedUntil,
    lastMessageAt: r.lastMessageAt,
    lastMessageDirection: r.lastMessageDirection as MessageDirection | null,
    lastMessageChannel: r.lastMessageChannel as MessageChannel | null,
    lastMessagePreview: r.lastMessagePreview,
    unreadCount: r.unreadCount,
    createdAt: r.createdAt,
  }))
}

// ── Inbox stats (for sidebar badges) ─────────────────────────────────

export async function getInboxStats(
  organizationId: string,
  currentUserId: string,
): Promise<InboxStats> {
  const now = new Date()
  const openFilter = openThreadFilter(now)
  const [openCount, unreadCount, snoozedAvail, archivedCount] = await Promise.all([
    db
      .select({ c: count() })
      .from(schema.patientThread)
      .where(
        and(
          eq(schema.patientThread.organizationId, organizationId),
          openFilter,
        ),
      )
      .then((rows) => rows[0]?.c ?? 0),
    db
      .select({ c: count() })
      .from(schema.patientThread)
      .where(
        and(
          eq(schema.patientThread.organizationId, organizationId),
          openFilter,
          sql`${schema.patientThread.unreadCountForClinic} > 0`,
        ),
      )
      .then((rows) => rows[0]?.c ?? 0),
    db
      .select({ c: count() })
      .from(schema.patientThread)
      .where(
        and(
          eq(schema.patientThread.organizationId, organizationId),
          eq(schema.patientThread.status, 'snoozed'),
          isNotNull(schema.patientThread.snoozedUntil),
          lte(schema.patientThread.snoozedUntil, now),
        ),
      )
      .then((rows) => rows[0]?.c ?? 0),
    db
      .select({ c: count() })
      .from(schema.patientThread)
      .where(
        and(
          eq(schema.patientThread.organizationId, organizationId),
          eq(schema.patientThread.status, 'archived'),
        ),
      )
      .then((rows) => rows[0]?.c ?? 0),
  ])

  // Use currentUserId in a follow-up "assigned to me" badge — accepted as
  // an arg now so we don't break the API signature when we add it.
  void currentUserId

  return {
    open: Number(openCount),
    unread: Number(unreadCount),
    snoozedAvailable: Number(snoozedAvail),
    archived: Number(archivedCount),
  }
}

// ── Thread detail + messages ─────────────────────────────────────────

/**
 * Get a single thread with patient context. Returns null if not found
 * or not in this org.
 */
export async function getPatientThreadById(
  organizationId: string,
  threadId: string,
): Promise<ThreadRow | null> {
  const [row] = await db
    .select({
      id: schema.patientThread.id,
      patientId: schema.patient.id,
      patientFirstName: schema.patient.firstName,
      patientLastName: schema.patient.lastName,
      patientEmail: schema.patient.email,
      patientPhone: schema.patient.phone,
      status: schema.patientThread.status,
      assignedUserId: schema.patientThread.assignedUserId,
      assignedUserName: schema.user.name,
      snoozedUntil: schema.patientThread.snoozedUntil,
      lastMessageAt: schema.patientThread.lastMessageAt,
      lastMessageDirection: schema.patientThread.lastMessageDirection,
      lastMessageChannel: schema.patientThread.lastMessageChannel,
      unreadCount: schema.patientThread.unreadCountForClinic,
      createdAt: schema.patientThread.createdAt,
    })
    .from(schema.patientThread)
    .innerJoin(schema.patient, eq(schema.patientThread.patientId, schema.patient.id))
    .leftJoin(schema.user, eq(schema.patientThread.assignedUserId, schema.user.id))
    .where(
      and(
        eq(schema.patientThread.id, threadId),
        eq(schema.patientThread.organizationId, organizationId),
      ),
    )
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    patientId: row.patientId,
    patientFirstName: row.patientFirstName,
    patientLastName: row.patientLastName,
    patientEmail: row.patientEmail,
    patientPhone: row.patientPhone,
    status: row.status as ThreadStatus,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUserName,
    snoozedUntil: row.snoozedUntil,
    lastMessageAt: row.lastMessageAt,
    lastMessageDirection: row.lastMessageDirection as MessageDirection | null,
    lastMessageChannel: row.lastMessageChannel as MessageChannel | null,
    lastMessagePreview: null,
    unreadCount: row.unreadCount,
    createdAt: row.createdAt,
  }
}

/**
 * Get the unified message stream for a thread: patient_message rows +
 * email_message rows (linked to the same patient) merged + sorted.
 * Returns ThreadMessage[] in chronological order.
 *
 * v1: emails are read-only in the stream. Outbound replies go through
 * patient_message (which the UI calls sendMessageToPatient for).
 */
export async function listMessagesInThread(
  organizationId: string,
  threadId: string,
): Promise<ThreadMessage[]> {
  const thread = await getPatientThreadById(organizationId, threadId)
  if (!thread) return []

  const [pMessages, emails] = await Promise.all([
    db
      .select({
        id: schema.patientMessage.id,
        channel: schema.patientMessage.channel,
        direction: schema.patientMessage.direction,
        body: schema.patientMessage.body,
        sentByUserId: schema.patientMessage.sentByUserId,
        sentByName: schema.user.name,
        sentAt: schema.patientMessage.sentAt,
        externalId: schema.patientMessage.externalId,
      })
      .from(schema.patientMessage)
      .leftJoin(schema.user, eq(schema.patientMessage.sentByUserId, schema.user.id))
      .where(eq(schema.patientMessage.threadId, threadId))
      .orderBy(asc(schema.patientMessage.sentAt)),
    db
      .select({
        id: schema.emailMessage.id,
        folder: schema.emailMessage.folder,
        fromName: schema.emailMessage.fromName,
        fromEmail: schema.emailMessage.fromEmail,
        subject: schema.emailMessage.subject,
        snippet: schema.emailMessage.snippet,
        bodyText: schema.emailMessage.bodyText,
        receivedAt: schema.emailMessage.receivedAt,
        providerMessageId: schema.emailMessage.providerMessageId,
      })
      .from(schema.emailMessage)
      .where(
        and(
          eq(schema.emailMessage.organizationId, organizationId),
          eq(schema.emailMessage.patientId, thread.patientId),
        ),
      )
      .orderBy(asc(schema.emailMessage.receivedAt)),
  ])

  const fromPatientMessages: ThreadMessage[] = pMessages.map((m) => ({
    id: m.id,
    source: 'patient_message',
    channel: m.channel as MessageChannel,
    direction: m.direction as MessageDirection,
    body: m.body,
    sentAt: m.sentAt,
    sentByUserId: m.sentByUserId,
    sentByUserName: m.sentByName,
    externalId: m.externalId,
  }))

  const fromEmail: ThreadMessage[] = emails.map((e) => ({
    id: `em_${e.id}`,
    source: 'email_message',
    channel: 'email',
    // Inbound = received from patient. Outbound = sent from clinic via Gmail.
    // 'sent' folder is outbound; everything else is inbound.
    direction: e.folder === 'sent' ? 'outbound' : 'inbound',
    body: e.bodyText ?? e.snippet ?? '',
    subject: e.subject,
    fromName: e.fromName,
    fromEmail: e.fromEmail,
    sentAt: e.receivedAt,
    externalId: e.providerMessageId,
  }))

  return [...fromPatientMessages, ...fromEmail].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
}

// ── Send + mutations ─────────────────────────────────────────────────

/**
 * Lookup-only variant of getOrCreatePatientThread. Returns the thread id
 * if one exists, otherwise null — DOES NOT create. Used by patient-side
 * /patient/messages renders so an unauthenticated visit doesn't write
 * an empty patient_thread row that then surfaces on the staff inbox as
 * "No messages yet".
 */
export async function findPatientThread(
  organizationId: string,
  patientId: string,
): Promise<string | null> {
  const [existing] = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(
      and(
        eq(schema.patientThread.organizationId, organizationId),
        eq(schema.patientThread.patientId, patientId),
      ),
    )
    .limit(1)
  return existing?.id ?? null
}

/**
 * Get an existing thread for a (org, patient) pair, or create one. Used
 * by sendMessageToPatient + "open thread from patient detail" entry
 * points. Centralizes the cross-tenant validation: every write path
 * that materializes a thread for a patient runs assertPatientInOrg
 * first, so callers can't accidentally create a thread in this org
 * for a patientId that belongs to a different one.
 */
export async function getOrCreatePatientThread(
  organizationId: string,
  patientId: string,
): Promise<string> {
  await assertPatientInOrg(organizationId, patientId)

  const existing = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(
      and(
        eq(schema.patientThread.organizationId, organizationId),
        eq(schema.patientThread.patientId, patientId),
      ),
    )
    .limit(1)
  if (existing[0]) return existing[0].id

  const id = newThreadId()
  await db.insert(schema.patientThread).values({
    id,
    organizationId,
    patientId,
    status: 'open',
  })
  return id
}

/**
 * Send a message to a patient on a specific channel. Creates the thread
 * if it doesn't exist, inserts the patient_message row, denormalizes
 * the lastMessageAt/Direction/Channel on the thread.
 *
 * v1: in-app channel writes go to patient_message only. Email channel
 * recipients still need to receive the actual email — wire that in the
 * outbound-email send path (lib/services/gmail.ts) alongside this insert.
 * SMS channel is stubbed; will land with Phase B Twilio.
 */
export async function sendMessageToPatient(input: {
  organizationId: string
  patientId: string
  body: string
  channel: MessageChannel
  sentByUserId: string
}): Promise<{ threadId: string; messageId: string }> {
  if (!input.body.trim()) throw new Error('Message body cannot be empty')
  assertBodyWithinLimit(input.body)
  assertValidChannel(input.channel)
  if (input.channel === 'sms') {
    throw new Error('SMS channel is not enabled in this build (Phase B). Use email or in-app.')
  }
  // Cross-tenant patient check lives inside getOrCreatePatientThread.

  const threadId = await getOrCreatePatientThread(input.organizationId, input.patientId)
  const messageId = newMessageId()
  const now = new Date()

  await db.insert(schema.patientMessage).values({
    id: messageId,
    threadId,
    organizationId: input.organizationId,
    patientId: input.patientId,
    channel: input.channel,
    direction: 'outbound',
    body: input.body.trim(),
    sentByUserId: input.sentByUserId,
    sentAt: now,
  })

  // Denormalize on thread; flipping outbound zeros the unread counter
  // (a staff reply implicitly catches up).
  await db
    .update(schema.patientThread)
    .set({
      lastMessageAt: now,
      lastMessageDirection: 'outbound',
      lastMessageChannel: input.channel,
      unreadCountForClinic: 0,
      // If a thread was snoozed, sending implicitly reopens it.
      status: 'open',
      snoozedUntil: null,
      updatedAt: now,
    })
    .where(eq(schema.patientThread.id, threadId))

  return { threadId, messageId }
}

/**
 * Record an inbound message (patient → clinic). Called by webhook
 * handlers (Twilio for SMS Phase B; in-app patient-portal action for
 * portal messages). Increments unread counter so staff sees a badge.
 */
export async function recordInboundMessage(input: {
  organizationId: string
  patientId: string
  body: string
  channel: MessageChannel
  externalId?: string
}): Promise<{ threadId: string; messageId: string }> {
  if (!input.body.trim()) throw new Error('Message body cannot be empty')
  assertBodyWithinLimit(input.body)
  assertValidChannel(input.channel)
  // Cross-tenant patient check lives inside getOrCreatePatientThread.

  const threadId = await getOrCreatePatientThread(input.organizationId, input.patientId)
  const messageId = newMessageId()
  const now = new Date()

  await db.insert(schema.patientMessage).values({
    id: messageId,
    threadId,
    organizationId: input.organizationId,
    patientId: input.patientId,
    channel: input.channel,
    direction: 'inbound',
    body: input.body.trim(),
    sentAt: now,
    externalId: input.externalId ?? null,
  })

  await db
    .update(schema.patientThread)
    .set({
      lastMessageAt: now,
      lastMessageDirection: 'inbound',
      lastMessageChannel: input.channel,
      unreadCountForClinic: sql`${schema.patientThread.unreadCountForClinic} + 1`,
      status: 'open',
      snoozedUntil: null,
      updatedAt: now,
    })
    .where(eq(schema.patientThread.id, threadId))

  return { threadId, messageId }
}

export async function assignThread(
  organizationId: string,
  threadId: string,
  assigneeUserId: string | null,
): Promise<void> {
  if (assigneeUserId) {
    // Reject assignment to a user outside this org — would leak their
    // display name into the inbox via the user JOIN on the thread list.
    await assertUserInOrg(organizationId, assigneeUserId)
  }
  await db
    .update(schema.patientThread)
    .set({ assignedUserId: assigneeUserId, updatedAt: new Date() })
    .where(
      and(
        eq(schema.patientThread.id, threadId),
        eq(schema.patientThread.organizationId, organizationId),
      ),
    )
}

export async function snoozeThread(
  organizationId: string,
  threadId: string,
  snoozedUntil: Date,
): Promise<void> {
  await db
    .update(schema.patientThread)
    .set({ status: 'snoozed', snoozedUntil, updatedAt: new Date() })
    .where(
      and(
        eq(schema.patientThread.id, threadId),
        eq(schema.patientThread.organizationId, organizationId),
      ),
    )
}

export async function archiveThread(
  organizationId: string,
  threadId: string,
): Promise<void> {
  await db
    .update(schema.patientThread)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(
      and(
        eq(schema.patientThread.id, threadId),
        eq(schema.patientThread.organizationId, organizationId),
      ),
    )
}

export async function reopenThread(
  organizationId: string,
  threadId: string,
): Promise<void> {
  await db
    .update(schema.patientThread)
    .set({ status: 'open', snoozedUntil: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.patientThread.id, threadId),
        eq(schema.patientThread.organizationId, organizationId),
      ),
    )
}

/** Mark a thread as read by clinic staff. Resets unread count. */
export async function markThreadRead(
  organizationId: string,
  threadId: string,
): Promise<void> {
  await db
    .update(schema.patientThread)
    .set({ unreadCountForClinic: 0, updatedAt: new Date() })
    .where(
      and(
        eq(schema.patientThread.id, threadId),
        eq(schema.patientThread.organizationId, organizationId),
      ),
    )
}

// ── Canned-response templates (v1 hard-coded; v2 will move to DB) ────

export const CANNED_TEMPLATES = [
  {
    key: 'confirm_visit',
    label: 'Confirming your visit',
    body: `Hi {{firstName}}, just confirming your visit. Reply YES to confirm, or let us know if you need to reschedule. — The team`,
  },
  {
    key: 'treatment_followup',
    label: 'Following up on your treatment plan',
    body: `Hi {{firstName}}, wanted to follow up on the treatment plan we talked about at your last visit. No pressure — just let us know if you have any questions or want to schedule the next step. — The team`,
  },
  {
    key: 'scheduling_question',
    label: 'Quick scheduling question',
    body: `Hi {{firstName}}, a quick question on scheduling — when works best for you over the next couple of weeks? Reply with a day or two and we'll send a time. — The team`,
  },
]

/**
 * Substitute {{firstName}} etc. in a template against a patient record.
 * Uses the function-form of String#replace so `$` characters in the
 * patient's name (rare but possible — surname like "O'$tone" or a typo)
 * aren't interpreted as regex backreferences in the replacement string.
 */
export function renderTemplate(
  template: string,
  patient: { firstName: string; lastName: string },
): string {
  return template
    .replace(/\{\{firstName\}\}/g, () => patient.firstName)
    .replace(/\{\{lastName\}\}/g, () => patient.lastName)
    .replace(/\{\{fullName\}\}/g, () => `${patient.firstName} ${patient.lastName}`)
}
