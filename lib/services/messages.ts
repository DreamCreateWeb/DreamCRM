import 'server-only'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

export const MessageInput = z.object({
  conversationId: z.number().int(),
  body: z.string().min(1).max(10_000),
})

export const ConversationInput = z.object({
  title: z.string().max(120).optional().nullable(),
  participantIds: z.array(z.string()).min(1),
})

export async function listConversationsForUser(userId: string) {
  const rows = await db
    .select({
      id: schema.conversations.id,
      title: schema.conversations.title,
      lastMessage: sql<string>`(select body from ${schema.messages} m where m.conversation_id = ${schema.conversations.id} order by m.created_at desc limit 1)`,
      lastAt: sql<Date | null>`(select created_at from ${schema.messages} m where m.conversation_id = ${schema.conversations.id} order by m.created_at desc limit 1)`,
    })
    .from(schema.conversations)
    .innerJoin(
      schema.conversationMembers,
      and(
        eq(schema.conversationMembers.conversationId, schema.conversations.id),
        eq(schema.conversationMembers.userId, userId)
      )
    )
    .orderBy(desc(schema.conversations.createdAt))
    .limit(100)
  return rows
}

export async function listMessages(conversationId: number, userId: string) {
  // Confirm membership
  const member = await db
    .select()
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, conversationId),
        eq(schema.conversationMembers.userId, userId)
      )
    )
    .limit(1)
  if (!member[0]) throw new Error('Not a member of this conversation')
  return db
    .select({
      id: schema.messages.id,
      body: schema.messages.body,
      createdAt: schema.messages.createdAt,
      authorId: schema.messages.authorId,
      authorName: schema.user.name,
      authorImage: schema.user.image,
    })
    .from(schema.messages)
    .leftJoin(schema.user, eq(schema.messages.authorId, schema.user.id))
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(asc(schema.messages.createdAt))
}

/**
 * The set of user ids `currentUserId` is allowed to start a conversation with.
 * The client-supplied participantIds are NEVER trusted — a conversation is an
 * unsolicited message into someone's inbox, so the recipient set is authorized
 * server-side against the caller's identity:
 *   - Platform staff → any clinic owner/admin (Client Messaging) plus their own
 *     platform teammates. Exactly the two lists the UI offers.
 *   - Everyone else (clinic staff, patients) → the STAFF of their own org(s)
 *     only: owner/admin/member, never another patient, never another org, and
 *     never a platform admin. A patient thus cannot reach outside their clinic
 *     or contact anyone but that clinic's staff.
 */
export async function allowedRecipientIds(currentUserId: string): Promise<Set<string>> {
  const memberships = await db
    .select({
      orgId: schema.member.organizationId,
      orgType: schema.organization.type,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, currentUserId))

  const allowed = new Set<string>()
  const isPlatform = memberships.some((m) => m.orgType === 'platform')

  if (isPlatform) {
    const [clinicContacts, teamContacts] = await Promise.all([
      listClinicContacts(),
      listTeamContacts(currentUserId),
    ])
    for (const c of clinicContacts) allowed.add(c.userId)
    for (const c of teamContacts) allowed.add(c.userId)
  } else {
    const orgIds = Array.from(new Set(memberships.map((m) => m.orgId)))
    if (orgIds.length > 0) {
      const staff = await db
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(
          and(
            inArray(schema.member.organizationId, orgIds),
            inArray(schema.member.role, ['owner', 'admin', 'member']),
          ),
        )
      for (const s of staff) allowed.add(s.userId)
    }
  }

  allowed.delete(currentUserId)
  return allowed
}

/** Messagable contacts (id + name) for the generic chat surface — same
 *  authorization as {@link allowedRecipientIds}, so the UI never offers a
 *  recipient the server would reject. */
export async function listMessagableContacts(
  currentUserId: string,
): Promise<{ id: string; name: string | null }[]> {
  const allowed = await allowedRecipientIds(currentUserId)
  if (allowed.size === 0) return []
  const rows = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(inArray(schema.user.id, Array.from(allowed)))
    .orderBy(asc(schema.user.name))
  return rows
}

