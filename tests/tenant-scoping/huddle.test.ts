/**
 * THE HUDDLE's server half (docs/daily-tools.md, slice H1).
 *
 * Two things are held here:
 *
 *  1. TENANT SCOPING — every read the service makes filters by
 *     organization_id. Real drizzle-orm + the real schema; only @/lib/db is
 *     mocked, so each captured where-clause is the genuine eq(...) fragment.
 *  2. THE ASSEMBLY — which day counts as "the last time in" and "next on the
 *     books", what the recap is built from, which reads are best-effort and
 *     which one is not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org_A'
const USER = 'user_1'

const state = {
  /** Every where-clause, flattened, with the table it ran against. */
  wheres: [] as Array<{ table: string; kind: string; sql: string }>,
  nextAt: null as Date | null,
  lastAt: null as Date | null,
  syncAt: null as Date | null,
  recapRows: [] as Array<{ patientId: string; status: string; firstName: string; lastName: string }>,
  priors: [] as Array<{ patientId: string }>,
  bookedOnline: 0,
  newInquiries: 0,
  fail: new Set<string>(),
  atQueries: 0,
}

function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
    if (v instanceof Date) {
      parts.push(v.toISOString())
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (obj.value !== undefined) parts.push(String(obj.value))
    if (typeof obj.name === 'string') parts.push(obj.name)
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
}

vi.mock('@/lib/db', async () => {
  const { getTableName } = await import('drizzle-orm')
  const schema = await import('@/lib/db/schema')
  /** Which of the service's reads a select is, from its table + columns. */
  const kindOf = (table: string, cols: string[]): string => {
    if (table === 'pms_connection') return 'sync'
    if (table === 'lead') return 'inquiries'
    if (cols.includes('firstName')) return 'recap'
    if (cols.includes('n')) return 'booked'
    if (cols.includes('at')) return state.atQueries++ === 0 ? 'next' : 'last'
    return 'priors'
  }
  const rowsFor = (kind: string): unknown[] => {
    if (state.fail.has(kind)) throw new Error(`boom: ${kind}`)
    switch (kind) {
      case 'next':
        return [{ at: state.nextAt }]
      case 'last':
        return [{ at: state.lastAt }]
      case 'sync':
        return state.syncAt ? [{ at: state.syncAt }] : []
      case 'recap':
        return state.recapRows
      case 'priors':
        return state.priors
      case 'booked':
        return [{ n: state.bookedOnline }]
      case 'inquiries':
        return [{ n: state.newInquiries }]
      default:
        return []
    }
  }
  return {
    schema,
    db: {
      select: (cols: Record<string, unknown>) => ({
        from: (table: Parameters<typeof getTableName>[0]) => {
          const name = getTableName(table)
          const kind = kindOf(name, Object.keys(cols))
          const chain: Record<string, unknown> = {
            innerJoin: () => chain,
            leftJoin: () => chain,
            where: (clause: unknown) => {
              state.wheres.push({ table: name, kind, sql: captureSql(clause) })
              return chain
            },
            limit: () => chain,
            orderBy: () => chain,
            then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
              new Promise((resolve) => resolve(rowsFor(kind))).then(onF, onR),
          }
          return chain
        },
      }),
    },
  }
})

vi.mock('@/lib/services/clinic-timezone', () => ({ getClinicTimeZone: vi.fn(async () => 'America/Chicago') }))

type AuditArgs = { now?: Date; dayOffset: number; scope?: string }
const audit = vi.hoisted(() => ({
  byOffset: new Map<number, unknown[]>(),
  calls: [] as Array<{ org: string; dayOffset: number; scope?: string }>,
  failToday: false,
}))
vi.mock('@/lib/services/patient-audit', () => ({
  auditClinicDay: vi.fn(async (org: string, opts: AuditArgs) => {
    audit.calls.push({ org, dayOffset: opts.dayOffset, scope: opts.scope })
    if (opts.dayOffset === 0 && audit.failToday) throw new Error('schedule read failed')
    return { dayKey: `offset:${opts.dayOffset}`, visits: audit.byOffset.get(opts.dayOffset) ?? [] }
  }),
}))

const pms = vi.hoisted(() => ({ link: { kind: 'connected', vendorLabel: 'Open Dental' } as Record<string, unknown> }))
vi.mock('@/lib/services/pms-link', () => ({ getPmsLink: vi.fn(async () => pms.link) }))

const doors = vi.hoisted(() => ({ state: { followups: true, leads: true } as Record<string, boolean> }))
vi.mock('@/lib/services/feature-switches', () => ({ getFeatureSwitchState: vi.fn(async () => ({ ...doors.state })) }))

