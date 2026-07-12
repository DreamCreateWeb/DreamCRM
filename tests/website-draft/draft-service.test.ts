import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stagedJson } from '../helpers/website-draft'

/**
 * The Draft→Publish server plumbing: stageWebsiteValues routing, the honest
 * status count, publish (apply + clear + history w/ __publish marker), and
 * discard (clear only — live never touched).
 */

let selectRow: Record<string, unknown> | undefined
const ops: Array<{ set: Record<string, unknown> }> = []
const historyCalls: Array<{ org: string; label: string; previous: Record<string, unknown> }> = []

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (selectRow ? [selectRow] : []) }) }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          ops.push({ set: v })
        },
      }),
    }),
  },
}))

vi.mock('@/lib/services/website-history', () => ({
  recordWebsiteEdit: vi.fn(async (org: string, label: string, previous: Record<string, unknown>) => {
    historyCalls.push({ org, label, previous })
  }),
}))

import {
  stageWebsiteValues,
  getEffectiveWebsiteProfile,
  getWebsiteDraftStatus,
  publishWebsiteDraft,
  discardWebsiteDraft,
} from '@/lib/services/website-draft'

beforeEach(() => {
  ops.length = 0
  historyCalls.length = 0
  selectRow = undefined
})

describe('stageWebsiteValues', () => {
  it('merges draftable values into websiteDraft via SQL (atomic ||) and writes identity live', async () => {
    const res = await stageWebsiteValues('org_1', { tagline: 'New', displayName: 'Acme' })
    expect(res.stagedKeys).toEqual(['tagline'])
    expect(ops).toHaveLength(1)
    const set = ops[0].set
    expect(set.displayName).toBe('Acme')
    expect(set.tagline).toBeUndefined()
    expect(stagedJson(set)).toEqual({ tagline: 'New' })
  })

  it('an identity-only write never touches the draft column', async () => {
    await stageWebsiteValues('org_1', { phone: '555-0100' })
    expect(ops[0].set.websiteDraft).toBeUndefined()
    expect(ops[0].set.phone).toBe('555-0100')
  })
})

describe('getEffectiveWebsiteProfile', () => {
  it('returns the merged view + the raw row + the staged keys', async () => {
    selectRow = { tagline: 'Live', about: 'Live about', websiteDraft: { tagline: 'Draft' } }
    const eff = await getEffectiveWebsiteProfile('org_1')
    expect(eff?.profile.tagline).toBe('Draft')
    expect(eff?.profile.about).toBe('Live about')
    expect(eff?.raw.tagline).toBe('Live')
    expect(eff?.draftKeys).toEqual(['tagline'])
  })

  it('returns null when the profile is missing', async () => {
    selectRow = undefined
    expect(await getEffectiveWebsiteProfile('org_1')).toBeNull()
  })
})

describe('getWebsiteDraftStatus — the honest count', () => {
  it('counts only staged values that differ from live', async () => {
    selectRow = {
      tagline: 'Same',
      about: 'Live',
      websiteDraft: { tagline: 'Same', about: 'Different' },
    }
    const s = await getWebsiteDraftStatus('org_1')
    expect(s.count).toBe(1)
    expect(s.changes[0]).toEqual({ column: 'about', label: 'About your practice' })
  })

  it('no draft → zero', async () => {
    selectRow = { tagline: 'x', websiteDraft: null }
    expect((await getWebsiteDraftStatus('org_1')).count).toBe(0)
  })
})

describe('publishWebsiteDraft', () => {
  it('applies staged values to live columns, clears the blob, and records a __publish history entry of the PRIOR live values', async () => {
    selectRow = {
      tagline: 'Old live',
      about: 'Old about',
      websiteDraft: { tagline: 'New tagline', junkKey: 'filtered' },
    }
    const res = await publishWebsiteDraft('org_1')
    expect(res.published).toBe(1)
    // History first: prior live value + the publish marker.
    expect(historyCalls).toHaveLength(1)
    expect(historyCalls[0].label).toMatch(/published/i)
    expect(historyCalls[0].previous).toEqual({ __publish: true, tagline: 'Old live' })
    // Apply: staged value lands live, blob clears, junk never applies.
    expect(ops).toHaveLength(1)
    expect(ops[0].set.tagline).toBe('New tagline')
    expect(ops[0].set.websiteDraft).toBeNull()
    expect(ops[0].set).not.toHaveProperty('junkKey')
  })

  it('publishing nothing is a no-op (no history, no column writes)', async () => {
    selectRow = { tagline: 'x', websiteDraft: null }
    const res = await publishWebsiteDraft('org_1')
    expect(res.published).toBe(0)
    expect(historyCalls).toHaveLength(0)
    expect(ops).toHaveLength(0)
  })

  it('a junk-only blob is swept clean without touching content columns', async () => {
    selectRow = { tagline: 'x', websiteDraft: { junkKey: 'x' } }
    const res = await publishWebsiteDraft('org_1')
    expect(res.published).toBe(0)
    expect(ops).toHaveLength(1)
    expect(ops[0].set).toEqual({ websiteDraft: null })
  })
})

describe('discardWebsiteDraft', () => {
  it('clears the blob and reports the count — live columns untouched', async () => {
    selectRow = { websiteDraft: { tagline: 'Staged', about: 'Also staged' } }
    const res = await discardWebsiteDraft('org_1')
    expect(res.discarded).toBe(2)
    expect(ops).toHaveLength(1)
    const keys = Object.keys(ops[0].set).filter((k) => k !== 'updatedAt')
    expect(keys).toEqual(['websiteDraft'])
    expect(ops[0].set.websiteDraft).toBeNull()
  })

  it('no draft → nothing written', async () => {
    selectRow = { websiteDraft: null }
    const res = await discardWebsiteDraft('org_1')
    expect(res.discarded).toBe(0)
    expect(ops).toHaveLength(0)
  })
})
