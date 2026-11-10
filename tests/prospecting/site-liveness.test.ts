import { describe, it, expect, vi } from 'vitest'
import { checkSiteLiveness, parkingFingerprint, normalizeHost } from '@/lib/services/prospect-site-liveness'
import { robotsDisallowsAll } from '@/lib/services/prospect-crawl-policy'

/**
 * Website liveness (P-01) — dead / parked / redirected / alive, with every
 * network edge injected so no test touches DNS or the wire.
 */

type Res = { ok: boolean; status: number; url: string; text: () => Promise<string> }
const res = (status: number, url = 'https://smiledental.com/', body = '<html><body>Smile Dental — book today</body></html>'): Res => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  text: async () => body,
})
const timeoutErr = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })

function deps(over: {
  lookup?: () => Promise<unknown>
  robots?: () => Promise<boolean>
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Res>
}) {
  return {
    lookup: over.lookup ?? (async () => ({ address: '1.2.3.4' })),
    robots: over.robots ?? (async () => true),
    fetchImpl: (over.fetchImpl ?? (async () => res(200))) as unknown as typeof fetch,
  }
}

describe('fingerprints', () => {
  it('names the registrar / default page it saw', () => {
    expect(parkingFingerprint('<title>Welcome</title> This domain is for sale!')).toBe('a "domain for sale" page')
    expect(parkingFingerprint('Parked free, courtesy of GoDaddy.com')).toBe('a registrar parking page')
    expect(parkingFingerprint('<h1>Welcome to nginx!</h1>')).toBe('a server default page')
    expect(parkingFingerprint('<p>We are a family dental practice in Atlanta.</p>')).toBeNull()
  })
  it('robots: a blanket Disallow under * is the only thing that closes the door', () => {
    expect(robotsDisallowsAll('User-agent: *\nDisallow: /')).toBe(true)
    expect(robotsDisallowsAll('User-agent: *\nDisallow: /admin')).toBe(false)
    expect(robotsDisallowsAll('User-agent: Bingbot\nDisallow: /')).toBe(false)
  })
  it('normalizeHost drops www. and case', () => {
    expect(normalizeHost('WWW.SmileDental.com')).toBe('smiledental.com')
  })
})

describe('checkSiteLiveness', () => {
  it('DNS failure is dead', async () => {
    const r = await checkSiteLiveness('smiledental.com', deps({ lookup: async () => { throw new Error('ENOTFOUND') } }))
    expect(r.status).toBe('dead')
    expect(r.detail).toBe('smiledental.com no longer resolves (DNS)')
  })

  it('robots disallow is alive — the server answered; we read nothing it asked us not to', async () => {
    const fetchImpl = vi.fn(async () => res(200))
    const r = await checkSiteLiveness('https://smiledental.com', deps({ robots: async () => false, fetchImpl }))
    expect(r.status).toBe('alive')
    expect(r.detail).toMatch(/robots\.txt/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('two timeouts are dead; one timeout then an answer is alive', async () => {
    let calls = 0
    const twice = async () => { calls++; throw timeoutErr() }
    const r = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl: twice }))
    expect(r.status).toBe('dead')
    expect(r.detail).toMatch(/timed out twice/)
    expect(calls).toBe(2)

    let n = 0
    const once = async () => { n++; if (n === 1) throw timeoutErr(); return res(200) }
    const r2 = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl: once }))
    expect(r2.status).toBe('alive')
  })

  it('5xx and 404 are dead', async () => {
    expect((await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl: async () => res(503) }))).status).toBe('dead')
    const gone = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl: async () => res(404) }))
    expect(gone.status).toBe('dead')
    expect(gone.detail).toMatch(/gone \(404\)/)
  })

  it('a parking page is parked, with the fingerprint in the detail', async () => {
    const r = await checkSiteLiveness(
      'https://smiledental.com',
      deps({ fetchImpl: async () => res(200, 'https://smiledental.com/', '<html>This domain is parked free, courtesy of GoDaddy.com</html>') }),
    )
    expect(r.status).toBe('parked')
    expect(r.detail).toBe('smiledental.com shows a parked-domain page')
  })

  it('a different final host is redirected — recorded, not judged', async () => {
    const r = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl: async () => res(200, 'https://www.bigdso.com/locations/atlanta') }))
    expect(r.status).toBe('redirected')
    expect(r.detail).toBe('smiledental.com now lands on bigdso.com')
  })

  it('www. and https are not "elsewhere"', async () => {
    const r = await checkSiteLiveness('http://smiledental.com', deps({ fetchImpl: async () => res(200, 'https://www.smiledental.com/') }))
    expect(r.status).toBe('alive')
  })

  it('a 403 to our crawler is alive — answered, refused, said plainly', async () => {
    const r = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl: async () => res(403) }))
    expect(r.status).toBe('alive')
    expect(r.detail).toMatch(/refused our crawler \(403\)/)
  })

  it('sends the DreamCreateBot identity', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => res(200))
    await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl }))
    const init = fetchImpl.mock.calls[0]?.[1]
    expect((init?.headers as Record<string, string>)['user-agent']).toMatch(/DreamCreateBot/)
  })
})
