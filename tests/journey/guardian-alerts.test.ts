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
  blind: false,
}))
const mail = vi.hoisted(() => ({ sent: [] as Array<Record<string, unknown>>, fail: false }))
const lock = vi.hoisted(() => ({ audience: 'platform' as 'platform' | 'clinic', fail: false }))
const config = vi.hoisted(() => ({ writes: [] as Array<Record<string, unknown>> }))
const ledger = vi.hoisted(() => ({
  recorded: [] as Array<Record<string, unknown>>,
  fail: false,
}))
/** Makes the MEMORY read throw. Round-13 audit: readMemory's catch — and the
 *  law it encodes — had zero executed coverage, because the db mock could
 *  not fail. Replacing that catch's body with one that muted every alarm
 *  would have left all 38 tests green. */
const memoryRead = vi.hoisted(() => ({ fail: false }))

vi.mock('@/lib/services/guardian', () => ({
  sweepEngineHealth: vi.fn(async () => ({
    reports: sweepState.reports,
    flagged: sweepState.reports.filter((r) =>
      ['silent', 'blocked', 'stalled'].includes(
        String((r.verdict as Record<string, unknown>).state),
      ),
    ),
    summary: '',
    blind: sweepState.blind,
    // The census (Phase 4 open item #5) — a mock that omits a field the
    // caller reads does not fail, it throws INTO that caller.
    census: {
      eligible: sweepState.reports.length,
      assessed: sweepState.reports.length,
      unreadable: 0,
    },
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
  writePlatformConfig: vi.fn(async (patch: Record<string, unknown>) => {
    config.writes.push(patch)
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
      if (memoryRead.fail && table !== 'user') throw new Error('statement timeout')
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
        // Round-11: the dwell clock and the first-seen instant. A mock that
        // omits a selected column does not fail — it throws into the
        // reader's own catch and reads as "no memory", which alerts about
        // every clinic every morning. (The round-8 lesson, in the harness.)
        guardianFirstSeenAt: col('guardianFirstSeenAt'),
        guardianClearSince: col('guardianClearSince'),
        // The practice's OWN memory (Phase 4 open item #3).
        guardianClinicState: col('guardianClinicState'),
        guardianClinicAlertedAt: col('guardianClinicAlertedAt'),
      },
      user: { __name: 'user', email: col('email'), platformAdmin: col('platformAdmin') },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
}))

import { runGuardianSweep } from '@/lib/services/guardian-alerts'
import { assessEngine, RE_ALERT_DAYS, STAND_DOWN_DWELL_DAYS } from '@/lib/guardian'

const NOW = new Date('2026-07-29T14:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

/** Realistic signals — `clinicActionable` reads them, so an empty object
 *  would make every 'blocked' look switch-caused by accident. */
const SIGNALS = {
  ageDays: 200,
  actions7: 10,
  actionsPrev7: 10,
  failures7: 0,
  engineFailures7: 0,
  remindersOn: true,
  reviewRequestsOn: true,
  seated30: 3,
  seatedPrev30: 12,
  openProposals: 0,
}

/**
 * THE FIXTURE CARRIES WHATEVER A REAL VERDICT CARRIES (round-12 audit).
 *
 * This used to hand-write `verdict: { state, headline, why, recommendation }`
 * — so when round 11 added `cause` and made the stored memory a problem KEY,
 * every fixture kept producing bare state words and all 38 tests passed
 * while two readers in the service still compared a key to a bare state. A
 * literal fixture is a second, silent model of the type it stands in for,
 * which is this phase's signature defect wearing test clothing.
 *
 * `cause` is therefore taken from the ONE place that decides it — the pure
 * classifier — by asking it for a verdict of the requested shape. A field
 * added to EngineVerdict tomorrow reaches these tests without anyone
 * remembering to bring it.
 */
const CAUSE_BY_STATE: Partial<Record<string, Partial<typeof SIGNALS>>> = {
  silent: { actions7: 0, actionsPrev7: 0 },
  blocked: { remindersOn: false, reviewRequestsOn: false },
  quiet: { actions7: 0 },
  healthy: {},
}

function report(
  orgId: string,
  name: string,
  state: string,
  signals: Partial<typeof SIGNALS> = {},
) {
  const merged = { ...SIGNALS, ...CAUSE_BY_STATE[state], ...signals }
  const real = assessEngine(merged)
  return {
    organizationId: orgId,
    clinicName: name,
    verdict: {
      ...real,
      // The STATE the test asked for still wins — these fixtures drive the
      // cadence, not the classifier — but everything else about the verdict
      // comes from the real thing.
      state,
      headline: `${name} headline`,
      why: 'because',
      recommendation: state === 'healthy' ? null : 'do the thing',
      cause: real.state === state ? real.cause : (CAUSE_BY_STATE[state] ? real.cause : null),
    },
    signals: merged,
    // The distinct "I tried and couldn't" sentences behind failures7 — the
    // owner's email names the actual breaks instead of guessing.
    failureCauses: [] as string[],
  }
}

/** The two shapes of 'blocked': one the clinic caused, one we did. */
const switchedOff = { remindersOn: false, reviewRequestsOn: false }
const keepsFailing = { failures7: 5, engineFailures7: 5 }

beforeEach(() => {
  vi.clearAllMocks()
  store.profiles = [
    {
      organizationId: 'org_a',
      guardianState: null,
      guardianAlertedAt: null,
      guardianFirstSeenAt: null,
      // Held long enough that a recovery is announceable unless a test says
      // otherwise — the dwell clock has its own cases below.
      guardianClearSince: daysAgo(STAND_DOWN_DWELL_DAYS + 1),
      guardianClinicState: null,
      guardianClinicAlertedAt: null,
    },
  ]
  store.admins = [{ email: 'owner@dreamcreateweb.com', platformAdmin: true }]
  sweepState.reports = []
  sweepState.blind = false
  config.writes = []
  mail.sent = []
  mail.fail = false
  lock.audience = 'platform'
  lock.fail = false
  ledger.recorded = []
  ledger.fail = false
  memoryRead.fail = false
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

  it('STANDS DOWN a recovery — the other half of an interrupt (round-9 gap)', async () => {
    // Before this, the Guardian could only ever say bad news: a practice
    // that recovered simply stopped being mentioned, and the owner who was
    // interrupted on Tuesday had to open the dashboard to learn on Thursday
    // that it was fixed — the exact dependency the outbound half removes.
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(2)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(0)
    expect(r.stoodDown).toBe(1)
    expect(r.stoodDownClinics).toEqual(['Ash Dental'])
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0].title).toContain('back to normal')
    expect(mail.sent[0].body).toContain('Nothing to do')
    // And it still records the recovery — that is what makes the NEXT break
    // read as a new problem rather than a repeat.
    expect(store.profiles[0].guardianState).toBe('healthy')
  })

  it('with the lock OPEN, a switch recovery does NOT email the owner (round-10 audit)', async () => {
    // The clinic heard that alarm, not the owner — and it closes itself,
    // because the note is re-derived from live switches and disappears the
    // moment they flip one back on. Round 9's guard asked clinicActionable
    // against TODAY's signals, which are healthy on a recovery by
    // definition, so it fired in exactly the case it was meant to exclude.
    lock.audience = 'clinic'
    // The PRACTICE was told, so only the practice's memory holds it — which
    // is now a lookup rather than an inference from today's signals.
    store.profiles[0].guardianClinicState = 'blocked:switches'
    store.profiles[0].guardianClinicAlertedAt = daysAgo(2)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.stoodDown).toBe(0)
    expect(mail.sent).toHaveLength(0)
  })

  it('with the lock OPEN, a SILENT recovery still emails the owner', async () => {
    // Silence never reaches a practice at any setting, so that alarm was
    // always the owner's — and so is its all-clear.
    lock.audience = 'clinic'
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(2)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.stoodDown).toBe(1)
    expect(mail.sent).toHaveLength(1)
  })

  it('a recovery that has not HELD yet says nothing (round-11 audit)', async () => {
    // Without the dwell clock, a practice sitting on the stall threshold
    // alerts one morning and stands down the next, forever — the exact
    // crying-wolf failure the stand-down was added inside of.
    store.profiles[0].guardianState = 'stalled'
    store.profiles[0].guardianAlertedAt = daysAgo(1)
    store.profiles[0].guardianClearSince = null
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.stoodDown).toBe(0)
    expect(mail.sent).toHaveLength(0)
    // The clock STARTS, so two quiet days from now it can be announced…
    expect(store.profiles[0].guardianClearSince).toEqual(NOW)
    // …and the problem is NOT stamped over, so a re-break tomorrow is still
    // "the same problem" and stays quiet too. One clock, both halves.
    expect(store.profiles[0].guardianState).toBe('stalled')
  })

  it('records WHEN a problem was first seen, and keeps it across a re-alert', async () => {
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]
    await runGuardianSweep(NOW)
    expect(store.profiles[0].guardianFirstSeenAt).toEqual(NOW)

    // The same problem a week later re-alerts, and its AGE is preserved.
    const later = new Date(NOW.getTime() + RE_ALERT_DAYS * 24 * 60 * 60 * 1000)
    await runGuardianSweep(later)
    expect(store.profiles[0].guardianFirstSeenAt).toEqual(NOW)
  })

  it('the alert says how long it has ACTUALLY been wrong, not just when I last said so', async () => {
    // `guardianAlertedAt` is overwritten on every delivery and the cadence
    // re-alerts weekly, so "I last flagged this N days ago" is pinned at or
    // under RE_ALERT_DAYS by construction: a six-week break read as a
    // seven-day one, and the owner could not tell a churn conversation from
    // a shrug.
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(RE_ALERT_DAYS)
    store.profiles[0].guardianFirstSeenAt = daysAgo(41)
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]

    await runGuardianSweep(NOW)
    const body = String(mail.sent[0].body)
    expect(body).toContain('I last flagged this 7 days ago')
    expect(body).toContain('This practice has needed attention for 41 days straight.')
  })

  it('a re-alert about a BLOCKED practice says "Still" — the key is compared to a key (round-12 audit)', async () => {
    // Round 11 made the memory a problem key and left the email comparing
    // it to the bare state word, so for `blocked` — the one state that
    // always carries a cause — the continuity block never rendered: no
    // "Still:", no "I last flagged this", and round 11's own chronicity
    // sentence (nested inside it) was dead for the exact state it was
    // written for.
    store.profiles[0].guardianState = 'blocked:switches'
    store.profiles[0].guardianAlertedAt = daysAgo(RE_ALERT_DAYS)
    store.profiles[0].guardianFirstSeenAt = daysAgo(44)
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', switchedOff)]

    await runGuardianSweep(NOW)
    expect(String(mail.sent[0].title)).toContain('Still: ')
    const body = String(mail.sent[0].body)
    expect(body).toContain('I last flagged this 7 days ago')
    expect(body).toContain('needed attention for 44 days straight')
  })

  it('chronicity starts when the trouble starts and survives an UNDELIVERED pass', async () => {
    // The clock is keyed to the trouble, never to what was said about it
    // (round-12 audit): keyed to the last REPORTED problem, it reset to
    // today on every pass where the key could not be stamped — a mail
    // outage, or the lock open on a clinic that can never stand down to the
    // owner — so a week-old break read as one day.
    mail.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]
    await runGuardianSweep(NOW)
    expect(store.profiles[0].guardianFirstSeenAt).toEqual(NOW)

    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000)
    await runGuardianSweep(tomorrow)
    expect(store.profiles[0].guardianFirstSeenAt).toEqual(NOW)
  })

  it('chronicity CLEARS when the quiet has really held, even with no all-clear sent', async () => {
    // The mirror failure: clearing only on a delivered stand-down meant a
    // practice that recovered without one (every non-silent problem while
    // the lock is open) kept its instant forever, and a relapse months
    // later rendered "· 100 days now" for a problem that started yesterday.
    lock.audience = 'clinic'
    store.profiles[0].guardianClinicState = 'stalled'
    store.profiles[0].guardianFirstSeenAt = daysAgo(100)
    store.profiles[0].guardianClearSince = daysAgo(STAND_DOWN_DWELL_DAYS + 1)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.stoodDown).toBe(0) // that finding was the clinic's, not the owner's
    expect(store.profiles[0].guardianFirstSeenAt).toBeNull()
  })

  it('an UNREADABLE memory still alerts, and remembers NOTHING (round-13 audit)', async () => {
    // Both halves matter. The alarm must sound — going blind is the failure
    // this whole primitive exists to remove — but the clocks are derived
    // with `?? now`, so treating an empty read as fact would restart a
    // six-week break's age at today and reset the dwell window on one
    // transient SELECT failure. The comment on those clocks claims they
    // cannot be corrupted because "both facts are observations"; that is
    // true of an undelivered report and was false of an unreadable memory.
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(2)
    store.profiles[0].guardianFirstSeenAt = daysAgo(44)
    memoryRead.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]

    const r = await runGuardianSweep(NOW)
    expect(mail.sent).toHaveLength(1)
    expect(r.errors.some((e) => /unreadable/i.test(e.error))).toBe(true)
    // Untouched: the age, the cadence stamp, the state.
    expect(store.profiles[0].guardianFirstSeenAt).toEqual(daysAgo(44))
    expect(store.profiles[0].guardianAlertedAt).toEqual(daysAgo(2))
    expect(store.profiles[0].guardianState).toBe('silent')
  })

  it('a FAILED all-clear keeps the AGE too, so the retry is not the quieter report', async () => {
    // Clearing the clock on the pass where the email failed stripped "It
    // needed attention for 41 days" from the all-clear the owner actually
    // receives the next morning — the most decision-relevant fact in it.
    mail.fail = true
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(3)
    store.profiles[0].guardianFirstSeenAt = daysAgo(41)
    store.profiles[0].guardianClearSince = daysAgo(STAND_DOWN_DWELL_DAYS + 1)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    await runGuardianSweep(NOW)
    expect(store.profiles[0].guardianFirstSeenAt).toEqual(daysAgo(41))

    mail.fail = false
    await runGuardianSweep(NOW)
    expect(String(mail.sent[0].body)).toContain('It needed attention for 41 days.')
    // …and only NOW does the clock clear.
    expect(store.profiles[0].guardianFirstSeenAt).toBeNull()
  })

  it('THE PRACTICE hears its own all-clear (Phase 4 open item #4)', async () => {
    // The clinic half could only ever say bad news — the owner's half got a
    // stand-down in round 9 and the practice's did not, so a clinic that did
    // the thing it was asked to do simply stopped hearing. That teaches them
    // the machine only complains and never notices.
    lock.audience = 'clinic'
    store.profiles[0].guardianClinicState = 'blocked:switches'
    store.profiles[0].guardianClinicAlertedAt = daysAgo(3)
    store.profiles[0].guardianClearSince = daysAgo(STAND_DOWN_DWELL_DAYS + 1)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(1)
    const note = String(ledger.recorded[0].summary)
    expect(note).toContain('back on')
    // A receipt, not a report: nothing to do, no number, no next step.
    expect(note).toContain('Nothing for you to do')
    expect(note).not.toMatch(/\d/)
    // And it is not WORK — an all-clear is not a job done.
    expect((ledger.recorded[0].detail as Record<string, unknown>).report).toBe(true)
    // Their memory clears, so a relapse reads as news to them too.
    expect(store.profiles[0].guardianClinicState).toBeNull()
  })

  it('a FAILED all-clear to the practice keeps their memory, so tomorrow retries', async () => {
    lock.audience = 'clinic'
    ledger.fail = true
    store.profiles[0].guardianClinicState = 'stalled'
    store.profiles[0].guardianClinicAlertedAt = daysAgo(3)
    store.profiles[0].guardianClearSince = daysAgo(STAND_DOWN_DWELL_DAYS + 1)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(0)
    expect(r.errors.some((e) => /all-clear/i.test(e.error))).toBe(true)
    expect(store.profiles[0].guardianClinicState).toBe('stalled')
  })

  it('a practice never told about it hears no all-clear — that would be noise', async () => {
    lock.audience = 'clinic'
    store.profiles[0].guardianClinicState = null
    store.profiles[0].guardianClearSince = daysAgo(STAND_DOWN_DWELL_DAYS + 1)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(0)
    expect(ledger.recorded).toHaveLength(0)
  })

  it('never stands down a problem nobody was ever told about', async () => {
    // No memory = nothing was raised. An all-clear for an alarm that never
    // sounded is noise, and noise is how a guardian gets muted.
    store.profiles[0].guardianState = null
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.stoodDown).toBe(0)
    expect(mail.sent).toHaveLength(0)
  })

  it('a FAILED all-clear keeps the old state, so tomorrow tries again', async () => {
    // Same law as a failed alert: only a delivery that landed may move the
    // memory. Otherwise a bounced all-clear silently clears the state and
    // the owner never learns the practice recovered.
    mail.fail = true
    store.profiles[0].guardianState = 'blocked'
    store.profiles[0].guardianAlertedAt = daysAgo(2)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    const r = await runGuardianSweep(NOW)
    expect(r.stoodDown).toBe(0)
    expect(r.undelivered).toBe(1)
    expect(store.profiles[0].guardianState).toBe('blocked')
  })

  it('a BLIND sweep decides nothing and stamps nothing (round-9 audit)', async () => {
    // With no readable ledger every clinic is unassessed. Writing today's
    // verdict from a sweep that could not see would corrupt the very memory
    // the whole cadence reads — and `{ok:true, scanned:0}` would report the
    // blind day as a clean one.
    sweepState.blind = true
    sweepState.reports = []
    store.profiles[0].guardianState = 'blocked'

    const r = await runGuardianSweep(NOW)
    expect(r.blind).toBe(true)
    expect(mail.sent).toHaveLength(0)
    expect(store.profiles[0].guardianState).toBe('blocked')
    // It still leaves a heartbeat: a blind run HAPPENED, and that is
    // precisely the thing the panel could otherwise never show.
    expect(config.writes).toHaveLength(1)
    expect((config.writes[0].guardian as Record<string, unknown>).blind).toBe(true)
  })

  it('the heartbeat carries WHY the run struggled, deduplicated (round-14 gap)', async () => {
    // The reasons were written in seven places and handed to EventBridge,
    // which discards them — the same channel the heartbeat exists to escape.
    // One broken provider produces one error per clinic, so a heartbeat
    // that listed them all would be a log.
    mail.fail = true
    sweepState.reports = [
      report('org_a', 'Ash Dental', 'silent'),
      report('org_b', 'Birch Dental', 'silent'),
    ]
    store.profiles.push({
      organizationId: 'org_b',
      guardianState: null,
      guardianAlertedAt: null,
      guardianFirstSeenAt: null,
      guardianClearSince: daysAgo(STAND_DOWN_DWELL_DAYS + 1),
    })

    await runGuardianSweep(NOW)
    const beat = config.writes.at(-1)!.guardian as Record<string, unknown>
    expect((beat.problems as string[])[0]).toContain('email')
    expect((beat.problems as string[])[0]).toContain('2 practices')
  })

  it('COUNTS a half-provisioned practice instead of dropping it into a channel with no reader', async () => {
    // It is skipped by the alerting half forever while the panel renders it
    // as a flagged `silent` row telling the owner to audit its integrations
    // — the worst-shaped practice on the platform, visible in nothing.
    store.profiles = []
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]

    const r = await runGuardianSweep(NOW)
    expect(r.skipped).toBe(1)
    expect(mail.sent).toHaveLength(0)
    expect((config.writes.at(-1)!.guardian as Record<string, unknown>).skipped).toBe(1)
  })

  it('records its own heartbeat every run — a dead cron must not look healthy', async () => {
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]
    await runGuardianSweep(NOW)
    const beat = config.writes.at(-1)?.guardian as Record<string, unknown>
    expect(beat.ranAt).toBe(NOW.toISOString())
    expect(beat.scanned).toBe(1)
    expect(beat.flagged).toBe(1)
    // Own key, passed whole — the shallow merge means anything else in the
    // patch would clobber a sibling subsystem's key.
    expect(Object.keys(config.writes.at(-1) as object)).toEqual(['guardian'])
  })

  it('counts UNDELIVERED reports so a run that could not deliver is visible', async () => {
    mail.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]
    const r = await runGuardianSweep(NOW)
    expect(r.undelivered).toBe(1)
    expect((config.writes.at(-1)?.guardian as Record<string, unknown>).undelivered).toBe(1)
  })

  it('the alert links to the PRACTICE, not to the page the owner is reading', async () => {
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]
    await runGuardianSweep(NOW)
    expect(mail.sent[0].linkPath).toBe('/ecommerce/customers/org_a')
  })

  it('a FAILED send never moves the stamp — a mail outage must not buy a week of silence', async () => {
    mail.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked')]

    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(0)
    expect(r.errors.length).toBeGreaterThan(0)
    // NEITHER half of the memory moves (verification round 2). Recording
    // the state while the report never landed lets shouldAlert read it as
    // "same problem" tomorrow and go quiet for a week on something nobody
    // was ever told about.
    expect(store.profiles[0].guardianState).toBeNull()
    expect(store.profiles[0].guardianAlertedAt).toBeNull()
  })

  it('with no platform admins it records state and reports the gap rather than pretending it alerted', async () => {
    store.admins = []
    sweepState.reports = [report('org_a', 'Ash Dental', 'silent')]

    const r = await runGuardianSweep(NOW)
    expect(r.alerted).toBe(0)
    expect(mail.sent).toHaveLength(0)
    // Undelivered, so nothing is remembered — tomorrow it is still news.
    expect(store.profiles[0].guardianState).toBeNull()
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

  it('the PRACTICE’s own cadence governs its notes — it is not told the same thing daily', async () => {
    // Phase 4 open item #3: each audience keeps its own stamp now, so this
    // reads the CLINIC's memory rather than the shared one.
    lock.audience = 'clinic'
    store.profiles[0].guardianClinicState = 'stalled'
    store.profiles[0].guardianClinicAlertedAt = daysAgo(1)
    sweepState.reports = [report('org_a', 'Ash Dental', 'stalled')]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(0)
    expect(ledger.recorded).toHaveLength(0)
  })

  it('the two cadences are INDEPENDENT — telling the practice never silences the owner', async () => {
    // One shared stamp meant a note to the practice also moved the owner's
    // clock, so `ownerWasTold` would later owe them an all-clear for an
    // alarm they never received. That misattribution is what the split
    // ends (Phase 4 open item #3).
    lock.audience = 'clinic'
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', switchedOff)]

    await runGuardianSweep(NOW)
    // The practice heard it, and only the practice's memory moved.
    expect(store.profiles[0].guardianClinicState).toBe('blocked:switches')
    expect(store.profiles[0].guardianAlertedAt).toBeNull()
    expect(store.profiles[0].guardianState).toBeNull()
  })

  it('a FAILED ledger write never moves the stamp either — the note is retried tomorrow', async () => {
    lock.audience = 'clinic'
    ledger.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'stalled')]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(0)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(store.profiles[0].guardianState).toBeNull()
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
    // "LAST flagged", because guardianAlertedAt is overwritten on every
    // delivery — claiming "first" understated a six-week break as one week.
    expect(String(mail.sent[0].body)).toMatch(/last flagged this 7 days ago/i)
  })
})

