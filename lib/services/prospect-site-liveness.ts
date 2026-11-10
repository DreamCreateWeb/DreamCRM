import 'server-only'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { CRAWL_UA, robotsAllows } from './prospect-crawl-policy'

/**
 * Website liveness (P-01) — is the practice's site still a practice's site?
 *
 * A dead or parked website is NOT "no website" (which the opportunity score
 * rightly treats as the hottest segment): a domain that stopped resolving,
 * a registrar's "this domain is for sale" page, a server default page —
 * these are what a RETIRED practice leaves behind, and they park the
 * record until a re-verify or a human says otherwise.
 *
 *   alive       answered (2xx), or answered and asked crawlers to stay out
 *   dead        DNS says the name is gone · 5xx · homepage gone (404/410) ·
 *               timed out twice · refused the connection
 *   parked      a registrar-parking / server-default fingerprint — on the
 *               FINAL response, after redirects (a domain-for-sale page is
 *               most often a redirect to the registrar's own host)
 *   redirected  the final host is a different, real site — recorded, not judged
 *   unknown     we could not tell (a transient resolver error, a redirect
 *               loop, a private address) — the caller keeps the prior signal
 *
 * Six-second timeout, DreamCreateBot UA, robots honoured as the crawler does.
 *
 * THE PROBE IS NOT A PROXY. The URL is attacker-influenceable (whoever
 * claims a Google listing sets its websiteUri; a hand-added prospect has
 * whatever was typed), so every target — the first and every redirect hop —
 * is resolved FIRST and refused when it points at a loopback, private,
 * link-local, metadata or otherwise non-public address; only ports 80/443;
 * redirects are followed by hand (capped at 5) so each hop is re-checked;
 * the body is read as a stream and cut at BODY_LIMIT bytes.
 */

export type SiteLivenessStatus = 'alive' | 'dead' | 'parked' | 'redirected' | 'unknown'

export interface SiteLiveness {
  status: SiteLivenessStatus
  /** One plain sentence for the verification card. */
  detail: string
  finalUrl: string | null
  httpStatus: number | null
}

const TIMEOUT_MS = 6_000
/** The whole probe (every hop, both passes, the retries) stays inside this. */
const PROBE_DEADLINE_MS = 30_000
export const BODY_LIMIT = 200_000
export const MAX_REDIRECTS = 5
const ALLOWED_PORTS = new Set(['', '80', '443'])
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** Registrar parking + server-default fingerprints (lowercase substrings).
 *  Matched against the final page's body AND its URL — a sale page is most
 *  often a redirect to the registrar's own host. */
export const PARKING_FINGERPRINTS: ReadonlyArray<[needle: string, label: string]> = [
  ['domain is for sale', 'a "domain for sale" page'],
  ['domain name is for sale', 'a "domain for sale" page'],
  ['this domain may be for sale', 'a "domain for sale" page'],
  ['buy this domain', 'a "buy this domain" page'],
  ['this domain is parked', 'a parked-domain page'],
  ['domain is parked', 'a parked-domain page'],
  ['parked free', 'a registrar parking page'],
  ['courtesy of godaddy', 'a GoDaddy parking page'],
  ['godaddy.com/forsale', 'a GoDaddy sale page'],
  ['sedoparking', 'a Sedo parking page'],
  ['sedo.com', 'a Sedo parking page'],
  ['hugedomains', 'a HugeDomains sale page'],
  ['parkingcrew', 'a ParkingCrew page'],
  ['afternic', 'an Afternic sale page'],
  ['dan.com', 'a Dan.com sale page'],
  ['bodis.com', 'a Bodis parking page'],
  ['namecheap parking', 'a Namecheap parking page'],
  ['undeveloped.com', 'an Undeveloped sale page'],
  ['domain default page', 'a server default page'],
  ['apache2 ubuntu default page', 'a server default page'],
  ['welcome to nginx!', 'a server default page'],
  ['iis windows server', 'a server default page'],
  ['future home of something quite cool', 'a cPanel placeholder page'],
]

/** Pure: a parking fingerprint's label when the body (or a URL) is a parking page. */
export function parkingFingerprint(html: string): string | null {
  const body = html.toLowerCase()
  for (const [needle, label] of PARKING_FINGERPRINTS) {
    if (body.includes(needle)) return label
  }
  return null
}

export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

// ── Address policy (pure) ───────────────────────────────────────────────────

