import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The clinic ↔ Dream Create SUPPORT thread (2026-08-26, owner directive:
 * clinics message the platform from their Messages tab, and the platform
 * side is always "Support" — never a person's identity).
 *
 * Pinned here:
 *  - One thread per org, anchored on conversations.organization_id; a
 *    second open REUSES it (membership synced) instead of minting another.
 *  - Only clinic staff can open it — a patient userId is refused.
 *  - getSupportThread flags platform-authored messages `fromSupport`, which
 *    is what the UI renders as "Support".
 *  - postMessage into a support thread alerts the OTHER side of the desk:
 *    clinic author → platform hears "<clinic> wrote to support"; platform
 *    author → clinic staff hear "Support replied" (type support_reply,
 *    linking to /messages/support). A generic (org-less) conversation
 *    alerts nobody.
 */

const state: {
  selectQueue: unknown[][]
  memberInserts: unknown[]
  rowInserts: unknown[]
} = { selectQueue: [], memberInserts: [], rowInserts: [] }

const notify = vi.fn(async () => undefined)
const publishRealtime = vi.fn(async () => undefined)

vi.mock('server-only', () => ({}))
vi.mock('@/lib/services/notifications', () => ({ notify }))
vi.mock('@/lib/services/realtime', () => ({ publishRealtime }))

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const selectChain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.leftJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(resolve, reject)
    return obj
  }
  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: (vals: unknown) => {
          if (Array.isArray(vals)) state.memberInserts.push(...vals)
          else state.rowInserts.push(vals)
          const p: any = Promise.resolve([{ id: 99 }])
          p.returning = async () => [{ id: 99 }]
          p.onConflictDoNothing = async () => []
          return p
        },
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
    schema,
  }
})

import { getSupportThread, postMessage } from '@/lib/services/messages'

beforeEach(() => {
  state.selectQueue.length = 0
  state.memberInserts.length = 0
  state.rowInserts.length = 0
  notify.mockClear()
  publishRealtime.mockClear()
})

const STAFF = [{ userId: 'staffA1' }, { userId: 'staffA2' }]
const PLATFORM = [{ userId: 'dustin' }]

describe('getSupportThread', () => {
  it('refuses a non-staff caller — a patient cannot open the support line', async () => {
    state.selectQueue.push(STAFF) // clinic staff — caller not among them
    await expect(getSupportThread('orgA', 'patient9')).rejects.toThrow(/clinic staff/i)
    expect(state.rowInserts).toHaveLength(0)
  })

  it('creates the org thread once, enrolling clinic staff + the platform side', async () => {
    state.selectQueue.push(STAFF) // staff check (caller is staffA1)
    state.selectQueue.push([]) // no existing thread for the org
    state.selectQueue.push(STAFF) // membership sync: staff
    state.selectQueue.push(PLATFORM) // membership sync: platform
    state.selectQueue.push([{ name: 'All about Smiles' }]) // org name → title
    state.selectQueue.push(PLATFORM) // fromSupport flagging
    state.selectQueue.push([{ userId: 'staffA1' }]) // listMessages membership
    state.selectQueue.push([]) // messages (none yet)

    const thread = await getSupportThread('orgA', 'staffA1')
    expect(thread.conversationId).toBe(99)
    // The conversation row carries the org anchor + the clinic-facing title.
    expect(state.rowInserts[0]).toMatchObject({ organizationId: 'orgA', title: 'All about Smiles' })
    const enrolled = state.memberInserts.map((m) => (m as { userId: string }).userId).sort()
    expect(enrolled).toEqual(['dustin', 'staffA1', 'staffA2'])
  })

  it('reuses the existing org thread and flags platform authors fromSupport', async () => {
    state.selectQueue.push(STAFF) // staff check
    state.selectQueue.push([{ id: 42 }]) // existing thread
    state.selectQueue.push(STAFF) // membership sync: staff
    state.selectQueue.push(PLATFORM) // membership sync: platform
    state.selectQueue.push(PLATFORM) // fromSupport flagging
    state.selectQueue.push([{ userId: 'staffA1' }]) // listMessages membership
    state.selectQueue.push([
      { id: 1, body: 'Hi, our sync looks stuck', createdAt: new Date(), authorId: 'staffA1', authorName: 'Dr. A', authorImage: null },
      { id: 2, body: 'On it — give me an hour.', createdAt: new Date(), authorId: 'dustin', authorName: 'Dustin Mabray', authorImage: null },
    ])

    const thread = await getSupportThread('orgA', 'staffA1')
    expect(thread.conversationId).toBe(42)
    expect(state.rowInserts).toHaveLength(0) // no second thread minted
    expect(thread.messages.map((m) => m.fromSupport)).toEqual([false, true])
  })
})

describe('postMessage — support-thread alerts', () => {
  it('clinic author → the platform side hears "<clinic> wrote to support"', async () => {
    state.selectQueue.push([{ userId: 'staffA1' }]) // membership check
    state.selectQueue.push([{ organizationId: 'orgA', title: 'All about Smiles' }]) // convo row
    state.selectQueue.push(PLATFORM) // platform members
    state.selectQueue.push(STAFF) // clinic staff

    await postMessage({ conversationId: 42, body: 'Our sync looks stuck' }, 'staffA1')

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'dustin',
        type: 'support_message',
        title: 'All about Smiles wrote to support',
        linkPath: '/messages?c=42',
      }),
    )
    expect(publishRealtime).toHaveBeenCalledWith('orgA', 'messages', { support: true })
  })

  it('platform author → clinic staff hear "Support replied", never a name', async () => {
    state.selectQueue.push([{ userId: 'dustin' }]) // membership check
    state.selectQueue.push([{ organizationId: 'orgA', title: 'All about Smiles' }])
    state.selectQueue.push(PLATFORM)
    state.selectQueue.push(STAFF)

    await postMessage({ conversationId: 42, body: 'On it — give me an hour.' }, 'dustin')

    expect(notify).toHaveBeenCalledTimes(2) // both staff, not the author
    for (const call of notify.mock.calls as unknown as Array<[Record<string, unknown>]>) {
      expect(call[0]).toMatchObject({ type: 'support_reply', title: 'Support replied', linkPath: '/messages/support' })
      expect(JSON.stringify(call[0])).not.toContain('Dustin')
    }
  })

  it('a generic (org-less) conversation alerts nobody', async () => {
    state.selectQueue.push([{ userId: 'u1' }]) // membership check
    state.selectQueue.push([{ organizationId: null, title: 'Front desk' }]) // convo row

    await postMessage({ conversationId: 7, body: 'hey' }, 'u1')
    expect(notify).not.toHaveBeenCalled()
    expect(publishRealtime).not.toHaveBeenCalled()
  })
})
