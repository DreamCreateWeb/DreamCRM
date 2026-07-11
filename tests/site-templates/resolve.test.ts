import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * resolveActiveSiteTemplate — the preview-cookie override must be inert for
 * anyone who can't edit the clinic, for slug mismatches, and for junk ids;
 * the stored template must always resolve through the registry fallback.
 */
let cookieValue: string | null = null
let themeRow: { orgId: string | null; brand: string | null; template: string | null } = {
  orgId: 'org_1',
  brand: '#1D4ED8',
  template: 'modern',
}
const canEdit = vi.fn(async (_orgId: string) => false)

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'dc-template-preview' && cookieValue != null ? { name, value: cookieValue } : undefined,
  }),
}))
vi.mock('@/lib/services/clinic-site', () => ({
  getClinicThemeBySlug: async () => themeRow,
}))
vi.mock('@/lib/clinic-site-edit', () => ({
  canEditClinic: (orgId: string) => canEdit(orgId),
}))

import { resolveActiveSiteTemplate, TEMPLATE_PREVIEW_COOKIE } from '@/lib/site-templates/resolve'

beforeEach(() => {
  cookieValue = null
  themeRow = { orgId: 'org_1', brand: '#1D4ED8', template: 'modern' }
  canEdit.mockReset()
  canEdit.mockResolvedValue(false)
})

describe('resolveActiveSiteTemplate', () => {
  it('exports the cookie name the preview route sets', () => {
    expect(TEMPLATE_PREVIEW_COOKIE).toBe('dc-template-preview')
  })

  it('returns the stored template with no cookie present', async () => {
    const r = await resolveActiveSiteTemplate('clinic-a')
    expect(r.def.id).toBe('modern')
    expect(r.isPreview).toBe(false)
  })

  it('falls back to modern for a junk stored value', async () => {
    themeRow.template = 'retired-experiment'
    const r = await resolveActiveSiteTemplate('clinic-b')
    expect(r.def.id).toBe('modern')
    expect(r.storedId).toBe('modern')
  })

  it('ignores the preview cookie when the viewer cannot edit the clinic', async () => {
    cookieValue = 'clinic-c:modern'
    canEdit.mockResolvedValue(false)
    const r = await resolveActiveSiteTemplate('clinic-c')
    expect(r.isPreview).toBe(false)
  })

  it('ignores a cookie scoped to a different slug (editors of clinic A cannot preview on clinic B)', async () => {
    cookieValue = 'other-clinic:modern'
    canEdit.mockResolvedValue(true)
    const r = await resolveActiveSiteTemplate('clinic-d')
    expect(r.isPreview).toBe(false)
  })

  it('ignores a cookie carrying an unregistered template id', async () => {
    cookieValue = 'clinic-e:not-a-template'
    canEdit.mockResolvedValue(true)
    const r = await resolveActiveSiteTemplate('clinic-e')
    expect(r.isPreview).toBe(false)
    expect(r.def.id).toBe('modern')
  })

  it('honors a valid preview for a verified editor (stored modern, preview cosmetic)', async () => {
    cookieValue = 'clinic-p:cosmetic'
    canEdit.mockResolvedValue(true)
    const r = await resolveActiveSiteTemplate('clinic-p')
    expect(r.isPreview).toBe(true)
    expect(r.def.id).toBe('cosmetic')
    expect(r.storedId).toBe('modern')
  })

  it('previewing the already-stored template is not a preview', async () => {
    cookieValue = 'clinic-f:modern'
    canEdit.mockResolvedValue(true)
    const r = await resolveActiveSiteTemplate('clinic-f')
    expect(r.isPreview).toBe(false)
  })

  it('never consults the cookie for a non-clinic slug', async () => {
    themeRow = { orgId: null, brand: null, template: null }
    cookieValue = 'clinic-g:modern'
    canEdit.mockResolvedValue(true)
    const r = await resolveActiveSiteTemplate('clinic-g')
    expect(r.isPreview).toBe(false)
    expect(canEdit).not.toHaveBeenCalled()
  })
})
