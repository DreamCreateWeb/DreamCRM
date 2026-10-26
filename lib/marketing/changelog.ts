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
    weekOf: '2026-10-19',
    title: 'Your icons, your photo, and an editor that no longer freezes',
    summary:
      'A week shaped by one practice’s first asks after going live on their own domain: the service icons are theirs to choose now, the empty photo spot on every design is a door, phone numbers read like phone numbers, and the one thing everyone called “the editor freezing” turned out to be a tab left open across one of our updates — it tells you now, and offers a refresh.',
    items: [
      {
        kind: 'new',
        glyph: 'globe',
        title: 'Pick your own service icons',
        body:
          'Every service on your website showed a small symbol we chose. The icon is yours now: in Website Studio, click the icon beside any service and pick from a library of line icons you can search by what they mean, keep a symbol, upload your own image, or show none at all. The same picker opens from the services list under Website → Content, and every design, the services pages and the dashboard’s own list draw the icon the same way.',
      },
      {
        kind: 'fixed',
        glyph: 'globe',
        title: 'You can put a photo in the empty hero',
        body:
          'On three of the six website designs, the practice-photo spot only appeared once a photo already existed — a practice starting without one saw a grey square and nothing to click, and the uploader could not be reached from the page at all. The empty spot is a door now on every design: hover it in Website Studio and it says “Add practice photo”.',
      },
      {
        kind: 'fixed',
        glyph: 'globe',
        title: 'Phone numbers read like phone numbers',
        body:
          'A number imported from your practice software as bare digits printed exactly that way across your whole site — ten digits run together on sixty different lines. The site now dashes a bare number everywhere it appears, and leaves a number you typed with your own spacing exactly as you typed it. The headings on the services page are editable on the page now too, so “provided by” is yours to change like any other line.',
      },
      {
        kind: 'fixed',
        glyph: 'bolt',
        title: 'The website editor no longer freezes after we ship an update',
        body:
          'Each time we shipped an update, a Website Studio tab opened before it would have its next save refused — and the editor sat on “Saving…” until you refreshed. It read as a freeze and it was the most common bad minute in the editor. Every save now catches that refusal, tells you an update landed, and offers one refresh; the rest of the dashboard does the same quietly when a tab has been open across an update. Everything you had already saved was always safe.',
      },
    ],
  },
  {
    weekOf: '2026-10-12',
    title: 'Financing on every design, and a Content page you can find',
    summary:
      'The patient-financing widgets from the week before were made to behave on all six website designs — fonts, brand colour, where the floating button sits — and the Website → Content page, which the hub had never linked and which stacked every form down one long screen, became a table of contents with one editor.',
    items: [
      {
        kind: 'improved',
        glyph: 'money',
        title: 'Patient financing works on all six designs',
        body:
          'The financing widgets now take each design’s own fonts and your brand colour (a pale brand no longer washes out to white-on-white), the floating “Pay over time” button sits bottom-left, clear of your Call and Book buttons, and lifts above the chat bubble and the phone bar, and the financing page falls back to plain apply cards when a provider’s script cannot load — never a blank bar.',
      },
      {
        kind: 'fixed',
        glyph: 'globe',
        title: 'The chat bubble no longer sits on the phone’s bottom bar',
        body:
          'On the designs that pin a full-width Call / Book bar to the bottom of a phone screen, the chat bubble — and the editor’s draft banner — sat right on top of it. Every floating control now measures that bar and lifts itself above it on the designs that have one, and stays exactly where it was on the designs that do not.',
      },
      {
        kind: 'improved',
        glyph: 'globe',
        title: 'Website → Content is a table of contents, not a wall',
        body:
          'The Content page stacked every section’s form down one long page under a row of chips that clipped its last entries off the right edge. It is a rail and one editor now: the rail lists every section with its honest state in its own words — “9 services”, “2 partners”, “Not set yet” — and a count of how many are filled; the editor shows one section at a time with a “See it on your site” link to the page it appears on and an “Edit on the page” door into the Studio. The Website hub now links to Content beside Design and Pages, which it had never done.',
      },
    ],
  },
  {
    weekOf: '2026-10-05',
    title: 'Insurance at the front desk, financing on your site, and a front door on every feature',
    summary:
      'The biggest week since launch. Insurance checks reach real payers now, behind a one-button setup, and the printed sheet is the breakdown form the desk fills by phone — line for line, with a search for coverage when there is no card. Patient financing joined the website from each provider’s own kit. And every feature in the dashboard gained a front door, so a new practice meets a product that explains itself instead of sixty-five empty screens.',
    items: [
      {
        kind: 'new',
        glyph: 'shield',
        title: 'Insurance checks, on for the practices that want them',
        body:
          'Daily → Insurance explains the tool in a few lines, an owner or admin turns it on with one button, and the practice’s NPI goes in once. From then on a check reaches the real payer, with 200 checks a month included; every answer says who gave it. The patient record remembers the card that was checked, so a dependent’s re-check carries the payer and the policyholder without retyping.',
      },
      {
        kind: 'new',
        glyph: 'shield',
        title: 'The verification sheet, line for line',
        body:
          'The printed sheet is the breakdown form the front desk fills by phone: plan, group and employer; the payer’s phone and claims address; the deductible and what it applies to; seven coverage tiers; a line per procedure with what the plan pays, the allowance, and the last and next dates; replacement windows, age limits and downgrades — the payer’s answer where it answered and an honest blank where it did not. Facts about your own contract with a payer, like the fee schedule or whether it pays on seat or prep, are kept once per payer and fill every sheet. A “Full breakdown” button asks the payer about every code on the sheet and says plainly how many checks it took.',
      },
      {
        kind: 'new',
        glyph: 'shield',
        title: 'No card? Find their coverage',
        body:
          'A patient with no card, or an expired one, used to mean phoning payers one by one. The check form can now search for coverage from a name, a birthday, a state and a ZIP — and, optionally, a Social Security number that is sent for the search and never stored — and hands back candidate cards for a person to compare and pick. Picking one fills the form; the benefits come through the same check as everyone else’s. Twenty searches a month are included, and the confirm names the cost before anything goes out.',
      },
      {
        kind: 'fixed',
        glyph: 'shield',
        title: 'A real payer’s answer no longer prints blank',
        body:
          'The first real sheet for a child on a parent’s plan came out empty under thirty-two raw payer sentences. The payer labelled every plan rule as family-level and the reader only trusted individual rows; it now reads rules at any level, merges a line’s several rows, and sorts each sentence into the field it answers — the miscellaneous box on that answer went from thirty-two lines to one. The sheet also prints in order now; the patient’s own block had been cut off above the first page.',
      },
      {
        kind: 'new',
        glyph: 'money',
        title: 'Patient financing on your website, from the provider’s own kit',
        body:
          'Website → Content → Financing is a provider catalog: pick Cherry, CareCredit, Sunbit, Proceed, Alphaeon, LendingClub or Scratchpay, paste the one thing that provider gave your practice, and the site builds the rest — the lead provider’s own apply widget on your financing page, an apply button on every card, and a floating “Pay over time” button on every page where the provider offers one. Pasted code is never accepted, so nothing a provider hands you can reach your visitors except through our own checks.',
      },
      {
        kind: 'improved',
        glyph: 'door',
        title: 'Every feature has a front door, and nothing says “coming soon”',
        body:
          'A new practice’s sidebar now starts with the six things a front desk uses on day one and an “Add” group of everything else; each feature explains itself and turns on with one button, intake lets you pick what to collect before the first form exists, and connecting your practice-management system is one form that lands with us instead of a request to ask support. Fifty empty screens gained a first action. The morning email now says what the machine did overnight, names one thing to do, and sends through the first week even on a quiet night.',
      },
    ],
  },
  {
    weekOf: '2026-09-28',
    title: 'The insurance tool, built on a real clearinghouse',
    summary:
      'A new tool for the front desk: type what is on a patient’s insurance card and get the benefits back — maximum left, deductible, coverage tiers, waiting periods, frequencies — from a real clearinghouse rather than a phone queue. The rest of the week was spent making its numbers honest, its card readable at a glance, and its paper printable.',
    items: [
      {
        kind: 'new',
        glyph: 'shield',
        title: 'Type what’s on the card, get the benefits',
        body:
          'Daily → Insurance is new: type a patient’s card — a new patient or one on file — pick the payer from a dental-first list, and get a snapshot: maximum left, deductible, coverage tiers, waiting periods and frequencies, with “Check again” on every answer and a pill that says who gave it. Save it to the record or add the patient from it. A carrier name is forty different state plans, so the payer is picked from a list and never guessed from a name.',
      },
      {
        kind: 'improved',
        glyph: 'shield',
        title: 'Honest numbers, a scoreboard, and the desk’s paper',
        body:
          'Every dollar on the card is shown only when the payer stated it — “used” appears only when both ends are known, never worked out from a guess. The card reads as a scoreboard: the headline amount beside a ring drawn only from stated numbers, tiles per coverage tier, and a real frequencies table whose Next column is toned by date. Every good answer gets Copy summary and Print sheet, the patient record gets a history drawer of recent checks, and the recent list is searchable by status.',
      },
      {
        kind: 'new',
        glyph: 'shield',
        title: 'Scan the card',
        body:
          'Photograph the insurance card and the reader fills the form — the carrier becomes the payer search, the plan and subscriber are hints — and never runs a check on its own; the photo is kept on the record as a document. The three insurance answers on your intake forms now fill a patient’s empty insurance fields too, and never overwrite what your practice software or your staff already wrote.',
      },
    ],
  },
  {
    weekOf: '2026-09-21',
    title: 'Every price from one place, and a watch on our own deploys',
    summary:
      'A short week on the honesty of two things nobody should have to think about: the price quoted anywhere on our site now comes from one place, and an update that reports green while the site keeps serving the previous build is no longer invisible to us.',
    items: [
      {
        kind: 'fixed',
        glyph: 'tag',
        title: 'One price, resolved everywhere it is quoted',
        body:
          'The help docs, the ROI calculator, the partner page and the demo practice’s own invoices each carried a typed price, and two of them had drifted from the plan a practice actually pays. Every price on the site now reads from the one plan configuration, the demo partner portal invoices the real plan, and a check grades every file on the site so a typed number cannot creep back in.',
      },
      {
        kind: 'improved',
        glyph: 'bolt',
        title: 'An update that didn’t take is now visible',
        body:
          'One update reported green on every check we have while the site kept serving the previous build for nearly three hours, until the next update carried it in. The rollout now checks what is actually running after every deploy and prints the result — loudly when it cannot tell — rather than assuming green meant live.',
      },
    ],
  },
  {
    weekOf: '2026-09-14',
    title: 'Our website steps into daylight, and a long week of honest fixes',
    summary:
      'Two piles this week. Our own website — the pages you and your colleagues see when you look DreamCRM up — moved into daylight: one lighter design across every page, and a homepage that now walks a single patient through the product instead of describing it. The other pile was plain fixes, and the plainest ones are the ones worth reading: a booking screen that promised patients an email it had not sent, reminders and messages that could go out twice, and a long sweep of text that was simply too faint to read.',
    items: [
      {
        kind: 'improved',
        glyph: 'globe',
        title: 'Our website is lighter, and every page finally matches',
        body:
          'The homepage, pricing, the comparison pages, the product tour, the manifesto, the guide library, the free tools, the blog, the help docs and this changelog have all been rebuilt on one light design, in place of the mixture of dark and light they had grown into. Four of those pages had quietly never picked up the shared header and page opening at all, so they read like a different company; they all open the same way now. If you send a colleague or a prospective associate a link, it looks like one product.',
      },
      {
        kind: 'new',
        glyph: 'globe',
        title: 'The homepage now follows one patient through the product',
        body:
          'The middle of the homepage used to be one screenshot with four paragraphs beside it. It is a short scrolling sequence now that follows a single patient — she comes off the recall list, gets an invitation with a real opening, pays her balance, leaves a review — and the screen behind the words changes with her as you scroll, so the recalls figure ticks up when she books and the week’s collected total moves by exactly what she paid. On a phone, or if you have asked your device to reduce motion, it lays out as four ordinary sections in reading order with nothing lost.',
      },
      {
        kind: 'improved',
        glyph: 'layers',
        title: 'The comparison pages fit on a phone',
        body:
          'On the pages comparing DreamCRM with the other systems a practice might be looking at, the feature table ran about two hundred pixels wider than a phone screen. The page slid sideways, the marks along the right-hand edge could only be reached by dragging, and anyone browsing by keyboard could not get into that table at all. It reflows to the screen now instead of scrolling, and the small notes under each mark are back above the size we hold ourselves to.',
      },
      {
        kind: 'fixed',
        glyph: 'calendar',
        title: 'The booking screen no longer promises an email it never sent',
        body:
          'After someone booked on your public booking page, the confirmation screen said we had sent a confirmation to their email before the email had actually gone anywhere. A patient whose address was wrong, or whose message failed on the way out, was told in the past tense about an email that was never coming — and your front desk never heard about it. The screen waits for the send now and says what really happened, including a case it could not say before: we have your email, the confirmation did not get through, so please save these details.',
      },
      {
        kind: 'fixed',
        glyph: 'chat',
        title: 'Reminders and scheduled messages can no longer go out twice',
        body:
          'Three separate places could send the same thing more than once, or jam and send nothing at all. Trial reminder emails could repeat when two background runs overlapped. A scheduled message that had just been sent could be pushed back into the queue and reach the patient a second time — and a message that had failed could be revived the same way, discarding the error your staff were about to read. And a prospect outreach sequence whose send failed sat at the front of the queue forever, holding a slot in that day’s batch and never moving. All three now claim their work before they act on it, so only one run can own a send.',
      },
      {
        kind: 'fixed',
        glyph: 'sync',
        title: 'One practice’s bad minute no longer stops everyone else’s automations',
        body:
          'The nightly jobs that send review requests and refresh the service descriptions on clinic websites worked through every practice in one long loop, and a database hiccup on any single practice ended the run for every practice queued behind it — silently, and a different set each time, depending on what order they came back in. Each practice runs on its own now, and a failure is reported rather than swallowed. The service-text job also stopped overwriting you: it read every website’s services at the start of a long run and wrote that stale copy back at the end, quietly undoing anything you had changed in Website Studio in the meantime.',
      },
      {
        kind: 'improved',
        glyph: 'bolt',
        title: 'A practice-management connection that is down stops looking healthy',
        body:
          'When the link to a practice’s scheduling system was unusable rather than merely failing — a missing key, a half-finished setup, no connection to the provider at all — the attempt gave up before it could write down that it had happened, so our own monitoring went on reporting that practice as healthy while nothing synced. A sync that quietly stops is the complaint we hear most about every system in this category, and this was the shape of it we could not see. Those attempts now register as the failures they are.',
      },
      {
        kind: 'fixed',
        glyph: 'cart',
        title: 'Orders that never really started stop sitting in your list',
        body:
          'When a shop checkout failed to get off the ground, the order it had already created was supposed to be cleaned up and was not — so a pending order nobody had actually placed stayed in your Orders list, looking like a sale waiting to be fulfilled and counting itself alongside the real ones. Those are cleaned up properly now, so what you see in Orders is what a customer actually did.',
      },
      {
        kind: 'improved',
        glyph: 'shield',
        title: 'Your intake form cannot be flooded any more',
        body:
          'The patient intake form on your clinic website was the last public form of ours with no limit on how often it could be sent, which meant someone acting in bad faith could bury your submissions list and your owners’ inboxes at no cost to themselves. It has a limit now, and the number was chosen against real life rather than copied from the other forms: a waiting room where a whole family fills in a ten-form packet on one iPad looks like a single visitor to us, and turning that family away would have been the worse failure.',
      },
      {
        kind: 'fixed',
        glyph: 'megaphone',
        title: 'A switched-off account stops getting a cheerful Monday email',
        body:
          'Every other automatic message already checks whether a practice’s account has been switched off. The Monday morning summary did not — so a practice whose trial had ended received one upbeat weekly report of everything their stopped system had supposedly been doing for them, on top of a dashboard telling them it had all stopped. It checks now, and picks up again untouched on the first Monday after someone comes back.',
      },
      {
        kind: 'fixed',
        glyph: 'form',
        title: 'A failed upload tells you why',
        body:
          'Uploading a file could fail in a way that came back completely blank — a photo that arrived incomplete, or a storage hiccup at our end — and the screen had nothing to show, so your staff saw a failure with no reason attached and no idea whether trying again would help. Every refusal on that path now comes back with something a person can read.',
      },
      {
        kind: 'improved',
        glyph: 'eye',
        title: 'Text you can actually read, on every screen we walk',
        body:
          'A readability sweep that had been running for several weeks reached the end: every page our automated browser tests visit is now held to zero accessibility findings with nothing carried over, so the next faint label fails before it ever reaches you. Cleared on the way there: a grey that was the wrong way round in both light and dark mode in a hundred and seventy-seven places, a time slot in the patient portal marked taken that was almost invisible against its own background, headings and links set in your practice’s own brand colour that vanished whenever that colour was pale, and a dozen spots where type already chosen to be quiet had been faded a second time on top.',
      },
    ],
  },
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
          'Appointment reminders were written down as sent only after they had gone, so two reminder runs overlapping — or one that got retried — could each decide nothing had been sent yet and both send. The same patient got two reminders about the same visit. A reminder is now claimed before it goes out, so only one run can take it, and a send that does not happen hands the claim back for the next run to pick up.',
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
