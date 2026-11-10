import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The platform admin's side of the callers (P-02): the invite (every user
 * value escaped, a 7-day link, the unique email), resend, pause / resume /
 * archive (archive hands everything back), the list's numbers, reassign.
 */

const state = {
  selects: [] as unknown[][],
  updateReturns: [] as unknown[][],
  updates: [] as Array<{ table: string; set: Record<string, unknown>; where: unknown }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}
const deliverSpy = vi.fn(async (_m: { to: string; subject: string; html: string }) => {})

vi.mock('@/lib/db', () => {
  const table = (name: string) =>
    new Proxy({ _n: name }, { get: (_t, k) => (k === '_n' ? name : `${name}.${String(k)}`) })
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.groupBy = () => obj
    obj.limit = () => obj
    obj.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(state.selects.shift() ?? []).then(onF, onR)
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
// The REAL shell + escapeHtml, so the test grades the HTML a caller would get.
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, deliver: (m: { to: string; subject: string; html: string }) => deliverSpy(m) }
})

import {
  archiveCaller,
  createCaller,
  listCallers,
  reassignProspect,
  resendCallerInvite,
  setCallerStatus,
} from '@/lib/services/prospect-callers'
import { CALLER_INVITE_TTL_DAYS } from '@/lib/types/prospecting'

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

beforeEach(() => {
  state.selects = []
  state.updateReturns = []
  state.updates = []
  state.inserts = []
  deliverSpy.mockClear()
})

describe('createCaller — the invite', () => {
  it('normalizes the email, defaults the target, stores the states, and mails a 7-day link', async () => {
    state.selects.push([]) // no dupe
    const r = await createCaller({ name: 'Priya Nair', email: ' Priya@Example.COM ', states: ['tx', 'ok'], createdByUserId: 'u_owner' })
    expect(r.email).toBe('priya@example.com')
    const row = state.inserts[0]
    expect(row.table).toBe('prospect_caller')
    expect(row.values).toMatchObject({ status: 'invited', dailyTarget: 40, states: ['TX', 'OK'], createdByUserId: 'u_owner' })
    expect(String(row.values.id)).toMatch(/^pcal_/)
    expect(String(row.values.inviteToken)).toHaveLength(48)
    const ttl = (row.values.inviteExpiresAt as Date).getTime() - (row.values.inviteSentAt as Date).getTime()
    expect(ttl).toBe(CALLER_INVITE_TTL_DAYS * 24 * 3600 * 1000)
    expect(deliverSpy).toHaveBeenCalledTimes(1)
    const mail = deliverSpy.mock.calls[0][0]
    expect(mail.to).toBe('priya@example.com')
    expect(mail.subject).toBe('Dream Create invited you to call for them')
    expect(mail.html).toContain(`/caller/accept?token=${row.values.inviteToken}`)
    expect(mail.html).toContain('Hi Priya,')
  })

  it('escapes every user value in the HTML — a name is never markup', async () => {
    state.selects.push([])
    await createCaller({ name: '<script>alert(1)</script> "Bob" & Co', email: 'bob@example.com' })
    const html = deliverSpy.mock.calls[0][0].html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;Bob&quot; &amp; Co')
  })

  it('refuses a bad email, a bad target, a duplicate (and names an archived one)', async () => {
    await expect(createCaller({ name: 'X Y', email: 'nope' })).rejects.toThrow(/valid email/)
    await expect(createCaller({ name: 'X Y', email: 'x@y.com', dailyTarget: 0 })).rejects.toThrow(/between 1 and 500/)
    state.selects.push([{ id: 'pcal_1', status: 'active' }])
    await expect(createCaller({ name: 'X Y', email: 'x@y.com' })).rejects.toThrow(/already exists/)
    state.selects.push([{ id: 'pcal_1', status: 'archived' }])
    await expect(createCaller({ name: 'X Y', email: 'x@y.com' })).rejects.toThrow(/archived caller/)
    expect(deliverSpy).not.toHaveBeenCalled()
  })
})