const sub = vi.hoisted(() => ({
  listClosuresAhead: vi.fn(),
  getFollowupSummary: vi.fn(),
  getInboxStats: vi.fn(),
  countOpenProposals: vi.fn(),
  countActionsSince: vi.fn(),
}))
vi.mock('@/lib/services/closures', () => ({ listClosuresAhead: sub.listClosuresAhead }))
vi.mock('@/lib/services/patient-followups', () => ({ getFollowupSummary: sub.getFollowupSummary }))
vi.mock('@/lib/services/patient-messaging', () => ({ getInboxStats: sub.getInboxStats }))
vi.mock('@/lib/services/proposals', () => ({ countOpenProposals: sub.countOpenProposals }))
vi.mock('@/lib/services/action-ledger', () => ({ countActionsSince: sub.countActionsSince }))
// The one constant the recap borrows — mocked so the activation service's
// whole graph is not loaded for a list of four strings.
vi.mock('@/lib/services/activation', () => ({ OUR_BOOKING_SOURCES: ['booking_widget', 'recall_campaign', 'invite', 'portal'] }))

import { clinicDayOffsetOf, getHuddle, getHuddleDigestLine, HUDDLE_LOOK_DAYS } from '@/lib/services/huddle'

// Wednesday 2026-11-25, 9:00 AM in Chicago.
const NOW = new Date('2026-11-25T15:00:00Z')
const TZ = 'America/Chicago'

function dayVisit(over: Record<string, unknown> = {}) {
  return {
    appointmentId: 'a1',
    patientId: 'p1',
    patientName: 'Maria Ramirez',
    startTime: new Date('2026-11-25T15:00:00Z'),
    endTime: null,
    type: 'new_patient_exam',
    status: 'confirmed',
    providerName: 'Dr. Lee',
    flags: [],
    ...over,
  }
}

beforeEach(() => {
  state.wheres.length = 0
  state.nextAt = null
  state.lastAt = null
  state.syncAt = null
  state.recapRows = []
  state.priors = []
  state.bookedOnline = 0
  state.newInquiries = 0
  state.fail.clear()
  state.atQueries = 0
  audit.byOffset.clear()
  audit.calls.length = 0
  audit.failToday = false
  pms.link = { kind: 'connected', vendorLabel: 'Open Dental' }
  doors.state = { followups: true, leads: true }
  sub.listClosuresAhead.mockReset().mockResolvedValue([])
  sub.getFollowupSummary.mockReset().mockResolvedValue({ openTotal: 0, overdue: 0, dueToday: 0, preview: [] })
  sub.getInboxStats.mockReset().mockResolvedValue({ open: 0, unread: 0, snoozedAvailable: 0, archived: 0 })
  sub.countOpenProposals.mockReset().mockResolvedValue(0)
  sub.countActionsSince.mockReset().mockResolvedValue({})
})

describe('the Huddle — tenant scoping', () => {
  it('every read carries the clinic’s organization_id', async () => {
    state.nextAt = new Date('2026-11-26T15:00:00Z')
    state.lastAt = new Date('2026-11-24T20:00:00Z')
    state.syncAt = new Date('2026-11-25T14:48:00Z')
    state.recapRows = [{ patientId: 'p9', status: 'completed', firstName: 'Sam', lastName: 'Tran' }]
    await getHuddle(ORG, USER, { now: NOW })

    // All six of the service's own reads ran, plus the inquiry count.
    expect(state.wheres.map((w) => w.kind).sort()).toEqual(['booked', 'inquiries', 'last', 'next', 'priors', 'recap', 'sync'])
    for (const w of state.wheres) expect(w.sql, `${w.kind} on ${w.table}`).toContain(ORG)

    // …and the reads it delegates are handed the same org, never a wider one.
    for (const c of audit.calls) expect(c.org).toBe(ORG)
    expect(sub.listClosuresAhead).toHaveBeenCalledWith(ORG, TZ, 14, NOW)
    expect(sub.getFollowupSummary).toHaveBeenCalledWith(ORG, NOW)
    expect(sub.getInboxStats).toHaveBeenCalledWith(ORG, USER)
    expect(sub.countOpenProposals).toHaveBeenCalledWith(ORG)
    expect(sub.countActionsSince.mock.calls[0][0]).toBe(ORG)
  })

  it('a roster’s imported placeholder visit is never a chair: the recap and the last-day search both exclude it', async () => {
    state.lastAt = new Date('2026-11-24T20:00:00Z')
    state.recapRows = [{ patientId: 'p9', status: 'completed', firstName: 'Sam', lastName: 'Tran' }]
    await getHuddle(ORG, USER, { now: NOW })
    const sqlOf = (kind: string) => state.wheres.find((w) => w.kind === kind)!.sql
    expect(sqlOf('last')).toContain('csv_import')
    expect(sqlOf('recap')).toContain('csv_import')
    // The prior-visit read does NOT exclude it: an imported last visit is
    // real history, and a patient with one is not new.
    expect(sqlOf('priors')).not.toContain('csv_import')
    expect(sqlOf('priors')).toContain('no_show')
    // "Booked online" counts our own doors only.
    expect(sqlOf('booked')).toContain('booking_widget')
    expect(sqlOf('booked')).toContain('portal')
  })
})

