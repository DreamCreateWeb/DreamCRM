import { describe, it, expect } from 'vitest'
import {
  SITE_TEMPLATE_CATALOG,
  PRACTICE_TYPE_LABELS,
} from '@/lib/site-templates/catalog'
import { getSiteTemplate } from '@/lib/site-templates/registry'

/**
 * Gallery metadata contract: every registered template must be fully
 * categorized (practice types, style tags, fit guidance) so it can never
 * ship invisible to the gallery's filters — and every practice type it
 * claims must have a label for the category chips.
 */
describe('template catalog metadata', () => {
  it('every entry is fully categorized for the gallery', () => {
    for (const entry of SITE_TEMPLATE_CATALOG) {
      expect(entry.practiceTypes.length, `${entry.id} practiceTypes`).toBeGreaterThan(0)
      expect(entry.styleTags.length, `${entry.id} styleTags`).toBeGreaterThan(0)
      expect(entry.bestFor.trim().length, `${entry.id} bestFor`).toBeGreaterThan(0)
      for (const t of entry.practiceTypes) {
        expect(PRACTICE_TYPE_LABELS[t], `${entry.id} → ${t} label`).toBeTruthy()
      }
    }
  })

  it('every catalog entry resolves to its registered def (no orphans)', () => {
    for (const entry of SITE_TEMPLATE_CATALOG) {
      expect(getSiteTemplate(entry.id).id).toBe(entry.id)
    }
  })
})
