import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * draftSiteFromInterview — the one-pass site draft behind the post-checkout
 * /welcome interview (Welcome Interview v2). It must:
 *   • take the services the clinic CHECKED (serviceSlugs param) and store them
 *     canonical immediately — the AI no longer guesses slugs
 *   • persist tagline / about / stats / faq / differenceChips + home SEO
 *   • be NON-DESTRUCTIVE: overwrite a field only when it's null/empty or still
 *     the Wave-1 STARTER_* constant; a human-edited field is preserved + reported
 *   • NEVER touch brandColor / phone / slug (onboarding owns those)
 *   • degrade gracefully (ok:false, no write) when AI is off / fails / the
 *     output fails validation — so the UI shows the day-0 floor + retry, never
 *     an empty site
 *   • fire per-service customization in the BACKGROUND (not awaited)
 */

import {
  STARTER_TAGLINE,
  STARTER_ABOUT_BASE,
  STARTER_STATS,
  STARTER_FAQ_ITEMS,
  buildStarterServices,
} from '@/lib/services/starter-pack'

const customizeServiceForClinic = vi.fn()
vi.mock('@/lib/services/service-library-ai', () => ({
  CORE_VOICE_RULES: 'VOICE RULES',
  customizeServiceForClinic: (...a: unknown[]) => customizeServiceForClinic(...a),
}))

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
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (profileRow ? [profileRow] : []) }) }),
    }),
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
  seoTitle: 'Acme Dental — Family Dentist in Austin',
  seoDescription: 'Warm, judgment-free dental care for the whole family in Austin, TX.',
}

const ANSWERS = { positioning: 'A family practice', difference: 'We never judge' }
const SLUGS = ['cleanings', 'teeth-whitening']

/** A fresh-clinic profile: every personalization field is null/empty so the
 *  non-destructive helpers read "still starter" → the draft overwrites all. */
function freshProfile(): Record<string, unknown> {
  return {
    organizationId: 'org_1',
    displayName: 'Acme Dental',
    city: 'Austin',
    state: 'TX',
    tagline: null,
    about: null,
    stats: null,
    faq: null,
    services: null,
    differenceChips: null,
    seoMeta: null,
  }
}

beforeEach(() => {
  runClaudeJson.mockReset()
  customizeServiceForClinic.mockReset()
  customizeServiceForClinic.mockResolvedValue({ ok: false })
  aiConfigured.mockReturnValue(true)
  listLibraryForPicker.mockResolvedValue(LIBRARY)
  profileRow = freshProfile()
  updateSets.length = 0
})

describe('draftSiteFromInterview — happy path (fresh clinic, all fields overwritten)', () => {
  it('persists tagline / about / stats / faq / differenceChips + the CHECKED services', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.draftedServices).toBe(2)
    expect(res.skippedFields).toEqual([])
    expect(updateSets.length).toBeGreaterThanOrEqual(1)
    const patch = updateSets[0]
    expect(patch.tagline).toBe('Dental care that feels human')
    expect(patch.about).toBe('A warm about paragraph.')
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

  it('stores services from the CHECKBOX step, never from the model output', async () => {
    // The model output carries NO serviceSlugs in v2; the slugs come from the arg.
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    await draftSiteFromInterview('org_1', ANSWERS, ['teeth-whitening'])
    const svcs = updateSets[0].services as Array<{ librarySlug: string }>
    expect(svcs.map((s) => s.librarySlug)).toEqual(['teeth-whitening'])
  })

  it('drops checked slugs that are not in the library + de-dupes', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    await draftSiteFromInterview('org_1', ANSWERS, ['cleanings', 'made-up', 'cleanings'])
    const svcs = updateSets[0].services as unknown[]
    expect(svcs.length).toBe(1)
  })

  it('writes home SEO into seo_meta.home', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    const meta = updateSets[0].seoMeta as { home?: { title?: string; description?: string } }
    expect(meta.home?.title).toBe('Acme Dental — Family Dentist in Austin')
    expect(meta.home?.description).toBe(
      'Warm, judgment-free dental care for the whole family in Austin, TX.',
    )
  })

  it('NEVER writes brandColor / phone / slug / planTier (onboarding owns those)', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    const patch = updateSets[0]
    expect(patch).not.toHaveProperty('brandColor')
    expect(patch).not.toHaveProperty('phone')
    expect(patch).not.toHaveProperty('slug')
    expect(patch).not.toHaveProperty('planTier')
  })

  it('de-dupes (case-insensitive) + trims difference chips; omits when all blank', async () => {
    runClaudeJson.mockResolvedValue({
      ...GOOD_DRAFT,
      differenceChips: ['  No judgment, ever ', 'no judgment, EVER', '', '   '],
    })
    await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(updateSets[0].differenceChips).toEqual(['No judgment, ever'])
  })

  it('omits differenceChips entirely when the model returns none', async () => {
    runClaudeJson.mockResolvedValue({ ...GOOD_DRAFT, differenceChips: [] })
    await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(updateSets[0]).not.toHaveProperty('differenceChips')
  })

  it('still drafts when the model omits the optional SEO fields', async () => {
    const draft: Record<string, unknown> = { ...GOOD_DRAFT }
    delete draft.seoTitle
    delete draft.seoDescription
    runClaudeJson.mockResolvedValue(draft)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    expect(updateSets[0]).not.toHaveProperty('seoMeta')
  })
})

