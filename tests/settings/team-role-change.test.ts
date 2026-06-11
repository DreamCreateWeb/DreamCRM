import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * changeTeamMemberRole gating: only owner/admin viewers, never your own role,
 * never the owner's role, target must be a real member of this org.
 */
type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  organizationId: string
  userId: string
  userName: string
  organizationName: string
} | null
let tenantCtx: Ctx = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendInvitationEmail: vi.fn() }))

const state: { selectRow: unknown[]; updates: Record<string, unknown>[] } = {
  selectRow: [],
  updates: [],
}

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.where = () => c
    c.limit = async () => state.selectRow
    return c
  }
  return {
    db: {
      select: () => selectChain(),
      update: () => ({
        set: (s: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(s)
          },
        }),
      }),
    },
    schema: { member: { userId: 'userId', organizationId: 'organizationId', role: 'role' } },
  }
})

import { changeTeamMemberRole } from '@/app/(default)/settings/team/actions'

beforeEach(() => {
  state.selectRow = [{ role: 'member' }]
  state.updates.length = 0
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    userId: 'u_owner',
    userName: 'Owner',
    organizationName: 'Acme Dental',
  }
})

describe('changeTeamMemberRole', () => {
  it('promotes a member to admin (owner acting)', async () => {
    const res = await changeTeamMemberRole({ userId: 'u_jane', role: 'admin' })
    expect(res).toEqual({ ok: true })
    expect(state.updates).toEqual([{ role: 'admin' }])
  })

  it('lets an admin change roles too', async () => {
    tenantCtx!.role = 'admin'
    await changeTeamMemberRole({ userId: 'u_jane', role: 'member' })
    expect(state.updates).toEqual([{ role: 'member' }])
  })

  it('rejects a plain member viewer', async () => {
    tenantCtx!.role = 'member'
    await expect(changeTeamMemberRole({ userId: 'u_jane', role: 'admin' })).rejects.toThrow(/owners and admins/i)
    expect(state.updates).toEqual([])
  })

  it('rejects a patient tenant', async () => {
    tenantCtx!.tenantType = 'patient'
    tenantCtx!.role = 'patient'
    await expect(changeTeamMemberRole({ userId: 'u_jane', role: 'admin' })).rejects.toThrow(/not available to patients/i)
  })

  it("refuses to change your OWN role", async () => {
    await expect(changeTeamMemberRole({ userId: 'u_owner', role: 'admin' })).rejects.toThrow(/your own role/i)
    expect(state.updates).toEqual([])
  })

  it("refuses to change the OWNER's role", async () => {
    state.selectRow = [{ role: 'owner' }]
    await expect(changeTeamMemberRole({ userId: 'u_founder', role: 'member' })).rejects.toThrow(/owner's role/i)
    expect(state.updates).toEqual([])
  })

  it('rejects a target who is not a member of this org', async () => {
    state.selectRow = []
    await expect(changeTeamMemberRole({ userId: 'u_ghost', role: 'admin' })).rejects.toThrow(/not a member/i)
    expect(state.updates).toEqual([])
  })

  it('rejects an invalid role value', async () => {
    await expect(changeTeamMemberRole({ userId: 'u_jane', role: 'owner' })).rejects.toThrow()
    expect(state.updates).toEqual([])
  })
})
