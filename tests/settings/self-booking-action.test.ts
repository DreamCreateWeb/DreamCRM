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

// getPracticeSettings folds in the Connect-can-charge flag for the deposit
// editor hint — not what this suite exercises.
vi.mock('@/lib/services/booking-deposits', () => ({
  canTakeBookingDeposits: vi.fn(async () => false),
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

import { saveSelfBookingAction, savePracticeOpsAction, getPracticeSettings } from '@/app/(default)/settings/practice/actions'

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

describe('savePracticeOpsAction — lapsed threshold', () => {
  it('persists a valid lapsed-after-months value', async () => {
    const r = await savePracticeOpsAction({ chairCount: 3, recallDefaultMonths: 6, lapsedAfterMonths: 24 })
    expect(r).toEqual({ ok: true })
    expect(ops[0].values.lapsedAfterMonths).toBe(24)
  })

  it('clamps an out-of-range value into [6, 60]', async () => {
    await savePracticeOpsAction({ chairCount: 1, recallDefaultMonths: 6, lapsedAfterMonths: 999 })
    expect(ops[0].values.lapsedAfterMonths).toBe(60)
  })

  it('falls back to 18 for a non-finite value', async () => {
    await savePracticeOpsAction({ chairCount: 1, recallDefaultMonths: 6, lapsedAfterMonths: Number.NaN })
    expect(ops[0].values.lapsedAfterMonths).toBe(18)
  })

  it('is blocked for a non-owner/admin member', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await expect(savePracticeOpsAction({ chairCount: 1, recallDefaultMonths: 6, lapsedAfterMonths: 18 })).rejects.toThrow(/owner|admin/i)
    expect(ops).toHaveLength(0)
  })
})

describe('getPracticeSettings — lapsedAfterMonths resolution', () => {
  it('returns the stored value', async () => {
    selectProfile = { chairCount: 1, recallDefaultMonths: 6, lapsedAfterMonths: 12, visitTypeSettings: null, selfBookingEnabled: true }
    expect((await getPracticeSettings()).lapsedAfterMonths).toBe(12)
  })
  it('defaults to 18 when null', async () => {
    selectProfile = { chairCount: 1, recallDefaultMonths: 6, lapsedAfterMonths: null, visitTypeSettings: null, selfBookingEnabled: true }
    expect((await getPracticeSettings()).lapsedAfterMonths).toBe(18)
  })
})
