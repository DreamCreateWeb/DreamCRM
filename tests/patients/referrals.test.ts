import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Refer-a-friend: lazy one-per-patient share-link mint (race-safe against the
 * unique index), org-scoped token resolution, and set-once attribution
 * stamping that never overwrites and never self-refers.
 */

const state = {
  selectQueue: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  insertError: null as Error | null,
}

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = () => obj
    obj.then = (resolve: any, reject: any) =>
      Promise.resolve(state.selectQueue.shift() ?? []).then(resolve, reject)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          if (state.insertError) {
            const e = state.insertError
            state.insertError = null
            throw e
          }
          state.inserts.push({ table: (table as { _n: string })._n, values })
        },
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push({ table: (table as { _n: string })._n, values })
          },
        }),
      }),
    },
    schema: {
      patient: {
        _n: 'patient',
        id: 'id',
        organizationId: 'org',
        referredByPatientId: 'rbp',
        firstName: 'fn',
        lastName: 'ln',
        mergedIntoPatientId: 'merged',
      },
      patientReferralLink: {
        _n: 'patient_referral_link',
        id: 'id',
        organizationId: 'org',
        patientId: 'pid',
        token: 'token',
      },
      organization: { id: 'id', slug: 'slug' },
      clinicProfile: { organizationId: 'org', websiteDomain: 'wd' },
    },
  }
})
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
}))
vi.mock('@/lib/services/clinic-site', () => ({
  publicSiteUrl: vi.fn(() => 'https://acme.dreamcreatestudio.com'),
}))

import {
  getOrCreateReferralLink,
  resolveReferralToken,
  stampReferralAttribution,
  getReferralContext,
} from '@/lib/services/patient-referrals'

// buildShareUrl reads org (slug) then clinic profile (websiteDomain).
function queueShareUrlLookups() {
  state.selectQueue.push([{ slug: 'acme-dental' }])
  state.selectQueue.push([{ websiteDomain: null }])
}

beforeEach(() => {
  state.selectQueue = []
  state.inserts = []
  state.updates = []
  state.insertError = null
  vi.clearAllMocks()
})

describe('getOrCreateReferralLink', () => {
  it('reuses an existing link instead of minting a second one', async () => {
    state.selectQueue.push([{ token: 'ref_existing' }])
    queueShareUrlLookups()
    const link = await getOrCreateReferralLink('org_1', 'pat_1')
    expect(link.token).toBe('ref_existing')
    expect(link.shareUrl).toBe('https://acme.dreamcreatestudio.com/book?ref=ref_existing')
    expect(state.inserts).toHaveLength(0)
  })

  it('mints a ref_-prefixed token on first ask', async () => {
    state.selectQueue.push([]) // no existing link
    queueShareUrlLookups()
    const link = await getOrCreateReferralLink('org_1', 'pat_1')
    expect(link.token).toMatch(/^ref_/)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].values).toMatchObject({
      organizationId: 'org_1',
      patientId: 'pat_1',
      token: link.token,
    })
    expect(link.shareUrl).toContain(`/book?ref=${link.token}`)
  })

  it('loses the unique-index race gracefully and returns the winner', async () => {
    state.selectQueue.push([]) // read misses
    state.insertError = new Error('duplicate key value violates unique constraint')
    state.selectQueue.push([{ token: 'ref_winner' }]) // re-read finds the winner
    queueShareUrlLookups()
    const link = await getOrCreateReferralLink('org_1', 'pat_1')
    expect(link.token).toBe('ref_winner')
  })
})

describe('resolveReferralToken', () => {
  it('resolves an org-scoped token to the referrer', async () => {
    state.selectQueue.push([{ patientId: 'pat_referrer' }])
    const r = await resolveReferralToken('org_1', 'ref_abc')
    expect(r).toEqual({ referrerPatientId: 'pat_referrer' })
  })

  it('returns null for an unknown (or foreign-org) token', async () => {
    state.selectQueue.push([])
    expect(await resolveReferralToken('org_1', 'ref_unknown')).toBeNull()
  })

  it('short-circuits on an empty token without querying', async () => {
    expect(await resolveReferralToken('org_1', '   ')).toBeNull()
    expect(state.selectQueue).toHaveLength(0) // nothing consumed
  })
})

describe('stampReferralAttribution', () => {
  it('stamps the new patient with the resolved referrer', async () => {
    state.selectQueue.push([{ patientId: 'pat_referrer' }])
    const ok = await stampReferralAttribution('org_1', 'pat_new', 'ref_abc')
    expect(ok).toBe(true)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({
      table: 'patient',
      values: { referredByPatientId: 'pat_referrer' },
    })
  })

  it('no-ops on an unknown token', async () => {
    state.selectQueue.push([])
    expect(await stampReferralAttribution('org_1', 'pat_new', 'ref_nope')).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('never stamps a self-referral', async () => {
    state.selectQueue.push([{ patientId: 'pat_new' }])
    expect(await stampReferralAttribution('org_1', 'pat_new', 'ref_mine')).toBe(false)
    expect(state.updates).toHaveLength(0)
  })
})

describe('getReferralContext', () => {
  it('returns both directions of the referral picture', async () => {
    state.selectQueue.push([{ referredByPatientId: 'pat_sophia' }]) // me
    state.selectQueue.push([{ id: 'pat_sophia', firstName: 'Sophia', lastName: 'Iverson' }]) // referrer
    state.selectQueue.push([{ id: 'pat_x', firstName: 'Noah', lastName: 'Mitchell' }]) // my referrals
    const ctx = await getReferralContext('org_1', 'pat_emma')
    expect(ctx.referredBy).toEqual({ id: 'pat_sophia', name: 'Sophia Iverson' })
    expect(ctx.referred).toEqual([{ id: 'pat_x', name: 'Noah Mitchell' }])
  })

  it('handles the organic (unattributed) patient', async () => {
    state.selectQueue.push([{ referredByPatientId: null }])
    state.selectQueue.push([]) // no referrals either
    const ctx = await getReferralContext('org_1', 'pat_plain')
    expect(ctx).toEqual({ referredBy: null, referred: [] })
  })
})
