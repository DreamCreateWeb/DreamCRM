import { describe, it, expect, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import React from 'react'

/**
 * "YOUR WEBSITE CONTENT EXPORTS WITH YOU" — a promise the product cannot keep,
 * held at zero.
 *
 * It was on the home page, the why page, the pricing page three times, a
 * comparison entry, the comparison FAQ and two help articles, under headings
 * like "Leaving is allowed" and "Is my data locked in?". The product has no
 * export of a practice's website: the exports that exist are the patient
 * list, leads, appointments, shop orders and online payments, each as a file.
 *
 * Found on 2026-11-26 while the website-cost guide was answering "if you
 * leave, what do you take with you?" for our own product. The help articles
 * went that day; the first grep for the rest searched "export with you" and
 * missed every "exports with you", which is how seven more survived a
 * correction that was announced as done. So this reads every public surface
 * the claim was on, and judges every sentence that mentions an export:
 *
 *   - TRUE:  the patient list exports (the Terms say so, and the route exists);
 *   - TRUE:  there is no export of the site itself;
 *   - TRUE:  what another vendor's terms say about ITS export (the Tebra entry);
 *   - anything else is the old promise in a new spelling.
 *
 * Not a walk of the tree: the surfaces are named, rendered or serialised.
 */

vi.mock('@/lib/auth/context', () => ({
  getTenantContext: vi.fn(async () => null),
}))
vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(async () => null),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  usePathname: () => '/',
}))

import MarketingHome from '@/app/(marketing)/page'
import PricingPage from '@/app/(marketing)/pricing/page'
import WhyPage from '@/app/(marketing)/why/page'
import { COMPARISONS, buildComparisonFaq } from '@/lib/marketing/comparisons'
import { DOCS } from '@/lib/marketing/docs'
import { buildAbout } from '@/lib/marketing/about'
import { buildListingKit } from '@/lib/marketing/listing-kit'
import { TERMS_OF_SERVICE } from '@/lib/marketing/legal'

const ROOT = resolve(__dirname, '../..')

/** Every sentence in a text that mentions an export. */
function exportSentences(text: string): string[] {
  return (text.match(/[^.!?]*\bexport(?:s|ed|able|ing)?\b[^.!?]*[.!?]?/gi) ?? []).map((s) => s.trim()).filter(Boolean)
}

/** The export statements that are true. */
const TRUE_OF_US = [
  // The patient list — the one export the Terms state.
  /patient list (?:exports|is yours to export)/i,
  /export your patient list/i,
  // The site itself does not export, and the page says so.
  /no export of (?:it|the site itself|a site)/i,
  /does not export/i,
]

/**
 * Judge every export sentence in a text. `aboutThem` names a competitor: on
 * its own comparison page, a sentence that names it is a report of ITS terms
 * (Tebra's paid site export), not a promise of ours.
 */
function judge(surface: string, text: string, aboutThem: string[] = []) {
  for (const sentence of exportSentences(text)) {
    const ok = TRUE_OF_US.some((re) => re.test(sentence)) || aboutThem.some((name) => sentence.includes(name))
    expect(ok, `${surface}: “${sentence.slice(0, 160)}”`).toBe(true)
  }
}

const textOf = (el: Element) => el.textContent ?? ''

describe('the detector', () => {
  it('finds the promise in every spelling it shipped in — and the two that are true pass', () => {
    const old = [
      'Your website content exports with you.',
      'Leave whenever, your content exports with you.',
      'If you ever leave, your text and images export with you.',
      'Your website content is exportable, and leaving is a cancellation.',
    ]
    for (const s of old) {
      expect(exportSentences(s), s).toHaveLength(1)
      expect(TRUE_OF_US.some((re) => re.test(s)), s).toBe(false)
    }
    for (const s of [
      'Your patient list exports whenever you want it.',
      'There is no export of the site itself today.',
      'You can export your patient list from the service.',
    ]) {
      expect(TRUE_OF_US.some((re) => re.test(s)), s).toBe(true)
    }
  })
})

