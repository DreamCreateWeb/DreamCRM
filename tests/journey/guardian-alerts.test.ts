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
const lock = vi.hoisted(() => ({ audience: 'platform' as 'platform' | 'clinic', fail: false }))
const ledger = vi.hoisted(() => ({
  recorded: [] as Array<Record<string, unknown>>,
  fail: false,
}))

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
vi.mock('@/lib/services/platform-config', () => ({
  getGuardianAudience: vi.fn(async () => {
    if (lock.fail) throw new Error('config unreadable')
    return lock.audience
  }),
}))
vi.mock('@/lib/services/action-ledger', () => ({
  // Mirrors the real contract: recordAction never throws, it returns false.
  recordAction: vi.fn(async (input: Record<string, unknown>) => {
    if (ledger.fail) return false
    ledger.recorded.push(input)
    return true
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
import { RE_ALERT_DAYS } from '@/lib/guardian'

const NOW = new Date('2026-07-29T14:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

/** Realistic signals — `clinicActionable` reads them, so an empty object
 *  would make every 'blocked' look switch-caused by accident. */
const SIGNALS = {
  ageDays: 200,
  actions7: 10,
  actionsPrev7: 10,
  failures7: 0,
  remindersOn: true,
  reviewRequestsOn: true,
  seated30: 3,
  seatedPrev30: 12,
  openProposals: 0,
}

function report(
  orgId: string,
  name: string,
  state: string,
  signals: Partial<typeof SIGNALS> = {},
) {
  return {
    organizationId: orgId,
    clinicName: name,
    verdict: {
      state,
      headline: `${name} headline`,
      why: 'because',
      recommendation: state === 'healthy' ? null : 'do the thing',
    },
    signals: { ...SIGNALS, ...signals },
    // The distinct "I tried and couldn't" sentences behind failures7 — the
    // owner's email names the actual breaks instead of guessing.
    failureCauses: [] as string[],
  }
}

/** The two shapes of 'blocked': one the clinic caused, one we did. */
const switchedOff = { remindersOn: false, reviewRequestsOn: false }
const keepsFailing = { failures7: 5 }

beforeEach(() => {
  vi.clearAllMocks()
  store.profiles = [{ organizationId: 'org_a', guardianState: null, guardianAlertedAt: null }]
  store.admins = [{ email: 'owner@dreamcreateweb.com', platformAdmin: true }]
  sweepState.reports = []
  mail.sent = []
  mail.fail = false
  lock.audience = 'platform'
  lock.fail = false
  ledger.recorded = []
  ledger.fail = false
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

/**
 * THE AUDIENCE LOCK. It ships closed, and the failure this suite exists to
 * prevent is the machine starting to talk to customers because something
 * was undefined, mistyped, or unreachable.
 */
describe('runGuardianSweep — who hears it', () => {
  it('LOCKED by default: a clinic-fixable problem still goes only to the owner', async () => {
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', switchedOff)]

    const r = await runGuardianSweep(NOW)
    expect(r.audience).toBe('platform')
    expect(r.alerted).toBe(1)
    expect(r.notified).toBe(0)
    expect(ledger.recorded).toHaveLength(0)
  })

  it('an unreadable lock stays CLOSED — the safe side is silence toward customers', async () => {
    lock.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', switchedOff)]

    const r = await runGuardianSweep(NOW)
    expect(r.audience).toBe('platform')
    expect(ledger.recorded).toHaveLength(0)
    expect(mail.sent).toHaveLength(1)
  })

  it('unlocked: a switched-off engine is told to the PRACTICE, and the owner is not emailed', async () => {
    lock.audience = 'clinic'
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', switchedOff)]

    const r = await runGuardianSweep(NOW)
    expect(r.audience).toBe('clinic')
    expect(r.notified).toBe(1)
    expect(r.notifiedClinics).toEqual(['Ash Dental'])
    expect(r.alerted).toBe(0)
    expect(mail.sent).toHaveLength(0)

    const entry = ledger.recorded[0]
    expect(entry.organizationId).toBe('org_a')
    expect(entry.capability).toBe('guardian_note')
    // Second person, and it names the lever rather than the diagnosis.
    expect(String(entry.summary)).toMatch(/switched off/i)
    expect(String(entry.summary)).not.toContain('!')
    // The practice must never read the platform's word for itself.
    expect(String(entry.summary)).not.toMatch(/\bthey\b|\bpractice\b/i)
  })

  it('unlocked: SILENCE is still ours — a dead machine never becomes the clinic’s problem', async () => {
    lock.audience = 'clinic'
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent', { actions7: 0, actionsPrev7: 0 })]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(0)
    expect(ledger.recorded).toHaveLength(0)
    // It did not vanish — it went to the people who can fix it.
    expect(r.alerted).toBe(1)
    expect(mail.sent).toHaveLength(1)
  })

  it('unlocked: repeated FAILURES are ours too — a stale token is not something a front desk can fix', async () => {
    lock.audience = 'clinic'
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', keepsFailing)]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(0)
    expect(ledger.recorded).toHaveLength(0)
    expect(r.alerted).toBe(1)
  })

  it('unlocked: a STALL is the clinic’s to hear, in their own numbers', async () => {
    lock.audience = 'clinic'
    sweepState.reports = [report('org_a', 'Ash Dental', 'stalled')]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(1)
    const summary = String(ledger.recorded[0].summary)
    expect(summary).toContain('3')
    expect(summary).toContain('12')
    // Never a number without a next step, and never a percentage thrown at
    // somebody about their own business.
    expect(summary).not.toContain('%')
    expect(summary).toMatch(/worth a look/i)
  })

  it('a mix routes each finding to whoever can act on it, in one run', async () => {
    lock.audience = 'clinic'
    store.profiles = [
      { organizationId: 'org_a', guardianState: null, guardianAlertedAt: null },
      { organizationId: 'org_b', guardianState: null, guardianAlertedAt: null },
    ]
    sweepState.reports = [
      report('org_a', 'Ash Dental', 'silent', { actions7: 0, actionsPrev7: 0 }),
      report('org_b', 'Birch Dental', 'blocked', switchedOff),
    ]

    const r = await runGuardianSweep(NOW)
    expect(r.alertedClinics).toEqual(['Ash Dental'])
    expect(r.notifiedClinics).toEqual(['Birch Dental'])
  })

  it('the same cadence governs both halves — a clinic is not told the same thing daily', async () => {
    lock.audience = 'clinic'
    store.profiles[0].guardianState = 'stalled'
    store.profiles[0].guardianAlertedAt = daysAgo(1)
    sweepState.reports = [report('org_a', 'Ash Dental', 'stalled')]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(0)
    expect(ledger.recorded).toHaveLength(0)
  })

  it('a FAILED ledger write never moves the stamp either — the note is retried tomorrow', async () => {
    lock.audience = 'clinic'
    ledger.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'stalled')]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(0)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(store.profiles[0].guardianState).toBe('stalled')
    expect(store.profiles[0].guardianAlertedAt).toBeNull()
  })

  it('a clinic-bound note is never ALSO emailed to the owner — one problem, one report', async () => {
    lock.audience = 'clinic'
    sweepState.reports = [report('org_a', 'Ash Dental', 'stalled')]

    await runGuardianSweep(NOW)
    expect(ledger.recorded).toHaveLength(1)
    expect(mail.sent).toHaveLength(0)
  })
})

/**
 * ROUND-2 AUDIT. The memory write is a bare UPDATE, so an org with no
 * clinic_profile row can never persist state — and `shouldAlert` reads an
 * unchanged null as news, so that clinic would be emailed about EVERY
 * morning forever. Reachable in production: provisioning inserts the org,
 * then makes a Stripe call that can throw, and only then inserts the profile.
 */
describe('runGuardianSweep — a half-provisioned clinic', () => {
  it('is reported to us, not emailed about daily forever', async () => {
    store.profiles = [] // org exists, profile never got written
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]

    const r = await runGuardianSweep(NOW)
    expect(mail.sent).toHaveLength(0)
    expect(r.alerted).toBe(0)
    expect(r.errors.some((e) => /half-provisioned/i.test(e.error))).toBe(true)
  })

  it('a clinic WITH a profile is unaffected', async () => {
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]
    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(1)
  })
})

describe('the owner’s email names the actual break', () => {
  it('lists the ledger sentences behind a blocked verdict instead of guessing', async () => {
    const rep = report('org_a', 'Ash Dental', 'blocked', keepsFailing)
    rep.failureCauses = ['Couldn’t draft a reply to a new review just now — I’ll keep trying.']
    sweepState.reports = [rep]

    await runGuardianSweep(NOW)
    expect(String(mail.sent[0].body)).toContain('What it tried')
    expect(String(mail.sent[0].body)).toContain('draft a reply to a new review')
  })

  it('a CONTINUING problem reads differently from this morning’s news', async () => {
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(RE_ALERT_DAYS)
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]

    await runGuardianSweep(NOW)
    expect(String(mail.sent[0].title)).toMatch(/^Still: /)
    expect(String(mail.sent[0].body)).toMatch(/first told you about this 7 days ago/i)
  })
})
