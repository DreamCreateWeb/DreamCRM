import { describe, it, expect } from 'vitest'
import { pickDefaultReplyChannel } from '@/app/(double-sidebar)/messages/pick-default-reply-channel'

/**
 * Pure-function coverage for the reply-channel auto-pick. The rule
 * matters because the prior heuristic read `thread.lastMessageChannel`
 * — which tracks the LAST message of any direction — so once staff
 * replied via in-app to an emailed patient, the picker silently
 * dropped off the email default. The new rule walks message history
 * and uses the most recent INBOUND channel: that's where the patient
 * wrote in from, so reply on the same surface.
 */

type M = { direction: 'inbound' | 'outbound'; channel: 'in_app' | 'email' | 'sms' }
const inEmail: M = { direction: 'inbound', channel: 'email' }
const inSms: M = { direction: 'inbound', channel: 'sms' }
const inApp: M = { direction: 'inbound', channel: 'in_app' }
const outEmail: M = { direction: 'outbound', channel: 'email' }
const outApp: M = { direction: 'outbound', channel: 'in_app' }

describe('pickDefaultReplyChannel', () => {
  it('defaults to in_app when the thread has no messages yet', () => {
    expect(pickDefaultReplyChannel([], false)).toBe('in_app')
    expect(pickDefaultReplyChannel([], true)).toBe('in_app')
  })

  it('defaults to in_app when only outbound messages exist (proactive reminder thread)', () => {
    expect(pickDefaultReplyChannel([outEmail, outApp], true)).toBe('in_app')
  })

  it('picks email when the patient last messaged in via email', () => {
    expect(pickDefaultReplyChannel([inEmail], true)).toBe('email')
  })

  it('picks in_app when the patient last messaged in via the portal', () => {
    expect(pickDefaultReplyChannel([inApp], true)).toBe('in_app')
  })

  it('falls back to email when the last inbound was SMS and an email is on file (Phase B not wired)', () => {
    expect(pickDefaultReplyChannel([inSms], true)).toBe('email')
  })

  it('falls back to in_app when the last inbound was SMS and no email is on file', () => {
    expect(pickDefaultReplyChannel([inSms], false)).toBe('in_app')
  })

  it('uses the LAST inbound channel, ignoring intervening outbound replies', () => {
    // Patient emailed → staff replied via in-app → patient hasn't written back.
    // The reply default should stay 'email' (patient's preferred channel),
    // not flip to 'in_app' just because that's where staff chose last.
    expect(pickDefaultReplyChannel([inEmail, outApp], true)).toBe('email')
  })

  it('updates to the patient new inbound channel when they switch', () => {
    // Patient emailed → staff replied via email → patient followed up via in-app.
    // Reply default should now be 'in_app'.
    expect(pickDefaultReplyChannel([inEmail, outEmail, inApp], true)).toBe('in_app')
  })

  it('walks back past outbound runs to find the inbound', () => {
    expect(
      pickDefaultReplyChannel([inEmail, outApp, outApp, outApp], true),
    ).toBe('email')
  })
})
