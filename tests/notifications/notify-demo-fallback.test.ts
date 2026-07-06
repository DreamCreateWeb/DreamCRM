import { beforeEach, describe, expect, it, vi } from 'vitest'

const state: {
  selectQueue: unknown[][]
  inserts: Array<Record<string, unknown>>
} = { selectQueue: [], inserts: [] }

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: vi.fn(async () => undefined) }))
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

import { notifyOrgMembers } from '@/lib/services/notifications'

beforeEach(() => {
  state.selectQueue.length = 0
  state.inserts.length = 0
})

const input = { bucket: 'comments' as const, type: 'booking_created', title: 'New booking' }

describe('notifyOrgMembers demo fallback', () => {
  it('routes demo-org events to platform admins when the org has no members', async () => {
    state.selectQueue.push([]) // member lookup → none
    state.selectQueue.push([{ isDemo: true }]) // org → demo
    state.selectQueue.push([{ userId: 'admin_1', email: 'admin@x.com' }]) // platform admins
    state.selectQueue.push([]) // notify(): prefs → defaults (comments on)
    state.selectQueue.push([{ email: null, name: 'Admin' }]) // email lookup → no email send

    await notifyOrgMembers('org_demo', input, { roles: ['owner', 'admin'] })

    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ userId: 'admin_1', title: 'New booking' })
  })

  it('stays silent for a member-less org that is NOT a demo', async () => {
    state.selectQueue.push([]) // member lookup → none
    state.selectQueue.push([{ isDemo: false }]) // org → real

    await notifyOrgMembers('org_real', input, { roles: ['owner', 'admin'] })

    expect(state.inserts).toHaveLength(0)
  })

  it('does not consult the demo fallback when members exist', async () => {
    state.selectQueue.push([{ userId: 'owner_1', email: 'owner@x.com' }]) // member lookup → owner
    state.selectQueue.push([]) // notify(): prefs → defaults
    state.selectQueue.push([{ email: null, name: 'Owner' }]) // email lookup

    await notifyOrgMembers('org_live', input, { roles: ['owner', 'admin'] })

    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({ userId: 'owner_1' })
  })
})
