import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chain mock in the house pattern (tests/platform-metrics/service.test.ts):
// each select() pulls one row set off selectQueue; where clauses are captured
// so scoping assertions can grep the SQL fragments. insert() records its
// values + conflict target for the rollup-upsert assertions.
//
// getAcquisitionReport's select order (slice 1b): visits-by-channel →
// daily → campaigns → signups → (powered-by name resolve, only when
// powered_by campaign rows exist).
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

function stamp(channel: string, utmCampaign: string | null = null) {
  return {
    channel,
    landing: '/',
    referrerHost: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign,
    firstSeenAt: '2026-08-20T10:00:00.000Z',
    signedUpAt: '2026-08-25T10:00:00.000Z',
  }
}

describe('recordMarketingView', () => {
  it('upserts the (day, path, channel, campaign) rollup with server-classified keys', async () => {
    await recordMarketingView(
      {
        path: '/pricing',
        search: '?utm_source=powered_by&utm_medium=referral&utm_campaign=Acme-Dental',
        referrer: null,
        newSession: true,
      },
      NOW,
    )
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].values).toMatchObject({
      day: '2026-08-26',
      path: '/pricing',
      channel: 'powered_by',
      campaign: 'acme-dental',
      views: 1,
      sessions: 1,
    })
  })

  it('a repeat pageview in the same session counts no session', async () => {
    await recordMarketingView({ path: '/', search: '', referrer: null, newSession: false }, NOW)
    expect(state.inserts[0].values).toMatchObject({ views: 1, sessions: 0, campaign: '' })
  })

  it('never trusts a client channel or an unbounded campaign', async () => {
    await recordMarketingView(
      { path: '/', search: `?utm_source=x&utm_campaign=${'<b>'.repeat(200)}`, referrer: 'junk' },
      NOW,
    )
    const v = state.inserts[0].values as { channel: string; campaign: string }
    expect(v.channel).toBe('referral')
    expect(v.campaign.length).toBeLessThanOrEqual(80)
    expect(v.campaign).toMatch(/^[a-z0-9._-]*$/)
  })
})

describe('getAcquisitionReport', () => {
  it('joins visits, sessions, and signups per channel, graded by the billing rules', async () => {
    state.selectQueue.push([
      { channel: 'google_ads', views: 120, sessions: 60 },
      { channel: 'powered_by', views: 40, sessions: 25 },
    ])
    state.selectQueue.push([{ day: '2026-08-26', views: 160 }]) // daily
    state.selectQueue.push([]) // campaigns
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

    expect(google).toMatchObject({ visits: 120, sessions: 60, signups: 2, trialing: 1, paying: 1, expired: 0 })
    expect(powered).toMatchObject({ visits: 40, sessions: 25, signups: 1, trialing: 0, paying: 0, expired: 1 })
    expect(report.untrackedSignups).toBe(1)
    expect(report.untrackedPaying).toBe(1)
    expect(report.totalSignups).toBe(4)
    expect(report.totalPaying).toBe(2)
    expect(report.totalVisits).toBe(160)
    expect(report.totalSessions).toBe(85)
  })

  it('zero-fills the daily series across the whole window', async () => {
    state.selectQueue.push([]) // visits
    state.selectQueue.push([{ day: '2026-08-25', views: 7 }]) // daily
    state.selectQueue.push([]) // campaigns
    state.selectQueue.push([]) // signups
    const report = await getAcquisitionReport(7, NOW)
    expect(report.daily).toHaveLength(7)
    expect(report.daily[report.daily.length - 1].bucket).toBe('2026-08-26')
    expect(report.daily.find((d) => d.bucket === '2026-08-25')?.value).toBe(7)
    expect(report.daily.filter((d) => d.value === 0)).toHaveLength(6)
  })

  it('surfaces campaigns with signup counts keyed on the first-touch campaign', async () => {
    state.selectQueue.push([]) // visits
    state.selectQueue.push([]) // daily
    state.selectQueue.push([
      { channel: 'google_ads', campaign: 'competitor-weave', views: 50, sessions: 30 },
      { channel: 'google_ads', campaign: 'competitor-nexhealth', views: 20, sessions: 12 },
    ])
    state.selectQueue.push([
      { attribution: stamp('google_ads', 'Competitor-Weave'), trialEndsAt: FUTURE, subscriptionStatus: 'trialing', stripeSubscriptionId: null },
    ])
    const report = await getAcquisitionReport(30, NOW)
    expect(report.campaigns[0]).toMatchObject({ campaign: 'competitor-weave', visits: 50, signups: 1 })
    expect(report.campaigns[1]).toMatchObject({ campaign: 'competitor-nexhealth', signups: 0 })
  })

  it('resolves powered-by sources to clinic names, keeping unresolved slugs visible', async () => {
    state.selectQueue.push([]) // visits
    state.selectQueue.push([]) // daily
    state.selectQueue.push([
      { channel: 'powered_by', campaign: 'acme-dental', views: 30, sessions: 18 },
      { channel: 'powered_by', campaign: 'gone-clinic', views: 5, sessions: 4 },
    ])
    state.selectQueue.push([]) // signups
    state.selectQueue.push([{ slug: 'acme-dental', name: 'Acme Dental' }]) // org name resolve
    const report = await getAcquisitionReport(30, NOW)
    expect(report.poweredBySources).toEqual([
      { slug: 'acme-dental', name: 'Acme Dental', visits: 30, sessions: 18 },
      { slug: 'gone-clinic', name: null, visits: 5, sessions: 4 },
    ])
  })

  it('a malformed attribution stamp counts as untracked, never a guessed channel', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
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
    state.selectQueue.push([])
    state.selectQueue.push([])
    await getAcquisitionReport(30, NOW)
    const sql = state.wheres.map(captureSql).join('||')
    expect(sql).toContain('type')
    expect(sql).toContain('clinic')
    expect(sql).toContain('is_demo')
  })

  it('every registry channel appears in the report, zeros included', async () => {
    state.selectQueue.push([])
    state.selectQueue.push([])
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
