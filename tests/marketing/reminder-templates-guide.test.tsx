import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import ReminderTemplatesGuide, {
  metadata,
} from '@/app/(marketing)/resources/dental-appointment-reminder-templates/page'
import NoShowPolicyGuide from '@/app/(marketing)/resources/dental-cancellation-no-show-policy/page'
import { REMINDER_RULE } from '@/lib/marketing/guide-sources'
import { productEmail, REMINDER_GUIDE_EMAILS, REMINDER_TEXTS, fillSample } from '@/lib/marketing/guide-templates'
import { getResourceGuide } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS, TRIAL } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { REMINDER_DEFAULTS, REMINDER_MAX_TOUCHES, REMINDER_MIN_GAP_HOURS } from '@/lib/types/reminders'
import { resolveEmailAutomations } from '@/lib/types/email-automations'
import { isGsm7, smsSegments } from '@/lib/sms-segments'
import { publicPages } from '@/lib/marketing/public-pages'
import { contentKey } from '@/lib/indexnow'

/**
 * THE APPOINTMENT REMINDER TEMPLATES GUIDE (organic queue item 1, 2026-11-25).
 *
 * The second front-desk page built off the queue. Three things on it could
 * put something false in front of a practice, and each is held here:
 *
 *   1. THE EMAILS ARE CALLED THE PRODUCT'S "WORD FOR WORD" — so they are read
 *      from the product's spec (`productEmail`), and the lines the senders
 *      add around them are checked against the senders' source.
 *
 *   2. THE TEXTS ARE NOT THE PRODUCT'S, AND THE PAGE MUST NEVER READ AS IF
 *      THEY WERE. The product does not send text messages today
 *      (`CLAUDE.md`: the honesty flip comes last). The page says so beside
 *      the texts and again in the close. What the texts ARE held to is the
 *      rule quoted under them: one segment on a realistic fill, by the
 *      product's own segment math, the practice named, a number to call,
 *      nothing about money, the STOP line.
 *
 *   3. THE RULE IS QUOTED, NOT PARAPHRASED, from the page it was read on.
 */

const guide = getResourceGuide('dental-appointment-reminder-templates')!
const ROOT = resolve(__dirname, '../..')
const source = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

function renderGuide() {
  const { container } = render(<ReminderTemplatesGuide />)
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
    expect(guide.title).toMatch(/appointment reminder/i)
    expect(guide.title).toMatch(/template/i)
    for (const word of [/email/i, /text/i, /phone/i]) expect(guide.title).toMatch(word)
    expect(guide.glyph).toBe('clock')
  })
})

describe('the emails are the product’s, word for word', () => {
  it('four email cards, each read from the spec the product sends from', () => {
    const { cards } = renderGuide()
    const pairs = [
      [/^Email · sent when the visit is booked/, 'booking_confirmation'],
      [/^Email · the reminder,/, 'appointment_reminder'],
      [/^Email · the heads-up,/, 'appointment_reminder_confirmed'],
      [/^Email · you moved the visit/, 'rescheduled'],
    ] as const
    expect(cards.filter((c) => /^Email ·/.test(c.label))).toHaveLength(pairs.length)
    // The page's emails ARE the list its search-notice key is built from.
    expect(pairs.map(([, key]) => key)).toEqual([...REMINDER_GUIDE_EMAILS])
    for (const [label, key] of pairs) {
      const c = card(cards, label)
      const email = productEmail(key)
      expect(c.body, key).toContain(`Subject: ${email.subject}`)
      expect(c.body, key).toContain(email.body)
      if (email.heading) expect(c.body, key).toContain(email.heading)
      if (email.closing) expect(c.body, key).toContain(email.closing)
      expect(c.body, key).not.toMatch(/\{\{|\}\}/)
    }
  })

  it('the lines the senders add are the senders’ own', () => {
    const { cards } = renderGuide()
    const checks: Array<[RegExp, string, string[]]> = [
      [/^Email · sent when the visit is booked/, 'lib/email.ts', ['Add to calendar →']],
      [
        /^Email · the reminder,/,
        'lib/services/reminder-automation.ts',
        [
          'Your visit is coming up',
          'Confirm my visit',
          'Need a different time? Just reply to this email and we’ll find one together.',
        ],
      ],
      [/^Email · you moved the visit/, 'lib/services/booking-confirmation.ts', ['Your visit has a new time', 'Confirm my new time']],
    ]
    for (const [label, file, literals] of checks) {
      const c = card(cards, label)
      const src = source(file)
      for (const literal of literals) {
        expect(src, `${file} no longer says "${literal}"`).toContain(literal)
        expect(c.body, `the card does not say "${literal}"`).toContain(literal)
      }
    }
  })
})

