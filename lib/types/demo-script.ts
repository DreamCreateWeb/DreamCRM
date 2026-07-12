// The live-demo script — demo TRACKS, each an ordered set of beats the
// presenter walks through, rendered by the presenter panel (platform admin
// + demo mode only). One prospect cares about the website, another about
// their Google/social presence, another about front-desk chaos — the track
// picks which story the demo tells, and every track closes on an "And so
// much more" beat with the right plan-tier pitch. Talk tracks may reference
// {clinicName}, {city}, and {firstName}; the panel substitutes them from
// the demo skin so the pitch says THEIR practice's name. Editing the demo
// = editing this registry (typed, reviewed, versioned).

import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'

export type DemoBeatGroup = 'open' | 'run' | 'grow' | 'close'

export interface DemoBeat {
  id: string
  title: string
  /** Two lines max — a prompt, not a teleprompter. */
  talkTrack: string
  href: string
  /** Narrative arc grouping shown in the panel ("Grow · beat 6 of 8"). */
  group: DemoBeatGroup
  /** What to actually CLICK on this beat (≤2 short moves) — the presenter
   *  never fumbles "what do I show now" mid-pitch. */
  moves?: string[]
}

export const DEMO_GROUP_LABELS: Record<DemoBeatGroup, string> = {
  open: 'Open',
  run: 'Run the day',
  grow: 'Grow',
  close: 'Close',
}

export type DemoTrackId = 'full' | 'website' | 'presence' | 'social' | 'frontdesk'

export const DEMO_TRACK_IDS: DemoTrackId[] = ['full', 'website', 'presence', 'social', 'frontdesk']

export interface DemoTrack {
  id: DemoTrackId
  emoji: string
  label: string
  /** When to pick this track — shown on the prep page's story picker. */
  story: string
  recommendedPlan: 'basic' | 'pro' | 'premium'
  /** The money line — shown on the wrap-up screen as the close reminder. */
  planPitch: string
  /** Honest pacing for the story picker ("~15 min"). */
  targetMinutes: number
  beats: DemoBeat[]
}

// ---------- The beat bank ----------
// Beats reuse stable ids (website / reviews / appointments / messages /
// analytics) across tracks so the prospect's verified gaps (demo-gaps.ts
// keyword mapping) land as ⚠ ammunition in EVERY track, not just the full
// tour. Track-specific copy overrides the talk track, never the id.

const HUDDLE: DemoBeat = {
  id: 'huddle',
  title: 'Morning huddle',
  talkTrack:
    "This is {clinicName}'s morning — today's chairs, who needs attention, what's trending. Your front desk opens ONE screen instead of six.",
  href: '/dashboard',
  group: 'open',
  moves: ['Point at today’s chair count + the attention cards'],
}

const MESSAGES: DemoBeat = {
  id: 'messages',
  title: 'Messages + AI drafts',
  talkTrack:
    'Every patient text and email in one inbox. Watch the AI draft a reply — your team just reviews and hits send.',
  href: '/messages',
  group: 'run',
  moves: ['Open a thread → ✨ Draft a reply → send it'],
}

const APPOINTMENTS: DemoBeat = {
  id: 'appointments',
  title: 'Appointments',
  talkTrack:
    'The day, grouped how the desk thinks. Unconfirmed visits age visibly; one click confirms, reschedules, or fills the slot from the waitlist.',
  href: '/appointments',
  group: 'run',
  moves: ['Open an unconfirmed visit → Confirm it live'],
}

const FOLLOWUPS: DemoBeat = {
  id: 'followups',
  title: 'Follow-ups that run themselves',
  talkTrack:
    'Balances, overdue recall, unconfirmed visits — rules create the follow-ups, your team just works the list. Nothing slips.',
  href: '/followups',
  group: 'run',
  moves: ['Claim one follow-up → check it off'],
}

const REVIEWS: DemoBeat = {
  id: 'reviews',
  title: 'The review loop',
  talkTrack:
    'Visit completes → review request → Google. 4-star-plus reviews auto-feature on the website. {clinicName} builds reputation on autopilot.',
  href: '/growth/reviews',
  group: 'grow',
  moves: ['Show a 5★ auto-featured on the site', 'Point at the 1–2★ escalation path'],
}

const WEBSITE: DemoBeat = {
  id: 'website',
  title: 'The website',
  talkTrack:
    "This is the site we'd build for {clinicName} — edit it live, right here. AI rewrites copy in your voice. No web guy, no tickets.",
  href: '/website/editor',
  group: 'grow',
  moves: ['Click a section → edit → AI rewrite in their voice'],
}

const COMPARE: DemoBeat = {
  id: 'compare',
  title: 'Their site, side by side',
  talkTrack:
    "{firstName}, this is {clinicName}'s site today — and this is the same practice on ours, in your own colors. Same brand, different decade.",
  href: '/demo/compare',
  group: 'grow',
  moves: ['Scroll both panes together — let it speak'],
}

