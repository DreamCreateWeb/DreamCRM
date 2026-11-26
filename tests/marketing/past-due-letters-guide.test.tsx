import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import PastDueLettersGuide, { metadata } from '@/app/(marketing)/resources/dental-past-due-balance-letters/page'
import ReminderTemplatesGuide from '@/app/(marketing)/resources/dental-appointment-reminder-templates/page'
import { INSTALLMENT_RULE, REMINDER_RULE } from '@/lib/marketing/guide-sources'
import { productEmail } from '@/lib/marketing/guide-templates'
import { getResourceGuide } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS, TRIAL } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { BALANCE_OUTREACH_DEFAULTS } from '@/lib/types/balance-outreach'
import { publicPages } from '@/lib/marketing/public-pages'
import { contentKey } from '@/lib/indexnow'

/**
 * THE PAST-DUE BALANCE LETTERS GUIDE (organic queue item 9, 2026-11-26).
 *
 * The guide in this library with the most ways to hurt somebody. A recall
 * script that reads badly loses a booking; a collection letter that threatens
 * what the practice will not do, or says a number on a voicemail, costs a
 * patient and can cost more than that. What is held:
 *
 *   1. NO CARD THREATENS. The template names no consequence of its own — no
 *      agency, no credit report, no lawyer. The final notice has a blank the
 *      practice fills from its own financial policy, and the page says to
 *      fill it only with something it will do.
 *
 *   2. THE VOICEMAIL SAYS NOTHING ABOUT MONEY. Not the amount, not "balance",
 *      not "account". Whoever plays it back may not be the patient.
 *
 *   3. THERE IS NO TEXT TEMPLATE, AND THE PAGE SAYS WHY in the calling rule's
 *      own words — the same fragment the reminder guide quotes.
 *
 *   4. THE BALANCE EMAIL IS THE PRODUCT'S, read from its spec.
 *
 *   5. THE INSTALLMENT RULE IS QUOTED, not explained. Whether a written plan
 *      makes a practice a creditor is a lawyer's answer; the page gives the
 *      sentence that raises the question and stops.
 *
 *   6. THE CLOSE IS CONDITIONAL. A balance in this product comes from the
 *      practice's own software, a pay link needs online payments switched
 *      on, and the automatic reminder is OFF until chosen. The close says all
 *      three, and says the product is not a collection agency.
 */

const guide = getResourceGuide('dental-past-due-balance-letters')!
const ROOT = resolve(__dirname, '../..')
const source = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

function renderGuide() {
  const { container } = render(<PastDueLettersGuide />)
  const cards = Array.from(container.querySelectorAll('figure')).map((f) => ({
    label: f.querySelector('figcaption')?.textContent ?? '',
    body: f.querySelector('blockquote')?.textContent ?? '',
  }))
  return {
    container,
    cards,
    text: container.textContent ?? '',
    article: container.querySelector('article')?.textContent ?? '',
  }
}

const card = (cards: Array<{ label: string; body: string }>, label: RegExp) => {
  const hit = cards.filter((c) => label.test(c.label))
  expect(hit, `one card labelled ${label}`).toHaveLength(1)
  return hit[0]
}

describe('the registry entry', () => {
  it('names what a front desk searches for', () => {
    expect(guide).toBeTruthy()
    expect(guide.title).toMatch(/past-due balance letters/i)
    expect(guide.glyph).toBe('money')
  })
})

describe('the material', () => {
  it('seven cards: the email, three letters, the call, its voicemail and the plan', () => {
    const { cards } = renderGuide()
    card(cards, /^Email ·/)
    card(cards, /^Letter · the first reminder/)
    card(cards, /^Letter · the second notice/)
    card(cards, /^Letter · the final notice/)
    card(cards, /^Letter · confirming a payment plan/)
    card(cards, /^Phone ·/)
    card(cards, /^Voicemail ·/)
    expect(cards).toHaveLength(7)
  })

  it('every notice says the amount, what it is for, and how to pay — as blanks', () => {
    const { cards } = renderGuide()
    for (const label of [/^Letter · the first reminder/, /^Letter · the second notice/, /^Letter · the final notice/]) {
      const c = card(cards, label)
      expect(c.body, `${c.label}: no amount`).toContain('{balance}')
      expect(c.body, `${c.label}: not what it is for`).toContain('{date of visit}')
      expect(c.body, `${c.label}: no way to pay online`).toContain('{pay link}')
      expect(c.body, `${c.label}: no number to call`).toContain('{phone}')
    }
    // And no card picks a number for the practice.
    for (const c of cards) {
      expect(c.body, `${c.label}: a dollar sign`).not.toMatch(/\$/)
      expect(c.body, `${c.label}: a typed number`).not.toMatch(/\d/)
    }
  })

  it('no card threatens, shouts, or names a consequence of its own', () => {
    const { cards } = renderGuide()
    for (const c of cards) {
      expect(c.body, `${c.label}: the collector’s register`).not.toMatch(
        /delinquen|overdue|failure to|immediately|demand|legal action|lawsuit|attorney|lawyer|court|credit (?:report|bureau|score|rating)|collections?(?: agency)?|seriously|!/i,
      )
      expect(c.body, `${c.label}: capitals`).not.toMatch(/\b[A-Z]{4,}\b/)
    }
    // The final notice's consequence is the practice's blank, not ours.
    const final = card(cards, /^Letter · the final notice/)
    expect(final.body).toContain('{what your financial policy says happens next}')
    expect(final.body).toMatch(/by \{date\}/)
  })

  it('every letter leaves a door open for a mistake', () => {
    const { cards } = renderGuide()
    expect(card(cards, /^Letter · the first reminder/).body).toMatch(/anything here looks wrong/)
    expect(card(cards, /^Letter · the second notice/).body).toMatch(/believe this balance is wrong/)
  })

  it('the voicemail says nothing about money', () => {
    const { cards, article } = renderGuide()
    const vm = card(cards, /^Voicemail ·/)
    expect(vm.body).not.toMatch(/balance|account|owe|payment|bill|statement|past[- ]due|\{balance\}/i)
    expect(article).toMatch(/No amount, no “balance”, no “account”/)
  })
})

