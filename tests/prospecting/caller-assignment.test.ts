import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE CALLER QUEUE'S RULES (P-02) — asserted at the predicate level:
 *   - the pool: unassigned, a good number, at/above the quality floor, a
 *     live status, never a hand-raiser, never the owner's own follow-up,
 *     outside a skip cooldown, inside the caller's states when set;
 *   - the top-up: to daily_target counted as what they can DIAL NOW (a
 *     callback parked for later holds no slot), inside a transaction that
 *     locks the caller's row, over-fetching so a lost race costs a
 *     candidate and not a slot, every claim predicated on
 *     assigned_caller_id IS NULL;
 *   - a terminal outcome ends the assignment, a non-terminal one keeps it;
 *     a win is never a caller's key;
 *   - a skip releases with a 3-day cooldown and a log row — a final skip
 *     ("not a fit", "already spoke") with a long one;
 *   - the 7-day sweep keeps a live callback (ahead, or due within the week),
 *     keeps a booked demo, and releases with a cooldown;
 *   - the owner's own DIAL queues never serve a practice a caller holds;
 *     the hand-raiser LIST shows one, flagged with the caller.
 */

type Node = { op: string; args: unknown[] }

const state = {
  selects: [] as unknown[][],
  updateReturns: [] as unknown[][],
  selectCalls: [] as Array<{ table: string; where: unknown; orderBy: unknown[]; limit?: number; lockFor?: string }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown>; where: unknown }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  transactions: 0,
}

vi.mock('@/lib/db', () => {
  const table = (name: string) =>
    new Proxy({ _n: name }, { get: (_t, k) => (k === '_n' ? name : `${name}.${String(k)}`) })
  const selectChain = () => {
    const call: { table: string; where: unknown; orderBy: unknown[]; limit?: number; lockFor?: string } = { table: '', where: undefined, orderBy: [] }
    const obj: any = {}
    obj.for = (strength: string) => {
      call.lockFor = strength
      return obj
    }
    obj.from = (t: { _n: string }) => {
      call.table = t._n
      return obj
    }
    obj.innerJoin = () => obj
    obj.leftJoin = () => obj
    obj.where = (w: unknown) => {
      call.where = w
      return obj
    }
    obj.orderBy = (...o: unknown[]) => {
      call.orderBy = o
      return obj
    }
    obj.groupBy = () => obj
    obj.limit = (n: number) => {
      call.limit = n
      return obj
    }
    obj.offset = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      state.selectCalls.push(call)
      return Promise.resolve(state.selects.shift() ?? []).then(onF, onR)
    }
    return obj
  }
  const updateChain = (t: { _n: string }) => {
    const rec: { table: string; set: Record<string, unknown>; where: unknown } = { table: t._n, set: {}, where: undefined }
    const obj: any = {}
    obj.set = (s: Record<string, unknown>) => {
      rec.set = s
      return obj
    }
    obj.where = (w: unknown) => {
      rec.where = w
      return obj
    }
    obj.returning = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      state.updates.push(rec)
      return Promise.resolve(state.updateReturns.shift() ?? []).then(onF, onR)
    }
    return obj
  }
  const db: any = {
    select: () => selectChain(),
    selectDistinctOn: () => selectChain(),
    update: (t: { _n: string }) => updateChain(t),
    insert: (t: { _n: string }) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: t._n, values })
      },
    }),
  }
  // The fill runs inside db.transaction — the callback gets the same mock.
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => {
    state.transactions++
    return cb(db)
  }
  return {
    db,
    schema: {
      prospect: table('prospect'),
      prospectCallLog: table('prospect_call_log'),
      prospectCaller: table('prospect_caller'),
      prospectMeeting: table('prospect_meeting'),
      prospectingConfig: table('prospecting_config'),
      outreachEnrollment: table('outreach_enrollment'),
      outreachEvent: table('outreach_event'),
    },
  }
})
vi.mock('drizzle-orm', () => {
  const op = (name: string) => vi.fn((...args: unknown[]) => ({ op: name, args }))
  return {
    and: op('and'), or: op('or'), eq: op('eq'), ne: op('ne'), gte: op('gte'), lte: op('lte'), gt: op('gt'), lt: op('lt'),
    inArray: op('inArray'), notInArray: op('notInArray'), isNull: op('isNull'), isNotNull: op('isNotNull'), not: op('not'),
    asc: op('asc'), desc: op('desc'), exists: op('exists'), notExists: op('notExists'), ilike: op('ilike'),
    sql: Object.assign(vi.fn(() => ({ op: 'sql', args: [] })), { raw: vi.fn() }),
  }
})
vi.mock('@/lib/email', () => ({ deliver: vi.fn(async () => {}), authEmailShell: vi.fn(() => '<html/>'), escapeHtml: (s: string) => s }))

