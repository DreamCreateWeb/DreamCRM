import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import ReviewRequestGuide, { metadata } from '@/app/(marketing)/resources/dental-review-request-templates/page'
import ReminderTemplatesGuide from '@/app/(marketing)/resources/dental-appointment-reminder-templates/page'
import MorePatientsGuide from '@/app/(marketing)/resources/how-to-get-more-dental-patients/page'
import { LOCAL_RANKING, REVIEW_RULES } from '@/lib/marketing/guide-sources'
import { productEmail, REVIEW_REQUEST_TEXT, fillSample } from '@/lib/marketing/guide-templates'
import { getResourceGuide } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS, TRIAL } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { isGsm7, smsSegments } from '@/lib/sms-segments'
import { publicPages } from '@/lib/marketing/public-pages'
import { contentKey } from '@/lib/indexnow'

/**
 * THE REVIEW REQUEST TEMPLATES GUIDE (organic queue item 3, 2026-11-26).
 *
 * The one guide in the library where the TEMPLATE ITSELF can break a rule.
 * A recall script that reads badly loses a booking; a review request that
 * says "if you loved your visit, leave us five stars" is the practice
 * selectively soliciting positive reviews, in the words of the Google policy
 * this page quotes two screens further down. So the first thing held here is
 * the cards, against the rules beside them:
 *
 *   1. NO CARD ASKS FOR A GOOD REVIEW, OFFERS ANYTHING, OR ASKS FOR A NAME.
 *   2. THE EMAIL IS THE PRODUCT'S, read from its spec.
 *   3. THE TEXT IS NOT, fits one message, and the page says who may be texted.
 *   4. EVERY RULE IS A PINNED QUOTATION with its page and its day.
 *   5. THE REPLIES NEVER CONFIRM A PATIENT.
 *   6. THE CLOSE IS TIED TO THE PRODUCT'S DEFAULTS, read from the schema.
 */

const guide = getResourceGuide('dental-review-request-templates')!
const ROOT = resolve(__dirname, '../..')
const source = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

function renderGuide() {
  const { container } = render(<ReviewRequestGuide />)
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
    expect(guide.title).toMatch(/review request/i)
    expect(guide.title).toMatch(/template/i)
    expect(guide.glyph).toBe('star')
  })
})

describe('the cards obey the rules quoted beside them', () => {
  it('six cards: the email, the text, the front desk, the counter card and two replies', () => {
    const { cards } = renderGuide()
    card(cards, /^Email ·/)
    card(cards, /^Text ·/)
    card(cards, /^Front desk ·/)
    card(cards, /^Card ·/)
    expect(cards.filter((c) => /^Reply ·/.test(c.label))).toHaveLength(2)
    expect(cards).toHaveLength(6)
  })

  it('no card asks for a good review, offers anything in return, or asks for a name', () => {
    const { cards } = renderGuide()
    for (const c of cards) {
      // Selective solicitation, in every spelling it usually arrives in.
      expect(c.body, `${c.label}: asks for a good one`).not.toMatch(
        /five[- ]star|5[- ]star|\bstars?\b|if you (?:loved|enjoyed|liked|were happy|had a (?:great|good))|positive review|great review|glowing/i,
      )
      // An incentive, however small.
      expect(c.body, `${c.label}: offers something`).not.toMatch(
        /gift card|discount|\boff\b|free\b|drawing|raffle|enter(?:ed)? to win|prize|reward|credit|thank-you gift|\$/i,
      )
      // "Mention Dr. Lee" — content that identifies a staff member.
      expect(c.body, `${c.label}: asks for specific content`).not.toMatch(/mention|by name|be sure to (?:say|include)/i)
    }
  })

  it('every ask says, in its own words, that a bad answer is welcome', () => {
    const { cards } = renderGuide()
    expect(card(cards, /^Email ·/).body).toMatch(/good, bad, or in-between/)
    expect(card(cards, /^Text ·/).body).toMatch(/good or bad/)
    expect(card(cards, /^Front desk ·/).body).toMatch(/Good, bad or in between/)
    expect(card(cards, /^Card ·/).body).toMatch(/honest take/)
  })
})

describe('the email is the product’s', () => {
  it('read from the spec it is sent from, with the sender’s own button', () => {
    const { cards, text } = renderGuide()
    const email = card(cards, /^Email ·/)
    const spec = productEmail('review_request')
    expect(email.body).toContain(`Subject: ${spec.subject}`)
    expect(email.body).toContain(spec.heading!)
    expect(email.body).toContain(spec.body)
    expect(email.body).toContain(spec.closing!)
    expect(email.body).not.toMatch(/\{\{|\}\}/)
    expect(source('lib/services/reviews.ts')).toContain("label: 'Leave a review'")
    expect(email.body).toContain('[ Leave a review ]')
    expect(text).toMatch(/ships inside DreamCRM/)
  })
})

