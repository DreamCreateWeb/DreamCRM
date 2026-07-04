// Pure email intelligence for prospecting — syntax, role/disposable/junk
// classification, contact-role inference, and the send-preference ranking.
// No server-only deps (DNS/MX verification lives in the service layer) so
// this whole surface is unit-testable and reusable in the UI.
//
// The doctrine: we NEVER fabricate an address (no info@ guessing). This
// module only classifies + ranks addresses we actually discovered, so the
// engine can prefer a real person (drjane@…) over a generic desk (info@…)
// and never auto-send to an address that can't receive mail.

export const CONTACT_ROLES = [
  'owner', // matches the practice's named owner/dentist — the prize
  'personal', // a person's name, not the owner we know of
  'front_desk', // office@ reception@ frontdesk@ appointments@ scheduling@
  'billing', // billing@ accounts@
  'generic', // info@ contact@ hello@ admin@ — a shared inbox
  'unknown',
] as const
export type ContactRole = (typeof CONTACT_ROLES)[number]

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  owner: 'Owner',
  personal: 'Personal',
  front_desk: 'Front desk',
  billing: 'Billing',
  generic: 'Shared inbox',
  unknown: 'Unknown',
}

// Deliverability verdicts (the service fills these from a live MX check).
export const EMAIL_VERIFY_STATUSES = ['valid', 'risky', 'invalid', 'unknown'] as const
export type EmailVerifyStatus = (typeof EMAIL_VERIFY_STATUSES)[number]

export const EMAIL_VERIFY_LABELS: Record<EmailVerifyStatus, string> = {
  valid: 'Verified',
  risky: 'Risky',
  invalid: "Won't deliver",
  unknown: 'Unchecked',
}

// Strict enough to reject the crawl's false positives (logo@2x.png), lax
// enough for real addresses. Single @, a dotted TLD of ≥2 letters.
const EMAIL_SYNTAX = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i

// Domains that end in an asset extension are almost always a mis-parsed
// image reference (`sprite@2x.png`, `hero.jpg`), never a mailbox.
const ASSET_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js', 'ico', 'woff', 'woff2', 'ttf'])

// Never-real / tracking / template junk local-or-domain fragments.
const JUNK_FRAGMENTS = ['example.', 'sentry', 'wixpress', 'yourdomain', 'domain.com', 'email.com', '@2x', '@3x', 'godaddy.com/', 'squarespace']

// A small curated disposable-domain set (the common throwaways). Not
// exhaustive — it's a cheap first gate; MX verification is the real check.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'trashmail.com',
  'yopmail.com', 'sharklasers.com', 'getnada.com', 'maildrop.cc',
  'dispostable.com', 'fakeinbox.com', 'mintemail.com',
])

// Big free consumer providers — a dentist on gmail is a real personal
// address (email it), just not a custom-domain professional one.
const FREE_PROVIDERS = new Set([
  'gmail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com',
  'live.com', 'aol.com', 'icloud.com', 'me.com', 'msn.com', 'comcast.net',
])

// Role local-parts → the role bucket they imply.
const ROLE_LOCALPARTS: Record<string, ContactRole> = {
  info: 'generic', contact: 'generic', hello: 'generic', hi: 'generic',
  admin: 'generic', mail: 'generic', email: 'generic', team: 'generic',
  staff: 'generic', general: 'generic', inquiries: 'generic', enquiries: 'generic',
  office: 'front_desk', frontdesk: 'front_desk', 'front-desk': 'front_desk',
  reception: 'front_desk', receptionist: 'front_desk', appointments: 'front_desk',
  appointment: 'front_desk', appts: 'front_desk', scheduling: 'front_desk',
  schedule: 'front_desk', booking: 'front_desk', bookings: 'front_desk',
  desk: 'front_desk', patients: 'front_desk', newpatients: 'front_desk',
  billing: 'billing', accounts: 'billing', accounting: 'billing',
  payments: 'billing', insurance: 'billing', ar: 'billing',
}