import {
  callerPoolWhere,
  fillCallerQueue,
  fillCallerQueues,
  logCallerOutcome,
  releaseStaleAssignments,
  skipProspectForCaller,
  parseCallerStates,
  windowFromOutcomes,
} from '@/lib/services/prospect-callers'
import { getCallList, getCallQueue, getDueFollowUps, getPhoneQueue } from '@/lib/services/prospecting'
import { BAD_PHONE_STATUSES } from '@/lib/db/schema/prospecting'
import {
  HAND_RAISER_SIGNALS,
  CALLER_RELEASE_COOLDOWN_DAYS,
  CALLER_SERVABLE_STATUSES,
  CALLER_SKIP_LONG_COOLDOWN_DAYS,
  CALLER_TERMINAL_OUTCOMES,
} from '@/lib/types/prospecting'

/** Every node in a where-tree matching the predicate. */
function find(tree: unknown, pred: (n: Node) => boolean, out: Node[] = []): Node[] {
  if (!tree || typeof tree !== 'object') return out
  const n = tree as Partial<Node>
  if (typeof n.op === 'string' && Array.isArray(n.args)) {
    if (pred(n as Node)) out.push(n as Node)
    for (const a of n.args) {
      if (Array.isArray(a)) for (const x of a) find(x, pred, out)
      else find(a, pred, out)
    }
  }
  return out
}
const has = (tree: unknown, op: string, first: unknown) => find(tree, (n) => n.op === op && n.args[0] === first).length > 0
const node = (tree: unknown, op: string, first: unknown) => find(tree, (n) => n.op === op && n.args[0] === first)[0]

const NOW = new Date('2026-11-10T15:00:00Z')

const DAY = 24 * 3600 * 1000

beforeEach(() => {
  state.selects = []
  state.updateReturns = []
  state.selectCalls = []
  state.updates = []
  state.inserts = []
  state.transactions = 0
})

