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

/**
 * THE FUNNEL COUNTS PEOPLE (2026-10-26). The pixel writes an 'open' row per
 * load (Apple Mail pre-fetches every one), so counting rows put the hub's
 * open rate over 100% and made the list disagree with the editor's unique
 * count. One person per campaign per stage, keyed like the frequency cap.
 */
describe('tallyCampaignFunnel counts people, not pixel loads', () => {
  it('one recipient opening three times is ONE open', () => {
    const f = tallyCampaignFunnel([
      { type: 'sent', campaignId: 1, patientId: 'pt_a', recipientEmail: 'a@x.com' },
      { type: 'open', campaignId: 1, patientId: 'pt_a', recipientEmail: 'a@x.com' },
      { type: 'open', campaignId: 1, patientId: 'pt_a', recipientEmail: 'a@x.com' },
      { type: 'open', campaignId: 1, patientId: 'pt_a', recipientEmail: 'a@x.com' },
      { type: 'click', campaignId: 1, patientId: 'pt_a', recipientEmail: 'a@x.com' },
      { type: 'click', campaignId: 1, patientId: 'pt_a', recipientEmail: 'a@x.com' },
    ])
    expect(f).toEqual({ sent: 1, opened: 1, clicked: 1, booked: 0 })
  })

  it('a doubled sent row (the old webhook twin) collapses to one send', () => {
    const f = tallyCampaignFunnel([
      { type: 'sent', campaignId: 1, patientId: 'pt_a', recipientEmail: 'a@x.com' },
      { type: 'sent', campaignId: 1, patientId: 'pt_a', recipientEmail: 'a@x.com' },
    ])
    expect(f.sent).toBe(1)
  })

  it('the same person in two campaigns is two sends — "sent" still means messages', () => {
    const f = tallyCampaignFunnel([
      { type: 'sent', campaignId: 1, patientId: 'pt_a' },
      { type: 'sent', campaignId: 2, patientId: 'pt_a' },
      { type: 'open', campaignId: 2, patientId: 'pt_a' },
    ])
    expect(f).toEqual({ sent: 2, opened: 1, clicked: 0, booked: 0 })
  })

  it('identity falls back patient → email (case-insensitive) → phone, and a nameless row counts itself', () => {
    const f = tallyCampaignFunnel([
      { type: 'open', campaignId: 1, recipientEmail: 'A@x.com' },
      { type: 'open', campaignId: 1, recipientEmail: 'a@x.com' },
      { type: 'open', campaignId: 1, recipientPhone: '+15015550100' },
      { type: 'open', campaignId: 1, recipientPhone: '+15015550100' },
      { type: 'open', campaignId: 1, id: 9 },
      { type: 'open', campaignId: 1, id: 10 },
    ])
    expect(f.opened).toBe(4)
  })

  it('opened never exceeds sent for a sent-then-opened crowd', () => {
    const rows = []
    for (let i = 0; i < 20; i++) {
      rows.push({ type: 'sent', campaignId: 3, patientId: `pt_${i}` })
      for (let k = 0; k < 1 + (i % 4); k++) rows.push({ type: 'open', campaignId: 3, patientId: `pt_${i}` })
    }
    const f = tallyCampaignFunnel(rows)
    expect(f.sent).toBe(20)
    expect(f.opened).toBeLessThanOrEqual(f.sent)
    expect(f.opened).toBe(20)
  })

  it('per-campaign rollup dedupes inside each campaign', () => {
    const m = tallyCampaignFunnelByCampaign([
      { type: 'open', campaignId: 1, patientId: 'pt_a' },
      { type: 'open', campaignId: 1, patientId: 'pt_a' },
      { type: 'open', campaignId: 2, patientId: 'pt_a' },
    ])
    expect(m.get(1)!.opened).toBe(1)
    expect(m.get(2)!.opened).toBe(1)
  })
})
