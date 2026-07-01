import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The templated senders (email.ts) take an optional `content` override: an
 * overridden slot replaces the built-in copy (escaped + line-break-safe), and
 * an absent slot falls back to the literal so a default email is unchanged.
 */

const sent: Array<Record<string, unknown>> = []
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>) => {
        sent.push(payload)
        return { id: 'mock' }
      },
    }
  },
}))

import { sendBookingConfirmationEmail } from '@/lib/email'

const data = {
  patientName: 'Mia Hayes',
  clinicName: 'Acme Dental',
  clinicPhone: null,
  startTime: new Date('2026-01-12T19:00:00Z'),
  appointmentType: 'cleaning',
  intakeFormUrl: null,
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test_key'
  sent.length = 0
})

describe('sendBookingConfirmationEmail — editable copy', () => {
  it('uses the built-in copy when no override is passed', async () => {
    await sendBookingConfirmationEmail('mia@x.com', data)
    expect(sent[0].subject).toBe('Appointment confirmed at Acme Dental')
    expect(String(sent[0].html)).toContain('Your appointment is set')
    expect(String(sent[0].html)).toContain('is booked')
  })

  it('uses the clinic override for the slots that are provided', async () => {
    await sendBookingConfirmationEmail('mia@x.com', data, undefined, {
      subject: 'See you soon!',
      heading: 'Booked ✅',
      body: 'Your visit is set.',
    })
    expect(sent[0].subject).toBe('See you soon!')
    const html = String(sent[0].html)
    expect(html).toContain('Booked ✅')
    expect(html).toContain('Your visit is set.')
    expect(html).not.toContain('Your appointment is set')
  })

  it('escapes override content — injection-safe', async () => {
    await sendBookingConfirmationEmail('mia@x.com', data, undefined, {
      body: '<script>alert(1)</script>',
    })
    const html = String(sent[0].html)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('turns clinic line breaks into <br>', async () => {
    await sendBookingConfirmationEmail('mia@x.com', data, undefined, { body: 'Line one\nLine two' })
    expect(String(sent[0].html)).toContain('Line one<br>Line two')
  })

  it('leaves the structural appointment-time box intact even with an override', async () => {
    await sendBookingConfirmationEmail('mia@x.com', data, undefined, { body: 'Custom body' })
    // The date box is system-rendered, not part of the editable body.
    expect(String(sent[0].html)).toContain('January')
  })
})
