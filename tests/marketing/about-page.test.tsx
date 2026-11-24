import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import React from 'react'
import AboutPage, { metadata } from '@/app/(marketing)/about/page'
import { buildAbout, operatorPlace } from '@/lib/marketing/about'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { OPERATOR } from '@/lib/marketing/legal'
import { buildListingKit } from '@/lib/marketing/listing-kit'
import { FOOTER_COLUMNS, MARKETING, MARKETING_PUBLIC_PATHS, TRIAL, usd } from '@/lib/marketing/site'
import { publicPages, HAND_WRITTEN_KEY } from '@/lib/marketing/public-pages'
import { getQuotedPlan } from '@/lib/stripe-config'

/**
 * /about — WHICH DREAMCRM THIS IS (lib/marketing/about.ts).
 *
 * The page exists so that the plain facts about the product are written in
 * one place an assistant, a marketplace reviewer or a buyer can quote. A
 * facts page is only worth having while every fact on it is true, so each
 * block below is one way it could stop being: a typed price, a trial without
 * its card, a claim the product does not meet, a second wording that
 * disagrees with the outside profiles, a name it was not meant to print.
 */

const about = buildAbout()
const kit = buildListingKit()
const plan = getQuotedPlan()
const kitField = (id: string) => kit.fields.find((f) => f.id === id)!.text
const everything = [
  about.title,
  about.summary,
  ...about.facts.flatMap((f) => [f.term, f.detail]),
  ...about.included,
  ...about.notIncluded,
  ...about.sameName,
].join('\n')

describe('it says the same thing the outside profiles say', () => {
  it('the summary, the definition, the audience and the price are the listing kit’s own sentences', () => {
    const fact = (term: string) => about.facts.find((f) => f.term === term)!.detail
    expect(about.summary).toBe(kitField('short'))
    expect(fact('What it is')).toBe(kitField('one-line'))
    expect(fact('Who it is for')).toBe(kitField('audience'))
    expect(fact('What it costs')).toBe(kitField('pricing'))
  })

  it('what is included, and what is not, are the kit’s lists — not a second copy', () => {
    expect(about.included).toEqual(kit.features)
    expect(about.notIncluded).toEqual(kit.notIncluded)
  })

  it('links every comparison page we publish, and no other', () => {
    expect(about.compare).toEqual(COMPARISONS.map((c) => ({ name: c.name, href: `/compare/${c.slug}` })))
  })
})

describe('every figure is the resolved one', () => {
  it('the price is the published plan’s, and no other dollar figure appears', () => {
    const figures = Array.from(new Set(everything.match(/\$[\d,]+/g) ?? []))
    expect(figures.sort()).toEqual([usd(plan.price), usd(plan.annualPrice)].sort())
  })

  it('the trial is named at its real length, with its card, in the site’s one sentence for it', () => {
    const trial = about.facts.find((f) => f.term === 'The free trial')!.detail
    expect(trial).toBe(`A ${TRIAL.name}. ${TRIAL.cardTerms}`)
    expect(everything).not.toMatch(/no (credit )?card|without a card|cardless/i)
  })

  it('the place is derived from the operator record — the town and the state, never the street or the ZIP', () => {
    expect(operatorPlace()).toBe('Ward, Arkansas')
    expect(operatorPlace('Little Rock, AR 72201')).toBe('Little Rock, Arkansas')
    // An unknown state keeps its code rather than inventing a name.
    expect(operatorPlace('Tulsa, OK 74103')).toBe('Tulsa, OK')
    expect(operatorPlace('somewhere odd')).toBe('somewhere odd')
    expect(everything).toContain(`${OPERATOR.business}, in Ward, Arkansas.`)
    expect(everything).not.toContain(OPERATOR.street)
    expect(everything).not.toMatch(/\b\d{5}\b/)
  })
})

