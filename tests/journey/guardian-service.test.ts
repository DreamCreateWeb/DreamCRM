import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE GUARDIAN's sweep (Transformation Phase 4). Pins the scope laws —
 * clinic orgs only, never the demo org, worst first, one clinic's failure
 * never blinds the rest — and that the ledger counts are read per org.
 */

const store: {
  orgs: Array<Record<string, unknown>>
  ledger: Array<Record<string, unknown>>
  ledgerThrows: boolean
} = { orgs: [], ledger: [], ledgerThrows: false }

const deps = vi.hoisted(() => ({
  switches: new Map<string, { remindersOn: boolean; reviewRequestsOn: boolean }>(),
  seated: new Map<string, number[]>(), // orgId → [thisMonth, prevMonth]
  openProposals: 0,
  seatedCalls: [] as string[],
  throwFor: null as string | null,
}))

vi.mock('@/lib/services/engine-switches', () => ({
  readEngineSwitches: vi.fn(async (orgId: string) => {
    if (deps.throwFor === orgId) throw new Error('unreadable')
    return deps.switches.get(orgId) ?? { remindersOn: true, reviewRequestsOn: true }
  }),
}))
vi.mock('@/lib/services/patient-journey', () => ({
  countSeatedBetween: vi.fn(async (orgId: string) => {
    deps.seatedCalls.push(orgId)
    // Fail only the CURRENT-month read, which is the asymmetric case that
    // used to fabricate a 100% drop.
    if (deps.throwFor === `${orgId}:this` && deps.seatedCalls.filter((c) => c === orgId).length === 1) {
      throw new Error('unreadable')
    }
    const pair = deps.seated.get(orgId) ?? [5, 5]
    // First call in a pass is the current month, second the prior one.
    const n = deps.seatedCalls.filter((c) => c === orgId).length
    return n === 1 ? pair[0] : pair[1]
  }),
}))
vi.mock('@/lib/services/proposals', () => ({
  countOpenProposals: vi.fn(async () => deps.openProposals),
}))

