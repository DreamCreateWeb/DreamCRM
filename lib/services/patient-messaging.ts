import 'server-only'
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db, schema } from '@/lib/db'
import { sendPatientMessageEmail } from '@/lib/email'
import { getClinicSenderIdentity } from '@/lib/services/clinic-sender'
import { sanitizeAttachments, type MessageAttachment } from '@/lib/types/messaging'
import { resolvePortalSettings, DEFAULT_AUTO_REPLY_MESSAGE } from '@/lib/types/portal'
import { isWithinOfficeHours, type ClinicHours } from '@/lib/clinic-timezone'

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
  starred: boolean
  /** AI triage on the latest inbound message — 'urgent' pins the thread to
   *  the top of the list with its reason; null = routine/unclassified. */
  urgency: 'urgent' | null
  urgencyReason: string | null
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
  /** Outbound delivery receipts — set for the in-app channel: delivered to the
   *  portal the instant it's written, read when the patient opens the
   *  conversation. Null for inbound and for email (no read tracking there). */
  deliveredAt?: Date | null
  readByPatientAt?: Date | null
  /** Image attachments (stored in patient_message.meta). Empty when none. */
  attachments?: MessageAttachment[]
}

export interface ThreadFilters {
  status?: ThreadStatus | 'all'
  assignedTo?: 'me' | 'unassigned' | 'all'
  search?: string
  hasUnread?: boolean
  /** Only threads the staff starred (priority flag). */
  starredOnly?: boolean
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

