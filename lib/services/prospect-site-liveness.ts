import 'server-only'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { BODY_LIMIT, CRAWL_UA, readBodyCapped, robotsAllows } from './prospect-crawl-policy'

// The capped reader + its limit moved to the crawl policy (robots.txt rides
// it too); re-exported so every existing import keeps working.
export { BODY_LIMIT, readBodyCapped }

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
 *               timed out twice · refused the connection — `cause` says
 *               which (dns · http · timeout · refused · invalid); a
 *               TIMEOUT read nothing and the verdict treats it as unread
 *   parked      a registrar-parking / server-default fingerprint — on the
 *               FINAL response, after redirects (a domain-for-sale page is
 *               most often a redirect to the registrar's own host)
 *   redirected  the final host is a different, real site — recorded, not judged
 *   unknown     we could not tell (a transient resolver error, a redirect
 *               loop, a private address) — the caller keeps the prior signal;
 *               `cause` says which, and `policy` means NEVER crawl this URL
 *
 * Six-second timeout, DreamCreateBot UA, robots honoured as the crawler does.
 *
 * THE PROBE IS NOT A PROXY — AND NEITHER IS THE CRAWLER. The URL is
 * attacker-influenceable (whoever claims a Google listing sets its
 * websiteUri; a hand-added prospect has whatever was typed), so both ride
 * ONE guarded fetch (`fetchGuarded` over a `guardedSession`): every target —
 * the first and every redirect hop — is resolved FIRST and refused when it
 * points at a loopback, private, link-local, metadata or otherwise
 * non-public address; only ports 80/443; redirects are walked by hand
 * (capped at 5) so each hop is re-checked; the connection is BOUND to the
 * addresses the policy judged (the runtime never re-resolves the name, so a
 * rebinding DNS answer cannot swap a public address for a private one
 * between the check and the connect); the body is read as a stream and cut
 * at BODY_LIMIT bytes.
 */

export type SiteLivenessStatus = 'alive' | 'dead' | 'parked' | 'redirected' | 'unknown'

/** Why an `unknown` could not tell. `policy`: we refused to connect (a
 *  private address, a non-standard port, a non-web scheme, or a redirect
 *  into one) — the crawler must refuse the same URL. `resolver`: DNS could
 *  not answer right now. `redirects`: a loop, or a Location we could not read. */
export type SiteUnknownCause = 'policy' | 'resolver' | 'redirects'
/** Why a `dead` is dead (P-04 fix pass IV, Y1) — what the probe actually
 *  distinguishes: `dns` the name is gone; `refused` the connection was
 *  refused; `http` the server answered 5xx / 404 / 410; `invalid` the
 *  address is not a URL; `timeout` it timed out twice — the ONE dead whose
 *  page was never read (a slow host, a WAF that hangs on bots), so the
 *  opportunity verdict treats it as UNREAD, never "no website". */
export type SiteDeadCause = 'dns' | 'refused' | 'http' | 'invalid' | 'timeout'
export type SiteLivenessCause = SiteUnknownCause | SiteDeadCause | 'parked'

export interface SiteLiveness {
  status: SiteLivenessStatus
  /** One plain sentence for the verification card. */
  detail: string
  finalUrl: string | null
  httpStatus: number | null
  /** On `unknown`: why we could not tell (SiteUnknownCause). On `dead` and
   *  `parked`: what the probe saw (SiteDeadCause | 'parked') — stored on
   *  `verification.website.cause` so a later pass can tell a timeout from
   *  a site that is really gone. Absent on alive / redirected. */
  cause?: SiteLivenessCause
}

const TIMEOUT_MS = 6_000
/** The whole probe (every hop, both passes, the retries) stays inside this. */
const PROBE_DEADLINE_MS = 30_000
export const MAX_REDIRECTS = 5
const ALLOWED_PORTS = new Set(['', '80', '443'])
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/** Registrar parking + server-default PHRASES (lowercase substrings),
 *  matched against the final page's body. */
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
  ['namecheap parking', 'a Namecheap parking page'],
  ['domain default page', 'a server default page'],
  ['apache2 ubuntu default page', 'a server default page'],
  ['welcome to nginx!', 'a server default page'],
  ['iis windows server', 'a server default page'],
  ['future home of something quite cool', 'a cPanel placeholder page'],
]

