import 'server-only'
import { sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db } from '@/lib/db'

/**
 * Fixed-window rate limiter for unauthenticated public endpoints. App Runner
 * runs multiple instances, so this is DB-backed (in-memory wouldn't share state
 * across containers). One atomic upsert per call implements the window: within
 * the window we increment; once it's elapsed we reset to 1.
 *
 * Fail-OPEN: if the limiter query itself errors we allow the request — a flaky
 * counter must never block a real patient from booking or submitting a form.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; count: number }> {
  const cutoffSec = (Date.now() - windowMs) / 1000
  const nowSec = Date.now() / 1000
  try {
    const result = await db.execute(sql`
      INSERT INTO rate_limit (key, window_start, count)
      VALUES (${key}, to_timestamp(${nowSec}), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limit.window_start > to_timestamp(${cutoffSec}) THEN rate_limit.count + 1 ELSE 1 END,
        window_start = CASE WHEN rate_limit.window_start > to_timestamp(${cutoffSec}) THEN rate_limit.window_start ELSE to_timestamp(${nowSec}) END
      RETURNING count
    `)
    const count = Number((result.rows?.[0] as { count?: number | string } | undefined)?.count ?? 0)
    return { allowed: count <= limit, count }
  } catch {
    // Limiter unavailable — don't punish the user.
    return { allowed: true, count: 0 }
  }
}

/**
 * Best-effort client IP from the proxy headers App Runner sets. Falls back to a
 * constant so a missing header degrades to a shared (still-capped) bucket rather
 * than crashing — the cap just applies more broadly in that case.
 */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers()
    const fwd = h.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0]!.trim()
    return h.get('x-real-ip')?.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Convenience: rate-limit a public action by "{name}:{ip}". Returns whether the
 * request is allowed. Defaults: 8 hits / 5 minutes — generous for a real person,
 * tight on a script.
 */
export async function rateLimitPublicAction(
  name: string,
  opts: { limit?: number; windowMs?: number } = {},
): Promise<boolean> {
  const ip = await clientIp()
  const { allowed } = await checkRateLimit(`${name}:${ip}`, opts.limit ?? 8, opts.windowMs ?? 5 * 60_000)
  return allowed
}
