import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * FIT — the group work (P-04): the chain sweep over shared hosts / phones
 * (every member flagged, a customer never, an overridden row never, a
 * generic host never; the drip stopped and the caller's slot freed; a
 * resting member set aside like a live one), the sweep's own un-flag (a
 * flagged group under the threshold is restored), the owner's "Not a
 * chain" (the override stored for good, the row back where it was, the
 * quality recomputed, the drip resumed, the follow-up put back), the
 * chains count, and the callers' freshness pull (the pull stamps and
 * nothing else; an enabled state only; a pulled task never pulled twice).
 */

const state = {
  selectQueue: [] as unknown[][],
  /** The WHERE each select carried, in order (rendered where a test cares). */
  selectWheres: [] as unknown[],
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  returning: [] as unknown[][],
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const tableName = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const selectChain = () => {
    const obj: any = {}
    for (const m of ['from', 'groupBy', 'having', 'limit', 'innerJoin', 'orderBy']) obj[m] = () => obj
    obj.where = (w: unknown) => {
      state.selectWheres.push(w)
      return obj
    }
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: () => {
            const w: any = {
              then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
                state.updates.push({ table: tableName(table), values })
                return Promise.resolve(undefined).then(onF, onR)
              },
              returning: async () => {
                state.updates.push({ table: tableName(table), values })
                return state.returning.shift() ?? []
              },
            }
            return w
          },
        }),
      }),
    },
    schema,
  }
})

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  stop: vi.fn(async (_id: string, _reason: string, _now?: Date) => {}),
  clear: vi.fn(async (_id: string, _now?: Date) => {}),
  release: vi.fn(async (_id: string, _now?: Date) => true),
}))
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: mocks.config,
  stopActiveEnrollments: mocks.stop,
  clearSystemFollowUp: mocks.clear,
}))
vi.mock('@/lib/services/prospect-caller-release', () => ({
  releaseIfUnservable: mocks.release,
  callerServableWhere: vi.fn(() => undefined),
  releaseCooldownUntil: vi.fn((d: Date) => d),
}))
vi.mock('@/lib/services/prospect-dedupe', async () => {
  const { sql } = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm')
  return { tenDigitPhoneSql: () => sql`phone_key` }
})

import { PgDialect } from 'drizzle-orm/pg-core'
import { CHAIN_STOP_REASON, clearChainFlag, countChains, findChainGroups, priorFollowUpOf, restoreChainFlagged, sweepChains } from '@/lib/services/prospect-fit'
import { pullForwardHotTerritories } from '@/lib/services/prospect-discovery'
import { PROSPECTING_DEFAULTS } from '@/lib/types/prospecting'

const render = (q: unknown) => new PgDialect().sqlToQuery(q as never)

const NOW = new Date('2026-11-10T12:00:00Z')
const enrollmentUpdates = () => state.updates.filter((u) => u.table === 'outreachEnrollment')
const LIVE = { ...PROSPECTING_DEFAULTS, killSwitch: false, enabledStates: ['TX'] }
const AT = '2026-11-01T00:00:00.000Z'
const prospectUpdates = () => state.updates.filter((u) => u.table === 'prospect')

beforeEach(() => {
  state.selectQueue = []
  state.selectWheres = []
  state.updates = []
  state.returning = []
  vi.clearAllMocks()
  mocks.config.mockResolvedValue(LIVE)
})

describe('findChainGroups', () => {
  it('reads the host groups then the phone groups, drops a generic host, keeps the ids', async () => {
    state.selectQueue.push(
      [
        { key: 'aspen.com', addresses: 3, ids: ['a', 'b', 'c'] },
        { key: 'facebook.com', addresses: 12, ids: ['f1', 'f2', 'f3'] },
        { key: null, addresses: 5, ids: ['n'] },
      ],
      [{ key: '4045551212', addresses: 4, ids: ['p1', 'p2', 'p3', 'p4'] }],
    )
    const groups = await findChainGroups()
    expect(groups).toEqual([
      { kind: 'shared_host', key: 'aspen.com', addresses: 3, ids: ['a', 'b', 'c'] },
      { kind: 'shared_phone', key: '4045551212', addresses: 4, ids: ['p1', 'p2', 'p3', 'p4'] },
    ])
  })
})

