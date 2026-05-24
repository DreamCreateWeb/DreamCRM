import { describe, it, expect } from 'vitest'
import { eligibleForChannel } from '@/lib/services/marketing-send'
import type { ResolvedRecipient } from '@/lib/services/marketing'

/**
 * The opt-in gate is the compliance-critical safety net in the send
 * orchestration — it runs at send time (after audience resolution) so a
 * patient who opted out AFTER an audience was saved can never receive a
 * campaign. Getting this wrong = CAN-SPAM / TCPA exposure, so it gets
 * dedicated coverage.
 */
function recipient(over: Partial<ResolvedRecipient> = {}): ResolvedRecipient {
  return {
    id: 'p1',
    customerId: null,
    patientId: 'p1',
    firstName: 'Mia',
    name: 'Mia Hayes',
    email: 'mia@example.com',
    phone: '(512) 555-0100',
    emailOptIn: true,
    smsOptIn: false,
    ...over,
  }
}

describe('eligibleForChannel — send-time opt-in gate', () => {
  it('email: allows an opted-in recipient with an email', () => {
    expect(eligibleForChannel(recipient(), 'resend')).toBe(true)
    expect(eligibleForChannel(recipient(), 'gmail')).toBe(true)
  })

  it('email: BLOCKS a recipient who has opted out of email (even with an address)', () => {
    expect(eligibleForChannel(recipient({ emailOptIn: false }), 'resend')).toBe(false)
    expect(eligibleForChannel(recipient({ emailOptIn: false }), 'gmail')).toBe(false)
  })

  it('email: blocks a recipient with no email address', () => {
    expect(eligibleForChannel(recipient({ email: null }), 'resend')).toBe(false)
    expect(eligibleForChannel(recipient({ email: '' }), 'resend')).toBe(false)
  })

  it('sms: requires BOTH a phone and sms opt-in (TCPA — sms is stricter)', () => {
    expect(eligibleForChannel(recipient({ smsOptIn: true }), 'twilio_sms')).toBe(true)
    // opted into email but NOT sms → not eligible for sms
    expect(eligibleForChannel(recipient({ smsOptIn: false }), 'twilio_sms')).toBe(false)
    // sms opt-in but no phone → not eligible
    expect(eligibleForChannel(recipient({ smsOptIn: true, phone: null }), 'twilio_sms')).toBe(false)
  })

  it('sms eligibility ignores the email opt-in (channels are independent)', () => {
    expect(eligibleForChannel(recipient({ emailOptIn: false, smsOptIn: true }), 'twilio_sms')).toBe(true)
    expect(eligibleForChannel(recipient({ emailOptIn: true, smsOptIn: false }), 'twilio_sms')).toBe(false)
  })
})
