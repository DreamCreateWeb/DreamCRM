import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The site-render draft overlay (lib/services/clinic-site.ts): a verified
 * editor with staged edits sees the merged view; a visitor NEVER does; the
 * session check is skipped entirely when no draft exists (no wasted lookup);
 * and getClinicThemeBySlug overlays brand/template + reports hasEditorDraft
 * for the layout banner.
 */

let canEdit = false
let canEditCalls = 0
vi.mock('@/lib/clinic-site-edit', () => ({
  canEditClinic: vi.fn(async () => {
    canEditCalls += 1
    return canEdit
  }),
}))

const selectQueue: unknown[][] = []
vi.mock('@/lib/db', () => {
  const chain = (result: () => unknown[]) => {
    const c: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'leftJoin', 'innerJoin', 'orderBy', 'offset']) c[m] = () => c
    c.limit = async () => result()
    c.then = (resolve: (v: unknown[]) => void) => resolve(result())
    return c
  }
  return {
    db: { select: () => chain(() => selectQueue.shift() ?? []) },
  }
})

import { getClinicSiteBySlug, getClinicThemeBySlug } from '@/lib/services/clinic-site'

beforeEach(() => {
  selectQueue.length = 0
  canEdit = false
  canEditCalls = 0
})

const org = { id: 'org_1', slug: 'acme', name: 'Acme Dental', type: 'clinic' }

describe('getClinicSiteBySlug — draft overlay', () => {
  function queueSite(profile: Record<string, unknown>) {
    selectQueue.push([org], [profile], []) // org → profile → locations
  }

  it('a verified editor sees the merged draft', async () => {
    canEdit = true
    queueSite({ organizationId: 'org_1', tagline: 'Live', websiteDraft: { tagline: 'Draft' } })
    const data = await getClinicSiteBySlug('acme')
    expect(data?.profile.tagline).toBe('Draft')
  })

  it('a visitor always sees published values, even with a draft pending', async () => {
    canEdit = false
    queueSite({ organizationId: 'org_1', tagline: 'Live', websiteDraft: { tagline: 'Draft' } })
    const data = await getClinicSiteBySlug('acme')
    expect(data?.profile.tagline).toBe('Live')
    expect(canEditCalls).toBe(1) // checked, denied
  })

  it('no draft → the session lookup is never made', async () => {
    queueSite({ organizationId: 'org_1', tagline: 'Live', websiteDraft: null })
    const data = await getClinicSiteBySlug('acme')
    expect(data?.profile.tagline).toBe('Live')
    expect(canEditCalls).toBe(0)
  })
})

describe('getClinicThemeBySlug — brand/template overlay + banner flag', () => {
  it('overlays staged brand + template for the editor and flags hasEditorDraft', async () => {
    canEdit = true
    selectQueue.push([
      {
        id: 'org_1',
        type: 'clinic',
        brand: '#111111',
        template: 'modern',
        websiteDraft: { brandColor: '#22C55E', template: 'pediatric' },
      },
    ])
    const theme = await getClinicThemeBySlug(`acme-${Math.random()}`)
    expect(theme).toEqual({
      orgId: 'org_1',
      brand: '#22C55E',
      template: 'pediatric',
      hasEditorDraft: true,
    })
  })

  it('visitors keep the stored brand/template and no banner flag', async () => {
    canEdit = false
    selectQueue.push([
      {
        id: 'org_1',
        type: 'clinic',
        brand: '#111111',
        template: 'modern',
        websiteDraft: { brandColor: '#22C55E' },
      },
    ])
    const theme = await getClinicThemeBySlug(`acme-${Math.random()}`)
    expect(theme).toEqual({
      orgId: 'org_1',
      brand: '#111111',
      template: 'modern',
      hasEditorDraft: false,
    })
  })

  it('a draft without brand/template still flags the banner but changes no theme', async () => {
    canEdit = true
    selectQueue.push([
      { id: 'org_1', type: 'clinic', brand: '#111111', template: 'modern', websiteDraft: { about: 'x' } },
    ])
    const theme = await getClinicThemeBySlug(`acme-${Math.random()}`)
    expect(theme.brand).toBe('#111111')
    expect(theme.template).toBe('modern')
    expect(theme.hasEditorDraft).toBe(true)
  })
})
