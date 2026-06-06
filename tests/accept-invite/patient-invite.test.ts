import { describe, it, expect, vi, beforeEach } from 'vitest'

const session = {
  current: null as null | {
    user: { id: string; email: string }
    session: { id: string }
  },
}

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  return { ...actual, randomUUID: () => 'uuid_1' }
})

vi.mock('@/lib/auth/server', () => ({
  auth: { api: { getSession: vi.fn(async () => session.current) } },
}))

const linkSpy = vi.fn(async () => {})
vi.mock('@/app/(auth)/accept-invite/link-patient', () => ({
  linkPatientRecord: (...args: unknown[]) => linkSpy(...args),
}))

const stubs = {
  invitation: null as null | { id: string; status: string; role: string; email: string; organizationId: string; expiresAt: Date | null },
  organization: null as null | { type: string },
  member: null as null | { id: string },
}

const inserts: Array<{ table: string; values: Record<string, unknown> }> = []
const updates: Array<{ table: string; values: Record<string, unknown> }> = []

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const tableName = (t: unknown): string => {
    if (t === schema.invitation) return 'invitation'
    if (t === schema.organization) return 'organization'
    if (t === schema.member) return 'member'
    if (t === schema.session) return 'session'
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
      const stub =
        table === 'invitation' ? stubs.invitation : table === 'organization' ? stubs.organization : table === 'member' ? stubs.member : null
      return stub ? [stub] : []
    }
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: async (vals: Record<string, unknown>) => {
          inserts.push({ table: tableName(t), values: vals })
        },
      }),
      update: (t: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            updates.push({ table: tableName(t), values: vals })
          },
        }),
      }),
    },
    schema,
  }
})

import { acceptPatientPortalInvite } from '@/app/(auth)/accept-invite/patient-invite'

beforeEach(() => {
  session.current = null
  stubs.invitation = null
  stubs.organization = null
  stubs.member = null
  inserts.length = 0
  updates.length = 0
  linkSpy.mockClear()
})

function pendingPatientInvite(email: string) {
  return { id: 'invite_tok', status: 'pending', role: 'patient', email, organizationId: 'org_1', expiresAt: null }
}

describe('acceptPatientPortalInvite', () => {
  it('rejects when not signed in', async () => {
    const res = await acceptPatientPortalInvite('invite_tok')
    expect(res.ok).toBe(false)
    expect(inserts).toHaveLength(0)
  })

  it('rejects an invitation whose email does not match the signed-in user (the binding guard)', async () => {
    session.current = { user: { id: 'u_attacker', email: 'attacker@evil.com' }, session: { id: 's_1' } }
    stubs.invitation = pendingPatientInvite('real.patient@x.com')
    const res = await acceptPatientPortalInvite('invite_tok')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/different email/i)
    // No membership created, no session/invite mutation, no patient link attempted.
    expect(inserts).toHaveLength(0)
    expect(updates).toHaveLength(0)
    expect(linkSpy).not.toHaveBeenCalled()
  })

  it('is case-insensitive / whitespace-tolerant on the email match', async () => {
    session.current = { user: { id: 'u_1', email: '  Real.Patient@X.com ' }, session: { id: 's_1' } }
    stubs.invitation = pendingPatientInvite('real.patient@x.com')
    stubs.organization = { type: 'clinic' }
    stubs.member = null
    const res = await acceptPatientPortalInvite('invite_tok')
    expect(res.ok).toBe(true)
    expect(inserts.some((i) => i.table === 'member' && i.values.role === 'patient')).toBe(true)
    expect(linkSpy).toHaveBeenCalledWith('invite_tok')
  })

  it('accepts the matching recipient and links the patient record', async () => {
    session.current = { user: { id: 'u_1', email: 'real.patient@x.com' }, session: { id: 's_1' } }
    stubs.invitation = pendingPatientInvite('real.patient@x.com')
    stubs.organization = { type: 'clinic' }
    stubs.member = null
    const res = await acceptPatientPortalInvite('invite_tok')
    expect(res.ok).toBe(true)
    expect(inserts.some((i) => i.table === 'member' && i.values.role === 'patient')).toBe(true)
    expect(updates.some((u) => u.table === 'session' && u.values.activeOrganizationId === 'org_1')).toBe(true)
    expect(updates.some((u) => u.table === 'invitation' && u.values.status === 'accepted')).toBe(true)
  })
})
