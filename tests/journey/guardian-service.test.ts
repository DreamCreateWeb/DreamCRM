import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE GUARDIAN's sweep (Transformation Phase 4). Pins the scope laws —
 * clinic orgs only, never the demo org, worst first, one clinic's failure
 * never blinds the rest — and that the ledger counts are read per org.
 */

const store: {
  orgs: Array<Record<string, unknown>>
  ledger: Array<Record<string, unknown>>
} = { orgs: [], ledger: [] }

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
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    const rows = () =>
      (table === 'organization' ? store.orgs : store.ledger).filter((r) => filters.every((f) => f(r)))
    // The grouped ledger read: model the FILTER aggregates the service asks
    // for, so the work/failure split is really exercised rather than stubbed.
    api.groupBy = async () => {
      const byOrg = new Map<string, { organizationId: string; work: number; failures: number }>()
      for (const r of rows()) {
        const detail = (r.detail ?? {}) as Record<string, unknown>
        const orgId = String(r.organizationId)
        const acc = byOrg.get(orgId) ?? { organizationId: orgId, work: 0, failures: 0 }
        const isFailure = detail.failure === true || detail.autoFailure === true
        if (isFailure) acc.failures++
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
  sql: () => 'sql',
}))

import { sweepEngineHealth } from '@/lib/services/guardian'

const NOW = new Date('2026-07-29T12:00:00Z')
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
function seedFailure(orgId: string, daysAgo: number, n = 1) {
  for (let i = 0; i < n; i++) {
    store.ledger.push({ organizationId: orgId, occurredAt: old(daysAgo), detail: { failure: true } })
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.orgs = []
  store.ledger = []
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