describe('resend / pause / resume / archive', () => {
  const invited = { id: 'pcal_1', name: 'Priya Nair', email: 'priya@example.com', status: 'invited', userId: null }

  it('resend re-arms a fresh token + a fresh 7-day clock; refuses once linked', async () => {
    state.selects.push([invited])
    await resendCallerInvite('pcal_1')
    const u = state.updates.find((x) => x.table === 'prospect_caller')!
    expect(String(u.set.inviteToken)).toHaveLength(48)
    expect(u.set.status).toBe('invited')
    expect(deliverSpy).toHaveBeenCalledTimes(1)

    state.selects.push([{ ...invited, userId: 'u1', status: 'active' }])
    await expect(resendCallerInvite('pcal_1')).rejects.toThrow(/already set up/)
  })

  it('pause / resume flip the status; resume needs an accepted invite; archived is final', async () => {
    state.selects.push([{ ...invited, userId: 'u1', status: 'active' }])
    await setCallerStatus('pcal_1', 'paused')
    expect(state.updates[0].set.status).toBe('paused')

    state.selects.push([invited]) // never accepted
    await expect(setCallerStatus('pcal_1', 'active')).rejects.toThrow(/not accepted/)

    state.selects.push([{ ...invited, status: 'archived' }])
    await expect(setCallerStatus('pcal_1', 'active')).rejects.toThrow(/archived/)
  })

  it('archive closes the account, burns the token and hands EVERY held prospect back', async () => {
    state.updateReturns.push([]) // the caller row update
    state.updateReturns.push([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]) // released
    const r = await archiveCaller('pcal_1')
    expect(r.released).toBe(3)
    expect(state.updates[0]).toMatchObject({ table: 'prospect_caller', set: { status: 'archived', inviteToken: null } })
    const release = state.updates[1]
    expect(release.table).toBe('prospect')
    expect(release.set).toMatchObject({ assignedCallerId: null, assignedAt: null })
    expect(find(release.where, (n) => n.op === 'eq' && n.args[0] === 'prospect.assignedCallerId' && n.args[1] === 'pcal_1')).toHaveLength(1)
  })
})

describe('listCallers — the tab’s numbers', () => {
  it('assigned-now, today and 7-day windows per caller, on the booking clock', async () => {
    state.selects.push([
      { id: 'pcal_1', name: 'Priya Nair', email: 'priya@example.com', status: 'active', dailyTarget: 40, states: ['TX'], notes: null, userId: 'u1', inviteExpiresAt: null, lastActiveAt: null, createdAt: new Date('2026-11-01T00:00:00Z') },
      { id: 'pcal_2', name: 'Sam Lee', email: 'sam@example.com', status: 'invited', dailyTarget: 20, states: null, notes: 'x', userId: null, inviteExpiresAt: new Date(), lastActiveAt: null, createdAt: new Date('2026-11-02T00:00:00Z') },
    ])
    state.selects.push([{ callerId: 'pcal_1', n: 12 }]) // assigned now
    state.selects.push([
      { callerId: 'pcal_1', outcome: 'no_answer', week: 30, today: 6 },
      { callerId: 'pcal_1', outcome: 'callback', week: 4, today: 1 },
      { callerId: 'pcal_1', outcome: 'demo_booked', week: 2, today: 1 },
      { callerId: 'pcal_1', outcome: 'disconnected', week: 3, today: 0 },
      { callerId: 'pcal_1', outcome: 'skipped', week: 5, today: 2 },
    ])
    const rows = await listCallers({ now: new Date('2026-11-10T15:00:00Z'), timeZone: 'America/New_York' })
    expect(rows).toHaveLength(2)
    const p = rows[0]
    expect(p.linked).toBe(true)
    expect(p.states).toEqual(['TX'])
    expect(p.assignedNow).toBe(12)
    expect(p.week).toEqual({ dials: 39, reached: 6, reachedPct: 15, callbacks: 4, meetings: 2, disconnected: 3 })
    expect(p.today).toEqual({ dials: 8, reached: 2, reachedPct: 25, callbacks: 1, meetings: 1, disconnected: 0 })
    const s = rows[1]
    expect(s.linked).toBe(false)
    expect(s.assignedNow).toBe(0)
    expect(s.week.reachedPct).toBeNull()
  })
})

describe('reassignProspect (platform admin)', () => {
  it('hands the row to an active caller and clears any cooldown; null unassigns', async () => {
    state.selects.push([{ id: 'pcal_2', status: 'active' }])
    await reassignProspect('p1', 'pcal_2')
    expect(state.updates[0].set).toMatchObject({ assignedCallerId: 'pcal_2', callerCooldownUntil: null })
    expect(state.updates[0].set.assignedAt).toBeInstanceOf(Date)

    await reassignProspect('p1', null)
    expect(state.updates[1].set).toMatchObject({ assignedCallerId: null, assignedAt: null })

    state.selects.push([{ id: 'pcal_3', status: 'paused' }])
    await expect(reassignProspect('p1', 'pcal_3')).rejects.toThrow(/active caller/)
  })
})
