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
  updates: [] as Array<{ table: string; set: Record<string, unknown> }>,
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (sel?: Record<string, unknown>) => ({
      from: (t: unknown) => ({
        where: () => ({
          limit: async () => {
            // Distinguish queries by which schema table the FROM points at;
            // the mocked schema below uses string sentinels.
            if (t === 'patient') return state.patient ? [state.patient] : []
            if (t === 'clinicProfile') return state.profile ? [state.profile] : []
            // listFeaturedTestimonialPatientIds queries clinicProfile too
            return []
          },
        }),
      }),
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
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await expect(
      featureReviewAsTestimonial({
        organizationId: 'org_1',
        patientId: 'pat_foreign',
        quote: 'good',
      }),
    ).rejects.toThrow(/not found in this organization/i)
    expect(state.updates).toHaveLength(0)
  })

  it('rejects an empty quote before touching the DB', async () => {
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await expect(
      featureReviewAsTestimonial({ organizationId: 'org_1', patientId: 'pat_1', quote: '   ' }),
    ).rejects.toThrow(/cannot be empty/i)
    expect(state.updates).toHaveLength(0)
  })

  it('rejects a quote over 500 characters', async () => {
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await expect(
      featureReviewAsTestimonial({
        organizationId: 'org_1',
        patientId: 'pat_1',
        quote: 'x'.repeat(501),
      }),
    ).rejects.toThrow(/500 characters or fewer/i)
    expect(state.updates).toHaveLength(0)
  })

  it('promotes with privacy-first "First L." + city defaults', async () => {
    state.patient = okPatient
    state.profile = { testimonials: [] }
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await featureReviewAsTestimonial({
      organizationId: 'org_1',
      patientId: 'pat_mia',
      quote: 'Genuinely good experience.',
    })
    expect(state.updates).toHaveLength(1)
    const next = (state.updates[0].set as { testimonials: TestimonialShape[] }).testimonials
    expect(next).toHaveLength(1)
    expect(next[0].patientId).toBe('pat_mia')
    expect(next[0].authorName).toBe('Mia H.')
    expect(next[0].authorLocation).toBe('Austin, TX')
    expect(next[0].quote).toBe('Genuinely good experience.')
  })

  it('honors an authorNameOverride when provided', async () => {
    state.patient = okPatient
    state.profile = { testimonials: [] }
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await featureReviewAsTestimonial({
      organizationId: 'org_1',
      patientId: 'pat_mia',
      quote: 'q',
      authorNameOverride: 'Mia Hayes',
    })
    const next = (state.updates[0].set as { testimonials: TestimonialShape[] }).testimonials
    expect(next[0].authorName).toBe('Mia Hayes')
  })

  it('idempotent on (orgId, patientId): re-promote replaces, does not duplicate', async () => {
    state.patient = okPatient
    state.profile = {
      testimonials: [
        { id: 't_old', quote: 'old quote', authorName: 'Mia H.', authorLocation: 'Austin, TX', authorPhotoUrl: null, patientId: 'pat_mia' },
        { id: 't_freetext', quote: 'free', authorName: 'Jen R.', authorLocation: null, authorPhotoUrl: null, patientId: null },
      ],
    }
    const { featureReviewAsTestimonial } = await import('@/lib/services/reviews')
    await featureReviewAsTestimonial({
      organizationId: 'org_1',
      patientId: 'pat_mia',
      quote: 'fresh quote',
    })
    const next = (state.updates[0].set as { testimonials: TestimonialShape[] }).testimonials
    // free-text testimonial preserved, linked one replaced with the fresh quote
    expect(next).toHaveLength(2)
    expect(next.find((t) => t.patientId === null)?.quote).toBe('free')
    expect(next.find((t) => t.patientId === 'pat_mia')?.quote).toBe('fresh quote')
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
