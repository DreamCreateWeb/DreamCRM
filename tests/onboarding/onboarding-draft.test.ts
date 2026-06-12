import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Server-persisted interview draft: save (per step advance) / get (resume on
 * refresh) / complete (clear draft + stamp completed_at). All scoped to one org.
 * Plus the pure client-safe helpers that guard the column:
 *   - resolveInterviewDraft (sanitizes junk / partial / over-large blobs)
 *   - deriveBrandVoice (audience answer → brand voice, no extra AI call)
 */

// ── Pure helpers (no DB) ────────────────────────────────────────────────────
import {
  resolveInterviewDraft,
  deriveBrandVoice,
  INTERVIEW_QUESTIONS,
} from '@/lib/types/onboarding-interview'

describe('resolveInterviewDraft — sanitizes a stored blob', () => {
  it('returns null for non-objects / null', () => {
    expect(resolveInterviewDraft(null)).toBeNull()
    expect(resolveInterviewDraft('nope')).toBeNull()
    expect(resolveInterviewDraft(42)).toBeNull()
  })

  it('returns null for an "empty" draft (no answers, no slugs, step 0) — looks like never-started', () => {
    expect(resolveInterviewDraft({ answers: {}, serviceSlugs: [], step: 0 })).toBeNull()
  })

  it('keeps only string answer values + string slugs', () => {
    const d = resolveInterviewDraft({
      answers: { positioning: 'family practice', bad: 123, also: null },
      serviceSlugs: ['cleanings', 7, null, 'whitening'],
      step: 2,
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(d).not.toBeNull()
    expect(d!.answers).toEqual({ positioning: 'family practice' })
    expect(d!.serviceSlugs).toEqual(['cleanings', 'whitening'])
    expect(d!.step).toBe(2)
    expect(d!.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('clamps an over-large step into the question range (no skip-to-draft on resume)', () => {
    const d = resolveInterviewDraft({ answers: { a: 'x' }, serviceSlugs: [], step: 999 })
    expect(d!.step).toBe(INTERVIEW_QUESTIONS.length - 1)
  })

  it('clamps a negative step to 0', () => {
    const d = resolveInterviewDraft({ answers: { a: 'x' }, serviceSlugs: [], step: -5 })
    expect(d!.step).toBe(0)
  })

  it('defaults a missing updatedAt to the epoch', () => {
    const d = resolveInterviewDraft({ answers: { a: 'x' }, serviceSlugs: [] })
    expect(d!.updatedAt).toBe(new Date(0).toISOString())
  })
})

describe('deriveBrandVoice — audience answer → voice', () => {
  it('family for pediatric/kid signals', () => {
    expect(deriveBrandVoice({ audience: 'mostly families and kids' })).toBe('family')
    expect(deriveBrandVoice({ audience: 'pediatric and teens' })).toBe('family')
    expect(deriveBrandVoice({ positioning: 'a family-friendly practice' })).toBe('family')
  })

  it('modern for cosmetic/luxury signals (when not also family)', () => {
    expect(deriveBrandVoice({ audience: 'cosmetic veneers and whitening' })).toBe('modern')
    expect(deriveBrandVoice({ audience: 'high-end implant cases' })).toBe('modern')
  })

  it('warm as the default', () => {
    expect(deriveBrandVoice({ audience: 'everyone in the neighborhood' })).toBe('warm')
    expect(deriveBrandVoice({})).toBe('warm')
  })

  it('family wins over cosmetic when both appear', () => {
    expect(deriveBrandVoice({ audience: 'families who also want cosmetic whitening' })).toBe('family')
  })
})

// ── Server module (DB-backed) ───────────────────────────────────────────────
let draftRow: unknown = undefined
const updates: Array<Record<string, unknown>> = []
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [{ draft: draftRow }] }) }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async () => {
          updates.push(patch)
        },
      }),
    }),
  },
}))

import {
  getInterviewDraft,
  saveInterviewDraft,
  completeInterview,
} from '@/lib/services/onboarding-draft'

beforeEach(() => {
  draftRow = undefined
  updates.length = 0
})

describe('getInterviewDraft — resume', () => {
  it('returns the sanitized draft when one exists', async () => {
    draftRow = { answers: { positioning: 'x' }, serviceSlugs: ['cleanings'], step: 1, updatedAt: 'z' }
    const d = await getInterviewDraft('org_1')
    expect(d).not.toBeNull()
    expect(d!.answers).toEqual({ positioning: 'x' })
    expect(d!.serviceSlugs).toEqual(['cleanings'])
  })

  it('returns null when the column is null (no draft in flight)', async () => {
    draftRow = null
    expect(await getInterviewDraft('org_1')).toBeNull()
  })
})

describe('saveInterviewDraft — per-step advance', () => {
  it('writes a sanitized draft + bumps updatedAt', async () => {
    await saveInterviewDraft('org_1', {
      answers: { positioning: 'family practice' },
      serviceSlugs: ['cleanings', 'whitening'],
      step: 3,
    })
    expect(updates).toHaveLength(1)
    const draft = updates[0].onboardingInterviewDraft as {
      answers: Record<string, string>
      serviceSlugs: string[]
      step: number
      updatedAt: string
    }
    expect(draft.answers).toEqual({ positioning: 'family practice' })
    expect(draft.serviceSlugs).toEqual(['cleanings', 'whitening'])
    expect(draft.step).toBe(3)
    expect(typeof draft.updatedAt).toBe('string')
  })

  it('floors / clamps a junk step and drops non-string slugs', async () => {
    await saveInterviewDraft('org_1', {
      answers: { a: 'x' },
      serviceSlugs: ['ok', 5 as unknown as string],
      step: 2.9,
    })
    const draft = updates[0].onboardingInterviewDraft as { serviceSlugs: string[]; step: number }
    expect(draft.serviceSlugs).toEqual(['ok'])
    expect(draft.step).toBe(2)
  })

  it('caps over-long answer text (storage hygiene)', async () => {
    await saveInterviewDraft('org_1', {
      answers: { a: 'y'.repeat(9000) },
      serviceSlugs: [],
      step: 0,
    })
    const draft = updates[0].onboardingInterviewDraft as { answers: Record<string, string> }
    expect(draft.answers.a.length).toBe(4000)
  })
})

describe('completeInterview — clear draft + stamp', () => {
  it('nulls the draft and sets onboardingInterviewCompletedAt', async () => {
    await completeInterview('org_1')
    expect(updates).toHaveLength(1)
    expect(updates[0].onboardingInterviewDraft).toBeNull()
    expect(updates[0].onboardingInterviewCompletedAt).toBeInstanceOf(Date)
  })
})
