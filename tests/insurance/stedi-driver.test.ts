import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The network half of the Stedi driver: key handling, payer resolution (the
 * refusal on ambiguous names), NPI resolution per mode, HTTP status lanes,
 * and the hand-off to the normalizer. `fetch` is mocked; nothing here
 * touches Stedi.
 */

const state = { profile: [{ npi: null as string | null, name: 'Dream Dental' }] }
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.limit = async () => state.profile
    return obj
  }
  return { db: { select: () => chain() }, schema }
})

import { makeStediProvider, searchStediPayers, stediConfigured, stediMode } from '@/lib/services/insurance-eligibility/stedi'
import { StediRetryableError } from '@/lib/stedi-eligibility'
import type { EligibilityRequest } from '@/lib/insurance-eligibility'

const NOW = new Date('2026-09-30T15:00:00Z')
const CTX = { now: NOW, organizationId: 'org_1' }

function req(overrides: Partial<EligibilityRequest> = {}): EligibilityRequest {
  return {
    patient: { firstName: 'Falcon', lastName: 'Dent', dateOfBirth: '1985-06-07' },
    carrierName: 'Ameritas',
    memberId: '007007007',
    groupNumber: null,
    relationship: 'self',
    subscriber: null,
    payerId: null,
    payerName: null,
    ...overrides,
  }
}

const calls: Array<{ url: string; init: RequestInit }> = []
let responder: (url: string, init: RequestInit) => { status: number; body: unknown }

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const ACTIVE = {
  payer: { name: { organization: 'AMERITAS' } },
  subscriber: { dates: { plan: { start: '2026-01-01', end: null } } },
  plans: [{ name: 'Ameritas PPO', benefits: { statuses: [{ status: 'ACTIVE_COVERAGE', service: { system: 'STC', value: '35' } }] } }],
}
const PAYERS_ONE = { items: [{ payer: { stediId: 'PSBWG', displayName: 'Ameritas', primaryPayerId: 'AMTAS00425', transactionSupport: { eligibilityCheck: 'SUPPORTED' } }, score: 20436 }] }
const PAYERS_MANY = {
  items: [
    { payer: { stediId: 'A', displayName: 'Delta Dental of Kansas', primaryPayerId: 'CDKS1', transactionSupport: { eligibilityCheck: 'SUPPORTED' } }, score: 3436 },
    { payer: { stediId: 'B', displayName: 'Delta Dental of California', primaryPayerId: '77777', transactionSupport: { eligibilityCheck: 'SUPPORTED' } }, score: 2454 },
  ],
}

beforeEach(() => {
  calls.length = 0
  state.profile = [{ npi: null, name: 'Dream Dental' }]
  process.env.STEDI_API_KEY = 'test.key'
  delete process.env.STEDI_MODE
  delete process.env.STEDI_DEFAULT_NPI
  responder = (url) => (url.includes('/payers/search') ? { status: 200, body: PAYERS_ONE } : { status: 200, body: ACTIVE })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      const r = responder(url, init)
      return jsonRes(r.status, r.body)
    }),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('configuration', () => {
  it('mode defaults to test and only the literal "live" flips it', () => {
    expect(stediMode({})).toBe('test')
    expect(stediMode({ STEDI_MODE: 'LIVE' })).toBe('live')
    expect(stediMode({ STEDI_MODE: 'production' })).toBe('test')
    expect(stediConfigured({ STEDI_API_KEY: ' ' })).toBe(false)
    expect(stediConfigured({ STEDI_API_KEY: 'k' })).toBe(true)
  })

  it('a missing key refuses before any network call', async () => {
    delete process.env.STEDI_API_KEY
    await expect(makeStediProvider('stedi_test').check(req({ payerId: 'X' }), CTX)).rejects.toThrow(/STEDI_API_KEY/)
    expect(calls.filter((c) => c.url.includes('eligibility-check'))).toHaveLength(0)
  })
})

