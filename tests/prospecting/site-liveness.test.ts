import { describe, it, expect, vi } from 'vitest'
import {
  checkSiteLiveness,
  dnsSaysGone,
  isPrivateAddress,
  parkingFingerprint,
  normalizeHost,
  readBodyCapped,
  BODY_LIMIT,
  MAX_REDIRECTS,
} from '@/lib/services/prospect-site-liveness'
import { robotsDisallowsAll } from '@/lib/services/prospect-crawl-policy'

/**
 * Website liveness (P-01) — dead / parked / redirected / alive / unknown,
 * with every network edge injected so no test touches DNS or the wire.
 * The probe is not a proxy: every target is resolved and judged before it
 * is fetched, redirects are walked by hand, the body is cut at the cap.
 */

type Res = {
  ok: boolean
  status: number
  url: string
  headers: { get: (k: string) => string | null }
  body: ReadableStream<Uint8Array> | null
  text: () => Promise<string>
}
const stream = (body: string, chunk = body.length) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const bytes = new TextEncoder().encode(body)
      for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.subarray(i, i + chunk))
      c.close()
    },
  })
const res = (
  status: number,
  url = 'https://smiledental.com/',
  body = '<html><body>Smile Dental — book today</body></html>',
  headers: Record<string, string> = {},
): Res => ({
  ok: status >= 200 && status < 300,
  status,
  url,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  body: stream(body),
  text: async () => body,
})
const redirect = (to: string, status = 302) => res(status, 'https://smiledental.com/', '', { location: to })
const timeoutErr = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
const dnsErr = (code: string) => Object.assign(new Error(`getaddrinfo ${code} smiledental.com`), { code })

function deps(over: {
  lookup?: (host: string) => Promise<unknown>
  robots?: () => Promise<boolean>
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Res>
}) {
  return {
    lookup: over.lookup ?? (async () => [{ address: '93.184.216.34', family: 4 }]),
    robots: over.robots ?? (async () => true),
    fetchImpl: (over.fetchImpl ?? (async () => res(200))) as unknown as typeof fetch,
  }
}

