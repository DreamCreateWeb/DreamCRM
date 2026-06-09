/**
 * Pure helpers for per-clinic email sender identity (Tier 1). No transport, no
 * DB — kept separate from lib/email.ts (which several tests mock) so these stay
 * directly testable and importable by the DB-backed resolver in
 * lib/services/clinic-sender.ts without dragging in the Resend client.
 */

/** Per-clinic sender identity for patient-facing email. `from` is a full From
 *  header (`Acme Dental <acme-dental@dreamcreatestudio.com>`); the address stays
 *  on the platform's verified domain so there's no per-clinic DNS. `name` is the
 *  resolved display name (also used to sign/greet in the body). `replyTo` is the
 *  clinic's own inbox when deliverable, else null. */
export interface ClinicSender {
  from: string
  replyTo: string | null
  name: string
  /** The clinic's IANA timezone — used to render appointment times in
   *  patient-facing email at the clinic's wall-clock, not the server's (UTC). */
  timeZone: string
  /** Tier 2: when present, send via this connected Gmail account AS the clinic's
   *  real address. `from` here is the full header ("Acme Dental" <front@clinic.com>).
   *  Transport falls back to the platform `from`/`replyTo` above if Gmail fails. */
  gmail?: { accountId: string; from: string }
}

/** Build a "Display Name <address>" header, sanitizing the name against header
 *  injection. The display name is what patients actually read in their inbox. */
export function formatFromHeader(name: string, address: string): string {
  const safeName = (name || '').replace(/[\r\n"<>]/g, '').trim().slice(0, 78) || 'Your dental office'
  return `${safeName} <${address}>`
}

/** Build a From header from a clinic display name + a per-clinic local-part on
 *  the platform's verified sending domain. Sanitizes both against header
 *  injection. */
export function clinicSenderFrom(name: string, localPart: string, domain: string): string {
  const safeLocal = (localPart || 'clinic').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 64) || 'clinic'
  return formatFromHeader(name, `${safeLocal}@${domain}`)
}

/** A clinic email is only usable as a Reply-To if it's plausibly deliverable.
 *  Reserved / non-routable domains (RFC 2606 / 6761 — `.example`, `.test`,
 *  `.invalid`, `.localhost`, plus the `example.com/org/net` placeholders) and
 *  malformed addresses are rejected, so a patient's reply never bounces (the
 *  demo's `hello@acme-dental.example` is the canonical case). */
export function deliverableReplyTo(email: string | null | undefined): string | null {
  const trimmed = (email ?? '').trim()
  const lower = trimmed.toLowerCase()
  const at = lower.indexOf('@')
  if (at <= 0 || at === lower.length - 1) return null
  const domain = lower.slice(at + 1)
  if (!domain.includes('.')) return null
  const tld = domain.slice(domain.lastIndexOf('.') + 1)
  if (['example', 'test', 'invalid', 'localhost'].includes(tld)) return null
  if (/(^|\.)example\.(com|org|net)$/.test(domain)) return null
  return trimmed
}
