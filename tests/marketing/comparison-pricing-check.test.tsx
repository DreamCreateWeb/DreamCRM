import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * A DATED PRICING CHECK — the comparison refresh of 2026-11-23.
 *
 * The Weave page said "reported ~$249–$449/mo … annual agreements" while
 * Weave's own site published a $199 base price, two $149 bundles and a "no
 * long-term contracts" answer. Nothing in the tree could say how old the
 * number was, so nothing prompted anyone to re-read it. A comparison page is
 * where paid traffic lands and what an assistant quotes back to a buyer, so a
 * stale competitor fact is a conversion problem and an honesty one at once.
 *
 * `pricingChecked` is the answer: an entry somebody actually re-read against
 * the vendor's OWN page carries the day and the page, the comparison renders
 * both, and the sitemap dates the page by it. An unchecked entry carries
 * nothing — a date on an unchecked line would be the same stale fact wearing
 * a timestamp. These cases are bounded to the comparison registry and the one
 * page that renders it.
 */

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import ComparePage from '@/app/(marketing)/compare/[vendor]/page'
import { COMPARISONS, formatCheckedOn } from '@/lib/marketing/comparisons'

describe('formatCheckedOn', () => {
  it('spells an ISO day without ever building a Date — a calendar day has no timezone', () => {
    expect(formatCheckedOn('2026-11-23')).toBe('November 23, 2026')
    expect(formatCheckedOn('2027-01-05')).toBe('January 5, 2027')
    // The day that goes wrong through `new Date()`: midnight UTC on the 1st
    // reads as the last day of the previous month anywhere west of Greenwich.
    expect(formatCheckedOn('2026-03-01')).toBe('March 1, 2026')
  })

  it('hands a malformed value back unchanged — never "undefined NaN"', () => {
    expect(formatCheckedOn('yesterday')).toBe('yesterday')
    expect(formatCheckedOn('2026-13-01')).toBe('2026-13-01')
    expect(formatCheckedOn('')).toBe('')
  })
})

