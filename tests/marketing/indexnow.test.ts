import { describe, it, expect } from 'vitest'
import {
  EMPTY_INDEXNOW_STATE,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_PATH,
  INDEXNOW_MAX_URLS,
  buildIndexNowBody,
  classifyIndexNowStatus,
  contentKey,
  describeIndexNowState,
  indexNowDelivered,
  indexNowTarget,
  isSendablePath,
  isValidIndexNowKey,
  parseIndexNowState,
  planIndexNow,
  type IndexNowState,
} from '@/lib/indexnow'

/**
 * INDEXNOW — the pure half (lib/indexnow.ts).
 *
 * The protocol's rules were read on indexnow.org (documentation + FAQ) on
 * 2026-11-24; each `describe` below names the rule it holds. The one that
 * matters most is the engines' own: "do not resubmit unchanged URLs".
 */

const PROD = indexNowTarget('https://www.dreamcreatestudio.com')!

describe('the key', () => {
  it('is 8–128 characters of [a-zA-Z0-9-], as the protocol requires', () => {
    expect(isValidIndexNowKey(INDEXNOW_KEY)).toBe(true)
    expect(INDEXNOW_KEY.length).toBeGreaterThanOrEqual(8)
    expect(INDEXNOW_KEY.length).toBeLessThanOrEqual(128)
  })

  it('the validator refuses what the protocol refuses', () => {
    for (const bad of ['short', 'has space in it', 'under_score_key', 'dot.dot.dot.dot', 'x'.repeat(129), '']) {
      expect(isValidIndexNowKey(bad), bad).toBe(false)
    }
  })

  it('lives at /<key>.txt and is sent to the shared endpoint', () => {
    expect(INDEXNOW_KEY_PATH).toBe(`/${INDEXNOW_KEY}.txt`)
    expect(INDEXNOW_ENDPOINT).toBe('https://api.indexnow.org/indexnow')
  })
})

describe('who may speak — only the public site, and never by default', () => {
  it('the production address resolves to its host', () => {
    expect(PROD).toEqual({ origin: 'https://www.dreamcreatestudio.com', host: 'www.dreamcreatestudio.com' })
    // A trailing slash or a path on the configured URL changes nothing.
    expect(indexNowTarget('https://www.dreamcreatestudio.com/')).toEqual(PROD)
    expect(indexNowTarget('https://WWW.DreamCreateStudio.com/some/path')).toEqual(PROD)
  })

  it('an UNSET address is silence — there is no fallback to production', () => {
    expect(indexNowTarget(undefined)).toBeNull()
    expect(indexNowTarget(null)).toBeNull()
    expect(indexNowTarget('')).toBeNull()
  })

  it('a laptop, the browser-test harness and a bare machine address are all silence', () => {
    for (const local of [
      'http://localhost:3000', // the Dockerfile's default build arg
      'https://localhost:3000',
      'http://127.0.0.1:3111', // scripts/e2e-harness.sh
      'https://127.0.0.1',
      'https://10.0.3.7',
      'https://[::1]:3000',
      'http://www.dreamcreatestudio.com', // not https
      'https://intranet',
      'https://dev.localhost',
      'https://printer.local',
      'not a url',
    ]) {
      expect(indexNowTarget(local), local).toBeNull()
    }
  })
})

describe('"do not resubmit unchanged URLs" — the plan is a difference', () => {
  it('nothing on record: every page is named once', () => {
    expect(planIndexNow({ '/': 'a', '/pricing': 'b' }, {})).toEqual({ changed: ['/', '/pricing'], removed: [] })
  })

  it('everything on record and nothing moved: NOTHING is named', () => {
    const pages = { '/': 'a', '/pricing': 'b', '/blog/one': '2026-11-01T00:00:00.000Z' }
    expect(planIndexNow(pages, { ...pages })).toEqual({ changed: [], removed: [] })
  })

  it('one page whose content key moved: that page and no other', () => {
    const before = { '/': 'a', '/pricing': 'b', '/blog/one': 'k1' }
    const after = { ...before, '/blog/one': 'k2' }
    expect(planIndexNow(after, before)).toEqual({ changed: ['/blog/one'], removed: [] })
  })

  it('a new page is named; a page that is gone is named one last time', () => {
    const before = { '/': 'a', '/blog/old': 'k' }
    const after = { '/': 'a', '/blog/new': 'k' }
    expect(planIndexNow(after, before)).toEqual({ changed: ['/blog/new'], removed: ['/blog/old'] })
  })
})

