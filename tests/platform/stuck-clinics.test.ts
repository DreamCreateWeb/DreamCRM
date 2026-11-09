/**
 * ML-40 — "who is stuck?": the ONE predicate, the standing derivation, the
 * Overview's band service, and the per-clinic reads' tenant scoping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TrialState } from '@/lib/trial'
import {
  clinicIsStuck,
  clinicStanding,
  stuckReason,
  type ClinicStanding,
} from '@/lib/platform-clinic-status'

const NOW = new Date('2026-11-09T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
const NO_TRIAL: TrialState = { onTrial: false, expired: false, trialEndsAt: null, daysLeft: null }
const onTrial = (d: number): TrialState => ({ onTrial: true, expired: false, trialEndsAt: new Date(NOW.getTime() + d * 86_400_000), daysLeft: d })
const EXPIRED: TrialState = { onTrial: false, expired: true, trialEndsAt: daysAgo(30), daysLeft: 0 }

const standing = (subscriptionStatus: string | null, trial = NO_TRIAL, ownerInvitePending = false) =>
  clinicStanding({ subscriptionStatus, trial, ownerInvitePending })

describe('clinicStanding — derived from the wall, not the column', () => {
  it.each([
    ['trialing + expired trial', 'trialing', EXPIRED, false, 'walled'],
    ['trialing + live trial', 'trialing', onTrial(5), false, 'trial'],
    ['active', 'active', NO_TRIAL, false, 'live'],
    ['past_due', 'past_due', NO_TRIAL, false, 'past_due'],
    ['unpaid', 'unpaid', NO_TRIAL, false, 'past_due'],
    ['canceled', 'canceled', NO_TRIAL, false, 'churned'],
    ['no status', null, NO_TRIAL, false, 'churned'],
    ['invite not accepted', 'trialing', onTrial(6), true, 'invite_pending'],
  ] as const)('%s → %s', (_n, status, trial, invite, kind) => {
    expect(standing(status, trial, invite).kind).toBe(kind)
  })

  it('a trial inside two days warns; further out is info', () => {
    expect(standing('trialing', onTrial(2)).tone).toBe('warn')
    expect(standing('trialing', onTrial(5)).tone).toBe('info')
  })
})

describe('clinicIsStuck — the matrix', () => {
  const s = (kind: ClinicStanding['kind'], daysLeft: number | null = null): ClinicStanding => ({ kind, label: kind, tone: 'info', daysLeft })

  it('walled and past due are always stuck', () => {
    expect(clinicIsStuck(s('walled'), daysAgo(0), NOW)).toBe(true)
    expect(clinicIsStuck(s('past_due'), daysAgo(0), NOW)).toBe(true)
  })

  it('live, churned and invite-pending are never stuck, however quiet', () => {
    for (const k of ['live', 'churned', 'invite_pending'] as const) {
      expect(clinicIsStuck(s(k), daysAgo(90), NOW, { activated: false })).toBe(false)
    }
  })

  it('a trial ending in <=2 days with NO activation is stuck; with activation it is not', () => {
    expect(clinicIsStuck(s('trial', 2), daysAgo(0), NOW, { activated: false })).toBe(true)
    expect(clinicIsStuck(s('trial', 1), daysAgo(0), NOW, { activated: false })).toBe(true)
    expect(clinicIsStuck(s('trial', 2), daysAgo(0), NOW, { activated: true })).toBe(false)
    expect(clinicIsStuck(s('trial', 3), daysAgo(0), NOW, { activated: false })).toBe(false)
  })

  it('an unknown activation read never accuses', () => {
    expect(clinicIsStuck(s('trial', 1), daysAgo(0), NOW)).toBe(false)
  })

  it('a trial with no sign-in in 7 days is stuck — the boundary is inclusive at exactly 7', () => {
    expect(clinicIsStuck(s('trial', 5), daysAgo(7), NOW)).toBe(true)
    expect(clinicIsStuck(s('trial', 5), daysAgo(6.9), NOW)).toBe(false)
  })

  it('never signed in counts from creation; unknown creation is not an accusation', () => {
    expect(clinicIsStuck(s('trial', 5), null, NOW, { createdAt: daysAgo(8) })).toBe(true)
    expect(clinicIsStuck(s('trial', 5), null, NOW, { createdAt: daysAgo(3) })).toBe(false)
    expect(clinicIsStuck(s('trial', 5), null, NOW)).toBe(false)
  })

  it('stuckReason names the same case the predicate fired on, null when not stuck', () => {
    expect(stuckReason(s('walled'), null, NOW)).toMatch(/behind the wall/)
    expect(stuckReason(s('past_due'), null, NOW)).toMatch(/payment failed/)
    expect(stuckReason(s('trial', 1), daysAgo(0), NOW, { activated: false })).toMatch(/ends in 1 day, nothing connected/)
    expect(stuckReason(s('trial', 5), daysAgo(9), NOW)).toMatch(/signed in for a week/)
    expect(stuckReason(s('trial', 5), null, NOW, { createdAt: daysAgo(9) })).toMatch(/since it was created/)
    expect(stuckReason(s('live'), null, NOW)).toBeNull()
  })
})

// ── the band's service + tenant scoping ─────────────────────────────────────

const state = {
  wheres: [] as unknown[],
  selectQueue: [] as unknown[][],
  clinics: [] as unknown[],
  activation: new Map<string, { a1: Date | null }>(),
  activationReads: [] as string[],
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    for (const k of ['from', 'innerJoin', 'leftJoin', 'groupBy', 'orderBy']) obj[k] = () => obj
    obj.where = (clause: unknown) => {
      state.wheres.push(clause)
      return obj
    }
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return { db: { select: () => chain() }, schema }
})
vi.mock('@/lib/services/clinics', () => ({ listClinics: async () => state.clinics }))
vi.mock('@/lib/services/first-week', () => ({
  readMergedActivation: async (orgId: string) => {
    state.activationReads.push(orgId)
    return state.activation.get(orgId) ?? { a1: null }
  },
}))

function clinic(over: Record<string, unknown>) {
  return {
    orgId: 'org_x',
    name: 'X',
    displayName: null,
    isDemo: false,
    createdAt: daysAgo(2),
    subscriptionStatus: 'active',
    ownerInvitePending: false,
    trial: NO_TRIAL,
    ...over,
  }
}

describe('getNeedsAHand', () => {
  beforeEach(() => {
    state.wheres = []
    state.selectQueue = []
    state.activation = new Map()
    state.activationReads = []
  })

  it('names the stuck clinics, worst first, skips the demo and the healthy', async () => {
    const { getNeedsAHand } = await import('@/lib/services/platform-overview')
    state.clinics = [
      clinic({ orgId: 'org_live', name: 'Live', subscriptionStatus: 'active' }),
      clinic({ orgId: 'org_walled', name: 'Walled Co', subscriptionStatus: 'trialing', trial: EXPIRED }),
      clinic({ orgId: 'org_due', name: 'Due Co', subscriptionStatus: 'past_due' }),
      clinic({ orgId: 'org_demo', name: 'Demo', isDemo: true, subscriptionStatus: 'past_due' }),
      clinic({ orgId: 'org_quiet', name: 'Quiet Trial', subscriptionStatus: 'trialing', trial: onTrial(5), createdAt: daysAgo(2) }),
      clinic({ orgId: 'org_end', name: 'Ending Trial', subscriptionStatus: 'trialing', trial: onTrial(1) }),
    ]
    // last sign-ins: Quiet Trial signed in 9 days ago; Ending Trial yesterday.
    state.selectQueue = [[
      { orgId: 'org_quiet', at: daysAgo(9) },
      { orgId: 'org_end', at: daysAgo(1) },
    ]]
    const r = await getNeedsAHand(NOW)
    expect(r.unreadable).toBe(false)
    expect(r.rows.map((x) => x.orgId)).toEqual(['org_due', 'org_walled', 'org_end', 'org_quiet'])
    // activation is read only for the trial inside the window, for THAT org
    expect(state.activationReads).toEqual(['org_end'])
  })

  it('a trial that reached A1 is not stuck on its last days', async () => {
    const { getNeedsAHand } = await import('@/lib/services/platform-overview')
    state.clinics = [clinic({ orgId: 'org_end', trial: onTrial(1), subscriptionStatus: 'trialing' })]
    state.activation.set('org_end', { a1: daysAgo(1) })
    state.selectQueue = [[{ orgId: 'org_end', at: daysAgo(0) }]]
    expect((await getNeedsAHand(NOW)).rows).toEqual([])
  })

  it('the sign-in read is scoped to exactly the candidate orgs (never every org)', async () => {
    const { getNeedsAHand } = await import('@/lib/services/platform-overview')
    state.clinics = [
      clinic({ orgId: 'org_live', subscriptionStatus: 'active' }),
      clinic({ orgId: 'org_due', subscriptionStatus: 'past_due' }),
    ]
    state.selectQueue = [[]]
    await getNeedsAHand(NOW)
    expect(state.wheres).toHaveLength(1)
    const { PgDialect } = await import('drizzle-orm/pg-core')
    const q = new PgDialect().sqlToQuery(state.wheres[0] as any)
    const text = `${q.sql} ${JSON.stringify(q.params)}`
    expect(text).toContain('org_due')
    expect(text).not.toContain('org_live')
  })

  it('an unreadable sign-in read says so and does not guess about trials', async () => {
    const { getNeedsAHand } = await import('@/lib/services/platform-overview')
    state.clinics = [
      clinic({ orgId: 'org_due', subscriptionStatus: 'past_due' }),
      clinic({ orgId: 'org_trial', subscriptionStatus: 'trialing', trial: onTrial(5), createdAt: daysAgo(20) }),
    ]
    state.selectQueue = []
    const failing: any = { from: () => failing, innerJoin: () => failing, where: () => failing, groupBy: () => Promise.reject(new Error('pool')) }
    const { db } = await import('@/lib/db')
    const spy = vi.spyOn(db as any, 'select').mockReturnValueOnce(failing)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await getNeedsAHand(NOW)
    spy.mockRestore()
    errSpy.mockRestore()
    expect(r.unreadable).toBe(true)
    expect(r.rows.map((x) => x.orgId)).toEqual(['org_due'])
  })
})
