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

  it('a TRANSIENT vendor outage waits instead of burning an attempt', async () => {
    // The scar: only the cancel path said "waiting" out loud, so an outage
    // across a long weekend exhausted the 6-attempt cap on a CREATE and the
    // booking silently never reached the practice's schedule.
    for (const msg of ['fetch failed', 'The operation timed out', 'NexHealth appointments failed (503): upstream']) {
      state.updates = []
      await settleWriteFailure(OP, new Error(msg))
      expect(state.updates[0]).toMatchObject({ status: 'pending', attempts: 3 })
    }
  })

  it('a real 4xx still exhausts its retries (transient detection stays conservative)', async () => {
    await settleWriteFailure(OP, new Error('NexHealth patients failed (422): missing last_name'))
    expect(state.updates[0]).toMatchObject({ status: 'error', attempts: 4 })
  })
})

describe('isTransientPmsError', () => {
  it('recognizes outage shapes, not payload mistakes', async () => {
    const { isTransientPmsError } = await import('@/lib/services/pms/sync')
    expect(isTransientPmsError(new Error('ECONNRESET'))).toBe(true)
    expect(isTransientPmsError(new Error('socket hang up'))).toBe(true)
    expect(isTransientPmsError(new Error('failed (502): bad gateway'))).toBe(true)
    expect(isTransientPmsError(new Error('failed (429): too many requests'))).toBe(true)
    // Not transient — these are the write being wrong.
    expect(isTransientPmsError(new Error('failed (422): missing last_name'))).toBe(false)
    expect(isTransientPmsError(new Error('slot no longer available'))).toBe(false)
    expect(isTransientPmsError(null)).toBe(false)
  })
})
