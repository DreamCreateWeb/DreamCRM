import { describe, expect, it } from 'vitest'
import {
  AD_CLICK_ID_MAX_LEN,
  ATTRIBUTION_FIELD_MAX_LEN,
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABELS,
  adClickIdFor,
  buildAttributionTouch,
  buildPoweredByUrl,
  campaignKeyOf,
  classifyChannel,
  isTaggedTouch,
  normalizeLandingPath,
  parseAttributionCookie,
  parseSignupAttribution,
  readAdClickId,
  referrerHostOf,
  serializeAttributionCookie,
} from '@/lib/marketing-attribution'

describe('classifyChannel', () => {
  it('classifies the powered-by marker ahead of everything else', () => {
    expect(
      classifyChannel({ utmSource: 'powered_by', utmMedium: 'referral', referrerHost: 'smiles.example.com' }),
    ).toBe('powered_by')
    // Even a weird combination with a paid medium keeps the explicit marker.
    expect(classifyChannel({ utmSource: 'powered_by', utmMedium: 'cpc' })).toBe('powered_by')
  })

  it('classifies paid clicks by click id even with no UTM', () => {
    expect(classifyChannel({ gclid: true })).toBe('google_ads')
    expect(classifyChannel({ fbclid: true })).toBe('meta_ads')
  })

  it('classifies paid UTM intent', () => {
    expect(classifyChannel({ utmSource: 'google', utmMedium: 'cpc' })).toBe('google_ads')
    expect(classifyChannel({ utmSource: 'facebook', utmMedium: 'paid_social' })).toBe('meta_ads')
  })

  it('classifies AI-assistant referrers as their own channel', () => {
    expect(classifyChannel({ referrerHost: 'chatgpt.com' })).toBe('ai_assistant')
    expect(classifyChannel({ referrerHost: 'www.perplexity.ai' })).toBe('ai_assistant')
    expect(classifyChannel({ referrerHost: 'gemini.google.com' })).toBe('ai_assistant')
  })

  it('classifies search / social / referral / direct referrers', () => {
    expect(classifyChannel({ referrerHost: 'www.google.com' })).toBe('organic_search')
    expect(classifyChannel({ referrerHost: 'google.co.uk' })).toBe('organic_search')
    expect(classifyChannel({ referrerHost: 'www.facebook.com' })).toBe('social')
    expect(classifyChannel({ referrerHost: 'dentaltown.com' })).toBe('referral')
    expect(classifyChannel({})).toBe('direct')
  })

  it('AI hosts beat the search-host substring match', () => {
    // gemini.google.com contains 'google.' — the AI classification must win.
    expect(classifyChannel({ referrerHost: 'gemini.google.com' })).toBe('ai_assistant')
  })

  it('treats a self-referral (internal navigation) as direct', () => {
    expect(
      classifyChannel({ referrerHost: 'www.dreamcreatestudio.com', selfHost: 'www.dreamcreatestudio.com' }),
    ).toBe('direct')
  })

  it('keeps an unrecognized-but-tagged touch visible as referral, not direct', () => {
    expect(classifyChannel({ utmSource: 'dental-nachos-sponsor' })).toBe('referral')
    expect(classifyChannel({ utmMedium: 'qr' })).toBe('referral')
  })

  it('classifies email intent', () => {
    expect(classifyChannel({ utmMedium: 'email' })).toBe('email')
    expect(classifyChannel({ utmSource: 'newsletter' })).toBe('email')
  })

  it('every registered channel has a label', () => {
    for (const c of MARKETING_CHANNELS) expect(MARKETING_CHANNEL_LABELS[c]).toBeTruthy()
  })
})

describe('referrerHostOf', () => {
  it('extracts just the hostname', () => {
    expect(referrerHostOf('https://www.google.com/search?q=dental+software')).toBe('www.google.com')
  })
  it('degrades junk to null', () => {
    expect(referrerHostOf('not a url')).toBeNull()
    expect(referrerHostOf('')).toBeNull()
    expect(referrerHostOf(null)).toBeNull()
  })
})

