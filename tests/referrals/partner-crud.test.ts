import { describe, it, expect, vi, beforeEach } from 'vitest'

const { TABLES } = vi.hoisted(() => ({
  TABLES: {
    referralPartner: { __t: 'referralPartner', email: 'email', id: 'id', userId: 'userId', status: 'status' },
    clinicProfile: { __t: 'clinicProfile', organizationId: 'organizationId' },
  },
}))

const state = {
  // FIFO queues of select results, keyed by table.
  partnerRows: [] as unknown[][],
  profileRows: [] as unknown[][],
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
}

function tableName(t: unknown): string {
  if (t === TABLES.referralPartner) return 'referralPartner'
  if (t === TABLES.clinicProfile) return 'clinicProfile'
  return 'unknown'
}

function dbMethods(): any {
  return {
    select: () => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () =>
            tableName(t) === 'referralPartner'
              ? state.partnerRows.shift() ?? []
              : state.profileRows.shift() ?? [],
        }),
      }),
    }),
    insert: (t: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: tableName(t), values })
      },
    }),
    update: (t: unknown) => ({
      set: (s: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ table: tableName(t), set: s })
        },
      }),
    }),
  }
}

const mockDeliver = vi.fn()

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ deliver: (...a: unknown[]) => mockDeliver(...a) }))
vi.mock('@/lib/db', () => ({ db: dbMethods(), schema: TABLES }))
vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _k: 'and' })),
  eq: vi.fn(() => ({ _k: 'eq' })),
  desc: vi.fn((x) => x),
  inArray: vi.fn(() => ({ _k: 'inArray' })),
  sql: Object.assign(vi.fn(() => ({ _k: 'sql' })), { raw: vi.fn() }),
}))

import {
  createPartner,
  updatePartnerTerms,
  assignClinicReferral,
  getPartnerInviteByToken,
  linkPartnerUser,
} from '@/lib/services/referrals'

beforeEach(() => {
  state.partnerRows = []
  state.profileRows = []
  state.inserts = []
  state.updates = []
  mockDeliver.mockReset()
})

describe('createPartner', () => {
  it('creates an invited partner, lowercases the email, and sends an invite', async () => {
    state.partnerRows = [[]] // no dupe
    const r = await createPartner({
      name: 'Jordan Reyes',
      email: 'Jordan@Brightline.IO',
      defaultPercentBps: 1000,
    })
    expect(r.email).toBe('jordan@brightline.io')
    const insert = state.inserts.find((i) => i.table === 'referralPartner')!
    expect(insert.values).toMatchObject({
      name: 'Jordan Reyes',
      email: 'jordan@brightline.io',
      status: 'invited',
      defaultPercentBps: 1000,
    })
    expect(insert.values.inviteToken).toBeTruthy()
    expect(mockDeliver).toHaveBeenCalledTimes(1)
    // The invite email links to /partner/accept with the token.
    const msg = mockDeliver.mock.calls[0][0] as { html: string }
    expect(msg.html).toContain('/partner/accept?token=')
  })

  it('rejects a duplicate email', async () => {
    state.partnerRows = [[{ id: 'existing' }]]
    await expect(
      createPartner({ name: 'Dupe', email: 'dupe@x.com', defaultPercentBps: 1000 }),
    ).rejects.toThrow(/already exists/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('rejects an out-of-range percentage', async () => {
    state.partnerRows = [[]]
    await expect(
      createPartner({ name: 'X', email: 'x@y.com', defaultPercentBps: 20000 }),
    ).rejects.toThrow(/between 0 and 100/i)
  })
})

describe('updatePartnerTerms', () => {
  it('updates only the provided fields (rate change applies going forward)', async () => {
    await updatePartnerTerms({ partnerId: 'p1', defaultPercentBps: 1500 })
    const upd = state.updates.find((u) => u.table === 'referralPartner')!
    expect(upd.set).toMatchObject({ defaultPercentBps: 1500 })
  })
})

describe('assignClinicReferral', () => {
  it('copies the partner defaults when no override is supplied + stamps a start date', async () => {
    state.partnerRows = [[{ id: 'p1', defaultPercentBps: 1000, defaultTermMonths: null }]]
    state.profileRows = [[{ organizationId: 'org1', currentPartnerId: null, currentStartedAt: null }]]
    await assignClinicReferral('org1', 'p1')
    const upd = state.updates.find((u) => u.table === 'clinicProfile')!
    expect(upd.set.referralPartnerId).toBe('p1')
    expect(upd.set.referralPercentBps).toBe(1000) // copied default
    expect(upd.set.referralTermMonths).toBeNull()
    expect(upd.set.referralStartedAt).toBeInstanceOf(Date)
  })

  it('honors a per-clinic % override', async () => {
    state.partnerRows = [[{ id: 'p1', defaultPercentBps: 1000, defaultTermMonths: 12 }]]
    state.profileRows = [[{ organizationId: 'org1', currentPartnerId: null, currentStartedAt: null }]]
    await assignClinicReferral('org1', 'p1', 1500, 6)
    const upd = state.updates.find((u) => u.table === 'clinicProfile')!
    expect(upd.set.referralPercentBps).toBe(1500)
    expect(upd.set.referralTermMonths).toBe(6)
  })

  it('keeps the original start date when re-assigning the SAME partner (no term reset)', async () => {
    const original = new Date('2026-01-01')
    state.partnerRows = [[{ id: 'p1', defaultPercentBps: 1000, defaultTermMonths: null }]]
    state.profileRows = [[{ organizationId: 'org1', currentPartnerId: 'p1', currentStartedAt: original }]]
    await assignClinicReferral('org1', 'p1', 1200)
    const upd = state.updates.find((u) => u.table === 'clinicProfile')!
    expect(upd.set.referralStartedAt).toBe(original)
    expect(upd.set.referralPercentBps).toBe(1200)
  })

  it('throws when the partner does not exist', async () => {
    state.partnerRows = [[]]
    await expect(assignClinicReferral('org1', 'missing')).rejects.toThrow(/Partner not found/i)
  })
})

describe('accept-invite token flow', () => {
  it('resolves a valid token, flagging an already-linked partner', async () => {
    state.partnerRows = [[{ id: 'p1', name: 'P', email: 'p@x.com', userId: 'u9' }]]
    const details = await getPartnerInviteByToken('tok123456')
    expect(details).toMatchObject({ partnerId: 'p1', email: 'p@x.com', alreadyLinked: true })
  })

  it('returns null for an invalid/consumed token', async () => {
    state.partnerRows = [[]]
    expect(await getPartnerInviteByToken('nope')).toBeNull()
    expect(await getPartnerInviteByToken('')).toBeNull()
  })

  it('linkPartnerUser sets user_id, activates, and clears the token', async () => {
    await linkPartnerUser('p1', 'u1')
    const upd = state.updates.find((u) => u.table === 'referralPartner')!
    expect(upd.set).toMatchObject({ userId: 'u1', status: 'active', inviteToken: null })
  })
})
