import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * getRecallStats — the Recall & Outreach "who's due?" counts MUST agree with
 * the Patients list + Analytics. That means honoring (a) the clinic's
 * configured recall interval (Settings → Practice, default 6mo) instead of a
 * hardcoded window, and (b) the PMS-synced recall date when present. These
 * tests lock both: a longer clinic interval excludes a patient the old
 * hardcoded 6-month rule would have flagged, and a future PMS recall date
 * suppresses "due" entirely.
 */

const MONTH = 30 * 24 * 60 * 60 * 1000

// Per-table FIFO queues. Each db.select().from(<table>) pulls the next result
// for that table, so the construction order inside the service maps cleanly:
//   clinicProfile → cadence; patient → roster; appointment → [lastVisits, nextVisits].
let queues: Record<string, unknown[][]>

function chainFor(rows: () => unknown) {
  const c: Record<string, unknown> = {
    where: () => c,
    innerJoin: () => c,
    orderBy: () => c,
    limit: () => c,
    then: (onF: (v: unknown) => unknown) => Promise.resolve(rows()).then(onF),
  }
  return c
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: string) => chainFor(() => queues[t]?.shift() ?? []),
    }),
  },
  schema: {
    patient: 'patient',
    appointment: 'appointment',
    campaignEvents: 'campaignEvents',
    campaigns: 'campaigns',
    audiences: 'audiences',
  },
}))
// getClinicCadence reads clinicProfile via the platform schema module directly.
vi.mock('@/lib/db/schema/platform', () => ({ clinicProfile: 'clinicProfile' }))
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }), eq: (...a: unknown[]) => ({ a }),
  gte: (...a: unknown[]) => ({ a }), lte: (...a: unknown[]) => ({ a }),
  ne: (...a: unknown[]) => ({ a }), inArray: (...a: unknown[]) => ({ a }),
}))

import { getRecallStats } from '@/lib/services/recall-stats'

function patient(id: string, over: Record<string, unknown> = {}) {
  return {
    id, email: `${id}@x.com`, dateOfBirth: null, lifecycle: 'active',
    isActive: 1, firstSeenAt: null, marketingEmailOptIn: 1,
    pmsRecallDueAt: null, recallIntervalMonths: null, ...over,
  }
}

beforeEach(() => {
  queues = {
    clinicProfile: [], patient: [], appointment: [],
    campaignEvents: [[]], campaigns: [[], []], audiences: [],
  }
})

describe('getRecallStats — recall-due honors clinic cadence', () => {
  it('uses the clinic recall interval, not a hardcoded 6 months', async () => {
    const now = Date.now()
    // Clinic set a 12-month recall interval, 18-month lapsed window.
    queues.clinicProfile = [[{ recallMonths: 12, lapsedMonths: 18 }]]
    // A: last visit 8 months ago — DUE under the old 6mo rule, NOT due at 12mo.
    // C: last visit 14 months ago — due at 12mo.
    queues.patient = [[patient('A'), patient('C')]]
    queues.appointment = [
      [ // lastVisits
        { patientId: 'A', startTime: new Date(now - 8 * MONTH) },
        { patientId: 'C', startTime: new Date(now - 14 * MONTH) },
      ],
      [], // nextVisits — nobody booked ahead
    ]
    const stats = await getRecallStats('org_1')
    // Only C is due. The old hardcoded 6-month rule would have counted both.
    expect(stats.recallDueCount).toBe(1)
    expect(stats.lapsedCount).toBe(0) // both under the 18mo lapsed window
  })

  it('a future PMS recall date suppresses "due" even with an old last visit', async () => {
    const now = Date.now()
    queues.clinicProfile = [[{ recallMonths: 6, lapsedMonths: 18 }]]
    // B last visited 14mo ago (heuristic would say due) but the PMS says the
    // next recall isn't due for another 60 days — so they are NOT due now.
    queues.patient = [[patient('B', { pmsRecallDueAt: new Date(now + 60 * 24 * 60 * 60 * 1000) })]]
    queues.appointment = [
      [{ patientId: 'B', startTime: new Date(now - 14 * MONTH) }],
      [],
    ]
    const stats = await getRecallStats('org_1')
    expect(stats.recallDueCount).toBe(0)
  })

  it('falls back to the 6-month default when the clinic has no cadence set', async () => {
    const now = Date.now()
    queues.clinicProfile = [[{ recallMonths: null, lapsedMonths: null }]]
    queues.patient = [[patient('D')]]
    queues.appointment = [
      [{ patientId: 'D', startTime: new Date(now - 8 * MONTH) }], // 8mo ago > 6mo default
      [],
    ]
    const stats = await getRecallStats('org_1')
    expect(stats.recallDueCount).toBe(1)
  })
})

