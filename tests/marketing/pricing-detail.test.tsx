import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'

/**
 * THE PRICING, LINE BY LINE — `pricingDetail` in the comparison registry and
 * the section of `/compare/{vendor}` that renders it.
 *
 * WHY IT EXISTS. Three months of Search Console (the owner's export, read
 * 2026-11-25) showed the Tebra (PatientPop) page for "patientpop pricing" more
 * than for anything else — 240 showings — and the owner found it near the
 * bottom of the second page of results, under Tebra itself and the review
 * directories. Those results carry a star rating and a "starting at". None
 * reads out the vendor's own fee schedule and contract terms, which are
 * public, on the vendor's own site, on pages nobody quotes. This does.
 *
 * WHAT MAKES IT WORTH TRUSTING IS WHAT THESE HOLD:
 *
 *  1. Every line is the vendor's own statement, from ONE page per group, on
 *     the vendor's own site, read on a stated day.
 *  2. A third party's figure sits under that party's name, with that party's
 *     own caveat, and never on the vendor's site's authority.
 *  3. Sources that refused to be read are NAMED, and nothing is cited to them.
 *  4. Where their price is lower than ours, the page says so.
 *  5. An answer in the FAQ states no figure its lines do not, and carries its
 *     citation with it.
 *
 * Bounded to the comparison registry and the one page that renders it.
 */

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import ComparePage from '@/app/(marketing)/compare/[vendor]/page'
import {
  COMPARISONS,
  buildComparisonFaq,
  formatCheckedOn,
  publishesPrice,
  searchName,
  type VendorComparison,
} from '@/lib/marketing/comparisons'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { INCLUDED_MONTHLY_INSURANCE_CHECKS } from '@/lib/insurance-eligibility'
import { TERMS_OF_SERVICE } from '@/lib/marketing/legal'

const detailed = COMPARISONS.filter((c) => c.pricingDetail)
const plain = COMPARISONS.filter((c) => !c.pricingDetail)

/** The site a vendor's own facts must come from: the host its dated check names. */
function vendorSite(c: VendorComparison): string {
  return new URL(c.pricingChecked!.url).hostname.replace(/^www\./, '')
}

/**
 * Is this URL on the vendor's own site? The site, or a name under it: a
 * vendor's help centre and developer site are its own pages
 * (`help.nexhealth.com`, `synchronizer.nexhealth.com`), and they are where
 * NexHealth publishes the only prices it publishes. A look-alike that merely
 * ENDS with the name is not (`notnexhealth.com`), hence the dot.
 */
function onVendorSite(c: VendorComparison, url: string): boolean {
  const host = new URL(url).hostname.replace(/^www\./, '')
  return host === vendorSite(c) || host.endsWith(`.${vendorSite(c)}`)
}

