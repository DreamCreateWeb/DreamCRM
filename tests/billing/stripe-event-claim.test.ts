import { describe, it, expect, vi, beforeEach } from 'vitest'

/** Unit tests for the idempotency-ledger helpers in lib/services/billing.ts. */
const state = { insertReturns: [] as unknown[], deletes: 0 }

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => state.insertReturns }),
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deletes++
      },
    }),
  },
  schema: { stripeWebhookEvent: { eventId: 'event_id' } },
}))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => ({ _k: 'eq' })) }))
vi.mock('@/lib/stripe', () => ({ stripe: {} }))

import { claimStripeEvent, releaseStripeEvent } from '@/lib/services/billing'

beforeEach(() => {
  state.insertReturns = []
  state.deletes = 0
})

describe('claimStripeEvent', () => {
  it('returns true when the insert wins (a fresh event)', async () => {
    state.insertReturns = [{ eventId: 'evt_1' }]
    expect(await claimStripeEvent('evt_1', 'customer.subscription.updated')).toBe(true)
  })

  it('returns false on conflict (the event was already processed)', async () => {
    state.insertReturns = [] // ON CONFLICT DO NOTHING → no row returned
    expect(await claimStripeEvent('evt_1', 'customer.subscription.updated')).toBe(false)
  })

  it('returns true (never blocks) when there is no event id to dedupe on', async () => {
    expect(await claimStripeEvent('', 'x')).toBe(true)
  })
})

describe('releaseStripeEvent', () => {
  it('deletes the claim row', async () => {
    await releaseStripeEvent('evt_1')
    expect(state.deletes).toBe(1)
  })

  it('no-ops on an empty id', async () => {
    await releaseStripeEvent('')
    expect(state.deletes).toBe(0)
  })
})