/**
 * Registrar HOSTS — matched by exact hostname (the host itself or a
 * subdomain of it), never as a substring: `smilesbydan.com` is a dentist,
 * not Dan.com. An optional path prefix narrows a registrar whose main site
 * is not a sale page (godaddy.com/forsale).
 */
export const PARKING_HOSTS: ReadonlyArray<[host: string, label: string, pathPrefix?: string]> = [
  ['sedoparking.com', 'a Sedo parking page'],
  ['sedo.com', 'a Sedo parking page'],
  ['hugedomains.com', 'a HugeDomains sale page'],
  ['parkingcrew.net', 'a ParkingCrew page'],
  ['afternic.com', 'an Afternic sale page'],
  ['dan.com', 'a Dan.com sale page'],
  ['bodis.com', 'a Bodis parking page'],
  ['undeveloped.com', 'an Undeveloped sale page'],
  ['godaddy.com', 'a GoDaddy sale page', '/forsale'],
]

/** Pure: `hostname` is `host` itself or a subdomain of it. */
export function hostMatches(hostname: string, host: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  return h === host || h.endsWith(`.${host}`)
}

/** Pure: the registrar's label when the URL we landed on is a parking /
 *  sale host — by hostname, never by substring. */
export function parkedHost(url: URL): string | null {
  for (const [host, label, pathPrefix] of PARKING_HOSTS) {
    if (!hostMatches(url.hostname, host)) continue
    if (pathPrefix && !url.pathname.toLowerCase().startsWith(pathPrefix)) continue
    return label
  }
  return null
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A registrar host as a hostname TOKEN in page text: bounded on both
 *  sides by something that cannot be part of a hostname label. */
const HOST_TOKENS: ReadonlyArray<[re: RegExp, label: string]> = PARKING_HOSTS.filter(([, , p]) => !p).map(
  ([host, label]) => [new RegExp(`(^|[^a-z0-9-])${escapeRe(host)}(?![a-z0-9-])`), label],
)

/** Pure: a parking fingerprint's label when the body is a parking page —
 *  a phrase, or a registrar host named as a host (not inside another one). */
export function parkingFingerprint(html: string): string | null {
  const body = html.toLowerCase()
  for (const [needle, label] of PARKING_FINGERPRINTS) {
    if (body.includes(needle)) return label
  }
  for (const [re, label] of HOST_TOKENS) {
    if (re.test(body)) return label
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

export interface GuardedFetchDeps {
  fetchImpl?: typeof fetch
  /** Resolve a hostname to its addresses (every record — all of them are checked). */
  lookup?: (host: string) => Promise<unknown>
}

export interface LivenessDeps extends GuardedFetchDeps {
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

function isTimeout(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError' || /timeout/i.test(err.message))
  )
}

// ── The guarded session: judge, pin, request ────────────────────────────────

/** Why a target was refused: `gone` (DNS says the name no longer exists —
 *  the one refusal that is "dead"), `policy` (we will not connect there),
 *  `resolver` (DNS could not answer right now). */
export type GuardRefusal = 'gone' | 'policy' | 'resolver'

export type GuardVerdict =
  | { ok: true }
  | { ok: false; status: 'dead' | 'unknown'; cause: GuardRefusal; detail: string }

export type GuardedWalk =
  | { kind: 'ok'; res: Response; url: URL }
  | { kind: 'refused'; status: 'dead' | 'unknown'; cause: GuardRefusal | 'redirects'; detail: string }
  | { kind: 'timeout' }
  | { kind: 'error' }

export interface GuardedSession {
  /** The host the detail sentences speak about (www. dropped). */
  readonly baseHost: string
  /** Judge a target (scheme, port, hostname, every resolved address); the
   *  verdict is cached per hostname and its addresses are PINNED for the
   *  connect. `hop` only shapes the sentence. */
  judge(target: URL, hop: number): Promise<GuardVerdict>
  /** One request to a judged target: redirect 'manual', the connect bound
   *  to the pinned addresses. Throws when the target was never judged OK. */
  request(target: URL, init: { method: 'GET' | 'HEAD'; headers: Record<string, string>; signal: AbortSignal }): Promise<Response>
  /** A `typeof fetch` for the policy helpers (robots.txt): judges the
   *  target, refuses by throwing, never follows a redirect. */
  fetch: typeof fetch
  /** The addresses pinned so far — what the connect may dial. */
  pinned(hostname: string): string[] | undefined
  /** Release the pinned connection pool. */
  close(): void
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: unknown, family?: number) => void
type PinnedAgent = { dispatcher: unknown; destroy: () => void }

/**
 * An undici Agent whose connect resolves ONLY through the pin map — the
 * address the policy judged is the address the socket opens to. Built from
 * the runtime's own global dispatcher class (Node's fetch is undici; the
 * package itself is not a dependency), so a runtime that does not expose it
 * falls back to the unpinned connect — still judged per hop, not bound.
 */
function pinnedAgent(pins: Map<string, string[]>): PinnedAgent | null {
  try {
    const global = (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('undici.globalDispatcher.1')] as
      | { constructor?: unknown }
      | undefined
    const Agent = global?.constructor as (new (opts: unknown) => { destroy(): Promise<void> }) | undefined
    if (typeof Agent !== 'function') return null
    const lookup = (hostname: string, options: unknown, callback: unknown) => {
      const cb = (typeof options === 'function' ? options : callback) as LookupCallback
      const all = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true
      const addresses = pins.get(hostname.toLowerCase())
      if (!addresses || addresses.length === 0) {
        cb(Object.assign(new Error(`${hostname} was never vetted by the address policy`), { code: 'ENOTVETTED' }))
        return
      }
      const entries = addresses.map((address) => ({ address, family: isIP(address) === 6 ? 6 : 4 }))
      if (all) cb(null, entries)
      else cb(null, entries[0].address, entries[0].family)
    }
    const agent = new Agent({ connect: { lookup } })
    return {
      dispatcher: agent,
      destroy: () => {
        void agent.destroy().catch(() => {})
      },
    }
  } catch {
    return null
  }
}

export function guardedSession(base: URL, deps: GuardedFetchDeps = {}): GuardedSession {
  const fetchImpl = deps.fetchImpl ?? fetch
  const lookup = deps.lookup ?? ((host: string) => dnsLookup(host, { all: true }))
  const baseHost = normalizeHost(base.hostname)
  const judged = new Map<string, GuardVerdict>()
  const pins = new Map<string, string[]>()
  // The pinned connect only matters for the real fetch; an injected one
  // (the tests) never opens a socket.
  let agent: PinnedAgent | null | undefined = deps.fetchImpl ? null : undefined

  const judge = async (target: URL, hop: number): Promise<GuardVerdict> => {
    const where = hop === 0 ? baseHost : `${baseHost} redirects to ${normalizeHost(target.hostname)}, which`
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return { ok: false, status: 'unknown', cause: 'policy', detail: `${where} is not a web address (${target.protocol.replace(':', '')}) — not checked` }
    }
    if (!ALLOWED_PORTS.has(target.port)) {
      return { ok: false, status: 'unknown', cause: 'policy', detail: `${where} uses a non-standard port (${target.port}) — not checked` }
    }
    const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const cached = judged.get(hostname)
    if (cached) return cached
    let verdict: GuardVerdict
    const refuse = (): GuardVerdict => ({ ok: false, status: 'unknown', cause: 'policy', detail: `${where} points at a private network address — not checked` })
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      verdict = refuse()
    } else if (isIP(hostname)) {
      verdict = isPrivateAddress(hostname) ? refuse() : { ok: true }
      if (verdict.ok) pins.set(hostname, [hostname])
    } else {
      const name = hop === 0 ? baseHost : normalizeHost(target.hostname)
      try {
        const addresses = addressesOf(await lookup(hostname))
        if (addresses.length === 0) {
          verdict = { ok: false, status: 'dead', cause: 'gone', detail: `${name} no longer resolves (DNS)` }
        } else if (addresses.some(isPrivateAddress)) {
          verdict = refuse()
        } else {
          verdict = { ok: true }
          pins.set(hostname, addresses)
        }
      } catch (err) {
        verdict = dnsSaysGone(err)
          ? { ok: false, status: 'dead', cause: 'gone', detail: `${name} no longer resolves (DNS)` }
          : {
              ok: false,
              status: 'unknown',
              cause: 'resolver',
              detail: `${name} could not be resolved right now (${(err as { code?: string })?.code ?? 'DNS error'}) — will check again`,
            }
      }
    }
    judged.set(hostname, verdict)
    return verdict
  }

  const request: GuardedSession['request'] = async (target, init) => {
    const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const verdict = judged.get(hostname)
    if (!verdict?.ok) throw new Error(`${hostname} was never vetted by the address policy`)
    if (agent === undefined) agent = pinnedAgent(pins)
    const opts: RequestInit & { dispatcher?: unknown } = { ...init, redirect: 'manual' }
    if (agent) opts.dispatcher = agent.dispatcher
    return fetchImpl(target.toString(), opts)
  }

  const guardedFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url)
    const hop = normalizeHost(url.hostname) === baseHost ? 0 : 1
    const verdict = await judge(url, hop)
    if (!verdict.ok) throw new Error(verdict.detail)
    return request(url, {
      method: (init?.method as 'GET' | 'HEAD') ?? 'GET',
      headers: { 'user-agent': CRAWL_UA, ...((init?.headers as Record<string, string>) ?? {}) },
      signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    })
  }) as typeof fetch

  return {
    baseHost,
    judge,
    request,
    fetch: guardedFetch,
    pinned: (hostname) => pins.get(hostname.toLowerCase()),
    close: () => {
      if (agent) agent.destroy()
      agent = null
    },
  }
}

