import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Caller accept matrix (P-02) — getCallerInviteByToken resolves the account
 * state + expiry from the row, exactly as the partner's does.
 */
const dbStubs = {
  caller: null as null | {
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
  const prospecting = await import('@/lib/db/schema/prospecting')
  const auth = await import('@/lib/db/schema/auth')
  const tableName = (t: unknown): string => {
    if (t === prospecting.prospectCaller) return 'caller'
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
      if (table === 'caller') return dbStubs.caller ? [dbStubs.caller] : []
      if (table === 'user') return dbStubs.user ? [dbStubs.user] : []
      if (table === 'account') return dbStubs.account ? [dbStubs.account] : []
      return []
    }
    return obj
  }
  return { db: { select: () => chain() }, schema: { ...(await import('@/lib/db/schema')) } }
})
vi.mock('@/lib/email', () => ({ deliver: vi.fn(async () => {}), authEmailShell: vi.fn(() => ''), escapeHtml: (s: string) => s }))

import { getCallerInviteByToken } from '@/lib/services/prospect-callers'

beforeEach(() => {
  dbStubs.caller = null
  dbStubs.user = null
  dbStubs.account = null
})

describe('getCallerInviteByToken', () => {
  const base = {
    id: 'pcal_1',
    name: 'Priya Nair',
    email: 'priya@example.com',
    userId: null,
    inviteExpiresAt: new Date(Date.now() + 86400_000),
  }

  it('returns null for an unknown token', async () => {
    expect(await getCallerInviteByToken('nope')).toBeNull()
    expect(await getCallerInviteByToken('')).toBeNull()
  })

  it("accountState 'none' for a brand-new caller email", async () => {
    dbStubs.caller = base
    const d = await getCallerInviteByToken('tok')
    expect(d?.callerId).toBe('pcal_1')
    expect(d?.accountState).toBe('none')
    expect(d?.expired).toBe(false)
    expect(d?.alreadyLinked).toBe(false)
  })

  it("accountState 'password' when the email already has a credentialed user", async () => {
    dbStubs.caller = base
    dbStubs.user = { id: 'u1' }
    dbStubs.account = { id: 'acct_cred' }
    expect((await getCallerInviteByToken('tok'))?.accountState).toBe('password')
  })

  it("accountState 'magic-link' when the email's user has no credential", async () => {
    dbStubs.caller = base
    dbStubs.user = { id: 'u1' }
    dbStubs.account = null
    expect((await getCallerInviteByToken('tok'))?.accountState).toBe('magic-link')
  })

  it('expired=true once inviteExpiresAt has passed (the 7-day link)', async () => {
    dbStubs.caller = { ...base, inviteExpiresAt: new Date(Date.now() - 1000) }
    expect((await getCallerInviteByToken('tok'))?.expired).toBe(true)
  })

  it('alreadyLinked=true when the caller already has a user', async () => {
    dbStubs.caller = { ...base, userId: 'u_existing' }
    dbStubs.user = { id: 'u_existing' }
    dbStubs.account = { id: 'acct_cred' }
    expect((await getCallerInviteByToken('tok'))?.alreadyLinked).toBe(true)
  })
})