export async function createConversation(input: z.infer<typeof ConversationInput>, currentUserId: string) {
  const data = ConversationInput.parse(input)
  // Authorize the recipients server-side — the client array is untrusted.
  const allowed = await allowedRecipientIds(currentUserId)
  const requested = Array.from(new Set(data.participantIds)).filter((id) => id !== currentUserId)
  if (requested.length === 0) {
    throw new Error('Pick at least one person to message.')
  }
  if (requested.some((id) => !allowed.has(id))) {
    throw new Error('You can only start a conversation with your own team or clinic contacts.')
  }
  // Platform → clinic staff routes into that clinic's ONE support thread
  // instead of minting a parallel conversation the clinic can't see (their
  // /messages is the patient inbox; the support tab is their only window
  // into this system, and it shows the org thread).
  const supportOrgId = await singleClinicOrgFor(requested)
  if (supportOrgId) {
    const callerIsPlatform = (await platformMemberIds()).has(currentUserId)
    if (callerIsPlatform) {
      const conversationId = await ensureOrgSupportThread(supportOrgId)
      await db
        .insert(schema.conversationMembers)
        .values({ conversationId, userId: currentUserId })
        .onConflictDoNothing()
      const [existing] = await db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, conversationId))
        .limit(1)
      return existing
    }
  }
  const [convo] = await db.insert(schema.conversations).values({ title: data.title ?? null }).returning()
  const allIds = Array.from(new Set([currentUserId, ...requested]))
  await db.insert(schema.conversationMembers).values(allIds.map((userId) => ({ conversationId: convo.id, userId }))).onConflictDoNothing()
  return convo
}

export async function postMessage(input: z.infer<typeof MessageInput>, userId: string) {
  const data = MessageInput.parse(input)
  const member = await db
    .select()
    .from(schema.conversationMembers)
    .where(
      and(
        eq(schema.conversationMembers.conversationId, data.conversationId),
        eq(schema.conversationMembers.userId, userId)
      )
    )
    .limit(1)
  if (!member[0]) throw new Error('Not a member of this conversation')
  const [row] = await db
    .insert(schema.messages)
    .values({ conversationId: data.conversationId, authorId: userId, body: data.body })
    .returning()
  // Author is now caught up on their own message.
  await db
    .update(schema.conversationMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(schema.conversationMembers.conversationId, data.conversationId),
        eq(schema.conversationMembers.userId, userId),
      ),
    )
  await notifySupportCounterparts(data.conversationId, userId, data.body)
  return row
}

/**
 * SUPPORT threads (organization_id set) alert the other side of the desk —
 * without this, a clinic's plea for help sat silent until somebody happened
 * to open the right page. Clinic author → platform members hear "a client
 * wrote in"; platform author → the clinic's staff hear "Support replied"
 * (never a platform person's name — the identity contract). Best-effort by
 * design: a failed alert must never fail the message itself.
 */
