import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

/**
 * A DATED PRICING CHECK — the comparison refresh of 2026-11-23.
 *
 * The Weave page said "reported ~$249–$449/mo … annual agreements" for months
 * after Weave began publishing a $199 base price, two $149 bundles and a "no
 * long-term contracts" answer on its own site. Nothing in the tree could say
 * how old the number was, so nothing prompted anyone to re-read it. A
 * comparison page is where paid traffic lands and what an assistant quotes
 * back to a buyer, so a stale competitor fact is a conversion problem and an
 * honesty one at once.
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

  it('shows NO date on a page nobody re-read — an unchecked line gets no timestamp', async () => {
    const unchecked = COMPARISONS.find((c) => !c.pricingChecked)
    // The premise: the registry still has an entry that has not been re-read.
    // When the last one is checked, delete this case rather than loosen it.
    expect(unchecked, 'every comparison now carries a dated check').toBeTruthy()
    render(await ComparePage({ params: Promise.resolve({ vendor: unchecked!.slug }) }))
    expect(screen.queryByText(/pricing last checked/i)).not.toBeInTheDocument()
  })
})