vi.mock('@/lib/db', () => {
  const col = (name: string) => ({ __col: name })
  function select(cols?: Record<string, unknown>) {
    let table = ''
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = (t: { __name: string }) => { table = t.__name; return api }
    // The org read LEFT JOINs clinic_profile for the lifecycle columns; the
    // fixture carries them on the org row, so the join is a no-op here.
    api.leftJoin = () => api
    api.where = (preds: unknown) => {
      // Only FUNCTION predicates are row filters. Raw `sql` fragments
      // (failureOnly() and friends) arrive as opaque objects; pushing them
      // made `filters.every(f => f(r))` throw — which the explainer's own
      // catch swallowed, so it silently returned [] and looked tested
      // (round-8 audit).
      const list = Array.isArray(preds) ? preds : [preds]
      for (const p of list) if (typeof p === 'function') filters.push(p as never)
      return api
    }
    const rows = () =>
      (table === 'organization' ? store.orgs : store.ledger).filter((r) => filters.every((f) => f(r)))
    // The grouped ledger read: model the FILTER aggregates the service asks
    // for, so the work/failure split is really exercised rather than stubbed.
    // ROUND-8 AUDIT: this mock had no orderBy/limit, so recentFailureSummaries
    // threw a TypeError straight into its own catch and returned [] in EVERY
    // sweep test — the owner's "What it tried" list had zero executed
    // coverage, and both the round-6 day fix and the round-7 timezone fix
    // could be reverted at that site with the suite still green.
    api.orderBy = () => api
    api.limit = async (n?: number) => {
      const out = rows()
      return typeof n === 'number' ? out.slice(0, n) : out
    }
    api.groupBy = async () => {
      if (store.ledgerThrows) throw new Error('aggregate timed out')
      const byOrg = new Map<string, { organizationId: string; work: number; failures: number }>()
      for (const r of rows()) {
        const detail = (r.detail ?? {}) as Record<string, unknown>
        const orgId = String(r.organizationId)
        const acc = byOrg.get(orgId) ?? { organizationId: orgId, work: 0, failures: 0 }
        const isFailure = detail.failure === true || detail.autoFailure === true
        // Mirror the real aggregate: count(distinct date_trunc('day', …)).
        // A mock that counts ROWS is exactly how the burst defect stayed
        // invisible for three rounds.
        if (isFailure) {
          const day = new Date(r.occurredAt as Date).toISOString().slice(0, 10)
          const seen = (acc as unknown as { _days?: Set<string> })._days ?? new Set<string>()
          seen.add(day)
          ;(acc as unknown as { _days: Set<string> })._days = seen
          acc.failures = seen.size
        }
        else if (detail.autonomyChange === undefined) acc.work++
        byOrg.set(orgId, acc)
      }
      return Array.from(byOrg.values())
    }
    api.then = (resolve: (v: unknown) => void) => {
      const out = rows()
      resolve(cols ? out.map((r) => Object.fromEntries(Object.keys(cols).map((k) => [k, r[k]]))) : out)
    }
    return api
  }
  return {
    db: { select },
    schema: {
      organization: {
        __name: 'organization',
        id: col('id'),
        name: col('name'),
        type: col('type'),
        isDemo: col('isDemo'),
        createdAt: col('createdAt'),
      },
      clinicProfile: {
        __name: 'clinic_profile',
        organizationId: col('organizationId'),
        trialEndsAt: col('trialEndsAt'),
        subscriptionStatus: col('subscriptionStatus'),
        stripeSubscriptionId: col('stripeSubscriptionId'),
      },
      actionLedger: {
        __name: 'action_ledger',
        organizationId: col('organizationId'),
        occurredAt: col('occurredAt'),
        detail: col('detail'),
      },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (c: { __col: string }, v: unknown) => (r: Record<string, unknown>) => r[c.__col] === v,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  gte: (c: { __col: string }, v: Date) => (r: Record<string, unknown>) =>
    r[c.__col] instanceof Date && (r[c.__col] as Date) >= v,
  lt: (c: { __col: string }, v: Date) => (r: Record<string, unknown>) =>
    r[c.__col] instanceof Date && (r[c.__col] as Date) < v,
  desc: () => 'desc',
  sql: Object.assign(() => 'sql', { raw: () => 'sql', join: () => 'sql' }),
}))

import { sweepEngineHealth } from '@/lib/services/guardian'

const NOW = new Date('2026-07-29T12:00:00Z')
/** Comfortably past NEW_CLINIC_GRACE_DAYS. */
const OLD = new Date('2025-01-01T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const old = (days: number) => new Date(NOW.getTime() - days * DAY)

function seedOrg(id: string, name: string, over: Record<string, unknown> = {}) {
  store.orgs.push({ id, name, type: 'clinic', isDemo: false, createdAt: old(200), ...over })
}
function seedWork(orgId: string, daysAgo: number, n = 1) {
  for (let i = 0; i < n; i++) {
    store.ledger.push({ organizationId: orgId, occurredAt: old(daysAgo), detail: null })
  }
}
/** `n` failures on n CONSECUTIVE DAYS starting at `daysAgo`. The alarm
 *  counts distinct days, so a fixture that piles n rows onto one timestamp
 *  no longer means what its callers intend (verification round 3). */
function seedFailure(orgId: string, daysAgo: number, n = 1) {
  for (let i = 0; i < n; i++) {
    store.ledger.push({ organizationId: orgId, occurredAt: old(daysAgo + i), detail: { failure: true } })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.orgs = []
  store.ledger = []
  store.ledgerThrows = false
  deps.switches = new Map()
  deps.seated = new Map()
  deps.seatedCalls = []
  deps.openProposals = 0
  deps.throwFor = null
})

describe('sweepEngineHealth', () => {
  it('watches clinic orgs and NEVER the demo org — its engines are excluded from every cron, so it would report as permanently silent', async () => {
    seedOrg('org_live', 'Bright Smiles')
    seedWork('org_live', 2, 10)
    seedOrg('org_demo', 'Dream Dental', { isDemo: true })
    seedOrg('org_platform', 'Dream Create', { type: 'platform' })

    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports.map((r) => r.organizationId)).toEqual(['org_live'])
  })

  it('splits WORK from FAILURES per org — counting a failure as work would make a broken clinic look busy', async () => {
    seedOrg('org_a', 'Ash Dental')
    seedWork('org_a', 1, 4)
    seedFailure('org_a', 1, 3)

    const sweep = await sweepEngineHealth(NOW)
    const r = sweep.reports[0]
    expect(r.signals.actions7).toBe(4)
    expect(r.signals.failures7).toBe(3)
    expect(r.verdict.state).toBe('blocked')
  })

  it('reads the two weekly windows separately — last week vs the week before', async () => {
    seedOrg('org_a', 'Ash Dental')
    seedWork('org_a', 10, 6) // the prior week only

    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports[0].signals.actions7).toBe(0)
    expect(sweep.reports[0].signals.actionsPrev7).toBe(6)
    // One empty week after a normal one is quiet, not silent.
    expect(sweep.reports[0].verdict.state).toBe('quiet')
  })

  it('sorts worst first and flags only what needs a human', async () => {
    seedOrg('org_ok', 'Anchor Dental')
    seedWork('org_ok', 1, 20)
    seedOrg('org_silent', 'Beacon Dental')
    seedOrg('org_blocked', 'Cedar Dental')
    seedWork('org_blocked', 1, 2)
    seedFailure('org_blocked', 1, 4)

    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports.map((r) => r.verdict.state)).toEqual(['silent', 'blocked', 'healthy'])
    expect(sweep.flagged.map((r) => r.clinicName)).toEqual(['Beacon Dental', 'Cedar Dental'])
    expect(sweep.summary).toBe('2 of 3 practices need you.')
  })

  it('one unreadable clinic never blinds the sweep — going blind is the failure this exists to prevent', async () => {
    seedOrg('org_bad', 'Broken Dental')
    seedOrg('org_good', 'Fine Dental')
    seedWork('org_good', 1, 5)
    deps.throwFor = 'org_bad'
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports.map((r) => r.clinicName)).toEqual(['Fine Dental'])
    err.mockRestore()
  })

  it('a clinic with no orgs at all says so quietly', async () => {
    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports).toEqual([])
    expect(sweep.summary).toBe('No clinics to watch yet.')
  })

  it('a missing createdAt reads as long-established — a null column must never suppress a real alarm', async () => {
    seedOrg('org_a', 'Ash Dental', { createdAt: null })
    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports[0].signals.ageDays).toBeGreaterThan(1000)
    expect(sweep.reports[0].verdict.state).toBe('silent')
  })
})

