import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenDentalProvider } from '@/lib/services/pms/open-dental'

/**
 * Open Dental's free-tier read key is rate-limited (~1 req / 5s). The paginated
 * read loop must back off on a 429 (or transient 5xx) and pace itself between
 * pages, or a multi-page pull will 429 the office's key. `sleep` is injectable
 * so these tests assert the backoff WITHOUT actually waiting.
 */

beforeEach(() => {
  process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY = 'devkey'
  delete process.env.PMS_OPEN_DENTAL_BASE_URL
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.PMS_OPEN_DENTAL_DEVELOPER_KEY
})

// A fetch stub that replays a scripted sequence of responses, one per call.
function scriptedFetch(responses: Array<{ ok: boolean; status: number; body: unknown }>) {
  let i = 0
  return vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)]
    i++
    return { ok: r.ok, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) }
  })
}

const ok = (body: unknown) => ({ ok: true, status: 200, body })
const fail = (status: number) => ({ ok: false, status, body: 'err' })

describe('OpenDental paginated read — 429/5xx backoff', () => {
  it('retries a 429 with exponential backoff then succeeds (sleeps 1s, 3s)', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    // 429, 429, then a short page → success after 2 retries.
    const f = scriptedFetch([fail(429), fail(429), ok([{ PatNum: 1, FName: 'A', LName: 'B' }])])
    vi.stubGlobal('fetch', f)
    const rows = await new OpenDentalProvider('k', { sleep }).listPatients()
    expect(rows).toHaveLength(1)
    expect(f).toHaveBeenCalledTimes(3)
    // Backoff schedule 1s → 3s for the two retries.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 3000])
  })

  it('retries a transient 5xx (503) the same way', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const f = scriptedFetch([fail(503), ok([{ PatNum: 1, FName: 'A', LName: 'B' }])])
    vi.stubGlobal('fetch', f)
    const rows = await new OpenDentalProvider('k', { sleep }).listPatients()
    expect(rows).toHaveLength(1)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000])
  })

  it('gives up after 3 retries on a persistent 429 (1s/3s/9s) and throws', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const f = scriptedFetch([fail(429)]) // always 429
    vi.stubGlobal('fetch', f)
    await expect(new OpenDentalProvider('k', { sleep }).listPatients()).rejects.toThrow(/429/)
    // 1 initial + 3 retries = 4 calls; 3 backoff sleeps.
    expect(f).toHaveBeenCalledTimes(4)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 3000, 9000])
  })

  it('does NOT retry a non-retryable 4xx (e.g. 401 bad key) — fails fast', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const f = scriptedFetch([fail(401)])
    vi.stubGlobal('fetch', f)
    await expect(new OpenDentalProvider('k', { sleep }).listPatients()).rejects.toThrow(/401/)
    expect(f).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('paces between pages (250ms inter-page delay, none before the first page)', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    // First page is full (1000) → a second page is fetched; second is short → stop.
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ PatNum: i + 1, FName: 'A', LName: 'B' }))
    const f = scriptedFetch([ok(firstPage), ok([{ PatNum: 9999, FName: 'Z', LName: 'Z' }])])
    vi.stubGlobal('fetch', f)
    const rows = await new OpenDentalProvider('k', { sleep }).listPatients()
    expect(rows).toHaveLength(1001)
    // One inter-page delay (before page 2), no delay before page 1.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([250])
  })

  it('testConnection fails FAST on a 500 (no backoff — it is a cheap probe)', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const f = scriptedFetch([fail(500)])
    vi.stubGlobal('fetch', f)
    const r = await new OpenDentalProvider('k', { sleep }).testConnection()
    expect(r.ok).toBe(false)
    expect(f).toHaveBeenCalledTimes(1) // single shot — no retry storm on the probe
    expect(sleep).not.toHaveBeenCalled()
  })

  it('writes fail FAST too (createPatient does not backoff)', async () => {
    const sleep = vi.fn(async (_ms: number) => {})
    const f = scriptedFetch([fail(500)])
    vi.stubGlobal('fetch', f)
    await expect(
      new OpenDentalProvider('k', { sleep }).createPatient({ firstName: 'A', lastName: 'B' }),
    ).rejects.toThrow(/500/)
    expect(f).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
