'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'
import {
  CalendarEventInput,
  createCalendarEvent,
  deleteCalendarEvent,
} from '@/lib/services/calendar'

export async function addCalendarEvent(input: unknown) {
  const user = await requireUser()
  const event = await createCalendarEvent(CalendarEventInput.parse(input), user.id)
  revalidatePath('/calendar')
  return event
}

export async function removeCalendarEvent(id: number) {
  await requireUser()
  const result = await deleteCalendarEvent(id)
  revalidatePath('/calendar')
  return result
}