describe('sweepChains', () => {
  it('flags every live member (status, reason, zero quality, the stored signal with its prior status), notes a row that already said no, skips an overridden one', async () => {
    state.selectQueue.push(
      [{ key: 'aspen.com', addresses: 3, ids: ['a', 'b', 'c'] }],
      [],
      [
        { id: 'a', status: 'contacted', suppressedReason: null, verification: { npi: { status: 'active', detail: null, checkedAt: AT, source: 'nppes' } } },
        { id: 'b', status: 'not_interested', suppressedReason: null, verification: null },
        { id: 'c', status: 'enriched', suppressedReason: null, verification: { fit: { chainOverride: { status: 'not_a_chain', detail: null, checkedAt: AT, source: 'owner' } } } },
      ],
    )
    const r = await sweepChains({ now: NOW })
    expect(r).toEqual({ groups: 1, flagged: 1, noted: 1, restored: 0, errors: 0 })
    const writes = prospectUpdates()
    expect(writes).toHaveLength(2)
    const a = writes[0].values
    expect(a).toMatchObject({ status: 'disqualified', suppressedReason: 'chain', suppressedAt: NOW, qualityScore: 0, qualityBand: 'parked' })
    expect(a.qualityReasons).toEqual(["Shares its website with 2 other practices at different addresses — a chain; we'll target chains later"])
    const fitA = (a.verification as { fit: Record<string, unknown>; npi: unknown }).fit
    expect(fitA.chain).toMatchObject({ status: 'shared_host', kind: 'shared_host', count: 3, key: 'aspen.com', priorStatus: 'contacted', source: 'our_data', checkedAt: NOW.toISOString() })
    // The prior signals survive the flag.
    expect((a.verification as { npi: { status: string } }).npi.status).toBe('active')
    // The hold: the drip stops, the system follow-up clears, the caller's slot frees.
    expect(CHAIN_STOP_REASON).toBe('verify_chain')
    expect(mocks.stop).toHaveBeenCalledWith('a', 'verify_chain', NOW)
    expect(mocks.clear).toHaveBeenCalledWith('a', NOW)
    expect(mocks.release).toHaveBeenCalledWith('a', NOW)
    // b keeps its status — only the signal lands (with the status it kept, for the record).
    const b = writes[1].values
    expect(b).not.toHaveProperty('status')
    expect((b.verification as { fit: { chain: { priorStatus: string | null } } }).fit.chain.priorStatus).toBe('not_interested')
    expect(mocks.stop).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: a row already set aside as a chain only refreshes its signal and keeps the status it had before the flag', async () => {
    state.selectQueue.push(
      [],
      [{ key: '4045551212', addresses: 3, ids: ['p1'] }],
      [{ id: 'p1', status: 'disqualified', suppressedReason: 'chain', verification: { fit: { chain: { status: 'shared_phone', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus: 'queued' } } } }],
    )
    const r = await sweepChains({ now: NOW })
    expect(r).toEqual({ groups: 1, flagged: 0, noted: 1, restored: 0, errors: 0 })
    const w = prospectUpdates()[0].values
    expect(w).not.toHaveProperty('status')
    expect((w.verification as { fit: { chain: { priorStatus: string } } }).fit.chain.priorStatus).toBe('queued')
    expect(mocks.stop).not.toHaveBeenCalled()
  })

  it('no groups, no writes', async () => {
    state.selectQueue.push([], [])
    expect(await sweepChains({ now: NOW })).toEqual({ groups: 0, flagged: 0, noted: 0, restored: 0, errors: 0 })
    expect(state.updates).toHaveLength(0)
  })

  it('a RESTING member is set aside like a live one — its memory of where it came from kept, the flag remembering "dormant" (E.6)', async () => {
    state.selectQueue.push(
      [],
      [{ key: '4045551212', addresses: 3, ids: ['d1'] }],
      [{ id: 'd1', status: 'dormant', suppressedReason: null, verification: null, nextFollowUpAt: null, followUpReason: null }],
    )
    const r = await sweepChains({ now: NOW })
    expect(r).toMatchObject({ flagged: 1, noted: 0 })
    const w = prospectUpdates()[0].values
    expect(w).toMatchObject({ status: 'disqualified', suppressedReason: 'chain' })
    expect(w).not.toHaveProperty('dormantFromStatus')
    expect((w.verification as { fit: { chain: { priorStatus: string } } }).fit.chain.priorStatus).toBe('dormant')
    expect(mocks.stop).toHaveBeenCalledWith('d1', 'verify_chain', NOW)
  })

  it('a fresh flag remembers the system follow-up it clears; a refreshed flag keeps what it remembered — never a stale status from an earlier flag', async () => {
    const due = new Date('2026-11-12T15:00:00Z')
    state.selectQueue.push(
      [],
      [{ key: '4045551212', addresses: 3, ids: ['q1', 'q2'] }],
      [
        { id: 'q1', status: 'queued', suppressedReason: null, verification: null, nextFollowUpAt: due, followUpReason: 'No answer — try again' },
        {
          id: 'q2',
          status: 'disqualified',
          suppressedReason: 'chain',
          verification: { fit: { chain: { status: 'shared_phone', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus: 'contacted', priorFollowUp: { at: due.toISOString(), reason: 'Left a voicemail — circle back' } } } },
          nextFollowUpAt: null,
          followUpReason: null,
        },
      ],
    )
    await sweepChains({ now: NOW })
    const [q1, q2] = prospectUpdates().map((u) => (u.values.verification as { fit: { chain: Record<string, unknown> } }).fit.chain)
    expect(q1).toMatchObject({ priorStatus: 'queued', priorFollowUp: { at: due.toISOString(), reason: 'No answer — try again' } })
    expect(q2).toMatchObject({ priorStatus: 'contacted', priorFollowUp: { at: due.toISOString(), reason: 'Left a voicemail — circle back' } })
    // A callback a human promised is not the system's to remember or restore.
    expect(priorFollowUpOf({ nextFollowUpAt: due, followUpReason: 'They asked for a callback' })).toBeNull()
    expect(priorFollowUpOf({ nextFollowUpAt: null, followUpReason: 'No answer — try again' })).toBeNull()
  })

  it('the un-flag (E.4): a row the SWEEP flagged whose group fell under the threshold is RESTORED — the signal reads cleared, the drip resumes; an overridden row and a DSO-named row are filtered out IN SQL (V7), so 501 of them never starve this one', async () => {
    const swept = (over: Record<string, unknown>) => ({
      id: 'x',
      verification: { fit: { chain: { status: 'shared_phone', detail: 'shares', checkedAt: AT, source: 'our_data', kind: 'shared_phone', count: 3, key: '4045551212', priorStatus: 'contacted' } } },
      ...over,
    })
    state.selectQueue.push(
      [],
      [], // no group holds anyone any more
      // The candidate read: what the SQL predicate returns — the sweep-flagged
      // row only (an overridden row and a DSO-named row never sit in the set).
      [swept({ id: 'gone' })],
      // the restore's read of `gone`
      [
        {
          id: 'gone',
          status: 'disqualified',
          suppressedReason: 'chain',
          verification: swept({}).verification,
          verifiedAt: null,
          phoneStatus: 'unknown',
          phoneLineType: null,
          businessStatus: null,
          reviewCount: null,
          websiteUrl: null,
          nextFollowUpAt: null,
          followUpReason: null,
          dormantFromStatus: null,
        },
      ],
    )
    const r = await sweepChains({ now: NOW })
    expect(r).toEqual({ groups: 0, flagged: 0, noted: 0, restored: 1, errors: 0 })
    // The candidate read carries the jsonb predicates (V7) — the DSO rows and
    // the overridden rows are excluded before the cap, not after it in TS.
    const candidates = render(state.selectWheres[2])
    expect(candidates.sql).toContain(`"prospect"."verification" #>> '{fit,chain,status}' in ('shared_host', 'shared_phone')`)
    expect(candidates.sql).toContain(`coalesce("prospect"."verification" #>> '{fit,chainOverride,status}', '') = ''`)
    expect(candidates.sql).toContain(`coalesce("prospect"."verification" #>> '{fit,dso,status}', '') <> 'match'`)
    expect(candidates.params).toEqual(['disqualified', 'chain'])
    const w = prospectUpdates()
    expect(w).toHaveLength(1)
    expect(w[0].values).toMatchObject({ status: 'contacted', suppressedReason: null, suppressedAt: null, qualityScore: null })
    const chain = (w[0].values.verification as { fit: { chain: Record<string, unknown> } }).fit.chain
    expect(chain).toMatchObject({ status: 'cleared', clearedAt: NOW.toISOString(), kind: 'shared_phone', priorStatus: 'contacted' })
    expect(chain.detail).toMatch(/restored/)
    // The drip the flag stopped goes back to active, from now.
    expect(enrollmentUpdates()).toHaveLength(1)
    expect(enrollmentUpdates()[0].values).toEqual({ status: 'active', nextSendAt: NOW, stoppedAt: null, stopReason: null })
  })
})

