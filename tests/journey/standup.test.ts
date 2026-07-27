import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The weekly standup (Transformation Phase 2 — the Narrator). Pins:
 *  - the window is the PRIOR clinic-local week, [weekStart-7d, weekStart),
 *    passed to the ledger readers as since/until (the `until` bound exists
 *    FOR this consumer — round-3 backlog item);
 *  - counts become plural-noun lines, stories prefer person+outcome
 *    capabilities and never repeat a capability;
 *  - "new patients seated" follows the journey law (imported history and
 *    roster patients never count);
 *  - the email: Monday-only per clinic tz, once per week (claim before
 *    send), demo + quiet clinics never email, owners are the recipients;
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

const deps = vi.hoisted(() => ({ openProposals: 0, followupsDue: 0 }))
vi.mock('@/lib/services/proposals', () => ({
  countOpenProposals: vi.fn(async () => deps.openProposals),
}))
vi.mock('@/lib/services/patient-followups', () => ({
  countFollowupsDue: vi.fn(async () => deps.followupsDue),
}))
vi.mock('@/lib/services/clinic-timezone', () => ({
  getClinicTimeZone: vi.fn(async () => 'America/Chicago'),
}))

const { sendNotificationEmailMock } = vi.hoisted(() => ({
  sendNotificationEmailMock: vi.fn(async (..._a: unknown[]) => undefined),
}))
vi.mock('@/lib/email', () => ({ sendNotificationEmail: sendNotificationEmailMock }))

const store: {
  appointments: Array<Record<string, unknown>>
  patients: Array<Record<string, unknown>>
  reviews: Array<Record<string, unknown>>
  clinics: Array<Record<string, unknown>>
  staff: Array<Record<string, unknown>>
} = { appointments: [], patients: [], reviews: [], clinics: [], staff: [] }

vi.mock('@/lib/db', () => {
  const tableRows = (name: string) => {
    if (name === 'appointment') return store.appointments
    if (name === 'patient') return store.patients
    if (name === 'platform_review') return store.reviews
    if (name === 'clinic_profile') return store.clinics
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
    const rowsFor = () => {
      let out = tableRows(table).filter((r) => filters.every((f) => f(r)))
      if (cols) {
        out = out.map((r) =>
          Object.fromEntries(
            Object.keys(cols).map((k) => [k, k === 'seatedAt' ? r.completedAt : r[k]]),
          ),
        )
      }
      return out
    }
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
    api.then = (resolve: (v: unknown) => void) => {
      for (const r of tableRows(t.__name)) if (filters.every((f) => f(r))) Object.assign(r, patch)
      resolve(undefined)
    }
    return api
  }
  const col = (name: string) => ({ __col: name })
  const schema = {
    appointment: {
      __name: 'appointment',
      organizationId: col('organizationId'),
      patientId: col('patientId'),
      status: col('status'),
      source: col('source'),
      completedAt: col('completedAt'),
    },
    patient: { __name: 'patient', id: col('id'), organizationId: col('organizationId'), source: col('source') },
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
    },
    organization: { __name: 'organization', id: col('id'), name: col('name'), isDemo: col('isDemo') },
    member: { __name: 'member', organizationId: col('organizationId'), userId: col('userId'), role: col('role') },
    user: { __name: 'user', id: col('id'), name: col('name'), email: col('email') },
  }
  return { db: { select, update }, schema }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  gte: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) >= val,
  lt: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) < val,
  inArray: (col: { __col: string }, vals: unknown[]) => (r: Record<string, unknown>) =>
    vals.includes(r[col.__col]),
  desc: () => 'desc',
  sql: (strings: TemplateStringsArray) => {
    const s = strings.join('#')
    if (s.includes('is distinct from')) return (r: Record<string, unknown>) => r.source !== 'pms_import'
    if (s.includes('is not null')) return (r: Record<string, unknown>) => r.completedAt != null
    if (s.includes("= 'pms_import'")) return (r: Record<string, unknown>) => r.source === 'pms_import'
    return '__sql__'
  },
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
const IN_PRIOR_WEEK = new Date('2026-07-21T16:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  ledger.counts = {}
  ledger.entries = []
  ledger.countCalls = []
  ledger.listCalls = []
  deps.openProposals = 0
  deps.followupsDue = 0
  store.appointments = []
  store.patients = []
  store.reviews = []
  store.clinics = []
  store.staff = []
})

