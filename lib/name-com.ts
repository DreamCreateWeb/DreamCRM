import 'server-only'

/**
 * name.com Core API (v4) client — the platform's domain registrar
 * (2026-07-21, domain-purchase build). Lazy + env-gated like the Stripe /
 * Zernio clients so `next build` runs keyless and the whole feature ships
 * DARK until the secrets exist.
 *
 * Env:
 *   NAMECOM_USERNAME        account username (Basic-auth pairs with the token)
 *   NAMECOM_TOKEN           API token (Secrets Manager in prod)
 *   NAMECOM_API_URL         override for the test env (https://api.dev.name.com)
 *   NAMECOM_LIVE_PURCHASES  '1' → createDomain really buys; anything else =
 *                           dry-run (search/pricing still live, purchase simulated)
 *
 * All wrappers are defensive-parse + never throw raw fetch errors upward —
 * callers get typed results or a thrown Error with a human message.
 */

const API_URL = () => (process.env.NAMECOM_API_URL?.trim() || 'https://api.name.com').replace(/\/$/, '')

export function isNameComConfigured(): boolean {
  return Boolean(process.env.NAMECOM_USERNAME?.trim() && process.env.NAMECOM_TOKEN?.trim())
}

export function isLivePurchasesEnabled(): boolean {
  return process.env.NAMECOM_LIVE_PURCHASES === '1'
}

function authHeader(): string {
  const user = process.env.NAMECOM_USERNAME?.trim()
  const token = process.env.NAMECOM_TOKEN?.trim()
  if (!user || !token) throw new Error('name.com is not configured (NAMECOM_USERNAME / NAMECOM_TOKEN).')
  return `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`
}

async function namecom<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API_URL()}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // non-JSON error body — fall through with null
  }
  if (!res.ok) {
    const apiMessage =
      json && typeof json === 'object' && 'message' in json
        ? String((json as { message: unknown }).message)
        : null
    throw new Error(apiMessage || `name.com request failed (${res.status})`)
  }
  return (json ?? {}) as T
}

// ── Search / availability ────────────────────────────────────────────────────

export interface DomainSearchResult {
  domainName: string
  purchasable: boolean
  premium: boolean
  /** Retail purchase price in cents (name.com returns dollars-as-float). */
  purchasePriceCents: number | null
  renewalPriceCents: number | null
}

function toCents(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

interface RawSearchResult {
  domainName?: string
  sld?: string
  tld?: string
  purchasable?: boolean
  premium?: boolean
  purchasePrice?: number
  renewalPrice?: number
}

function normalizeResult(r: RawSearchResult): DomainSearchResult | null {
  const domainName = r.domainName ?? (r.sld && r.tld ? `${r.sld}.${r.tld}` : null)
  if (!domainName) return null
  return {
    domainName: domainName.toLowerCase(),
    purchasable: r.purchasable === true,
    premium: r.premium === true,
    purchasePriceCents: toCents(r.purchasePrice),
    renewalPriceCents: toCents(r.renewalPrice),
  }
}

/** Keyword search — name.com suggests the keyword across TLDs. */
export async function searchDomains(keyword: string): Promise<DomainSearchResult[]> {
  const data = await namecom<{ results?: RawSearchResult[] }>('/v4/domains:search', {
    method: 'POST',
    body: { keyword },
  })
  return (data.results ?? []).map(normalizeResult).filter((r): r is DomainSearchResult => r !== null)
}

/** Exact availability + live pricing for specific domain names. */
export async function checkAvailability(domainNames: string[]): Promise<DomainSearchResult[]> {
  if (domainNames.length === 0) return []
  const data = await namecom<{ results?: RawSearchResult[] }>('/v4/domains:checkAvailability', {
    method: 'POST',
    body: { domainNames },
  })
  return (data.results ?? []).map(normalizeResult).filter((r): r is DomainSearchResult => r !== null)
}

// ── Purchase ─────────────────────────────────────────────────────────────────

export interface PurchaseOutcome {
  domainName: string
  /** What name.com actually charged the platform account, in cents. */
  totalPaidCents: number | null
}

/**
 * Register the domain on the platform's name.com account. `expectedPriceCents`
 * pins the price — name.com rejects the create if its current price differs,
 * so a quote can never silently become a bigger charge.
 */
export async function createDomain(
  domainName: string,
  expectedPriceCents: number,
): Promise<PurchaseOutcome> {
  const data = await namecom<{ domain?: { domainName?: string }; order?: number; totalPaid?: number }>(
    '/v4/domains',
    {
      method: 'POST',
      body: {
        domain: { domainName },
        purchasePrice: expectedPriceCents / 100,
      },
    },
  )
  return {
    domainName: data.domain?.domainName ?? domainName,
    totalPaidCents: toCents(data.totalPaid),
  }
}

/**
 * Turn OFF registrar-side auto-renew. Called right after registration —
 * renewals are OUR cron's job (charge the clinic first, then renew), so the
 * registrar must never silently renew a churned clinic's domain on the
 * platform's card.
 */
export async function disableAutorenew(domainName: string): Promise<void> {
  await namecom(`/v4/domains/${encodeURIComponent(domainName)}:disableAutorenew`, { method: 'POST' })
}

/**
 * Renew for one more year at a pinned price — name.com rejects the renewal
 * if its current price differs, so a stored quote can never silently grow.
 */
export async function renewDomain(
  domainName: string,
  expectedPriceCents: number,
): Promise<{ expireDate: string | null }> {
  const data = await namecom<{ domain?: { expireDate?: string } }>(
    `/v4/domains/${encodeURIComponent(domainName)}:renew`,
    { method: 'POST', body: { purchasePrice: expectedPriceCents / 100 } },
  )
  return { expireDate: data.domain?.expireDate ?? null }
}

// ── DNS records ──────────────────────────────────────────────────────────────

export interface NameComRecord {
  id?: number
  host: string
  type: string
  answer: string
  ttl?: number
}

export async function listRecords(domainName: string): Promise<NameComRecord[]> {
  const data = await namecom<{ records?: NameComRecord[] }>(
    `/v4/domains/${encodeURIComponent(domainName)}/records`,
  )
  return data.records ?? []
}

/** Create one DNS record. `host` is zone-relative ('' or '@' for the apex). */
export async function createRecord(domainName: string, record: NameComRecord): Promise<void> {
  await namecom(`/v4/domains/${encodeURIComponent(domainName)}/records`, {
    method: 'POST',
    body: {
      host: record.host === '@' ? '' : record.host,
      type: record.type,
      answer: record.answer,
      ttl: record.ttl ?? 300,
    },
  })
}

export async function getDomain(domainName: string): Promise<{ domainName: string; expireDate?: string } | null> {
  try {
    return await namecom<{ domainName: string; expireDate?: string }>(
      `/v4/domains/${encodeURIComponent(domainName)}`,
    )
  } catch {
    return null
  }
}
