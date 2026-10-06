import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getFirstWeekBoard — the cockpit's service. Pins: one row per clinic, the
 * demo excluded unless asked; the readiness facts shown in the cockpit's
 * order; the five activation events read as FIRSTS from the rails (the
 * earliest of A1's three arms wins); stuck-first ordering; and the
 * best-effort law — a clinic whose readiness read throws still renders,
 * with no facts, rather than blanking the board.
 */

const NOW = new Date('2026-10-12T15:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

const state = {
  clinics: [] as Array<Record<string, unknown>>,
  readiness: new Map<string, unknown>(),
  readinessThrows: new Set<string>(),
  goals: new Map<string, Array<{ objective: string }>>(),
  proposals: new Map<string, Array<{ createdAt: Date }>>(),
  work: new Map<string, Record<string, number>>(),
  /** Rows per (table, org) for the raw reads; keyed by the drizzle table object. */
  rows: new Map<unknown, Array<Record<string, unknown>>>(),
}

vi.mock('@/lib/services/clinics', () => ({ listClinics: async () => state.clinics }))
vi.mock('@/lib/services/readiness', () => ({
  getReadinessReport: async (org: string) => {
    if (state.readinessThrows.has(org)) throw new Error('readiness down')
    return state.readiness.get(org) ?? null
  },
}))
vi.mock('@/lib/services/goals', () => ({ listActiveGoals: async (org: string) => state.goals.get(org) ?? [] }))
vi.mock('@/lib/services/proposals', () => ({ listOpenProposals: async (org: string) => state.proposals.get(org) ?? [] }))
vi.mock('@/lib/services/action-ledger', () => ({ countActionsSince: async (org: string) => state.work.get(org) ?? {} }))
vi.mock('@/lib/services/sms-registration', () => ({
  smsDriver: () => 'none',
  getSmsRegistration: async () => ({ state: 'none' }),
}))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    let table: unknown = null
    obj.from = (t: unknown) => {
      table = t
      return obj
    }
    obj.innerJoin = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.offset = () => obj
    obj.limit = async () => state.rows.get(table) ?? []
    return obj
  }
  return { schema, db: { select: () => chain() } }
})

import { getFirstWeekBoard, SHOWN_FACTS } from '@/lib/services/first-week'
import { schema } from '@/lib/db'

function clinic(orgId: string, overrides: Record<string, unknown> = {}) {
  return { orgId, name: `Clinic ${orgId}`, slug: orgId, isDemo: false, createdAt: daysAgo(5), patientCount: 0, subscriptionStatus: 'trialing', ...overrides }
}
function fact(id: string, grade = 'todo') {
  return { id, label: id.toUpperCase(), grade, summary: `${id} summary`, href: `/${id}` }
}