const ANALYTICS: DemoBeat = {
  id: 'analytics',
  title: 'Proof it works',
  talkTrack:
    'New patients, retention, reputation, search visibility — one honest scorecard. This is what you check monthly to know it paid for itself.',
  href: '/growth/analytics',
  group: 'close',
  moves: ['Walk the scorecard top to bottom — end on new patients'],
}

/** Every track ends here — the breadth beat. The talk track carries the
 *  track's plan pitch so the close always lands on a price. */
function moreBeat(talkTrack: string): DemoBeat {
  return {
    id: 'more',
    title: 'And so much more',
    talkTrack,
    href: '/integrations',
    group: 'close',
    moves: ['Scroll the marketplace — every tile is included'],
  }
}

// ---------- The tracks ----------

export const DEMO_TRACKS: Record<DemoTrackId, DemoTrack> = {
  full: {
    id: 'full',
    emoji: '🏛️',
    label: 'The whole platform',
    story: 'They need everything — the full open-to-close tour.',
    recommendedPlan: 'premium',
    planPitch: 'Everything you just saw is the Premium plan — $500 a month, no contracts.',
    targetMinutes: 25,
    beats: [
      HUDDLE,
      MESSAGES,
      APPOINTMENTS,
      FOLLOWUPS,
      REVIEWS,
      WEBSITE,
      COMPARE,
      ANALYTICS,
      moreBeat(
        'Open Dental sync, memberships, payment plans, a careers page, a patient portal — {clinicName} gets the whole engine. Premium is $500 a month, no contracts.',
      ),
    ],
  },

  website: {
    id: 'website',
    emoji: '🖥️',
    label: 'The website story',
    story: 'No site, or a site that embarrasses them — lead with the rebuild.',
    recommendedPlan: 'basic',
    planPitch:
      'The website story is the Basic plan — $150 a month for the site, booking, reviews, and SEO. Live in days, not months.',
    targetMinutes: 15,
    beats: [
      { ...COMPARE, group: 'open' },
      { ...WEBSITE, group: 'run' },
      {
        ...APPOINTMENTS,
        title: 'Online booking, built in',
        talkTrack:
          "Every page of the new site ends in a Book button. Patients pick a real open slot; it lands here on the desk's agenda — no phone tag.",
        moves: ['Open the public /book page → pick a slot → show it land here'],
      },
      {
        id: 'leads',
        title: 'Every enquiry, captured',
        talkTrack:
          'Forms on the site don’t go to a dusty inbox — they land in a triage queue with status, source, and follow-through. Nothing leaks.',
        href: '/leads',
        group: 'run',
        moves: ['Open a lead → convert it to a patient'],
      },
      {
        ...REVIEWS,
        title: 'Reviews feed the site',
        talkTrack:
          'Visit completes → review request → Google. 4-star-plus reviews feature themselves on {clinicName}’s new site automatically — fresh proof, zero effort.',
      },
      {
        id: 'seo',
        title: 'Found on Google',
        talkTrack:
          'Search Console and the Google Business Profile wired in — {clinicName} sees exactly what patients search and where the site ranks.',
        href: '/website/seo',
        group: 'grow',
        moves: ['Show what patients searched to find them'],
      },
      moreBeat(
        'That’s the website story — and the same $150 a month also includes the patient inbox, follow-ups, and intake forms. And so much more on top.',
      ),
    ],
  },

  presence: {
    id: 'presence',
    emoji: '📍',
    label: 'Found everywhere',
    story: 'Site’s fine, but Google, reviews, and social don’t tell one story.',
    recommendedPlan: 'pro',
    planPitch:
      'Getting found everywhere is the Pro plan — $250 a month. Website, Google, reviews, and social in one engine.',
    targetMinutes: 15,
    beats: [
      {
        id: 'seo',
        title: 'Your Google listing, synced',
        talkTrack:
          '{clinicName}’s Google Business Profile managed right from the dashboard — hours, photos, posts. Most listings drift; yours stays true.',
        href: '/website/seo',
        group: 'open',
        moves: ['Show the GBP listing synced from the dashboard'],
      },
      { ...REVIEWS, group: 'run' },
      {
        id: 'social',
        title: 'Post once, everywhere',
        talkTrack:
          'One composer for Google, Facebook, Instagram — write once, preview each platform, schedule the month in one sitting.',
        href: '/growth/social',
        group: 'run',
        moves: ['Write one post → flip through the per-platform previews'],
      },
      {
        ...WEBSITE,
        title: 'It all feeds the website',
        talkTrack:
          'Reviews and posts surface on the site automatically — the whole presence tells one story, in {clinicName}’s own brand.',
      },
      {
        ...ANALYTICS,
        talkTrack:
          'Search views, direction requests, calls from Google, social reach — one honest scorecard for the whole presence.',
        group: 'close',
      },
      moreBeat(
        'That’s the presence story — Pro is $250 a month, and it also includes the patient inbox, recall campaigns, and the website editor. And so much more.',
      ),
    ],
  },

  social: {
    id: 'social',
    emoji: '📣',
    label: 'The social suite',
    story: 'They know social matters and nobody at the office has time for it.',
    recommendedPlan: 'pro',
    planPitch:
      'The social suite rides the Pro plan — $250 a month, and a $30 add-on unlocks every channel.',
    targetMinutes: 12,
    beats: [
      {
        id: 'social',
        title: 'Every channel, one composer',
        talkTrack:
          'Google, Facebook, Instagram, TikTok, YouTube — write once, preview each platform, post or schedule. This is the whole workflow.',
        href: '/growth/social',
        group: 'open',
        moves: ['Write one post → flip through the per-platform previews'],
      },
      {
        id: 'social-calendar',
        title: 'The month at a glance',
        talkTrack:
          'Flip to the calendar — plan the month, drag the gaps closed. A practice that posts weekly looks alive; this makes weekly effortless.',
        href: '/growth/social',
        group: 'run',
        moves: ['Switch calendar ⇄ showcase views'],
      },
      {
        id: 'social-comments',
        title: 'Comments, answered',
        talkTrack:
          'Every comment across channels lands in one queue — nothing sits unanswered under {clinicName}’s name.',
        href: '/growth/social',
        group: 'run',
        moves: ['Answer one comment live'],
      },
      {
        ...REVIEWS,
        title: 'Reputation rides along',
        talkTrack:
          'Google and Facebook reviews sync in; great ones feature on the site; a rough one escalates to the owner before it goes public.',
      },
      {
        ...ANALYTICS,
        title: 'Reach you can read',
        talkTrack:
          'Followers, reach, engagement per channel — plus what it actually drove: profile visits, calls, bookings.',
        group: 'close',
      },
      moreBeat(
        'The social suite rides Pro — $250 a month, plus a $30 add-on for every channel. And the whole platform comes underneath it.',
      ),
    ],
  },

  frontdesk: {
    id: 'frontdesk',
    emoji: '🗓️',
    label: 'Run the day',
    story: 'Front-desk chaos — phone tag, no-shows, sticky notes everywhere.',
    recommendedPlan: 'pro',
    planPitch:
      'Running the day is the Pro plan — $250 a month; most offices recover more than that in no-shows alone.',
    targetMinutes: 15,
    beats: [
      HUDDLE,
      MESSAGES,
      APPOINTMENTS,
      FOLLOWUPS,
      {
        id: 'intake',
        title: 'Intake before they sit down',
        talkTrack:
          'Forms go out automatically before the visit — photos, insurance cards, signatures. Chair time starts on time.',
        href: '/intake-forms',
        group: 'run',
        moves: ['Open a completed form → the AI pre-visit summary'],
      },
      moreBeat(
        'That’s the front-desk story — Pro is $250 a month, and the reviews engine, website editor, and recall campaigns come with it. And so much more.',
      ),
    ],
  },
}

