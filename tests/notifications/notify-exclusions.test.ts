import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The staff-alert misdirection guard (the demo-day bug): a staff notification
 * must NEVER reach (a) a patient-role member — enforced in the query even when
 * a caller forgets a roles filter — or (b) the person whose action the alert
 * is about, when their email doubles as a staff-hat account (a dentist-owner
 * who is a patient of their own clinic, or a platform admin booking a fake
 * visit mid-demo). Both are enforced INSIDE notifyOrgMembers, not at call
 * sites, so a future caller can't reintroduce the leak.
 */

const state: {
  selectQueue: unknown[][]
  inserts: Array<Record<string, unknown>>
} = { selectQueue: [], inserts: [] }

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn(async () => undefined) }))
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    ne: vi.fn(actual.ne),
    inArray: vi.fn(actual.inArray),
  }
})
vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          state.inserts.push(v)
        },
      }),
    },
    schema: {
      member: { userId: 'm.userId', organizationId: 'm.orgId', role: 'm.role' },
      organization: { id: 'o.id', isDemo: 'o.isDemo' },
      user: { id: 'u.id', email: 'u.email', name: 'u.name', platformAdmin: 'u.platformAdmin' },
      notifications: {},
      notificationPrefs: {
        userId: 'np.userId',
        comments: 'np.comments',
        candidates: 'np.candidates',
        offers: 'np.offers',
        pushEmail: 'np.pushEmail',
        pushNothing: 'np.pushNothing',
      },
    },
  }
})

import { ne, inArray } from 'drizzle-orm'
import { notifyOrgMembers } from '@/lib/services/notifications'

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
  vi.mocked(ne).mockClear()
  vi.mocked(inArray).mockClear()
})

const input = { bucket: 'comments' as const, type: 'patient_message', title: 'New message' }

/** Queue the notify() internals for ONE recipient: explicit prefs with email
 *  OFF so exactly one select fires per recipient — recipients run under
 *  Promise.all, and a one-row shape keeps the shared queue order-proof. */
function queueNotifyInternals() {
  state.selectQueue.push([
    { comments: true, candidates: true, offers: false, pushEmail: false, pushNothing: false },
  ])
}

describe('notifyOrgMembers exclusions', () => {
  it('skips the recipient whose email matches excludeEmail (case-insensitive, trimmed)', async () => {
    state.selectQueue.push([
      { userId: 'owner_1', email: 'Dustin@Example.com' },
      { userId: 'staff_1', email: 'front-desk@example.com' },
    ])
    queueNotifyInternals() // only staff_1 gets notified

    await notifyOrgMembers('org_1', input, {
      roles: ['owner', 'admin'],
      excludeEmail: '  dustin@example.com ',
    })

    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ userId: 'staff_1' })
  })

  it('notifies everyone when excludeEmail is null/absent', async () => {
    state.selectQueue.push([
      { userId: 'owner_1', email: 'a@x.com' },
      { userId: 'staff_1', email: 'b@x.com' },
    ])
    queueNotifyInternals()
    queueNotifyInternals()

    await notifyOrgMembers('org_1', input, { roles: ['owner', 'admin'], excludeEmail: null })

    expect(state.inserts.map((i) => i.userId).sort()).toEqual(['owner_1', 'staff_1'])
  })

  it('also filters the demo-org platform-admin fallback (the mid-demo booking case)', async () => {
    state.selectQueue.push([]) // member lookup → none
    state.selectQueue.push([{ isDemo: true }]) // org → demo
    state.selectQueue.push([
      { userId: 'admin_demoing', email: 'dustin@x.com' },
      { userId: 'admin_other', email: 'other@x.com' },
    ]) // platform admins
    queueNotifyInternals() // only admin_other

    await notifyOrgMembers('org_demo', input, {
      roles: ['owner', 'admin'],
      excludeEmail: 'dustin@x.com',
    })

    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ userId: 'admin_other' })
  })

  it('excludes patient-role members in the QUERY when no roles filter is given (defense in depth)', async () => {
    state.selectQueue.push([{ userId: 'staff_1', email: 's@x.com' }])
    queueNotifyInternals()

    await notifyOrgMembers('org_1', input) // no roles → ne(role, 'patient') must gate the select

    expect(ne).toHaveBeenCalledWith('m.role', 'patient')
    expect(inArray).not.toHaveBeenCalled()
  })

  it('uses the explicit roles filter when one is given', async () => {
    state.selectQueue.push([{ userId: 'staff_1', email: 's@x.com' }])
    queueNotifyInternals()

    await notifyOrgMembers('org_1', input, { roles: ['owner', 'admin'] })

    expect(inArray).toHaveBeenCalledWith('m.role', ['owner', 'admin'])
    expect(ne).not.toHaveBeenCalledWith('m.role', 'patient')
  })
})
