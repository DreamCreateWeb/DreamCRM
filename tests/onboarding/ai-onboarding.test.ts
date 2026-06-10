import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * draftSiteFromInterview — the one-pass site draft behind the post-checkout
 * /welcome interview. It must:
 *   • persist tagline / about / stats / faq / services + the new differenceChips
 *   • NEVER touch brandColor / phone / slug (those were set during onboarding —
 *     the draft is purely additive site COPY)
 *   • degrade gracefully when AI is off or the call fails (the UI then routes
 *     the clinic into the Studio rather than dead-ending)
 */

vi.mock('@/lib/services/service-library-ai', () => ({ CORE_VOICE_RULES: 'VOICE RULES' }))

const runClaudeJson = vi.fn()
const aiConfigured = vi.fn(() => true)
vi.mock('@/lib/ai', () => ({
  runClaudeJson: (...a: unknown[]) => runClaudeJson(...a),
  aiConfigured: () => aiConfigured(),
}))

const listLibraryForPicker = vi.fn()
vi.mock('@/lib/services/service-library', () => ({
  listLibraryForPicker: (...a: unknown[]) => listLibraryForPicker(...a),
}))

let profileRow: Record<string, unknown> | null = null
const updateSets: Array<Record<string, unknown>> = []
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (profileRow ? [profileRow] : []) }) }) }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          updateSets.push(patch)
        },
      }),
    }),
  },
}))

import { draftSiteFromInterview } from '@/lib/services/ai-onboarding'

const LIBRARY = [
  { slug: 'cleanings', name: 'Cleanings & Prevention', category: 'core', icon: '🦷', shortDescription: 'x' },
  { slug: 'teeth-whitening', name: 'Teeth Whitening', category: 'special', icon: '✨', shortDescription: 'y' },
]

const GOOD_DRAFT = {
  tagline: 'Dental care that feels human',
  about: 'A warm about paragraph.',
  differenceChips: ['No judgment, ever', 'Same-week visits', 'Gentle with kids', 'Easy billing'],
  stats: [
    { value: 'Same-week', label: 'appointments' },
    { value: 'Judgment-free', label: 'always' },
    { value: 'Most insurance', label: 'accepted' },
  ],
  faq: [
    { category: 'Booking', question: 'How do I book?', answer: 'Online or by phone.' },
    { category: 'Insurance', question: 'Do you take my plan?', answer: 'Most PPOs.' },
    { category: 'Your Visit', question: 'Will it hurt?', answer: 'We go gently.' },
    { category: 'Billing', question: 'When do I pay?', answer: 'At the visit.' },
  ],
  serviceSlugs: ['cleanings', 'teeth-whitening'],
}

const ANSWERS = { positioning: 'A family practice', difference: 'We never judge' }

beforeEach(() => {
  runClaudeJson.mockReset()
  aiConfigured.mockReturnValue(true)
  listLibraryForPicker.mockResolvedValue(LIBRARY)
  profileRow = { organizationId: 'org_1', displayName: 'Acme Dental', city: 'Austin' }
  updateSets.length = 0
})

describe('draftSiteFromInterview — happy path', () => {
  it('persists tagline / about / stats / faq / services / differenceChips', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS)
    expect(res.ok).toBe(true)
    expect(updateSets).toHaveLength(1)
    const patch = updateSets[0]
    expect(patch.tagline).toBe('Dental care that feels human')
    expect(patch.about).toBe('A warm about paragraph.')
    expect(Array.isArray(patch.stats)).toBe(true)
    expect((patch.stats as unknown[]).length).toBe(3)
    expect((patch.faq as unknown[]).length).toBe(4)
    expect((patch.services as unknown[]).length).toBe(2)
    expect(patch.differenceChips).toEqual([
      'No judgment, ever',
      'Same-week visits',
      'Gentle with kids',
      'Easy billing',
    ])
  })

  it('NEVER writes brandColor / phone / slug (onboarding owns those)', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    await draftSiteFromInterview('org_1', ANSWERS)
    const patch = updateSets[0]
    expect(patch).not.toHaveProperty('brandColor')
    expect(patch).not.toHaveProperty('phone')
    expect(patch).not.toHaveProperty('slug')
    expect(patch).not.toHaveProperty('planTier')
  })

  it('de-dupes (case-insensitive) + trims + caps difference chips, omits when empty', async () => {
    runClaudeJson.mockResolvedValue({
      ...GOOD_DRAFT,
      differenceChips: ['  No judgment, ever ', 'no judgment, EVER', '', '   '],
    })
    await draftSiteFromInterview('org_1', ANSWERS)
    expect(updateSets[0].differenceChips).toEqual(['No judgment, ever'])
  })

  it('omits differenceChips entirely when the model returns none (template auto-builds them)', async () => {
    runClaudeJson.mockResolvedValue({ ...GOOD_DRAFT, differenceChips: [] })
    await draftSiteFromInterview('org_1', ANSWERS)
    expect(updateSets[0]).not.toHaveProperty('differenceChips')
  })

  it('still drafts when the model omits differenceChips (back-compat / optional field)', async () => {
    const draftNoChips: Record<string, unknown> = { ...GOOD_DRAFT }
    delete draftNoChips.differenceChips
    runClaudeJson.mockResolvedValue(draftNoChips)
    const res = await draftSiteFromInterview('org_1', ANSWERS)
    expect(res.ok).toBe(true)
    expect(updateSets[0]).not.toHaveProperty('differenceChips')
    expect(updateSets[0].tagline).toBe('Dental care that feels human')
  })

  it('only persists services whose slugs exist in the library', async () => {
    runClaudeJson.mockResolvedValue({ ...GOOD_DRAFT, serviceSlugs: ['cleanings', 'made-up-slug'] })
    const res = await draftSiteFromInterview('org_1', ANSWERS)
    expect(res.ok).toBe(true)
    expect((updateSets[0].services as unknown[]).length).toBe(1)
  })
})

describe('draftSiteFromInterview — graceful failure (no dead end)', () => {
  it('returns ok:false when AI is not configured (UI routes to Studio)', async () => {
    aiConfigured.mockReturnValue(false)
    const res = await draftSiteFromInterview('org_1', ANSWERS)
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/not configured/i) })
    expect(updateSets).toHaveLength(0)
  })

  it('returns ok:false when the profile is missing', async () => {
    profileRow = null
    const res = await draftSiteFromInterview('org_missing', ANSWERS)
    expect(res.ok).toBe(false)
    expect(updateSets).toHaveLength(0)
  })

  it('returns ok:false (not a throw) when the AI call rejects', async () => {
    runClaudeJson.mockRejectedValue(new Error('rate limit'))
    const res = await draftSiteFromInterview('org_1', ANSWERS)
    expect(res.ok).toBe(false)
    expect(updateSets).toHaveLength(0)
  })

  it('returns ok:false when the AI output fails schema validation', async () => {
    runClaudeJson.mockResolvedValue({ tagline: '', about: '' }) // missing required fields
    const res = await draftSiteFromInterview('org_1', ANSWERS)
    expect(res.ok).toBe(false)
    expect(updateSets).toHaveLength(0)
  })
})
