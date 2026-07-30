import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The weekly standup (Transformation Phase 2 — the Narrator). Pins:
 *  - the window is the PRIOR clinic-local week (SUNDAY-based, per
 *    clinicWeekStart), [weekStart-7d, weekStart), passed to the ledger
 *    readers as since/until AND to the journey spine's countSeatedBetween —
 *    the standup never re-derives the seated law (round-1 audit);
 *  - counts become plural-noun lines, stories prefer person+outcome
 *    capabilities and never repeat a capability;
 *  - a quiet week is NARRATED from automation-config cross-checks
 *    (quietNote), never blanked — a healthy idle clinic and a switched-off
 *    engine must read differently (round-1 audit, the AUDITS.md mandate);
 *  - the email: Monday-only per clinic tz, once per week via an ATOMIC
 *    conditional claim before send, sent to ALL staff roles minus the
 *    per-staff opt-out (NO org digest gate — round 2 removed it; the
 *    default-0 column made the email dead on arrival), demo + quiet +
 *    pre-account weeks skipped;
 *  - the voice: no exclamation marks anywhere in the email body.
 */

const ledger = vi.hoisted(() => ({
  counts: {} as Record<string, number>,
  entries: [] as Array<Record<string, unknown>>,
  failures: 0,
  countCalls: [] as unknown[][],
  listCalls: [] as unknown[][],
  failureCalls: [] as unknown[][],
}))
vi.mock('@/lib/services/action-ledger', async () => {
  // THE REAL predicate, from its one home — the standup's story filter is
  // under test, not a stub of it (round-1 Phase-3 audit: settings changes
  // are not stories). Round 9: this used to be a hand-copy that had already
  // drifted (it knew 'autonomyChange'/'autoFailure' but not 'failure' or
  // 'report'), i.e. a fourth transcription of the very law this phase
  // consolidated, living in the test that was supposed to police it.
  const { isWorkDetail } = await import('@/lib/ledger-markers')
  return {
    isWorkEntry: isWorkDetail,
    countActionsSince: vi.fn(async (...a: unknown[]) => {
      ledger.countCalls.push(a)
      return ledger.counts
    }),
    countFailuresSince: vi.fn(async (...a: unknown[]) => {
      ledger.failureCalls.push(a)
      return ledger.failures
    }),
    listRecentActions: vi.fn(async (...a: unknown[]) => {
      ledger.listCalls.push(a)
      return ledger.entries
    }),
  }
})

const deps = vi.hoisted(() => ({ openProposals: 0, followupsDue: 0, seated: 0, seatedCalls: [] as unknown[][] }))
vi.mock('@/lib/services/proposals', () => ({
  countOpenProposals: vi.fn(async () => deps.openProposals),
}))
vi.mock('@/lib/services/patient-followups', () => ({
  countFollowupsDue: vi.fn(async () => deps.followupsDue),
}))
// THE seated law lives in the journey spine — the standup only asks it.
vi.mock('@/lib/services/patient-journey', () => ({
  countSeatedBetween: vi.fn(async (...a: unknown[]) => {
    deps.seatedCalls.push(a)
    return deps.seated
  }),
}))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))
const pref = vi.hoisted(() => ({ optedOut: new Set<string>() }))
vi.mock('@/lib/services/staff-notification-pref', () => ({
  getDigestOptOutUserIds: vi.fn(async () => pref.optedOut),
}))

const { sendNotificationEmailMock } = vi.hoisted(() => ({
  sendNotificationEmailMock: vi.fn(async (..._a: unknown[]) => undefined),
}))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: sendNotificationEmailMock }))

const store: {
  reviews: Array<Record<string, unknown>>
  clinics: Array<Record<string, unknown>>
  staff: Array<Record<string, unknown>>
  profiles: Array<Record<string, unknown>>
  reviewConfigs: Array<Record<string, unknown>>
  orgs: Array<Record<string, unknown>>
} = { reviews: [], clinics: [], staff: [], profiles: [], reviewConfigs: [], orgs: [] }

