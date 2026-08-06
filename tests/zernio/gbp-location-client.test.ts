import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getGoogleBusinessLocation,
  listGoogleBusinessMedia,
  normalizeGbpTime,
  updateGoogleBusinessWebsiteUri,
} from '@/lib/zernio'

/**
 * Google Business location-details + media client wrappers. Mocks the fetch
 * boundary so we exercise the real client (path/params/defensive parsing)
 * without a live Zernio. Confirms the Google-enum-day → HH:MM mapping, the
 * storefront-address + phone + categories shapes, and the media URL extraction.
 */

function mockFetch(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return vi.fn(async (..._args: unknown[]) => ({
    ok,
    status,
    statusText,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  }))
}

beforeEach(() => {
  process.env.ZERNIO_API_KEY = 'sk_test_zernio'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ZERNIO_API_KEY
})

describe('normalizeGbpTime', () => {
  it('passes HH:MM 24-hour strings through', () => {
    expect(normalizeGbpTime('09:00')).toBe('09:00')
    expect(normalizeGbpTime('17:30')).toBe('17:30')
  })
  it('zero-pads short hour strings', () => {
    expect(normalizeGbpTime('9:00')).toBe('09:00')
  })
  it('parses compact HHMM strings', () => {
    expect(normalizeGbpTime('0800')).toBe('08:00')
    expect(normalizeGbpTime('1545')).toBe('15:45')
  })
  it('maps the "24:00" end-of-day marker to 23:59', () => {
    expect(normalizeGbpTime('24:00')).toBe('23:59')
    expect(normalizeGbpTime({ hours: 24, minutes: 0 })).toBe('23:59')
  })
  it('reads the older { hours, minutes } object schema', () => {
    expect(normalizeGbpTime({ hours: 8, minutes: 30 })).toBe('08:30')
    expect(normalizeGbpTime({ hours: 17 })).toBe('17:00')
  })
  it('returns null for unreadable / out-of-range / nullish', () => {
    expect(normalizeGbpTime('nope')).toBeNull()
    expect(normalizeGbpTime('25:00')).toBeNull()
    expect(normalizeGbpTime('')).toBeNull()
    expect(normalizeGbpTime(null)).toBeNull()
    expect(normalizeGbpTime(undefined)).toBeNull()
  })
})

