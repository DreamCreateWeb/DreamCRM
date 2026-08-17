import 'server-only'

/**
 * NexHealth Synchronizer API client (the universal PMS bridge — onboarding
 * overhaul §2.6). One platform-level API key per environment; per-clinic
 * scoping rides the (subdomain, location_id) pair stored on the org's
 * pms_connection.meta — subdomain identifies the NexHealth "institution" we
 * create for each practice in the developer portal, location_id the office.
 *
 * Auth is two-step: POST /authenticates with the API key mints a bearer
 * token. Tokens are long-ish lived; we cache per environment for
 * TOKEN_TTL_MS and re-mint once on a 401 (belt for early revocation).
 *
 * Environments: production and sandbox keys are BOTH platform secrets
 * (NEXHEALTH_API_KEY / NEXHEALTH_SANDBOX_API_KEY); which one a connection
 * uses rides its meta (`env: 'sandbox'`) — that's how our own test org
 * binds NexHealth's demo practice while real clinics ride production.
 *
 * All wrappers are defensive-parse (the same posture as lib/zernio.ts):
 * a shape surprise degrades to null/[], never a crash inside the sync
 * engine. Response envelope: { code: boolean, data, count, error }.
 */

const BASE_URL = 'https://nexhealth.info'
const ACCEPT = 'application/vnd.Nexhealth+json;version=2'
const TOKEN_TTL_MS = 50 * 60 * 1000 // re-mint before the published 1h expiry
// Bound every request: without this a NexHealth STALL (connection opens, never
// responds) hangs the caller until undici's ~300s default. The public booking
// page relies on a THROWN failure to fall back to the local slot engine, so a
// silent stall must become a timeout error, not a 5-minute page hang.
const REQUEST_TIMEOUT_MS = 10_000
const PAGE_SIZE = 200
/** Runaway-pagination backstop (a 40k-patient office is ~200 pages). */
const MAX_PAGES = 500

export type NexHealthEnv = 'production' | 'sandbox'

export function nexhealthConfigured(env: NexHealthEnv = 'production'): boolean {
  return Boolean(
    env === 'sandbox' ? process.env.NEXHEALTH_SANDBOX_API_KEY : process.env.NEXHEALTH_API_KEY,
  )
}

function apiKey(env: NexHealthEnv): string {
  const key =
    env === 'sandbox' ? process.env.NEXHEALTH_SANDBOX_API_KEY : process.env.NEXHEALTH_API_KEY
  if (!key) throw new Error(`NexHealth ${env} API key is not configured`)
  return key
}

const tokenCache = new Map<NexHealthEnv, { token: string; mintedAt: number }>()