/**
 * THE ONE GUARDED FETCH — the probe and the crawler both ride it. Judges
 * the target, requests it with the connect bound to the judged addresses,
 * walks redirects BY HAND (each hop judged before it is fetched; nothing of
 * a redirect's body is ever read), capped at `maxRedirects`. `deadline`
 * (ms left) shortens every request's budget; at zero it is a timeout.
 */
export async function fetchGuarded(
  session: GuardedSession,
  from: URL,
  opts: { method: 'GET' | 'HEAD'; timeoutMs?: number; maxRedirects?: number; deadline?: () => number; accept?: string },
): Promise<GuardedWalk> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS
  const headers = { 'user-agent': CRAWL_UA, accept: opts.accept ?? 'text/html' }
  let current = from
  for (let hop = 0; ; hop++) {
    const g = await session.judge(current, hop)
    if (!g.ok) return { kind: 'refused', status: g.status, cause: g.cause, detail: g.detail }
    const budget = Math.min(timeoutMs, opts.deadline ? opts.deadline() : timeoutMs)
    if (budget <= 0) return { kind: 'timeout' }
    let res: Response
    try {
      res = await session.request(current, { method: opts.method, headers, signal: AbortSignal.timeout(budget) })
    } catch (err) {
      return isTimeout(err) ? { kind: 'timeout' } : { kind: 'error' }
    }
    const location = REDIRECT_STATUSES.has(res.status) ? res.headers?.get?.('location') : null
    if (!location) return { kind: 'ok', res, url: current }
    // Nothing of a redirect's body is ever read.
    try {
      await res.body?.cancel?.()
    } catch {
      /* nothing to drain */
    }
    if (hop >= maxRedirects) {
      return {
        kind: 'refused',
        status: 'unknown',
        cause: 'redirects',
        detail: `${session.baseHost} redirects more than ${maxRedirects} times — not followed`,
      }
    }
    try {
      current = new URL(location, current)
    } catch {
      return { kind: 'refused', status: 'unknown', cause: 'redirects', detail: `${session.baseHost} redirects to an address we could not read` }
    }
  }
}