vi.mock('@/lib/db', () => {
  // clinic_profile serves TWO reads: the standup-send scan (joined shape,
  // store.clinics) and readEngineSwitches' reminderSettings read
  // (store.profiles). Disambiguate by the selected columns.
  const tableRows = (name: string, cols?: Record<string, unknown>) => {
    if (name === 'platform_review') return store.reviews
    if (name === 'clinic_profile') return cols && 'reminders' in cols ? store.profiles : store.clinics
    if (name === 'clinic_review_config') return store.reviewConfigs
    if (name === 'member') return store.staff
    if (name === 'organization') return store.orgs
    return []
  }
  function select(cols?: Record<string, unknown>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    api.innerJoin = () => api // joined columns are pre-flattened in the store rows
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    const rowsFor = () => tableRows(table, cols).filter((r) => filters.every((f) => f(r)))
    api.groupBy = () => api
    api.orderBy = () => api
    api.limit = async (n?: number) => (typeof n === 'number' ? rowsFor().slice(0, n) : rowsFor())
    api.then = (resolve: (v: unknown) => void) => resolve(rowsFor())
    return api
  }
  function update(t: { __name: string }) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    let patch: Record<string, unknown> = {}
    const api: Record<string, unknown> = {}
    api.set = (p: Record<string, unknown>) => { patch = p; return api }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    const apply = () => {
      const touched: Array<Record<string, unknown>> = []
      for (const r of tableRows(t.__name)) {
        if (filters.every((f) => f(r))) {
          Object.assign(r, patch)
          touched.push(r)
        }
      }
      return touched
    }
    api.returning = async () => apply()
    api.then = (resolve: (v: unknown) => void) => resolve(apply())
    return api
  }
  const col = (name: string) => ({ __col: name })
  const schema = {
    platformReview: {
      __name: 'platform_review',
      id: col('id'),
      organizationId: col('organizationId'),
      reviewCreatedAt: col('reviewCreatedAt'),
    },
    clinicProfile: {
      __name: 'clinic_profile',
      organizationId: col('organizationId'),
      standupLastSentAt: col('standupLastSentAt'),
      dailyDigestEnabled: col('digestEnabled'),
      reminderSettings: col('reminders'),
    },
    clinicReviewConfig: {
      __name: 'clinic_review_config',
      organizationId: col('organizationId'),
      autoSendEnabled: col('autoSendEnabled'),
    },
    organization: { __name: 'organization', id: col('id'), name: col('name'), isDemo: col('isDemo'), createdAt: col('createdAt') },
    member: { __name: 'member', organizationId: col('organizationId'), userId: col('userId'), role: col('role') },
    user: { __name: 'user', id: col('id'), name: col('name'), email: col('email') },
  }
  return { db: { select, update }, schema }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  ne: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] !== val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  or: (...preds: Array<(r: Record<string, unknown>) => boolean>) => (r: Record<string, unknown>) =>
    preds.some((p) => p(r)),
  gte: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) >= val,
  lt: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) < val,
  isNull: (col: { __col: string }) => (r: Record<string, unknown>) => r[col.__col] == null,
  inArray: (col: { __col: string }, vals: unknown[]) => (r: Record<string, unknown>) =>
    vals.includes(r[col.__col]),
  desc: () => 'desc',
  sql: () => '__sql__',
}))

import {
  buildWeeklyStandup,
  renderStandupEmailBody,
  sendWeeklyStandups,
  standupNoun,
} from '@/lib/services/standup'

const ORG = 'org_1'
// 2026-07-27 is a Monday. 15:00Z = 10:00 in Chicago — the Monday morning tick.
const MONDAY = new Date('2026-07-27T15:00:00Z')
// Weeks start SUNDAY (clinicWeekStart): this week = Jul 26 05:00Z,
// the prior week = Jul 19 05:00Z.
const THIS_WEEK_START = new Date('2026-07-26T05:00:00Z')
const PRIOR_WEEK_START = new Date('2026-07-19T05:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  ledger.counts = {}
  ledger.entries = []
  ledger.failures = 0
  ledger.countCalls = []
  ledger.listCalls = []
  ledger.failureCalls = []
  deps.openProposals = 0
  deps.followupsDue = 0
  deps.seated = 0
  deps.seatedCalls = []
  pref.optedOut = new Set()
  store.reviews = []
  store.clinics = []
  store.staff = []
  store.profiles = []
  store.reviewConfigs = []
  store.orgs = [] // no row = createdAt unknown = "old enough to narrate"
})

