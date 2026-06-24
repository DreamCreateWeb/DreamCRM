import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * getReviewsProof — the reputation proof feeding Analytics: testimonials live
 * on the public site (from clinic_profile.testimonials, drillable) + the live
 * Google star snippet. Current-state, not windowed.
 */

let testimonials: Array<Record<string, unknown>> = []
const googleStats = { count: 0, averageRating: null as number | null, needsReply: 0 }

function chain() {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'where', 'limit']) c[m] = () => c
  c.then = (resolve: (v: unknown) => unknown) => resolve([{ testimonials }])
  return c
}

vi.mock('@/lib/db', () => ({
  db: { select: () => chain() },
  schema: { clinicProfile: { testimonials: 't', organizationId: 'org' } },
}))
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }), count: () => ({}), desc: (x: unknown) => x,
  eq: (...a: unknown[]) => ({ a }), gte: (...a: unknown[]) => ({ a }),
  inArray: (...a: unknown[]) => ({ a }), isNotNull: (x: unknown) => x, isNull: (x: unknown) => x,
  lte: (...a: unknown[]) => ({ a }), ne: (...a: unknown[]) => ({ a }), sql: () => ({}),
}))
vi.mock('@/lib/email', () => ({ deliver: vi.fn() }))
vi.mock('@/lib/services/pms/sync', () => ({ queueCommLogWriteBack: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/google-reviews', () => ({
  getGoogleReviewStats: vi.fn(async () => googleStats),
}))

import { getReviewsProof } from '@/lib/services/reviews'

beforeEach(() => {
  testimonials = []
  googleStats.count = 0
  googleStats.averageRating = null
})

describe('getReviewsProof', () => {
  it('maps featured testimonials to drill chips + carries the Google rating', async () => {
    testimonials = [
      { id: 't1', quote: 'Great', authorName: 'Mia H.', authorLocation: 'Austin', patientId: 'p1' },
      { id: 't2', quote: 'Love it', authorName: 'Liam F.', patientId: null },
    ]
    googleStats.count = 21
    googleStats.averageRating = 4.8
    const out = await getReviewsProof('org_1')
    expect(out.featuredCount).toBe(2)
    expect(out.featured[0]).toEqual({ patientId: 'p1', label: 'Mia H. · Austin' })
    expect(out.featured[1]).toEqual({ patientId: null, label: 'Liam F.' }) // no location → name only
    expect(out.googleRating).toBe(4.8)
    expect(out.googleCount).toBe(21)
  })

  it('caps the chip sample at 8 but keeps the true count', async () => {
    testimonials = Array.from({ length: 12 }, (_, i) => ({
      id: `t${i}`, quote: 'x', authorName: `Patient ${i}`, patientId: `p${i}`,
    }))
    const out = await getReviewsProof('org_1')
    expect(out.featuredCount).toBe(12)
    expect(out.featured).toHaveLength(8)
  })

  it('returns zeros for a clinic with no testimonials and no Google rating', async () => {
    const out = await getReviewsProof('org_1')
    expect(out).toEqual({ featuredCount: 0, featured: [], googleRating: null, googleCount: 0 })
  })
})
