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

const { recordActionMock, listRecentActionsMock } = vi.hoisted(() => ({
  recordActionMock: vi.fn(async (..._a: unknown[]) => true),
  listRecentActionsMock: vi.fn(async (..._a: unknown[]) => [] as Array<Record<string, unknown>>),
}))
vi.mock('@/lib/services/action-ledger', () => ({
  recordAction: recordActionMock,
  listRecentActions: listRecentActionsMock,
}))

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
      for (const r of store.profiles) {
        if (!filters.every((f) => f(r))) continue
        for (const [k, v] of Object.entries(patch)) r[k] = evalSql(v, r)
      }
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

// The trust write is a jsonb merge done IN SQL (round-2 audit: a
// read-modify-write could drop a concurrent revoke). The harness therefore
// models the expression rather than stubbing it away — otherwise the tests
// below would assert against a value the database never computes.
vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => (r: Record<string, unknown>) => r[col.__col] === val,
  and: (...preds: unknown[]) => preds.flat().filter(Boolean),
  inArray: (col: { __col: string }, vals: unknown[]) => (r: Record<string, unknown>) =>
    vals.includes(r[col.__col]),
  gte: (col: { __col: string }, val: Date) => (r: Record<string, unknown>) =>
    r[col.__col] instanceof Date && (r[col.__col] as Date) >= val,
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    __sqlText: (strings as unknown as string[]).join('?'),
    __vals: vals,
  }),
}))

/** Evaluate the mocked sql fragments against a row, the way Postgres would. */
export function evalSql(node: unknown, row: Record<string, unknown>): unknown {
  if (!node || typeof node !== 'object' || !('__sqlText' in node)) return node
  const { __sqlText: text, __vals: vals } = node as { __sqlText: string; __vals: unknown[] }
  const autonomy = (row.autonomy ?? {}) as Record<string, unknown>
  if (text.includes('jsonb_build_object')) {
    // coalesce(autonomy,'{}') || <levelPatch> || jsonb_build_object(key, <inner>)
    const levelPatch = JSON.parse(vals[1] as string) as Record<string, unknown>
    const key = vals[2] as string
    return { ...autonomy, ...levelPatch, [key]: evalSql(vals[3], row) }
  }
  const base = { ...((autonomy[vals[1] as string] ?? {}) as Record<string, unknown>) }
  if (text.includes('||')) return { ...base, ...(JSON.parse(vals[2] as string) as object) }
  delete base[vals[2] as string] // the `- key` deletion
  return base
}

import { setCapabilityTrust, listTrustGrants, listAutonomousWork } from '@/lib/services/autonomy'

const ORG = 'org_1'

beforeEach(() => {
  vi.clearAllMocks()
  store.profiles = [{ organizationId: ORG, autonomy: null }]
})

describe('setCapabilityTrust', () => {
  it('grants a proposal-backed capability and NARRATES the change in the machine’s voice', async () => {
    const r = await setCapabilityTrust(ORG, 'review_reply', 'auto', 'user_1')
    expect(r).toEqual({ ok: true, level: 'auto' })
    expect(store.profiles[0].autonomy).toMatchObject({ review_reply: 'auto' })
    // A grant is DATED so "from now on" can mean what it says: cards filed
    // before this instant stay a human's to decide (round-2 audit).
    const stamped = (store.profiles[0].autonomy as Record<string, Record<string, string>>)._grantedAt
    expect(typeof stamped.review_reply).toBe('string')
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
    expect(store.profiles[0].autonomy).toMatchObject({ review_reply: 'ask' })
    // Taking it back clears the stamp, so a later re-grant starts its own clock.
    expect(
      (store.profiles[0].autonomy as Record<string, Record<string, string>>)._grantedAt,
    ).toEqual({})
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
    expect(store.profiles[0].autonomy).toMatchObject({
      review_reply: 'auto',
      inquiry_response: 'auto',
    })
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

/**
 * THE TELL (round-1 Phase-3 audit). "Do and tell" is the rung this phase
 * shipped; the DO had no TELL. This read is the Overview strip's source.
 */
describe('listAutonomousWork', () => {
  const NOW = new Date('2026-07-27T15:00:00Z')
  const entry = (over: Record<string, unknown>) => ({
    id: 'act_x',
    capability: 'review_reply',
    patientId: null,
    summary: 'Replied to a review — handled on my own, as you asked',
    detail: { autonomous: true },
    occurredAt: NOW,
    ...over,
  })

  it('counts what the machine did ALONE, per capability, quoting the newest line', async () => {
    listRecentActionsMock.mockResolvedValueOnce([
      entry({ summary: 'Replied to Maria’s review — handled on my own, as you asked' }),
      entry({ summary: 'Replied to an older review — handled on my own, as you asked' }),
      entry({ capability: 'social_post', summary: 'Posted to Instagram — handled on my own, as you asked' }),
    ])
    const work = await listAutonomousWork(ORG, { now: NOW })
    expect(work).toEqual([
      {
        capability: 'review_reply',
        label: 'Reply to Google reviews',
        count: 2,
        // listRecentActions is newest-first, so the first one is the newest.
        latestSummary: 'Replied to Maria’s review — handled on my own, as you asked',
      },
      {
        capability: 'social_post',
        label: 'Publish social & Google posts',
        count: 1,
        latestSummary: 'Posted to Instagram — handled on my own, as you asked',
      },
    ])
  })

  it('never counts a HUMAN’s approval as the machine’s own work', async () => {
    listRecentActionsMock.mockResolvedValueOnce([
      entry({ detail: { approvedByUserId: 'user_1' } }),
      entry({ detail: null }),
      entry({ detail: { autonomyChange: 'auto' } }),
    ])
    expect(await listAutonomousWork(ORG, { now: NOW })).toEqual([])
  })

  it('asks for a 7-day window ending now, filtered IN THE QUERY', async () => {
    await listAutonomousWork(ORG, { now: NOW })
    const [, opts] = listRecentActionsMock.mock.calls[0] as [string, Record<string, unknown>]
    expect((opts.since as Date).toISOString()).toBe('2026-07-20T15:00:00.000Z')
    expect(opts.until).toEqual(NOW)
    // NOT a top-N slice of everything (round-2 audit): the ledger writes one
    // row per reminder, so a busy clinic's autonomous work fell off the end
    // of the newest 100 rows and the strip said "nothing on my own yet".
    expect(opts.autonomousOnly).toBe(true)
  })
})