// ── The probe ───────────────────────────────────────────────────────────────

export async function checkSiteLiveness(url: string, deps: LivenessDeps = {}): Promise<SiteLiveness> {
  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return { status: 'dead', detail: 'Website address is not a valid URL', finalUrl: null, httpStatus: null, cause: 'invalid' }
  }
  const session = guardedSession(parsed, deps)
  try {
    return await probe(parsed, session, deps)
  } finally {
    session.close()
  }
}

function refused(w: Extract<GuardedWalk, { kind: 'refused' }> | Extract<GuardVerdict, { ok: false }>): SiteLiveness {
  const out: SiteLiveness = { status: w.status, detail: w.detail, finalUrl: null, httpStatus: null }
  // A gone name is dead by DNS (Y1); an unknown says why it could not tell.
  if (w.cause === 'gone') out.cause = 'dns'
  else if (w.status === 'unknown') out.cause = w.cause
  return out
}

async function probe(parsed: URL, session: GuardedSession, deps: LivenessDeps): Promise<SiteLiveness> {
  const host = session.baseHost
  // robots.txt rides the same policy: judged, pinned, no redirect ever followed.
  const robots = deps.robots ?? ((origin: string) => robotsAllows(origin, session.fetch))
  const started = Date.now()
  const deadline = () => Math.max(0, PROBE_DEADLINE_MS - (Date.now() - started))
  const none = { finalUrl: null, httpStatus: null }

  // 1) DNS + the address policy — a name that is gone is the clearest "dead";
  //    a resolver that could not answer is nothing of the kind.
  const first = await session.judge(parsed, 0)
  if (!first.ok) return refused(first)

  // 2) robots — the server answered; we do not read a page it asked us not to.
  if (!(await robots(parsed.origin))) {
    return {
      status: 'alive',
      detail: `${host} answers; its robots.txt asks crawlers to stay out`,
      finalUrl: parsed.toString(),
      httpStatus: null,
    }
  }

  // 3) HEAD, then GET — each a guarded walk; a timeout gets one retry; two
  //    timeouts are "dead".
  const walk = (method: 'HEAD' | 'GET', from: URL) => fetchGuarded(session, from, { method, timeoutMs: TIMEOUT_MS, deadline })
  let head = await walk('HEAD', parsed)
  if (head.kind === 'timeout') head = await walk('HEAD', parsed)
  if (head.kind === 'timeout') {
    return { status: 'dead', detail: `${host} timed out twice (${TIMEOUT_MS / 1000}s)`, ...none, cause: 'timeout' }
  }
  if (head.kind === 'error') {
    return { status: 'dead', detail: `${host} refused the connection`, ...none, cause: 'refused' }
  }
  if (head.kind === 'refused') return refused(head)

  let final: Extract<GuardedWalk, { kind: 'ok' }> = head
  // Some servers reject HEAD outright; GET decides — and GET is the only
  // pass whose body is read, so the parking fingerprint runs on it.
  const s = head.res.status
  let bodyRead = false
  if (s === 405 || s === 501 || s === 403 || s === 401 || s === 429 || head.res.ok) {
    let got = await walk('GET', head.url)
    if (got.kind === 'timeout') got = await walk('GET', head.url)
    if (got.kind === 'timeout') {
      return { status: 'dead', detail: `${host} timed out twice (${TIMEOUT_MS / 1000}s)`, ...none, cause: 'timeout' }
    }
    if (got.kind === 'refused') return refused(got)
    if (got.kind === 'ok') {
      final = got
      bodyRead = true
    }
  }

  const res = final.res
  const finalUrl = final.url.toString()
  const finalHost = normalizeHost(final.url.hostname)
  const landed = finalHost !== host ? `${host} now lands on ${finalHost}` : host

  if (res.status >= 500) {
    return { status: 'dead', detail: `${host} answers with a server error (${res.status})`, finalUrl, httpStatus: res.status, cause: 'http' }
  }
  if (res.status === 404 || res.status === 410) {
    return { status: 'dead', detail: `${host}'s homepage is gone (${res.status})`, finalUrl, httpStatus: res.status, cause: 'http' }
  }
  // Parking is judged on the FINAL response: the registrar's HOST we landed
  // on (exact hostname, never a substring), then the body we were served there.
  const urlParked = finalHost !== host ? parkedHost(final.url) : null
  if (urlParked) {
    return { status: 'parked', detail: `${landed} — ${urlParked}`, finalUrl, httpStatus: res.status, cause: 'parked' }
  }
  if (res.ok && bodyRead && res.body !== undefined) {
    const html = await readBodyCapped(res)
    const parked = parkingFingerprint(html)
    if (parked) {
      return {
        status: 'parked',
        detail: finalHost !== host ? `${landed} — ${parked}` : `${host} shows ${parked}`,
        finalUrl,
        httpStatus: res.status,
        cause: 'parked',
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