describe('check', () => {
  it('sends the key as the Authorization header, the dental STC, and the mock NPI in test mode', async () => {
    const r = await makeStediProvider('stedi_test').check(req({ payerId: 'AMTAS00425' }), CTX)
    expect(r.result.status).toBe('active')
    const post = calls.find((c) => c.url.endsWith('/2026-06-01/eligibility-check'))!
    expect(post).toBeDefined()
    expect((post.init.headers as Record<string, string>).Authorization).toBe('test.key')
    const body = JSON.parse(String(post.init.body))
    expect(body.payerId).toBe('AMTAS00425')
    expect(body.provider).toEqual({ npi: '1999999984', name: { organization: 'Dream Dental' } })
    expect(body.encounter.services).toEqual([{ system: 'STC', value: '35' }])
    // A pinned payer id skips the search entirely.
    expect(calls.some((c) => c.url.includes('/payers/search'))).toBe(false)
  })

  it('uses the practice NPI when on file, then STEDI_DEFAULT_NPI, and refuses live mode without one', async () => {
    state.profile = [{ npi: '123-456-7893', name: 'Dream Dental' }]
    await makeStediProvider('stedi').check(req({ payerId: 'X' }), CTX)
    expect(JSON.parse(String(calls.at(-1)!.init.body)).provider.npi).toBe('1234567893')

    state.profile = [{ npi: null, name: 'Dream Dental' }]
    process.env.STEDI_DEFAULT_NPI = '1999999984'
    await makeStediProvider('stedi').check(req({ payerId: 'X' }), CTX)
    expect(JSON.parse(String(calls.at(-1)!.init.body)).provider.npi).toBe('1999999984')

    delete process.env.STEDI_DEFAULT_NPI
    await expect(makeStediProvider('stedi').check(req({ payerId: 'X' }), CTX)).rejects.toThrow(/NPI/)
  })

  it('resolves a clear payer name by search, and refuses an ambiguous one', async () => {
    const r = await makeStediProvider('stedi_test').check(req(), CTX)
    expect(r.result.status).toBe('active')
    expect(JSON.parse(String(calls.at(-1)!.init.body)).payerId).toBe('AMTAS00425')

    responder = (url) => (url.includes('/payers/search') ? { status: 200, body: PAYERS_MANY } : { status: 200, body: ACTIVE })
    await expect(makeStediProvider('stedi_test').check(req({ carrierName: 'Delta Dental' }), CTX)).rejects.toThrow(/matches 2 payers/)

    responder = (url) => (url.includes('/payers/search') ? { status: 200, body: { items: [] } } : { status: 200, body: ACTIVE })
    await expect(makeStediProvider('stedi_test').check(req({ carrierName: 'Nope Mutual' }), CTX)).rejects.toThrow(/No payer named/)
  })

  it('maps HTTP lanes: 401 is a config error, 5xx/429 retryable, 400 carries Stedi’s message', async () => {
    responder = () => ({ status: 401, body: { message: 'nope' } })
    await expect(makeStediProvider('stedi_test').check(req({ payerId: 'X' }), CTX)).rejects.toThrow(/API key/)
    responder = () => ({ status: 503, body: {} })
    await expect(makeStediProvider('stedi_test').check(req({ payerId: 'X' }), CTX)).rejects.toThrow(StediRetryableError)
    responder = () => ({ status: 400, body: { message: 'subscriber.dateOfBirth must be YYYY-MM-DD' } })
    await expect(makeStediProvider('stedi_test').check(req({ payerId: 'X' }), CTX)).rejects.toThrow(/YYYY-MM-DD/)
  })
})

describe('searchStediPayers', () => {
  it('returns parsed matches, and an empty list for short queries, missing keys, or failures', async () => {
    expect(await searchStediPayers('a')).toEqual([])
    delete process.env.STEDI_API_KEY
    expect(await searchStediPayers('Ameritas')).toEqual([])
    process.env.STEDI_API_KEY = 'test.key'
    const out = await searchStediPayers('Ameritas')
    expect(out.map((p) => p.primaryPayerId)).toEqual(['AMTAS00425'])
    expect(calls.at(-1)!.url).toContain('query=Ameritas')
    expect(calls.at(-1)!.url).toContain('eligibilityCheck=SUPPORTED')
    responder = () => ({ status: 500, body: {} })
    expect(await searchStediPayers('Ameritas')).toEqual([])
  })
})
