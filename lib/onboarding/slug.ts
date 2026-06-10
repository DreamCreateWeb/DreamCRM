/**
 * Clinic web-address (subdomain) slug rules — client-safe.
 * The live availability check lives in app/(onboarding)/actions.ts.
 */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/

/** Subdomains that can never be a clinic site. */
export const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'mail', 'smtp', 'admin', 'platform', 'dashboard',
  'portal', 'blog', 'docs', 'help', 'support', 'status', 'assets', 'cdn',
  'static', 'dev', 'test', 'staging', 'demo', 'dream-create', 'dreamcrm',
])

export function isValidClinicSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 40 && SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug)
}