describe('the Huddle — which days it talks about', () => {
  it('finds a day’s offset from the clinic’s today, in the clinic’s timezone', () => {
    // 11:30 PM Tuesday in Chicago is already Wednesday in UTC — still yesterday.
    expect(clinicDayOffsetOf(new Date('2026-11-25T05:30:00Z'), NOW, TZ, -1)).toBe(-1)
    expect(clinicDayOffsetOf(new Date('2026-11-26T15:00:00Z'), NOW, TZ, 1)).toBe(1)
    expect(clinicDayOffsetOf(new Date('2026-11-30T15:00:00Z'), NOW, TZ, 1)).toBe(5)
    // Outside the week it looks across → nothing to say.
    expect(clinicDayOffsetOf(new Date('2026-12-20T15:00:00Z'), NOW, TZ, 1)).toBeNull()
    expect(clinicDayOffsetOf(new Date('2026-11-10T15:00:00Z'), NOW, TZ, -1)).toBeNull()
    expect(HUDDLE_LOOK_DAYS).toBe(7)
  })

  it('audits TODAY as held (done visits stay on the page) and the next day as live', async () => {
    state.nextAt = new Date('2026-11-26T15:00:00Z')
    audit.byOffset.set(0, [dayVisit(), dayVisit({ appointmentId: 'a2', status: 'completed' })])
    audit.byOffset.set(1, [dayVisit({ appointmentId: 'b1', flags: [{ key: 'unconfirmed', label: 'Not confirmed yet' }] })])
    const view = await getHuddle(ORG, USER, { now: NOW })

    expect(audit.calls).toEqual([
      { org: ORG, dayOffset: 0, scope: 'held' },
      { org: ORG, dayOffset: 1, scope: 'live' },
    ])
    expect(view.today.dayLabel).toBe('Wednesday, November 25')
    expect(view.today.visits.map((v) => v.state)).toEqual(['ahead', 'done'])
    expect(view.today.visits[0]).toMatchObject({ name: 'Maria Ramirez', shortName: 'Maria R.', time: '9:00 AM', type: 'New patient exam', provider: 'Dr. Lee' })
    expect(view.next).toMatchObject({ dayLabel: 'Thursday, November 26', isTomorrow: true })
    expect(view.next!.tally.map((t) => t.text)).toEqual(['1 not confirmed'])
    expect(view.asOf).toBe('9:00 AM')
  })

  it('Monday talks about Friday and skips to the next day with anyone on the books — no working-days setting', async () => {
    const monday = new Date('2026-11-30T15:00:00Z')
    state.lastAt = new Date('2026-11-27T20:00:00Z') // Friday
    state.nextAt = new Date('2026-12-02T15:00:00Z') // Wednesday
    state.recapRows = [{ patientId: 'p1', status: 'completed', firstName: 'Maria', lastName: 'Ramirez' }]
    audit.byOffset.set(2, [dayVisit({ appointmentId: 'c1' })])
    const view = await getHuddle(ORG, USER, { now: monday })
    expect(view.recap).toMatchObject({ dayLabel: 'Friday, November 27', isYesterday: false })
    expect(view.next).toMatchObject({ dayLabel: 'Wednesday, December 2', isTomorrow: false })
    expect(audit.calls.map((c) => c.dayOffset)).toEqual([0, 2])
  })

  it('says nothing about a day it cannot find', async () => {
    const view = await getHuddle(ORG, USER, { now: NOW })
    expect(view.recap).toBeNull()
    expect(view.next).toBeNull()
    expect(view.today.visits).toEqual([])
    // Only today was audited.
    expect(audit.calls.map((c) => c.dayOffset)).toEqual([0])
  })
})

