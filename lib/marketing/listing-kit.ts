import { COMPARISONS } from '@/lib/marketing/comparisons'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { INCLUDED_MONTHLY_INSURANCE_CHECKS } from '@/lib/insurance-eligibility'
import { getQuotedPlan } from '@/lib/stripe-config'

/**
 * THE LISTING KIT — the words that go on every profile we do not host.
 *
 * WHY THIS IS DATA. The evidence gathered for the 2026-11 marketing program
 * (docs/research/marketing-engine-2026-11/report.md) says what an AI
 * assistant or a search engine repeats about a product is mostly what OTHER
 * sites say about it: review marketplaces, directories, profiles. Those
 * pages are typed once into somebody else's form and then forgotten — which
 * is how a product ends up described at last year's price, with a trial it
 * no longer offers, on the pages buyers and assistants trust most. So the
 * copy lives here, built from the same values the site itself resolves (the
 * price, the trial, the insurance allowance, the comparison registry), and
 * `docs/organic-go-live.md` carries the rendered text between two markers.
 * `tests/marketing/listing-kit.test.ts` fails when they differ: a reprice or
 * a trial ruling changes this file's output, the test names the doc, and the
 * doc's own checklist says which outside profiles to go and correct.
 *
 * THE RULES THE COPY KEEPS (each one is a test):
 *  - "DENTAL" SITS BESIDE THE NAME, in every field. Other, unrelated products
 *    are called DreamCRM; a profile that says only the name sends a reader —
 *    or a model — to somebody else.
 *  - NOTHING THE PRODUCT DOES NOT DO. No compliance word (docs/COMPLIANCE.md),
 *    no texting, no phones — and the things we do not do are LISTED, because
 *    marketplace forms ask, and "not included" is a better answer on a
 *    profile than a buyer finding out on a demo.
 *  - THE TRIAL IS STATED WITH ITS CARD, and the price is the resolved one.
 *    The struck-through list price is deliberately absent: whether it may be
 *    advertised is an open owner ruling (docs/marketing-engine.md 11.5).
 *  - NO SUPERLATIVES. "Best", "leading", "#1" and "only" are claims a
 *    marketplace can ask us to substantiate and a reviewer can contradict.
 *  - OPEN DENTAL IS NOT NAMED. The sync runs through NexHealth, and Open
 *    Dental's own third-party page advises its customers against NexHealth
 *    products that claim to integrate with it (read 2026-11-23,
 *    docs/research/marketing-engine-2026-11/notes-12). The site's own copy
 *    still names Open Dental — that is an open owner ruling
 *    (docs/organic-go-live.md Part 8) — but a marketplace profile is typed
 *    into somebody else's form and is far harder to take back than a page of
 *    ours, so the kit names only the PMSs nobody disputes.
 */

export interface ListingField {
  id: string
  /** What a form usually calls this. */
  label: string
  /** The longest this may be, so it fits the common limit for such a field. */
  max: number
  text: string
}

export interface ListingKit {
  productName: string
  companyName: string
  website: string
  fields: ListingField[]
  /** For a form's feature checklist or "key features" box. */
  features: string[]
  /** What to answer "no" to — said plainly. */
  notIncluded: string[]
  /** For "alternatives to" / "compare with" fields. */
  alternativesTo: string[]
}