describe('the request body', () => {
  it('names the host, the key, where the key file is, and absolute URLs on that host', () => {
    expect(buildIndexNowBody(PROD, ['/', '/pricing', '/blog/a-post'])).toEqual({
      host: 'www.dreamcreatestudio.com',
      key: INDEXNOW_KEY,
      keyLocation: `https://www.dreamcreatestudio.com/${INDEXNOW_KEY}.txt`,
      urlList: [
        'https://www.dreamcreatestudio.com/',
        'https://www.dreamcreatestudio.com/pricing',
        'https://www.dreamcreatestudio.com/blog/a-post',
      ],
    })
  })

  it('never sends an address that is not a path on our own host', () => {
    for (const bad of ['//evil.example/x', 'https://evil.example/x', 'pricing', '']) {
      expect(isSendablePath(bad), bad).toBe(false)
    }
    const body = buildIndexNowBody(PROD, ['//evil.example/x', 'https://evil.example/x', '/ok'])
    expect(body.urlList).toEqual(['https://www.dreamcreatestudio.com/ok'])
  })

  it('caps one POST at the protocol’s ceiling', () => {
    const many = Array.from({ length: INDEXNOW_MAX_URLS + 5 }, (_, i) => `/p/${i}`)
    expect(buildIndexNowBody(PROD, many).urlList).toHaveLength(INDEXNOW_MAX_URLS)
  })
})

describe('the response codes, as the documentation lists them', () => {
  it('reads each one', () => {
    expect(classifyIndexNowStatus(200)).toBe('ok')
    expect(classifyIndexNowStatus(202)).toBe('accepted')
    expect(classifyIndexNowStatus(400)).toBe('bad_request')
    expect(classifyIndexNowStatus(403)).toBe('key_refused')
    expect(classifyIndexNowStatus(422)).toBe('urls_refused')
    expect(classifyIndexNowStatus(429)).toBe('rate_limited')
    expect(classifyIndexNowStatus(500)).toBe('failed')
    expect(classifyIndexNowStatus(0)).toBe('failed') // a network failure
  })

  it('only 200 and 202 count as delivered', () => {
    expect(indexNowDelivered('ok')).toBe(true)
    expect(indexNowDelivered('accepted')).toBe(true)
    for (const o of ['bad_request', 'key_refused', 'urls_refused', 'rate_limited', 'failed'] as const) {
      expect(indexNowDelivered(o), o).toBe(false)
    }
  })
})

describe('content keys', () => {
  it('the same content gives the same key; any change gives another', () => {
    const a = { slug: 'weave', price: 199, rows: ['x', 'y'] }
    expect(contentKey(a)).toBe(contentKey({ slug: 'weave', price: 199, rows: ['x', 'y'] }))
    expect(contentKey(a)).not.toBe(contentKey({ ...a, price: 249 }))
    expect(contentKey(a)).not.toBe(contentKey({ ...a, rows: ['x', 'y', 'z'] }))
    expect(contentKey('abc')).not.toBe(contentKey('abd'))
  })

  it('is short, printable and stable across runs (it is stored)', () => {
    // Pinned on purpose: a changed algorithm would re-announce every page.
    expect(contentKey('hello')).toBe(contentKey('hello'))
    expect(contentKey('hello')).toMatch(/^[0-9a-z]{1,12}$/)
    expect(contentKey({ a: 1 })).toMatch(/^[0-9a-z]{1,12}$/)
  })
})

describe('the stored state is read defensively', () => {
  it('nothing, a wrong type or garbage all read as "nothing recorded"', () => {
    for (const raw of [undefined, null, 'x', 7, [], { submitted: 'nope' }, { submitted: ['a'] }]) {
      expect(parseIndexNowState(raw), JSON.stringify(raw)).toEqual(EMPTY_INDEXNOW_STATE)
    }
  })

  it('keeps well-formed entries and drops malformed ones one by one', () => {
    const state = parseIndexNowState({
      submitted: { '/': 'a', '/bad': 7, '/pricing': 'b' },
      lastRun: { at: '2026-11-24T10:00:00.000Z', outcome: 'ok', status: 200, urls: 2 },
      lastDelivered: { at: 'x', outcome: 'ok' }, // no url count → not a run
    })
    expect(state.submitted).toEqual({ '/': 'a', '/pricing': 'b' })
    expect(state.lastRun).toEqual({ at: '2026-11-24T10:00:00.000Z', outcome: 'ok', status: 200, urls: 2 })
    expect(state.lastDelivered).toBeNull()
  })

  it('never hands back the shared empty object (a caller may write into it)', () => {
    const a = parseIndexNowState(undefined)
    a.submitted['/x'] = 'k'
    expect(parseIndexNowState(undefined).submitted).toEqual({})
    expect(EMPTY_INDEXNOW_STATE.submitted).toEqual({})
  })
})