describe('the texts', () => {
  const texts = Object.entries(REMINDER_TEXTS)

  it('are on the page as written, one card each', () => {
    const { cards } = renderGuide()
    const textCards = cards.filter((c) => /^Text ·/.test(c.label))
    expect(textCards).toHaveLength(texts.length)
    for (const [name, t] of texts) {
      expect(textCards.some((c) => c.body === t), `${name} is not on the page as written`).toBe(true)
    }
  })

  it('each fits one segment on a realistic fill, in the plain alphabet', () => {
    for (const [name, t] of texts) {
      const filled = fillSample(t)
      // Every blank has a sample value — an unfilled `{…}` would be measured
      // as its own letters and the number would mean nothing.
      expect(filled, `${name}: an unfilled blank`).not.toMatch(/[{}]/)
      expect(isGsm7(filled), `${name}: a character outside the plain alphabet`).toBe(true)
      expect(isGsm7(t), `${name}: the template itself`).toBe(true)
      expect(filled.length, `${name}: ${filled.length} characters`).toBeLessThanOrEqual(160)
      expect(smsSegments(filled), `${name}: segments`).toBe(1)
    }
  })

  it('each meets the conditions quoted under them', () => {
    for (const [name, t] of texts) {
      // The practice named, first.
      expect(t.startsWith('{practice name}: '), `${name}: who it is from`).toBe(true)
      // A way to reach it.
      expect(t, `${name}: no number`).toContain('{phone}')
      // Nothing about money.
      expect(t, `${name}: money in a reminder`).not.toMatch(/balance|owe|pay|fee|\$|bill|due\b/i)
      // The way out, last.
      expect(t.endsWith('Reply STOP to opt out.'), `${name}: the opt-out line`).toBe(true)
    }
  })

  it('the page never reads as if the product sends them', () => {
    const { article, text } = renderGuide()
    // Beside the texts…
    expect(article).toMatch(/does not send\s+text messages today/)
    // …and again in the close, which a reader who skipped down reads first.
    const close = text.slice(text.indexOf('The confirmation and the reminders are jobs the software does'))
    expect(close).toMatch(/does not send text messages today/)
    expect(close).toMatch(/does not place calls/)
    expect(text).not.toMatch(/we(?:’|')ll text|texts? (?:are|is) sent by DreamCRM|DreamCRM (?:texts|sends texts)/i)
  })
})

describe('the rule, in its own words', () => {
  it('every quoted condition is pinned, on the page, linked and dated', () => {
    const { container, article } = renderGuide()
    expect(REMINDER_RULE.conditions).toEqual({
      purposes: 'appointment and exam confirmations and reminders',
      identify: 'must state the name and contact information of the healthcare provider',
      noBilling: 'may not include accounting, billing, debt-collection, or other financial content',
      length: '160 characters or less in length for text messages',
      frequency:
        'A healthcare provider may initiate only one message (whether by voice call or text message) per day to each patient, up to a maximum of three voice calls or text messages combined per week to each patient',
      optOut: 'must inform recipients of the ability to opt out by replying',
      honor: 'must honor opt-out requests immediately.',
    })
    for (const [name, words] of Object.entries(REMINDER_RULE.conditions)) {
      expect(article, `${name}: not on the page`).toContain(words)
    }
    const link = container.querySelector(`a[href="${REMINDER_RULE.source.url}"]`)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
    expect(article).toMatch(/Read November 25, 2026/)
    expect(article).toMatch(/not legal advice/i)
    // Named for where it was read: the government's own copy refused the reader.
    expect(REMINDER_RULE.source.label).toMatch(/Cornell/)
  })
})

describe('the calls', () => {
  it('a confirmation call and its voicemail, and the voicemail keeps the treatment out', () => {
    const { cards } = renderGuide()
    card(cards, /^Phone ·/)
    const vm = card(cards, /^Voicemail ·/)
    expect(vm.body).not.toMatch(/cleaning|filling|crown|treatment|\{visit type\}/i)
    expect(cards).toHaveLength(10)
  })
})

describe('who does what — the close', () => {
  it('claims only what the product’s own defaults make true', () => {
    const { text } = renderGuide()
    const on = resolveEmailAutomations(null)
    // "sends the confirmation when a visit is booked"
    expect(on.booking_confirmation.enabled).toBe(true)
    // "the reminder three days before and the day before"
    expect(REMINDER_DEFAULTS.enabled).toBe(true)
    expect(REMINDER_DEFAULTS.touchOffsets).toEqual([72, 24])
    expect(text).toMatch(/three days before and\s+the day before/i)
    // "and the quieter note to patients who have already confirmed"
    expect(on.appointment_reminder_confirmed.enabled).toBe(true)
    // The timing chapter's two limits are the product's own.
    expect(REMINDER_MAX_TOUCHES).toBe(3)
    expect(REMINDER_MIN_GAP_HOURS).toBeGreaterThanOrEqual(20)
    expect(text).toMatch(/Three at most/)
    expect(text).toMatch(/Never two in a day/)
  })

  it('quotes the price and the trial from the config', () => {
    const { text } = renderGuide()
    expect(text).toContain(`$${getQuotedPlan().price.toLocaleString('en-US')}/mo`)
    expect(text).toContain(`${TRIAL.days} days free`)
  })
})

describe('the wiring', () => {
  it('has a complete head, typed as an article', () => {
    expect(String(metadata.title)).toMatch(/appointment reminder/i)
    expect(metadata.description).toBe(guide.description)
    expect(metadata.alternates?.canonical).toBe('/resources/dental-appointment-reminder-templates')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('its content key follows what the page is built from', () => {
    const page = publicPages([]).find((p) => p.path === '/resources/dental-appointment-reminder-templates')!
    expect(page).toBeTruthy()
    expect(page.contentKey).toBe(
      contentKey([guide, [REMINDER_RULE, REMINDER_TEXTS, REMINDER_GUIDE_EMAILS.map((key) => productEmail(key))]]),
    )
    expect(page.contentKey).not.toBe(contentKey(guide))
    expect(page.lastModified).toBe(guide.datePublished)
    // Dated no earlier than the day its rule was read.
    expect(guide.datePublished >= REMINDER_RULE.source.readOn).toBe(true)
  })

  it('is linked from the footer, and the two appointment guides point at each other', () => {
    expect(FOOTER_COLUMNS.flatMap((c) => c.links)).toContainEqual({
      label: 'Appointment reminder templates',
      href: '/resources/dental-appointment-reminder-templates',
    })
    const here = renderGuide()
    expect(here.container.querySelector('a[href="/resources/dental-cancellation-no-show-policy"]')).toBeTruthy()
    const there = render(<NoShowPolicyGuide />)
    expect(
      there.container.querySelector('a[href="/resources/dental-appointment-reminder-templates"]'),
    ).toBeTruthy()
  })
})