/** A fetch that answers by URL — the redirect chains below. */
function byUrl(table: Record<string, Res | (() => Res)>) {
  return vi.fn(async (url: string) => {
    const hit = table[url]
    if (!hit) throw new Error(`unexpected fetch ${url}`)
    return typeof hit === 'function' ? hit() : hit
  })
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

describe('the address policy (SSRF)', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.0.1.12', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['169.254.170.2', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['224.0.0.1', true],
    ['255.255.255.255', true],
    ['192.0.2.1', true],
    ['198.51.100.7', true],
    ['203.0.113.9', true],
    ['93.184.216.34', false],
    ['8.8.8.8', false],
    ['::1', true],
    ['::', true],
    ['::ffff:10.0.0.1', true],
    ['::ffff:93.184.216.34', false],
    ['64:ff9b::a00:1', true],
    ['fc00::1', true],
    ['fd12:3456::1', true],
    ['fe80::1', true],
    ['ff02::1', true],
    ['2001:db8::1', true],
    ['2606:2800:220:1:248:1893:25c8:1946', false],
    ['not-an-address', true],
  ])('%s → private %s', (addr, priv) => {
    expect(isPrivateAddress(addr)).toBe(priv)
  })

  it('dnsSaysGone: ENOTFOUND is gone, EAI_AGAIN / ESERVFAIL / a timeout are not', () => {
    expect(dnsSaysGone(dnsErr('ENOTFOUND'))).toBe(true)
    expect(dnsSaysGone(new Error('queryA NXDOMAIN'))).toBe(true)
    expect(dnsSaysGone(dnsErr('EAI_AGAIN'))).toBe(false)
    expect(dnsSaysGone(dnsErr('ESERVFAIL'))).toBe(false)
    expect(dnsSaysGone(dnsErr('ETIMEOUT'))).toBe(false)
  })

  it('a host that resolves to a private address is never fetched — unknown, not judged', async () => {
    const fetchImpl = vi.fn(async () => res(200))
    const robots = vi.fn(async () => true)
    const r = await checkSiteLiveness(
      'http://169.254.170.2/v2/credentials/',
      deps({ fetchImpl, robots, lookup: async () => [{ address: '169.254.170.2' }] }),
    )
    expect(r.status).toBe('unknown')
    expect(r.detail).toMatch(/private network address — not checked/)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(robots).not.toHaveBeenCalled()

    const r2 = await checkSiteLiveness('https://intranet.example', deps({ fetchImpl, robots, lookup: async () => [{ address: '10.0.1.12' }] }))
    expect(r2.status).toBe('unknown')
    expect(fetchImpl).not.toHaveBeenCalled()

    // One private record among several is enough to refuse.
    const r3 = await checkSiteLiveness(
      'https://smiledental.com',
      deps({ fetchImpl, robots, lookup: async () => [{ address: '93.184.216.34' }, { address: '::1' }] }),
    )
    expect(r3.status).toBe('unknown')
    expect(fetchImpl).not.toHaveBeenCalled()

    const r4 = await checkSiteLiveness('http://localhost:80/api/admin/migrate', deps({ fetchImpl, robots }))
    expect(r4.status).toBe('unknown')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('only ports 80 and 443 are ever connected to', async () => {
    const fetchImpl = vi.fn(async () => res(200))
    const r = await checkSiteLiveness('http://10.0.1.12:8080/admin', deps({ fetchImpl }))
    expect(r.status).toBe('unknown')
    expect(r.detail).toMatch(/non-standard port \(8080\)/)
    expect(fetchImpl).not.toHaveBeenCalled()
    const ok = await checkSiteLiveness('https://smiledental.com:443/', deps({ fetchImpl }))
    expect(ok.status).toBe('alive')
  })

  it('a redirect into a private address is NOT followed — unknown, the internal host never fetched', async () => {
    const fetchImpl = byUrl({
      'https://smiledental.com/': () => redirect('http://localhost:3000/api/admin/migrate'),
      'http://localhost:3000/api/admin/migrate': () => res(200),
    })
    const r = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl }))
    expect(r.status).toBe('unknown')
    expect(r.detail).toMatch(/redirects to/)
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(['https://smiledental.com/'])

    const lookups: string[] = []
    const fetch2 = byUrl({
      'https://smiledental.com/': () => redirect('http://10.0.1.12/admin'),
    })
    const r2 = await checkSiteLiveness(
      'https://smiledental.com',
      deps({
        fetchImpl: fetch2,
        lookup: async (h) => {
          lookups.push(h)
          return [{ address: '93.184.216.34' }]
        },
      }),
    )
    expect(r2.status).toBe('unknown')
    expect(fetch2).toHaveBeenCalledTimes(1)
    // A literal IP target is judged without a lookup; the first host was looked up once.
    expect(lookups).toEqual(['smiledental.com'])
  })

  it('every redirect hop is fetched with redirect: manual, and robots.txt too', async () => {
    const inits: RequestInit[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init) inits.push(init)
      if (url.endsWith('/robots.txt')) return res(404, url, '')
      return res(200)
    })
    const robotsFetch = { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: async () => [{ address: '93.184.216.34' }] }
    await checkSiteLiveness('https://smiledental.com', robotsFetch)
    expect(inits.length).toBeGreaterThanOrEqual(3)
    for (const i of inits) expect(i.redirect).toBe('manual')
  })

  it('more than five redirects is a loop — unknown, never dead', async () => {
    const fetchImpl = vi.fn(async () => redirect('https://smiledental.com/'))
    const r = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl }))
    expect(r.status).toBe('unknown')
    expect(r.detail).toMatch(new RegExp(`more than ${MAX_REDIRECTS} times`))
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS + 1)
  })
})

describe('the body cap', () => {
  it('reads a stream and stops at BODY_LIMIT bytes — never the whole body first', async () => {
    let pulled = 0
    const chunk = new Uint8Array(64 * 1024).fill(0x61) // 64 KB of "a"
    const huge = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += chunk.byteLength
        if (pulled > 50 * 1024 * 1024) c.close() // a 50 MB page, if anyone read it
        else c.enqueue(chunk)
      },
    })
    const fake = { body: huge } as unknown as Response
    const html = await readBodyCapped(fake)
    expect(html.length).toBe(BODY_LIMIT)
    expect(pulled).toBeLessThanOrEqual(BODY_LIMIT + 2 * chunk.byteLength)
  })
  it('a body-less response reads as empty; a small body reads whole', async () => {
    expect(await readBodyCapped({ body: null } as unknown as Response)).toBe('')
    expect(await readBodyCapped(res(200, 'https://x/', '<p>hi</p>') as unknown as Response)).toBe('<p>hi</p>')
  })
})