describe('the pool (callerPoolWhere)', () => {
  it('serves only the owner’s best leftovers', async () => {
    const { eq, gt } = await import('drizzle-orm')
    ;(eq as unknown as { mockClear: () => void }).mockClear()
    ;(gt as unknown as { mockClear: () => void }).mockClear()
    const w = callerPoolWhere(60, ['TX', 'OK'], NOW)
    expect(has(w, 'isNull', 'prospect.assignedCallerId')).toBe(true)
    expect(has(w, 'isNotNull', 'prospect.phone')).toBe(true)
    expect(node(w, 'gte', 'prospect.qualityScore').args[1]).toBe(60)
    // Two status lists: the SERVABLE one (shared with the queue read and the
    // release hook) and the ASSIGNABLE one (engaged is the owner's warm lead).
    const statusLists = find(w, (n) => n.op === 'inArray' && n.args[0] === 'prospect.status').map((n) => n.args[1])
    expect(statusLists).toContainEqual([...CALLER_SERVABLE_STATUSES])
    expect(statusLists).toContainEqual(['enriched', 'queued', 'contacted', 'call_list'])
    expect(node(w, 'notInArray', 'prospect.phoneStatus').args[1]).toEqual([...BAD_PHONE_STATUSES])
    // Hand-raisers stay with the owner.
    expect(node(w, 'notInArray', 'prospect.intentSignal').args[1]).toEqual([...HAND_RAISER_SIGNALS])
    expect(HAND_RAISER_SIGNALS).toEqual(['reply_interested', 'reply_question', 'demo_request', 'event_met'])
    // A demo already booked and still ahead is nobody's cold call (the
    // subquery's own predicate is built through the mocked ops).
    expect(find(w, (n) => n.op === 'notExists')).toHaveLength(1)
    expect((eq as unknown as { mock: { calls: unknown[][] } }).mock.calls).toContainEqual(['prospect_meeting.status', 'booked'])
    expect((gt as unknown as { mock: { calls: unknown[][] } }).mock.calls).toContainEqual(['prospect_meeting.scheduledAt', NOW])
    // The owner's in-flight follow-ups stay the owner's.
    expect(has(w, 'isNull', 'prospect.nextFollowUpAt')).toBe(true)
    // A skip's breather.
    expect(node(w, 'lte', 'prospect.callerCooldownUntil').args[1]).toBe(NOW)
    // The caller's states.
    expect(node(w, 'inArray', 'prospect.state').args[1]).toEqual(['TX', 'OK'])
  })

  it('with no states, no state predicate', () => {
    const w = callerPoolWhere(60, [], NOW)
    expect(has(w, 'inArray', 'prospect.state')).toBe(false)
  })

  it('a null quality score never passes — the floor is >=, not "not below"', () => {
    const w = callerPoolWhere(0, [], NOW)
    expect(node(w, 'gte', 'prospect.qualityScore').args[1]).toBe(0)
  })
})

describe('the top-up (fillCallerQueue)', () => {
  const caller = { id: 'pcal_1', dailyTarget: 3, states: ['TX'], status: 'active' }

  it('tops up to daily_target, over-fetches, and stops once the need is met — inside ONE transaction that locks the caller row', async () => {
    state.selects.push([{ id: 'pcal_1' }]) // the lock (FOR UPDATE)
    state.selects.push([{ n: 1 }]) // ready to dial now: 1 of 3
    state.selects.push([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }]) // candidates (limit 4)
    state.updateReturns.push([{ id: 'p1' }]) // claimed
    state.updateReturns.push([]) // lost the race on p2
    state.updateReturns.push([{ id: 'p3' }]) // claimed → need met
    const r = await fillCallerQueue(caller, { now: NOW, floor: 60 })
    expect(r).toEqual({ claimed: 2, ready: 3, target: 3 })
    expect(state.transactions).toBe(1)
    expect(state.selectCalls[0].table).toBe('prospect_caller')
    expect(state.selectCalls[0].lockFor).toBe('update')
    expect(node(state.selectCalls[0].where, 'eq', 'prospect_caller.id').args[1]).toBe('pcal_1')
    expect(state.selectCalls[2].limit).toBe(4) // (3 - 1) * 2
    // Three claims attempted, the fourth candidate never touched.
    const claims = state.updates.filter((u) => u.table === 'prospect')
    expect(claims.map((u) => node(u.where, 'eq', 'prospect.id').args[1])).toEqual(['p1', 'p2', 'p3'])
    for (const c of claims) {
      expect(has(c.where, 'isNull', 'prospect.assignedCallerId'), 'every claim is predicated on IS NULL').toBe(true)
      expect(c.set.assignedCallerId).toBe('pcal_1')
      expect(c.set.assignedAt).toBe(NOW)
    }
  })

  it('`need` counts only what the queue will serve: theirs, servable, not a callback parked for later', async () => {
    state.selects.push([{ id: 'pcal_1' }])
    state.selects.push([{ n: 3 }])
    await fillCallerQueue(caller, { now: NOW, floor: 60 })
    const count = state.selectCalls[1]
    expect(count.table).toBe('prospect')
    expect(node(count.where, 'eq', 'prospect.assignedCallerId').args[1]).toBe('pcal_1')
    expect(node(count.where, 'inArray', 'prospect.status').args[1]).toEqual([...CALLER_SERVABLE_STATUSES])
    expect(node(count.where, 'notInArray', 'prospect.phoneStatus').args[1]).toEqual([...BAD_PHONE_STATUSES])
    expect(has(count.where, 'isNull', 'prospect.nextFollowUpAt')).toBe(true)
    expect(node(count.where, 'lte', 'prospect.nextFollowUpAt').args[1]).toBe(NOW)
  })

  it('orders best quality first, then opportunity', async () => {
    state.selects.push([{ id: 'pcal_1' }])
    state.selects.push([{ n: 0 }])
    state.selects.push([])
    await fillCallerQueue(caller, { now: NOW, floor: 60 })
    expect(state.selectCalls[2].orderBy.length).toBeGreaterThanOrEqual(2)
    expect(has(state.selectCalls[2].where, 'inArray', 'prospect.state')).toBe(true)
  })

  it('a full queue claims nothing and never reads the pool', async () => {
    state.selects.push([{ id: 'pcal_1' }])
    state.selects.push([{ n: 3 }])
    const r = await fillCallerQueue(caller, { now: NOW, floor: 60 })
    expect(r.claimed).toBe(0)
    expect(state.selectCalls).toHaveLength(2)
    expect(state.updates).toHaveLength(0)
  })

  it('a paused caller gets nothing — not even a transaction', async () => {
    const r = await fillCallerQueue({ ...caller, status: 'paused' }, { now: NOW, floor: 60 })
    expect(r.claimed).toBe(0)
    expect(state.transactions).toBe(0)
    expect(state.updates).toHaveLength(0)
  })
})

