import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'

/**
 * THE PRICING GUIDE — /resources/dental-software-pricing.
 *
 * The page reports what each competitor's OWN website says about its price.
 * It is only worth publishing while three things hold, and each block below
 * is one of them:
 *
 *  1. It has no words of its own about a competitor. Every price, contract
 *     answer, source and date is the comparison registry's, so the guide and
 *     the comparison pages cannot disagree.
 *  2. It never puts a number in a vendor's mouth. A vendor whose site states
 *     no price is listed as stating none.
 *  3. It is dated truthfully — its own date is the day of the newest read,
 *     and an entry nobody read is not on it at all.
 */

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

import PricingGuide, { metadata } from '@/app/(marketing)/resources/dental-software-pricing/page'
import {
  COMPARISONS,
  contractAnswer,
  formatCheckedOn,
  latestPricingCheck,
  publishesPrice,
  searchName,
} from '@/lib/marketing/comparisons'
import { publicPages } from '@/lib/marketing/public-pages'
import { getResourceGuide } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS, TRIAL, usd } from '@/lib/marketing/site'
import { contentKey } from '@/lib/indexnow'
import { getQuotedPlan } from '@/lib/stripe-config'

const guide = getResourceGuide('dental-software-pricing')!
const read = COMPARISONS.filter((c) => c.pricingChecked)

/** The list under a chapter heading. */
function listUnder(heading: string | RegExp): HTMLElement {
  const h2 = screen.getByRole('heading', { level: 2, name: heading })
  let el = h2.nextElementSibling
  while (el && el.tagName !== 'UL') el = el.nextElementSibling
  expect(el, `no list under "${String(heading)}"`).toBeTruthy()
  return el as HTMLElement
}

describe('the registry’s readers the guide is built on', () => {
  it('EVERY pricing line opens one of the ways the registry writes them — so nothing is classified by accident', () => {
    for (const c of COMPARISONS) {
      expect(c.reportedPricing, c.slug).toMatch(/^(Published\b|No (subscription )?price published|Custom quote only)/)
    }
  })

  it('"publishes a price" is exactly the entries whose line opens "Published"', () => {
    // Four of eight since the browser re-read of 2026-11-25; the read of the day
    // before had it as two, and was wrong about Podium and Tebra
    // (tests/marketing/comparison-pricing-check.test.tsx has the account).
    expect(COMPARISONS.filter(publishesPrice).map((c) => c.slug).sort()).toEqual(['patientpop', 'podium', 'solutionreach', 'weave'])
    // The premise both branches of the page rest on.
    expect(COMPARISONS.some(publishesPrice)).toBe(true)
    expect(COMPARISONS.some((c) => !publishesPrice(c))).toBe(true)
  })

  it('a vendor that publishes no price has no dollar figure before its attribution', () => {
    for (const c of COMPARISONS.filter((x) => !publishesPrice(x))) {
      const [vendorsOwnHalf] = c.reportedPricing.split(';')
      expect(vendorsOwnHalf, c.slug).not.toMatch(/\$\d/)
      expect(c.reportedPricing, c.slug).toMatch(/third-party reviews report/)
    }
  })

  it('every vendor has a contract answer with a note to print', () => {
    for (const c of COMPARISONS) {
      const answer = contractAnswer(c)
      expect(['yes', 'no', 'partial'], c.slug).toContain(answer.value)
      expect(answer.note.length, `${c.slug}: no note on its contract row`).toBeGreaterThan(5)
    }
  })

  it('the latest check is the newest date in the registry', () => {
    const days = COMPARISONS.map((c) => c.pricingChecked?.on).filter(Boolean) as string[]
    expect(latestPricingCheck()).toBe([...days].sort().reverse()[0])
    expect(latestPricingCheck([])).toBeUndefined()
  })
})

describe('1 — it has no words of its own about a competitor', () => {
  it('each vendor’s line is its registry pricing line, verbatim, with its source and a way to the full comparison', () => {
    render(<PricingGuide />)
    const list = listUnder(/What each vendor’s own site says/)
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(read.length)
    read.forEach((c, i) => {
      const row = rows[i]!
      expect(row.textContent, c.slug).toContain(`${c.name}. ${c.reportedPricing}.`)
      expect(row.textContent, c.slug).toContain(`Read ${formatCheckedOn(c.pricingChecked!.on)} against`)
      const source = within(row).getByRole('link', { name: c.pricingChecked!.source })
      expect(source, c.slug).toHaveAttribute('href', c.pricingChecked!.url)
      // A citation, not an endorsement — and it opens the vendor's own site.
      expect(source.getAttribute('rel') ?? '', c.slug).toContain('nofollow')
      expect(new URL(c.pricingChecked!.url).hostname, c.slug).not.toMatch(/dreamcreatestudio|g2\.com|capterra/)
      expect(within(row).getByRole('link', { name: 'The full comparison' }), c.slug).toHaveAttribute(
        'href',
        `/compare/${c.slug}`,
      )
      // An entry whose fees and terms were read out in full is linked straight
      // to that section; one that was not has no such link to follow nowhere.
      const deep = within(row).queryByRole('link', { name: `${searchName(c)} pricing, line by line` })
      if (c.pricingDetail) expect(deep, c.slug).toHaveAttribute('href', `/compare/${c.slug}#pricing`)
      else expect(deep, c.slug).toBeNull()
    })
    expect(read.some((c) => c.pricingDetail)).toBe(true)
  })

  it('each contract line is the registry’s own row', () => {
    render(<PricingGuide />)
    const rows = within(listUnder(/Can you pay month to month\?/)).getAllByRole('listitem')
    expect(rows).toHaveLength(read.length)
    const word = { yes: 'Yes', no: 'No', partial: 'Not clear' } as const
    read.forEach((c, i) => {
      const answer = contractAnswer(c)
      expect(rows[i]!.textContent, c.slug).toBe(`${c.name}: ${word[answer.value]} — ${answer.note}.`)
    })
  })
})

