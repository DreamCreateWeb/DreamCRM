import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * completeCallerAcceptAction (P-02) — the signed-in completion step, the
 * partner's mirror: no session, expired invite, signed in as a DIFFERENT
 * email (with the sign-out next step), idempotent re-accept, normalized
 * email matching.
 */
const state = {
  invite: null as null | { callerId: string; name: string; email: string; alreadyLinked: boolean; expired: boolean; accountState: string },
  session: null as null | { user: { id: string; email: string } },
  existingCaller: null as null | { id: string },
}

const linkSpy = vi.fn(async (..._a: unknown[]) => {})

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/auth/server', () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}))
vi.mock('@/lib/services/prospect-callers', () => ({
  getCallerInviteByToken: vi.fn(async () => state.invite),
  getCallerByUserId: vi.fn(async () => state.existingCaller),
  linkCallerUser: (...a: unknown[]) => linkSpy(...a),
}))

import { completeCallerAcceptAction, getCallerInviteDetailsAction } from '@/app/(caller-accept)/caller/accept/accept-actions'

beforeEach(() => {
  state.invite = {
    callerId: 'pcal_1',
    name: 'Priya',
    email: 'priya@example.com',
    alreadyLinked: false,
    expired: false,
    accountState: 'none',
  }
  state.session = null
  state.existingCaller = null
  linkSpy.mockClear()
})

describe('completeCallerAcceptAction', () => {
  it('errors when the invite token is invalid', async () => {
    state.invite = null
    const r = await completeCallerAcceptAction('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid|already been used/i)
  })

  it('errors (clean copy) when the invite has expired', async () => {
    state.invite = { ...state.invite!, expired: true }
    const r = await completeCallerAcceptAction('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/expired/i)
    expect(linkSpy).not.toHaveBeenCalled()
  })

  it('errors when there is no session', async () => {
    const r = await completeCallerAcceptAction('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/sign in/i)
  })

  it('signed in as the matching email → links + succeeds', async () => {
    state.session = { user: { id: 'u1', email: 'priya@example.com' } }
    const r = await completeCallerAcceptAction('tok')
    expect(r.ok).toBe(true)
    expect(linkSpy).toHaveBeenCalledWith('pcal_1', 'u1')
  })

  it('matches email case-insensitively', async () => {
    state.session = { user: { id: 'u1', email: ' Priya@Example.COM ' } }
    const r = await completeCallerAcceptAction('tok')
    expect(r.ok).toBe(true)
  })

  it('signed in as a DIFFERENT email → names both + the sign-out step, links nothing', async () => {
    state.session = { user: { id: 'u2', email: 'someone-else@example.com' } }
    const r = await completeCallerAcceptAction('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('someone-else@example.com')
    expect(r.error).toContain('priya@example.com')
    expect(r.error?.toLowerCase()).toContain('sign out')
    expect(linkSpy).not.toHaveBeenCalled()
  })

  it('idempotent: already-linked THIS user → success without re-linking', async () => {
    state.session = { user: { id: 'u1', email: 'whatever@example.com' } }
    state.existingCaller = { id: 'pcal_1' }
    const r = await completeCallerAcceptAction('tok')
    expect(r.ok).toBe(true)
    expect(linkSpy).not.toHaveBeenCalled()
  })

  it('getCallerInviteDetailsAction refuses a short / empty token without a lookup', async () => {
    expect(await getCallerInviteDetailsAction('')).toBeNull()
    expect(await getCallerInviteDetailsAction('short')).toBeNull()
  })
})