function parseIpv4(addr: string): number[] | null {
  const parts = addr.split('.')
  if (parts.length !== 4) return null
  const out: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n > 255) return null
    out.push(n)
  }
  return out
}

/** Eight 16-bit groups, or null when the text is not an IPv6 address. */
function parseIpv6(addr: string): number[] | null {
  let text = addr.trim().replace(/^\[|\]$/g, '')
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  // A trailing dotted quad (::ffff:10.0.0.1) becomes two groups.
  const v4 = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4) {
    const q = parseIpv4(v4[1])
    if (!q) return null
    text = `${text.slice(0, -v4[1].length)}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const toGroups = (s: string): number[] | null => {
    if (s === '') return []
    const out: number[] = []
    for (const g of s.split(':')) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null
      out.push(parseInt(g, 16))
    }
    return out
  }
  const head = toGroups(halves[0])
  const tail = halves.length === 2 ? toGroups(halves[1]) : []
  if (!head || !tail) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const fill = 8 - head.length - tail.length
  if (fill < 0) return null
  return [...head, ...Array.from({ length: fill }, () => 0), ...tail]
}

function ipv4IsPrivate(q: number[]): boolean {
  const [a, b] = q
  if (a === 0 || a === 10 || a === 127) return true // this-net, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 169 && b === 254) return true // link-local + cloud metadata (169.254.169.254, 169.254.170.2)
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 192 && b === 0 && (q[2] === 0 || q[2] === 2)) return true // IETF protocol / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
  if (a === 198 && b === 51 && q[2] === 100) return true // TEST-NET-2
  if (a === 203 && b === 0 && q[2] === 113) return true // TEST-NET-3
  if (a >= 224) return true // multicast, reserved, broadcast
  return false
}

/**
 * Pure: an address the probe must never connect to — loopback, private,
 * link-local, carrier-grade NAT, cloud metadata, multicast, documentation
 * and reserved ranges, in IPv4 and IPv6 (IPv4-mapped / NAT64 forms unwrap
 * to the embedded IPv4 and are judged as that). Anything unparsable is
 * refused too: the probe only ever connects to an address it understood.
 */
export function isPrivateAddress(address: string): boolean {
  const v4 = parseIpv4(address)
  if (v4) return ipv4IsPrivate(v4)
  const g = parseIpv6(address)
  if (!g) return true
  const allZero = g.every((x) => x === 0)
  if (allZero) return true // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true // ::1
  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible, deprecated)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return ipv4IsPrivate([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff])
  }
  // 64:ff9b::/96 (NAT64) carries an IPv4 in the last two groups.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return ipv4IsPrivate([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff])
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // 2001:db8::/32 documentation
  if (g[0] === 0x2001 && g[1] === 0) return true // 2001::/32 Teredo
  return false
}

// ── Dependencies (injected by the tests) ────────────────────────────────────

export interface LivenessDeps {
  fetchImpl?: typeof fetch
  /** Resolve a hostname to its addresses (every record — all of them are checked). */
  lookup?: (host: string) => Promise<unknown>
  robots?: (origin: string) => Promise<boolean>
}

function addressesOf(resolved: unknown): string[] {
  const list = Array.isArray(resolved) ? resolved : [resolved]
  const out: string[] = []
  for (const r of list) {
    if (typeof r === 'string') out.push(r)
    else if (r && typeof r === 'object' && typeof (r as { address?: unknown }).address === 'string') {
      out.push((r as { address: string }).address)
    }
  }
  return out
}

/** Pure: a resolver error that means "this name does not exist" (NXDOMAIN),
 *  as opposed to "the resolver could not answer right now". */
export function dnsSaysGone(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  const text = `${typeof code === 'string' ? code : ''} ${err instanceof Error ? err.message : String(err ?? '')}`
  return /ENOTFOUND|NXDOMAIN/i.test(text)
}

/**
 * Read a response body as a stream and stop at `limit` BYTES — the body is
 * never buffered whole first (a multi-hundred-MB page, or a small gzip that
 * inflates to GBs, would otherwise sit in memory inside the timeout). A
 * body-less response reads as ''.
 */
export async function readBodyCapped(res: Response, limit = BODY_LIMIT): Promise<string> {
  const body = res.body
  if (!body || typeof body.getReader !== 'function') return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < limit) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.byteLength
      }
    }
  } catch {
    /* a partial body is still a body */
  } finally {
    try {
      await reader.cancel()
    } catch {
      /* already closed */
    }
  }
  const merged = new Uint8Array(Math.min(total, limit))
  let offset = 0
  for (const c of chunks) {
    if (offset >= merged.length) break
    const slice = c.subarray(0, Math.min(c.byteLength, merged.length - offset))
    merged.set(slice, offset)
    offset += slice.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

function isTimeout(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError' || /timeout/i.test(err.message))
  )
}

type Guard = { ok: true } | { ok: false; status: 'dead' | 'unknown'; detail: string }

export async function checkSiteLiveness(url: string, deps: LivenessDeps = {}): Promise<SiteLiveness> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const lookup = deps.lookup ?? ((host: string) => dnsLookup(host, { all: true }))
  // robots.txt rides the same policy: no redirect is ever followed for it.
  const robots =
    deps.robots ??
    ((origin: string) => robotsAllows(origin, (input, init) => fetchImpl(input, { ...init, redirect: 'manual' })))
  const started = Date.now()
  const timeLeft = () => Math.max(0, PROBE_DEADLINE_MS - (Date.now() - started))

  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return { status: 'dead', detail: 'Website address is not a valid URL', finalUrl: null, httpStatus: null }
  }
  const host = normalizeHost(parsed.hostname)
  const none = { finalUrl: null, httpStatus: null }

  // The address policy, once per host in this probe (the HEAD pass and the
  // GET pass walk the same hops).
  const judged = new Map<string, Guard>()
  const guard = async (target: URL, hop: number): Promise<Guard> => {
    const where = hop === 0 ? host : `${host} redirects to ${normalizeHost(target.hostname)}, which`
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return { ok: false, status: 'unknown', detail: `${where} is not a web address (${target.protocol.replace(':', '')}) — not checked` }
    }
    if (!ALLOWED_PORTS.has(target.port)) {
      return { ok: false, status: 'unknown', detail: `${where} uses a non-standard port (${target.port}) — not checked` }
    }
    const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const cached = judged.get(hostname)
    if (cached) return cached
    let verdict: Guard
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      verdict = { ok: false, status: 'unknown', detail: `${where} points at a private network address — not checked` }
    } else if (isIP(hostname)) {
      verdict = isPrivateAddress(hostname)
        ? { ok: false, status: 'unknown', detail: `${where} points at a private network address — not checked` }
        : { ok: true }
    } else {
      try {
        const addresses = addressesOf(await lookup(hostname))
        if (addresses.length === 0) {
          verdict = { ok: false, status: 'dead', detail: `${where === host ? host : normalizeHost(target.hostname)} no longer resolves (DNS)` }
        } else if (addresses.some(isPrivateAddress)) {
          verdict = { ok: false, status: 'unknown', detail: `${where} points at a private network address — not checked` }
        } else {
          verdict = { ok: true }
        }
      } catch (err) {
        const name = hop === 0 ? host : normalizeHost(target.hostname)
        verdict = dnsSaysGone(err)
          ? { ok: false, status: 'dead', detail: `${name} no longer resolves (DNS)` }
          : {
              ok: false,
              status: 'unknown',
              detail: `${name} could not be resolved right now (${(err as { code?: string })?.code ?? 'DNS error'}) — will check again`,
            }
      }
    }
    judged.set(hostname, verdict)
    return verdict
  }

  // 1) DNS + the address policy — a name that is gone is the clearest "dead";
  //    a resolver that could not answer is nothing of the kind.
  const first = await guard(parsed, 0)
  if (!first.ok) return { status: first.status, detail: first.detail, ...none }

  // 2) robots — the server answered; we do not read a page it asked us not to.
  if (!(await robots(parsed.origin))) {
    return {
      status: 'alive',
      detail: `${host} answers; its robots.txt asks crawlers to stay out`,
      finalUrl: parsed.toString(),
      httpStatus: null,
    }
  }

  // 3) One request, redirects NOT followed by the runtime — each hop is
  //    re-checked against the address policy before it is fetched.
  const request = async (method: 'HEAD' | 'GET', target: URL): Promise<Response | 'timeout' | 'error'> => {
    const budget = Math.min(TIMEOUT_MS, timeLeft())
    if (budget <= 0) return 'timeout'
    try {
      return await fetchImpl(target.toString(), {
        method,
        headers: { 'user-agent': CRAWL_UA, accept: 'text/html' },
        redirect: 'manual',
        signal: AbortSignal.timeout(budget),
      })
    } catch (err) {
      return isTimeout(err) ? 'timeout' : 'error'
    }
  }

  type Walk =
    | { kind: 'ok'; res: Response; url: URL }
    | { kind: 'timeout' }
    | { kind: 'error' }
    | { kind: 'stopped'; result: SiteLiveness }
  const walk = async (method: 'HEAD' | 'GET', from: URL): Promise<Walk> => {
    let current = from
    for (let hop = 0; ; hop++) {
      if (hop > 0) {
        const g = await guard(current, hop)
        if (!g.ok) return { kind: 'stopped', result: { status: g.status, detail: g.detail, ...none } }
      }
      const res = await request(method, current)
      if (res === 'timeout') return { kind: 'timeout' }
      if (res === 'error') return { kind: 'error' }
      const location = REDIRECT_STATUSES.has(res.status) ? res.headers?.get?.('location') : null
      if (!location) return { kind: 'ok', res, url: current }
      // Nothing of a redirect's body is ever read.
      try {
        await res.body?.cancel?.()
      } catch {
        /* nothing to drain */
      }
      if (hop >= MAX_REDIRECTS) {
        return {
          kind: 'stopped',
          result: { status: 'unknown', detail: `${host} redirects more than ${MAX_REDIRECTS} times — not followed`, ...none },
        }
      }
      try {
        current = new URL(location, current)
      } catch {
        return { kind: 'stopped', result: { status: 'unknown', detail: `${host} redirects to an address we could not read`, ...none } }
      }
    }
  }

  // HEAD, then GET — a timeout gets one retry; two timeouts are "dead".
  let head = await walk('HEAD', parsed)
  if (head.kind === 'timeout') head = await walk('HEAD', parsed)
  if (head.kind === 'timeout') {
    return { status: 'dead', detail: `${host} timed out twice (${TIMEOUT_MS / 1000}s)`, ...none }
  }
  if (head.kind === 'error') {
    return { status: 'dead', detail: `${host} refused the connection`, ...none }
  }
  if (head.kind === 'stopped') return head.result

  let final = head
  // Some servers reject HEAD outright; GET decides — and GET is the only
  // pass whose body is read, so the parking fingerprint runs on it.
  const s = head.res.status
  if (s === 405 || s === 501 || s === 403 || s === 401 || s === 429 || head.res.ok) {
    let got = await walk('GET', head.url)
    if (got.kind === 'timeout') got = await walk('GET', head.url)
    if (got.kind === 'timeout') {
      return { status: 'dead', detail: `${host} timed out twice (${TIMEOUT_MS / 1000}s)`, ...none }
    }
    if (got.kind === 'stopped') return got.result
    if (got.kind === 'ok') final = got
  }

  const res = final.res
  const finalUrl = final.url.toString()
  const finalHost = normalizeHost(final.url.hostname)
  const landed = finalHost !== host ? `${host} now lands on ${finalHost}` : host

  if (res.status >= 500) {
    return { status: 'dead', detail: `${host} answers with a server error (${res.status})`, finalUrl, httpStatus: res.status }
  }
  if (res.status === 404 || res.status === 410) {
    return { status: 'dead', detail: `${host}'s homepage is gone (${res.status})`, finalUrl, httpStatus: res.status }
  }
  // Parking is judged on the FINAL response: the registrar's host in the
  // URL we landed on, then the body we were served there.
  const urlParked = finalHost !== host ? parkingFingerprint(finalUrl) : null
  if (urlParked) {
    return { status: 'parked', detail: `${landed} — ${urlParked}`, finalUrl, httpStatus: res.status }
  }
  if (res.ok && final.kind === 'ok' && res.body !== undefined) {
    const html = await readBodyCapped(res)
    const parked = parkingFingerprint(html)
    if (parked) {
      return {
        status: 'parked',
        detail: finalHost !== host ? `${landed} — ${parked}` : `${host} shows ${parked}`,
        finalUrl,
        httpStatus: res.status,
      }
    }
  }
  if (finalHost !== host) {
    return { status: 'redirected', detail: landed, finalUrl, httpStatus: res.status }
  }
  if (!res.ok) {
    return {
      status: 'alive',
      detail: `${host} answers but refused our crawler (${res.status})`,
      finalUrl,
      httpStatus: res.status,
    }
  }
  return { status: 'alive', detail: `${host} is up (${res.status})`, finalUrl, httpStatus: res.status }
}
