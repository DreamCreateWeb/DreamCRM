import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE CALLER PERSONA'S REACH (P-02) — a caller reaches NOTHING but their own
 * queue. Through the caller actions:
 *   - every action authorizes with requireCaller in action mode (a throw,
 *     never a redirect) and refuses a non-caller;
 *   - every write asserts `prospect.assigned_caller_id = caller.id` on the
 *     row before touching it, so a caller cannot act on another caller's
 *     prospect or on the full prospect table;
 *   - the caller's reads filter by their own id;
 *   - no clinic, patient, org or member table is ever touched.
 */

const state = {
  caller: null as null | { id: string; name: string; userId: string; status: string; dailyTarget: number; states: unknown },
  selects: [] as unknown[][],
  updateReturns: [] as unknown[][],
  tables: [] as string[],
  wheres: [] as Array<{ table: string; where: unknown }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown>; where: unknown }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}

const { CLINIC_TABLES } = vi.hoisted(() => ({
  CLINIC_TABLES: ['patient', 'appointment', 'organization', 'member', 'clinic_profile', 'lead', 'user'],
}))

vi.mock('@/lib/db', () => {
  const table = (name: string) =>
    new Proxy({ _n: name }, { get: (_t, k) => (k === '_n' ? name : `${name}.${String(k)}`) })
  const selectChain = () => {
    let tbl = ''
    const obj: any = {}
    obj.for = () => obj
    obj.from = (t: { _n: string }) => {
      tbl = t._n
      state.tables.push(tbl)
      return obj
    }
    obj.innerJoin = (t: { _n: string }) => {
      state.tables.push(t._n)
      return obj
    }
    obj.where = (w: unknown) => {
      state.wheres.push({ table: tbl, where: w })
      return obj
    }
    obj.orderBy = () => obj
    obj.groupBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selects.shift() ?? []).then(onF, onR)
    return obj
  }
  const updateChain = (t: { _n: string }) => {
    const rec: { table: string; set: Record<string, unknown>; where: unknown } = { table: t._n, set: {}, where: undefined }
    state.tables.push(t._n)
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
  const all = [
    'prospect', 'prospect_call_log', 'prospect_caller', 'prospect_meeting', 'prospecting_config', 'outreach_enrollment',
    ...CLINIC_TABLES,
  ]
  const schema: Record<string, unknown> = {}
  for (const n of all) schema[n.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = table(n)
  schema.prospectingConfig = table('prospecting_config')
  const db: any = {
    select: () => selectChain(),
    update: (t: { _n: string }) => updateChain(t),
    insert: (t: { _n: string }) => {
      state.tables.push(t._n)
      return {
        values: async (values: Record<string, unknown>) => {
          state.inserts.push({ table: t._n, values })
        },
      }
    },
  }
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db)
  return { db, schema }
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
vi.mock('@/lib/email', () => ({ deliver: vi.fn(async () => {}), authEmailShell: vi.fn(() => ''), escapeHtml: (s: string) => s }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// requireCaller: an ACTIVE caller row looked up by user id — or a throw.
vi.mock('@/lib/auth/context', () => ({
  requireCaller: vi.fn(async (opts?: { redirectOnFail?: boolean }) => {
    if (opts?.redirectOnFail !== false) throw new Error('caller actions must pass redirectOnFail: false')
    if (!state.caller || state.caller.status !== 'active') throw new Error('Forbidden: active caller account required')
    return { ctx: { userId: state.caller.userId, tenantType: 'caller' }, caller: state.caller }
  }),
}))
vi.mock('@/lib/services/call-script', () => ({
  getOrGenerateCallScript: vi.fn(async () => ({ opener: 'hi' })),
}))
vi.mock('@/lib/services/prospect-meetings', () => ({
  logBookedDemo: vi.fn(async () => ({ id: 'pmtg_1', token: 't' })),
  formatMeetingTime: vi.fn(() => 'Wed, Nov 12 at 2:00 PM EST'),
}))
vi.mock('@/lib/services/gsc', () => ({ getPlatformOrgId: vi.fn(async () => 'org_platform') }))
const briefSpy = vi.fn(async () => null)
vi.mock('@/lib/services/demo-brief', () => ({ generateDemoBrief: (...a: unknown[]) => briefSpy(...(a as [])) }))
const notifySpy = vi.fn(async () => {})
vi.mock('@/lib/services/notifications', () => ({ notifyOrgMembers: (...a: unknown[]) => notifySpy(...(a as [])) }))

import {
  bookDemoAsCallerAction,
  fillMyQueueAction,
  getCallerScriptAction,
  logCallerOutcomeAction,
  skipProspectAction,
} from '@/app/(caller)/calls/actions'
import { getCallerQueue, getCallerLater, getCallerToday, getCallerBooked } from '@/lib/services/prospect-callers'

type Node = { op: string; args: unknown[] }
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
const owns = (tree: unknown, callerId: string) =>
  find(tree, (n) => n.op === 'eq' && n.args[0] === 'prospect.assignedCallerId' && n.args[1] === callerId).length > 0

const ME = { id: 'pcal_me', name: 'Priya Nair', userId: 'u_me', status: 'active', dailyTarget: 40, states: null }
const OWN_ROW = { id: 'p1', name: 'Smile Dental', timezone: 'America/Chicago', phone: '4045551212' }

beforeEach(() => {
  state.caller = ME
  state.selects = []
  state.updateReturns = []
  state.tables = []
  state.wheres = []
  state.updates = []
  state.inserts = []
  notifySpy.mockClear()
  briefSpy.mockClear()
})

function noClinicTableTouched() {
  const touched = state.tables.filter((t) => CLINIC_TABLES.includes(t))
  expect(touched, 'a caller action touched a clinic / org / patient table').toEqual([])
}

describe('every caller action is caller-only', () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ['getCallerScriptAction', () => getCallerScriptAction('p1')],
    ['logCallerOutcomeAction', () => logCallerOutcomeAction({ prospectId: 'p1', outcome: 'no_answer' })],
    ['skipProspectAction', () => skipProspectAction({ prospectId: 'p1', reason: 'other' })],
    ['bookDemoAsCallerAction', () => bookDemoAsCallerAction({ prospectId: 'p1', demoDay: '2099-01-05', demoTime: '14:00' })],
    ['fillMyQueueAction', () => fillMyQueueAction()],
  ]

  for (const [name, run] of calls) {
    it(`${name} refuses a non-caller before any read or write`, async () => {
      state.caller = null
      await expect(run()).rejects.toThrow(/active caller account required/)
      expect(state.tables).toEqual([])
      expect(state.inserts).toEqual([])
      expect(state.updates).toEqual([])
    })

    it(`${name} refuses a paused caller`, async () => {
      state.caller = { ...ME, status: 'paused' }
      await expect(run()).rejects.toThrow(/active caller account required/)
      expect(state.tables).toEqual([])
    })
  }
})

describe('ownership is asserted on the row before every write', () => {
  it("logCallerOutcomeAction: another caller's prospect is refused, nothing written", async () => {
    state.selects.push([]) // the ownership read (id AND assigned_caller_id = me) finds nothing
    await expect(logCallerOutcomeAction({ prospectId: 'p_theirs', outcome: 'no_answer' })).rejects.toThrow(/not in your queue/)
    expect(state.wheres[0].table).toBe('prospect')
    expect(owns(state.wheres[0].where, 'pcal_me')).toBe(true)
    expect(state.inserts).toEqual([])
    expect(state.updates).toEqual([])
    noClinicTableTouched()
  })

  it('logCallerOutcomeAction: own prospect → the same spine, caller stamped, release predicated on ownership', async () => {
    state.selects.push([OWN_ROW])
    state.selects.push([]) // applyCallerFeedback read
    const r = await logCallerOutcomeAction({ prospectId: 'p1', outcome: 'disconnected', note: 'dead tone' })
    expect(r).toEqual({ ok: true, released: true })
    expect(state.inserts[0]).toMatchObject({ table: 'prospect_call_log', values: { outcome: 'disconnected', callerId: 'pcal_me' } })
    // The spine's own release hook (self-checking) fires first; the caller's
    // release is the one predicated on ownership.
    const release = state.updates.find((u) => u.table === 'prospect' && u.set.assignedCallerId === null && owns(u.where, 'pcal_me'))!
    expect(release).toBeTruthy()
    noClinicTableTouched()
  })

  it('logCallerOutcomeAction: a callback resolves the chosen time in the PRACTICE’s zone', async () => {
    state.selects.push([OWN_ROW]) // Chicago
    state.selects.push([])
    const r = await logCallerOutcomeAction({ prospectId: 'p1', outcome: 'callback', callbackDay: '2099-07-01', callbackTime: '14:30' })
    expect(r.ok).toBe(true)
    const plan = state.updates.find((u) => u.table === 'prospect' && 'nextFollowUpAt' in u.set)!
    // 14:30 CDT (UTC-5) on 2099-07-01 = 19:30Z
    expect((plan.set.nextFollowUpAt as Date).toISOString()).toBe('2099-07-01T19:30:00.000Z')
  })

  it('logCallerOutcomeAction: a pass needs a coded reason; a demo needs the booking form', async () => {
    expect(await logCallerOutcomeAction({ prospectId: 'p1', outcome: 'not_interested' })).toMatchObject({ ok: false })
    expect(await logCallerOutcomeAction({ prospectId: 'p1', outcome: 'demo_booked' })).toMatchObject({ ok: false })
    expect(await logCallerOutcomeAction({ prospectId: 'p1', outcome: 'won' })).toMatchObject({ ok: false }) // not a caller key
    expect(state.inserts).toEqual([])
  })

  it("skipProspectAction: another caller's prospect is refused", async () => {
    state.selects.push([])
    await expect(skipProspectAction({ prospectId: 'p_theirs', reason: 'other' })).rejects.toThrow(/not in your queue/)
    expect(state.inserts).toEqual([])
    expect(state.updates).toEqual([])
  })

  it("getCallerScriptAction: another caller's prospect is refused — no script generated", async () => {
    state.selects.push([])
    await expect(getCallerScriptAction('p_theirs')).rejects.toThrow(/not in your queue/)
    const { getOrGenerateCallScript } = await import('@/lib/services/call-script')
    expect(getOrGenerateCallScript).not.toHaveBeenCalled()
  })

  it('bookDemoAsCallerAction: own prospect → meeting + outcome + the brief pre-warmed + the owner told who booked it; the row STAYS with the caller', async () => {
    state.selects.push([OWN_ROW]) // ownership
    state.selects.push([{ config: { booking: { hostTimeZone: 'America/New_York', durationMin: 30 } } }]) // config
    state.selects.push([]) // applyCallerFeedback read
    const r = await bookDemoAsCallerAction({ prospectId: 'p1', demoDay: '2099-01-05', demoTime: '14:00', attendeeEmail: 'dr@smile.com' })
    expect(r).toEqual({ ok: true })
    const { logBookedDemo } = await import('@/lib/services/prospect-meetings')
    expect(logBookedDemo).toHaveBeenCalledWith(expect.objectContaining({ prospectId: 'p1', createdByUserId: 'u_me' }))
    // 2:00 PM on Dream Create's clock (EST, UTC-5) — never the caller's zone.
    const booked = (logBookedDemo as unknown as { mock: { calls: Array<[{ scheduledAt: Date }]> } }).mock.calls[0][0]
    expect(booked.scheduledAt.toISOString()).toBe('2099-01-05T19:00:00.000Z')
    expect(state.inserts[0]).toMatchObject({ table: 'prospect_call_log', values: { outcome: 'demo_booked', callerId: 'pcal_me' } })
    // Not released: the booked meeting takes it off the dial card and out of
    // the pool; it stays with the caller who earned it until the demo passes.
    expect(state.updates.filter((u) => u.table === 'prospect' && u.set.assignedCallerId === null)).toHaveLength(0)
    // The demo brief is pre-warmed exactly as the owner's own booking does it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(briefSpy).toHaveBeenCalledWith('p1')
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const [orgId, input] = notifySpy.mock.calls[0] as unknown as [string, { type: string; title: string }]
    expect(orgId).toBe('org_platform')
    expect(input.type).toBe('prospect_demo_booked')
    expect(input.title).toContain('Priya Nair')
    noClinicTableTouched()
  })

  it("bookDemoAsCallerAction: another caller's prospect is refused before any write", async () => {
    state.selects.push([])
    await expect(bookDemoAsCallerAction({ prospectId: 'p_theirs', demoDay: '2099-01-05', demoTime: '14:00' })).rejects.toThrow(
      /not in your queue/,
    )
    expect(state.inserts).toEqual([])
    expect(notifySpy).not.toHaveBeenCalled()
  })
})

describe('the caller’s reads are filtered by their own id', () => {
  it('getCallerQueue reads only assigned_caller_id = me — never the full prospect table', async () => {
    state.selects.push([])
    await getCallerQueue('pcal_me', { now: new Date() })
    // (the first recorded where is the servable predicate's meeting subquery)
    const read = state.wheres.find((w) => w.table === 'prospect')!
    expect(read).toBeTruthy()
    expect(owns(read.where, 'pcal_me')).toBe(true)
    noClinicTableTouched()
  })

  it('getCallerLater, getCallerToday and getCallerBooked are keyed on the caller', async () => {
    state.selects.push([])
    await getCallerLater('pcal_me', { now: new Date() })
    expect(owns(state.wheres[0].where, 'pcal_me')).toBe(true)

    state.wheres = []
    state.selects.push([{ holding: 0, later: 0 }], [{ queue: 0, callbacksDue: 0 }], [])
    await getCallerToday(ME, { now: new Date(), timeZone: 'America/New_York' })
    for (const w of state.wheres.filter((x) => x.table === 'prospect')) expect(owns(w.where, 'pcal_me')).toBe(true)
    const logWhere = state.wheres.find((w) => w.table === 'prospect_call_log')!
    expect(find(logWhere.where, (n) => n.op === 'eq' && n.args[0] === 'prospect_call_log.callerId' && n.args[1] === 'pcal_me')).toHaveLength(1)

    state.wheres = []
    state.selects.push([])
    await getCallerBooked(ME, { now: new Date() })
    expect(find(state.wheres[0].where, (n) => n.op === 'eq' && n.args[0] === 'prospect_meeting.createdByUserId' && n.args[1] === 'u_me')).toHaveLength(1)
    expect(await getCallerBooked({ id: 'pcal_x', userId: null })).toEqual([])
    noClinicTableTouched()
  })

  it('fillMyQueueAction tops up only MY queue — under MY row lock', async () => {
    state.selects.push([]) // the prospecting config (defaults)
    state.selects.push([{ id: 'pcal_me' }]) // the lock
    state.selects.push([{ n: 40 }]) // full
    const r = await fillMyQueueAction()
    expect(r).toMatchObject({ ok: true, claimed: 0, ready: 40, target: 40 })
    const lock = state.wheres.find((w) => w.table === 'prospect_caller')!
    expect(find(lock.where, (n) => n.op === 'eq' && n.args[0] === 'prospect_caller.id' && n.args[1] === 'pcal_me')).toHaveLength(1)
    const count = state.wheres.find((w) => w.table === 'prospect')!
    expect(owns(count.where, 'pcal_me')).toBe(true)
    noClinicTableTouched()
  })
})
