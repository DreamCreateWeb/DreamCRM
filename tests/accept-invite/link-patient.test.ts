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
  invitation: null as null | { organizationId: string },
}

const updates: Array<{ table: string; values: Record<string, unknown> }> = []
// Capture the WHERE clause used for the patient lookup so we can assert the
// email match is case-insensitive (built with a lower() SQL expression).
const patientWhere: { value: unknown } = { value: null }

vi.mock('@/lib/db', async () => {
  const { patient } = await import('@/lib/db/schema/clinic')
  const { member, invitation } = await import('@/lib/db/schema/auth')
  const chain = () => {
    const obj: any = {}
    let table: 'patient' | 'member' | 'invitation' | 'unknown' = 'unknown'
    obj.from = (t: unknown) => {
      if (t === patient) table = 'patient'
      else if (t === member) table = 'member'
      else if (t === invitation) table = 'invitation'
      return obj
    }
    obj.where = (w: unknown) => {
      if (table === 'patient') patientWhere.value = w
      return obj
    }
    obj.limit = async () => {
      const stub =
        table === 'patient'
          ? stubs.patient
          : table === 'member'
            ? stubs.member
            : table === 'invitation'
              ? stubs.invitation
              : null
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
  stubs.invitation = null
  updates.length = 0
  patientWhere.value = null
})

/** Flatten a drizzle SQL/condition tree to a lowercase string for assertions. */
function sqlText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(sqlText).join(' ')
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    // drizzle SQL carries queryChunks; AND/eq carry nested conditions/value.
    return [o.queryChunks, o.conditions, o.value, o.left, o.right, o.column, o.name]
      .map(sqlText)
      .join(' ')
  }
  return ''
}

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

  it('matches the patient email case-insensitively (lower() comparison)', async () => {
    // A patient row whose stored email casing differs from the account email
    // must still link — the lookup uses a lower() comparison, not exact eq.
    session.current = {
      user: { id: 'u_1', email: 'Jane@Example.com' },
      session: { activeOrganizationId: 'org_1' },
    }
    stubs.member = { userId: 'u_1', organizationId: 'org_1', role: 'patient' }
    stubs.patient = { id: 'pat_1', userId: null }
    await linkPatientRecord()
    expect(updates).toHaveLength(1)
    expect(updates[0].values.userId).toBe('u_1')
    // Prove the WHERE clause is case-insensitive (built with lower()).
    expect(sqlText(patientWhere.value).toLowerCase()).toContain('lower')
  })

  it('resolves the org from the invitation token even when the session has no active org', async () => {
    // The race the fix closes: a brand-new sign-up's session has no
    // activeOrganizationId yet right after accepting, so resolving the org
    // from the invite token is what lets the patient record link at all.
    session.current = {
      user: { id: 'u_1', email: 'a@x.com' },
      session: { activeOrganizationId: null },
    }
    stubs.invitation = { organizationId: 'org_invited' }
    stubs.member = { userId: 'u_1', organizationId: 'org_invited', role: 'patient' }
    stubs.patient = { id: 'pat_1', userId: null }
    await linkPatientRecord('invite_tok')
    expect(updates).toHaveLength(1)
    expect(updates[0].values.userId).toBe('u_1')
  })
})
