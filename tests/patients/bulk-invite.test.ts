import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Bulk portal invite skip rules: loops the single-invite core, skipping
 * patients with no email / already-linked (userId set) / archived, with a
 * per-patient summary. Role-gated to clinic staff.
 */

const tenantCtx = {
  tenantType: 'clinic' as 'clinic' | 'patient' | 'platform',
  organizationId: 'org_1',
  userId: 'user_staff',
  role: 'owner' as string,
}
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => tenantCtx),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

// Per-patient stub rows keyed by id.
const patients: Record<string, { email: string | null; userId: string | null; firstName: string; isActive: number }> = {}
const invitationInserts: Array<Record<string, unknown>> = []

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    let table = 'unknown'
    let whereArgs: any = null
    obj.from = (t: unknown) => {
      table = t === schema.patient ? 'patient' : t === schema.invitation ? 'invitation' : 'unknown'
      return obj
    }
    obj.where = (w: unknown) => {
      whereArgs = w
      return obj
    }
    obj.limit = async () => {
      if (table === 'patient') {
        // The eq() mock encodes args; pull the patient id out of the where tree.
        const id = findId(whereArgs)
        const p = id ? patients[id] : null
        return p ? [p] : []
      }
      // No pre-existing pending invitation by default.
      return []
    }
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: (t: unknown) => ({
        values: async (vals: Record<string, unknown>) => {
          if (t === schema.invitation) invitationInserts.push(vals)
        },
      }),
    },
    schema,
  }
})

// Extract the patient id from the nested eq()/and() args our drizzle mock
// built. We ONLY follow our own synthetic _and/_eq wrappers (never the real
// drizzle column objects, which are deep/circular) and pick out the pat_ value.
function findId(node: any): string | null {
  if (!node || typeof node !== 'object') return null
  if (node._eq) {
    const val = node._eq[1]
    if (typeof val === 'string' && val.startsWith('pat_')) return val
    return null
  }
  if (node._and) {
    for (const n of node._and) {
      const r = findId(n)
      if (r) return r
    }
  }
  return null
}

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...actual,
    and: (...a: unknown[]) => ({ _and: a }),
    eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
  }
})

const sendInvite = vi.fn(async () => {})
vi.mock('@/lib/email', () => ({
  sendPatientPortalInviteEmail: (...a: unknown[]) => sendInvite(...(a as [])),
}))
vi.mock('@/lib/services/clinic-sender', () => ({
  getClinicSenderIdentity: vi.fn(async () => ({ name: 'Acme Dental', from: 'acme@x', replyTo: null, gmail: null })),
}))

// Unused-by-this-test imports of patients/actions.ts that touch other services.
vi.mock('@/lib/services/patients', () => ({ createPatient: vi.fn(), updatePatient: vi.fn(), archivePatient: vi.fn() }))
vi.mock('@/lib/services/patient-bulk-comms', () => ({ sendBulkPatientEmail: vi.fn() }))
vi.mock('@/lib/services/patient-notes', () => ({ addPatientNote: vi.fn(), deletePatientNote: vi.fn() }))
vi.mock('@/lib/services/patient-messaging', () => ({ getOrCreatePatientThread: vi.fn() }))
vi.mock('@/lib/services/patient-intake-send', () => ({ sendIntakeRequestToPatient: vi.fn() }))
vi.mock('@/lib/services/reviews', () => ({ createAndSendReviewRequest: vi.fn() }))
vi.mock('@/lib/services/patient-import', () => ({
  importPatients: vi.fn(),
  autoMapColumns: vi.fn(),
  MAX_IMPORT_ROWS: 5000,
}))
vi.mock('@/lib/csv-parse', () => ({ parseCsvTable: vi.fn() }))
vi.mock('../ecommerce/customers/admin-actions', () => ({ enterDemoMode: vi.fn() }))
vi.mock('@/app/(default)/ecommerce/customers/admin-actions', () => ({ enterDemoMode: vi.fn() }))

import { bulkInvitePatientsToPortalAction } from '@/app/(default)/patients/actions'

beforeEach(() => {
  tenantCtx.tenantType = 'clinic'
  tenantCtx.role = 'owner'
  for (const k of Object.keys(patients)) delete patients[k]
  invitationInserts.length = 0
  sendInvite.mockClear()
})

describe('bulkInvitePatientsToPortalAction', () => {
  it('invites patients with an email and no linked user', async () => {
    patients['pat_a'] = { email: 'a@x.com', userId: null, firstName: 'Ann', isActive: 1 }
    patients['pat_b'] = { email: 'b@x.com', userId: null, firstName: 'Bob', isActive: 1 }
    const r = await bulkInvitePatientsToPortalAction(['pat_a', 'pat_b'])
    expect(r).toMatchObject({ invited: 2, alreadyLinked: 0, noEmail: 0, archived: 0, errors: 0 })
    expect(sendInvite).toHaveBeenCalledTimes(2)
    expect(invitationInserts).toHaveLength(2)
  })

  it('skips patients with no email', async () => {
    patients['pat_a'] = { email: null, userId: null, firstName: 'Ann', isActive: 1 }
    const r = await bulkInvitePatientsToPortalAction(['pat_a'])
    expect(r).toMatchObject({ invited: 0, noEmail: 1 })
    expect(sendInvite).not.toHaveBeenCalled()
  })

  it('skips patients who already have portal access (userId set)', async () => {
    patients['pat_a'] = { email: 'a@x.com', userId: 'u_existing', firstName: 'Ann', isActive: 1 }
    const r = await bulkInvitePatientsToPortalAction(['pat_a'])
    expect(r).toMatchObject({ invited: 0, alreadyLinked: 1 })
    expect(sendInvite).not.toHaveBeenCalled()
  })

  it('skips archived patients', async () => {
    patients['pat_a'] = { email: 'a@x.com', userId: null, firstName: 'Ann', isActive: 0 }
    const r = await bulkInvitePatientsToPortalAction(['pat_a'])
    expect(r).toMatchObject({ invited: 0, archived: 1 })
    expect(sendInvite).not.toHaveBeenCalled()
  })

  it('mixes skip reasons across a selection without aborting', async () => {
    patients['pat_a'] = { email: 'a@x.com', userId: null, firstName: 'Ann', isActive: 1 }
    patients['pat_b'] = { email: null, userId: null, firstName: 'Bob', isActive: 1 }
    patients['pat_c'] = { email: 'c@x.com', userId: 'u', firstName: 'Cy', isActive: 1 }
    const r = await bulkInvitePatientsToPortalAction(['pat_a', 'pat_b', 'pat_c'])
    expect(r).toMatchObject({ invited: 1, noEmail: 1, alreadyLinked: 1 })
  })

  it('rejects an empty selection', async () => {
    const r = await bulkInvitePatientsToPortalAction([])
    expect(r).toMatchObject({ ok: false })
  })

  it('refuses a patient-role caller', async () => {
    tenantCtx.role = 'patient'
    const r = await bulkInvitePatientsToPortalAction(['pat_a'])
    expect(r).toMatchObject({ ok: false })
  })

  it('refuses a non-clinic tenant', async () => {
    tenantCtx.tenantType = 'platform'
    const r = await bulkInvitePatientsToPortalAction(['pat_a'])
    expect(r).toMatchObject({ ok: false })
  })
})