describe('the tick (fillCallerQueues) and the sweep', () => {
  it('frees the stragglers first (any path that made a row unservable), then the 7-day sweep, then fills', async () => {
    state.selects.push([]) // no active callers
    const r = await fillCallerQueues({ now: NOW })
    expect(r).toMatchObject({ callers: 0, claimed: 0 })
    expect(state.updates).toHaveLength(2)
    const [unservable, stale] = state.updates
    expect(unservable.table).toBe('prospect')
    expect(unservable.set).toMatchObject({ assignedCallerId: null, assignedAt: null })
    expect(has(unservable.where, 'isNotNull', 'prospect.assignedCallerId')).toBe(true)
    expect(find(unservable.where, (n) => n.op === 'not')).toHaveLength(1)
    expect(node(unservable.where, 'inArray', 'prospect.status').args[1]).toEqual([...CALLER_SERVABLE_STATUSES])
    expect(has(stale.where, 'lte', 'prospect.assignedAt')).toBe(true)
  })

  it('the 7-day sweep: a callback is live while ahead AND for seven days after it comes due; a booked demo is kept; every release cools down', async () => {
    const { eq, gte } = await import('drizzle-orm')
    ;(eq as unknown as { mockClear: () => void }).mockClear()
    ;(gte as unknown as { mockClear: () => void }).mockClear()
    expect(await releaseStaleAssignments(NOW)).toBe(0)
    const sweep = state.updates[0]
    const cutoff = new Date(NOW.getTime() - 7 * DAY)
    expect(node(sweep.where, 'lte', 'prospect.assignedAt').args[1]).toEqual(cutoff)
    // NOT `<= now`: a callback that came due this morning is a promise the
    // caller still has a week to keep.
    expect(node(sweep.where, 'lte', 'prospect.nextFollowUpAt').args[1]).toEqual(cutoff)
    expect(has(sweep.where, 'isNull', 'prospect.nextFollowUpAt')).toBe(true)
    const notExists = find(sweep.where, (n) => n.op === 'notExists')
    expect(notExists).toHaveLength(2) // no call in 7 days · no booked demo ahead
    expect((eq as unknown as { mock: { calls: unknown[][] } }).mock.calls).toContainEqual(['prospect_meeting.status', 'booked'])
    expect((gte as unknown as { mock: { calls: unknown[][] } }).mock.calls).toContainEqual(['prospect_call_log.createdAt', cutoff])
    expect(sweep.set.assignedCallerId).toBeNull()
    expect((sweep.set.callerCooldownUntil as Date).getTime()).toBe(NOW.getTime() + CALLER_RELEASE_COOLDOWN_DAYS * DAY)
  })
})

