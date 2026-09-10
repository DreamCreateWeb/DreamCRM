import 'server-only'
import { sanitizeAttachments, type MessageAttachment } from '@/lib/types/messaging'

/**
 * Where a message attachment is allowed to live.
 *
 * `sanitizeAttachments` checks the SHAPE of an attachment list and requires an
 * http(s) URL — but any http(s) URL passed, and the portal composer hands its
 * list straight to the server action. So a patient (or anyone who can reach
 * the action) could attach `https://attacker.example/pixel.png`: the staff
 * inbox renders attachments as `<img src>`, so opening the thread fires a
 * request from the front desk's browser. That is a tracking pixel — it tells
 * an outsider when a clinic read a message and from what IP — and the same
 * URL is what the intake OCR path would fetch, so it also burns the clinic's
 * AI allowance on someone else's bytes.
 *
 * Attachments only ever come from our OWN hardened upload route, so the
 * boundary is simple: an attachment URL must point at our storage. Anything
 * else is dropped (the same "drop what's malformed" contract the shape
 * sanitizer already has) rather than rejected, so one bad entry never blocks a
 * patient's actual message.
 */

/** `*.public.blob.vercel-storage.com` — the Vercel Blob driver's public host. */
const VERCEL_BLOB_SUFFIX = '.public.blob.vercel-storage.com'

function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * The exact hosts our uploads can land on, derived from the same env the
 * storage drivers read (`lib/blob-s3.ts`), plus an explicit escape hatch for a
 * CloudFront/custom origin or historical URLs:
 * `ATTACHMENT_HOST_ALLOWLIST=cdn.example.com,legacy.example.net`.
 *
 * Read per call, not cached at module load — env is injected at runtime on App
 * Runner and the tests flip it between cases.
 */
export function allowedAttachmentHosts(): string[] {
  const hosts = new Set<string>()

  const explicitBase = process.env.S3_PUBLIC_BASE_URL
  if (explicitBase) {
    const h = hostOf(explicitBase)
    if (h) hosts.add(h)
  }

  const bucket = process.env.S3_BUCKET
  if (bucket) {
    const region = process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1'
    hosts.add(`${bucket}.s3.${region}.amazonaws.com`.toLowerCase())
  }

  for (const raw of (process.env.ATTACHMENT_HOST_ALLOWLIST ?? '').split(',')) {
    const entry = raw.trim().toLowerCase()
    if (!entry) continue
    // Tolerate a full URL or a bare host in the env value.
    hosts.add(hostOf(entry) ?? entry)
  }

  return Array.from(hosts)
}

/** True when `url` points at storage we control. */
export function isAllowedAttachmentUrl(url: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  // The Vercel Blob driver mints a per-store subdomain, so it's a suffix match
  // on a host WE own — never a bare `endsWith` on an attacker-chooseable label.
  if (host.endsWith(VERCEL_BLOB_SUFFIX)) return true
  return allowedAttachmentHosts().includes(host)
}

/**
 * The trust boundary for a CLIENT-SUPPLIED attachment list: shape-sanitize,
 * then drop anything not hosted on our own storage.
 *
 * Deliberately NOT applied when reading `meta.attachments` back out of the
 * database — a URL already stored under an older configuration should still
 * render for the staff who received it; the gate belongs at the write.
 */
export function sanitizeUploadedAttachments(value: unknown): MessageAttachment[] {
  const shaped = sanitizeAttachments(value)
  const kept = shaped.filter((a) => isAllowedAttachmentUrl(a.url))
  if (kept.length !== shaped.length) {
    console.warn(
      `[attachments] dropped ${shaped.length - kept.length} attachment(s) on a host we do not serve ` +
        `(allowed: ${allowedAttachmentHosts().join(', ') || '(storage env unset)'}${`, *${VERCEL_BLOB_SUFFIX}`})`,
    )
  }
  return kept
}