describe('buildWeeklyStandup', () => {
  it('reads EXACTLY the prior clinic-local week — from the ledger AND the journey spine (one seated law)', async () => {
    await buildWeeklyStandup(ORG, MONDAY)
    expect(ledger.countCalls[0][1]).toEqual(PRIOR_WEEK_START)
    expect(ledger.countCalls[0][2]).toEqual({ until: THIS_WEEK_START })
    expect(ledger.listCalls[0][1]).toMatchObject({ since: PRIOR_WEEK_START, until: THIS_WEEK_START })
    // The seated count comes from countSeatedBetween with the SAME window —
    // the round-1 defect was a local re-derivation that disagreed with /growth.
    expect(deps.seatedCalls[0]).toEqual([ORG, PRIOR_WEEK_START, THIS_WEEK_START])
  })

  it('turns counts into plural-noun lines, biggest first', async () => {
    ledger.counts = { appointment_reminder: 41, review_request: 6, listing_sync: 1 }
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.totalActions).toBe(48)
    expect(s.lines[0]).toEqual({ capability: 'appointment_reminder', noun: 'appointment reminders', count: 41 })
    expect(s.lines.map((l) => l.capability)).toEqual(['appointment_reminder', 'review_request', 'listing_sync'])
    expect(s.quietNote).toBeNull() // narration is for EMPTY windows only
  })

  it('stories prefer person+outcome capabilities, never repeat a capability, cap at 3', async () => {
    ledger.entries = [
      { capability: 'appointment_reminder', patientId: 'p1', summary: 'Reminded Mia about Tuesday' },
      { capability: 'appointment_reminder', patientId: 'p2', summary: 'Reminded Liam about Wednesday' },
      { capability: 'review_feature', patientId: null, summary: 'Added Priya’s 5-star review to your website' },
      { capability: 'noshow_rebook', patientId: 'p3', summary: 'Invited Noah back for a new time' },
      { capability: 'payment_autocharge', patientId: 'p4', summary: 'Charged Marcus’s card $100.00' },
    ]
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.stories).toHaveLength(3)
    expect(s.stories[0]).toContain('Priya') // review_feature outranks the rest
    expect(s.stories).toContain('Invited Noah back for a new time')
    expect(s.stories).toContain('Charged Marcus’s card $100.00')
  })

  it('an autonomy switch flip is never a STORY — a settings change is not work the machine did (round-1 Phase-3 audit)', async () => {
    ledger.entries = [
      {
        capability: 'review_reply',
        patientId: null,
        summary: 'You switched “Reply to Google reviews” to automatic — I’ll handle these on my own and list them on your Overview',
        detail: { autonomyChange: 'auto', changedByUserId: 'user_1' },
      },
      {
        capability: 'noshow_rebook',
        patientId: 'p3',
        summary: 'Invited Noah back for a new time',
        detail: null,
      },
    ]
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.stories).toEqual(['Invited Noah back for a new time'])
  })

  it('an "I couldn’t" hand-back note is never a STORY either', async () => {
    ledger.entries = [
      {
        capability: 'review_reply',
        patientId: null,
        summary: 'I tried 2 times to handle “A reply for Maria” on my own and couldn’t — it’s back with you',
        detail: { autoFailure: true, attempts: 2 },
      },
    ]
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.stories).toEqual([])
  })

  it('the seated number is whatever the spine says — no local recomputation', async () => {
    deps.seated = 3
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.newPatientsSeated).toBe(3)
  })

  it('a QUIET week narrates from config cross-checks: both engines on reads as healthy-idle', async () => {
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.totalActions).toBe(0)
    expect(s.quietNote).toContain('quiet week')
    expect(s.quietNote).toContain('watching')
  })

  it('a QUIET week with a switched-off engine says so — dead engine and healthy idle never look the same', async () => {
    store.profiles = [{ organizationId: ORG, reminders: { enabled: false } }]
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.quietNote).toContain('appointment reminders are switched off')

    store.profiles = []
    store.reviewConfigs = [{ organizationId: ORG, autoSendEnabled: 0 }]
    const s2 = await buildWeeklyStandup(ORG, MONDAY)
    expect(s2.quietNote).toContain('review requests are switched off')
  })

  it('a week of nothing but FAILURES never reads as “nothing needed sending” (round-9 audit)', async () => {
    // The trap: totalActions is WORK-only by law, so a week in which every
    // job the machine attempted FAILED arrives as zero — arithmetically
    // identical to a week where nothing needed doing. Round 8 taught the
    // Guardian's clinic sentence to hedge for exactly this and left the
    // standup — the flagship honesty surface — asserting an all-clear.
    ledger.failures = 4
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.totalActions).toBe(0)
    expect(s.quietNote).not.toContain('nothing needed sending')
    expect(s.quietNote).not.toContain('I’m watching')
    expect(s.quietNote).toContain('hit trouble')
    // Owned, not handed over: the anti-shame law and the same routing rule
    // that keeps failures away from the Guardian's clinic audience.
    expect(s.quietNote).toContain('mine to sort out')
  })

  it('a BUSY week says so too — work counts hide failures just as well (round-10 gap)', async () => {
    // Round 9 taught the QUIET branch and left this one: the counts are
    // work-only by law, so "41 reminders, 6 answers" is a clean report in a
    // week four jobs broke — and this is the branch a working practice
    // reads fifty weeks a year.
    ledger.counts = { appointment_reminder: 41, inquiry_response: 6 }
    ledger.failures = 4
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.totalActions).toBe(47)
    expect(s.quietNote).toBeNull()
    expect(s.failureNote).toContain('4 jobs of mine')
    expect(s.failureNote).toContain('mine to sort out')
  })

  it('counts ENGINE failures only — a hand-back is not "mine to sort out" (round-11 audit)', async () => {
    // The other producer is the autonomy hand-back: the machine
    // deliberately STOPPING after two tries and putting the card back in
    // front of a human. Counting them together made this say "that's mine
    // to sort out, and I'm on it" about a card the same report lists two
    // lines down as waiting on THEM — contradicting the machine's own
    // ledger sentence, "it's back with you".
    ledger.failures = 2
    await buildWeeklyStandup(ORG, MONDAY)
    const [, , opts] = ledger.failureCalls[0] as [string, Date, { kind?: string }]
    expect(opts.kind).toBe('engine')
  })

  it('a failures-only week is NOT quiet, so the Monday email actually goes (round-11 audit)', async () => {
    // `quiet` suppresses the email entirely and was computed from work-only
    // counts — so the one week rounds 9 and 10 taught this thing to admit
    // its own breakage was exactly the week the email carrying that
    // admission never sent.
    ledger.failures = 3
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.totalActions).toBe(0)
    expect(s.quiet).toBe(false)
    expect(s.quietNote).toContain('hit trouble')
  })

  it('a clean busy week says nothing about failures', async () => {
    ledger.counts = { appointment_reminder: 41 }
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.failureNote).toBeNull()
  })

  it('a week that predates the account never counts failures either', async () => {
    // Nothing about a period the clinic was not a customer, including ours.
    store.orgs = [{ id: ORG, createdAt: new Date('2026-07-27T00:00:00Z') }]
    ledger.failures = 3
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.predatesAccount).toBe(true)
    expect(s.failureNote).toBeNull()
    expect(ledger.failureCalls).toHaveLength(0)
  })

  it('the failure count reads the SAME window as the work count', async () => {
    ledger.failures = 1
    await buildWeeklyStandup(ORG, MONDAY)
    const [, since, opts] = ledger.failureCalls[0] as [string, Date, { until: Date }]
    expect(since.toISOString()).toBe(PRIOR_WEEK_START.toISOString())
    expect(opts.until.toISOString()).toBe(THIS_WEEK_START.toISOString())
  })

  it('a switched-off engine AND failures says both — neither hides the other', async () => {
    store.profiles = [{ organizationId: ORG, reminders: { enabled: false } }]
    ledger.failures = 2
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.quietNote).toContain('appointment reminders are switched off')
    expect(s.quietNote).toContain('hit trouble')
  })

  it('an unreadable failure count never invents trouble', async () => {
    const { countFailuresSince } = await import('@/lib/services/action-ledger')
    ;(countFailuresSince as unknown as { mockRejectedValueOnce: (e: Error) => void })
      .mockRejectedValueOnce(new Error('pool timeout'))
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.quietNote).toContain('nothing needed sending')
  })

  it('quiet = nothing done AND nothing waiting', async () => {
    const quiet = await buildWeeklyStandup(ORG, MONDAY)
    expect(quiet.quiet).toBe(true)
    deps.openProposals = 2
    const waiting = await buildWeeklyStandup(ORG, MONDAY)
    expect(waiting.quiet).toBe(false)
  })

  it('every registered capability has a plural noun (no raw keys in the counts line)', async () => {
    const { CAPABILITIES } = await import('@/lib/autonomy')
    for (const c of CAPABILITIES) {
      expect(standupNoun(c.key), c.key).not.toContain('_')
    }
  })
})