/**
 * ROUND-2 AUDIT. Three sweep-level guards that shipped with no test: the
 * lifecycle filter (round-1 fix #13), and two `.catch(() => 0)` paths that
 * turned an unreadable database into a confident false claim.
 */
describe('the sweep does not invent findings out of failures', () => {
  it('a CHURNED clinic is not watched — nothing can run for them', async () => {
    store.orgs = [
      { id: 'org_live', name: 'Live Dental', type: 'clinic', isDemo: false, createdAt: OLD,
        trialEndsAt: null, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' },
      { id: 'org_gone', name: 'Gone Dental', type: 'clinic', isDemo: false, createdAt: OLD,
        // Trial ended, never subscribed — behind the billing wall.
        trialEndsAt: new Date(NOW.getTime() - 60 * 86400000), subscriptionStatus: null,
        stripeSubscriptionId: null },
    ]
    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports.map((r) => r.clinicName)).toEqual(['Live Dental'])
  })

  it('an unreadable LEDGER reports nothing rather than calling every practice silent', async () => {
    // The worst possible failure mode: one timed-out aggregate would
    // otherwise flag every clinic on the platform as `silent`, email the
    // owner about all of them, and write 'silent' into every alert memory
    // so the real recovery reads as a state change and alerts again.
    store.ledgerThrows = true
    store.orgs = [
      { id: 'org_a', name: 'Ash Dental', type: 'clinic', isDemo: false, createdAt: OLD,
        trialEndsAt: null, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' },
    ]
    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports).toHaveLength(0)
    expect(sweep.flagged).toHaveLength(0)
    // ...and it says so, rather than reporting a cheerful all-clear.
    expect(sweep.summary).toMatch(/could not read/i)
  })
})

