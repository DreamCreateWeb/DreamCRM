import 'server-only'

/**
 * The single place that maps campaign_events `type` literals onto the
 * Sent → Opened → Clicked → Booked funnel. This contract (note: the event
 * types are `'open'`/`'click'`, NOT `'opened'`/`'clicked'`, and `'booked'`
 * is the outcome event) was restated in three spots — the recall dashboard
 * (org-wide + per-campaign) and the Analytics outreach band — and had to be
 * kept in lockstep by hand. Now they all reduce through this.
 *
 * THE FUNNEL COUNTS PEOPLE, NOT PIXEL LOADS (2026-10-26). The tracking pixel
 * inserts a new 'open' row on every load — Apple Mail Privacy Protection
 * pre-fetches every pixel, a patient re-opening the email is another row —
 * and the first version of this reducer counted rows. So the hub's
 * "opened · 30d" could pass 100%, and the same campaign read "63 opened" on
 * the list and "31 (62%)" in the editor one click later. Each stage now
 * counts DISTINCT recipients per campaign, keyed the way the frequency cap
 * keys a person (`patientId ?? recipientEmail ?? recipientPhone`): one
 * person opening three times is one open; the same person in two campaigns
 * is two sends and up to two opens, so "sent" still means messages that
 * went out and opened ≤ sent holds by construction. A row with no identity
 * at all (none should exist) counts as itself rather than vanishing.
 */

export interface CampaignFunnel {
  sent: number
  opened: number
  clicked: number
  booked: number
}

/** What a campaign_events row needs to carry to be counted as a person. Every
 *  field is optional so a caller that only has `{ type }` still reduces (each
 *  such row counts once — there is nothing to dedupe it against). */
export interface FunnelEvent {
  type: string
  campaignId?: number | null
  patientId?: string | null
  recipientEmail?: string | null
  recipientPhone?: string | null
  /** The row's own id — the last-resort key for a row with no recipient. */
  id?: number | null
}

export function emptyFunnel(): CampaignFunnel {
  return { sent: 0, opened: 0, clicked: 0, booked: 0 }
}

const STAGE: Record<string, keyof CampaignFunnel | undefined> = {
  sent: 'sent',
  open: 'opened',
  click: 'clicked',
  booked: 'booked',
}

/** The person behind a row, or null when the row names nobody. Exported so
 *  the SQL twins of this reducer (lib/services/marketing-campaigns.ts) and
 *  its tests answer from one rule. */
export function funnelIdentity(e: FunnelEvent): string | null {
  return e.patientId ?? e.recipientEmail?.toLowerCase() ?? e.recipientPhone ?? null
}

/** Roll a flat list of events up into one funnel, one count per person per
 *  campaign per stage. */
export function tallyCampaignFunnel(events: ReadonlyArray<FunnelEvent>): CampaignFunnel {
  const f = emptyFunnel()
  const seen = new Set<string>()
  let anonymous = 0
  for (const e of events) {
    const stage = STAGE[e.type]
    if (!stage) continue
    const who = funnelIdentity(e) ?? (e.id != null ? `row:${e.id}` : `anon:${anonymous++}`)
    const key = `${stage}|${e.campaignId ?? ''}|${who}`
    if (seen.has(key)) continue
    seen.add(key)
    f[stage]++
  }
  return f
}

/** Roll events up per campaign id → one funnel each. */
export function tallyCampaignFunnelByCampaign(
  events: ReadonlyArray<FunnelEvent & { campaignId: number }>,
): Map<number, CampaignFunnel> {
  const byCampaign = new Map<number, FunnelEvent[]>()
  for (const e of events) {
    let list = byCampaign.get(e.campaignId)
    if (!list) {
      list = []
      byCampaign.set(e.campaignId, list)
    }
    list.push(e)
  }
  const out = new Map<number, CampaignFunnel>()
  byCampaign.forEach((list, id) => out.set(id, tallyCampaignFunnel(list)))
  return out
}
