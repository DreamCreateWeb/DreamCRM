import 'server-only'
import { randomBytes } from 'crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  MAX_TEMPLATE_NAME_LEN,
  MAX_TEMPLATE_BODY_LEN,
  MAX_TEMPLATES_PER_ORG,
  DEFAULT_MESSAGE_TEMPLATES,
  type MessageTemplateRow,
} from '@/lib/types/message-templates'

/**
 * Editable canned-reply templates for the /messages composer.
 *
 * Stored in the (previously unused) `email_snippet` table — one catalog per org.
 * Each is a short reusable reply with `{{firstName}}` / `{{lastName}}` /
 * `{{fullName}}` merge tokens (substituted by `renderTemplate` in
 * patient-messaging.ts at insert time). Replaces the three hard-coded
 * CANNED_TEMPLATES: the same three are seeded as editable rows on first read, so
 * the clinic can rename, reword, reorder, delete, and add their own.
 *
 * The row type + bounds + starter set are client-safe and live in
 * `lib/types/message-templates.ts` (re-exported here for server consumers).
 */

export {
  MAX_TEMPLATE_NAME_LEN,
  MAX_TEMPLATE_BODY_LEN,
  MAX_TEMPLATES_PER_ORG,
  DEFAULT_MESSAGE_TEMPLATES,
  type MessageTemplateRow,
}

function newId(): string {
  return `snip_${randomBytes(8).toString('hex')}`
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_TEMPLATE_NAME_LEN)
}
function cleanShortcut(s: string | null | undefined): string | null {
  const v = (s ?? '').trim().slice(0, 1)
  return v || null
}

function toRow(r: typeof schema.emailSnippet.$inferSelect): MessageTemplateRow {
  return { id: r.id, name: r.name, body: r.body, shortcut: r.shortcut, sortOrder: r.sortOrder }
}

/**
 * Seed the starter templates for an org that has none. Idempotent — a single
 * guard read, then a bulk insert only on a fresh org. Safe to call on every
 * list read.
 */
export async function seedDefaultMessageTemplates(
  organizationId: string,
  userId: string | null = null,
): Promise<void> {
  const [existing] = await db
    .select({ id: schema.emailSnippet.id })
    .from(schema.emailSnippet)
    .where(eq(schema.emailSnippet.organizationId, organizationId))
    .limit(1)
  if (existing) return
  await db.insert(schema.emailSnippet).values(
    DEFAULT_MESSAGE_TEMPLATES.map((t, i) => ({
      id: newId(),
      organizationId,
      createdByUserId: userId,
      name: t.name,
      body: t.body,
      shortcut: null,
      sortOrder: i,
    })),
  ).onConflictDoNothing()
}

/** List an org's templates (seeds the starter set on first read). */
export async function listMessageTemplates(organizationId: string): Promise<MessageTemplateRow[]> {
  await seedDefaultMessageTemplates(organizationId)
  const rows = await db
    .select()
    .from(schema.emailSnippet)
    .where(eq(schema.emailSnippet.organizationId, organizationId))
    .orderBy(asc(schema.emailSnippet.sortOrder), asc(schema.emailSnippet.name))
  return rows.map(toRow)
}

export async function createMessageTemplate(
  organizationId: string,
  input: { name: string; body: string; shortcut?: string | null },
  userId: string | null,
): Promise<MessageTemplateRow> {
  const name = cleanName(input.name)
  const body = input.body.trim().slice(0, MAX_TEMPLATE_BODY_LEN)
  if (!name) throw new Error('Give the template a name.')
  if (!body) throw new Error('Write the template message.')

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.emailSnippet)
    .where(eq(schema.emailSnippet.organizationId, organizationId))
  if (Number(count) >= MAX_TEMPLATES_PER_ORG) {
    throw new Error(`You can have up to ${MAX_TEMPLATES_PER_ORG} templates.`)
  }
  // New templates sort after the current max.
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${schema.emailSnippet.sortOrder}), -1)::int` })
    .from(schema.emailSnippet)
    .where(eq(schema.emailSnippet.organizationId, organizationId))

  const id = newId()
  await db.insert(schema.emailSnippet).values({
    id,
    organizationId,
    createdByUserId: userId,
    name,
    body,
    shortcut: cleanShortcut(input.shortcut),
    sortOrder: Number(maxOrder) + 1,
  })
  return { id, name, body, shortcut: cleanShortcut(input.shortcut), sortOrder: Number(maxOrder) + 1 }
}

export async function updateMessageTemplate(
  organizationId: string,
  id: string,
  patch: { name?: string; body?: string; shortcut?: string | null },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) {
    const name = cleanName(patch.name)
    if (!name) throw new Error('Give the template a name.')
    set.name = name
  }
  if (patch.body !== undefined) {
    const body = patch.body.trim().slice(0, MAX_TEMPLATE_BODY_LEN)
    if (!body) throw new Error('Write the template message.')
    set.body = body
  }
  if (patch.shortcut !== undefined) set.shortcut = cleanShortcut(patch.shortcut)
  await db
    .update(schema.emailSnippet)
    .set(set)
    .where(and(eq(schema.emailSnippet.id, id), eq(schema.emailSnippet.organizationId, organizationId)))
}

export async function deleteMessageTemplate(organizationId: string, id: string): Promise<void> {
  await db
    .delete(schema.emailSnippet)
    .where(and(eq(schema.emailSnippet.id, id), eq(schema.emailSnippet.organizationId, organizationId)))
}

/** Persist a new ordering (the settings editor's up/down). Each id's index
 *  becomes its sortOrder; foreign ids are ignored by the org scope. */
export async function reorderMessageTemplates(organizationId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(schema.emailSnippet)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(schema.emailSnippet.id, orderedIds[i]),
            eq(schema.emailSnippet.organizationId, organizationId),
          ),
        )
    }
  })
}