describe('the Huddle — the recap', () => {
  it('counts what happened and welcomes a first visit — SEATED, and only someone with no real visit before', async () => {
    state.lastAt = new Date('2026-11-24T20:00:00Z')
    state.recapRows = [
      { patientId: 'p1', status: 'completed', firstName: 'Maria', lastName: 'Ramirez' },
      { patientId: 'p2', status: 'completed', firstName: 'Sam', lastName: 'Tran' },
      { patientId: 'p3', status: 'no_show', firstName: 'Jordan', lastName: 'Park' },
      { patientId: 'p4', status: 'cancelled', firstName: 'Alex', lastName: 'Kim' },
      { patientId: 'p5', status: 'scheduled', firstName: 'Riley', lastName: 'Fox' },
    ]
    state.priors = [{ patientId: 'p2' }] // Sam has been in before
    state.bookedOnline = 2
    sub.countActionsSince.mockResolvedValue({ reminder: 4 })
    const view = await getHuddle(ORG, USER, { now: NOW })

    const byKey = Object.fromEntries(view.recap!.lines.map((l) => [l.key, l]))
    expect(view.recap).toMatchObject({ dayLabel: 'Tuesday, November 24', isYesterday: true })
    // 4 not cancelled, 2 of them done.
    expect(byKey.happened.text).toBe('2 of 4 visits happened.')
    expect(byKey.first_visits.text).toMatch(/^Maria Ramirez had a first visit/)
    expect(byKey.first_visits.text).not.toMatch(/Sam/)
    expect(byKey.no_shows.text).toMatch(/^Jordan Park didn’t make it/)
    expect(byKey.unmarked.text).toMatch(/^1 visit still says scheduled/)
    expect(byKey.cancelled.text).toBe('1 visit was cancelled.')
    expect(byKey.booked_online.text).toBe('2 visits were booked online since.')
    expect(byKey.work.text).toMatch(/Dream Team handled/)

    // The prior-visit read asked only about the patients who were seated.
    const priors = state.wheres.find((w) => w.kind === 'priors')!
    expect(priors.sql).toContain('p1')
    expect(priors.sql).toContain('p2')
    expect(priors.sql).not.toContain('p3')
    // The ledger window opens at the recap day's clinic-local midnight.
    expect((sub.countActionsSince.mock.calls[0][1] as Date).toISOString()).toBe('2026-11-24T06:00:00.000Z')
  })

  it('a patient seated twice in a day is welcomed once', async () => {
    state.lastAt = new Date('2026-11-24T20:00:00Z')
    state.recapRows = [
      { patientId: 'p1', status: 'completed', firstName: 'Maria', lastName: 'Ramirez' },
      { patientId: 'p1', status: 'completed', firstName: 'Maria', lastName: 'Ramirez' },
    ]
    const view = await getHuddle(ORG, USER, { now: NOW })
    const first = view.recap!.lines.find((l) => l.key === 'first_visits')!
    expect(first.text.match(/Maria Ramirez/g)).toHaveLength(1)
  })
})

describe('the Huddle — strict at the centre, best-effort at the edges', () => {
  it('a failed recap, sync stamp, closures or inbox read costs only that part', async () => {
    state.lastAt = new Date('2026-11-24T20:00:00Z')
    state.fail.add('recap').add('sync')
    sub.listClosuresAhead.mockRejectedValue(new Error('closures down'))
    sub.getInboxStats.mockRejectedValue(new Error('inbox down'))
    sub.countOpenProposals.mockResolvedValue(2)
    audit.byOffset.set(0, [dayVisit()])
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const view = await getHuddle(ORG, USER, { now: NOW })
      expect(view.today.visits).toHaveLength(1)
      expect(view.recap).toBeNull()
      expect(view.source.text).toMatch(/The first sync has not finished yet/)
      expect(view.headsUp.map((l) => l.key)).toEqual(['proposals'])
    } finally {
      spy.mockRestore()
    }
  })

  it('a failed read of TODAY is not papered over — the schedule is the page', async () => {
    audit.failToday = true
    await expect(getHuddle(ORG, USER, { now: NOW })).rejects.toThrow('schedule read failed')
  })

  it('never nags about a closed door, and never even reads behind one', async () => {
    doors.state = { followups: false, leads: false }
    sub.getFollowupSummary.mockResolvedValue({ openTotal: 9, overdue: 5, dueToday: 4, preview: [] })
    state.newInquiries = 7
    const view = await getHuddle(ORG, USER, { now: NOW })
    expect(view.headsUp).toEqual([])
    expect(sub.getFollowupSummary).not.toHaveBeenCalled()
    expect(state.wheres.find((w) => w.kind === 'inquiries')).toBeUndefined()
  })

  it('says where the schedule comes from when nothing is connected', async () => {
    pms.link = { kind: 'none' }
    const view = await getHuddle(ORG, USER, { now: NOW })
    expect(view.source).toMatchObject({ href: '/integrations/pms', cta: 'Connect it' })
  })
})

describe('the Huddle — the morning email’s line', () => {
  it('is counts only, and absent on an empty day', async () => {
    expect(await getHuddleDigestLine(ORG, NOW)).toBeNull()
    audit.byOffset.set(0, [
      dayVisit({ flags: [{ key: 'no_intake', label: 'No intake form on file' }] }),
      dayVisit({ appointmentId: 'a2', patientName: 'Sam Tran' }),
    ])
    const line = await getHuddleDigestLine(ORG, NOW)
    expect(line).toBe('2 visits today — 1 needs a little prep.')
    expect(line).not.toMatch(/Maria|Sam/)
  })
})