  if (filters.starredOnly) {
    where.push(eq(schema.patientThread.starred, true))
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
      starred: schema.patientThread.starred,
      urgency: schema.patientThread.urgency,
      urgencyReason: schema.patientThread.urgencyReason,
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
    // Urgent threads pin to the top of every view — a patient in pain never
    // scrolls below yesterday's routine question.
    .orderBy(
      sql`case when ${schema.patientThread.urgency} = 'urgent' then 0 else 1 end`,
      desc(schema.patientThread.lastMessageAt),
    )

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
    starred: r.starred,
    urgency: r.urgency === 'urgent' ? 'urgent' : null,
    urgencyReason: r.urgencyReason,
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

// ── Thread patient context (the thread-header context strip) ─────────

/**
 * Slim patient context for the message-thread header — so staff replying
 * "see you Thursday?" can see the patient's next/last visit, PMS balance,
 * and whether intake is missing without leaving the inbox.
 *
 * Reuses `getPatientHeader` (the patients-list derivation, already the
 * single source of truth for these derived columns — next/last visit,
 * the honest PMS-balance framing, the missing-intake-before-next-visit
 * flag) and maps it down to a serializable, render-ready shape. Returns
 * null when the patient isn't in this org (defensive — the caller already
 * org-scopes the thread lookup).
 */
export interface ThreadPatientContext {
  patientId: string
  nextVisitAt: string | null
  nextVisitType: string | null
  lastVisitAt: string | null
  /** PMS-sync balance. null = none on file → show "No PMS balance", never $0. */
  outstandingBalanceCents: number | null
  balanceAsOf: string | null
  /** True when a visit is booked within 7d and no intake form is on file. */
  missingIntake: boolean
  /** 'es' when the patient prefers Spanish — drives the composer's one-tap
   *  translate + the "prefers Spanish" chip. Null = English. */
  preferredLanguage: string | null
}

export async function getThreadPatientContext(
  organizationId: string,
  patientId: string,
): Promise<ThreadPatientContext | null> {
  // Imported lazily to keep this server-only module's import graph flat —
  // patients.ts is a sibling service and getPatientHeader is exported cleanly.
  const { getPatientHeader } = await import('@/lib/services/patients')
  const header = await getPatientHeader(organizationId, patientId)
  if (!header) return null
  return {
    patientId: header.id,
    nextVisitAt: header.nextVisitAt ? header.nextVisitAt.toISOString() : null,
    nextVisitType: header.nextVisitType,
    lastVisitAt: header.lastVisitAt ? header.lastVisitAt.toISOString() : null,
    outstandingBalanceCents: header.outstandingBalanceCents,
    balanceAsOf: header.balanceAsOf ? header.balanceAsOf.toISOString() : null,
    missingIntake: header.flags.missingIntakeBeforeAppt,
    preferredLanguage: header.preferredLanguage,
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
      starred: schema.patientThread.starred,
      urgency: schema.patientThread.urgency,
      urgencyReason: schema.patientThread.urgencyReason,
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
    starred: row.starred,
    urgency: row.urgency === 'urgent' ? 'urgent' : null,
    urgencyReason: row.urgencyReason,
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
        deliveredAt: schema.patientMessage.deliveredAt,
        readByPatientAt: schema.patientMessage.readByPatientAt,
        externalId: schema.patientMessage.externalId,
        meta: schema.patientMessage.meta,
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
    deliveredAt: m.deliveredAt,
    readByPatientAt: m.readByPatientAt,
    sentByUserId: m.sentByUserId,
    sentByUserName: m.sentByName,
    externalId: m.externalId,
    attachments: sanitizeAttachments((m.meta as { attachments?: unknown } | null)?.attachments),
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

// Re-exported for back-compat (its tests import it here); the implementation
// now lives in lib/email-identity alongside the rest of the sender helpers.
export { deliverableReplyTo } from '@/lib/email-identity'

/**
 * Deliver the clinic→patient message to the patient's real inbox for the
 * "email" channel. Sends FROM the clinic's sender identity (name + verified
 * platform address) with Reply-To = the clinic's inbox when deliverable. The
 * patient lookup is org-scoped, so this also rejects a foreign patientId.
 * Throws on no-email or a send failure so the caller never records a misleading
 * "sent" bubble for an email that didn't go out.
 */
async function deliverPatientMessageEmail(
  organizationId: string,
  patientId: string,
  body: string,
  attachments: MessageAttachment[] = [],
): Promise<void> {
  const [p] = await db
    .select({ email: schema.patient.email, firstName: schema.patient.firstName })
    .from(schema.patient)
    .where(and(eq(schema.patient.id, patientId), eq(schema.patient.organizationId, organizationId)))
    .limit(1)
  if (!p) throw new Error('Patient not found in this organization')
  if (!p.email) throw new Error('This patient has no email address on file — switch to the in-app channel.')

  const sender = await getClinicSenderIdentity(organizationId)

  await sendPatientMessageEmail({
    to: p.email,
    patientFirstName: p.firstName,
    clinicName: sender.name,
    body,
    attachments,
    from: sender.from,
    gmail: sender.gmail,
    // deliverableReplyTo (inside getClinicSenderIdentity) skips a non-deliverable
    // clinic email (e.g. the demo's *.example placeholder) so replies don't bounce.
    replyTo: sender.replyTo,
  })
}

/**
 * Send a message to a patient on a specific channel. Creates the thread
 * if it doesn't exist, inserts the patient_message row, denormalizes
 * the lastMessageAt/Direction/Channel on the thread.
 *
 * Channel behavior:
 *   - in_app: row only — it surfaces in the patient portal (/patient/messages).
 *   - email: actually delivers the message to the patient's inbox (Reply-To =
 *     the clinic) BEFORE recording the row, so a failed send (e.g. no email on
 *     file, provider error) throws and never leaves a misleading "sent" bubble.
 *   - sms: stubbed; lands with Phase B.
 */
export async function sendMessageToPatient(input: {
  organizationId: string
  patientId: string
  body: string
  channel: MessageChannel
  sentByUserId: string
  /** Optional image attachments (uploaded to S3 via /api/upload first). */
  attachments?: MessageAttachment[]
}): Promise<{ threadId: string; messageId: string }> {
  const attachments = sanitizeAttachments(input.attachments)
  // A photo-only message is valid — require text OR at least one attachment.
  if (!input.body.trim() && attachments.length === 0) {
    throw new Error('Add a message or an attachment to send.')
  }
  assertBodyWithinLimit(input.body)
  assertValidChannel(input.channel)
  if (input.channel === 'sms') {
    throw new Error('SMS channel is not enabled in this build (Phase B). Use email or in-app.')
  }
  // Cross-tenant patient check lives inside getOrCreatePatientThread (and, for
  // the email channel, inside deliverPatientMessageEmail which runs first).

  // For the email channel, deliver the actual email first — if it fails we throw
  // before recording the row, so the thread never shows a "sent" email that
  // never went out.
  if (input.channel === 'email') {
    await deliverPatientMessageEmail(input.organizationId, input.patientId, input.body.trim(), attachments)
  }

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
    // In-app is delivered the instant it's written (it lands in the portal).
    // Email delivery/read isn't tracked yet, so leave null → the UI reads "Sent".
    deliveredAt: input.channel === 'in_app' ? now : null,
    ...(attachments.length > 0 ? { meta: { attachments } } : {}),
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
      // A staff reply means the urgent inbound has been handled — unpin.
      urgency: null,
      urgencyReason: null,
      updatedAt: now,
    })
    .where(eq(schema.patientThread.id, threadId))

  // Live-push so other staff tabs (and the sender's own thread list) reflect the
  // sent message immediately. Org-scoped, best-effort.
  try {
    const { publishRealtime } = await import('@/lib/services/realtime')
    await publishRealtime(input.organizationId, 'messages', {
      threadId,
      patientId: input.patientId,
      direction: 'outbound',
    })
  } catch {
    /* best-effort */
  }

  return { threadId, messageId }
}

/**
 * Mark the clinic's outbound in-app messages in a patient's thread as read —
 * called when the patient opens the conversation in their portal. Powers the
 * "Read" receipt staff see on those bubbles. Idempotent (only touches
 * not-yet-read rows); best-effort, never throws into the portal render.
 */
export async function markOutboundMessagesReadByPatient(
  organizationId: string,
  patientId: string,
): Promise<void> {
  try {
    await db
      .update(schema.patientMessage)
      .set({ readByPatientAt: new Date() })
      .where(
        and(
          eq(schema.patientMessage.organizationId, organizationId),
          eq(schema.patientMessage.patientId, patientId),
          eq(schema.patientMessage.direction, 'outbound'),
          eq(schema.patientMessage.channel, 'in_app'),
          isNull(schema.patientMessage.readByPatientAt),
        ),
      )
  } catch (err) {
    console.warn('[patient-messaging.markOutboundMessagesReadByPatient] failed', err)
  }
}

/**
 * The patient's OWN unread count — clinic replies (in-app) they haven't
 * opened yet. Powers the portal chrome's Messages badge. Mirrors the exact
 * where-clause markOutboundMessagesReadByPatient clears, so badge and
 * receipt can never disagree. Best-effort: a read failure returns 0.
 */
export async function getMyUnreadMessageCount(
  organizationId: string,
  patientId: string,
): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.patientMessage)
      .where(
        and(
          eq(schema.patientMessage.organizationId, organizationId),
          eq(schema.patientMessage.patientId, patientId),
          eq(schema.patientMessage.direction, 'outbound'),
          eq(schema.patientMessage.channel, 'in_app'),
          isNull(schema.patientMessage.readByPatientAt),
        ),
      )
    return Number(row?.n ?? 0)
  } catch {
    return 0
  }
}

