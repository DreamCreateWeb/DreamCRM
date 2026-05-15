import 'server-only'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
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
      authorName: schema.users.name,
      authorImage: schema.users.image,
    })
    .from(schema.messages)
    .leftJoin(schema.users, eq(schema.messages.authorId, schema.users.id))
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
  return row
}
