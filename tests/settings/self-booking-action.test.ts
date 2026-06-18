import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * saveSelfBookingAction + getPracticeSettings — the Settings → Practice toggle
 * that controls public-website online self-scheduling. Must be owner/admin +
 * clinic gated, persist the boolean, and resolve null → enabled (matching the
 * not-null default(true) column).
 */

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  organizationId: string
  organizationSlug: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/services/providers', () => ({
  listProviders: vi.fn(async () => []),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deactivateProvider: vi.fn(),
}))

const ops: Array<{ kind: 'update'; table: string; values: any }> = []
let selectProfile: Record<string, unknown> | null = null

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  return {
    db: {
      select: () => {
        const obj: any = {}
        obj.from = () => obj
        obj.where = () => obj
        obj.limit = async () => (selectProfile ? [selectProfile] : [])
        return obj
      },
      update: (table: unknown) => ({
        set: (v: any) => ({
          where: async () => {
            ops.push({ kind: 'update', table: table === clinicProfile ? 'clinic_profile' : 'other', values: v })
          },
        }),
      }),
    },
  }
})

import { saveSelfBookingAction, getPracticeSettings } from '@/app/(default)/settings/practice/actions'

beforeEach(() => {
  ops.length = 0
  selectProfile = null
  tenantCtx = { tenantType: 'clinic', role: 'owner', organizationId: 'org_1', organizationSlug: 'acme' }
})

describe('saveSelfBookingAction', () => {
  it('persists self_booking_enabled = false on the clinic profile', async () => {
    const r = await saveSelfBookingAction(false)
    expect(r).toEqual({ ok: true })
    expect(ops).toHaveLength(1)
    expect(ops[0].table).toBe('clinic_profile')
    expect(ops[0].values.selfBookingEnabled).toBe(false)
  })

  it('persists self_booking_enabled = true (coerces truthy to a real boolean)', async () => {
    const r = await saveSelfBookingAction(true)
    expect(r).toEqual({ ok: true })
    expect(ops[0].values.selfBookingEnabled).toBe(true)
  })

  it('is blocked for a non-clinic tenant', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'p', organizationSlug: 'dc' }
    await expect(saveSelfBookingAction(false)).rejects.toThrow(/clinic/i)
    expect(ops).toHaveLength(0)
  })

  it('is blocked for a non-owner/admin member', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await expect(saveSelfBookingAction(false)).rejects.toThrow(/owner|admin/i)
    expect(ops).toHaveLength(0)
  })
})

describe('getPracticeSettings — selfBookingEnabled resolution', () => {
  it('reflects an explicit false', async () => {
    selectProfile = { chairCount: 1, recallDefaultMonths: 6, visitTypeSettings: null, selfBookingEnabled: false }
    const data = await getPracticeSettings()
    expect(data.selfBookingEnabled).toBe(false)
  })

  it('treats null as enabled (default(true) column, no backfill)', async () => {
    selectProfile = { chairCount: 1, recallDefaultMonths: 6, visitTypeSettings: null, selfBookingEnabled: null }
    const data = await getPracticeSettings()
    expect(data.selfBookingEnabled).toBe(true)
  })
})