describe('outcomes end or keep the assignment', () => {
  it('CALLER_TERMINAL_OUTCOMES is the one list — every one of them also flips the row unservable; a booked demo is NOT terminal', () => {
    expect([...CALLER_TERMINAL_OUTCOMES].sort()).toEqual(['not_interested', 'closed', 'disconnected', 'wrong_number'].sort())
    expect(CALLER_TERMINAL_OUTCOMES).not.toContain('demo_booked')
    expect(CALLER_TERMINAL_OUTCOMES).not.toContain('won')
  })

  it('a win is never a caller’s key — refused before any read or write', async () => {
    const r = await logCallerOutcome({ caller: { id: 'pcal_1' }, prospectId: 'p1', outcome: 'won' })
    expect(r).toMatchObject({ ok: false })
    expect(state.selectCalls).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  it('a voicemail keeps the row with the caller and stamps the caller on the log', async () => {
    state.selects.push([{ id: 'p1', name: 'Smile', timezone: 'America/Chicago', phone: '4045551212' }]) // ownership
    await logCallerOutcome({ caller: { id: 'pcal_1' }, prospectId: 'p1', outcome: 'voicemail', note: 'left one' })
    const own = state.selectCalls[0]
    expect(node(own.where, 'eq', 'prospect.assignedCallerId').args[1]).toBe('pcal_1')
    expect(state.inserts[0]).toMatchObject({ table: 'prospect_call_log', values: { outcome: 'voicemail', callerId: 'pcal_1', calledByUserId: null } })
    const releases = state.updates.filter((u) => u.table === 'prospect' && u.set.assignedCallerId === null)
    expect(releases).toHaveLength(0)
    // The caller's activity stamp.
    expect(state.updates.some((u) => u.table === 'prospect_caller' && 'lastActiveAt' in u.set)).toBe(true)
  })

  it('a callback honours the chosen time in the follow-up', async () => {
    const at = new Date('2099-11-12T20:30:00Z')
    state.selects.push([{ id: 'p1', name: 'Smile', timezone: 'America/Chicago', phone: '4045551212' }])
    state.selects.push([]) // applyCallerFeedback's read (callback is a reach) — no row, no-op
    await logCallerOutcome({ caller: { id: 'pcal_1' }, prospectId: 'p1', outcome: 'callback', followUpAt: at })
    const plan = state.updates.find((u) => u.table === 'prospect' && 'nextFollowUpAt' in u.set)!
    expect(plan.set.nextFollowUpAt).toBe(at)
  })

  it('a callback given as a wall-clock resolves in the PRACTICE’s zone, and a past time is refused', async () => {
    state.selects.push([{ id: 'p1', name: 'Smile', timezone: 'America/Chicago', phone: '4045551212' }])
    state.selects.push([])
    const r = await logCallerOutcome({
      caller: { id: 'pcal_1' },
      prospectId: 'p1',
      outcome: 'callback',
      callbackLocal: { day: '2099-07-01', hour: 14, minute: 30 },
    })
    expect(r.ok).toBe(true)
    const plan = state.updates.find((u) => u.table === 'prospect' && 'nextFollowUpAt' in u.set)!
    expect((plan.set.nextFollowUpAt as Date).toISOString()).toBe('2099-07-01T19:30:00.000Z') // 14:30 CDT

    state.selects.push([{ id: 'p1', name: 'Smile', timezone: 'America/Chicago', phone: '4045551212' }])
    const past = await logCallerOutcome({
      caller: { id: 'pcal_1' },
      prospectId: 'p1',
      outcome: 'callback',
      callbackLocal: { day: '2020-01-01', hour: 9, minute: 0 },
    })
    expect(past).toMatchObject({ ok: false })
  })

  it('a disconnected number ends the assignment — the spine’s release hook fires AND the caller’s own release is predicated on ownership', async () => {
    state.selects.push([{ id: 'p1', name: 'Smile', timezone: null, phone: '4045551212' }])
    state.selects.push([]) // applyCallerFeedback read
    const r = await logCallerOutcome({ caller: { id: 'pcal_1' }, prospectId: 'p1', outcome: 'disconnected' })
    expect(r).toEqual({ ok: true, released: true })
    const releases = state.updates.filter((u) => u.table === 'prospect' && u.set.assignedCallerId === null)
    // The hook inside logCallOutcome: self-checking (id + assigned + NOT servable).
    const hook = releases.find((u) => find(u.where, (n) => n.op === 'not').length > 0)!
    expect(hook).toBeTruthy()
    expect(node(hook.where, 'eq', 'prospect.id').args[1]).toBe('p1')
    expect(has(hook.where, 'isNotNull', 'prospect.assignedCallerId')).toBe(true)
    // The caller's own: only if THIS caller still holds it.
    const own = releases.find((u) => has(u.where, 'eq', 'prospect.assignedCallerId'))!
    expect(own).toBeTruthy()
    expect(node(own.where, 'eq', 'prospect.id').args[1]).toBe('p1')
    expect(node(own.where, 'eq', 'prospect.assignedCallerId').args[1]).toBe('pcal_1')
  })

  it('refuses a prospect that is not theirs before writing anything', async () => {
    state.selects.push([]) // ownership read finds nothing
    await expect(
      logCallerOutcome({ caller: { id: 'pcal_2' }, prospectId: 'p1', outcome: 'no_answer' }),
    ).rejects.toThrow(/not in your queue/)
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })
})

describe('skip', () => {
  it('"come back later" releases with a 3-day cooldown and a log row that is not a dial', async () => {
    state.selects.push([{ id: 'p1', name: 'Smile', timezone: null, phone: '4045551212' }])
    await skipProspectForCaller({ caller: { id: 'pcal_1' }, prospectId: 'p1', reason: 'bad_timing' })
    expect(state.inserts[0]).toMatchObject({ table: 'prospect_call_log', values: { outcome: 'skipped', callerId: 'pcal_1' } })
    const release = state.updates.find((u) => u.table === 'prospect')!
    expect(release.set.assignedCallerId).toBeNull()
    const until = release.set.callerCooldownUntil as Date
    expect(until.getTime() - Date.now()).toBeGreaterThan(3 * DAY - 5000)
    expect(until.getTime() - Date.now()).toBeLessThan(4 * DAY)
    expect(node(release.where, 'eq', 'prospect.assignedCallerId').args[1]).toBe('pcal_1')
    // A skip never counts as a dial.
    expect(windowFromOutcomes([{ outcome: 'skipped', n: 4 }, { outcome: 'no_answer', n: 2 }]).dials).toBe(2)
  })

  it('"not a fit" / "already spoke" END the relationship — a long cooldown, never a 3-day recycle', async () => {
    for (const reason of ['not_a_fit', 'already_spoke'] as const) {
      state.updates = []
      state.selects.push([{ id: 'p1', name: 'Smile', timezone: null, phone: '4045551212' }])
      await skipProspectForCaller({ caller: { id: 'pcal_1' }, prospectId: 'p1', reason })
      const release = state.updates.find((u) => u.table === 'prospect')!
      const until = release.set.callerCooldownUntil as Date
      expect(until.getTime() - Date.now(), reason).toBeGreaterThan(CALLER_SKIP_LONG_COOLDOWN_DAYS * DAY - 5000)
    }
  })
})

describe('the owner’s own DIAL queues hide what a caller holds (no double-dialing); the hand-raiser LIST shows it, flagged', () => {
  it('the call list keeps a held hand-raiser visible, named "with <caller>"', async () => {
    const { isNull } = await import('drizzle-orm')
    const calls = () => (isNull as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => c[0] === 'prospect.assignedCallerId').length
    ;(isNull as unknown as { mockClear: () => void }).mockClear()
    state.selects.push([
      { id: 'p1', name: 'Smile', status: 'call_list', intentSignal: 'reply_interested', assignedCallerId: 'pcal_1', talkingPoints: [], qualityReasons: [] },
      { id: 'p2', name: 'Bright', status: 'call_list', intentSignal: 'demo_request', assignedCallerId: null, talkingPoints: [], qualityReasons: [] },
    ])
    state.selects.push([]) // latest call outcomes
    state.selects.push([{ id: 'pcal_1', name: 'Priya Nair' }]) // the caller's name
    const rows = await getCallList()
    expect(calls()).toBe(0)
    expect(rows.map((r) => [r.id, r.assignedCallerId, r.assignedCallerName])).toEqual([
      ['p1', 'pcal_1', 'Priya Nair'],
      ['p2', null, null],
    ])
  })

  it('phone-first, Call Mode and due follow-ups all read assigned_caller_id IS NULL', async () => {
    const { isNull } = await import('drizzle-orm')
    const calls = () => (isNull as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => c[0] === 'prospect.assignedCallerId').length

    ;(isNull as unknown as { mockClear: () => void }).mockClear()
    state.selects.push([])
    await getPhoneQueue(100, { floor: 60 })
    expect(calls()).toBeGreaterThanOrEqual(1)

    ;(isNull as unknown as { mockClear: () => void }).mockClear()
    state.selects.push([])
    await getDueFollowUps({ now: NOW })
    expect(calls()).toBeGreaterThanOrEqual(1)

    ;(isNull as unknown as { mockClear: () => void }).mockClear()
    state.selects.push([], [], [])
    await getCallQueue({ now: NOW, floor: 60 })
    expect(calls()).toBeGreaterThanOrEqual(3) // all three buckets
  })
})

describe('the small parts', () => {
  it('parseCallerStates keeps only real codes, upper-cased, deduped', () => {
    expect(parseCallerStates(['tx', 'TX', 'ok', 'zz', 7, ' ga '])).toEqual(['TX', 'OK', 'GA'])
    expect(parseCallerStates(null)).toEqual([])
    expect(parseCallerStates('TX')).toEqual([])
  })

  it('windowFromOutcomes — dials, reached %, callbacks, meetings, dead numbers', () => {
    const w = windowFromOutcomes([
      { outcome: 'no_answer', n: 10 },
      { outcome: 'voicemail', n: 5 },
      { outcome: 'callback', n: 3 },
      { outcome: 'gatekeeper', n: 2 },
      { outcome: 'demo_booked', n: 1 },
      { outcome: 'disconnected', n: 2 },
      { outcome: 'wrong_number', n: 1 },
      { outcome: 'skipped', n: 9 },
    ])
    expect(w.dials).toBe(24)
    expect(w.reached).toBe(6) // callback + gatekeeper + demo
    expect(w.reachedPct).toBe(25)
    expect(w.callbacks).toBe(3)
    expect(w.meetings).toBe(1)
    expect(w.disconnected).toBe(3)
    expect(windowFromOutcomes([]).reachedPct).toBeNull()
  })
})
