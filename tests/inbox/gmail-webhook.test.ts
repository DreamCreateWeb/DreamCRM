import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => {
  process.env.GMAIL_PUBSUB_SA_EMAIL = 'dreamcrm-admin@dreamcrm-496717.iam.gserviceaccount.com'
  vi.resetModules()
})

vi.mock('@/lib/services/mailbox', () => ({
  processHistoryEvent: vi.fn(async () => ({ ingested: 0 })),
}))

describe('Gmail Pub/Sub webhook auth gate', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/gmail/route')
    const req = new Request('https://dreamcreatestudio.com/api/webhooks/gmail', {
      method: 'POST',
      body: JSON.stringify({ message: { data: 'e30=' } }),
    })
    // Next.js's NextRequest is a Request subclass; the route only touches
    // headers / json(), so a plain Request works fine here.
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 401 when the bearer token fails verification (no JWKS match)', async () => {
    // Stub fetch so the JWKS endpoint returns an empty key set — any token
    // we send will fail signature/kid lookup. This proves we don't short-
    // circuit verification on shape alone.
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = url.toString()
      if (u.includes('/oauth2/v3/certs')) {
        return new Response(JSON.stringify({ keys: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch in test: ${u}`)
    }) as typeof fetch

    const { POST } = await import('@/app/api/webhooks/gmail/route')
    // Construct a token with a header that looks valid but won't match.
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'nope', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com' })).toString('base64url')
    const fakeToken = `${header}.${payload}.sig`
    const req = new Request('https://dreamcreatestudio.com/api/webhooks/gmail', {
      method: 'POST',
      headers: { authorization: `Bearer ${fakeToken}` },
      body: JSON.stringify({ message: { data: 'e30=' } }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
    globalThis.fetch = originalFetch
  })

  it('returns 500 when GMAIL_PUBSUB_SA_EMAIL is not configured', async () => {
    delete process.env.GMAIL_PUBSUB_SA_EMAIL
    const { POST } = await import('@/app/api/webhooks/gmail/route')
    const req = new Request('https://dreamcreatestudio.com/api/webhooks/gmail', {
      method: 'POST',
      headers: { authorization: 'Bearer anything' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(500)
  })
})
