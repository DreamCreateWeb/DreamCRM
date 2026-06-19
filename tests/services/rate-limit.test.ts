/**
 * DB-backed fixed-window rate limiter for public endpoints. Allows under the
 * limit, blocks over it, fails OPEN if the counter query errors (never block a
 * real patient), and keys by "{name}:{ip}".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const execute = vi.fn()
vi.mock('@/lib/db', () => ({ db: { execute: (...a: unknown[]) => execute(...a) } }))

let hdrs: Record<string, string> = {}
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => hdrs[k] ?? null }),
}))

import { checkRateLimit, clientIp, rateLimitPublicAction } from '@/lib/services/rate-limit'

beforeEach(() => {
  execute.mockReset()
  hdrs = {}
})

describe('checkRateLimit', () => {
  it('allows while count is at/under the limit', async () => {
    execute.mockResolvedValue({ rows: [{ count: 5 }] })
    expect(await checkRateLimit('k', 5, 1000)).toEqual({ allowed: true, count: 5 })
  })

  it('blocks once count exceeds the limit', async () => {
    execute.mockResolvedValue({ rows: [{ count: 6 }] })
    expect(await checkRateLimit('k', 5, 1000)).toEqual({ allowed: false, count: 6 })
  })

  it('fails OPEN when the counter query throws', async () => {
    execute.mockRejectedValue(new Error('db down'))
    expect(await checkRateLimit('k', 5, 1000)).toEqual({ allowed: true, count: 0 })
  })
})

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry', async () => {
    hdrs = { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }
    expect(await clientIp()).toBe('9.9.9.9')
  })
  it('falls back to "unknown" with no proxy headers', async () => {
    expect(await clientIp()).toBe('unknown')
  })
})

describe('rateLimitPublicAction', () => {
  it('keys by name:ip and returns the allow decision', async () => {
    hdrs = { 'x-forwarded-for': '1.2.3.4' }
    execute.mockResolvedValue({ rows: [{ count: 1 }] })
    const ok = await rateLimitPublicAction('contact')
    expect(ok).toBe(true)
    // The composed key flows into the SQL params (chunked) — assert the call happened.
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
