import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The hunter — runAutoEnroll: kill switch / disabled / cap gating, hottest-
 * first pool order, per-success counter bump, known-contact drain
 * (disqualify without counter burn), and runs-in-dry-run.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
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
  return {
    db: {
      select: () => selectChain(),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          state.inserts.push({ table: (table as { _n: string })._n, values })
          const p: any = Promise.resolve(undefined)
          p.onConflictDoNothing = () => Promise.resolve(undefined)
          return p
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: (table as { _n: string })._n, values })
          },
        }),
      }),
    },
    schema: {
      prospect: { _n: 'prospect', id: 'id', status: 'status', email: 'email', scoreBand: 'band', opportunityScore: 'score', enrichedAt: 'e' },
      outreachSequence: { _n: 'outreach_sequence', id: 'id', segment: 'segment', createdAt: 'c' },
      outreachTouchTemplate: { _n: 'outreach_touch_template', id: 'id' },
      outreachEnrollment: { _n: 'outreach_enrollment', id: 'id', prospectId: 'pid', status: 'status' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}))

const { configMock, counterMock, bumpMock, knownMock } = vi.hoisted(() => ({
  configMock: vi.fn(),
  counterMock: vi.fn(async () => 0),
  bumpMock: vi.fn(async () => {}),
  knownMock: vi.fn(async () => false),
}))
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: configMock,
  updateProspectingConfig: vi.fn(async () => ({})),
  getProspectingCounter: counterMock,
  bumpProspectingCounter: bumpMock,
  counterMonth: () => '2026-07',
  counterDay: () => '2026-07-07',
  isKnownContact: knownMock,
}))
vi.mock('@/lib/prospect-segment', () => ({ segmentForProspect: () => 'no_website' }))

// The real enrollProspect runs (its internal call can't be spied through an ES
// module boundary) — drive it via the mocked db + isKnownContact so the
// hunter's routing/guards are exercised end to end.
import { runAutoEnroll, enrollProspect } from '@/lib/services/prospect-outreach'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const LIVE = {
  ...PROSPECTING_DEFAULTS,
  killSwitch: false,
  autoEnroll: { enabled: true, bands: ['hot', 'warm'] as const, perDay: 50 },
}

// A full enriched prospect row (what enrollProspect selects internally).
function prospectRow(id: string) {
  return {
    id, name: `Practice ${id}`, email: `${id}@x.com`, phone: '2145551212',
    websiteUrl: null, status: 'enriched', aiVerdict: null, enrichment: null,
  }
}

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
  state.inserts = []
  vi.clearAllMocks()
  configMock.mockResolvedValue(LIVE)
  counterMock.mockResolvedValue(0)
  knownMock.mockResolvedValue(false)
})

describe('runAutoEnroll gating', () => {
  it('kill switch skips', async () => {
    configMock.mockResolvedValue({ ...LIVE, killSwitch: true })
    expect((await runAutoEnroll()).skipped).toBe('kill_switch')
  })

  it('disabled skips', async () => {
    configMock.mockResolvedValue({ ...LIVE, autoEnroll: { ...LIVE.autoEnroll, enabled: false } })
    expect((await runAutoEnroll()).skipped).toBe('disabled')
  })

  it('daily cap exhausted skips before querying the pool', async () => {
    counterMock.mockResolvedValue(50)
    expect((await runAutoEnroll()).skipped).toBe('daily_cap')
  })
})

describe('runAutoEnroll pool processing', () => {
  it('enrolls in pool order, bumps the counter per success, runs in dry-run', async () => {
    configMock.mockResolvedValue({ ...LIVE, dryRun: true })
    state.selectQueue.push([{ id: 'pros_1' }, { id: 'pros_2' }]) // pool
    // enrollProspect(pros_1): prospect row, then sequenceForSegment row
    state.selectQueue.push([prospectRow('pros_1')])
    state.selectQueue.push([{ id: 'oseq_no_website' }])
    state.selectQueue.push([prospectRow('pros_2')])
    state.selectQueue.push([{ id: 'oseq_no_website' }])

    const r = await runAutoEnroll()
    expect(r).toMatchObject({ scanned: 2, enrolled: 2, guardSkipped: 0 })
    const enrollments = state.inserts.filter((i) => i.table === 'outreach_enrollment')
    expect(enrollments.map((e) => e.values.prospectId)).toEqual(['pros_1', 'pros_2'])
    expect(enrollments[0]!.values.sequenceId).toBe('oseq_no_website')
    expect(bumpMock).toHaveBeenCalledTimes(2)
    expect(bumpMock).toHaveBeenCalledWith('2026-07-07', 'auto_enroll')
  })

  it('a known-contact failure disqualifies the prospect and never bumps the counter', async () => {
    knownMock.mockResolvedValue(true)
    state.selectQueue.push([{ id: 'pros_1' }]) // pool
    state.selectQueue.push([prospectRow('pros_1')]) // enrollProspect's row load
    const r = await runAutoEnroll()
    expect(r).toMatchObject({ enrolled: 0, guardSkipped: 1 })
    const dq = state.updates.find(
      (u) => u.table === 'prospect' && u.values.status === 'disqualified',
    )
    expect(dq!.values).toMatchObject({ suppressedReason: 'known_contact' })
    expect(bumpMock).not.toHaveBeenCalled()
    expect(state.inserts.find((i) => i.table === 'outreach_enrollment')).toBeUndefined()
  })
})

describe('enrollProspect routing', () => {
  it('routes to the segment sequence, and falls back to the default when none exists', async () => {
    // Segment match found → uses it.
    state.selectQueue.push([prospectRow('pros_1')]) // prospect load
    state.selectQueue.push([{ id: 'oseq_no_website' }]) // sequenceForSegment
    const r1 = await enrollProspect('pros_1')
    expect(r1).toMatchObject({ ok: true, sequenceId: 'oseq_no_website' })

    // No segment sequence row → falls back to the default id.
    state.selectQueue.push([prospectRow('pros_2')])
    state.selectQueue.push([]) // sequenceForSegment returns nothing
    const r2 = await enrollProspect('pros_2')
    expect(r2).toMatchObject({ ok: true, sequenceId: 'oseq_default' })
  })

  it('an explicit sequenceId skips routing', async () => {
    state.selectQueue.push([prospectRow('pros_3')])
    const r = await enrollProspect('pros_3', 'oseq_custom')
    expect(r).toMatchObject({ ok: true, sequenceId: 'oseq_custom' })
  })

  it('no email / retired status / known contact all fail closed', async () => {
    state.selectQueue.push([{ ...prospectRow('pros_4'), email: null }])
    expect(await enrollProspect('pros_4')).toMatchObject({ ok: false })

    state.selectQueue.push([{ ...prospectRow('pros_5'), status: 'suppressed' }])
    expect(await enrollProspect('pros_5')).toMatchObject({ ok: false })

    knownMock.mockResolvedValue(true)
    state.selectQueue.push([prospectRow('pros_6')])
    expect(await enrollProspect('pros_6')).toEqual({ ok: false, error: 'known_contact' })
  })
})