async function notifySupportCounterparts(
  conversationId: number,
  authorId: string,
  body: string,
): Promise<void> {
  try {
    const [convo] = await db
      .select({
        organizationId: schema.conversations.organizationId,
        title: schema.conversations.title,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1)
    if (!convo?.organizationId) return // a generic chat, not a support thread

    const orgId = convo.organizationId
    const [platform, staff] = await Promise.all([platformMemberIds(), clinicStaffIds(orgId)])
    const excerpt = body.length > 140 ? `${body.slice(0, 140)}…` : body
    const { notify } = await import('./notifications')
    const { publishRealtime } = await import('./realtime')

    if (platform.has(authorId)) {
      // Support replied → tell the clinic's staff, as "Support".
      await Promise.all(
        Array.from(staff)
          .filter((id) => id !== authorId)
          .map((id) =>
            notify({
              userId: id,
              organizationId: orgId,
              bucket: 'comments',
              type: 'support_reply',
              title: 'Support replied',
              body: excerpt,
              linkPath: '/messages/support',
              linkLabel: 'Open the conversation →',
            }),
          ),
      )
    } else {
      // A clinic wrote in → tell the platform side, named by the clinic.
      await Promise.all(
        Array.from(platform)
          .filter((id) => id !== authorId)
          .map((id) =>
            notify({
              userId: id,
              organizationId: null,
              bucket: 'comments',
              type: 'support_message',
              title: `${convo.title ?? 'A client'} wrote to support`,
              body: excerpt,
              linkPath: `/messages?c=${conversationId}`,
              linkLabel: 'Open the conversation →',
            }),
          ),
      )
    }
    // Live-refresh the clinic's support pane (and their /messages surface).
    await publishRealtime(orgId, 'messages', { support: true })
  } catch (err) {
    console.warn('[messages] support notification failed', err)
  }
}

// ---------- Client Messaging (platform-side, tenant-aware) ----------

export type ConversationKind = 'client' | 'team' | 'other'

export interface ClientConversation {
  id: number
  title: string | null
  kind: ConversationKind
  clinicOrgId: string | null
  clinicName: string | null
  clinicSlug: string | null
  counterpartName: string | null
  counterpartRole: string | null
  lastMessage: string | null
  lastAt: Date | null
  unreadCount: number
}

export interface ClientMessagingStats {
  activeConversations: number
  unreadMessages: number
  staleConversations: number
}

export interface ClinicContact {
  userId: string
  name: string | null
  email: string
  role: string
  organizationId: string
  clinicName: string
}

function isMissingSchemaError(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}

/**
 * Conversations for a platform-side user, annotated with the clinic context
 * of the other participant (the clinic owner/admin we're talking to). Used by
 * the Client Messaging surface so each row carries clinic info, not just a
 * raw conversation title.
 */
export async function listClientConversations(userId: string): Promise<ClientConversation[]> {
  try {
    const convos = await db
      .select({
        id: schema.conversations.id,
        title: schema.conversations.title,
        organizationId: schema.conversations.organizationId,
        lastReadAt: schema.conversationMembers.lastReadAt,
        lastMessage: sql<string | null>`(
          select body from ${schema.messages} m
          where m.conversation_id = ${schema.conversations.id}
          order by m.created_at desc limit 1
        )`,
        lastAt: sql<Date | null>`(
          select created_at from ${schema.messages} m
          where m.conversation_id = ${schema.conversations.id}
          order by m.created_at desc limit 1
        )`,
        unreadCount: sql<number>`(
          select count(*)::int from ${schema.messages} m
          where m.conversation_id = ${schema.conversations.id}
            and m.author_id <> ${userId}
            and (
              ${schema.conversationMembers.lastReadAt} is null
              or m.created_at > ${schema.conversationMembers.lastReadAt}
            )
        )`,
      })
      .from(schema.conversations)
      .innerJoin(
        schema.conversationMembers,
        and(
          eq(schema.conversationMembers.conversationId, schema.conversations.id),
          eq(schema.conversationMembers.userId, userId),
        ),
      )
      .orderBy(desc(schema.conversations.createdAt))
      .limit(200)

    if (convos.length === 0) return []

    const convoIds = convos.map((c) => c.id)
    // Pick the "counterpart" — the other member of the conversation. For 1:1
    // chat this is straightforward; for multi-party we pick the first one.
    const counterpartRows = await db
      .select({
        conversationId: schema.conversationMembers.conversationId,
        userId: schema.conversationMembers.userId,
        userName: schema.user.name,
      })
      .from(schema.conversationMembers)
      .innerJoin(schema.user, eq(schema.user.id, schema.conversationMembers.userId))
      .where(
        and(
          inArray(schema.conversationMembers.conversationId, convoIds),
          ne(schema.conversationMembers.userId, userId),
        ),
      )
    // Keep EVERY other member per conversation — support threads are
    // multi-party (clinic staff + all platform admins), and taking the
    // first row could land on a platform teammate, misfiling the thread
    // under 'team'. The clinic-staff member is chosen below, once the
    // membership maps exist.
    const candidatesByConvo = new Map<number, Array<{ userId: string; name: string | null }>>()
    for (const r of counterpartRows) {
      const list = candidatesByConvo.get(r.conversationId) ?? []
      list.push({ userId: r.userId, name: r.userName })
      candidatesByConvo.set(r.conversationId, list)
    }
    const counterpartByConvo = candidatesByConvo

    // Resolve every membership for each counterpart so we can classify the
    // conversation as 'client' (counterpart belongs to a clinic) or 'team'
    // (counterpart is a member of a platform org).
    const counterpartIds = Array.from(
      new Set(Array.from(counterpartByConvo.values()).flatMap((list) => list.map((c) => c.userId))),
    )
    const clinicByUser = new Map<string, { orgId: string; name: string; slug: string; role: string }>()
    const platformByUser = new Map<string, { orgId: string; role: string }>()
    if (counterpartIds.length > 0) {
      const memberRows = await db
        .select({
          userId: schema.member.userId,
          organizationId: schema.member.organizationId,
          role: schema.member.role,
          orgName: schema.organization.name,
          orgSlug: schema.organization.slug,
          orgType: schema.organization.type,
        })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
        .where(inArray(schema.member.userId, counterpartIds))
      for (const m of memberRows) {
        if (
          m.orgType === 'clinic' &&
          (m.role === 'owner' || m.role === 'admin' || m.role === 'member') &&
          !clinicByUser.has(m.userId)
        ) {
          clinicByUser.set(m.userId, {
            orgId: m.organizationId,
            name: m.orgName,
            slug: m.orgSlug,
            role: m.role,
          })
        }
        if (m.orgType === 'platform' && !platformByUser.has(m.userId)) {
          platformByUser.set(m.userId, { orgId: m.organizationId, role: m.role })
        }
      }
    }

    return convos.map((c) => {
      const candidates = counterpartByConvo.get(c.id) ?? []
      // Prefer the clinic-staff member as the face of the row; fall back to
      // whoever else is there (a platform teammate, for team chats).
      const counterpart =
        candidates.find((x) => clinicByUser.has(x.userId)) ?? candidates[0] ?? null
      const clinic = counterpart ? clinicByUser.get(counterpart.userId) : null
      const team = counterpart ? platformByUser.get(counterpart.userId) : null
      // An org-anchored thread IS a client conversation even before any
      // clinic staff joined it (e.g. a support thread just provisioned).
      const kind: ConversationKind = clinic || c.organizationId ? 'client' : team ? 'team' : 'other'
      return {
        id: c.id,
        title: c.title,
        kind,
        clinicOrgId: clinic?.orgId ?? c.organizationId ?? null,
        clinicName: clinic?.name ?? null,
        clinicSlug: clinic?.slug ?? null,
        counterpartName: counterpart?.name ?? null,
        counterpartRole: clinic?.role ?? team?.role ?? null,
        lastMessage: c.lastMessage ?? null,
        lastAt: c.lastAt ?? null,
        unreadCount: Number(c.unreadCount ?? 0),
      }
    })
  } catch (err) {
    if (isMissingSchemaError(err)) {
      console.warn('[messages] conversations / member table missing')
      return []
    }
    throw err
  }
}

/**
 * Compute headline stats for the Client Messaging page. Stale = no activity
 * in the last `staleDays` days (default 3).
 */
export function computeClientMessagingStats(
  convos: ClientConversation[],
  opts: { now?: Date; staleDays?: number } = {},
): ClientMessagingStats {
  const now = opts.now ?? new Date()
  const staleAfter = (opts.staleDays ?? 3) * 24 * 60 * 60 * 1000
  let unread = 0
  let stale = 0
  for (const c of convos) {
    unread += c.unreadCount
    if (c.lastAt && now.getTime() - new Date(c.lastAt).getTime() > staleAfter && c.unreadCount > 0) {
      stale++
    }
  }
  return {
    activeConversations: convos.length,
    unreadMessages: unread,
    staleConversations: stale,
  }
}

/**
 * Clinic owners/admins across all clinic orgs — the valid set of contacts
 * a platform admin can start a new conversation with. Patients and Dream
 * Create staff are explicitly excluded.
 */
export async function listClinicContacts(): Promise<ClinicContact[]> {
  try {
    const rows = await db
      .select({
        userId: schema.member.userId,
        role: schema.member.role,
        organizationId: schema.member.organizationId,
        clinicName: schema.organization.name,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(
        and(
          eq(schema.organization.type, 'clinic'),
          inArray(schema.member.role, ['owner', 'admin']),
        ),
      )
      .orderBy(asc(schema.organization.name), asc(schema.user.name))
    return rows as ClinicContact[]
  } catch (err) {
    if (isMissingSchemaError(err)) return []
    throw err
  }
}

/**
 * Fellow members of the current user's platform org — used as the
 * "Team" tab's contact list. Patients, clinic admins, and the current
 * user are excluded.
 */
export async function listTeamContacts(currentUserId: string): Promise<ClinicContact[]> {
  try {
    // Find the platform org the current user belongs to (typically just one).
    const platformOrgRows = await db
      .select({ orgId: schema.member.organizationId, orgName: schema.organization.name })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
      .where(
        and(
          eq(schema.member.userId, currentUserId),
          eq(schema.organization.type, 'platform'),
        ),
      )
    if (platformOrgRows.length === 0) return []
    const orgIds = platformOrgRows.map((r) => r.orgId)

    const rows = await db
      .select({
        userId: schema.member.userId,
        role: schema.member.role,
        organizationId: schema.member.organizationId,
        clinicName: schema.organization.name, // reusing field name; here it's the platform org name
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.member)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(
        and(
          inArray(schema.member.organizationId, orgIds),
          ne(schema.member.userId, currentUserId),
        ),
      )
      .orderBy(asc(schema.user.name))
    return rows as ClinicContact[]
  } catch (err) {
    if (isMissingSchemaError(err)) return []
    throw err
  }
}

export interface TeamMemberRow {
  userId: string
  name: string | null
  email: string
  role: string
  joinedAt: Date
}

export async function listTeamMembers(organizationId: string): Promise<TeamMemberRow[]> {
  try {
    const rows = await db
      .select({
        userId: schema.member.userId,
        role: schema.member.role,
        joinedAt: schema.member.createdAt,
        name: schema.user.name,
        email: schema.user.email,
      })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
      .where(eq(schema.member.organizationId, organizationId))
      .orderBy(asc(schema.user.name))
    return rows as TeamMemberRow[]
  } catch (err) {
    if (isMissingSchemaError(err)) return []
    throw err
  }
}

export interface PendingInvitationRow {
  id: string
  email: string
  role: string | null
  expiresAt: Date
  inviterName: string | null
}

export async function listPendingInvitations(organizationId: string): Promise<PendingInvitationRow[]> {
  try {
    const rows = await db
      .select({
        id: schema.invitation.id,
        email: schema.invitation.email,
        role: schema.invitation.role,
        expiresAt: schema.invitation.expiresAt,
        inviterName: schema.user.name,
      })
      .from(schema.invitation)
      .leftJoin(schema.user, eq(schema.user.id, schema.invitation.inviterId))
      .where(
        and(
          eq(schema.invitation.organizationId, organizationId),
          eq(schema.invitation.status, 'pending'),
        ),
      )
      .orderBy(desc(schema.invitation.expiresAt))
    return rows as PendingInvitationRow[]
  } catch (err) {
    if (isMissingSchemaError(err)) return []
    throw err
  }
}

// ---------- Support (clinic ↔ Dream Create) ----------
//
// ONE support thread per clinic org, anchored on `conversations.organization_id`
// (which nothing else has ever written — every generic conversation stores
// NULL there, so a set value IS the support marker; no migration needed).
// The clinic side renders it as "Support" — never a platform person's name
// or face — and the platform side sees it in Client Messaging under the
// clinic's name. 2026-08-26, owner directive: "i want it to be called
// 'support' for the chat, not my name or identity."

export interface SupportMessage {
  id: number
  body: string
  createdAt: Date
  authorId: string
  authorName: string | null
  /** Authored by the platform side → the clinic renders it as "Support". */
  fromSupport: boolean
}

export interface SupportThread {
  conversationId: number
  messages: SupportMessage[]
}

/** The one clinic org ALL of these users are staff of — or null when they
 *  span orgs, aren't all clinic staff, or the list is empty. Drives the
 *  platform-composer redirect into the org support thread. */
async function singleClinicOrgFor(userIds: string[]): Promise<string | null> {
  if (userIds.length === 0) return null
  const rows = await db
    .select({ userId: schema.member.userId, orgId: schema.member.organizationId })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(
      and(
        inArray(schema.member.userId, userIds),
        eq(schema.organization.type, 'clinic'),
        inArray(schema.member.role, ['owner', 'admin', 'member']),
      ),
    )
  const orgIds = new Set(rows.map((r) => r.orgId))
  if (orgIds.size !== 1) return null
  const covered = new Set(rows.map((r) => r.userId))
  return userIds.every((id) => covered.has(id)) ? Array.from(orgIds)[0] : null
}

/** Every platform-org member — the people who ARE "Support". */
async function platformMemberIds(): Promise<Set<string>> {
  const rows = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.organization.type, 'platform'))
  return new Set(rows.map((r) => r.userId))
}

/** Staff (owner/admin/member — never patients) of a clinic org. */
async function clinicStaffIds(orgId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, orgId),
        inArray(schema.member.role, ['owner', 'admin', 'member']),
      ),
    )
  return new Set(rows.map((r) => r.userId))
}

