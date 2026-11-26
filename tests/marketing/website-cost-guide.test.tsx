import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import WebsiteCostGuide, { metadata } from '@/app/(marketing)/resources/dental-website-cost/page'
import PricingGuide from '@/app/(marketing)/resources/dental-software-pricing/page'
import {
  WAYS_TO_BUY,
  WEBSITE_COST_REFERENCES,
  WEBSITE_SELLERS,
  ourWebsiteAnswers,
  threeYearSum,
  threeYearTotal,
} from '@/lib/marketing/website-costs'
import { DOCS } from '@/lib/marketing/docs'
import { TERMS_OF_SERVICE } from '@/lib/marketing/legal'
import { buildListingKit } from '@/lib/marketing/listing-kit'
import { GUIDE_SHORT_TITLES, getResourceGuide } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS, TRIAL, usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { publicPages } from '@/lib/marketing/public-pages'
import { contentKey } from '@/lib/indexnow'

/**
 * WHAT A DENTAL WEBSITE COSTS (organic queue item 5, 2026-11-26).
 *
 * The one guide in the library that prices something we sell, beside other
 * people who sell it. Everything that could make such a page worthless is
 * held here:
 *
 *   1. EVERY OUTSIDE PRICE IS A LINE FROM THE SELLER'S OWN PAGE, read in a
 *      browser on a stated day, pinned below word for word, linked and dated
 *      on the page. Nothing is printed for a seller whose page showed no
 *      price, and the page never says of anybody that they publish none
 *      (that claim takes three reads — CLAUDE.md — and this page makes none).
 *
 *   2. THE ARITHMETIC IS TIED TO THE QUOTES. Each number in a three-year
 *      total must appear in that seller's own lines, and the totals on the
 *      page are recomputed here.
 *
 *   3. THE PAGE SAYS WE ARE NOT THE CHEAPEST. On its own numbers a site
 *      builder is, and the sentence that says so is asserted.
 *
 *   4. THE TRADE-PRESS FIGURE IS LABELLED A SELLER'S, in the magazine's own
 *      description of the author's firm.
 *
 *   5. OUR OWN ANSWERS ARE READ, NOT TYPED: the price from the plan config,
 *      the pricing sentence from the listing kit, what happens when a
 *      subscription ends from the Terms. And the page says the site has no
 *      export — which a help article denied until this change.
 */

const guide = getResourceGuide('dental-website-cost')!
const PLAN = getQuotedPlan()

function renderGuide() {
  const { container } = render(<WebsiteCostGuide />)
  return {
    container,
    text: container.textContent ?? '',
    article: container.querySelector('article')?.textContent ?? '',
    cards: Array.from(container.querySelectorAll('figure')).map((f) => ({
      label: f.querySelector('figcaption')?.textContent ?? '',
      body: f.querySelector('blockquote')?.textContent ?? '',
    })),
  }
}

const terms = (id: string, i: number) => TERMS_OF_SERVICE.sections.find((s) => s.id === id)!.paragraphs![i]!

describe('the registry entry', () => {
  it('is named for the question a practice types', () => {
    expect(guide).toBeTruthy()
    expect(guide.title).toMatch(/^How much does a dental website cost\?/)
    expect(guide.glyph).toBe('globe')
    expect(GUIDE_SHORT_TITLES['dental-website-cost']).toBe('Dental website cost')
  })
})

