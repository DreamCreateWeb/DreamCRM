import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getPublishedPostCounts — the activity behind the Analytics social reach:
 * how many posts went live per platform in the window. Honest count, not
 * per-post reach.
 */

let groupRows: Array<{ platform: string; c: number }> = []
const captured: { where: unknown } = { where: null }

function chain() {
  const c: Record<string, unknown> = {}
  c.from = () => c
  c.where = (w: unknown) => { captured.where = w; return c }
  c.groupBy = () => c
  c.then = (resolve: (v: unknown) => unknown) => resolve(groupRows)
  return c
}

vi.mock('@/lib/db', () => ({
  db: { select: () => chain() },
  schema: { socialPostTarget: { platform: 'platform', organizationId: 'org', status: 'status', publishedAt: 'pub' } },
}))
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ and: a }), count: () => ({ count: true }),
  desc: (x: unknown) => x, eq: (...a: unknown[]) => ({ eq: a }),
  gte: (...a: unknown[]) => ({ gte: a }), inArray: (...a: unknown[]) => ({ inArray: a }),
}))
vi.mock('@/lib/services/zernio', () => ({ getZernioConnection: vi.fn() }))

import { getPublishedPostCounts } from '@/lib/services/social-posts'

beforeEach(() => { groupRows = []; captured.where = null })

describe('getPublishedPostCounts', () => {
  it('returns a platform → count map', async () => {
    groupRows = [{ platform: 'instagram', c: 4 }, { platform: 'facebook', c: 2 }]
    const out = await getPublishedPostCounts('org_1', { days: 30 })
    expect(out).toEqual({ instagram: 4, facebook: 2 })
  })

  it('returns an empty map when nothing was published', async () => {
    const out = await getPublishedPostCounts('org_1', { days: 90 })
    expect(out).toEqual({})
  })
})
