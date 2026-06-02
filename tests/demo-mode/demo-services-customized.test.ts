/**
 * Drift guard for Checkpoint 1B's hand-written demo customization blobs.
 *
 * `DEMO_SERVICES` in demo-clinic.ts carries pre-baked `customized` content for
 * each Acme demo service (so the resync runs without burning an Anthropic
 * call per service on every deploy). This test confirms every entry is wired
 * up and each blob matches the canonical seed's process-step + FAQ counts —
 * the structural contract `customizeServiceForClinic` enforces in production.
 *
 * It also pins the no-fabricated-pricing promise (no $-figure in any
 * customization) so a future hand-edit can't accidentally introduce one.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { select: () => ({}), insert: () => ({}), update: () => ({}) },
  schema: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }),
}))

import { DEMO_SERVICES } from '@/lib/services/demo-clinic'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'

describe('DEMO_SERVICES customized blobs (Checkpoint 1B)', () => {
  it('every Acme demo service is library-linked', () => {
    for (const s of DEMO_SERVICES) {
      expect(s.librarySlug, `${s.name} has librarySlug`).toBeTruthy()
    }
  })

  it('every Acme demo service carries a customized blob', () => {
    for (const s of DEMO_SERVICES) {
      expect(s.customized, `${s.name} has customized`).toBeTruthy()
    }
  })

  it('customized.heroBullets is 3-5 entries long', () => {
    for (const s of DEMO_SERVICES) {
      const c = s.customized!
      expect(c.heroBullets.length, `${s.name} heroBullets`).toBeGreaterThanOrEqual(3)
      expect(c.heroBullets.length, `${s.name} heroBullets`).toBeLessThanOrEqual(5)
    }
  })

  it('customized.processSteps count matches the canonical seed for each slug', () => {
    const bySlug = new Map(SERVICE_LIBRARY_SEED.map((e) => [e.slug, e]))
    for (const s of DEMO_SERVICES) {
      const seed = bySlug.get(s.librarySlug!)
      expect(seed, `seed for ${s.librarySlug}`).toBeTruthy()
      expect(
        s.customized!.processSteps.length,
        `${s.name} step count matches canonical`,
      ).toBe(seed!.processSteps.length)
    }
  })

  it('customized.faq count matches the canonical seed for each slug', () => {
    const bySlug = new Map(SERVICE_LIBRARY_SEED.map((e) => [e.slug, e]))
    for (const s of DEMO_SERVICES) {
      const seed = bySlug.get(s.librarySlug!)
      expect(s.customized!.faq.length, `${s.name} faq count matches canonical`).toBe(
        seed!.faq.length,
      )
    }
  })

  it('no customized content invents a dollar figure (pricing rule)', () => {
    for (const s of DEMO_SERVICES) {
      const c = s.customized!
      const allText = [
        c.body,
        ...c.heroBullets,
        ...c.processSteps.flatMap((p) => [p.title, p.body]),
        ...c.faq.flatMap((f) => [f.question, f.answer]),
      ].join(' ')
      expect(allText, `${s.name} contains no $-figure`).not.toMatch(/\$\s?\d/)
    }
  })

  it('customized carries modelId + generatedAt metadata', () => {
    for (const s of DEMO_SERVICES) {
      const c = s.customized!
      expect(c.modelId, `${s.name} modelId`).toBe('claude-sonnet-4-6')
      expect(c.generatedAt, `${s.name} generatedAt`).toMatch(/\d{4}-\d{2}-\d{2}T/)
    }
  })
})
