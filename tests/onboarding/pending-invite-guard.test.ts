import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * findPendingInviteForEmail — the guard that stops the "duplicate clinic" bug.
 * An org-less signed-in user is normally routed into onboarding; if they were
 * INVITED to an existing clinic, dashboard-shell + submitOnboarding use this to
 * send them to accept it instead of minting a duplicate. Must be best-effort
 * (never throw) and must IGNORE expired / non-pending invites.
 */

const state = {
  rows: [] as Array<{ id: string; organizationId: string; expiresAt: Date | null }>,
  throwOnSelect: false,
}

vi.mock('@/lib/db', () => {
  const db = {
    select: () => {
      const obj: Record<string, unknown> = {}
      obj.from = () => obj
      obj.where = () => obj
      obj.orderBy = () => obj
      obj.limit = async () => {
        if (state.throwOnSelect) throw new Error('db down')
        return state.rows
      }
      return obj
    },
  }
  return { db, schema: { invitation: { t: 'invitation' } } }
})

import { findPendingInviteForEmail } from '@/lib/auth/pending-invite'

beforeEach(() => {
  state.rows = []
  state.throwOnSelect = false
})

describe('findPendingInviteForEmail', () => {
  it('returns the pending invite (id + org) for a matching email', async () => {
    state.rows = [{ id: 'inv_1', organizationId: 'org_real', expiresAt: new Date(Date.now() + 100000) }]
    const r = await findPendingInviteForEmail('owner@clinic.com')
    expect(r).toEqual({ id: 'inv_1', organizationId: 'org_real' })
  })

  it('returns null when the only pending invite is EXPIRED (no duplicate-clinic rescue off a dead invite)', async () => {
    state.rows = [{ id: 'inv_old', organizationId: 'org_real', expiresAt: new Date(Date.now() - 1000) }]
    expect(await findPendingInviteForEmail('owner@clinic.com')).toBeNull()
  })

  it('returns null when there is no pending invite', async () => {
    state.rows = []
    expect(await findPendingInviteForEmail('nobody@x.com')).toBeNull()
  })

  it('returns null on an empty / missing email (no lookup needed)', async () => {
    expect(await findPendingInviteForEmail('')).toBeNull()
    expect(await findPendingInviteForEmail(null)).toBeNull()
    expect(await findPendingInviteForEmail(undefined)).toBeNull()
  })

  it('never throws — a DB error yields null (fall through to normal onboarding)', async () => {
    state.throwOnSelect = true
    expect(await findPendingInviteForEmail('owner@clinic.com')).toBeNull()
  })
})
