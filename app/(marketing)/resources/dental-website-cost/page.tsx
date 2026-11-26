import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import {
  WAYS_TO_BUY,
  WEBSITE_COST_REFERENCES,
  WEBSITE_SELLERS,
  ourWebsiteAnswers,
  threeYearSum,
  type WayToBuy,
  type WebsiteSeller,
} from '@/lib/marketing/website-costs'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, GuideSourceLink, ScriptCard } from '../guide-ui'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'

const guide = getResourceGuide('dental-website-cost')

/** Ours, resolved rather than typed — the same read the shell makes. */
const PLAN = getQuotedPlan()

/**
 * WHAT A DENTAL WEBSITE COSTS — organic queue item 5. The one guide that
 * prices something we sell beside other people who sell it. What it is held
 * to (`tests/marketing/website-cost-guide.test.tsx`):
 *
 * 1. EVERY OUTSIDE PRICE IS A LINE FROM THE SELLER'S OWN PAGE, rendered from
 *    `lib/marketing/website-costs.ts` and never retyped here. The page has no
 *    adjective of its own about anybody's product and never says of a seller
 *    that it publishes no price.
 *
 * 2. THE ARITHMETIC IS SHOWN, and labelled as ours. Each row is a seller's
 *    own starting figures over three years, written out so it can be checked.
 *
 * 3. IT SAYS WE ARE NOT THE CHEAPEST, because on its own numbers a site
 *    builder is. A page that priced its publisher first would be worth
 *    nothing, and the test holds the sentence.
 *
 * 4. THE TRADE-PRESS FIGURE IS A SELLER'S, said in the magazine's own words
 *    about the author's firm.
 *
 * 5. OUR OWN ANSWERS ARE READ FROM THE CONFIG, THE LISTING KIT AND THE TERMS
 *    (`ourWebsiteAnswers`). Including the unflattering one: the site does not
 *    export.
 *
 * 6. IT SAYS NOTHING ABOUT WHAT A PATIENT'S PAYMENT COSTS, on purpose, and the
 *    rows that total our own price are called "the subscription". What the
 *    platform keeps of a payment was found, while this page was being
 *    fact-checked, to be stated nowhere a buyer reads; saying it is a pricing
 *    statement and so the owner's (`docs/organic-go-live.md` Part 8, row 7).
 *    Until that is ruled, this page neither states a fee nor says there is
 *    none. The question about paying online comes back with the ruling.
 */
const REF = WEBSITE_COST_REFERENCES
const OURS = ourWebsiteAnswers()
const ORDER: readonly WayToBuy[] = ['builder', 'template', 'custom']

/** The lowest monthly price any listed plan showed — for the opening line. */
const LOWEST_PLAN = Math.min(...WEBSITE_SELLERS.flatMap((s) => (s.plans ?? []).map((p) => p.perMonth)))

export const metadata = pageMetadata({
  title: 'How much does a dental website cost? Published prices, read and dated',
  description: guide?.description ?? '',
  path: '/resources/dental-website-cost',
  type: 'article',
})

/**
 * One seller: its plans, its own lines, the page they came from, the day.
 * Each quoted line sits on a line of its own — six quotations run together in
 * one paragraph read as one long sentence nobody said.
 */
function Seller({ s }: { s: WebsiteSeller }) {
  return (
    <span>
      <strong>{s.name}.</strong>{' '}
      {s.plans && (
        <>
          Its plans, {s.plansShown}: {s.plans.map((p) => `${p.name} at ${usd(p.perMonth)}/mo`).join(', ')}.{' '}
        </>
      )}
      {s.offerShown && <>An offer marked “{s.offerShown}” was showing beside some of them that day. </>}
      Read {formatCheckedOn(s.source.readOn)} against <GuideSourceLink source={s.source} />:
      {s.lines.map((l) => (
        <span key={`${l.under ?? ''}${l.text}`} className="mt-1 block pl-3">
          {`${l.under ? `${l.under}: ` : ''}“${l.text}”`}
        </span>
      ))}
    </span>
  )
}