/**
 * VERIFICATION ROUND. Round 3's "say it once to the practice" rule was
 * gated on a stamp written regardless of delivery, which opened a hole where
 * NEITHER audience heard a finding. Both audiences share the one cadence
 * until a per-audience memory exists.
 */
describe('the cadence is shared, so no finding falls into a hole', () => {
  it('a clinic-routed finding still reaches them after the re-alert window', async () => {
    lock.audience = 'clinic'
    store.profiles[0].guardianState = 'blocked'
    store.profiles[0].guardianAlertedAt = daysAgo(RE_ALERT_DAYS)
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', switchedOff)]

    const r = await runGuardianSweep(NOW)
    expect(r.notified).toBe(1)
  })

  it('opening the lock does not silence a practice whose state was already stamped', async () => {
    // The hole: state stamped from earlier platform-audience runs, so
    // nothing reads as "new" — and the clinic branch also short-circuits
    // the owner email, so nobody was told at all.
    lock.audience = 'clinic'
    store.profiles[0].guardianState = 'blocked'
    store.profiles[0].guardianAlertedAt = daysAgo(RE_ALERT_DAYS + 3)
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', switchedOff)]

    const r = await runGuardianSweep(NOW)
    expect(r.notified + r.alerted).toBeGreaterThan(0)
  })

  it('a failed ledger write is retried rather than stamped away', async () => {
    lock.audience = 'clinic'
    ledger.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'stalled')]

    await runGuardianSweep(NOW)
    // The delivery stamp must not move, so tomorrow tries again.
    expect(store.profiles[0].guardianAlertedAt).toBeNull()
  })
})