describe('normalizeLandingPath', () => {
  it('strips query and fragment, collapses slashes, trims trailing slash', () => {
    expect(normalizeLandingPath('/pricing?utm_source=x#faq')).toBe('/pricing')
    expect(normalizeLandingPath('/compare//weave/')).toBe('/compare/weave')
    expect(normalizeLandingPath('')).toBe('/')
    expect(normalizeLandingPath(undefined)).toBe('/')
  })
})

describe('buildAttributionTouch', () => {
  it('captures UTMs, referrer host, landing, channel and instant', () => {
    const now = new Date('2026-08-26T12:00:00Z')
    const touch = buildAttributionTouch({
      path: '/pricing',
      search: '?utm_source=google&utm_medium=cpc&utm_campaign=competitor-weave&gclid=abc',
      referrer: 'https://www.google.com/',
      now,
    })
    expect(touch.channel).toBe('google_ads')
    expect(touch.landing).toBe('/pricing')
    expect(touch.referrerHost).toBe('www.google.com')
    expect(touch.utmCampaign).toBe('competitor-weave')
    expect(touch.firstSeenAt).toBe(now.toISOString())
  })

  it('caps hostile param lengths', () => {
    const touch = buildAttributionTouch({
      path: '/',
      search: `?utm_source=${'x'.repeat(5000)}`,
      referrer: null,
    })
    expect(touch.utmSource?.length).toBe(ATTRIBUTION_FIELD_MAX_LEN)
  })
})

describe('the attribution cookie', () => {
  const firstTouch = buildAttributionTouch({
    path: '/compare/weave',
    search: '?utm_source=powered_by&utm_medium=referral&utm_campaign=acme-dental',
    referrer: 'https://acme-dental.dreamcreatestudio.com/',
    now: new Date('2026-08-26T12:00:00Z'),
  })
  const lastTouch = buildAttributionTouch({
    path: '/pricing',
    search: '?gclid=abc',
    referrer: 'https://www.google.com/',
    now: new Date('2026-08-27T09:00:00Z'),
  })

  it('round-trips a first-only memory', () => {
    const parsed = parseAttributionCookie(serializeAttributionCookie({ first: firstTouch, last: null }))
    expect(parsed).toEqual({ first: firstTouch, last: null })
  })

  it('round-trips a two-touch memory (slice 1b)', () => {
    const parsed = parseAttributionCookie(
      serializeAttributionCookie({ first: firstTouch, last: lastTouch }),
    )
    expect(parsed?.first).toEqual(firstTouch)
    expect(parsed?.last).toEqual(lastTouch)
  })

  it('still parses a v1 cookie (pre-1b memories survive the upgrade)', () => {
    const v1 = encodeURIComponent(
      JSON.stringify({
        v: 1,
        c: 'google_ads',
        l: '/pricing',
        r: 'www.google.com',
        s: 'google',
        m: 'cpc',
        g: 'competitor-weave',
        t: '2026-08-20T10:00:00.000Z',
      }),
    )
    const parsed = parseAttributionCookie(v1)
    expect(parsed?.first.channel).toBe('google_ads')
    expect(parsed?.first.utmCampaign).toBe('competitor-weave')
    expect(parsed?.last).toBeNull()
  })

  it('a malformed last half degrades to null without costing the first touch', () => {
    const raw = encodeURIComponent(
      JSON.stringify({
        v: 2,
        f: { c: 'direct', l: '/', r: null, s: null, m: null, g: null, t: '2026-08-20T10:00:00Z' },
        z: { c: 'not_a_channel', t: 'junk' },
      }),
    )
    const parsed = parseAttributionCookie(raw)
    expect(parsed?.first.channel).toBe('direct')
    expect(parsed?.last).toBeNull()
  })

  it('rejects tampered payloads rather than storing them', () => {
    expect(parseAttributionCookie('garbage')).toBeNull()
    expect(parseAttributionCookie(encodeURIComponent(JSON.stringify({ v: 1, c: 'not_a_channel', t: '2026-01-01' })))).toBeNull()
    expect(parseAttributionCookie(encodeURIComponent(JSON.stringify({ v: 2 })))).toBeNull()
    expect(parseAttributionCookie(encodeURIComponent(JSON.stringify({ v: 1, c: 'direct', t: 'not-a-date' })))).toBeNull()
    expect(parseAttributionCookie(encodeURIComponent(JSON.stringify({ v: 3, f: {} })))).toBeNull()
    expect(parseAttributionCookie(null)).toBeNull()
  })
})

