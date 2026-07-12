import { describe, it, expect } from 'vitest'
import {
  WEBSITE_DRAFT_COLUMNS,
  WEBSITE_COLUMN_LABELS,
  splitWebsiteValues,
  mergeWebsiteDraft,
  websiteDraftKeys,
  websiteDraftChanges,
} from '@/lib/website-draft'

/**
 * The Draft→Publish pure core. The invariants that keep the system honest:
 * identity never stages, junk keys never merge, a staged null means
 * "cleared", and the change list only counts values that actually differ
 * from live.
 */

describe('WEBSITE_DRAFT_COLUMNS — the draftable set', () => {
  it('stages content/presentation, never identity', () => {
    for (const col of ['tagline', 'about', 'brandColor', 'template', 'services', 'faq', 'copyOverrides', 'seoMeta', 'leadForms']) {
      expect(WEBSITE_DRAFT_COLUMNS.has(col), col).toBe(true)
    }
    // Identity drives booking slots, reminder times, and the email From —
    // it must always write live. The chat toggle is functional, not content.
    for (const col of ['displayName', 'legalName', 'phone', 'email', 'hours', 'logoUrl', 'addressLine1', 'city', 'timezone', 'chatWidgetEnabled', 'hoursSource', 'phoneSource', 'addressSource']) {
      expect(WEBSITE_DRAFT_COLUMNS.has(col), col).toBe(false)
    }
  })

  it('every draftable column has an owner-readable label', () => {
    for (const col of WEBSITE_DRAFT_COLUMNS) {
      expect(WEBSITE_COLUMN_LABELS[col], col).toBeTruthy()
    }
  })
})

describe('splitWebsiteValues', () => {
  it('routes draftable → staged, identity → direct', () => {
    const { staged, direct } = splitWebsiteValues({
      tagline: 'Smiles',
      displayName: 'Acme',
      hours: { mon: {} },
      faq: [],
    })
    expect(staged).toEqual({ tagline: 'Smiles', faq: [] })
    expect(direct).toEqual({ displayName: 'Acme', hours: { mon: {} } })
  })

  it('normalizes undefined staged values to null (jsonb has no undefined)', () => {
    const { staged } = splitWebsiteValues({ tagline: undefined })
    expect(staged).toEqual({ tagline: null })
  })
})

describe('mergeWebsiteDraft', () => {
  const profile = { tagline: 'Live tagline', about: 'Live about', displayName: 'Acme' }

  it('draft values win over live; untouched columns pass through', () => {
    const merged = mergeWebsiteDraft(profile, { tagline: 'Draft tagline' })
    expect(merged.tagline).toBe('Draft tagline')
    expect(merged.about).toBe('Live about')
    expect(merged.displayName).toBe('Acme')
  })

  it('a staged null means CLEARED — it overrides live', () => {
    const merged = mergeWebsiteDraft(profile, { about: null })
    expect(merged.about).toBeNull()
  })

  it('junk keys in the blob never leak (identity + unknowns filtered)', () => {
    const merged = mergeWebsiteDraft(profile, {
      displayName: 'EVIL',
      planTier: 'premium',
      randomKey: 'x',
      tagline: 'ok',
    })
    expect(merged.displayName).toBe('Acme')
    expect((merged as Record<string, unknown>).planTier).toBeUndefined()
    expect((merged as Record<string, unknown>).randomKey).toBeUndefined()
    expect(merged.tagline).toBe('ok')
  })

  it('null / non-object / array drafts are no-ops', () => {
    expect(mergeWebsiteDraft(profile, null)).toEqual(profile)
    expect(mergeWebsiteDraft(profile, 'junk')).toEqual(profile)
    expect(mergeWebsiteDraft(profile, [1, 2])).toEqual(profile)
  })
})

describe('websiteDraftKeys + websiteDraftChanges', () => {
  it('keys filters junk; changes only counts real differences', () => {
    const profile = { tagline: 'Same', about: 'Live', stats: [{ id: 's', value: '1', label: 'x' }] }
    const draft = {
      tagline: 'Same', // staged but identical → not a change
      about: 'Different', // real change
      stats: [{ id: 's', value: '1', label: 'x' }], // deep-equal → not a change
      junkKey: 'x', // filtered
    }
    expect(websiteDraftKeys(draft)).toEqual(['tagline', 'about', 'stats'])
    const changes = websiteDraftChanges(draft, profile)
    expect(changes).toEqual([{ column: 'about', label: 'About your practice' }])
  })

  it('a staged null against a live value IS a change (and vice versa)', () => {
    expect(websiteDraftChanges({ about: null }, { about: 'Live' })).toHaveLength(1)
    expect(websiteDraftChanges({ about: 'New' }, { about: null })).toHaveLength(1)
    expect(websiteDraftChanges({ about: null }, { about: null })).toHaveLength(0)
  })

  it('empty/absent drafts → no keys, no changes', () => {
    expect(websiteDraftKeys(null)).toEqual([])
    expect(websiteDraftChanges(null, {})).toEqual([])
    expect(websiteDraftChanges({}, {})).toEqual([])
  })
})
