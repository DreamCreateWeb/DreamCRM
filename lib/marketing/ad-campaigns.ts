// The paid-search campaign DreamCRM runs for itself, as DATA.
//
// WHY AN AD CAMPAIGN LIVES IN THE REPO. An ad is the one piece of marketing
// copy that is typed into somebody else's system and then forgotten, and it
// quotes the three things on this site that change: the price, the trial
// length, and which competitor pages have actually been checked. Everything
// else that quotes them resolves them (`getQuotedPlan`, `TRIAL_DAYS`, the
// comparison registry's `pricingChecked`); an ad typed by hand would be the
// one place left to quote the old price after it moved, or to send paid clicks
// to a comparison page nobody has re-read. So the campaign is built here from
// the same sources, a test holds every platform limit and honesty rule, and
// `docs/ads-go-live.md` carries the rendered result for pasting into Google
// Ads — the test fails when the two drift.
//
// THE RULES THE SHAPE ENFORCES (docs/marketing-engine.md Parts 3, 10.3, 11):
//  - A rival's NAME is a keyword and never ad text. Google allows the first
//    and restricts the second; `tests/marketing/ad-campaign.test.ts` greps the
//    copy for every name in the comparison registry.
//  - EXACT match only. With Google's AI Max on (the default for a new Search
//    campaign since 2026) an "exact" keyword is not exact, so the brief opens
//    with the switches to turn off; the data here can only promise the
//    keywords themselves are bracketed.
//  - PAID CLICKS LAND ONLY ON A PAGE SOMEBODY RE-READ. An ad group exists for
//    a vendor only while its registry entry carries a dated `pricingChecked`.
//    Let the check lapse and the ad group disappears from the brief.
//  - No claim the product cannot back today: no texting, no HIPAA word, no
//    former price, no results promise — and, since the 2026-11-23 ruling
//    (a card is required to sign up), no "no card" in any spelling.

import { COMPARISONS, type VendorComparison } from './comparisons'
import { usd } from './site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { TRIAL_DAYS } from '@/lib/trial'
import { campaignKeyOf } from '@/lib/marketing-attribution'

/** Google's responsive-search-ad limits. */
export const HEADLINE_MAX = 30
export const DESCRIPTION_MAX = 90
export const PATH_MAX = 15
export const SITELINK_TEXT_MAX = 25
export const CALLOUT_MAX = 25

export interface AdGroup {
  /** The comparison registry slug this group belongs to. */
  vendorSlug: string
  name: string
  /** Site-relative landing page. */
  landingPath: string
  /** Bare keyword text; rendered in [brackets] — exact match. */
  keywords: string[]
}

export interface SearchCampaign {
  name: string
  /** The `utm_campaign` value, already in the rollup's key form. */
  campaignKey: string
  dailyBudgetUsd: number
  maxCpcUsd: number
  /** Appended to every click by Google; `{keyword}` is filled per click. */
  finalUrlSuffix: string
  adGroups: AdGroup[]
  headlines: string[]
  descriptions: string[]
  paths: [string, string]
  sitelinks: Array<{ text: string; path: string }>
  callouts: string[]
  /** Campaign-level negative keywords (phrase match). */
  negatives: string[]
}

/**
 * The searches worth paying for, per vendor: somebody weighing a switch or a
 * price. Names that are also ordinary words carry a qualifier ("weave" is a
 * hairstyle; "adit" is a mine entrance), because exact match still answers
 * close variants and a hair-salon search costs the same as a real one.
 *
 * A vendor absent from this map gets no ad group, whatever its page says.
 */
const KEYWORDS_BY_VENDOR: Record<string, string[]> = {
  weave: [
    'weave dental pricing',
    'weave software pricing',
    'weave dental alternative',
    'weave dental alternatives',
    'weave software alternatives',
    'weave dental competitors',
    'weave dental software cost',
    'getweave pricing',
  ],
  nexhealth: [
    'nexhealth pricing',
    'nexhealth cost',
    'nexhealth alternative',
    'nexhealth alternatives',
    'nexhealth competitors',
    'nexhealth vs weave',
  ],
  solutionreach: [
    'solutionreach pricing',
    'solutionreach cost',
    'solutionreach alternative',
    'solutionreach alternatives',
    'solutionreach competitors',
    'solution reach pricing',
  ],
}

/**
 * Searches that share a rival's name and nothing else. Phrase-match negatives
 * at campaign level: any query containing one never shows the ad.
 */
const NEGATIVES = [
  // People who already bought it, or want to work there.
  'login',
  'log in',
  'sign in',
  'support',
  'customer service',
  'phone number',
  'jobs',
  'careers',
  'salary',
  'stock',
  'investor',
  // "Weave" the hairstyle and the craft.
  'hair',
  'sew',
  'wig',
  'braids',
  'extensions',
  'closure',
  'salon',
  'basket',
  'fabric',
  'loom',
]

/** An ad group for every vendor whose page was re-read AND has keywords above. */
function adGroupsFrom(comparisons: readonly VendorComparison[]): AdGroup[] {
  return comparisons
    .filter((c) => c.pricingChecked && KEYWORDS_BY_VENDOR[c.slug])
    .map((c) => ({
      vendorSlug: c.slug,
      name: `${c.name} — alternative & pricing`,
      landingPath: `/compare/${c.slug}`,
      keywords: KEYWORDS_BY_VENDOR[c.slug] ?? [],
    }))
}