export function buildListingKit(origin = 'https://www.dreamcreatestudio.com'): ListingKit {
  const plan = getQuotedPlan()
  const price = `${usd(plan.price)}/month`
  const yearly = `${usd(plan.annualPrice)}/year`
  const name = MARKETING.productName

  const fields: ListingField[] = [
    {
      id: 'tagline',
      label: 'Tagline / headline',
      max: 60,
      text: MARKETING.tagline,
    },
    {
      id: 'one-line',
      label: 'One-line description',
      max: 160,
      text: `${name} is dental practice software in one system: website, online booking, patient portal, messages, reviews and recall, around the PMS you keep.`,
    },
    {
      id: 'short',
      label: 'Short description',
      max: 300,
      text:
        `${name} is the front-office platform for dental practices. One subscription covers the practice website, online booking, a patient portal in the practice’s own branding, one inbox for patient messages, review requests and recall. It works alongside the practice management system you already use.`,
    },
    {
      id: 'long',
      label: 'Full description',
      max: 1300,
      text: [
        `${name} is a front-office platform built only for dental practices. It brings together what a practice usually buys separately — the website, the booking widget, review requests, recall — in one system, and it works alongside the practice management system (PMS) a practice already runs rather than replacing it.`,
        `What is included: a practice website you edit by clicking the page; online booking; a patient portal in the practice’s own branding where patients confirm, reschedule, fill in forms and pay; one inbox for portal messages and patient email; review requests that feed the website’s testimonials; Google Business and social posting; recall and reactivation campaigns by email; intake forms; an online store and membership plans; insurance eligibility checks (${INCLUDED_MONTHLY_INSURANCE_CHECKS} a month included); and a careers page. It syncs with Dentrix, Eaglesoft and other dental PMSs through NexHealth.`,
        `What it is not: ${name} is not a practice management system — charts, procedures and claims stay in the PMS. It does not include phones, and it does not send text messages today.`,
        `Pricing is published: ${price}, month-to-month, or ${yearly} paid annually. There is a ${TRIAL.name}; a card starts it and is not charged until the trial ends.`,
      ].join('\n\n'),
    },
    {
      id: 'pricing',
      label: 'Pricing details',
      max: 300,
      text: `One plan for dental practices: ${price}, month-to-month, or ${yearly} paid annually. A ${TRIAL.name}; a card starts it and is not charged until the trial ends. No setup fee and no contract.`,
    },
    {
      id: 'audience',
      label: 'Who it is for / target customer',
      max: 200,
      text: 'Independent dental practices in the United States — general, pediatric and cosmetic — that want their website, booking, patient portal and patient communication in one system.',
    },
    {
      id: 'difference',
      label: 'What makes it different',
      max: 400,
      text:
        `Built only for dental practices, and priced on the page: ${price} for the whole platform, with no quote call. The practice website is part of the product, not a separate service. In the patient portal, a feature the practice turns off disappears for patients instead of leaving a dead link. And the listing above says what ${name} does not do.`,
    },
  ]

  return {
    productName: name,
    companyName: MARKETING.companyName,
    website: origin,
    fields,
    features: [
      'Dental practice website with an edit-in-place editor',
      'Online appointment booking',
      'Patient portal in the practice’s own branding',
      'Unified patient inbox (portal messages and email)',
      'Review requests and website testimonials',
      'Google Business Profile sync and social posting',
      'Recall and reactivation campaigns (email)',
      'Digital intake forms',
      'Online store and in-house membership plans',
      `Insurance eligibility checks (${INCLUDED_MONTHLY_INSURANCE_CHECKS} a month included)`,
      'Careers page and applicant tracking',
      'Dental PMS sync through NexHealth (Dentrix, Eaglesoft and more)',
    ],
    notIncluded: [
      'Practice management (charting, procedures, claims) — it works alongside your dental PMS',
      'VoIP phones or call answering',
      'Text messaging (SMS) — not available today',
    ],
    alternativesTo: COMPARISONS.map((c) => c.name),
  }
}

/** The kit as the Markdown block `docs/organic-go-live.md` carries. */
export function renderListingKit(kit: ListingKit = buildListingKit()): string {
  const lines: string[] = []
  lines.push(`**Product name:** ${kit.productName} — where a form allows a longer name, write "${kit.productName} (dental)"`)
  lines.push(`**Company / seller:** ${kit.companyName}`)
  lines.push(`**Website:** ${kit.website}`)
  lines.push('')
  for (const f of kit.fields) {
    lines.push(`**${f.label}** (${f.text.length} characters; keep under ${f.max})`)
    lines.push('')
    lines.push(...f.text.split('\n').map((l) => (l ? `> ${l}` : '>')))
    lines.push('')
  }
  lines.push('**Features** (tick these, or paste them as a list)')
  lines.push('')
  for (const feature of kit.features) lines.push(`- ${feature}`)
  lines.push('')
  lines.push('**Not included** (answer "no" to these wherever a form asks)')
  lines.push('')
  for (const item of kit.notIncluded) lines.push(`- ${item}`)
  lines.push('')
  lines.push(`**Alternatives to / compared with:** ${kit.alternativesTo.join(', ')}`)
  return lines.join('\n')
}
