import { createHash } from 'crypto'
import { addressKey } from './prospect-fit'

/**
 * NPPES NPI Registry client — the free, official CMS directory of every US
 * healthcare provider. Prospecting's discovery source: organizational
 * dental providers (entity type 2 / NPI-2), searched state × zip prefix
 * because the API caps pagination at skip=1200 (limit 200 → max 1,400 rows
 * per distinct query).
 *
 * No API key, no auth. Defensive parsing throughout (the lib/zernio.ts
 * habit): NPPES payloads are loosely typed and occasionally sloppy — a
 * malformed record is skipped, never thrown.
 */

const NPPES_BASE = 'https://npiregistry.cms.hhs.gov/api/'

/** NPPES hard pagination cap: skip may not exceed 1200. */
export const NPPES_MAX_SKIP = 1200
export const NPPES_PAGE_SIZE = 200

export interface NppesOrgResult {
  npiNumber: string
  name: string
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  phone: string | null // digits only
  taxonomyCode: string | null
  authorizedOfficialName: string | null
  authorizedOfficialTitle: string | null
}

export interface NppesSearchPage {
  results: NppesOrgResult[]
  /** Raw rows NPPES returned (pre-filter) — drives "keep paging?" */
  resultCount: number
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Keep digits only; null when fewer than 10 (not a dialable US number). */
export function normalizePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return digits.length === 10 ? digits : null
}

/**
 * Dentist taxonomy family: 1223…X (General Practice 122300000X + every
 * dental specialty). Multi-specialty groups sometimes lead with another
 * code, so any 1223* taxonomy on the record qualifies.
 */
export function isDentalTaxonomy(code: unknown): boolean {
  return typeof code === 'string' && code.startsWith('1223')
}

/**
 * Second-pass dedupe key: multiple NPIs often share one front desk (each
 * associate dentist can hold an org NPI at the same address). One practice =
 * one prospect = one phone+address identity.
 */
export function prospectDedupeHash(
  phone: string | null,
  addressLine1: string | null,
  postalCode: string | null,
): string | null {
  const p = phone ?? ''
  const a = (addressLine1 ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const z = (postalCode ?? '').slice(0, 5)
  if (!p && !a) return null // nothing identifying — keep the NPI as identity
  return createHash('sha256').update(`${p}|${a}|${z}`).digest('hex')
}

/** Parse one raw NPPES result into our shape; null = skip (malformed/closed). */
export function normalizeNppesResult(raw: unknown): NppesOrgResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const npiNumber = str(r.number) ?? (typeof r.number === 'number' ? String(r.number) : null)
  if (!npiNumber) return null

  const basic = (r.basic ?? {}) as Record<string, unknown>
  // 'A' = active. Deactivated NPIs still appear in some queries — skip.
  if (str(basic.status) && basic.status !== 'A') return null

  const isIndividual = (r.enumeration_type ?? '') === 'NPI-1'
  // Individual (NPI-1) providers have first/last name, no organization_name.
  // The provider IS the practice ("Dr. Jane Roe") and their own official.
  let name: string | null
  let authorizedOfficialName: string | null
  let authorizedOfficialTitle: string | null
  if (isIndividual) {
    const first = titleCase(str(basic.first_name))
    const last = titleCase(str(basic.last_name))
    if (!first && !last) return null
    const full = [first, last].filter(Boolean).join(' ')
    const cred = str(basic.credential)?.replace(/\.$/, '')
    name = `Dr. ${full}${cred ? `, ${cred}` : ''}`
    authorizedOfficialName = full
    authorizedOfficialTitle = cred ?? 'DDS'
  } else {
    name = str(basic.organization_name)
    if (!name) return null
    const first = str(basic.authorized_official_first_name)
    const last = str(basic.authorized_official_last_name)
    authorizedOfficialName = first || last ? [first, last].filter(Boolean).join(' ') : null
    authorizedOfficialTitle = str(basic.authorized_official_title_or_position)
  }

  const addresses = Array.isArray(r.addresses) ? (r.addresses as Array<Record<string, unknown>>) : []
  const location =
    addresses.find((a) => a && a.address_purpose === 'LOCATION') ?? addresses[0] ?? {}

  const taxonomies = Array.isArray(r.taxonomies) ? (r.taxonomies as Array<Record<string, unknown>>) : []
  const dental = taxonomies.find((t) => isDentalTaxonomy(t?.code))
  if (!dental) return null // API filter is fuzzy-text; enforce the code family

  return {
    npiNumber,
    name,
    addressLine1: str(location.address_1),
    city: str(location.city),
    state: str(location.state),
    postalCode: str(location.postal_code)?.slice(0, 5) ?? null,
    phone: normalizePhone(location.telephone_number),
    taxonomyCode: str(dental.code),
    authorizedOfficialName,
    authorizedOfficialTitle,
  }
}

