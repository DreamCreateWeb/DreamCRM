import { describe, it, expect } from 'vitest'
import { reminderSmsBody, familyReminderSmsBody } from '@/lib/types/reminders'
import { isGsm7, smsSegments } from '@/lib/sms-segments'

/**
 * The SMS reminder copy is code-owned and GSM-7-safe BY CONTRACT: one smart
 * quote flips the whole message to UCS-2 and cuts the per-segment budget
 * from 160 characters to 70. These tests pin that promise — if someone
 * "fixes" the apostrophes to match the app's typographic voice, this fails
 * with the reason attached.
 */

const visit = {
  firstName: 'Sam',
  clinicName: 'Bright Smiles Dental',
  typeLabel: 'deep cleaning',
  dayLabel: 'Wed, Jun 11',
  timeLabel: '9:00 AM',
}

describe('reminderSmsBody', () => {
  it('unconfirmed carries the one-click confirm link', () => {
    const body = reminderSmsBody({ ...visit, confirmUrl: 'https://www.dreamcreatestudio.com/c/tok1' })
    expect(body).toContain('Confirm here: https://www.dreamcreatestudio.com/c/tok1')
    expect(body).toContain('Sam')
    expect(body).toContain('Bright Smiles Dental')
    expect(body).toContain('Wed, Jun 11 at 9:00 AM')
  })

  it('confirmed is the gentler no-ask variant', () => {
    const body = reminderSmsBody(visit)
    expect(body).toContain('See you')
    expect(body).not.toContain('Confirm')
  })

  it('prep instructions ride along when the clinic wrote any', () => {
    const body = reminderSmsBody({ ...visit, prep: 'No food for 6 hours before.' })
    expect(body).toContain('Before your visit: No food for 6 hours before.')
    expect(reminderSmsBody(visit)).not.toContain('Before your visit')
  })

  it('the copy is GSM-7 — the confirmed variant fits ONE segment for typical names', () => {
    const confirmed = reminderSmsBody(visit)
    expect(isGsm7(confirmed)).toBe(true)
    expect(smsSegments(confirmed)).toBe(1)
    const unconfirmed = reminderSmsBody({ ...visit, confirmUrl: 'https://www.dreamcreatestudio.com/c/abc123def456' })
    expect(isGsm7(unconfirmed)).toBe(true)
  })
})

describe('familyReminderSmsBody', () => {
  it('lists every visit on the shared number, in one GSM-7 message', () => {
    const body = familyReminderSmsBody({
      clinicName: 'Bright Smiles Dental',
      dayLabel: 'Wed, Jun 11',
      visits: [
        { firstName: 'Maria', timeLabel: '9:00 AM' },
        { firstName: 'John', timeLabel: '9:45 AM' },
      ],
    })
    expect(body).toContain('Maria 9:00 AM, John 9:45 AM')
    expect(body).toContain("family's visits on Wed, Jun 11")
    expect(body).toContain('Just reply.')
    expect(isGsm7(body)).toBe(true)
  })
})