describe('the text', () => {
  it('fits one message on a realistic fill, names the practice first and ends on the opt-out', () => {
    const { cards } = renderGuide()
    expect(card(cards, /^Text ·/).body).toBe(REVIEW_REQUEST_TEXT)
    const filled = fillSample(REVIEW_REQUEST_TEXT)
    expect(filled).not.toMatch(/[{}]/)
    expect(isGsm7(filled)).toBe(true)
    expect(filled.length).toBeLessThanOrEqual(160)
    expect(smsSegments(filled)).toBe(1)
    expect(REVIEW_REQUEST_TEXT.startsWith('{practice name}: ')).toBe(true)
    expect(REVIEW_REQUEST_TEXT.endsWith('Reply STOP to opt out.')).toBe(true)
  })

  it('the page says who may be texted, and never that the product sends it', () => {
    const { article, text } = renderGuide()
    expect(article).toMatch(/not an appointment reminder/i)
    expect(article).toMatch(/Text only the patients who agreed/)
    expect(article).toMatch(/not legal advice/i)
    const close = text.slice(text.indexOf('The review request is a job the software does'))
    expect(close).toMatch(/does not send text messages today/)
  })
})

describe('the rules, in their own words', () => {
  it('every quoted line is pinned, on the page, linked and dated', () => {
    const { container, article } = renderGuide()
    expect(REVIEW_RULES.googlePolicy.says).toEqual({
      incentives:
        'Offer incentives – such as payment, discounts, free goods and/or services - in exchange for posting any review or revision or removal of a negative review.',
      gating: 'Discourage or prohibit negative reviews, or selectively solicit positive reviews from customers',
      pressure:
        'should not require or pressure users to leave ratings or write reviews while on the premises, nor should they request that specific content be included.',
      quota: 'Merchants requesting that staff solicit a certain number of reviews',
      naming:
        'Merchants requesting that staff solicit reviews that include specific content, including content that identifies a staff member.',
      conflict: 'A conflict of interest may include current or former employment',
      allowed:
        'Solicit or encourage the posting of content that does represent a genuine experience, without offering incentives to do so or attempting to influence the rating or the contents of the review.',
    })
    expect(REVIEW_RULES.googleTips.says).toEqual({
      link: 'you can ask customers to visit a Google link or scan a QR code',
      mix: 'A mix of positive and negative feedback often feels more trustworthy.',
    })
    expect(REVIEW_RULES.ftc.says.incentives).toBe(
      'It is an unfair or deceptive act or practice and a violation of this part for a business to provide compensation or other incentives in exchange for, or conditioned expressly or by implication on, the writing or creation of consumer reviews expressing a particular sentiment, whether positive or negative, regarding the product, service, or business that is the subject of the review.',
    )
    expect(REVIEW_RULES.ftcInsiders.says.title).toBe('Insider consumer reviews and consumer testimonials')

    for (const rule of Object.values(REVIEW_RULES)) {
      for (const [name, words] of Object.entries(rule.says)) {
        expect(article, `${rule.source.label} · ${name}: not on the page`).toContain(words)
      }
      expect(rule.source.readOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const link = container.querySelector(`a[href="${rule.source.url}"]`)
      expect(link, `${rule.source.label}: not linked`).toBeTruthy()
      expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
    }
    expect(article).toMatch(/Read November 25, 2026/)
    expect(article).toMatch(/Read November 26, 2026/)
    // The rules carry their OWN caveat. "Not legal advice" is also said under
    // the text template, so a page-wide match kept passing with this one
    // deleted (the mutation run of 2026-11-26).
    expect(article).toMatch(/This is not legal advice, and these are the lines we read, not the whole of either\s+document/)
    // The FTC's text is named for where it was read.
    expect(REVIEW_RULES.ftc.source.label).toMatch(/Cornell/)
  })

  it('the section on a business’s own people is named, not summarised', () => {
    const { article } = renderGuide()
    // 465.5 runs to conditions a one-line paraphrase would get wrong. The
    // page gives its title and sends the reader to it.
    expect(article).toMatch(/read it before anyone who works at the practice reviews it/)
    expect(article).not.toMatch(/staff (?:may|can|cannot|may not|must not) (?:never )?review/i)
  })
})

describe('the replies', () => {
  it('never confirm that the writer is a patient, or mention a visit', () => {
    const { cards, article } = renderGuide()
    for (const c of cards.filter((x) => /^Reply ·/.test(x.label))) {
      expect(c.body, `${c.label}: confirms a patient`).not.toMatch(
        /your (?:visit|appointment|treatment|cleaning|procedure)|as (?:a|our) patient|when you (?:came|visited)|we (?:saw|treated) you|\{first name\}|\{visit/i,
      )
    }
    expect(article).toMatch(/Your reply is public and your patient list is not/)
  })
})

describe('who does what — the close', () => {
  it('claims only what the product’s own defaults make true', () => {
    const { text } = renderGuide()
    const schema = source('lib/db/schema/clinic.ts')
    // "emails the request … when a visit is marked complete, on from day one"
    expect(schema).toContain("autoSendEnabled: integer('auto_send_enabled').notNull().default(1)")
    expect(schema).toContain("autoSendDelayHours: integer('auto_send_delay_hours').notNull().default(0)")
    expect(text).toMatch(/when a visit is marked complete, on from day one/)
    // "asks any one patient at most once a year"
    expect(schema).toContain("minDaysBetweenRequests: integer('min_days_between_requests').notNull().default(365)")
    expect(text).toMatch(/at most once a year/)
    // "Every patient is sent the same page: a button … and … a way to tell you privately"
    expect(schema).toContain("showPrivateFeedback: integer('show_private_feedback').notNull().default(1)")
    expect(schema).toContain("starGateEnabled: integer('star_gate_enabled').notNull().default(0)")
    expect(text).toMatch(/Every patient is sent the same page/)
  })

  it('quotes the price and the trial from the config', () => {
    const { text } = renderGuide()
    expect(text).toContain(`$${getQuotedPlan().price.toLocaleString('en-US')}/mo`)
    expect(text).toContain(`${TRIAL.days} days free`)
  })
})

describe('the growth guide’s line about gating says what was read', () => {
  it('quotes Google’s policy, and no longer attributes the gating rule to the FTC', () => {
    // The patient-growth guide (September) said review gating "violates the
    // FTC's fake-reviews rule and Google's policies". Google's policy says so
    // in words this registry quotes. The sections of the FTC's rule read for
    // this guide (465.2, 465.4, 465.5, 465.7) do not say it in any words we
    // can quote, so the sentence now claims only the half that was read.
    const { container } = render(<MorePatientsGuide />)
    const text = container.textContent ?? ''
    expect(text).toContain(REVIEW_RULES.googlePolicy.says.gating)
    expect(text).not.toMatch(/violates the FTC/i)
    expect(container.querySelector('a[href="/resources/dental-review-request-templates"]')).toBeTruthy()
    // And its search-notice key follows the quoted line.
    const growth = getResourceGuide('how-to-get-more-dental-patients')!
    const page = publicPages([]).find((p) => p.path === '/resources/how-to-get-more-dental-patients')!
    expect(page.contentKey).toBe(contentKey([growth, [REVIEW_RULES.googlePolicy.says.gating, LOCAL_RANKING]]))
  })
})

describe('the wiring', () => {
  it('has a complete head, typed as an article', () => {
    expect(String(metadata.title)).toMatch(/review request/i)
    expect(metadata.description).toBe(guide.description)
    expect(metadata.alternates?.canonical).toBe('/resources/dental-review-request-templates')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('its content key follows what the page is built from', () => {
    const page = publicPages([]).find((p) => p.path === '/resources/dental-review-request-templates')!
    expect(page).toBeTruthy()
    expect(page.contentKey).toBe(
      contentKey([guide, [REVIEW_RULES, REVIEW_REQUEST_TEXT, productEmail('review_request')]]),
    )
    expect(page.contentKey).not.toBe(contentKey(guide))
    expect(page.lastModified).toBe(guide.datePublished)
  })

  it('is linked from the footer and from the reminder guide', () => {
    expect(FOOTER_COLUMNS.flatMap((c) => c.links)).toContainEqual({
      label: 'Review request templates',
      href: '/resources/dental-review-request-templates',
    })
    const here = renderGuide()
    expect(here.container.querySelector('a[href="/resources/dental-appointment-reminder-templates"]')).toBeTruthy()
    const there = render(<ReminderTemplatesGuide />)
    expect(there.container.querySelector('a[href="/resources/dental-review-request-templates"]')).toBeTruthy()
  })
})