describe('campaignKeyOf (the rollup campaign key)', () => {
  it('normalizes to a bounded slug', () => {
    expect(campaignKeyOf('Competitor-Weave')).toBe('competitor-weave')
    expect(campaignKeyOf('  Fall Promo 2026! ')).toBe('fall-promo-2026')
    expect(campaignKeyOf(null)).toBe('')
    expect(campaignKeyOf('')).toBe('')
    expect(campaignKeyOf('<script>x</script>')).toBe('script-x-script')
    expect(campaignKeyOf('x'.repeat(500)).length).toBe(80)
  })
})

describe('isTaggedTouch', () => {
  it('only a bare direct visit is untagged', () => {
    expect(isTaggedTouch(buildAttributionTouch({ path: '/', search: '', referrer: null }))).toBe(false)
    expect(isTaggedTouch(buildAttributionTouch({ path: '/', search: '?gclid=1', referrer: null }))).toBe(true)
    expect(
      isTaggedTouch(buildAttributionTouch({ path: '/', search: '', referrer: 'https://chatgpt.com/' })),
    ).toBe(true)
  })
})

describe('parseSignupAttribution', () => {
  it('validates a stored stamp', () => {
    const stamp = parseSignupAttribution({
      channel: 'powered_by',
      landing: '/',
      referrerHost: 'acme.dreamcreatestudio.com',
      utmSource: 'powered_by',
      utmMedium: 'referral',
      utmCampaign: 'acme-dental',
      firstSeenAt: '2026-08-20T10:00:00.000Z',
      signedUpAt: '2026-08-26T12:00:00.000Z',
    })
    expect(stamp?.channel).toBe('powered_by')
    expect(stamp?.signedUpAt).toBe('2026-08-26T12:00:00.000Z')
  })
  it('reads a nested last touch, and degrades a malformed one to null', () => {
    const base = {
      channel: 'organic_search',
      landing: '/',
      firstSeenAt: '2026-08-01T10:00:00.000Z',
      signedUpAt: '2026-08-26T12:00:00.000Z',
    }
    const good = parseSignupAttribution({
      ...base,
      last: { channel: 'google_ads', landing: '/pricing', utmCampaign: 'competitor-weave', firstSeenAt: '2026-08-20T09:00:00.000Z' },
    })
    expect(good?.last?.channel).toBe('google_ads')
    expect(good?.last?.utmCampaign).toBe('competitor-weave')
    const bad = parseSignupAttribution({ ...base, last: { channel: 'nope' } })
    expect(bad?.channel).toBe('organic_search')
    expect(bad?.last).toBeNull()
  })
  it('degrades malformed rows to null, never a poisoned stamp', () => {
    expect(parseSignupAttribution(null)).toBeNull()
    expect(parseSignupAttribution({ channel: 'nope', firstSeenAt: 'x', signedUpAt: 'y' })).toBeNull()
    expect(parseSignupAttribution({ channel: 'direct', firstSeenAt: '2026-01-01T00:00:00Z' })).toBeNull()
  })
})

describe('buildPoweredByUrl', () => {
  it('tags the marketing home with the loop marker', () => {
    expect(buildPoweredByUrl('https://www.dreamcreatestudio.com/', 'acme-dental')).toBe(
      'https://www.dreamcreatestudio.com/?utm_source=powered_by&utm_medium=referral&utm_campaign=acme-dental',
    )
  })
  it('the tagged URL classifies back to powered_by', () => {
    const url = new URL(buildPoweredByUrl('https://www.dreamcreatestudio.com', 'acme-dental'))
    const touch = buildAttributionTouch({ path: url.pathname, search: url.search, referrer: null })
    expect(touch.channel).toBe('powered_by')
    expect(touch.utmCampaign).toBe('acme-dental')
  })
})

