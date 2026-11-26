// Vendor comparison content for /compare/[vendor]. Written to a strict
// honesty bar: every claim about a competitor is either from their own
// public materials, their documented pricing/tiering, or independent
// review aggregations — hedged with "reported" where it's third-party.
// Each page leads with what the competitor genuinely does well (we sell
// against five strong incumbents; pretending otherwise reads as spin),
// carries a verify-with-vendor disclaimer, and never invents numbers.

export type MatrixValue = 'yes' | 'no' | 'partial'

export interface MatrixRow {
  feature: string
  /** Us. */
  dreamcrm: MatrixValue
  dreamcrmNote?: string
  /** Them. */
  vendor: MatrixValue
  vendorNote?: string
}

import type { ToneTileGlyph } from './tone-tiles'
import { usd } from './site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { INCLUDED_MONTHLY_INSURANCE_CHECKS } from '@/lib/insurance-eligibility'
import { TRIAL } from '@/lib/marketing/site'

/**
 * OUR OWN PRICE, RESOLVED — never typed (DREAMCRM-38's rule, arriving here on
 * DREAMCRM-102).
 *
 * This registry had TEN copies of the founding rate: one in the shared matrix
 * row every vendor page renders, seven in per-vendor "our strengths" cards,
 * and two in the FAQ that `buildComparisonFaq` also emits as `FAQPage`
 * JSON-LD. `/compare` was deliberately left OFF the old guard's list of ten
 * routes because its REPORTED-PRICING strings carry market bands whose ends
 * collide with our integers — and that file-shaped hole took every one of
 * these ten with it. The bands are discriminated structurally now (two
 * numbers joined by a dash is a band; see
 * `tests/marketing/plan-price-literals.ts`), so the honest competitor figures
 * stay exactly as written and OUR number resolves.
 *
 * `getQuotedPlan()` is pure config — no database, no Stripe call — so reading
 * it at module scope costs nothing.
 */
const RATE_MONTHLY = usd(getQuotedPlan().price)


/**
 * WHERE A PRICING FACT WAS READ. `readOn` is the day WE read the page;
 * `pageSays` is the page's own date for itself, verbatim, when it gives one —
 * two different facts, and a reader deciding how far to trust a line wants
 * both.
 */
export interface PricingSourceRef {
  /** How the page is named in a sentence: "Tebra’s pricing policy". */
  label: string
  url: string
  /** ISO day. */
  readOn: string
  pageSays?: string
}

export interface PricingDetailLine {
  label: string
  value: string
}

/**
 * One heading's worth of pricing facts, ALL FROM ONE PAGE — so every line
 * under a heading shares one citation and a reader can check the whole group
 * with a single click. A fact from a second page goes in a second group.
 */
export interface PricingDetailGroup {
  /** Stable key; also the anchor. */
  id: string
  title: string
  lines: PricingDetailLine[]
  source: PricingSourceRef
  /**
   * A buyer's question this group answers and the answer in a sentence or
   * two — both or neither. `buildComparisonFaq` emits them, so the answer is
   * on the page and in its FAQPage twin. The answer is a second wording of
   * the lines, never a new fact: `tests/marketing/pricing-detail.test.tsx`
   * holds that it states no figure the detail's lines do not.
   */
  question?: string
  answer?: string
}

/** What a named third party reports — never merged with another's, never ours. */
export interface PricingReport {
  who: string
  says: string
  /** The reporter's own qualification of its figure, or what it measured. */
  caveat: string
  source: PricingSourceRef
}

/**
 * THE PRICING, LINE BY LINE — for a comparison page that a "{vendor} pricing"
 * search lands on.
 *
 * Added 2026-11-25. Search Console showed the Tebra (PatientPop) page for
 * "patientpop pricing" more than for anything else (240 showings in three
 * months) and the owner found it near the bottom of the second results page,
 * under Tebra itself and the review directories. What those results do not
 * have is the vendor's own fee schedule and contract terms read out plainly —
 * they have a star rating and a "starting at". So that is what this is: the
 * vendor's own pages, a line per fact, each group under the page it came
 * from, with the day it was read.
 *
 * THE RULES ARE THE REGISTRY'S, TIGHTER. Every line is the vendor's own
 * statement from the page its group cites. A third party's figure lives in
 * `reported`, under that party's name, with that party's own caveat. Sources
 * that refused to be read are NAMED in `notRead`, so their absence is not
 * taken for agreement. And `versusUs` must say where the vendor's price is
 * LOWER than ours when it is.
 */
export interface PricingDetail {
  intro: string
  /**
   * A STARTING PRICE THE VENDOR STATES SOMEWHERE OTHER THAN ITS PRICING PAGE.
   * Adit's pricing page shows none; its FAQ page says its technology bundle
   * "starts at $99 per month, per location". Such an entry still opens "No
   * price published" (the pricing page is where a buyer is sent), but a
   * figure of the vendor's own exists, so `versusUs` owes the reader the
   * comparison: `tests/marketing/pricing-detail.test.tsx` requires "lower
   * than ours" when it is, requires the named group to print the figure, and
   * fails an entry whose lines state a starting price it does not declare.
   */
  startsAt?: { perMonth: number; groupId: string }
  groups: PricingDetailGroup[]
  reported: PricingReport[]
  notRead: string[]
  versusUs: string
}

export interface VendorComparison {
  slug: string
  name: string
  /**
   * THE NAME BUYERS STILL TYPE, when it is not how `name` begins. Tebra's
   * entry is named "Tebra (PatientPop)" because that is what the product is
   * today — and of the searches that showed its page, five in six typed
   * "patientpop" and never "tebra" (Search Console, read 2026-11-25). So the
   * title, the pricing heading and the pricing questions lead with the old
   * name and say the new one beside it. Absent for everyone else.
   */
  searchedAs?: { name: string; now: string }
  /** One-line category description of the vendor. */
  category: string
  /**
   * WHAT THE VENDOR IS, in a sentence or two a reader could lift out and trust
   * on its own — the answer to "what is {name}?", which is the first question
   * `buildComparisonFaq` emits.
   *
   * It exists because of what the pages were SHOWN for. On 2026-11-25 Search
   * Console listed the Tebra (PatientPop) page for "what is patientpop" under
   * two spellings, 150 showings between them, and nothing on the page said
   * what PatientPop is without also arguing with it: `summary` opens every
   * entry by placing the vendor against us ("the closest thing to a direct
   * overlap", "pitches the same consolidation story we do"), which is the
   * right way to open a comparison and the wrong way to answer a definition.
   *
   * THE RULE: it may state only what this entry already states elsewhere —
   * `summary`, `theirStrengths`, the matrix. It is a second wording of facts
   * that were read from the vendor’s own site, never a place for a new one.
   * And it is about THEM: no price (the dated `reportedPricing` line carries
   * that, with its source), nothing about us, no superlative. Required, so a
   * ninth vendor cannot compile without one; `tests/marketing/seo.test.ts`
   * holds the rest.
   */
  whatItIs: string
  /** Reported pricing band with sourcing hedge. */
  reportedPricing: string
  /**
   * WHEN the pricing line was last read against the vendor's OWN page, and
   * which page — present only on an entry somebody actually re-read.
   *
   * It exists because the Weave entry sat here saying "reported ~$249–$449,
   * annual agreements" while Weave's own site published a $199 base price and
   * a "no long-term contracts" answer (found on the 2026-11-23 marketing
   * audit). HOW LONG the two had disagreed nobody could say — which is the
   * point: nothing in the tree recorded when the line was last read, so
   * nothing prompted anyone to read it again. A comparison page is where our
   * paid traffic lands and what an AI assistant quotes back, so a stale
   * competitor fact is both a conversion problem and an honesty one. A date on
   * an UNCHECKED line would be that same problem wearing a timestamp, which is
   * why this is optional rather than defaulted: no check, no date, and the
   * page falls back to the registry-wide disclaimer.
   *
   * `on` is an ISO day. It renders under the price panel with a link to
   * `url`, and it is the page's `lastmod` in the sitemap.
   */
  pricingChecked?: { on: string; source: string; url: string }
  summary: string
  /** What they genuinely do better — 3 honest bullets. */
  theirStrengths: Array<{ title: string; body: string }>
  /** Where we win — concrete, verifiable in our product.
   *
   *  `glyph` is REQUIRED on purpose (`BRAND.md` Part 3, DREAMCRM-71).
   *  These titles render as tone tiles, and a tile only says something
   *  because somebody chose it for that line — an optional field with a
   *  generic fallback would quietly re-grow the identical mark the owner
   *  vetoed, one new vendor at a time. TypeScript is the guard: a ninth
   *  comparison cannot compile without naming what each win is about. */
  ourStrengths: Array<{ glyph: ToneTileGlyph; title: string; body: string }>
  matrix: MatrixRow[]
  bottomLine: string
  /** Present only on an entry whose pricing somebody read out in full. */
  pricingDetail?: PricingDetail
}

const INSURANCE_UNVERIFIED: [MatrixValue, string] = ['partial', 'Not verified here: ask them what is included']

/** Rows shared by every comparison — what WE are; per-vendor values vary. */
function baseMatrix(vendor: {
  website: [MatrixValue, string?]
  booking: [MatrixValue, string?]
  portal: [MatrixValue, string?]
  inbox: [MatrixValue, string?]
  reviews: [MatrixValue, string?]
  recall: [MatrixValue, string?]
  social: [MatrixValue, string?]
  shop: [MatrixValue, string?]
  careers: [MatrixValue, string?]
  pms: [MatrixValue, string?]
  /** Their eligibility checks. Omitted = not verified (shown as a hedge, never a claim). */
  insurance?: [MatrixValue, string?]
  phones: [MatrixValue, string?]
  sms: [MatrixValue, string?]
  contract: [MatrixValue, string?]
}): MatrixRow[] {
  return [
    { feature: 'Practice website included, edit-in-place editor', dreamcrm: 'yes', dreamcrmNote: 'Click any section of your live site to change it', vendor: vendor.website[0], vendorNote: vendor.website[1] },
    { feature: 'Online booking from live availability', dreamcrm: 'yes', dreamcrmNote: 'Visit-type rules prevent wrong-length bookings', vendor: vendor.booking[0], vendorNote: vendor.booking[1] },
    { feature: 'Patient portal in the clinic’s own branding', dreamcrm: 'yes', dreamcrmNote: 'Per-feature toggles + preview-as-patient', vendor: vendor.portal[0], vendorNote: vendor.portal[1] },
    { feature: 'Unified patient inbox (portal + email threads)', dreamcrm: 'yes', vendor: vendor.inbox[0], vendorNote: vendor.inbox[1] },
    { feature: 'Review collection & website testimonials', dreamcrm: 'yes', dreamcrmNote: 'Patient-written reviews feed your site', vendor: vendor.reviews[0], vendorNote: vendor.reviews[1] },
    { feature: 'Recall & reactivation campaigns', dreamcrm: 'yes', dreamcrmNote: 'Email today; SMS on the roadmap', vendor: vendor.recall[0], vendorNote: vendor.recall[1] },
    { feature: 'Google Business sync + social posting', dreamcrm: 'yes', dreamcrmNote: 'Sync + reply to Google reviews; post to Instagram/Facebook/TikTok', vendor: vendor.social[0], vendorNote: vendor.social[1] },
    { feature: 'Online store + membership plans', dreamcrm: 'yes', dreamcrmNote: 'Stripe payouts to the clinic’s own bank', vendor: vendor.shop[0], vendorNote: vendor.shop[1] },
    { feature: 'Careers page + applicant tracking', dreamcrm: 'yes', vendor: vendor.careers[0], vendorNote: vendor.careers[1] },
    { feature: 'PMS sync', dreamcrm: 'yes', dreamcrmNote: 'Two-way via the NexHealth bridge — Dentrix, Eaglesoft, Open Dental + more', vendor: vendor.pms[0], vendorNote: vendor.pms[1] },
    { feature: 'Insurance eligibility checks', dreamcrm: 'yes', dreamcrmNote: `Through Stedi; ${INCLUDED_MONTHLY_INSURANCE_CHECKS} checks a month included`, vendor: (vendor.insurance ?? INSURANCE_UNVERIFIED)[0], vendorNote: (vendor.insurance ?? INSURANCE_UNVERIFIED)[1] },
    { feature: 'VoIP phones', dreamcrm: 'no', dreamcrmNote: 'Keep your existing phone system', vendor: vendor.phones[0], vendorNote: vendor.phones[1] },
    { feature: 'Two-way SMS texting', dreamcrm: 'no', dreamcrmNote: 'On the roadmap — not available yet', vendor: vendor.sms[0], vendorNote: vendor.sms[1] },
    { feature: 'Month-to-month, no contract', dreamcrm: 'yes', dreamcrmNote: `${RATE_MONTHLY}/mo flat`, vendor: vendor.contract[0], vendorNote: vendor.contract[1] },
  ]
}

