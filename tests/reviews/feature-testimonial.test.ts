import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Coverage for the "received reviews → public-site testimonials" loop.
 * Closes the disconnect between dashboard /reviews data (review_request
 * rows tied to real patients) and the public site testimonials JSON.
 *
 * Tests:
 *  - listFeaturedTestimonialPatientIds: extracts patientIds from
 *    profile.testimonials so the dashboard can badge "Featured" rows.
 *  - featureReviewAsTestimonial: rejects on cross-tenant patient,
 *    empty/oversize quotes; promotes with privacy-first "First L." +
 *    city label; idempotent on (orgId, patientId) — second call replaces
 *    rather than stacks.
 *  - unfeatureReviewTestimonial: removes only the patient-linked entry,
 *    leaves free-text testimonials alone.
 *  - formatLinkedTestimonialAuthor / formatLinkedTestimonialLocation:
 *    pure helpers covering the privacy default + edge cases.
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
  patient: null as Record<string, unknown> | null,
  profile: null as { testimonials: TestimonialShape[] | null } | null,
  /** The reviewText lookup result. featureReviewAsTestimonial now sources the
   *  quote from review_request rather than a caller-supplied parameter. */
  review: null as { reviewText: string | null } | null,
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: (t: unknown) => {
        // Chain that resolves on .limit(...) — works for queries with or
        // without .orderBy() in between.
        const result = (async () => {
          if (t === 'patient') return state.patient ? [state.patient] : []
          if (t === 'clinicProfile') return state.profile ? [state.profile] : []
          if (t === 'reviewRequest') return state.review ? [state.review] : []
          return []
        })
        const chain = {
          where: () => chain,
          orderBy: () => chain,
          limit: async () => await result(),
        }
        return chain
      },
    }),
    update: (t: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => { state.updates.push({ table: String(t), set }) },
      }),
    }),
  },
  schema: {
    patient: 'patient',
    clinicProfile: 'clinicProfile',
    clinicReviewConfig: 'clinicReviewConfig',
    reviewRequest: 'reviewRequest',
    organization: 'organization',
  },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({ _: 'and' })),
  eq: vi.fn(() => ({ _: 'eq' })),
  desc: vi.fn((x) => x),
  asc: vi.fn((x) => x),
  gte: vi.fn(() => ({ _: 'gte' })),
  lte: vi.fn(() => ({ _: 'lte' })),
  ne: vi.fn(() => ({ _: 'ne' })),
  count: vi.fn(() => ({ _: 'count' })),
  inArray: vi.fn(() => ({ _: 'inArray' })),
  isNotNull: vi.fn(() => ({ _: 'isNotNull' })),
  isNull: vi.fn(() => ({ _: 'isNull' })),
  sql: Object.assign(vi.fn(() => ({ _: 'sql' })), { raw: vi.fn() }),
}))

vi.mock('@/lib/services/pms/sync', () => ({
  queueCommLogWriteBack: vi.fn(),
}))

vi.mock('resend', () => ({
  Resend: class { emails = { send: async () => ({ id: 'mock' }) } }
}))

beforeEach(() => {
  state.patient = null
  state.profile = null
  state.review = null
  state.updates = []
})

describe('formatLinkedTestimonialAuthor', () => {
  it('renders "First L." for a standard name', async () => {
    const { formatLinkedTestimonialAuthor } = await import('@/lib/services/reviews')
    expect(formatLinkedTestimonialAuthor({ patientFirstName: 'Mia', patientLastName: 'Hayes' })).toBe('Mia H.')
  })

  it('uppercases the initial regardless of input casing', async () => {
    const { formatLinkedTestimonialAuthor } = await import('@/lib/services/reviews')
    expect(formatLinkedTestimonialAuthor({ patientFirstName: 'mia', patientLastName: 'hayes' })).toBe('mia H.')
  })

  it('falls back to first name only when last name is empty', async () => {
    const { formatLinkedTestimonialAuthor } = await import('@/lib/services/reviews')
    expect(formatLinkedTestimonialAuthor({ patientFirstName: 'Cher', patientLastName: '' })).toBe('Cher')
  })
})

