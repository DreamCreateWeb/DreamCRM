import type { GuideSource } from '@/lib/marketing/guide-sources'
import { TERMS_OF_SERVICE } from '@/lib/marketing/legal'
import { buildListingKit } from '@/lib/marketing/listing-kit'
import { usd } from '@/lib/marketing/site'

/**
 * WHAT A DENTAL WEBSITE COSTS — the prices sellers publish, read from their
 * own pages.
 *
 * The website-cost guide is the one page in the library that prices something
 * we sell, beside other people who sell it. A page like that is worth exactly
 * as much as a reader's ability to check it, so it has the comparison
 * registry's discipline and one rule more:
 *
 *   - EVERY LINE IS THE SELLER'S OWN. `lines[].text` and `lines[].under` are
 *     copied from the seller's page as a visitor's browser showed it on
 *     `source.readOn`; `plans` are the plan names and the monthly prices
 *     shown beside them. `tests/marketing/website-cost-guide.test.tsx` pins
 *     every one, so changing a line means re-reading the page and changing
 *     the test on purpose.
 *
 *   - NOBODY IS HERE WHOSE PAGE SHOWED NO PRICE, and the guide never says of
 *     anybody that they publish none. That claim takes three reads (the
 *     rendered pricing page, a search of the seller's own site, its
 *     structured data — CLAUDE.md, after two false lines went live for a day
 *     on 2026-11-24). This page skips the claim instead: it lists who showed
 *     a price, says that is what the list is, and stops.
 *
 *   - THE ARITHMETIC USES ONLY NUMBERS THE LINES STATE. `threeYears` is the
 *     seller's own starting figures carried over three years; the test
 *     requires each of its numbers to appear in that seller's lines or plans.
 *     It is labelled on the page as our arithmetic on their numbers.
 *
 * WHAT WAS LEFT OUT, so the next read does not put it back by accident:
 *   - DocSites has a second page with different figures, tied to a partner
 *     offer (`/landing-pages/practiceweb/`). One seller, one page: the
 *     "Website Options & Pricing" page its own menu links to.
 *   - Great Dental Websites: its own article gives a range and no price of
 *     its own; a review marketplace lists one. A marketplace is not the
 *     seller's page and refuses to be read here, so nothing is printed.
 *   - mysocialpractice.com and smilesites.com refused the reader.
 *
 * Client-safe: plain data and pure functions.
 */

export type WayToBuy = 'builder' | 'template' | 'custom'

/** The three ways the guide sorts sellers into, in the order it shows them. */
export const WAYS_TO_BUY: Record<WayToBuy, { title: string; means: string }> = {
  builder: {
    title: 'Build it yourself on a general site builder',
    means: 'A monthly plan and a template. The writing, the photos and the upkeep are yours to do.',
  },
  template: {
    title: 'Choose a ready-made design from a dental website company',
    means: 'A setup fee, then a monthly fee for hosting and small changes.',
  },
  custom: {
    title: 'Have one built for you',
    means: 'A larger one-time price for the build. Hosting and upkeep are billed on top.',
  },
}

/** One line of a seller's page. `under` is the heading it sits beneath. */
export interface SellerLine {
  under?: string
  text: string
}

/** What the three-year arithmetic is made of. Whole dollars. */
export interface ThreeYears {
  /** Which of the seller's options the numbers are — in plain words. */
  what: string
  upFront: number
  perMonth: number
  perYear: number
}

export interface WebsiteSeller {
  id: string
  name: string
  way: WayToBuy
  source: GuideSource
  /** Plan names and the monthly price shown beside each. */
  plans?: readonly { name: string; perMonth: number }[]
  /** How those plan prices were being shown — ours, and as short as it can be. */
  plansShown?: string
  /** The label of an offer the page was showing beside some plans that day,
   *  word for word. The plan prices above are the ones before it. */
  offerShown?: string
  lines: readonly SellerLine[]
  threeYears: ThreeYears
}

const READ = '2026-11-26'

