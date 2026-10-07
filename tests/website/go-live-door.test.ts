import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE GO-LIVE LEVER OFFERS THE INQUIRIES DOOR (docs/ACTIVATION.md S3). A
 * site taken offline and put back must not reopen a door the clinic closed
 * in between — and that is the OPENER's law now (`doors_closed`, audit
 * round 2: round 1 guarded on `siteLiveAt`, which take-offline nulls, so
 * the guard was true again on every re-pull). Pinned: every successful
 * pull calls the opener, a refused pull returns the typed error and opens
 * nothing; the closed-door rule is pinned in tests/feature-switches.
 */

const state = { before: null as Date | null, role: 'owner', updates: 0, updateThrows: false }
const openDoorsAtSiteLive = vi.fn(async () => ['leads'])
vi.mock('@/lib/services/feature-switches', () => ({ openDoorsAtSiteLive: (...a: unknown[]) => openDoorsAtSiteLive(...(a as [])) }))
vi.mock('@/lib/services/clinic-site-cache', () => ({ invalidateClinicSiteEverywhere: () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: async () => ({ tenantType: 'clinic', role: state.role, organizationId: 'org_a', organizationSlug: 'acme' }),
}))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ siteLiveAt: state.before }] }) }) }),
    update: () => ({
      set: () => ({
        where: async () => {
          if (state.updateThrows) throw new Error('db down')
          state.updates++
        },
      }),
    }),
  },
}))

import { goLiveAction } from '@/app/(default)/website/go-live-actions'

beforeEach(() => {
  state.before = null
  state.role = 'owner'
  state.updates = 0
  state.updateThrows = false
  openDoorsAtSiteLive.mockClear()
})

describe('goLiveAction and the Inquiries door', () => {
  it('the first pull stamps the site live and opens the door', async () => {
    expect(await goLiveAction()).toEqual({ ok: true })
    expect(state.updates).toBe(1)
    expect(openDoorsAtSiteLive).toHaveBeenCalledWith('org_a')
  })

  it('a site that was live before (taken offline, put back) still offers the door — the opener honors a close', async () => {
    state.before = new Date('2026-09-01T00:00:00Z')
    expect(await goLiveAction()).toEqual({ ok: true })
    expect(state.updates).toBe(1)
    expect(openDoorsAtSiteLive).toHaveBeenCalledWith('org_a')
  })

  it('a member cannot pull the lever, and a failed write opens nothing', async () => {
    state.role = 'member'
    expect((await goLiveAction()).ok).toBe(false)
    state.role = 'owner'
    state.updateThrows = true
    expect(await goLiveAction()).toEqual({ ok: false, error: 'Could not take the site live — try again' })
    expect(openDoorsAtSiteLive).not.toHaveBeenCalled()
  })
})