/**
 * THE AD CLICK, KEPT WHOLE (2026-11-23).
 *
 * The sensor recorded only THAT a click id was present. That names the channel
 * and stops there: telling an ad platform which click became a trial or a
 * paying practice takes the id's VALUE, and telling which SEARCH produced it
 * takes the keyword. Without either, a campaign can be judged as a whole and
 * never improved — every keyword looks the same.
 *
 * A real Google click id, for the cases below: mixed case, digits, `-`, `_`.
 */
const GCLID = 'Cj0KCQiA-aK8BhCDARIsAL_-H9mXg3wTzQ4nVbR7yKp0s2dLhE_wcB'
const MSCLKID = '0f3a9c2b7d1e4a6f8b5c0d2e4f6a8b1c'

describe('the click id', () => {
  it('keeps the value exactly — case included, because the ids are case-sensitive', () => {
    const touch = buildAttributionTouch({ path: '/compare/weave', search: `?gclid=${GCLID}`, referrer: null })
    expect(touch.clickId).toEqual({ kind: 'gclid', value: GCLID })
    // The UTM cleaner lowercases; a click id that went through it matches no click.
    expect(touch.clickId?.value).not.toBe(GCLID.toLowerCase())
  })

  it('reads Google’s iOS ids and Microsoft’s, each under its own kind', () => {
    expect(buildAttributionTouch({ path: '/', search: '?gbraid=0AAAAAD_abc-123', referrer: null }).clickId).toEqual({
      kind: 'gbraid',
      value: '0AAAAAD_abc-123',
    })
    expect(buildAttributionTouch({ path: '/', search: '?wbraid=CjwKCAjw_xyz', referrer: null }).clickId?.kind).toBe('wbraid')
    expect(buildAttributionTouch({ path: '/', search: `?msclkid=${MSCLKID}`, referrer: null }).clickId).toEqual({
      kind: 'msclkid',
      value: MSCLKID,
    })
  })

  it('REJECTS an over-long or malformed id rather than storing a clipped one', () => {
    // One character over the cap: a truncated id would look like data and match nothing.
    expect(readAdClickId('gclid', 'a'.repeat(AD_CLICK_ID_MAX_LEN + 1))).toBeNull()
    expect(readAdClickId('gclid', 'a'.repeat(AD_CLICK_ID_MAX_LEN))?.value.length).toBe(AD_CLICK_ID_MAX_LEN)
    // Anything outside the URL-unreserved set is not a click id.
    for (const hostile of ['abc def', 'abc"def', '<script>', 'abc;def', 'abc\ndef', '']) {
      expect(readAdClickId('gclid', hostile), JSON.stringify(hostile)).toBeNull()
    }
    // And only the kinds in the registry.
    expect(readAdClickId('fbclid', 'IwAR0abc')).toBeNull()
    expect(readAdClickId(undefined, GCLID)).toBeNull()
    expect(readAdClickId('gclid', 42)).toBeNull()
  })

  it('still CLASSIFIES a touch whose id it could not keep — a malformed gclid is still an ad click', () => {
    const touch = buildAttributionTouch({ path: '/', search: '?gclid=not%20a%20real%20id', referrer: null })
    expect(touch.channel).toBe('google_ads')
    expect(touch.clickId).toBeNull()
  })

  it('leaves every other touch with no click id and no keyword', () => {
    const touch = buildAttributionTouch({ path: '/pricing', search: '', referrer: 'https://www.google.com/' })
    expect(touch.clickId).toBeNull()
    expect(touch.utmTerm).toBeNull()
  })
})

describe('the keyword', () => {
  it('captures utm_term — the search the ad answered', () => {
    const touch = buildAttributionTouch({
      path: '/compare/weave',
      search: `?utm_source=google&utm_medium=cpc&utm_campaign=competitor-exact&utm_term=Weave%20Alternative&gclid=${GCLID}`,
      referrer: null,
    })
    expect(touch.utmTerm).toBe('weave alternative')
    expect(touch.utmCampaign).toBe('competitor-exact')
  })

  it('caps a hostile keyword like every other captured param', () => {
    const touch = buildAttributionTouch({ path: '/', search: `?utm_term=${'k'.repeat(5000)}`, referrer: null })
    expect(touch.utmTerm?.length).toBe(ATTRIBUTION_FIELD_MAX_LEN)
  })
})