/**
 * Find-or-create the org's support thread. No caller authorization here —
 * the exported wrappers do that — but membership is synced on every call so
 * staff hired after the thread was created (and platform admins added later)
 * can still open it.
 */
async function ensureOrgSupportThread(orgId: string): Promise<number> {
  const [existing] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.organizationId, orgId))
    .limit(1)

  const [staff, platform] = await Promise.all([clinicStaffIds(orgId), platformMemberIds()])
  const memberIds = Array.from(new Set([...Array.from(staff), ...Array.from(platform)]))

  if (existing) {
    if (memberIds.length > 0) {
      await db
        .insert(schema.conversationMembers)
        .values(memberIds.map((userId) => ({ conversationId: existing.id, userId })))
        .onConflictDoNothing()
    }
    return existing.id
  }

  // Title carries the CLINIC's name — that's what the platform's Client
  // Messaging list shows. The clinic side ignores it and renders "Support".
  const [org] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, orgId))
    .limit(1)
  const [convo] = await db
    .insert(schema.conversations)
    .values({ organizationId: orgId, title: org?.name ?? 'Support' })
    .returning()
  if (memberIds.length > 0) {
    await db
      .insert(schema.conversationMembers)
      .values(memberIds.map((userId) => ({ conversationId: convo.id, userId })))
      .onConflictDoNothing()
  }
  return convo.id
}

/**
 * The clinic's support thread, for a clinic STAFF member. Opens (or creates)
 * the org thread, marks it read for the viewer, and flags which messages
 * came from the platform side so the UI can label them "Support".
 */
export async function getSupportThread(orgId: string, userId: string): Promise<SupportThread> {
  const staff = await clinicStaffIds(orgId)
  if (!staff.has(userId)) throw new Error('Only clinic staff can message support.')
  const conversationId = await ensureOrgSupportThread(orgId)
  const platform = await platformMemberIds()
  const msgs = await listMessages(conversationId, userId)
  await markConversationRead(conversationId, userId)
  return {
    conversationId,
    messages: msgs.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      authorId: m.authorId,
      authorName: m.authorName,
      fromSupport: platform.has(m.authorId),
    })),
  }
}

export async function markConversationRead(conversationId: number, userId: string): Promise<void> {
  try {
    await db
      .update(schema.conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(schema.conversationMembers.conversationId, conversationId),
          eq(schema.conversationMembers.userId, userId),
        ),
      )
  } catch (err) {
    if (!isMissingSchemaError(err)) throw err
  }
}
