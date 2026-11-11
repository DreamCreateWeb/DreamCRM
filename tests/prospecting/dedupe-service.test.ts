import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * DEDUPE THAT CANNOT LOSE DATA (P-03) — the service. The survivor rule
 * with the converted exception, every FK re-pointed, the two unique-index
 * collisions handled (one live enrollment, one contact per email), the
 * survivor filled from the loser, the loser stamped and KEPT, the sweep
 * merging only exact pairs under its cap, and the merge-chain follow.
 */

type Op = { op: string; table: string; values?: Record<string, unknown>; where?: unknown }
const state = {
  selectQueue: [] as unknown[][],
  /** The WHERE each select carried, in order (rendered where a test cares). */
  selectWheres: [] as unknown[],
  ops: [] as Op[],
  /** rows `.returning()` reports per table (how many moved). */
  returning: {} as Record<string, number>,
}

// The cold-caller predicate and the release hook (P-02) are their own module
// with their own rendered tests; here the predicate is a spy that returns no
// clause (so the hand-over read's WHERE renders without it) and the hook is a
// spy, so every write below stays the merge's own.
const callerMocks = vi.hoisted(() => ({
  servable: vi.fn((_now: Date) => undefined),
  release: vi.fn(async (_id: string, _now?: Date) => false),
}))
vi.mock('@/lib/services/prospect-caller-release', () => ({
  callerServableWhere: callerMocks.servable,
  releaseIfUnservable: callerMocks.release,
  releaseCooldownUntil: (now: Date) => new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
}))
const configMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/services/prospecting', () => ({
  getProspectingConfig: configMock,
  // The real restore (run un-mocked in the F.2(b) tests below) imports
  // these; it never calls them on a restore.
  stopActiveEnrollments: vi.fn(),
  clearSystemFollowUp: vi.fn(),
  // The real verify pass (run on a MERGED row in the Y2 test below) reads
  // the month counter and the config through these.
  counterMonth: () => '2026-11',
  getProspectingCounter: vi.fn(async () => 0),
  bumpProspectingCounter: vi.fn(async () => {}),
  pauseActiveEnrollments: vi.fn(),
  resumeVerifyPausedEnrollments: vi.fn(),
}))
// The verify pass's network edges, spies: the Y2 test hands the listing in
// and the merged row has no NPI, no website and the line check off.
vi.mock('@/lib/nppes', () => ({ lookupNpi: vi.fn(), searchDentistsAtAddress: vi.fn() }))
vi.mock('@/lib/google-places', () => ({ findDentalPlaceCandidates: vi.fn(), placesConfigured: () => true }))
vi.mock('@/lib/services/prospect-site-liveness', () => ({ checkSiteLiveness: vi.fn() }))
vi.mock('@/lib/services/phone-validate', () => ({ phoneValidateDriver: () => 'none', validatePhoneLine: vi.fn() }))
// The one chain restore (P-04 fix pass) is its own module with its own
// tests; here it is a spy, so the merge's writes stay its own — except in
// the F.2(b) tests that hand the spy the REAL restore (V10 / V11), so the
// merge and the restore are seen working on one row together.
const fitMocks = vi.hoisted(() => ({
  restore: vi.fn<typeof import('@/lib/services/prospect-fit').restoreChainFlagged>(async () => ({ ok: true as const, status: 'contacted' })),
}))
vi.mock('@/lib/services/prospect-fit', () => ({ restoreChainFlagged: fitMocks.restore }))
// The engine's failure registry (W8: a restore that throws after the merge
// committed is a strike, never a throw out of the merge).
const strikeMock = vi.hoisted(() => vi.fn(async (_cls: string, _at?: Date, _context?: unknown) => true))
vi.mock('@/lib/services/engine-failures', () => ({ reportProspectingFailure: strikeMock }))

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const tableName = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const selectChain = () => {
    const obj: any = {}
    for (const m of ['from', 'orderBy', 'limit', 'groupBy', 'having', 'for']) obj[m] = () => obj
    obj.where = (w: unknown) => {
      state.selectWheres.push(w)
      return obj
    }
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  const writeChain = (op: string, table: string, values?: Record<string, unknown>) => {
    const done: Op = { op, table, values }
    const p: any = {
      where: (where: unknown) => {
        done.where = where
        state.ops.push(done)
        const q: any = Promise.resolve(undefined)
        q.returning = async () => Array.from({ length: state.returning[table] ?? 0 }, (_, i) => ({ id: `${table}_${i}` }))
        return q
      },
    }
    return p
  }
  const conn = {
    select: () => selectChain(),
    update: (t: unknown) => ({ set: (values: Record<string, unknown>) => writeChain('update', tableName(t), values) }),
    delete: (t: unknown) => writeChain('delete', tableName(t)),
  }
  return {
    db: { ...conn, transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(conn) },
    schema,
  }
})

import { PgDialect } from 'drizzle-orm/pg-core'
import {
  chooseSurvivor,
  findDuplicateCandidates,
  mergeDuplicateProspects,
  mergeProspects,
  runExactDedupeSweep,
  survivorOf,
} from '@/lib/services/prospect-dedupe'
import { newVerifyRunCtx, verifyProspectSignals } from '@/lib/services/prospect-verify'
import { PROSPECTING_DEFAULTS, parseVerification } from '@/lib/types/prospecting'