describe('renderStandupEmailBody — the voice', () => {
  it('reads warm and plain: counts, stories, the only-you list — and never an exclamation mark', async () => {
    ledger.counts = { appointment_reminder: 41, review_request: 6 }
    ledger.entries = [{ capability: 'noshow_rebook', patientId: 'p1', summary: 'Invited Noah back for a new time' }]
    deps.openProposals = 2
    deps.followupsDue = 3
    const s = await buildWeeklyStandup(ORG, MONDAY)
    const body = renderStandupEmailBody(s, 'Dream Dental')
    expect(body).toContain('Here\'s what I got done for Dream Dental last week')
    expect(body).toContain('• 41 appointment reminders')
    expect(body).toContain('Invited Noah back for a new time')
    expect(body).toContain('2 pieces of work are waiting on your yes')
    expect(body).toContain('3 follow-ups are due')
    expect(body).not.toContain('!')
  })

  it('an empty window renders the config-cross-checked quiet narration', async () => {
    deps.followupsDue = 1 // not quiet overall, but zero actions
    store.profiles = [{ organizationId: ORG, reminders: { enabled: false } }]
    const s = await buildWeeklyStandup(ORG, MONDAY)
    const body = renderStandupEmailBody(s, 'Dream Dental')
    expect(body).toContain('appointment reminders are switched off')
    expect(body).not.toContain('!')
  })

  it('says so plainly when nothing is waiting on a human', async () => {
    ledger.counts = { appointment_reminder: 2 }
    const s = await buildWeeklyStandup(ORG, MONDAY)
    const body = renderStandupEmailBody(s, 'Dream Dental')
    expect(body).toContain('Nothing is waiting on you right now.')
  })

  it('a window that PREDATES the account is never narrated — a 3-day-old clinic gets no confident report about a week it wasn’t here for (round-3)', async () => {
    // Signed up Sunday of THIS week; the prior-week window ended before that.
    store.orgs = [{ id: ORG, createdAt: new Date('2026-07-26T12:00:00Z') }]
    deps.followupsDue = 2 // not "quiet" in the humanTasks sense — still suppressed
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.predatesAccount).toBe(true)
    expect(s.quietNote).toBeNull() // the card renders nothing
  })

  it('an org old enough to have lived the window narrates normally', async () => {
    store.orgs = [{ id: ORG, createdAt: new Date('2026-06-01T00:00:00Z') }]
    ledger.counts = { appointment_reminder: 3 }
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.predatesAccount).toBe(false)
    expect(s.totalActions).toBe(3)
  })
})

