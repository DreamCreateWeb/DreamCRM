import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * sendDueScheduledCampaigns — atomic claim semantics. The db is mocked so each
 * test controls which campaigns are "due" and whether the guarded UPDATE claims
 * the row (winner: returns [{id}]) or loses the race (loser: returns []).
 */

type DueRow = { id: number; organizationId: string | null }

const state = {
  due: [] as DueRow[],
  // Per-campaign-id claim outcome: true = this runner wins the UPDATE.
  claimWins: new Map<number, boolean>(),
  sendCalls: [] as Array<{ organizationId: string; campaignId: number }>,
  sendThrowsFor: new Set<number>(),
  // Campaigns whose audience resolves to 0 recipients (sendCampaign returns
  // attempted:0 without touching status → engine must reset to draft).
  emptyAudienceFor: new Set<number>(),
  resetToDraft: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => state.due,
      }),
    }),
    update: () => ({
      set: (s: Record<string, unknown>) => {
        // The claim UPDATE (status='active') uses .returning(); the empty-audience
        // reset (status='draft') awaits .where() directly. Branch on the payload.
        if (s.status === 'draft') {
          state.resetToDraft.push(s)
          return { where: async () => undefined }
        }
        return {
          where: () => ({
            returning: async () => {
              // Claim: pop the next attempt (in due-list order) and win/lose it.
              const next = pendingClaims.shift()
              if (next === undefined) return []
              return state.claimWins.get(next) ? [{ id: next }] : []
            },
          }),
        }
      },
    }),
  },
  schema: { campaigns: 'campaigns' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (...a: unknown[]) => ({ _eq: a }),
  lte: (...a: unknown[]) => ({ _lte: a }),
  isNotNull: (...a: unknown[]) => ({ _isNotNull: a }),
}))

vi.mock('@/lib/services/marketing-send', () => ({
  sendCampaign: vi.fn(async ({ organizationId, campaignId }: { organizationId: string; campaignId: number }) => {
    state.sendCalls.push({ organizationId, campaignId })
    if (state.sendThrowsFor.has(campaignId)) throw new Error('send blew up')
    if (state.emptyAudienceFor.has(campaignId)) {
      return { channel: 'resend', attempted: 0, sent: 0, failed: 0, errors: [] }
    }
    return { channel: 'resend', attempted: 3, sent: 3, failed: 0, errors: [] }
  }),
}))

// Order of claim attempts mirrors the order of `state.due` (the loop iterates it).
let pendingClaims: number[] = []

import { sendDueScheduledCampaigns } from '@/lib/services/marketing-scheduled'

beforeEach(() => {
  state.due = []
  state.claimWins = new Map()
  state.sendCalls = []
  state.sendThrowsFor = new Set()
  state.emptyAudienceFor = new Set()
  state.resetToDraft = []
  pendingClaims = []
})

describe('sendDueScheduledCampaigns', () => {
  it('sends each due campaign it wins the claim for', async () => {
    state.due = [{ id: 1, organizationId: 'org_1' }, { id: 2, organizationId: 'org_1' }]
    state.claimWins.set(1, true)
    state.claimWins.set(2, true)
    pendingClaims = [1, 2]

    const r = await sendDueScheduledCampaigns()
    expect(r.due).toBe(2)
    expect(r.claimed).toBe(2)
    expect(r.skipped).toBe(0)
    expect(state.sendCalls.map((c) => c.campaignId)).toEqual([1, 2])
  })

  it('a claim LOSER skips and never calls sendCampaign (no double-send)', async () => {
    state.due = [{ id: 7, organizationId: 'org_1' }]
    state.claimWins.set(7, false) // another runner already claimed it
    pendingClaims = [7]

    const r = await sendDueScheduledCampaigns()
    expect(r.due).toBe(1)
    expect(r.claimed).toBe(0)
    expect(r.skipped).toBe(1)
    expect(state.sendCalls).toHaveLength(0)
  })

  it('mixed: claims the winners, skips the losers', async () => {
    state.due = [
      { id: 1, organizationId: 'org_1' },
      { id: 2, organizationId: 'org_1' },
      { id: 3, organizationId: 'org_1' },
    ]
    state.claimWins.set(1, true)
    state.claimWins.set(2, false)
    state.claimWins.set(3, true)
    pendingClaims = [1, 2, 3]

    const r = await sendDueScheduledCampaigns()
    expect(r.claimed).toBe(2)
    expect(r.skipped).toBe(1)
    expect(state.sendCalls.map((c) => c.campaignId)).toEqual([1, 3])
  })

  it('records a per-campaign error when sendCampaign throws (after a winning claim)', async () => {
    state.due = [{ id: 9, organizationId: 'org_1' }]
    state.claimWins.set(9, true)
    state.sendThrowsFor.add(9)
    pendingClaims = [9]

    const r = await sendDueScheduledCampaigns()
    expect(r.claimed).toBe(1)
    expect(r.failed).toBe(1)
    expect(r.errors[0]).toMatchObject({ campaignId: 9 })
  })

  it('does nothing when no campaigns are due', async () => {
    const r = await sendDueScheduledCampaigns()
    expect(r.due).toBe(0)
    expect(r.claimed).toBe(0)
    expect(state.sendCalls).toHaveLength(0)
  })

  it('flags a claimed campaign with no org as failed without sending', async () => {
    state.due = [{ id: 5, organizationId: null }]
    state.claimWins.set(5, true)
    pendingClaims = [5]

    const r = await sendDueScheduledCampaigns()
    expect(r.claimed).toBe(1)
    expect(r.failed).toBe(1)
    expect(state.sendCalls).toHaveLength(0)
  })

  it('resets a claimed campaign back to draft when its audience is empty (not left stuck active)', async () => {
    state.due = [{ id: 8, organizationId: 'org_1' }]
    state.claimWins.set(8, true)
    state.emptyAudienceFor.add(8) // sendCampaign returns attempted:0
    pendingClaims = [8]

    const r = await sendDueScheduledCampaigns()
    expect(r.claimed).toBe(1)
    expect(state.sendCalls).toHaveLength(1)
    // Engine must follow up with a status='draft' reset.
    expect(state.resetToDraft).toHaveLength(1)
    expect(state.resetToDraft[0].status).toBe('draft')
  })
})