describe('draftSiteFromInterview — non-destructive apply (preserves human edits)', () => {
  it('preserves a hand-edited tagline + reports it skipped', async () => {
    profileRow = { ...freshProfile(), tagline: 'We make Austin smile' }
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(updateSets[0]).not.toHaveProperty('tagline')
    expect(res.skippedFields).toContain('tagline')
  })

  it('OVERWRITES a tagline still equal to the Wave-1 starter constant', async () => {
    profileRow = { ...freshProfile(), tagline: STARTER_TAGLINE }
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(updateSets[0].tagline).toBe('Dental care that feels human')
    expect(res.skippedFields).not.toContain('tagline')
  })

  it('preserves the about / stats / faq when they are no longer the starter set', async () => {
    profileRow = {
      ...freshProfile(),
      about: 'A clinic-authored about, totally different from the starter.',
      stats: [{ id: 'custom-1', value: '5', label: 'stars' }],
      faq: [{ id: 'custom-faq', category: 'X', question: 'Q', answer: 'A' }],
    }
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(updateSets[0]).not.toHaveProperty('about')
    expect(updateSets[0]).not.toHaveProperty('stats')
    expect(updateSets[0]).not.toHaveProperty('faq')
    expect(res.skippedFields).toEqual(expect.arrayContaining(['about', 'stats', 'faq']))
  })

  it('OVERWRITES about / stats / faq when still the Wave-1 starter set', async () => {
    profileRow = {
      ...freshProfile(),
      about: STARTER_ABOUT_BASE,
      stats: STARTER_STATS,
      faq: STARTER_FAQ_ITEMS,
    }
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    expect(updateSets[0].about).toBe('A warm about paragraph.')
    expect((updateSets[0].stats as unknown[]).length).toBe(3)
    expect((updateSets[0].faq as unknown[]).length).toBe(4)
  })

  it('preserves an already-curated services list + reports it skipped', async () => {
    profileRow = {
      ...freshProfile(),
      services: [{ id: 'mine-1', librarySlug: 'cleanings', name: 'Cleanings', category: 'core' }],
    }
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(updateSets[0]).not.toHaveProperty('services')
    expect(res.draftedServices).toBe(0)
    expect(res.skippedFields).toContain('services')
  })

  it('OVERWRITES services still equal to the 4 Wave-1 starter rows', async () => {
    profileRow = { ...freshProfile(), services: buildStarterServices() }
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((updateSets[0].services as unknown[]).length).toBe(2)
    expect(res.draftedServices).toBe(2)
  })

  it('preserves a clinic-authored home SEO title + reports it skipped', async () => {
    profileRow = { ...freshProfile(), seoMeta: { home: { title: 'My own title' } } }
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // The title is preserved; the description (which was empty) is still written.
    const meta = updateSets[0].seoMeta as { home?: { title?: string; description?: string } }
    expect(meta.home?.title).toBe('My own title')
    expect(meta.home?.description).toBe(
      'Warm, judgment-free dental care for the whole family in Austin, TX.',
    )
    expect(res.skippedFields).toContain('seoTitle')
  })
})

describe('draftSiteFromInterview — fire-and-forget per-service customization', () => {
  it('kicks off customizeServiceForClinic for each checked service (not awaited)', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    customizeServiceForClinic.mockResolvedValue({ ok: false })
    await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    // Microtask flush so the void-ed Promise.allSettled has a chance to dispatch.
    await new Promise((r) => setTimeout(r, 0))
    expect(customizeServiceForClinic).toHaveBeenCalledTimes(2)
  })

  it('passes a derived brandVoice in the clinic context (pediatric → family)', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    customizeServiceForClinic.mockResolvedValue({ ok: false })
    await draftSiteFromInterview('org_1', { audience: 'mostly kids and families' }, SLUGS)
    await new Promise((r) => setTimeout(r, 0))
    expect(customizeServiceForClinic).toHaveBeenCalled()
    const ctx = customizeServiceForClinic.mock.calls[0][1] as { brandVoice?: string }
    expect(ctx.brandVoice).toBe('family')
  })

  it('does not kick off customization when no services were chosen', async () => {
    runClaudeJson.mockResolvedValue(GOOD_DRAFT)
    await draftSiteFromInterview('org_1', ANSWERS, [])
    await new Promise((r) => setTimeout(r, 0))
    expect(customizeServiceForClinic).not.toHaveBeenCalled()
  })
})

describe('draftSiteFromInterview — graceful failure (never a dead end)', () => {
  it('returns ok:false when AI is not configured (UI shows the floor + retry)', async () => {
    aiConfigured.mockReturnValue(false)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/not configured/i) })
    expect(updateSets).toHaveLength(0)
  })

  it('returns ok:false when the profile is missing', async () => {
    profileRow = null
    const res = await draftSiteFromInterview('org_missing', ANSWERS, SLUGS)
    expect(res.ok).toBe(false)
    expect(updateSets).toHaveLength(0)
  })

  it('returns ok:false (not a throw) when the AI call rejects', async () => {
    runClaudeJson.mockRejectedValue(new Error('rate limit'))
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(false)
    expect(updateSets).toHaveLength(0)
  })

  it('returns ok:false when the AI output fails schema validation', async () => {
    runClaudeJson.mockResolvedValue({ tagline: '', about: '' }) // missing required fields
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(false)
    expect(updateSets).toHaveLength(0)
  })

  it('returns ok:false when the model returns no content', async () => {
    runClaudeJson.mockResolvedValue(null)
    const res = await draftSiteFromInterview('org_1', ANSWERS, SLUGS)
    expect(res.ok).toBe(false)
    expect(updateSets).toHaveLength(0)
  })
})
