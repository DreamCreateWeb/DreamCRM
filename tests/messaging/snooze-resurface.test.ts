import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * resurfaceSnoozedThreads — the snooze timer's other half. A run-out snooze
 * is flipped to 'open' in ONE statement (status='snoozed' in the WHERE is
 * what makes a second tick a no-op) and the assignee (else the owners/admins)
 * is told once, in the bell. Shut-down and demo orgs are left alone.
 */

const state = {
  flipped: [] as Array<Record<string, unknown>>,
  updateSets: [] as Array<Record<string, unknown>>,
  updateWheres: [] as unknown[],
  patients: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.patients
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      update: () => ({
        set: (set: Record<string, unknown>) => ({
          where: (clause: unknown) => {
            state.updateSets.push(set)
            state.updateWheres.push(clause)
            return { returning: async () => state.flipped }
          },
        }),
      }),
    },
    schema: {
      patientThread: {
        id: 'thread.id', organizationId: 'thread.org', patientId: 'thread.patient', status: 'thread.status',
        snoozedUntil: 'thread.snoozed_until', assignedUserId: 'thread.assignee', updatedAt: 'thread.updated',
      },
      patient: { id: 'patient.id', organizationId: 'patient.org', firstName: 'patient.first' },
      organization: { id: 'org.id', isDemo: 'org.is_demo' },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...a: unknown[]) => ({ _: 'and', a })),
  eq: vi.fn((col: unknown, v: unknown) => ({ _: 'eq', col, v })),
  or: vi.fn(() => ({ _: 'or' })),
  asc: vi.fn((x) => x),
  desc: vi.fn((x) => x),
  count: vi.fn(() => ({ _: 'count' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn((col: unknown, v: unknown) => ({ _: 'lte', col, v })),
  ilike: vi.fn(() => ({ _: 'ilike' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  notInArray: vi.fn((col: unknown, v: unknown) => ({ _: 'notInArray', col, v })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  isNotNull: vi.fn((col: unknown) => ({ _: 'isNotNull', col })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

const shutDown = new Set<string>()
vi.mock('@/lib/services/billing-state', () => ({
  listShutDownOrgIds: async () => shutDown,
}))

const notifyMock = vi.fn(async (..._a: unknown[]) => undefined)
const notifyOrgMembersMock = vi.fn(async (..._a: unknown[]) => undefined)
vi.mock('@/lib/services/notifications', () => ({
  notify: (...a: unknown[]) => notifyMock(...(a as [])),
  notifyOrgMembers: (...a: unknown[]) => notifyOrgMembersMock(...(a as [])),
}))

// The service's wider import graph — none of it runs here.
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: vi.fn(async () => true) }))
vi.mock('@/lib/email', () => ({ sendPatientMessageEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/Chicago') }))

import { resurfaceSnoozedThreads, isSnoozeResurfaced } from '@/lib/services/patient-messaging'
import { eq, lte } from 'drizzle-orm'

const NOW = new Date('2026-10-26T15:00:00Z')

beforeEach(() => {
  state.flipped = []
  state.updateSets = []
  state.updateWheres = []
  state.patients = [{ firstName: 'Aiden' }]
  shutDown.clear()
  notifyMock.mockClear()
  notifyOrgMembersMock.mockClear()
})

describe('isSnoozeResurfaced — the one definition', () => {
  it('is true only for a snoozed thread whose until has passed', () => {
    expect(isSnoozeResurfaced('snoozed', new Date(NOW.getTime() - 1), NOW)).toBe(true)
    expect(isSnoozeResurfaced('snoozed', NOW, NOW)).toBe(true)
    expect(isSnoozeResurfaced('snoozed', new Date(NOW.getTime() + 60_000), NOW)).toBe(false)
    expect(isSnoozeResurfaced('snoozed', null, NOW)).toBe(false)
    expect(isSnoozeResurfaced('open', new Date(NOW.getTime() - 1), NOW)).toBe(false)
  })
})

describe('resurfaceSnoozedThreads', () => {
  it('flips run-out snoozes to open in one guarded statement', async () => {
    state.flipped = [{ id: 'thr_1', organizationId: 'org_1', patientId: 'pat_1', assignedUserId: null }]
    const r = await resurfaceSnoozedThreads(NOW)
    expect(r).toEqual({ resurfaced: 1, notified: 1 })
    expect(state.updateSets[0]).toMatchObject({ status: 'open', snoozedUntil: null, updatedAt: NOW })
    // The WHERE is the idempotency: only still-snoozed rows whose until has passed.
    expect(eq).toHaveBeenCalledWith('thread.status', 'snoozed')
    expect(lte).toHaveBeenCalledWith('thread.snoozed_until', NOW)
  })

  it('tells the assignee in the bell, once, with the thread link', async () => {
    state.flipped = [{ id: 'thr_1', organizationId: 'org_1', patientId: 'pat_1', assignedUserId: 'u_mary' }]
    await resurfaceSnoozedThreads(NOW)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock.mock.calls[0][0]).toMatchObject({
      userId: 'u_mary',
      organizationId: 'org_1',
      type: 'thread_resurfaced',
      title: 'Aiden’s conversation is back from snooze',
      linkPath: '/messages?thread=thr_1',
    })
    expect(notifyOrgMembersMock).not.toHaveBeenCalled()
  })

  it('tells the owners/admins when nobody owns the thread', async () => {
    state.flipped = [{ id: 'thr_2', organizationId: 'org_1', patientId: 'pat_2', assignedUserId: null }]
    await resurfaceSnoozedThreads(NOW)
    expect(notifyMock).not.toHaveBeenCalled()
    expect(notifyOrgMembersMock).toHaveBeenCalledTimes(1)
    const [orgId, alert, opts] = notifyOrgMembersMock.mock.calls[0] as [string, Record<string, unknown>, Record<string, unknown>]
    expect(orgId).toBe('org_1')
    expect(alert.type).toBe('thread_resurfaced')
    expect(opts).toEqual({ roles: ['owner', 'admin'] })
  })

  it('a bell blip never undoes the flip — it is counted, not thrown', async () => {
    state.flipped = [
      { id: 'thr_1', organizationId: 'org_1', patientId: 'pat_1', assignedUserId: 'u1' },
      { id: 'thr_2', organizationId: 'org_1', patientId: 'pat_2', assignedUserId: 'u1' },
    ]
    notifyMock.mockRejectedValueOnce(new Error('bell down'))
    const r = await resurfaceSnoozedThreads(NOW)
    expect(r).toEqual({ resurfaced: 2, notified: 1 })
  })

  it('is a quiet no-op when nothing has run out', async () => {
    state.flipped = []
    const r = await resurfaceSnoozedThreads(NOW)
    expect(r).toEqual({ resurfaced: 0, notified: 0 })
    expect(notifyMock).not.toHaveBeenCalled()
    expect(notifyOrgMembersMock).not.toHaveBeenCalled()
  })
})
