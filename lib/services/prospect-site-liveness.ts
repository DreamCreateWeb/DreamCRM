import 'server-only'
import { lookup as dnsLookup } from 'node:dns/promises'
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
 *   dead        DNS fails · 5xx · homepage gone (404/410) · timed out twice
 *   parked      a registrar-parking / server-default fingerprint
 *   redirected  the final host is a different site — recorded, not judged
 *
 * Six-second timeout, DreamCreateBot UA, robots honoured as the crawler does.
 */

export type SiteLivenessStatus = 'alive' | 'dead' | 'parked' | 'redirected'

export interface SiteLiveness {
  status: SiteLivenessStatus
  /** One plain sentence for the verification card. */
  detail: string
  finalUrl: string | null
  httpStatus: number | null
}

const TIMEOUT_MS = 6_000
const BODY_LIMIT = 200_000

/** Registrar parking + server-default fingerprints (lowercase substrings). */
export const PARKING_FINGERPRINTS: ReadonlyArray<[needle: string, label: string]> = [
  ['domain is for sale', 'a "domain for sale" page'],
  ['domain name is for sale', 'a "domain for sale" page'],
  ['this domain may be for sale', 'a "domain for sale" page'],
  ['buy this domain', 'a "buy this domain" page'],
  ['this domain is parked', 'a parked-domain page'],
  ['domain is parked', 'a parked-domain page'],
  ['parked free', 'a registrar parking page'],
  ['courtesy of godaddy', 'a GoDaddy parking page'],
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

/** Pure: a parking fingerprint's label when the body is a parking page. */
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

export interface LivenessDeps {
  fetchImpl?: typeof fetch
  lookup?: (host: string) => Promise<unknown>
  robots?: (origin: string) => Promise<boolean>
}

async function readLimited(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text.slice(0, BODY_LIMIT)
  } catch {
    return ''
  }
}

function isTimeout(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === 'TimeoutError' || err.name === 'AbortError' || /timeout/i.test(err.message))
  )
}

export async function checkSiteLiveness(url: string, deps: LivenessDeps = {}): Promise<SiteLiveness> {
  const fetchImpl = deps.fetchImpl ?? fetch
  const lookup = deps.lookup ?? ((host: string) => dnsLookup(host))
  const robots = deps.robots ?? ((origin: string) => robotsAllows(origin, fetchImpl))

  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
  } catch {
    return { status: 'dead', detail: 'Website address is not a valid URL', finalUrl: null, httpStatus: null }
  }
  const host = normalizeHost(parsed.hostname)

  // 1) DNS — a domain that no longer resolves is the clearest "gone".
  try {
    await lookup(parsed.hostname)
  } catch {
    return { status: 'dead', detail: `${host} no longer resolves (DNS)`, finalUrl: null, httpStatus: null }
  }

  // 2) robots — the server answered; we do not read a page it asked us not to.
  if (!(await robots(parsed.origin))) {
    return {
      status: 'alive',
      detail: `${host} answers; its robots.txt asks crawlers to stay out`,
      finalUrl: parsed.toString(),
      httpStatus: null,
    }
  }

  // 3) HEAD, then GET — a timeout gets one retry; two timeouts are "dead".
  const request = async (method: 'HEAD' | 'GET'): Promise<Response | 'timeout' | 'error'> => {
    try {
      return await fetchImpl(parsed.toString(), {
        method,
        headers: { 'user-agent': CRAWL_UA, accept: 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      return isTimeout(err) ? 'timeout' : 'error'
    }
  }

  let res = await request('HEAD')
  if (res === 'timeout') res = await request('HEAD')
  if (res === 'timeout') {
    return { status: 'dead', detail: `${host} timed out twice (${TIMEOUT_MS / 1000}s)`, finalUrl: null, httpStatus: null }
  }
  if (res === 'error') {
    return { status: 'dead', detail: `${host} refused the connection`, finalUrl: null, httpStatus: null }
  }

  // Some servers reject HEAD outright; GET decides.
  if (res.status === 405 || res.status === 501 || res.status === 403 || res.status === 401 || res.status === 429 || res.ok) {
    let got = await request('GET')
    if (got === 'timeout') got = await request('GET')
    if (got === 'timeout') {
      return { status: 'dead', detail: `${host} timed out twice (${TIMEOUT_MS / 1000}s)`, finalUrl: null, httpStatus: null }
    }
    if (got !== 'error') res = got
  }

  const finalUrl = res.url || parsed.toString()
  let finalHost = host
  try {
    finalHost = normalizeHost(new URL(finalUrl).hostname)
  } catch {
    /* keep the input host */
  }

  if (res.status >= 500) {
    return { status: 'dead', detail: `${host} answers with a server error (${res.status})`, finalUrl, httpStatus: res.status }
  }
  if (res.status === 404 || res.status === 410) {
    return { status: 'dead', detail: `${host}'s homepage is gone (${res.status})`, finalUrl, httpStatus: res.status }
  }
  if (finalHost !== host) {
    return {
      status: 'redirected',
      detail: `${host} now lands on ${finalHost}`,
      finalUrl,
      httpStatus: res.status,
    }
  }
  if (!res.ok) {
    return {
      status: 'alive',
      detail: `${host} answers but refused our crawler (${res.status})`,
      finalUrl,
      httpStatus: res.status,
    }
  }
  const html = await readLimited(res)
  const parked = parkingFingerprint(html)
  if (parked) {
    return { status: 'parked', detail: `${host} shows ${parked}`, finalUrl, httpStatus: res.status }
  }
  return { status: 'alive', detail: `${host} is up (${res.status})`, finalUrl, httpStatus: res.status }
}
