import type { ToneTileGlyph } from '@/lib/marketing/tone-tiles'

/**
 * The practice-growth resource library (marketing-engine slice 4b, Part 5
 * item 3): deep, code-owned guides aimed at the long-tail queries small
 * vendor blogs provably win — each carrying ORIGINAL material (the scripts
 * and numbers our own product actually uses), which is what survives
 * helpful-content updates. Registry is the single source for the hub,
 * the sitemap, the footer's Guides column and each page's Article JSON-LD;
 * the page bodies stay bespoke TSX under app/(marketing)/resources/.
 *
 * Content laws: hand-written, hedged where third-party, no invented
 * statistics, and every template shown is real product copy or derived
 * from it — never scaled-thin filler.
 *
 * ── TWO FIELDS ARRIVED WITH DAYLIGHT DREAM (DREAMCRM-79, move 6 page 5) ──
 *
 * `glyph` IS REQUIRED, and that is the same call `ourStrengths` made on move 6
 * page 2: a new guide cannot compile without somebody deciding what it is
 * ABOUT. `BRAND.md` Part 3's first tone rule is that a subject owns its tone
 * and a call site never picks one, so the subject belongs here, beside the
 * title, rather than being chosen by whichever page happens to render a tile.
 *
 * `contains` IS THE HUB'S NEW IDEA and it is usefulness rather than ornament:
 * a library index whose rows say only "9-minute read" makes the reader open
 * three tabs to find out which guide has the thing they came for. These name
 * the actual artifacts on the page below — the templates, the worked example,
 * the cadence.
 *
 * **They carry no numbers, deliberately.** "Two text templates" is a count
 * written in prose about a countable fact in the tree, and this repo has
 * watched that shape go stale silently twice (`BRAND.md` Part 8 move 3 — the
 * check-mark census moved from eleven to nine while a sentence said ten).
 * A noun phrase cannot go stale that way. If one of these ever needs a
 * number, compute it from the page rather than typing it here.
 */

/**
 * WHAT EACH GUIDE IS CALLED IN THE FOOTER — and why this is not a field on
 * the guide.
 *
 * The footer's Guides column is derived from the registry below, so a new
 * guide cannot be missing from it (`tests/marketing/footer-guides.test.tsx`).
 * The obvious home for the label is a `shortTitle` on the guide's entry, and
 * that was the first draft. It would have re-announced nine unchanged pages
 * to the search engines: a guide's ENTRY is what its page's search-notice key
 * is computed from (`lib/marketing/public-pages.ts`), so a field added to the
 * entry moves the key — and that key may move only when the page's own
 * content does. A footer label is chrome on every page of the site; renaming
 * one changes no page's content.
 *
 * So the labels live here, keyed by slug, and `GuideSlug` is derived from the
 * keys: a guide whose slug is not in this map does not compile. That is the
 * "required" a field would have given — a guide nobody has named in four
 * words has not been thought about yet.
 *
 * Plain names, 32 characters at most. Measured on 2026-11-26: a footer column
 * is 189px at full width and 163px at 1024, where a label that long takes two
 * lines. They are also the words every page of the site links the guide
 * with, so each names the guide the way somebody would search for it.
 */
export const GUIDE_SHORT_TITLES = {
  'dental-recall-scripts': 'Dental recall scripts',
  'dental-appointment-reminder-templates': 'Appointment reminder templates',
  'dental-cancellation-no-show-policy': 'Cancellation & no-show policy',
  'dental-review-request-templates': 'Review request templates',
  'dental-new-patient-welcome-letter': 'New patient welcome letter',
  'dental-past-due-balance-letters': 'Past-due balance letters',
  'dental-membership-plan-pricing': 'Membership plan pricing',
  'how-to-get-more-dental-patients': 'Get more dental patients',
  'dental-software-pricing': 'Dental software pricing',
} as const satisfies Record<string, string>

export type GuideSlug = keyof typeof GUIDE_SHORT_TITLES

