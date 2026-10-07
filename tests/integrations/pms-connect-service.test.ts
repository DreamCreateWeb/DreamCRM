import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE PMS CONNECT REQUEST's server half (docs/ACTIVATION.md S4). Pins: one
 * row per clinic (an upsert on the org, re-opening a closed request and
 * keeping a connected one connected); the request is POSTED INTO THE
 * CLINIC'S SUPPORT THREAD as the requester (that is how the platform
 * hears it); a failed post never loses the row; and the read maps the row
 * with an unknown status read as 'requested'.
 */

const NOW = new Date('2026-10-12T15:00:00Z')
const state = {
  rows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  upsertSet: null as null | Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  supportThrows: false,
}
const getSupportThread = vi.fn(async () => ({ conversationId: 42, messages: [] }))
const postMessage = vi.fn(async () => {
  if (state.supportThrows) throw new Error('support down')
})
vi.mock('@/lib/services/messages', () => ({
  getSupportThread: (...a: unknown[]) => getSupportThread(...(a as [])),
  postMessage: (...a: unknown[]) => postMessage(...(a as [])),
}))
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const select = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.rows
    return obj
  }
  const insert = () => ({
    values: (v: Record<string, unknown>) => ({
      onConflictDoUpdate: (c: { set: Record<string, unknown> }) => ({
        returning: async () => {
          state.inserted.push(v)
          state.upsertSet = c.set
          return [{ ...v, status: 'requested' }]
        },
      }),
    }),
  })
  const update = () => ({
    set: (patch: Record<string, unknown>) => ({
      where: () => ({ returning: async () => { state.updates.push(patch); return [{ id: 'x' }] } }),
    }),
  })
  return { schema, db: { select, insert, update } }
})

import { closeConnectedPmsRequest, getPmsConnectRequest, setPmsConnectRequestStatus, submitPmsConnectRequest } from '@/lib/services/pms-connect'

const input = { vendor: 'open_dental', vendorName: null, practiceNameInPms: 'Smiles PC', contactName: 'Ada', contactEmail: 'ada@example.com', contactPhone: null, bestTime: 'morning', notes: null }

beforeEach(() => {
  state.rows = []
  state.inserted = []
  state.upsertSet = null
  state.updates = []
  state.supportThrows = false
  getSupportThread.mockClear()
  postMessage.mockClear()
})

describe('submitPmsConnectRequest', () => {
  it('upserts one row per clinic and posts the request into the support thread as the requester', async () => {
    const view = await submitPmsConnectRequest({ organizationId: 'org_a', userId: 'user_1', clinicName: 'All About Smiles', input, now: NOW })
    expect(view.vendor).toBe('open_dental')
    expect(view.status).toBe('requested')
    expect(state.inserted[0]).toMatchObject({ organizationId: 'org_a', vendor: 'open_dental', requestedByUserId: 'user_1', status: 'requested' })
    expect(String(state.inserted[0].id)).toMatch(/^pmsreq_/)
    // The upsert keeps the details fresh and re-opens; `status` is the
    // case expression (connected stays connected), never a bare string.
    expect(state.upsertSet).toMatchObject({ vendor: 'open_dental', requestedByUserId: 'user_1' })
    const chunks = (state.upsertSet!.status as { queryChunks: Array<{ value?: string[] }> }).queryChunks
    expect(chunks.flatMap((c) => c.value ?? []).join('')).toContain("'connected'")
    expect(getSupportThread).toHaveBeenCalledWith('org_a', 'user_1')
    expect(postMessage).toHaveBeenCalledTimes(1)
    const [msg, author] = postMessage.mock.calls[0] as unknown as [{ conversationId: number; body: string }, string]
    expect(msg.conversationId).toBe(42)
    expect(msg.body).toContain('PMS connect request from All About Smiles: Open Dental.')
    expect(author).toBe('user_1')
  })

  it('a failed support post never loses the request', async () => {
    state.supportThrows = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = await submitPmsConnectRequest({ organizationId: 'org_a', userId: 'user_1', clinicName: 'X', input, now: NOW })
    expect(view.status).toBe('requested')
    expect(state.inserted).toHaveLength(1)
    spy.mockRestore()
  })
})

describe('getPmsConnectRequest + setPmsConnectRequestStatus', () => {
  it('maps the row; an unknown status reads as requested; no row is null', async () => {
    expect(await getPmsConnectRequest('org_a')).toBeNull()
    state.rows = [{ id: 'pmsreq_1', organizationId: 'org_a', vendor: 'curve', vendorName: null, practiceNameInPms: null, contactName: 'A', contactEmail: 'a@b.co', contactPhone: null, bestTime: null, notes: null, status: 'weird', requestedByUserId: null, createdAt: NOW, updatedAt: NOW }]
    const v = await getPmsConnectRequest('org_a')
    expect(v?.vendor).toBe('curve')
    expect(v?.status).toBe('requested')
  })

  it('the platform’s answer updates the status', async () => {
    expect(await setPmsConnectRequestStatus('org_a', 'scheduled', NOW)).toBe(true)
    expect(state.updates[0]).toEqual({ status: 'scheduled', updatedAt: NOW })
  })

  it('a disconnect moves a connected request back to closed (audit round 2)', async () => {
    expect(await closeConnectedPmsRequest('org_a', NOW)).toBe(true)
    expect(state.updates[0]).toEqual({ status: 'closed', updatedAt: NOW })
  })
})
