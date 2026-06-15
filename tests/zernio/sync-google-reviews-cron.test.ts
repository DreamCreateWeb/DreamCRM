import { describe, it, expect, beforeEach, vi } from 'vitest'

// Keep the engine inert — the CRON_SECRET gate runs before any service call.
const syncAll = vi.fn(async () => ({ scanned: 2, synced: 5, failed: 0, errors: [] }))
vi.mock('@/lib/services/google-reviews', () => ({
  syncAllGoogleReviews: () => syncAll(),
}))

const ROUTE = '@/app/api/cron/sync-google-reviews/route'

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret'
  vi.clearAllMocks()
})

describe('sync-google-reviews cron auth gate', () => {
  it('401s when the Authorization header is missing', async () => {
    const { POST } = await import(ROUTE)
    const res = await POST(new Request('https://www.dreamcreatestudio.com/api/cron', { method: 'POST' }))
    expect(res.status).toBe(401)
    expect(syncAll).not.toHaveBeenCalled()
  })

  it('401s when the bearer token is wrong', async () => {
    const { GET } = await import(ROUTE)
    const res = await GET(
      new Request('https://www.dreamcreatestudio.com/api/cron', {
        method: 'GET',
        headers: { authorization: 'Bearer not-the-secret' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('401s when CRON_SECRET is not configured (never wide-open)', async () => {
    delete process.env.CRON_SECRET
    const { POST } = await import(ROUTE)
    const res = await POST(
      new Request('https://www.dreamcreatestudio.com/api/cron', {
        method: 'POST',
        headers: { authorization: 'Bearer anything' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('runs the sweep + returns ok:true with batch health on a valid bearer', async () => {
    const { POST } = await import(ROUTE)
    const res = await POST(
      new Request('https://www.dreamcreatestudio.com/api/cron', {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, scanned: 2, synced: 5, failed: 0, errors: [] })
    expect(syncAll).toHaveBeenCalledTimes(1)
  })
})
