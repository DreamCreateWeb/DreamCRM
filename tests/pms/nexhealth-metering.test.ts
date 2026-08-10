import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The cost-engineering seams of the NexHealth adapter (onboarding overhaul
 * §2.7), driven through mocked transport + meter so no network is touched:
 *  - `updated_since` delta pass-through (THE cost lever — a quiet hour is
 *    one call returning nothing, not a full multi-page pull)
 *  - the budget breaker runs before every list call in production and its
 *    refusal surfaces (a paused sync fails loudly, never silently)
 *  - sandbox is metered but never budget-limited
 *  - the per-call meter hook fires only when an org is bound
 */

const calls = {
  nexGetAll: [] as Array<{ resource: string; params: Record<string, unknown>; opts: Record<string, unknown> }>,
}
const { assertMock, recordMock } = vi.hoisted(() => ({
  assertMock: vi.fn(async () => undefined),
  recordMock: vi.fn(async () => undefined),
}))

vi.mock('@/lib/nexhealth', () => ({
  nexGetAll: vi.fn(async (resource: string, params: Record<string, unknown>, _key: string, opts: Record<string, unknown>) => {
    calls.nexGetAll.push({ resource, params, opts })
    return []
  }),
  listLocations: vi.fn(async () => []),
}))
vi.mock('@/lib/services/pms/api-meter', () => ({
  assertPmsApiBudget: assertMock,
  recordPmsApiCall: recordMock,
}))

import { NexHealthProvider } from '@/lib/services/pms/nexhealth'

const SINCE = new Date('2026-08-09T10:00:00Z')

function provider(over: Partial<{ env: 'production' | 'sandbox'; organizationId: string }> = {}) {
  return new NexHealthProvider({ subdomain: 'sub', locationId: 353605, ...over })
}

beforeEach(() => {
  calls.nexGetAll = []
  assertMock.mockClear()
  assertMock.mockResolvedValue(undefined)
  recordMock.mockClear()
})

describe('updated_since delta pass-through', () => {
  it('listPatients forwards the high-water mark as updated_since', async () => {
    await provider().listPatients({ since: SINCE })
    expect(calls.nexGetAll[0].params.updated_since).toBe(SINCE.toISOString())
  })

  it('cold start (no mark) omits updated_since — the one intentional full pull', async () => {
    await provider().listPatients()
    expect('updated_since' in calls.nexGetAll[0].params).toBe(false)
  })

  it('listAppointments keeps the wide schedule window AND adds updated_since', async () => {
    await provider().listAppointments({ since: SINCE })
    const p = calls.nexGetAll[0].params
    expect(p.updated_since).toBe(SINCE.toISOString())
    expect(typeof p.start).toBe('string')
    expect(typeof p.end).toBe('string')
    // ~90d back, ~365d forward
    expect(new Date(p.start as string).getTime()).toBeLessThan(Date.now())
    expect(new Date(p.end as string).getTime()).toBeGreaterThan(Date.now() + 300 * 24 * 3600_000)
  })
})

describe('the budget breaker', () => {
  it('checks the budget before a production list call for a bound org', async () => {
    await provider({ env: 'production', organizationId: 'org_1' }).listPatients()
    expect(assertMock).toHaveBeenCalledWith('org_1')
  })

  it('a breaker refusal propagates — the sync fails loudly instead of the bill', async () => {
    assertMock.mockRejectedValueOnce(new Error('budget reached'))
    await expect(provider({ env: 'production', organizationId: 'org_1' }).listPatients()).rejects.toThrow(
      'budget reached',
    )
    // Refused BEFORE any HTTP went out.
    expect(calls.nexGetAll).toHaveLength(0)
  })

  it('sandbox is never budget-limited (free calls, the tuning fixture)', async () => {
    await provider({ env: 'sandbox', organizationId: 'org_demo' }).listPatients()
    expect(assertMock).not.toHaveBeenCalled()
  })

  it('unbound (no org) is never budget-limited — tests and probes stay free of the meter', async () => {
    await provider({ env: 'production' }).listPatients()
    expect(assertMock).not.toHaveBeenCalled()
  })
})

describe('the per-call meter hook', () => {
  it('bound org: opts carry onCall, and firing it records against that org (sandbox included — tuning data)', async () => {
    await provider({ env: 'sandbox', organizationId: 'org_demo' }).listPatients()
    const onCall = calls.nexGetAll[0].opts.onCall as (() => Promise<void>) | undefined
    expect(typeof onCall).toBe('function')
    await onCall!()
    expect(recordMock).toHaveBeenCalledWith('org_demo')
  })

  it('unbound: no hook is attached', async () => {
    await provider().listPatients()
    expect(calls.nexGetAll[0].opts.onCall).toBeUndefined()
  })
})
