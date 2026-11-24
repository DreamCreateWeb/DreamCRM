/**
 * INDEXNOW — telling search engines a public page changed, instead of waiting
 * for them to come back and notice.
 *
 * WHY IT EXISTS. On 2026-11-24 a `site:` query on Bing returned no page of
 * ours, and no answer engine named us for any of ten buyer questions
 * (docs/research/marketing-engine-2026-11). Bing's index is also what
 * Microsoft Copilot reads, and OpenAI says ChatGPT search draws on partner
 * search providers besides its own crawler — so a page Bing has never seen is
 * a page those assistants cannot quote. IndexNow is the one push channel the
 * engines publish: one POST naming the URLs that were added, changed or
 * removed. It reaches Bing, Yandex, Naver, Seznam, Yep and Amazon. **Google
 * does not take part**; Google is served by the sitemap and Search Console.
 *
 * THE PROTOCOL'S RULES, AS READ ON indexnow.org (documentation + FAQ,
 * 2026-11-24), which the code below is built to keep:
 *  - the key is 8–128 characters of `[a-zA-Z0-9-]` and must be readable at
 *    `https://<host>/<key>.txt`, containing the key and nothing else;
 *  - every HOST needs its own key file — "each subdomain is treated as a
 *    separate host";
 *  - one POST carries up to 10,000 URLs, all on the host it names;
 *  - submit when a URL is added, updated or DELETED;
 *  - "Do not resubmit unchanged URLs" — which is why nothing here fires on a
 *    deploy or a container start, and why every URL carries a content key;
 *  - it "is not designed for submitting every URL on your site at once",
 *    with one stated exception: "If your entire site has been recently
 *    updated… it is acceptable to submit all URLs." The first pass names
 *    every page, and it ships with exactly such a change (the trial terms,
 *    every page's head and the header menu moved sitewide on 2026-11-23/24).
 *    The cost of that design is stated rather than hidden: if the stored
 *    record were ever lost, the next pass would name every page once more;
 *  - "for your first request, you may receive an HTTP 202 response… the
 *    search engine will verify your key before indexing the content", and
 *    later ones "will typically return HTTP 200". So the key is fetched
 *    AFTER the first notice is accepted — which is why the first notice
 *    waits for the rollout and why the pass reads its own key file first
 *    (lib/services/indexnow.ts).
 *
 * THE KEY IS NOT A SECRET. The protocol requires it to be served to anyone
 * who asks for `/<key>.txt`; its only job is to show that whoever submits a
 * URL also controls the host. It is committed for that reason, and so that
 * the whole thing works on the first deploy with no setup step. Changing it
 * is a one-line edit here (the middleware serves whatever this says).
 *
 * NOT A SERVICE PROVIDER IN THE PRIVACY POLICY'S SENSE. What is sent is the
 * address of our own public marketing pages — no information about any
 * person, practice or patient — so it is deliberately absent from
 * `SERVICE_PROVIDERS` in lib/marketing/legal.ts.
 *
 * Pure and edge-safe: the middleware imports the key from here. The database
 * half is lib/services/indexnow.ts.
 */

export const INDEXNOW_KEY = '9e5ee2305febdb415de2142b3255eb0a'

/** Where the key file lives on every host we serve. */
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`

/** The shared endpoint; it forwards to every participating engine. */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** The protocol's ceiling for one POST. */
export const INDEXNOW_MAX_URLS = 10_000

/** The protocol's own shape for a key. */
export function isValidIndexNowKey(key: string): boolean {
  return /^[a-zA-Z0-9-]{8,128}$/.test(key)
}

/** A page's path on the site → a string that changes exactly when the page's
 *  content does. */
export type IndexNowMap = Record<string, string>

export interface IndexNowTarget {
  /** `https://www.example.com` — no trailing slash. */
  origin: string
  /** `www.example.com` */
  host: string
}

/**
 * The host we may speak for, or null when this process is not the public
 * site. Deliberately NO fallback to the production address: a laptop or a
 * test harness that never set the URL must stay silent rather than announce
 * production pages it knows nothing about. (The production image bakes the
 * real address in at build time; the browser-test harness runs on
 * `http://127.0.0.1`, which this refuses.)
 */
