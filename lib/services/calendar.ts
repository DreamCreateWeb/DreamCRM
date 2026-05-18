import 'server-only'
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import {
  CALENDAR_CATEGORIES,
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  type CalendarCategory,
} from '@/lib/types/calendar'

export { CALENDAR_CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, type CalendarCategory }

export const CalendarEventInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  allDay: z.boolean().optional().default(false),
  category: z.enum(CALENDAR_CATEGORIES).default('work'),
})

/**
 * List events for the given organization within an optional time window.
 * Every event is org-scoped; cross-tenant reads are impossible by design.
 * Pre-migration-0007 there were legacy rows with `organization_id = NULL` —
 * those are claimed for the platform org by the data migration.
 */
export async function listCalendarEvents(
  organizationId: string,
  opts: { from?: Date; to?: Date } = {},
) {
  const filters = [eq(schema.calendarEvents.organizationId, organizationId)]
  if (opts.from) filters.push(gte(schema.calendarEvents.endsAt, opts.from))
  if (opts.to) filters.push(lte(schema.calendarEvents.startsAt, opts.to))
  return db
    .select()
    .from(schema.calendarEvents)
    .where(and(...filters))
    .orderBy(desc(schema.calendarEvents.startsAt))
}

export const CalendarEventUpdate = CalendarEventInput.partial()

export async function updateCalendarEvent(
  id: number,
  input: z.infer<typeof CalendarEventUpdate>,
  organizationId: string,
) {
  const data = CalendarEventUpdate.parse(input)
  const patch: Record<string, unknown> = {}
  if (data.title !== undefined) patch.title = data.title
  if (data.description !== undefined) patch.description = data.description
  if (data.location !== undefined) patch.location = data.location
  if (data.allDay !== undefined) patch.allDay = data.allDay
  if (data.category !== undefined) patch.category = data.category
  if (data.startsAt !== undefined) {
    const startsAt = new Date(data.startsAt)
    if (Number.isNaN(startsAt.getTime())) throw new Error('Invalid event start')
    patch.startsAt = startsAt
  }
  if (data.endsAt !== undefined) {
    const endsAt = new Date(data.endsAt)
    if (Number.isNaN(endsAt.getTime())) throw new Error('Invalid event end')
    patch.endsAt = endsAt
  }
  if (Object.keys(patch).length === 0) return null
  const [row] = await db
    .update(schema.calendarEvents)
    .set(patch)
    .where(and(eq(schema.calendarEvents.id, id), eq(schema.calendarEvents.organizationId, organizationId)))
    .returning()
  return row ?? null
}

export async function createCalendarEvent(
  input: z.infer<typeof CalendarEventInput>,
  opts: { userId: string; organizationId: string },
) {
  const data = CalendarEventInput.parse(input)
  const startsAt = new Date(data.startsAt)
  const endsAt = new Date(data.endsAt)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error('Invalid event dates')
  }
  if (endsAt < startsAt) throw new Error('Event end must be after start')
  const [row] = await db
    .insert(schema.calendarEvents)
    .values({
      title: data.title,
      description: data.description ?? null,
      location: data.location ?? null,
      startsAt,
      endsAt,
      allDay: data.allDay ?? false,
      category: data.category,
      ownerId: opts.userId,
      organizationId: opts.organizationId,
    })
    .returning()
  return row
}

/**
 * Delete one event — only succeeds when the event belongs to the given
 * organization. Returns the number of rows deleted (0 if the id doesn't
 * belong to this tenant — which prevents cross-tenant tampering).
 */
export async function deleteCalendarEvent(id: number, organizationId: string) {
  const rows = await db
    .delete(schema.calendarEvents)
    .where(and(eq(schema.calendarEvents.id, id), eq(schema.calendarEvents.organizationId, organizationId)))
    .returning({ id: schema.calendarEvents.id })
  return { deleted: rows.length }
}

export async function deleteCalendarEvents(ids: number[], organizationId: string) {
  if (!ids.length) return { deleted: 0 }
  const rows = await db
    .delete(schema.calendarEvents)
    .where(
      and(
        inArray(schema.calendarEvents.id, ids),
        eq(schema.calendarEvents.organizationId, organizationId),
      ),
    )
    .returning({ id: schema.calendarEvents.id })
  return { deleted: rows.length }
}