describe('the balance email is the product’s', () => {
  it('read from the spec it is sent from, with the sender’s own button', () => {
    const { cards, article } = renderGuide()
    const email = card(cards, /^Email ·/)
    const spec = productEmail('balance_pay_link')
    expect(email.body).toContain(`Subject: ${spec.subject}`)
    expect(email.body).toContain(spec.body)
    expect(email.body).toContain('{balance}')
    expect(email.body).not.toMatch(/\{\{|\}\}/)
    expect(source('lib/services/balance-outreach.ts')).toContain("label: 'Pay my balance'")
    expect(email.body).toContain('[ Pay my balance ]')
    expect(article).toMatch(/ships inside DreamCRM/)
  })
})

describe('there is no text template, and the page says why', () => {
  it('no card is a text; the reason is the calling rule’s own words', () => {
    const { cards, article, container } = renderGuide()
    expect(cards.filter((c) => /^Text ·/.test(c.label))).toHaveLength(0)
    expect(article).toContain(REMINDER_RULE.conditions.noBilling)
    expect(container.querySelector(`a[href="${REMINDER_RULE.source.url}"]`)).toBeTruthy()
    expect(container.querySelector('a[href="/resources/dental-appointment-reminder-templates"]')).toBeTruthy()
  })
})

describe('the installment rule', () => {
  it('is quoted word for word, linked and dated — and not explained', () => {
    const { container, article } = renderGuide()
    expect(INSTALLMENT_RULE.says).toEqual({
      creditor:
        'A person who regularly extends consumer credit that is subject to a finance charge or is payable by written agreement in more than four installments (not including a down payment)',
    })
    expect(article).toContain(INSTALLMENT_RULE.says.creditor)
    const link = container.querySelector(`a[href="${INSTALLMENT_RULE.source.url}"]`)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
    expect(article).toMatch(/Read November 26, 2026/)
    expect(INSTALLMENT_RULE.source.label).toMatch(/12 CFR 1026\.2/)
    expect(INSTALLMENT_RULE.source.label).toMatch(/Cornell/)
    // The page raises the question and hands it to a lawyer. BOTH notes carry
    // their own caveat: a page-wide match kept passing with this one deleted,
    // because the final notice's note says it too (the mutation run of
    // 2026-11-26 — the third time that shape has been missed).
    expect(article).toMatch(/goes on paper\.\s+This is not legal advice\./)
    expect(article).toMatch(/This page\s+is wording\. This is not legal advice\./)
    expect(article).not.toMatch(/you (?:are|become|would be) a creditor|does not apply to (?:you|dental)|you are exempt/i)
  })
})

describe('who does what — the close', () => {
  it('is conditional three times over, and says what the product is not', () => {
    const { text } = renderGuide()
    const close = text.slice(text.indexOf('The balance email and the pay link are jobs the software does'))
    // A balance here comes from the practice's own software, and a pay link
    // needs online payments switched on.
    expect(close).toMatch(/With your practice software connected and online payments switched on/)
    // The automatic reminder is OFF until chosen.
    expect(BALANCE_OUTREACH_DEFAULTS.enabled).toBe(false)
    expect(close).toMatch(/if you turn it on/)
    // "…stops after three" — the product's own ceiling.
    expect(BALANCE_OUTREACH_DEFAULTS.maxSends).toBe(3)
    expect(close).toMatch(/stops after three/)
    expect(close).toMatch(/does not print or mail letters/)
    expect(close).toMatch(/does not send text messages today/)
    expect(close).toMatch(/is not a collection agency/)
  })

  it('quotes the price and the trial from the config', () => {
    const { text } = renderGuide()
    expect(text).toContain(`$${getQuotedPlan().price.toLocaleString('en-US')}/mo`)
    expect(text).toContain(`${TRIAL.days} days free`)
  })
})

describe('the wiring', () => {
  it('has a complete head, typed as an article', () => {
    expect(String(metadata.title)).toMatch(/past-due balance letters/i)
    expect(metadata.description).toBe(guide.description)
    expect(metadata.alternates?.canonical).toBe('/resources/dental-past-due-balance-letters')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('its content key follows what the page is built from', () => {
    const page = publicPages([]).find((p) => p.path === '/resources/dental-past-due-balance-letters')!
    expect(page).toBeTruthy()
    expect(page.contentKey).toBe(
      contentKey([guide, [INSTALLMENT_RULE, REMINDER_RULE.conditions.noBilling, productEmail('balance_pay_link')]]),
    )
    expect(page.contentKey).not.toBe(contentKey(guide))
  })

  it('is linked from the footer and from the reminder guide', () => {
    expect(FOOTER_COLUMNS.flatMap((c) => c.links)).toContainEqual({
      label: 'Past-due balance letters',
      href: '/resources/dental-past-due-balance-letters',
    })
    const there = render(<ReminderTemplatesGuide />)
    expect(there.container.querySelector('a[href="/resources/dental-past-due-balance-letters"]')).toBeTruthy()
  })
})
