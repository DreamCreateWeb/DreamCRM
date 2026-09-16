import type { ToneTileGlyph } from '@/lib/marketing/tone-tiles'

/**
 * The practice-growth resource library (marketing-engine slice 4b, Part 5
 * item 3): deep, code-owned guides aimed at the long-tail queries small
 * vendor blogs provably win — each carrying ORIGINAL material (the scripts
 * and numbers our own product actually uses), which is what survives
 * helpful-content updates. Registry is the single source for the hub,
 * the sitemap, and each page's Article JSON-LD; the page bodies stay
 * bespoke TSX under app/(marketing)/resources/.
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

export interface ResourceGuide {
  slug: string
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
    title: 'Dental recall scripts that get patients back (email, text & phone)',
    description:
      'Copy-paste recall scripts for overdue dental patients — the email, text, and phone-call versions, with the timing cadence and the voice rules that make them work.',
    // `chat` — brand. The guide is about the MESSAGES a practice sends, which
    // is what the product is, not what it earns.
    glyph: 'chat',
    contains: [
      'The recall email, subject line and body',
      'Text templates carrying the STOP line',
      'The phone and voicemail scripts',
      'The cadence, week by week',
    ],
    readMinutes: 9,
    datePublished: '2026-09-08',
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
    datePublished: '2026-09-08',
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
    datePublished: '2026-09-08',
  },
]

export function getResourceGuide(slug: string): ResourceGuide | undefined {
  return RESOURCE_GUIDES.find((g) => g.slug === slug)
}
