import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * resolveAccountState — the keystone for account-state-aware accept pages.
 * One email = one better-auth user; this resolves which world an email lives
 * in so the accept page shows create / password / magic-link correctly.
 *
 * Drives the `user` + `account` table reads via a per-table db stub.
 */
const stubs = {
  user: null as null | { id: string },
  account: null as null | { id: string },
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema/auth')
  const tableName = (t: unknown): string => {
    if (t === schema.user) return 'user'
    if (t === schema.account) return 'account'
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
    obj.limit = async () => {
      if (table === 'user') return stubs.user ? [stubs.user] : []
      if (table === 'account') return stubs.account ? [stubs.account] : []
      return []
    }
    return obj
  }
  return { db: { select: () => chain() } }
})

import { resolveAccountState } from '@/lib/auth/account-state'

beforeEach(() => {
  stubs.user = null
  stubs.account = null
})

describe('resolveAccountState', () => {
  it("'none' when no user row exists for the email", async () => {
    stubs.user = null
    const r = await resolveAccountState('new@example.com')
    expect(r.state).toBe('none')
    expect(r.userId).toBeNull()
  })

  it("'password' when a user exists WITH a credential account row", async () => {
    stubs.user = { id: 'u1' }
    stubs.account = { id: 'acct_cred' }
    const r = await resolveAccountState('person@example.com')
    expect(r.state).toBe('password')
    expect(r.userId).toBe('u1')
  })

  it("'magic-link' when a user exists but has NO credential row", async () => {
    stubs.user = { id: 'u1' }
    stubs.account = null
    const r = await resolveAccountState('magic@example.com')
    expect(r.state).toBe('magic-link')
    expect(r.userId).toBe('u1')
  })

  it("'none' for an empty / blank email (never throws)", async () => {
    expect((await resolveAccountState('')).state).toBe('none')
    expect((await resolveAccountState('   ')).state).toBe('none')
  })

  it('matching is case/space-insensitive (lookup is normalized)', async () => {
    stubs.user = { id: 'u1' }
    stubs.account = { id: 'acct_cred' }
    const r = await resolveAccountState('  Person@Example.COM ')
    expect(r.state).toBe('password')
  })
})
