import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Stranded-campaign requeue (R2 slice 8).
 *
 * The claim flips a campaign scheduled → active BEFORE sendCampaign walks its
 * recipients. A crash mid-walk (deploy, OOM, function timeout) strands it
 * 'active' forever — the sweep only ever re-selects 'scheduled' — with half its
 * audience mailed and no error raised anywhere, so no Guardian signal either.
 *
 * The re-run is safe because sendCampaign drops recipients already recorded as
 * sent (dropAlreadySentRecipients, covered in send-campaign.test.ts).
 */

const state = {
  stuckRows: [] as Array<{ id: number }>,
  updates: [] as Array<Record<string, unknown>>,
  throwOnSelect: false,
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/services/billing-state', () => ({ listShutDownOrgIds: async () => new Set<string>() }))
vi.mock('@/lib/services/marketing-send', () => ({ sendCampaign: vi.fn() }))
vi.mock('@/lib/services/engine-failures', () => ({ reportAutomationFailure: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () =>
          state.throwOnSelect
            ? Promise.reject(new Error('db down'))
            : Promise.resolve(state.stuckRows),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(vals)
        },
      }),
    }),
  },
  schema: { campaigns: { id: 'id', status: 'status', scheduledAt: 'scheduledAt', updatedAt: 'updatedAt' } },
}))
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  inArray: (...a: unknown[]) => ({ a }),
  isNotNull: (x: unknown) => x,
  lte: (...a: unknown[]) => ({ a }),
}))

import { requeueStuckCampaigns, STUCK_CAMPAIGN_AFTER_MS } from '@/lib/services/marketing-scheduled'

beforeEach(() => {
  state.stuckRows = []
  state.updates = []
  state.throwOnSelect = false
})

describe('requeueStuckCampaigns', () => {
  it('puts abandoned active campaigns back to scheduled', async () => {
    state.stuckRows = [{ id: 7 }, { id: 9 }]
    const n = await requeueStuckCampaigns({ now: new Date('2026-08-18T12:00:00Z') })
    expect(n).toBe(2)
    expect(state.updates[0]).toMatchObject({ status: 'scheduled' })
  })

  it('nothing stranded → no writes at all', async () => {
    state.stuckRows = []
    expect(await requeueStuckCampaigns()).toBe(0)
    expect(state.updates).toHaveLength(0)
  })

  it('never throws — a failed read must not stop the due-campaign sweep behind it', async () => {
    state.throwOnSelect = true
    await expect(requeueStuckCampaigns()).resolves.toBe(0)
    expect(state.updates).toHaveLength(0)
  })

  it('the stale window is generous enough not to catch a live send', () => {
    // A long campaign is still writing events while it runs; only a run that
    // has been untouched for half an hour is treated as abandoned.
    expect(STUCK_CAMPAIGN_AFTER_MS).toBeGreaterThanOrEqual(30 * 60 * 1000)
  })
})
