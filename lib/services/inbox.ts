import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

export const InboxFolders = ['inbox', 'sent', 'drafts', 'starred', 'archived', 'spam', 'trash'] as const
export type InboxFolder = (typeof InboxFolders)[number]

export const InboxMessageInput = z.object({
  toEmail: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
})

export async function listInboxMessages(userId: string, folder: InboxFolder = 'inbox') {
  return db
    .select()
    .from(schema.inboxMessages)
    .where(and(eq(schema.inboxMessages.userId, userId), eq(schema.inboxMessages.folder, folder)))
    .orderBy(desc(schema.inboxMessages.receivedAt))
    .limit(100)
}

export async function getInboxMessage(userId: string, id: number) {
  const rows = await db
    .select()
    .from(schema.inboxMessages)
    .where(and(eq(schema.inboxMessages.userId, userId), eq(schema.inboxMessages.id, id)))
    .limit(1)
  return rows[0] ?? null
}

export async function markInboxRead(userId: string, id: number) {
  await db
    .update(schema.inboxMessages)
    .set({ read: true })
    .where(and(eq(schema.inboxMessages.userId, userId), eq(schema.inboxMessages.id, id)))
}

export async function sendInboxMessage(userId: string, fromName: string, fromEmail: string, input: z.infer<typeof InboxMessageInput>) {
  const data = InboxMessageInput.parse(input)
  const [row] = await db
    .insert(schema.inboxMessages)
    .values({
      userId,
      fromName,
      fromEmail,
      toEmail: data.toEmail,
      subject: data.subject,
      body: data.body,
      folder: 'sent',
      read: true,
    })
    .returning()
  return row
}
