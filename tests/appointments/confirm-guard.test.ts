import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * confirmAppointment must refuse a no-show (and the existing terminal states).
 * A no_show isn't terminal — the patient can rebook via reschedule — but
 * CONFIRMING a missed visit back to active corrupts no-show metrics and
 * re-arms reminders for a passed visit.
 */

const state = {
  selectQueue: [] as unknown[][],
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: async () => { state.updates.push(set) },
        }),
      }),
    },
    schema: {
      appointment: { organizationId: 'org', id: 'id', status: 'status' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  or: vi.fn(() => ({ _: 'or' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

import { confirmAppointment } from '@/lib/services/appointments'

beforeEach(() => {
  state.selectQueue = []
  state.updates = []
})

describe('confirmAppointment status guard', () => {
  it('refuses to confirm a no-show', async () => {
    state.selectQueue = [[{ status: 'no_show' }]]
    await expect(confirmAppointment('org_1', 'a1')).rejects.toThrow(/no-show/i)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses to confirm a cancelled visit (terminal)', async () => {
    state.selectQueue = [[{ status: 'cancelled' }]]
    await expect(confirmAppointment('org_1', 'a1')).rejects.toThrow(/cancelled/i)
    expect(state.updates).toHaveLength(0)
  })

  it('confirms a scheduled visit', async () => {
    state.selectQueue = [[{ status: 'scheduled' }]]
    await confirmAppointment('org_1', 'a1', 'manual')
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].status).toBe('confirmed')
    expect(state.updates[0].confirmedVia).toBe('manual')
  })
})