/**
 * The first campaign: exact-match competitor "alternative" and "pricing"
 * searches, landing on that competitor's comparison page.
 *
 * Budget and bid cap are the STARTING values of the 2026-11-23 plan ($50 a
 * day for two weeks, a click capped at $8) — the owner moves them in the
 * account; these are what the brief tells him to type on day one.
 */
export function googleCompetitorCampaign(comparisons: readonly VendorComparison[] = COMPARISONS): SearchCampaign {
  const price = `${usd(getQuotedPlan().price)}/mo`
  const trial = `${TRIAL_DAYS}-Day Free Trial`
  const name = 'Search — Competitor terms (exact)'
  const campaignKey = campaignKeyOf('competitor-exact')
  return {
    name,
    campaignKey,
    dailyBudgetUsd: 50,
    maxCpcUsd: 8,
    finalUrlSuffix: `utm_source=google&utm_medium=cpc&utm_campaign=${campaignKey}&utm_term={keyword}`,
    adGroups: adGroupsFrom(comparisons),
    headlines: [
      `Dental Front Office, ${price}`,
      trial,
      'Month-to-Month. No Contract.',
      'Website, Booking & Portal',
      'Keep the PMS You Already Run',
      'Published Price, No Sales Call',
      'Recall, Reviews & Reminders',
      'Built Only for Dental Offices',
      'See the Honest Comparison',
      'Online Booking Included',
      'One Plan. Everything Included.',
      'Patient Portal in Your Brand',
      'Start Free. Cancel Anytime.',
      'DreamCRM for Dental Practices',
      'Comparing Dental Software?',
    ],
    descriptions: [
      `Website, online booking, patient portal, reviews & recall in one system. ${price} flat.`,
      `Try everything free for ${TRIAL_DAYS} days. No contract, no setup fee, no sales call. Keep your PMS.`,
      'See a side-by-side comparison: pricing, features, and what each one does better.',
      'Built only for dental practices. Month-to-month, and you cancel from Settings.',
    ],
    paths: ['dental-software', 'compare'],
    sitelinks: [
      { text: 'See Pricing', path: '/pricing' },
      { text: 'Tour the Platform', path: '/product' },
      { text: 'Grade Your Practice Free', path: '/grade' },
      { text: 'All Comparisons', path: '/compare' },
    ],
    callouts: ['No Contract', 'No Setup Fee', `${trial}`, 'Published Pricing', 'Dental-Only'],
    negatives: NEGATIVES,
  }
}

/** Where a click from one ad group lands, as an absolute URL. */
export function landingUrl(group: AdGroup, origin: string): string {
  return `${origin.replace(/\/+$/, '')}${group.landingPath}`
}

/**
 * The campaign as the text somebody pastes into Google Ads — one block per
 * screen of the campaign builder, in the order the builder asks.
 *
 * Rendered into `docs/ads-go-live.md` between its two markers; the test
 * compares the file with this string, so the doc cannot quote an old price,
 * an old trial length, or an ad group whose page lost its check.
 */
export function renderCampaignBrief(campaign: SearchCampaign, origin = 'https://www.dreamcreatestudio.com'): string {
  const lines: string[] = []
  lines.push(`**Campaign name:** ${campaign.name}`)
  lines.push(`**Daily budget:** $${campaign.dailyBudgetUsd}`)
  lines.push(`**Bidding:** Maximize clicks, with a maximum cost-per-click bid limit of $${campaign.maxCpcUsd}`)
  lines.push('')
  lines.push('**Final URL suffix** (campaign settings → Campaign URL options):')
  lines.push('')
  lines.push('```')
  lines.push(campaign.finalUrlSuffix)
  lines.push('```')
  lines.push('')
  lines.push('**Negative keywords** (campaign level — paste as is; the quotes make them phrase match):')
  lines.push('')
  lines.push('```')
  for (const n of campaign.negatives) lines.push(`"${n}"`)
  lines.push('```')
  for (const group of campaign.adGroups) {
    lines.push('')
    lines.push(`#### Ad group: ${group.name}`)
    lines.push('')
    lines.push(`Final URL: \`${landingUrl(group, origin)}\``)
    lines.push('')
    lines.push('Keywords (the brackets make them exact match):')
    lines.push('')
    lines.push('```')
    for (const k of group.keywords) lines.push(`[${k}]`)
    lines.push('```')
  }
  lines.push('')
  lines.push('#### The ad (the same responsive search ad in every ad group; only the final URL changes)')
  lines.push('')
  lines.push(`Display path: \`${campaign.paths[0]}\` / \`${campaign.paths[1]}\``)
  lines.push('')
  lines.push('Headlines:')
  lines.push('')
  lines.push('```')
  for (const h of campaign.headlines) lines.push(h)
  lines.push('```')
  lines.push('')
  lines.push('Descriptions:')
  lines.push('')
  lines.push('```')
  for (const d of campaign.descriptions) lines.push(d)
  lines.push('```')
  lines.push('')
  lines.push('#### Assets (campaign level)')
  lines.push('')
  lines.push('Sitelinks:')
  lines.push('')
  for (const s of campaign.sitelinks) lines.push(`- ${s.text} → \`${origin}${s.path}\``)
  lines.push('')
  lines.push(`Callouts: ${campaign.callouts.join(' · ')}`)
  return lines.join('\n')
}
