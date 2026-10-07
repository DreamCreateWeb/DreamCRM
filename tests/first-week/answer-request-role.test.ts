import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Answering a customer's PMS connect request from the cockpit is an
 * owner/admin act (audit round 2: the action checked the tenant type only,
 * so any platform-org MEMBER could close a clinic's request).
 */
const state = { role: 'owner', platformAdmin: false, tenantType: 'platform', set: [] as Array<[string, string]> }
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth/context', () => ({ requireTenant: async () => ({ tenantType: state.tenantType, role: state.role, platformAdmin: state.platformAdmin, organizationId: 'org_platform' }) }))
vi.mock('@/lib/services/pms-connect', () => ({
  setPmsConnectRequestStatus: async (org: string, status: string) => {
    state.set.push([org, status])
    return org === 'org_a'
  },
}))

import { answerPmsRequestAction } from '@/app/(default)/platform/first-week/admin-actions'

beforeEach(() => {
  state.role = 'owner'
  state.platformAdmin = false
  state.tenantType = 'platform'
  state.set = []
})

describe('answerPmsRequestAction', () => {
  it('a platform owner, admin or platformAdmin can answer', async () => {
    expect(await answerPmsRequestAction('org_a', 'scheduled')).toEqual({ ok: true })
    state.role = 'member'
    state.platformAdmin = true
    expect(await answerPmsRequestAction('org_a', 'closed')).toEqual({ ok: true })
    expect(state.set).toEqual([['org_a', 'scheduled'], ['org_a', 'closed']])
  })

  it('a platform MEMBER and a clinic tenant are refused before any write', async () => {
    state.role = 'member'
    expect((await answerPmsRequestAction('org_a', 'closed')).ok).toBe(false)
    state.role = 'owner'
    state.tenantType = 'clinic'
    expect((await answerPmsRequestAction('org_a', 'closed')).ok).toBe(false)
    expect(state.set).toEqual([])
  })

  it('an unknown answer, a missing org, or a clinic with no request each say so', async () => {
    expect((await answerPmsRequestAction('org_a', 'nope' as never)).ok).toBe(false)
    expect((await answerPmsRequestAction('', 'closed')).ok).toBe(false)
    expect(await answerPmsRequestAction('org_none', 'closed')).toEqual({ ok: false, error: 'That clinic has no connect request.' })
  })
})