/**
 * VERIFICATION ROUND 2. The memory is what makes tomorrow's run able to tell
 * "the same problem" from "a new one", so recording something that was never
 * said is how a report goes missing for a week.
 */
describe('the memory records only what was actually said', () => {
  it('a CHANGED problem that failed to send is still news tomorrow', async () => {
    // The hole: state stamped to 'blocked', a recent alertedAt left over
    // from the PREVIOUS problem, so shouldAlert saw "same state, alerted 2
    // days ago" and went quiet for the rest of the week.
    store.profiles[0].guardianState = 'stalled'
    store.profiles[0].guardianAlertedAt = daysAgo(2)
    mail.fail = true
    sweepState.reports = [report('org_a', 'Ash Dental', 'blocked', switchedOff)]

    await runGuardianSweep(NOW)
    expect(store.profiles[0].guardianState).toBe('stalled')

    // Mail comes back: the new problem is still unreported, so it goes out.
    mail.fail = false
    const r2 = await runGuardianSweep(NOW)
    expect(r2.alerted).toBe(1)
    // The PROBLEM KEY, not the bare state — `blocked` is two problems and
    // the memory has to be able to tell them apart (round 11).
    expect(store.profiles[0].guardianState).toBe('blocked:switches')
  })

  it('a RECOVERY is still recorded even though it sends nothing', async () => {
    store.profiles[0].guardianState = 'silent'
    store.profiles[0].guardianAlertedAt = daysAgo(2)
    sweepState.reports = [report('org_a', 'Ash Dental', 'healthy')]

    await runGuardianSweep(NOW)
    // Nothing to deliver, so remembering it is honest — and it is what
    // makes the next break a NEW problem rather than a repeat.
    expect(store.profiles[0].guardianState).toBe('healthy')
  })
})

describe('the owner reads the owner’s language', () => {
  it('never replays a sentence written for the clinic', async () => {
    const rep = report('org_a', 'Ash Dental', 'blocked', keepsFailing)
    rep.failureCauses = ['Publish social & Google posts — 3 attempts']
    sweepState.reports = [rep]

    await runGuardianSweep(NOW)
    const body = String(mail.sent[0].body)
    expect(body).toContain('Publish social & Google posts')
    // The clinic-addressed second person must never reach this inbox.
    expect(body).not.toMatch(/you.d handed|back with you|bring you/i)
  })
})
