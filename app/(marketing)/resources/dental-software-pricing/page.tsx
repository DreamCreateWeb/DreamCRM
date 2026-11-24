import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import {
  COMPARISONS,
  contractAnswer,
  formatCheckedOn,
  latestPricingCheck,
  publishesPrice,
  type MatrixValue,
  type VendorComparison,
} from '@/lib/marketing/comparisons'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote } from '../guide-ui'

/**
 * WHAT EACH VENDOR PUBLISHES ABOUT ITS OWN PRICE — the one guide in the
 * library that has no words of its own about the thing it reports.
 *
 * Every price, contract answer, source and date on this page is READ FROM THE
 * COMPARISON REGISTRY (`lib/marketing/comparisons.ts`), where each line was
 * written from the vendor's own website on a stated day. Nothing here retypes
 * one: a second copy of a competitor's price is exactly how a page comes to
 * disagree with the vendor it is quoting — which is the defect the registry's
 * `pricingChecked` field exists to end. Re-read a vendor, change its entry,
 * and this page, that vendor's comparison page, the sitemap's date and the
 * search notice all move together.
 *
 * WHY IT IS WORTH A PAGE. On 2026-11-24 six of the eight vendors we compare
 * ourselves with published no price at all, and the searches a buyer types —
 * "{vendor} pricing" — were answered by review marketplaces quoting numbers
 * nobody dated (docs/research/marketing-engine-2026-11). A page that says,
 * per vendor, "its own site shows this, on this day, here is the link" is a
 * fact nobody else in the category has a reason to publish.
 *
 * WHAT IT MUST NOT BECOME. Not a ranking — we make one of these products, so
 * a list that put us first would be worth nothing and the page says so. Our
 * own price is in its own section, resolved like every other copy of it. And
 * no number appears for a vendor whose site does not state one, except
 * attributed to the third parties who reported it — the registry's rule,
 * inherited whole.
 */

const guide = getResourceGuide('dental-software-pricing')
const PLAN = getQuotedPlan()
const LATEST = latestPricingCheck()

export const metadata = pageMetadata({
  title: 'Dental front-office software pricing: what each vendor publishes',
  description: guide?.description ?? '',
  path: '/resources/dental-software-pricing',
  type: 'article',
})

const CONTRACT_WORD: Record<MatrixValue, string> = {
  yes: 'Yes',
  no: 'No',
  partial: 'Not clear',
}

function names(list: readonly VendorComparison[]): string {
  const all = list.map((c) => c.name)
  if (all.length <= 1) return all.join('')
  return `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`
}

/** A citation: opens the vendor's own page, and is not an endorsement. */
function Source({ c }: { c: VendorComparison }) {
  if (!c.pricingChecked) return null
  return (
    <>
      {' '}
      Read {formatCheckedOn(c.pricingChecked.on)} against{' '}
      <a
        href={c.pricingChecked.url}
        target="_blank"
        rel="nofollow noopener noreferrer"
        className="text-teal-700 underline underline-offset-2"
      >
        {c.pricingChecked.source}
      </a>
      .
    </>
  )
}

export default function DentalSoftwarePricingGuide() {
  if (!guide) notFound()
  // Only what somebody actually read. An entry with no dated check has no
  // place on a page whose whole claim is "read on this day, from this page".
  const read = COMPARISONS.filter((c) => c.pricingChecked)
  const publishers = read.filter(publishesPrice)
  const silent = read.filter((c) => !publishesPrice(c))

  return (
    <GuideShell
      guide={guide}
      note="Every line links to its source"
      close={{
        eyebrow: 'And ours',
        title: 'Our price is on the page',
        body: (
          <>
            {MARKETING.productName} is {usd(PLAN.price)}/mo, flat, month-to-month, after {TRIAL.days} days free. A card
            starts the trial and is not charged until it ends.
          </>
        ),
      }}
    >
      <GuideP>
        Most dental front-office software is sold on a demo call, and the price arrives at the end of it. So we read
        each vendor’s own website and wrote down what it says about price and contract terms — not what a review site
        says it costs. Of the {read.length} vendors below, {silent.length} publish no price at all.
      </GuideP>
      <GuideP>
        Every line names the page it came from and the day it was read
        {LATEST ? `; the most recent read was ${formatCheckedOn(LATEST)}` : ''}. Vendors change their pages. Where a
        date here is old, trust the vendor’s page over ours.
      </GuideP>

      <GuideH2>What each vendor’s own site says</GuideH2>
      <GuideList
        items={read.map((c) => (
          <span key={c.slug}>
            <strong>{c.name}.</strong> {c.reportedPricing}.<Source c={c} />{' '}
            <Link href={`/compare/${c.slug}`} className="text-teal-700 underline underline-offset-2">
              The full comparison
            </Link>
            .
          </span>
        ))}
      />

      <GuideH2>Who publishes a price, and who makes you call</GuideH2>
      {publishers.length > 0 && (
        <GuideP>
          <strong>A price on their own site:</strong> {names(publishers)}.
        </GuideP>
      )}
      {silent.length > 0 && (
        <GuideP>
          <strong>No price on their own site:</strong> {names(silent)}. For these, the figure in the list above is what
          third-party reviewers report, and is marked as that. It is not the vendor’s number.
        </GuideP>
      )}
      <GuideP>
        No published price is not a mark against a product. It does mean you cannot compare it with anything until
        somebody has your phone number.
      </GuideP>

      <GuideH2>Can you pay month to month?</GuideH2>
      <GuideList
        items={read.map((c) => {
          const answer = contractAnswer(c)
          return (
            <span key={c.slug}>
              <strong>{c.name}:</strong> {CONTRACT_WORD[answer.value]}
              {answer.note ? ` — ${answer.note}` : ''}.
            </span>
          )
        })}
      />
      <GuideP>
        “Not clear” means the vendor’s own pages did not state its terms on the day they were read. Ask for them in
        writing.
      </GuideP>

      <GuideH2>What to ask before a demo</GuideH2>
      <GuideList
        items={[
          <>
            <strong>What is the monthly price for one location, in writing?</strong> Before the call, not after it.
          </>,
          <>
            <strong>Is there a setup or onboarding fee?</strong> And is it charged again if you add a location.
          </>,
          <>
            <strong>Is it month-to-month or a term?</strong> If a term: how long, and how much notice ends it.
          </>,
          <>
            <strong>Which features are add-ons?</strong> Ask for the price of the bundle you would actually use, not the
            entry plan.
          </>,
          <>
            <strong>Does the price change after the first year?</strong> A first-year discount is a second-year
            increase.
          </>,
          <>
            <strong>Are there usage fees?</strong> Per message, per call minute, per check — whatever the product
            meters.
          </>,
        ]}
      />

      <GuideNote>
        We make one of the products in this market, which is a reason to check our work rather than take it. Each line
        above links to the page it was read from. This is a record of what those pages said on the days named; it is
        not a quote, and a vendor may offer you different terms than it publishes.
      </GuideNote>
    </GuideShell>
  )
}