export const COMPARISONS: VendorComparison[] = [
  {
    slug: 'weave',
    name: 'Weave',
    category: 'Phones-first patient communication platform',
    whatItIs:
      'Weave is a patient communication platform built around the phone: VoIP calling that shows the caller’s details when the phone rings, two-way texting with an automatic text after a missed call, and payments by card terminal or by text.',
    reportedPricing:
      'Published at $199/mo for the base plan (calls, two-way texting, text-to-pay); online scheduling, digital forms, reminders and recall are a $149/mo bundle on top, and reviews plus email marketing a second $149/mo bundle, while its Pro, Elite and Ultimate tiers stay quote-only',
    pricingChecked: { on: '2026-11-26', source: 'Weave’s own plans and pricing pages', url: 'https://www.getweave.com/plans/' },
    summary:
      'Weave is the category leader in dental phone systems — VoIP with caller-context screen pops, texting, and payments. It is genuinely excellent at the phone, and it publishes a starting price and says it requires no long-term contract. But it has no practice website and no patient portal, its online scheduling, digital forms and recall are a paid bundle on top of the base plan, and it offers no free trial of the full platform. DreamCRM starts where the phone call ends: the website that wins the patient, the portal they come back to, and one inbox for everything they send you.',
    theirStrengths: [
      { title: 'The phone experience', body: 'VoIP with patient context on screen when the phone rings is Weave’s signature, and nothing in DreamCRM replaces your phone system.' },
      { title: 'Two-way texting today', body: 'Mature SMS with missed-call auto-text. Our SMS channel is still on the roadmap — if texting is your #1 need today, Weave is ahead.' },
      { title: 'Payment terminals', body: 'Card-present terminals and text-to-pay tied into the comms stack.' },
    ],
    ourStrengths: [
      { glyph: 'globe', title: 'The website is included', body: 'Weave assumes you already have a website vendor. DreamCRM ships one — with an edit-in-place studio, SEO plumbing, and AI copy help — replacing that retainer entirely.' },
      { glyph: 'people', title: 'A real patient portal', body: 'Confirm, self-reschedule, forms, balances, online payment — in your branding, with per-feature toggles. Weave has no patient portal.' },
      { glyph: 'layers', title: 'Everything in the base price', body: `Weave’s published plans put online scheduling, digital forms and recall in a $149/mo bundle on top of the $199 base, and reviews plus email marketing in a second $149/mo bundle — $497/mo for the base and both. In DreamCRM, booking, forms, recall and reviews are all in the one ${RATE_MONTHLY}/mo plan.` },
      { glyph: 'cart', title: 'Shop & memberships', body: 'Whitening kits and in-house membership plans sold from your own site — no equivalent in Weave.' },
    ],
    matrix: baseMatrix({
      website: ['no', 'Assumes an existing site'],
      booking: ['partial', 'In the $149/mo Coordinate bundle, on top of the base plan'],
      portal: ['no'],
      inbox: ['partial', 'Calls + SMS unified; no portal/email patient threads'],
      reviews: ['yes', 'In the $149/mo Attract bundle'],
      recall: ['yes', 'In the $149/mo Coordinate bundle'],
      social: ['partial', 'Reviews + Google tools; limited social'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes', 'Broad PMS coverage via its sync app'],
      phones: ['yes', 'Their core product'],
      sms: ['yes'],
      insurance: ['yes', 'Listed for dental on its pricing page; which plans include it is not shown'],
      contract: ['yes', 'No long-term contract required, per its plans page; year-long terms are discounted'],
    }),
    bottomLine:
      'Keep your phones — Weave’s or anyone’s. If what you’re missing is the patient-facing layer (website, booking, portal, reviews, shop) at a flat monthly price, that is exactly the layer DreamCRM is.',
    pricingDetail: {
      intro:
        'Weave publishes a starting price and sells the rest in two ways: a build-your-own plan with two priced bundles, and three named tiers with no price on the page. Its fee rules and contract terms are in its terms of service. This is what each of those pages said on the day it was read.',
      groups: [
        {
          id: 'published-prices',
          title: 'The prices Weave publishes',
          source: { label: 'Weave’s plans page', url: 'https://www.getweave.com/plans/', readOn: '2026-11-26' },
          question: 'How much does Weave cost per month?',
          answer:
            'Weave’s plans page starts the base plan at $199 a month and prices two bundles at $149 a month each: one for online scheduling, digital forms, reminders and recall, one for reviews, email marketing and bulk texting. The page shows the price of your own selection after you enter an email address.',
          lines: [
            { label: 'Base plan', value: 'Starting at $199 a month' },
            { label: 'What the base plan lists', value: 'Call Pop, two-way texting, Missed Call Text, Text to Pay, the mobile app, Team Chat, call analytics, fax and its integration, chosen with two phones or without' },
            { label: 'Coordinate bundle', value: '$149 a month: online scheduling, digital forms, reminders and follow-ups, appointment confirmations, recall and reactivation texts and calls' },
            { label: 'Attract bundle', value: '$149 a month: reviews, Text Connect, email marketing (10,000 emails) and bulk texting (5,000 texts)' },
            { label: 'Other add-ons', value: '“individual solutions at varying prices”; the page lists none of those prices' },
            { label: 'AI Receptionist', value: 'Marked “Early access”, with no price' },
            { label: 'The price of your own selection', value: 'Shown after you enter an email address' },
            { label: 'A free trial', value: '“Weave does not offer a free trial for our full platform”' },
          ],
        },
        {
          id: 'the-tiers',
          title: 'The three tiers with no price',
          source: { label: 'Weave’s pricing page', url: 'https://www.getweave.com/pricing/', readOn: '2026-11-26' },
          lines: [
            { label: 'Pro, Elite and Ultimate', value: 'No price on the page; the buttons read “Get Pricing” and “Get Started”' },
            { label: 'The page’s own headline', value: '“starting from $199 per month”' },
            { label: 'Bulk texting, by tier', value: '1,500 messages a month on Pro, 3,000 on Elite, 15,000 on Ultimate' },
            { label: 'Phones on Ultimate', value: 'Up to 15' },
            { label: 'Included with every plan', value: 'Customer support and onboarding' },
          ],
        },
        {
          id: 'fees-and-increases',
          title: 'Fees and price changes',
          source: { label: 'Weave’s terms of service', url: 'https://www.getweave.com/legal/terms/', readOn: '2026-11-26', pageSays: 'Last updated: October 2, 2026' },
          question: 'Can Weave raise its price?',
          answer:
            'Weave’s terms say subscription fees stay fixed during the initial term unless you receive promotional discounts, exceed subscription limits, upgrade or add products. A separate clause says fees may increase by up to 10% in any twelve-month period without notice, with advance notice given only for an increase above 10%.',
          lines: [
            { label: 'During the initial term', value: 'Fees stay fixed “unless you receive promotional discounts, exceed subscription limits, upgrade products, or subscribe to additional products”' },
            { label: 'Price increases', value: 'Up to 10% in any twelve-month period “without notice”; advance notice only for an increase above 10%' },
            { label: 'New fees', value: 'Weave reserves the right “to institute new fees or charges”' },
            { label: 'When billing starts', value: 'When the software is enabled and, if you took phones, when they are installed; it “is not dependent on phone number(s) being ported into Weave”' },
            { label: 'Call and text costs', value: 'Yours: “All costs for phone usage”, domestic or international' },
            { label: 'Taxes and surcharges', value: 'Yours, including Federal Universal Service Fund contributions and a cost recovery fee' },
            { label: 'Refunds', value: '“There are no refunds for Service cancellations”' },
          ],
        },
        {
          id: 'the-contract',
          title: 'The contract',
          source: { label: 'Weave’s terms of service', url: 'https://www.getweave.com/legal/terms/', readOn: '2026-11-26', pageSays: 'Last updated: October 2, 2026' },
          question: 'Does Weave require a contract?',
          answer:
            'Weave’s plans page says it does not require a long-term contract and offers discounts on year-long ones. Its terms describe both kinds of order: one with no stated term renews every month and is cancelled with at least thirty days’ notice, and one with a stated term is owed in full and, at a year or longer, renews automatically unless you give notice before it ends.',
          lines: [
            { label: 'An order with no stated term', value: 'Renews every month; cancel at least thirty days before the next billing period to avoid that period’s charge' },
            { label: 'An order with a stated term', value: 'You owe the fees for the whole term, “whether you use the Service, or not”' },
            { label: 'Renewal of a term of a year or longer', value: 'Automatic, unless you give notice no less than thirty days before the term ends' },
            { label: 'Ending a stated term early', value: 'You pay the outstanding balance for the rest of the term, and prepaid fees are not refunded' },
            { label: 'Ending for convenience', value: 'Either side may, on thirty days’ written notice; an order with a stated term stays in force until that term ends' },
          ],
        },
        {
          id: 'if-you-leave',
          title: 'If you leave',
          source: { label: 'Weave’s terms of service', url: 'https://www.getweave.com/legal/terms/', readOn: '2026-11-26', pageSays: 'Last updated: October 2, 2026' },
          question: 'What happens to my phone numbers if I leave Weave?',
          answer:
            'Weave’s terms say no cancellation is effective until every phone number on the account has been ported out of Weave, and that the monthly fee is charged for any billing period in which a number remains. Leased phones go back within ten business days at your shipping cost, and your data is made available on written request within thirty days of termination.',
          lines: [
            { label: 'Your phone numbers', value: 'A cancellation is not effective until every number has been ported out of Weave; the monthly fee is charged for any billing period in which one remains' },
            { label: 'Leased phones', value: 'They are Weave’s property: return them within ten business days of termination, shipping at your cost, or Weave may bill their full retail cost' },
            { label: 'Your data', value: 'Made available on written request within thirty days of termination, where technically feasible and once all amounts owed are paid; “Additional fees may apply”' },
          ],
        },
      ],
      reported: [],
      notRead: ['G2', 'Capterra', 'Software Advice', 'GetApp', 'TrustRadius'],
      versusUs: `Weave’s base plan is a dollar lower than ours, and it is a phone system, which we do not sell. Add the bundle that holds online scheduling, digital forms, reminders and recall and it is $348 a month. ${RATE_MONTHLY}/mo here includes those, the website and the patient portal, with no term and nothing to send back.`,
    },
  },
  {
    slug: 'nexhealth',
    name: 'NexHealth',
    category: 'Patient booking & sync platform',
    whatItIs:
      'NexHealth is a patient booking and sync platform. Its synchronizer connects to Dentrix, Eaglesoft and most other practice management systems, and it sells online booking, forms, reminders and payments on top of that connection, along with a public API.',
    // The line ended "third-party reviews report ~$300+/mo per location" until
    // 2026-11-26: a figure nobody could name the source of, on an entry whose
    // new pricing section says no third party's figure is repeated. The search
    // of NexHealth's own domain that the "no price" rule requires found what
    // the line points at now.
    reportedPricing:
      'Custom quote only — its own pricing page shows no price and asks for your details; its help centre publishes what extra texts, insurance checks and patient payments cost',
    pricingChecked: { on: '2026-11-26', source: 'NexHealth’s own pricing page', url: 'https://www.nexhealth.com/pricing' },
    pricingDetail: {
      intro:
        'NexHealth’s pricing page shows no price: it is a choice of products and a form. What NexHealth does publish is on other pages of its own: what extra texts and insurance checks cost, what it deducts from a patient’s payment, how annual billing works, how much notice it takes to stop, the terms of its service agreement, and what its developer API costs per call. This is what each page said on the day it was read.',
      groups: [
        {
          id: 'the-subscription',
          title: 'The subscription, as its pricing page describes it',
          source: { label: 'NexHealth’s pricing page', url: 'https://www.nexhealth.com/pricing', readOn: '2026-11-26' },
          // Not "How much does NexHealth cost?": every entry's FAQ already asks
          // that of the dated pricing line, and a second answer to the same
          // question would be two answers.
          question: 'Does NexHealth list its prices online?',
          answer:
            'NexHealth’s pricing page shows no price. It asks you to choose from six products and fill in a form, and says custom plans are available on request. What the page does state is how billing works: a month-to-month option charged every month, or a yearly subscription paid up front, with no cancellation fees and 90 days of notice to end an annual contract.',
          lines: [
            { label: 'The price', value: 'None on the page: “Get pricing for your practice”, a choice of products and a form' },
            { label: 'The products you choose from', value: 'Scheduling, Forms, Communications, Payments, Verification and Insights' },
            { label: 'Custom plans', value: '“Custom plans available. Contact us to discuss your needs.”' },
            { label: 'Billing options', value: '“When you choose the month-to-month option, you’ll be charged every month. For our yearly subscription, you’ll pay the full year up front.”' },
            { label: 'Cancellation fees', value: '“There are no cancellation fees.”' },
            { label: 'Ending a monthly contract', value: 'Give notice of non-renewal “before your next full billing cycle and then the next billing cycle is your last”' },
            { label: 'Ending an annual contract', value: '“provide 90 days prior notice to not renew”' },
            { label: 'A contract with another vendor', value: '“We’ll buy out your contract with your existing vendor”, with “exclusions apply”' },
            { label: 'Adding locations', value: '“Contact your sales rep to increase your locations and upgrade your package.”' },
          ],
        },
        {
          id: 'usage-and-overage-fees',
          title: 'Included usage and overage fees',
          source: {
            label: 'NexHealth’s help centre, “Included Usage & Overage Fees”',
            url: 'https://help.nexhealth.com/en/articles/11584920-included-usage-overage-fees',
            readOn: '2026-11-26',
            pageSays: 'Updated this week',
          },
          question: 'Does NexHealth charge overage fees?',
          answer:
            'Its help centre lists two. A plan with Campaigns includes 5,000 campaign texts per location each month, and more are $0.012 a message. A plan with Insurance Verification includes 800 checks a month, and more are $0.20 each, which a practice can switch off.',
          lines: [
            { label: 'Campaign texts included', value: '5,000 SMS messages per location every month, on a plan that includes Campaigns; “Unused SMS messages do not rollover into following months.”' },
            { label: 'Extra campaign texts', value: '$0.012 per SMS message; “Overage charges are added to your next monthly NexHealth invoice.”' },
            { label: 'Texts that do not count', value: 'Template-based texts, which it lists as form requests, reminders, reviews and payments, and two-way messaging with patients' },
            { label: 'Insurance verifications included', value: '800 a month, on a plan that includes Insurance Verification' },
            { label: 'Extra verifications', value: '$0.20 each; overages can be switched off under Settings, Usage management' },
            { label: 'Patient payments', value: '“A payment processing fee of 2.9% + $0.30 is deducted for each patient payment transaction.”' },
          ],
        },
        // Found on 2026-11-26, when the help centre's own sitemap (141
        // articles) was read. No question is asked of it: this site does not
        // yet state what a patient's payment costs on its own product
        // (docs/organic-go-live.md Part 8, row 7), so their rates are printed
        // and nothing of ours is set beside them.
        {
          id: 'patient-payments',
          title: 'What it deducts from a patient’s payment',
          source: {
            label: 'NexHealth’s help centre, “Payouts and processing fees”',
            url: 'https://help.nexhealth.com/en/articles/10141685-payouts-and-processing-fees',
            readOn: '2026-11-26',
            pageSays: 'September 22, 2026',
          },
          lines: [
            { label: 'On a terminal', value: '“In person (terminal): 2.6% + $0.07 per transaction”' },
            { label: 'Online or by text', value: '“Online and text-to-pay: 2.9% + $0.30 per transaction”' },
            { label: 'Paid over time', value: '“Pay Later with Affirm: 6% + $0.30 per transaction”' },
            { label: 'Faster payouts', value: '“An expedited payout schedule is available for a 0.2% increase to your processing rates.”' },
            { label: 'How the fee is taken', value: 'Before the deposit: “NexHealth issues net payouts”' },
            { label: 'Custom rates', value: '“If you have a custom fee configuration, your rates may differ from those above.”' },
          ],
        },
        {
          id: 'paying-annually',
          title: 'Paying annually',
          source: {
            label: 'NexHealth’s help centre, “How do I manage billing in NexHealth?”',
            url: 'https://help.nexhealth.com/en/articles/10046607-how-do-i-manage-billing-in-nexhealth',
            readOn: '2026-11-26',
            pageSays: 'September 28, 2026',
          },
          question: 'Does NexHealth cost less paid annually?',
          answer:
            'Its billing help article says switching to annual gives a 12-month subscription for the price of 11: the account is charged for 11 months up front at the current monthly rate, and the subscription is set to renew in 12 months.',
          lines: [
            { label: 'Switching to annual', value: '“a 12-month subscription (for the price of 11!)”' },
            { label: 'What is charged', value: '“11 months upfront (at your current monthly rate)”' },
            { label: 'Renewal', value: '“your subscription will be set to renew in 12 months”' },
            { label: 'Ways to pay', value: 'A card or autopay in its billing portal, or a check by mail' },
          ],
        },
        // The two groups below were also found on the sitemap read. The
        // pricing page says "month-to-month" and "no cancellation fees"; these
        // are the pages that say what month-to-month comes with.
        {
          id: 'cancelling',
          title: 'Stopping a subscription',
          source: {
            label: 'NexHealth’s help centre, “How do I cancel my NexHealth subscription?”',
            url: 'https://help.nexhealth.com/en/articles/10562265-how-do-i-cancel-my-nexhealth-subscription',
            readOn: '2026-11-26',
            pageSays: 'September 23, 2026',
          },
          question: 'How much notice does NexHealth need to cancel?',
          answer:
            'Its help centre says a month-to-month subscription includes a minimum commitment of the first 3 billing cycles, and takes written notice at least 30 days before the next invoice date. An annual subscription takes written notice at least 90 days before the term ends; without it, the subscription renews for another 12-month term.',
          lines: [
            { label: 'Month-to-month: the minimum', value: '“All month-to-month subscriptions include a minimum commitment of your first 3 billing cycles.”' },
            { label: 'Month-to-month: notice', value: '“you must provide written notice at least 30 days before your next invoice date”' },
            { label: 'Annual: notice', value: '“you must provide written notice at least 90 days before your current subscription term end date”' },
            { label: 'Annual: if the notice is late', value: '“your subscription will automatically renew for another 12-month term under the same terms”' },
            { label: 'When invoices go out', value: '“NexHealth issues invoices on the 29th of each month”' },
            { label: 'Your own agreement', value: '“Specific cancellation terms may differ based on your original agreement”' },
          ],
        },
        {
          id: 'the-agreement',
          title: 'The service agreement',
          source: {
            label: 'NexHealth’s service agreement',
            url: 'https://www.nexhealth.com/legal/customer-service-agreement',
            readOn: '2026-11-26',
            pageSays: 'Version: Oct. 27, 2026',
          },
          question: 'Does NexHealth require a contract?',
          answer:
            'Its service agreement says a month-to-month agreement has a minimum initial term of 90 days, then renews a month at a time until either side gives written notice at least 30 days before the next invoice. A term of a year or more renews for another year unless notice is given at least 90 days before it ends. It says payment obligations are non-cancelable and non-refundable, except as an order states.',
          lines: [
            { label: 'Month-to-month', value: '“For month-to-month agreements, the minimum initial term is 90 days.”' },
            { label: 'Renewal, under a year', value: 'Automatic: it “renews for additional one-month terms, until either party provides written notice of non-renewal to the other party at least 30 days before the next scheduled invoice”' },
            { label: 'Renewal, a year or more', value: 'Automatic: it “renews for additional one-year terms, until either party provides written notice of non-renewal to the other party at least 90 days before the end of the relevant Subscription Term”' },
            { label: 'Refunds', value: '“Except as specified in an Order or the Documentation, payment obligations are non-cancelable and non-refundable.”' },
            { label: 'Reducing a subscription', value: '“subscriptions and quantities purchased may not be decreased during the applicable Subscription Term”' },
            { label: 'Paying an invoice by card', value: '“Invoices paid by payment cards and paper checks may incur a processing fee of 2.9% + $0.30 per transaction, where permitted by law. No additional fee applies to auto-debit ACH payments.”' },
            { label: 'Late payment', value: 'Interest “at 1.5% per month (or the maximum rate permitted by law, if lower)”' },
            { label: 'The synchronizer', value: '“The NexHealth Synchronizer is provided at no cost to you.”' },
            { label: 'Taxes', value: 'Yours, on top of the fees' },
          ],
        },
        {
          id: 'developer-api',
          title: 'The developer API (not a practice’s subscription)',
          source: { label: 'NexHealth’s developer pricing page', url: 'https://synchronizer.nexhealth.com/pricing', readOn: '2026-11-26' },
          lines: [
            { label: 'Starter', value: '$0 a month: “Free sandbox with every endpoint”' },
            { label: 'Builder', value: '$0.10 per API call; “No minimums, no setup fee”' },
            { label: 'Webhooks', value: '$0.05 per delivery' },
            { label: 'Scale', value: 'Custom, for “High-volume platforms and enterprise groups”' },
          ],
        },
      ],
      reported: [],
      notRead: ['G2', 'Capterra', 'Software Advice', 'GetApp', 'TrustRadius'],
      versusUs: `NexHealth’s pricing page shows no subscription price, so there is no number of theirs to set beside ours: ${RATE_MONTHLY}/mo, published, month-to-month. Its own month-to-month option carries a minimum of three billing cycles and 30 days’ notice, per its help centre; ours has neither. On what it does publish, two things are in NexHealth’s favour: a plan with insurance verification includes 800 checks a month where ours includes ${INCLUDED_MONTHLY_INSURANCE_CHECKS}, and a plan with campaigns includes texts, which DreamCRM does not send today.`,
    },
    summary:
      'NexHealth built an impressive real-time synchronizer across many PMSs and sells booking, forms, reminders, and payments on top of it. Its breadth of PMS coverage is real, and the sync infrastructure is genuinely strong engineering. The trade-offs are scope and terms: no practice website, no patient portal, no shop or memberships, and custom pricing. DreamCRM is the whole patient-facing stack — website through recall — on one published price.',
    theirStrengths: [
      { title: 'PMS breadth', body: 'NexHealth built the synchronizer that reaches Dentrix, Eaglesoft, and most other PMSs — genuinely strong engineering. DreamCRM connects through that same class of bridge, so the practical coverage overlaps.' },
      { title: 'Real-time sync', body: 'Their first-party product surfaces changes near-instantly. Our PMS sync is scheduled polling plus instant write-backs — honest minutes, not seconds.' },
      { title: 'Developer API', body: 'A public API product lets DSOs build custom tooling on the sync layer.' },
    ],
    ourStrengths: [
      { glyph: 'layers', title: 'The whole front office, not booking + comms', body: 'NexHealth stops at booking, forms, reminders, and payments. DreamCRM adds the practice website, a clinic-branded portal, reviews that become website testimonials, recall campaigns, and an online store — the jobs around booking that otherwise stay with other vendors.' },
      { glyph: 'globe', title: 'The storefront comes with it', body: 'Website, blog, SEO dashboard, careers page, shop — NexHealth assumes you have vendors for all of that. We replace them.' },
      { glyph: 'people', title: 'A portal patients recognize', body: 'NexHealth’s own site says “NexHealth doesn’t have a patient portal.” DreamCRM’s portal wears your logo, your colors, your voice — with clinic-controlled feature toggles.' },
      { glyph: 'tag', title: 'Published flat pricing', body: `${RATE_MONTHLY}/mo on the pricing page, month-to-month. No discovery call required to learn the number.` },
    ],
    matrix: baseMatrix({
      website: ['no'],
      booking: ['yes', 'Their core strength'],
      portal: ['no', 'Its own site says “NexHealth doesn’t have a patient portal.”'],
      inbox: ['partial', 'Messaging tied to reminders'],
      reviews: ['yes'],
      recall: ['yes'],
      social: ['no'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes', 'Many PMSs via its Synchronizer'],
      phones: ['partial', 'Its “NexHealth Phones” page lists “Mobile app, call routing, ringtones based on caller type, reports”'],
      sms: ['yes'],
      contract: ['partial', 'A month-to-month option with a minimum of three billing cycles and 30 days’ notice, per its help centre; yearly plans are paid up front and need 90 days’ notice not to renew'],
    }),
    bottomLine:
      'If you’re a DSO building custom tooling on the sync API, NexHealth-direct is the pragmatic pick. If you want the whole patient-facing stack — site, booking, portal, reviews, shop — riding the same class of PMS bridge at a flat published price, that’s DreamCRM.',
  },
  {
    slug: 'revenuewell',
    name: 'RevenueWell',
    category: 'Dental marketing & communication suite',
    whatItIs:
      'RevenueWell is a dental marketing and communication suite: campaigns, reminders, two-way texting, phones and a patient portal. It also has an in-house marketing team that runs SEO, paid ads, social media and website design for a practice.',
    // The line ended "third-party reviews report ~$349/mo for a single
    // location" until 2026-11-26: a figure nobody could name the source of.
    // It went when the pages its own sitemap lists were read (682, and the
    // 218 articles of its help centre), which is also where the prices this
    // line points at were found. The offer headline's free period is still
    // not typed as a length: `tests/marketing/trial-copy.test.ts` reads any
    // digit beside "free" as OUR trial.
    reportedPricing:
      'No price published on its Plans page — it says to start from its platform and add packages or services; elsewhere on its own site it prices single products ($149/mo for RW Virtual Office), an offer page for WinOMS practices is headlined with a free introductory period and “$199/Month” for its Marketing Platform, and its legal pages publish a fee schedule and its agreement',
    pricingChecked: { on: '2026-11-26', source: 'RevenueWell’s own Plans page', url: 'https://www.revenuewell.com/plans' },
    pricingDetail: {
      intro:
        'RevenueWell’s Plans page shows no price: it describes a platform to start from, add-ons and services, and a demo to book. Other pages of its own do print figures: a tiers page with a footnote about contracts, a price for one product, three offer pages, a schedule of usage fees, a billing article in its help centre, and its subscription agreement. This is what each page said on the day it was read.',
      groups: [
        {
          id: 'the-plans-page',
          title: 'The subscription, as its Plans page describes it',
          source: { label: 'RevenueWell’s Plans page', url: 'https://www.revenuewell.com/plans', readOn: '2026-11-26' },
          question: 'Does RevenueWell list its prices online?',
          answer:
            'RevenueWell’s Plans page shows no price. It describes a platform to start from, add-ons and standalone services, and a demo to book. Other pages of its site print a price for one product and for three offers, and its legal pages publish a schedule of usage fees and its subscription agreement.',
          lines: [
            { label: 'The price', value: 'None on the page: “Build the perfect plan for your practice. Start with the Practice Growth Platform, then add bundled packages or individual services à la carte.”' },
            { label: 'What you start from', value: 'The Practice Growth Platform, “Required for software add-ons”' },
            { label: 'Marked “coming soon” on the page', value: '“Reputation & review management” and the “ReadyVisit patient portal”' },
            { label: 'Add-ons to the platform', value: 'AI Receptionist, AI Insurance Verification, Online Forms, Phone and RevenueWell TV' },
            { label: 'Sold as standalone services', value: 'Website design, SEO, AEO, paid advertising, social media, video production and branding' },
          ],
        },
        {
          id: 'plan-tiers',
          title: 'Its tiers page',
          source: { label: 'RevenueWell’s plans-comparison page', url: 'https://www.revenuewell.com/meet-the-new-plans', readOn: '2026-11-26' },
          lines: [
            { label: 'The tiers', value: 'Starter, Professional and Premium; no price beside any of them' },
            { label: 'The footnote', value: '“*Annual contract required for Starter, Professional, or Premium plans”' },
            { label: 'Where a website comes in', value: 'Premium: “Add a content rich dental website with RevenueWell TV”' },
          ],
        },
        {
          id: 'virtual-office',
          title: 'RW Virtual Office: video visits, texting and a web phone',
          source: { label: 'RevenueWell’s Virtual Office page', url: 'https://www.revenuewell.com/virtual-office', readOn: '2026-11-26' },
          question: 'How much is RevenueWell Virtual Office?',
          answer:
            'Its Virtual Office page prices that product at $149 a month paid monthly, with no contract, or $129 a month with a 12-month commitment. It says you can cancel within 30 days with full money back.',
          lines: [
            { label: 'The headline', value: '“RW Virtual Office is just $149 per month. Or even less if you sign up for a year.”' },
            { label: 'Paid monthly', value: '“$149/mo”, and “Easy to try with no contract.”' },
            { label: 'Paid for a year', value: '“$129/mo”, and “More affordable with a 12-month commitment.”' },
            { label: 'Money back', value: '“You can cancel within 30 days with full money back.”' },
          ],
        },
        // The next three are offer pages. The first is an offer for practices
        // on one practice-management system; the other two carry "2024" in
        // their addresses and state no date, and each says so.
        {
          id: 'winoms-offer',
          title: 'An offer for WinOMS practices',
          source: { label: 'RevenueWell’s WinOMS integration page', url: 'https://www.revenuewell.com/integrations/winoms-revenuewell', readOn: '2026-11-26' },
          lines: [
            { label: 'The headline', value: 'A free introductory period, then “$199/Month” for its Marketing Platform' },
            { label: 'Who it is for', value: 'Practices using WinOMS: “Integrated Patient Communications with RevenueWell and WinOMS”' },
          ],
        },
        {
          id: 'website-offer',
          title: 'An offer page for its websites',
          source: { label: 'RevenueWell’s website offer page', url: 'https://www.revenuewell.com/website-offer-2024', readOn: '2026-11-26' },
          lines: [
            { label: 'The offer', value: '“For a limited time, you can upgrade to a semi-custom website for just $99/month (a significant discount from the usual $169/month).”' },
            { label: 'How old it is', value: 'The page’s address ends “website-offer-2024”; the page itself states no date' },
          ],
        },
        {
          id: 'truform-offer',
          title: 'An offer page for its forms',
          source: { label: 'RevenueWell’s TruForm offer page', url: 'https://www.revenuewell.com/truform-offer-2024', readOn: '2026-11-26' },
          lines: [
            { label: 'The offer', value: '“Upgrade to TruForm with unlimited edits for $79/month”' },
            { label: 'How old it is', value: 'The page’s address ends “truform-offer-2024”; the page itself states no date' },
          ],
        },
        // THE FEE SCHEDULE IS A PICTURE. The page embeds a PDF whose table has
        // no text layer, so it was read by eye, twice, and cannot be checked
        // by the script that checks every other quotation against a saved
        // copy. `tests/marketing/pricing-detail.test.tsx` pins every figure.
        // The labels are its table's own row names.
        {
          id: 'fee-schedule',
          title: 'Usage fees, from its Variable Fee Schedule',
          source: {
            label: 'RevenueWell’s Variable Fee Schedule',
            url: 'https://www.revenuewell.com/legal/variable-fee-schedule',
            readOn: '2026-11-26',
            pageSays: 'Effective as of June 1st, 2026',
          },
          question: 'Does RevenueWell charge fees on top of the subscription?',
          answer:
            'Its Variable Fee Schedule, effective June 1st, 2026, lists a data and communication pass-through fee of $19.91 per location per month, one-time text registration fees of $15.00 and $44.00 per location, and a carrier fee for each outbound text beyond a package’s monthly limit. Mailed letters and post cards are priced per piece, plus postage.',
          lines: [
            { label: 'Carrier Fees for Text Messages above Maximum Limits', value: '$.015 per outbound text message over Package Limits' },
            { label: 'Starter Limit', value: '750 Text Messages per month' },
            { label: 'Marketing Platform Limit', value: '1750 Text Messages per month' },
            { label: 'Data and Communication Pass Through Fee', value: '$19.91 per location per month' },
            { label: 'One-Time Text Campaign Registration Fee', value: '$15.00 per location' },
            { label: 'One-Time Text Brand Registration Fee', value: '$44.00 per location' },
            { label: 'Additional Fees as Required by Regulatory Agencies', value: 'As Assessed' },
            { label: 'Changing a package', value: '“Changes to a selected package will result in a $15.00 re-registration fee”' },
            { label: 'Black and White Letters', value: '$0.62 + postage; additional pages $0.19' },
            { label: 'Post Cards', value: '4.25" x 6": $0.44 + postage; 5.5" x 8.5": $0.82 + postage' },
          ],
        },
        {
          id: 'billing',
          title: 'Billing, from its help centre',
          source: {
            label: 'RevenueWell’s help centre, “RevenueWell Billing”',
            url: 'https://help.revenuewell.com/hc/en-us/articles/37489450622235-RevenueWell-Billing',
            readOn: '2026-11-26',
          },
          lines: [
            { label: 'Setup or registration fees', value: '“RevenueWell may charge a one-time setup or registration fee during onboarding. These fees are billed regardless of any promotional period.”' },
            { label: 'Texts beyond the limit', value: '“Practices are charged for any SMS messages sent beyond the limits included.”' },
            { label: 'Paying RevenueWell by credit card', value: '“Effective October 22, 2026, a 3% credit card surcharge will be added to payments made by credit card, including payments charged to the credit card currently on file for your RevenueWell account.”' },
            { label: 'Paid advertising', value: '“(e.g., Google Ads) is billed directly by Google, not RevenueWell.”' },
            { label: 'An unpaid account', value: '“we will send a 10-day final notice before any service interruption occurs”' },
          ],
        },
        {
          id: 'fees-and-price-changes',
          title: 'Fees and price changes',
          source: {
            label: 'RevenueWell’s Master Subscription Agreement',
            url: 'https://www.revenuewell.com/legal/resources/msa',
            readOn: '2026-11-26',
            pageSays: 'v1.8 (Updated July 2026)',
          },
          question: 'Can RevenueWell raise its price?',
          answer:
            'Its Master Subscription Agreement says RevenueWell may increase fees in a renewal term “by up to the greater of five percent (5%) or the adjusted Consumer Price Index cost increase”, and that a larger increase takes at least sixty days’ notice before the term ends. It also says fees paid are non-refundable.',
          lines: [
            { label: 'At renewal', value: '“We may increase the Fees in any Subscription Renewal Term (defined in Section 13.2) by up to the greater of five percent (5%) or the adjusted Consumer Price Index cost increase.”' },
            { label: 'A larger increase', value: 'Takes “at least sixty (60) days’ notice” before the term ends, and lets you end the annual contract with thirty days’ notice' },
            { label: 'Refunds', value: '“Payment obligations are non-cancelable, fees paid are non-refundable, and quantities purchased cannot be decreased during the relevant Subscription Term”' },
            { label: 'Paying by credit card', value: '“RevenueWell shall apply a surcharge to any payments made by credit card, not to exceed three percent (3%) or such rate as allowed by applicable law.”' },
            { label: 'A late start', value: 'If go-live slips more than ninety days because content or approvals were not provided: a fee of “not more than ten percent (10%) of the total Fees due under the applicable Order Form”' },
          ],
        },
        {
          id: 'the-contract',
          title: 'The contract',
          source: {
            label: 'RevenueWell’s Master Subscription Agreement',
            url: 'https://www.revenuewell.com/legal/resources/msa',
            readOn: '2026-11-26',
            pageSays: 'v1.8 (Updated July 2026)',
          },
          question: 'Does RevenueWell require a contract?',
          answer:
            'Its plans-comparison page says an annual contract is required for its Starter, Professional and Premium plans, and its home page says it offers both monthly and annual contracts. Its Master Subscription Agreement sets a one-year term where an order names none, renews it automatically a year at a time, and takes notice at least thirty days before a renewal to stop one.',
          lines: [
            { label: 'The term', value: '“If no term is set forth in an Order Form, then the Order Form shall be deemed to have a one-year Subscription Term”' },
            { label: 'Renewal', value: 'Automatic: “for consecutive one (1) year renewal terms”' },
            { label: 'To stop a renewal', value: 'Notice “at least thirty (30) days prior to commencement of an applicable Subscription Renewal Term”' },
            { label: 'If you fall behind', value: 'Once an amount is “30 or more days overdue (or 10 or more days overdue in the case of amounts You have authorized Us to charge to Your payment method on file)”, it may make all unpaid fees due at once and suspend the service until they are paid' },
          ],
        },
      ],
      reported: [],
      notRead: ['G2', 'Capterra', 'Software Advice', 'GetApp', 'TrustRadius'],
      versusUs: `RevenueWell’s Plans page shows no subscription price, so there is no number of theirs to set beside ours: ${RATE_MONTHLY}/mo, published, month-to-month, with the website included. Its agreement sets a one-year term that renews itself where an order names none, and lets fees rise at each renewal. Two things are in RevenueWell’s favour: it sends texts, which DreamCRM does not do today, and it sells a phone system and a marketing team’s services, which we do not sell.`,
    },
    summary:
      'RevenueWell is a mature dental marketing suite — campaigns, reminders, two-way texting, phones, and a patient portal — with a done-for-you marketing team behind it. It earned its install base. Its Plans page shows no price; other pages of its site price single products, list usage fees and publish its agreement, which sets a one-year term that renews itself where an order names none. Website design is sold as a separate service, and its help center describes a portal switch that turns a function off while leaving the link in place. DreamCRM ships the same patient-facing jobs as one product at a published price, month-to-month.',
    theirStrengths: [
      { title: 'Marketing depth, and a team to run it', body: 'Years of dental campaign tooling with two-way texting, plus an in-house marketing team that runs SEO, paid ads, social media and website design for a practice. Our recall engine is email-first today, and we sell software, not a service.' },
      { title: 'Phones, an AI receptionist & add-ons', body: 'An integrated phone system, an AI receptionist and à la carte add-ons let a practice assemble a bigger bundle from one vendor. We do neither phones nor call answering.' },
      { title: 'PMS coverage', body: 'Long-standing sync with the major server PMSs.' },
    ],
    ourStrengths: [
      { glyph: 'sliders', title: 'Toggles that actually hide', body: 'RevenueWell’s help center says of the payments switch in its PatientConnect365 portal: “Disabling this does NOT remove the payments link from Payment Preferences—only disables the function in the portal.” In DreamCRM, off means gone — no dead links in front of patients.' },
      { glyph: 'eye', title: 'Preview as a patient', body: 'One click shows you the portal exactly as a patient sees it with your saved settings.' },
      { glyph: 'globe', title: 'The website is the product, not an add-on', body: 'Edit-in-place studio, blog, SEO dashboard, careers, and shop are in the subscription — not a separately-sold service.' },
      { glyph: 'tag', title: 'One published price', body: `${RATE_MONTHLY}/mo on the page, versus a platform you start from and then add bundles or à la carte services to — with no price on its Plans page for any of it.` },
    ],
    matrix: baseMatrix({
      website: ['partial', 'Website design sold as a standalone service'],
      booking: ['yes', 'Its Plans page: “Let patients request and book appointments at their convenience.”'],
      portal: ['partial', 'Its help center documents a portal, PatientConnect365; its Plans page lists a “ReadyVisit patient portal” as coming soon'],
      inbox: ['yes', 'Text and email in one shared inbox'],
      reviews: ['yes', 'Its help center describes an app to “send, view, and respond to patient reviews”; its Plans page marks review management as coming soon'],
      recall: ['yes', 'Recall and follow-up campaigns with two-way texting'],
      social: ['yes', 'Social media offered as a service; review tools cover Google and Meta'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes'],
      insurance: ['yes', 'An add-on: “AI Insurance Verification”, per its Plans page'],
      phones: ['yes', 'An add-on phone system'],
      sms: ['yes', '750 or 1750 texts a month by package, per its fee schedule'],
      contract: ['partial', 'Its home page says “RevenueWell offers both monthly and annual contracts”; its plans-comparison page says “Annual contract required for Starter, Professional, or Premium plans”'],
    }),
    bottomLine:
      'If you want a marketing team to run your ads and SEO for you, with phones and texting from the same vendor, RevenueWell offers more today. If you want the patient-facing system — site, booking, a portal patients actually like, reviews, shop — as one product whose price you can read before you call anyone, that is DreamCRM.',
  },
  {
    slug: 'solutionreach',
    name: 'Solutionreach',
    category: 'Patient reminders & engagement (the category veteran)',
    whatItIs:
      'Solutionreach is patient reminder and engagement software. It has sent automated appointment reminders by text and email for about twenty years, and it includes patient satisfaction surveys.',
    // This said "every package priced by quote ... setup fees reported by
    // reviewers" until 2026-11-26. The first half was wrong in Solutionreach's
    // favour: its main pricing page sends every package to a quote, and a
    // second pricing page on its own site has a checkout that prints prices.
    // The read of the 25th stopped at the page the menu links to. The second
    // half named no reviewer, and went with it.
    reportedPricing:
      'Published from $199/mo billed yearly, or $219/mo billed monthly, for its Essentials patient communications package on a checkout page of its own site, where a Plus package is $249/mo and an optional revenue-cycle package $199 or $349/mo; its main pricing page says “Pricing starts at $199” and sends every package to a quote',
    pricingChecked: { on: '2026-11-26', source: 'Solutionreach’s own pricing pages', url: 'https://www.solutionreach.com/pricing' },
    pricingDetail: {
      intro:
        'Solutionreach prints prices in four places on its own site. The pricing page its menu links to names three packages and sends each to a quote. A second pricing page, with a checkout, prints monthly prices for four packages. A page of offer terms prints a per-location price for its Practice Complete packages, which add phones and its AI receptionist, for orders signed by December 18, 2026. Its payments agreement lists what it charges on a patient’s payment. The rules on fees and renewal are in its Master Service Agreement. This is what each page said on the day it was read.',
      groups: [
        {
          id: 'published-prices',
          title: 'The prices on its checkout page',
          source: {
            label: 'Solutionreach’s pricing page with checkout',
            url: 'https://www.solutionreach.com/pricing-package-with-checkout',
            readOn: '2026-11-26',
          },
          question: 'How much does Solutionreach cost per month?',
          answer:
            'A checkout page on Solutionreach’s own site prices its Essentials patient-communications package at $199 a month billed yearly, or $219 billed monthly, and its Plus package at $249 or $279. Two optional revenue-cycle packages are $199 or $219 for Essentials and $349 or $379 for Plus. The page says annual plans save up to 10%.',
          lines: [
            { label: 'Patient Communications, Essentials', value: '$199/mo billed yearly, or $219/mo billed monthly: two-way texting, appointment reminders, recall and its basic online scheduler' },
            { label: 'Patient Communications & Retention, Plus', value: '$249/mo billed yearly, or $279/mo billed monthly: everything in Essentials, plus its pro online scheduler, digital intake, patient surveys, batch messaging, reputation management and outreach campaigns' },
            { label: 'The revenue-cycle packages', value: 'An add-on: “Add a Revenue Cycle Messaging™ Package (OPTIONAL)”' },
            { label: 'Revenue Cycle Messaging, Essentials', value: '$199/mo billed yearly, or $219/mo billed monthly: Insurance Pro, Secure Docs Basic and Payment Technology' },
            { label: 'Revenue Cycle Messaging, Plus', value: '$349/mo billed yearly, or $379/mo billed monthly: everything in Essentials, plus Insurance Premium and Secure Docs Pro' },
            { label: 'Paying yearly', value: '“Save up to 10% with annual plans”' },
            { label: 'Enterprise', value: '“Enterprise packages available. Contact us to discuss your needs.”' },
          ],
        },
        {
          id: 'the-main-pricing-page',
          title: 'The pricing page its menu links to',
          source: { label: 'Solutionreach’s pricing page', url: 'https://www.solutionreach.com/pricing', readOn: '2026-11-26' },
          lines: [
            { label: 'The headline', value: '“Pricing starts at $199”' },
            { label: 'Its packages', value: 'Patient Connect, Practice Efficiency and Practice Growth, each with a “Request a Quote” button' },
            { label: 'Enterprise', value: 'For “6+ LOCATIONS”, with a “Get in Touch” button' },
            { label: 'Texts included each month', value: '1,750 on Patient Connect, 3,500 on Practice Efficiency and 4,500 on Practice Growth; “TAILORED” on Enterprise' },
            { label: 'Contract options', value: '“We offer yearly contract options.”' },
          ],
        },
        // The two groups below were found on the second read of 2026-11-26,
        // by taking the list of pages its own sitemap publishes (86) and
        // searching every one for a price. No question is asked of either: an
        // offer with an end date does not belong in an answer a search engine
        // keeps, and what a patient's payment costs is not yet stated for our
        // own product (docs/organic-go-live.md Part 8, row 7), so their fee
        // schedule is printed and nothing of ours is set beside it.
        // RE-READ AFTER 2026-12-18: the offer ends that day.
        {
          id: 'practice-complete-offer',
          title: 'A dated offer: the Practice Complete packages',
          source: {
            label: 'Solutionreach’s Practice Complete year-end offer terms',
            url: 'https://www.solutionreach.com/practice-complete-offer-terms',
            readOn: '2026-11-26',
            pageSays: 'Effective November 16, 2026',
          },
          lines: [
            { label: 'What the offer adds', value: 'For order forms signed “on or before December 18, 2026”: “unlimited calls answered by SR AI Receptionist, up to five (5) SR Phones Standard lines, and up to five (5) phones per Location”' },
            { label: 'Practice Complete Efficiency Package', value: '$599.00 per location per month, with 3,500 texts a month' },
            { label: 'Practice Complete Growth Package (Dental)', value: '$799.00 per location per month, with 4,500 texts a month and Insurance Premium' },
            { label: 'Practice Complete Growth Package (Eye Care, Medical)', value: '$699.00 per location per month, with 4,500 texts a month' },
            { label: 'Extra phone lines', value: '“Additional SR Phones Standard lines are $21 per line per month.”' },
            { label: 'How the price is counted', value: '“Prices are per Location, per month, for Order Forms signed under the Offer. Each Location includes up to 5 Providers.”' },
            { label: 'Who can take it', value: 'Practices with “fewer than six (6) Locations” that sign “an initial term of at least twelve (12) months”' },
            { label: 'Not in the price', value: '“Taxes and applicable fees are not included.”' },
            { label: 'It can change', value: '“Solutionreach may change or end the Offer at any time; a change does not affect an Order Form already signed.”' },
          ],
        },
        {
          id: 'patient-payments',
          title: 'Patient payments: the fee schedule in its SR Pay Agreement',
          source: {
            label: 'Solutionreach’s SR Pay Agreement',
            url: 'https://www.solutionreach.com/legal/sr-pay-agreement',
            readOn: '2026-11-26',
            pageSays: 'Last updated: May 21, 2026',
          },
          // The first eight labels are the rows of its fee schedule, as named.
          lines: [
            { label: 'Transaction Fee via Terminal (Swiped/Insert Chip/Tap)', value: '2.40%' },
            { label: 'Transaction Auth Fee via Terminal (Swiped/Insert Chip/Tap)', value: '$0.20' },
            { label: 'Transaction Fee', value: '2.89%' },
            { label: 'Transaction Auth Fee', value: '$0.30' },
            { label: 'ACH Transaction Fee', value: '1.00%' },
            { label: 'ACH Failure (Incl. Payout Failure)', value: '$5.00' },
            { label: 'ACH Refund Fee', value: '$0.75' },
            { label: 'ACH Return Fee', value: '$25.00' },
            { label: 'What those fees leave out', value: '“Unless expressly stated otherwise, all Fees are exclusive of taxes, interchange, and Payment Network assessments.”' },
            { label: 'Its processor’s own fees', value: '“Payrix may charge additional fees pursuant to the Sub-Merchant Agreement and other Payrix Documents; those fees are in addition to the Fees set forth here.”' },
            { label: 'Fee changes', value: '“Solutionreach may change the Fees on at least thirty (30) days’ prior notice”' },
          ],
        },
        {
          id: 'fees-and-price-changes',
          title: 'Fees and price changes',
          source: { label: 'Solutionreach’s Master Service Agreement', url: 'https://www.solutionreach.com/msa-terms', readOn: '2026-11-26' },
          question: 'Can Solutionreach raise its price?',
          answer:
            'Its Master Service Agreement says Solutionreach “may modify the License Fees associated with any product or service at any time upon reasonable notice”. It also says all fees paid are non-refundable, and that a payment more than thirty days late accrues interest of 1.5% a month or the highest lawful rate, whichever is lower.',
          lines: [
            { label: 'How fees are counted', value: '“License Fees for Services may be charged per Location, per Provider, or by usage.”' },
            { label: 'Price changes', value: '“Company may modify the License Fees associated with any product or service at any time upon reasonable notice.”' },
            { label: 'Third-party technology fees', value: '“Company may charge a fee to Client as reasonably necessary to offset third party technology fees.”' },
            { label: 'Refunds', value: '“All fees paid are non-refundable.”' },
            { label: 'Late payment', value: 'After thirty days: interest of “one and one-half percent (1.5%) per month or the highest rate allowed by applicable law, whichever is lower”' },
            { label: 'If you fall behind', value: 'Solutionreach may “require full payment of all fees under such Order Form for the remainder of the Order Form Term”, and suspend the service until it is paid' },
            { label: 'Taxes', value: 'Yours, on top of the fees' },
          ],
        },
        {
          id: 'the-contract',
          title: 'The contract',
          source: { label: 'Solutionreach’s Master Service Agreement', url: 'https://www.solutionreach.com/msa-terms', readOn: '2026-11-26' },
          question: 'Does Solutionreach require a contract?',
          answer:
            'Its pricing page answers “What are your contract options?” with “We offer yearly contract options.” Its Master Service Agreement says an order renews automatically, for one-year periods unless the order form says otherwise, and that stopping a renewal takes written notice at least thirty days before the term ends.',
          lines: [
            { label: 'The term', value: 'The period stated on the order form' },
            { label: 'Renewal', value: 'Automatic: for the periods on the order form or, if it names none, “for successive additional one-year periods”' },
            { label: 'To stop a renewal', value: 'Written notice “at least thirty (30) days prior to the end of the then-current” term' },
            { label: 'Ending an order before its term is up', value: 'The agreement lists mutual written agreement; a material breach that “remains uncured thirty (30) days after” written notice; and, for the service affected, an integration failure Solutionreach does not correct within ten days of notice' },
            { label: 'When an order ends', value: 'Access stops, and everything owed up to that date is due' },
          ],
        },
      ],
      reported: [],
      notRead: ['G2', 'Capterra', 'Software Advice', 'GetApp', 'TrustRadius', 'Solutionreach’s community help site'],
      versusUs: `Solutionreach’s Essentials package, billed yearly, is a dollar lower than ours; billed monthly it is higher. Add its optional revenue-cycle package for insurance checks and the two come to $398 a month billed yearly. ${RATE_MONTHLY}/mo here is month-to-month and includes ${INCLUDED_MONTHLY_INSURANCE_CHECKS} insurance checks a month, the website, the patient portal and online booking, with no yearly term. Two things are in Solutionreach’s favour: its packages send texts, which DreamCRM does not do today, and it sells a phone system and an AI receptionist, which we do not sell.`,
    },
    // "…and reviewer complaints about contracts and sync misfires" stood in
    // this sentence until 2026-11-26: a claim about a competitor attributed
    // to reviewers nobody named. What its own pages say about contracts is
    // in the pricing section below, in its own words.
    //
    // THE SAME DAY, the rest of this entry was read against the 86 pages its
    // own sitemap lists. It had called the product "comms-only" and "dated",
    // with "a legacy portal", scheduling "request-based in places" and phones
    // a partial add-on. Its site sells a phone system, an AI receptionist,
    // payments and scheduling from live openings; and it names no patient
    // portal at all (the word appears once, to say a patient pays without
    // logging in to one). Every line below now says what a page of its own
    // says, or says that its site lists none.
    summary:
      'Solutionreach effectively invented automated patient reminders and still runs reliable SMS at serious scale. Its site lists texting, recall, surveys, online scheduling, payments, a phone system and an AI receptionist, and no website or patient portal. DreamCRM is built around those two: the website and the portal are included, on month-to-month terms.',
    theirStrengths: [
      { title: 'Reminder reliability at scale', body: 'Battle-tested SMS/email reminder infrastructure with two decades of dental cadence built in.' },
      { title: 'Surveys & NPS tooling', body: 'Built-in patient satisfaction surveys are more developed than anything we ship today.' },
      { title: 'Broad PMS sync', body: 'Its integrations page lists “400+ native PM/EHR integrations”, with appointments written back to the practice’s system.' },
      { title: 'A phone system with an AI receptionist', body: 'It sells a phone system, SR Phones, and an AI receptionist that answers calls and books appointments when the front desk cannot. DreamCRM sells neither.' },
    ],
    ourStrengths: [
      { glyph: 'people', title: 'A patient portal in your brand', body: 'Confirm, reschedule, fill in forms and pay online, under your logo. Solutionreach’s site lists no patient portal; its payments page says patients pay “without logging in to a portal”.' },
      { glyph: 'globe', title: 'Website + SEO + careers + shop included', body: 'Solutionreach’s site lists no website product, careers page or shop. DreamCRM includes all three.' },
      { glyph: 'door', title: 'No contract', body: 'Solutionreach’s pricing page answers “What are your contract options?” with yearly contracts. DreamCRM is month-to-month, and you can cancel whenever you like.' },
      { glyph: 'chat', title: 'One inbox', body: 'Portal messages and patient email merge per patient; reminders are one thread of a relationship, not the product.' },
    ],
    matrix: baseMatrix({
      website: ['no'],
      booking: ['yes', 'Its scheduling page: “Show patients real-time openings on your schedule”'],
      portal: ['no', 'None listed on its site; its payments page says patients pay “without logging in to a portal”'],
      inbox: ['partial', 'SMS-centric'],
      reviews: ['yes'],
      recall: ['yes', 'Their heritage'],
      social: ['partial', 'Reads and answers reviews across business listings; no social posting listed on its site'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes', '“400+ native PM/EHR integrations”, per its integrations page'],
      insurance: ['yes', 'Its pricing page lists “Insurance Eligibility (Dental Only)”; on its checkout page it is in the optional revenue-cycle packages'],
      phones: ['yes', 'SR Phones, the phone system it sells'],
      sms: ['yes', '1,750 to 4,500 texts a month by package, per its pricing page'],
      contract: ['no', 'Yearly contract options, per its pricing page; its checkout page bills them yearly or monthly'],
    }),
    bottomLine:
      'If you want texting, a phone system and an AI receptionist from one vendor, Solutionreach sells all three and DreamCRM does not. If you want the website and the patient portal in the same product as booking, reviews and recall, at a price you can cancel monthly, that is DreamCRM.',
  },
  {
    slug: 'adit',
    name: 'Adit',
    category: 'All-in-one practice communications & analytics',
    whatItIs:
      'Adit is practice communications and analytics software sold as a bundle: VoIP phones with call tracking, texting, email, online scheduling, digital forms, payments and practice analytics, with an AI agent that answers calls.',
    // The line ended "third-party reviews report ~$399/mo bundles per location"
    // until 2026-11-26: a figure nobody could name the source of, and the
    // basis for two claims that DreamCRM was the cheaper of the two. Its own
    // FAQ page, found when the pages its sitemap lists were read (938), states
    // a starting price below ours. The claims went; the price is quoted.
    //
    // NOT PRINTED, on purpose: the banner across its site that day (a
    // percentage off the first year and a gift card for taking a demo). Its
    // small print ends the offer on November 29 and 30, 2026; a line about it
    // would be out of date within the week.
    reportedPricing:
      'No price published on the page a buyer reads — its pricing page asks you to schedule a demo; its FAQ page says “We offer a technology bundle that starts at $99 per month, per location”; the pricing page’s structured data, the part written for search engines, lists a price of $399 with no period stated; and its terms publish what usage beyond a bundle costs',
    pricingChecked: { on: '2026-11-26', source: 'Adit’s own pricing page', url: 'https://adit.com/pricing' },
    pricingDetail: {
      intro:
        'Adit’s pricing page shows no price in its text: it lists modules and asks you to book a demo. Three other pages of its own do state figures. Its FAQ page gives a starting price for its technology bundle. Its terms list what each bundle includes and what usage beyond that costs, along with its rules on refunds and ending the agreement. And its payments terms give what it charges on a patient’s payment. This is what each page said on the day it was read.',
      startsAt: { perMonth: 99, groupId: 'faq' },
      groups: [
        {
          id: 'the-pricing-page',
          title: 'The subscription, as its pricing page describes it',
          source: { label: 'Adit’s pricing page', url: 'https://adit.com/pricing', readOn: '2026-11-26' },
          question: 'Does Adit list its prices online?',
          answer:
            'Adit’s pricing page shows no price in its text and asks you to book a demo. Its FAQ page says its technology bundle starts at $99 per month, per location, and its terms list what usage beyond a bundle costs.',
          lines: [
            { label: 'The price', value: 'None in the text of the page: it lists modules and asks you to book a demo' },
            { label: 'Contracts', value: '“No Contracts”, in the line under its heading' },
            { label: 'In the page’s structured data', value: 'A price of 399 US dollars, with no period stated: the part of a page written for search engines, not shown to a reader' },
            { label: 'The modules it lists', value: 'Adit Voice, Texting, Email, Internal Chat, eFax, Mobile App, Digital Forms, Online Scheduling, Reminders, Insurance Verifications, Reviews, Tasks, Practice Analytics, Treatment Plans, CareCredit, Patient Recall, Adit Pay, AI Call Intelligence and AI Front Desk' },
          ],
        },
        {
          id: 'faq',
          title: 'Its FAQ page: a starting price, and its words on contracts',
          source: { label: 'Adit’s FAQ page', url: 'https://adit.com/faqs', readOn: '2026-11-26' },
          question: 'How much is Adit’s technology bundle?',
          answer:
            'Adit’s FAQ page says “We offer a technology bundle that starts at $99 per month, per location.” The same page says its tech packages have no binding contract, and that its marketing agreements are locked into a 1 year contract.',
          lines: [
            { label: 'The starting price', value: '“We offer a technology bundle that starts at $99 per month, per location.”' },
            { label: 'Contracts', value: '“Our tech packages do not have any binding contracts so you can cancel your subscription any time. However, our marketing agreements are locked into a 1 year contract with a Patient Booking Guarantee.”' },
            { label: 'Emails and texts', value: '“All plans include a significant amount of emails and texts per month that will be sufficient for most practices. However, for larger practices that mass-communicate with their patients, additional fees may apply.”' },
            // Its answer about needing a card to sign up is left out: a
            // sentence saying a card is not required reads, in this tree, as a
            // claim about OUR trial (`tests/marketing/trial-copy.test.ts`),
            // and ours requires one.
          ],
        },
        {
          id: 'usage-fees',
          title: 'What each bundle includes and what more costs, from its terms',
          source: { label: 'Adit’s terms', url: 'https://adit.com/terms', readOn: '2026-11-26', pageSays: 'Last Updated: November 26, 2026' },
          question: 'Does Adit charge overage fees?',
          answer:
            'Its terms list them by bundle. On its Tech & Analytics Bundle, calls, one-to-one texts and emails are unlimited; mass text campaigns are $0.01 per text, tracked call minutes beyond 500 per location are $0.03 a minute, and a phone number beyond the two included is $2.',
          lines: [
            { label: 'Tech & Analytics Bundle: what is unlimited', value: '“Unlimited VoIP minutes”, “Unlimited one-to-one text messaging” and “Unlimited emails”' },
            { label: 'Mass texts', value: '“$0.01 per text for all mass text campaigns sent”' },
            { label: 'Tracked call minutes', value: '“500 tracking minutes per location, $0.03 per minutes charges”' },
            { label: 'Phone numbers', value: '“2 numbers per location. $2 per extra numbers”' },
            { label: 'Video', value: '“100 video minutes free per location”' },
            { label: 'Freemium: texts', value: '“500 text messages per location, $0.03 per additional message”' },
            { label: 'Freemium: emails', value: '“5,000 emails free per location. $5 per 1,000 additional emails sent”' },
            { label: 'Freemium: phone numbers', value: '“1 number per location. $2 per extra number”' },
          ],
        },
        // Printed and not made a question, as on every page that prints a
        // competitor's card fees: this site does not yet state what a
        // patient's payment costs on its own product
        // (docs/organic-go-live.md Part 8, row 7).
        {
          id: 'adit-pay',
          title: 'What it charges on a patient’s payment (Adit Pay)',
          source: { label: 'Adit’s payments terms', url: 'https://adit.com/adit-pay-terms', readOn: '2026-11-26', pageSays: 'Last Updated: November 26, 2026' },
          lines: [
            { label: 'A card read by the terminal', value: '“Card Present Transactions: 2.25% + $0.20 per transaction.”' },
            { label: 'A card entered by hand or charged online', value: '“Card Not Present Transactions: 2.90% + $0.30 per transaction.”' },
          ],
        },
        {
          id: 'billing-and-refunds',
          title: 'Refunds and late payment',
          source: { label: 'Adit’s terms', url: 'https://adit.com/terms', readOn: '2026-11-26', pageSays: 'Last Updated: November 26, 2026' },
          question: 'Does Adit give refunds?',
          answer:
            'Its terms say all sales under an invoice are final, with no refunds for contracted services. For a year paid up front, a prorated refund may be issued in the first year, less a 3% processing fee and $50 for each month of service; after the first year there are none.',
          lines: [
            { label: 'Refunds', value: '“All sales pursuant to the Invoice are Final, and there are no refunds for contracted services for any reason.”' },
            { label: 'A year paid up front: the first year', value: 'A prorated refund may be issued, “subject to a three percent (3%) processing fee and a penalty of fifty dollars ($50) per month of service deducted from the refund amount”' },
            { label: 'A year paid up front: later years', value: '“After completion of the first year, no refunds will be offered for annual upfront payments under any circumstances.”' },
            { label: 'Late payment', value: '“Adit has the right to charge 15% penalty for payments received after 5 days of expected billing date.”' },
            { label: 'Late interest', value: '“Late payments may incur interest at the rate of 1.5% per month or the maximum allowed by law.”' },
          ],
        },
        {
          id: 'the-contract',
          title: 'The contract',
          source: { label: 'Adit’s terms', url: 'https://adit.com/terms', readOn: '2026-11-26', pageSays: 'Last Updated: November 26, 2026' },
          question: 'Does Adit require a contract?',
          answer:
            'Its FAQ page says its tech packages have no binding contract and its marketing agreements are locked into a 1 year contract. Its terms say the agreement renews automatically until either side ends it, on 30-day written notice by email.',
          lines: [
            { label: 'Renewal', value: '“The Term shall be automatically renewed for successive periods until it is terminated by either party via email”' },
            { label: 'To end it', value: '“This Agreement may be terminated at any time by either party upon receipt of 30-day written notice via email”' },
            { label: 'Ad spend on a marketing agreement', value: '“Client will be responsible for spending an additional $750 USD or $1,000 CAD per month for ad expenditure on Google Ads.”' },
          ],
        },
      ],
      reported: [],
      notRead: ['G2', 'Capterra', 'Software Advice', 'GetApp', 'TrustRadius'],
      versusUs: `Adit’s pricing page shows no subscription price. Its FAQ page says its technology bundle starts at $99 per month, per location, which is lower than ours: ${RATE_MONTHLY}/mo, flat, month-to-month, with the website, the patient portal and online booking included. Two more things are in Adit’s favour: it sends texts, which DreamCRM does not do today, and it sells a phone system with call tracking, which we do not sell.`,
    },
    summary:
      'Adit pitches the same consolidation story we do — replace your stack, save thousands a year — and bundles VoIP, texting, forms, analytics, and call tracking. The difference is which half of the practice each of us consolidates. Adit consolidates the phone room: calls, call tracking, internal chat. DreamCRM consolidates the patient-facing storefront: website, booking, portal, reviews, shop. Adit lists no patient portal on its site and treats websites as an agency service; its pricing page says its software packages carry no binding contract.',
    theirStrengths: [
      { title: 'Phones + call tracking', body: 'VoIP with marketing call attribution is Adit’s core, now with an AI agent that takes after-hours and missed calls; we deliberately don’t do phones.' },
      { title: 'Practice analytics depth', body: 'Its Practice Analytics module digs into PMS production metrics; our analytics intentionally stop where the PMS’s clinical numbers begin.' },
      { title: 'A low starting price', body: 'Its FAQ page starts its technology bundle at $99 per month, per location. That is below our price.' },
    ],
    ourStrengths: [
      { glyph: 'people', title: 'The patient-facing half', body: 'A website you edit by clicking it, a clinic-branded patient portal, an online store and a careers page. Adit’s pricing page lists its modules, and none of those is among them; it sells websites as a marketing service.' },
      { glyph: 'bolt', title: 'Self-serve everything', body: 'Sign up, your site and dashboard exist in minutes, and every word of your site is yours to edit — no agency queue.' },
      { glyph: 'sync', title: 'PMS sync through one bridge', body: 'Dentrix, Eaglesoft, Open Dental and more through one bridge, with every write in your audit trail.' },
      { glyph: 'tag', title: 'One flat price, with the website in it', body: `${RATE_MONTHLY}/mo covers the website, the portal, booking, reviews and the shop. Adit’s FAQ page starts its technology bundle lower; a website from Adit is a separate marketing service.` },
    ],
    matrix: baseMatrix({
      website: ['partial', 'Agency-built sites as a service'],
      booking: ['yes'],
      portal: ['no', 'None listed on its site'],
      inbox: ['partial', 'Calls + SMS centric'],
      reviews: ['yes'],
      recall: ['yes'],
      social: ['partial', 'Reviews are a module on its pricing page; social posting is not among the modules it lists'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes'],
      insurance: ['yes', 'Listed on its pricing page: “Insurance Verifications”'],
      phones: ['yes', 'Core product'],
      sms: ['yes'],
      contract: ['yes', 'No binding contract on its software packages, per its pricing page; its marketing program is a one-year commitment'],
    }),
    bottomLine:
      'If the phone room is your bottleneck, Adit consolidates it well, and starts lower than we do. If the patient-facing storefront is what needs fixing — the website, the booking, the portal patients keep using — that’s the half DreamCRM owns.',
  },
  {
    slug: 'dental-intelligence',
    name: 'Dental Intelligence',
    category: 'Practice analytics + patient engagement',
    whatItIs:
      'Dental Intelligence is practice analytics and patient engagement software. It is known for morning-huddle dashboards and production numbers read from the practice management system, and its acquisition of Modento added a patient app for forms, reminders and payments.',
    reportedPricing:
      'No price published that we could find — its own home page shows none and asks you to get a demo; third-party reviews report ~$300–$600+/mo per location depending on the analytics + engagement bundle (2025–2026)',
    pricingChecked: { on: '2026-11-25', source: 'Dental Intelligence’s own home page', url: 'https://www.dentalintel.com/' },
    summary:
      'Dental Intelligence is the analytics leader in the category — morning-huddle dashboards and production KPIs pulled straight from the PMS — and its acquisition of Modento added a patient app for forms, reminders, and payments. Its site now lists VoIP phones, an AI receptionist and insurance verification as well. If deep production analytics is what you want, DI is genuinely ahead of us there. What it isn’t is a storefront: its site lists no practice website and no online store, and does not say whether its patient portal wears the practice’s own brand. DreamCRM is the patient-facing half — the site that wins the patient and the portal they return to — with honest, booked-visit-level reporting rather than deep clinical production metrics.',
    theirStrengths: [
      { title: 'Production analytics depth', body: 'DI reads clinical production numbers out of the PMS — hygiene reactivation value, provider production, unscheduled treatment — deeper than our booked-visit-level reporting, which intentionally stops at the CRM/PMS line.' },
      { title: 'The morning-huddle dashboard', body: 'Its live KPI huddle is the product it’s famous for, and it’s excellent.' },
      { title: 'A wide front-office bundle', body: 'A patient app for forms, reminders and payments (it came with the Modento acquisition), and its site now lists VoIP phones and an AI receptionist too — neither of which we do.' },
    ],
    ourStrengths: [
      { glyph: 'globe', title: 'A website is included', body: 'Dental Intelligence lists no website product, so you keep paying a website vendor. DreamCRM ships one — edit-in-place studio, blog, SEO dashboard, careers — and replaces that retainer.' },
      { glyph: 'people', title: 'The portal wears your brand', body: 'DreamCRM’s portal is your logo, colors, and voice, with per-feature toggles and preview-as-patient. Dental Intelligence lists a patient portal and a patient mobile app; its site does not say whose brand patients see, so ask.' },
      { glyph: 'cart', title: 'Store, memberships, and shop revenue', body: 'Whitening kits and in-house membership plans sold from your own site. Dental Intelligence lists a patient loyalty program, not a storefront.' },
      { glyph: 'tag', title: 'Published flat pricing', body: `${RATE_MONTHLY}/mo on the page, month-to-month — versus quote-based analytics + engagement bundles.` },
    ],
    matrix: baseMatrix({
      website: ['no', 'None listed on its site'],
      booking: ['yes'],
      portal: ['partial', 'A patient portal and a patient app are listed; clinic branding not stated on its site'],
      inbox: ['partial', 'Patient chat + reminders'],
      reviews: ['yes'],
      recall: ['yes', 'Strong reactivation tooling from production data'],
      social: ['no', 'None listed on its site'],
      shop: ['partial', 'A patient loyalty program is listed; no online store or membership plans'],
      careers: ['no'],
      pms: ['yes', 'Deep multi-PMS analytics is its foundation'],
      insurance: ['yes', 'Eligibility verification and claims processing listed on its site'],
      phones: ['yes', 'Voice, its VoIP product'],
      sms: ['yes', 'Listed as Patient Chat and Mass Communication'],
      contract: ['partial', 'Terms not stated on its home page; it links a cancellation policy'],
    }),
    bottomLine:
      'If you want the deepest production analytics and huddle dashboards in dentistry, Dental Intelligence is the leader and we don’t try to be. If what’s missing is the patient-facing storefront — website, branded portal, shop — at a flat published price, that’s DreamCRM. Many practices run one for the numbers and the other for the front door.',
  },
  {
    slug: 'podium',
    name: 'Podium',
    category: 'Reviews, webchat & texting for local business',
    whatItIs:
      'Podium is a reviews, webchat and texting tool for local businesses of every kind, not a dental product. It asks customers for Google reviews by text, turns website chats into text conversations, and takes payments over text.',
    reportedPricing:
      'Published at $399/mo for its Core plan and $599/mo for Pro, with a Signature plan priced by quote; every plan is bought through its sales team, and its pricing page sends HVAC businesses to sales for their own pricing',
    pricingChecked: { on: '2026-11-25', source: 'Podium’s own pricing page', url: 'https://www.podium.com/pricing' },
    summary:
      'Podium built the review-generation and business-texting category — it’s excellent at turning a happy customer into a Google review over text, and its webchat-to-text and Payments products are mature. But Podium is a general local-business tool, not a dental product: no practice website, no patient portal, no PMS sync, no dental-specific recall or intake. DreamCRM is dentistry-native and ships the whole patient-facing stack; where Podium leads today is live two-way SMS, which is still on our roadmap.',
    theirStrengths: [
      { title: 'Two-way texting today', body: 'Mature SMS with webchat-to-text and campaign texting, and an AI employee that answers and schedules over text. Our SMS channel is still on the roadmap — if texting is your #1 need today, Podium is ahead.' },
      { title: 'Review generation', body: 'The text-to-review flow that made Podium famous is best-in-class at volume.' },
      { title: 'Payments over text', body: 'Text-to-pay tied into the messaging stack.' },
    ],
    ourStrengths: [
      { glyph: 'tooth', title: 'Dentistry-native, not generic', body: 'Visit-type booking rules, dental intake with insurance-card OCR, recall on PMS due dates, an OD chart mirror — none of which a general local-business tool models.' },
      { glyph: 'globe', title: 'The website + portal Podium has neither of', body: 'A real practice site with an edit-in-place studio and a clinic-branded patient portal — Podium ships no website and no portal.' },
      { glyph: 'star', title: 'FTC-clean reviews', body: 'Same ask to every patient, no rating-gating — clean under the FTC fake-reviews rule, and the results feed your own site’s testimonials.' },
      { glyph: 'tag', title: 'One flat dental price', body: `${RATE_MONTHLY}/mo for the whole stack, against $399 a month for Podium’s Core plan and $599 for Pro on its own pricing page.` },
    ],
    matrix: baseMatrix({
      website: ['no'],
      booking: ['partial', 'Scheduling via integrations, not native to a dental PMS'],
      portal: ['no'],
      inbox: ['partial', 'SMS + webchat unified; no portal/email patient threads'],
      reviews: ['yes', 'Their origin product — excellent'],
      recall: ['partial', 'Generic campaigns, not PMS-recall-driven'],
      social: ['partial'],
      shop: ['no'],
      careers: ['no'],
      pms: ['no', 'Not a dental PMS integrator'],
      phones: ['yes', 'Podium Phones'],
      sms: ['yes'],
      contract: ['partial', 'Terms not stated on its pricing page; annual terms commonly reported'],
    }),
    bottomLine:
      'If two-way texting and review volume are the whole job, Podium is a strong pick and beats us on SMS today. If you want a dentistry-native platform — website, booking, branded portal, PMS sync, dental intake — at a flat price, that’s DreamCRM.',
  },
  {
    slug: 'patientpop',
    name: 'Tebra (PatientPop)',
    searchedAs: { name: 'PatientPop', now: 'Tebra' },
    category: 'Healthcare practice-growth: websites, SEO & reputation',
    whatItIs:
      'PatientPop is practice-growth software for healthcare practices: practice websites, SEO, online scheduling and reputation management. It merged with Kareo and is now part of Tebra, which sells it alongside its own EHR and billing.',
    reportedPricing:
      'Published from $49 per provider per month — the non-physician starting price for Patient Experience + Marketing, the package with online scheduling, reviews, 80+ web profiles and Google Business Profile; a physician starts at $99, and both are starter prices for practices submitting fewer than 100 claims a month. Its main pricing page shows no number and asks for your details: the figures are on its pricing overview page',
    // Re-checked 2026-11-26: every figure and quotation in the groups read on
    // the 25th was compared by script with that day's copy of the page it
    // cites, when the pages its sitemap lists were read. All were present.
    pricingChecked: { on: '2026-11-26', source: 'Tebra’s own pricing overview page', url: 'https://www.tebra.com/pricing/overview' },
    summary:
      'PatientPop — now part of Tebra after merging with Kareo — is the closest thing to a direct overlap: it sells healthcare practice websites, SEO, online scheduling, and reputation as a growth suite, alongside Tebra’s EHR and billing. It’s a capable, established product for medical private practices. The differences are focus and terms: Tebra’s home and pricing pages do not mention dentistry at all; it prices per provider and bills website hosting as its own line; its agreements renew automatically for the same term unless you give sixty days’ notice, with no early cancellation; and it lists no online store, memberships, or dental PMS sync. DreamCRM is dental-native, self-serve, edit-it-yourself, one flat price, and month-to-month.',
    theirStrengths: [
      { title: 'Established healthcare SEO', body: 'Years of healthcare SEO and directory-listing management across specialties — its pricing page lists 80+ web profiles and Google Business tools.' },
      { title: 'Reputation + scheduling suite', body: 'Reviews with AI-written replies, online scheduling, and provider profiles bundled with the site.' },
      { title: 'Billing under one roof (Tebra)', body: 'Post-merger, practices can add Kareo billing/EHR from the same vendor — a bigger footprint than ours.' },
    ],
    ourStrengths: [
      { glyph: 'tooth', title: 'Dental-native, not multi-specialty', body: 'A curated dental services library, visit-type booking rules, dental intake, and PMS recall — versus a generic healthcare template.' },
      { glyph: 'pencil', title: 'Edit it yourself, no agency queue', body: 'The Website Studio changes your live site by clicking it. Tebra describes a custom website built to reflect your brand; ask how a change gets made after launch.' },
      { glyph: 'cart', title: 'Store, memberships, and dental PMS sync', body: 'An online shop, in-house membership plans, and two-way dental PMS sync through the NexHealth bridge — none of which Tebra lists.' },
      { glyph: 'calendar', title: 'One flat price, month-to-month', body: `${RATE_MONTHLY}/mo for the whole practice, website included, and you can stop any month. Tebra prices per provider, bills website hosting as its own line, and renews automatically unless you give sixty days’ notice.` },
    ],
    matrix: baseMatrix({
      website: ['yes', 'Custom practice websites, part of its marketing suite'],
      booking: ['yes'],
      portal: ['partial', 'A patient portal is listed; clinic branding not stated on its site'],
      inbox: ['partial'],
      reviews: ['yes'],
      recall: ['yes', 'Generic healthcare campaigns'],
      social: ['partial'],
      shop: ['no'],
      careers: ['no'],
      pms: ['partial', 'Its own EHR and practice management; no dental PMS sync listed'],
      phones: ['no', 'None listed on its site'],
      sms: ['yes'],
      contract: ['partial', 'Its terms describe both: agreements that renew automatically for the same term unless you give 60 days’ notice, with no early cancellation, and month-to-month agreements'],
    }),
    bottomLine:
      'If you run a medical practice and want websites, reputation and an EHR from one established vendor, Tebra is credible. If you run a dental practice and want a platform built for it — one you edit yourself, with a store, memberships, and dental PMS sync, month-to-month at one flat price — that’s DreamCRM.',
    // Every line below was read on 2026-11-25, in a browser, from the page
    // its group cites. Tebra's main pricing page is a form; these are the
    // other pages of its own site, which is why nobody quotes them.
    pricingDetail: {
      intro:
        'PatientPop’s tools are sold today inside Tebra: patientpop.com forwards to tebra.com, and Tebra’s pricing policy maps the old “Practice Growth” name to “Patient Experience”. Tebra’s main pricing page shows a form in place of a number. The prices, the fees and the contract terms are on other pages of its own site, and this is what each of them said on the day it was read.',
      groups: [
        {
          id: 'published-prices',
          title: 'The prices Tebra publishes',
          source: { label: 'Tebra’s pricing overview page', url: 'https://www.tebra.com/pricing/overview', readOn: '2026-11-25' },
          lines: [
            { label: 'Patient Experience + Marketing, per non-physician provider', value: 'Starting at $49 a month' },
            { label: 'Patient Experience + Marketing, per physician', value: 'Starting at $99 a month' },
            { label: 'The asterisk on both', value: 'Starter pricing applies to practices submitting fewer than 100 claims per month' },
            { label: 'Practice Automation — its EHR, billing and telehealth plus the Patient Experience tools — per physician', value: '$799 a month; low volume starting at $399' },
            { label: 'Practice Automation, per non-physician provider', value: '$449 a month; low volume starting at $249' },
            { label: 'Practice Automation, per therapist', value: '$299 a month' },
            { label: 'The whole range Tebra gives', value: '$49 to $799 per provider, per month' },
          ],
        },
        {
          id: 'whats-included',
          title: 'What the marketing package includes',
          source: { label: 'Tebra’s main pricing page', url: 'https://www.tebra.com/pricing', readOn: '2026-11-25' },
          lines: [
            { label: 'Included in Patient Experience + Marketing', value: 'Patient online scheduling, custom appointment reminders, patient feedback and reviews, patient broadcast, 80+ web profiles and Google Business Profile — with a dedicated onboarding manager, on-demand training, and in-app and phone support' },
            { label: 'Marked as not included', value: 'Patient portal, provider calendar and scheduling, basic appointment reminders, message center, digital patient intake, telehealth, charting and billing' },
            { label: 'A website', value: 'Not a line in the package comparison' },
            { label: 'How the price is asked for', value: 'A two-step form — name, company, email and phone — in place of a number' },
          ],
        },
        {
          id: 'other-fees',
          title: 'Fees outside the subscription',
          source: { label: 'Tebra’s pricing policy', url: 'https://www.tebra.com/tebra-pricing-policy', readOn: '2026-11-25', pageSays: 'Last updated effective July 1, 2026' },
          question: 'Is there a setup fee for PatientPop?',
          answer:
            'Tebra’s pricing policy lists a one-time onboarding fee, billed at sign-up, and does not state the amount. It also bills website hosting as its own monthly line, and charges Practice Growth customers a telecom messaging compliance fee of $84.87 per location a year.',
          lines: [
            { label: 'Onboarding fee', value: 'One-time, billed at sign-up; the policy states no amount' },
            { label: 'Website hosting', value: 'Its own line, billed monthly in advance; the policy states no amount' },
            { label: 'Telecom messaging compliance fee', value: '$84.87 per location, billed annually, for Practice Growth customers' },
            { label: 'Website export, if you leave', value: '$1,000 for the text and overall structure of the site; appointment widgets and other dynamic features are not included' },
            { label: 'Blog and social media work', value: 'Listed among professional services, charged outside the subscription' },
            { label: 'Price increases', value: 'Up to 4.9% at a time, no more than once in 12 months, on 30 days’ notice' },
            { label: 'Dropping part of a discounted bundle', value: 'The remaining products revert to full price' },
            { label: 'Removing a provider', value: 'Charged for the last full month and, at Tebra’s discretion, an early termination fee for the rest of the term' },
            { label: 'Paying Tebra’s invoice by credit card', value: 'A 2% processing fee' },
            { label: 'Refunds', value: 'None — “All fees are nonrefundable and non-cancellable”' },
          ],
        },
        {
          id: 'the-contract',
          title: 'The contract',
          source: { label: 'Tebra’s terms of service', url: 'https://www.tebra.com/tebra-terms-of-service', readOn: '2026-11-25', pageSays: 'Updated effective July 1, 2026' },
          question: 'Does PatientPop require a contract?',
          answer:
            'Tebra’s terms of service say an agreement runs for the length it specifies and then renews automatically for another term of the same length, unless written notice is received at least 60 days before it ends. They allow no early cancellation and give no refund. They also mention month-to-month agreements, on which every fee can change with 60 days’ notice.',
          lines: [
            { label: 'Length', value: 'Whatever your agreement specifies; the terms name no standard length' },
            { label: 'Renewal', value: 'Automatic, for another term of the same length' },
            { label: 'To stop a renewal', value: 'Written notice received at least 60 days before the term ends; any later and it renews' },
            { label: 'Cancelling early', value: 'Not allowed, and no refund if you stop using the service' },
            { label: 'Month-to-month agreements', value: 'They exist; on one, every fee can change with 60 days’ notice' },
          ],
        },
        {
          id: 'if-you-leave',
          title: 'If you leave',
          source: { label: 'Tebra’s terms of service', url: 'https://www.tebra.com/tebra-terms-of-service', readOn: '2026-11-25', pageSays: 'Updated effective July 1, 2026' },
          question: 'What happens to my website if I leave PatientPop?',
          answer:
            'Tebra’s terms let you export the text and overall structure of the site, and its pricing policy sets that export at $1,000. Tebra’s templates and anything that is not your own content stay with Tebra, the licences for images it supplied end, and a domain name Tebra registered is to be assigned to you.',
          lines: [
            { label: 'Your website', value: 'You may export its text and overall structure, at the fee in the pricing policy; Tebra’s templates and everything that is not your own content stay Tebra’s' },
            { label: 'Images Tebra licensed for the site', value: 'The licences end; to keep using them you license them yourself' },
            { label: 'Your domain name', value: 'If Tebra registered it, Tebra “will take reasonable measures to assign its rights” to you; if you supplied it, you keep it' },
          ],
        },
        // The two groups below were found on 2026-11-26, when the pages its
        // own sitemap lists were read (529 product, legal and resource
        // pages; the other 70,000 are its provider directory). No question
        // is asked of the payment fees: see the same note on NexHealth and
        // Solutionreach.
        {
          id: 'payment-processing',
          title: 'Tebra’s payment processing (a separate service)',
          source: {
            label: 'Tebra’s payment processing pricing policy',
            url: 'https://www.tebra.com/tebra-payment-processing-pricing-policy',
            readOn: '2026-11-26',
          },
          lines: [
            { label: 'Card present', value: '“2.75% + $0.30 per Card Present transaction”' },
            { label: 'Card not present', value: '“3.25% + $0.30 per Card Not Present transaction”' },
            { label: 'Annual fees', value: 'None: the page says it “has no annual fees”' },
            { label: 'Refunds to a patient', value: '“Original processing fees are taken out of all refunds.”' },
            { label: 'A disputed charge', value: '“A $15 fee will be charged anytime a patient disputes a charge and receives money back from the issuing bank.”' },
            { label: 'High chargebacks', value: '“5.5% + $0.60 Processing Fee”, “For customers whose chargebacks exceed 0.6% per month for three months.”' },
          ],
        },
        {
          id: 'your-records-if-you-leave',
          title: 'Your records, if you leave',
          source: {
            label: 'Tebra’s term, termination and return of data FAQ',
            url: 'https://www.tebra.com/term-termination-return-data-faq',
            readOn: '2026-11-26',
            pageSays: 'This policy was last updated on October 26, 2023',
          },
          lines: [
            { label: 'The format', value: '“The Customer data will only be provided in Microsoft Excel (.XLS) or Comma Separated Values (.CSV) file format”, and covers patient records and claim records' },
            { label: 'How long it is kept afterwards', value: '“an additional minimum 60 days (Data Retention Period)”' },
            { label: 'Help after support has ended', value: '“Tebra may charge the Customer the standard rate of $100 an hour (minimum 30 minutes)”' },
            { label: 'Part-months', value: '“Tebra does not refund or credit subscription fees for partial months or for any portion of a prepaid plan”' },
          ],
        },
      ],
      reported: [
        {
          who: 'CostBench',
          says: 'puts the median Tebra contract at $3,588 a year, from seven third-party buyer reports, and estimates the PatientPop marketing modules at roughly $200–$400 a month when priced separately',
          caveat: 'CostBench’s own words for the figure: “Indicative market pricing — not official vendor pricing or contract-grade data.” Its page also still says Tebra publishes no prices',
          source: { label: 'CostBench’s Tebra pricing page', url: 'https://www.costbench.com/software/ehr-emr/tebra/', readOn: '2026-11-25', pageSays: 'Last verified: June 14, 2026' },
        },
      ],
      notRead: ['G2', 'Capterra', 'Software Advice', 'GetApp', 'TrustRadius', 'ITQlick'],
      versusUs: `For one provider buying only the marketing package, Tebra’s starting price is lower than ours. ${RATE_MONTHLY}/mo here covers the whole practice rather than each provider, with the website included, no setup fee and no term. One thing is in Tebra’s favour if you leave: Tebra will export a site’s text and structure for a fee; DreamCRM has no export of the site itself today.`,
    },
  },
]

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * `2026-11-23` → `November 23, 2026`, for the "last checked" line.
 *
 * STRING IN, STRING OUT — no `Date`. An ISO day pushed through `new Date()`
 * is midnight UTC, and formatted on a client west of Greenwich it reads as
 * the day BEFORE; the page would then claim a check on a date nobody made
 * one. A calendar day has no timezone, so it is never given one. A malformed
 * value comes back unchanged rather than as "undefined NaN".
 */
export function formatCheckedOn(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay)
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined
  if (!m || !month) return isoDay
  return `${month} ${Number(m[3])}, ${m[1]}`
}

export function getComparison(slug: string): VendorComparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug)
}

/**
 * Does this vendor's OWN site state a price? Read off the pricing line's
 * opening, which the registry writes one of two ways on purpose: "Published…"
 * when the vendor's page carries a number, and "No … price published…" or
 * "Custom quote only…" when it does not. `tests/marketing/pricing-guide.test.tsx`
 * holds that every entry opens one of those ways, so a new entry phrased some
 * third way fails there instead of being silently counted as a non-publisher.
 */
export function publishesPrice(c: VendorComparison): boolean {
  return /^Published\b/.test(c.reportedPricing)
}

/**
 * THE OPENING CLAUSE OF THE DATED PRICING LINE — "No price published",
 * "Custom quote only", "Published at $199/mo for the base plan" — for the one
 * place with room for a clause and not the whole line: the page's meta
 * description, which is what a searcher reads before deciding to click.
 *
 * A PREFIX, NEVER A PARAPHRASE. The pricing line is the only sentence in an
 * entry that was written from the vendor's own page on a stated day, and a
 * second, shorter wording of it would be a second thing to keep true. So this
 * cuts the line at the first punctuation the line itself carries and returns
 * what came before, unchanged; `tests/marketing/page-head.test.ts` holds that
 * the result is the line's own opening, for every entry.
 */
export function pricingHeadline(c: VendorComparison): string {
  const cut = c.reportedPricing.search(/ — |;| \(|,/)
  return (cut === -1 ? c.reportedPricing : c.reportedPricing.slice(0, cut)).trim()
}

/** The vendor as a searcher names it — the old name, where that is what they type. */
export function searchName(c: VendorComparison): string {
  return c.searchedAs?.name ?? c.name
}

/** `searchName`, with today's name beside it when the two differ: "PatientPop (now Tebra)". */
export function searchNameWithNow(c: VendorComparison): string {
  return c.searchedAs ? `${c.searchedAs.name} (now ${c.searchedAs.now})` : c.name
}

/** The vendor's answer on the "Month-to-month, no contract" row. */
export function contractAnswer(c: VendorComparison): { value: MatrixValue; note: string } {
  const row = c.matrix.find((r) => r.feature.startsWith('Month-to-month'))
  return { value: row?.vendor ?? 'partial', note: row?.vendorNote ?? '' }
}

/** The most recent day any entry's pricing was read against its vendor's
 *  page — an ISO day, or undefined when nothing has been read. */
export function latestPricingCheck(comparisons: readonly VendorComparison[] = COMPARISONS): string | undefined {
  const days = comparisons
    .map((c) => c.pricingChecked?.on)
    .filter((d): d is string => Boolean(d))
    .sort()
  return days[days.length - 1]
}

/**
 * The per-vendor FAQ (slice 4a, docs/marketing-engine.md Part 5): the
 * questions buyers actually type — "what is {vendor}", "{vendor} pricing",
 * "{vendor} alternatives" — and the ones AI assistants extract answers from. DERIVED
 * from the same registry fields the page renders, so the FAQ (and its
 * FAQPage JSON-LD twin) can never drift from the comparison itself, and no
 * answer can carry a fact the honesty bar above didn't already admit.
 */
export function buildComparisonFaq(c: VendorComparison): Array<{ q: string; a: string }> {
  // Mid-sentence, a title loses its capital and nothing else: lower-casing
  // the whole of it turned NPS, PMS, API, SEO and AI into words.
  const midSentence = (title: string) => (/^[A-Z](?![A-Z])/.test(title) ? title[0]!.toLowerCase() + title.slice(1) : title)
  const leadTitles = c.theirStrengths.map((s) => midSentence(s.title)).join(', ')
  return [
    {
      // First, and the only answer with nothing about us in it: a reader who
      // asked what the product IS gets that, and the page below is the rest.
      q: `What is ${c.name}?`,
      a: c.whatItIs,
    },
    {
      q: `How much does ${c.name} cost?`,
      a: `${c.reportedPricing}. By comparison, DreamCRM is ${RATE_MONTHLY}/mo published (founding practice rate), month-to-month, with a ${TRIAL.name}: a card starts it, and it is not charged until the trial ends.`,
    },
    {
      q: `What is a good ${c.name} alternative for a dental practice?`,
      a: `DreamCRM is a dentistry-native ${c.name} alternative that ships the whole patient-facing stack in one product — practice website with an edit-in-place editor, online booking, a patient portal in the clinic’s own branding, review collection, recall campaigns, and an online store with membership plans — at ${RATE_MONTHLY}/mo published, month-to-month.`,
    },
    {
      q: `When is ${c.name} the better choice?`,
      a: `Honestly: when ${leadTitles} are your deciding factors — ${c.name} genuinely leads there, and the comparison above says so plainly. Weigh what your practice is actually missing before you pick either product.`,
    },
    {
      q: `Can I switch from ${c.name} to DreamCRM?`,
      a: `Yes. DreamCRM is month-to-month with a ${TRIAL.name}, so you can run it alongside ${c.name} before deciding. Patients import via CSV, PMS sync connects through the NexHealth bridge, and you keep your existing phone system. If you ever leave, your patient list exports with you.`,
    },
    // The pricing questions, where an entry's pricing was read out in full.
    // Each answer is its group's own, and ends with the page it came from and
    // the day it was read — an answer lifted out of this page by a search
    // engine or an assistant carries its citation with it.
    ...(c.pricingDetail?.groups ?? [])
      .filter((g) => g.question && g.answer)
      .map((g) => ({
        q: g.question as string,
        a: `${g.answer} (${g.source.label}, read ${formatCheckedOn(g.source.readOn)}.)`,
      })),
  ]
}

export const COMPARISON_DISCLAIMER =
  'Competitor details reflect public vendor materials and independent reviews as of June 2026, except where a page shows a later “last checked” date, and may change — verify specifics with each vendor. We aim to be scrupulously fair: every vendor on this page is good at something, and we say so.'

/**
 * How many comparisons there are, spelled for a headline.
 *
 * DERIVED, because `/compare`'s section opener says the number out loud and a
 * hand-typed one goes stale in silence. It already did: the opener shipped
 * reading "Five comparisons" over eight cards, caught in review on #621 — on
 * the same PR whose own docblock argues that our price must resolve rather
 * than be typed. A number about the registry belongs to the registry.
 *
 * The word map covers the plausible range and FALLS BACK to the numeral
 * rather than `undefined`: a THIRTEENTH vendor making the page read "13
 * comparisons" is merely inelegant, "undefined comparisons" is broken
 * (`COUNT_WORDS[12]` is 'Twelve', so twelve is still spelled). The noun
 * agrees with the count for the same reason — a derived string that lies
 * about grammar is still a derived string that lies.
 *
 * `n` IS A PARAMETER SO THE FUNCTION CAN BE ASKED QUESTIONS. Pinning the
 * rendered heading against `comparisonCountLabel()` — which is what the
 * render test does, correctly — can only catch a literal typed at the CALL
 * SITE, because page and test then ask the same function what the answer is.
 * Drop the leading 'No' from the map and the page reads "Nine comparisons"
 * over eight cards with that test still green: the same wrong number on the
 * same public page, one level in. The default keeps every caller unchanged;
 * the parameter is what lets `comparisons-count.test.ts` state the answers
 * independently, and it is the only thing that reaches the singular branch
 * or the numeral fallback — nothing else on the site has one comparison or
 * thirteen.
 */
const COUNT_WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
]

export function comparisonCountLabel(n: number = COMPARISONS.length): string {
  const word = COUNT_WORDS[n] ?? String(n)
  return `${word} ${n === 1 ? 'comparison' : 'comparisons'}`
}
