/**
 * Client-safe messaging types shared by the service layer, the clinic inbox,
 * and the patient portal. Kept free of `server-only` imports so both the
 * React components and the Drizzle service can use one definition.
 */

/** One image attached to a patient message. Stored in `patient_message.meta`
 *  (jsonb) so it needs no migration. `url` is the public S3 URL the hardened
 *  `/api/upload` route returns; `contentType` is the sniffed image type. */
export interface MessageAttachment {
  url: string
  /** Original filename (display only); may be empty. */
  name: string
  /** Sniffed content type, e.g. "image/jpeg". Always an image in v1. */
  contentType: string
}

/** Hard cap on attachments per message — keeps the composer, the meta blob,
 *  and the outbound email bounded. */
export const MAX_MESSAGE_ATTACHMENTS = 6

/** True for the image types the upload route accepts. We only render/attach
 *  images in v1 (the upload route rejects everything else anyway). */
export function isImageAttachment(a: { contentType?: string | null }): boolean {
  return typeof a.contentType === 'string' && a.contentType.startsWith('image/')
}

/**
 * Coerce an untrusted value (a `meta.attachments` blob read from the DB, or a
 * client-supplied list) into a clean, bounded `MessageAttachment[]`. Drops
 * anything malformed, requires an http(s) URL, caps the count, and trims
 * display fields. Pure — safe on both client and server.
 */
export function sanitizeAttachments(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) return []
  const out: MessageAttachment[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const url = typeof r.url === 'string' ? r.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) continue
    const contentType = typeof r.contentType === 'string' ? r.contentType.trim() : ''
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 200) : ''
    out.push({ url, name, contentType: contentType.slice(0, 100) })
    if (out.length >= MAX_MESSAGE_ATTACHMENTS) break
  }
  return out
}