describe('clearChainFlag — "Not a chain"', () => {
  const GOOD = {
    places: { status: 'matched', detail: null, checkedAt: AT, source: 'places' },
    business: { status: 'open', detail: null, checkedAt: AT, source: 'places' },
    npi: { status: 'active', detail: null, checkedAt: AT, source: 'nppes' },
    website: { status: 'alive', detail: null, checkedAt: AT, source: 'crawl' },
    phone: { status: 'well_formed', detail: null, checkedAt: AT, source: 'nanp', sources: ['nppes', 'places'], standing: 'corroborated' },
  }
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'pros_1',
    status: 'disqualified',
    suppressedReason: 'chain',
    verification: { ...GOOD, fit: { dso: { status: 'match', detail: 'x', checkedAt: AT, source: 'dso_list', name: 'Aspen Dental', matchedOn: 'practice', priorStatus: 'contacted' } } },
    verifiedAt: new Date(AT),
    phoneStatus: 'unknown',
    phoneLineType: null,
    businessStatus: 'OPERATIONAL',
    reviewCount: 40,
    websiteUrl: 'https://smile.com',
    nextFollowUpAt: null,
    followUpReason: null,
    dormantFromStatus: null,
    ...over,
  })

  it('refuses an unknown id, a merged shell and a row that is not flagged', async () => {
    state.selectQueue.push([])
    expect(await clearChainFlag('nope', NOW)).toEqual({ ok: false, reason: 'not_found' })
    state.selectQueue.push([row({ status: 'merged' })])
    expect(await clearChainFlag('pros_1', NOW)).toEqual({ ok: false, reason: 'merged' })
    state.selectQueue.push([row({ status: 'enriched', suppressedReason: null, verification: GOOD })])
    expect(await clearChainFlag('pros_1', NOW)).toEqual({ ok: false, reason: 'not_flagged' })
    expect(state.updates).toHaveLength(0)
  })

  it('stores the override, returns the row to where it was, clears the suppression, recomputes quality from the stored signals — and RESUMES the drip the flag stopped (F.1)', async () => {
    state.selectQueue.push([row()])
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'contacted' })
    const w = prospectUpdates()[0].values
    expect(w).toMatchObject({ status: 'contacted', suppressedReason: null, suppressedAt: null, updatedAt: NOW })
    const fit = (w.verification as { fit: Record<string, { status: string; source: string; checkedAt: string }> }).fit
    expect(fit.chainOverride).toMatchObject({ status: 'not_a_chain', source: 'owner', checkedAt: NOW.toISOString() })
    expect(fit.dso.status).toBe('match') // the record of what was found stays; the override outranks it
    // 35 + 20 + 15 + 10 + 10 = 90 — the pass's signals, scored again under the restored status.
    expect(w).toMatchObject({ qualityScore: 90, qualityBand: 'best' })
    // No system follow-up was remembered: none is invented.
    expect(w).not.toHaveProperty('nextFollowUpAt')
    // The enrollment the flag stopped (stop_reason verify_chain) is active again, its next step from now.
    expect(enrollmentUpdates()).toHaveLength(1)
    expect(enrollmentUpdates()[0].values).toEqual({ status: 'active', nextSendAt: NOW, stoppedAt: null, stopReason: null })
  })

  it('a queued row with an active drip: flagged → overridden → the drip active again AND the system follow-up back (due now when its time has passed) — the toast’s promise is true', async () => {
    const past = '2026-11-08T15:00:00.000Z'
    state.selectQueue.push([
      row({
        verification: { ...GOOD, fit: { chain: { status: 'shared_phone', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus: 'queued', priorFollowUp: { at: past, reason: 'No answer — try again' } } } },
      }),
    ])
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'queued' })
    expect(prospectUpdates()[0].values).toMatchObject({ status: 'queued', nextFollowUpAt: NOW, followUpReason: 'No answer — try again' })
    expect(enrollmentUpdates()[0].values).toMatchObject({ status: 'active', nextSendAt: NOW })
    // A follow-up still ahead keeps its time.
    state.updates = []
    const ahead = '2026-11-20T15:00:00.000Z'
    state.selectQueue.push([
      row({ verification: { ...GOOD, fit: { dso: { status: 'match', detail: 'x', checkedAt: AT, source: 'dso_list', name: 'Aspen Dental', priorStatus: 'contacted', priorFollowUp: { at: ahead, reason: 'Reached the desk — try for the decision maker' } } } } }),
    ])
    await clearChainFlag('pros_1', NOW)
    expect(prospectUpdates()[0].values).toMatchObject({ nextFollowUpAt: new Date(ahead), followUpReason: 'Reached the desk — try for the decision maker' })
  })

  it('a resting row set aside returns to RESTING with its origin intact, and the resting sentence goes back in front (E.6)', async () => {
    state.selectQueue.push(
      [row({ verification: { fit: { chain: { status: 'shared_phone', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus: 'dormant' } } }, verifiedAt: null })],
      // the reconcile's read, after the restore
      [{ status: 'dormant', qualityScore: null, qualityReasons: null, createdAt: new Date('2026-01-01T00:00:00Z'), lastTouchAt: '2026-07-13T15:00:00.000Z' }],
    )
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'dormant' })
    const [restore, resting] = prospectUpdates()
    expect(restore.values).toMatchObject({ status: 'dormant', suppressedReason: null })
    expect(restore.values).not.toHaveProperty('dormantFromStatus')
    expect((resting.values.qualityReasons as string[])[0]).toBe('No touch since Jul 13, 2026 UTC — resting')
  })

  it('a never-verified row reads "not verified yet" again; a sweep flag with no prior status goes back to enriched', async () => {
    state.selectQueue.push([
      row({
        verifiedAt: null,
        verification: { fit: { chain: { status: 'shared_host', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus: null } } },
      }),
    ])
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'enriched' })
    expect(prospectUpdates()[0].values).toMatchObject({ status: 'enriched', qualityScore: null, qualityBand: null, qualityReasons: null })
  })

  it('V10: a row holding a follow-up when the flag lifts KEEPS it — the remembered system nudge is put back only on a row with none; a human’s callback is never overwritten', async () => {
    const past = '2026-11-05T15:00:00.000Z'
    const flagged = { ...GOOD, fit: { chain: { status: 'shared_phone', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus: 'contacted', priorFollowUp: { at: past, reason: 'No answer — try again' } } } }
    // A callback someone promised while the row sat aside (or one a merge carried onto it).
    const promised = new Date('2026-11-14T15:00:00.000Z')
    state.selectQueue.push([row({ verification: flagged, nextFollowUpAt: promised, followUpReason: 'They asked for a callback' })])
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'contacted' })
    const w = prospectUpdates()[0].values
    expect(w).toMatchObject({ status: 'contacted', suppressedReason: null })
    expect(w).not.toHaveProperty('nextFollowUpAt')
    expect(w).not.toHaveProperty('followUpReason')
    // The same row with NO follow-up: the remembered system nudge goes back, due now.
    state.updates = []
    state.selectQueue.push([row({ verification: flagged })])
    await clearChainFlag('pros_1', NOW)
    expect(prospectUpdates()[0].values).toMatchObject({ nextFollowUpAt: NOW, followUpReason: 'No answer — try again' })
    // The sweep's un-flag follows the same rule.
    state.updates = []
    state.selectQueue.push([row({ verification: flagged, nextFollowUpAt: promised, followUpReason: 'They asked for a callback' })])
    expect(await restoreChainFlagged('pros_1', NOW, 'sweep')).toEqual({ ok: true, status: 'contacted' })
    expect(prospectUpdates()[0].values).not.toHaveProperty('nextFollowUpAt')
  })

  it('V11: a merge’s "at least" — the restore lands at the loser’s FURTHER status; a lesser or unranked one changes nothing; a resting memory ranks by where it came from and wakes to a further one', async () => {
    const flag = (priorStatus: string | null) => ({ ...GOOD, fit: { chain: { status: 'shared_phone', detail: null, checkedAt: AT, source: 'our_data', count: 3, priorStatus } } })
    // Flagged while enriched; the overridden loser was contacted.
    state.selectQueue.push([row({ verification: flag('enriched') })])
    expect(await restoreChainFlagged('pros_1', NOW, 'override', { atLeast: 'contacted' })).toEqual({ ok: true, status: 'contacted' })
    expect(prospectUpdates()[0].values).toMatchObject({ status: 'contacted', suppressedReason: null, dormantFromStatus: null })
    // Flagged while contacted; the loser was only enriched: the remembered status wins.
    state.updates = []
    state.selectQueue.push([row({ verification: flag('contacted') })])
    expect(await restoreChainFlagged('pros_1', NOW, 'override', { atLeast: 'enriched' })).toEqual({ ok: true, status: 'contacted' })
    expect(prospectUpdates()[0].values).toMatchObject({ status: 'contacted' })
    expect(prospectUpdates()[0].values).not.toHaveProperty('dormantFromStatus')
    // An unranked "at least" (terminal, resting, junk) never moves anything.
    state.updates = []
    state.selectQueue.push([row({ verification: flag('queued') })])
    expect(await restoreChainFlagged('pros_1', NOW, 'override', { atLeast: 'not_interested' })).toEqual({ ok: true, status: 'queued' })
    state.updates = []
    state.selectQueue.push([row({ verification: flag('queued') })])
    expect(await restoreChainFlagged('pros_1', NOW, 'override', { atLeast: null })).toEqual({ ok: true, status: 'queued' })
    // A resting memory ranks by where it came from: from queued, a contacted loser wakes it; from contacted, a queued loser leaves it resting.
    state.updates = []
    state.selectQueue.push([row({ verification: flag('dormant'), dormantFromStatus: 'queued', verifiedAt: null })])
    expect(await restoreChainFlagged('pros_1', NOW, 'override', { atLeast: 'contacted' })).toEqual({ ok: true, status: 'contacted' })
    expect(prospectUpdates()[0].values).toMatchObject({ status: 'contacted', dormantFromStatus: null })
    expect(prospectUpdates()).toHaveLength(1) // no resting reconcile: the row is awake
    state.updates = []
    state.selectQueue.push(
      [row({ verification: flag('dormant'), dormantFromStatus: 'contacted', verifiedAt: null })],
      [{ status: 'dormant', qualityScore: null, qualityReasons: null, createdAt: new Date('2026-01-01T00:00:00Z'), lastTouchAt: '2026-07-13T15:00:00.000Z' }],
    )
    expect(await restoreChainFlagged('pros_1', NOW, 'override', { atLeast: 'queued' })).toEqual({ ok: true, status: 'dormant' })
    expect(prospectUpdates()[0].values).toMatchObject({ status: 'dormant' })
    expect(prospectUpdates()[0].values).not.toHaveProperty('dormantFromStatus')
  })

  it('an override on a row that kept its status (a customer the sweep only noted) writes the override and nothing else', async () => {
    state.selectQueue.push([row({ status: 'not_interested', suppressedReason: null, verification: { fit: { chain: { status: 'shared_host', detail: null, checkedAt: AT, source: 'our_data', count: 3 } } } })])
    const r = await clearChainFlag('pros_1', NOW)
    expect(r).toEqual({ ok: true, status: 'not_interested' })
    const w = prospectUpdates()[0].values
    expect(w).not.toHaveProperty('suppressedReason')
    expect(w).not.toHaveProperty('qualityScore')
  })
})

