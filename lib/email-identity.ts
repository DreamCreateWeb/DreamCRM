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
  /** The clinic's brand on patient-facing email (`patientEmailShell`): logo
   *  URL, brand colour (#RRGGBB), one-line postal address and phone. All
   *  optional + nullable: a sender built without them still renders a valid
   *  shell (name-only header, neutral ink button, no footer details). */
  logoUrl?: string | null
  brandColor?: string | null
  address?: string | null
  phone?: string | null
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

// ─── Tier 3: the practice's own domain ───────────────────────────────────────
// Once the clinic's site is ACTIVE on its own domain and Resend reports that
// domain's sending records VERIFIED, patient email comes from
// `hello@<their domain>`. Reply-To is untouched (the platform's inbound domain
// still routes replies to /messages — we never touch the clinic's MX). Tier 2
// (a designated Gmail mailbox) still wins at transport time.

export type EmailDomainStatus = 'pending' | 'verified' | 'failed'

/** The local part patients see on the practice's own domain. */
export const OWN_DOMAIN_LOCAL_PART = 'hello'

/** The bare host for a site domain: lower-cased, scheme / path / port
 *  stripped, a leading `www.` dropped. Null when it is not a host. */
export function emailDomainFor(siteDomain: string | null | undefined): string | null {
  const raw = (siteDomain ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/:?#]/)[0] ?? ''
  const host = raw.replace(/^www\./, '').replace(/\.$/, '')
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null
  return host
}

export type SenderTier = 'gmail' | 'own_domain' | 'platform'

export interface SenderTierInput {
  /** A designated, usable connected Gmail mailbox exists. */
  hasGmail: boolean
  /** The custom domain's state ('active' only counts). */
  customDomainState: string | null | undefined
  /** The clinic's current site domain (`clinic_profile.website_domain`). */
  websiteDomain: string | null | undefined
  /** The Resend domain the clinic registered and its verification state. */
  emailDomainName: string | null | undefined
  emailDomainStatus: string | null | undefined
}

/** The ONE pure tier decision. Own-domain needs: site live there, Resend
 *  verified, AND the verified domain still being the site's domain (a removed
 *  or swapped custom domain never sends from a stale one). */
export function resolveSenderTier(i: SenderTierInput): SenderTier {
  if (i.hasGmail) return 'gmail'
  const site = emailDomainFor(i.websiteDomain)
  if (
    i.customDomainState === 'active' &&
    i.emailDomainStatus === 'verified' &&
    site &&
    i.emailDomainName &&
    i.emailDomainName.toLowerCase() === site
  ) {
    return 'own_domain'
  }
  return 'platform'
}
