import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prewarm } from '../prewarm'

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
const ledger = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/services/action-ledger', () => ({
  recordEngineFailure: vi.fn(async (input: Record<string, unknown>) => {
    recorded.calls.push(input)
    return true
  }),
  listRecentActions: vi.fn(async () => ledger.rows),
}))
vi.mock('@/lib/services/gsc', () => ({ getPlatformOrgId: vi.fn(async () => 'org_platform') }))

import {
  AUTOMATION_FAILURE,
  PROSPECTING_FAILURE_CLASSES,
  reportAutomationFailure,
  reportProspectingFailure,
  type AutomationFailureKey,
} from '@/lib/services/engine-failures'
import { getCapability } from '@/lib/autonomy'

const KEYS = Object.keys(AUTOMATION_FAILURE) as AutomationFailureKey[]

// Load the module(s) under test during COLLECTION, so no single test is
// billed for the cold module graph (see tests/prewarm.ts).
prewarm(() => import('node:fs'))

beforeEach(() => {
  recorded.calls = []
  ledger.rows = []
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
      // The custom-domain sweep (2026-10-26) — the seventh producer.
      ['lib/services/custom-domain.ts', 'custom_domain'],
      // The notification re-drive (ML-32) — the eighth.
      ['lib/services/notifications.ts', 'staff_alert'],
      ['lib/services/gmail-sync.ts', 'inbox_sync'],
    ]
    for (const [file, key] of sites) {
      const src = readFileSync(file, 'utf8')
      expect(src, `${file} never reports a failure`).toContain('reportAutomationFailure')
      expect(src, `${file} reports under the wrong key`).toContain(`'${key}'`)
    }
  })

  it('the prospecting verifier (P-01) and the hygiene pass (P-03) report through the per-class door, on the platform org', async () => {
    const { readFileSync } = await import('node:fs')
    // Each class has ONE producer: the verifier owns the four plumbing
    // faults, the hygiene pass owns its own — a class nothing calls is the
    // defect this registry exists to close.
    const verify = readFileSync('lib/services/prospect-verify.ts', 'utf8')
    const hygiene = readFileSync('lib/services/prospect-hygiene.ts', 'utf8')
    expect(verify).toContain('reportProspectingFailure')
    expect(hygiene).toContain('reportProspectingFailure')
    const producer: Record<string, string> = {
      places_auth: verify,
      phone_validate_auth: verify,
      nppes_down: verify,
      crawl_blocked: verify,
      hygiene: hygiene,
    }
    for (const cls of Object.keys(PROSPECTING_FAILURE_CLASSES)) {
      expect(producer[cls], `${cls} has no producer named here`).toBeTruthy()
      expect(producer[cls]).toContain(`'${cls}'`)
    }
  })
})

/**
 * THE PROSPECTING PRODUCER (P-01) — Dream Create's own engine, keyed on
 * the PLATFORM org, one strike a day PER FAILURE CLASS: "the Places key
 * is wrong" and "AWS refused the phone check" are two faults with two
 * fixes, and the second must never hide behind the first.
 */
describe('reportProspectingFailure', () => {
  it('registers under the prospecting capability with a sentence per class, each in the registry’s voice', () => {
    expect(AUTOMATION_FAILURE.prospecting.capability).toBe('prospecting')
    expect(Object.keys(PROSPECTING_FAILURE_CLASSES)).toEqual(['places_auth', 'phone_validate_auth', 'nppes_down', 'crawl_blocked', 'hygiene'])
    for (const s of Object.values(PROSPECTING_FAILURE_CLASSES)) {
      expect(s.startsWith('Couldn’t'), s).toBe(true)
      expect(s).toMatch(/I’ll keep trying/)
    }
    // The owner reads WHICH permission to grant.
    expect(PROSPECTING_FAILURE_CLASSES.phone_validate_auth).toContain('mobiletargeting:PhoneNumberValidate')
  })

  it('records on the platform org, carrying the class in the detail', async () => {
    expect(await reportProspectingFailure('places_auth', new Date('2026-11-10T12:00:00Z'))).toBe(true)
    expect(recorded.calls[0]).toMatchObject({
      organizationId: 'org_platform',
      capability: 'prospecting',
      summary: PROSPECTING_FAILURE_CLASSES.places_auth,
      detail: { class: 'places_auth' },
      kind: 'engine',
    })
  })

  it('one a day per CLASS — a second class the same day still lands', async () => {
    ledger.rows = [{ detail: { failure: true, class: 'places_auth' }, summary: 'x', occurredAt: new Date() }]
    expect(await reportProspectingFailure('places_auth')).toBe(false)
    expect(await reportProspectingFailure('phone_validate_auth')).toBe(true)
    expect(recorded.calls.map((c) => (c.detail as { class: string }).class)).toEqual(['phone_validate_auth'])
  })
})
