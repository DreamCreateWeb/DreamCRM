import { describe, it, expect } from 'vitest'
import {
  detectPreferredChannel,
  pickDefaultReplyChannel,
} from '@/app/(double-sidebar)/messages/pick-default-reply-channel'

type M = { direction: 'inbound' | 'outbound'; channel: 'in_app' | 'email' | 'sms' }
const inEmail: M = { direction: 'inbound', channel: 'email' }
const inSms: M = { direction: 'inbound', channel: 'sms' }
const inApp: M = { direction: 'inbound', channel: 'in_app' }
const outEmail: M = { direction: 'outbound', channel: 'email' }
const outApp: M = { direction: 'outbound', channel: 'in_app' }

describe('detectPreferredChannel', () => {
  it('returns null when the thread has no inbounds', () => {
    expect(detectPreferredChannel([])).toBeNull()
    expect(detectPreferredChannel([outEmail, outApp])).toBeNull()
  })

  it('returns null below the minimum-inbound floor (3)', () => {
    expect(detectPreferredChannel([inEmail])).toBeNull()
    expect(detectPreferredChannel([inEmail, inEmail])).toBeNull()
  })

  it('returns the winning channel at the 3-inbound floor when share is 100%', () => {
    const r = detectPreferredChannel([inEmail, inEmail, inEmail])
    expect(r).toEqual({ channel: 'email', count: 3, share: 1, totalInbound: 3 })
  })

  it('returns null when no channel reaches the 0.7 share threshold (3/5 = 0.6)', () => {
    expect(
      detectPreferredChannel([inEmail, inEmail, inEmail, inApp, inApp]),
    ).toBeNull()
  })

  it('returns the channel that crosses the 0.7 threshold (4/5 = 0.8 → email)', () => {
    const r = detectPreferredChannel([inEmail, inEmail, inEmail, inEmail, inApp])
    expect(r?.channel).toBe('email')
    expect(r?.count).toBe(4)
    expect(r?.share).toBeCloseTo(0.8)
    expect(r?.totalInbound).toBe(5)
  })

  it('ignores outbound messages when computing the distribution', () => {
    const r = detectPreferredChannel([
      outEmail, outEmail, outEmail, outEmail,  // 4 outbound emails — should NOT count
      inApp, inApp, inApp,                      // 3 inbound in-app — should be winner
    ])
    expect(r).toEqual({ channel: 'in_app', count: 3, share: 1, totalInbound: 3 })
  })

  it('detects SMS preference (Phase B will route here)', () => {
    const r = detectPreferredChannel([inSms, inSms, inSms, inEmail])
    expect(r?.channel).toBe('sms')
    expect(r?.share).toBe(0.75)
  })
})

describe('pickDefaultReplyChannel', () => {
  it('defaults to in_app when the thread has no messages yet', () => {
    expect(pickDefaultReplyChannel([], false)).toBe('in_app')
    expect(pickDefaultReplyChannel([], true)).toBe('in_app')
  })

  it('defaults to in_app when only outbound messages exist', () => {
    expect(pickDefaultReplyChannel([outEmail, outApp], true)).toBe('in_app')
  })

  it('picks the patient preferred channel when one is detectable', () => {
    // 4 of 5 inbounds via in-app → preferred
    const msgs = [inApp, inApp, inApp, inApp, inEmail]
    expect(pickDefaultReplyChannel(msgs, true)).toBe('in_app')
  })

  it('preference overrides the most-recent-inbound rule', () => {
    // Patient historically prefers email (4 of 5 inbounds) but the most
    // recent one happened to be in-app. We should still default to
    // email — that's where they live.
    const msgs = [inEmail, inEmail, inEmail, inEmail, inApp]
    expect(pickDefaultReplyChannel(msgs, true)).toBe('email')
  })

  it('falls back to most-recent-inbound when no preference is detectable', () => {
    // Mixed history with no clear winner — use the latest signal.
    expect(pickDefaultReplyChannel([inEmail, inApp], true)).toBe('in_app')
  })

  it('falls back to email when SMS is the most recent inbound and email is on file', () => {
    expect(pickDefaultReplyChannel([inSms], true)).toBe('email')
  })

  it('falls back to in_app when SMS is the most recent inbound and no email on file', () => {
    expect(pickDefaultReplyChannel([inSms], false)).toBe('in_app')
  })

  it('falls through to last-inbound when preference is SMS (Phase B not wired)', () => {
    // SMS is the preferred channel by count but we can't send SMS yet,
    // so fall through to the last-inbound rule. Most recent is email
    // (sendable) so we land on email rather than the disabled SMS pick.
    const msgs = [inSms, inSms, inSms, inEmail]
    expect(pickDefaultReplyChannel(msgs, true)).toBe('email')
  })

  it('walks back past outbound runs to find the inbound when no preference', () => {
    expect(
      pickDefaultReplyChannel([inEmail, outApp, outApp, outApp], true),
    ).toBe('email')
  })
})
