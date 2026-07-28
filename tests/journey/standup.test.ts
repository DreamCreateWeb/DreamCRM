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
 *    conditional claim before send, org-gated on the digest master switch,
 *    ALL staff roles minus the per-staff opt-out, demo + quiet skipped;
 *  - the voice: no exclamation marks anywhere in the email body.
 */

const ledger = vi.hoisted(() => ({
  counts: {} as Record<string, number>,
  entries: [] as Array<Record<string, unknown>>,
  countCalls: [] as unknown[][],
  listCalls: [] as unknown[][],
}))
vi.mock('@/lib/services/action-ledger', () => ({
  countActionsSince: vi.fn(async (...a: unknown[]) => {
    ledger.countCalls.push(a)
    return ledger.counts
  }),
  listRecentActions: vi.fn(async (...a: unknown[]) => {
    ledger.listCalls.push(a)
    return ledger.entries
  }),
}))

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
} = { reviews: [], clinics: [], staff: [], profiles: [], reviewConfigs: [] }

vi.mock('@/lib/db', () => {
  // clinic_profile serves TWO reads: the standup-send scan (joined shape,
  // store.clinics) and readEngineSwitches' reminderSettings read
  // (store.profiles). Disambiguate by the selected columns.
  const tableRows = (name: string, cols?: Record<string, unknown>) => {
    if (name === 'platform_review') return store.reviews
    if (name === 'clinic_profile') return cols && 'reminders' in cols ? store.profiles : store.clinics
    if (name === 'clinic_review_config') return store.reviewConfigs
    if (name === 'member') return store.staff
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
    organization: { __name: 'organization', id: col('id'), name: col('name'), isDemo: col('isDemo') },
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
  ledger.countCalls = []
  ledger.listCalls = []
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

  it('the org-level off switch: a clinic that disabled digest email gets no standup email either', async () => {
    seedClinic({ digestEnabled: 0 })
    ledger.counts = { appointment_reminder: 3 }
    const r = await sendWeeklyStandups({ now: MONDAY })
    expect(r.scanned).toBe(0)
    expect(sendNotificationEmailMock).not.toHaveBeenCalled()
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
