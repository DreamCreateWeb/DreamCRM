import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { secretsMatch, isAuthorizedCronRequest, requireCronAuth } from '@/lib/cron-auth'

/**
 * The CRON_SECRET gate.
 *
 * Every `/api/cron/*` route and the `/api/admin/*` one-shots are in the
 * middleware public-path allowlist (EventBridge has no session), so the only
 * thing between the open internet and "send every patient an email", "run the
 * migrations" or "reseed the demo org" is this bearer check. It used to be 25
 * hand-rolled `auth !== \`Bearer ${secret}\`` copies — a non-constant-time
 * compare that leaks the secret prefix-by-prefix through response timing, and
 * 25 chances to forget the fail-closed check on the next route.
 *
 * The adoption test at the bottom is the durable part: it fails CI the moment
 * a new route hand-rolls the guard again.
 */

const ORIGINAL_SECRET = process.env.CRON_SECRET

function req(authorization?: string): Request {
  return new Request('https://app.example/api/cron/whatever', {
    headers: authorization === undefined ? {} : { authorization },
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = 's3cret-value'
})

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = ORIGINAL_SECRET
})

describe('secretsMatch', () => {
  it('is true only for an exact match', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true)
    expect(secretsMatch('abc', 'abd')).toBe(false)
    expect(secretsMatch('', '')).toBe(true)
  })

  it('handles different lengths without throwing (hashed before compare)', () => {
    // Raw timingSafeEqual throws on a length mismatch — which would itself leak
    // the secret's length. Hashing first makes both sides 32 bytes.
    expect(() => secretsMatch('a', 'a-much-longer-secret')).not.toThrow()
    expect(secretsMatch('a', 'a-much-longer-secret')).toBe(false)
    expect(secretsMatch('a-much-longer-secret', 'a')).toBe(false)
  })

  it('is case- and whitespace-sensitive', () => {
    expect(secretsMatch('Bearer x', 'bearer x')).toBe(false)
    expect(secretsMatch('Bearer x', 'Bearer x ')).toBe(false)
  })

  it('compares bytes, not unicode-normalized text', () => {
    expect(secretsMatch('é', 'é')).toBe(false)
  })
})

describe('isAuthorizedCronRequest', () => {
  it('accepts the exact bearer token', () => {
    expect(isAuthorizedCronRequest(req('Bearer s3cret-value'))).toBe(true)
  })

  it('rejects a wrong, prefix, or extended token', () => {
    expect(isAuthorizedCronRequest(req('Bearer wrong'))).toBe(false)
    expect(isAuthorizedCronRequest(req('Bearer s3cret-valu'))).toBe(false)
    expect(isAuthorizedCronRequest(req('Bearer s3cret-value-extra'))).toBe(false)
    expect(isAuthorizedCronRequest(req('Bearer s3cret-value '))).toBe(false)
  })

  it('rejects a missing or malformed header', () => {
    expect(isAuthorizedCronRequest(req())).toBe(false)
    expect(isAuthorizedCronRequest(req(''))).toBe(false)
    expect(isAuthorizedCronRequest(req('s3cret-value'))).toBe(false)
    expect(isAuthorizedCronRequest(req('Basic s3cret-value'))).toBe(false)
  })

  it('fails CLOSED when CRON_SECRET is unset or empty', () => {
    delete process.env.CRON_SECRET
    expect(isAuthorizedCronRequest(req('Bearer s3cret-value'))).toBe(false)
    expect(isAuthorizedCronRequest(req('Bearer '))).toBe(false)
    process.env.CRON_SECRET = ''
    expect(isAuthorizedCronRequest(req('Bearer '))).toBe(false)
  })
})

describe('requireCronAuth', () => {
  it('returns null for an authorized caller', () => {
    expect(requireCronAuth(req('Bearer s3cret-value'))).toBeNull()
  })

  it('returns the shared 401 body for everyone else', async () => {
    const res = requireCronAuth(req('Bearer nope'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    expect(await res!.json()).toEqual({ error: 'unauthorized' })
  })
})

// ── Adoption guard ───────────────────────────────────────────────────────────

function guardedRouteFiles(): string[] {
  const out: string[] = []
  for (const base of ['app/api/cron', 'app/api/admin']) {
    const dir = join(process.cwd(), base)
    for (const name of readdirSync(dir)) {
      const routeFile = join(dir, name, 'route.ts')
      try {
        if (!statSync(routeFile).isFile()) continue
      } catch {
        continue
      }
      if (readFileSync(routeFile, 'utf8').includes('CRON_SECRET')) out.push(routeFile)
    }
  }
  return out
}

describe('shared cron auth adoption', () => {
  it('finds the CRON_SECRET-gated routes (the scanner did not silently break)', () => {
    expect(guardedRouteFiles().length).toBeGreaterThanOrEqual(20)
  })

  it('no route hand-rolls the bearer comparison', () => {
    const offenders = guardedRouteFiles().filter((f) => {
      const src = readFileSync(f, 'utf8')
      // A route that mentions CRON_SECRET at all may only do so in a comment;
      // reading it from the environment is the tell of a hand-rolled guard.
      return /process\.env\.CRON_SECRET/.test(src) || /!==\s*`Bearer \$\{/.test(src)
    })
    expect(
      offenders.map((f) => f.replace(process.cwd(), '').replace(/\\/g, '/')),
      'These routes compare CRON_SECRET themselves. String !== is not constant-time and ' +
        'leaks the secret through response timing — use `requireCronAuth(request)` from ' +
        'lib/cron-auth.ts instead.',
    ).toEqual([])
  })

  it('every CRON_SECRET-gated route imports the shared guard', () => {
    const missing = guardedRouteFiles().filter(
      (f) => !readFileSync(f, 'utf8').includes("from '@/lib/cron-auth'"),
    )
    expect(
      missing.map((f) => f.replace(process.cwd(), '').replace(/\\/g, '/')),
      'These routes reference CRON_SECRET but do not import lib/cron-auth.ts.',
    ).toEqual([])
  })
})
