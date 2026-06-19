/**
 * Per-staff digest opt-out store. Pins: a missing row reads as opted-in (false),
 * a present 1 reads as opted-out, set upserts on the (org,user) conflict target,
 * and the bulk loader returns the muted userId set the cron skips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  selectRows: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<{ values: Record<string, unknown>; set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => {
  function selectChain() {
    const o: Record<string, unknown> = {}
    o.from = () => o
    o.where = () => o
    o.limit = async () => state.selectRows
    // No-limit terminal (bulk loader) — make the chain awaitable.
    o.then = (res: (v: unknown) => void) => res(state.selectRows)
    return o
  }
  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
            state.upserts.push({ values, set })
          },
        }),
      }),
    },
    schema: {
      staffNotificationPref: {
        id: 'id', organizationId: 'org', userId: 'uid', dailyDigestOptOut: 'out', updatedAt: 'upd',
      },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
}))

import {
  getDigestOptOut,
  setDigestOptOut,
  getDigestOptOutUserIds,
} from '@/lib/services/staff-notification-pref'

beforeEach(() => {
  state.selectRows = []
  state.upserts = []
})

describe('getDigestOptOut', () => {
  it('is false when there is no row (opted in by default)', async () => {
    state.selectRows = []
    expect(await getDigestOptOut('org_1', 'u1')).toBe(false)
  })
  it('is true when the stored flag is 1', async () => {
    state.selectRows = [{ out: 1 }]
    expect(await getDigestOptOut('org_1', 'u1')).toBe(true)
  })
})

describe('setDigestOptOut', () => {
  it('upserts the flag (1 when muting)', async () => {
    await setDigestOptOut('org_1', 'u1', true)
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0].values.dailyDigestOptOut).toBe(1)
    expect(state.upserts[0].set.dailyDigestOptOut).toBe(1)
  })
  it('stores 0 when un-muting', async () => {
    await setDigestOptOut('org_1', 'u1', false)
    expect(state.upserts[0].values.dailyDigestOptOut).toBe(0)
  })
})

describe('getDigestOptOutUserIds', () => {
  it('returns the muted userId set', async () => {
    state.selectRows = [{ userId: 'u1' }, { userId: 'u2' }]
    const set = await getDigestOptOutUserIds('org_1')
    expect(set.has('u1')).toBe(true)
    expect(set.has('u2')).toBe(true)
    expect(set.has('u3')).toBe(false)
    expect(set.size).toBe(2)
  })
})
