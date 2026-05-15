import 'server-only'
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

// ---------- Forum ----------
export const ThreadInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10_000),
  category: z.string().max(40).default('general'),
})

export const ReplyInput = z.object({
  threadId: z.number().int(),
  body: z.string().min(1).max(5000),
  parentId: z.number().int().optional().nullable(),
})

export async function listThreads(sort: 'popular' | 'newest' | 'following' = 'newest') {
  const order = sort === 'popular' ? desc(schema.forumThreads.views) : desc(schema.forumThreads.createdAt)
  return db
    .select({
      id: schema.forumThreads.id,
      title: schema.forumThreads.title,
      category: schema.forumThreads.category,
      views: schema.forumThreads.views,
      createdAt: schema.forumThreads.createdAt,
      authorId: schema.forumThreads.authorId,
      authorName: schema.users.name,
      authorImage: schema.users.image,
      replyCount: sql<number>`(select count(*) from ${schema.forumReplies} fr where fr.thread_id = ${schema.forumThreads.id})::int`,
    })
    .from(schema.forumThreads)
    .leftJoin(schema.users, eq(schema.forumThreads.authorId, schema.users.id))
    .orderBy(order)
    .limit(100)
}

export async function getThread(id: number) {
  const rows = await db
    .select({
      id: schema.forumThreads.id,
      title: schema.forumThreads.title,
      body: schema.forumThreads.body,
      category: schema.forumThreads.category,
      views: schema.forumThreads.views,
      createdAt: schema.forumThreads.createdAt,
      authorId: schema.forumThreads.authorId,
      authorName: schema.users.name,
      authorImage: schema.users.image,
    })
    .from(schema.forumThreads)
    .leftJoin(schema.users, eq(schema.forumThreads.authorId, schema.users.id))
    .where(eq(schema.forumThreads.id, id))
    .limit(1)
  if (!rows[0]) return null
  await db
    .update(schema.forumThreads)
    .set({ views: sql`${schema.forumThreads.views} + 1` })
    .where(eq(schema.forumThreads.id, id))
  const replies = await db
    .select({
      id: schema.forumReplies.id,
      body: schema.forumReplies.body,
      parentId: schema.forumReplies.parentId,
      createdAt: schema.forumReplies.createdAt,
      authorId: schema.forumReplies.authorId,
      authorName: schema.users.name,
      authorImage: schema.users.image,
    })
    .from(schema.forumReplies)
    .leftJoin(schema.users, eq(schema.forumReplies.authorId, schema.users.id))
    .where(eq(schema.forumReplies.threadId, id))
    .orderBy(desc(schema.forumReplies.createdAt))
  return { thread: rows[0], replies }
}

export async function createThread(input: z.infer<typeof ThreadInput>, userId: string) {
  const data = ThreadInput.parse(input)
  const [row] = await db
    .insert(schema.forumThreads)
    .values({ authorId: userId, title: data.title, body: data.body, category: data.category })
    .returning()
  return row
}

export async function createReply(input: z.infer<typeof ReplyInput>, userId: string) {
  const data = ReplyInput.parse(input)
  const [row] = await db
    .insert(schema.forumReplies)
    .values({ threadId: data.threadId, authorId: userId, body: data.body, parentId: data.parentId ?? null })
    .returning()
  return row
}

// ---------- Feed ----------
export const FeedPostInput = z.object({
  body: z.string().min(1).max(2000),
  imageUrl: z.string().url().optional().nullable(),
})

export async function listFeedPosts() {
  return db
    .select({
      id: schema.feedPosts.id,
      body: schema.feedPosts.body,
      imageUrl: schema.feedPosts.imageUrl,
      likes: schema.feedPosts.likes,
      comments: schema.feedPosts.comments,
      createdAt: schema.feedPosts.createdAt,
      authorId: schema.feedPosts.authorId,
      authorName: schema.users.name,
      authorImage: schema.users.image,
    })
    .from(schema.feedPosts)
    .leftJoin(schema.users, eq(schema.feedPosts.authorId, schema.users.id))
    .orderBy(desc(schema.feedPosts.createdAt))
    .limit(50)
}

export async function createFeedPost(input: z.infer<typeof FeedPostInput>, userId: string) {
  const data = FeedPostInput.parse(input)
  const [row] = await db
    .insert(schema.feedPosts)
    .values({ authorId: userId, body: data.body, imageUrl: data.imageUrl ?? null })
    .returning()
  return row
}

export async function likeFeedPost(id: number) {
  const [row] = await db
    .update(schema.feedPosts)
    .set({ likes: sql`${schema.feedPosts.likes} + 1` })
    .where(eq(schema.feedPosts.id, id))
    .returning({ id: schema.feedPosts.id, likes: schema.feedPosts.likes })
  return row
}

// ---------- Meetups ----------
export const MeetupInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  imageUrl: z.string().url().optional().nullable(),
  capacity: z.number().int().min(1).optional().nullable(),
})

export async function listMeetups(opts: { upcomingOnly?: boolean } = {}) {
  const filters = opts.upcomingOnly ? [gte(schema.meetups.startsAt, new Date())] : []
  return db
    .select({
      id: schema.meetups.id,
      title: schema.meetups.title,
      description: schema.meetups.description,
      location: schema.meetups.location,
      startsAt: schema.meetups.startsAt,
      endsAt: schema.meetups.endsAt,
      imageUrl: schema.meetups.imageUrl,
      capacity: schema.meetups.capacity,
      hostId: schema.meetups.hostId,
      hostName: schema.users.name,
      rsvpCount: sql<number>`(select count(*) from ${schema.meetupRsvps} r where r.meetup_id = ${schema.meetups.id})::int`,
    })
    .from(schema.meetups)
    .leftJoin(schema.users, eq(schema.meetups.hostId, schema.users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.meetups.startsAt))
    .limit(50)
}

export async function getMeetup(id: number) {
  const rows = await db
    .select()
    .from(schema.meetups)
    .where(eq(schema.meetups.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function createMeetup(input: z.infer<typeof MeetupInput>, userId: string) {
  const data = MeetupInput.parse(input)
  const startsAt = new Date(data.startsAt)
  const endsAt = new Date(data.endsAt)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new Error('Invalid dates')
  const [row] = await db
    .insert(schema.meetups)
    .values({
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      startsAt,
      endsAt,
      imageUrl: data.imageUrl ?? null,
      capacity: data.capacity ?? null,
      hostId: userId,
    })
    .returning()
  return row
}

export async function rsvpMeetup(meetupId: number, userId: string, status: 'going' | 'maybe' | 'not_going' = 'going') {
  const [row] = await db
    .insert(schema.meetupRsvps)
    .values({ meetupId, userId, status })
    .onConflictDoUpdate({
      target: [schema.meetupRsvps.meetupId, schema.meetupRsvps.userId],
      set: { status },
    })
    .returning()
  return row
}

// ---------- Users directory ----------
export async function listCommunityUsers(opts: { search?: string } = {}) {
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      image: schema.users.image,
      role: schema.users.role,
      companyName: schema.users.companyName,
      city: schema.users.city,
      country: schema.users.country,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .limit(120)
}