describe('sendWeeklyStandups', () => {
  function seedClinic(over: Record<string, unknown> = {}) {
    store.clinics.push({
      organizationId: ORG,
      standupLastSentAt: null,
      digestEnabled: 1,
      isDemo: false,
      clinicName: 'Dream Dental',
      ...over,
    })
    store.staff.push({ organizationId: ORG, userId: 'u1', role: 'owner', name: 'Dr. Reyes', email: 'dr@x.com' })
  }

  it('sends on the clinic-local Monday to ALL staff roles (the office manager is usually admin) minus the opt-out', async () => {
    seedClinic()
    store.staff.push({ organizationId: ORG, userId: 'u2', role: 'admin', name: 'Sam Office', email: 'sam@x.com' })
    store.staff.push({ organizationId: ORG, userId: 'u3', role: 'member', name: 'Kai Front', email: 'kai@x.com' })
    store.staff.push({ organizationId: ORG, userId: 'u4', role: 'patient', name: 'Pat', email: 'pat@x.com' })
    pref.optedOut = new Set(['u3']) // Kai muted DreamCRM email — respected here too
    ledger.counts = { appointment_reminder: 3 }
    const r = await sendWeeklyStandups({ now: MONDAY })
    expect(r.sent).toBe(2) // owner + admin; member opted out; patient never
    const recipients = sendNotificationEmailMock.mock.calls.map((c) => (c[0] as Record<string, unknown>).to)
    expect(recipients.sort()).toEqual(['dr@x.com', 'sam@x.com'])
    expect(store.clinics[0].standupLastSentAt).toEqual(MONDAY)
  })

  it('a clinic that never enabled the DAILY digest still gets the Monday standup — dailyDigestEnabled defaults to 0, so gating on it would make the email dead-on-arrival (round-2 fix); the off switch is the per-staff opt-out', async () => {
    seedClinic({ digestEnabled: 0 })
    ledger.counts = { appointment_reminder: 3 }
    const r = await sendWeeklyStandups({ now: MONDAY })
    expect(r.sent).toBe(1)
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1)
  })

  it('one bad mailbox never blocks the rest — per-recipient failures are recorded, siblings still send (round-2 fix)', async () => {
    seedClinic()
    store.staff.push({ organizationId: ORG, userId: 'u2', role: 'admin', name: 'Sam Office', email: 'sam@x.com' })
    ledger.counts = { appointment_reminder: 3 }
    sendNotificationEmailMock.mockRejectedValueOnce(new Error('mailbox on fire'))
    const r = await sendWeeklyStandups({ now: MONDAY })
    expect(r.sent).toBe(1)
    expect(r.errors.some((e: { error: string }) => e.error.includes('send to') && e.error.includes('failed'))).toBe(true)
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(2)
  })

  it('does nothing on other weekdays', async () => {
    seedClinic()
    ledger.counts = { appointment_reminder: 3 }
    const r = await sendWeeklyStandups({ now: new Date('2026-07-28T15:00:00Z') }) // Tuesday
    expect(r.sent).toBe(0)
    expect(r.skippedNotMonday).toBe(1)
  })

  it('sends once per week — the claim is ATOMIC (conditional on the prior value), so overlapping ticks cannot double-email', async () => {
    seedClinic()
    ledger.counts = { appointment_reminder: 3 }
    const first = await sendWeeklyStandups({ now: MONDAY })
    expect(first.sent).toBe(1)
    // Second at-least-once delivery of the same tick: the stored value now
    // fails the conditional claim even if a racing run read stale state.
    const second = await sendWeeklyStandups({ now: MONDAY })
    expect(second.sent).toBe(0)
    expect(second.skippedAlready).toBe(1)
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1)
  })

  it('a brand-new clinic (account younger than the window) is skipped like a quiet week — no pre-account report (round-3)', async () => {
    seedClinic()
    store.orgs = [{ id: ORG, createdAt: new Date('2026-07-26T12:00:00Z') }]
    deps.followupsDue = 2 // would otherwise pass the quiet check and email
    const r = await sendWeeklyStandups({ now: MONDAY })
    expect(r.skippedQuiet).toBe(1)
    expect(sendNotificationEmailMock).not.toHaveBeenCalled()
  })

  it('demo clinics and quiet weeks never email', async () => {
    seedClinic({ isDemo: true })
    const demo = await sendWeeklyStandups({ now: MONDAY })
    expect(demo.scanned).toBe(0)
    expect(sendNotificationEmailMock).not.toHaveBeenCalled()

    store.clinics = []
    store.staff = []
    seedClinic() // real clinic, but the ledger is empty and nothing waits
    const quiet = await sendWeeklyStandups({ now: MONDAY })
    expect(quiet.skippedQuiet).toBe(1)
    expect(sendNotificationEmailMock).not.toHaveBeenCalled()
  })
})
