import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE AUDIENCE LOCK's WRITE PATH (Phase 4 slice 3) — the only code that can
 * start the machine addressing customers, and until round 16 the only test
 * naming it `vi.mock`ed the whole module away, so the real action had never
 * been imported by any test in the repo.
 *
 * Two properties, both load-bearing: the platform-admin bar, and the wire
 * floor (anything but the literal 'clinic' locks back to platform-only).
 */

const ctx = vi.hoisted(() => ({
  value: { tenantType: 'platform', role: 'owner' } as Record<string, unknown>,
  throws: false,
}))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (ctx.throws) throw new Error('Unauthorized')
    return ctx.value
  }),
}))

const store = vi.hoisted(() => ({ written: [] as string[], fail: false }))
vi.mock('@/lib/services/platform-config', () => ({
  setGuardianAudience: vi.fn(async (a: string) => {
    if (store.fail) throw new Error('db down')
    store.written.push(a)
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setGuardianAudienceAction } from '@/app/(default)/dashboard/admin-actions'

beforeEach(() => {
  ctx.value = { tenantType: 'platform', role: 'owner' }
  ctx.throws = false
  store.written = []
  store.fail = false
})

describe('setGuardianAudienceAction', () => {
  it('a platform owner can open the lock', async () => {
    const r = await setGuardianAudienceAction({ audience: 'clinic' })
    expect(r.ok).toBe(true)
    expect(store.written).toEqual(['clinic'])
  })

  it('a CLINIC tenant cannot — this is Dream Create’s decision, not a customer’s', async () => {
    ctx.value = { tenantType: 'clinic', role: 'owner' }
    await expect(setGuardianAudienceAction({ audience: 'clinic' })).rejects.toThrow(/platform only/i)
    expect(store.written).toEqual([])
  })

  it('a platform MEMBER cannot — owner or admin only', async () => {
    ctx.value = { tenantType: 'platform', role: 'member' }
    await expect(setGuardianAudienceAction({ audience: 'clinic' })).rejects.toThrow(/owner or admin/i)
    expect(store.written).toEqual([])
  })

  it('an unauthenticated caller never reaches the service', async () => {
    ctx.throws = true
    await expect(setGuardianAudienceAction({ audience: 'clinic' })).rejects.toThrow()
    expect(store.written).toEqual([])
  })

  it('the WIRE FLOOR: anything but the literal "clinic" locks back to platform', async () => {
    // The value decides whether the machine talks to customers, so a typo,
    // a stale client, or a hand-rolled POST must land on the safe side.
    for (const bad of ['CLINIC', 'clinics', '', 'platform', undefined, null, 1, true]) {
      store.written = []
      await setGuardianAudienceAction({ audience: bad as never })
      expect(store.written).toEqual(['platform'])
    }
  })

  it('a failed write reports the failure instead of claiming it saved', async () => {
    store.fail = true
    const r = await setGuardianAudienceAction({ audience: 'clinic' })
    expect(r.ok).toBe(false)
  })
})
