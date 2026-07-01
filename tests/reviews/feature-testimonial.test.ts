import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Coverage for the legacy first-party "reviews → public-site testimonials"
 * signal that survives the Google-first redesign.
 *
 * `featureReviewAsTestimonial` / `unfeatureReviewTestimonial` (the manual
 * promote/demote flow, sourced from `review_request.reviewText`) were removed —
 * featuring is now automatic from synced Google reviews (see
 * `listFeaturableGoogleReviews` in google-reviews.ts). There is no remaining
 * path, anywhere in the product, that lets staff manually create or edit a
 * testimonial — Reviews (Google-sourced) is the only system.
 *
 * What's left here:
 *  - listFeaturedTestimonialPatientIds: extracts patientIds from
 *    profile.testimonials so the dashboard can badge legacy "Featured" rows
 *    (historical patient-linked entries from the old flow).
 *  - demo seed shape guards for the legacy patient-linked testimonials.
 */

interface TestimonialShape {
  id: string
  quote: string
  authorName: string
  authorLocation: string | null
  authorPhotoUrl: string | null
  patientId: string | null
}

const state = {
  profile: null as { testimonials: TestimonialShape[] | null } | null,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (state.profile ? [state.profile] : []),
        }),
      }),
    }),
  },
  schema: {
    clinicProfile: { organizationId: 'organizationId', testimonials: 'testimonials' },
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  desc: vi.fn((x) => x),
  count: vi.fn(() => ({ _: 'count' })),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('@/lib/services/google-reviews', () => ({
  getGoogleReviewStats: vi.fn(async () => ({ count: 0, averageRating: null, needsReply: 0 })),
  listFeaturableGoogleReviews: vi.fn(async () => []),
}))

vi.mock('@/lib/services/pms/sync', () => ({
  queueCommLogWriteBack: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: class { emails = { send: async () => ({ id: 'mock' }) } }
}))

beforeEach(() => {
  state.profile = null
})

describe('listFeaturedTestimonialPatientIds', () => {
  it('returns an empty set when the profile has no testimonials', async () => {
    state.profile = { testimonials: null }
    const { listFeaturedTestimonialPatientIds } = await import('@/lib/services/reviews')
    const ids = await listFeaturedTestimonialPatientIds('org_1')
    expect(ids.size).toBe(0)
  })

  it('extracts patientIds from linked testimonials', async () => {
    state.profile = {
      testimonials: [
        { id: 't1', quote: 'q1', authorName: 'Mia H.', authorLocation: null, authorPhotoUrl: null, patientId: 'pat_mia' },
        { id: 't2', quote: 'q2', authorName: 'Jen R.', authorLocation: null, authorPhotoUrl: null, patientId: null },
        { id: 't3', quote: 'q3', authorName: 'Noah M.', authorLocation: null, authorPhotoUrl: null, patientId: 'pat_noah' },
      ],
    }
    const { listFeaturedTestimonialPatientIds } = await import('@/lib/services/reviews')
    const ids = await listFeaturedTestimonialPatientIds('org_1')
    expect(ids.size).toBe(2)
    expect(ids.has('pat_mia')).toBe(true)
    expect(ids.has('pat_noah')).toBe(true)
  })
})

describe('demo review distribution', () => {
  // Defends the seed shape against drift. The /reviews/received surface
  // needs enough completed rows to feel populated, with a real mix across
  // platforms. A future PR that trims these (e.g. someone dropping a seed
  // thinking it's noise) breaks the demo experience the user explicitly
  // asked for — these tests pin it.

  it('demo seeds at least 5 completed review_requests across multiple platforms', async () => {
    // We grep the source rather than running the seeder; the file is a
    // pure-config block.
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    const completedLines = src
      .split('\n')
      .filter((l) => l.includes("status: 'completed'") && l.includes('selectedSite'))
    expect(completedLines.length).toBeGreaterThanOrEqual(5)

    const platforms = new Set<string>()
    for (const l of completedLines) {
      const m = l.match(/selectedSite: '(google|healthgrades|facebook|yelp)'/)
      if (m) platforms.add(m[1])
    }
    // Realistic demo means more than one review platform shows up.
    expect(platforms.size).toBeGreaterThanOrEqual(3)
  })

  it('demo seeds at least 4 patient-linked testimonials (legacy "Featured" state)', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    // DEMO_FEATURED_PATIENT_IDXS is the source of truth for which patient
    // reviews are pre-promoted onto the public site.
    const block = src.match(/DEMO_FEATURED_PATIENT_IDXS[^=]*=\s*\[([^\]]+)\]/)?.[1] ?? ''
    const numbers = (block.match(/\d+/g) ?? []).map(Number)
    expect(numbers.length).toBeGreaterThanOrEqual(4)
  })

  it('seeds review_text for every completed review (no more "type the quote" workflow)', async () => {
    // The DEMO_REVIEW_TEXTS map keys every patientIdx whose review_request
    // is seeded as `status='completed'`. Without this, the legacy patient-
    // linked testimonials would build with an empty quote.
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    const reviewTextsBlock = src.match(/DEMO_REVIEW_TEXTS[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    const keys = Array.from(reviewTextsBlock.matchAll(/^\s*(\d+):/gm)).map((m) => Number(m[1]))
    const completedIdxs = Array.from(
      (src.match(/const REVIEW_SEEDS[^=]*=\s*\[([\s\S]*?)\n  \]/)?.[1] ?? '').matchAll(
        /patientIdx:\s*(\d+),\s*status:\s*'completed'/g,
      ),
    ).map((m) => Number(m[1]))
    for (const idx of completedIdxs) {
      expect(keys, `DEMO_REVIEW_TEXTS missing entry for completed patientIdx ${idx}`).toContain(idx)
    }
  })

  it('leaves at least 2 completed reviews unfeatured (legacy first-party rows)', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    const completedIdxs = new Set<number>()
    const reviewBlock = src.match(/const REVIEW_SEEDS[^=]*=\s*\[([\s\S]*?)\n  \]/)?.[1] ?? ''
    for (const m of Array.from(reviewBlock.matchAll(/patientIdx:\s*(\d+),\s*status:\s*'completed'/g))) {
      completedIdxs.add(Number(m[1]))
    }
    const featuredBlock = src.match(/DEMO_FEATURED_PATIENT_IDXS[^=]*=\s*\[([^\]]+)\]/)?.[1] ?? ''
    const featuredIdxs = new Set<number>((featuredBlock.match(/\d+/g) ?? []).map(Number))
    const unfeatured = Array.from(completedIdxs).filter((i) => !featuredIdxs.has(i))
    expect(unfeatured.length).toBeGreaterThanOrEqual(2)
  })

  it('no longer seeds a free-text (unlinked) testimonial — Reviews is the only system', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    expect(src).not.toMatch(/DEMO_FREE_TEXT_TESTIMONIAL/)
  })
})
