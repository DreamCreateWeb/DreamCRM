'use server'

import { z } from 'zod'
import { bookMeeting, cancelMeeting } from '@/lib/services/prospect-meetings'

/**
 * Public booking actions — the token IS the auth (the /r /w /c /b pattern).
 * No requireTenant: a prospect with the link can book or cancel their own
 * demo. All state changes are keyed to the opaque token.
 */

const bookSchema = z.object({
  token: z.string().min(10).max(64),
  slotIso: z.string().min(10).max(40),
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
  note: z.string().max(600).optional(),
})

export async function bookSlotAction(
  input: z.infer<typeof bookSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = bookSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Please pick a time and enter a valid email.' }
  const res = await bookMeeting(parsed.data.token, {
    slotIso: parsed.data.slotIso,
    name: parsed.data.name,
    email: parsed.data.email,
    note: parsed.data.note,
  })
  if (res.ok) return { ok: true }
  const msg =
    res.reason === 'slot_taken'
      ? 'That time was just taken — please pick another.'
      : res.reason === 'disabled'
        ? 'Booking is closed right now.'
        : res.reason === 'closed'
          ? 'This booking link is no longer active.'
          : 'Could not book that time.'
  return { ok: false, error: msg }
}

export async function cancelBookingAction(token: string): Promise<{ ok: boolean }> {
  if (typeof token !== 'string' || token.length < 10) return { ok: false }
  return cancelMeeting(token)
}
