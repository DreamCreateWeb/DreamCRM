import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * acceptTeamInvite — the robust server-side accept that replaces better-auth's
 * finicky `organization.acceptInvitation`. The first real clinic's accept errored
 * AFTER the account was created (orphaned user → duplicate clinic in onboarding).
 * These pin the contract: a valid invite inserts the membership + points the
 * session at the org + marks the invite accepted; every invalid case refuses
 * WITHOUT minting a membership.
 */

const state = {
  session: null as null | { user: { id: string; email: string }; session: { id: string } },
  invitation: null as null | {
    id: string
    organizationId: string
    email: string
    role: string | null
    status: string
    expiresAt: Date | null
  },
  org: null as null | { id: string },
  existingMember: null as null | { id: string },
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
}

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('@/lib/auth/server', () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}))

vi.mock('@/lib/db', () => {
  const schema = {
    invitation: { t: 'invitation' },
    organization: { t: 'organization' },
    member: { t: 'member' },
    session: { t: 'session' },
  }
  const tableOf = (x: unknown) => (x as { t?: string })?.t ?? 'unknown'
  const db = {
    select: () => {
      let table = 'unknown'
      const obj: Record<string, unknown> = {}
      obj.from = (t: unknown) => { table = tableOf(t); return obj }
      obj.where = () => obj
      obj.limit = async () => {
        if (table === 'invitation') return state.invitation ? [state.invitation] : []
        if (table === 'organization') return state.org ? [state.org] : []
        if (table === 'member') return state.existingMember ? [state.existingMember] : []
        return []
      }
      return obj
    },
    insert: (t: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        state.inserts.push({ table: tableOf(t), values })
      },
    }),
    update: (t: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => { state.updates.push({ table: tableOf(t), set }) },
      }),
    }),
  }
  return { db, schema }
})

import { acceptTeamInvite } from '@/app/(auth)/accept-invite/team-invite'

function validInvite(over: Partial<NonNullable<typeof state.invitation>> = {}) {
  return {
    id: 'inv_1',
    organizationId: 'org_real',
    email: 'owner@clinic.com',
    role: 'owner',
    status: 'pending',
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    ...over,
  }
}

beforeEach(() => {
  state.session = { user: { id: 'usr_1', email: 'owner@clinic.com' }, session: { id: 'sess_1' } }
  state.invitation = validInvite()
  state.org = { id: 'org_real' }
  state.existingMember = null
  state.inserts = []
  state.updates = []
})

describe('acceptTeamInvite', () => {
  it('inserts the membership, points the session at the org, and marks the invite accepted', async () => {
    const r = await acceptTeamInvite('inv_1')
    expect(r).toEqual({ ok: true, organizationId: 'org_real' })

    const memberInsert = state.inserts.find((i) => i.table === 'member')
    expect(memberInsert, 'member row inserted').toBeTruthy()
    expect(memberInsert!.values).toMatchObject({ organizationId: 'org_real', userId: 'usr_1', role: 'owner' })

    const sessUpdate = state.updates.find((u) => u.table === 'session')
    expect(sessUpdate!.set).toMatchObject({ activeOrganizationId: 'org_real' })

    const invUpdate = state.updates.find((u) => u.table === 'invitation')
    expect(invUpdate!.set).toMatchObject({ status: 'accepted' })
  })

  it('is idempotent — re-accepting an already-joined org adds no duplicate member', async () => {
    state.existingMember = { id: 'mem_existing' }
    const r = await acceptTeamInvite('inv_1')
    expect(r.ok).toBe(true)
    expect(state.inserts.find((i) => i.table === 'member')).toBeUndefined()
    // still re-points the session (recovers an org-less flap)
    expect(state.updates.find((u) => u.table === 'session')).toBeTruthy()
  })

  it('preserves the admin role from the invitation', async () => {
    state.invitation = validInvite({ role: 'admin' })
    await acceptTeamInvite('inv_1')
    expect(state.inserts.find((i) => i.table === 'member')!.values).toMatchObject({ role: 'admin' })
  })

  it('refuses when not signed in (no membership minted)', async () => {
    state.session = null
    const r = await acceptTeamInvite('inv_1')
    expect(r.ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
  })

  it('refuses a forwarded link claimed by a DIFFERENT email', async () => {
    state.session = { user: { id: 'usr_2', email: 'someone-else@x.com' }, session: { id: 'sess_2' } }
    const r = await acceptTeamInvite('inv_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/different email/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('accepts despite email CASING differences (normalized compare)', async () => {
    state.session = { user: { id: 'usr_1', email: 'Owner@Clinic.com' }, session: { id: 'sess_1' } }
    const r = await acceptTeamInvite('inv_1')
    expect(r.ok).toBe(true)
  })

  it('refuses an expired invitation', async () => {
    state.invitation = validInvite({ expiresAt: new Date(Date.now() - 1000) })
    const r = await acceptTeamInvite('inv_1')
    expect(r.ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
  })

  it('refuses an already-accepted invitation', async () => {
    state.invitation = validInvite({ status: 'accepted' })
    const r = await acceptTeamInvite('inv_1')
    expect(r.ok).toBe(false)
  })

  it('refuses a PATIENT invite (wrong path — would mint a clinic member)', async () => {
    state.invitation = validInvite({ role: 'patient' })
    const r = await acceptTeamInvite('inv_1')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/patient/i)
    expect(state.inserts).toHaveLength(0)
  })

  it('refuses an unknown token', async () => {
    state.invitation = null
    const r = await acceptTeamInvite('nope')
    expect(r.ok).toBe(false)
    expect(state.inserts).toHaveLength(0)
  })
})
