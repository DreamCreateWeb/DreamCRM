import { describe, it, expect } from 'vitest'
import { DOCS, DOC_CATEGORIES, relatedDocs } from '@/lib/marketing/docs'

/**
 * "MORE IN <CATEGORY>" WALKS THE CATEGORY AS A RING.
 *
 * It used to be the first three articles of the category for every reader, so
 * three articles per category collected every cross-link and the rest
 * collected none — fifteen help articles with exactly one inbound link on the
 * whole site (the docs index), found on the 2026-11-23 link-graph crawl.
 *
 * The properties below are the ones that make that impossible again: nobody
 * links to themselves, nobody leaves the category, and INBOUND EQUALS
 * OUTBOUND for every article — which is the statement "no article is left
 * with only the hub".
 */
describe('relatedDocs', () => {
  it('offers the next articles in the same category, never the article itself', () => {
    for (const doc of DOCS) {
      const related = relatedDocs(doc.slug)
      const siblings = DOCS.filter((d) => d.category === doc.category)
      expect(related.length, doc.slug).toBe(Math.min(3, siblings.length - 1))
      expect(related.map((r) => r.slug)).not.toContain(doc.slug)
      for (const r of related) expect(r.category, `${doc.slug} → ${r.slug}`).toBe(doc.category)
      // No duplicates in one list.
      expect(new Set(related.map((r) => r.slug)).size).toBe(related.length)
    }
  })

  it('gives every article as many inbound links as it gives out — nobody is left with only the hub', () => {
    const inbound = new Map<string, number>(DOCS.map((d) => [d.slug, 0]))
    for (const doc of DOCS) for (const r of relatedDocs(doc.slug)) inbound.set(r.slug, (inbound.get(r.slug) ?? 0) + 1)
    for (const doc of DOCS) {
      expect(inbound.get(doc.slug), `${doc.slug} inbound`).toBe(relatedDocs(doc.slug).length)
    }
    // The premise: every category is big enough for the ring to matter. A
    // category of one would make the assertion above pass on zero links.
    for (const category of DOC_CATEGORIES) {
      expect(DOCS.filter((d) => d.category === category).length, category).toBeGreaterThan(3)
    }
  })

  it('wraps at the end of a category rather than running short', () => {
    for (const category of DOC_CATEGORIES) {
      const siblings = DOCS.filter((d) => d.category === category)
      const last = siblings[siblings.length - 1]!
      expect(relatedDocs(last.slug)[0]!.slug, `${category}: the last article's first link`).toBe(siblings[0]!.slug)
    }
  })

  it('answers an unknown slug with nothing, and honours a smaller count', () => {
    expect(relatedDocs('no-such-article')).toEqual([])
    expect(relatedDocs(DOCS[0]!.slug, 1)).toHaveLength(1)
  })
})