describe('Microsoft Ads is its own channel', () => {
  it('classifies by Microsoft’s click id, and by paid Bing intent', () => {
    expect(classifyChannel({ msclkid: true })).toBe('microsoft_ads')
    expect(classifyChannel({ utmSource: 'bing', utmMedium: 'cpc' })).toBe('microsoft_ads')
    expect(classifyChannel({ utmSource: 'microsoft', utmMedium: 'cpc' })).toBe('microsoft_ads')
  })

  it('believes the click id over a leftover UTM — a campaign IMPORTED from Google keeps utm_source=google', () => {
    // The case that matters on the day a second platform is switched on: the
    // imported campaign's URL suffix still says google, and the click is Bing's.
    const touch = buildAttributionTouch({
      path: '/compare/weave',
      search: `?utm_source=google&utm_medium=cpc&utm_campaign=competitor-exact&msclkid=${MSCLKID}`,
      referrer: 'https://www.bing.com/',
    })
    expect(touch.channel).toBe('microsoft_ads')
    expect(touch.clickId?.kind).toBe('msclkid')
  })

  it('files Google’s iOS click ids under Google Ads, not organic search', () => {
    // A `gbraid` click arrives with a google.com referrer and no gclid — the
    // old sensor read that as organic.
    expect(buildAttributionTouch({ path: '/', search: '?gbraid=0AAAAAD_abc', referrer: 'https://www.google.com/' }).channel).toBe('google_ads')
    expect(buildAttributionTouch({ path: '/', search: '?wbraid=CjwKCAjw_xyz', referrer: 'https://www.google.com/' }).channel).toBe('google_ads')
  })

  it('leaves paid Google intent with Google', () => {
    expect(classifyChannel({ utmSource: 'google', utmMedium: 'cpc' })).toBe('google_ads')
    expect(classifyChannel({ utmMedium: 'cpc' })).toBe('google_ads')
  })
})

describe('the cookie carries them — and costs nothing when there is nothing to carry', () => {
  const adClick = buildAttributionTouch({
    path: '/compare/weave',
    search: `?utm_source=google&utm_medium=cpc&utm_campaign=competitor-exact&utm_term=weave%20pricing&gclid=${GCLID}`,
    referrer: null,
    now: new Date('2026-11-23T15:00:00Z'),
  })
  const plain = buildAttributionTouch({
    path: '/pricing',
    search: '',
    referrer: 'https://www.google.com/',
    now: new Date('2026-11-20T15:00:00Z'),
  })

  it('round-trips the click id and the keyword through the cookie, in either half', () => {
    const asFirst = parseAttributionCookie(serializeAttributionCookie({ first: adClick, last: null }))
    expect(asFirst?.first.clickId).toEqual({ kind: 'gclid', value: GCLID })
    expect(asFirst?.first.utmTerm).toBe('weave pricing')
    const asLast = parseAttributionCookie(serializeAttributionCookie({ first: plain, last: adClick }))
    expect(asLast?.first).toEqual(plain)
    expect(asLast?.last).toEqual(adClick)
  })

  it('writes no extra keys for a touch that has neither', () => {
    const payload = JSON.parse(decodeURIComponent(serializeAttributionCookie({ first: plain, last: null })))
    expect(Object.keys(payload.f).sort()).toEqual(['c', 'g', 'l', 'm', 'r', 's', 't'])
  })

  it('still parses a cookie written before these fields existed — 90-day memories survive the upgrade', () => {
    // Exactly the v2 shape the previous build wrote: no k / i / x keys at all.
    const legacy = encodeURIComponent(
      JSON.stringify({
        v: 2,
        f: { c: 'google_ads', l: '/compare/weave', r: null, s: 'google', m: 'cpc', g: 'competitor-weave', t: '2026-10-01T12:00:00.000Z' },
        z: null,
      }),
    )
    const parsed = parseAttributionCookie(legacy)
    expect(parsed?.first.channel).toBe('google_ads')
    expect(parsed?.first.utmCampaign).toBe('competitor-weave')
    expect(parsed?.first.clickId).toBeNull()
    expect(parsed?.first.utmTerm).toBeNull()
  })

  it('treats the cookie’s click id as client input — a tampered one is dropped, the touch survives', () => {
    const tampered = encodeURIComponent(
      JSON.stringify({
        v: 2,
        f: { c: 'google_ads', l: '/', r: null, s: null, m: null, g: null, t: '2026-11-23T12:00:00.000Z', i: 'gclid', x: '"><script>alert(1)</script>' },
        z: null,
      }),
    )
    const parsed = parseAttributionCookie(tampered)
    expect(parsed?.first.channel).toBe('google_ads')
    expect(parsed?.first.clickId).toBeNull()
    // An id under a kind that is not in the registry is not an id either.
    const wrongKind = encodeURIComponent(
      JSON.stringify({ v: 2, f: { c: 'meta_ads', l: '/', r: null, s: null, m: null, g: null, t: '2026-11-23T12:00:00.000Z', i: 'fbclid', x: 'IwAR0abc' }, z: null }),
    )
    expect(parseAttributionCookie(wrongKind)?.first.clickId).toBeNull()
  })
})