/**
 * Record an inbound message (patient → clinic). Called by webhook
 * handlers (Twilio for SMS Phase B; in-app patient-portal action for
 * portal messages). Increments unread counter so staff sees a badge.
 */
/** How long an auto-reply silences further auto-replies on a thread, so a
 *  patient firing off several after-hours messages gets ONE ack, not a barrage. */
const AUTO_REPLY_DEDUP_MS = 12 * 60 * 60 * 1000

/**
 * After-hours auto-reply: when the office is closed (per the clinic's hours +
 * timezone) and the clinic has opted in, send ONE courteous acknowledgement to
 * a patient's portal message so they aren't left wondering. Best-effort — never
 * throws into the inbound path. The ack does NOT clear the clinic's unread
 * counter (a human still needs to give a real answer); it just updates the
 * thread preview + appears in the patient's portal.
 */
async function maybeSendAfterHoursAutoReply(
  organizationId: string,
  patientId: string,
  threadId: string,
): Promise<void> {
  try {
    const [clinic] = await db
      .select({
        displayName: schema.clinicProfile.displayName,
        hours: schema.clinicProfile.hours,
        timezone: schema.clinicProfile.timezone,
        portalSettings: schema.clinicProfile.portalSettings,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, organizationId))
      .limit(1)
    if (!clinic) return

    const settings = resolvePortalSettings(clinic.portalSettings)
    if (!settings.autoReply.enabled) return
    // Only when the office is closed right now.
    if (isWithinOfficeHours(clinic.hours as ClinicHours | null, clinic.timezone)) return

    // Dedup: skip if we already auto-replied on this thread recently.
    const since = new Date(Date.now() - AUTO_REPLY_DEDUP_MS)
    const [recent] = await db
      .select({ id: schema.patientMessage.id })
      .from(schema.patientMessage)
      .where(
        and(
          eq(schema.patientMessage.threadId, threadId),
          eq(schema.patientMessage.direction, 'outbound'),
          gte(schema.patientMessage.sentAt, since),
          sql`(${schema.patientMessage.meta} ->> 'autoReply') = 'true'`,
        ),
      )
      .limit(1)
    if (recent) return

    const clinicName = clinic.displayName?.trim() || 'our office'
    const body = (settings.autoReply.message || DEFAULT_AUTO_REPLY_MESSAGE).replace(/\{clinic\}/g, clinicName)
    const now = new Date()
    await db.insert(schema.patientMessage).values({
      id: newMessageId(),
      threadId,
      organizationId,
      patientId,
      channel: 'in_app',
      direction: 'outbound',
      body,
      sentByUserId: null,
      sentAt: now,
      deliveredAt: now,
      meta: { autoReply: true },
    })
    // Update the preview/ordering but DELIBERATELY leave unreadCountForClinic +
    // status alone — the front desk still owes a real reply.
    await db
      .update(schema.patientThread)
      .set({ lastMessageAt: now, lastMessageDirection: 'outbound', lastMessageChannel: 'in_app', updatedAt: now })
      .where(eq(schema.patientThread.id, threadId))
  } catch (err) {
    console.warn('[patient-messaging.maybeSendAfterHoursAutoReply] failed', err)
  }
}