export const WEBSITE_SELLERS: readonly WebsiteSeller[] = [
  {
    id: 'squarespace',
    name: 'Squarespace',
    way: 'builder',
    source: { label: 'Squarespace’s pricing page', url: 'https://www.squarespace.com/pricing', readOn: READ },
    plans: [
      { name: 'Basic', perMonth: 19 },
      { name: 'Core', perMonth: 29 },
      { name: 'Plus', perMonth: 49 },
      { name: 'Advanced', perMonth: 99 },
    ],
    plansShown: 'with “Pay annually” selected, as the page opens',
    // The second of two sentences on one line of the page. The first states
    // the length of Squarespace's own free trial, and a typed trial length in
    // this tree is read as OURS by `tests/marketing/trial-copy.test.ts`. That
    // guard is right to be blunt, and the sentence was not needed here.
    lines: [{ text: 'Pay annually to save up to 36%.' }],
    threeYears: { what: 'Core, paid annually', upFront: 0, perMonth: 29, perYear: 0 },
  },
  {
    id: 'wix',
    name: 'Wix',
    way: 'builder',
    source: { label: 'Wix’s plans page', url: 'https://www.wix.com/plans', readOn: READ },
    plans: [
      { name: 'Light', perMonth: 17 },
      { name: 'Core', perMonth: 29 },
      { name: 'Business', perMonth: 39 },
      { name: 'Business Elite', perMonth: 159 },
    ],
    // The page was showing an offer on some plans the day it was read; the
    // prices above are the ones it named as each plan's price.
    plansShown: 'before any offer',
    offerShown: '(Save 50%)',
    lines: [{ text: 'Displayed prices are for yearly subscriptions, paid in full at the time of purchase.' }],
    threeYears: { what: 'Core, at the yearly price before any offer', upFront: 0, perMonth: 29, perYear: 0 },
  },
  {
    id: 'docsites',
    name: 'DocSites',
    way: 'template',
    source: {
      label: 'DocSites’ “Website Options & Pricing” page',
      url: 'https://www.docsites.com/web-designs/',
      readOn: READ,
    },
    lines: [
      { under: 'STANDARD', text: '$1,999 Setup (one-time fee)' },
      { under: 'PLUS', text: '$2,999 Setup (one-time fee)' },
      { under: 'PREMIER', text: '$3,999 Setup (one-time fee)' },
      { text: '$89 per month (month-to-month)' },
      { text: 'All Website Options include monthly hosting, SSL Certificate, and website updates by Client request.' },
      { text: 'Standard Monthly Service Fee: $89 per month includes Hosting and Updates by Request (up to 1 hour)' },
    ],
    threeYears: { what: 'the Standard package', upFront: 1999, perMonth: 89, perYear: 0 },
  },
  {
    id: 'infostar',
    name: 'InfoStar Productions',
    way: 'custom',
    source: {
      label: 'InfoStar Productions’ pricing page',
      url: 'https://www.dentalpatienteducationsidekick.com/pricing',
      readOn: READ,
    },
    lines: [
      {
        text: 'Dental is the one industry where we publish standard packages: $3,500–$6,500 build, hosting typically $99–$150/month, and all-inclusive packages from $500 a month with the build included.',
      },
    ],
    threeYears: { what: 'the low end of the build and of the hosting', upFront: 3500, perMonth: 99, perYear: 0 },
  },
  {
    id: 'whiteboard',
    name: 'Whiteboard Marketing',
    way: 'custom',
    source: { label: 'Whiteboard Marketing’s pricing page', url: 'https://whiteboard-mktg.com/pricing/', readOn: READ },
    lines: [
      { under: 'Websites', text: '*From $8,900' },
      { under: 'Website Hosting', text: '*From $299/yr' },
      { under: 'Website Management', text: '*From $150/mo' },
    ],
    threeYears: { what: 'a website and its hosting, before any management plan', upFront: 8900, perMonth: 0, perYear: 299 },
  },
]

/**
 * THE TWO REFERENCE FIGURES — neither is a price list, and they are not the
 * same kind of source.
 *
 * The ADA's is practice-management guidance from the profession's own
 * association. Its page states no date, and the guide says so rather than
 * implying the figures are current.
 *
 * The trade magazine's is an article written by the founder of a firm that
 * builds dental websites. That does not make it wrong; it makes it a seller's
 * estimate, and the guide says whose it is in the magazine's own description
 * of the firm (`firm`), not in ours.
 */
