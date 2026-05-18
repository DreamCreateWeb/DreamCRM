'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  CalendarEventInput,
  CalendarEventUpdate,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '@/lib/services/calendar'

export async function addCalendarEvent(input: unknown) {
  const ctx = await requireTenant()
  const event = await createCalendarEvent(CalendarEventInput.parse(input), {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  })
  revalidatePath('/calendar')
  return event
}

export async function editCalendarEvent(id: number, input: unknown) {
  const ctx = await requireTenant()
  const event = await updateCalendarEvent(id, CalendarEventUpdate.parse(input), ctx.organizationId)
  revalidatePath('/calendar')
  return event
}

export async function removeCalendarEvent(id: number) {
  const ctx = await requireTenant()
  const result = await deleteCalendarEvent(id, ctx.organizationId)
  revalidatePath('/calendar')
  return result
}
