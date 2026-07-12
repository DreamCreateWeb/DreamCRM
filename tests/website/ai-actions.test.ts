import { describe, it, expect, vi, beforeEach } from 'vitest'

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  organizationId: string
  organizationSlug: string
  organizationName: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

let profileRow: Record<string, unknown> | undefined = { planTier: 'premium', displayName: 'Acme', city: 'Austin' }
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => (profileRow ? [profileRow] : []) }) }) }) },
}))

const generateSectionCopy = vi.fn()
const getAiUsage = vi.fn()
const incrementAiUsage = vi.fn(async (..._a: unknown[]) => {})
vi.mock('@/lib/services/ai-website', () => ({
  generateSectionCopy: (...a: unknown[]) => generateSectionCopy(...a),
  getAiUsage: (...a: unknown[]) => getAiUsage(...a),
  incrementAiUsage: (...a: unknown[]) => incrementAiUsage(...a),
}))

import { aiRewriteSection } from '@/app/(default)/website/editor/ai-actions'

beforeEach(() => {
  generateSectionCopy.mockReset()
  getAiUsage.mockReset()
  incrementAiUsage.mockClear()
  profileRow = { planTier: 'premium', displayName: 'Acme', city: 'Austin' }
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
    organizationName: 'Acme',
  }
})

describe('aiRewriteSection — gating', () => {
  it('blocks non-clinic tenants', async () => {
    tenantCtx!.tenantType = 'platform'
    const r = await aiRewriteSection('hero')
    expect(r).toMatchObject({ ok: false, reason: 'gate' })
    expect(generateSectionCopy).not.toHaveBeenCalled()
  })
  it('blocks the member role', async () => {
    tenantCtx!.role = 'member'
    const r = await aiRewriteSection('hero')
    expect(r).toMatchObject({ ok: false, reason: 'gate' })
  })
})

describe('aiRewriteSection — allowance', () => {
  it('fails safe (reason:limit, no generation) when the allowance is spent', async () => {
    getAiUsage.mockResolvedValue({ used: 200, limit: 200, remaining: 0, period: '2026-06' })
    const r = await aiRewriteSection('about')
    expect(r).toMatchObject({ ok: false, reason: 'limit' })
    expect(generateSectionCopy).not.toHaveBeenCalled()
    expect(incrementAiUsage).not.toHaveBeenCalled()
  })

  it('generates, increments once, and returns refreshed usage on success', async () => {
    getAiUsage
      .mockResolvedValueOnce({ used: 10, limit: 200, remaining: 190, period: '2026-06' })
      .mockResolvedValueOnce({ used: 11, limit: 200, remaining: 189, period: '2026-06' })
    generateSectionCopy.mockResolvedValue({ ok: true, content: { section: 'about', about: 'Warm copy.' } })

    const r = await aiRewriteSection('about')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.content).toEqual({ section: 'about', about: 'Warm copy.' })
      expect(r.usage.remaining).toBe(189)
    }
    expect(incrementAiUsage).toHaveBeenCalledTimes(1)
  })

  it('does NOT increment when generation fails', async () => {
    getAiUsage.mockResolvedValue({ used: 10, limit: 200, remaining: 190, period: '2026-06' })
    generateSectionCopy.mockResolvedValue({ ok: false, error: 'AI request failed' })
    const r = await aiRewriteSection('about')
    expect(r).toMatchObject({ ok: false, reason: 'error' })
    expect(incrementAiUsage).not.toHaveBeenCalled()
  })
})

describe('aiRewriteSection — guards', () => {
  it('errors when the clinic profile is missing', async () => {
    profileRow = undefined
    const r = await aiRewriteSection('hero')
    expect(r).toMatchObject({ ok: false, reason: 'error' })
  })
})