describe('the registry', () => {
  it('every dated check names an ISO day, a source, and an https page on the VENDOR’s own site', () => {
    const checked = COMPARISONS.filter((c) => c.pricingChecked)
    expect(checked.length).toBeGreaterThan(0)
    for (const c of checked) {
      const check = c.pricingChecked!
      expect(check.on, c.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(check.source.length, c.slug).toBeGreaterThan(5)
      const url = new URL(check.url)
      expect(url.protocol, c.slug).toBe('https:')
      // A citation for "their published pricing" that points at us, or at a
      // review marketplace, is not a citation for that claim.
      expect(url.hostname, c.slug).not.toMatch(/dreamcreatestudio|capterra|g2\.com|softwareadvice|getapp/)
    }
  })

  it('Weave is quoted from its own plans page — the base price, both bundles, and its contract answer', () => {
    const weave = COMPARISONS.find((c) => c.slug === 'weave')!
    expect(weave.pricingChecked?.url).toContain('getweave.com')
    expect(weave.reportedPricing).toContain('$199/mo')
    expect(weave.reportedPricing).toContain('$149/mo')
    // The third-party band this replaced, and the two claims that described
    // Weave's old tiering and do not describe its published plans.
    const text = JSON.stringify(weave)
    expect(text).not.toMatch(/\$249|\$449|Elite tier per|annual agreements/)
    const contract = weave.matrix.find((r) => r.feature.startsWith('Month-to-month'))!
    expect(contract.vendor).toBe('yes')
    expect(contract.vendorNote).toMatch(/no long-term contract required/i)
    // What they are still ahead on stays on the page: the phones and the texting.
    expect(weave.matrix.find((r) => r.feature === 'VoIP phones')!.vendor).toBe('yes')
    expect(weave.matrix.find((r) => r.feature.includes('SMS'))!.vendor).toBe('yes')
  })
})

describe('the other entries re-read the same day', () => {
  it('Solutionreach is quoted from its own pricing page — the $199 floor and its yearly contracts', () => {
    const sr = COMPARISONS.find((c) => c.slug === 'solutionreach')!
    expect(sr.pricingChecked?.url).toContain('solutionreach.com')
    expect(sr.reportedPricing).toContain('$199')
    // The third-party figure this replaced.
    expect(JSON.stringify(sr)).not.toContain('$329')
    const contract = sr.matrix.find((r) => r.feature.startsWith('Month-to-month'))!
    expect(contract.vendor).toBe('no')
    expect(contract.vendorNote).toMatch(/yearly contract/i)
  })

  it('NexHealth is described as it describes itself — no published price, a monthly option, 90 days’ notice on annual', () => {
    const nx = COMPARISONS.find((c) => c.slug === 'nexhealth')!
    expect(nx.pricingChecked?.url).toContain('nexhealth.com')
    // Its page shows no number, so ours must not present one as theirs: the
    // only figure on the line is attributed to third parties.
    expect(nx.reportedPricing).toMatch(/shows no price/)
    expect(nx.reportedPricing).toMatch(/third-party reviews report/)
    const contract = nx.matrix.find((r) => r.feature.startsWith('Month-to-month'))!
    // The honest "yes": they do offer month-to-month. The page used to say
    // "terms vary".
    expect(contract.vendor).toBe('yes')
    expect(contract.vendorNote).toMatch(/90 days/)
  })
})

/**
 * ALL EIGHT, RE-READ IN A BROWSER ON 2026-11-25 — AND WHY THE READ OF THE DAY
 * BEFORE WAS WRONG TWICE.
 *
 * The block that stood here said "NONE of them publishes a price" about five
 * vendors. Two of the five do:
 *
 *  - PODIUM's pricing page shows $399 and $599 a month. The figures are drawn
 *    by the page's own scripts. The read of the 24th fetched the page's text
 *    without running them, found no number, and wrote "its own pricing page
 *    shows none".
 *  - TEBRA's main pricing page really does show no number — and a second page
 *    on its own site, `/pricing/overview`, publishes the whole price list.
 *    The read of the 24th looked at one page.
 *
 * Both lines were live for a day saying a competitor hides a price it
 * publishes, and Tebra's was restated in that page's meta description. Found
 * on the 25th while researching the Tebra page's pricing section, and not by
 * any test: no test can know what a vendor's website says.
 *
 * WHAT A "NO PRICE" LINE REQUIRES NOW — the method, since a test cannot hold
 * it: the vendor's pricing page read in a real browser with its scripts
 * running; a search of the vendor's own domain for a price on any other page;
 * and the page's structured data. The read of the 25th did all three for all
 * eight. Two more lines changed by it without flipping: Adit's pricing page
 * shows a reader no price and carries one in its structured data, and
 * RevenueWell's Plans page shows none while an offer page elsewhere on its
 * site quotes one. Both lines say so now.
 */
describe('all eight entries, re-read in a browser on 2026-11-25', () => {
  const ALL: Array<[slug: string, host: string]> = [
    ['weave', 'getweave.com'],
    ['nexhealth', 'nexhealth.com'],
    ['revenuewell', 'revenuewell.com'],
    ['solutionreach', 'solutionreach.com'],
    ['adit', 'adit.com'],
    ['dental-intelligence', 'dentalintel.com'],
    ['podium', 'podium.com'],
    ['patientpop', 'tebra.com'],
  ]
  const entry = (slug: string) => COMPARISONS.find((c) => c.slug === slug)!
  const contract = (slug: string) => entry(slug).matrix.find((r) => r.feature.startsWith('Month-to-month'))!

  it('is the whole registry — a ninth vendor needs a row here, and a read', () => {
    expect(ALL.map(([slug]) => slug).sort()).toEqual(COMPARISONS.map((c) => c.slug).sort())
  })

  it.each(ALL)('%s: dated that day, against a page on %s', (slug, host) => {
    const c = entry(slug)
    expect(c.pricingChecked?.on).toBe('2026-11-25')
    expect(new URL(c.pricingChecked!.url).hostname.endsWith(host)).toBe(true)
  })

  it('Podium is quoted from its own pricing page — Core, Pro, and the plan priced by quote', () => {
    const podium = entry('podium')
    expect(podium.reportedPricing).toMatch(/^Published at \$399\/mo for its Core plan and \$599\/mo for Pro/)
    expect(podium.reportedPricing).toMatch(/Signature plan priced by quote/)
    // The retracted line, and the third-party band that turned out to be
    // Podium's own two prices.
    const text = JSON.stringify(podium)
    expect(text).not.toMatch(/No price published|shows none|third-party reviews report|volume-based add-ons/)
  })

  it('Tebra is quoted from its pricing OVERVIEW page — and the line says its main pricing page shows nothing', () => {
    const tebra = entry('patientpop')
    expect(tebra.pricingChecked!.url).toBe('https://www.tebra.com/pricing/overview')
    expect(tebra.reportedPricing).toMatch(/^Published from \$49 per provider per month/)
    expect(tebra.reportedPricing).toContain('$99')
    // The asterisk on Tebra's own table, carried with the figure it qualifies.
    expect(tebra.reportedPricing).toMatch(/starter prices for practices submitting fewer than 100 claims a month/)
    // Why a careful reader could look at tebra.com/pricing and think we made
    // the number up.
    expect(tebra.reportedPricing).toMatch(/main pricing page shows no number/)
    // The retracted claims, everywhere in the entry.
    const text = JSON.stringify(tebra)
    expect(text).not.toMatch(/No subscription price published|publishes no subscription price|quote-only price|published price/)
  })

  const SHOW_NO_PRICE = ['nexhealth', 'revenuewell', 'adit', 'dental-intelligence']

  it('"shows a buyer no price" is exactly these four, and the other four open "Published"', () => {
    const silent = COMPARISONS.filter((c) => !/^Published\b/.test(c.reportedPricing)).map((c) => c.slug)
    expect(silent.sort()).toEqual([...SHOW_NO_PRICE].sort())
  })

  it.each(SHOW_NO_PRICE)('%s: says so, and any figure on the line says where it came from', (slug) => {
    const c = entry(slug)
    expect(c.reportedPricing).toMatch(/^(No price published|Custom quote only)/)
    // Nothing with a dollar sign before the line has said whose figure it is.
    expect(c.reportedPricing.split(';')[0], `${slug}: a figure in the vendor's own half`).not.toMatch(/\$\d/)
    expect(c.reportedPricing, slug).toMatch(/third-party reviews report ~\$\d/)
  })

  it('Adit: none in the text of its pricing page, one in that page’s structured data — both on the line', () => {
    const line = entry('adit').reportedPricing
    expect(line).toMatch(/^No price published on the page a buyer reads/)
    expect(line).toMatch(/structured data[^;]*lists a price of \$399 with no period stated/)
  })

  it('RevenueWell: none on its Plans page, one in an offer headline elsewhere on its site — both on the line', () => {
    const line = entry('revenuewell').reportedPricing
    expect(line).toMatch(/^No price published on its Plans page/)
    // Said to be an offer page's headline, with the figure in the headline's
    // own spelling — not restated as "its price". (The headline also names the
    // length of its free period. That number is left out on purpose: the
    // trial-length guard in `trial-copy.test.ts` reads every typed length
    // beside "free" as ours, and a competitor's offer is not worth teaching it
    // an exception for.)
    expect(line).toMatch(/offer page for WinOMS practices is headlined with a free introductory period and “\$199\/Month” for its Marketing Platform/)
  })

  it('every contract answer is the vendor’s own where the vendor states one, and says so', () => {
    // RevenueWell's site: "Monthly and annual contracts available".
    expect(contract('revenuewell').vendor).toBe('yes')
    expect(contract('revenuewell').vendorNote).toMatch(/Monthly and annual contracts, per its own site/)
    // Adit's pricing FAQ: no binding contract on the software; the marketing
    // program is a one-year commitment. Both halves stay on the line.
    expect(contract('adit').vendor).toBe('yes')
    expect(contract('adit').vendorNote).toMatch(/No binding contract/)
    expect(contract('adit').vendorNote).toMatch(/one-year commitment/)
    // The two whose pages state no terms are NOT upgraded to a flat "no":
    // what reviewers report is said to be what reviewers report.
    for (const slug of ['dental-intelligence', 'podium']) {
      expect(contract(slug).vendor, slug).toBe('partial')
      expect(contract(slug).vendorNote, slug).toMatch(/not stated/i)
    }
    // Tebra's terms of service DO state them — the 24th's read said "not
    // stated on its site" because it did not open them. Both kinds of
    // agreement its terms describe are on the line, so it stays "partial".
    expect(contract('patientpop').vendor).toBe('partial')
    expect(contract('patientpop').vendorNote).toMatch(/renew automatically for the same term unless you give 60 days’ notice/)
    expect(contract('patientpop').vendorNote).toMatch(/no early cancellation/)
    expect(contract('patientpop').vendorNote).toMatch(/month-to-month agreements/)
  })

  it('what the reads found them AHEAD on is on the page too', () => {
    const row = (slug: string, feature: string) => entry(slug).matrix.find((r) => r.feature.includes(feature))!
    // Dental Intelligence sells phones and eligibility checks now; the page
    // used to say it had neither.
    expect(row('dental-intelligence', 'VoIP phones').vendor).toBe('yes')
    expect(row('dental-intelligence', 'Insurance eligibility').vendor).toBe('yes')
    // RevenueWell's shared text-and-email inbox, and its phone add-on.
    expect(row('revenuewell', 'Unified patient inbox').vendor).toBe('yes')
    expect(row('revenuewell', 'VoIP phones').vendor).toBe('yes')
    expect(row('podium', 'VoIP phones').vendor).toBe('yes')
  })

  it('the claims the reads could NOT confirm are gone, not restated with more confidence', () => {
    const text = (slug: string) => JSON.stringify(entry(slug))
    // A product name that is not on RevenueWell's site today, an adjective
    // nobody re-verified, and a channel its pages no longer mention.
    expect(text('revenuewell')).not.toMatch(/PatientConnect365|vendor-branded|postcard/i)
    // "Runs under its own brand" was asserted of an app the vendor's home
    // page no longer names.
    expect(text('dental-intelligence')).not.toMatch(/runs under its own brand|not clinic-branded/i)
    // Tebra's terms name no length, so no sentence gives its agreements one.
    expect(text('patientpop')).not.toMatch(/on annual contracts|typically annual|don’t mind an annual contract|reviewers report annual/)
    expect(text('patientpop')).toMatch(/do not mention dentistry/)
  })
})