describe('checkSiteLiveness', () => {
  it('a name that is gone (ENOTFOUND) is dead', async () => {
    const r = await checkSiteLiveness('smiledental.com', deps({ lookup: async () => { throw dnsErr('ENOTFOUND') } }))
    expect(r.status).toBe('dead')
    expect(r.detail).toBe('smiledental.com no longer resolves (DNS)')
  })

  it('a resolver that could not answer (EAI_AGAIN, timeout) is UNKNOWN — the prior signal stands, nothing is parked', async () => {
    const fetchImpl = vi.fn(async () => res(200))
    const r = await checkSiteLiveness('smiledental.com', deps({ fetchImpl, lookup: async () => { throw dnsErr('EAI_AGAIN') } }))
    expect(r.status).toBe('unknown')
    expect(r.detail).toMatch(/could not be resolved right now \(EAI_AGAIN\)/)
    expect(fetchImpl).not.toHaveBeenCalled()
    const r2 = await checkSiteLiveness('smiledental.com', deps({ lookup: async () => { throw dnsErr('ETIMEOUT') } }))
    expect(r2.status).toBe('unknown')
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

  it('a redirect to the registrar’s own host is PARKED — judged on the final URL, not skipped as "redirected"', async () => {
    const fetchImpl = byUrl({
      'https://smiledental.com/': () => redirect('https://www.hugedomains.com/domain_profile.cfm?d=smiledental.com', 301),
      'https://www.hugedomains.com/domain_profile.cfm?d=smiledental.com': () => res(200, 'https://www.hugedomains.com/domain_profile.cfm?d=smiledental.com', '<html>Buy now</html>'),
    })
    const r = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl }))
    expect(r.status).toBe('parked')
    expect(r.detail).toBe('smiledental.com now lands on hugedomains.com — a HugeDomains sale page')
    expect(r.finalUrl).toBe('https://www.hugedomains.com/domain_profile.cfm?d=smiledental.com')
    for (const to of ['https://dan.com/buy-domain/smiledental.com', 'https://www.afternic.com/forsale/smiledental.com', 'https://www.godaddy.com/forsale/smiledental.com']) {
      const f = byUrl({ 'https://smiledental.com/': () => redirect(to), [to]: () => res(200, to, '<html>ok</html>') })
      expect((await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl: f }))).status).toBe('parked')
    }
  })

  it('a redirect whose final page is a parking body is parked too', async () => {
    const fetchImpl = byUrl({
      'https://smiledental.com/': () => redirect('https://park.example-registrar.net/x'),
      'https://park.example-registrar.net/x': () => res(200, 'https://park.example-registrar.net/x', '<html>This domain may be for sale</html>'),
    })
    const r = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl }))
    expect(r.status).toBe('parked')
    expect(r.detail).toBe('smiledental.com now lands on park.example-registrar.net — a "domain for sale" page')
  })

  it('a redirect to a different, real site is redirected — recorded, not judged', async () => {
    const fetchImpl = byUrl({
      'https://smiledental.com/': () => redirect('https://www.bigdso.com/locations/atlanta'),
      'https://www.bigdso.com/locations/atlanta': () => res(200, 'https://www.bigdso.com/locations/atlanta'),
    })
    const r = await checkSiteLiveness('https://smiledental.com', deps({ fetchImpl }))
    expect(r.status).toBe('redirected')
    expect(r.detail).toBe('smiledental.com now lands on bigdso.com')
    expect(r.finalUrl).toBe('https://www.bigdso.com/locations/atlanta')
  })

  it('www. and https are not "elsewhere"', async () => {
    const fetchImpl = byUrl({
      'http://smiledental.com/': () => redirect('https://www.smiledental.com/', 301),
      'https://www.smiledental.com/': () => res(200, 'https://www.smiledental.com/'),
    })
    const r = await checkSiteLiveness('http://smiledental.com', deps({ fetchImpl }))
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
