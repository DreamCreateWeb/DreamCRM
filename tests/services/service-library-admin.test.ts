/**
 * Unit tests for the Checkpoint 1B platform-admin approve/reject service
 * functions in `lib/services/service-library.ts`. The DB is fully mocked —
 * we assert each call's SET payload and the result-shape returned.
 *
 * Gating to platform admin happens in the route's `admin-actions.ts`, not in
 * the service module — these functions are pure mutation helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type SetCall = {
  status?: string
  reviewNotes?: string | null
  updatedAt?: Date
  name?: string
  category?: string
  icon?: string | null
  shortDescription?: string
  heroBullets?: string[]
  body?: string
  processSteps?: { title: string; body: string }[]
  faq?: { question: string; answer: string }[]
  relatedSlugs?: string[]
  editedByAdmin?: boolean
}

const state: {
  setCalls: SetCall[]
  returningRows: Array<{ slug: string }>
  throwOnUpdate: boolean
} = { setCalls: [], returningRows: [], throwOnUpdate: false }

vi.mock('@/lib/db', () => {
  const chain: () => any = () => {
    const obj: any = {}
    obj.set = (payload: SetCall) => {
      state.setCalls.push(payload)
      return obj
    }
    obj.where = () => obj
    obj.returning = async () => {
      if (state.throwOnUpdate) throw new Error('boom')
      return state.returningRows
    }
    return obj
  }
  return {
    db: {
      update: () => chain(),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
    },
  }
})

import {
  approveLibraryEntry,
  rejectLibraryEntry,
  updateLibraryEntry,
} from '@/lib/services/service-library'

const VALID_EDIT = {
  name: 'Teeth Whitening',
  category: 'core' as const,
  icon: '✨',
  shortDescription: 'Brighten your smile.',
  heroBullets: ['Bright in one visit', 'Gentle on enamel'],
  body: 'We brighten your smile in a single, comfortable visit.',
  processSteps: [{ title: 'Quick exam', body: 'We check first.' }],
  faq: [{ question: 'Does it hurt?', answer: 'Most people feel nothing.' }],
  relatedSlugs: ['dental-exams'],
}

beforeEach(() => {
  state.setCalls = []
  state.returningRows = []
  state.throwOnUpdate = false
})

describe('approveLibraryEntry', () => {
  it('flips status to active and stores the review note', async () => {
    state.returningRows = [{ slug: 'same-day-crowns' }]
    const out = await approveLibraryEntry('same-day-crowns', 'Great fit, approved.')
    expect(out.ok).toBe(true)
    expect(state.setCalls).toHaveLength(1)
    expect(state.setCalls[0].status).toBe('active')
    expect(state.setCalls[0].reviewNotes).toBe('Great fit, approved.')
    expect(state.setCalls[0].updatedAt).toBeInstanceOf(Date)
  })

  it('stores null when no review note is provided', async () => {
    state.returningRows = [{ slug: 'foo' }]
    const out = await approveLibraryEntry('foo')
    expect(out.ok).toBe(true)
    expect(state.setCalls[0].reviewNotes).toBeNull()
  })

  it('returns ok=false when the entry does not exist', async () => {
    state.returningRows = []
    const out = await approveLibraryEntry('missing')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/not found/i)
  })

  it('returns ok=false when the DB call throws', async () => {
    state.throwOnUpdate = true
    const out = await approveLibraryEntry('foo')
    expect(out.ok).toBe(false)
  })
})

describe('rejectLibraryEntry', () => {
  it('requires a non-empty review note', async () => {
    const out = await rejectLibraryEntry('foo', '   ')
    expect(out.ok).toBe(false)
    expect(state.setCalls).toHaveLength(0)
  })

  it('flips status to archived and stores the note', async () => {
    state.returningRows = [{ slug: 'foo' }]
    const out = await rejectLibraryEntry('foo', 'Off-topic.')
    expect(out.ok).toBe(true)
    expect(state.setCalls[0].status).toBe('archived')
    expect(state.setCalls[0].reviewNotes).toBe('Off-topic.')
  })

  it('returns ok=false when the entry does not exist', async () => {
    state.returningRows = []
    const out = await rejectLibraryEntry('missing', 'reason')
    expect(out.ok).toBe(false)
  })
})

describe('updateLibraryEntry — edit the canonical default', () => {
  it('writes every section and marks editedByAdmin so the deploy seed leaves it alone', async () => {
    state.returningRows = [{ slug: 'teeth-whitening' }]
    const out = await updateLibraryEntry('teeth-whitening', VALID_EDIT)
    expect(out.ok).toBe(true)
    expect(state.setCalls).toHaveLength(1)
    const set = state.setCalls[0]
    expect(set.editedByAdmin).toBe(true)
    expect(set.name).toBe('Teeth Whitening')
    expect(set.category).toBe('core')
    expect(set.heroBullets).toEqual(['Bright in one visit', 'Gentle on enamel'])
    expect(set.body).toContain('brighten')
    expect(set.processSteps?.[0].title).toBe('Quick exam')
    expect(set.faq?.[0].question).toBe('Does it hurt?')
    expect(set.updatedAt).toBeInstanceOf(Date)
  })

  it('sanitizes content (trims + drops empties) and normalizes related slugs (dedupe + drop self)', async () => {
    state.returningRows = [{ slug: 'teeth-whitening' }]
    await updateLibraryEntry('teeth-whitening', {
      ...VALID_EDIT,
      heroBullets: ['  Kept  ', '', '   '],
      relatedSlugs: ['Dental Exams', 'dental-exams', 'teeth-whitening'], // dup + self
    })
    const set = state.setCalls[0]
    expect(set.heroBullets).toEqual(['Kept'])
    // 'Dental Exams' → 'dental-exams' (dedup), self 'teeth-whitening' dropped.
    expect(set.relatedSlugs).toEqual(['dental-exams'])
  })

  it('rejects an empty name or empty body BEFORE touching the DB', async () => {
    const noName = await updateLibraryEntry('x', { ...VALID_EDIT, name: '   ' })
    expect(noName.ok).toBe(false)
    const noBody = await updateLibraryEntry('x', { ...VALID_EDIT, body: '  ' })
    expect(noBody.ok).toBe(false)
    expect(state.setCalls).toHaveLength(0)
  })

  it('requires at least one highlight / step / question', async () => {
    const out = await updateLibraryEntry('x', { ...VALID_EDIT, heroBullets: [] })
    expect(out.ok).toBe(false)
    expect(state.setCalls).toHaveLength(0)
  })

  it('returns ok=false when the entry does not exist', async () => {
    state.returningRows = []
    const out = await updateLibraryEntry('missing', VALID_EDIT)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/not found/i)
  })

  it('returns ok=false when the DB call throws', async () => {
    state.throwOnUpdate = true
    const out = await updateLibraryEntry('teeth-whitening', VALID_EDIT)
    expect(out.ok).toBe(false)
  })
})
