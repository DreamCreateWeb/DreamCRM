import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * DEDUPE THAT CANNOT LOSE DATA (P-03) — the service. The survivor rule
 * with the converted exception, every FK re-pointed, the two unique-index
 * collisions handled (one live enrollment, one contact per email), the
 * survivor filled from the loser, the loser stamped and KEPT, the sweep
 * merging only exact pairs under its cap, and the merge-chain follow.
 */

type Op = { op: string; table: string; values?: Record<string, unknown> }
const state = {
  selectQueue: [] as unknown[][],
  ops: [] as Op[],
  /** rows `.returning()` reports per table (how many moved). */
  returning: {} as Record<string, number>,
}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@/lib/db/schema')
  const tableName = (t: unknown) => {
    for (const [k, v] of Object.entries(schema)) if (v === t) return k
    return 'unknown'
  }
  const selectChain = () => {
    const obj: any = {}
    for (const m of ['from', 'where', 'orderBy', 'limit', 'groupBy', 'having']) obj[m] = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(onF, onR)
    return obj
  }
  const writeChain = (op: string, table: string, values?: Record<string, unknown>) => {
    const done = { op, table, values }
    const p: any = {
      where: () => {
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

import {
  chooseSurvivor,
  findDuplicateCandidates,
  mergeDuplicateProspects,
  mergeProspects,
  runExactDedupeSweep,
  survivorOf,
} from '@/lib/services/prospect-dedupe'

const NOW = new Date('2026-11-10T12:00:00Z')

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
  state.ops = []
  state.returning = {}
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
  it('same row · not found · already merged · a converted loser', async () => {
    expect(await mergeProspects('a', 'a')).toEqual({ ok: false, reason: 'same_row' })
    state.selectQueue.push([prospect({ id: 'a' })])
    expect(await mergeProspects('a', 'b')).toEqual({ ok: false, reason: 'not_found' })
    state.selectQueue.push([prospect({ id: 'a' }), prospect({ id: 'b', status: 'merged' })])
    expect(await mergeProspects('a', 'b')).toEqual({ ok: false, reason: 'already_merged' })
    state.selectQueue.push([prospect({ id: 'a' }), prospect({ id: 'b', status: 'converted' })])
    expect(await mergeProspects('a', 'b')).toEqual({ ok: false, reason: 'loser_converted' })
    expect(state.ops).toEqual([])
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
    expect(state.ops.filter((o) => o.op === 'delete')).toEqual([{ op: 'delete', table: 'prospectContact', values: undefined }])
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
      [{ key: '4045551212' }], // phone groups
      [
        prospect({ id: 'a', name: 'Smile Dental', googlePlaceId: 'place_1', qualityScore: 80 }),
        prospect({ id: 'b', name: 'Smile Dental, P.C.', googlePlaceId: 'place_1', qualityScore: 60 }),
        prospect({ id: 'c', name: 'Jane Roe DDS', phone: '4045551212', postalCode: '30092' }), // same phone, other name — not exact
      ],
      // mergeProspects(a, b): its own read + the three tx reads
      [prospect({ id: 'a', qualityScore: 80 }), prospect({ id: 'b', qualityScore: 60 })],
      [], [], [],
    )
    const r = await runExactDedupeSweep({ now: NOW, cap: 25 })
    expect(r).toMatchObject({ groups: 1, merged: 1, skipped: 0, errors: 0 })
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
})
