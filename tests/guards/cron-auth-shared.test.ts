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
  })

  it('never sees trailing whitespace, because `Headers` strips it first', () => {
    // THIS CASE USED TO READ `toBe(false)` IN THE BLOCK ABOVE, AND IT WAS
    // WRONG ABOUT PRODUCTION (DREAMCRM-115). It passed only because the suite
    // ran every file under happy-dom, whose `Headers` does not implement the
    // fetch spec's OWS trimming. Flipping the default environment to `node` —
    // which is what this code actually runs in — made it fail, and the failure
    // was the truth arriving late. It is the §2d class exactly: the predicate
    // was right and the SENTENCE was wrong, and no mutation could have found
    // it because the defect was in the environment, not the code.
    //
    // Node's `Headers` strips leading and trailing whitespace from a field
    // value on the way in (RFC 9110 OWS), so by the time
    // `isAuthorizedCronRequest` reads the header the trailing space is already
    // gone and the token matches. Measured on Node 24, not reasoned:
    //
    //     new Request(url, { headers: { authorization: 'Bearer s3cret-value ' } })
    //       .headers.get('authorization')   // -> 'Bearer s3cret-value'
    //
    // THIS IS NOT A LOOSENED SECURITY CLAIM, and the distinction is worth the
    // paragraph. The comparator is untouched and still byte-exact —
    // `secretsMatch('Bearer x', 'Bearer x ')` is false, asserted above. What
    // changed is only which string the comparator is handed, and that is the
    // HTTP layer behaving to spec on every server this code has ever run on.
    // The old assertion described a defence that was never there.
    //
    // The first line is the load-bearing one: it asserts the TRIM, so if a
    // future runtime stops trimming, this fails here rather than quietly
    // changing what the second line means.
    expect(req('Bearer s3cret-value ').headers.get('authorization')).toBe('Bearer s3cret-value')
    expect(isAuthorizedCronRequest(req('Bearer s3cret-value '))).toBe(true)
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

/** Reading a bearer secret out of the environment — the tell of a hand-rolled guard. */
const SECRET_ENV = /process\.env\.[A-Z0-9]+_SECRET\b/
/** Naming one at all, including in a comment. */
const SECRET_NAME = /\b[A-Z0-9]+_SECRET\b/

/**
 * Every route guarded by a shared bearer secret.
 *
 * It filtered on the literal string `CRON_SECRET` until DREAMCRM-42, which
 * meant a route guarded by a DIFFERENT bearer secret was invisible to all three
 * assertions below — including "no route hand-rolls the bearer comparison",
 * the one that matters most for a brand-new route.
 *
 * Widening to `process.env.<NAME>_SECRET` was NOT enough on its own, and the
 * reason is worth keeping: a route that uses the shared guard correctly never
 * touches `process.env` at all — the whole point of `lib/cron-auth.ts` is that
 * the env read lives there. So an env-only filter selects exactly the
 * hand-rolled routes and calls the tree clean, which is the wrong direction for
 * a guard. `/api/admin/read-check` was invisible to it in testing.
 *
 * So membership is "this route is guarded by a shared bearer secret" — it names
 * one, or it imports the module that checks one — and the assertions then ask
 * whether it does that correctly.
 */
const SHARED_GUARD_IMPORT = "from '@/lib/cron-auth'"

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
      const src = readFileSync(routeFile, 'utf8')
      if (SECRET_NAME.test(src) || src.includes(SHARED_GUARD_IMPORT)) out.push(routeFile)
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
      // A route that mentions a secret at all may only do so in a comment;
      // reading it from the environment is the tell of a hand-rolled guard.
      // Any `<NAME>_SECRET`, not just CRON_SECRET — the second bearer secret
      // (ADMIN_READ_SECRET) must be held to the same rule as the first.
      return SECRET_ENV.test(src) || /!==\s*`Bearer \$\{/.test(src)
    })
    expect(
      offenders.map((f) => f.replace(process.cwd(), '').replace(/\\/g, '/')),
      'These routes compare a bearer secret themselves. String !== is not constant-time and ' +
        'leaks the secret through response timing — use `requireCronAuth(request)` or ' +
        '`requireAdminReadAuth(request)` from lib/cron-auth.ts instead.',
    ).toEqual([])
  })

  it('every CRON_SECRET-gated route imports the shared guard', () => {
    const missing = guardedRouteFiles().filter(
      (f) => !readFileSync(f, 'utf8').includes(SHARED_GUARD_IMPORT),
    )
    expect(
      missing.map((f) => f.replace(process.cwd(), '').replace(/\\/g, '/')),
      'These routes reference CRON_SECRET but do not import lib/cron-auth.ts.',
    ).toEqual([])
  })
})