/** "JANE" / "jane" → "Jane"; multi-token safe. */
function titleCase(v: string | null): string | null {
  if (!v) return null
  return v
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ── NPI liveness (P-01) ─────────────────────────────────────────────────────

export interface NpiLookupResult {
  found: boolean
  /** 'active' | 'deactivated' — null when not found. */
  status: 'active' | 'deactivated' | null
  /** NPPES's own deactivation date (YYYY-MM-DD or MM/DD/YYYY as given). */
  deactivationDate: string | null
  /** Fit (P-04): an organization (NPI-2) or an individual (NPI-1). */
  enumerationType: 'NPI-1' | 'NPI-2' | null
  /** Fit (P-04): when the NPI was first enumerated — a practice enumerated
   *  inside 18 months is NEW (no website yet is normal). As given. */
  enumerationDate: string | null
  /** Fit (P-04): the organization's registered name — matched against the
   *  DSO list beside the practice name and the listing name. */
  organizationName: string | null
  /** The practice LOCATION as the registry has it today (`addressLine2`
   *  is the suite / floor line — the practice-size count keys on it). */
  location: {
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    state: string | null
    postalCode: string | null
    phone: string | null
  } | null
}

/** Parse one NPPES lookup body (`?number=`) — exported for tests. */
export function parseNpiLookup(body: unknown): NpiLookupResult {
  const none: NpiLookupResult = {
    found: false,
    status: null,
    deactivationDate: null,
    enumerationType: null,
    enumerationDate: null,
    organizationName: null,
    location: null,
  }
  if (!body || typeof body !== 'object') return none
  const results = (body as { results?: unknown }).results
  const raw = Array.isArray(results) ? results[0] : null
  if (!raw || typeof raw !== 'object') return none
  const r = raw as Record<string, unknown>
  const basic = (r.basic ?? {}) as Record<string, unknown>
  const statusWord = str(basic.status)
  const deactivationDate = str(basic.deactivation_date)
  const reactivationDate = str(basic.reactivation_date)
  // 'A' = active. A deactivated NPI reads 'D' (or carries a deactivation
  // date with no later reactivation).
  const deactivated =
    statusWord === 'D' || (Boolean(deactivationDate) && !reactivationDate && statusWord !== 'A')
  const addresses = Array.isArray(r.addresses) ? (r.addresses as Array<Record<string, unknown>>) : []
  const location = addresses.find((a) => a && a.address_purpose === 'LOCATION') ?? null
  const enumerationType = r.enumeration_type === 'NPI-1' ? 'NPI-1' : r.enumeration_type === 'NPI-2' ? 'NPI-2' : null
  return {
    found: true,
    status: deactivated ? 'deactivated' : 'active',
    deactivationDate: deactivated ? deactivationDate : null,
    enumerationType,
    enumerationDate: str(basic.enumeration_date),
    organizationName: str(basic.organization_name),
    location: location
      ? {
          addressLine1: str(location.address_1),
          addressLine2: str(location.address_2),
          city: str(location.city),
          state: str(location.state),
          postalCode: str(location.postal_code)?.slice(0, 5) ?? null,
          phone: normalizePhone(location.telephone_number),
        }
      : null,
  }
}

/**
 * Look one NPI up — free, keyless. Throws on network/HTTP failure so the
 * caller can tell "NPPES is down" from "this NPI is gone".
 */
export async function lookupNpi(npi: string): Promise<NpiLookupResult> {
  const params = new URLSearchParams({ version: '2.1', number: npi.replace(/\D/g, '') })
  const res = await fetch(`${NPPES_BASE}?${params}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`NPPES ${res.status}`)
  const body = (await res.json()) as Record<string, unknown>
  if (body?.Errors) throw new Error(`NPPES error: ${JSON.stringify(body.Errors).slice(0, 200)}`)
  return parseNpiLookup(body)
}

// ── Practice size (P-04) ─────────────────────────────────────────────────────

export interface DentistsAtAddress {
  /** Individual (NPI-1) dentists whose LOCATION street matches. */
  dentists: number
  /** Rows the registry returned for the ZIP (pre-filter). */
  scanned: number
  /** True when the ZIP page was full — more dentists may exist past it. */
  capped: boolean
}

/** An NPI-1 record's LOCATION lines, raw (the dental taxonomy and the
 *  active status are still `normalizeNppesResult`'s to judge). */
function locationLines(raw: unknown): { line1: string | null; line2: string | null } {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const addresses = Array.isArray(r.addresses) ? (r.addresses as Array<Record<string, unknown>>) : []
  const location = addresses.find((a) => a && a.address_purpose === 'LOCATION') ?? addresses[0] ?? {}
  return { line1: str(location.address_1), line2: str(location.address_2) }
}

/** The key the size count compares: street + suite (address_1 + address_2),
 *  normalized by THE address key with the suite KEPT — in a professional
 *  building the suite is what tells one practice from the next (fix pass,
 *  H.2). */
export function sizeAddressKey(line1: string | null | undefined, line2: string | null | undefined): string {
  return addressKey([line1, line2].filter(Boolean).join(' '), null, { keepSuite: true })
}

/** Count the NPI-1 dentists at one street + suite in a ZIP search body —
 *  exported for tests. A record without a LOCATION street never counts. */
export function countDentistsAt(body: unknown, addressLine1: string | null, addressLine2: string | null = null): DentistsAtAddress {
  const key = addressKey(addressLine1, null, { keepSuite: true }) ? sizeAddressKey(addressLine1, addressLine2) : ''
  const rawResults = body && typeof body === 'object' && Array.isArray((body as { results?: unknown }).results)
    ? ((body as { results: unknown[] }).results)
    : []
  let dentists = 0
  if (key) {
    for (const raw of rawResults) {
      const parsed = normalizeNppesResult(raw)
      if (!parsed || !parsed.addressLine1) continue
      const lines = locationLines(raw)
      if (sizeAddressKey(lines.line1, lines.line2) === key) dentists++
    }
  }
  const resultCount =
    body && typeof body === 'object' && typeof (body as { result_count?: unknown }).result_count === 'number'
      ? ((body as { result_count: number }).result_count)
      : rawResults.length
  return { dentists, scanned: resultCount, capped: resultCount >= NPPES_PAGE_SIZE }
}

/**
 * How many individual dentists the registry lists at one address — ONE
 * request (the ZIP's NPI-1 dentists, 200 a page, filtered by street here;
 * NPPES has no street search). Free, keyless; throws on network / HTTP
 * failure so the caller can keep the prior signal. Null when the address
 * has no ZIP to search by.
 */
export async function searchDentistsAtAddress(input: {
  addressLine1: string | null
  /** The suite / floor line, when the registry lookup gave it. */
  addressLine2?: string | null
  state: string | null
  postalCode: string | null
}): Promise<DentistsAtAddress | null> {
  const zip = (input.postalCode ?? '').replace(/\D/g, '').slice(0, 5)
  if (zip.length !== 5 || !input.addressLine1) return null
  const params = new URLSearchParams({
    version: '2.1',
    enumeration_type: 'NPI-1',
    taxonomy_description: 'Dentist',
    postal_code: zip,
    limit: String(NPPES_PAGE_SIZE),
    skip: '0',
  })
  if (input.state) params.set('state', input.state)
  const res = await fetch(`${NPPES_BASE}?${params}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`NPPES ${res.status}`)
  const body = (await res.json()) as Record<string, unknown>
  if (body?.Errors) throw new Error(`NPPES error: ${JSON.stringify(body.Errors).slice(0, 200)}`)
  return countDentistsAt(body, input.addressLine1, input.addressLine2 ?? null)
}

/**
 * One page of organizational dental providers for state + zip prefix.
 * `zipPrefix` may be 3 or 5 digits — NPPES supports trailing-* wildcards
 * after 2+ characters. Throws on network/HTTP failure (caller marks the
 * task errored and retries next run).
 */
export async function searchNppesOrgs(input: {
  state: string
  zipPrefix: string
  skip: number
  /** 'NPI-2' orgs (default) or 'NPI-1' individual solo dentists. */
  enumerationType?: 'NPI-2' | 'NPI-1'
}): Promise<NppesSearchPage> {
  const params = new URLSearchParams({
    version: '2.1',
    enumeration_type: input.enumerationType ?? 'NPI-2',
    taxonomy_description: 'Dentist',
    state: input.state,
    postal_code: input.zipPrefix.length >= 5 ? input.zipPrefix : `${input.zipPrefix}*`,
    limit: String(NPPES_PAGE_SIZE),
    skip: String(input.skip),
  })
  const res = await fetch(`${NPPES_BASE}?${params}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`NPPES ${res.status}`)
  const body = (await res.json()) as Record<string, unknown>
  if (body?.Errors) throw new Error(`NPPES error: ${JSON.stringify(body.Errors).slice(0, 200)}`)
  const rawResults = Array.isArray(body?.results) ? body.results : []
  const results: NppesOrgResult[] = []
  for (const raw of rawResults) {
    const parsed = normalizeNppesResult(raw)
    if (parsed) results.push(parsed)
  }
  const resultCount =
    typeof body?.result_count === 'number' ? body.result_count : rawResults.length
  return { results, resultCount }
}
