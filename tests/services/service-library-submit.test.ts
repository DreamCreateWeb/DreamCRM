/**
 * Unit tests for `submitNewLibraryEntry` — the public-facing wrapper around
 * vetAndCleanNewService that lands a new entry as `status='pending'` (or
 * surfaces a duplicate / rejection). Mocks the AI vet call + the DB.
 *
 * What we cover:
 *  • new entry path → inserts with origin='clinic', status='pending', the
 *    submitting org id on submittedByOrgId.
 *  • duplicate path → no insert, returns the existing slug.
 *  • rejection path → no insert, returns the error.
 *  • race condition → existing slug check before insert returns duplicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const aiState: { vetResult: unknown } = { vetResult: null }
vi.mock('@/lib/services/service-library-ai', async () => {
  const real = await vi.importActual<typeof import('@/lib/services/service-library-ai')>(
    '@/lib/services/service-library-ai',
  )
  return {
    ...real,
    vetAndCleanNewService: async () => aiState.vetResult,
  }
})

const dbState: {
  selectQueue: unknown[][]
  insertedValues: unknown[]
  insertedReturn: unknown[]
  insertShouldThrow: boolean
} = {
  selectQueue: [],
  insertedValues: [],
  insertedReturn: [],
  insertShouldThrow: false,
}

vi.mock('@/lib/db', () => {
  const select = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => dbState.selectQueue.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) =>
      resolve(dbState.selectQueue.shift() ?? [])
    return obj
  }
  const insert = () => ({
    values: (v: unknown) => ({
      returning: async () => {
        if (dbState.insertShouldThrow) throw new Error('insert failed')
        dbState.insertedValues.push(v)
        return dbState.insertedReturn
      },
    }),
  })
  const update = () => ({
    set: () => ({ where: () => ({ returning: async () => [] }) }),
  })
  return { db: { select, insert, update } }
})

import { submitNewLibraryEntry } from '@/lib/services/service-library'

beforeEach(() => {
  aiState.vetResult = null
  dbState.selectQueue.length = 0
  dbState.insertedValues.length = 0
  dbState.insertedReturn = []
  dbState.insertShouldThrow = false
})

function fakeNewEntry() {
  return {
    slug: 'same-day-crowns',
    name: 'Same-Day Crowns',
    category: 'core' as const,
    icon: '👑',
    shortDescription: 'Same-day crowns in one visit.',
    heroBullets: ['Same-day', 'Custom fit', 'Tooth-colored'],
    body: 'Body paragraph.',
    processSteps: [
      { title: 't1', body: 'b1' },
      { title: 't2', body: 'b2' },
      { title: 't3', body: 'b3' },
      { title: 't4', body: 'b4' },
    ],
    faq: [
      { question: 'q1', answer: 'a1' },
      { question: 'q2', answer: 'a2' },
      { question: 'q3', answer: 'a3' },
      { question: 'q4', answer: 'a4' },
      { question: 'q5', answer: 'a5' },
    ],
    relatedSlugs: [],
  }
}

describe('submitNewLibraryEntry', () => {
  it('inserts a new pending entry with the submitting org id', async () => {
    // First select = "active+pending library for the vet call" (we make
    // it empty so the function falls back to SERVICE_LIBRARY_SEED — which
    // is fine, we don't assert on the vet input).
    dbState.selectQueue.push([])
    // Second select = "does this slug already exist?" (race-condition guard)
    dbState.selectQueue.push([])

    aiState.vetResult = {
      ok: true,
      kind: 'new',
      entry: fakeNewEntry(),
      suggestedRelated: [],
    }
    dbState.insertedReturn = [
      {
        id: 'svc_xyz',
        slug: 'same-day-crowns',
        name: 'Same-Day Crowns',
        category: 'core',
        icon: '👑',
        shortDescription: 'Same-day crowns in one visit.',
        heroBullets: ['Same-day', 'Custom fit', 'Tooth-colored'],
        body: 'Body paragraph.',
        processSteps: fakeNewEntry().processSteps,
        faq: fakeNewEntry().faq,
        relatedSlugs: [],
        origin: 'clinic',
        status: 'pending',
        submittedByOrgId: 'org_test',
        reviewNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const out = await submitNewLibraryEntry('org_test', {
      name: 'Same Day Crowns',
      description: 'A description',
    })
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'created') {
      expect(out.entry.slug).toBe('same-day-crowns')
      expect(out.entry.status).toBe('pending')
      expect(out.entry.origin).toBe('clinic')
      expect(out.entry.submittedByOrgId).toBe('org_test')
    }
    expect(dbState.insertedValues).toHaveLength(1)
    const inserted = dbState.insertedValues[0] as Record<string, unknown>
    expect(inserted.origin).toBe('clinic')
    expect(inserted.status).toBe('pending')
    expect(inserted.submittedByOrgId).toBe('org_test')
    expect(inserted.slug).toBe('same-day-crowns')
  })

  it('returns kind="duplicate" without inserting on AI duplicate result', async () => {
    dbState.selectQueue.push([])
    aiState.vetResult = {
      ok: true,
      kind: 'duplicate',
      existingSlug: 'teeth-whitening',
      note: 'Zoom is just whitening',
    }
    const out = await submitNewLibraryEntry('org_test', { name: 'Zoom Whitening' })
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'duplicate') {
      expect(out.existingSlug).toBe('teeth-whitening')
    }
    expect(dbState.insertedValues).toHaveLength(0)
  })

  it('passes through a rejection without inserting', async () => {
    dbState.selectQueue.push([])
    aiState.vetResult = {
      ok: false,
      error: 'Not a real dental service',
    }
    const out = await submitNewLibraryEntry('org_test', { name: 'Just words' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/not a real/i)
    expect(dbState.insertedValues).toHaveLength(0)
  })

  it('falls back to duplicate when the slug race-loses to a concurrent insert', async () => {
    dbState.selectQueue.push([])
    // The slug-collision pre-check returns a row → duplicate, no insert.
    dbState.selectQueue.push([{ slug: 'same-day-crowns' }])
    aiState.vetResult = {
      ok: true,
      kind: 'new',
      entry: fakeNewEntry(),
      suggestedRelated: [],
    }
    const out = await submitNewLibraryEntry('org_test', { name: 'Same Day Crowns' })
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'duplicate') {
      expect(out.existingSlug).toBe('same-day-crowns')
    }
    expect(dbState.insertedValues).toHaveLength(0)
  })

  it('surfaces a DB insert failure politely', async () => {
    dbState.selectQueue.push([])
    dbState.selectQueue.push([])
    dbState.insertShouldThrow = true
    aiState.vetResult = {
      ok: true,
      kind: 'new',
      entry: fakeNewEntry(),
      suggestedRelated: [],
    }
    const out = await submitNewLibraryEntry('org_test', { name: 'Same Day Crowns' })
    expect(out.ok).toBe(false)
  })
})