const NOREPLY = new Set(['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'bounce', 'mailer-daemon', 'postmaster'])

export interface ParsedEmail {
  email: string // lowercased, trimmed
  localPart: string
  domain: string
}

/** Lowercase + validate syntax; null if it isn't a plausible address. */
export function parseEmail(raw: string | null | undefined): ParsedEmail | null {
  if (!raw) return null
  const email = raw.trim().toLowerCase()
  if (!EMAIL_SYNTAX.test(email)) return null
  const at = email.lastIndexOf('@')
  const localPart = email.slice(0, at)
  const domain = email.slice(at + 1)
  const tld = domain.slice(domain.lastIndexOf('.') + 1)
  if (ASSET_TLDS.has(tld)) return null
  return { email, localPart, domain }
}

/** Tracking/template/asset junk we should never store as a contact. */
export function isJunkEmail(raw: string): boolean {
  const email = raw.trim().toLowerCase()
  if (JUNK_FRAGMENTS.some((f) => email.includes(f))) return true
  const parsed = parseEmail(email)
  if (!parsed) return true
  if (NOREPLY.has(parsed.localPart)) return true
  return false
}

export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase())
}

export function isFreeProvider(domain: string): boolean {
  return FREE_PROVIDERS.has(domain.toLowerCase())
}

/** normalize a person name to comparable lowercase tokens ≥3 chars. */
function nameTokens(personName: string | null | undefined): string[] {
  if (!personName) return []
  return personName
    .toLowerCase()
    .replace(/\b(dr|dds|dmd|md|phd|mr|mrs|ms|jr|sr|the|and)\b\.?/g, ' ')
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3)
}

/**
 * Does this local-part look like it belongs to the named owner? Matches a
 * whole name token (drjane, jane.roe, roe) or the flast / firstl patterns.
 */
export function matchesPersonName(localPart: string, personName: string | null | undefined): boolean {
  const tokens = nameTokens(personName)
  if (tokens.length === 0) return false
  const lp = localPart.replace(/[^a-z]/g, '')
  if (tokens.some((t) => lp.includes(t))) return true
  // flast / firstl (needs both a first and last token).
  if (tokens.length >= 2) {
    const [first, last] = [tokens[0], tokens[tokens.length - 1]]
    if (lp === first[0] + last || lp === first + last[0] || lp.startsWith(first[0] + last)) return true
  }
  return false
}

/**
 * Infer the contact's role from the address (+ the owner name we know from
 * NPPES). Owner-name match wins; then role local-parts; then a name-shaped
 * local-part on a custom/free domain reads as a person.
 */
export function contactRoleFor(email: string, personName?: string | null): ContactRole {
  const parsed = parseEmail(email)
  if (!parsed) return 'unknown'
  if (matchesPersonName(parsed.localPart, personName)) return 'owner'
  const roleHit = ROLE_LOCALPARTS[parsed.localPart]
  if (roleHit) return roleHit
  // A local-part that's a plain word/name (letters, maybe one dot) on a
  // real domain reads as a personal mailbox (drsmith, jsmith, jane.roe).
  if (/^[a-z]+(?:[._][a-z]+)?$/.test(parsed.localPart)) return 'personal'
  return 'unknown'
}

/**
 * Send-preference score — higher is a better address to reach out on. Role
 * gives the base; deliverability adjusts; disposable/invalid are floored so
 * they can never become the primary. Deterministic (no ties broken by
 * chance — callers add a stable secondary sort).
 */
export function rankContactEmail(input: {
  email: string
  personName?: string | null
  verifyStatus?: EmailVerifyStatus
}): number {
  const parsed = parseEmail(input.email)
  if (!parsed) return -1000
  if (isDisposableDomain(parsed.domain)) return -1000

  const role = contactRoleFor(input.email, input.personName)
  const base = ({
    owner: 100,
    personal: 72,
    front_desk: 55,
    billing: 38,
    generic: 30,
    unknown: 45,
  } as Record<ContactRole, number>)[role]

  // A custom-domain personal address edges out a free-provider one.
  const domainBonus = !isFreeProvider(parsed.domain) && (role === 'personal' || role === 'owner') ? 6 : 0

  const deliver = ({
    valid: 0,
    unknown: -2,
    risky: -6,
    invalid: -1000,
  } as Record<EmailVerifyStatus, number>)[input.verifyStatus ?? 'unknown']

  return base + domainBonus + deliver
}

/** Given discovered addresses, pick the best sendable primary (or null). */
export function pickPrimaryEmail(
  contacts: Array<{ email: string; verifyStatus?: EmailVerifyStatus }>,
  personName?: string | null,
): string | null {
  const ranked = contacts
    .map((c) => ({ email: c.email, score: rankContactEmail({ ...c, personName }) }))
    .filter((c) => c.score > -900) // exclude invalid/disposable
    .sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))
  return ranked[0]?.email ?? null
}
