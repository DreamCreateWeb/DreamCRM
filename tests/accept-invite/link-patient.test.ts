import { describe, it, expect, vi, beforeEach } from 'vitest'

const session = {
  current: null as null | {
    user: { id: string; email: string }
    session: { activeOrganizationId: string | null }
  },
}

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

vi.mock('@/lib/auth/server', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => session.current),
    },
  },
}))

const stubs = {
  member: null as null | { userId: string; organizationId: string; role: string },
  patient: null as null | { id: string; userId: string | null },
}

const updates: Array<{ table: string; values: Record<string, unknown> }> = []

vi.mock('@/lib/db', async () => {
  const { patient } = await import('@/lib/db/schema/clinic')
  const { member } = await import('@/lib/db/schema/auth')
  const chain = () => {
    const obj: any = {}
    let table: 'patient' | 'member' | 'unknown' = 'unknown'
    obj.from = (t: unknown) => {
      if (t === patient) table = 'patient'
      else if (t === member) table = 'member'
      return obj
    }
    obj.where = () => obj
    obj.limit = async () => {
      const stub = table === 'patient' ? stubs.patient : stubs.member
      return stub ? [stub] : []
    }
    return obj
  }
  return {
    db: {
      select: () => chain(),
      update: (table: unknown) => ({
        set: (vals: Record<string, unknown>) => ({
          where: async () => {
            updates.push({ table: table === patient ? 'patient' : 'unknown', values: vals })
          },
        }),
      }),
    },
  }
})

import { linkPatientRecord } from '@/app/(auth)/accept-invite/link-patient'

beforeEach(() => {
  session.current = null
  stubs.member = null
  stubs.patient = null
  updates.length = 0
})

describe('linkPatientRecord', () => {
  it('no-ops when not signed in', async () => {
    await linkPatientRecord()
    expect(updates).toHaveLength(0)
  })

  it('no-ops when no active organization', async () => {
    session.current = {
      user: { id: 'u_1', email: 'a@x.com' },
      session: { activeOrganizationId: null },
    }
    await linkPatientRecord()
    expect(updates).toHaveLength(0)
  })

  it('no-ops when user is not a patient role', async () => {
    session.current = {
      user: { id: 'u_1', email: 'a@x.com' },
      session: { activeOrganizationId: 'org_1' },
    }
    stubs.member = { userId: 'u_1', organizationId: 'org_1', role: 'member' }
    await linkPatientRecord()
    expect(updates).toHaveLength(0)
  })

  it('no-ops when patient record is already linked to a user', async () => {
    session.current = {
      user: { id: 'u_1', email: 'a@x.com' },
      session: { activeOrganizationId: 'org_1' },
    }
    stubs.member = { userId: 'u_1', organizationId: 'org_1', role: 'patient' }
    stubs.patient = { id: 'pat_1', userId: 'u_existing' }
    await linkPatientRecord()
    expect(updates).toHaveLength(0)
  })

  it('no-ops when no patient record exists for that email', async () => {
    session.current = {
      user: { id: 'u_1', email: 'a@x.com' },
      session: { activeOrganizationId: 'org_1' },
    }
    stubs.member = { userId: 'u_1', organizationId: 'org_1', role: 'patient' }
    stubs.patient = null
    await linkPatientRecord()
    expect(updates).toHaveLength(0)
  })

  it('updates patient.userId when an unlinked patient record matches by email', async () => {
    session.current = {
      user: { id: 'u_1', email: 'a@x.com' },
      session: { activeOrganizationId: 'org_1' },
    }
    stubs.member = { userId: 'u_1', organizationId: 'org_1', role: 'patient' }
    stubs.patient = { id: 'pat_1', userId: null }
    await linkPatientRecord()
    expect(updates).toHaveLength(1)
    expect(updates[0].table).toBe('patient')
    expect(updates[0].values.userId).toBe('u_1')
  })
})