export async function recordInboundMessage(input: {
  organizationId: string
  patientId: string
  body: string
  channel: MessageChannel
  externalId?: string
  /** Optional image attachments (e.g. a patient photo from the portal). */
  attachments?: MessageAttachment[]
}): Promise<{ threadId: string; messageId: string }> {
  const attachments = sanitizeAttachments(input.attachments)
  if (!input.body.trim() && attachments.length === 0) {
    throw new Error('Message body cannot be empty')
  }
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
    ...(attachments.length > 0 ? { meta: { attachments } } : {}),
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

  // Live-push so an OPEN /messages view refreshes the instant the message lands
  // (org-scoped: every staff tab, not just notification recipients). The bell
  // itself goes live via the notifyOrgMembers → notify() → 'notifications' path.
  try {
    const { publishRealtime } = await import('@/lib/services/realtime')
    await publishRealtime(input.organizationId, 'messages', {
      threadId,
      patientId: input.patientId,
      direction: 'inbound',
    })
  } catch {
    /* best-effort */
  }

  // Ping the front desk so an inbound patient message doesn't wait for someone
  // to refresh /messages. Best-effort — the message row above is the truth.
  try {
    const [p] = await db
      .select({ firstName: schema.patient.firstName, lastName: schema.patient.lastName, email: schema.patient.email })
      .from(schema.patient)
      .where(and(eq(schema.patient.organizationId, input.organizationId), eq(schema.patient.id, input.patientId)))
      .limit(1)
    const who = p ? `${p.firstName} ${p.lastName}`.trim() : 'a patient'
    const { notifyOrgMembers } = await import('@/lib/services/notifications')
    await notifyOrgMembers(
      input.organizationId,
      {
        bucket: 'comments',
        type: 'patient_message',
        title: `New message from ${who}`,
        body: input.body.trim().slice(0, 140),
        linkPath: `/messages?thread=${threadId}`,
        meta: { threadId, messageId, channel: input.channel },
      },
      // excludeEmail: the sender never gets a staff alert about their own
      // message — without it, an owner who is also a patient of their own
      // clinic (or a demoing admin booking a fake visit) sees internal staff
      // mail land in the "patient's" inbox.
      { roles: ['owner', 'admin'], excludeEmail: p?.email ?? null },
    )
  } catch (err) {
    console.warn('[patient-messaging.recordInboundMessage] notification failed', err)
  }

  // After-hours auto-reply for portal (in-app) messages only — the contact
  // form (channel='email') has its own auto-acknowledgement, so this won't
  // double-ack. Best-effort; never blocks the inbound record.
  if (input.channel === 'in_app') {
    await maybeSendAfterHoursAutoReply(input.organizationId, input.patientId, threadId)
  }

  // Urgency triage — fire-and-forget so the sender's request never waits on
  // a classifier. Keyword screen first; AI confirm inside (see thread-triage).
  import('@/lib/services/thread-triage')
    .then(({ classifyInboundUrgency }) =>
      classifyInboundUrgency(input.organizationId, threadId, input.body),
    )
    .catch((err) => console.warn('[patient-messaging] urgency triage failed', err))

  return { threadId, messageId }
}

