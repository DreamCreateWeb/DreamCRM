// The live-demo script — the ordered beats a sales demo walks through,
// rendered by the presenter panel (platform admin + demo mode only).
// Talk tracks may reference {clinicName}, {city}, and {firstName}; the
// panel substitutes them from the demo skin so the pitch says THEIR
// practice's name. Editing the demo = editing this registry (typed,
// reviewed, versioned).

export type DemoBeatGroup = 'open' | 'run' | 'grow' | 'close'

export interface DemoBeat {
  id: string
  title: string
  /** Two lines max — a prompt, not a teleprompter. */
  talkTrack: string
  href: string
  /** Narrative arc grouping shown in the panel ("Grow · beat 6 of 8"). */
  group: DemoBeatGroup
}

export const DEMO_GROUP_LABELS: Record<DemoBeatGroup, string> = {
  open: 'Open',
  run: 'Run the day',
  grow: 'Grow',
  close: 'Close',
}

export const DEMO_BEATS: DemoBeat[] = [
  {
    id: 'huddle',
    title: 'Morning huddle',
    talkTrack:
      "This is {clinicName}'s morning — today's chairs, who needs attention, what's trending. Your front desk opens ONE screen instead of six.",
    href: '/dashboard',
    group: 'open',
  },
  {
    id: 'messages',
    title: 'Messages + AI drafts',
    talkTrack:
      'Every patient text and email in one inbox. Watch the AI draft a reply — your team just reviews and hits send.',
    href: '/messages',
    group: 'run',
  },
  {
    id: 'appointments',
    title: 'Appointments',
    talkTrack:
      'The day, grouped how the desk thinks. Unconfirmed visits age visibly; one click confirms, reschedules, or fills the slot from the waitlist.',
    href: '/appointments',
    group: 'run',
  },
  {
    id: 'followups',
    title: 'Follow-ups that run themselves',
    talkTrack:
      'Balances, overdue recall, unconfirmed visits — rules create the follow-ups, your team just works the list. Nothing slips.',
    href: '/followups',
    group: 'run',
  },
  {
    id: 'reviews',
    title: 'The review loop',
    talkTrack:
      'Visit completes → review request → Google. 4-star-plus reviews auto-feature on the website. {clinicName} builds reputation on autopilot.',
    href: '/reviews',
    group: 'grow',
  },
  {
    id: 'website',
    title: 'The website',
    talkTrack:
      "This is the site we'd build for {clinicName} — edit it live, right here. AI rewrites copy in your voice. No web guy, no tickets.",
    href: '/website',
    group: 'grow',
  },
  {
    id: 'compare',
    title: 'Their site, side by side',
    talkTrack:
      "{firstName}, this is {clinicName}'s site today — and this is the same practice on ours, in your own colors. Same brand, different decade.",
    href: '/demo/compare',
    group: 'grow',
  },
  {
    id: 'analytics',
    title: 'Proof it works',
    talkTrack:
      'New patients, retention, reputation, search visibility — one honest scorecard. This is what you check monthly to know it paid for itself.',
    href: '/analytics',
    group: 'close',
  },
]

/** Substitute {clinicName}/{city}/{firstName} from the skin into a talk track. */
export function renderTalkTrack(
  track: string,
  skin: { clinicName?: string; city?: string; officialFirstName?: string } | null,
): string {
  return track
    .replace(/\{clinicName\}/g, skin?.clinicName ?? 'this practice')
    .replace(/\{city\}/g, skin?.city ?? 'town')
    .replace(/\{firstName\}/g, skin?.officialFirstName ?? 'Doctor')
}