export const DEMO_TRACK_LIST: DemoTrack[] = DEMO_TRACK_IDS.map((id) => DEMO_TRACKS[id])

export const DEFAULT_TRACK_ID: DemoTrackId = 'full'

/** Junk-tolerant lookup — an unknown/missing id falls back to the full tour. */
export function resolveTrack(id: string | null | undefined): DemoTrack {
  return (id && DEMO_TRACKS[id as DemoTrackId]) || DEMO_TRACKS[DEFAULT_TRACK_ID]
}

/**
 * Which story to lead with, from what we verified about the prospect.
 * Deterministic and deliberately conservative: 'social' and 'frontdesk' are
 * discovery-driven picks (you learn those on the call), never auto-suggested.
 */
export function suggestDemoTrack(
  verdict: ProspectAiVerdict | null,
  signals: ProspectCrawlSignals | null,
  places?: { ratingTenths?: number | null; reviewCount?: number | null },
): DemoTrackId {
  // No site, or a site we'd be embarrassed to keep — lead with the rebuild.
  if (!verdict || !verdict.hasWebsite) return 'website'
  if (verdict.websiteQuality < 40) return 'website'
  // Site is fine but the presence around it is quiet — lead with found-everywhere.
  const socialLinks = signals ? Object.values(signals.socialLinks ?? {}).filter(Boolean).length : 0
  const weakReputation =
    (places?.ratingTenths != null && places.ratingTenths < 42) ||
    (places?.reviewCount != null && places.reviewCount < 50)
  if (socialLinks === 0 || weakReputation) return 'presence'
  return 'full'
}

/** The full tour's beats — kept as the historical export; prefer
 *  resolveTrack(...).beats for anything track-aware. */
export const DEMO_BEATS: DemoBeat[] = DEMO_TRACKS.full.beats

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
