/**
 * Broadcast messaging (client-safe registry) — the "office closed today"
 * megaphone in /messages. A broadcast emails every patient in a quick
 * segment AND records the message in each patient's conversation thread, so
 * replies land back in the inbox like any other conversation.
 *
 * Segments are operational, not marketing: the visit-window segments reach
 * people the message is ABOUT (their appointment), so they aren't gated on
 * marketing opt-in; "all active patients" is quasi-marketing and is.
 * Bigger/looser targeting belongs to Recall & Outreach campaigns (audiences,
 * unsubscribe footer, funnel tracking) — the recipient cap nudges that way.
 */

export type BroadcastSegmentKey = 'visits_today' | 'visits_tomorrow' | 'visits_week' | 'all_active'

export interface BroadcastSegmentDef {
  key: BroadcastSegmentKey
  label: string
  hint: string
}

export const BROADCAST_SEGMENTS: BroadcastSegmentDef[] = [
  {
    key: 'visits_today',
    label: 'Patients with a visit today',
    hint: 'Scheduled or confirmed, in your clinic’s timezone.',
  },
  {
    key: 'visits_tomorrow',
    label: 'Patients with a visit tomorrow',
    hint: 'Tomorrow’s chair — e.g. “we’re closed for weather, we’ll call to rebook.”',
  },
  {
    key: 'visits_week',
    label: 'Patients with a visit in the next 7 days',
    hint: 'Everyone about to come in.',
  },
  {
    key: 'all_active',
    label: 'All active patients (email opt-in)',
    hint: 'Practice-wide notices. For promotions, use a Recall & Outreach campaign instead.',
  },
]

export function isBroadcastSegment(x: string): x is BroadcastSegmentKey {
  return BROADCAST_SEGMENTS.some((s) => s.key === x)
}

/** Above this, the message is a campaign, not a broadcast — the compliant
 *  campaign rails (unsubscribe footer, tracking) are the right tool. */
export const BROADCAST_MAX_RECIPIENTS = 500

export const BROADCAST_BODY_MAX = 2000
