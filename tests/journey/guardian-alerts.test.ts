import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE GUARDIAN's daily run (Transformation Phase 4). Pins the two things
 * that decide whether a guardian keeps working: it must not email the same
 * problem every morning (that is how it gets muted), and it must not let a
 * failed send buy a problem a week of silence.
 */

const store: {
  profiles: Array<Record<string, unknown>>
  admins: Array<Record<string, unknown>>
} = { profiles: [], admins: [] }

const sweepState = vi.hoisted(() => ({
  reports: [] as Array<Record<string, unknown>>,
}))
const mail = vi.hoisted(() => ({ sent: [] as Array<Record<string, unknown>>, fail: false }))

vi.mock('@/lib/services/guardian', () => ({
  sweepEngineHealth: vi.fn(async () => ({
    reports: sweepState.reports,
    flagged: sweepState.reports.filter((r) =>
      ['silent', 'blocked', 'stalled'].includes(
        String((r.verdict as Record<string, unknown>).state),
      ),
    ),
    summary: '',
  })),
}))
vi.mock('@/lib/email', () => ({
  sendNotificationEmail: vi.fn(async (input: Record<string, unknown>) => {
    if (mail.fail) throw new Error('smtp down')
    mail.sent.push(input)
  }),
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  function select(cols?: Record<string, unknown>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    const rows = () =>
      (table === 'user' ? store.admins : store.profiles).filter((r) => filters.every((f) => f(r)))
    api.limit = async () => {
      const out = rows()
      // Real drizzle maps the ALIAS to the underlying COLUMN's value; a mock
      // that reads r[alias] silently returns undefined for every renamed
      // select, which reads as "no memory" and hides a re-alert bug.
      return cols
        ? out.map((r) =>
            Object.fromEntries(
              Object.entries(cols).map(([alias, c]) => [alias, r[(c as { __col: string }).__col]]),
            ),
          )
        : out
    }
    return api
  }
  function update() {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    let patch: Record<string, unknown> = {}
    const api: Record<string, unknown> = {}
    api.set = (p: Record<string, unknown>) => { patch = p; return api }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      for (const r of store.profiles) if (filters.every((f) => f(r))) Object.assign(r, patch)
      resolve(undefined)
    }
    return api
  }
  return {
    db: { select, update },
    schema: {
      clinicProfile: {
        __name: 'clinic_profile',
        organizationId: col('organizationId'),
        guardianState: col('guardianState'),
        guardianAlertedAt: col('guardianAlertedAt'),
      },
      user: { __name: 'user', email: col('email'), platformAdmin: col('platformAdmin') },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
}))

import { runGuardianSweep } from '@/lib/services/guardian-alerts'

const NOW = new Date('2026-07-29T14:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

function report(orgId: string, name: string, state: string) {
  return {
    organizationId: orgId,
    clinicName: name,
    verdict: {
      state,
      headline: `${name} headline`,
      why: 'because',
      recommendation: state === 'healthy' ? null : 'do the thing',
    },
    signals: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.profiles = [{ organizationId: 'org_a', guardianState: null, guardianAlertedAt: null }]
  store.admins = [{ email: 'owner@dreamcreateweb.com', platformAdmin: true }]
  sweepState.reports = []
  mail.sent = []
  mail.fail = false
})

describe('runGuardianSweep', () => {
  it('emails the owner about a NEW problem and remembers it', async () => {
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]
    const r = await runGuardianSweep(NOW)

    expect(r.alerted).toBe(1)
    expect(r.alertedClinics).toEqual(['Ash Dental'])
    expect(mail.sent).toHaveLength(1)
    expect(String(mail.sent[0].title)).toContain('Ash Dental')
    // The email always says what to do — a guardian that only reports
    // problems makes work rather than removing it.
    expect(String(mail.sent[0].body)).toContain("What I'd do")
    expect(store.profiles[0].guardianState).toBe('silent')
    expect(store.profiles[0].guardianAlertedAt).toEqual(NOW)
  })

  it('does not email the same problem again the next morning', async () => {
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(1)
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]

    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(0)
    expect(mail.sent).toHaveLength(0)
    // The stamp must NOT move on a silent pass, or the weekly cadence would
    // reset every day and the re-alert would never fire.
    expect(store.profiles[0].guardianAlertedAt).toEqual(daysAgo(1))
  })

  it('records a RECOVERY even though it sends nothing — that is what makes the next break a new problem', async () => {
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(2)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(0)
    expect(mail.sent).toHaveLength(0)
    expect(store.profiles[0].guardianState).toBe('healthy')
  })

  it('a FAILED send never moves the stamp — a mail outage must not buy a week of silence', async () => {
    mail.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked')]

    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(0)
    expect(r.errors.length).toBeGreaterThan(0)
    // The state IS recorded (it is true), but the alert will be retried.
    expect(store.profiles[0].guardianState).toBe('blocked')
    expect(store.profiles[0].guardianAlertedAt).toBeNull()
  })

  it('with no platform admins it records state and reports the gap rather than pretending it alerted', async () => {
    store.admins = []
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]

    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(0)
    expect(mail.sent).toHaveLength(0)
    expect(store.profiles[0].guardianState).toBe('silent')
    expect(store.profiles[0].guardianAlertedAt).toBeNull()
  })

  it('one clinic failing never stops the others being watched', async () => {
    store.profiles = [
      { organizationId: 'org_a', guardianState: null, guardianAlertedAt: null },
      { organizationId: 'org_b', guardianState: null, guardianAlertedAt: null },
    ]
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent'), report('org_b', 'Birch Dental', 'blocked')]

    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(2)
    expect(r.alertedClinics).toEqual(['Ash Dental', 'Birch Dental'])
  })

  it('healthy clinics are counted as scanned but never emailed about', async () => {
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]
    const r = await runGuardianSweep(NOW)
    expect(r.scanned).toBe(1)
    expect(r.flagged).toBe(0)
    expect(mail.sent).toHaveLength(0)
  })
})
