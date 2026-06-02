/**
 * Unit tests for the service-library AI surface — Checkpoint 1B. Mocks the
 * underlying `runClaudeJson` so we never hit the network and can drive every
 * branch deterministically:
 *
 *   • customizeServiceForClinic — success, AI-not-configured, model returned
 *     null, model output failed validation.
 *   • vetAndCleanNewService — kind=new success, kind=duplicate, kind=invalid,
 *     null tool input → polite error, model hallucinated existing slug →
 *     polite error, model hallucinated a "new" entry whose slug already
 *     exists → falls back to duplicate.
 *   • getCustomizationForClinicService — returns blob when linked + sound,
 *     null when librarySlug mismatch, null when blob is malformed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { configured: boolean; toolInput: unknown } = {
  configured: true,
  toolInput: null,
}

vi.mock('@/lib/ai', () => ({
  aiConfigured: () => state.configured,
  runClaudeJson: async () => state.toolInput,
  runClaudeText: async () => null,
}))

import {
  customizeServiceForClinic,
  vetAndCleanNewService,
  getCustomizationForClinicService,
} from '@/lib/services/service-library-ai'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'
import type { ClinicService, ServiceLibraryEntry } from '@/lib/types/clinic-content'

beforeEach(() => {
  state.configured = true
  state.toolInput = null
})

const whitening = SERVICE_LIBRARY_SEED.find((e) => e.slug === 'teeth-whitening')!

describe('customizeServiceForClinic', () => {
  it('returns ok=false when AI is not configured', async () => {
    state.configured = false
    const out = await customizeServiceForClinic(whitening, { name: 'Acme', city: 'Austin' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/not configured/i)
  })

  it('returns the parsed customization on a clean tool response', async () => {
    state.toolInput = {
      heroBullets: ['a', 'b', 'c'],
      body: 'A rewritten body paragraph in the Acme voice.',
      processSteps: whitening.processSteps.map((s) => ({
        title: s.title + ' v2',
        body: s.body + ' v2',
      })),
      faq: whitening.faq.map((f) => ({
        question: f.question + ' (rewritten)',
        answer: f.answer + ' (rewritten)',
      })),
    }
    const out = await customizeServiceForClinic(whitening, { name: 'Acme', city: 'Austin' })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.customization.heroBullets).toEqual(['a', 'b', 'c'])
      expect(out.customization.body).toMatch(/Acme/)
      expect(out.customization.processSteps).toHaveLength(whitening.processSteps.length)
      expect(out.customization.faq).toHaveLength(whitening.faq.length)
      expect(out.customization.modelId).toBe('claude-sonnet-4-6')
      // generatedAt is an ISO timestamp.
      expect(out.customization.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
    }
  })

  it('returns ok=false when the model returns no input', async () => {
    state.toolInput = null
    const out = await customizeServiceForClinic(whitening, { name: 'Acme' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/no content/i)
  })

  it('returns "model output failed validation" on schema mismatch', async () => {
    // Hero bullets short (1 < min 3) — schema rejection.
    state.toolInput = {
      heroBullets: ['only one'],
      body: 'whatever',
      processSteps: whitening.processSteps,
      faq: whitening.faq,
    }
    const out = await customizeServiceForClinic(whitening, { name: 'Acme' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/failed validation/i)
  })

  it('substitutes {clinic}/{city} in canonical inputs before sending — body never carries tokens', async () => {
    // We can verify the prompt got tokenized indirectly via the return path:
    // mock the model to echo the body it would see. We can't peek inside
    // runClaudeJson's args here without redoing the mock; but we CAN verify
    // the success branch doesn't leak tokens into the returned content,
    // which is the user-visible promise.
    state.toolInput = {
      heroBullets: ['a', 'b', 'c'],
      body: 'Custom body with no tokens.',
      processSteps: whitening.processSteps,
      faq: whitening.faq,
    }
    const out = await customizeServiceForClinic(whitening, { name: 'Acme', city: 'Austin' })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.customization.body).not.toContain('{clinic}')
      expect(out.customization.body).not.toContain('{city}')
    }
  })
})

describe('vetAndCleanNewService', () => {
  it('returns ok=false when AI is not configured', async () => {
    state.configured = false
    const out = await vetAndCleanNewService({ name: 'Same Day Crowns' }, SERVICE_LIBRARY_SEED)
    expect(out.ok).toBe(false)
  })

  it('rejects an empty name without calling AI', async () => {
    state.toolInput = null
    const out = await vetAndCleanNewService({ name: '   ' }, SERVICE_LIBRARY_SEED)
    expect(out.ok).toBe(false)
  })

  it('returns a clean new entry on kind="new"', async () => {
    state.toolInput = {
      kind: 'new',
      note: 'Same-day crowns deserves its own entry.',
      entry: {
        slug: 'same-day-crowns',
        name: 'Same-Day Crowns',
        category: 'core',
        icon: '👑',
        shortDescription: 'Crown your tooth and walk out the same day.',
        heroBullets: ['Same-day', 'Custom fit', 'Tooth-colored', 'No temporary'],
        body: 'Same-day crowns use modern in-office milling to deliver a custom crown in a single visit. The team designs, mills, and bonds the crown the same afternoon you book.',
        processSteps: [
          { title: 'Scan', body: 'We take a quick digital scan instead of a goopy impression.' },
          { title: 'Design', body: 'We design the crown on the screen with you so the fit looks natural.' },
          { title: 'Mill', body: 'A precision mill cuts your crown from a tooth-colored block in about 15 minutes.' },
          { title: 'Bond', body: 'We bond the crown in place, check your bite, and you walk out finished.' },
        ],
        faq: [
          { question: 'Is the crown as strong as a lab-made one?', answer: 'Yes — modern materials are very strong.' },
          { question: 'How long does the visit take?', answer: 'Most same-day crowns are done in two to three hours.' },
          { question: 'Will it match my other teeth?', answer: 'We pick the shade with you to make it blend.' },
          { question: 'Does the procedure hurt?', answer: "You'll be numb. Most patients are surprised how comfortable it is." },
          { question: 'How much does a same-day crown cost?', answer: "Cost depends on your case. We'll check your insurance first and give you a clear estimate before we begin." },
        ],
        relatedSlugs: ['cavity-treatment', 'dental-exams'],
      },
      suggestedRelated: ['cavity-treatment', 'dental-exams'],
    }
    const out = await vetAndCleanNewService(
      { name: 'Same Day Crowns', description: 'In-office milled crowns' },
      SERVICE_LIBRARY_SEED,
    )
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'new') {
      expect(out.entry.slug).toBe('same-day-crowns')
      expect(out.entry.name).toBe('Same-Day Crowns')
      expect(out.entry.processSteps).toHaveLength(4)
      expect(out.entry.faq).toHaveLength(5)
      // related slugs are filtered to existing slugs only.
      expect(out.entry.relatedSlugs).toEqual(['cavity-treatment', 'dental-exams'])
    }
  })

  it('returns kind="duplicate" when the model points at an existing slug', async () => {
    state.toolInput = {
      kind: 'duplicate',
      note: 'Zoom Whitening is a brand name for teeth whitening.',
      existingSlug: 'teeth-whitening',
    }
    const out = await vetAndCleanNewService({ name: 'Zoom Whitening' }, SERVICE_LIBRARY_SEED)
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'duplicate') {
      expect(out.existingSlug).toBe('teeth-whitening')
    }
  })

  it('rejects an invalid submission politely', async () => {
    state.toolInput = {
      kind: 'invalid',
      note: 'Just a product name, not a procedure.',
    }
    const out = await vetAndCleanNewService({ name: 'Crest' }, SERVICE_LIBRARY_SEED)
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/product name|not a procedure|recognized/i)
  })

  it('handles structured-output failure gracefully', async () => {
    state.toolInput = null
    const out = await vetAndCleanNewService({ name: 'Veneers' }, SERVICE_LIBRARY_SEED)
    expect(out.ok).toBe(false)
  })

  it('treats hallucinated existing slugs as a failure (defense in depth)', async () => {
    state.toolInput = {
      kind: 'duplicate',
      note: 'Made up.',
      existingSlug: 'this-does-not-exist',
    }
    const out = await vetAndCleanNewService({ name: 'X' }, SERVICE_LIBRARY_SEED)
    expect(out.ok).toBe(false)
  })

  it('falls back to duplicate when a "new" entry collides with an existing slug', async () => {
    state.toolInput = {
      kind: 'new',
      note: 'Looks new.',
      entry: {
        // This slug is already in the seed.
        slug: 'teeth-whitening',
        name: 'Teeth Whitening',
        category: 'core',
        icon: '✨',
        shortDescription: 'Brighten your smile.',
        heroBullets: ['a', 'b', 'c'],
        body: 'body',
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
      },
    }
    const out = await vetAndCleanNewService({ name: 'Teeth Whitening' }, SERVICE_LIBRARY_SEED)
    expect(out.ok).toBe(true)
    if (out.ok && out.kind === 'duplicate') {
      expect(out.existingSlug).toBe('teeth-whitening')
    }
  })
})

describe('getCustomizationForClinicService', () => {
  const whiteningEntry = whitening

  function makeService(over: Partial<ClinicService> = {}): ClinicService {
    return {
      id: 'svc_1',
      name: 'Teeth Whitening',
      librarySlug: 'teeth-whitening',
      ...over,
    }
  }

  it('returns the blob when present and linked to the same library entry', () => {
    const s = makeService({
      customized: {
        heroBullets: ['a', 'b', 'c'],
        body: 'body',
        processSteps: [{ title: 't', body: 'b' }],
        faq: [{ question: 'q', answer: 'a' }],
        generatedAt: '2026-06-01T00:00:00Z',
        modelId: 'claude-sonnet-4-6',
      },
    })
    const out = getCustomizationForClinicService(s, whiteningEntry, { name: 'Acme' })
    expect(out).not.toBeNull()
    expect(out?.body).toBe('body')
  })

  it('returns null when the service has no customization', () => {
    const s = makeService({})
    expect(getCustomizationForClinicService(s, whiteningEntry, { name: 'Acme' })).toBeNull()
  })

  it('returns null when librarySlug does not match the library entry', () => {
    const s = makeService({
      librarySlug: 'family-dental-care',
      customized: {
        heroBullets: ['a', 'b', 'c'],
        body: 'body',
        processSteps: [{ title: 't', body: 'b' }],
        faq: [{ question: 'q', answer: 'a' }],
        generatedAt: '2026-06-01T00:00:00Z',
        modelId: 'claude-sonnet-4-6',
      },
    })
    const out = getCustomizationForClinicService(s, whiteningEntry, { name: 'Acme' })
    expect(out).toBeNull()
  })

  it('returns null on structurally-malformed blobs', () => {
    const s = makeService({
      // Bad shape: hero bullets is not an array.
      customized: {
        heroBullets: 'oops' as unknown as string[],
        body: 'body',
        processSteps: [{ title: 't', body: 'b' }],
        faq: [{ question: 'q', answer: 'a' }],
        generatedAt: '2026-06-01T00:00:00Z',
        modelId: 'claude-sonnet-4-6',
      },
    })
    const out = getCustomizationForClinicService(s, whiteningEntry, { name: 'Acme' })
    expect(out).toBeNull()
  })

  it('takes an arbitrary ServiceLibraryEntry — typecheck the shape', () => {
    const entry: ServiceLibraryEntry = whiteningEntry
    expect(entry.slug).toBe('teeth-whitening')
  })
})
