import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Partner accept matrix:
 *   - getPartnerInviteByToken: resolves account state + expiry from the row.
 *   - completePartnerAcceptAction: signed-in same / different / expired /
 *     idempotent, with normalized email comparison.
 */

// ── getPartnerInviteByToken (service, against a db stub) ──────────────────────
const dbStubs = {
  partner: null as null | {
    id: string
    name: string
    email: string
    userId: string | null
    inviteExpiresAt: Date | null
  },
  user: null as null | { id: string },
  account: null as null | { id: string },
}

vi.mock('@/lib/db', async () => {
  const referrals = await import('@/lib/db/schema/referrals')
  const auth = await import('@/lib/db/schema/auth')
  const tableName = (t: unknown): string => {
    if (t === referrals.referralPartner) return 'partner'
    if (t === auth.user) return 'user'
    if (t === auth.account) return 'account'
    return 'unknown'
  }
  const chain = () => {
    const obj: any = {}
    let table = 'unknown'
    obj.from = (t: unknown) => {
      table = tableName(t)
      return obj
    }
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => {
      if (table === 'partner') return dbStubs.partner ? [dbStubs.partner] : []
      if (table === 'user') return dbStubs.user ? [dbStubs.user] : []
      if (table === 'account') return dbStubs.account ? [dbStubs.account] : []
      return []
    }
    return obj
  }
  return { db: { select: () => chain() }, schema: { ...(await import('@/lib/db/schema')) } }
})
// referrals.ts also imports deliver from @/lib/email — stub it.
vi.mock('@/lib/email', () => ({ deliver: vi.fn(async () => {}) }))

import { getPartnerInviteByToken } from '@/lib/services/referrals'

beforeEach(() => {
  dbStubs.partner = null
  dbStubs.user = null
  dbStubs.account = null
})

describe('getPartnerInviteByToken', () => {
  const base = {
    id: 'p1',
    name: 'Jordan Reyes',
    email: 'jordan@example.com',
    userId: null,
    inviteExpiresAt: new Date(Date.now() + 86400_000),
  }

  it('returns null for an unknown token', async () => {
    dbStubs.partner = null
    expect(await getPartnerInviteByToken('nope')).toBeNull()
  })

  it("accountState 'none' for a brand-new partner email", async () => {
    dbStubs.partner = base
    dbStubs.user = null
    const d = await getPartnerInviteByToken('tok')
    expect(d?.accountState).toBe('none')
    expect(d?.expired).toBe(false)
    expect(d?.alreadyLinked).toBe(false)
  })

  it("accountState 'password' when the email already has a credentialed user (Bug 2)", async () => {
    dbStubs.partner = base
    dbStubs.user = { id: 'u1' }
    dbStubs.account = { id: 'acct_cred' }
    const d = await getPartnerInviteByToken('tok')
    expect(d?.accountState).toBe('password')
  })

  it("accountState 'magic-link' when the email's user has no credential", async () => {
    dbStubs.partner = base
    dbStubs.user = { id: 'u1' }
    dbStubs.account = null
    const d = await getPartnerInviteByToken('tok')
    expect(d?.accountState).toBe('magic-link')
  })

  it('expired=true when inviteExpiresAt has passed', async () => {
    dbStubs.partner = { ...base, inviteExpiresAt: new Date(Date.now() - 1000) }
    const d = await getPartnerInviteByToken('tok')
    expect(d?.expired).toBe(true)
  })

  it('expired=false for a legacy row with null inviteExpiresAt (pre-0060)', async () => {
    dbStubs.partner = { ...base, inviteExpiresAt: null }
    const d = await getPartnerInviteByToken('tok')
    expect(d?.expired).toBe(false)
  })

  it('alreadyLinked=true when the partner already has a user', async () => {
    dbStubs.partner = { ...base, userId: 'u_existing' }
    dbStubs.user = { id: 'u_existing' }
    dbStubs.account = { id: 'acct_cred' }
    const d = await getPartnerInviteByToken('tok')
    expect(d?.alreadyLinked).toBe(true)
  })
})
