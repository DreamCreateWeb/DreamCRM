import { describe, it, expect } from 'vitest'
import { renderFromResolved } from '@/lib/services/email-automations'
import { resolveEmailAutomations } from '@/lib/types/email-automations'

/**
 * renderFromResolved is the token-fill boundary. `full` is used by the
 * service-built emails (reminder/review/contact); `override` carries ONLY the
 * slots the clinic actually changed, so the templated senders fall back to
 * their literal for everything else (default → byte-identical).
 */

const FIELDS = {
  firstName: 'Mia',
  patientName: 'Mia Hayes',
  clinicName: 'Acme Dental',
  appointmentType: 'Cleaning',
  appointmentTime: 'Mon 2pm',
}

describe('renderFromResolved', () => {
  it('fills every slot in `full` for a default email (reminder/review/contact use this)', () => {
    const resolved = resolveEmailAutomations(null).review_request
    const r = renderFromResolved('review_request', resolved, { firstName: 'Mia', clinicName: 'Acme Dental' })
    expect(r.full.subject).toBe('Quick favor from Acme Dental')
    expect(r.full.heading).toBe('Hi Mia,')
    expect(r.full.closing).toContain('The team at Acme Dental')
    expect(r.enabled).toBe(true)
  })

  it('returns override ONLY for changed slots', () => {
    const resolved = resolveEmailAutomations({
      booking_confirmation: { subject: 'See you soon, {{firstName}}!' },
    }).booking_confirmation
    const r = renderFromResolved('booking_confirmation', resolved, FIELDS)
    expect(r.override.subject).toBe('See you soon, Mia!')
    // body wasn't changed → not in override → the templated fn keeps its literal
    expect(r.override.body).toBeUndefined()
  })

  it('no override at all when nothing changed → templated email stays byte-identical', () => {
    const resolved = resolveEmailAutomations(null).booking_confirmation
    const r = renderFromResolved('booking_confirmation', resolved, FIELDS)
    expect(r.override).toEqual({})
  })

  it('strips unknown tokens to empty (never ships a raw {{token}})', () => {
    const resolved = resolveEmailAutomations({ contact_ack: { body: 'Hi {{firstName}} {{bogus}}' } }).contact_ack
    const r = renderFromResolved('contact_ack', resolved, { firstName: 'Mia' })
    expect(r.override.body).toBe('Hi Mia ')
    expect(r.override.body).not.toContain('{{')
  })

  it('carries the enabled flag through (for the email_automations-gated emails)', () => {
    const resolved = resolveEmailAutomations({ contact_ack: { enabled: false } }).contact_ack
    const r = renderFromResolved('contact_ack', resolved, { firstName: 'Mia', clinicName: 'Acme' })
    expect(r.enabled).toBe(false)
  })
})
