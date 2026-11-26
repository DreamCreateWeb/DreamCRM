import { describe, it, expect } from 'vitest'
import { asBlanks, productEmail, GUIDE_BLANK_TOKENS } from '@/lib/marketing/guide-templates'
import { EMAIL_AUTOMATION_SPECS } from '@/lib/types/email-automations'

/**
 * A guide that shows one of the product's emails reads it from the product's
 * own spec (`lib/marketing/guide-templates.ts`). These hold the three ways
 * that read could put something false or broken in front of a reader.
 */
describe('the product’s emails, as a guide shows them', () => {
  it('respells every token as a blank and leaves the words alone', () => {
    const spec = EMAIL_AUTOMATION_SPECS.no_show_rebook.slotDefaults
    const note = productEmail('no_show_rebook')
    expect(note.subject).toBe('We missed you at {practice name} — let’s find a new time')
    expect(note.body).not.toMatch(/\{\{|\}\}/)
    // The words are the product's, in the product's order: with the blanks
    // put back as tokens, the card is the spec again.
    const back = note.body
      .replaceAll('{first name}', '{{firstName}}')
      .replaceAll('{visit type}', '{{appointmentType}}')
    expect(back).toBe(spec.body)
  })

  it('carries the heading and the closing only when the email has them', () => {
    const confirmation = productEmail('booking_confirmation')
    expect(confirmation.heading).toBe(EMAIL_AUTOMATION_SPECS.booking_confirmation.slotDefaults.heading)
    expect(confirmation.closing).toBeTruthy()
    const note = productEmail('no_show_rebook')
    expect('heading' in note).toBe(false)
    expect('closing' in note).toBe(false)
  })

  it('throws on a token it has no blank for — a raw {{token}} never reaches a page', () => {
    expect(() => asBlanks('Your balance is {{balance}}.')).toThrow(/\{\{balance\}\}/)
    // Every email a guide shows today respells cleanly.
    for (const key of [
      'booking_confirmation',
      'appointment_reminder',
      'appointment_reminder_confirmed',
      'rescheduled',
      'cancellation',
      'no_show_rebook',
    ] as const) {
      expect(() => productEmail(key), key).not.toThrow()
    }
  })

  it('no two tokens share a blank — a reader could not tell them apart', () => {
    const blanks = GUIDE_BLANK_TOKENS.map((t) => asBlanks(t))
    expect(new Set(blanks).size).toBe(GUIDE_BLANK_TOKENS.length)
    for (const b of blanks) expect(b).toMatch(/^\{[a-z ]+\}$/)
  })
})
