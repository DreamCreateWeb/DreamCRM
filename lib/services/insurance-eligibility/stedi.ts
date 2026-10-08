import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { EligibilityRequest, EligibilityResult, InsuranceDriverId } from '@/lib/insurance-eligibility'
import {
  STEDI_API_BASE,
  STEDI_ELIGIBILITY_PATH,
  STEDI_PAYER_SEARCH_PATH,
  StediRetryableError,
  buildStediRequest,
  normalizeStediResponse,
  parsePayerSearch,
  pickUnambiguousPayer,
  type StediPayerMatch,
} from '@/lib/stedi-eligibility'
import type { EligibilityAnswer, EligibilityProvider } from './provider'

/**
 * The STEDI driver — the network half. Reads STEDI_API_KEY, resolves the
 * payer and the practice's NPI, POSTs the check, and hands the payload to
 * the pure normalizer. Two driver ids ride this one implementation:
 *
 *   stedi_test  STEDI_MODE unset or 'test' — a Stedi TEST key answers only
 *               their predefined mock requests with sample benefits. A
 *               practice answer, labelled as such.
 *   stedi       STEDI_MODE=live — a LIVE key reaches the real payer and is
 *               billed per check. Needs an executed BAA first
 *               (docs/COMPLIANCE.md).
 *
 * The mode is an explicit env switch rather than sniffed from the key,
 * because the two keys look alike and the wrong guess here either bills
 * the owner or labels a real answer as practice.
 */

const TIMEOUT_MS = 25_000
/** Stedi's own documented mock provider NPI — the test-mode fallback. */
const MOCK_NPI = '1999999984'

export function stediMode(env: Record<string, string | undefined> = process.env): 'test' | 'live' {
  return (env.STEDI_MODE ?? '').trim().toLowerCase() === 'live' ? 'live' : 'test'
}

export function stediConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.STEDI_API_KEY ?? '').trim()
}

function apiKey(): string {
  const key = (process.env.STEDI_API_KEY ?? '').trim()
  if (!key) throw new Error('Stedi is not configured — set STEDI_API_KEY.')
  return key
}

export async function stediFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS)
  try {
    return await fetch(`${STEDI_API_BASE}${path}`, {
      ...init,
      headers: { Authorization: apiKey(), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new StediRetryableError('Stedi took too long to answer — try again in a moment.')
    throw new StediRetryableError(`Couldn’t reach Stedi: ${e instanceof Error ? e.message : 'network error'}`)
  } finally {
    clearTimeout(timer)
  }
}

/** Payer typeahead for the form. Never throws — an empty list is the honest fallback. */
export async function searchStediPayers(query: string, limit = 8): Promise<StediPayerMatch[]> {
  const q = query.trim()
  if (q.length < 2 || !stediConfigured()) return []
  try {
    const res = await stediFetch(`${STEDI_PAYER_SEARCH_PATH}?query=${encodeURIComponent(q)}&eligibilityCheck=SUPPORTED`, {
      method: 'GET',
      timeoutMs: 8_000,
    })
    if (!res.ok) return []
    return parsePayerSearch(await res.json()).slice(0, limit)
  } catch (e) {
    console.error('[stedi] payer search failed:', e)
    return []
  }
}

async function resolvePayerId(req: EligibilityRequest): Promise<string> {
  if (req.payerId?.trim()) return req.payerId.trim()
  const matches = await searchStediPayers(req.carrierName, 10)
  const pick = pickUnambiguousPayer(matches)
  if (pick) return pick.primaryPayerId
  if (matches.length === 0) throw new Error(`No payer named “${req.carrierName}” supports eligibility checks — pick the payer from the list.`)
  throw new Error(`“${req.carrierName}” matches ${matches.length} payers — pick the exact one from the list before checking.`)
}

export async function resolveProvider(organizationId: string, mode: 'test' | 'live'): Promise<{ npi: string; organizationName: string }> {
  const [row] = await db
    .select({ npi: schema.clinicProfile.npi, name: schema.organization.name })
    .from(schema.clinicProfile)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const stored = (row?.npi ?? '').replace(/\D/g, '')
  const fallback = (process.env.STEDI_DEFAULT_NPI ?? '').replace(/\D/g, '')
  const npi = stored.length === 10 ? stored : fallback.length === 10 ? fallback : mode === 'test' ? MOCK_NPI : ''
  if (!npi) throw new Error('Add the practice’s NPI to its profile before checking insurance — payers need it to answer.')
  return { npi, organizationName: row?.name ?? 'Dental practice' }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>
    const msg = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : null
    return msg ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export function makeStediProvider(id: Extract<InsuranceDriverId, 'stedi' | 'stedi_test'>): EligibilityProvider {
  return {
    id,
    async check(req, ctx, opts): Promise<EligibilityAnswer> {
      const mode = id === 'stedi' ? 'live' : 'test'
      const [payerId, provider] = await Promise.all([resolvePayerId(req), resolveProvider(ctx.organizationId, mode)])
      const body = buildStediRequest(req, { payerId, npi: provider.npi, organizationName: provider.organizationName, services: opts?.services })
      const res = await stediFetch(STEDI_ELIGIBILITY_PATH, { method: 'POST', body: JSON.stringify(body) })
      if (res.status === 401 || res.status === 403) throw new Error('Stedi rejected the API key — check STEDI_API_KEY.')
      if (res.status === 429 || res.status >= 500) throw new StediRetryableError(`Stedi is busy (HTTP ${res.status}) — try again in a moment.`)
      if (!res.ok) throw new Error(`Stedi rejected the request: ${await readError(res)}`)
      const json: unknown = await res.json()
      return { result: normalizeStediResponse(json, req, ctx.now), raw: json }
    },
  }
}
