import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTION_FIELD_MAX_LEN,
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABELS,
  buildAttributionTouch,
  buildPoweredByUrl,
  campaignKeyOf,
  classifyChannel,
  isTaggedTouch,
  normalizeLandingPath,
  parseAttributionCookie,
  parseSignupAttribution,
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
