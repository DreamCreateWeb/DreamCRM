import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import {
  COMPARISONS,
  contractAnswer,
  formatCheckedOn,
  latestPricingCheck,
  publishesPrice,
  searchName,
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
 * WHY IT IS WORTH A PAGE. Half of the eight vendors we compare ourselves with
 * show a buyer no price on their pricing page (this said "six of the eight
 * published no price at all" for a day: the read of 2026-11-24 missed Podium's
 * script-drawn prices and Tebra's second pricing page, and the browser re-read
 * of the 25th corrected both — the account is in
 * `tests/marketing/comparison-pricing-check.test.tsx`). The searches a buyer types —
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

/**
 * A "partial" row is one of two different things, and the line beside it says
 * which: the vendor's pages did not state its terms ("Not clear"), or they
 * describe a month-to-month option and what comes with it. Calling the second
 * kind "Not clear" was false of a vendor whose pages are plain about a
 * minimum term and a notice period. `tests/marketing/pricing-guide.test.tsx`
 * names each partial vendor's word, so a new one is a decision.
 */
function contractWord(answer: { value: MatrixValue; note: string }): string {
  if (answer.value !== 'partial') return CONTRACT_WORD[answer.value]
  return /not stated/i.test(answer.note) ? CONTRACT_WORD.partial : 'With conditions'
}

/**
 * What each word in the list above means — for the words the list USES, and
 * no others. Once every vendor's terms had been read from its own legal pages
 * nobody was "Not clear", and a key that went on explaining the word would be
 * explaining nothing on the page.
 */
function ContractKey({ words }: { words: readonly string[] }) {
  const used = new Set(words)
  const parts: string[] = []
  if (used.has(CONTRACT_WORD.partial)) {
    parts.push('“Not clear” means the vendor’s own pages did not state its terms on the day they were read.')
  }
  if (used.has('With conditions')) {
    parts.push('“With conditions” means its pages describe a month-to-month option and what comes with it.')
  }
  if (parts.length === 0) return null
  return <GuideP>{`${parts.join(' ')} Either way, ask for the terms in writing.`}</GuideP>
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
        says it costs. Of the {read.length} vendors below, {silent.length} show no price on their pricing page.
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
            {/* Where an entry's fees and contract terms were read out in
                full, the way straight to them — named for what a searcher
                would call it, which is also what the link is about. */}
            {c.pricingDetail && (
              <>
                {' '}
                <Link href={`/compare/${c.slug}#pricing`} className="text-teal-700 underline underline-offset-2">
                  {searchName(c)} pricing, line by line
                </Link>
                .
              </>
            )}
          </span>
        ))}
      />

      <GuideH2>Who publishes a price, and who makes you call</GuideH2>
      {publishers.length > 0 && (
        <GuideP>
          <strong>A price on their pricing page:</strong> {names(publishers)}.
        </GuideP>
      )}
      {silent.length > 0 && (
        <GuideP>
          <strong>No price on their pricing page:</strong> {names(silent)}. For these, each figure in the list above
          says where it came from — third-party reviewers, or some other corner of the vendor’s own site. It is not a
          price the vendor’s pricing page gives a buyer.
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
              <strong>{c.name}:</strong> {contractWord(answer)}
              {answer.note ? ` — ${answer.note}` : ''}.
            </span>
          )
        })}
      />
      <ContractKey words={read.map((c) => contractWord(contractAnswer(c)))} />

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

      <GuideP>
        What a practice website alone costs, from a site builder to an agency build, is{' '}
        <Link href="/resources/dental-website-cost" className="text-teal-700 underline underline-offset-2">
          a guide of its own
        </Link>
        , read the same way.
      </GuideP>

      <GuideNote>
        We make one of the products in this market, which is a reason to check our work rather than take it. Each line
        above links to the page it was read from. This is a record of what those pages said on the days named; it is
        not a quote, and a vendor may offer you different terms than it publishes.
      </GuideNote>
    </GuideShell>
  )
}
