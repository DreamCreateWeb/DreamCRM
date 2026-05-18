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

export async function createConversation(input: z.infer<typeof ConversationInput>, currentUserId: string) {
  const data = ConversationInput.parse(input)
  const [convo] = await db.insert(schema.conversations).values({ title: data.title ?? null }).returning()
  const allIds = Array.from(new Set([currentUserId, ...data.participantIds]))
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
  return row
}

// ---------- Client Messaging (platform-side, tenant-aware) ----------

export interface ClientConversation {
  id: number
  title: string | null
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
    const counterpartByConvo = new Map<number, { userId: string; name: string | null }>()
    for (const r of counterpartRows) {
      if (!counterpartByConvo.has(r.conversationId)) {
        counterpartByConvo.set(r.conversationId, { userId: r.userId, name: r.userName })
      }
    }

    // Resolve which clinic each counterpart belongs to (owner/admin role).
    const counterpartIds = Array.from(new Set(Array.from(counterpartByConvo.values()).map((c) => c.userId)))
    const clinicByUser = new Map<string, { orgId: string; name: string; slug: string; role: string }>()
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
        .where(
          and(
            inArray(schema.member.userId, counterpartIds),
            eq(schema.organization.type, 'clinic'),
            inArray(schema.member.role, ['owner', 'admin']),
          ),
        )
      for (const m of memberRows) {
        if (!clinicByUser.has(m.userId)) {
          clinicByUser.set(m.userId, {
            orgId: m.organizationId,
            name: m.orgName,
            slug: m.orgSlug,
            role: m.role,
          })
        }
      }
    }

    return convos.map((c) => {
      const counterpart = counterpartByConvo.get(c.id) ?? null
      const clinic = counterpart ? clinicByUser.get(counterpart.userId) : null
      return {
        id: c.id,
        title: c.title,
        clinicOrgId: clinic?.orgId ?? c.organizationId ?? null,
        clinicName: clinic?.name ?? null,
        clinicSlug: clinic?.slug ?? null,
        counterpartName: counterpart?.name ?? null,
        counterpartRole: clinic?.role ?? null,
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
