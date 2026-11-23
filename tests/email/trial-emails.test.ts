import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * WHAT THE TRIAL EMAILS SAY, AS THE OWNER READS THEM.
 *
 * Owner ruling 2026-11-23: a 14-day free trial, card required to sign up. A
 * card-on-file trial bills by itself, so the email it is owed is the opposite
 * of the one a no-card trial gets — nothing asked, one thing stated plainly:
 * the DAY the card is charged and how to stop that.
 *
 * Three properties are held here because each is a way to mislead somebody
 * about their money:
 *
 *  1. The pre-charge notice and the welcome name the date and the way out.
 *  2. Neither states an AMOUNT. What Stripe charges depends on the billing
 *     period, a promo code and sales tax; a figure typed into a template is
 *     wrong for some of the people reading it. The billing page shows Stripe's
 *     own number, so the email points there.
 *  3. A card-on-file trial is never asked to "add a payment method".
 *
 * The HTML is captured from the mocked provider, so this reads what is sent.
 */

const { sent } = vi.hoisted(() => ({
  sent: [] as Array<{ html?: string; subject?: string; to?: unknown }>,
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: { html?: string; subject?: string; to?: unknown }) => {
        sent.push(payload)
        return { data: { id: 'mail_1' }, error: null }
      },
    }
  },
}))

import { sendTrialReminderEmail, sendTrialStartedEmail } from '@/lib/email'

const BILLING = 'https://www.dreamcreatestudio.com/settings/billing'
/** Tags out, entities folded: the words a person reads. */
const words = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rarr;|&#8594;/g, '→')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

beforeEach(() => {
  sent.length = 0
  process.env.EMAIL_DRIVER = 'resend'
  process.env.RESEND_API_KEY = 're_test_key'
})

describe('the pre-charge notice (a trial with the card on file)', () => {
  for (const milestone of ['d7', 'd1'] as const) {
    it(`${milestone}: names the charge date and how to cancel, and asks for nothing`, async () => {
      await sendTrialReminderEmail('owner@clinic.com', {
        firstName: 'Pat',
        milestone,
        billingUrl: BILLING,
        cardOnFile: { chargeDate: 'Dec 7, 2026' },
      })
      expect(sent).toHaveLength(1)
      expect(sent[0].subject).toBe('Your DreamCRM free trial ends Dec 7, 2026')
      const text = words(sent[0].html ?? '')
      expect(text).toContain('on Dec 7, 2026 your free trial ends, your subscription starts, and the card on file is charged')
      expect(text).toMatch(/cancel before then from Settings → Plan & billing and you will not be charged/i)
      expect(text).toMatch(/Staying\? There is nothing to do/)
      // The button goes to the page that shows Stripe's own number.
      expect(sent[0].html).toContain(BILLING)
      expect(text).toContain('Review plan & billing')
      // …and it is not the no-card email.
      expect(text).not.toMatch(/add a (card|payment method)|choose a plan|locks in your price/i)
    })
  }

  it('states NO amount — the figure is Stripe’s, on the billing page', async () => {
    await sendTrialReminderEmail('owner@clinic.com', {
      firstName: 'Pat',
      milestone: 'd7',
      billingUrl: BILLING,
      cardOnFile: { chargeDate: 'Dec 7, 2026' },
    })
    const text = words(sent[0].html ?? '')
    expect(text).not.toMatch(/\$\s?\d/)
    expect(text).toMatch(/exact amount, with any tax, is on your billing page/i)
  })

  it('a charge date is escaped like any other value placed in the HTML', async () => {
    await sendTrialReminderEmail('owner@clinic.com', {
      firstName: null,
      milestone: 'd1',
      billingUrl: BILLING,
      cardOnFile: { chargeDate: '<img src=x onerror=1>' },
    })
    expect(sent[0].html).not.toContain('<img src=x')
    expect(sent[0].html).toContain('&lt;img src=x')
  })
})

describe('the NO-card reminders are unchanged', () => {
  it('still ask for a card, and carry no charge date', async () => {
    await sendTrialReminderEmail('owner@clinic.com', { firstName: 'Pat', milestone: 'd3', billingUrl: BILLING })
    expect(sent[0].subject).toBe('3 days left in your DreamCRM free trial')
    const text = words(sent[0].html ?? '')
    expect(text).toMatch(/add a payment method and choose a plan/i)
    expect(text).not.toMatch(/card on file is charged/i)
  })

  it('a week-out milestone with no card on file falls back to the nearest true copy rather than throw', async () => {
    // That schedule has no d7; a caller bug must not cost the owner the email.
    await sendTrialReminderEmail('owner@clinic.com', { firstName: 'Pat', milestone: 'd7', billingUrl: BILLING })
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe('3 days left in your DreamCRM free trial')
  })
})

describe('the welcome — sent when the card goes on file', () => {
  const data = {
    firstName: 'Pat',
    clinicName: 'Maple & Oak Dental',
    chargeDate: 'Dec 7, 2026',
    websiteHubUrl: 'https://www.dreamcreatestudio.com/website',
    siteUrl: 'https://maple-oak.dreamcreatestudio.com',
  }

  it('says the trial has STARTED, when it ends, that the card is charged that day and not before, and how to cancel', async () => {
    await sendTrialStartedEmail('owner@clinic.com', data)
    expect(sent[0].subject).toBe('Welcome to DreamCRM — your free trial has started')
    const text = words(sent[0].html ?? '')
    expect(text).toContain('Your free trial has started')
    expect(text).toContain('Your free trial ends on Dec 7, 2026')
    expect(text).toMatch(/the card you added is charged for your plan — nothing before then/i)
    expect(text).toMatch(/cancel any time before that from Settings → Plan & billing and you will not be charged/i)
    expect(text).toContain('Maple & Oak Dental')
  })

  it('promises nothing the ruling took away, and states no amount or trial length it could get wrong', async () => {
    await sendTrialStartedEmail('owner@clinic.com', data)
    const text = words(sent[0].html ?? '')
    expect(text).not.toMatch(/no card/i)
    expect(text).not.toMatch(/\b7 days\b|for a week/i)
    expect(text).not.toMatch(/\$\s?\d/)
  })

  it('still says the site is drafted and private, with the Website hub as its door', async () => {
    await sendTrialStartedEmail('owner@clinic.com', data)
    const text = words(sent[0].html ?? '')
    expect(text).toMatch(/drafted and waiting at maple-oak\.dreamcreatestudio\.com/)
    expect(text).toMatch(/only you can see it until you publish/i)
    expect(sent[0].html).toContain(data.websiteHubUrl)
  })

  it('with no synced date it points at the billing page rather than guess a day', async () => {
    await sendTrialStartedEmail('owner@clinic.com', { ...data, chargeDate: null })
    const text = words(sent[0].html ?? '')
    expect(text).toContain('When your free trial ends, your subscription starts and the card you added is charged for your plan (the date is on your billing page) — nothing before then.')
    expect(text).not.toMatch(/ends on\b/)
    expect(text).toMatch(/cancel any time before that from Settings → Plan & billing/i)
  })
})
