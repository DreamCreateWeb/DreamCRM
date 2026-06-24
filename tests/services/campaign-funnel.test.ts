import { describe, it, expect } from 'vitest'
import {
  tallyCampaignFunnel,
  tallyCampaignFunnelByCampaign,
  emptyFunnel,
} from '@/lib/services/campaign-funnel'

/**
 * The funnel reducer is the single source for the campaign_events type →
 * {sent,opened,clicked,booked} contract. The key trap it guards: the event
 * literals are 'open'/'click' (not 'opened'/'clicked'), and unrelated types
 * ('bounce', 'unsub', …) must NOT inflate any counter.
 */

describe('tallyCampaignFunnel', () => {
  it('maps open→opened and click→clicked, counts sent + booked', () => {
    const f = tallyCampaignFunnel([
      { type: 'sent' }, { type: 'sent' },
      { type: 'open' }, { type: 'click' }, { type: 'booked' },
    ])
    expect(f).toEqual({ sent: 2, opened: 1, clicked: 1, booked: 1 })
  })

  it('ignores event types outside the funnel', () => {
    const f = tallyCampaignFunnel([
      { type: 'sent' }, { type: 'bounce' }, { type: 'unsubscribe' }, { type: 'failed' },
    ])
    expect(f).toEqual({ sent: 1, opened: 0, clicked: 0, booked: 0 })
  })

  it('emptyFunnel is all zeros', () => {
    expect(emptyFunnel()).toEqual({ sent: 0, opened: 0, clicked: 0, booked: 0 })
    expect(tallyCampaignFunnel([])).toEqual(emptyFunnel())
  })
})

describe('tallyCampaignFunnelByCampaign', () => {
  it('rolls events up per campaign id', () => {
    const m = tallyCampaignFunnelByCampaign([
      { type: 'sent', campaignId: 1 }, { type: 'open', campaignId: 1 },
      { type: 'sent', campaignId: 2 }, { type: 'booked', campaignId: 2 },
    ])
    expect(m.get(1)).toEqual({ sent: 1, opened: 1, clicked: 0, booked: 0 })
    expect(m.get(2)).toEqual({ sent: 1, opened: 0, clicked: 0, booked: 1 })
    expect(m.size).toBe(2)
  })
})