export function indexNowTarget(appUrl: string | undefined | null): IndexNowTarget | null {
  if (!appUrl) return null
  let url: URL
  try {
    url = new URL(appUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null
  // A bare IP address (v4 or v6) is a machine, not a site.
  if (/^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return null
  if (!host.includes('.')) return null
  return { origin: `https://${host}`, host }
}

export interface IndexNowPlan {
  /** New pages, and pages whose content key moved. */
  changed: string[]
  /** Pages we once announced that are no longer served — announced one last
   *  time so the engines learn they are gone, then forgotten. */
  removed: string[]
}

/** What to announce: the difference between what is public now and what the
 *  engines were last told. Unchanged pages are in neither list, ever. */
export function planIndexNow(desired: IndexNowMap, submitted: IndexNowMap): IndexNowPlan {
  const changed = Object.keys(desired)
    .filter((path) => submitted[path] !== desired[path])
    .sort()
  const removed = Object.keys(submitted)
    .filter((path) => !(path in desired))
    .sort()
  return { changed, removed }
}

export interface IndexNowBody {
  host: string
  key: string
  keyLocation: string
  urlList: string[]
}

/** A root-relative path on our own host. `//evil.example` is somebody else's
 *  address written to look like one, and is refused. */
export function isSendablePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//')
}

/** The JSON the protocol asks for. Paths become absolute URLs on the one
 *  host; anything that is not a root-relative path is dropped rather than
 *  sent to an engine as somebody else's address. */
export function buildIndexNowBody(target: IndexNowTarget, paths: readonly string[]): IndexNowBody {
  const urlList = paths
    .filter(isSendablePath)
    .slice(0, INDEXNOW_MAX_URLS)
    .map((p) => `${target.origin}${p}`)
  return {
    host: target.host,
    key: INDEXNOW_KEY,
    keyLocation: `${target.origin}${INDEXNOW_KEY_PATH}`,
    urlList,
  }
}

export type IndexNowOutcome =
  /** 200 — received. */
  | 'ok'
  /** 202 — received; the engine has not fetched our key file yet. */
  | 'accepted'
  /** 400 — the request was malformed. Ours to fix. */
  | 'bad_request'
  /** 403 — the key file was not found, or did not match. Ours to fix. */
  | 'key_refused'
  /** 422 — a URL was not on the host, or the key did not fit the protocol. */
  | 'urls_refused'
  /** 429 — too many requests; simply try at the next pass. */
  | 'rate_limited'
  /** Anything else, including a network failure (status 0). */
  | 'failed'

/** The protocol's response codes, as its documentation lists them. */
export function classifyIndexNowStatus(status: number): IndexNowOutcome {
  if (status === 200) return 'ok'
  if (status === 202) return 'accepted'
  if (status === 400) return 'bad_request'
  if (status === 403) return 'key_refused'
  if (status === 422) return 'urls_refused'
  if (status === 429) return 'rate_limited'
  return 'failed'
}

/** Were the URLs taken? Only then may they be remembered as announced. */
export function indexNowDelivered(outcome: IndexNowOutcome): boolean {
  return outcome === 'ok' || outcome === 'accepted'
}

/**
 * A short, stable fingerprint of a value, for content keys. Not
 * cryptographic and does not need to be: it only has to change when the
 * content does (cyrb53 — 53 bits, so a missed change is a one-in-quadrillions
 * event, and the cost of one is a page that waits for an ordinary crawl).
 * Synchronous and dependency-free on purpose, so this file stays edge-safe.
 */
export function contentKey(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/* ── What the platform keeps between passes ─────────────────────────── */

/**
 * How a pass ended. The protocol's outcomes, plus three of our own:
 *  - `nothing_to_send` — every public page is already on record;
 *  - `key_not_served` — we asked our own site for the key file before
 *    sending and did not get the key back, so nothing was sent (an engine
 *    that cannot read the file discards the notice, silently);
 *  - `waiting_for_rollout` — the FIRST notice ever is held until this
 *    process has been up a few minutes, because during a rolling deploy an
 *    engine's request for the key file can land on an instance of the old
 *    version, which has never heard of it.
 */
export type IndexNowRunOutcome =
  | IndexNowOutcome
  | 'nothing_to_send'
  | 'key_not_served'
  | 'waiting_for_rollout'

export interface IndexNowRun {
  /** ISO time of the pass. */
  at: string
  outcome: IndexNowRunOutcome
  /** HTTP status, 0 for a network failure, null when nothing was sent. */
  status: number | null
  /** How many URLs the pass named (changed + removed). */
  urls: number
}

/** The `indexNow` key of platform_config. Its writer passes it WHOLE. */
export interface IndexNowState {
  /** path → the content key the engines were last told about. */
  submitted: IndexNowMap
  /** The most recent pass, whatever it did. */
  lastRun: IndexNowRun | null
  /** The most recent pass that actually delivered URLs. */
  lastDelivered: IndexNowRun | null
}

export const EMPTY_INDEXNOW_STATE: IndexNowState = { submitted: {}, lastRun: null, lastDelivered: null }

function parseRun(raw: unknown): IndexNowRun | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.at !== 'string' || typeof r.outcome !== 'string' || typeof r.urls !== 'number') return null
  const status = typeof r.status === 'number' ? r.status : null
  return { at: r.at, outcome: r.outcome as IndexNowRunOutcome, status, urls: r.urls }
}

/** Read the stored state defensively: a shape we do not recognise is treated
 *  as "nothing recorded" for the RUN fields, but a malformed `submitted` map
 *  is dropped entry by entry rather than trusted. */
export function parseIndexNowState(raw: unknown): IndexNowState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_INDEXNOW_STATE, submitted: {} }
  const r = raw as Record<string, unknown>
  const submitted: IndexNowMap = {}
  if (r.submitted && typeof r.submitted === 'object' && !Array.isArray(r.submitted)) {
    for (const [path, key] of Object.entries(r.submitted as Record<string, unknown>)) {
      if (typeof key === 'string') submitted[path] = key
    }
  }
  return { submitted, lastRun: parseRun(r.lastRun), lastDelivered: parseRun(r.lastDelivered) }
}