describe('what is true of the product', () => {
  it('the patient list does export: the Terms say so and the route is there', () => {
    const terms = JSON.stringify(TERMS_OF_SERVICE)
    expect(terms).toContain('You can export your patient list from the service.')
    expect(existsSync(resolve(ROOT, 'app/(default)/patients/export/route.ts'))).toBe(true)
  })

  it('nothing exports a website: no route, in the website workspace or anywhere else', () => {
    // If one is ever built, this fails — and the pages below can say so again.
    for (const p of [
      'app/(default)/website/export/route.ts',
      'app/(default)/website/export/page.tsx',
      'app/api/website/export/route.ts',
      'app/api/site-export/route.ts',
    ]) {
      expect(existsSync(resolve(ROOT, p)), `${p} exists: the site can be exported now, so say so`).toBe(false)
    }
  })
})

describe('the pages that carried the promise', () => {
  it('the home page: “Leaving is allowed” says what leaves', async () => {
    const { container } = render(await MarketingHome())
    const text = textOf(container)
    judge('home', text)
    expect(text).toMatch(/Leaving is allowed/)
    expect(text).toMatch(/your patient list exports whenever you want it/)
    expect(text).not.toMatch(/website content exports/)
  })

  it('the why page', async () => {
    const { container } = render(await WhyPage())
    const text = textOf(container)
    judge('why', text)
    expect(text).toMatch(/Your patient list exports whenever you want it/)
    expect(text).not.toMatch(/website content exports/)
  })

  it('the pricing page: the card, the contract answer, and “Is my data locked in?” — with the exception said', async () => {
    const { container } = render(await PricingPage())
    const text = textOf(container)
    judge('pricing', text)
    expect(text).not.toMatch(/content exports with you|exportable/)
    // The question that most needs a straight answer gets one, in the page
    // and in its FAQ data.
    const locked = /Is my data locked in\?/
    expect(text).toMatch(locked)
    expect(text).toMatch(/your patient list exports from the service whenever you want it/)
    expect(text).toMatch(/there is no export of the site itself today/)
    expect(container.innerHTML).toContain('there is no export of the site itself today')
    // "Not a migration project" was the other half of the old answer, and it
    // is not true of a website that has to be rebuilt somewhere else.
    expect(text).not.toMatch(/not a migration project/)
  })
})

describe('the data that carried it', () => {
  it('every comparison entry and every comparison FAQ', () => {
    for (const c of COMPARISONS) {
      // OUR side of the page: what it says about us, in our own words. The
      // vendor's side (its pricing lines, its strengths) is a report of the
      // vendor's own pages and is held by `pricing-detail.test.tsx`.
      const them = [c.name.split(' ')[0]!, ...(c.searchedAs ? [c.searchedAs.name, c.searchedAs.now] : [])]
      const ours = [
        c.summary,
        c.bottomLine,
        ...c.ourStrengths.map((x) => `${x.title}. ${x.body}`),
        c.pricingDetail?.versusUs ?? '',
      ].join(' ')
      judge(`compare/${c.slug}`, ours, them)
      for (const f of buildComparisonFaq(c)) judge(`compare/${c.slug} FAQ “${f.q}”`, f.a, them)
      const switching = buildComparisonFaq(c).find((f) => f.q.startsWith('Can I switch from'))!
      expect(switching.a, c.slug).toMatch(/If you ever leave, your patient list exports with you\./)
    }
  })

  it('where a competitor offers an export and we do not, the page says so', () => {
    // Tebra's terms let a practice export its site's text and structure, for
    // a fee. A page that reports that beside our name owes the reader ours.
    const tebra = COMPARISONS.find((c) => c.slug === 'patientpop')!
    expect(JSON.stringify(tebra.pricingDetail)).toMatch(/Website export, if you leave/)
    expect(tebra.pricingDetail!.versusUs).toMatch(/Tebra will export a site’s text and structure for a fee; DreamCRM has no export of the site itself today\./)
  })

  it('the help articles, the facts page and the listing kit', () => {
    judge('docs', JSON.stringify(DOCS))
    judge('about', JSON.stringify(buildAbout()))
    judge('listing kit', JSON.stringify(buildListingKit()))
  })
})