export interface ResourceGuide {
  /** A key of `GUIDE_SHORT_TITLES`: a guide cannot exist without its name. */
  slug: GuideSlug
  /** The query-shaped title. */
  title: string
  /** Card + meta description. */
  description: string
  /**
   * What this guide is ABOUT — `BRAND.md` Part 3's tone vocabulary. Required:
   * the tone comes with the subject, and a guide with no subject has not been
   * thought about yet.
   */
  glyph: ToneTileGlyph
  /**
   * The artifacts actually on the page, for the hub's index. Noun phrases, no
   * counts — see the note above.
   */
  contains: string[]
  /** Shown on cards; honest reading estimate. */
  readMinutes: number
  /** ISO date the content was written/last substantively revised. */
  datePublished: string
}

export const RESOURCE_GUIDES: ResourceGuide[] = [
  {
    slug: 'dental-recall-scripts',
    title: 'Dental recall scripts that get patients back (email, text, letter & phone)',
    description:
      'Copy-paste recall scripts for overdue dental patients — the email, text, mailed-letter and phone versions, with the timing and the voice rules behind them.',
    // `chat` — brand. The guide is about the MESSAGES a practice sends, which
    // is what the product is, not what it earns.
    glyph: 'chat',
    contains: [
      'The recall email, subject line and body',
      'Text templates carrying the STOP line',
      'The phone and voicemail scripts',
      'The mailed letter and the postcard',
      'The cadence, week by week',
    ],
    readMinutes: 9,
    // Revised 2026-11-25: the letter and the postcard, added because Search
    // Console was showing the guide for "dental patient recall letter
    // template" and it had none.
    datePublished: '2026-11-25',
  },
  {
    slug: 'dental-appointment-reminder-templates',
    title: 'Dental appointment reminder templates (email, text & phone scripts)',
    description:
      'Copy-ready dental appointment reminder and confirmation templates: the emails, the texts and the phone scripts, with the timing and the rule on reminder texts.',
    // `clock` — brand. The subject is WHEN a patient hears from the practice
    // and what the message asks of them; the visit itself is `calendar`'s.
    glyph: 'clock',
    contains: [
      'The confirmation email, sent when they book',
      'The reminder email, and the quieter one once they confirm',
      'Text templates held to a single message',
      'The confirmation call and its voicemail',
      'The rule on reminder texts, in its own words',
    ],
    readMinutes: 6,
    datePublished: '2026-11-26',
  },
  {
    slug: 'dental-cancellation-no-show-policy',
    title: 'Dental cancellation & no-show policy template (with the letters and scripts)',
    description:
      'A copy-ready dental cancellation and no-show policy, the phone scripts and missed-appointment letters that go with it, and the patients you may not charge.',
    // `calendar` — brand. The subject is the appointment and what happens
    // when it is not kept; the fee is one line of it and not the point.
    glyph: 'calendar',
    contains: [
      'The policy patients sign, with the blanks to fill',
      'The late-cancellation phone script and the voicemail',
      'The missed-appointment letters, first to third',
      'Who you may not charge, in each program’s own words',
      'The codes that track a missed visit',
    ],
    readMinutes: 8,
    datePublished: '2026-11-25',
  },
  {
    slug: 'dental-review-request-templates',
    title: 'Dental review request templates (email, text, front desk & the counter card)',
    description:
      'Copy-ready dental review request templates: the email, the text, the front-desk ask and the counter card, with what Google and the FTC allow in their own words.',
    // `star` — growth. Reputation is something a practice earns, and this
    // guide is the asking, not the having.
    glyph: 'star',
    contains: [
      'The review request email, subject line and body',
      'A text template that fits a single message',
      'What to say at the front desk',
      'The wording for a card on the counter',
      'Replies to a critical review and a kind one',
      'What Google and the FTC allow, in their own words',
    ],
    readMinutes: 5,
    datePublished: '2026-11-26',
  },
  {
    slug: 'dental-new-patient-welcome-letter',
    title: 'Dental new patient welcome letter & email templates (with what to bring)',
    description:
      'Copy-ready new patient welcome letter and email templates for a dental office, with the forms email, the what-to-bring list and the script for the first call.',
    // `door` — brand. The first visit is the front door, and this guide is
    // everything a new patient hears before they walk through it.
    glyph: 'door',
    contains: [
      'The welcome email, sent when the first visit is booked',
      'The mailed welcome letter, on one page',
      'The forms email and the portal invitation',
      'What to bring, as a list to paste',
      'The first phone call, start to finish',
      'When the privacy notice is due, in the rule’s words',
    ],
    readMinutes: 5,
    datePublished: '2026-11-26',
  },
  {
    slug: 'dental-past-due-balance-letters',
    title: 'Dental past-due balance letters & scripts (first reminder to final notice)',
    description:
      'Copy-ready past-due balance letters for a dental office: the balance email, three letters from first reminder to final notice, the phone script and a plan.',
    // `money` — growth. The subject is what a practice is owed, and how to
    // ask for it without losing the patient.
    glyph: 'money',
    contains: [
      'The balance email, with a link to pay',
      'The first reminder, the second notice and the final notice',
      'The phone script and its voicemail',
      'The payment-plan letter',
      'Why there is no text template',
      'The installment rule, in its own words',
    ],
    readMinutes: 5,
    datePublished: '2026-11-26',
  },
  {
    slug: 'dental-membership-plan-pricing',
    title: 'How to price a dental membership plan (with the math)',
    description:
      'What to include, what to charge, and the arithmetic behind an in-house dental membership plan that patients join and practices don’t lose money on.',
    // `money` — growth. Pricing a plan is squarely what a practice earns.
    glyph: 'money',
    contains: [
      'The standard adult plan, line by line',
      'A worked pricing example with the floor and the band',
      'The front-desk script that sells it',
      'The state-regulation caveat, unhedged',
    ],
    readMinutes: 8,
    // Revised 2026-11-26: every figure sourced, softened or cut
    // (`tests/marketing/sourced-guides.test.tsx`).
    datePublished: '2026-11-26',
  },
  {
    slug: 'how-to-get-more-dental-patients',
    title: 'How to get more dental patients (the order that actually works)',
    description:
      'A practical, ordered playbook: the Google listing, reviews, a website that books, and reactivating the patients you already have — before you spend a dollar on ads.',
    // `chart` — growth. New patients are what a practice earns, and this
    // guide's spine is ordered, measurable steps rather than a campaign.
    //
    // `megaphone` (auto) was the prettier answer — it would have given the
    // library one tile from each of the three tone families — and it is the
    // exact failure `BRAND.md` Part 3's first rule names: picking a subject
    // to get a colour. The guide argues ads come LAST and the first three
    // steps cost time rather than money, so it is not about campaigns.
    glyph: 'chart',
    contains: [
      'The Google listing checks, in order',
      'The review loop, without review gating',
      'What a website that books actually needs',
      'The one-page version at the end',
    ],
    readMinutes: 10,
    // Revised 2026-11-26: every figure sourced, softened or cut
    // (`tests/marketing/sourced-guides.test.tsx`).
    datePublished: '2026-11-26',
  },
  {
    slug: 'dental-software-pricing',
    title: 'Dental front-office software pricing: what each vendor publishes',
    description:
      'What dental front-office software vendors say about price and contract terms on their own websites — each quoted with the page it came from and the day it was read, and which of them publish no price at all.',
    // `tag` — the price. The subject of this guide is the number, and who
    // will and will not write theirs down.
    glyph: 'tag',
    contains: [
      'Each vendor’s price, in its own words',
      'Which of them publish no price at all',
      'The contract answer beside every price',
      'The questions to ask before a demo',
    ],
    readMinutes: 6,
    // NOT a writing date: the day the newest line on the page was read
    // against its vendor's site. The page is built from the comparison
    // registry, so this must move when that does —
    // `tests/marketing/pricing-guide.test.tsx` fails until it equals the
    // registry's latest `pricingChecked.on`.
    datePublished: '2026-11-26',
  },
]

export function getResourceGuide(slug: string): ResourceGuide | undefined {
  return RESOURCE_GUIDES.find((g) => g.slug === slug)
}