describe('buildWeeklyStandup', () => {
  it('reads EXACTLY the prior clinic-local week from the ledger (since + the until bound built for this consumer)', async () => {
    await buildWeeklyStandup(ORG, MONDAY)
    expect(ledger.countCalls[0][1]).toEqual(PRIOR_WEEK_START)
    expect(ledger.countCalls[0][2]).toEqual({ until: THIS_WEEK_START })
    expect(ledger.listCalls[0][1]).toMatchObject({ since: PRIOR_WEEK_START, until: THIS_WEEK_START })
  })

  it('turns counts into plural-noun lines, biggest first', async () => {
    ledger.counts = { appointment_reminder: 41, review_request: 6, listing_sync: 1 }
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.totalActions).toBe(48)
    expect(s.lines[0]).toEqual({ capability: 'appointment_reminder', noun: 'appointment reminders', count: 41 })
    expect(s.lines.map((l) => l.capability)).toEqual(['appointment_reminder', 'review_request', 'listing_sync'])
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

  it('new patients seated: counts first mintable completed visits in-window; imported rows and roster patients never count', async () => {
    store.patients = [
      { id: 'p_new', organizationId: ORG, source: 'booking' },
      { id: 'p_roster_src', organizationId: ORG, source: 'pms_import' },
      { id: 'p_roster_appt', organizationId: ORG, source: 'booking' },
      { id: 'p_old', organizationId: ORG, source: 'booking' },
    ]
    store.appointments = [
      // Organic first visit inside the window → counts.
      { organizationId: ORG, patientId: 'p_new', status: 'completed', source: 'booking', completedAt: IN_PRIOR_WEEK },
      // Backfill patient.source → never counts.
      { organizationId: ORG, patientId: 'p_roster_src', status: 'completed', source: 'portal', completedAt: IN_PRIOR_WEEK },
      // Roster-anchored (has an imported appointment) → the organic visit is a RETURN.
      { organizationId: ORG, patientId: 'p_roster_appt', status: 'completed', source: 'booking', completedAt: IN_PRIOR_WEEK },
      { organizationId: ORG, patientId: 'p_roster_appt', status: 'completed', source: 'pms_import', completedAt: new Date('2026-07-24T12:00:00Z') },
      // First visit before the window → not this week's story.
      { organizationId: ORG, patientId: 'p_old', status: 'completed', source: 'booking', completedAt: new Date('2026-07-01T12:00:00Z') },
    ]
    const s = await buildWeeklyStandup(ORG, MONDAY)
    expect(s.newPatientsSeated).toBe(1)
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
      isDemo: false,
      clinicName: 'Dream Dental',
      ...over,
    })
    store.staff.push({ organizationId: ORG, userId: 'u1', role: 'owner', name: 'Dr. Reyes', email: 'dr@x.com' })
  }

  it('sends to owners on the clinic-local Monday and claims the week BEFORE sending', async () => {
    seedClinic()
    ledger.counts = { appointment_reminder: 3 }
    const r = await sendWeeklyStandups({ now: MONDAY })
    expect(r.sent).toBe(1)
    expect(sendNotificationEmailMock).toHaveBeenCalledTimes(1)
    const msg = sendNotificationEmailMock.mock.calls[0][0] as Record<string, unknown>
    expect(msg.to).toBe('dr@x.com')
    expect(String(msg.title)).toContain('Your week with DreamCRM')
    expect(store.clinics[0].standupLastSentAt).toEqual(MONDAY)
  })

  it('does nothing on other weekdays', async () => {
    seedClinic()
    ledger.counts = { appointment_reminder: 3 }
    const r = await sendWeeklyStandups({ now: new Date('2026-07-28T15:00:00Z') }) // Tuesday
    expect(r.sent).toBe(0)
    expect(r.skippedNotMonday).toBe(1)
  })

  it('sends once per week (standupLastSentAt inside this week skips)', async () => {
    seedClinic({ standupLastSentAt: new Date('2026-07-26T13:00:00Z') })
    ledger.counts = { appointment_reminder: 3 }
    const r = await sendWeeklyStandups({ now: MONDAY })
    expect(r.sent).toBe(0)
    expect(r.skippedAlready).toBe(1)
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