describe('what each seller publishes — pinned as read on 2026-11-26', () => {
  it('five sellers, each line word for word', () => {
    expect(WEBSITE_SELLERS.map((s) => [s.id, s.name, s.way, s.source.url])).toEqual([
      ['squarespace', 'Squarespace', 'builder', 'https://www.squarespace.com/pricing'],
      ['wix', 'Wix', 'builder', 'https://www.wix.com/plans'],
      ['docsites', 'DocSites', 'template', 'https://www.docsites.com/web-designs/'],
      ['infostar', 'InfoStar Productions', 'custom', 'https://www.dentalpatienteducationsidekick.com/pricing'],
      ['whiteboard', 'Whiteboard Marketing', 'custom', 'https://whiteboard-mktg.com/pricing/'],
    ])
    const by = Object.fromEntries(WEBSITE_SELLERS.map((s) => [s.id, s]))
    expect(by.squarespace.plans).toEqual([
      { name: 'Basic', perMonth: 19 },
      { name: 'Core', perMonth: 29 },
      { name: 'Plus', perMonth: 49 },
      { name: 'Advanced', perMonth: 99 },
    ])
    expect(by.squarespace.lines).toEqual([{ text: 'Pay annually to save up to 36%.' }])
    expect(by.wix.plans).toEqual([
      { name: 'Light', perMonth: 17 },
      { name: 'Core', perMonth: 29 },
      { name: 'Business', perMonth: 39 },
      { name: 'Business Elite', perMonth: 159 },
    ])
    expect(by.wix.lines).toEqual([
      { text: 'Displayed prices are for yearly subscriptions, paid in full at the time of purchase.' },
    ])
    // The offer the page was showing that day is named, and is not a price.
    expect(by.wix.offerShown).toBe('(Save 50%)')
    expect(WEBSITE_SELLERS.filter((s) => s.offerShown).map((s) => s.id)).toEqual(['wix'])
    expect(by.docsites.lines).toEqual([
      { under: 'STANDARD', text: '$1,999 Setup (one-time fee)' },
      { under: 'PLUS', text: '$2,999 Setup (one-time fee)' },
      { under: 'PREMIER', text: '$3,999 Setup (one-time fee)' },
      { text: '$89 per month (month-to-month)' },
      { text: 'All Website Options include monthly hosting, SSL Certificate, and website updates by Client request.' },
      { text: 'Standard Monthly Service Fee: $89 per month includes Hosting and Updates by Request (up to 1 hour)' },
    ])
    expect(by.infostar.lines).toEqual([
      {
        text: 'Dental is the one industry where we publish standard packages: $3,500–$6,500 build, hosting typically $99–$150/month, and all-inclusive packages from $500 a month with the build included.',
      },
    ])
    expect(by.whiteboard.lines).toEqual([
      { under: 'Websites', text: '*From $8,900' },
      { under: 'Website Hosting', text: '*From $299/yr' },
      { under: 'Website Management', text: '*From $150/mo' },
    ])
    for (const s of WEBSITE_SELLERS) {
      expect(s.source.url, s.id).toMatch(/^https:\/\//)
      expect(s.source.readOn, s.id).toBe('2026-11-26')
    }
  })

  it('every number in a three-year total is on that seller’s own lines', () => {
    for (const s of WEBSITE_SELLERS) {
      const own = [...s.lines.map((l) => l.text), ...(s.plans ?? []).map((p) => `$${p.perMonth}`)].join(' | ')
      const { upFront, perMonth, perYear } = s.threeYears
      for (const [what, n] of [
        ['up front', upFront],
        ['per month', perMonth],
        ['per year', perYear],
      ] as const) {
        if (n === 0) continue
        // `usd` writes 1999 as "$1,999" — the way each seller's page does.
        expect(own, `${s.id}: ${what} ${usd(n)} is not a number the seller’s page states`).toContain(usd(n))
      }
      expect(upFront + perMonth + perYear, `${s.id}: an empty example`).toBeGreaterThan(0)
    }
  })

  it('the arithmetic is thirty-six months and three years, and nothing else', () => {
    const by = Object.fromEntries(WEBSITE_SELLERS.map((s) => [s.id, s]))
    expect(threeYearTotal(by.squarespace.threeYears)).toBe(36 * 29)
    expect(threeYearTotal(by.wix.threeYears)).toBe(36 * 29)
    expect(threeYearTotal(by.docsites.threeYears)).toBe(1999 + 36 * 89)
    expect(threeYearTotal(by.infostar.threeYears)).toBe(3500 + 36 * 99)
    expect(threeYearTotal(by.whiteboard.threeYears)).toBe(8900 + 3 * 299)
    expect(threeYearSum(by.docsites.threeYears)).toBe('$1,999 + 36 × $89 = $5,203')
    expect(threeYearSum(by.whiteboard.threeYears)).toBe('$8,900 + 3 × $299 = $9,797')
    expect(threeYearSum(by.squarespace.threeYears)).toBe('36 × $29 = $1,044')
  })

  it('the two reference figures, pinned', () => {
    expect(WEBSITE_COST_REFERENCES.ada.says).toEqual({
      range:
        'Generally speaking, dental practices interested in basic but customized websites can expect to invest about $6,000; high-end websites with additional features can cost as much as $25,000.',
      marketer:
        'A basic estimate for having a professional marketer use their expertise and staff to create your website can cost $10,000 to $12,000.',
      budget: 'It’s a good rule of thumb to plan on spending 5-10% of your total marketing budget to update your website.',
      agreement:
        'A written agreement can protect your ownership rights to the domain name of your website as well as all the copyrights and trademarks in the information, graphics, logos, etc.',
    })
    expect(WEBSITE_COST_REFERENCES.ada.source.url).toBe(
      'https://www.ada.org/resources/practice/practice-management/24_websitedevelopment_costs',
    )
    expect(WEBSITE_COST_REFERENCES.tradePress.says).toEqual({
      range: 'The cost of creating a unique dental website runs from $3,500 to $30,000, and sometimes even more than that.',
      average:
        'On average, most premier dental practices should budget around $14,000 for a new or redesigned custom website.',
      firm: 'Rosemont Media specializes in dental marketing, dental SEO, dental website design, dental social media marketing, and high-end custom strategies for esthetic practices.',
    })
    expect(WEBSITE_COST_REFERENCES.tradePress.source.pageSays).toBe('August 24, 2023')
    expect(WEBSITE_COST_REFERENCES.tradePress.author).toBe('Keith C. Humes')
  })
})

describe('the page prints what was read, and whose it is', () => {
  it('every seller’s lines and plans are on the page, linked and dated', () => {
    const { container, article } = renderGuide()
    for (const s of WEBSITE_SELLERS) {
      for (const l of s.lines) {
        expect(article, `${s.id}: “${l.text.slice(0, 40)}” is not on the page`).toContain(l.text)
        if (l.under) expect(article, `${s.id}: ${l.under}`).toContain(`${l.under}: “${l.text}”`)
      }
      for (const p of s.plans ?? []) expect(article, `${s.id}: ${p.name}`).toContain(`${p.name} at $${p.perMonth}/mo`)
      const link = container.querySelector(`a[href="${s.source.url}"]`)
      expect(link, `${s.id}: no link to its own page`).toBeTruthy()
      expect(link!.getAttribute('rel') ?? '', s.id).toContain('nofollow')
      expect(link!.textContent, s.id).toBe(s.source.label)
    }
    expect(article.match(/Read November 26, 2026 against/g)?.length).toBe(WEBSITE_SELLERS.length)
    // Each quoted line is its own line, not a run of quotations in a paragraph.
    const blocks = Array.from(container.querySelectorAll('article li span.block')).map((el) => el.textContent)
    expect(blocks).toEqual(WEBSITE_SELLERS.flatMap((s) => s.lines.map((l) => `${l.under ? `${l.under}: ` : ''}“${l.text}”`)))
    expect(article).toContain('An offer marked “(Save 50%)” was showing beside some of them that day.')
    // The three ways to buy are named, and every seller sits under its own.
    for (const way of Object.values(WAYS_TO_BUY)) expect(article).toContain(way.title)
  })

  it('the ADA’s figures are quoted, and the page says the ADA’s page carries no date', () => {
    const { container, article } = renderGuide()
    for (const words of Object.values(WEBSITE_COST_REFERENCES.ada.says)) expect(article).toContain(words)
    const link = container.querySelector(`a[href="${WEBSITE_COST_REFERENCES.ada.source.url}"]`)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
    expect(article).toMatch(/The American Dental Association’s guidance for practices/)
    expect(article).toMatch(/the page does not say when it was\s+written/)
  })

  it('the trade-press figure is labelled a seller’s, in the magazine’s own words', () => {
    const { container, article } = renderGuide()
    const ref = WEBSITE_COST_REFERENCES.tradePress
    expect(article).toContain(ref.says.range)
    expect(article).toContain(ref.says.average)
    expect(article).toContain(ref.says.firm)
    expect(article).toContain(ref.author)
    expect(article).toMatch(/in an article dated August 24, 2023/)
    expect(article).toMatch(/It is a seller’s estimate, and it is labelled as one here\./)
    expect(container.querySelector(`a[href="${ref.source.url}"]`)).toBeTruthy()
  })

  it('says nothing about a seller except what that seller’s page says', () => {
    const { article } = renderGuide()
    // No "they publish no price" (a claim that takes three reads), no ranking,
    // no adjectives about anybody's product.
    expect(article).not.toMatch(
      /publish(?:es)? no price|no price (?:on|published)|do(?:es)? not publish|won[’']t (?:tell|say)|hid(?:e|es|den)|call for (?:a )?(?:quote|pricing)|overpriced|rip-?off|scam|worst|\bbest\b|top-rated|leading|outdated|cookie-cutter/i,
    )
    // What the list is, said once: the sellers whose pages showed a price.
    expect(article).toMatch(/This is not every seller\. It is the ones whose own pages showed a price on the day we\s+looked/)
    // And the reader is told who is writing.
    expect(article).toMatch(/We sell a dental website ourselves/)
  })
})

describe('the same three years', () => {
  it('one worked example, every row recomputed from the registry and the plan config', () => {
    const { cards, article } = renderGuide()
    const card = cards.find((c) => /^Worked example ·/.test(c.label))!
    expect(card, 'no worked example').toBeTruthy()
    const rows = card.body.split('\n').filter(Boolean)
    const expected = [
      ...WEBSITE_SELLERS.map((s) => `${s.name}, ${s.threeYears.what}: ${threeYearSum(s.threeYears)}`),
      `DreamCRM, the subscription, paid monthly: 36 × ${usd(PLAN.price)} = ${usd(PLAN.price * 36)}`,
      `DreamCRM, the subscription, paid annually: 3 × ${usd(PLAN.annualPrice)} = ${usd(PLAN.annualPrice * 3)}`,
    ]
    expect(rows).toEqual(expected)
    // It is labelled for what it is.
    expect(article).toMatch(/It is our arithmetic on their numbers, and nothing else is in it/)
  })

  it('says we are not the cheapest — because on these numbers we are not', () => {
    const { article } = renderGuide()
    const builder = Math.min(...WEBSITE_SELLERS.filter((s) => s.way === 'builder').map((s) => threeYearTotal(s.threeYears)))
    const everyone = Math.min(...WEBSITE_SELLERS.map((s) => threeYearTotal(s.threeYears)))
    // The sentence is true of the registry, not only written on the page.
    expect(builder).toBe(everyone)
    expect(builder).toBeLessThan(PLAN.annualPrice * 3)
    expect(article).toMatch(/On these numbers, a site builder is the cheapest way to have a website, and DreamCRM is not\./)
  })

  it('opens with the range the page’s own sources support', () => {
    const { article } = renderGuide()
    const low = Math.min(...WEBSITE_SELLERS.flatMap((s) => (s.plans ?? []).map((p) => p.perMonth)))
    expect(article).toContain(`from ${usd(low)} a month on a site builder you run yourself`)
    expect(article).toMatch(/to five figures for a custom build/)
  })
})

describe('the questions, and our own answers', () => {
  it('asks the questions that make two quotes comparable, and quotes the ADA on ownership', () => {
    const { article } = renderGuide()
    for (const q of [
      'What is the total over three years?',
      'Who writes the pages?',
      'How many changes are included, and what does the next one cost?',
      'Who registers the domain, and in whose name?',
      'If you leave, what do you take with you?',
      'Is it month-to-month, or a term?',
      'Can a patient book and fill in forms on it?',
    ]) {
      expect(article, q).toContain(q)
    }
    expect(article).toContain(WEBSITE_COST_REFERENCES.ada.says.agreement)
  })

  it('answers them for our own product from the config, the listing kit and the Terms — not from memory', () => {
    const { article } = renderGuide()
    const ours = ourWebsiteAnswers()
    // The price sentence is the listing kit's, whole.
    const pricing = buildListingKit().fields.find((f) => f.id === 'pricing')!.text
    expect(ours.pricing).toBe(pricing)
    expect(article).toContain(pricing)
    expect(pricing).toMatch(/No setup fee and no contract\./)
    // What happens when it ends, and whose the content is: the Terms' words.
    expect(ours.whenItEnds).toBe(terms('when-it-ends', 0))
    expect(ours.yourContent).toBe(terms('your-content', 0))
    expect(ours.cancelling).toBe(terms('billing', 1))
    expect(article).toContain(terms('when-it-ends', 0))
    expect(article).toContain(terms('your-content', 0))
    expect(article).toContain(terms('billing', 1))
    expect(terms('when-it-ends', 0)).toMatch(/your public website shows a holding page/)
    expect(terms('billing', 1)).toMatch(/^You can cancel at any time/)
    // Both totals.
    expect(article).toContain(`${usd(PLAN.price * 36)} paid monthly`)
    expect(article).toContain(`${usd(PLAN.annualPrice * 3)} paid annually`)
  })

  it('says the site cannot be exported — and the help article no longer says it can', () => {
    const { article } = renderGuide()
    expect(article).toMatch(/does not move to another host, and there is no export of it today/)
    expect(article).toMatch(/Keep your own copies of your photos\./)
    // The help article said "if you ever leave, your text and images export
    // with you" from the day it was written. There is no such export in the
    // product. Found while writing this guide's answer to its own question.
    const doc = DOCS.find((d) => d.slug === 'editing-your-website')!
    const said = JSON.stringify(doc)
    expect(said).not.toMatch(/export with you/)
    expect(said).toMatch(/There is no export of the site itself today/)
    expect(said).toMatch(/Your content is yours\./)
    // The same promise was in a second article ("your website content
    // exports with you", under Plans & billing), in a different spelling —
    // which the first version of this test did not read, and a mutation run
    // found. So: no help article says it, in either spelling.
    expect(JSON.stringify(DOCS)).not.toMatch(/exports? with you/i)
    const billing = JSON.stringify(DOCS.find((d) => d.slug === 'plans-and-billing')!)
    expect(billing).toMatch(/Your website content is yours, though there is no export of the site itself today\./)
  })

  it('makes no claim about our own site that the product has not been checked for', () => {
    const { article } = renderGuide()
    // The interview that drafts the site, and editing by clicking the page.
    expect(article).toMatch(/A first draft of the whole site is written from a short interview when you sign up\./)
    expect(article).toMatch(/You make them yourself by clicking the page/)
    // The domain: the one claim the site already makes — connect your own.
    expect(article).toMatch(/You connect a domain you already own, and it stays yours at your registrar\./)
    expect(article).not.toMatch(/free domain|domain (?:is )?included|we (?:register|buy) (?:it|your domain)/i)
    // PAYMENTS: NOT A WORD. What the platform keeps of a patient's payment
    // is stated nowhere a buyer reads, and saying it is the owner's to rule
    // (docs/organic-go-live.md Part 8, row 7). Until then this page neither
    // states a fee nor says there is none, and its own total is called what
    // it is: the subscription.
    expect(article).not.toMatch(/\bpay(?:s|ing)? (?:you |online|on it)|processing fee|platform fee|transaction fee|no (?:other|extra|hidden) fees?|covers the platform|everything included/i)
    expect(article).toMatch(/That is the subscription, which covers the rest of the front\s+office as well as the website\./)
    // Nothing the compliance posture forbids, and no texting promise.
    expect(article).not.toMatch(/HIPAA|compliant|compliance|secure(?:ly)?\b|encrypt/i)
    expect(article).not.toMatch(/\btext(?:s|ing)? (?:your )?patients\b/i)
  })
})

describe('the close and the wiring', () => {
  it('closes on our price, resolved, and the hero says what the page is', () => {
    const { text } = renderGuide()
    const close = text.slice(text.indexOf('Our price is on the page'))
    expect(close).toContain(`${usd(PLAN.price)}/mo`)
    expect(close).toContain(`${TRIAL.days} days free`)
    expect(close).toMatch(/The website is part of it/)
    expect(text).toContain('Every price links to its source')
    expect(text).not.toContain('Free to copy and use in your practice')
  })

  it('has a complete head, typed as an article', () => {
    expect(String(metadata.title)).toMatch(/^How much does a dental website cost\?/)
    expect(metadata.description).toBe(guide.description)
    expect(metadata.alternates?.canonical).toBe('/resources/dental-website-cost')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('its content key follows the sellers, the references, our price and the Terms’ sentences', () => {
    const page = publicPages([]).find((p) => p.path === '/resources/dental-website-cost')!
    expect(page).toBeTruthy()
    expect(page.contentKey).toBe(
      contentKey([guide, [WEBSITE_SELLERS, WEBSITE_COST_REFERENCES, ourWebsiteAnswers(), PLAN.price, PLAN.annualPrice]]),
    )
    expect(page.contentKey).not.toBe(contentKey(guide))
  })

  it('is in the footer, and the two pricing guides point at each other', () => {
    expect(FOOTER_COLUMNS.flatMap((c) => c.links)).toContainEqual({
      label: 'Dental website cost',
      href: '/resources/dental-website-cost',
    })
    const here = renderGuide()
    expect(here.container.querySelector('a[href="/resources/dental-software-pricing"]')).toBeTruthy()
    const there = render(<PricingGuide />)
    expect(there.container.querySelector('a[href="/resources/dental-website-cost"]')).toBeTruthy()
  })
})
