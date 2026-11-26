import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import WelcomeLetterGuide, { metadata } from '@/app/(marketing)/resources/dental-new-patient-welcome-letter/page'
import ReviewRequestGuide from '@/app/(marketing)/resources/dental-review-request-templates/page'
import { PRIVACY_NOTICE_RULE } from '@/lib/marketing/guide-sources'
import { productEmail } from '@/lib/marketing/guide-templates'
import { getResourceGuide } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS, TRIAL } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { REMINDER_DEFAULTS } from '@/lib/types/reminders'
import { resolveEmailAutomations } from '@/lib/types/email-automations'
import { publicPages } from '@/lib/marketing/public-pages'
import { contentKey } from '@/lib/indexnow'

/**
 * THE NEW-PATIENT WELCOME GUIDE (organic queue item 7, 2026-11-26).
 *
 * Four things on this page could mislead a practice or a reader, and each is
 * held here:
 *
 *   1. WHICH EMAILS ARE THE PRODUCT'S. The forms request and the portal
 *      invitation are, word for word. The welcome email and the letter are
 *      NOT — the product has no "welcome" email — and the page must say which
 *      is which rather than let the claim spread to all of them (the library
 *      hub made exactly that mistake for four months).
 *
 *   2. THE FORMS ARE OFF UNTIL A PRACTICE TURNS THEM ON. The close may not
 *      say forms go out with every booking; it says "switch intake forms on".
 *
 *   3. THE PRIVACY-NOTICE RULE IS QUOTED BY ITS CITATION, and the statute's
 *      name appears nowhere on the page: beside our product it would read as
 *      a claim about our standing under it (`docs/COMPLIANCE.md`).
 *
 *   4. NO CARD PROMISES TREATMENT, A PRICE OR A RESULT. A welcome letter that
 *      says "your first visit includes a cleaning" speaks for the dentist.
 */

const guide = getResourceGuide('dental-new-patient-welcome-letter')!
const ROOT = resolve(__dirname, '../..')
const source = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

function renderGuide() {
  const { container } = render(<WelcomeLetterGuide />)
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
    expect(guide.title).toMatch(/new patient welcome letter/i)
    expect(guide.title).toMatch(/template/i)
    expect(guide.glyph).toBe('door')
  })
})

describe('the material', () => {
  it('six cards: the call, the welcome email, the letter, the two product emails and the list', () => {
    const { cards } = renderGuide()
    card(cards, /^Phone ·/)
    card(cards, /^Email · the welcome/)
    card(cards, /^Letter ·/)
    card(cards, /^Email · the forms request/)
    card(cards, /^Email · the portal invitation/)
    card(cards, /^List ·/)
    expect(cards).toHaveLength(6)
  })

  it('the welcome says welcome first, and tells the patient exactly what to do', () => {
    const { cards } = renderGuide()
    for (const label of [/^Email · the welcome/, /^Letter ·/]) {
      const c = card(cards, label)
      // The first sentence after the greeting is the welcome itself.
      expect(c.body, c.label).toMatch(/\{first name\},\s+Welcome/)
      for (const blank of ['{forms link}', '{phone}', '{address}', '{day}', '{time}']) {
        expect(c.body, `${c.label}: no ${blank}`).toContain(blank)
      }
      expect(c.body, c.label).toMatch(/a photo ID, your insurance card if you have one, and a list of any medications/)
    }
  })

  it('no card makes the patient wait, promises treatment, or names a price', () => {
    const { cards } = renderGuide()
    for (const c of cards) {
      // The sentence the opening paragraph quotes as the thing to avoid.
      expect(c.body, `${c.label}: tells them to come early for paperwork`).not.toMatch(
        /arrive (?:\w+ )?(?:minutes )?early|minutes early|complete paperwork/i,
      )
      // What happens in the chair is the dentist's to promise.
      expect(c.body, `${c.label}: promises treatment`).not.toMatch(
        /includes? (?:a |an )?(?:cleaning|exam|x-rays?)|free (?:exam|cleaning|x-rays?|whitening|consult)|complimentary|special offer|\$|discount/i,
      )
      expect(c.body, `${c.label}: a typed number`).not.toMatch(/\d/)
    }
  })
})

describe('which emails are the product’s', () => {
  it('the forms request and the portal invitation are read from their specs, with the senders’ buttons', () => {
    const { cards } = renderGuide()
    const pairs = [
      [/^Email · the forms request/, 'intake_request', 'Fill out intake form'],
      [/^Email · the portal invitation/, 'portal_invite', 'Set up my portal'],
    ] as const
    const sender = source('lib/email.ts')
    for (const [label, key, button] of pairs) {
      const c = card(cards, label)
      const email = productEmail(key)
      expect(c.body, key).toContain(`Subject: ${email.subject}`)
      expect(c.body, key).toContain(email.heading!)
      expect(c.body, key).toContain(email.body)
      expect(c.body, key).toContain(email.closing!)
      expect(c.body, key).not.toMatch(/\{\{|\}\}/)
      expect(sender, `lib/email.ts no longer says "${button}"`).toContain(button)
      expect(c.body, key).toContain(`[ ${button} ]`)
    }
  })

  it('the page says which two — and does not claim the welcome email or the letter', () => {
    const { article } = renderGuide()
    expect(article).toMatch(/These two are the ones that ship inside DreamCRM, word for word\./)
    expect(article).toMatch(/The\s+welcome email and the letter above are written to the same rules\./)
    expect(article).not.toMatch(/welcome (?:email|letter) (?:that )?ships inside/i)
  })
})

