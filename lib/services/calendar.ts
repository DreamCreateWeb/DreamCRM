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

export async function listCalendarEvents(opts: { from?: Date; to?: Date } = {}) {
  const filters = []
  if (opts.from) filters.push(gte(schema.calendarEvents.endsAt, opts.from))
  if (opts.to) filters.push(lte(schema.calendarEvents.startsAt, opts.to))
  return db
    .select()
    .from(schema.calendarEvents)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.calendarEvents.startsAt))
}

export async function createCalendarEvent(input: z.infer<typeof CalendarEventInput>, userId: string) {
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
      ownerId: userId,
    })
    .returning()
  return row
}

export async function deleteCalendarEvent(id: number) {
  const rows = await db.delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, id)).returning({ id: schema.calendarEvents.id })
  return { deleted: rows.length }
}

export async function deleteCalendarEvents(ids: number[]) {
  if (!ids.length) return { deleted: 0 }
  const rows = await db.delete(schema.calendarEvents).where(inArray(schema.calendarEvents.id, ids)).returning({ id: schema.calendarEvents.id })
  return { deleted: rows.length }
}
