import { describe, it, expect } from 'vitest'
import { extractPlaceIdFromUri } from '@/lib/zernio'

/**
 * extractPlaceIdFromUri — pulls a Google Place ID out of a "write a review" /
 * maps URI so a clinic's Google review link can auto-fill from the GBP sync.
 * Pure; the surrounding gbp-sync autofill (write only when empty, never
 * overwrite) is covered by manual/integration checks.
 */
describe('extractPlaceIdFromUri', () => {
  it('pulls the id out of a writereview URL', () => {
    expect(
      extractPlaceIdFromUri('https://search.google.com/local/writereview?placeid=ChIJabc123'),
    ).toBe('ChIJabc123')
  })

  it('handles placeid as a non-first query param', () => {
    expect(
      extractPlaceIdFromUri('https://maps.google.com/?q=x&placeid=ChIJxyz&hl=en'),
    ).toBe('ChIJxyz')
  })

  it('is case-insensitive on the param name', () => {
    expect(extractPlaceIdFromUri('https://x/?PlaceId=ChIJcase')).toBe('ChIJcase')
  })

  it('URL-decodes the value', () => {
    expect(extractPlaceIdFromUri('https://x/?placeid=ChIJ%2Babc')).toBe('ChIJ+abc')
  })

  it('returns null when there is no placeid, empty, or non-string', () => {
    expect(extractPlaceIdFromUri('https://maps.google.com/maps?cid=12345')).toBeNull()
    expect(extractPlaceIdFromUri('')).toBeNull()
    expect(extractPlaceIdFromUri(null)).toBeNull()
    expect(extractPlaceIdFromUri(undefined)).toBeNull()
  })
})
