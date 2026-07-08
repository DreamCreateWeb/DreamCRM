import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture what publishRealtime sends to the DB.
const calls: Array<unknown> = []
vi.mock('@/lib/db', () => ({
  db: {
    execute: async (q: unknown) => {
      calls.push(q)
      return { rows: [] }
    },
  },
}))

import { publishRealtime, REALTIME_CHANNEL } from '@/lib/services/realtime'

beforeEach(() => {
  calls.length = 0
})

describe('publishRealtime', () => {
  it('no-ops without an organization id (tenant scoping is mandatory)', async () => {
    await publishRealtime('', 'messages', { threadId: 't1' })
    await publishRealtime(null, 'messages')
    await publishRealtime(undefined, 'notifications')
    expect(calls).toHaveLength(0)
  })

  it('publishes a pg_notify with org + topic + payload for a valid org', async () => {
    await publishRealtime('org_1', 'messages', { threadId: 't9', direction: 'inbound' })
    expect(calls).toHaveLength(1)
    // The sql template carries the channel + JSON body as bind params.
    const q = JSON.stringify(calls[0])
    expect(q).toContain(REALTIME_CHANNEL)
    expect(q).toContain('org_1')
    expect(q).toContain('t9')
    expect(q).toContain('messages')
    expect(q).toContain('inbound')
  })

  it('carries the userId for user-targeted events', async () => {
    await publishRealtime('org_1', 'notifications', {}, { userId: 'user_42' })
    expect(JSON.stringify(calls[0])).toContain('user_42')
  })

  it('never throws when the DB errors (best-effort)', async () => {
    const { db } = await import('@/lib/db')
    const spy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('boom'))
    await expect(publishRealtime('org_1', 'messages')).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
