import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE CALLER QUEUE'S RULES (P-02) — asserted at the predicate level:
 *   - the pool: unassigned, a good number, at/above the quality floor, a
 *     live status, never a hand-raiser, never the owner's own follow-up,
 *     outside a skip cooldown, inside the caller's states when set;
 *   - the top-up: to daily_target, over-fetching so a lost race costs a
 *     candidate and not a slot, every claim predicated on
 *     assigned_caller_id IS NULL;
 *   - a terminal outcome ends the assignment, a non-terminal one keeps it;
 *   - a skip releases with a 3-day cooldown and a log row;
 *   - the owner's own queues never serve a practice a caller holds.
 */

type Node = { op: string; args: unknown[] }

const state = {
  selects: [] as unknown[][],
  updateReturns: [] as unknown[][],
  selectCalls: [] as Array<{ table: string; where: unknown; orderBy: unknown[]; limit?: number }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown>; where: unknown }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  const table = (name: string) =>
    new Proxy({ _n: name }, { get: (_t, k) => (k === '_n' ? name : `${name}.${String(k)}`) })
  const selectChain = () => {
    const call: { table: string; where: unknown; orderBy: unknown[]; limit?: number } = { table: '', where: undefined, orderBy: [] }
    const obj: any = {}
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
  return {
    db: {
      select: () => selectChain(),
      selectDistinctOn: () => selectChain(),
      update: (t: { _n: string }) => updateChain(t),
      insert: (t: { _n: string }) => ({
        values: async (values: Record<string, unknown>) => {
          state.inserts.push({ table: t._n, values })
        },
      }),
    },
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
    inArray: op('inArray'), notInArray: op('notInArray'), isNull: op('isNull'), isNotNull: op('isNotNull'),
    asc: op('asc'), desc: op('desc'), exists: op('exists'), notExists: op('notExists'), ilike: op('ilike'),
    sql: Object.assign(vi.fn(() => ({ op: 'sql', args: [] })), { raw: vi.fn() }),
  }
})
vi.mock('@/lib/email', () => ({ deliver: vi.fn(async () => {}), authEmailShell: vi.fn(() => '<html/>'), escapeHtml: (s: string) => s }))

import {
  callerPoolWhere,
  fillCallerQueue,
  logCallerOutcome,
  skipProspectForCaller,
  parseCallerStates,
  windowFromOutcomes,
} from '@/lib/services/prospect-callers'
import { getCallList, getCallQueue, getDueFollowUps, getPhoneQueue } from '@/lib/services/prospecting'
import { BAD_PHONE_STATUSES } from '@/lib/db/schema/prospecting'
import { HAND_RAISER_SIGNALS, CALLER_TERMINAL_OUTCOMES } from '@/lib/types/prospecting'

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

beforeEach(() => {
  state.selects = []
  state.updateReturns = []
  state.selectCalls = []
  state.updates = []
  state.inserts = []
})