describe('countChains', () => {
  it('rows disqualified with reason chain', async () => {
    state.selectQueue.push([{ n: 4 }])
    expect(await countChains()).toBe(4)
    state.selectQueue.push([])
    expect(await countChains()).toBe(0)
  })
})

describe('pullForwardHotTerritories — callers steer freshness', () => {
  const newest = new Date('2026-11-09T18:00:00Z')
  it('pulls a hot territory forward: the pull stamped with its honest reason and NOTHING ELSE moved (never last_refreshed_at — D.1); a cold one, a disabled state (C13) and a nameless one untouched', async () => {
    state.selectQueue.push([
      { state: 'TX', zipPrefix: '787', closed: 3, closedPractices: 2, newest },
      { state: 'TX', zipPrefix: '786', closed: 2, closedPractices: 2, newest },
      { state: 'GA', zipPrefix: '303', closed: 4, closedPractices: 4, newest }, // GA is not enabled
      { state: null, zipPrefix: '111', closed: 9, closedPractices: 9, newest },
    ])
    state.returning.push([{ id: 'pdt_1' }, { id: 'pdt_2' }])
    const r = await pullForwardHotTerritories({ now: NOW, config: LIVE })
    expect(r).toEqual([{ state: 'TX', zipPrefix: '787', closed: 3, tasks: 2, reason: '2 closed, 1 disconnected this month' }])
    const w = state.updates.filter((u) => u.table === 'prospectDiscoveryTask')
    expect(w).toHaveLength(1)
    expect(w[0].values).toEqual({ refreshPulledAt: NOW, refreshPulledReason: '2 closed, 1 disconnected this month' })
    expect(w[0].values).not.toHaveProperty('lastRefreshedAt')
  })
  it('a territory whose tasks were all already pulled, or swept since the newest call, reports nothing', async () => {
    state.selectQueue.push([{ state: 'TX', zipPrefix: '787', closed: 5, closedPractices: 0, newest }])
    state.returning.push([])
    expect(await pullForwardHotTerritories({ now: NOW, config: LIVE })).toEqual([])
  })
  it('no-ops on the kill switch', async () => {
    expect(await pullForwardHotTerritories({ now: NOW, config: { ...LIVE, killSwitch: true } })).toEqual([])
    expect(state.updates).toHaveLength(0)
  })
})
