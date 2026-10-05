import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE DAY-ONE KICK (docs/ACTIVATION.md law 5, S2). Pins: it runs the SAME
 * per-org pass the cron runs, for one clinic, now; clinics only (never the
 * platform org, never the demo, never a shut-down clinic); the heartbeat
 * cooldown; A1 stamped at once for a PMS or Google connect and only past
 * the patient floor for a CSV; and the never-throws law — a broken pass
 * returns `failed`, it does not reach the import that called it.
 */

const NOW = new Date('2026-10-12T15:00:00Z')
const state = {
  org: [{ id: 'org_a', name: 'Acme Dental', type: 'clinic', isDemo: false }] as Array<Record<string, unknown>>,
  profile: [{ cycleAt: null as Date | null }],
  patients: [{ n: 40 }],
  shutDown: false,
  stampResult: true,
  passThrows: false,
}
const runOrgGeneratorPass = vi.fn(async () => {
  if (state.passThrows) throw new Error('pass down')
  return { orgsScanned: 1, filed: 2, expired: 0, autoExecuted: 0, errors: [], failuresRecorded: 0 }
})
const stampActivation = vi.fn(async () => state.stampResult)
vi.mock('@/lib/services/proposal-generators', () => ({ runOrgGeneratorPass: (...a: unknown[]) => runOrgGeneratorPass(...(a as [])) }))
vi.mock('@/lib/services/activation', () => ({ stampActivation: (...a: unknown[]) => stampActivation(...(a as [])) }))
const openDoorsAtA1 = vi.fn(async () => ['my_day', 'followups'])
vi.mock('@/lib/services/feature-switches', () => ({ openDoorsAtA1: (...a: unknown[]) => openDoorsAtA1(...(a as [])) }))
vi.mock('@/lib/services/billing-state', () => ({ isClinicShutDown: async () => state.shutDown }))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    let table: unknown = null
    obj.from = (t: unknown) => {
      table = t
      return obj
    }
    obj.where = () => obj
    obj.limit = async () => {
      if (table === schema.organization) return state.org
      if (table === schema.clinicProfile) return state.profile
      if (table === schema.patient) return state.patients
      return []
    }
    return obj
  }
  return { schema, db: { select: () => chain() } }
})

import { kickOffFirstWeek, KICK_COOLDOWN_MS, scheduleKick } from '@/lib/services/day-one-kick'

beforeEach(() => {
  state.org = [{ id: 'org_a', name: 'Acme Dental', type: 'clinic', isDemo: false }]
  state.profile = [{ cycleAt: null }]
  state.patients = [{ n: 40 }]
  state.shutDown = false
  state.stampResult = true
  state.passThrows = false
  runOrgGeneratorPass.mockClear()
  stampActivation.mockClear()
  openDoorsAtA1.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('kickOffFirstWeek', () => {
  it('runs the per-org pass now for a clinic whose PMS just synced, and stamps A1 the first time', async () => {
    const r = await kickOffFirstWeek('org_a', 'pms_synced', { now: NOW })
    expect(r).toEqual({ ran: true, reason: 'pms_synced', why: 'ran', stampedA1: true, filed: 2 })
    expect(runOrgGeneratorPass).toHaveBeenCalledWith({ id: 'org_a', name: 'Acme Dental' }, NOW)
    expect(stampActivation).toHaveBeenCalledWith('org_a', 'a1', NOW)
  })

  it('still runs when A1 was stamped before — a second source on day 12 earns its card now', async () => {
    state.stampResult = false
    const r = await kickOffFirstWeek('org_a', 'gbp_connected', { now: NOW })
    expect(r.ran).toBe(true)
    expect(r.stampedA1).toBe(false)
  })

  it('a CSV stamps A1 only once the roster clears the floor, but runs the pass either way', async () => {
    state.patients = [{ n: 3 }]
    const small = await kickOffFirstWeek('org_a', 'patients_imported', { now: NOW })
    expect(stampActivation).not.toHaveBeenCalled()
    expect(openDoorsAtA1).not.toHaveBeenCalled()
    expect(small.ran).toBe(true)
    state.patients = [{ n: 25 }]
    await kickOffFirstWeek('org_a', 'patients_imported', { now: NOW })
    expect(stampActivation).toHaveBeenCalledTimes(1)
    // A1 opens the doors the data makes real (S3) — on every eligible
    // kick, not only the first stamp (the service's coalesce keeps it idempotent).
    expect(openDoorsAtA1).toHaveBeenCalledWith('org_a', NOW)
  })

  it('clinics only: the platform org, the demo and a shut-down clinic get no pass', async () => {
    state.org = [{ id: 'org_p', name: 'Dream Create', type: 'platform', isDemo: false }]
    expect((await kickOffFirstWeek('org_p', 'pms_synced', { now: NOW })).why).toBe('not_a_clinic')
    state.org = [{ id: 'org_d', name: 'Dream Dental', type: 'clinic', isDemo: true }]
    expect((await kickOffFirstWeek('org_d', 'pms_synced', { now: NOW })).why).toBe('demo')
    state.org = [{ id: 'org_a', name: 'Acme', type: 'clinic', isDemo: false }]
    state.shutDown = true
    expect((await kickOffFirstWeek('org_a', 'pms_synced', { now: NOW })).why).toBe('shut_down')
    state.org = []
    expect((await kickOffFirstWeek('org_zzz', 'pms_synced', { now: NOW })).why).toBe('not_a_clinic')
    expect(runOrgGeneratorPass).not.toHaveBeenCalled()
    expect(stampActivation).not.toHaveBeenCalled()
  })

  it('the heartbeat cooldown: a pass inside the last 15 minutes means skip (the stamp still lands)', async () => {
    state.profile = [{ cycleAt: new Date(NOW.getTime() - KICK_COOLDOWN_MS + 1000) }]
    const r = await kickOffFirstWeek('org_a', 'pms_synced', { now: NOW })
    expect(r.why).toBe('cooldown')
    expect(r.stampedA1).toBe(true)
    expect(runOrgGeneratorPass).not.toHaveBeenCalled()
    state.profile = [{ cycleAt: new Date(NOW.getTime() - KICK_COOLDOWN_MS - 1000) }]
    expect((await kickOffFirstWeek('org_a', 'pms_synced', { now: NOW })).why).toBe('ran')
  })

  it('never throws: a broken pass is `failed`, and scheduleKick swallows it entirely', async () => {
    state.passThrows = true
    const r = await kickOffFirstWeek('org_a', 'pms_synced', { now: NOW })
    expect(r.why).toBe('failed')
    expect(() => scheduleKick('org_a', 'pms_synced')).not.toThrow()
    await new Promise((res) => setTimeout(res, 0))
  })
})
