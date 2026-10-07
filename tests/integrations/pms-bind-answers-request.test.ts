import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A BIND IS THE PLATFORM'S ANSWER (docs/ACTIVATION.md S4, audit round 1).
 * S4's front door wrote a `pms_connect_request` row and S1's cockpit counted
 * the days it sat "pending on us" — and nothing ever wrote its status. So a
 * request stayed "we're connecting it" after the bridge was bound, and came
 * back as pending on us after any later disconnect. `upsertPmsConnection`
 * now stamps the request 'connected' on every connected bind; a non-connected
 * write (an error status) leaves the request alone; a failed stamp never
 * fails the bind.
 */

const state = { status: [] as Array<[string, string]>, statusThrows: false, writes: 0, closed: [] as string[] }
vi.mock('@/lib/services/pms-connect', () => ({
  setPmsConnectRequestStatus: async (org: string, status: string) => {
    if (state.statusThrows) throw new Error('request table down')
    state.status.push([org, status])
    return true
  },
  closeConnectedPmsRequest: async (org: string) => {
    if (state.statusThrows) throw new Error('request table down')
    state.closed.push(org)
    return true
  },
}))
vi.mock('@/lib/services/pms/open-dental', () => ({ OpenDentalProvider: class {}, openDentalConfigured: () => false }))
vi.mock('@/lib/crypto', () => ({ encryptSecret: (s: string) => s }))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const insert = () => ({ values: () => ({ onConflictDoUpdate: async () => { state.writes++ } }) })
  const update = () => ({ set: () => ({ where: async () => { state.writes++ } }) })
  return { schema, db: { insert, update } }
})

import { disconnectPms, upsertPmsConnection } from '@/lib/services/pms/connection'

beforeEach(() => {
  state.status = []
  state.statusThrows = false
  state.writes = 0
  state.closed = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('upsertPmsConnection answers the connect request', () => {
  it('a connected bind (the default status) stamps the request connected', async () => {
    await upsertPmsConnection('org_a', { provider: 'nexhealth' })
    expect(state.writes).toBe(1)
    expect(state.status).toEqual([['org_a', 'connected']])
  })

  it('an explicit connected status stamps it too; an error status does not', async () => {
    await upsertPmsConnection('org_a', { provider: 'nexhealth', status: 'connected' })
    await upsertPmsConnection('org_a', { provider: 'nexhealth', status: 'error', lastError: 'boom' })
    expect(state.status).toEqual([['org_a', 'connected']])
    expect(state.writes).toBe(2)
  })

  it('a disconnect closes a request the bind had marked connected — the door stops saying "connected and syncing" (audit round 2)', async () => {
    await disconnectPms('org_a')
    expect(state.writes).toBe(1)
    expect(state.closed).toEqual(['org_a'])
    state.statusThrows = true
    await expect(disconnectPms('org_a')).resolves.toBeUndefined()
  })

  it('a failed stamp never fails the bind', async () => {
    state.statusThrows = true
    await expect(upsertPmsConnection('org_a', { provider: 'nexhealth' })).resolves.toBeUndefined()
    expect(state.writes).toBe(1)
  })
})
