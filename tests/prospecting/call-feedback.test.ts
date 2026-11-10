import { describe, it, expect, vi, beforeEach } from 'vitest'
// The cold-caller release hook (P-02) rides every unservable flip; it is its
// own module with its own tests — here it is a spy, so the counts below
// stay the writer's own statements.
vi.mock('@/lib/services/prospect-caller-release', () => ({ releaseIfUnservable: vi.fn(async () => false) }))

/**
 * CALLER FEEDBACK IS THE STRONGEST SIGNAL (P-01). What the owner heard on
 * the phone outranks every database: disconnected / wrong number park the
 * record and the number leaves every dial queue; closed disqualifies; a
 * pick-up writes the reach signal. No-answers and voicemails are normal and
 * touch nothing.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  const table = (name: string) => new Proxy({ _n: name }, { get: (t, k) => (k === '_n' ? name : String(k)) })
  return {
    db: {
      select: () => selectChain(),
      insert: (t: { _n: string }) => ({
        values: async (values: Record<string, unknown>) => {
          state.inserts.push({ table: t._n, values })
        },
      }),
      update: (t: { _n: string }) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: t._n, values })
          },
        }),
      }),
    },
    schema: {
      prospect: table('prospect'),
      prospectCallLog: table('prospect_call_log'),
      outreachEnrollment: table('outreach_enrollment'),
    },
  }
})
vi.mock('drizzle-orm', () => {
  const stub = () => vi.fn(() => ({}))
  return {
    and: stub(), asc: stub(), desc: stub(), eq: stub(), exists: stub(), gte: stub(), ilike: stub(),
    inArray: stub(), isNotNull: stub(), isNull: stub(), notInArray: stub(), or: stub(),
    sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
  }
})

import { logCallOutcome } from '@/lib/services/prospecting'

const VERIFIED_ROW = {
  status: 'enriched',
  verification: {
    places: { status: 'matched', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'places' },
    business: { status: 'open', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'places' },
    npi: { status: 'active', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'nppes' },
    website: { status: 'alive', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'crawl' },
    phone: { status: 'valid', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'aws_pinpoint' },
  },
  verifiedAt: new Date('2026-11-01T00:00:00Z'),
  phone: '4045551212',
  phoneStatus: 'valid',
  phoneLineType: 'landline',
  businessStatus: 'OPERATIONAL',
  reviewCount: 20,
  websiteUrl: 'https://smiledental.com',
}

const prospectUpdates = () => state.updates.filter((u) => u.table === 'prospect')

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
})

describe('logCallOutcome — the verdicts', () => {
  it('disconnected → phone parked, quality zero, the date in the reason, the number off every queue', async () => {
    state.selectQueue.push([VERIFIED_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'disconnected' })
    expect(state.inserts[0]).toMatchObject({ table: 'prospect_call_log', values: { outcome: 'disconnected' } })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phoneStatus: 'disconnected', phoneLineType: null, qualityScore: 0, qualityBand: 'parked' })
    const v = w.verification as { phone: { status: string; detail: string; source: string } }
    expect(v.phone.source).toBe('caller')
    expect(v.phone.detail).toMatch(/^Number disconnected on \w{3} \d{1,2}, \d{4}/)
    expect(w.qualityReasons).toEqual([v.phone.detail])
    // The follow-up loop clears — a dead number is nothing to circle back on.
    expect(prospectUpdates()[0].values).toMatchObject({ nextFollowUpAt: null })
  })

  it('wrong number → the same parking, its own words', async () => {
    state.selectQueue.push([VERIFIED_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'wrong_number' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ phoneStatus: 'wrong_number', qualityScore: 0, qualityBand: 'parked' })
    expect((w.verification as { phone: { detail: string } }).phone.detail).toMatch(/^Wrong number on/)
  })

  it('closed → disqualified with reason closed, the enrollment stopped, the business signal from the caller', async () => {
    state.selectQueue.push([VERIFIED_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'closed' })
    const w = prospectUpdates().at(-1)!.values
    expect(w).toMatchObject({ status: 'disqualified', suppressedReason: 'closed', qualityScore: 0, qualityBand: 'parked' })
    expect((w.verification as { business: { status: string; source: string } }).business).toMatchObject({ status: 'closed', source: 'caller' })
    const stopped = state.updates.find((u) => u.table === 'outreach_enrollment')
    expect(stopped?.values).toMatchObject({ status: 'stopped_manual', stopReason: 'call_closed' })
  })

  it('a verdict on a never-verified row still writes the honest zero', async () => {
    state.selectQueue.push([{ ...VERIFIED_ROW, verification: null, verifiedAt: null, phoneStatus: null }])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'disconnected' })
    expect(prospectUpdates().at(-1)!.values).toMatchObject({ phoneStatus: 'disconnected', qualityScore: 0 })
  })
})

describe('logCallOutcome — a human got through', () => {
  it('gatekeeper writes the reach signal, rescored on a verified row, and schedules a follow-up', async () => {
    state.selectQueue.push([VERIFIED_ROW])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'gatekeeper' })
    const first = prospectUpdates()[0].values
    expect(first.nextFollowUpAt).toBeInstanceOf(Date)
    expect(first.followUpReason).toMatch(/decision maker/)
    const w = prospectUpdates().at(-1)!.values
    const v = w.verification as { reach: { status: string; detail: string; source: string } }
    expect(v.reach).toMatchObject({ status: 'reached', source: 'caller' })
    expect(v.reach.detail).toMatch(/reached the desk/)
    // 35 + 25 + 15 + 10 + 10 + 5
    expect(w.qualityScore).toBe(100)
    expect(w.qualityBand).toBe('best')
  })

  it('a reach on a never-verified row records the signal but invents no score', async () => {
    state.selectQueue.push([{ ...VERIFIED_ROW, verification: null, verifiedAt: null }])
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'callback' })
    const w = prospectUpdates().at(-1)!.values
    expect((w.verification as { reach?: unknown }).reach).toBeTruthy()
    expect(w).not.toHaveProperty('qualityScore')
  })

  it('no answer and voicemail are normal — no feedback read, no rescoring', async () => {
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'no_answer' })
    await logCallOutcome({ prospectId: 'pros_1', outcome: 'voicemail' })
    expect(state.selectQueue).toHaveLength(0)
    expect(prospectUpdates()).toHaveLength(2)
    for (const u of prospectUpdates()) {
      expect(u.values).not.toHaveProperty('verification')
      expect(u.values).not.toHaveProperty('qualityScore')
    }
  })
})
