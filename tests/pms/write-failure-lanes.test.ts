import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * settleWriteFailure — the queue's three failure lanes (write-back v1,
 * §2.8). WAITING restores the attempt counter (a practice server that
 * sleeps every night must not exhaust the 6-attempt cap over one closed
 * weekend); NOT-SUPPORTED parks the op as skipped, done; everything else
 * takes the normal counted-error lane.
 */

const state = {
  updates: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(patch)
        },
      }),
    }),
    insert: () => ({ values: async () => undefined }),
  },
  schema: { pmsWriteOp: { id: {} } },
}))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNotNull: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
}))
vi.mock('@/lib/crypto', () => ({ decryptSecret: vi.fn(() => 'k') }))
vi.mock('./connection', () => ({ getPmsConnection: vi.fn(async () => null) }))
vi.mock('@/lib/services/pms/connection', () => ({ getPmsConnection: vi.fn(async () => null) }))

import { settleWriteFailure } from '@/lib/services/pms/sync'
import { PmsWriteWaitingError, PmsWriteNotSupportedError } from '@/lib/services/pms/provider'

const OP = { id: 'op_1', attempts: 3 }

beforeEach(() => {
  state.updates = []
})

describe('settleWriteFailure', () => {
  it('WAITING → back to pending with the attempt counter RESTORED', async () => {
    await settleWriteFailure(OP, new PmsWriteWaitingError('server asleep'))
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ status: 'pending', attempts: 3, error: 'server asleep' })
  })

  it('NOT-SUPPORTED → skipped and completed, never an alarm', async () => {
    await settleWriteFailure(OP, new PmsWriteNotSupportedError('no vocabulary'))
    expect(state.updates[0]).toMatchObject({ status: 'skipped', attempts: 3, error: 'no vocabulary' })
    expect(state.updates[0].completedAt).toBeInstanceOf(Date)
  })

  it('anything else → the counted error lane (attempts + 1)', async () => {
    await settleWriteFailure(OP, new Error('slot no longer available'))
    expect(state.updates[0]).toMatchObject({ status: 'error', attempts: 4, error: 'slot no longer available' })
  })
})