export async function assignThread(
  organizationId: string,
  threadId: string,
  assigneeUserId: string | null,
  actingUserId?: string | null,
): Promise<void> {
  // A user can always take a thread for THEMSELVES — the tenant context already
  // proved they operate in this org, even when they aren't a row in `member`
  // (platform-admin "view as clinic" demo mode is exactly this case, and was
  // crashing the inbox on "Assign to me"). Assigning to SOMEONE ELSE still
  // requires real membership, so another org's user can't be set as assignee
  // (which would leak their display name into the inbox via the user JOIN).
  if (assigneeUserId && assigneeUserId !== actingUserId) {
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

/**
 * Manually flag a thread as unread again ("I read this but want it back in my
 * needs-attention view"). Bumps the unread counter to 1 only when it's
 * currently 0, so it surfaces in the Unread filter + the nav badge. Opening the
 * thread re-clears it via markThreadRead — same as email mark-unread. Meant to
 * be used as staff LEAVE a thread (the panel closes back to the list after).
 */
export async function markThreadUnread(
  organizationId: string,
  threadId: string,
): Promise<void> {
  await db
    .update(schema.patientThread)
    .set({ unreadCountForClinic: 1, updatedAt: new Date() })
    .where(
      and(
        eq(schema.patientThread.id, threadId),
        eq(schema.patientThread.organizationId, organizationId),
        eq(schema.patientThread.unreadCountForClinic, 0),
      ),
    )
}

/** Toggle the staff "star" (priority flag) on a thread. */
export async function setThreadStarred(
  organizationId: string,
  threadId: string,
  starred: boolean,
): Promise<void> {
  await db
    .update(schema.patientThread)
    .set({ starred, updatedAt: new Date() })
    .where(
      and(
        eq(schema.patientThread.id, threadId),
        eq(schema.patientThread.organizationId, organizationId),
      ),
    )
}

// ── Canned-response template rendering ───────────────────────────────
// The templates themselves now live in the editable per-clinic catalog
// (`lib/services/message-templates.ts`, backed by `email_snippet`). This
// renderer stays here next to the messaging surface that consumes it.

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
