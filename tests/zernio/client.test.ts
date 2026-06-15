import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  zernioFetch,
  zernioConfigured,
  listProfiles,
  createProfile,
  getConnectUrl,
  listAccounts,
  deleteAccount,
} from '@/lib/zernio'

// Mock the fetch boundary so we exercise the real client without a live Zernio.
function mockFetch(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return vi.fn(async (..._args: unknown[]) => ({
    ok,
    status,
    statusText,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }))
}

beforeEach(() => {
  process.env.ZERNIO_API_KEY = 'sk_test_zernio'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ZERNIO_API_KEY
})

describe('zernioConfigured', () => {
  it('reflects the env key', () => {
    expect(zernioConfigured()).toBe(true)
    delete process.env.ZERNIO_API_KEY
    expect(zernioConfigured()).toBe(false)
  })
})

describe('zernioFetch', () => {
  it('sets the Bearer header + base URL and parses JSON', async () => {
    const f = mockFetch({ ok: 1 })
    vi.stubGlobal('fetch', f)
    const out = await zernioFetch<{ ok: number }>('/profiles')
    expect(out).toEqual({ ok: 1 })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://zernio.com/api/v1/profiles')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_zernio')
  })

  it('prefixes a leading slash when the path lacks one', async () => {
    const f = mockFetch({})
    vi.stubGlobal('fetch', f)
    await zernioFetch('accounts')
    expect((f.mock.calls[0] as [string])[0]).toBe('https://zernio.com/api/v1/accounts')
  })

  it('throws without the API key (lazy — only on call)', async () => {
    delete process.env.ZERNIO_API_KEY
    await expect(zernioFetch('/profiles')).rejects.toThrow(/ZERNIO_API_KEY is not set/)
  })

  it('throws an Error with status + body on non-2xx', async () => {
    const f = mockFetch('nope', false, 403, 'Forbidden')
    vi.stubGlobal('fetch', f)
    await expect(zernioFetch('/connect/googlebusiness')).rejects.toThrow(/403 Forbidden/)
    await expect(zernioFetch('/connect/googlebusiness')).rejects.toThrow(/nope/)
  })

  it('returns undefined for 204 No Content', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 204, statusText: 'No Content', json: async () => ({}), text: async () => '' }))
    vi.stubGlobal('fetch', f)
    const out = await zernioFetch('/accounts/x', { method: 'DELETE' })
    expect(out).toBeUndefined()
  })
})

describe('typed wrappers', () => {
  it('listProfiles unwraps { profiles }', async () => {
    vi.stubGlobal('fetch', mockFetch({ profiles: [{ _id: 'p1', name: 'Default' }] }))
    const profiles = await listProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0]._id).toBe('p1')
  })

  it('listProfiles tolerates a missing profiles array', async () => {
    vi.stubGlobal('fetch', mockFetch({}))
    expect(await listProfiles()).toEqual([])
  })

  it('createProfile POSTs name and unwraps { profile }', async () => {
    const f = mockFetch({ message: 'ok', profile: { _id: 'p2', name: 'Acme [org_1]' } })
    vi.stubGlobal('fetch', f)
    const p = await createProfile('Acme [org_1]')
    expect(p._id).toBe('p2')
    const [, init] = f.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Acme [org_1]' })
  })

  it('createProfile throws when no profile id comes back', async () => {
    vi.stubGlobal('fetch', mockFetch({ message: 'ok' }))
    await expect(createProfile('x')).rejects.toThrow(/no profile id/)
  })

  it('getConnectUrl builds the path with profileId + redirect_url and returns authUrl/state', async () => {
    const f = mockFetch({ authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1', state: 'st' })
    vi.stubGlobal('fetch', f)
    const out = await getConnectUrl('googlebusiness', 'prof_1', 'https://app.example/cb')
    expect(out.authUrl).toContain('accounts.google.com')
    expect(out.state).toBe('st')
    const url = (f.mock.calls[0] as [string])[0]
    expect(url).toContain('/connect/googlebusiness?')
    expect(url).toContain('profileId=prof_1')
    expect(url).toContain('redirect_url=https%3A%2F%2Fapp.example%2Fcb')
  })

  it('getConnectUrl omits redirect_url when not provided', async () => {
    const f = mockFetch({ authUrl: 'https://x' })
    vi.stubGlobal('fetch', f)
    await getConnectUrl('googlebusiness', 'prof_1')
    expect((f.mock.calls[0] as [string])[0]).not.toContain('redirect_url')
  })

  it('getConnectUrl maps the x platform to the twitter connect slug', async () => {
    const f = mockFetch({ authUrl: 'https://x' })
    vi.stubGlobal('fetch', f)
    await getConnectUrl('x', 'prof_1')
    expect((f.mock.calls[0] as [string])[0]).toContain('/connect/twitter?')
  })

  it('getConnectUrl throws when no authUrl comes back', async () => {
    vi.stubGlobal('fetch', mockFetch({}))
    await expect(getConnectUrl('googlebusiness', 'p')).rejects.toThrow(/no authUrl/)
  })

  it('listAccounts unwraps accounts + hasAnalyticsAccess and passes profileId filter', async () => {
    const f = mockFetch({ accounts: [{ _id: 'a1', platform: 'googlebusiness', profileId: 'p1' }], hasAnalyticsAccess: true })
    vi.stubGlobal('fetch', f)
    const res = await listAccounts({ profileId: 'p1' })
    expect(res.accounts).toHaveLength(1)
    expect(res.hasAnalyticsAccess).toBe(true)
    expect((f.mock.calls[0] as [string])[0]).toContain('/accounts?profileId=p1')
  })

  it('deleteAccount DELETEs the account path', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 204, statusText: 'No Content', json: async () => ({}), text: async () => '' }))
    vi.stubGlobal('fetch', f)
    await deleteAccount('acc_1')
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/accounts/acc_1')
    expect(init.method).toBe('DELETE')
  })
})