describe('the pool (callerPoolWhere)', () => {
  it('serves only the owner’s best leftovers', () => {
    const w = callerPoolWhere(60, ['TX', 'OK'], NOW)
    expect(has(w, 'isNull', 'prospect.assignedCallerId')).toBe(true)
    expect(has(w, 'isNotNull', 'prospect.phone')).toBe(true)
    expect(node(w, 'gte', 'prospect.qualityScore').args[1]).toBe(60)
    expect(node(w, 'inArray', 'prospect.status').args[1]).toEqual(['enriched', 'queued', 'contacted', 'call_list'])
    expect(node(w, 'notInArray', 'prospect.phoneStatus').args[1]).toEqual([...BAD_PHONE_STATUSES])
    // Hand-raisers stay with the owner.
    expect(node(w, 'notInArray', 'prospect.intentSignal').args[1]).toEqual([...HAND_RAISER_SIGNALS])
    expect(HAND_RAISER_SIGNALS).toEqual(['reply_interested', 'reply_question', 'demo_request', 'event_met'])
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

  it('tops up to daily_target, over-fetches, and stops once the need is met', async () => {
    state.selects.push([{ n: 1 }]) // holding 1 of 3
    state.selects.push([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }]) // candidates (limit 4)
    state.updateReturns.push([{ id: 'p1' }]) // claimed
    state.updateReturns.push([]) // lost the race on p2
    state.updateReturns.push([{ id: 'p3' }]) // claimed → need met
    const r = await fillCallerQueue(caller, { now: NOW, floor: 60 })
    expect(r).toEqual({ claimed: 2, holding: 3, target: 3 })
    expect(state.selectCalls[1].limit).toBe(4) // (3 - 1) * 2
    // Three claims attempted, the fourth candidate never touched.
    const claims = state.updates.filter((u) => u.table === 'prospect')
    expect(claims.map((u) => node(u.where, 'eq', 'prospect.id').args[1])).toEqual(['p1', 'p2', 'p3'])
    for (const c of claims) {
      expect(has(c.where, 'isNull', 'prospect.assignedCallerId'), 'every claim is predicated on IS NULL').toBe(true)
      expect(c.set.assignedCallerId).toBe('pcal_1')
      expect(c.set.assignedAt).toBe(NOW)
    }
  })

  it('orders best quality first, then opportunity', async () => {
    state.selects.push([{ n: 0 }])
    state.selects.push([])
    await fillCallerQueue(caller, { now: NOW, floor: 60 })
    expect(state.selectCalls[1].orderBy.length).toBeGreaterThanOrEqual(2)
    expect(has(state.selectCalls[1].where, 'inArray', 'prospect.state')).toBe(true)
  })

  it('a full queue claims nothing and never reads the pool', async () => {
    state.selects.push([{ n: 3 }])
    const r = await fillCallerQueue(caller, { now: NOW, floor: 60 })
    expect(r.claimed).toBe(0)
    expect(state.selectCalls).toHaveLength(1)
    expect(state.updates).toHaveLength(0)
  })

  it('a paused caller gets nothing', async () => {
    state.selects.push([{ n: 0 }])
    const r = await fillCallerQueue({ ...caller, status: 'paused' }, { now: NOW, floor: 60 })
    expect(r.claimed).toBe(0)
    expect(state.updates).toHaveLength(0)
  })
})

describe('outcomes end or keep the assignment', () => {
  it('CALLER_TERMINAL_OUTCOMES is the one list', () => {
    expect([...CALLER_TERMINAL_OUTCOMES].sort()).toEqual(
      ['not_interested', 'closed', 'disconnected', 'wrong_number', 'won', 'demo_booked'].sort(),
    )
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

  it('a disconnected number ends the assignment — released only if THIS caller still holds it', async () => {
    state.selects.push([{ id: 'p1', name: 'Smile', timezone: null, phone: '4045551212' }])
    state.selects.push([]) // applyCallerFeedback read
    const r = await logCallerOutcome({ caller: { id: 'pcal_1' }, prospectId: 'p1', outcome: 'disconnected' })
    expect(r).toEqual({ ok: true, released: true })
    const release = state.updates.find((u) => u.table === 'prospect' && u.set.assignedCallerId === null)!
    expect(release).toBeTruthy()
    expect(node(release.where, 'eq', 'prospect.id').args[1]).toBe('p1')
    expect(node(release.where, 'eq', 'prospect.assignedCallerId').args[1]).toBe('pcal_1')
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
  it('releases with a 3-day cooldown and a log row that is not a dial', async () => {
    state.selects.push([{ id: 'p1', name: 'Smile', timezone: null, phone: '4045551212' }])
    await skipProspectForCaller({ caller: { id: 'pcal_1' }, prospectId: 'p1', reason: 'bad_timing' })
    expect(state.inserts[0]).toMatchObject({ table: 'prospect_call_log', values: { outcome: 'skipped', callerId: 'pcal_1' } })
    const release = state.updates.find((u) => u.table === 'prospect')!
    expect(release.set.assignedCallerId).toBeNull()
    const until = release.set.callerCooldownUntil as Date
    expect(until.getTime() - Date.now()).toBeGreaterThan(3 * 24 * 3600 * 1000 - 5000)
    expect(node(release.where, 'eq', 'prospect.assignedCallerId').args[1]).toBe('pcal_1')
    // A skip never counts as a dial.
    expect(windowFromOutcomes([{ outcome: 'skipped', n: 4 }, { outcome: 'no_answer', n: 2 }]).dials).toBe(2)
  })
})

describe('the owner’s own queues hide what a caller holds (no double-dialing)', () => {
  it('call list, phone-first, Call Mode and due follow-ups all read assigned_caller_id IS NULL', async () => {
    const { isNull } = await import('drizzle-orm')
    const calls = () => (isNull as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter((c) => c[0] === 'prospect.assignedCallerId').length

    ;(isNull as unknown as { mockClear: () => void }).mockClear()
    state.selects.push([]) // rows
    await getCallList()
    expect(calls()).toBeGreaterThanOrEqual(1)

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
