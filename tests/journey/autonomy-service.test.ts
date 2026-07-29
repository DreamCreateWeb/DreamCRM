import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE LADDER LIVE (Transformation Phase 3). Pins the grant service's laws:
 *  - only the proposal-backed, ask-by-default capabilities are grantable —
 *    the auto-by-default automations keep their own switches, and nothing
 *    unregistered can be switched to acting on its own;
 *  - a change is NARRATED (the diary must explain why the asking stopped),
 *    and a no-op change narrates nothing (no event happened);
 *  - trust is reversible: the same call sets it back to ask.
 */

const { recordActionMock } = vi.hoisted(() => ({
  recordActionMock: vi.fn(async (..._a: unknown[]) => true),
}))
vi.mock('@/lib/services/action-ledger', () => ({ recordAction: recordActionMock }))

const store: { profiles: Array<Record<string, unknown>> } = { profiles: [] }

vi.mock('@/lib/db', () => {
  const snap = (r: Record<string, unknown>): Record<string, unknown> => ({
    ...r,
    ...(r.autonomy && typeof r.autonomy === 'object'
      ? { autonomy: JSON.parse(JSON.stringify(r.autonomy)) }
      : {}),
  })
  function select(cols?: Record<string, unknown>) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    const api: Record<string, unknown> = {}
    api.from = () => api
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    const rowsFor = () => {
      let out = store.profiles.filter((r) => filters.every((f) => f(r))).map(snap)
      if (cols) out = out.map((r) => Object.fromEntries(Object.keys(cols).map((k) => [k, r[k]])))
      return out
    }
    api.limit = async (n?: number) => (typeof n === 'number' ? rowsFor().slice(0, n) : rowsFor())
    api.then = (resolve: (v: unknown) => void) => resolve(rowsFor())
    return api
  }
  function update() {
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    let patch: Record<string, unknown> = {}
    const api: Record<string, unknown> = {}
    api.set = (p: Record<string, unknown>) => { patch = p; return api }
    api.where = (preds: unknown) => {
      if (Array.isArray(preds)) for (const p of preds) filters.push(p as never)
      else if (typeof preds === 'function') filters.push(preds as never)
      return api
    }
    api.then = (resolve: (v: unknown) => void) => {
      for (const r of store.profiles) if (filters.every((f) => f(r))) Object.assign(r, patch)
      resolve(undefined)
    }
    return api
  }
  const col = (name: string) => ({ __col: name })
  return {
    db: { select, update },
    schema: {
      clinicProfile: {
        __name: 'clinic_profile',
        organizationId: col('organizationId'),
        autonomy: col('autonomy'),
      },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
}))

import { setCapabilityTrust, listTrustGrants } from '@/lib/services/autonomy'

const ORG = 'org_1'

beforeEach(() => {
  vi.clearAllMocks()
  store.profiles = [{ organizationId: ORG, autonomy: null }]
})

describe('setCapabilityTrust', () => {
  it('grants a proposal-backed capability and NARRATES the change in the machine’s voice', async () => {
    const r = await setCapabilityTrust(ORG, 'review_reply', 'auto', 'user_1')
    expect(r).toEqual({ ok: true, level: 'auto' })
    expect(store.profiles[0].autonomy).toEqual({ review_reply: 'auto' })
    expect(recordActionMock).toHaveBeenCalledTimes(1)
    const entry = recordActionMock.mock.calls[0][0] as Record<string, unknown>
    expect(entry.capability).toBe('review_reply')
    expect(String(entry.summary)).toContain('automatic')
    expect(String(entry.summary)).not.toContain('!')
    expect(entry.detail).toMatchObject({ autonomyChange: 'auto', changedByUserId: 'user_1' })
  })

  it('takes it back — trust is reversible, and the diary says so', async () => {
    store.profiles[0].autonomy = { review_reply: 'auto' }
    const r = await setCapabilityTrust(ORG, 'review_reply', 'ask', 'user_1')
    expect(r).toEqual({ ok: true, level: 'ask' })
    expect(store.profiles[0].autonomy).toEqual({ review_reply: 'ask' })
    expect(String((recordActionMock.mock.calls[0][0] as Record<string, unknown>).summary)).toContain(
      'ask-first',
    )
  })

  it('a no-op change narrates NOTHING — nothing happened', async () => {
    store.profiles[0].autonomy = { social_post: 'auto' }
    const r = await setCapabilityTrust(ORG, 'social_post', 'auto', 'user_1')
    expect(r).toEqual({ ok: true, level: 'auto' })
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('REFUSES capabilities the ladder doesn’t hand over from a card — the always-on automations and anything unregistered', async () => {
    for (const key of ['appointment_reminder', 'campaign_send', 'not_a_capability']) {
      const r = await setCapabilityTrust(ORG, key, 'auto', 'user_1')
      expect(r.ok).toBe(false)
      expect(store.profiles[0].autonomy).toBeNull()
    }
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('refuses a level that isn’t a trust level', async () => {
    const r = await setCapabilityTrust(ORG, 'review_reply', 'always' as never, 'user_1')
    expect(r.ok).toBe(false)
    expect(recordActionMock).not.toHaveBeenCalled()
  })

  it('keeps the other capabilities’ grants intact (a merge, never a replace)', async () => {
    store.profiles[0].autonomy = { review_reply: 'auto' }
    await setCapabilityTrust(ORG, 'inquiry_response', 'auto', 'user_1')
    expect(store.profiles[0].autonomy).toEqual({ review_reply: 'auto', inquiry_response: 'auto' })
  })
})

describe('listTrustGrants', () => {
  it('reports the four grantable capabilities with their resolved levels + reader-facing labels', async () => {
    store.profiles[0].autonomy = { review_reply: 'auto' }
    const grants = await listTrustGrants(ORG)
    expect(grants.map((g) => g.capability).sort()).toEqual(
      ['inquiry_response', 'outreach_campaign', 'review_reply', 'social_post'].sort(),
    )
    expect(grants.find((g) => g.capability === 'review_reply')).toMatchObject({
      level: 'auto',
      label: 'Reply to Google reviews',
    })
    // Everything else stays ask-first — a grant is per capability.
    expect(grants.filter((g) => g.level === 'auto')).toHaveLength(1)
  })

  it('a clinic with no stored grants is all ask-first', async () => {
    const grants = await listTrustGrants(ORG)
    expect(grants.every((g) => g.level === 'ask')).toBe(true)
  })
})