describe('getGoogleBusinessLocation', () => {
  it('GETs the location-details path with accountId + maps the canonical GBP shape', async () => {
    const f = mockFetch({
      regularHours: {
        periods: [
          { openDay: 'MONDAY', openTime: '09:00', closeDay: 'MONDAY', closeTime: '17:00' },
          { openDay: 'FRIDAY', openTime: '09:00', closeDay: 'FRIDAY', closeTime: '15:00' },
        ],
      },
      storefrontAddress: {
        addressLines: ['500 Main St', 'Suite 200'],
        locality: 'Austin',
        administrativeArea: 'TX',
        postalCode: '78701',
        regionCode: 'US',
      },
      phoneNumbers: { primaryPhone: '(512) 555-0100' },
      categories: {
        primaryCategory: { displayName: 'Dentist' },
        additionalCategories: [{ displayName: 'Cosmetic dentist' }],
      },
    })
    vi.stubGlobal('fetch', f)
    const loc = await getGoogleBusinessLocation({ accountId: 'acct_1' })
    expect((f.mock.calls[0] as [string])[0]).toContain('/google-business/location-details?accountId=acct_1')
    expect(loc.periods).toEqual([
      { day: 'mon', open: '09:00', close: '17:00' },
      { day: 'fri', open: '09:00', close: '15:00' },
    ])
    expect(loc.addressLines).toEqual(['500 Main St', 'Suite 200'])
    expect(loc.city).toBe('Austin')
    expect(loc.state).toBe('TX')
    expect(loc.postalCode).toBe('78701')
    expect(loc.country).toBe('US')
    expect(loc.phone).toBe('(512) 555-0100')
    expect(loc.categories).toEqual(['Dentist', 'Cosmetic dentist'])
  })

  it('reaches through a { location: {...} } wrapper + reads the older { hours, minutes } time schema', async () => {
    const f = mockFetch({
      location: {
        regularHours: {
          periods: [{ openDay: 'TUESDAY', openTime: { hours: 8 }, closeDay: 'TUESDAY', closeTime: { hours: 16, minutes: 30 } }],
        },
        primaryPhone: '555-0001',
      },
    })
    vi.stubGlobal('fetch', f)
    const loc = await getGoogleBusinessLocation({ accountId: 'a' })
    expect(loc.periods).toEqual([{ day: 'tue', open: '08:00', close: '16:30' }])
    // Older schema surfaced phone at the top level — tolerated.
    expect(loc.phone).toBe('555-0001')
  })

  it('passes locationId through the query', async () => {
    const f = mockFetch({})
    vi.stubGlobal('fetch', f)
    await getGoogleBusinessLocation({ accountId: 'a', locationId: 'loc_9' })
    expect((f.mock.calls[0] as [string])[0]).toContain('locationId=loc_9')
  })

  it('tolerates a totally empty payload (every field optional)', async () => {
    vi.stubGlobal('fetch', mockFetch({}))
    const loc = await getGoogleBusinessLocation({ accountId: 'a' })
    expect(loc.periods).toEqual([])
    expect(loc.addressLines).toEqual([])
    expect(loc.phone).toBeNull()
    expect(loc.categories).toEqual([])
  })

  it('throws status + body on a non-2xx', async () => {
    vi.stubGlobal('fetch', mockFetch('boom', false, 500, 'Server Error'))
    await expect(getGoogleBusinessLocation({ accountId: 'a' })).rejects.toThrow(/500 Server Error/)
  })

  // The CURRENT response shape (OpenAPI v1.0.4): full location fields at the
  // TOP level, `location` holding only the derived summary block. The
  // listing-truth slice depends on this fork being read correctly — a
  // regression here silently drops hours/website (the pre-slice unwrap
  // would have returned the summary as the whole location).
  it('reads the summary-sibling shape: top-level fields + derived location block', async () => {
    const f = mockFetch({
      success: true,
      accountId: 'acct_1',
      locationId: '928',
      location: {
        name: 'Dream Dental',
        placeId: 'ChIJabc123',
        reviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJabc123',
        mapsUri: 'https://maps.google.com/maps?cid=42',
        isVerified: true,
      },
      title: 'Dream Dental',
      regularHours: {
        periods: [{ openDay: 'MONDAY', openTime: '09:00', closeDay: 'MONDAY', closeTime: '17:00' }],
      },
      websiteUri: 'https://old-wix-site.com/home',
      phoneNumbers: { primaryPhone: '(870) 555-0100' },
    })
    vi.stubGlobal('fetch', f)
    const loc = await getGoogleBusinessLocation({ accountId: 'acct_1' })
    // Top-level fields survive (NOT swallowed by the summary block):
    expect(loc.periods).toEqual([{ day: 'mon', open: '09:00', close: '17:00' }])
    expect(loc.phone).toBe('(870) 555-0100')
    expect(loc.websiteUri).toBe('https://old-wix-site.com/home')
    // Summary-block identity fields land:
    expect(loc.placeId).toBe('ChIJabc123')
    expect(loc.reviewUrl).toBe('https://search.google.com/local/writereview?placeid=ChIJabc123')
    expect(loc.mapsUri).toBe('https://maps.google.com/maps?cid=42')
    expect(loc.isVerified).toBe(true)
    expect(loc.title).toBe('Dream Dental')
  })

  it('an unverified summary block reads as isVerified false; absent reads null', async () => {
    vi.stubGlobal('fetch', mockFetch({ location: { name: 'New Office', isVerified: false } }))
    const unverified = await getGoogleBusinessLocation({ accountId: 'a' })
    expect(unverified.isVerified).toBe(false)
    vi.stubGlobal('fetch', mockFetch({ websiteUri: 'https://x.com' }))
    const unknown = await getGoogleBusinessLocation({ accountId: 'a' })
    expect(unknown.isVerified).toBeNull()
    expect(unknown.websiteUri).toBe('https://x.com')
  })

  it('a listing with no website reads websiteUri null (→ the "missing" verdict upstream)', async () => {
    vi.stubGlobal('fetch', mockFetch({ title: 'No Site DDS' }))
    const loc = await getGoogleBusinessLocation({ accountId: 'a' })
    expect(loc.websiteUri).toBeNull()
  })
})

