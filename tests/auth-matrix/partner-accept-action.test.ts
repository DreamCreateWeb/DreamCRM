import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * completePartnerAcceptAction — the signed-in completion step.
 * Covers: no session, expired invite, signed-in-as-different-email (with the
 * sign-out next step), idempotent re-accept, and normalized email matching.
 */
const state = {
  invite: null as null | { partnerId: string; name: string; email: string; alreadyLinked: boolean; expired: boolean; accountState: string },
  session: null as null | { user: { id: string; email: string } },
  existingPartner: null as null | { id: string },
}

const linkSpy = vi.fn(async (..._a: unknown[]) => {})

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/auth/server', () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}))
vi.mock('@/lib/services/referrals', () => ({
  getPartnerInviteByToken: vi.fn(async () => state.invite),
  getPartnerByUserId: vi.fn(async () => state.existingPartner),
  linkPartnerUser: (...a: unknown[]) => linkSpy(...a),
}))

import { completePartnerAcceptAction } from '@/app/(partner-accept)/partner/accept/accept-actions'

beforeEach(() => {
  state.invite = {
    partnerId: 'p1',
    name: 'Jordan',
    email: 'jordan@example.com',
    alreadyLinked: false,
    expired: false,
    accountState: 'none',
  }
  state.session = null
  state.existingPartner = null
  linkSpy.mockClear()
})

describe('completePartnerAcceptAction', () => {
  it('errors when the invite token is invalid', async () => {
    state.invite = null
    const r = await completePartnerAcceptAction('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid|already been used/i)
  })

  it('errors (clean copy) when the invite has expired', async () => {
    state.invite = { ...state.invite!, expired: true }
    const r = await completePartnerAcceptAction('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/expired/i)
    expect(linkSpy).not.toHaveBeenCalled()
  })

  it('errors when there is no session', async () => {
    state.session = null
    const r = await completePartnerAcceptAction('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/sign in/i)
  })

  it('signed in as the matching email → links + succeeds', async () => {
    state.session = { user: { id: 'u1', email: 'jordan@example.com' } }
    const r = await completePartnerAcceptAction('tok')
    expect(r.ok).toBe(true)
    expect(linkSpy).toHaveBeenCalledWith('p1', 'u1')
  })

  it('matches email case-insensitively', async () => {
    state.session = { user: { id: 'u1', email: ' Jordan@Example.COM ' } }
    const r = await completePartnerAcceptAction('tok')
    expect(r.ok).toBe(true)
    expect(linkSpy).toHaveBeenCalled()
  })

  it('signed in as a DIFFERENT email → error names both + the sign-out step', async () => {
    state.session = { user: { id: 'u2', email: 'someone-else@example.com' } }
    const r = await completePartnerAcceptAction('tok')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('someone-else@example.com')
    expect(r.error).toContain('jordan@example.com')
    expect(r.error?.toLowerCase()).toContain('sign out')
    expect(linkSpy).not.toHaveBeenCalled()
  })

  it('idempotent: already-linked THIS user → success without re-linking', async () => {
    state.session = { user: { id: 'u1', email: 'whatever@example.com' } }
    state.existingPartner = { id: 'p1' } // same partner already linked to this user
    const r = await completePartnerAcceptAction('tok')
    expect(r.ok).toBe(true)
    expect(linkSpy).not.toHaveBeenCalled()
  })
})