/**
 * The hub's "opened · 30d" is a PEOPLE rate (2026-10-26): one patient
 * opening the pixel five times is one open, so the rate can never pass 100%.
 */
describe('getRecallStats — open rate counts people, not pixel loads', () => {
  it('five pixel loads by one patient on one campaign read as one open', async () => {
    const now = Date.now()
    queues.patient = [[patient('A')]]
    queues.appointment = [[], []]
    const ev = (type: string, i: number) => ({
      id: i, type, patientId: 'A', recipientEmail: 'a@x.com', recipientPhone: null,
      campaignId: 1, campaignName: 'Recall', occurredAt: new Date(now - 1000),
    })
    queues.campaignEvents = [[ev('sent', 1), ev('open', 2), ev('open', 3), ev('open', 4), ev('open', 5), ev('open', 6)]]
    const stats = await getRecallStats('org_1')
    expect(stats.sentThisMonthCount).toBe(1)
    expect(stats.openRate30d).toBe(100)
  })
})

/**
 * THE MONTH IS THE CLINIC'S (CLAUDE.md timezone rule 2). At 23:30 on Oct 31
 * in Los Angeles the server's UTC clock already says Nov 1 — a server-month
 * boundary flipped the birthday tier and reset "sent this month" at dinner
 * time. The clinic-profile FIFO carries the cadence row first (getClinicCadence
 * reads it first) and the timezone row second (getClinicTimeZone).
 */
describe('getRecallStats — month boundaries are clinic-local', () => {
  afterEach(() => vi.useRealTimers())

  it('23:30 on Oct 31 in Los Angeles is still October for birthdays and "sent this month"', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T06:30:00.000Z') }) // 23:30 PDT Oct 31
    queues.clinicProfile = [[{ recallMonths: 6, lapsedMonths: 18 }], [{ tz: 'America/Los_Angeles' }]]
    queues.patient = [[
      patient('OCT', { dateOfBirth: '1980-10-05' }),
      patient('NOV', { dateOfBirth: '1980-11-05' }),
    ]]
    queues.appointment = [[], []]
    queues.campaignEvents = [[
      // Sent at 22:00 PDT on Oct 31 — this month for the clinic.
      { id: 1, type: 'sent', patientId: 'OCT', recipientEmail: 'oct@x.com', recipientPhone: null, campaignId: 1, campaignName: 'R', occurredAt: new Date('2026-11-01T05:00:00.000Z') },
      // Sent at 22:00 PDT on Sep 30 — last month for the clinic.
      { id: 2, type: 'sent', patientId: 'NOV', recipientEmail: 'nov@x.com', recipientPhone: null, campaignId: 1, campaignName: 'R', occurredAt: new Date('2026-10-01T05:00:00.000Z') },
    ]]
    const stats = await getRecallStats('org_1')
    expect(stats.birthdayThisMonthCount).toBe(1) // OCT, not NOV
    expect(stats.sentThisMonthCount).toBe(1)
  })

  it('the same instant is already November for a New York clinic', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-01T06:30:00.000Z') }) // 02:30 EDT Nov 1
    queues.clinicProfile = [[{ recallMonths: 6, lapsedMonths: 18 }], [{ tz: 'America/New_York' }]]
    queues.patient = [[patient('OCT', { dateOfBirth: '1980-10-05' }), patient('NOV', { dateOfBirth: '1980-11-05' })]]
    queues.appointment = [[], []]
    queues.campaignEvents = [[
      { id: 1, type: 'sent', patientId: 'OCT', recipientEmail: 'oct@x.com', recipientPhone: null, campaignId: 1, campaignName: 'R', occurredAt: new Date('2026-11-01T05:00:00.000Z') },
    ]]
    const stats = await getRecallStats('org_1')
    expect(stats.birthdayThisMonthCount).toBe(1) // NOV
    expect(stats.sentThisMonthCount).toBe(1) // 01:00 EDT Nov 1 — this month
  })
})