describe('updateGoogleBusinessWebsiteUri', () => {
  it('PUTs the account-scoped spec path with updateMask=websiteUri', async () => {
    const f = mockFetch({ success: true })
    vi.stubGlobal('fetch', f)
    await updateGoogleBusinessWebsiteUri({
      accountId: 'acct_1',
      websiteUri: 'https://mammoth-spring.dreamcreatestudio.com?utm_source=google',
    })
    const [url, init] = f.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/accounts/acct_1/gmb-location-details')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body as string)
    expect(body.updateMask).toBe('websiteUri')
    expect(body.websiteUri).toBe('https://mammoth-spring.dreamcreatestudio.com?utm_source=google')
  })

  it('passes locationId through the query + throws on a non-2xx', async () => {
    const f = mockFetch({ success: true })
    vi.stubGlobal('fetch', f)
    await updateGoogleBusinessWebsiteUri({ accountId: 'a', locationId: 'loc_9', websiteUri: 'https://x.com' })
    expect((f.mock.calls[0] as [string])[0]).toContain('locationId=loc_9')

    vi.stubGlobal('fetch', mockFetch('denied', false, 403, 'Forbidden'))
    await expect(
      updateGoogleBusinessWebsiteUri({ accountId: 'a', websiteUri: 'https://x.com' }),
    ).rejects.toThrow(/403 Forbidden/)
  })
})

describe('listGoogleBusinessMedia', () => {
  it('GETs the media path + extracts photo URLs (googleUrl preferred), skipping videos', async () => {
    const f = mockFetch({
      mediaItems: [
        { mediaFormat: 'PHOTO', googleUrl: 'https://g/1.jpg', sourceUrl: 'https://s/1.jpg', locationAssociation: { category: 'EXTERIOR' } },
        { mediaFormat: 'PHOTO', sourceUrl: 'https://s/2.jpg' },
        { mediaFormat: 'VIDEO', googleUrl: 'https://g/clip.mp4' },
      ],
    })
    vi.stubGlobal('fetch', f)
    const photos = await listGoogleBusinessMedia({ accountId: 'acct_1' })
    expect((f.mock.calls[0] as [string])[0]).toContain('/google-business/media?accountId=acct_1')
    expect(photos).toEqual([
      { url: 'https://g/1.jpg', sourceUrl: 'https://s/1.jpg', category: 'EXTERIOR' },
      { url: 'https://s/2.jpg', sourceUrl: null, category: null },
    ])
  })

  it('reads a bare array response + falls back to sourceUrl / thumbnailUrl', async () => {
    const f = mockFetch([
      { thumbnailUrl: 'https://t/thumb.jpg' },
      { googleUrl: '   ' }, // blank → dropped
    ])
    vi.stubGlobal('fetch', f)
    const photos = await listGoogleBusinessMedia({ accountId: 'a' })
    expect(photos).toEqual([{ url: 'https://t/thumb.jpg', sourceUrl: null, category: null }])
  })

  it('throws on a non-2xx', async () => {
    vi.stubGlobal('fetch', mockFetch('nope', false, 403, 'Forbidden'))
    await expect(listGoogleBusinessMedia({ accountId: 'a' })).rejects.toThrow(/403 Forbidden/)
  })
})
