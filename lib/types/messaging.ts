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

/**
 * List bounds for the messages surface. Pure numbers, so they live here rather
 * than in the `server-only` service — a client component (and every test that
 * mocks the service) can read them without pulling the service in.
 */

/** One inbox screenful of conversations. Generous — a ceiling, not pagination. */
export const DEFAULT_THREAD_LIMIT = 100
/** The hard ceiling, so a hand-built query string can't reopen the full scan. */
export const MAX_THREAD_LIMIT = 500
/** One conversation screenful. A years-long thread is bounded, not unbounded. */
export const DEFAULT_THREAD_MESSAGE_LIMIT = 200
/** The message stream's own ceiling — the twin of MAX_THREAD_LIMIT. */
export const MAX_THREAD_MESSAGE_LIMIT = 500

/**
 * Clamp a caller-supplied row limit into `[1, max]`, falling back to `fallback`
 * for anything that is not a real number.
 *
 * Written once because the hand-rolled version was written three times and was
 * wrong in a different way each time: `Math.min(Math.max(1, Math.trunc(x)), max)`
 * returns `NaN` for `NaN` — and `NaN` reaches Postgres as `limit NaN` — while
 * the message stream's copy had no upper bound at all, so a hand-typed value
 * could reopen exactly the unbounded read the cap exists to close.
 *
 * None of that is reachable from today's callers, which pass constants or gate
 * on `Number.isFinite` first. That is the point: a bound that is only correct
 * because of what its callers happen to do is not a bound.
 */
export function clampRowLimit(value: number | undefined | null, fallback: number, max: number): number {
  if (value == null) return Math.min(Math.max(1, fallback), max)
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return Math.min(Math.max(1, fallback), max)
  return Math.min(Math.max(1, n), max)
}

/**
 * Escape a user-typed search term for use inside a SQL `LIKE` pattern.
 *
 * `%` and `_` are ordinary characters to the JavaScript `includes` this search
 * replaced, and wildcards to `LIKE`. Without this, a patient searching for
 * `50%` matches every thread and one searching `a_b` matches `axb`. The term is
 * parameterized either way, so this is search quality, not injection — but a
 * search box that quietly means something else than it says is still a bug.
 *
 * Pair it with an explicit `escape '\'` clause: the backslash default is not
 * guaranteed across every collation/config.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`)
}
