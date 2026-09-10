/**
 * The public changelog for /changelog — what changed in DreamCRM, written
 * for the practice owner who uses it, not for the person who wrote it.
 *
 * CADENCE IS THE POINT (owner directive, 2026-09-09). Entries are batched
 * **weekly**: ONE longer entry per week summarizing everything that shipped
 * that week. Never a per-update or per-PR entry — development runs far
 * faster than anyone wants to read about, and a wall of tiny entries reads
 * as noise instead of progress. The registry shape enforces the habit: an
 * entry is a WEEK (`weekOf`, the Monday it covers), and the items inside it
 * are that week's story.
 *
 * Content laws, same honesty bar as /docs and /resources:
 *  - Describe what a customer can now see, do, or trust — not the code.
 *  - Name the surface the way the product names it ("the booking page",
 *    "the messages screen"), never a file, route, or internal identifier.
 *  - Say what was broken plainly when something was broken. No exploit
 *    recipes and no security detail an attacker could use, but no pretending
 *    a fix was an enhancement either.
 *  - Nothing here may describe the product as unfinished or in beta — the
 *    marketing site's standing rule.
 *
 * Adding a week: prepend an entry (newest first — `CHANGELOG_ENTRIES[0]` is
 * what the page leads with) and run the tests. `tests/marketing/changelog.test.tsx`
 * pins the ordering, the shape, and the honesty rules.
 */

/** How an item changed the product — shown as a labelled pill, never colour alone. */
export type ChangelogItemKind = 'new' | 'improved' | 'fixed'

export const CHANGELOG_KIND_LABELS: Record<ChangelogItemKind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
}

export interface ChangelogItem {
  kind: ChangelogItemKind
  /** A sentence a practice owner would say out loud. */
  title: string
  /** One short paragraph: what it was, what it is now, why they care. */
  body: string
}

export interface ChangelogEntry {
  /**
   * The Monday of the week this entry covers, ISO `YYYY-MM-DD`. Doubles as
   * the anchor id, so every week has a permalink.
   */
  weekOf: string
  /** The week's headline. */
  title: string
  /** One or two sentences framing the week. */
  summary: string
  /**
   * Optional release cycle the week belongs to. The repo's program of record
   * (`docs/RELEASE.md`) names its cycles rather than numbering them, so this
   * carries the cycle name — not an invented version number.
   */
  release?: string
  items: ChangelogItem[]
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    weekOf: '2026-09-07',
    release: 'Foundations',
    title: 'A safety net under everything, and the fixes it caught',
    summary:
      'This week was about trust: every change to DreamCRM now has to pass its full test suite before it can reach your practice, and a set of browser tests walks the real journeys — booking a visit, moving one, a front-desk day — on every single change. Building that net turned up several things worth fixing, including a dead end on the page that books your new patients.',
    items: [
      {
        kind: 'fixed',
        title: 'Booking no longer dead-ends in the late afternoon',
        body:
          'On your public booking page, a visitor arriving in the late afternoon — roughly between 3 and 5 — could be told “we’re done seeing patients for today” with no way forward: the button offering tomorrow’s openings was being hidden. Two halves of the page disagreed about whether today still had room. They now use the same rule, so the way forward is always there. This is the page that turns a stranger into a patient, so it was the most expensive of the week’s fixes.',
      },
      {
        kind: 'fixed',
        title: 'No more double redemptions or duplicate payment plans',
        body:
          'A patient who double-tapped “Redeem” in the portal — or had it open on a phone and a laptop — could take two rewards off one balance and push their points below zero. Separately, two staff working the same patient at the same time could create two payment plans for one balance, and each plan asks the patient to pay. Both now finish one request before starting the next, so the second attempt is turned away with the message it should have shown all along.',
      },
      {
        kind: 'improved',
        title: 'The messages screen stays quick as your patient list grows',
        body:
          'Opening messages used to load every conversation your practice has ever had, and opening one loaded every message in it. Fine at a few hundred patients, slow at a few thousand — which is exactly when you’d be running a campaign. It now loads a screenful at a time with a “Show more conversations” button, and searching happens in the database, so a search still looks at everything. If you were under the limit, nothing about your screen changed.',
      },
      {
        kind: 'improved',
        title: 'The patient portal works properly with a screen reader',
        body:
          'For patients who browse by keyboard or listen to the page, booking was largely silent: picking a day swapped every appointment time on screen with nothing said about it, the day and time choices weren’t announced as a set of options, and the confirmation screen at the end of booking never got read out. All of that now speaks. Sign-in, password reset, and invitation pages announce their errors and their success instead of appearing to do nothing, and the portal menu says which page you’re on.',
      },
      {
        kind: 'improved',
        title: 'Pages paint faster',
        body:
          'The typeface the app is set in was being fetched from an outside service on every first visit, and nothing could be drawn until it arrived. It now comes from our own servers alongside the rest of the page, which takes a third-party round trip out of the very first thing anyone sees.',
      },
      {
        kind: 'improved',
        title: 'Security and privacy hardening',
        body:
          'A few quiet ones. Photos patients send through the portal must now be images we are actually storing, so opening a conversation can’t report anything about your front desk to an outsider. Settings pages now accept only the settings they actually show. And the automated background jobs — reminders, campaign sends, nightly syncs — all share one credential check that behaves identically no matter what it is sent.',
      },
      {
        kind: 'new',
        title: 'Every change is tested before it can reach you',
        body:
          'DreamCRM has more than 7,000 automated tests. Until this week nothing forced them to run before a change went live. Now they run on every proposed change and again before every deployment, alongside a set of browser tests that actually book a visit, reschedule and cancel one from the portal, work a front-desk day, and approve a suggestion. A deployment to your practice cannot begin until all of it passes.',
      },
      {
        kind: 'new',
        title: 'A changelog you can actually read',
        body:
          'This page. One entry per week covering everything that shipped, written in plain English — so you can see what changed without having to ask, and skip a week that doesn’t affect you. It’s public, so you can send it to anyone on your team.',
      },
    ],
  },
]

/** The newest week, or undefined before the first entry exists. */
export function latestChangelogEntry(): ChangelogEntry | undefined {
  return CHANGELOG_ENTRIES[0]
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/**
 * "2026-09-07" → "Week of September 7, 2026".
 *
 * Formatted from the ISO parts on purpose: `new Date('2026-09-07')` is UTC
 * midnight, so a locale formatter on a server west of UTC renders the day
 * before. A changelog that names the wrong week is a small lie.
 */
export function formatWeekOf(weekOf: string): string {
  const [year, month, day] = weekOf.split('-').map(Number)
  const name = MONTHS[(month ?? 1) - 1] ?? ''
  return `Week of ${name} ${day}, ${year}`
}