export const WEBSITE_COST_REFERENCES = {
  ada: {
    source: {
      label: 'the American Dental Association, “Website Development: Costs”',
      url: 'https://www.ada.org/resources/practice/practice-management/24_websitedevelopment_costs',
      readOn: READ,
    } satisfies GuideSource,
    says: {
      range:
        'Generally speaking, dental practices interested in basic but customized websites can expect to invest about $6,000; high-end websites with additional features can cost as much as $25,000.',
      marketer:
        'A basic estimate for having a professional marketer use their expertise and staff to create your website can cost $10,000 to $12,000.',
      budget: 'It’s a good rule of thumb to plan on spending 5-10% of your total marketing budget to update your website.',
      agreement:
        'A written agreement can protect your ownership rights to the domain name of your website as well as all the copyrights and trademarks in the information, graphics, logos, etc.',
    },
  },
  tradePress: {
    source: {
      label: 'Dental Economics, “The costs of dental website development and design in 2024”',
      url: 'https://www.dentaleconomics.com/practice/marketing/article/14298123/the-costs-of-dental-website-development-and-design-in-2024',
      readOn: READ,
      pageSays: 'August 24, 2023',
    } satisfies GuideSource,
    author: 'Keith C. Humes',
    says: {
      range: 'The cost of creating a unique dental website runs from $3,500 to $30,000, and sometimes even more than that.',
      average:
        'On average, most premier dental practices should budget around $14,000 for a new or redesigned custom website.',
      firm: 'Rosemont Media specializes in dental marketing, dental SEO, dental website design, dental social media marketing, and high-end custom strategies for esthetic practices.',
    },
  },
} as const

/** Setup, plus thirty-six months, plus three years of anything billed yearly. */
export function threeYearTotal(t: ThreeYears): number {
  return t.upFront + 36 * t.perMonth + 3 * t.perYear
}

/** The sum written out, so a reader can check it: "$1,999 + 36 × $89 = $5,203". */
export function threeYearSum(t: ThreeYears): string {
  const parts = [
    t.upFront > 0 ? usd(t.upFront) : null,
    t.perMonth > 0 ? `36 × ${usd(t.perMonth)}` : null,
    t.perYear > 0 ? `3 × ${usd(t.perYear)}` : null,
  ].filter(Boolean)
  return `${parts.join(' + ')} = ${usd(threeYearTotal(t))}`
}

/** The most recent day any line above was read. */
export function latestWebsiteCostRead(): string {
  return [...WEBSITE_SELLERS.map((s) => s.source.readOn), ...Object.values(WEBSITE_COST_REFERENCES).map((r) => r.source.readOn)]
    .sort()
    .at(-1)!
}

/**
 * OUR OWN ANSWERS, READ AND NOT TYPED.
 *
 * The guide asks every seller the same questions, so it has to answer them
 * for the product that publishes it — and a page that typed those answers
 * would be one more place for the price, the trial or the Terms to drift.
 * The price sentence is the listing kit's (`listing-kit.ts`, resolved from
 * the plan config); what happens when a subscription ends, who the content
 * belongs to and how cancelling works are the Terms' own paragraphs
 * (`legal.ts`). If the Terms change, this page changes with them, and so does
 * its search-notice key.
 */
export function ourWebsiteAnswers() {
  const terms = (id: string, i: number) => {
    const text = TERMS_OF_SERVICE.sections.find((s) => s.id === id)?.paragraphs?.[i]
    if (!text) throw new Error(`website-costs: the Terms have no paragraph ${i} under “${id}”`)
    return text
  }
  const pricing = buildListingKit().fields.find((f) => f.id === 'pricing')?.text
  if (!pricing) throw new Error('website-costs: the listing kit has no pricing field')
  return {
    pricing,
    whenItEnds: terms('when-it-ends', 0),
    yourContent: terms('your-content', 0),
    cancelling: terms('billing', 1),
  }
}
