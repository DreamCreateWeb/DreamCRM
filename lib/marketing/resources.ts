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
 */

export interface ResourceGuide {
  slug: string
  /** The query-shaped title. */
  title: string
  /** Card + meta description. */
  description: string
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
    readMinutes: 9,
    datePublished: '2026-09-08',
  },
  {
    slug: 'dental-membership-plan-pricing',
    title: 'How to price a dental membership plan (with the math)',
    description:
      'What to include, what to charge, and the arithmetic behind an in-house dental membership plan that patients join and practices don’t lose money on.',
    readMinutes: 8,
    datePublished: '2026-09-08',
  },
  {
    slug: 'how-to-get-more-dental-patients',
    title: 'How to get more dental patients (the order that actually works)',
    description:
      'A practical, ordered playbook: the Google listing, reviews, a website that books, and reactivating the patients you already have — before you spend a dollar on ads.',
    readMinutes: 10,
    datePublished: '2026-09-08',
  },
]

export function getResourceGuide(slug: string): ResourceGuide | undefined {
  return RESOURCE_GUIDES.find((g) => g.slug === slug)
}