export default function WebsiteCostGuide() {
  if (!guide) notFound()
  const rows = [
    ...WEBSITE_SELLERS.map((s) => `${s.name}, ${s.threeYears.what}: ${threeYearSum(s.threeYears)}`),
    `${MARKETING.productName}, the subscription, paid monthly: 36 × ${usd(PLAN.price)} = ${usd(PLAN.price * 36)}`,
    `${MARKETING.productName}, the subscription, paid annually: 3 × ${usd(PLAN.annualPrice)} = ${usd(PLAN.annualPrice * 3)}`,
  ]

  return (
    <GuideShell
      guide={guide}
      note="Every price links to its source"
      close={{
        eyebrow: 'And ours',
        title: 'Our price is on the page',
        body: (
          <>
            {MARKETING.productName} is {usd(PLAN.price)}/mo, flat, month-to-month, after {TRIAL.days} days free. The
            website is part of it, along with online booking, the patient portal and the rest of the front office. A
            card starts the trial and is not charged until it ends.
          </>
        ),
      }}
    >
      <GuideP>
        The honest answer is a range too wide to use: from {usd(LOWEST_PLAN)} a month on a site builder you run
        yourself to five figures for a custom build. So this page does not give one number. It gives what the
        American Dental Association says to expect, what sellers publish on their own websites with the day each
        was read, the same three years worked out for each way of buying, and the questions that make two quotes
        comparable.
      </GuideP>
      <GuideP>
        We sell a dental website ourselves, as part of a larger product, so read this the way you would read any
        seller: check the links. Where a date here is old, trust the seller’s page over ours.
      </GuideP>

      <GuideH2>What the ADA says a dental website costs</GuideH2>
      <GuideP>
        The American Dental Association’s guidance for practices puts it in a sentence: “{REF.ada.says.range}” For
        handing the whole job to a marketing firm, it says: “{REF.ada.says.marketer}” And as a budget: “
        {REF.ada.says.budget}” (<GuideSourceLink source={REF.ada.source} />, read{' '}
        {formatCheckedOn(REF.ada.source.readOn)}; the page does not say when it was written).
      </GuideP>
      <GuideP>
        A dental trade magazine printed a wider range in an article dated {REF.tradePress.source.pageSays}: “
        {REF.tradePress.says.range}” and “{REF.tradePress.says.average}” (
        <GuideSourceLink source={REF.tradePress.source} />
        ). Its author, {REF.tradePress.author}, founded a firm the magazine describes this way: “
        {REF.tradePress.says.firm}” It is a seller’s estimate, and it is labelled as one here.
      </GuideP>

      <GuideH2>Three ways to buy a dental website, and what sellers publish</GuideH2>
      <GuideP>
        The prices below are lines from each seller’s own page, as it showed them on the day named. None of the words
        inside quotation marks is ours.
      </GuideP>
      {ORDER.map((way) => (
        <div key={way}>
          <GuideP>
            <strong>{WAYS_TO_BUY[way].title}.</strong> {WAYS_TO_BUY[way].means}
          </GuideP>
          <GuideList items={WEBSITE_SELLERS.filter((s) => s.way === way).map((s) => <Seller key={s.id} s={s} />)} />
        </div>
      ))}
      <GuideNote>
        This is not every seller. It is the ones whose own pages showed a price on the day we looked, which is the
        only kind of price this page prints. A seller’s page is not a quote, and any of them may offer you different
        terms than it publishes.
      </GuideNote>

      <GuideH2>The same three years, three ways</GuideH2>
      <GuideP>
        A monthly fee and a one-time price cannot be compared until they cover the same stretch of time. Here is
        each seller’s starting price carried over three years. It is our arithmetic on their numbers, and nothing
        else is in it: no writing, photography, extra pages, taxes or offers.
      </GuideP>
      <ScriptCard label="Worked example · three years at each published starting price">
        {rows.join('\n\n')}
      </ScriptCard>
      <GuideP>
        On these numbers, a site builder is the cheapest way to have a website, and {MARKETING.productName} is not.
        What the totals leave out is who writes the pages, who keeps them current, and what a patient can do once
        they are on the site. The questions below are for that. (What the rest of a front office costs, vendor by
        vendor, is{' '}
        <Link href="/resources/dental-software-pricing" className="font-semibold text-teal-700 hover:underline">
          a guide of its own
        </Link>
        .)
      </GuideP>

      <GuideH2>The questions that make two website quotes comparable</GuideH2>
      <GuideList
        items={[
          <><strong>What is the total over three years?</strong> The setup fee, plus thirty-six months of everything billed monthly. Ask for it as one number.</>,
          <><strong>Who writes the pages?</strong> If the price includes writing, ask how many pages, and what one more costs.</>,
          <><strong>How many changes are included, and what does the next one cost?</strong> A new team member, new hours, a new service: a practice’s site changes all year.</>,
          <>
            <strong>Who registers the domain, and in whose name?</strong> The ADA’s page is plain about why it matters: “
            {REF.ada.says.agreement}”
          </>,
          <><strong>If you leave, what do you take with you?</strong> The domain, the words, the photos, the design. Ask about each one before you sign.</>,
          <><strong>Is it month-to-month, or a term?</strong> If a term: how long, and what ending it early costs.</>,
          <><strong>Can a patient book and fill in forms on it?</strong> If so, ask whether that is in the price or a separate product.</>,
        ]}
      />

      <GuideH2>The same questions, answered for our own</GuideH2>
      <GuideList
        items={[
          <>
            <strong>The total over three years:</strong> {usd(PLAN.price * 36)} paid monthly, or{' '}
            {usd(PLAN.annualPrice * 3)} paid annually. That is the subscription, which covers the rest of the front
            office as well as the website. {OURS.pricing}
          </>,
          <><strong>Who writes the pages:</strong> A first draft of the whole site is written from a short interview when you sign up. After that the words are yours to change.</>,
          <><strong>Changes:</strong> You make them yourself by clicking the page, as often as you like. There is no queue and no fee for a change.</>,
          <><strong>The domain:</strong> You connect a domain you already own, and it stays yours at your registrar. Until you do, the site runs at an address on our domain.</>,
          <>
            <strong>If you leave:</strong> Our terms say “{OURS.yourContent}” and “{OURS.whenItEnds}” The site itself runs
            on our platform: it does not move to another host, and there is no export of it today. Keep your own
            copies of your photos.
          </>,
          <>
            <strong>The term:</strong> Month-to-month. From the same terms: “{OURS.cancelling}”
          </>,
          <><strong>Booking and forms:</strong> Online booking, intake forms and the patient portal are part of the same plan.</>,
        ]}
      />
    </GuideShell>
  )
}