beforeEach(() => {
  state.clinics = []
  state.readiness.clear()
  state.readinessThrows.clear()
  state.goals.clear()
  state.proposals.clear()
  state.work.clear()
  state.rows.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getFirstWeekBoard', () => {
  it('one row per clinic, the demo excluded unless asked, the facts in the cockpit’s order', async () => {
    state.clinics = [clinic('org_a'), clinic('org_demo', { isDemo: true })]
    state.readiness.set('org_a', { facts: [fact('booking'), fact('pms', 'waiting'), fact('patients', 'ready'), fact('brand', 'ready')] })
    const board = await getFirstWeekBoard({ now: NOW })
    expect(board.rows.map((r) => r.orgId)).toEqual(['org_a'])
    // Only the shown facts, in SHOWN_FACTS order; `brand` is not a cockpit fact.
    expect(board.rows[0].facts.map((f) => f.id)).toEqual(['pms', 'patients', 'booking'])
    expect(SHOWN_FACTS[0]).toBe('pms')
    const withDemo = await getFirstWeekBoard({ now: NOW, includeDemo: true })
    expect(withDemo.rows.map((r) => r.orgId).sort()).toEqual(['org_a', 'org_demo'])
  })

  it('reads the five activation events as FIRSTS — A1 is the earliest of its three arms', async () => {
    state.clinics = [clinic('org_a', { createdAt: daysAgo(10) })]
    state.rows.set(schema.pmsConnection, [{ at: daysAgo(4), status: 'connected', since: daysAgo(4) }])
    state.rows.set(schema.zernioConnection, [{ at: daysAgo(8) }])
    state.rows.set(schema.patient, [{ at: daysAgo(6) }])
    state.rows.set(schema.appointmentReminderLog, [{ at: daysAgo(3) }])
    state.rows.set(schema.campaignEvents, [{ at: daysAgo(5) }])
    state.rows.set(schema.appointment, [{ at: daysAgo(2) }])
    state.rows.set(schema.reviewRequest, [{ at: null }])
    state.rows.set(schema.formSubmission, [{ at: daysAgo(1) }])
    const [row] = (await getFirstWeekBoard({ now: NOW })).rows
    expect(row.activation.a1).toEqual(daysAgo(8))
    expect(row.activation.a2).toEqual(daysAgo(5))
    expect(row.activation.a3).toEqual(daysAgo(2))
    expect(row.activation.a4).toBeNull()
    expect(row.activation.a5).toEqual(daysAgo(1))
    expect(row.progress).toEqual({ done: ['a1', 'a2', 'a3', 'a5'], next: 'a4' })
  })

  it('composes goal, work, open cards (oldest), doors and the staff sign-in; stuck rows sort first', async () => {
    state.clinics = [clinic('org_fine', { createdAt: daysAgo(1) }), clinic('org_stuck', { createdAt: daysAgo(9) })]
    state.goals.set('org_stuck', [{ objective: 'more implant patients' }])
    state.work.set('org_fine', { review_reply: 2, social_post: 1 })
    state.proposals.set('org_fine', [{ createdAt: daysAgo(1) }, { createdAt: daysAgo(2) }])
    state.rows.set(schema.clinicProfile, [{ insurance: daysAgo(1), digest: 1, siteLive: null }])
    state.rows.set(schema.session, [{ at: daysAgo(0) }])
    const board = await getFirstWeekBoard({ now: NOW })
    expect(board.rows.map((r) => r.orgId)).toEqual(['org_stuck', 'org_fine'])
    const stuck = board.rows[0]
    expect(stuck.goal).toBe('more implant patients')
    expect(stuck.stuck[0]).toMatch(/No data by day 9/)
    const fine = board.rows[1]
    expect(fine.workLast7).toBe(3)
    expect(fine.openCards).toBe(2)
    expect(fine.oldestOpenCardAt).toEqual(daysAgo(2))
    expect(fine.doors).toEqual({ insurance: true, digest: true, siteLive: false })
    expect(fine.lastStaffSignInAt).toEqual(daysAgo(0))
    expect(fine.stuck).toEqual([])
    expect(board.counts).toEqual({ inFirstMonth: 2, stuck: 1, noData: 2 })
  })

  it('best-effort: a clinic whose readiness read throws still renders, with no facts', async () => {
    state.clinics = [clinic('org_a')]
    state.readinessThrows.add('org_a')
    const board = await getFirstWeekBoard({ now: NOW })
    expect(board.rows).toHaveLength(1)
    expect(board.rows[0].facts).toEqual([])
  })
})

describe('getFirstWeekBoard — the PMS connect request (S4)', () => {
  it('an open request is pending on US, named by the system, and reaches the row', async () => {
    state.clinics = [{ orgId: 'org_r', name: 'Request Dental', slug: 'request-dental', isDemo: false, createdAt: daysAgo(9), patientCount: 0, subscriptionStatus: 'trialing' }]
    state.rows.set(schema.pmsConnectRequest, [
      { id: 'pmsreq_1', organizationId: 'org_r', vendor: 'eaglesoft', vendorName: null, practiceNameInPms: null, contactName: 'Ada', contactEmail: 'ada@example.com', contactPhone: null, bestTime: null, notes: null, status: 'requested', requestedByUserId: null, createdAt: daysAgo(6), updatedAt: daysAgo(6) },
    ])
    const board = await getFirstWeekBoard({ now: NOW })
    const row = board.rows.find((r) => r.orgId === 'org_r')!
    expect(row.pmsRequest).toEqual({ vendor: 'Eaglesoft', status: 'requested', at: daysAgo(6) })
    expect(row.pendingOnUs.map((p) => p.label)).toContain('Connecting Eaglesoft')
    // Six days on us clears the STUCK threshold (5): the owner is told.
    expect(row.stuck.some((s) => s.startsWith('Connecting Eaglesoft has been on us'))).toBe(true)
    state.rows.delete(schema.pmsConnectRequest)
  })
})
