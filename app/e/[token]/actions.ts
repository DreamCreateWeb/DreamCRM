'use server'

import { looksLikeBot } from '@/lib/form-trust'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'
import { validateCapture, HEADSHOT_MAX_BYTES } from '@/lib/event-capture'
import { createCapture, getEventByCaptureToken, type CapturePhoto } from '@/lib/services/event-capture'
import { sniffUpload } from '@/app/api/upload/route'

export type CaptureActionResult =
  | { ok: true; email: string; delivered: boolean }
  | { ok: false; error: string }

/**
 * The floor capture submit. Armor first (honeypot + time-trap, then a per-IP
 * limit sized for ONE device working a hallway all day), then the event
 * gate, then the shape check, then the photo sniff — the bytes decide the
 * type, never the filename.
 */
export async function submitCaptureAction(token: string, formData: FormData): Promise<CaptureActionResult> {
  if (looksLikeBot(formData)) return { ok: false, error: 'Something went wrong — give it another try.' }
  if (!(await rateLimitPublicAction('event-capture', { limit: 150, windowMs: 60 * 60 * 1000 }))) {
    return { ok: false, error: 'That’s a lot of headshots from one connection — give it a minute.' }
  }
  const event = await getEventByCaptureToken(token)
  if (!event) return { ok: false, error: 'This event’s capture link is no longer active.' }

  const raw: Record<string, unknown> = {}
  for (const k of ['firstName', 'lastName', 'email', 'practiceName', 'role', 'city', 'photoRelease', 'optIn']) {
    const v = formData.get(k)
    raw[k] = typeof v === 'string' ? v : ''
  }
  const validated = validateCapture(raw)
  if (!validated.ok) return validated

  let photo: CapturePhoto | null = null
  const file = formData.get('photo')
  if (file instanceof Blob && file.size > 0) {
    if (file.size > HEADSHOT_MAX_BYTES) return { ok: false, error: 'That photo is too large — try again with a smaller one.' }
    const bytes = Buffer.from(await file.arrayBuffer())
    const sniff = sniffUpload(new Uint8Array(bytes.subarray(0, 32)))
    if (sniff.kind !== 'image' || !['image/jpeg', 'image/png', 'image/webp'].includes(sniff.type)) {
      return { ok: false, error: 'The photo needs to be a JPEG, PNG, or WebP.' }
    }
    photo = { bytes, contentType: sniff.type as CapturePhoto['contentType'] }
  }

  const res = await createCapture(event, validated.value, photo)
  if (!res.ok) return res
  return { ok: true, email: validated.value.email, delivered: res.delivered }
}