/** Every money figure, percentage and day-count in a sentence. */
function figures(text: string): string[] {
  return text.match(/\$[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?%|\b\d+ days\b/g) ?? []
}

async function renderPage(slug: string) {
  return render(await ComparePage({ params: Promise.resolve({ vendor: slug }) }))
}

describe('the registry', () => {
  it('the entry the search data pointed at has one — and at least one entry does not, so both branches are real', () => {
    expect(detailed.map((c) => c.slug)).toContain('patientpop')
    // Weave: the largest name a dentist searches, read out on 2026-11-26.
    expect(detailed.map((c) => c.slug)).toContain('weave')
    // NexHealth: the first entry read out in full whose pricing page shows no
    // price at all. What it publishes is on two other sites of its own.
    expect(detailed.map((c) => c.slug)).toContain('nexhealth')
    // Solutionreach: read out on the day its "priced by quote" line turned
    // out to be wrong in its favour.
    expect(detailed.map((c) => c.slug)).toContain('solutionreach')
    // ALL EIGHT, as of 2026-11-26. "At least one entry has none" stood here
    // while that was true, so that the page's other branch was a real entry.
    // It is a planted one now (the last test in this file): an entry added
    // tomorrow without a read still has to render without the section.
    expect(plain).toEqual([])
    expect(detailed).toHaveLength(COMPARISONS.length)
  })

  /**
   * NEXHEALTH, PINNED — and the reason rule 4 below has two branches.
   *
   * Its pricing page is a product picker and a form: no number. The search of
   * its own domain that the "no price published" rule requires (CLAUDE.md) is
   * what found the rest: a help-centre article that prices extra texts,
   * extra insurance checks and patient payments, a second that describes
   * annual billing, and a developer site that prices the API per call. So
   * the entry says "no subscription price" and then prints what IS priced,
   * each under the page it came from. Read 2026-11-26.
   */
  it('NexHealth: no subscription price, and the pages where it does publish a number or a term', () => {
    const nx = COMPARISONS.find((c) => c.slug === 'nexhealth')!
    const d = nx.pricingDetail!
    const line = (group: string, label: string) =>
      d.groups.find((g) => g.id === group)!.lines.find((l) => l.label === label)!.value

    // The pricing page: no number, its own words about billing and leaving.
    expect(publishesPrice(nx)).toBe(false)
    expect(line('the-subscription', 'The price')).toBe(
      'None on the page: “Get pricing for your practice”, a choice of products and a form',
    )
    expect(line('the-subscription', 'Custom plans')).toBe('“Custom plans available. Contact us to discuss your needs.”')
    expect(line('the-subscription', 'Billing options')).toBe(
      '“When you choose the month-to-month option, you’ll be charged every month. For our yearly subscription, you’ll pay the full year up front.”',
    )
    expect(line('the-subscription', 'Cancellation fees')).toBe('“There are no cancellation fees.”')
    expect(line('the-subscription', 'Ending an annual contract')).toBe('“provide 90 days prior notice to not renew”')
    expect(JSON.stringify(d.groups.find((g) => g.id === 'the-subscription')!.lines)).not.toMatch(/\$\d/)

    // The help centre: the three fees, to the cent.
    expect(line('usage-and-overage-fees', 'Extra campaign texts')).toMatch(/^\$0\.012 per SMS message/)
    expect(line('usage-and-overage-fees', 'Campaign texts included')).toMatch(/^5,000 SMS messages per location every month/)
    expect(line('usage-and-overage-fees', 'Insurance verifications included')).toMatch(/^800 a month/)
    expect(line('usage-and-overage-fees', 'Extra verifications')).toMatch(/^\$0\.20 each/)
    expect(line('usage-and-overage-fees', 'Patient payments')).toBe(
      '“A payment processing fee of 2.9% + $0.30 is deducted for each patient payment transaction.”',
    )
    // What a payment costs BY METHOD is in another article, found when the
    // help centre's own sitemap (141 articles) was read on 2026-11-26.
    const pay = d.groups.find((g) => g.id === 'patient-payments')!
    expect(pay.lines.slice(0, 4).map((l) => l.value)).toEqual([
      '“In person (terminal): 2.6% + $0.07 per transaction”',
      '“Online and text-to-pay: 2.9% + $0.30 per transaction”',
      '“Pay Later with Affirm: 6% + $0.30 per transaction”',
      '“An expedited payout schedule is available for a 0.2% increase to your processing rates.”',
    ])
    // Their payment fees are printed and are nobody's search answer: this
    // site does not yet state its own (`docs/organic-go-live.md` Part 8, row
    // 7), so nothing of ours is set beside them either.
    expect(pay.question).toBeUndefined()
    expect(d.groups.find((g) => g.id === 'usage-and-overage-fees')!.answer).not.toMatch(/payment/i)
    expect(d.versusUs).not.toMatch(/payment|processing|card fee|surcharg/i)

    // LEAVING. Its pricing page says "month-to-month" and "no cancellation
    // fees". Its help centre and its agreement say what that comes with: a
    // minimum of three billing cycles (ninety days), thirty days' notice,
    // and an annual term that renews itself. The page printed the first and
    // not the second until its sitemap was read.
    expect(line('cancelling', 'Month-to-month: the minimum')).toBe(
      '“All month-to-month subscriptions include a minimum commitment of your first 3 billing cycles.”',
    )
    expect(line('cancelling', 'Month-to-month: notice')).toBe(
      '“you must provide written notice at least 30 days before your next invoice date”',
    )
    expect(line('cancelling', 'Annual: if the notice is late')).toBe(
      '“your subscription will automatically renew for another 12-month term under the same terms”',
    )
    expect(line('the-agreement', 'Month-to-month')).toBe('“For month-to-month agreements, the minimum initial term is 90 days.”')
    expect(line('the-agreement', 'Refunds')).toBe(
      '“Except as specified in an Order or the Documentation, payment obligations are non-cancelable and non-refundable.”',
    )
    expect(line('the-agreement', 'Paying an invoice by card')).toMatch(
      /^“Invoices paid by payment cards and paper checks may incur a processing fee of 2\.9% \+ \$0\.30 per transaction/,
    )
    expect(line('the-agreement', 'Late payment')).toBe('Interest “at 1.5% per month (or the maximum rate permitted by law, if lower)”')
    // The comparison says it, and what it says of us is what our Terms say.
    expect(d.versusUs).toMatch(/a minimum of three billing cycles and 30 days’ notice/)
    expect(TERMS_OF_SERVICE.sections.find((s) => s.id === 'billing')!.paragraphs![1]).toMatch(/^You can cancel at any time/)

    // WHAT ITS OWN SITE SAYS IT IS. The table called its patient pages a
    // partial portal and said it sells no phones. Its site says, in so many
    // words, that it has no patient portal; and it has a page for a phone
    // product.
    const row = (starts: string) => nx.matrix.find((r) => r.feature.startsWith(starts))!
    expect([row('Patient portal').vendor, row('Patient portal').vendorNote]).toEqual([
      'no',
      'Its own site says “NexHealth doesn’t have a patient portal.”',
    ])
    expect(row('VoIP phones').vendor).toBe('partial')
    expect(row('VoIP phones').vendorNote).toContain('“Mobile app, call routing, ringtones based on caller type, reports”')
    expect(row('Month-to-month').vendor).toBe('partial')
    expect(row('Month-to-month').vendorNote).toMatch(/a minimum of three billing cycles/)
    expect(JSON.stringify(nx)).not.toMatch(/NexHealth-branded patient pages|run under its own brand/)

    // Annual billing, in its own arithmetic.
    expect(line('paying-annually', 'Switching to annual')).toBe('“a 12-month subscription (for the price of 11!)”')

    // The developer API is priced, and is labelled as not a practice's price.
    const api = d.groups.find((g) => g.id === 'developer-api')!
    expect(api.title).toMatch(/not a practice’s subscription/)
    expect(line('developer-api', 'Builder')).toMatch(/^\$0\.10 per API call/)
    expect(line('developer-api', 'Webhooks')).toBe('$0.05 per delivery')

    // Where each group was read: three sites, all NexHealth's own.
    expect(d.groups.map((g) => [g.id, new URL(g.source.url).hostname])).toEqual([
      ['the-subscription', 'www.nexhealth.com'],
      ['usage-and-overage-fees', 'help.nexhealth.com'],
      ['patient-payments', 'help.nexhealth.com'],
      ['paying-annually', 'help.nexhealth.com'],
      ['cancelling', 'help.nexhealth.com'],
      ['the-agreement', 'www.nexhealth.com'],
      ['developer-api', 'synchronizer.nexhealth.com'],
    ])
    expect(pay.source.pageSays).toBe('September 22, 2026')
    expect(d.groups.find((g) => g.id === 'cancelling')!.source.pageSays).toBe('September 23, 2026')
    expect(d.groups.find((g) => g.id === 'the-agreement')!.source.pageSays).toBe('Version: Oct. 27, 2026')
    // The two help articles carry their own dates, as the pages state them.
    expect(d.groups.find((g) => g.id === 'usage-and-overage-fees')!.source.pageSays).toBe('Updated this week')
    expect(d.groups.find((g) => g.id === 'paying-annually')!.source.pageSays).toBe('September 28, 2026')

    // No third party's figure — in the section OR on the entry's top line,
    // which used to carry one nobody could name the source of.
    expect(d.reported).toEqual([])
    expect(nx.reportedPricing).not.toMatch(/third-party|reviews report/)
    // And what is in THEIR favour is said: more included checks, and texting.
    expect(d.versusUs).toMatch(/shows no subscription price/)
    expect(d.versusUs).toMatch(/in NexHealth’s favour/)
    expect(d.versusUs).toMatch(/800 checks a month/)
    expect(d.versusUs).toMatch(/does not send today/)
  })

  /**
   * SOLUTIONREACH, PINNED — and a correction in its favour.
   *
   * The registry said "every package priced by quote". Its main pricing page
   * does send every package to a quote. A second pricing page on its own
   * site has a checkout, and prints four prices, each two ways (billed yearly
   * and billed monthly). The search of its own domain that the rule requires
   * found it on 2026-11-26; the read of the 25th had stopped at the page the
   * menu links to. The contract terms are its Master Service Agreement's.
   */
  it('Solutionreach: the prices its checkout page prints, and the agreement’s clauses on price and renewal', () => {
    const sr = COMPARISONS.find((c) => c.slug === 'solutionreach')!
    const d = sr.pricingDetail!
    const line = (group: string, label: string) =>
      d.groups.find((g) => g.id === group)!.lines.find((l) => l.label === label)!.value

    // The four packages, each at both prices.
    expect(publishesPrice(sr)).toBe(true)
    expect(line('published-prices', 'Patient Communications, Essentials')).toMatch(/^\$199\/mo billed yearly, or \$219\/mo billed monthly/)
    expect(line('published-prices', 'Patient Communications & Retention, Plus')).toMatch(/^\$249\/mo billed yearly, or \$279\/mo billed monthly/)
    expect(line('published-prices', 'Revenue Cycle Messaging, Essentials')).toMatch(/^\$199\/mo billed yearly, or \$219\/mo billed monthly/)
    expect(line('published-prices', 'Revenue Cycle Messaging, Plus')).toMatch(/^\$349\/mo billed yearly, or \$379\/mo billed monthly/)
    expect(line('published-prices', 'The revenue-cycle packages')).toMatch(/OPTIONAL/)
    expect(line('published-prices', 'Paying yearly')).toBe('“Save up to 10% with annual plans”')

    // The page its menu links to says something else, and both are printed.
    expect(line('the-main-pricing-page', 'The headline')).toBe('“Pricing starts at $199”')
    expect(line('the-main-pricing-page', 'Its packages')).toMatch(/Patient Connect, Practice Efficiency and Practice Growth, each with a “Request a Quote” button/)
    expect(line('the-main-pricing-page', 'Contract options')).toBe('“We offer yearly contract options.”')

    // The agreement: price changes, refunds, late interest — its own words.
    expect(line('fees-and-price-changes', 'Price changes')).toBe(
      '“Company may modify the License Fees associated with any product or service at any time upon reasonable notice.”',
    )
    expect(line('fees-and-price-changes', 'Refunds')).toBe('“All fees paid are non-refundable.”')
    expect(line('fees-and-price-changes', 'Late payment')).toContain(
      '“one and one-half percent (1.5%) per month or the highest rate allowed by applicable law, whichever is lower”',
    )
    // Renewal: automatic, a year at a time, thirty days' written notice.
    expect(line('the-contract', 'Renewal')).toMatch(/“for successive additional one-year periods”/)
    expect(line('the-contract', 'To stop a renewal')).toMatch(/“at least thirty \(30\) days prior to the end of the then-current”/)

    // Five pages, all its own, found by reading the list of pages its own
    // sitemap publishes (86 of them) and searching each one for a price. A
    // read that stopped at the two pricing pages missed two more that print
    // figures: a dated offer, and the fee schedule in its payments agreement.
    expect(d.groups.map((g) => [g.id, new URL(g.source.url).pathname])).toEqual([
      ['published-prices', '/pricing-package-with-checkout'],
      ['the-main-pricing-page', '/pricing'],
      ['practice-complete-offer', '/practice-complete-offer-terms'],
      ['patient-payments', '/legal/sr-pay-agreement'],
      ['fees-and-price-changes', '/msa-terms'],
      ['the-contract', '/msa-terms'],
    ])
    for (const g of d.groups) expect(new URL(g.source.url).hostname).toBe('www.solutionreach.com')
    // A page's own date is given where the page states one, and only there.
    expect(d.groups.map((g) => [g.id, g.source.pageSays ?? null])).toEqual([
      ['published-prices', null],
      ['the-main-pricing-page', null],
      ['practice-complete-offer', 'Effective November 16, 2026'],
      ['patient-payments', 'Last updated: May 21, 2026'],
      ['fees-and-price-changes', null],
      ['the-contract', null],
    ])

    // What each package on the main page includes in texts.
    expect(line('the-main-pricing-page', 'Texts included each month')).toBe(
      '1,750 on Patient Connect, 3,500 on Practice Efficiency and 4,500 on Practice Growth; “TAILORED” on Enterprise',
    )

    // THE DATED OFFER. It is the only place its site prints a price for the
    // packages with phones and its AI receptionist, so it is on the page; and
    // it ends on a stated day, so the title says it is an offer and the first
    // line says the day.
    const offer = d.groups.find((g) => g.id === 'practice-complete-offer')!
    expect(offer.title).toMatch(/dated offer/i)
    expect(line('practice-complete-offer', 'What the offer adds')).toMatch(/^For order forms signed “on or before December 18, 2026”/)
    expect(line('practice-complete-offer', 'Practice Complete Efficiency Package')).toMatch(/^\$599\.00 per location per month/)
    expect(line('practice-complete-offer', 'Practice Complete Growth Package (Dental)')).toMatch(/^\$799\.00 per location per month/)
    expect(line('practice-complete-offer', 'Practice Complete Growth Package (Eye Care, Medical)')).toMatch(/^\$699\.00 per location per month/)
    expect(line('practice-complete-offer', 'Extra phone lines')).toBe('“Additional SR Phones Standard lines are $21 per line per month.”')
    expect(line('practice-complete-offer', 'Who can take it')).toMatch(
      /“fewer than six \(6\) Locations”.*“an initial term of at least twelve \(12\) months”/,
    )

    // ITS PAYMENT FEES, under its fee schedule's own row names.
    const pay = d.groups.find((g) => g.id === 'patient-payments')!
    expect(pay.lines.slice(0, 8).map((l) => [l.label, l.value])).toEqual([
      ['Transaction Fee via Terminal (Swiped/Insert Chip/Tap)', '2.40%'],
      ['Transaction Auth Fee via Terminal (Swiped/Insert Chip/Tap)', '$0.20'],
      ['Transaction Fee', '2.89%'],
      ['Transaction Auth Fee', '$0.30'],
      ['ACH Transaction Fee', '1.00%'],
      ['ACH Failure (Incl. Payout Failure)', '$5.00'],
      ['ACH Refund Fee', '$0.75'],
      ['ACH Return Fee', '$25.00'],
    ])
    expect(line('patient-payments', 'What those fees leave out')).toBe(
      '“Unless expressly stated otherwise, all Fees are exclusive of taxes, interchange, and Payment Network assessments.”',
    )
    expect(line('patient-payments', 'Fee changes')).toBe('“Solutionreach may change the Fees on at least thirty (30) days’ prior notice”')
    // Neither becomes a question of its own. An offer that ends on a stated
    // day does not belong in an answer a search engine keeps. And what a
    // patient's payment costs is something this site does not yet state about
    // its OWN product (`docs/organic-go-live.md` Part 8, row 7): until it
    // does, their fee schedule is printed and nothing of ours is set beside it.
    expect(offer.question).toBeUndefined()
    expect(pay.question).toBeUndefined()
    expect(d.versusUs).not.toMatch(/payment|processing|card fee|surcharg/i)

    // WHAT ITS OWN SITE SELLS. The entry called it "comms-only" with a
    // "legacy portal", scheduling that was "request-based in places" and
    // phones as a partial add-on. Its site sells a phone system, an AI
    // receptionist, payments and scheduling from live openings, and names no
    // patient portal: the one time the word appears, it is to say a patient
    // pays without one.
    expect(JSON.stringify(sr)).not.toMatch(
      /comms-only|legacy portal|dated around it|Request-based scheduling|social via add-ons|Best-in-class|Add-on offerings/i,
    )
    const row = (starts: string) => sr.matrix.find((r) => r.feature.startsWith(starts))!
    expect([row('VoIP phones').vendor, row('VoIP phones').vendorNote]).toEqual(['yes', 'SR Phones, the phone system it sells'])
    expect(row('Online booking').vendor).toBe('yes')
    expect(row('Online booking').vendorNote).toContain('“Show patients real-time openings on your schedule”')
    expect(row('Patient portal').vendor).toBe('no')
    expect(row('Patient portal').vendorNote).toContain('“without logging in to a portal”')
    expect(row('Two-way SMS').vendorNote).toMatch(/1,750 to 4,500 texts a month/)
    expect(row('PMS').vendorNote).toContain('“400+ native PM/EHR integrations”')
    // The table said its insurance checks were "not verified here". They are
    // on its pricing page, and its checkout page prices the package they
    // come in — so the comparison adds the two packages up, as it does for
    // Weave's bundle, and sets beside the sum what ours includes.
    expect(row('Insurance eligibility').vendor).toBe('yes')
    expect(row('Insurance eligibility').vendorNote).toContain('“Insurance Eligibility (Dental Only)”')
    expect(199 + 199).toBe(398)
    expect(d.versusUs).toMatch(/Add its optional revenue-cycle package for insurance checks and the two come to \$398 a month billed yearly\./)
    expect(d.versusUs).toContain(`includes ${INCLUDED_MONTHLY_INSURANCE_CHECKS} insurance checks a month`)
    // And the page says what is in its favour that we do not sell.
    expect(d.versusUs).toMatch(/a phone system and an AI receptionist, which we do not sell/)
    expect(sr.theirStrengths.map((s) => s.title)).toContain('A phone system with an AI receptionist')
    expect(sr.bottomLine).toMatch(/Solutionreach sells all three and DreamCRM does not/)

    // The retracted line, the reviewers nobody could name, and the entry's
    // own description of itself.
    expect(sr.reportedPricing).not.toMatch(/every package priced by quote/)
    expect(JSON.stringify(sr)).not.toMatch(/reported by reviewers|reviewer complaints/)
    expect(sr.reportedPricing).toMatch(/^Published from \$199\/mo billed yearly, or \$219\/mo billed monthly/)
    // Its community help site would not load, and is named rather than cited.
    expect(d.notRead).toContain('Solutionreach’s community help site')
    expect(d.reported).toEqual([])
    // A dollar lower than ours on the cheapest package, and the page says so.
    // That is arithmetic on two prices, and one of them is ours to change: if
    // either moves, this names the sentence that stopped being true instead
    // of leaving it on the page.
    expect(d.versusUs).toMatch(/Essentials package, billed yearly, is a dollar lower than ours; billed monthly it is higher/)
    const ours = getQuotedPlan().price
    expect(ours - 199, 'solutionreach: “a dollar lower than ours” no longer adds up; rewrite the sentence').toBe(1)
    expect(219, 'solutionreach: “billed monthly it is higher” no longer adds up; rewrite the sentence').toBeGreaterThan(ours)
  })

  it('an entry read out in full repeats no figure it cannot name the source of', () => {
    // The top line of the four entries that show no price ends "third-party
    // reviews report ~$N". That is tolerable shorthand on an entry nobody has
    // read out; on one that has a section saying "no third party’s figure is
    // repeated here", it is a contradiction a reader can see.
    for (const c of detailed) expect(c.reportedPricing, c.slug).not.toMatch(/third-party reviews report|reported by reviewers/)
  })

  /**
   * REVENUEWELL, PINNED. Read on 2026-11-26 from the pages its own sitemap
   * lists (682) and its help centre (218 articles, which answer a browser
   * and refuse anything else). Its Plans page shows no price; six other pages
   * of its own print one, or a fee, or a term.
   */
  it('RevenueWell: no price on its Plans page, and the pages of its own that print one', () => {
    const rw = COMPARISONS.find((c) => c.slug === 'revenuewell')!
    const d = rw.pricingDetail!
    const line = (group: string, label: string) =>
      d.groups.find((g) => g.id === group)!.lines.find((l) => l.label === label)!.value

    // The Plans page: no number, and what it marks as not there yet.
    expect(publishesPrice(rw)).toBe(false)
    expect(line('the-plans-page', 'The price')).toMatch(/^None on the page/)
    expect(line('the-plans-page', 'Marked “coming soon” on the page')).toBe(
      '“Reputation & review management” and the “ReadyVisit patient portal”',
    )
    expect(JSON.stringify(d.groups[0]!.lines)).not.toMatch(/\$\d/)
    // Its tiers page, and the footnote under them.
    expect(line('plan-tiers', 'The tiers')).toBe('Starter, Professional and Premium; no price beside any of them')
    expect(line('plan-tiers', 'The footnote')).toBe('“*Annual contract required for Starter, Professional, or Premium plans”')

    // The single products and offers its site prices.
    expect(line('virtual-office', 'Paid monthly')).toBe('“$149/mo”, and “Easy to try with no contract.”')
    expect(line('virtual-office', 'Paid for a year')).toBe('“$129/mo”, and “More affordable with a 12-month commitment.”')
    expect(line('winoms-offer', 'The headline')).toBe('A free introductory period, then “$199/Month” for its Marketing Platform')
    expect(line('website-offer', 'The offer')).toBe(
      '“For a limited time, you can upgrade to a semi-custom website for just $99/month (a significant discount from the usual $169/month).”',
    )
    expect(line('truform-offer', 'The offer')).toBe('“Upgrade to TruForm with unlimited edits for $79/month”')
    // An offer page that states no date says so, and says what its address says.
    for (const id of ['website-offer', 'truform-offer']) {
      expect(line(id, 'How old it is'), id).toMatch(/address ends “[a-z-]+-2024”; the page itself states no date/)
    }

    // THE FEE SCHEDULE. Its table is a picture inside an embedded PDF, so it
    // was read by eye and no script can check it against a saved text: every
    // figure is pinned here instead.
    const fees = d.groups.find((g) => g.id === 'fee-schedule')!
    expect(fees.source.pageSays).toBe('Effective as of June 1st, 2026')
    expect(fees.lines.map((l) => [l.label, l.value])).toEqual([
      ['Carrier Fees for Text Messages above Maximum Limits', '$.015 per outbound text message over Package Limits'],
      ['Starter Limit', '750 Text Messages per month'],
      ['Marketing Platform Limit', '1750 Text Messages per month'],
      ['Data and Communication Pass Through Fee', '$19.91 per location per month'],
      ['One-Time Text Campaign Registration Fee', '$15.00 per location'],
      ['One-Time Text Brand Registration Fee', '$44.00 per location'],
      ['Additional Fees as Required by Regulatory Agencies', 'As Assessed'],
      ['Changing a package', '“Changes to a selected package will result in a $15.00 re-registration fee”'],
      ['Black and White Letters', '$0.62 + postage; additional pages $0.19'],
      ['Post Cards', '4.25" x 6": $0.44 + postage; 5.5" x 8.5": $0.82 + postage'],
    ])

    // Its help centre's billing article.
    expect(line('billing', 'Setup or registration fees')).toBe(
      '“RevenueWell may charge a one-time setup or registration fee during onboarding. These fees are billed regardless of any promotional period.”',
    )
    expect(line('billing', 'Paying RevenueWell by credit card')).toMatch(
      /^“Effective October 22, 2026, a 3% credit card surcharge will be added to payments made by credit card/,
    )

    // The agreement: what a term is, how it renews, and what renewal can cost.
    expect(line('the-contract', 'The term')).toBe(
      '“If no term is set forth in an Order Form, then the Order Form shall be deemed to have a one-year Subscription Term”',
    )
    expect(line('the-contract', 'Renewal')).toMatch(/“for consecutive one \(1\) year renewal terms”/)
    expect(line('the-contract', 'To stop a renewal')).toMatch(/“at least thirty \(30\) days prior to commencement of an applicable Subscription Renewal Term”/)
    expect(line('fees-and-price-changes', 'At renewal')).toBe(
      '“We may increase the Fees in any Subscription Renewal Term (defined in Section 13.2) by up to the greater of five percent (5%) or the adjusted Consumer Price Index cost increase.”',
    )
    expect(line('fees-and-price-changes', 'A larger increase')).toMatch(/“at least sixty \(60\) days’ notice”/)
    expect(line('fees-and-price-changes', 'Refunds')).toMatch(/^“Payment obligations are non-cancelable, fees paid are non-refundable/)

    // Ten groups, each one page of its own (its help centre is a subdomain).
    expect(d.groups.map((g) => [g.id, new URL(g.source.url).hostname + new URL(g.source.url).pathname])).toEqual([
      ['the-plans-page', 'www.revenuewell.com/plans'],
      ['plan-tiers', 'www.revenuewell.com/meet-the-new-plans'],
      ['virtual-office', 'www.revenuewell.com/virtual-office'],
      ['winoms-offer', 'www.revenuewell.com/integrations/winoms-revenuewell'],
      ['website-offer', 'www.revenuewell.com/website-offer-2024'],
      ['truform-offer', 'www.revenuewell.com/truform-offer-2024'],
      ['fee-schedule', 'www.revenuewell.com/legal/variable-fee-schedule'],
      ['billing', 'help.revenuewell.com/hc/en-us/articles/37489450622235-RevenueWell-Billing'],
      ['fees-and-price-changes', 'www.revenuewell.com/legal/resources/msa'],
      ['the-contract', 'www.revenuewell.com/legal/resources/msa'],
    ])
    expect(d.groups.filter((g) => g.source.pageSays === 'v1.8 (Updated July 2026)').map((g) => g.id)).toEqual([
      'fees-and-price-changes',
      'the-contract',
    ])

    // No third party's figure, in the section or on the top line.
    expect(d.reported).toEqual([])
    expect(rw.reportedPricing).not.toMatch(/third-party|reviews report/)
    expect(rw.reportedPricing).toMatch(/^No price published on its Plans page/)
    // A competitor's free period is never typed as a length: the trial guard
    // reads any digit beside "free" as OUR trial, and it is right to.
    expect(JSON.stringify(rw)).not.toMatch(/Free for 90 Days|90[- ]day/i)
    // No claim about every competitor at once.
    expect(JSON.stringify(rw)).not.toMatch(/No competitor we surveyed/)

    // The table: the contract row carries BOTH things its site says, and the
    // rows that said "listed" or "not verified" quote a page.
    const row = (starts: string) => rw.matrix.find((r) => r.feature.startsWith(starts))!
    expect(row('Month-to-month').vendor).toBe('partial')
    expect(row('Month-to-month').vendorNote).toContain('“RevenueWell offers both monthly and annual contracts”')
    expect(row('Month-to-month').vendorNote).toContain('“Annual contract required for Starter, Professional, or Premium plans”')
    expect(row('Patient portal').vendorNote).toContain('PatientConnect365')
    expect(row('Patient portal').vendorNote).toContain('“ReadyVisit patient portal”')
    expect(row('Insurance eligibility').vendor).toBe('yes')
    expect(row('Review collection').vendorNote).toContain('“send, view, and respond to patient reviews”')
    // The strength about its portal's switch is its help centre's own sentence.
    expect(rw.ourStrengths[0]!.body).toContain(
      '“Disabling this does NOT remove the payments link from Payment Preferences—only disables the function in the portal.”',
    )

    // And the comparison: no number of theirs to set beside ours, what its
    // agreement says, and what is in its favour.
    expect(d.versusUs).toMatch(/shows no subscription price/)
    expect(d.versusUs).toMatch(/in RevenueWell’s favour/)
    expect(d.versusUs).toMatch(/which we do not sell/)
    expect(d.versusUs).not.toMatch(/payment|processing|card fee|surcharg/i)
  })

  /**
   * ADIT, PINNED. Read on 2026-11-26 from its own sitemap (938 pages
   * listed, 913 read). Its pricing page shows no price in its text. Its FAQ page states
   * one, and it is LOWER than ours: the entry had said the opposite, twice,
   * on the strength of a figure no one could name the source of.
   */
  it('Adit: no price on its pricing page, a starting price on its FAQ page, and the fees in its terms', () => {
    const adit = COMPARISONS.find((c) => c.slug === 'adit')!
    const d = adit.pricingDetail!
    const line = (group: string, label: string) =>
      d.groups.find((g) => g.id === group)!.lines.find((l) => l.label === label)!.value

    // The pricing page: no number a reader sees.
    expect(publishesPrice(adit)).toBe(false)
    expect(line('the-pricing-page', 'The price')).toMatch(/^None in the text of the page/)
    expect(line('the-pricing-page', 'Contracts')).toBe('“No Contracts”, in the line under its heading')
    expect(JSON.stringify(d.groups[0]!.lines)).not.toMatch(/\$\d/)

    // The FAQ page: its own starting price, and its own words on contracts.
    expect(line('faq', 'The starting price')).toBe('“We offer a technology bundle that starts at $99 per month, per location.”')
    expect(line('faq', 'Contracts')).toBe(
      '“Our tech packages do not have any binding contracts so you can cancel your subscription any time. However, our marketing agreements are locked into a 1 year contract with a Patient Booking Guarantee.”',
    )
    expect(d.startsAt).toEqual({ perMonth: 99, groupId: 'faq' })

    // Its terms: what usage beyond a bundle costs, under its own bundle names.
    expect(line('usage-fees', 'Tech & Analytics Bundle: what is unlimited')).toBe(
      '“Unlimited VoIP minutes”, “Unlimited one-to-one text messaging” and “Unlimited emails”',
    )
    expect(line('usage-fees', 'Mass texts')).toBe('“$0.01 per text for all mass text campaigns sent”')
    expect(line('usage-fees', 'Tracked call minutes')).toBe('“500 tracking minutes per location, $0.03 per minutes charges”')
    expect(line('usage-fees', 'Phone numbers')).toBe('“2 numbers per location. $2 per extra numbers”')
    expect(line('usage-fees', 'Freemium: texts')).toBe('“500 text messages per location, $0.03 per additional message”')
    expect(line('usage-fees', 'Freemium: emails')).toBe('“5,000 emails free per location. $5 per 1,000 additional emails sent”')

    // Refunds and late payment, in its terms' own words.
    expect(line('billing-and-refunds', 'Refunds')).toBe(
      '“All sales pursuant to the Invoice are Final, and there are no refunds for contracted services for any reason.”',
    )
    expect(line('billing-and-refunds', 'Late payment')).toBe(
      '“Adit has the right to charge 15% penalty for payments received after 5 days of expected billing date.”',
    )
    expect(line('billing-and-refunds', 'A year paid up front: the first year')).toMatch(
      /“subject to a three percent \(3%\) processing fee and a penalty of fifty dollars \(\$50\) per month of service deducted from the refund amount”/,
    )
    expect(line('the-contract', 'To end it')).toBe(
      '“This Agreement may be terminated at any time by either party upon receipt of 30-day written notice via email”',
    )

    // Its payment fees: printed, and nobody's search answer.
    const pay = d.groups.find((g) => g.id === 'adit-pay')!
    expect(pay.lines.slice(0, 2).map((l) => l.value)).toEqual([
      '“Card Present Transactions: 2.25% + $0.20 per transaction.”',
      '“Card Not Present Transactions: 2.90% + $0.30 per transaction.”',
    ])
    expect(pay.question).toBeUndefined()
    expect(d.versusUs).not.toMatch(/payment|processing|card fee|surcharg/i)

    // Three pages, all its own; the two legal ones carry the date they state.
    expect(d.groups.map((g) => [g.id, new URL(g.source.url).hostname + new URL(g.source.url).pathname, g.source.pageSays ?? null])).toEqual([
      ['the-pricing-page', 'adit.com/pricing', null],
      ['faq', 'adit.com/faqs', null],
      ['usage-fees', 'adit.com/terms', 'Last Updated: November 26, 2026'],
      ['adit-pay', 'adit.com/adit-pay-terms', 'Last Updated: November 26, 2026'],
      ['billing-and-refunds', 'adit.com/terms', 'Last Updated: November 26, 2026'],
      ['the-contract', 'adit.com/terms', 'Last Updated: November 26, 2026'],
    ])

    // WHAT THE ENTRY SAID AND NO LONGER MAY. "Lower flat price", "at half the
    // reported price" and "reported ~$399 bundles": the vendor's own page
    // states a starting price below ours. "Adit Pulse": a product name not on
    // its site. "Sanctioned paths": a claim about a third party that is not
    // ours to make. And memberships, which its own pages list.
    const text = JSON.stringify(adit)
    expect(text).not.toMatch(/Lower flat price|half the reported price|reported ~\$399|third-party reviews report/)
    expect(text).not.toMatch(/Adit Pulse|sanctioned/i)
    expect(adit.ourStrengths.map((s) => `${s.title} ${s.body}`).join(' ')).not.toMatch(/memberships/i)
    expect(d.reported).toEqual([])
    // And the comparison says theirs is lower.
    expect(d.versusUs).toMatch(/starts at \$99 per month, per location, which is lower than ours/)
    expect(d.versusUs).toMatch(/in Adit’s favour/)
    expect(adit.bottomLine).not.toMatch(/price/)

    const row = (starts: string) => adit.matrix.find((r) => r.feature.startsWith(starts))!
    expect(row('Insurance eligibility').vendor).toBe('yes')
    expect(row('Insurance eligibility').vendorNote).toContain('“Insurance Verifications”')
    expect(row('Google Business').vendor).toBe('partial')
  })

  /**
   * DENTAL INTELLIGENCE, PINNED. Read on 2026-11-26 from its own sitemap
   * (1,227 pages listed; the 419 that are not blog, podcast, webinar, ebook
   * or case-study content read). It publishes no subscription price: no
   * pricing page, no pricing link in its menu, none in structured data. Its
   * terms hub publishes the rest, and the entry had said its terms were "not
   * stated" while linking the policy that states them.
   */
  it('Dental Intelligence: no price anywhere on its site, and the terms its own hub publishes', () => {
    const di = COMPARISONS.find((c) => c.slug === 'dental-intelligence')!
    const d = di.pricingDetail!
    const line = (group: string, label: string) =>
      d.groups.find((g) => g.id === group)!.lines.find((l) => l.label === label)!.value

    expect(publishesPrice(di)).toBe(false)
    expect(d.startsAt).toBeUndefined()
    expect(line('the-home-page', 'The price')).toBe('None: the page asks you to “Get a Demo”')
    expect(line('the-home-page', 'A pricing page')).toBe('None in its menu, and none among the pages its sitemap lists')
    expect(JSON.stringify(d.groups[0]!.lines)).not.toMatch(/\$\d/)

    // Renewal: five percent, automatically, in its own sentence.
    expect(line('renewal-and-price-changes', 'At each renewal')).toBe(
      '“On each renewal of Subscription Services, the Fees for such Subscription Services will automatically increase by five percent (5%) over the Fees in effect immediately prior to the renewal, unless otherwise expressly set forth in the Order or a written amendment signed by the parties.”',
    )
    expect(line('renewal-and-price-changes', 'Refunds')).toBe('“All payments are non-refundable, other than as expressly set forth in these Terms.”')
    // The contract, from the policy the entry used to say did not state it.
    expect(line('the-contract', 'The term')).toBe(
      '“An agreement with Dental Intelligence renews automatically for the agreed-upon term, typically annually.”',
    )
    expect(line('the-contract', 'Cancelling mid-term')).toBe(
      '“the agreement will not renew but you will still owe the remaining contracted payments for the then-current term”',
    )
    // Texts and call minutes.
    expect(line('texts', 'Beyond that')).toBe('“billed to the Customer at $0.04 per SMS Segment in the next billing cycle”')
    expect(line('texts', 'Buying more ahead')).toBe('“a Customer can add blocks of 2,500 SMS Segments for $50.00 per block per month”')
    expect(line('voice', 'Call minutes')).toBe(
      '“Usage of over 2,000 minutes per VOIP User per month is subject to a $0.02 per minute charge for such excess minutes.”',
    )

    expect(d.groups.map((g) => [g.id, new URL(g.source.url).pathname, g.source.pageSays ?? null])).toEqual([
      ['the-home-page', '/', null],
      ['renewal-and-price-changes', '/terms/TOS', 'Effective Date: November 5, 2026'],
      ['the-contract', '/terms/cancellation', 'Effective date: June 1, 2024'],
      ['texts', '/terms/sms', 'Effective Date: November 5, 2026'],
      ['voice', '/terms/voice', 'Effective Date: November 5, 2026'],
    ])
    for (const g of d.groups) expect(new URL(g.source.url).hostname).toBe('www.dentalintel.com')

    expect(d.reported).toEqual([])
    expect(di.reportedPricing).not.toMatch(/third-party|reviews report/)
    expect(d.versusUs).toMatch(/shows no subscription price/)
    expect(d.versusUs).toMatch(/in its favour/)
    expect(d.versusUs).not.toMatch(/payment|processing|card fee|surcharg/i)

    const row = (starts: string) => di.matrix.find((r) => r.feature.startsWith(starts))!
    expect(row('Month-to-month').vendor).toBe('no')
    expect(row('Month-to-month').vendorNote).toContain('“typically annually”')
    expect(row('Month-to-month').vendorNote).not.toMatch(/not stated/i)

    // THE ROWS THIS READ CORRECTED IN ITS FAVOUR. Each had understated what
    // its own pages list: one thread for text, email and the app (the row
    // said "patient chat + reminders"); its own "Online Reviews" beside the
    // Swell partnership (the row named only the partner); social media
    // templates and a "Book Now" button on a Google Business Profile (the
    // row said "none listed on its site").
    expect(row('Unified patient inbox').vendor).toBe('yes')
    expect(row('Unified patient inbox').vendorNote).toContain('“across text, email, and the app, all in one consolidated thread”')
    expect(row('Review collection').vendor).toBe('yes')
    expect(row('Review collection').vendorNote).toContain('“Online Reviews”')
    expect(row('Review collection').vendorNote).toContain('“via our third-party partner Swellcx.com”')
    expect(row('Recall').vendorNote).toContain('“Automated Recalls”')
    expect(row('Google Business').vendor).toBe('partial')
    expect(row('Google Business').vendorNote).toContain('“social media templates”')
    expect(row('Google Business').vendorNote).toContain('“Book Now”')
    expect(row('Google Business').vendorNote).not.toMatch(/None listed/)

    // Nothing on this page is counted or ranked by us. "Many practices run
    // one for the numbers and the other for the front door" named no
    // practice; "the analytics leader in the category" named no measure; and
    // its own About page says Modento joined it, not what it paid for.
    const text = JSON.stringify(di)
    expect(text).not.toMatch(/Many practices|is the leader|analytics leader|deepest production analytics/)
    expect(text).not.toMatch(/acquisition/i)
    expect(text).not.toMatch(/it’s excellent|Strong reactivation tooling/)
  })

  /**
   * PODIUM, PINNED. Read on 2026-11-26 from its own sitemap (2,312 pages
   * listed; 528 read, the rest being articles, webinars, ebooks and
   * customer stories). It publishes two plan prices and its add-ons on one
   * page. Its terms state a twelve-month term paid annually in advance; the
   * entry had said its terms were "not stated", with "annual terms commonly
   * reported" beside it, which named nobody.
   *
   * Both halves are DEFAULTS. The terms open each with "Unless otherwise
   * stated in Client's Subscription Documentation" (the term) and "Unless
   * otherwise specified in the applicable Subscription Documentation" (when
   * fees are paid). A default printed as a rule is not what the page says,
   * so the qualifier rides on every surface that repeats either half: the
   * two lines, the answer, the comparison sentence and the matrix row.
   */
  it('Podium: the two prices and the add-ons on its pricing page, and the term its own terms state', () => {
    const podium = COMPARISONS.find((c) => c.slug === 'podium')!
    const d = podium.pricingDetail!
    const line = (group: string, label: string) =>
      d.groups.find((g) => g.id === group)!.lines.find((l) => l.label === label)!.value

    expect(publishesPrice(podium)).toBe(true)
    expect(line('published-prices', 'Core')).toBe('“$399 USD per month”')
    expect(line('published-prices', 'Pro')).toBe('“$599 USD per month”')
    expect(line('published-prices', 'Signature')).toBe('“Custom pricing”')
    expect(line('add-ons', 'Podium Phones')).toBe('“$30 per user/mo (1-4 users)” or “$25 per user/mo (5+ users)”')
    expect(line('add-ons', 'Setting up phones')).toBe('“There is a $500 network optimization fee per location. Usage rates apply”')
    expect(line('add-ons', 'A carrier fee')).toBe('“A base 10DLC fee of $5/month is charged for all US locations.”')
    expect(line('the-contract', 'The term')).toBe(
      '“the initial term for any Subscription to the Services is twelve (12) months”, unless the order says otherwise',
    )
    expect(line('the-contract', 'When fees are paid')).toBe(
      '“Subscription Fees will be paid annually in advance”, unless the order says otherwise',
    )
    expect(d.groups.find((g) => g.id === 'the-contract')!.answer).toMatch(/unless the order says otherwise/)
    expect(line('fees-and-price-changes', 'Price changes')).toBe(
      '“Podium may increase Fees applicable to you upon forty-five (45) days’ prior written notice, effective on the start date of your subsequent Subscription Term”',
    )

    // Its pricing page and its legal centre, both its own; the terms carry their date.
    expect(d.groups.map((g) => [g.id, new URL(g.source.url).hostname + new URL(g.source.url).pathname, g.source.pageSays ?? null])).toEqual([
      ['published-prices', 'www.podium.com/pricing', null],
      ['add-ons', 'www.podium.com/pricing', null],
      ['the-contract', 'legal.podium.com/', 'Effective: October 15, 2026'],
      ['fees-and-price-changes', 'legal.podium.com/', 'Effective: October 15, 2026'],
    ])

    expect(d.reported).toEqual([])
    const text = JSON.stringify(podium)
    expect(text).not.toMatch(/commonly reported|not stated on its pricing page/)
    // A legal conclusion about our own product is not a feature.
    expect(text).not.toMatch(/FTC-clean|clean under the FTC/)
    expect(d.versusUs).toMatch(/Unless the order says otherwise, its terms set a twelve-month term paid annually in advance/)
    expect(d.versusUs).toMatch(/in Podium’s favour/)
    expect(d.versusUs).not.toMatch(/payment|processing|card fee|surcharg/i)

    const row = (starts: string) => podium.matrix.find((r) => r.feature.startsWith(starts))!

    // THE ROWS THIS READ CORRECTED. Its inbox row said "no portal/email
    // patient threads"; its pricing page lists email in the inbox, in the
    // sentence quoted here. Its insurance row said "not verified here"; its
    // pricing page lists every feature by plan and none is an insurance
    // check, so the row now says what was read. And one of its guides names
    // a dental practice-management system, which the row had not said.
    expect(row('Unified patient inbox').vendor).toBe('yes')
    expect(row('Unified patient inbox').vendorNote).toContain(
      '“Manage all your customer conversations across texts, calls, emails, social media, and more.”',
    )
    expect(row('Unified patient inbox').vendorNote).not.toMatch(/no portal\/email/)
    expect(row('Insurance eligibility').vendor).toBe('no')
    expect(row('Insurance eligibility').vendorNote).not.toMatch(/Not verified here/)
    expect(row('PMS sync').vendorNote).toContain('“Dentrix Enterprise”')
    expect(row('Online booking').vendorNote).toContain('“AI Scheduler”')
    expect(row('Recall').vendorNote).toContain('“Appointment Confirmations and Reminders”')
    expect(row('Google Business').vendorNote).toContain('“Instagram Messaging”')
    expect(row('Review collection').vendorNote).toContain('“Review Management with AI Responses”')
    // Praise is not a reading either: no rank we did not measure.
    expect(text).not.toMatch(/best-in-class|built the review-generation|excellent/)

    expect(row('Month-to-month').vendor).toBe('no')
    expect(row('Month-to-month').vendorNote).toContain('“paid annually in advance”')
    expect(row('Month-to-month').vendorNote).toMatch(/^Unless the order says otherwise/)
  })

  /**
   * TEBRA, PINNED. It was the first entry read out in full (2026-11-25) and
   * the only one whose figures no test named: the generic rules hold an
   * entry's shape, and a shape-correct line that misstates a price passes
   * them. These are its figures, and the two pages its sitemap added.
   */
  it('Tebra: the per-provider prices, the fees outside the subscription, and the two pages its sitemap added', () => {
    const tebra = COMPARISONS.find((c) => c.slug === 'patientpop')!
    const d = tebra.pricingDetail!
    const line = (group: string, label: string) =>
      d.groups.find((g) => g.id === group)!.lines.find((l) => l.label === label)!.value

    expect(line('published-prices', 'Patient Experience + Marketing, per non-physician provider')).toBe('Starting at $49 a month')
    expect(line('published-prices', 'Patient Experience + Marketing, per physician')).toBe('Starting at $99 a month')
    expect(line('published-prices', 'The whole range Tebra gives')).toBe('$49 to $799 per provider, per month')
    expect(line('other-fees', 'Telecom messaging compliance fee')).toMatch(/^\$84\.87 per location, billed annually/)
    expect(line('other-fees', 'Website export, if you leave')).toMatch(/^\$1,000 for the text and overall structure/)
    expect(line('other-fees', 'Price increases')).toMatch(/^Up to 4\.9% at a time/)
    expect(line('other-fees', 'Paying Tebra’s invoice by credit card')).toBe('A 2% processing fee')
    expect(line('the-contract', 'To stop a renewal')).toMatch(/at least 60 days before the term ends/)

    // Found when its sitemap was read on 2026-11-26.
    const pay = d.groups.find((g) => g.id === 'payment-processing')!
    expect(line('payment-processing', 'Card present')).toBe('“2.75% + $0.30 per Card Present transaction”')
    expect(line('payment-processing', 'Card not present')).toBe('“3.25% + $0.30 per Card Not Present transaction”')
    expect(pay.title).toMatch(/a separate service/)
    // Printed, and nobody's search answer (see the same rule on NexHealth
    // and Solutionreach: `docs/organic-go-live.md` Part 8, row 7).
    expect(pay.question).toBeUndefined()
    expect(d.versusUs).not.toMatch(/payment|processing|card fee|surcharg/i)
    const records = d.groups.find((g) => g.id === 'your-records-if-you-leave')!
    expect(line('your-records-if-you-leave', 'How long it is kept afterwards')).toBe('“an additional minimum 60 days (Data Retention Period)”')
    expect(line('your-records-if-you-leave', 'Help after support has ended')).toBe(
      '“Tebra may charge the Customer the standard rate of $100 an hour (minimum 30 minutes)”',
    )
    expect(records.source.pageSays).toBe('This policy was last updated on October 26, 2023')

    expect(d.groups.map((g) => [g.id, new URL(g.source.url).pathname])).toEqual([
      ['published-prices', '/pricing/overview'],
      ['whats-included', '/pricing'],
      ['other-fees', '/tebra-pricing-policy'],
      ['the-contract', '/tebra-terms-of-service'],
      ['if-you-leave', '/tebra-terms-of-service'],
      ['payment-processing', '/tebra-payment-processing-pricing-policy'],
      ['your-records-if-you-leave', '/term-termination-return-data-faq'],
    ])
  })

  /**
   * WEAVE, PINNED. The generic rules below hold the SHAPE of any entry; these
   * hold the facts of this one, because a shape-correct line that misstates a
   * competitor's contract is the failure the whole registry is built against.
   * Each is a sentence of Weave's own page, read 2026-11-26.
   */
  it('Weave: the published figures, the two clauses on price, and the number-porting rule', () => {
    const weave = COMPARISONS.find((c) => c.slug === 'weave')!
    const d = weave.pricingDetail!
    const line = (group: string, label: string) =>
      d.groups.find((g) => g.id === group)!.lines.find((l) => l.label === label)!.value

    expect(line('published-prices', 'Base plan')).toBe('Starting at $199 a month')
    expect(line('published-prices', 'Coordinate bundle')).toMatch(/^\$149 a month: online scheduling, digital forms/)
    expect(line('published-prices', 'Attract bundle')).toMatch(/^\$149 a month: reviews/)
    // Its own sentence about a trial, in its own words.
    expect(line('published-prices', 'A free trial')).toBe('“Weave does not offer a free trial for our full platform”')
    // The three tiers show a reader no number.
    expect(line('the-tiers', 'Pro, Elite and Ultimate')).toMatch(/^No price on the page/)

    // BOTH clauses on price are given, and the page does not choose between
    // them: fees fixed during the initial term, and up to 10% a year without
    // notice. Printing one without the other would be our reading of a
    // contract, not Weave's words.
    expect(line('fees-and-increases', 'During the initial term')).toContain('Fees stay fixed')
    expect(line('fees-and-increases', 'Price increases')).toMatch(/^Up to 10% in any twelve-month period “without notice”/)

    // The contract: both kinds of order, as its terms describe them — and the
    // plans page's own "no long-term contract" is in the answer, not dropped.
    const contract = d.groups.find((g) => g.id === 'the-contract')!
    expect(contract.answer).toMatch(/does not require a long-term contract/)
    expect(contract.answer).toMatch(/one with a stated term is owed in full/)
    const row = weave.matrix.find((r) => r.feature.startsWith('Month-to-month'))!
    expect(JSON.stringify(row)).toMatch(/No long-term contract required, per its plans page/)

    // Leaving: the rule a practice with ported numbers needs before it signs.
    expect(line('if-you-leave', 'Your phone numbers')).toMatch(/not effective until every number has been ported out/)

    // Every group is Weave's own site, and the terms carry their own date.
    for (const g of d.groups) expect(new URL(g.source.url).hostname).toBe('www.getweave.com')
    expect(d.groups.filter((g) => g.source.pageSays === 'Last updated: October 2, 2026')).toHaveLength(3)

    // No third party's figure is repeated, and the page says where theirs is lower.
    expect(d.reported).toEqual([])
    expect(d.versusUs).toMatch(/Weave’s base plan is a dollar lower than ours/)
    // The same arithmetic as Solutionreach's, against the base plan above.
    expect(getQuotedPlan().price - 199, 'weave: “a dollar lower than ours” no longer adds up; rewrite the sentence').toBe(1)
  })

  it('1 — every group cites ONE page on the vendor’s own site, read on a stated day', () => {
    for (const c of detailed) {
      const groups = c.pricingDetail!.groups
      expect(groups.length, c.slug).toBeGreaterThan(0)
      expect(new Set(groups.map((g) => g.id)).size, `${c.slug}: group ids repeat`).toBe(groups.length)
      for (const g of groups) {
        const where = `${c.slug}/${g.id}`
        expect(g.id, where).toMatch(/^[a-z][a-z0-9-]+$/)
        expect(g.title.length, where).toBeGreaterThan(3)
        expect(g.lines.length, where).toBeGreaterThan(0)
        const url = new URL(g.source.url)
        expect(url.protocol, where).toBe('https:')
        expect(onVendorSite(c, g.source.url), `${where}: ${url.hostname} is not the vendor’s own site`).toBe(true)
        expect(g.source.readOn, where).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(g.source.label.length, where).toBeGreaterThan(5)
        for (const line of g.lines) {
          expect(line.label.trim().length, where).toBeGreaterThan(2)
          expect(line.value.trim().length, `${where}: "${line.label}" has no value`).toBeGreaterThan(2)
        }
      }
    }
  })

  it('1 — no group was read after the day the entry says its pricing was checked', () => {
    // The dated stamp on the page ("pricing last checked …") speaks for the
    // whole entry. A group read on a later day would make that stamp older
    // than what is under it; an entry re-read later must move the stamp too.
    for (const c of detailed) {
      for (const g of c.pricingDetail!.groups) {
        expect(g.source.readOn <= c.pricingChecked!.on, `${c.slug}/${g.id}`).toBe(true)
      }
    }
  })

  it('2 — a third party’s figure is under that party’s name, off the vendor’s site, with its own caveat', () => {
    for (const c of detailed) {
      for (const r of c.pricingDetail!.reported) {
        const where = `${c.slug}/${r.who}`
        expect(r.who.length, where).toBeGreaterThan(1)
        expect(figures(r.says).length, `${where}: reports no figure`).toBeGreaterThan(0)
        expect(r.caveat.length, `${where}: no caveat`).toBeGreaterThan(20)
        const host = new URL(r.source.url).hostname.replace(/^www\./, '')
        expect(onVendorSite(c, r.source.url), `${where}: cited to the vendor’s own site`).toBe(false)
        expect(host, where).not.toMatch(/dreamcreatestudio/)
        expect(r.source.readOn, where).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    }
  })

  it('3 — the sources that refused to be read are named, and nothing is cited to them', () => {
    for (const c of detailed) {
      const d = c.pricingDetail!
      expect(d.notRead.length, c.slug).toBeGreaterThan(0)
      const cited = [...d.groups.map((g) => g.source.url), ...d.reported.map((r) => r.source.url)].join(' ').toLowerCase()
      for (const name of d.notRead) {
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, '')
        expect(cited, `${c.slug}: cites ${name}, which it says it could not read`).not.toContain(key)
      }
    }
  })

  it('4 — it quotes our price resolved, and says so where theirs is lower', () => {
    const ours = getQuotedPlan().price
    for (const c of detailed) {
      const d = c.pricingDetail!
      expect(d.versusUs, c.slug).toContain(`${usd(ours)}/mo`)
      // Their lowest published figure, from the group that lists their prices.
      const theirs = figures(d.groups[0]!.lines.map((l) => l.value).join(' '))
        .filter((f) => f.startsWith('$'))
        .map((f) => Number(f.replace(/[$,]/g, '')))
      if (!publishesPrice(c)) {
        // THE OTHER BRANCH: a vendor whose pricing page shows no price. Its
        // first group must not print one, and the comparison may not conjure
        // a number of theirs to be lower or higher than.
        expect(theirs, `${c.slug}: the registry says its page shows no price, and the first group prints one`).toEqual([])
        expect(d.versusUs, c.slug).toMatch(/shows no subscription price/)
        // A line that says "starts at $N per month" is a starting price of
        // the vendor's own, and the entry must declare it: otherwise the
        // rule below would forbid the page from saying theirs is lower.
        const said = d.groups
          .flatMap((g) => g.lines)
          .map((l) => /starts at \$(\d[\d,]*) per month/.exec(l.value)?.[1])
          .find(Boolean)
        expect(d.startsAt?.perMonth, `${c.slug}: a line states a starting price and the entry does not declare it`).toBe(
          said ? Number(said.replace(/,/g, '')) : undefined,
        )
        if (d.startsAt) {
          // ITS SITE STATES A STARTING PRICE SOMEWHERE OTHER THAN ITS PRICING
          // PAGE (Adit: its FAQ page). The figure is the vendor's own, the
          // group named prints it, that group is not the pricing page's, and
          // where it is lower than ours the comparison says so — exactly as
          // for a vendor that publishes.
          const group = d.groups.find((g) => g.id === d.startsAt!.groupId)!
          expect(group, `${c.slug}: startsAt names a group that is not there`).toBeTruthy()
          expect(group, c.slug).not.toBe(d.groups[0])
          expect(group.lines.map((l) => l.value).join(' '), c.slug).toContain(`$${d.startsAt.perMonth} per month`)
          if (d.startsAt.perMonth < ours) {
            expect(d.versusUs, `${c.slug}: its stated starting price is lower and the page does not say so`).toMatch(/lower than ours/)
          }
          expect(d.versusUs, c.slug).not.toMatch(/higher than ours|cheaper|costs more/)
        } else {
          expect(d.versusUs, c.slug).not.toMatch(/lower than ours|higher than ours|cheaper|costs more/)
        }
        continue
      }
      expect(theirs.length, `${c.slug}: the first group lists no price`).toBeGreaterThan(0)
      if (Math.min(...theirs) < ours) {
        expect(d.versusUs, `${c.slug}: their price is lower and the page does not say so`).toMatch(/lower than ours/)
      }
    }
  })

  it('5 — a question comes with its answer, and an answer states no figure the lines do not', () => {
    for (const c of detailed) {
      const d = c.pricingDetail!
      const allLines = d.groups.flatMap((g) => g.lines.map((l) => `${l.label} ${l.value}`)).join(' ')
      let asked = 0
      for (const g of d.groups) {
        const where = `${c.slug}/${g.id}`
        expect(Boolean(g.question), `${where}: a question without an answer, or the reverse`).toBe(Boolean(g.answer))
        if (!g.question || !g.answer) continue
        asked += 1
        expect(g.question.endsWith('?'), where).toBe(true)
        // The question is asked in the name a searcher types.
        expect(g.question, where).toContain(searchName(c))
        for (const figure of figures(g.answer)) {
          // As a WHOLE figure. A plain substring test let "$75" in an answer
          // pass because a line elsewhere said "$750": found by mutation on
          // 2026-11-26, on the Adit entry.
          const whole = new RegExp(`(?<![\\d.])${figure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d|[.,]\\d)`)
          expect(whole.test(allLines), `${where}: the answer says ${figure} and no line does`).toBe(true)
        }
      }
      expect(asked, `${c.slug}: no pricing question at all`).toBeGreaterThan(0)
    }
  })

  it('makes no compliance claim, calls nothing hidden, and uses no superlative', () => {
    for (const c of detailed) {
      const text = JSON.stringify(c.pricingDetail)
      // A fee named "compliance fee" by the vendor is the vendor's noun; a
      // claim that something IS compliant would be ours.
      expect(text, c.slug).not.toMatch(/hipaa|\bcompliant\b|soc ?2|bank[- ]level|secure patient data/i)
      // The fees are on the vendor's own public pages. "Hidden" is the word
      // every other result uses for them, and it is not true.
      expect(text, c.slug).not.toMatch(/\bhidden\b|\bgotcha|\btrap\b|\bsneak|\bbury|\bburied\b/i)
      expect(text, c.slug).not.toMatch(/\b(best|worst|cheapest|overpriced|rip-?off|expensive)\b/i)
    }
  })
})

describe('the page', () => {
  it('a detailed entry renders a pricing section a link can land on, headed by the name people search', async () => {
    for (const c of detailed) {
      const { container, unmount } = await renderPage(c.slug)
      const section = container.querySelector('section#pricing')
      expect(section, c.slug).toBeTruthy()
      expect(
        within(section as HTMLElement).getByRole('heading', { level: 2, name: `${searchName(c)} pricing, line by line` }),
      ).toBeInTheDocument()
      // And the hero points down to it.
      const jump = Array.from(container.querySelectorAll('a[href="#pricing"]'))
      expect(jump.length, `${c.slug}: nothing links to the section`).toBeGreaterThan(0)
      unmount()
    }
  })

  it('every line of every group is on the page under its group, with the group’s source and both dates', async () => {
    for (const c of detailed) {
      const { container, unmount } = await renderPage(c.slug)
      const section = container.querySelector('section#pricing') as HTMLElement
      for (const g of c.pricingDetail!.groups) {
        const card = section.querySelector(`#pricing-${g.id}`) as HTMLElement
        expect(card, `${c.slug}/${g.id}: no card`).toBeTruthy()
        expect(within(card).getByRole('heading', { level: 3, name: g.title })).toBeInTheDocument()
        for (const line of g.lines) {
          expect(card.textContent, `${g.id}: "${line.label}"`).toContain(line.label)
          expect(card.textContent, `${g.id}: "${line.value}"`).toContain(line.value)
        }
        const source = within(card).getByRole('link', { name: g.source.label })
        expect(source).toHaveAttribute('href', g.source.url)
        // A citation, not an endorsement.
        expect(source.getAttribute('rel') ?? '').toContain('nofollow')
        expect(card.textContent).toContain(`Read ${formatCheckedOn(g.source.readOn)}`)
        if (g.source.pageSays) expect(card.textContent).toContain(g.source.pageSays)
      }
      unmount()
    }
  })

  it('third-party reports are named, linked, dated and caveated; the unread sources are listed', async () => {
    for (const c of detailed) {
      const { container, unmount } = await renderPage(c.slug)
      const section = container.querySelector('section#pricing') as HTMLElement
      const d = c.pricingDetail!
      for (const r of d.reported) {
        expect(section.textContent).toContain(r.says)
        expect(section.textContent).toContain(r.caveat)
        const link = within(section).getByRole('link', { name: r.source.label })
        expect(link).toHaveAttribute('href', r.source.url)
        expect(link.getAttribute('rel') ?? '').toContain('nofollow')
        expect(section.textContent).toContain(`Read ${formatCheckedOn(r.source.readOn)}`)
      }
      for (const name of d.notRead) expect(section.textContent, name).toContain(name)
      expect(section.textContent).toContain(d.versusUs)
      unmount()
    }
  })

  it('an entry with no third-party report still names what was not read, and repeats nobody’s figure', async () => {
    // The "Not read" line lived inside the branch that renders reports, so the
    // first entry with none would have lost it. Both branches are held.
    const none = detailed.filter((c) => c.pricingDetail!.reported.length === 0)
    const some = detailed.filter((c) => c.pricingDetail!.reported.length > 0)
    expect(none.length, 'no entry exercises the empty branch').toBeGreaterThan(0)
    expect(some.length, 'no entry exercises the reports branch').toBeGreaterThan(0)
    for (const c of none) {
      const { container, unmount } = await renderPage(c.slug)
      const section = container.querySelector('section#pricing') as HTMLElement
      const empty = section.querySelector('[data-no-reports]')
      expect(empty, `${c.slug}: nothing says no figure is repeated`).toBeTruthy()
      expect(empty!.textContent).toContain(`${c.name}’s own pages`)
      expect(section.textContent).toContain(`Not read: ${c.pricingDetail!.notRead.join(', ')}.`)
      // WHY, in words true of every name on the list. It said "each refuses
      // an automated visit"; one of them (a vendor's help site) never
      // refused anything, it just would not load from here.
      expect(section.textContent).toContain('Each turned away an automated visit or did not load')
      expect(section.textContent).not.toContain('Each refuses an automated visit')
      unmount()
    }
    for (const c of some) {
      const { container, unmount } = await renderPage(c.slug)
      expect(container.querySelector('[data-no-reports]'), c.slug).toBeNull()
      unmount()
    }
  })

  it('the pricing questions are in the FAQ — on the page and in its data twin — each carrying its citation', async () => {
    for (const c of detailed) {
      const faq = buildComparisonFaq(c)
      // No question is asked twice. NexHealth's first draft asked "How much
      // does NexHealth cost?" of its pricing page — the question every entry
      // already asks of its dated pricing line — and the page would have
      // answered it two ways.
      const questions = faq.map((f) => f.q)
      expect(new Set(questions).size, `${c.slug}: a question is asked twice`).toBe(questions.length)
      const asked = c.pricingDetail!.groups.filter((g) => g.question)
      for (const g of asked) {
        const item = faq.find((f) => f.q === g.question)
        expect(item, g.question).toBeTruthy()
        expect(item!.a.startsWith(g.answer!), g.id).toBe(true)
        expect(item!.a.endsWith(`(${g.source.label}, read ${formatCheckedOn(g.source.readOn)}.)`), g.id).toBe(true)
      }
      const { container, unmount } = await renderPage(c.slug)
      for (const g of asked) {
        expect(screen.getByText(g.question!)).toBeInTheDocument()
        expect(container.innerHTML).toContain('"@type":"FAQPage"')
      }
      unmount()
    }
  })

  it('every comparison page names the other seven by the search they answer — and never itself', async () => {
    for (const c of COMPARISONS) {
      const { container, unmount } = await renderPage(c.slug)
      const block = container.querySelector('[data-also-compared]') as HTMLElement
      expect(block, c.slug).toBeTruthy()
      const links = Array.from(block.querySelectorAll('a')).map((a) => [a.getAttribute('href'), a.textContent])
      const others = COMPARISONS.filter((o) => o.slug !== c.slug)
      expect(links, c.slug).toEqual(others.map((o) => [`/compare/${o.slug}`, `${searchName(o)} pricing`]))
      unmount()
    }
  })

  it('says, in the page’s data, the day the vendor’s own pages were last read', async () => {
    for (const c of COMPARISONS) {
      const { container, unmount } = await renderPage(c.slug)
      const blocks = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((el) =>
        JSON.parse(el.textContent ?? '{}'),
      )
      const page = blocks.find((b) => b['@type'] === 'WebPage')
      expect(page, `${c.slug}: no WebPage node`).toBeTruthy()
      expect(page.url.endsWith(`/compare/${c.slug}`), c.slug).toBe(true)
      // The dated check, and nothing invented where there is none.
      expect(page.lastReviewed, c.slug).toBe(c.pricingChecked?.on)
      expect('dateModified' in page, `${c.slug}: a modification date nobody recorded`).toBe(false)
      unmount()
    }
  })

  it('an entry nobody read out in full renders no pricing section, no jump link and no pricing question', async () => {
    // Every real entry has been read out, so the branch is exercised on a
    // PLANTED one: a real entry with its section taken away for the length of
    // this test, the state a newly added comparison is in before its read.
    const c = COMPARISONS[0]! as { -readonly [K in keyof VendorComparison]: VendorComparison[K] }
    const section = c.pricingDetail
    expect(section).toBeTruthy()
    c.pricingDetail = undefined
    try {
      const { container, unmount } = await renderPage(c.slug)
      expect(container.querySelector('section#pricing')).toBeNull()
      expect(container.querySelector('a[href="#pricing"]')).toBeNull()
      expect(buildComparisonFaq(c)).toHaveLength(5)
      unmount()
    } finally {
      c.pricingDetail = section
    }
    // And it is back: the next test, in any order, sees the real registry.
    expect(COMPARISONS[0]!.pricingDetail).toBe(section)
  })
})
