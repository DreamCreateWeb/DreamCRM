import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * THE GO-LIVE LEVER OPENS THE INQUIRIES DOOR ONCE (docs/ACTIVATION.md S3,
 * audit round 1). The door opens the FIRST time the site goes live. A site
 * taken offline and put back must not reopen a door the clinic closed in
 * between — the lever is reversible on purpose, and `openDoors` coalesces
 * (it would reopen a NULLed switch), so the action itself has to know
 * whether this pull is the first. Pinned: the first pull opens, a re-pull
 * does not, a refused pull returns the typed error and opens nothing.
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

  it('a site that was live before (taken offline, put back) re-stamps but does NOT reopen the door', async () => {
    state.before = new Date('2026-09-01T00:00:00Z')
    expect(await goLiveAction()).toEqual({ ok: true })
    expect(state.updates).toBe(1)
    expect(openDoorsAtSiteLive).not.toHaveBeenCalled()
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
