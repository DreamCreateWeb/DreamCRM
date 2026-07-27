/**
 * TRANSFORMATION PHASE 1 — the spine (DESIGN.md "The North Star").
 * Pins the three primitives shipped inert under everything:
 *
 *  1. The journey-stage resolver — stage is DERIVED from facts, never
 *     hand-stamped; "patient" means SEATED (a completed visit), not booked.
 *  2. The autonomy ladder — every capability's default encodes exactly
 *     today's shipped behavior (introducing the ladder changed nothing),
 *     unknown capabilities floor at 'ask', stored grants override.
 *  3. The doctrine itself — DESIGN.md carries the North Star and CLAUDE.md
 *     carries the convention, so no future session ships a dashboard where
 *     an employee behavior belongs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { resolveJourneyStage, JOURNEY_STAGE_LABEL } from '@/lib/patient-journey'
import { CAPABILITIES, getCapability, resolveTrust } from '@/lib/autonomy'

describe('the journey-stage resolver', () => {
  it('inquiry: asked a question, never on the schedule', () => {
    expect(
      resolveJourneyStage({ hasAppointment: false, hasCompletedVisit: false, archived: false }),
    ).toBe('inquiry')
  })

  it('booked: on the schedule, never seated — NOT a patient yet', () => {
    expect(
      resolveJourneyStage({ hasAppointment: true, hasCompletedVisit: false, archived: false }),
    ).toBe('booked')
  })

  it('patient: seated — the only stage "new patients" may ever count', () => {
    expect(
      resolveJourneyStage({ hasAppointment: true, hasCompletedVisit: true, archived: false }),
    ).toBe('patient')
  })

  it('a completed visit wins even with inconsistent facts (data heals forward)', () => {
    // PMS-synced rows can carry a completed visit with no other appointments
    // visible to us — seated is seated.
    expect(
      resolveJourneyStage({ hasAppointment: false, hasCompletedVisit: true, archived: false }),
    ).toBe('patient')
  })

  it('archived beats everything — a human decision the resolver honors', () => {
    expect(
      resolveJourneyStage({ hasAppointment: true, hasCompletedVisit: true, archived: true }),
    ).toBe('archived')
  })

  it('every stage has a reader-facing label', () => {
    for (const stage of ['inquiry', 'booked', 'patient', 'archived'] as const) {
      expect(JOURNEY_STAGE_LABEL[stage]).toBeTruthy()
    }
  })
})

describe('the autonomy ladder', () => {
  it('defaults encode exactly today: sends are auto, drafts ask first', () => {
    // Autonomous today (they already send on their own):
    for (const key of [
      'appointment_reminder',
      'review_request',
      'campaign_send',
      'retention_automation',
      'followup_rule',
      'balance_nudge',
      'auto_reply',
    ]) {
      expect(getCapability(key)?.defaultTrust, key).toBe('auto')
    }
    // Ask-first today (drafts that wait for a human yes):
    for (const key of ['review_reply', 'social_post', 'inquiry_response', 'outreach_campaign']) {
      expect(getCapability(key)?.defaultTrust, key).toBe('ask')
    }
  })

  it('missing overrides fall back to the default; grants override; junk is ignored', () => {
    expect(resolveTrust(null, 'appointment_reminder')).toBe('auto')
    expect(resolveTrust({}, 'review_reply')).toBe('ask')
    // The clinic tapped "always do this for me":
    expect(resolveTrust({ review_reply: 'auto' }, 'review_reply')).toBe('auto')
    // ...and can dial one back down:
    expect(resolveTrust({ campaign_send: 'ask' }, 'campaign_send')).toBe('ask')
    // Corrupt values never grant autonomy:
    expect(resolveTrust({ review_reply: 'yolo' }, 'review_reply')).toBe('ask')
  })

  it("unknown capabilities floor at 'ask' — nothing grants itself autonomy", () => {
    expect(resolveTrust(null, 'brand_new_capability')).toBe('ask')
    expect(resolveTrust({ brand_new_capability: 'auto' }, 'brand_new_capability')).toBe('auto')
  })

  it('every capability label is narrator-voiced (no machine keys leaking)', () => {
    for (const c of CAPABILITIES) {
      expect(c.label).not.toMatch(/_/)
      expect(c.label.length).toBeGreaterThan(8)
    }
  })
})

describe('the doctrine is law', () => {
  const ROOT = resolve(__dirname, '../..')

  it('DESIGN.md carries the North Star with the design test + success law', () => {
    const src = readFileSync(join(ROOT, 'DESIGN.md'), 'utf8')
    expect(src).toContain('The North Star')
    expect(src).toContain('the employee, not the tool')
    expect(src).toContain('does it do the job')
    expect(src).toContain('Minutes-in-app goes DOWN while patients go UP')
    expect(src).toContain('Action Ledger')
    expect(src).toContain('Autonomy Ladder')
  })

  it('CLAUDE.md carries the convention + the transformation as open item 0', () => {
    const src = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
    expect(src).toContain('The North Star is a convention')
    expect(src).toContain('THE TRANSFORMATION')
  })
})
