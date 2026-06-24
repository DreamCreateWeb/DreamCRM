import 'server-only'

/**
 * The single place that maps campaign_events `type` literals onto the
 * Sent → Opened → Clicked → Booked funnel. This contract (note: the event
 * types are `'open'`/`'click'`, NOT `'opened'`/`'clicked'`, and `'booked'`
 * is the outcome event) was restated in three spots — the recall dashboard
 * (org-wide + per-campaign) and the Analytics outreach band — and had to be
 * kept in lockstep by hand. Now they all reduce through this.
 */

export interface CampaignFunnel {
  sent: number
  opened: number
  clicked: number
  booked: number
}

export function emptyFunnel(): CampaignFunnel {
  return { sent: 0, opened: 0, clicked: 0, booked: 0 }
}

function add(f: CampaignFunnel, type: string): void {
  if (type === 'sent') f.sent++
  else if (type === 'open') f.opened++
  else if (type === 'click') f.clicked++
  else if (type === 'booked') f.booked++
}

/** Roll a flat list of events up into one funnel. */
export function tallyCampaignFunnel(events: ReadonlyArray<{ type: string }>): CampaignFunnel {
  const f = emptyFunnel()
  for (const e of events) add(f, e.type)
  return f
}

/** Roll events up per campaign id → one funnel each. */
export function tallyCampaignFunnelByCampaign(
  events: ReadonlyArray<{ type: string; campaignId: number }>,
): Map<number, CampaignFunnel> {
  const byCampaign = new Map<number, CampaignFunnel>()
  for (const e of events) {
    let f = byCampaign.get(e.campaignId)
    if (!f) {
      f = emptyFunnel()
      byCampaign.set(e.campaignId, f)
    }
    add(f, e.type)
  }
  return byCampaign
}
