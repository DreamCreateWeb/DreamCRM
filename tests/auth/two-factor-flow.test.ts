// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { twoFactor } from 'better-auth/plugins'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-58 — the REAL better-auth twoFactor plugin, run end to end against its
 * in-memory adapter with the same options lib/auth/server.ts passes: enrol →
 * sign-in needs the code; a backup code works once; disable. No hand-rolled
 * OTP — codes are made with the library's own TOTP from the enrolled secret.
 */

/** RFC 6238 TOTP (SHA-1, 6 digits, 30s) from the base32 secret an authenticator app scans. */
function totpNow(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)))
  const h = createHmac('sha1', bytes).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

function makeAuth() {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [], twoFactor: [] }
  return betterAuth({
    secret: 'test-secret-test-secret-test-secret-123',
    baseURL: 'http://localhost:3000',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: [twoFactor({ issuer: 'DreamCRM' })],
  })
}

const EMAIL = 'staff@example.com'
const PASSWORD = 'correct-horse-battery'

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
}

async function enrol() {
  const auth = makeAuth()
  const up = await auth.api.signUpEmail({ body: { email: EMAIL, password: PASSWORD, name: 'Staff' }, asResponse: true })
  const cookie = cookiesFrom(up)
  const headers = new Headers({ cookie })
  const en = (await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers })) as {
    totpURI: string
    backupCodes: string[]
  }
  const secret = new URL(en.totpURI).searchParams.get('secret') as string
  const code = totpNow(secret)
  const verified = await auth.api.verifyTOTP({ body: { code }, headers, asResponse: true })
  // Enrolling re-issues the session cookie; carry the fresh one forward.
  const fresh = cookiesFrom(verified)
  return { auth, secret, en, headers: new Headers({ cookie: fresh || cookie }) }
}

describe('two-step sign-in — the plugin end to end', () => {
  it('issues the DreamCRM issuer and ten backup codes on enrol', async () => {
    const { en } = await enrol()
    expect(en.totpURI).toContain('issuer=DreamCRM')
    expect(en.backupCodes.length).toBeGreaterThanOrEqual(10)
  })

  it('after enrolment a password sign-in issues NO session — it asks for the code', async () => {
    const { auth } = await enrol()
    const res = (await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } })) as {
      twoFactorRedirect?: boolean
      token?: string | null
    }
    expect(res.twoFactorRedirect).toBe(true)
    expect(res.token ?? null).toBeNull()
  })

  it('a correct TOTP completes the sign-in; a wrong one does not', async () => {
    const { auth, secret } = await enrol()
    const r = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true })
    const challenge = new Headers({ cookie: cookiesFrom(r) })
    await expect(auth.api.verifyTOTP({ body: { code: '000000' }, headers: challenge })).rejects.toBeTruthy()
    const code = totpNow(secret)
    const ok = await auth.api.verifyTOTP({ body: { code }, headers: challenge, asResponse: true })
    expect(ok.status).toBe(200)
  })

  it('a backup code signs in once and is consumed', async () => {
    const { auth, en } = await enrol()
    const first = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true })
    const ok = await auth.api.verifyBackupCode({
      body: { code: en.backupCodes[0] },
      headers: new Headers({ cookie: cookiesFrom(first) }),
      asResponse: true,
    })
    expect(ok.status).toBe(200)
    const second = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD }, asResponse: true })
    await expect(
      auth.api.verifyBackupCode({
        body: { code: en.backupCodes[0] },
        headers: new Headers({ cookie: cookiesFrom(second) }),
      }),
    ).rejects.toBeTruthy()
  })

  it('disable re-asks the password, then sign-in needs no code', async () => {
    const { auth, headers } = await enrol()
    await expect(auth.api.disableTwoFactor({ body: { password: 'wrong-password-here' }, headers })).rejects.toBeTruthy()
    await auth.api.disableTwoFactor({ body: { password: PASSWORD }, headers })
    const res = (await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } })) as {
      twoFactorRedirect?: boolean
      token?: string | null
    }
    expect(res.twoFactorRedirect).toBeFalsy()
    expect(res.token).toBeTruthy()
  })
})

describe('two-step sign-in — wiring', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('the server registers the plugin with the DreamCRM issuer, and never the SMS/email OTP channel', () => {
    const server = src('lib/auth/server.ts')
    expect(server).toMatch(/twoFactor\(\{ issuer: 'DreamCRM' \}\)/)
    expect(server).not.toMatch(/otpOptions|sendOTP/)
  })
  it('the client carries the plugin; the portal magic-link client is untouched', () => {
    const client = src('lib/auth/client.ts')
    expect(client).toContain('twoFactorClient()')
    expect(client).toContain('magicLinkClient()')
  })
  it('the secret and codes live only in the plugin table; nothing logs a code', () => {
    for (const f of ['components/auth/two-step.tsx', 'app/(auth)/signin/second-step.tsx', 'lib/services/two-step-log.ts']) {
      expect(src(f)).not.toMatch(/console\.(log|info|warn|error)\([^)]*(code|secret|backup)/i)
    }
  })
})
