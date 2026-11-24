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
 * THE REMAINING FIVE, RE-READ 2026-11-24 — and what the read found is that
 * NONE of them publishes a price. So the rule these hold is NexHealth's: the
 * page says the vendor shows no number, and any figure on the line is
 * attributed to the third parties who reported it. A number sitting beside a
 * "last checked against their own page" stamp, on a page that shows none,
 * would be the stamp vouching for something the vendor never said.
 *
 * Four were read first-hand (the page text fetched and searched for each
 * phrase); Adit's came through the fetch tool twice, because its site
 * answers a plain request with a challenge page.
 */
describe('the five entries re-read on 2026-11-24', () => {
  const FIVE: Array<[slug: string, host: string]> = [
    ['revenuewell', 'revenuewell.com'],
    ['adit', 'adit.com'],
    ['dental-intelligence', 'dentalintel.com'],
    ['podium', 'podium.com'],
    ['patientpop', 'tebra.com'],
  ]

  it.each(FIVE)('%s: dated that day, against a page on %s', (slug, host) => {
    const c = COMPARISONS.find((x) => x.slug === slug)!
    expect(c.pricingChecked?.on).toBe('2026-11-24')
    expect(new URL(c.pricingChecked!.url).hostname.endsWith(host)).toBe(true)
  })

  it.each(FIVE)('%s: says the vendor publishes no price, and attributes the only figure to third parties', (slug) => {
    const c = COMPARISONS.find((x) => x.slug === slug)!
    expect(c.reportedPricing).toMatch(/^No (subscription )?price published/)
    // The figure survives — it is useful to a buyer — but never as theirs.
    const [, afterTheSemicolon] = c.reportedPricing.split(';')
    expect(afterTheSemicolon, `${slug}: the figure must follow the attribution`).toMatch(/third-party reviews report ~\$\d/)
    expect(c.reportedPricing.split(';')[0], `${slug}: no dollar figure in the vendor's own half`).not.toMatch(/\$\d/)
  })

  it('every contract answer that changed is the vendor’s own, and says so', () => {
    const contract = (slug: string) =>
      COMPARISONS.find((c) => c.slug === slug)!.matrix.find((r) => r.feature.startsWith('Month-to-month'))!
    // RevenueWell's site: "Monthly and annual contracts available".
    expect(contract('revenuewell').vendor).toBe('yes')
    expect(contract('revenuewell').vendorNote).toMatch(/Monthly and annual contracts, per its own site/)
    // Adit's pricing FAQ: no binding contract on the software; the marketing
    // program is a one-year commitment. Both halves stay on the line.
    expect(contract('adit').vendor).toBe('yes')
    expect(contract('adit').vendorNote).toMatch(/No binding contract/)
    expect(contract('adit').vendorNote).toMatch(/one-year commitment/)
    // The three whose pages state no terms are NOT upgraded to a flat "no":
    // what reviewers report is said to be what reviewers report.
    for (const slug of ['dental-intelligence', 'podium', 'patientpop']) {
      expect(contract(slug).vendor, slug).toBe('partial')
      expect(contract(slug).vendorNote, slug).toMatch(/not stated/i)
    }
  })

  it('what the read found them AHEAD on is on the page too', () => {
    const row = (slug: string, feature: string) =>
      COMPARISONS.find((c) => c.slug === slug)!.matrix.find((r) => r.feature.includes(feature))!
    // Dental Intelligence sells phones and eligibility checks now; the page
    // used to say it had neither.
    expect(row('dental-intelligence', 'VoIP phones').vendor).toBe('yes')
    expect(row('dental-intelligence', 'Insurance eligibility').vendor).toBe('yes')
    // RevenueWell's shared text-and-email inbox, and its phone add-on.
    expect(row('revenuewell', 'Unified patient inbox').vendor).toBe('yes')
    expect(row('revenuewell', 'VoIP phones').vendor).toBe('yes')
    expect(row('podium', 'VoIP phones').vendor).toBe('yes')
  })

  it('the claims the read could NOT confirm are gone, not restated with more confidence', () => {
    const text = (slug: string) => JSON.stringify(COMPARISONS.find((c) => c.slug === slug))
    // A product name that is not on RevenueWell's site today, an adjective
    // nobody re-verified, and a channel its pages no longer mention.
    expect(text('revenuewell')).not.toMatch(/PatientConnect365|vendor-branded|postcard/i)
    // "Runs under its own brand" was asserted of an app the vendor's home
    // page no longer names.
    expect(text('dental-intelligence')).not.toMatch(/runs under its own brand|not clinic-branded/i)
    // Tebra's pages state no contract terms, so no sentence states them for it.
    expect(text('patientpop')).not.toMatch(/on annual contracts|typically annual|don’t mind an annual contract/)
    expect(text('patientpop')).toMatch(/do not mention dentistry/)
  })
})

describe('the comparison page', () => {
  it('shows the day and links the source on a page whose pricing was re-read', async () => {
    const weave = COMPARISONS.find((c) => c.slug === 'weave')!
    render(await ComparePage({ params: Promise.resolve({ vendor: 'weave' }) }))
    expect(screen.getByText(/Weave pricing last checked November 23, 2026 against/)).toBeInTheDocument()
    const source = screen.getByRole('link', { name: weave.pricingChecked!.source })
    expect(source).toHaveAttribute('href', weave.pricingChecked!.url)
    // A citation, not an endorsement.
    expect(source.getAttribute('rel') ?? '').toContain('nofollow')
  })

  it('every page now carries a date, and each one links ITS OWN source', async () => {
    // The last unchecked entry was re-read on 2026-11-24, so the case that
    // used to stand here — "an unchecked page shows no date" — had no entry
    // left to stand on. The rule itself did not go anywhere: it is held on a
    // synthetic unchecked vendor in tests/marketing/unchecked-comparison.test.tsx.
    expect(COMPARISONS.every((c) => c.pricingChecked)).toBe(true)
    for (const c of COMPARISONS) {
      const { unmount } = render(await ComparePage({ params: Promise.resolve({ vendor: c.slug }) }))
      expect(
        screen.getByText(new RegExp(`pricing last checked ${formatCheckedOn(c.pricingChecked!.on)} against`)),
        c.slug,
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: c.pricingChecked!.source }), c.slug).toHaveAttribute(
        'href',
        c.pricingChecked!.url,
      )
      unmount()
    }
  })
})
