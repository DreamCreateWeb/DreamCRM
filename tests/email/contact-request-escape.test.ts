import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The website-enquiry / careers alert ("New appointment request") is the one
 * email whose every field a STRANGER typed on the public site, and the front
 * desk acts on it by phone. Every value must arrive escaped — a styled
 * "Call back" link or a hidden block is a phishing vector aimed at the most
 * trusting reader the product has — and the name must not be able to split
 * the subject header. The booking confirmation's default body gets the same
 * treatment as its cancellation twin. We capture the HTML handed to the
 * provider via a mocked Resend client.
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

import { sendBookingConfirmationEmail, sendContactRequestEmail } from '@/lib/email'

beforeEach(() => {
  sent.length = 0
  process.env.EMAIL_DRIVER = 'resend'
  process.env.RESEND_API_KEY = 're_test_key'
})

const SCRIPT = '<script>alert(1)</script>'
const LINK = '<a href="https://evil.example/x">Call back</a>'

describe('sendContactRequestEmail — public-form values are escaped', () => {
  it('escapes every field a stranger can type', async () => {
    await sendContactRequestEmail('desk@clinic.com', {
      clinicName: `Bright ${SCRIPT} Smiles`,
      patientName: `Mia ${SCRIPT}`,
      phone: `555 ${LINK}`,
      email: `mia@x.com${SCRIPT}`,
      preferredDate: `Tuesday ${SCRIPT}`,
      message: `Please ${LINK}\n\nInsurance: Delta ${SCRIPT}`,
    })
    expect(sent).toHaveLength(1)
    const html = sent[0].html ?? ''
    expect(html).not.toContain(SCRIPT)
    expect(html).not.toContain(LINK)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;a href=')
    // Every field appears exactly as many times as it was injected, escaped.
    expect(html.match(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/g)?.length).toBe(5)
    // The message keeps the site's custom-field line breaks.
    expect(html).toMatch(/white-space:pre-wrap[^>]*>Please/)
    expect(html).toContain('\n\nInsurance: Delta')
  })

  it('flattens a CR/LF-bearing name so it cannot split the subject', async () => {
    await sendContactRequestEmail('desk@clinic.com', {
      clinicName: 'Acme Dental',
      patientName: 'Mia\r\nBcc: victim@example.net\nHayes',
      phone: '555-0100',
      email: null,
      preferredDate: null,
      message: null,
    })
    const subject = sent[0].subject ?? ''
    expect(subject).toBe('New appointment request from Mia Bcc: victim@example.net Hayes')
    expect(subject).not.toMatch(/[\r\n]/)
  })

  it('still reads as a plain request when nothing is hostile', async () => {
    await sendContactRequestEmail('desk@clinic.com', {
      clinicName: 'Acme Dental',
      patientName: "Mia O'Hayes",
      phone: '555-0100',
      email: 'mia@x.com',
      preferredDate: 'Next Tuesday',
      message: 'Toothache, left side.',
    })
    const html = sent[0].html ?? ''
    expect(sent[0].subject).toBe("New appointment request from Mia O'Hayes")
    expect(html).toContain('Mia O&#39;Hayes')
    expect(html).toContain('555-0100')
    expect(html).toContain('mia@x.com')
    expect(html).toContain('Next Tuesday')
    expect(html).toContain('Toothache, left side.')
  })
})

describe('sendBookingConfirmationEmail — the default body escapes like its cancellation twin', () => {
  it('escapes patientName and clinicName in the built-in copy', async () => {
    await sendBookingConfirmationEmail('mia@x.com', {
      patientName: `Mia ${SCRIPT}`,
      clinicName: `Acme ${SCRIPT} Dental`,
      clinicPhone: `555 ${LINK}`,
      startTime: new Date('2026-01-12T19:00:00Z'),
      appointmentType: 'cleaning',
      intakeFormUrl: null,
    })
    const html = sent[0].html ?? ''
    expect(html).not.toContain(SCRIPT)
    expect(html).not.toContain(LINK)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('is booked')
  })
})
