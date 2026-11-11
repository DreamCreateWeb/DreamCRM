/**
 * Google Places API (New) client — prospect enrichment: website URL, rating,
 * review count, business status for a dental practice we know by name +
 * address (from NPPES).
 *
 * Key handling follows the lazy convention (lib/stripe.ts): nothing throws
 * at module eval so `next build` stays keyless. `placesConfigured()` lets
 * callers skip cleanly; `findDentalPlace` returns null on ANY error —
 * enrichment is best-effort by contract.
 *
 * Cost note: one searchText call with a tight field mask stays in the
 * cheaper SKU — never request more fields than the mask below.
 */

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText'
// displayName + formattedAddress ride along for MATCH VERIFICATION (the
// grader learned the hard way that searchText happily returns a
// similar-sounding practice three states away). Both are lower-tier fields
// than websiteUri/rating, which already put this call in the Advanced SKU —
// the mask addition changes what we can verify, not what we pay.
// nationalPhoneNumber (P-01) is the strongest match anchor there is — the
// registry's front-desk number against the listing's — and sits in the
// same Advanced SKU this call already pays for. `reviews` and
// `regularOpeningHours` (P-04) ride the SAME call for LIVENESS: Places
// returns up to five reviews with a publishTime, and a listing with no
// review in 18 months and no opening hours shows no sign of life — the
// owner wants numbers we can stand behind, so the dearer SKU is accepted
// (no second request is ever made for them).
const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.regularOpeningHours,places.reviews'
/** Candidates per search — one request whatever the count, so three costs
 *  what one did and lets the matcher pick the RIGHT listing. */
const CANDIDATE_COUNT = 3

export interface PlaceResult {
  placeId: string
  /** The listing's own name — what Google shows patients. */
  displayName: string | null
  /** Full formatted address — the match-verification anchor. */
  formattedAddress: string | null
  /** The listing's phone, digits only (10) — the other match anchor. */
  nationalPhoneNumber: string | null
  websiteUri: string | null
  /** 4.7 → 47 (tenths, integer — no float drift in the DB). */
  ratingTenths: number | null
  reviewCount: number | null
  businessStatus: string | null
  googleMapsUri: string | null
  /** Liveness (P-04): the newest review's publishTime (ISO), null when the
   *  listing carries no dated review. */
  latestReviewAt: string | null
  /** Liveness (P-04): the listing states regular opening hours. */
  hasOpeningHours: boolean
}

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim())
}

/** The newest `publishTime` across a listing's reviews — exported for tests. */
export function latestReviewTime(reviews: unknown): string | null {
  if (!Array.isArray(reviews)) return null
  let best: { iso: string; t: number } | null = null
  for (const r of reviews) {
    const v = r && typeof r === 'object' ? (r as { publishTime?: unknown }).publishTime : null
    if (typeof v !== 'string') continue
    const t = new Date(v).getTime()
    if (Number.isNaN(t)) continue
    if (!best || t > best.t) best = { iso: new Date(t).toISOString(), t }
  }
  return best?.iso ?? null
}

/** Does the listing state opening hours? (periods or weekday lines) */
export function statesOpeningHours(hours: unknown): boolean {
  if (!hours || typeof hours !== 'object') return false
  const h = hours as { periods?: unknown; weekdayDescriptions?: unknown }
  return (Array.isArray(h.periods) && h.periods.length > 0) || (Array.isArray(h.weekdayDescriptions) && h.weekdayDescriptions.length > 0)
}

/** Parse one raw place (exported for tests). */
export function normalizePlace(raw: unknown): PlaceResult | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const placeId = typeof p.id === 'string' && p.id ? p.id : null
  if (!placeId) return null
  const rating = typeof p.rating === 'number' && Number.isFinite(p.rating) ? p.rating : null
  const displayName = (() => {
    const d = p.displayName
    if (typeof d === 'string') return d || null
    if (d && typeof d === 'object' && typeof (d as { text?: unknown }).text === 'string') {
      return ((d as { text: string }).text || null)
    }
    return null
  })()
  return {
    placeId,
    displayName,
    formattedAddress:
      typeof p.formattedAddress === 'string' && p.formattedAddress ? p.formattedAddress : null,
    nationalPhoneNumber: normalizePlacePhone(p.nationalPhoneNumber),
    websiteUri: typeof p.websiteUri === 'string' && p.websiteUri ? p.websiteUri : null,
    ratingTenths: rating != null ? Math.round(rating * 10) : null,
    reviewCount:
      typeof p.userRatingCount === 'number' && Number.isFinite(p.userRatingCount)
        ? Math.round(p.userRatingCount)
        : null,
    businessStatus: typeof p.businessStatus === 'string' ? p.businessStatus : null,
    googleMapsUri: typeof p.googleMapsUri === 'string' ? p.googleMapsUri : null,
    latestReviewAt: latestReviewTime(p.reviews),
    hasOpeningHours: statesOpeningHours(p.regularOpeningHours),
  }
}

/** "(404) 555-1212" → "4045551212"; null when not a 10-digit US number. */
export function normalizePlacePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const digits = v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return digits.length === 10 ? digits : null
}

export type PlacesSearchOutcome =
  | { ok: true; places: PlaceResult[] }
  /** The key was refused (401/403) — a credentials problem, not a miss. */
  | { ok: false; error: 'auth' }
  | { ok: false; error: 'unavailable' }
  | { ok: false; error: 'not_configured' }

/**
 * Up to three candidate listings for a dental practice by name + address.
 * The caller matches them against the registry record (lib/prospect-match)
 * and takes only a real match. Never throws; an auth refusal is reported
 * distinctly so the engine can say "the key is wrong" once a day.
 */
export async function findDentalPlaceCandidates(input: {
  name: string
  addressLine1?: string | null
  city?: string | null
  state?: string | null
}): Promise<PlacesSearchOutcome> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!key) return { ok: false, error: 'not_configured' }
  const textQuery = [input.name, input.addressLine1, input.city, input.state]
    .filter(Boolean)
    .join(', ')
  try {
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
        'x-goog-fieldmask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery, includedType: 'dentist', maxResultCount: CANDIDATE_COUNT }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn('[google-places] searchText failed', res.status)
      return { ok: false, error: res.status === 401 || res.status === 403 ? 'auth' : 'unavailable' }
    }
    const body = (await res.json()) as { places?: unknown[] }
    const places: PlaceResult[] = []
    for (const raw of body.places ?? []) {
      const p = normalizePlace(raw)
      if (p) places.push(p)
    }
    return { ok: true, places }
  } catch (err) {
    console.warn('[google-places] lookup error', err instanceof Error ? err.message : err)
    return { ok: false, error: 'unavailable' }
  }
}

/**
 * Find a dental practice by name + address. Returns the top candidate or
 * null (not found / not configured / API error — callers treat all three
 * as "no Places data"). The grader's door; enrichment goes through
 * `findDentalPlaceCandidates` + the matcher instead.
 */
export async function findDentalPlace(input: {
  name: string
  addressLine1?: string | null
  city?: string | null
  state?: string | null
}): Promise<PlaceResult | null> {
  const r = await findDentalPlaceCandidates(input)
  return r.ok ? (r.places[0] ?? null) : null
}