describe('2 — it never puts a number in a vendor’s mouth', () => {
  it('names who publishes a price and who does not, and the two lists are everyone exactly once', () => {
    render(<PricingGuide />)
    // "On their pricing page", not "on their own site": Adit's site carries a
    // figure in structured data and RevenueWell's in an offer headline, and a
    // heading that said neither site states a price would be untrue of both.
    const yes = screen.getByText('A price on their pricing page:').closest('p')!.textContent!
    const no = screen.getByText('No price on their pricing page:').closest('p')!.textContent!
    for (const c of read) {
      const inYes = yes.includes(c.name)
      const inNo = no.includes(c.name)
      expect(inYes !== inNo, `${c.name} is in ${inYes && inNo ? 'both lists' : 'neither list'}`).toBe(true)
      expect(inYes, c.name).toBe(publishesPrice(c))
    }
    // And the sentence that stops a reader taking a reviewer's figure for a
    // price the vendor quotes.
    expect(no).toMatch(/says where it came from/)
    expect(no).toMatch(/not a price the vendor’s pricing page gives a buyer\./)
  })

  it('the count in the opening sentence is computed from those same lists', () => {
    render(<PricingGuide />)
    const silent = read.filter((c) => !publishesPrice(c)).length
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.includes(`Of the ${read.length} vendors below, ${silent} show no price on their pricing page.`) === true),
    ).toBeInTheDocument()
  })

  it('is not a ranking, and does not list us among the vendors', () => {
    const { container } = render(<PricingGuide />)
    const article = container.querySelector('article')!.textContent!
    expect(article).not.toMatch(/\bbest\b|\bwinner\b|#1|\bour pick\b|\btop pick\b|\branked\b/i)
    const rows = within(listUnder(/What each vendor’s own site says/)).getAllByRole('listitem')
    for (const row of rows) expect(row.textContent).not.toMatch(/^DreamCRM\./)
    // It says why a reader should check it rather than trust it.
    expect(article).toMatch(/We make one of the products in this market/)
  })

  it('makes no compliance claim, and repeats none of a vendor’s', () => {
    const { container } = render(<PricingGuide />)
    expect(container.textContent).not.toMatch(/hipaa|\bcompliant\b|soc ?2|bank[- ]level|secure patient data/i)
  })
})

describe('3 — it is dated truthfully', () => {
  it('the guide’s own date is the day of the newest read — so its sitemap date is true', () => {
    expect(guide.datePublished).toBe(latestPricingCheck())
    const page = publicPages([]).find((p) => p.path === '/resources/dental-software-pricing')!
    expect(page.lastModified).toBe(latestPricingCheck())
  })

  it('says when the most recent read was', () => {
    render(<PricingGuide />)
    expect(
      screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.includes(`the most recent read was ${formatCheckedOn(latestPricingCheck()!)}`) === true),
    ).toBeInTheDocument()
  })

  it('its content key follows the registry it is built from, not only its own entry', () => {
    const page = publicPages([]).find((p) => p.path === '/resources/dental-software-pricing')!
    // Keyed on more than the guide's entry…
    expect(page.contentKey).not.toBe(contentKey(guide))
    // …while an ordinary guide is still keyed on its entry alone.
    const other = getResourceGuide('dental-recall-scripts')!
    expect(publicPages([]).find((p) => p.path === '/resources/dental-recall-scripts')!.contentKey).toBe(contentKey(other))
  })
})

describe('our own price', () => {
  it('closes on our price, resolved, with the trial and its card — and no other figure of ours', () => {
    render(<PricingGuide />)
    const price = `${usd(getQuotedPlan().price)}/mo`
    expect(screen.getByRole('heading', { level: 2, name: 'Our price is on the page' })).toBeInTheDocument()
    const close = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent?.startsWith('DreamCRM is ') === true)
    expect(close.textContent).toBe(
      `DreamCRM is ${price}, flat, month-to-month, after ${TRIAL.days} days free. A card starts the trial and is not charged until it ends.`,
    )
    expect(close.textContent).not.toMatch(/no card/i)
  })

  it('does not close on the how-to guides’ line — nothing in this guide is "a job the software does"', () => {
    render(<PricingGuide />)
    expect(screen.queryByText('Everything in this guide is a job the software does')).toBeNull()
  })

  it('does not offer itself as something to copy — it says what a reference page can promise', () => {
    render(<PricingGuide />)
    expect(screen.queryByText('Free to copy and use in your practice')).toBeNull()
    expect(screen.getByText('Every line links to its source')).toBeInTheDocument()
  })
})

describe('the wiring', () => {
  it('has a complete head, typed as an article', () => {
    expect(String(metadata.title)).toMatch(/pricing/i)
    expect(metadata.description).toBe(guide.description)
    expect(metadata.alternates?.canonical).toBe('/resources/dental-software-pricing')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('is linked from the footer of every marketing page', () => {
    expect(FOOTER_COLUMNS.flatMap((c) => c.links)).toContainEqual({
      label: 'Dental software pricing',
      href: '/resources/dental-software-pricing',
    })
  })
})