describe('formatLinkedTestimonialLocation', () => {
  it('renders "City, State" when both are present', async () => {
    const { formatLinkedTestimonialLocation } = await import('@/lib/services/reviews')
    expect(formatLinkedTestimonialLocation({ patientCity: 'Austin', patientState: 'TX' })).toBe('Austin, TX')
  })
  it('renders city alone when state is missing', async () => {
    const { formatLinkedTestimonialLocation } = await import('@/lib/services/reviews')
    expect(formatLinkedTestimonialLocation({ patientCity: 'Austin', patientState: null })).toBe('Austin')
  })
  it('returns null when both are missing', async () => {
    const { formatLinkedTestimonialLocation } = await import('@/lib/services/reviews')
    expect(formatLinkedTestimonialLocation({ patientCity: null, patientState: null })).toBeNull()
  })
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
    // Free-text testimonial (no patientId) does not surface as featured.
    expect(ids.has('null')).toBe(false)
  })
})

describe('featureReviewAsTestimonial', () => {
  const okPatient = { firstName: 'Mia', lastName: 'Hayes', city: 'Austin', state: 'TX' }

  it('rejects when the patient does not belong to the org', async () => {
    state.patient = null
    state.profile = { testimonials: [] }
    state.review = { reviewText: 'whatever' }
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await expect(
      featureReviewAsTestimonial({
        organizationId: 'org_1',
        patientId: 'pat_foreign',
      }),
    ).rejects.toThrow(/not found in this organization/i)
    expect(state.updates).toHaveLength(0)
  })

  it('rejects when the patient has no review text submitted (the "nothing to feature" guard)', async () => {
    // This is the honest replacement for the old "staff types the quote"
    // path — when the patient never wrote anything in DreamCRM, there's
    // nothing to feature. The error message guides staff to ask the
    // patient for a review instead.
    state.patient = okPatient
    state.profile = { testimonials: [] }
    state.review = null
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await expect(
      featureReviewAsTestimonial({ organizationId: 'org_1', patientId: 'pat_mia' }),
    ).rejects.toThrow(/has not submitted a review/i)
    expect(state.updates).toHaveLength(0)
  })

  it('rejects when the review row exists but reviewText is empty / whitespace', async () => {
    state.patient = okPatient
    state.profile = { testimonials: [] }
    state.review = { reviewText: '   ' }
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await expect(
      featureReviewAsTestimonial({ organizationId: 'org_1', patientId: 'pat_mia' }),
    ).rejects.toThrow(/has not submitted a review/i)
    expect(state.updates).toHaveLength(0)
  })

  it('promotes with the patient-submitted quote and privacy-first "First L." + city defaults', async () => {
    state.patient = okPatient
    state.profile = { testimonials: [] }
    state.review = { reviewText: 'Genuinely good experience — I felt heard.' }
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await featureReviewAsTestimonial({
      organizationId: 'org_1',
      patientId: 'pat_mia',
    })
    expect(state.updates).toHaveLength(1)
    const next = (state.updates[0].set as { testimonials: TestimonialShape[] }).testimonials
    expect(next).toHaveLength(1)
    expect(next[0].patientId).toBe('pat_mia')
    expect(next[0].authorName).toBe('Mia H.')
    expect(next[0].authorLocation).toBe('Austin, TX')
    // The quote MUST come from the patient's submission, not a parameter —
    // staff can't put words in the patient's mouth.
    expect(next[0].quote).toBe('Genuinely good experience — I felt heard.')
  })

  it('idempotent on (orgId, patientId): re-promote replaces, does not duplicate', async () => {
    state.patient = okPatient
    state.profile = {
      testimonials: [
        { id: 't_old', quote: 'old quote', authorName: 'Mia H.', authorLocation: 'Austin, TX', authorPhotoUrl: null, patientId: 'pat_mia' },
        { id: 't_freetext', quote: 'free', authorName: 'Jen R.', authorLocation: null, authorPhotoUrl: null, patientId: null },
      ],
    }
    state.review = { reviewText: 'fresh quote' }
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await featureReviewAsTestimonial({
      organizationId: 'org_1',
      patientId: 'pat_mia',
    })
    const next = (state.updates[0].set as { testimonials: TestimonialShape[] }).testimonials
    // free-text testimonial preserved, linked one replaced with the fresh quote
    expect(next).toHaveLength(2)
    expect(next.find((t) => t.patientId === null)?.quote).toBe('free')
    expect(next.find((t) => t.patientId === 'pat_mia')?.quote).toBe('fresh quote')
  })
})