describe('the signup stamp keeps them, and answers "which click do I report?"', () => {
  const base = { landing: '/', referrerHost: null, utmSource: null, utmMedium: null, utmCampaign: null, firstSeenAt: '2026-11-01T12:00:00.000Z' }

  it('reads the click id and keyword back from stored jsonb, top level and nested last', () => {
    const stamp = parseSignupAttribution({
      ...base,
      channel: 'organic_search',
      signedUpAt: '2026-11-23T16:00:00.000Z',
      last: { ...base, channel: 'google_ads', utmTerm: 'weave pricing', clickId: { kind: 'gclid', value: GCLID }, firstSeenAt: '2026-11-23T15:00:00.000Z' },
    })
    expect(stamp?.clickId).toBeNull()
    expect(stamp?.last?.clickId).toEqual({ kind: 'gclid', value: GCLID })
    expect(stamp?.last?.utmTerm).toBe('weave pricing')
  })

  it('degrades a malformed stored click id to null without costing the stamp', () => {
    const stamp = parseSignupAttribution({ ...base, channel: 'google_ads', signedUpAt: '2026-11-23T16:00:00.000Z', clickId: { kind: 'gclid', value: 'has spaces' } })
    expect(stamp?.channel).toBe('google_ads')
    expect(stamp?.clickId).toBeNull()
  })

  it('reports the MOST RECENT click from the platform being told', () => {
    const older = { kind: 'gclid' as const, value: 'OLDER_click-1' }
    const newer = { kind: 'gclid' as const, value: 'NEWER_click-2' }
    const first = { ...base, channel: 'google_ads' as const, utmTerm: null, clickId: older }
    const last = { ...base, channel: 'google_ads' as const, utmTerm: null, clickId: newer }
    expect(adClickIdFor({ clickId: older, last }, 'google')).toEqual(newer)
    // A later touch that is NOT that platform's does not hide the earlier one that was.
    const email = { ...base, channel: 'email' as const, utmTerm: null, clickId: null }
    expect(adClickIdFor({ clickId: older, last: email }, 'google')).toEqual(older)
    expect(first.clickId).toBe(older)
  })

  it('never hands one platform another platform’s id', () => {
    const bing = { kind: 'msclkid' as const, value: MSCLKID }
    const google = { kind: 'gbraid' as const, value: '0AAAAAD_abc' }
    const last = { ...base, channel: 'microsoft_ads' as const, utmTerm: null, clickId: bing }
    // First touch Google, last touch Microsoft: each platform has its own answer.
    expect(adClickIdFor({ clickId: google, last }, 'google')).toEqual(google)
    expect(adClickIdFor({ clickId: google, last }, 'microsoft')).toEqual(bing)
    // And a signup no ad touched is nobody's to hear about.
    expect(adClickIdFor({ clickId: null, last: null }, 'google')).toBeNull()
    expect(adClickIdFor({ clickId: null, last: null }, 'microsoft')).toBeNull()
  })
})
