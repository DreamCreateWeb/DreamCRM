import { describe, it, expect, vi } from 'vitest'

/**
 * THE CRAWLER IS NOT A PROXY EITHER (P-01 fixes 2, C13's sibling path).
 * The enrich crawl rides the probe's guarded session: every target and
 * every redirect hop is resolved and judged before it is fetched, robots.txt
 * included; nothing is ever dialed that the policy did not vet. Every
 * network edge is injected — no test touches DNS or the wire.
 */

vi.mock('@/lib/db', () => ({ db: {}, schema: { prospect: {} } }))
vi.mock('@/lib/ai', () => ({ runClaudeJson: vi.fn(), aiConfigured: () => false }))
vi.mock('@/lib/google-places', () => ({ findDentalPlaceCandidates: vi.fn(), placesConfigured: () => false }))
vi.mock('@/lib/services/prospect-contacts', () => ({ syncProspectContacts: vi.fn() }))
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: vi.fn(),
  getProspectingCounter: vi.fn(),
  bumpProspectingCounter: vi.fn(),
  counterMonth: () => '2026-11',
}))

import { crawlProspectSite } from '@/lib/services/prospect-enrich'

const HOMEPAGE = `<!doctype html><html><head><title>Smile Dental</title></head>
  <body><a href="/contact">Contact</a>© 2026</body></html>`

const streamOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text))
      c.close()
    },
  })
const page = (status: number, url: string, body = HOMEPAGE, headers: Record<string, string> = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    body: streamOf(body),
    text: async () => body,
  }) as unknown as Response
const publicLookup = async () => [{ address: '93.184.216.34' }]

describe('crawlProspectSite rides the guarded session', () => {
  it('a private literal, a non-standard port and a redirect into localhost are refused before any fetch — the internal host is never contacted', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt')) return page(404, url, '')
      if (url === 'https://smiledental.com/') return page(302, url, '', { location: 'http://localhost:3000/api/admin/migrate' })
      return page(200, url)
    })
    const deps = { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: publicLookup }
    expect(await crawlProspectSite('http://169.254.170.2/v2/credentials/', deps)).toBeNull()
    expect(await crawlProspectSite('http://10.0.1.12:8080/admin', deps)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()

    // The homepage 302s into the VPC: the hop is judged, refused, never fetched.
    expect(await crawlProspectSite('https://smiledental.com', deps)).toBeNull()
    const urls = fetchImpl.mock.calls.map((c) => c[0])
    expect(urls).toEqual(['https://smiledental.com/robots.txt', 'https://smiledental.com/'])
    expect(urls.some((u) => u.includes('localhost'))).toBe(false)
  })

  it('a host that resolves to a private address is never fetched, robots.txt included', async () => {
    const fetchImpl = vi.fn(async (url: string) => page(200, url))
    const r = await crawlProspectSite('https://intranet.example', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: async () => [{ address: '10.0.1.12' }],
    })
    expect(r).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a public redirect is followed by hand — the new host judged and pinned on its own; a contact hop lands on the final origin', async () => {
    const inits: RequestInit[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init) inits.push(init)
      if (url.endsWith('/robots.txt')) return page(200, url, 'User-agent: *\nAllow: /')
      if (url === 'https://smiledental.com/') return page(301, url, '', { location: 'https://www.smiledental.com/' })
      if (url === 'https://www.smiledental.com/') return page(200, url)
      return page(200, url, '<a href="mailto:drjane@smiledental.com">x</a>')
    })
    const lookups: string[] = []
    const r = await crawlProspectSite('https://smiledental.com', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookup: async (h) => {
        lookups.push(h)
        return [{ address: '93.184.216.34' }]
      },
    })
    expect(r?.emails).toContain('drjane@smiledental.com')
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      'https://smiledental.com/robots.txt',
      'https://smiledental.com/',
      'https://www.smiledental.com/',
      'https://www.smiledental.com/contact',
    ])
    // Every fetch — robots.txt, the homepage, the hop — is redirect: manual.
    for (const i of inits) expect(i.redirect).toBe('manual')
    // Each host resolved exactly once; the redirect target on its own.
    expect(lookups).toEqual(['smiledental.com', 'www.smiledental.com'])
  })

  it('robots.txt closing the door is honoured through the guarded fetch, with the robots_disallow marker', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/robots.txt')) return page(200, url, 'User-agent: *\nDisallow: /')
      return page(200, url)
    })
    const r = await crawlProspectSite('https://smiledental.com', { fetchImpl: fetchImpl as unknown as typeof fetch, lookup: publicLookup })
    expect(r?.error).toBe('robots_disallow')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
