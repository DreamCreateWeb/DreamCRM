import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  mine: [] as unknown[],
  unclaimed: [] as unknown[],
  threads: [] as unknown[],
  appts: [] as unknown[],
  leadCount: 0,
  balanceCount: 0,
  balanceTotal: 0,
  listOpenFollowups: vi.fn(),
}))

vi.mock('@/lib/services/patient-followups', () => ({ listOpenFollowups: h.listOpenFollowups }))
vi.mock('@/lib/services/patient-messaging', () => ({ listPatientThreads: vi.fn(async () => h.threads) }))
vi.mock('@/lib/services/appointments', () => ({ listAppointments: vi.fn(async () => h.appts) }))
vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    let tbl = ''
    o.from = (t: { __t?: string }) => { tbl = t?.__t ?? ''; return o }
    o.where = () =>
      Promise.resolve(tbl === 'patient' ? [{ n: h.balanceCount, total: h.balanceTotal }] : [{ n: h.leadCount }])
    return o
  }
  return {
    db: { select: () => chain() },
    schema: {
      lead: { __t: 'lead', organizationId: 'o', status: 's' },
      patient: { __t: 'patient', organizationId: 'o', isActive: 'a', pmsBalanceCents: 'b' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  count: () => ({ count: true }),
  eq: (...a: unknown[]) => ({ a }),
  gt: (...a: unknown[]) => ({ a }),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }), {}),
}))

import { getMyDay } from '@/lib/services/my-day'
import { todayYmd, addDaysYmd } from '@/lib/types/followups'

const TODAY = todayYmd()
function fu(over: Record<string, unknown>) {
  return { id: 'f', patientId: 'p', patientName: 'X', title: 't', dueDate: null, assignedUserId: null, assigneeName: null, status: 'open', createdByName: null, completedAt: null, createdAt: new Date(), ...over }
}

beforeEach(() => {
  h.mine = []; h.unclaimed = []; h.threads = []; h.appts = []; h.leadCount = 0
  h.balanceCount = 0; h.balanceTotal = 0
  h.listOpenFollowups.mockReset().mockImplementation(async (_org: string, f: { assignedTo?: string }) =>
    f.assignedTo === 'unassigned' ? h.unclaimed : h.mine,
  )
})

describe('getMyDay', () => {
  it('merges my + unclaimed follow-ups, sorted soonest-due, and counts overdue/today', async () => {
    h.mine = [fu({ id: 'a', dueDate: addDaysYmd(TODAY, -2) })] // overdue
    h.unclaimed = [
      fu({ id: 'b', dueDate: TODAY }), // today
      fu({ id: 'c', dueDate: addDaysYmd(TODAY, 5) }), // later
    ]
    const d = await getMyDay('org_1', 'u1')
    expect(d.followups.items.map((f) => f.id)).toEqual(['a', 'b', 'c']) // soonest-due first
    expect(d.followups.overdue).toBe(1)
    expect(d.followups.today).toBe(1)
    // queried both my + unclaimed
    expect(h.listOpenFollowups).toHaveBeenCalledWith('org_1', { assignedTo: 'u1' })
    expect(h.listOpenFollowups).toHaveBeenCalledWith('org_1', { assignedTo: 'unassigned' })
  })

  it('caps conversations at 8 and surfaces the lead count', async () => {
    h.threads = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}` }))
    h.leadCount = 4
    const d = await getMyDay('org_1', 'u1')
    expect(d.conversations).toHaveLength(8)
    expect(d.newLeadsCount).toBe(4)
  })

  it('counts today\'s unconfirmed visits + outstanding balances', async () => {
    // Future startTimes — a scheduled slot that already PASSED today no longer
    // counts as "needs a confirmation text" (see getMyDay).
    const soon = new Date(Date.now() + 60 * 60 * 1000)
    h.appts = [
      { status: 'scheduled', startTime: soon },
      { status: 'confirmed', startTime: soon },
      { status: 'scheduled', startTime: soon },
    ]
    h.balanceCount = 3
    h.balanceTotal = 45000
    const d = await getMyDay('org_1', 'u1')
    expect(d.unconfirmedTodayCount).toBe(2)
    expect(d.balances).toEqual({ count: 3, totalCents: 45000 })
  })
})
