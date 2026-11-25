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


export interface VendorComparison {
  slug: string
  name: string
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
    pricingChecked: { on: '2026-11-23', source: 'Weave’s own plans and pricing pages', url: 'https://www.getweave.com/plans/' },
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
  },
  {
    slug: 'nexhealth',
    name: 'NexHealth',
    category: 'Patient booking & sync platform',
    whatItIs:
      'NexHealth is a patient booking and sync platform. Its synchronizer connects to Dentrix, Eaglesoft and most other practice management systems, and it sells online booking, forms, reminders and payments on top of that connection, along with a public API.',
    reportedPricing:
      'Custom quote only — its own pricing page shows no price and asks for your details; third-party reviews report ~$300+/mo per location (2025–2026)',
    pricingChecked: { on: '2026-11-23', source: 'NexHealth’s own pricing page', url: 'https://www.nexhealth.com/pricing' },
    summary:
      'NexHealth built an impressive real-time synchronizer across many PMSs and sells booking, forms, reminders, and payments on top of it. Its breadth of PMS coverage is real, and the sync infrastructure is genuinely strong engineering. The trade-offs are scope and terms: no practice website, no clinic-branded portal, no shop or memberships, and custom pricing. DreamCRM is the whole patient-facing stack — website through recall — on one published price.',
    theirStrengths: [
      { title: 'PMS breadth', body: 'NexHealth built the synchronizer that reaches Dentrix, Eaglesoft, and most other PMSs — genuinely strong engineering. DreamCRM connects through that same class of bridge, so the practical coverage overlaps.' },
      { title: 'Real-time sync', body: 'Their first-party product surfaces changes near-instantly. Our PMS sync is scheduled polling plus instant write-backs — honest minutes, not seconds.' },
      { title: 'Developer API', body: 'A public API product lets DSOs build custom tooling on the sync layer.' },
    ],
    ourStrengths: [
      { glyph: 'layers', title: 'The whole front office, not booking + comms', body: 'NexHealth stops at booking, forms, reminders, and payments. DreamCRM adds the practice website, a clinic-branded portal, reviews that become website testimonials, recall campaigns, and an online store — the jobs around booking that otherwise stay with other vendors.' },
      { glyph: 'globe', title: 'The storefront comes with it', body: 'Website, blog, SEO dashboard, careers page, shop — NexHealth assumes you have vendors for all of that. We replace them.' },
      { glyph: 'people', title: 'A portal patients recognize', body: 'NexHealth’s patient pages run under its own brand. DreamCRM’s portal wears your logo, your colors, your voice — with clinic-controlled feature toggles.' },
      { glyph: 'tag', title: 'Published flat pricing', body: `${RATE_MONTHLY}/mo on the pricing page, month-to-month. No discovery call required to learn the number.` },
    ],
    matrix: baseMatrix({
      website: ['no'],
      booking: ['yes', 'Their core strength'],
      portal: ['partial', 'NexHealth-branded patient pages, not clinic-branded'],
      inbox: ['partial', 'Messaging tied to reminders'],
      reviews: ['yes'],
      recall: ['yes'],
      social: ['no'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes', 'Many PMSs via its Synchronizer'],
      phones: ['no'],
      sms: ['yes'],
      contract: ['yes', 'A month-to-month option, per its pricing page; yearly plans are paid up front and need 90 days’ notice not to renew'],
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
    reportedPricing:
      'No price published — its own Plans page shows none and says to talk to its team for a package; third-party reviews report ~$349/mo for a single location, with add-ons priced separately (2025–2026)',
    pricingChecked: { on: '2026-11-24', source: 'RevenueWell’s own Plans page', url: 'https://www.revenuewell.com/plans' },
    summary:
      'RevenueWell is a mature dental marketing suite — campaigns, reminders, two-way texting, phones, and a patient portal — with a done-for-you marketing team behind it. It earned its install base, and its own site says it offers monthly as well as annual contracts, and free trials. But it publishes no price, website design is sold as a separate service, and its help center describes a portal toggle that turns a function off while leaving the link in place. DreamCRM ships the same patient-facing jobs as one product at a published price, with toggles that fully remove what you turn off.',
    theirStrengths: [
      { title: 'Marketing depth, and a team to run it', body: 'Years of dental campaign tooling with two-way texting, plus an in-house marketing team that runs SEO, paid ads, social media and website design for a practice. Our recall engine is email-first today, and we sell software, not a service.' },
      { title: 'Phones, an AI receptionist & add-ons', body: 'An integrated phone system, an AI receptionist and à la carte add-ons let a practice assemble a bigger bundle from one vendor. We do neither phones nor call answering.' },
      { title: 'PMS coverage', body: 'Long-standing sync with the major server PMSs.' },
    ],
    ourStrengths: [
      { glyph: 'sliders', title: 'Toggles that actually hide', body: 'RevenueWell’s own help center notes that turning off portal payments disables the function without removing the payments link. In DreamCRM, off means gone — no dead links in front of patients.' },
      { glyph: 'eye', title: 'Preview as a patient', body: 'One click shows you the portal exactly as a patient sees it with your saved settings. No competitor we surveyed documents this.' },
      { glyph: 'globe', title: 'The website is the product, not an add-on', body: 'Edit-in-place studio, blog, SEO dashboard, careers, and shop are in the subscription — not a separately-sold service.' },
      { glyph: 'tag', title: 'One published price', body: `${RATE_MONTHLY}/mo on the page, versus a platform you start from and then add bundles or à la carte services to — with no price shown for any of it.` },
    ],
    matrix: baseMatrix({
      website: ['partial', 'Website design sold as a standalone service'],
      booking: ['yes'],
      portal: ['partial', 'A patient portal is listed; clinic branding not stated on its Plans page'],
      inbox: ['yes', 'Text and email in one shared inbox'],
      reviews: ['yes'],
      recall: ['yes', 'Recall and follow-up campaigns with two-way texting'],
      social: ['yes', 'Social media offered as a service; review tools cover Google and Meta'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes'],
      phones: ['yes', 'An add-on phone system'],
      sms: ['yes'],
      contract: ['yes', 'Monthly and annual contracts, per its own site'],
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
    reportedPricing:
      'Published as “pricing starts at $199” for its entry package, with every package priced by quote and yearly contract options; setup fees reported by reviewers (2025–2026)',
    pricingChecked: { on: '2026-11-23', source: 'Solutionreach’s own pricing page', url: 'https://www.solutionreach.com/pricing' },
    summary:
      'Solutionreach effectively invented automated patient reminders and still runs reliable SMS at serious scale. Twenty years in, the product is deep on messaging and surveys but dated around it: no website product, a legacy portal, and reviewer complaints about contracts and sync misfires. DreamCRM is the modern stack around the same jobs — with the website and portal included and month-to-month terms.',
    theirStrengths: [
      { title: 'Reminder reliability at scale', body: 'Battle-tested SMS/email reminder infrastructure with two decades of dental cadence built in.' },
      { title: 'Surveys & NPS tooling', body: 'Built-in patient satisfaction surveys are more developed than anything we ship today.' },
      { title: 'Broad PMS sync', body: 'Mature sync agents across the major server PMSs.' },
    ],
    ourStrengths: [
      { glyph: 'people', title: 'The modern patient surface', body: 'A warm, mobile-first portal with self-reschedule, forms, and online payments — versus a legacy portal experience.' },
      { glyph: 'globe', title: 'Website + SEO + careers + shop included', body: 'Solutionreach is comms-only; we replace the website vendor, the job board, and the storefront too.' },
      { glyph: 'door', title: 'No contract', body: 'Solutionreach’s pricing page answers “What are your contract options?” with yearly contracts. DreamCRM is month-to-month; leave whenever, your content exports with you.' },
      { glyph: 'chat', title: 'One inbox', body: 'Portal messages and patient email merge per patient; reminders are one thread of a relationship, not the product.' },
    ],
    matrix: baseMatrix({
      website: ['no'],
      booking: ['partial', 'Request-based scheduling in places'],
      portal: ['partial', 'Legacy portal'],
      inbox: ['partial', 'SMS-centric'],
      reviews: ['yes'],
      recall: ['yes', 'Their heritage'],
      social: ['partial', 'Reviews; social via add-ons'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes'],
      phones: ['partial', 'Add-on offerings'],
      sms: ['yes', 'Best-in-class depth'],
      contract: ['no', 'Yearly contract options, per its pricing page'],
    }),
    bottomLine:
      'For pure reminder volume over SMS today, the veteran still delivers. For everything a patient actually touches — your website, booking, portal, reviews — and a price you can cancel monthly, DreamCRM is the modern answer.',
  },
  {
    slug: 'adit',
    name: 'Adit',
    category: 'All-in-one practice communications & analytics',
    whatItIs:
      'Adit is practice communications and analytics software sold as one bundle: VoIP phones with call tracking, texting, forms, and Adit Pulse, which reports on production numbers from the practice management system.',
    reportedPricing:
      'No price published — its own pricing page lists no subscription price and asks you to schedule a demo; third-party reviews report ~$399/mo bundles per location (2025–2026)',
    pricingChecked: { on: '2026-11-24', source: 'Adit’s own pricing page', url: 'https://adit.com/pricing' },
    summary:
      'Adit pitches the same consolidation story we do — replace your stack, save thousands a year — and bundles VoIP, texting, forms, analytics, and call tracking. The difference is which half of the practice each of us consolidates. Adit consolidates the phone room: calls, call tracking, internal chat. DreamCRM consolidates the patient-facing storefront: website, booking, portal, reviews, shop. Adit lists no patient portal on its site and treats websites as an agency service; its pricing page says its software packages carry no binding contract.',
    theirStrengths: [
      { title: 'Phones + call tracking', body: 'VoIP with marketing call attribution is Adit’s core, now with an AI agent that takes after-hours and missed calls; we deliberately don’t do phones.' },
      { title: 'Practice analytics depth', body: 'Adit Pulse digs into PMS production metrics; our analytics intentionally stop where the PMS’s clinical numbers begin.' },
      { title: 'Aggressive bundling', body: 'A lot of modules per dollar if you adopt the full Adit stack including phones.' },
    ],
    ourStrengths: [
      { glyph: 'people', title: 'The patient-facing half', body: 'A real website product with edit-in-place studio, a clinic-branded portal, online store, memberships, careers — none of which Adit ships as product.' },
      { glyph: 'bolt', title: 'Self-serve everything', body: 'Sign up, your site and dashboard exist in minutes, and every word of your site is yours to edit — no agency queue.' },
      { glyph: 'sync', title: 'Official-path PMS sync', body: 'Open Dental, Dentrix + more through one bridge — sanctioned paths, every write in your audit trail.' },
      { glyph: 'tag', title: 'Lower flat price', body: `${RATE_MONTHLY}/mo versus reported ~$399 bundles — because we don’t carry a phone network.` },
    ],
    matrix: baseMatrix({
      website: ['partial', 'Agency-built sites as a service'],
      booking: ['yes'],
      portal: ['no', 'None listed on its site'],
      inbox: ['partial', 'Calls + SMS centric'],
      reviews: ['yes'],
      recall: ['yes'],
      social: ['yes', 'Social + reviews in-suite'],
      shop: ['no'],
      careers: ['no'],
      pms: ['yes'],
      phones: ['yes', 'Core product'],
      sms: ['yes'],
      contract: ['yes', 'No binding contract on its software packages, per its pricing page; its marketing program is a one-year commitment'],
    }),
    bottomLine:
      'If the phone room is your bottleneck, Adit consolidates it well. If the patient-facing storefront is what needs fixing — the website, the booking, the portal patients keep using — that’s the half DreamCRM owns, at half the reported price.',
  },
  {
    slug: 'dental-intelligence',
    name: 'Dental Intelligence',
    category: 'Practice analytics + patient engagement',
    whatItIs:
      'Dental Intelligence is practice analytics and patient engagement software. It is known for morning-huddle dashboards and production numbers read from the practice management system, and its acquisition of Modento added a patient app for forms, reminders and payments.',
    reportedPricing:
      'No price published that we could find — its own home page shows none and asks you to get a demo; third-party reviews report ~$300–$600+/mo per location depending on the analytics + engagement bundle (2025–2026)',
    pricingChecked: { on: '2026-11-24', source: 'Dental Intelligence’s own home page', url: 'https://www.dentalintel.com/' },
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
      'No price published — its own pricing page shows none and says to talk to its sales team; third-party reviews report ~$399–$599+/mo depending on tier and messaging volume (2025–2026)',
    pricingChecked: { on: '2026-11-24', source: 'Podium’s own pricing page', url: 'https://www.podium.com/pricing' },
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
      { glyph: 'tag', title: 'One flat dental price', body: `${RATE_MONTHLY}/mo for the whole stack versus a messaging platform fee plus volume-based add-ons.` },
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
    category: 'Healthcare practice-growth: websites, SEO & reputation',
    whatItIs:
      'PatientPop is practice-growth software for healthcare practices: practice websites, SEO, online scheduling and reputation management. It merged with Kareo and is now part of Tebra, which sells it alongside its own EHR and billing.',
    reportedPricing:
      'No subscription price published — its own pricing page says the price varies with the number of providers and asks you to request a quote; third-party reviews report ~$300–$700+/mo for the practice-growth suite (2025–2026)',
    pricingChecked: { on: '2026-11-24', source: 'Tebra’s own pricing page', url: 'https://www.tebra.com/pricing' },
    summary:
      'PatientPop — now part of Tebra after merging with Kareo — is the closest thing to a direct overlap: it sells healthcare practice websites, SEO, online scheduling, and reputation as a growth suite, alongside Tebra’s EHR and billing. It’s a capable, established product for medical private practices. The differences are focus and terms: Tebra’s home and pricing pages do not mention dentistry at all, it publishes no subscription price, reviewers report annual contracts, and it lists no online store, memberships, or dental PMS sync. DreamCRM is dental-native, self-serve, edit-it-yourself, and month-to-month.',
    theirStrengths: [
      { title: 'Established healthcare SEO', body: 'Years of healthcare SEO and directory-listing management across specialties — its pricing page lists 80+ web profiles and Google Business tools.' },
      { title: 'Reputation + scheduling suite', body: 'Reviews with AI-written replies, online scheduling, and provider profiles bundled with the site.' },
      { title: 'Billing under one roof (Tebra)', body: 'Post-merger, practices can add Kareo billing/EHR from the same vendor — a bigger footprint than ours.' },
    ],
    ourStrengths: [
      { glyph: 'tooth', title: 'Dental-native, not multi-specialty', body: 'A curated dental services library, visit-type booking rules, dental intake, and PMS recall — versus a generic healthcare template.' },
      { glyph: 'pencil', title: 'Edit it yourself, no agency queue', body: 'The Website Studio changes your live site by clicking it. Tebra describes a custom website built to reflect your brand; ask how a change gets made after launch.' },
      { glyph: 'cart', title: 'Store, memberships, and dental PMS sync', body: 'An online shop, in-house membership plans, and two-way dental PMS sync through the NexHealth bridge — none of which Tebra lists.' },
      { glyph: 'calendar', title: 'Month-to-month, published price', body: `${RATE_MONTHLY}/mo on the page with no annual contract, versus a quote-only price and the annual agreements reviewers report.` },
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
      contract: ['partial', 'Terms not stated on its site; reviewers report annual contracts'],
    }),
    bottomLine:
      'If you run a medical practice and want websites, reputation and an EHR from one established vendor, Tebra is credible. If you run a dental practice and want a platform built for it — one you edit yourself, with a store, memberships, and dental PMS sync, month-to-month at a published price — that’s DreamCRM.',
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
  const leadTitles = c.theirStrengths.map((s) => s.title.toLowerCase()).join(', ')
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
      a: `Yes. DreamCRM is month-to-month with a ${TRIAL.name}, so you can run it alongside ${c.name} before deciding. Patients import via CSV, PMS sync connects through the NexHealth bridge, and you keep your existing phone system — and if you ever leave, your content exports with you.`,
    },
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