describe('an unreadable month is never a stall', () => {
  it('a failed CURRENT-month seated read does not become a 100% drop', async () => {
    // Round-2 fixed this and round-3 found it untested. `.catch(() => 0)`
    // turned an unreadable current month into "new patients are down 100%
    // — 12 the month before, 0 this past month", fabricated numbers emailed
    // to the owner. A number we could not read is not a number we report.
    deps.seated.set('org_a', [0, 12])
    deps.throwFor = 'org_a:this'
    store.orgs = [
      { id: 'org_a', name: 'Ash Dental', type: 'clinic', isDemo: false, createdAt: OLD,
        trialEndsAt: null, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' },
    ]
    store.ledger = [{ organizationId: 'org_a', occurredAt: NOW, detail: {} }]

    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports[0].verdict.state).not.toBe('stalled')
  })
})

/**
 * VERIFICATION ROUND 3. `recordFailure`'s once-a-day window only throttles
 * the `failure` half of the vocabulary; the Phase-3 hand-back writes
 * `autoFailure` with no throttle, and the granted-card loop hands back every
 * open card in ONE tick. Counting rows let a two-hour outage pin a practice
 * to `blocked` for the whole trailing week. The alarm counts DAYS.
 */
describe('failures7 counts days of breakage, not rows', () => {
  it('a burst of hand-backs in one instant is ONE bad day', async () => {
    const t = new Date('2026-07-28T09:00:00Z')
    store.orgs = [
      { id: 'org_a', name: 'Ash Dental', type: 'clinic', isDemo: false, createdAt: OLD,
        trialEndsAt: null, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' },
    ]
    // Five cards handed back in the same tick — one outage, not five days.
    store.ledger = [
      ...Array.from({ length: 5 }, () => ({
        organizationId: 'org_a', occurredAt: t, detail: { autoFailure: true },
      })),
      { organizationId: 'org_a', occurredAt: t, detail: {} },
    ]

    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports[0].signals.failures7).toBe(1)
    expect(sweep.reports[0].verdict.state).not.toBe('blocked')
  })

  it('breakage on three separate days IS the alarm', async () => {
    store.orgs = [
      { id: 'org_a', name: 'Ash Dental', type: 'clinic', isDemo: false, createdAt: OLD,
        trialEndsAt: null, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' },
    ]
    store.ledger = ['2026-07-26', '2026-07-27', '2026-07-28'].map((d) => ({
      organizationId: 'org_a', occurredAt: new Date(`${d}T09:00:00Z`), detail: { failure: true },
    }))

    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports[0].signals.failures7).toBe(3)
    expect(sweep.reports[0].verdict.state).toBe('blocked')
  })
})

/**
 * THE OWNER'S "WHAT IT TRIED" LIST (round-8 audit). It had ZERO executed
 * coverage: the select mock lacked orderBy/limit, so it threw into its own
 * catch and returned [] in every sweep. Both the round-6 day-counting fix
 * and the round-7 timezone fix lived at a SECOND, untested site.
 */
describe('the failure explainer actually runs, and counts days', () => {
  const org = {
    id: 'org_a', name: 'Ash Dental', type: 'clinic', isDemo: false, createdAt: OLD,
    trialEndsAt: null, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1',
    timezone: 'America/New_York',
  }

  it('names what broke, and a burst on one day counts as one day', async () => {
    store.orgs = [org]
    const t = new Date('2026-07-28T13:00:00Z')
    store.ledger = [
      // Three cards handed back in ONE instant — one bad day, not three.
      ...Array.from({ length: 3 }, () => ({
        organizationId: 'org_a', capability: 'social_post', occurredAt: t,
        detail: { failure: true, failureKind: 'hand_back' },
        day: '2026-07-28',
      })),
      { organizationId: 'org_a', capability: 'social_post', occurredAt: new Date('2026-07-27T13:00:00Z'),
        detail: { failure: true, failureKind: 'engine' }, day: '2026-07-27' },
    ]

    const sweep = await sweepEngineHealth(NOW)
    const causes = sweep.reports[0].failureCauses
    expect(causes.length, 'the explainer returned nothing — is it throwing again?').toBeGreaterThan(0)
    expect(causes[0]).toMatch(/2 days/)
    // Owner-voiced label, never the clinic-addressed ledger sentence.
    expect(causes[0]).not.toMatch(/you|your/i)
  })

  it('says nothing when nothing failed — no empty section on a healthy report', async () => {
    store.orgs = [org]
    store.ledger = [{ organizationId: 'org_a', occurredAt: NOW, detail: {} }]
    const sweep = await sweepEngineHealth(NOW)
    expect(sweep.reports[0].failureCauses).toEqual([])
  })
})
