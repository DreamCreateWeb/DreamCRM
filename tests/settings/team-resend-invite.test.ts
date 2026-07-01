import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * resendTeamInvitation: owner/admin only, scoped to the active org, only acts
 * on a still-pending invite, refreshes expiresAt, re-sends the email, and
 * reports whether the email went out. Plus inviteTeamMember's new `emailed`
 * return (true on send success, false when the send throws — the row survives).
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

const sendInvitationEmail = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/email', () => ({ sendInvitationEmail: (...a: unknown[]) => sendInvitationEmail(...a) }))

const state: {
  selectRows: unknown[][]
  updates: Record<string, unknown>[]
  inserts: Record<string, unknown>[]
} = { selectRows: [], updates: [], inserts: [] }

vi.mock('@/lib/db', () => {
  const selectChain = () => {
    const c: Record<string, unknown> = {}
    c.from = () => c
    c.innerJoin = () => c
    c.where = () => c
    // Each select() consumes the next queued result set (FIFO).
    c.limit = async () => state.selectRows.shift() ?? []
    return c
  }
  return {
    db: {
      select: () => selectChain(),
      insert: () => ({
        values: async (v: Record<string, unknown>) => {
          state.inserts.push(v)
        },
      }),
      update: () => ({
        set: (s: Record<string, unknown>) => ({
          where: async () => {
            state.updates.push(s)
          },
        }),
      }),
    },
    schema: {
      member: { userId: 'userId', organizationId: 'organizationId', role: 'role' },
      user: { id: 'id', email: 'email' },
      invitation: {
        id: 'id',
        email: 'email',
        role: 'role',
        status: 'status',
        organizationId: 'organizationId',
        expiresAt: 'expiresAt',
      },
    },
  }
})

import { resendTeamInvitation, inviteTeamMember } from '@/app/(default)/settings/team/actions'

beforeEach(() => {
  state.selectRows = []
  state.updates.length = 0
  state.inserts.length = 0
  sendInvitationEmail.mockClear()
  sendInvitationEmail.mockResolvedValue(undefined)
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    userId: 'u_owner',
    userName: 'Owner',
    organizationName: 'Acme Dental',
  }
})

describe('resendTeamInvitation', () => {
  it('refreshes expiry, re-sends the email, and reports emailed=true', async () => {
    state.selectRows = [[{ id: 'inv_1', email: 'ada@example.com', role: 'admin' }]]
    const res = await resendTeamInvitation('inv_1')
    expect(res).toEqual({ ok: true, emailed: true })
    // expiresAt refreshed to a future date.
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].expiresAt).toBeInstanceOf(Date)
    expect((state.updates[0].expiresAt as Date).getTime()).toBeGreaterThan(Date.now())
    // Email re-sent to the invited address with the invite link.
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1)
    const [to, data] = sendInvitationEmail.mock.calls[0] as [string, { role: string; inviteUrl: string }]
    expect(to).toBe('ada@example.com')
    expect(data.role).toBe('admin')
    expect(data.inviteUrl).toContain('inv_1')
  })

  it('reports emailed=false when the send throws (invite still refreshed)', async () => {
    state.selectRows = [[{ id: 'inv_1', email: 'ada@example.com', role: 'member' }]]
    sendInvitationEmail.mockRejectedValueOnce(new Error('smtp down'))
    const res = await resendTeamInvitation('inv_1')
    expect(res).toEqual({ ok: true, emailed: false })
    expect(state.updates).toHaveLength(1) // expiry still bumped
  })

  it('throws when the invitation is not pending / not in this org', async () => {
    state.selectRows = [[]] // scoped+pending lookup finds nothing
    await expect(resendTeamInvitation('inv_missing')).rejects.toThrow(/no longer pending/i)
    expect(state.updates).toEqual([])
    expect(sendInvitationEmail).not.toHaveBeenCalled()
  })

  it('rejects a plain member viewer', async () => {
    tenantCtx!.role = 'member'
    await expect(resendTeamInvitation('inv_1')).rejects.toThrow(/owners and admins/i)
    expect(sendInvitationEmail).not.toHaveBeenCalled()
  })

  it('rejects a patient tenant', async () => {
    tenantCtx!.tenantType = 'patient'
    tenantCtx!.role = 'patient'
    await expect(resendTeamInvitation('inv_1')).rejects.toThrow(/not available to patients/i)
  })

  it('lets an admin resend too', async () => {
    tenantCtx!.role = 'admin'
    state.selectRows = [[{ id: 'inv_1', email: 'ada@example.com', role: 'member' }]]
    const res = await resendTeamInvitation('inv_1')
    expect(res).toEqual({ ok: true, emailed: true })
  })
})

describe('inviteTeamMember email reporting', () => {
  // The action runs two scoped selects (existing-member? + existing-pending?)
  // before inserting; both must resolve empty for a fresh invite.
  function primeFreshInvite() {
    state.selectRows = [[], []]
  }

  it('returns emailed=true when the invite email sends', async () => {
    primeFreshInvite()
    const res = await inviteTeamMember({ email: 'New@Example.com', role: 'member' })
    expect(res.ok).toBe(true)
    expect(res.emailed).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].email).toBe('new@example.com') // normalized
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1)
  })

  it('returns emailed=false but still creates the row when the email throws', async () => {
    primeFreshInvite()
    sendInvitationEmail.mockRejectedValueOnce(new Error('smtp down'))
    const res = await inviteTeamMember({ email: 'new@example.com', role: 'admin' })
    expect(res.ok).toBe(true)
    expect(res.emailed).toBe(false)
    expect(state.inserts).toHaveLength(1) // row persisted despite email failure
  })
})