describe('what it does not say', () => {
  it('it does not name the person who operates the company, or print an email address', () => {
    // The Privacy Policy names the operator, as it must. Whether a marketing
    // page should is an open owner ruling — until then this page links there.
    expect(everything).not.toContain(OPERATOR.person)
    for (const part of OPERATOR.person.split(' ')) expect(everything, part).not.toContain(part)
    expect(everything).not.toMatch(/@/)
  })

  it('no compliance or security claim, no superlative, and texting only as something it does not do', () => {
    expect(everything).not.toMatch(
      /hipaa|\bcompliant\b|\bcompliance\b|\bcertified\b|soc ?2|bank[- ]level|secure patient data|\bguarantee|\bencrypt/i,
    )
    expect(everything).not.toMatch(/\bbest\b|\bleading\b|#1|\bthe only\b|nobody else|world[- ]class/i)
    const positive = [about.title, about.summary, ...about.facts.map((f) => f.detail), ...about.included].join('\n')
    expect(positive).not.toMatch(/\bsms\b|text messag|texting|\bphones?\b|voip/i)
    expect(about.notIncluded.join('\n')).toMatch(/Text messaging \(SMS\) — not available today/)
  })

  it('Open Dental is not named here either — the same open ruling as the listing kit', () => {
    expect(everything).not.toMatch(/open ?dental/i)
  })

  it('it names no other product called DreamCRM — only that the name is shared', () => {
    expect(about.sameName.join(' ')).toMatch(/Other, unrelated products are also called DreamCRM\./)
    expect(about.sameName.join(' ')).toMatch(/built only for dental practices/)
    expect(about.sameName.join(' ')).toContain('www.dreamcreatestudio.com')
    expect(about.sameName.join(' ')).not.toMatch(/iOS|app store|dreams crm|goodfirms/i)
  })

  it('"dental" is in the title, the summary and every fact that describes the product', () => {
    expect(about.title).toMatch(/dental/)
    expect(about.summary).toMatch(/dental/)
    for (const term of ['What it is', 'Who makes it', 'Who it is for', 'What it costs', 'What it works with']) {
      expect(about.facts.find((f) => f.term === term)!.detail.toLowerCase(), term).toMatch(/dental/)
    }
  })
})

describe('the page', () => {
  it('renders the definition as the first heading and the facts as a real definition list', () => {
    const { container } = render(<AboutPage />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(about.title)
    const terms = Array.from(container.querySelectorAll('dl dt')).map((n) => n.textContent)
    expect(terms).toEqual(about.facts.map((f) => f.term))
    const details = Array.from(container.querySelectorAll('dl dd')).map((n) => n.textContent)
    expect(details).toEqual(about.facts.map((f) => f.detail))
  })

  it('has a section for what it does not do, and one for the shared name', () => {
    render(<AboutPage />)
    const not = screen.getByRole('heading', { level: 2, name: 'What it does not do' }).closest('section')!
    for (const item of about.notIncluded) expect(within(not).getByText(item)).toBeInTheDocument()
    const name = screen.getByRole('heading', { level: 2, name: 'Other products share the name' }).closest('section')!
    for (const p of about.sameName) expect(within(name).getByText(p)).toBeInTheDocument()
  })

  it('points to the Privacy Policy for who operates it, and to the Terms', () => {
    render(<AboutPage />)
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy#contact')
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  })

  it('offers the trial once, at the top, with its length and its card resolved', () => {
    render(<AboutPage />)
    // The comparison pages' own label; the length is in the sentence beside it.
    const door = screen.getByRole('link', { name: 'Start your free trial' })
    expect(door).toHaveAttribute('href', '/signup')
    // The hook the browser sweep measures, and the wrapper that keeps the
    // button from being squeezed onto two lines beside its caption. Whether
    // it actually stays on one line is a layout question, answered in
    // e2e/marketing-viewport.spec.ts.
    expect(door).toHaveAttribute('data-cta', 'primary')
    expect(door.parentElement?.className).toContain('sm:shrink-0')
    expect(
      screen.getByText(
        `${TRIAL.chip}. Card to start, not charged until the trial ends. ${usd(plan.price)}/mo after, month-to-month.`,
      ),
    ).toBeInTheDocument()
  })

  it('links each comparison', () => {
    render(<AboutPage />)
    for (const c of COMPARISONS) {
      expect(screen.getByRole('link', { name: `${MARKETING.productName} and ${c.name}` })).toHaveAttribute(
        'href',
        `/compare/${c.slug}`,
      )
    }
  })

  it('its head names the product with "dental", the maker, the resolved price and the trial — under 160 characters', () => {
    const description = String(metadata.description)
    expect(String(metadata.title)).toBe('About DreamCRM: dental front-office software by Dream Create')
    expect(description).toMatch(/dental practice software by Dream Create/)
    expect(description).toContain(`${usd(plan.price)}/mo`)
    expect(description).toContain(TRIAL.name)
    expect(description.length).toBeLessThanOrEqual(160)
    expect(metadata.alternates?.canonical).toBe('/about')
  })
})

describe('it is a public page like any other', () => {
  it('is on the one list the middleware, the sitemap and the search notices read', () => {
    expect(MARKETING_PUBLIC_PATHS).toContain('/about')
    const page = publicPages([]).find((p) => p.path === '/about')!
    expect(page).toBeTruthy()
    // Keyed on its own data, so a reprice or a trial ruling re-announces it.
    expect(page.contentKey).not.toBe(HAND_WRITTEN_KEY)
  })

  it('is linked from the footer of every marketing page', () => {
    const links = FOOTER_COLUMNS.flatMap((c) => c.links)
    expect(links).toContainEqual({ label: 'About DreamCRM', href: '/about' })
  })
})