describe('the privacy notice rule', () => {
  it('every fragment is pinned, on the page, linked and dated — by its citation', () => {
    const { container, article, text } = renderGuide()
    expect(PRIVACY_NOTICE_RULE.says).toEqual({
      who: 'A covered health care provider that has a direct treatment relationship with an individual must',
      when: 'No later than the date of the first service delivery',
      acknowledgment: 'make a good faith effort to obtain a written acknowledgment of receipt of the notice',
      onSite: 'Have the notice available at the service delivery site for individuals to request to take with them',
      posted: 'Post the notice in a clear and prominent location',
      website: 'must prominently post its notice on the web site',
    })
    for (const [name, words] of Object.entries(PRIVACY_NOTICE_RULE.says)) {
      expect(article, `${name}: not on the page`).toContain(words)
    }
    const link = container.querySelector(`a[href="${PRIVACY_NOTICE_RULE.source.url}"]`)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
    expect(article).toMatch(/Read November 26, 2026/)
    expect(article).toMatch(/This is not legal advice, and it is one paragraph of a long rule/)
    expect(PRIVACY_NOTICE_RULE.source.label).toMatch(/45 CFR 164\.520/)
    expect(PRIVACY_NOTICE_RULE.source.label).toMatch(/Cornell/)
    // Nothing on this page says anything about OUR standing under that law.
    expect(text).not.toMatch(/hipaa|\bcompliant\b|\bcompliance\b|\bcertified\b|secure patient data/i)
  })
})

describe('who does what — the close', () => {
  it('the forms claim is conditional, because the feature is', () => {
    const { text } = renderGuide()
    const close = text.slice(text.indexOf('The confirmation and the forms are jobs the software does'))
    // "emails a confirmation the moment a first visit is booked" — on by default.
    expect(resolveEmailAutomations(null).booking_confirmation.enabled).toBe(true)
    expect(close).toMatch(/emails a confirmation the moment a first visit is booked/)
    // Intake forms are OFF until chosen: one gate, read as source because the
    // service is server-only.
    const forms = source('lib/services/forms.ts')
    expect(forms).toContain('export async function patientFacingIntakeOpen(')
    expect(forms).toContain('.intake_forms')
    expect(close).toMatch(/Switch intake forms on\s+and that email carries the link/)
    expect(close).not.toMatch(/sends? (?:the |your )?forms (?:with|to) every/i)
    // "a patient who has not finished gets a nudge before the visit"
    expect(REMINDER_DEFAULTS.formsReminder).toBe(true)
    expect(close).toMatch(/gets a nudge before the visit/)
    // And what it does not do.
    expect(close).toMatch(/does not print or mail letters/)
    expect(close).toMatch(/does not send text messages today/)
  })

  it('quotes the price and the trial from the config', () => {
    const { text } = renderGuide()
    expect(text).toContain(`$${getQuotedPlan().price.toLocaleString('en-US')}/mo`)
    expect(text).toContain(`${TRIAL.days} days free`)
  })
})

describe('the wiring', () => {
  it('has a complete head, typed as an article', () => {
    expect(String(metadata.title)).toMatch(/welcome letter/i)
    expect(metadata.description).toBe(guide.description)
    expect(metadata.alternates?.canonical).toBe('/resources/dental-new-patient-welcome-letter')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('its content key follows what the page is built from', () => {
    const page = publicPages([]).find((p) => p.path === '/resources/dental-new-patient-welcome-letter')!
    expect(page).toBeTruthy()
    expect(page.contentKey).toBe(
      contentKey([guide, [PRIVACY_NOTICE_RULE, productEmail('intake_request'), productEmail('portal_invite')]]),
    )
    expect(page.contentKey).not.toBe(contentKey(guide))
  })

  it('is linked from the footer, and points on to the three guides that follow a first visit', () => {
    expect(FOOTER_COLUMNS.flatMap((c) => c.links)).toContainEqual({
      label: 'New patient welcome letter',
      href: '/resources/dental-new-patient-welcome-letter',
    })
    const here = renderGuide()
    for (const href of [
      '/resources/dental-appointment-reminder-templates',
      '/resources/dental-review-request-templates',
      '/resources/dental-recall-scripts',
    ]) {
      expect(here.container.querySelector(`a[href="${href}"]`), href).toBeTruthy()
    }
    // And something points here: the review guide's last paragraph.
    const there = render(<ReviewRequestGuide />)
    expect(there.container.querySelector('a[href="/resources/dental-new-patient-welcome-letter"]')).toBeTruthy()
  })
})
