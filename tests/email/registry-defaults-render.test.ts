import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * ONE GREETING. The clinic-sender branch of `sendNotificationEmail` adds its
 * own "Hi {first}," line above the body, and the registry defaults for the
 * confirmed-visit reminder and the website auto-reply open with
 * "Hi {{firstName}}" — so every clinic that never edited those emails sent
 * "Hi Mary," followed by "Hi Mary — you're all set…", a mail-merge mistake
 * under the practice's own name. These render each greeting-bearing registry
 * default through the REAL sender (mocked Resend) and pin exactly one
 * salutation, while a body with no greeting still gets one.
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

import { sendNotificationEmail } from '@/lib/email'
import {
  EMAIL_AUTOMATION_KEYS,
  EMAIL_AUTOMATION_SPECS,
  bodyOpensWithGreeting,
} from '@/lib/types/email-automations'

const SENDER = {
  name: 'Acme Dental',
  from: 'Acme Dental <acme-dental@dreamcreatestudio.com>',
  replyTo: 'front@acmedental.com',
  timeZone: 'America/New_York',
}

const SAMPLE: Record<string, string> = {
  firstName: 'Mary',
  patientName: 'Mary Hayes',
  clinicName: 'Acme Dental',
  clinicPhone: '(555) 123-4567',
  appointmentType: 'cleaning',
  appointmentDate: 'Monday, Jan 12',
  appointmentTime: 'Monday, January 12 at 2:00 PM',
  urgentLine: ' If it is urgent, you can reach us at (555) 123-4567.',
}

function fill(text: string): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => SAMPLE[k] ?? '')
}

/** Visible text of the email, tags stripped, so a greeting inside an
 *  attribute or a style could never hide from the count. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function salutations(text: string): number {
  return (text.match(/\bHi\b/g) ?? []).length
}

beforeEach(() => {
  sent.length = 0
  process.env.EMAIL_DRIVER = 'resend'
  process.env.RESEND_API_KEY = 're_test_key'
})

describe('bodyOpensWithGreeting', () => {
  it('recognises the salutations a practice actually writes', () => {
    for (const body of [
      'Hi {{firstName}} — you’re all set.',
      'Hi Mary, we got your message.',
      '  hello there,',
      'Hey Mary!',
      'Dear Mr Hayes,',
      'Good morning Mary,',
    ]) {
      expect(bodyOpensWithGreeting(body), body).toBe(true)
    }
  })

  it('is false for a body that gets straight to it (or nothing at all)', () => {
    for (const body of [
      'We got your message and will reach out soon.',
      'Your visit is Monday at 2.',
      'Highlights from your visit:', // "Hi" as a prefix is not a greeting
      'Dearest friend of the practice', // nor is "Dear" as a prefix
      '',
      null,
      undefined,
    ]) {
      expect(bodyOpensWithGreeting(body), String(body)).toBe(false)
    }
  })
})

describe('registry defaults render with exactly one greeting', () => {
  const greeting = EMAIL_AUTOMATION_KEYS.filter((k) => EMAIL_AUTOMATION_SPECS[k].greets)

  it('the greeting-bearing specs are the two sendNotificationEmail-backed emails', () => {
    expect(greeting.sort()).toEqual(['appointment_reminder_confirmed', 'contact_ack'])
  })

  for (const key of greeting) {
    it(`${key}: the default body through the real sender greets once`, async () => {
      const spec = EMAIL_AUTOMATION_SPECS[key]
      await sendNotificationEmail(
        { to: 'mary@x.com', name: SAMPLE.patientName, title: fill(spec.slotDefaults.subject), body: fill(spec.slotDefaults.body) },
        SENDER,
      )
      expect(sent).toHaveLength(1)
      const text = textOf(sent[0].html ?? '')
      expect(salutations(text)).toBe(1)
      expect(text).toMatch(/^Hi Mary\b/)
      // The signature the registry promises is still there.
      expect(text).toContain('— Acme Dental')
    })
  }

  it('no registry default opens with a doubled salutation of its own', () => {
    for (const key of EMAIL_AUTOMATION_KEYS) {
      const body = EMAIL_AUTOMATION_SPECS[key].slotDefaults.body
      expect(salutations(fill(body).slice(0, 40)), key).toBeLessThanOrEqual(1)
    }
  })
})

describe('sendNotificationEmail salutation rule', () => {
  it('adds "Hi {first}," when the body does not greet (a clinic that trimmed its message keeps a greeting)', async () => {
    await sendNotificationEmail(
      { to: 'mary@x.com', name: 'Mary Hayes', title: 'See you Monday', body: 'You’re all set for Monday at 2.' },
      SENDER,
    )
    const text = textOf(sent[0].html ?? '')
    expect(text).toMatch(/^Hi Mary, You’re all set/)
    expect(salutations(text)).toBe(1)
  })

  it("salutation: 'none' never adds one", async () => {
    await sendNotificationEmail(
      { to: 'mary@x.com', name: 'Mary Hayes', title: 'See you Monday', body: 'You’re all set for Monday at 2.', salutation: 'none' },
      SENDER,
    )
    const text = textOf(sent[0].html ?? '')
    expect(salutations(text)).toBe(0)
    expect(text).toMatch(/^You’re all set/)
  })

  it('the staff branch follows the same rule', async () => {
    await sendNotificationEmail({
      to: 'desk@clinic.com',
      name: 'Dana Front',
      title: 'A lead needs a call',
      body: 'Hi Dana — a new enquiry landed.',
      linkPath: '/leads',
    })
    const text = textOf(sent[0].html ?? '')
    expect(salutations(text)).toBe(1)
  })

  it('escapes the recipient name in the greeting', async () => {
    await sendNotificationEmail(
      { to: 'x@x.com', name: '<script>alert(1)</script> Hayes', title: 'T', body: 'Body.' },
      SENDER,
    )
    const html = sent[0].html ?? ''
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
