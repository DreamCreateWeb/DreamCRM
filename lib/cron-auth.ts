import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * The single gate on every CRON_SECRET-protected route (`/api/cron/*` plus the
 * `/api/admin/*` one-shots). It replaces ~25 hand-rolled copies of
 *
 *     if (!secret || auth !== `Bearer ${secret}`) return 401
 *
 * which had two problems. First, `!==` on strings short-circuits at the first
 * differing byte, so response timing leaks a prefix-match oracle: an attacker
 * who can call the endpoint repeatedly can recover CRON_SECRET one character at
 * a time. These routes are internet-reachable (they're in the middleware
 * public-path allowlist so EventBridge can hit them) and the secret unlocks
 * mass patient email/SMS sends, the migration runner, and the demo reseed — so
 * that is worth closing. Second, 25 copies is 25 chances for the next one to
 * forget the `!secret` fail-closed check; the guard test in
 * `tests/guards/cron-auth-shared.test.ts` now makes a hand-rolled copy fail CI.
 */

/**
 * Constant-time string comparison. Both sides are hashed first so the compared
 * buffers are always 32 bytes: `timingSafeEqual` throws on a length mismatch,
 * and comparing raw strings would leak the secret's LENGTH through that throw.
 * Pure — exported for the unit tests.
 */
export function secretsMatch(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()
  return timingSafeEqual(digest(a), digest(b))
}

/**
 * True when the request carries `Authorization: Bearer ${CRON_SECRET}`.
 * Fails CLOSED: an unset or empty CRON_SECRET rejects every caller rather than
 * leaving the route open (a misconfigured deploy must break the job, not the
 * lock).
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return secretsMatch(request.headers.get('authorization') ?? '', `Bearer ${secret}`)
}

/** The shared 401 body — unchanged from what the routes returned before. */
export function cronUnauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

/**
 * Route-handler guard. Returns a 401 response to return as-is, or `null` when
 * the caller is authorized:
 *
 *     const denied = requireCronAuth(request)
 *     if (denied) return denied
 */
export function requireCronAuth(request: Request): NextResponse | null {
  return isAuthorizedCronRequest(request) ? null : cronUnauthorized()
}

/**
 * The same gate, keyed on ADMIN_READ_SECRET instead of CRON_SECRET, for the
 * read-only production check route (`/api/admin/read-check`).
 *
 * A SEPARATE secret on purpose, and the separation is the point rather than a
 * tidiness preference: CRON_SECRET unlocks mass patient email/SMS, the
 * migration runner and the demo reseed (see the header above). The read door
 * opens onto a fixed list of literal SELECTs under a SELECT-only Postgres role,
 * which is a far smaller thing — so it gets a far smaller key, and a leak of
 * one cannot be spent on the other.
 *
 * Note what is NOT the brute-force control here. `rateLimitPublicAction` is
 * documented fail-OPEN and keys on `x-forwarded-for`, so an attacker who can
 * error the limiter or rotate source IPs has no cap at all. That is the right
 * behaviour for a patient booking form and the wrong thing to lean on for a
 * bearer secret. The control is ENTROPY: ADMIN_READ_SECRET is >= 32 bytes from
 * a CSPRNG (docs/PROD-READ-ACCESS.md says how to generate it). The limiter is
 * kept because it is nearly free, not because it is load-bearing.
 *
 * Fails CLOSED on an unset or empty secret, exactly as the cron gate does.
 */
export function isAuthorizedAdminReadRequest(request: Request): boolean {
  const secret = process.env.ADMIN_READ_SECRET
  if (!secret) return false
  return secretsMatch(request.headers.get('authorization') ?? '', `Bearer ${secret}`)
}

/** Route-handler guard for the read-check route. Mirrors `requireCronAuth`. */
export function requireAdminReadAuth(request: Request): NextResponse | null {
  return isAuthorizedAdminReadRequest(request) ? null : cronUnauthorized()
}
