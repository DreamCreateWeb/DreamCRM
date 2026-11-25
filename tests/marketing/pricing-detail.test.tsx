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
  searchName,
  type VendorComparison,
} from '@/lib/marketing/comparisons'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'

const detailed = COMPARISONS.filter((c) => c.pricingDetail)
const plain = COMPARISONS.filter((c) => !c.pricingDetail)

/** The site a vendor's own facts must come from: the host its dated check names. */
function vendorSite(c: VendorComparison): string {
  return new URL(c.pricingChecked!.url).hostname.replace(/^www\./, '')
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
    expect(plain.length).toBeGreaterThan(0)
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
        expect(url.hostname.replace(/^www\./, ''), `${where}: not the vendor’s own site`).toBe(vendorSite(c))
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
        expect(host, `${where}: cited to the vendor’s own site`).not.toBe(vendorSite(c))
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
          expect(allLines, `${where}: the answer says ${figure} and no line does`).toContain(figure)
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

  it('the pricing questions are in the FAQ — on the page and in its data twin — each carrying its citation', async () => {
    for (const c of detailed) {
      const faq = buildComparisonFaq(c)
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
    const c = plain[0]!
    const { container, unmount } = await renderPage(c.slug)
    expect(container.querySelector('section#pricing')).toBeNull()
    expect(container.querySelector('a[href="#pricing"]')).toBeNull()
    expect(buildComparisonFaq(c)).toHaveLength(5)
    unmount()
  })
})