async function mintToken(env: NexHealthEnv): Promise<string> {
  const res = await fetch(`${BASE_URL}/authenticates`, {
    method: 'POST',
    headers: { Accept: ACCEPT, Authorization: apiKey(env) },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`NexHealth auth failed (${res.status})`)
  const body = (await res.json()) as { data?: { token?: string } }
  const token = body?.data?.token
  if (!token) throw new Error('NexHealth auth returned no token')
  tokenCache.set(env, { token, mintedAt: Date.now() })
  return token
}

async function bearer(env: NexHealthEnv): Promise<string> {
  const cached = tokenCache.get(env)
  if (cached && Date.now() - cached.mintedAt < TOKEN_TTL_MS) return cached.token
  return mintToken(env)
}

export interface NexRequestOpts {
  env?: NexHealthEnv
  /** Invoked before EVERY outbound HTTP request (including the 401 re-mint
   *  retry — that's two vendor-billed calls, so it counts twice). The meter
   *  hangs here; a hook failure never blocks the request. */
  onCall?: () => void | Promise<void>
}

/** One GET against the API, with a single re-mint retry on 401. */
export async function nexGet<T = unknown>(
  path: string,
  params: Record<string, string | number | Array<string | number> | undefined>,
  opts: NexRequestOpts = {},
): Promise<{ data: T | null; count: number | null }> {
  const env = opts.env ?? 'production'
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    // Array values repeat the key (NexHealth's pids[]/lids[] style).
    if (Array.isArray(v)) for (const item of v) qs.append(k, String(item))
    else qs.set(k, String(v))
  }
  const url = `${BASE_URL}/${path}?${qs.toString()}`

  const countCall = async () => {
    try {
      await opts.onCall?.()
    } catch (e) {
      console.error('[nexhealth] onCall hook failed (request proceeds):', e)
    }
  }

  let token = await bearer(env)
  await countCall()
  let res = await fetch(url, {
    headers: { Accept: ACCEPT, Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (res.status === 401) {
    token = await mintToken(env)
    await countCall()
    res = await fetch(url, {
      headers: { Accept: ACCEPT, Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`NexHealth ${path} failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const body = (await res.json()) as { data?: unknown; count?: unknown }
  return {
    data: (body?.data ?? null) as T | null,
    count: typeof body?.count === 'number' ? body.count : null,
  }
}

/**
 * One WRITE against the API (POST/PATCH), with the same metering hook and
 * single re-mint retry as nexGet. Returns the envelope's data — callers
 * check for their entity. A non-2xx throws with the API's own error text
 * (NexHealth's write errors are readable sentences — "this time is no
 * longer available", "not configured for the requested slot" — and the
 * write-op log stores them verbatim for the audit trail).
 */
export async function nexWrite<T = unknown>(
  method: 'POST' | 'PATCH',
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  body: Record<string, unknown>,
  opts: NexRequestOpts = {},
): Promise<T | null> {
  const env = opts.env ?? 'production'
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v))
  const url = `${BASE_URL}/${path}?${qs.toString()}`

  const countCall = async () => {
    try {
      await opts.onCall?.()
    } catch (e) {
      console.error('[nexhealth] onCall hook failed (request proceeds):', e)
    }
  }
  const doFetch = async (token: string) =>
    fetch(url, {
      method,
      headers: {
        // Writes speak v3 (LIVE-verified 2026-08-11): under the legacy v2
        // Accept header, POST /patients IGNORES return_existing_if_match and
        // errors on a duplicate — the exact double-chart hazard the flag
        // exists to prevent. Reads stay on v2 (their shapes are what the
        // whole import pipeline is validated against).
        'Nex-Api-Version': 'v3.0.0',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

  let token = await bearer(env)
  await countCall()
  let res = await doFetch(token)
  if (res.status === 401) {
    token = await mintToken(env)
    await countCall()
    res = await doFetch(token)
  }
  const parsed = (await res.json().catch(() => null)) as
    | { code?: boolean; data?: unknown; error?: unknown }
    | null
  if (!res.ok || parsed?.code === false) {
    const apiError = Array.isArray(parsed?.error) ? parsed.error.join('; ') : String(parsed?.error ?? '')
    throw new Error(apiError || `NexHealth ${method} ${path} failed (${res.status})`)
  }
  return (parsed?.data ?? null) as T | null
}

/**
 * Paginate a collection endpoint to exhaustion. Some collections nest under
 * a key inside `data` (e.g. /patients → data.patients) while others return
 * `data` as the array — `unwrap` handles both: pass the nested key name and
 * the helper falls back to a bare array automatically.
 */
export async function nexGetAll<Row = Record<string, unknown>>(
  path: string,
  params: Record<string, string | number | undefined>,
  unwrapKey: string,
  opts: NexRequestOpts = {},
): Promise<Row[]> {
  const out: Row[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await nexGet<unknown>(path, { ...params, per_page: PAGE_SIZE, page }, opts)
    let rows: unknown[] = []
    if (Array.isArray(data)) rows = data
    else if (data && typeof data === 'object') {
      const nested = (data as Record<string, unknown>)[unwrapKey]
      if (Array.isArray(nested)) rows = nested
    }
    out.push(...(rows as Row[]))
    if (rows.length < PAGE_SIZE) break
  }
  return out
}

/* ── Typed row shapes (only the fields we read; defensive everywhere) ─────── */

export interface NexLocation {
  id: number
  name?: string
  institution_id?: number
  street_address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  phone_number?: string | null
  tz?: string | null
  last_sync_time?: string | null
  inactive?: boolean
}

export interface NexInstitution {
  id: number
  name?: string
  subdomain?: string
  emrs?: string[]
  locations?: NexLocation[]
}

export interface NexInsuranceCoverage {
  id: number
  patient_id?: number
  priority?: number | null
  subscriber_num?: string | null
  effective_date?: string | null
  expiration_date?: string | null
  plan?: {
    id?: number
    name?: string | null
    group_num?: string | null
    payer_id?: string | null
    deleted_at?: string | null
  } | null
}

export interface NexPatient {
  id: number
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  inactive?: boolean
  /** PMS-recorded financially-responsible party (usually a parent). */
  guarantor_id?: number | null
  /** The PMS-side "do not text" flag (Dentrix et al. sync it through). */
  unsubscribe_sms?: boolean
  preferred_language?: string | null
  preferred_locale?: string | null
  bio?: {
    gender?: string | null
    phone_number?: string | null
    verified_mobile?: string | null
    date_of_birth?: string | null
    address_line_1?: string | null
    city?: string | null
    state?: string | null
    zip_code?: string | null
  } | null
  balance?: { amount?: string | null; currency?: string | null } | null
  location_ids?: number[]
  /** Present when the request asked for include[]=insurance_coverages. */
  insurance_coverages?: NexInsuranceCoverage[]
}

export interface NexAppointment {
  id: number
  patient_id?: number
  provider_id?: number | null
  provider_name?: string | null
  start_time?: string | null
  end_time?: string | null
  confirmed?: boolean
  patient_confirmed?: boolean
  patient_missed?: boolean
  cancelled?: boolean
  checked_out?: boolean
  deleted?: boolean
  note?: string | null
  appointment_type_id?: number | null
  location_id?: number
}

export interface NexProvider {
  id: number
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  inactive?: boolean
  npi?: string | null
  /** e.g. "Dentist" — NexHealth's own coarse specialty label. */
  nexhealth_specialty?: string | null
}

export interface NexAppointmentType {
  id: number
  name?: string | null
  minutes?: number | null
  bookable_online?: boolean
}

export interface NexOperatory {
  id: number
  name?: string | null
  active?: boolean
  location_id?: number
}

/** The institutions visible to this key — includes each one's locations. */
export async function listInstitutions(opts: NexRequestOpts = {}): Promise<NexInstitution[]> {
  const { data } = await nexGet<NexInstitution[]>('institutions', {}, opts)
  return Array.isArray(data) ? data : []
}

export interface NexSlot {
  time?: string
  end_time?: string
  operatory_id?: number
}

/**
 * The practice's REAL bookable slots for one provider over a date range —
 * computed by NexHealth from provider availabilities + existing
 * appointments. The write path uses this as the pre-write validator: a
 * create only goes out into a slot THEIR engine says is open, and takes
 * the operatory from the matching slot.
 */
export async function listAppointmentSlots(
  subdomain: string,
  locationId: number,
  providerIds: number | number[],
  startDate: string, // YYYY-MM-DD
  days: number,
  opts: NexRequestOpts = {},
  /** Slot size in minutes — their engine returns overlap-aware slots of
   *  exactly this length (verified 2026-08-12), so a 30-minute visit never
   *  needs client-side consecutive-slot math. */
  slotLength?: number,
): Promise<NexSlot[]> {
  const pids = Array.isArray(providerIds) ? providerIds : [providerIds]
  if (pids.length === 0) return []
  const { data } = await nexGet<Array<{ lid?: number; pid?: number; slots?: NexSlot[] }>>(
    'appointment_slots',
    {
      subdomain,
      'lids[]': locationId,
      'pids[]': pids,
      start_date: startDate,
      days,
      ...(slotLength ? { slot_length: slotLength } : {}),
    },
    opts,
  )
  if (!Array.isArray(data)) return []
  return data.flatMap((d) => (Array.isArray(d.slots) ? d.slots : []))
}

/** A location's appointment types (name + minutes + bookable flag). Small,
 *  rarely-changing lookup — callers should cache (the adapter keeps a 24h
 *  in-memory cache so this costs ~1 metered call per day, not per sync). */
export async function listAppointmentTypes(
  subdomain: string,
  locationId: number,
  opts: NexRequestOpts = {},
): Promise<NexAppointmentType[]> {
  const { data } = await nexGet<NexAppointmentType[]>(
    'appointment_types',
    { subdomain, location_id: locationId, per_page: 200 },
    opts,
  )
  return Array.isArray(data) ? data : []
}

/** A location's operatories (physical chairs). Tiny list; fetched only when
 *  the clinic's chair count is still unknown. */
export async function listOperatories(
  subdomain: string,
  locationId: number,
  opts: NexRequestOpts = {},
): Promise<NexOperatory[]> {
  const { data } = await nexGet<NexOperatory[]>(
    'operatories',
    { subdomain, location_id: locationId, per_page: 200 },
    opts,
  )
  return Array.isArray(data) ? data : []
}

/** The locations of one institution (the /locations response nests them). */
export async function listLocations(
  subdomain: string,
  opts: NexRequestOpts = {},
): Promise<NexLocation[]> {
  const { data } = await nexGet<Array<{ locations?: NexLocation[] }>>(
    'locations',
    { subdomain },
    opts,
  )
  if (!Array.isArray(data)) return []
  return data.flatMap((inst) => (Array.isArray(inst.locations) ? inst.locations : []))
}
