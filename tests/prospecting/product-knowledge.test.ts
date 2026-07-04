import { describe, it, expect } from 'vitest'
import {
  PRODUCT_KNOWLEDGE,
  PRODUCT_KNOWLEDGE_SHORT,
  segmentAngle,
  effectiveProductKnowledge,
} from '@/lib/prospect-product-knowledge'
import { buildDemoBriefPrompt } from '@/lib/demo-brief-prompt'

/**
 * The canonical product knowledge that grounds every prospecting AI surface.
 * These guards catch the two ways it can rot: (1) drifting out of sync with
 * real pricing/positioning, and (2) losing the honest-limits guard that keeps
 * the AI from overpromising (the reason it exists).
 */

describe('product knowledge — the facts the AI sells on', () => {
  it('carries the real pricing (both the full and short versions agree)', () => {
    for (const k of [PRODUCT_KNOWLEDGE, PRODUCT_KNOWLEDGE_SHORT]) {
      expect(k).toContain('$150')
      expect(k).toContain('$250')
      expect(k).toContain('$500')
      expect(k).toMatch(/7-day free trial/i)
    }
  })

  it('carries the positioning (wraps the PMS, consolidates vendors, dental-only)', () => {
    for (const k of [PRODUCT_KNOWLEDGE, PRODUCT_KNOWLEDGE_SHORT]) {
      expect(k).toMatch(/wrap/i)
      expect(k).toContain('Open Dental')
      expect(k).toMatch(/dental-only/i)
    }
  })

  it('KEEPS the honest-limits guard so the AI never overpromises', () => {
    // Not a PMS + SMS-not-live are the two most tempting overpromises.
    for (const k of [PRODUCT_KNOWLEDGE, PRODUCT_KNOWLEDGE_SHORT]) {
      expect(k).toMatch(/not a pms/i)
      expect(k).toMatch(/sms|text/i)
    }
    // The full version spells out the objection playbook.
    expect(PRODUCT_KNOWLEDGE).toMatch(/objection/i)
  })
})

describe('segmentAngle', () => {
  it('gives a distinct lead for each segment and nothing for null', () => {
    const no = segmentAngle('no_website')
    const weak = segmentAngle('weak_website')
    const pres = segmentAngle('weak_presence')
    expect(no).toMatch(/no website/i)
    expect(weak).toMatch(/mobile|dated|booking/i)
    expect(pres).toMatch(/reviews|social/i)
    expect(new Set([no, weak, pres]).size).toBe(3) // all distinct
    expect(segmentAngle(null)).toBe('')
  })
})

describe('effectiveProductKnowledge — the editable brain', () => {
  it('falls back to the canonical knowledge when no override is set', () => {
    expect(effectiveProductKnowledge(null)).toBe(PRODUCT_KNOWLEDGE)
    expect(effectiveProductKnowledge({ productOverride: '', battleCards: [] })).toBe(
      PRODUCT_KNOWLEDGE,
    )
    expect(effectiveProductKnowledge({ productOverride: '   ', battleCards: [] })).toBe(
      PRODUCT_KNOWLEDGE,
    )
  })

  it('uses the short knowledge when asked and no override', () => {
    expect(effectiveProductKnowledge(null, { short: true })).toBe(PRODUCT_KNOWLEDGE_SHORT)
  })

  it('replaces the default entirely with an override', () => {
    const out = effectiveProductKnowledge(
      { productOverride: 'CUSTOM BRAIN TEXT', battleCards: [] },
      { short: true },
    )
    expect(out).toContain('CUSTOM BRAIN TEXT')
    expect(out).not.toContain('$150') // canonical knowledge is gone
  })

  it('appends battle cards, skipping half-filled rows', () => {
    const out = effectiveProductKnowledge({
      productOverride: '',
      battleCards: [
        { competitor: 'Weave', angle: 'One platform, dental-only, half the price.' },
        { competitor: '', angle: 'orphan angle' }, // dropped
        { competitor: 'Podium', angle: '' }, // dropped
      ],
    })
    expect(out).toContain('BATTLE CARDS')
    expect(out).toContain('vs Weave: One platform')
    expect(out).not.toContain('orphan angle')
    expect(out).not.toContain('vs Podium')
  })

  it('adds no battle-card block when there are none', () => {
    expect(effectiveProductKnowledge({ productOverride: '', battleCards: [] })).not.toContain(
      'BATTLE CARDS',
    )
  })
})

describe('injection', () => {
  it('the demo-brief prompt now leads with the product knowledge', () => {
    const { system } = buildDemoBriefPrompt({
      name: 'Test Dental',
      city: 'Austin',
      state: 'TX',
      authorizedOfficialName: 'Dr. Test',
      websiteUrl: null,
      ratingTenths: 40,
      reviewCount: 12,
      scoreReasons: [],
      signals: null,
      verdict: null,
    })
    expect(system).toContain('$150') // knowledge is present
    expect(system).toContain('Open Dental')
    expect(system).toContain('MIRROR') // original strategist framing preserved
  })

  it('the demo-brief prompt honors the editable brain (override + battle cards)', () => {
    const { system } = buildDemoBriefPrompt({
      name: 'Test Dental',
      city: 'Austin',
      state: 'TX',
      authorizedOfficialName: 'Dr. Test',
      websiteUrl: null,
      ratingTenths: 40,
      reviewCount: 12,
      scoreReasons: [],
      signals: null,
      verdict: null,
      brain: {
        productOverride: 'OVERRIDDEN PITCH',
        battleCards: [{ competitor: 'Weave', angle: 'dental-only, one bill' }],
      },
    })
    expect(system).toContain('OVERRIDDEN PITCH')
    expect(system).not.toContain('$150') // canonical default replaced
    expect(system).toContain('vs Weave: dental-only, one bill')
    expect(system).toContain('MIRROR') // strategist framing still appended
  })
})
