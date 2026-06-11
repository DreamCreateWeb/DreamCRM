import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * scheduleCampaign / cancelScheduledCampaign validation. db is mocked so each
 * test controls the campaign row getMarketingCampaign sees and what the cancel
 * UPDATE returns.
 */

const state = {
  campaign: null as Record<string, unknown> | null,
  updates: [] as Array<Record<string, unknown>>,
  cancelReturns: [] as Array<{ id: number }>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (state.campaign ? [state.campaign] : []),
        }),
      }),
    }),
    update: () => ({
      set: (s: Record<string, unknown>) => ({
        // where() returns an object that is BOTH awaitable (scheduleCampaign
        // awaits it directly) AND has .returning() (cancelScheduledCampaign).
        where: () => {
          state.updates.push(s)
          return {
            then: (onF: (v: unknown) => unknown) => Promise.resolve(undefined).then(onF),
            returning: async () => state.cancelReturns,
          }
        },
      }),
    }),
  },
  schema: { campaigns: 'campaigns', audiences: 'audiences', campaignEvents: 'campaign_events' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ _and: a }),
  eq: (...a: unknown[]) => ({ _eq: a }),
  desc: (x: unknown) => x,
  sql: Object.assign((..._a: unknown[]) => ({ _sql: true }), { raw: () => ({}) }),
}))

vi.mock('@/lib/services/marketing', () => ({
  resolveAudience: vi.fn(async () => []),
}))

import { scheduleCampaign, cancelScheduledCampaign, SCHEDULE_MIN_LEAD_MS } from '@/lib/services/marketing-campaigns'

const NOW = new Date('2026-06-11T12:00:00Z')
const FUTURE = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString() // +1h
const sendable = {
  id: 1,
  status: 'draft',
  subject: 'Hi',
  bodyHtml: '<p>Body</p>',
  audienceId: 5,
}

beforeEach(() => {
  state.campaign = null
  state.updates = []
  state.cancelReturns = []
})

describe('scheduleCampaign — preconditions', () => {
  it('rejects a missing campaign', async () => {
    const r = await scheduleCampaign('org_1', 1, FUTURE, NOW)
    expect(r).toEqual({ ok: false, error: 'Campaign not found' })
  })

  it('rejects when not draft/scheduled (e.g. completed)', async () => {
    state.campaign = { ...sendable, status: 'completed' }
    const r = await scheduleCampaign('org_1', 1, FUTURE, NOW)
    expect(r.ok).toBe(false)
  })

  it('requires a subject', async () => {
    state.campaign = { ...sendable, subject: null }
    const r = await scheduleCampaign('org_1', 1, FUTURE, NOW)
    expect(r).toEqual({ ok: false, error: 'Add a subject before scheduling.' })
  })

  it('requires a body', async () => {
    state.campaign = { ...sendable, bodyHtml: null }
    const r = await scheduleCampaign('org_1', 1, FUTURE, NOW)
    expect(r).toEqual({ ok: false, error: 'Write the email body before scheduling.' })
  })

  it('requires an audience', async () => {
    state.campaign = { ...sendable, audienceId: null }
    const r = await scheduleCampaign('org_1', 1, FUTURE, NOW)
    expect(r).toEqual({ ok: false, error: 'Choose an audience before scheduling.' })
  })

  it('rejects an invalid date', async () => {
    state.campaign = { ...sendable }
    const r = await scheduleCampaign('org_1', 1, 'not-a-date', NOW)
    expect(r).toEqual({ ok: false, error: 'Invalid date/time.' })
  })

  it('rejects a time in the past', async () => {
    state.campaign = { ...sendable }
    const past = new Date(NOW.getTime() - 60_000).toISOString()
    const r = await scheduleCampaign('org_1', 1, past, NOW)
    expect(r.ok).toBe(false)
  })

  it('rejects a time inside the minimum lead window', async () => {
    state.campaign = { ...sendable }
    const tooSoon = new Date(NOW.getTime() + SCHEDULE_MIN_LEAD_MS - 1000).toISOString()
    const r = await scheduleCampaign('org_1', 1, tooSoon, NOW)
    expect(r.ok).toBe(false)
  })

  it('accepts a valid future time and writes status=scheduled + scheduledAt', async () => {
    state.campaign = { ...sendable }
    const r = await scheduleCampaign('org_1', 1, FUTURE, NOW)
    expect(r).toEqual({ ok: true })
    const patch = state.updates.at(-1)!
    expect(patch.status).toBe('scheduled')
    expect((patch.scheduledAt as Date).toISOString()).toBe(FUTURE)
  })
})

describe('cancelScheduledCampaign', () => {
  it('flips a scheduled campaign back to draft', async () => {
    state.cancelReturns = [{ id: 1 }]
    const r = await cancelScheduledCampaign('org_1', 1)
    expect(r).toEqual({ ok: true })
    const patch = state.updates.at(-1)!
    expect(patch.status).toBe('draft')
    expect(patch.scheduledAt).toBeNull()
  })

  it('is a no-op-safe error when the row is not currently scheduled (already claimed)', async () => {
    state.cancelReturns = [] // WHERE status='scheduled' matched nothing
    const r = await cancelScheduledCampaign('org_1', 1)
    expect(r.ok).toBe(false)
  })
})
