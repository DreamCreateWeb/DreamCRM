import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Regression tests for the 2026-08 R1/S1 release-audit sweep.
 *
 *   - messages.createConversation — a conversation is an unsolicited message
 *     into someone's inbox, so the recipient set is authorized SERVER-SIDE
 *     against the caller's identity. The client-supplied participantIds are
 *     never trusted: a non-platform caller (clinic staff or patient) can only
 *     reach the STAFF of their own org(s), never another org and never a
 *     platform admin. This closes the cross-tenant message-injection hole.
 */

const state: {
  selectQueue: unknown[][]
  memberInserts: unknown[]
  conversationInserts: unknown[]
} = { selectQueue: [], memberInserts: [], conversationInserts: [] }

vi.mock('server-only', () => ({}))

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
      insert: (table: unknown) => ({
        values: (vals: unknown) => {
          // conversationMembers is the many-rows insert; conversations is the single row.
          if (Array.isArray(vals)) state.memberInserts.push(...vals)
          else state.conversationInserts.push(vals)
          const p: any = Promise.resolve([{ id: 99 }])
          p.returning = async () => [{ id: 99 }]
          p.onConflictDoNothing = async () => []
          return p
        },
      }),
    },
    schema,
  }
})

import { createConversation } from '@/lib/services/messages'

beforeEach(() => {
  state.selectQueue.length = 0
  state.memberInserts.length = 0
  state.conversationInserts.length = 0
})

describe('messages.createConversation — recipients are authorized server-side', () => {
  it('rejects a participant outside the caller\'s own clinic (the injection hole)', async () => {
    // allowedRecipientIds: (1) caller memberships → a clinic patient in orgA;
    // (2) staff of orgA → two staff ids.
    state.selectQueue.push([{ orgId: 'orgA', orgType: 'clinic' }])
    state.selectQueue.push([{ userId: 'staffA1' }, { userId: 'staffA2' }])

    await expect(
      createConversation({ title: null, participantIds: ['platformAdmin_or_clinicB'] }, 'patientA'),
    ).rejects.toThrow(/your own team or clinic contacts/i)

    // Nothing was created for the unauthorized target.
    expect(state.conversationInserts).toHaveLength(0)
    expect(state.memberInserts).toHaveLength(0)
  })

  it('allows a same-org staff recipient and enrolls both members', async () => {
    state.selectQueue.push([{ orgId: 'orgA', orgType: 'clinic' }])
    state.selectQueue.push([{ userId: 'staffA1' }, { userId: 'staffA2' }])

    const convo = await createConversation(
      { title: 'Front desk', participantIds: ['staffA1'] },
      'staffA2',
    )
    expect(convo).toEqual({ id: 99 })
    const enrolled = state.memberInserts.map((m) => (m as { userId: string }).userId).sort()
    expect(enrolled).toEqual(['staffA1', 'staffA2'])
  })

  it('rejects a self-only recipient set before any write', async () => {
    state.selectQueue.push([{ orgId: 'orgA', orgType: 'clinic' }])
    state.selectQueue.push([{ userId: 'staffA1' }])

    await expect(
      createConversation({ title: null, participantIds: ['staffA1'] }, 'staffA1'),
    ).rejects.toThrow(/pick at least one/i)
    expect(state.conversationInserts).toHaveLength(0)
  })
})
