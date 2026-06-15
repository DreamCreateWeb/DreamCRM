import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Social Posts server-action gate: clinic + owner/admin on ANY plan (posting is
 * gated by what's connected, not by plan). A patient/member role or a platform
 * tenant must NOT reach the underlying service even by deep-linking. requireTenant
 * is mocked to drive the context; the service is stubbed to assert it's only
 * reached when the gate passes, and that the `{ ok | error }` convention holds.
 */
type Ctx = {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  planTier: 'basic' | 'pro' | 'premium'
  organizationId: string
  userId: string
  organizationName: string
}
let tenantCtx: Ctx | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const { createSocialPost, deleteSocialPost } = vi.hoisted(() => ({
  createSocialPost: vi.fn().mockResolvedValue({ ok: true, status: 'published', postId: 'sp_1' }),
  deleteSocialPost: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/services/social-posts', () => ({ createSocialPost, deleteSocialPost }))

import { createSocialPostAction, deleteSocialPostAction } from '@/app/(default)/social-posts/actions'

beforeEach(() => {
  createSocialPost.mockClear()
  deleteSocialPost.mockClear()
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'premium',
    organizationId: 'org_1',
    userId: 'u1',
    organizationName: 'Acme Dental',
  }
})

const input = { accountIds: ['a'], postType: 'standard' as const, summary: 'Same-week cleanings' }

describe('createSocialPostAction gate', () => {
  it('passes for a premium owner and forwards to the service', async () => {
    const r = await createSocialPostAction(input)
    expect(r.ok).toBe(true)
    expect(createSocialPost).toHaveBeenCalledWith('org_1', input)
  })

  it('passes for a premium admin', async () => {
    tenantCtx!.role = 'admin'
    const r = await createSocialPostAction(input)
    expect(r.ok).toBe(true)
    expect(createSocialPost).toHaveBeenCalledTimes(1)
  })

  it('passes for a Basic-plan clinic (posting is gated by connection, not plan)', async () => {
    tenantCtx!.planTier = 'basic'
    const r = await createSocialPostAction(input)
    expect(r.ok).toBe(true)
    expect(createSocialPost).toHaveBeenCalledWith('org_1', input)
  })

  it('blocks a member role', async () => {
    tenantCtx!.role = 'member'
    const r = await createSocialPostAction(input)
    expect(r.ok).toBe(false)
    expect(createSocialPost).not.toHaveBeenCalled()
  })

  it('blocks a patient role', async () => {
    tenantCtx!.role = 'patient'
    const r = await createSocialPostAction(input)
    expect(r.ok).toBe(false)
    expect(createSocialPost).not.toHaveBeenCalled()
  })

  it('blocks a platform tenant', async () => {
    tenantCtx!.tenantType = 'platform'
    const r = await createSocialPostAction(input)
    expect(r.ok).toBe(false)
    expect(createSocialPost).not.toHaveBeenCalled()
  })

  it('surfaces the service error string', async () => {
    createSocialPost.mockResolvedValueOnce({ ok: false, error: 'image too small' })
    const r = await createSocialPostAction(input)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('image too small')
  })
})

describe('deleteSocialPostAction gate', () => {
  it('passes for a premium owner', async () => {
    const r = await deleteSocialPostAction('sp_1')
    expect(r.ok).toBe(true)
    expect(deleteSocialPost).toHaveBeenCalledWith('org_1', 'sp_1')
  })

  it('passes for a Basic-plan clinic', async () => {
    tenantCtx!.planTier = 'basic'
    const r = await deleteSocialPostAction('sp_1')
    expect(r.ok).toBe(true)
    expect(deleteSocialPost).toHaveBeenCalledWith('org_1', 'sp_1')
  })

  it('blocks a member role', async () => {
    tenantCtx!.role = 'member'
    const r = await deleteSocialPostAction('sp_1')
    expect(r.ok).toBe(false)
    expect(deleteSocialPost).not.toHaveBeenCalled()
  })
})