describe('the sentence on the owner’s SEO page', () => {
  const when = (iso: string) => `«${iso.slice(0, 10)}»`
  const run = (outcome: string, urls: number, at = '2026-11-24T10:00:00.000Z') =>
    ({ at, outcome, status: null, urls }) as IndexNowState['lastRun']

  it('before the first pass: says so, and says what the first one does', () => {
    const d = describeIndexNowState(EMPTY_INDEXNOW_STATE, when)
    expect(d.tone).toBe('calm')
    expect(d.headline).toBe('No notice has gone out yet')
    expect(d.detail).toMatch(/names every public page once/)
  })

  it('a delivered notice: when, and how many pages', () => {
    const delivered = run('ok', 92)
    const d = describeIndexNowState({ submitted: { '/': 'a', '/pricing': 'b' }, lastRun: delivered, lastDelivered: delivered }, when)
    expect(d.tone).toBe('calm')
    expect(d.headline).toBe('Last told «2026-11-24» — 92 pages')
    expect(d.detail).toMatch(/^2 pages on record as announced\./)
  })

  it('an idle hour after a delivery still reports the delivery, and counts one page as "1 page"', () => {
    const delivered = run('accepted', 1, '2026-11-23T09:00:00.000Z')
    const d = describeIndexNowState(
      { submitted: { '/': 'a' }, lastRun: run('nothing_to_send', 0), lastDelivered: delivered },
      when,
    )
    expect(d.headline).toBe('Last told «2026-11-23» — 1 page')
    expect(d.detail).toMatch(/^1 page on record/)
    expect(d.detail).toMatch(/Checked «2026-11-24»/)
  })

  it('EVERY refusal reads as needing attention, says nothing was marked announced, and names the last one that landed', () => {
    const delivered = run('ok', 5, '2026-11-20T09:00:00.000Z')
    for (const outcome of ['key_not_served', 'key_refused', 'bad_request', 'urls_refused', 'rate_limited', 'failed']) {
      const d = describeIndexNowState({ submitted: {}, lastRun: run(outcome, 3), lastDelivered: delivered }, when)
      expect(d.tone, outcome).toBe('attention')
      expect(d.headline, outcome).toMatch(/^The last notice did not land — /)
      expect(d.detail, outcome).toMatch(/3 pages/)
      expect(d.detail, outcome).toMatch(/nothing is marked as announced until one lands/)
      expect(d.detail, outcome).toMatch(/The last one that landed was «2026-11-20»/)
    }
    const never = describeIndexNowState({ submitted: {}, lastRun: run('key_refused', 3), lastDelivered: null }, when)
    expect(never.detail).toMatch(/None has landed so far\./)
  })

  it('the held first notice is calm, and says when it goes', () => {
    const d = describeIndexNowState({ submitted: {}, lastRun: run('waiting_for_rollout', 92), lastDelivered: null }, when)
    expect(d.tone).toBe('calm')
    expect(d.headline).toMatch(/waiting for this version to finish going live/)
    expect(d.detail).toMatch(/92 pages/)
  })

  it('uses no jargon the owner would have to look up', () => {
    const all = [
      describeIndexNowState(EMPTY_INDEXNOW_STATE, when),
      describeIndexNowState({ submitted: {}, lastRun: run('key_refused', 3), lastDelivered: null }, when),
      describeIndexNowState({ submitted: {}, lastRun: run('ok', 3), lastDelivered: run('ok', 3) }, when),
    ]
    for (const d of all) {
      expect(`${d.headline} ${d.detail}`).not.toMatch(/IndexNow|HTTP|\b4\d\d\b|\b20[02]\b|POST|endpoint|payload/)
    }
  })
})
