import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Google Posts server-action gate: clinic + owner/admin + Premium. A below-tier
 * clinic, a patient/member role, or a platform tenant must NOT reach the
 * underlying service even by deep-linking. requireTenant is mocked to drive the
 * context; the service is stubbed to assert it's only reached when the gate
 * passes, and that the `{ ok | error }` convention is honored.
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

const { createGbpPost, deleteGbpPost } = vi.hoisted(() => ({
  createGbpPost: vi.fn().mockResolvedValue({ ok: true, status: 'published', postId: 'gbp_1' }),
  deleteGbpPost: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/lib/services/gbp-posts', () => ({ createGbpPost, deleteGbpPost }))

import { createGbpPostAction, deleteGbpPostAction } from '@/app/(default)/google-posts/actions'

beforeEach(() => {
  createGbpPost.mockClear()
  deleteGbpPost.mockClear()
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    planTier: 'premium',
    organizationId: 'org_1',
    userId: 'u1',
    organizationName: 'Acme Dental',
  }
})

const input = { postType: 'standard' as const, summary: 'Same-week cleanings' }

describe('createGbpPostAction gate', () => {
  it('passes for a premium owner and forwards to the service', async () => {
    const r = await createGbpPostAction(input)
    expect(r.ok).toBe(true)
    expect(createGbpPost).toHaveBeenCalledWith('org_1', input)
  })

  it('passes for a premium admin', async () => {
    tenantCtx!.role = 'admin'
    const r = await createGbpPostAction(input)
    expect(r.ok).toBe(true)
    expect(createGbpPost).toHaveBeenCalledTimes(1)
  })

  it('blocks a non-premium clinic (returns error, never reaches the service)', async () => {
    tenantCtx!.planTier = 'pro'
    const r = await createGbpPostAction(input)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Premium/i)
    expect(createGbpPost).not.toHaveBeenCalled()
  })

  it('blocks a member role', async () => {
    tenantCtx!.role = 'member'
    const r = await createGbpPostAction(input)
    expect(r.ok).toBe(false)
    expect(createGbpPost).not.toHaveBeenCalled()
  })

  it('blocks a patient role', async () => {
    tenantCtx!.role = 'patient'
    const r = await createGbpPostAction(input)
    expect(r.ok).toBe(false)
    expect(createGbpPost).not.toHaveBeenCalled()
  })

  it('blocks a platform tenant', async () => {
    tenantCtx!.tenantType = 'platform'
    const r = await createGbpPostAction(input)
    expect(r.ok).toBe(false)
    expect(createGbpPost).not.toHaveBeenCalled()
  })

  it('surfaces the service error string', async () => {
    createGbpPost.mockResolvedValueOnce({ ok: false, error: 'image too small' })
    const r = await createGbpPostAction(input)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('image too small')
  })
})

describe('deleteGbpPostAction gate', () => {
  it('passes for a premium owner', async () => {
    const r = await deleteGbpPostAction('gbp_1')
    expect(r.ok).toBe(true)
    expect(deleteGbpPost).toHaveBeenCalledWith('org_1', 'gbp_1')
  })

  it('blocks a non-premium clinic', async () => {
    tenantCtx!.planTier = 'basic'
    const r = await deleteGbpPostAction('gbp_1')
    expect(r.ok).toBe(false)
    expect(deleteGbpPost).not.toHaveBeenCalled()
  })
})