const NOW = new Date('2026-11-10T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const CONFIG = { ...PROSPECTING_DEFAULTS, killSwitch: false }
const render = (q: unknown) => new PgDialect().sqlToQuery(q as never)

function prospect(over: Record<string, unknown>) {
  return {
    id: 'pros_x',
    name: 'Smile Dental PC',
    phone: '4045551212',
    googlePlaceId: null,
    postalCode: '30309',
    city: 'Atlanta',
    state: 'GA',
    status: 'enriched',
    email: null,
    emailSource: null,
    websiteUrl: null,
    qualityScore: null,
    verifiedAt: null,
    intentSignal: null,
    intentAt: null,
    intentSummary: null,
    talkingPoints: null,
    nextFollowUpAt: null,
    followUpReason: null,
    dormantFromStatus: null,
    mergedIntoProspectId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}
const updates = (table: string) => state.ops.filter((o) => o.op === 'update' && o.table === table)

beforeEach(() => {
  state.selectQueue = []
  state.selectWheres = []
  state.ops = []
  state.returning = {}
  callerMocks.servable.mockClear()
  callerMocks.release.mockClear()
  configMock.mockReset()
  configMock.mockResolvedValue(CONFIG)
  fitMocks.restore.mockClear()
})

describe('survivorOf', () => {
  it('follows a merge chain to the row that kept the history, and stops on a cycle', async () => {
    state.selectQueue.push([{ status: 'merged', mergedInto: 'pros_b' }], [{ status: 'merged', mergedInto: 'pros_c' }], [{ status: 'enriched', mergedInto: null }])
    expect(await survivorOf('pros_a')).toBe('pros_c')
    state.selectQueue.push([{ status: 'merged', mergedInto: 'pros_a' }])
    expect(await survivorOf('pros_a')).toBe('pros_a')
  })
})

describe('chooseSurvivor', () => {
  it('a converted prospect is a real clinic — always the survivor; two of them never merge', () => {
    const live = prospect({ id: 'a', qualityScore: 95 })
    const won = prospect({ id: 'b', status: 'converted', qualityScore: 10 })
    expect(chooseSurvivor([live, won] as never)?.id).toBe('b')
    expect(chooseSurvivor([won, prospect({ id: 'c', status: 'converted' })] as never)).toBeNull()
    expect(chooseSurvivor([live, prospect({ id: 'c', qualityScore: 50 })] as never)?.id).toBe('a')
  })
})

describe('findDuplicateCandidates', () => {
  it('offers rows sharing a key with reasons, exact ones first, and skips a ZIP neighbour with another name', async () => {
    state.selectQueue.push(
      [prospect({ id: 'me', googlePlaceId: 'place_1' })],
      [
        prospect({ id: 'zip_neighbour', name: 'Bright Orthodontics', phone: '4045550000' }),
        prospect({ id: 'by_name', name: 'Smile Dental, P.C.', phone: '4045559999' }),
        prospect({ id: 'by_place', name: 'Roe Dental', phone: null, googlePlaceId: 'place_1', postalCode: '30092' }),
      ],
    )
    const out = await findDuplicateCandidates('me')
    expect(out.map((c) => c.id)).toEqual(['by_place', 'by_name'])
    expect(out[0]).toMatchObject({ exact: true, reasons: ['same Google listing'] })
    expect(out[1]).toMatchObject({ exact: false, reasons: ['same name and ZIP'] })
  })
  it('a merged row has no candidates — it already went somewhere', async () => {
    state.selectQueue.push([prospect({ id: 'me', status: 'merged' })])
    expect(await findDuplicateCandidates('me')).toEqual([])
  })
})

describe('mergeProspects — the refusals', () => {
  it('same row · not found · already merged · a converted loser · a terminal loser beside a clinic', async () => {
    expect(await mergeProspects('a', 'a')).toEqual({ ok: false, reason: 'same_row' })
    state.selectQueue.push([prospect({ id: 'a' })])
    expect(await mergeProspects('a', 'b')).toEqual({ ok: false, reason: 'not_found' })
    state.selectQueue.push([prospect({ id: 'a' }), prospect({ id: 'b', status: 'merged' })])
    expect(await mergeProspects('a', 'b')).toEqual({ ok: false, reason: 'already_merged' })
    state.selectQueue.push([prospect({ id: 'a' }), prospect({ id: 'b', status: 'converted' })])
    expect(await mergeProspects('a', 'b')).toEqual({ ok: false, reason: 'loser_converted' })
    // A practice that said no cannot fold into a clinic: its "no" would be
    // overwritten by a merge and it is not the clinic's.
    state.selectQueue.push([prospect({ id: 'a', status: 'converted' }), prospect({ id: 'b', status: 'not_interested' })])
    expect(await mergeProspects('a', 'b')).toEqual({ ok: false, reason: 'loser_terminal' })
    expect(state.ops).toEqual([])
  })

  it('reads both rows INSIDE the transaction, locked — nothing is decided on a read from before it', async () => {
    const seen: string[] = []
    const mod = (await import('@/lib/db')) as unknown as { db: Record<string, unknown> & { transaction: unknown } }
    const realTx = mod.db.transaction
    mod.db.transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
      seen.push('tx-open')
      return fn({
        ...mod.db,
        select: () => {
          seen.push('select-in-tx')
          const obj: any = {}
          for (const m of ['from', 'where', 'orderBy', 'limit']) obj[m] = () => obj
          obj.for = (mode: string) => {
            seen.push(`for-${mode}`)
            return obj
          }
          obj.then = (onF: (v: unknown) => unknown) => Promise.resolve(state.selectQueue.shift() ?? []).then(onF)
          return obj
        },
      })
    }
    try {
      state.selectQueue.push([prospect({ id: 'a' }), prospect({ id: 'b', status: 'merged' })])
      expect(await mergeProspects('a', 'b')).toEqual({ ok: false, reason: 'already_merged' })
      expect(seen).toEqual(['tx-open', 'select-in-tx', 'for-update'])
    } finally {
      mod.db.transaction = realTx
    }
  })
})

describe('mergeProspects — the merge', () => {
  it('re-points every FK, honours both unique indexes, fills the survivor, keeps the loser', async () => {
    const survivor = prospect({ id: 'a', qualityScore: 85, email: null })
    const loser = prospect({
      id: 'b',
      name: 'Smile Dental, P.C.',
      status: 'call_list',
      email: 'drjane@smile.com',
      emailSource: 'crawl_mailto',
      websiteUrl: 'https://smile.com',
      intentSignal: 'reply_interested',
      intentAt: new Date('2026-11-01T00:00:00Z'),
      intentSummary: 'Wants a demo',
      talkingPoints: ['asked about pricing'],
      nextFollowUpAt: new Date('2026-11-12T00:00:00Z'),
      followUpReason: 'Callback promised',
    })
    state.selectQueue.push(
      [survivor, loser], // the two rows
      [{ email: 'office@smile.com' }], // survivor's contacts
      [
        { id: 'c_dup', email: 'office@smile.com' },
        { id: 'c_new', email: 'drjane@smile.com' },
      ], // loser's contacts
      [{ id: 'oenr_live' }], // the survivor already has a live drip
    )
    // Keyed by the schema export the mock resolves a table to.
    state.returning = { outreachEnrollment: 2, prospectCallLog: 3, prospectMeeting: 1, outreachTouchLog: 4, outreachEvent: 5, prospectSuppression: 0, practiceGrade: 1, eventCapture: 0 }

    const r = await mergeProspects('a', 'b', { now: NOW })
    expect(r).toMatchObject({ ok: true, survivorId: 'a', loserId: 'b' })
    if (!r.ok) throw new Error('refused')
    expect(r.moved).toEqual({
      prospect_contact: 1,
      outreach_enrollment: 2,
      prospect_call_log: 3,
      prospect_meeting: 1,
      outreach_touch_log: 4,
      outreach_event: 5,
      prospect_suppression: 0,
      practice_grade: 1,
      event_capture: 0,
    })

    // Contacts: the address the survivor already held goes (it stays on the
    // survivor's row); the new one moves and loses its primary flag.
    expect(state.ops.filter((o) => o.op === 'delete').map(({ op, table }) => ({ op, table }))).toEqual([{ op: 'delete', table: 'prospectContact' }])
    expect(updates('prospectContact')[0].values).toMatchObject({ prospectId: 'a', isPrimary: 0 })

    // Enrollments: the loser's live drip stops (reason merged), then every
    // enrollment row re-points.
    const enr = updates('outreachEnrollment')
    expect(enr[0].values).toMatchObject({ status: 'stopped_manual', stopReason: 'merged' })
    expect(enr[1].values).toEqual({ prospectId: 'a' })

    // Every other table that names the loser.
    for (const t of ['prospectCallLog', 'prospectMeeting', 'outreachTouchLog', 'outreachEvent', 'prospectSuppression', 'practiceGrade', 'eventCapture']) {
      expect(updates(t).length, t).toBe(1)
      expect(updates(t)[0].values).toMatchObject({ prospectId: 'a' })
    }

    // The survivor takes what it lacked — and the hand-raiser's signal.
    const [survivorWrite, loserWrite] = updates('prospect')
    expect(survivorWrite.values).toMatchObject({
      email: 'drjane@smile.com',
      emailSource: 'crawl_mailto',
      websiteUrl: 'https://smile.com',
      status: 'call_list',
      intentSignal: 'reply_interested',
      intentSummary: 'Wants a demo',
      nextFollowUpAt: loser.nextFollowUpAt,
      followUpReason: 'Callback promised',
    })
    expect(survivorWrite.values).not.toHaveProperty('name') // its own name stands
    expect(survivorWrite.values).not.toHaveProperty('qualityScore') // had one
    // The loser rests under its survivor — stamped, never deleted.
    expect(loserWrite.values).toMatchObject({ status: 'merged', mergedIntoProspectId: 'a', nextFollowUpAt: null })
    expect(state.ops.some((o) => o.op === 'delete' && o.table === 'prospect')).toBe(false)
  })

  it('never moves the survivor backward, and never lets a merge move a converted survivor at all', async () => {
    state.selectQueue.push([prospect({ id: 'a', status: 'call_list' }), prospect({ id: 'b', status: 'enriched' })], [], [], [])
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).not.toHaveProperty('status')

    state.ops = []
    state.selectQueue.push([prospect({ id: 'a', status: 'converted' }), prospect({ id: 'b', status: 'call_list' })], [], [], [])
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).not.toHaveProperty('status')
  })

  it('a resting loser wakes into the survivor at the status it came from', async () => {
    state.selectQueue.push(
      [prospect({ id: 'a', status: 'enriched' }), prospect({ id: 'b', status: 'dormant', dormantFromStatus: 'contacted' })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).toMatchObject({ status: 'contacted', dormantFromStatus: null })
  })

  it('without a live drip on the survivor, the loser’s enrollments simply re-point', async () => {
    state.selectQueue.push([prospect({ id: 'a' }), prospect({ id: 'b' })], [], [], [] /* no live enrollment */)
    await mergeProspects('a', 'b', { now: NOW })
    const enr = updates('outreachEnrollment')
    expect(enr).toHaveLength(1)
    expect(enr[0].values).toEqual({ prospectId: 'a' })
  })

  it('the NPI MOVES: cleared on the loser before the survivor takes it (the unique index never sees it twice)', async () => {
    state.selectQueue.push(
      [prospect({ id: 'a', npiNumber: null, qualityScore: 90 }), prospect({ id: 'b', npiNumber: '1234567890', qualityScore: 60 })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    const writes = updates('prospect')
    expect(writes).toHaveLength(3)
    expect(writes[0].values).toEqual({ npiNumber: null, updatedAt: NOW }) // the loser, first
    expect(writes[1].values).toMatchObject({ npiNumber: '1234567890' }) // then the survivor
    expect(writes[2].values).toMatchObject({ status: 'merged', mergedIntoProspectId: 'a' })
  })

  it('the phone travels WITH its verdict — a disconnected number never lands as "unknown"', async () => {
    const disconnected = { status: 'disconnected', detail: 'The caller heard a disconnect tone', checkedAt: '2026-11-01T00:00:00.000Z', source: 'caller' }
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: null, phoneStatus: 'unknown', phoneLineType: null, phoneSource: null, phoneValidatedAt: null, verification: { npi: { status: 'active', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'nppes' } } }),
        prospect({ id: 'b', phone: '4045551234', phoneStatus: 'disconnected', phoneLineType: null, phoneSource: 'caller', phoneValidatedAt: new Date('2026-11-01T00:00:00Z'), verification: { phone: disconnected } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    const survivorWrite = updates('prospect')[0].values!
    expect(survivorWrite).toMatchObject({ phone: '4045551234', phoneStatus: 'disconnected', phoneSource: 'caller' })
    expect(survivorWrite.verification).toEqual({
      npi: { status: 'active', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'nppes' },
      phone: disconnected,
    })
  })

  it('a loser’s LIVE drip is stopped, never re-pointed, when the survivor said no / is gone / unsubscribed / became a clinic', async () => {
    for (const status of ['not_interested', 'disqualified', 'suppressed', 'converted']) {
      state.ops = []
      state.selectQueue.push([prospect({ id: 'a', status }), prospect({ id: 'b', status: 'contacted' })], [], [], [] /* survivor has no live drip */)
      await mergeProspects('a', 'b', { now: NOW })
      const enr = updates('outreachEnrollment')
      expect(enr[0].values, status).toMatchObject({ status: 'stopped_manual', stopReason: 'merged' })
      expect(enr[1].values, status).toEqual({ prospectId: 'a' })
      // …and the survivor keeps its status, takes no follow-up, intent or draft.
      const s = updates('prospect')[0].values
      expect(s, status).not.toHaveProperty('status')
      expect(s, status).not.toHaveProperty('intentSignal')
    }
  })

  it('the owner’s "Not a chain" rules a merge (F.2): an overridden survivor never inherits a chain-flagged loser’s verdict, keeps its status, keeps the override', async () => {
    const AT = '2026-11-09T00:00:00.000Z'
    const override = { status: 'not_a_chain', detail: 'by hand', checkedAt: AT, source: 'owner' }
    const flag = { status: 'shared_phone', detail: 'shares', checkedAt: AT, source: 'our_data', kind: 'shared_phone', count: 3, priorStatus: 'enriched' }
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'contacted', qualityScore: 90, verification: { fit: { chainOverride: override } } }),
        prospect({ id: 'b', status: 'disqualified', suppressedReason: 'chain', suppressedAt: new Date(AT), qualityScore: 0, verification: { fit: { chain: flag } } }),
      ],
      [], [], [], // no contacts, no live drip on the survivor
    )
    const r = await mergeProspects('a', 'b', { now: NOW })
    expect(r).toMatchObject({ ok: true })
    const s = updates('prospect')[0].values
    expect(s).not.toHaveProperty('status')
    expect(s).not.toHaveProperty('suppressedReason')
    expect(s).not.toHaveProperty('suppressedAt')
    // The loser's drip (none here) would re-point, never stop "merged_disqualified"; no thread of the survivor's closes.
    expect(updates('outreachEnrollment').some((u) => u.values?.stopReason === 'merged_disqualified')).toBe(false)
    expect(fitMocks.restore).not.toHaveBeenCalled()
  })

  it('…and the other direction: a chain-flagged survivor takes the loser’s override and is RESTORED through the one restore (never left set aside with an override on it)', async () => {
    const AT = '2026-11-09T00:00:00.000Z'
    const override = { status: 'not_a_chain', detail: 'by hand', checkedAt: AT, source: 'owner' }
    const flag = { status: 'shared_phone', detail: 'shares', checkedAt: AT, source: 'our_data', kind: 'shared_phone', count: 3, priorStatus: 'contacted' }
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'disqualified', suppressedReason: 'chain', suppressedAt: new Date(AT), qualityScore: 0, verifiedAt: new Date(AT), verification: { fit: { chain: flag } } }),
        prospect({ id: 'b', status: 'contacted', qualityScore: null, verification: { fit: { chainOverride: override } } }),
      ],
      [], [], [],
    )
    const r = await mergeProspects('a', 'b', { now: NOW })
    expect(r).toMatchObject({ ok: true })
    const s = updates('prospect')[0].values!
    const fit = (s.verification as { fit: Record<string, unknown> }).fit
    expect(fit.chainOverride).toEqual(override)
    expect(fit.chain).toMatchObject(flag)
    // The loser's live drip is NOT stopped as "merged" on the way in: the survivor is about to be live again.
    expect(updates('outreachEnrollment').some((u) => u.values?.stopReason === 'merged')).toBe(false)
    // Both sides contacted: no "at least" for the restore (V11).
    expect(fitMocks.restore).toHaveBeenCalledWith('a', NOW, 'override', { atLeast: null })
  })

  it('F.2(b) with the REAL restore (V10 + V11): survivor sweep-flagged while enriched, loser contacted + override + a live drip + caller X + a promised callback → the merged row is CONTACTED, the drip stays live, the callback survives the restore, and X keeps it through the hand-over on the RESTORED row', async () => {
    const actual = await vi.importActual<typeof import('@/lib/services/prospect-fit')>('@/lib/services/prospect-fit')
    fitMocks.restore.mockImplementationOnce((id, now, mode, opts) => actual.restoreChainFlagged(id, now, mode, opts))
    const AT = '2026-11-09T00:00:00.000Z'
    const override = { status: 'not_a_chain', detail: 'by hand', checkedAt: AT, source: 'owner' }
    const flag = {
      status: 'shared_phone', detail: 'shares', checkedAt: AT, source: 'our_data', kind: 'shared_phone', count: 3, key: '4045551212',
      priorStatus: 'enriched',
      // The system nudge the flag cleared — its time has passed.
      priorFollowUp: { at: '2026-11-05T15:00:00.000Z', reason: 'No answer — try again' },
    }
    const signals = {
      places: { status: 'matched', detail: null, checkedAt: AT, source: 'places' },
      business: { status: 'open', detail: null, checkedAt: AT, source: 'places' },
      npi: { status: 'active', detail: null, checkedAt: AT, source: 'nppes' },
      website: { status: 'alive', detail: null, checkedAt: AT, source: 'crawl' },
      phone: { status: 'well_formed', detail: null, checkedAt: AT, source: 'nanp', sources: ['nppes', 'places'], standing: 'corroborated' },
    }
    const promised = new Date('2026-11-14T15:00:00.000Z')
    const heldSince = new Date('2026-11-08T00:00:00Z')
    const survivor = prospect({
      id: 'a', status: 'disqualified', suppressedReason: 'chain', suppressedAt: new Date(AT), qualityScore: 0, verifiedAt: new Date(AT),
      verification: { ...signals, fit: { chain: flag } }, nextFollowUpAt: null, followUpReason: null,
      phoneStatus: 'unknown', phoneLineType: null, businessStatus: 'OPERATIONAL', reviewCount: 40, websiteUrl: 'https://smile.com',
    })
    const loser = prospect({
      id: 'b', status: 'contacted', qualityScore: 80, verification: { fit: { chainOverride: override } },
      assignedCallerId: 'pcal_x', assignedAt: heldSince,
      nextFollowUpAt: promised, followUpReason: 'They asked for a callback',
      intentSignal: 'clicked', intentAt: new Date('2026-11-07T00:00:00Z'), intentSummary: 'Clicked the pricing link',
    })
    state.selectQueue.push(
      [survivor, loser],
      [], [], [], // no contacts, no live drip on the survivor (the loser's re-points)
      // The restore's read: the row as the merge left it — still set aside,
      // the override on it, the loser's callback carried onto it.
      [
        {
          id: 'a', status: 'disqualified', suppressedReason: 'chain', verifiedAt: new Date(AT),
          verification: { ...signals, fit: { chain: flag, chainOverride: override } },
          phoneStatus: 'unknown', phoneLineType: null, businessStatus: 'OPERATIONAL', reviewCount: 40, websiteUrl: 'https://smile.com',
          nextFollowUpAt: promised, followUpReason: 'They asked for a callback', dormantFromStatus: null,
        },
      ],
      // The hand-over read, AFTER the restore: the survivor passes the one predicate.
      [{ id: 'a' }],
    )
    const r = await mergeProspects('a', 'b', { now: NOW })
    expect(r).toMatchObject({ ok: true, survivorId: 'a', loserId: 'b' })

    const [fill, merged, restore, carry] = updates('prospect')
    // Inside the transaction: the survivor is NOT moved by status (the restore
    // owns that), the override lands, the callback and the intent carry, and
    // no caller is written blind.
    expect(fill.values).not.toHaveProperty('status')
    expect((fill.values!.verification as { fit: Record<string, unknown> }).fit.chainOverride).toEqual(override)
    expect(fill.values).toMatchObject({ nextFollowUpAt: promised, followUpReason: 'They asked for a callback', intentSignal: 'clicked', intentSummary: 'Clicked the pricing link' })
    expect(fill.values).not.toHaveProperty('assignedCallerId')
    expect(merged.values).toMatchObject({ status: 'merged', mergedIntoProspectId: 'a', assignedCallerId: null })
    // The loser's live drip re-points, never stopped as "merged".
    expect(updates('outreachEnrollment').some((u) => u.values?.stopReason === 'merged')).toBe(false)
    expect(updates('outreachEnrollment')[0].values).toEqual({ prospectId: 'a' })
    // The REAL restore ran with the loser's further status as its "at least":
    // the merged practice is CONTACTED, the suppression clears, quality is
    // recomputed under the restored status — and the carried callback is
    // left alone (V10): no stale system nudge over a human's promise.
    expect(fitMocks.restore).toHaveBeenCalledWith('a', NOW, 'override', { atLeast: 'contacted' })
    expect(restore.values).toMatchObject({ status: 'contacted', suppressedReason: null, suppressedAt: null, dormantFromStatus: null })
    expect(restore.values!.qualityScore).toBeGreaterThan(0)
    expect(restore.values).not.toHaveProperty('nextFollowUpAt')
    expect(restore.values).not.toHaveProperty('followUpReason')
    expect((restore.values!.verification as { fit: Record<string, unknown> }).fit.chainOverride).toEqual(override)
    // The restore's resume of a chain-stopped drip runs (its WHERE keeps it
    // idle while the loser's drip is live).
    expect(updates('outreachEnrollment').at(-1)!.values).toEqual({ status: 'active', nextSendAt: NOW, stoppedAt: null, stopReason: null })
    // The hand-over ran AFTER the restore, against the restored row, through
    // P-02's one predicate — X keeps the practice.
    expect(carry.values).toMatchObject({ assignedCallerId: 'pcal_x', assignedAt: heldSince, callerCooldownUntil: null })
    expect(render(carry.where).sql).toContain('"prospect"."assigned_caller_id" is null')
    expect(callerMocks.servable).toHaveBeenCalledWith(NOW)
    const handover = render(state.selectWheres.at(-1))
    expect(handover.sql).toContain('"prospect"."id" = $1')
    expect(handover.sql).toContain('"prospect"."assigned_caller_id" is null')
    expect(handover.params).toEqual(['a'])
    expect(updates('prospect')).toHaveLength(4) // no cooldown write: the slot was carried
    expect(callerMocks.release).toHaveBeenCalledWith('a', NOW)
  })

  it('F.2(b) with the REAL restore, the other way round: the loser is no further along and holds no follow-up → the restore returns the survivor to where it was and puts the remembered system nudge back (due now); a hand-over the restored row REFUSES releases the slot with the cooldown', async () => {
    const actual = await vi.importActual<typeof import('@/lib/services/prospect-fit')>('@/lib/services/prospect-fit')
    fitMocks.restore.mockImplementationOnce((id, now, mode, opts) => actual.restoreChainFlagged(id, now, mode, opts))
    const AT = '2026-11-09T00:00:00.000Z'
    const override = { status: 'not_a_chain', detail: 'by hand', checkedAt: AT, source: 'owner' }
    const flag = {
      status: 'shared_phone', detail: 'shares', checkedAt: AT, source: 'our_data', kind: 'shared_phone', count: 3, key: '4045551212',
      priorStatus: 'queued',
      priorFollowUp: { at: '2026-11-05T15:00:00.000Z', reason: 'No answer — try again' },
    }
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'disqualified', suppressedReason: 'chain', suppressedAt: new Date(AT), qualityScore: 0, verifiedAt: null, verification: { fit: { chain: flag } } }),
        prospect({ id: 'b', status: 'enriched', qualityScore: 70, verification: { fit: { chainOverride: override } }, assignedCallerId: 'pcal_x', assignedAt: NOW }),
      ],
      [], [], [],
      [
        {
          id: 'a', status: 'disqualified', suppressedReason: 'chain', verifiedAt: null,
          verification: { fit: { chain: flag, chainOverride: override } },
          phoneStatus: 'unknown', phoneLineType: null, businessStatus: null, reviewCount: null, websiteUrl: null,
          nextFollowUpAt: null, followUpReason: null, dormantFromStatus: null,
        },
      ],
      [], // the hand-over read: the restored row fails the predicate (say, a bad number)
    )
    await mergeProspects('a', 'b', { now: NOW })
    const [fill, merged, restore, cooldown] = updates('prospect')
    expect(fill.values).not.toHaveProperty('status')
    expect(merged.values).toMatchObject({ status: 'merged' })
    // queued (remembered) outranks the loser's enriched: no "at least".
    expect(fitMocks.restore).toHaveBeenCalledWith('a', NOW, 'override', { atLeast: null })
    expect(restore.values).toMatchObject({ status: 'queued', suppressedReason: null, qualityScore: null, nextFollowUpAt: NOW, followUpReason: 'No answer — try again' })
    expect(cooldown.values).toEqual({ callerCooldownUntil: new Date(NOW.getTime() + 3 * DAY), updatedAt: NOW })
    expect(render(cooldown.where).sql).toContain('"prospect"."assigned_caller_id" is null')
    expect(callerMocks.release).toHaveBeenCalledWith('a', NOW)
  })

  it('W8: the restore THROWS after the merge committed → no throw out of the merge, a strike with one line of context, the hand-over still runs (refused against the still-disqualified row → the cooldown), the release hook runs, the merge result returned', async () => {
    fitMocks.restore.mockRejectedValueOnce(new Error('connection reset'))
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const AT = '2026-11-09T00:00:00.000Z'
    const override = { status: 'not_a_chain', detail: 'by hand', checkedAt: AT, source: 'owner' }
    const flag = { status: 'shared_phone', detail: 'shares', checkedAt: AT, source: 'our_data', kind: 'shared_phone', count: 3, key: '4045551212', priorStatus: 'enriched' }
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'disqualified', suppressedReason: 'chain', suppressedAt: new Date(AT), qualityScore: 0, verifiedAt: new Date(AT), verification: { fit: { chain: flag } } }),
        prospect({ id: 'b', status: 'contacted', qualityScore: 80, verification: { fit: { chainOverride: override } }, assignedCallerId: 'pcal_x', assignedAt: NOW }),
      ],
      [], [], [],
      [], // the hand-over read: the row still reads disqualified — the predicate refuses
    )
    let result: unknown
    try {
      result = await mergeProspects('a', 'b', { now: NOW })
    } finally {
      quiet.mockRestore()
    }
    expect(result).toMatchObject({ ok: true, survivorId: 'a', loserId: 'b' })
    expect(fitMocks.restore).toHaveBeenCalledWith('a', NOW, 'override', { atLeast: 'contacted' })
    // The strike: the hygiene class, the row and the error in the context.
    expect(strikeMock).toHaveBeenCalledTimes(1)
    expect(strikeMock).toHaveBeenCalledWith('hygiene', NOW, { step: 'restore_after_merge', prospectId: 'a', loserId: 'b', error: 'connection reset' })
    // The hand-over ran against the still-disqualified row, was refused, and
    // the cooldown was written — X's slot is not lost silently.
    const [fill, merged, cooldown] = updates('prospect')
    expect(fill.values).not.toHaveProperty('assignedCallerId')
    expect(merged.values).toMatchObject({ status: 'merged', mergedIntoProspectId: 'a', assignedCallerId: null })
    expect(cooldown.values).toEqual({ callerCooldownUntil: new Date(NOW.getTime() + 3 * DAY), updatedAt: NOW })
    expect(render(cooldown.where).sql).toContain('"prospect"."assigned_caller_id" is null')
    expect(updates('prospect')).toHaveLength(3)
    expect(callerMocks.release).toHaveBeenCalledWith('a', NOW)
    // …and a failing strike itself never escapes either.
    strikeMock.mockRejectedValueOnce(new Error('ledger down'))
    fitMocks.restore.mockRejectedValueOnce(new Error('again'))
    const quiet2 = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'disqualified', suppressedReason: 'chain', suppressedAt: new Date(AT), qualityScore: 0, verifiedAt: new Date(AT), verification: { fit: { chain: flag } } }),
        prospect({ id: 'b', status: 'contacted', qualityScore: 80, verification: { fit: { chainOverride: override } } }),
      ],
      [], [], [],
    )
    try {
      expect(await mergeProspects('a', 'b', { now: NOW })).toMatchObject({ ok: true })
    } finally {
      quiet2.mockRestore()
    }
  })

  it('a loser’s terminal verdict is CARRIED onto a live survivor — status, reason, its threads closed — never overwritten by "merged"', async () => {
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'enriched', qualityScore: 75, assignedCallerId: 'pcal_1', assignedAt: NOW }),
        prospect({ id: 'b', status: 'not_interested', qualityScore: 60, lostReason: 'replied_no', outcomeAt: new Date('2026-10-01T00:00:00Z') }),
      ],
      [], [], [{ id: 'oenr_live' }], // the survivor's own live drip
    )
    await mergeProspects('a', 'b', { now: NOW })
    const enr = updates('outreachEnrollment')
    expect(enr[0].values).toMatchObject({ status: 'stopped_manual', stopReason: 'merged' }) // the loser's
    expect(enr[1].values).toMatchObject({ status: 'stopped_manual', stopReason: 'merged_not_interested' }) // the survivor's own
    expect(enr[2].values).toEqual({ prospectId: 'a' })
    const s = updates('prospect')[0].values
    expect(s).toMatchObject({ status: 'not_interested', lostReason: 'replied_no', outcomeAt: new Date('2026-10-01T00:00:00Z'), nextFollowUpAt: null, replyDraft: null })
    // A closed thread frees the cold caller's slot (P-02).
    expect(s).toMatchObject({ assignedCallerId: null, assignedAt: null })
  })

  it('the cold caller (P-02): the loser’s assignment carries ONLY through the hand-over rule — the survivor read back unheld and SERVABLE by the one predicate, after the fill', async () => {
    state.selectQueue.push(
      [prospect({ id: 'a', assignedCallerId: null, assignedAt: null }), prospect({ id: 'b', assignedCallerId: 'pcal_1', assignedAt: new Date('2026-11-09T00:00:00Z') })],
      [], [], [],
      [{ id: 'a' }], // the hand-over read: the survivor passes
    )
    await mergeProspects('a', 'b', { now: NOW })
    const [fill, carry, l] = updates('prospect')
    expect(fill.values).not.toHaveProperty('assignedCallerId') // the fill never carries it blind
    expect(carry.values).toMatchObject({ assignedCallerId: 'pcal_1', assignedAt: new Date('2026-11-09T00:00:00Z'), callerCooldownUntil: null })
    expect(render(carry.where).sql).toContain('"prospect"."assigned_caller_id" is null')
    expect(l.values).toMatchObject({ status: 'merged', assignedCallerId: null, assignedAt: null })
    // The read is P-02's own predicate, on the row as it now stands.
    expect(callerMocks.servable).toHaveBeenCalledWith(NOW)
    const { sql: handover, params } = render(state.selectWheres.at(-1))
    expect(handover).toContain('"prospect"."id" = $1')
    expect(handover).toContain('"prospect"."assigned_caller_id" is null')
    expect(params).toEqual(['a'])
    // …and the hook runs after the merge, whatever happened inside it.
    expect(callerMocks.release).toHaveBeenCalledWith('a', NOW)

    // A survivor someone already holds keeps its own caller — no hand-over read at all.
    state.ops = []
    callerMocks.servable.mockClear()
    state.selectQueue.push(
      [prospect({ id: 'a', assignedCallerId: 'pcal_9', assignedAt: NOW }), prospect({ id: 'b', assignedCallerId: 'pcal_1', assignedAt: NOW })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')).toHaveLength(2)
    expect(updates('prospect')[0].values).not.toHaveProperty('assignedCallerId')
    expect(callerMocks.servable).not.toHaveBeenCalled()
  })

  it('V11: a survivor the hand-over rule refuses (a hand-raiser, a bad number, a demo ahead) takes NO caller — the slot is released with the cooldown, and the hook runs', async () => {
    // Scenario A: the survivor is a hand-raiser on the owner's call list; the
    // loser is held by caller X. The one predicate hides a hand-raiser from
    // every caller — so X is not carried, and the survivor is nobody's
    // cold call. It stays on the owner's list (no assigned_caller_id).
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'call_list', intentSignal: 'reply_interested', intentAt: NOW, qualityScore: 85 }),
        prospect({ id: 'b', status: 'contacted', assignedCallerId: 'pcal_x', assignedAt: NOW, qualityScore: 70 }),
      ],
      [], [], [],
      [], // the hand-over read: the survivor fails the predicate
    )
    await mergeProspects('a', 'b', { now: NOW })
    const writes = updates('prospect')
    expect(writes).toHaveLength(3)
    expect(writes[0].values).not.toHaveProperty('assignedCallerId')
    expect(writes[1].values).toEqual({ callerCooldownUntil: new Date(NOW.getTime() + 3 * DAY), updatedAt: NOW })
    expect(render(writes[1].where).sql).toContain('"prospect"."assigned_caller_id" is null')
    expect(writes[2].values).toMatchObject({ status: 'merged', assignedCallerId: null })
    expect(callerMocks.release).toHaveBeenCalledWith('a', NOW)

    // Scenario B: the survivor is held by X; the loser is the hand-raiser.
    // The rank path lifts the survivor to call_list with the intent — the
    // row is now unservable while held, which is exactly what the hook
    // after the merge frees (its own predicate, rendered in its own suite).
    state.ops = []
    callerMocks.release.mockClear()
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'contacted', assignedCallerId: 'pcal_x', assignedAt: NOW, qualityScore: 80 }),
        prospect({ id: 'b', status: 'call_list', intentSignal: 'reply_interested', intentAt: NOW, qualityScore: 70 }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).toMatchObject({ status: 'call_list', intentSignal: 'reply_interested' })
    expect(callerMocks.release).toHaveBeenCalledWith('a', NOW)
  })

  it('V2: the OWNER’s follow-up is a promise no caller may hide — a loser’s caller is not carried onto it, and a holder is released from it (both directions)', async () => {
    const tomorrow = new Date(NOW.getTime() + DAY)
    // The survivor carries the owner's callback (unheld); the loser is held by X.
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'contacted', nextFollowUpAt: tomorrow, followUpReason: 'Callback promised', assignedCallerId: null }),
        prospect({ id: 'b', status: 'enriched', assignedCallerId: 'pcal_x', assignedAt: NOW }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    let writes = updates('prospect')
    expect(callerMocks.servable).not.toHaveBeenCalled() // never even asked — the promise decides
    expect(writes[0].values).not.toHaveProperty('assignedCallerId')
    expect(writes[0].values).not.toHaveProperty('nextFollowUpAt') // the promise stands
    expect(writes[1].values).toMatchObject({ callerCooldownUntil: new Date(NOW.getTime() + 3 * DAY) })
    expect(writes[2].values).toMatchObject({ status: 'merged', assignedCallerId: null })

    // The mirror: the survivor is held by Y; the loser carries the owner's
    // follow-up — the promise travels, and Y is released WITH the cooldown.
    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'contacted', assignedCallerId: 'pcal_y', assignedAt: NOW }),
        prospect({ id: 'b', status: 'contacted', nextFollowUpAt: tomorrow, followUpReason: 'Callback promised', assignedCallerId: null }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    writes = updates('prospect')
    expect(writes[0].values).toMatchObject({
      nextFollowUpAt: tomorrow,
      followUpReason: 'Callback promised',
      assignedCallerId: null,
      assignedAt: null,
      callerCooldownUntil: new Date(NOW.getTime() + 3 * DAY),
    })
    expect(writes).toHaveLength(2)

    // A CALLER's own callback is theirs: a loser held by X with X's callback
    // carries both onto an unheld, servable survivor.
    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'contacted' }),
        prospect({ id: 'b', status: 'contacted', nextFollowUpAt: tomorrow, followUpReason: 'Callback promised', assignedCallerId: 'pcal_x', assignedAt: NOW }),
      ],
      [], [], [],
      [{ id: 'a' }],
    )
    await mergeProspects('a', 'b', { now: NOW })
    writes = updates('prospect')
    expect(writes[0].values).toMatchObject({ nextFollowUpAt: tomorrow })
    expect(writes[1].values).toMatchObject({ assignedCallerId: 'pcal_x' })
  })

  it('V1: both rows hold the SAME number and the loser’s verdict is WORSE — the verdict travels with its verification.phone and source, and the survivor is rescored to the honest zero', async () => {
    const disconnected = { status: 'disconnected', detail: 'Number disconnected on Nov 9, 2026 (heard on a call)', checkedAt: '2026-11-09T00:00:00.000Z', source: 'caller' }
    const good = { places: { status: 'matched', detail: null, checkedAt: '2026-11-01T00:00:00.000Z', source: 'places' }, phone: { status: 'valid', detail: 'Well-formed', checkedAt: '2026-11-01T00:00:00.000Z', source: 'nanp' } }
    state.selectQueue.push(
      [
        // The survivor: better quality, the syntax check said "valid" — the same ten digits, spelled with a leading 1.
        prospect({ id: 'a', phone: '14045551234', phoneStatus: 'valid', phoneLineType: 'landline', phoneSource: 'nppes', phoneValidatedAt: null, verification: good, qualityScore: 70, qualityBand: 'good', qualityReasons: ['Google listing matched and open'], verifiedAt: new Date('2026-11-01T00:00:00Z'), businessStatus: 'OPERATIONAL', reviewCount: 12, websiteUrl: 'https://smile.com' }),
        // The loser: a caller heard the disconnect on THIS number.
        prospect({ id: 'b', phone: '4045551234', phoneStatus: 'disconnected', phoneLineType: null, phoneSource: 'caller', phoneValidatedAt: new Date('2026-11-09T00:00:00Z'), verification: { phone: disconnected }, qualityScore: 0, qualityBand: 'parked' }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const w = updates('prospect')[0].values!
    expect(w).not.toHaveProperty('phone') // its own spelling stands…
    expect(w).toMatchObject({ phoneStatus: 'disconnected', phoneLineType: null, phoneSource: 'caller', phoneValidatedAt: new Date('2026-11-09T00:00:00Z') })
    // …the verdict is about this line — and the merge keeps BOTH rows' voices on it (Y2): the survivor's legacy
    // column 'nppes' and the loser's 'caller' become the signal's sources; a dead number has no standing (Y3).
    expect(w.verification).toEqual({ ...good, phone: { ...disconnected, sources: ['nppes', 'caller'], standing: 'single_source' } })
    // The rescore: a dead number is a hard zero, in the caller's words.
    expect(w).toMatchObject({ qualityScore: 0, qualityBand: 'parked', qualityReasons: [disconnected.detail] })

    // The other way round — the survivor already carries the worse verdict — nothing moves.
    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045551234', phoneStatus: 'disconnected', phoneSource: 'caller', verification: { phone: disconnected } }),
        prospect({ id: 'b', phone: '4045551234', phoneStatus: 'valid', phoneSource: 'nppes', verification: good }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    expect(updates('prospect')[0].values).not.toHaveProperty('phoneStatus')
    expect(updates('prospect')[0].values).not.toHaveProperty('qualityScore')

    // A DIFFERENT number on the loser: its verdict is about another line and stays there.
    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045550000', phoneStatus: 'valid', verification: good }),
        prospect({ id: 'b', phone: '4045551234', phoneStatus: 'disconnected', phoneSource: 'caller', verification: { phone: disconnected } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    expect(updates('prospect')[0].values).not.toHaveProperty('phoneStatus')
    expect(updates('prospect')[0].values).not.toHaveProperty('verification')
  })

  it('Y2: the same-number verdict take keeps the survivor’s statement — sources = union of both rows’ voices (signal sources AND legacy columns), the standing recomputed, the survivor’s alt and its sentence kept, the column caller when either side’s was', async () => {
    const AT = '2026-11-09T00:00:00.000Z'
    const typed = { status: 'well_formed', detail: 'Well-formed US number — this month’s line checks are used up', checkedAt: AT, source: 'nanp', sources: ['caller'], standing: 'single_source', lineCheck: 'skipped' }
    const invalid = { status: 'invalid', detail: 'Carrier database: not an assigned number', checkedAt: AT, source: 'aws_pinpoint', sources: ['nppes'], standing: 'single_source', lineCheck: 'done' }
    // Probe 1 — the standing shape: survivor hand-added (column single_source, sources [caller]) + loser {invalid, sources [nppes]}.
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045550000', phoneStatus: 'unknown', phoneLineType: null, phoneSource: 'single_source', phoneValidatedAt: null, qualityScore: 47, qualityBand: 'weak', verifiedAt: new Date(AT), verification: { phone: typed } }),
        prospect({ id: 'b', phone: '4045550000', phoneStatus: 'invalid', phoneLineType: null, phoneSource: 'single_source', phoneValidatedAt: new Date(AT), qualityScore: 0, qualityBand: 'parked', verification: { phone: invalid } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const w = updates('prospect')[0].values!
    expect(w).toMatchObject({ phoneStatus: 'invalid', phoneValidatedAt: new Date(AT), qualityScore: 0, qualityBand: 'parked' })
    const signal = (w.verification as { phone: Record<string, unknown> }).phone
    // Both voices kept; a bad number has no standing (Y3) — the predicate's own word, on the signal and the column.
    expect(signal).toEqual({ ...invalid, sources: ['caller', 'nppes'], standing: 'single_source' })
    expect(w.phoneSource).toBe('single_source')

    // Probe 2 — legacy columns, no sources on either signal: the columns are the voices; the column stays 'caller'.
    state.ops = []
    const { sources: _s1, standing: _st1, ...typedLegacy } = typed
    const { sources: _s2, standing: _st2, ...invalidLegacy } = invalid
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045550000', phoneStatus: 'unknown', phoneSource: 'caller', verification: { phone: typedLegacy } }),
        prospect({ id: 'b', phone: '4045550000', phoneStatus: 'invalid', phoneSource: 'nppes', phoneValidatedAt: new Date(AT), verification: { phone: invalidLegacy } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const legacy = updates('prospect')[0].values!
    expect(legacy.phoneSource).toBe('caller')
    expect((legacy.verification as { phone: Record<string, unknown> }).phone).toEqual({ ...invalidLegacy, sources: ['caller', 'nppes'], standing: 'single_source' })

    // The survivor's alt (Google lists another number) rides the loser's verdict, its sentence appended ONCE; the loser's alt only when the survivor has none.
    state.ops = []
    const alt = { number: '4045559999', source: 'places', at: AT }
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045550000', phoneStatus: 'unknown', phoneSource: 'single_source', verification: { phone: { ...typed, alt, detail: `${typed.detail}; Google lists (404) 555-9999 — kept the number you typed` } } }),
        prospect({ id: 'b', phone: '4045550000', phoneStatus: 'invalid', phoneSource: 'single_source', verification: { phone: invalid } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const withAlt = (updates('prospect')[0].values!.verification as { phone: Record<string, unknown> }).phone
    expect(withAlt).toMatchObject({ status: 'invalid', alt, detail: 'Carrier database: not an assigned number; Google lists (404) 555-9999 — kept the number you typed' })
    expect((withAlt.detail as string).match(/Google lists/g)).toHaveLength(1)
    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045550000', phoneStatus: 'unknown', phoneSource: 'single_source', verification: { phone: typed } }),
        prospect({ id: 'b', phone: '4045550000', phoneStatus: 'invalid', phoneSource: 'single_source', verification: { phone: { ...invalid, alt: { ...alt, number: '4045558888' } } } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    expect((updates('prospect')[0].values!.verification as { phone: Record<string, unknown> }).phone).toMatchObject({ alt: { number: '4045558888' } })
  })

  it('Y2: the FILL of a verification-less survivor — the loser’s phone signal about the SAME number lands with both rows’ voices and the caller column kept; one about ANOTHER number never lands at all', async () => {
    const AT = '2026-11-09T00:00:00.000Z'
    const places = { status: 'matched', detail: null, checkedAt: AT, source: 'places' }
    const theirs = { status: 'valid', detail: 'Carrier database: landline', checkedAt: AT, source: 'aws_pinpoint', sources: ['nppes', 'places'], standing: 'corroborated', lineCheck: 'done' }
    // Same number: a hand-added, never-verified survivor (column caller, no verification) + a verified loser.
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045550000', phoneStatus: null, phoneSource: 'caller', verification: null }),
        prospect({ id: 'b', phone: '4045550000', phoneStatus: 'valid', phoneSource: 'corroborated', phoneLineType: 'landline', verification: { places, phone: theirs } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const same = updates('prospect')[0].values!
    expect(same.verification).toEqual({ places, phone: { ...theirs, sources: ['caller', 'nppes', 'places'], standing: 'corroborated' } })
    expect(same.phoneSource).toBe('caller') // the column stays 'caller' — the loser's 'corroborated' never replaces it
    // Another number: the loser's signal describes a line this row does not hold — the fill keeps the rest, drops the phone signal.
    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045550000', phoneStatus: null, phoneSource: 'caller', verification: null }),
        prospect({ id: 'b', phone: '4045551234', phoneStatus: 'valid', phoneSource: 'corroborated', verification: { places, phone: theirs } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const other = updates('prospect')[0].values!
    expect(other.verification).toEqual({ places })
    expect(other).not.toHaveProperty('phone')
    expect(other).not.toHaveProperty('phoneSource')
  })

  it('Y2 end to end: the MERGED row’s next verify pass (the REAL verifyProspectSignals) keeps the typed number against a listing that lists another — the alt attached, never replaced', async () => {
    const AT = '2026-11-09T00:00:00.000Z'
    const typed = { status: 'well_formed', detail: 'Well-formed US number — the line check is off', checkedAt: AT, source: 'nanp', sources: ['caller'], standing: 'single_source', lineCheck: 'off' }
    const invalid = { status: 'invalid', detail: 'Carrier database: not an assigned number', checkedAt: AT, source: 'aws_pinpoint', sources: ['nppes'], standing: 'single_source', lineCheck: 'done' }
    const survivor = prospect({ id: 'a', name: 'Smile Dental PC', addressLine1: '123 Main St', phone: '4045550000', phoneStatus: 'unknown', phoneLineType: null, phoneSource: 'single_source', phoneValidatedAt: null, npiNumber: null, verifiedAt: new Date(AT), verification: { phone: typed } })
    state.selectQueue.push(
      [survivor, prospect({ id: 'b', phone: '4045550000', phoneStatus: 'invalid', phoneSource: 'single_source', phoneValidatedAt: new Date(AT), qualityScore: 0, verification: { phone: invalid } })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const fill = updates('prospect')[0].values!
    const merged = { ...survivor, ...fill, verification: parseVerification(fill.verification) }
    const listing = { placeId: 'place_1', displayName: 'Smile Dental', formattedAddress: '123 Main St, Atlanta, GA 30309, USA', nationalPhoneNumber: '4045559999', websiteUri: null, ratingTenths: 47, reviewCount: 22, businessStatus: 'OPERATIONAL', googleMapsUri: 'https://maps.google.com/x', latestReviewAt: null, hasOpeningHours: true }
    const ctx = await newVerifyRunCtx({ ...PROSPECTING_DEFAULTS, killSwitch: false }, NOW)
    const out = await verifyProspectSignals(merged as never, { ok: true, places: [listing] }, ctx)
    expect(out.patch.phone).toBe('4045550000')
    expect(out.patch.verification.phone).toMatchObject({ sources: ['nppes', 'caller'], alt: { number: '4045559999', source: 'places' } })
    expect(out.patch.verification.phone?.detail).toMatch(/Google lists \(404\) 555-9999 — kept the number you typed/)
    expect(out.patch.verification.phone?.detail).not.toMatch(/the registry had/)
  })

  it('Z1: the union runs whenever the numbers are the same, whichever row carries the caller — the typed row as the LOSER (discovery twin the survivor, no verdict, a verification of its own): the loser’s caller voice, column and alt land on the survivor’s kept signal, and the REAL verify pass keeps the typed digits', async () => {
    const AT = '2026-11-09T00:00:00.000Z'
    const registry = { status: 'valid', detail: 'Carrier database: landline', checkedAt: AT, source: 'aws_pinpoint', sources: ['nppes'], standing: 'single_source', lineCheck: 'done' }
    const alt = { number: '4045559999', source: 'places', at: AT }
    const typed = { status: 'well_formed', detail: `Number entered by hand on Nov 8, 2026 — line not checked yet; Google lists (404) 555-9999 — kept the number you typed`, checkedAt: AT, source: 'caller', sources: ['caller'], standing: 'single_source', alt }
    const survivorVerification = { places: { status: 'matched', detail: null, checkedAt: AT, source: 'places' }, phone: registry }
    const survivor = prospect({ id: 'a', name: 'Smile Dental PC', addressLine1: '123 Main St', phone: '4045550000', phoneStatus: 'valid', phoneLineType: 'landline', phoneSource: 'single_source', phoneValidatedAt: new Date(AT), npiNumber: null, qualityScore: 80, qualityBand: 'best', verifiedAt: new Date(AT), verification: survivorVerification })
    const loser = prospect({ id: 'b', phone: '4045550000', phoneStatus: 'unknown', phoneLineType: null, phoneSource: 'caller', phoneValidatedAt: null, qualityScore: 40, qualityBand: 'weak', verification: { phone: typed } })
    state.selectQueue.push([survivor, loser], [], [], [])
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const fill = updates('prospect')[0].values!
    // The survivor's own signal is kept (status, detail, line facts) — with the loser's voice, its alt and its sentence.
    expect(fill).not.toHaveProperty('phoneStatus')
    expect(fill.phoneSource).toBe('caller')
    expect((fill.verification as { phone: Record<string, unknown> }).phone).toEqual({
      ...registry,
      sources: ['nppes', 'caller'],
      standing: 'corroborated',
      alt,
      detail: 'Carrier database: landline; Google lists (404) 555-9999 — kept the number you typed',
    })
    expect((fill.verification as { places: unknown }).places).toEqual(survivorVerification.places)
    // Then the next verify pass, for real, against a listing stating the other number: the typed digits stay.
    const merged = { ...survivor, ...fill, verification: parseVerification(fill.verification) }
    const listing = { placeId: 'place_1', displayName: 'Smile Dental', formattedAddress: '123 Main St, Atlanta, GA 30309, USA', nationalPhoneNumber: '4045559999', websiteUri: null, ratingTenths: 47, reviewCount: 22, businessStatus: 'OPERATIONAL', googleMapsUri: 'https://maps.google.com/x', latestReviewAt: null, hasOpeningHours: true }
    const out = await verifyProspectSignals(merged as never, { ok: true, places: [listing] }, await newVerifyRunCtx({ ...PROSPECTING_DEFAULTS, killSwitch: false }, NOW))
    expect(out.patch.phone).toBe('4045550000')
    expect(out.patch.verification.phone).toMatchObject({ sources: ['nppes', 'caller'], alt: { number: '4045559999', source: 'places' } })
    expect(out.patch.verification.phone?.detail).toMatch(/Google lists \(404\) 555-9999 — kept the number you typed/)
    expect(out.patch.verification.phone?.detail).not.toMatch(/the registry had/)

    // The standing shape of the same loser (column single_source, sources [caller]): the column becomes the recomputed standing, the voice still lands.
    state.ops = []
    state.selectQueue.push([survivor, prospect({ ...loser, phoneSource: 'single_source', verification: { phone: { ...typed, alt: undefined, detail: 'Number entered by hand on Nov 8, 2026 — line not checked yet' } } })], [], [], [])
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const standing = updates('prospect')[0].values!
    expect(standing.phoneSource).toBe('corroborated')
    expect((standing.verification as { phone: Record<string, unknown> }).phone).toEqual({ ...registry, sources: ['nppes', 'caller'], standing: 'corroborated' })
    const again = await verifyProspectSignals({ ...survivor, ...standing, verification: parseVerification(standing.verification) } as never, { ok: true, places: [listing] }, await newVerifyRunCtx({ ...PROSPECTING_DEFAULTS, killSwitch: false }, NOW))
    expect(again.patch.phone).toBe('4045550000')

    // A loser that adds no voice (the same registry source, no alt) writes nothing — the survivor's signal and column stand untouched.
    state.ops = []
    state.selectQueue.push([survivor, prospect({ ...loser, phoneSource: 'single_source', verification: { phone: { ...registry, standing: 'single_source' } } })], [], [], [])
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    expect(updates('prospect')[0].values).not.toHaveProperty('verification')
    expect(updates('prospect')[0].values).not.toHaveProperty('phoneSource')

    // The CONTROL — the survivor as the pre-fix merge left it (sources [nppes], column single_source): the typed number is REPLACED.
    const lost = { ...survivor, verification: parseVerification(survivorVerification) }
    const replaced = await verifyProspectSignals(lost as never, { ok: true, places: [listing] }, await newVerifyRunCtx({ ...PROSPECTING_DEFAULTS, killSwitch: false }, NOW))
    expect(replaced.patch.phone).toBe('4045559999')
  })

  it('V1: a `reach` heard on the same line is kept, and rescores only a row the pass has looked at', async () => {
    const reach = { status: 'reached', detail: 'Someone picked up on Nov 9, 2026 (gatekeeper)', checkedAt: '2026-11-09T00:00:00.000Z', source: 'caller' }
    state.selectQueue.push(
      [
        prospect({ id: 'a', phone: '4045551234', phoneStatus: 'valid', verification: { phone: { status: 'valid', detail: null, checkedAt: 'x', source: 'nanp' } }, verifiedAt: null }),
        prospect({ id: 'b', phone: '4045551234', phoneStatus: 'valid', verification: { reach } }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW, config: CONFIG })
    const w = updates('prospect')[0].values!
    expect((w.verification as { reach: unknown }).reach).toEqual(reach)
    expect(w).not.toHaveProperty('qualityScore') // never verified: a score is never invented
    expect(configMock).not.toHaveBeenCalled()
  })

  it('V1: the drawer’s door loads the config when a verdict travels; the sweep hands its own through', async () => {
    const disconnected = { status: 'disconnected', detail: 'Number disconnected', checkedAt: 'x', source: 'caller' }
    state.selectQueue.push(
      [prospect({ id: 'a', phone: '4045551234', phoneStatus: 'unknown', verification: {} }), prospect({ id: 'b', phone: '4045551234', phoneStatus: 'disconnected', verification: { phone: disconnected } })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(configMock).toHaveBeenCalledTimes(1)
    expect(updates('prospect')[0].values).toMatchObject({ qualityScore: 0, qualityBand: 'parked' })
  })

  it('V4: a resting survivor ranks by where it CAME from — a contacted practice that went quiet is not re-entered as "enriched" by a twin the refresh found', async () => {
    const sentence = 'No touch since Aug 12, 2026 UTC — resting'
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'dormant', dormantFromStatus: 'contacted', qualityScore: 80, qualityReasons: [sentence, 'NPI active'] }),
        prospect({ id: 'b', status: 'enriched', qualityScore: 60 }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    const w = updates('prospect')[0].values!
    expect(w).not.toHaveProperty('status') // still resting…
    expect(w).not.toHaveProperty('dormantFromStatus') // …from contacted
    expect(w).not.toHaveProperty('qualityReasons') // the sentence stands

    // From the hand-raiser bucket: a contacted twin never pulls it down to contacted.
    state.ops = []
    state.selectQueue.push(
      [prospect({ id: 'a', status: 'dormant', dormantFromStatus: 'call_list' }), prospect({ id: 'b', status: 'contacted' })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).not.toHaveProperty('status')

    // An AWAKE loser further along is a live signal: the survivor wakes there (as before).
    state.ops = []
    state.selectQueue.push(
      [prospect({ id: 'a', status: 'dormant', dormantFromStatus: 'enriched', qualityReasons: [sentence] }), prospect({ id: 'b', status: 'contacted' })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).toMatchObject({ status: 'contacted', dormantFromStatus: null, qualityReasons: [] })
  })

  it('V4: two resting rows never wake on a merge — the survivor keeps resting with the HIGHER memory', async () => {
    const sentence = 'No touch since Aug 12, 2026 UTC — resting'
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'dormant', dormantFromStatus: 'enriched', qualityScore: 80, qualityReasons: [sentence] }),
        prospect({ id: 'b', status: 'dormant', dormantFromStatus: 'contacted', qualityScore: 60 }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    const w = updates('prospect')[0].values!
    expect(w).not.toHaveProperty('status')
    expect(w.dormantFromStatus).toBe('contacted')
    expect(w).not.toHaveProperty('qualityReasons')

    // Memory the other way: nothing to lift, nothing changes.
    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'dormant', dormantFromStatus: 'contacted', qualityScore: 80 }),
        prospect({ id: 'b', status: 'dormant', dormantFromStatus: 'enriched', qualityScore: 60 }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).not.toHaveProperty('dormantFromStatus')
    expect(updates('prospect')[0].values).not.toHaveProperty('status')
  })

  it('a resting survivor woken by a merge loses its resting sentence; a resting loser’s sentence never travels', async () => {
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'dormant', dormantFromStatus: 'enriched', qualityReasons: ['No touch since Aug 12, 2026 UTC — resting', 'NPI active'] }),
        prospect({ id: 'b', status: 'contacted' }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).toMatchObject({ status: 'contacted', dormantFromStatus: null, qualityReasons: ['NPI active'] })

    state.ops = []
    state.selectQueue.push(
      [
        prospect({ id: 'a', status: 'converted', qualityReasons: null }),
        prospect({ id: 'b', status: 'dormant', dormantFromStatus: 'contacted', qualityReasons: ['No touch since Aug 12, 2026 UTC — resting', 'Google listing matched and open'] }),
      ],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values!.qualityReasons).toEqual(['Google listing matched and open'])
  })
})

describe('mergeDuplicateProspects — the drawer’s door', () => {
  it('follows earlier merges, lets the survivor rule pick, refuses two converted rows', async () => {
    state.selectQueue.push(
      [{ status: 'enriched', mergedInto: null }], // survivorOf a
      [{ status: 'merged', mergedInto: 'c' }], // survivorOf b → c
      [{ status: 'enriched', mergedInto: null }],
      [prospect({ id: 'a', qualityScore: 40 }), prospect({ id: 'c', qualityScore: 90 })], // the pair
      [prospect({ id: 'a', qualityScore: 40 }), prospect({ id: 'c', qualityScore: 90 })], // mergeProspects' own read
      [], [], [],
    )
    const r = await mergeDuplicateProspects('a', 'b', { now: NOW })
    expect(r).toMatchObject({ ok: true, survivorId: 'c', loserId: 'a' })

    state.selectQueue.push(
      [{ status: 'enriched', mergedInto: null }],
      [{ status: 'enriched', mergedInto: null }],
      [prospect({ id: 'a', status: 'converted' }), prospect({ id: 'b', status: 'converted' })],
    )
    expect(await mergeDuplicateProspects('a', 'b')).toEqual({ ok: false, reason: 'both_converted' })
  })
})

describe('runExactDedupeSweep', () => {
  it('merges only the exact pairs, under the cap, and leaves the fuzzy ones for the drawer', async () => {
    state.selectQueue.push(
      [{ key: 'place_1' }], // place groups
      [{ key: '4045551212' }], // phone groups (the ten-digit KEY — rendered in hygiene-sql.test.ts)
      [
        prospect({ id: 'a', name: 'Smile Dental', googlePlaceId: 'place_1', qualityScore: 80 }),
        prospect({ id: 'b', name: 'Smile Dental, P.C.', googlePlaceId: 'place_1', qualityScore: 60 }),
        prospect({ id: 'c', name: 'Jane Roe DDS', phone: '4045551212', postalCode: '30092' }), // same phone, other name — not exact
      ],
      // mergeProspects(a, b): its own read + the three tx reads
      [prospect({ id: 'a', qualityScore: 80 }), prospect({ id: 'b', qualityScore: 60 })],
      [], [], [],
    )
    const r = await runExactDedupeSweep({ now: NOW, cap: 25, config: CONFIG })
    expect(r).toMatchObject({ groups: 1, merged: 1, skipped: 0, errors: 0 })
    expect(configMock).not.toHaveBeenCalled() // the sweep's own config rides along
    const stamped = updates('prospect').find((u) => u.values?.status === 'merged')
    expect(stamped?.values).toMatchObject({ mergedIntoProspectId: 'a' })
  })

  it('stops at the cap and reports nothing when there are no groups', async () => {
    state.selectQueue.push([], [])
    expect(await runExactDedupeSweep({ now: NOW })).toEqual({ groups: 0, merged: 0, skipped: 0, errors: 0 })

    state.selectQueue.push(
      [{ key: 'p1' }, { key: 'p2' }],
      [],
      [
        prospect({ id: 'a', googlePlaceId: 'p1', phone: null }),
        prospect({ id: 'b', googlePlaceId: 'p1', phone: null }),
        prospect({ id: 'c', googlePlaceId: 'p2', phone: null, postalCode: '30001' }),
        prospect({ id: 'd', googlePlaceId: 'p2', phone: null, postalCode: '30002' }),
      ],
      [prospect({ id: 'a' }), prospect({ id: 'b' })],
      [], [], [],
    )
    const r = await runExactDedupeSweep({ now: NOW, cap: 1 })
    expect(r.groups).toBe(2)
    expect(r.merged).toBe(1)
  })

  it('a refused pair (a terminal loser beside a clinic) is skipped, not an error — no strike, no retry storm', async () => {
    state.selectQueue.push(
      [{ key: 'place_1' }],
      [],
      [
        prospect({ id: 'a', status: 'converted', googlePlaceId: 'place_1', phone: null }),
        prospect({ id: 'b', status: 'disqualified', googlePlaceId: 'place_1', phone: null }),
      ],
      [prospect({ id: 'a', status: 'converted' }), prospect({ id: 'b', status: 'disqualified' })],
    )
    expect(await runExactDedupeSweep({ now: NOW })).toEqual({ groups: 1, merged: 0, skipped: 1, errors: 0 })
  })
})
