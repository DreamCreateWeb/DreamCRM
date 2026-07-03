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
const FIELD_MASK =
  'places.id,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri'

export interface PlaceResult {
  placeId: string
  websiteUri: string | null
  /** 4.7 → 47 (tenths, integer — no float drift in the DB). */
  ratingTenths: number | null
  reviewCount: number | null
  businessStatus: string | null
  googleMapsUri: string | null
}

export function placesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim())
}

/** Parse one raw place (exported for tests). */
export function normalizePlace(raw: unknown): PlaceResult | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const placeId = typeof p.id === 'string' && p.id ? p.id : null
  if (!placeId) return null
  const rating = typeof p.rating === 'number' && Number.isFinite(p.rating) ? p.rating : null
  return {
    placeId,
    websiteUri: typeof p.websiteUri === 'string' && p.websiteUri ? p.websiteUri : null,
    ratingTenths: rating != null ? Math.round(rating * 10) : null,
    reviewCount:
      typeof p.userRatingCount === 'number' && Number.isFinite(p.userRatingCount)
        ? Math.round(p.userRatingCount)
        : null,
    businessStatus: typeof p.businessStatus === 'string' ? p.businessStatus : null,
    googleMapsUri: typeof p.googleMapsUri === 'string' ? p.googleMapsUri : null,
  }
}

/**
 * Find a dental practice by name + address. Returns the top match or null
 * (not found / not configured / API error — callers treat all three as
 * "no Places data", recorded distinctly by the caller's budget metering).
 */
export async function findDentalPlace(input: {
  name: string
  addressLine1?: string | null
  city?: string | null
  state?: string | null
}): Promise<PlaceResult | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim()
  if (!key) return null
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
      body: JSON.stringify({ textQuery, includedType: 'dentist', maxResultCount: 1 }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn('[google-places] searchText failed', res.status)
      return null
    }
    const body = (await res.json()) as { places?: unknown[] }
    return normalizePlace(body.places?.[0])
  } catch (err) {
    console.warn('[google-places] lookup error', err instanceof Error ? err.message : err)
    return null
  }
}
