import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE AUTOMATION FAILURE REGISTRY (Phase 4 open item #1).
 *
 * The Guardian's `blocked` verdict is only as wide as the set of things that
 * can report a break to it — and until this, only the proposal engine and
 * the autonomy hand-back could. The send and sync automations, which are
 * most of what a clinic actually experiences, could fail every hour of every
 * day and that practice still reported `healthy`, because an idle ledger
 * with no failures reads as calm.
 *
 * These pin the registry's shape (a defect class this phase met repeatedly:
 * one concept, several hand-written encodings) and the throttle.
 */

const recorded = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/action-ledger', () => ({
  recordEngineFailure: vi.fn(async (input: Record<string, unknown>) => {
    recorded.calls.push(input)
    return true
  }),
}))

import {
  AUTOMATION_FAILURE,
  reportAutomationFailure,
  type AutomationFailureKey,
} from '@/lib/services/engine-failures'
import { getCapability } from '@/lib/autonomy'

const KEYS = Object.keys(AUTOMATION_FAILURE) as AutomationFailureKey[]

beforeEach(() => {
  recorded.calls = []
})

describe('the registry', () => {
  it('covers every producer the Phase 4 certificate named as missing', () => {
    expect(KEYS).toEqual(
      expect.arrayContaining([
        'reminders',
        'campaigns',
        'retention',
        'review_sync',
        'gbp_sync',
        'pms_sync',
      ]),
    )
  })

  it('every entry files under a REGISTERED capability', () => {
    // An unregistered key still records (losing the entry would be worse),
    // but it has no label for the narrator and resolveTrust floors it — so
    // the Guardian's owner-facing "what it tried" list would print a raw
    // key at a human.
    for (const k of KEYS) {
      const cap = getCapability(AUTOMATION_FAILURE[k].capability)
      expect(cap, `${k} → ${AUTOMATION_FAILURE[k].capability} is not in lib/autonomy.ts`).toBeTruthy()
    }
  })

  it('every sentence is CLINIC-voiced: owns it, never blames them, never a raw error', () => {
    for (const k of KEYS) {
      const s = AUTOMATION_FAILURE[k].summary
      expect(s.startsWith('Couldn’t'), `${k}: ${s}`).toBe(true)
      expect(s).toMatch(/I’ll keep trying/)
      // Anti-shame: nothing in a clinic's own story tells them off.
      expect(s).not.toMatch(/\byou (did|failed|forgot)\b/i)
    }
  })
})

describe('reportAutomationFailure', () => {
  it('records under the producer’s capability, with its sentence', async () => {
    await reportAutomationFailure('org_1', 'reminders')
    expect(recorded.calls[0]).toMatchObject({
      organizationId: 'org_1',
      capability: 'appointment_reminder',
      kind: 'engine',
    })
  })

  it('throttles to ONE a day — these run on 15-minute and hourly crons', async () => {
    // Undeduped, a broken reminder engine would put dozens of identical rows
    // a day into a clinic's own story and trip the three-strike alarm before
    // lunch on day one. With the window, a strike means a DAY.
    await reportAutomationFailure('org_1', 'reminders')
    expect(recorded.calls[0].onceWithin).toBe(24 * 60 * 60 * 1000)
  })

  it('does NOT dedupe across the org — these are independent subsystems', async () => {
    // Unlike the proposal engine's five steps (one break wearing five hats),
    // reminders failing and Google sync failing are two facts, and the
    // owner's "what it tried" list should name both.
    await reportAutomationFailure('org_1', 'reminders')
    await reportAutomationFailure('org_1', 'gbp_sync')
    expect(recorded.calls.every((c) => !c.dedupeAcrossOrg)).toBe(true)
    expect(recorded.calls.map((c) => c.capability)).toEqual([
      'appointment_reminder',
      'listing_sync',
    ])
  })

  it('is ENGINE kind, so no clinic-voiced hedge ever promises to fix a hand-back', async () => {
    for (const k of KEYS) {
      recorded.calls = []
      await reportAutomationFailure('org_1', k)
      expect(recorded.calls[0].kind).toBe('engine')
    }
  })
})

/**
 * THE PRODUCERS ARE ACTUALLY WIRED. A registry nothing calls is the defect
 * this open item exists to close, one layer up — so this scans the real
 * call sites rather than trusting that they were added.
 */
describe('every named producer calls it', () => {
  it('the five send/sync automations report their breaks', async () => {
    const { readFileSync } = await import('node:fs')
    const sites: Array<[string, string]> = [
      ['lib/services/reminder-automation.ts', 'reminders'],
      ['lib/services/marketing-scheduled.ts', 'campaigns'],
      ['lib/services/retention-automation.ts', 'retention'],
      ['lib/services/google-reviews.ts', 'review_sync'],
      ['lib/services/gbp-sync.ts', 'gbp_sync'],
      ['app/api/cron/pms-sync/route.ts', 'pms_sync'],
    ]
    for (const [file, key] of sites) {
      const src = readFileSync(file, 'utf8')
      expect(src, `${file} never reports a failure`).toContain('reportAutomationFailure')
      expect(src, `${file} reports under the wrong key`).toContain(`'${key}'`)
    }
  })
})
