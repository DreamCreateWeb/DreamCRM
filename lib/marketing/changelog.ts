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

import type { ToneTileGlyph } from '@/lib/marketing/tone-tiles'

/** How an item changed the product — shown as a WORD, never colour alone. */
export type ChangelogItemKind = 'new' | 'improved' | 'fixed'

export const CHANGELOG_KIND_LABELS: Record<ChangelogItemKind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
}

export interface ChangelogItem {
  kind: ChangelogItemKind
  /**
   * WHAT THE ITEM IS ABOUT — the subject, not the kind. Required, and that is
   * the call `RESOURCE_GUIDES.glyph` made on move 6 page 5: a new entry
   * cannot compile until somebody has decided which part of the product it
   * touched, which is a question the author is answering anyway while writing
   * the body.
   *
   * It exists because the three KIND pills used to carry the colour on this
   * page, and two of their three hues were wrong under `BRAND.md` Part 2:
   * `teal` is the BRAND ramp and "the brand hue is never a status", and
   * `blue` is not in the tone registry at all. Colour that says "New" makes
   * the brand colour mean a status; colour that says "booking" says something
   * the reader actually wants at a glance. So the kind became a word (it
   * always carried the meaning — the old comment said so) and the subject
   * took the colour, through the same `lib/marketing/tone-tiles.ts` registry
   * every other marketing list uses.
   *
   * Pick the subject the ITEM is about. Two items about the website get two
   * globes and that is correct — Part 3's wallpaper rule is about one
   * identical mark down an inventory, not about a week that touched one area
   * twice.
   */
  glyph: ToneTileGlyph
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
      'This week was about trust: every change to DreamCRM now has to pass its full test suite before it can reach your practice, and a set of browser tests walks the real journeys — booking a visit, moving one, a front-desk day — on every single change. Building that net turned up a lot worth fixing, and the rest of the week went on clearing it: a dead end on the page that books your new patients, money numbers that disagreed with each other, reminders that could go out twice, and a public website doing twice the work on every visit.',
    items: [
      {
        kind: 'fixed',
        glyph: 'calendar',
        title: 'Booking no longer dead-ends in the late afternoon',
        body:
          'On your public booking page, a visitor arriving in the late afternoon — roughly between 3 and 5 — could be told “we’re done seeing patients for today” with no way forward: the button offering tomorrow’s openings was being hidden. Two halves of the page disagreed about whether today still had room. They now use the same rule, so the way forward is always there. This is the page that turns a stranger into a patient, so it was the most expensive of the week’s fixes.',
      },
      {
        kind: 'fixed',
        glyph: 'money',
        title: 'A payment that never happened no longer sits in a patient’s history',
        body:
          'When a patient in the portal started paying a bill and the payment never got off the ground — our card processor having a bad minute — a record of it was left behind in their own billing history, looking like money they had paid. Nothing was ever charged, but the patient saw a payment they never made and your front desk had to explain it. Nothing is written down now until the payment has actually started.',
      },
      {
        kind: 'fixed',
        glyph: 'chart',
        title: 'Refunds and outstanding totals now match reality',
        body:
          'Two money numbers were telling you things that were not so. A refund issued from the card processor’s own dashboard never reached your board here, so the order still read “Paid” while the bank disagreed — refunds now land against the right order, balance payment or booking deposit as they happen. Separately, the outstanding-balance total at the top of Collections was adding up only the first screenful of patients, so a practice with more open balances than that was quoted less than its real accounts receivable. It now counts every patient, and agrees with the figure on the Payments hub.',
      },
      {
        kind: 'fixed',
        glyph: 'cart',
        title: 'Checkout and your public forms say what actually went wrong',
        body:
          'When something went wrong at checkout on your public website — or on a contact, request-a-visit, booking, chat or intake form — the visitor got “an error occurred” and no way forward, even when we knew exactly what to tell them: “only two left”, “that promo code has just been used”, “that time was just taken, please pick another”. The sentence written for the patient now actually reaches the patient. A failed checkout also no longer leaves a half-finished order behind.',
      },
      {
        kind: 'fixed',
        glyph: 'gift',
        title: 'No more double redemptions or duplicate payment plans',
        body:
          'A patient who double-tapped “Redeem” in the portal — or had it open on a phone and a laptop — could take two rewards off one balance and push their points below zero. Separately, two staff working the same patient at the same time could create two payment plans for one balance, and each plan asks the patient to pay. Both now finish one request before starting the next, so the second attempt is turned away with the message it should have shown all along.',
      },
      {
        kind: 'fixed',
        glyph: 'bolt',
        title: 'A reminder can only go out once',
        body:
          'Appointment reminders were written down as sent only after they had gone, so two reminder runs overlapping — or one that got retried — could each decide nothing had been sent yet and both send. The same patient got two texts about the same visit. A reminder is now claimed before it goes out, so only one run can take it, and a send that does not happen hands the claim back for the next run to pick up.',
      },
      {
        kind: 'fixed',
        glyph: 'sync',
        title: 'A visit booked during a practice-system outage still reaches your schedule',
        body:
          'While your practice-management system was unreachable, a booking for a patient we had not yet matched over there spent one of its retry attempts every time we tried, instead of waiting for the system to come back. Over a long weekend it could use them all up and stop for good — the visit would exist in DreamCRM and never appear on your practice’s schedule. Those bookings now wait out the outage. And when a write really is refused, the front desk gets the actual reason — “their practice system needs an email and a date of birth to create a chart” — instead of one vague sentence that fit every cause equally badly.',
      },
      {
        kind: 'fixed',
        glyph: 'globe',
        title: 'Pasted code can no longer break a clinic page',
        body:
          'Every clinic page carries a hidden summary for search engines, built out of what you write: service descriptions, FAQ answers, team bios, job posts. If any of that happened to contain a closing tag copied in from somewhere else, the page broke — the summary spilled onto the screen as visible text and search engines lost the structured information entirely. No malice required; a pasted snippet did it. Everything you type is now made safe before it goes into that block.',
      },
      {
        kind: 'fixed',
        glyph: 'pencil',
        title: 'Publishing your website says so straight away',
        body:
          'The button that takes a clinic website live could go on reading “Going live…” for up to a minute after the site was already live — and a button that looks stuck is a button people press again, on the thing that publishes their practice’s website. It now confirms the moment the site is online and shows you the address it is answering on. The same card also used to describe a site as live in a state where it was not; it tells the truth in both directions now.',
      },
      {
        kind: 'improved',
        glyph: 'globe',
        title: 'Your public website loads faster',
        body:
          'Every public clinic page was loading its whole payload twice on every visit — your profile, locations, theme and content, once for the page itself and once for the summary browsers and search engines read. It now loads once, and the published version is held between visits so most visitors are served without going back to the database at all. Your unpublished draft is still worked out fresh every time, so what you see while editing can never be served to a visitor.',
      },
      {
        kind: 'improved',
        glyph: 'chat',
        title: 'The messages screen stays quick as your patient list grows',
        body:
          'Opening messages used to load every conversation your practice has ever had, and opening one loaded every message in it. Fine at a few hundred patients, slow at a few thousand — which is exactly when you’d be running a campaign. It now loads a screenful at a time with a “Show more conversations” button, and searching happens in the database, so a search still looks at everything. If you were under the limit, nothing about your screen changed.',
      },
      {
        kind: 'improved',
        glyph: 'people',
        title: 'The Patients list loads a page at a time',
        body:
          'Opening Patients used to pull your entire roster before showing you anything, then narrow and sort it afterwards. Filtering and sorting now happen in the database and you get a page at a time — so “patients due for recall” means the first page of everyone due for recall, not the ones who happened to sit near the front of the list. Search, the balance and birthday filters, the missing-intake filter and all six sort options still look at your whole roster.',
      },
      {
        kind: 'improved',
        glyph: 'layers',
        title: 'Pages paint faster',
        body:
          'The typeface the app is set in was being fetched from an outside service on every first visit, and nothing could be drawn until it arrived. It now comes from our own servers alongside the rest of the page, which takes a third-party round trip out of the very first thing anyone sees.',
      },
      {
        kind: 'improved',
        glyph: 'clock',
        title: 'Your morning digest reaches every practice, every night',
        body:
          'The overnight jobs that build the daily digest, generate suggestions and run retention automations walked every practice from the same end of the same list, with no time limit. If a run hit its ceiling it was cut off part-way through, silently — so the practices near the end never got their digest and nothing anywhere said so. Each run now stops deliberately before it is cut off and picks up next time where it left off, and one practice hitting a problem no longer takes the rest of the night down with it.',
      },
      {
        kind: 'improved',
        glyph: 'door',
        title: 'The patient portal works properly with a screen reader',
        body:
          'For patients who browse by keyboard or listen to the page, booking was largely silent: picking a day swapped every appointment time on screen with nothing said about it, the day and time choices weren’t announced as a set of options, and the confirmation screen at the end of booking never got read out. All of that now speaks. Sign-in, password reset, and invitation pages announce their errors and their success instead of appearing to do nothing, and the portal menu says which page you’re on.',
      },
      {
        kind: 'improved',
        glyph: 'form',
        title: 'Buttons and form fields a screen reader can actually read',
        body:
          'Seventy-seven fields across the app had a label printed beside them that was attached to nothing, so anyone listening heard “edit text, blank” — the public job application, add-to-cart, the review form and accepting an invitation went first, and the rest followed. Sixteen buttons a patient presses — book a visit, pay a bill, set up a plan, send a message, check out — used to swap their own text while they worked, which resizes the button under your thumb and announces nothing; they now say out loud that they are working. And each row of the day’s agenda is a proper list item with its own controls again, instead of one large button wrapped around a checkbox and two links.',
      },
      {
        kind: 'improved',
        glyph: 'eye',
        title: 'Text on your brand colour is readable whatever colour you chose',
        body:
          'Wherever your practice’s brand colour is used as a background — the selected day and time slot on your public booking page, tinted headings and chips through the patient portal — light text on a pale brand could come out too faint to read comfortably. The app now works out whether dark or light text belongs on your particular colour rather than assuming light, and an automatic check on every change keeps new ones from creeping back in.',
      },
      {
        kind: 'improved',
        glyph: 'key',
        title: 'Security and privacy hardening',
        body:
          'A few quiet ones. Photos patients send through the portal must now be images we are actually storing, so opening a conversation can’t report anything about your front desk to an outsider — and the insurance-card scanner now reads card images only from our own storage, so nobody outside can point your practice’s scanning allowance at a file of their choosing. Settings pages accept only the settings they actually show. And the automated background jobs — reminders, campaign sends, nightly syncs — all share one credential check that behaves identically no matter what it is sent.',
      },
      {
        kind: 'new',
        glyph: 'shield',
        title: 'Every change is tested before it can reach you',
        body:
          'DreamCRM has more than 7,000 automated tests. Until this week nothing forced them to run before a change went live. Now they run on every proposed change and again before every deployment, alongside a set of browser tests that actually book a visit, reschedule and cancel one from the portal, work a front-desk day, and approve a suggestion. A deployment to your practice cannot begin until all of it passes. The whole suite runs overnight as well — including once on a clock that isn’t ours, so a time-zone problem turns up here rather than on your screen — and every page those browser tests walk through is now checked for accessibility problems while they are on it.',
      },
      {
        kind: 'new',
        glyph: 'megaphone',
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
