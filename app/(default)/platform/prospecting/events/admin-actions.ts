'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import {
  attachHeadshot,
  createEvent,
  resendHeadshot,
  setEventActive,
  type CapturePhoto,
} from '@/lib/services/event-capture'
import { sniffUpload } from '@/app/api/upload/route'

async function requirePlatformAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform' || !ctx.platformAdmin) throw new Error('Forbidden: platform admin only')
  return ctx
}

export async function createEventAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requirePlatformAdmin()
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === 'string' ? v.trim() : ''
  }
  const res = await createEvent({
    name: str('name'),
    slug: str('slug'),
    organizer: str('organizer') || null,
    state: str('state') || null,
    startsOn: str('startsOn') || null,
    endsOn: str('endsOn') || null,
  })
  if (res.ok) revalidatePath('/platform/prospecting/events')
  return res
}

export async function setEventActiveAction(id: string, active: boolean): Promise<void> {
  await requirePlatformAdmin()
  await setEventActive(id, active)
  revalidatePath('/platform/prospecting/events')
  revalidatePath(`/platform/prospecting/events/${id}`)
}

/** The camera's file, attached after the floor. Sniffed here like every
 *  other upload — the bucket is public-read. */
export async function attachHeadshotAction(
  eventId: string,
  captureId: string,
  formData: FormData,
): Promise<{ ok: true; delivered: boolean } | { ok: false; error: string }> {
  await requirePlatformAdmin()
  const file = formData.get('photo')
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: 'Pick a photo first.' }
  const bytes = Buffer.from(await file.arrayBuffer())
  const sniff = sniffUpload(new Uint8Array(bytes.subarray(0, 32)))
  if (sniff.kind !== 'image' || !['image/jpeg', 'image/png', 'image/webp'].includes(sniff.type)) {
    return { ok: false, error: 'JPEG, PNG, or WebP only.' }
  }
  const res = await attachHeadshot(captureId, { bytes, contentType: sniff.type as CapturePhoto['contentType'] })
  if (res.ok) revalidatePath(`/platform/prospecting/events/${eventId}`)
  return res
}

export async function resendHeadshotAction(eventId: string, captureId: string): Promise<boolean> {
  await requirePlatformAdmin()
  const sent = await resendHeadshot(captureId)
  revalidatePath(`/platform/prospecting/events/${eventId}`)
  return sent
}