describe('demo review distribution', () => {
  // Defends the seed shape against drift. The /reviews/received surface
  // needs enough completed rows to feel populated, AND a mix of featured
  // vs. unfeatured so the "Add to website" CTA has visible targets when
  // staff first opens the page. A future PR that trims these (e.g. someone
  // dropping a seed thinking it's noise) breaks the demo experience the
  // user explicitly asked for — these tests pin it.

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

  it('demo seeds at least 4 patient-linked testimonials (for the "Featured" state)', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    // DEMO_FEATURED_PATIENT_IDXS is the source of truth for which patient
    // reviews are pre-promoted onto the public site.
    const block = src.match(/DEMO_FEATURED_PATIENT_IDXS[^=]*=\s*\[([^\]]+)\]/)?.[1] ?? ''
    const numbers = (block.match(/\d+/g) ?? []).map(Number)
    expect(numbers.length).toBeGreaterThanOrEqual(4)
  })

  it('keeps at least one free-text testimonial so the legacy unlinked path stays exercised', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    expect(src).toMatch(/DEMO_FREE_TEXT_TESTIMONIAL\s*=\s*\{[^}]*quote:/)
  })

  it('seeds review_text for every completed review (no more "type the quote" workflow)', async () => {
    // The DEMO_REVIEW_TEXTS map keys every patientIdx whose review_request
    // is seeded as `status='completed'`. Without this, /reviews/received
    // would show empty cards — the bug the user reported.
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    const reviewTextsBlock = src.match(/DEMO_REVIEW_TEXTS[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    const keys = Array.from(reviewTextsBlock.matchAll(/^\s*(\d+):/gm)).map((m) => Number(m[1]))
    const completedIdxs = Array.from(
      (src.match(/REVIEW_SEEDS[^=]*=\s*\[([\s\S]*?)\n  \]/)?.[1] ?? '').matchAll(
        /patientIdx:\s*(\d+),\s*status:\s*'completed'/g,
      ),
    ).map((m) => Number(m[1]))
    for (const idx of completedIdxs) {
      expect(keys, `DEMO_REVIEW_TEXTS missing entry for completed patientIdx ${idx}`).toContain(idx)
    }
  })

  it('leaves at least 2 completed reviews unfeatured so /reviews/received demos the CTA', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile('lib/services/demo-clinic.ts', 'utf8'),
    )
    const completedIdxs = new Set<number>()
    const reviewBlock = src.match(/REVIEW_SEEDS[^=]*=\s*\[([\s\S]*?)\n  \]/)?.[1] ?? ''
    for (const m of Array.from(reviewBlock.matchAll(/patientIdx:\s*(\d+),\s*status:\s*'completed'/g))) {
      completedIdxs.add(Number(m[1]))
    }
    const featuredBlock = src.match(/DEMO_FEATURED_PATIENT_IDXS[^=]*=\s*\[([^\]]+)\]/)?.[1] ?? ''
    const featuredIdxs = new Set<number>((featuredBlock.match(/\d+/g) ?? []).map(Number))
    const unfeatured = Array.from(completedIdxs).filter((i) => !featuredIdxs.has(i))
    expect(unfeatured.length).toBeGreaterThanOrEqual(2)
  })
})

describe('unfeatureReviewTestimonial', () => {
  it('removes only the patient-linked entry', async () => {
    state.profile = {
      testimonials: [
        { id: 't_freetext', quote: 'free', authorName: 'Jen R.', authorLocation: null, authorPhotoUrl: null, patientId: null },
        { id: 't_mia', quote: 'q', authorName: 'Mia H.', authorLocation: null, authorPhotoUrl: null, patientId: 'pat_mia' },
      ],
    }
    const { unfeatureReviewTestimonial } = await import('@/lib/services/reviews')
    await unfeatureReviewTestimonial('org_1', 'pat_mia')
    expect(state.updates).toHaveLength(1)
    const next = (state.updates[0].set as { testimonials: TestimonialShape[] }).testimonials
    expect(next).toHaveLength(1)
    expect(next[0].patientId).toBeNull()
  })

  it('is a no-op when no testimonial is linked to that patient', async () => {
    state.profile = {
      testimonials: [
        { id: 't_freetext', quote: 'free', authorName: 'Jen R.', authorLocation: null, authorPhotoUrl: null, patientId: null },
      ],
    }
    const { unfeatureReviewTestimonial } = await import('@/lib/services/reviews')
    await unfeatureReviewTestimonial('org_1', 'pat_nonexistent')
    expect(state.updates).toHaveLength(0)
  })

  it('silent when the profile is missing entirely', async () => {
    state.profile = null
    const { unfeatureReviewTestimonial } = await import('@/lib/services/reviews')
    await unfeatureReviewTestimonial('org_1', 'pat_mia')
    expect(state.updates).toHaveLength(0)
  })
})
