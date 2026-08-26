import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chain mock in the house pattern (tests/platform-metrics/service.test.ts):
// each select() pulls one row set off selectQueue; where clauses are captured
// so scoping assertions can grep the SQL fragments. insert() records its
// values + conflict target for the rollup-upsert assertions.
const state: {
  selectQueue: unknown[][]
  wheres: unknown[]
  inserts: { values: unknown; conflict: unknown }[]
} = { selectQueue: [], wheres: [], inserts: [] }

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.innerJoin = () => obj
    obj.where = (clause: unknown) => {
      state.wheres.push(clause)
      return obj
    }
    obj.groupBy = () => obj
    obj.limit = async () => state.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectQueue.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (v: unknown) => ({
          onConflictDoUpdate: async (c: { target: unknown }) => {
            state.inserts.push({ values: v, conflict: c.target })
          },
        }),
      }),
    },
  }
})

import { getAcquisitionReport, recordMarketingView } from '@/lib/services/acquisition'

function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    if (Array.isArray(v)) {
      for (const item of v) queue.push(item)
      continue
    }
    for (const k of Object.keys(v as Record<string, unknown>)) queue.push((v as Record<string, unknown>)[k])
  }
  return parts.join('|')
}

beforeEach(() => {
  state.selectQueue = []
  state.wheres = []
  state.inserts = []
})

const NOW = new Date('2026-08-26T12:00:00Z')
const FUTURE = new Date('2026-09-01T12:00:00Z')
const PAST = new Date('2026-08-01T12:00:00Z')

function stamp(channel: string) {
  return {
    channel,
    landing: '/',
    referrerHost: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    firstSeenAt: '2026-08-20T10:00:00.000Z',
    signedUpAt: '2026-08-25T10:00:00.000Z',
  }
}

describe('recordMarketingView', () => {
  it('upserts the (day, path, channel) rollup with a server-classified channel', async () => {
    await recordMarketingView(
      { path: '/pricing', search: '?utm_source=powered_by&utm_medium=referral&utm_campaign=acme', referrer: null },
      NOW,
    )
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].values).toMatchObject({
      day: '2026-08-26',
      path: '/pricing',
      channel: 'powered_by',
      views: 1,
    })
  })

  it('never trusts a client channel — classification is total and server-side', async () => {
    await recordMarketingView({ path: '/', search: '?utm_source=<script>alert(1)</script>', referrer: 'junk' }, NOW)
    // Unknown-but-tagged degrades to referral, a registry value.
    expect((state.inserts[0].values as { channel: string }).channel).toBe('referral')
  })
})

describe('getAcquisitionReport', () => {
  it('joins visits and signups per channel, graded by the billing rules', async () => {
    state.selectQueue.push([
      { channel: 'google_ads', views: 120 },
      { channel: 'powered_by', views: 40 },
    ])
    state.selectQueue.push([
      // Paying (real sub) via google_ads.
      { attribution: stamp('google_ads'), trialEndsAt: PAST, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_1' },
      // Live trial via google_ads.
      { attribution: stamp('google_ads'), trialEndsAt: FUTURE, subscriptionStatus: 'trialing', stripeSubscriptionId: null },
      // Expired unconverted via powered_by.
      { attribution: stamp('powered_by'), trialEndsAt: PAST, subscriptionStatus: 'trialing', stripeSubscriptionId: null },
      // Untracked (null attribution), paying.
      { attribution: null, trialEndsAt: null, subscriptionStatus: 'active', stripeSubscriptionId: 'sub_2' },
    ])

    const report = await getAcquisitionReport(30, NOW)
    const google = report.channels.find((c) => c.channel === 'google_ads')!
    const powered = report.channels.find((c) => c.channel === 'powered_by')!

    expect(google).toMatchObject({ visits: 120, signups: 2, trialing: 1, paying: 1, expired: 0 })
    expect(powered).toMatchObject({ visits: 40, signups: 1, trialing: 0, paying: 0, expired: 1 })
    expect(report.untrackedSignups).toBe(1)
    expect(report.untrackedPaying).toBe(1)
    expect(report.totalSignups).toBe(4)
    expect(report.totalPaying).toBe(2)
    expect(report.totalVisits).toBe(160)
  })

  it('a malformed attribution stamp counts as untracked, never a guessed channel', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([
      { attribution: { channel: 'not_in_registry' }, trialEndsAt: FUTURE, subscriptionStatus: 'trialing', stripeSubscriptionId: null },
    ])
    const report = await getAcquisitionReport(30, NOW)
    expect(report.untrackedSignups).toBe(1)
    expect(report.channels.every((c) => c.signups === 0)).toBe(true)
  })

  it('excludes demo orgs and non-clinic orgs from the signup read', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    await getAcquisitionReport(30, NOW)
    // The signups where-clause must scope to clinic orgs and exclude demo.
    const sql = state.wheres.map(captureSql).join('||')
    expect(sql).toContain('type')
    expect(sql).toContain('clinic')
    expect(sql).toContain('is_demo')
  })

  it('every registry channel appears in the report, zeros included', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
    const report = await getAcquisitionReport(30, NOW)
    expect(report.channels.map((c) => c.channel)).toEqual([
      'powered_by',
      'google_ads',
      'meta_ads',
      'organic_search',
      'ai_assistant',
      'social',
      'email',
      'referral',
      'direct',
    ])
  })
})
