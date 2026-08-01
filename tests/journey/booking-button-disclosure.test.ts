import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BOOKING_BUTTON_CAPABILITIES, CAPABILITIES } from '@/lib/autonomy'

/**
 * "WHAT THE CARD SHOWS IS WHAT SENDS" — the disclosure guard.
 *
 * `textToCampaignHtml` appends a "Book a time that works" button to any
 * campaign body that didn't place the {{bookingUrl}} link itself, and the
 * inquiry reply's email shell does the same with its own button. Staff can
 * rewrite the draft on the card; if the card doesn't SAY a button is coming,
 * they ship one they never saw.
 *
 * The set of capabilities that happens to is genuinely known in two places —
 * the executor that appends, and the client card that discloses — so it has
 * one home (BOOKING_BUTTON_CAPABILITIES) and this pins the coupling. A new
 * campaign-shaped capability that forgets to join the list is exactly the
 * pair-that-drifts the audits keep finding.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('the booking-button disclosure', () => {
  it('names only REGISTERED capabilities', () => {
    const known = new Set(CAPABILITIES.map((c) => c.key))
    for (const c of BOOKING_BUTTON_CAPABILITIES) {
      expect(known.has(c), `'${c}' is not in CAPABILITIES`).toBe(true)
    }
  })

  it('covers every capability whose executor routes through textToCampaignHtml', () => {
    const src = read('lib/services/proposals.ts')
    // The campaign protocol is the append path; both capabilities that
    // dispatch into it must be disclosed.
    const dispatchers = ['outreach_campaign', 'schedule_gap']
    for (const c of dispatchers) {
      expect(src).toContain(`case '${c}':`)
      expect(BOOKING_BUTTON_CAPABILITIES, `'${c}' sends through the campaign protocol`).toContain(c)
    }
    // ...and the inquiry reply, which appends its own button in the shell.
    expect(src).toContain("buttonLabel: 'Book a time'")
    expect(BOOKING_BUTTON_CAPABILITIES).toContain('inquiry_response')
  })

  it('is what the card actually reads — not a second hand-written list', () => {
    const card = read('app/(default)/dashboard/approval-inbox.tsx')
    expect(card).toContain('BOOKING_BUTTON_CAPABILITIES.includes(proposal.capability)')
    // No inline capability comparison left behind to drift out of step.
    expect(card).not.toMatch(/appendsBookingButton\s*=\s*\(proposal\.capability ===/)
  })
})

/**
 * The patient-inbox list governs the send WINDOW: the machine may not put
 * mail in a patient's inbox at 3 AM on its own. Any capability whose
 * execution emails patients belongs to it.
 */
describe('the patient-inbox list', () => {
  it('includes every capability that emails patients', async () => {
    const { PATIENT_INBOX_CAPABILITIES } = await import('@/lib/services/proposal-generators')
    for (const c of ['outreach_campaign', 'inquiry_response', 'schedule_gap']) {
      expect(PATIENT_INBOX_CAPABILITIES, `'${c}' reaches a patient's inbox`).toContain(c)
    }
  })
})
