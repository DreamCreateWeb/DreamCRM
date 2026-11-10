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
    for (const m of ['from', 'where', 'orderBy', 'limit', 'groupBy', 'having', 'for']) obj[m] = () => obj
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

  it('the cold caller (P-02): the loser’s assignment carries to an unheld live survivor, and is released on the loser', async () => {
    state.selectQueue.push(
      [prospect({ id: 'a', assignedCallerId: null, assignedAt: null }), prospect({ id: 'b', assignedCallerId: 'pcal_1', assignedAt: new Date('2026-11-09T00:00:00Z') })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    const [s, l] = updates('prospect')
    expect(s.values).toMatchObject({ assignedCallerId: 'pcal_1', assignedAt: new Date('2026-11-09T00:00:00Z') })
    expect(l.values).toMatchObject({ status: 'merged', assignedCallerId: null, assignedAt: null })

    // A survivor someone already holds keeps its own caller.
    state.ops = []
    state.selectQueue.push(
      [prospect({ id: 'a', assignedCallerId: 'pcal_9', assignedAt: NOW }), prospect({ id: 'b', assignedCallerId: 'pcal_1', assignedAt: NOW })],
      [], [], [],
    )
    await mergeProspects('a', 'b', { now: NOW })
    expect(updates('prospect')[0].values).not.toHaveProperty('assignedCallerId')
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