/**
 * One plain sentence about where the notices stand, for the platform owner's
 * SEO page. Written for a reader who has never heard the word "IndexNow".
 */
export function describeIndexNowState(
  state: IndexNowState,
  formatWhen: (iso: string) => string,
): { tone: 'calm' | 'attention'; headline: string; detail: string } {
  const known = Object.keys(state.submitted).length
  const pages = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`
  const last = state.lastRun
  const delivered = state.lastDelivered

  if (!last) {
    return {
      tone: 'calm',
      headline: 'No notice has gone out yet',
      detail:
        'The first one goes out at the first hourly pass after this version has finished going live, and names every public page once. After that, only pages that were added, changed or removed.',
    }
  }

  if (last.outcome === 'waiting_for_rollout') {
    return {
      tone: 'calm',
      headline: 'The first notice is waiting for this version to finish going live',
      detail: `Checked ${formatWhen(last.at)}. It goes out at the next hourly pass and names ${pages(last.urls)}.`,
    }
  }

  const refusal: Partial<Record<IndexNowRunOutcome, string>> = {
    key_not_served:
      'the site did not hand back its own key file when we checked, so nothing was sent',
    key_refused:
      'the engines could not read the key file on the site, so they did not accept the notice',
    bad_request: 'the engines rejected the notice as malformed',
    urls_refused: 'the engines rejected the addresses in the notice',
    rate_limited: 'the engines asked us to slow down',
    failed: 'the notice did not reach the engines',
  }
  const why = refusal[last.outcome]
  if (why) {
    return {
      tone: 'attention',
      headline: `The last notice did not land — ${why}`,
      detail: `Tried ${formatWhen(last.at)} for ${pages(last.urls)}. It is tried again every hour, and nothing is marked as announced until one lands. ${
        delivered
          ? `The last one that landed was ${formatWhen(delivered.at)}.`
          : 'None has landed so far.'
      }`,
    }
  }

  return {
    tone: 'calm',
    headline: delivered
      ? `Last told ${formatWhen(delivered.at)} — ${pages(delivered.urls)}`
      : 'Nothing has needed announcing yet',
    detail: `${pages(known)} on record as announced. Checked ${formatWhen(last.at)}; a page is named again only when its content changes.`,
  }
}
