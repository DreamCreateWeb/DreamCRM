import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * resolveActiveSiteTemplate — gallery-frame forcing via the middleware-set
 * request header. Precedence: frame header (editor-only) > preview cookie >
 * stored. A forged header is inert for visitors; a frame render reports
 * isFrame so the layout suppresses beacon/chat/banners/EditBridge.
 */

let canEdit = false
vi.mock('@/lib/clinic-site-edit', () => ({
  canEditClinic: vi.fn(async () => canEdit),
}))

let theme: { orgId: string | null; brand: string | null; template: string | null; hasEditorDraft: boolean }
vi.mock('@/lib/services/clinic-site', () => ({
  getClinicThemeBySlug: vi.fn(async () => theme),
}))

let frameHeader: string | null = null
let previewCookie: string | null = null
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'x-dc-template-frame' ? frameHeader : null),
  }),
  cookies: async () => ({
    get: (name: string) =>
      name === 'dc-template-preview' && previewCookie ? { value: previewCookie } : undefined,
  }),
}))

import { resolveActiveSiteTemplate } from '@/lib/site-templates/resolve'

beforeEach(() => {
  canEdit = false
  frameHeader = null
  previewCookie = null
  theme = { orgId: 'org_1', brand: null, template: 'modern', hasEditorDraft: false }
})

// resolveActiveSiteTemplate is React cache()'d per slug — unique slugs per
// call keep assertions independent.
let n = 0
const slug = () => `acme-${++n}`

describe('resolveActiveSiteTemplate — frame header', () => {
  it('forces the frame template for a verified editor and reports isFrame', async () => {
    canEdit = true
    frameHeader = 'pediatric'
    const res = await resolveActiveSiteTemplate(slug())
    expect(res.def.id).toBe('pediatric')
    expect(res.storedId).toBe('modern')
    expect(res.isFrame).toBe(true)
    expect(res.isPreview).toBe(false)
  })

  it('is inert for a visitor (forged header changes nothing)', async () => {
    canEdit = false
    frameHeader = 'pediatric'
    const res = await resolveActiveSiteTemplate(slug())
    expect(res.def.id).toBe('modern')
    expect(res.isFrame).toBe(false)
  })

  it('ignores an unknown template id', async () => {
    canEdit = true
    frameHeader = 'not-a-template'
    const res = await resolveActiveSiteTemplate(slug())
    expect(res.def.id).toBe('modern')
    expect(res.isFrame).toBe(false)
  })

  it('beats the preview cookie (each card renders ITS template)', async () => {
    canEdit = true
    frameHeader = 'cosmetic'
    const s = slug()
    previewCookie = `${s}:pediatric`
    const res = await resolveActiveSiteTemplate(s)
    expect(res.def.id).toBe('cosmetic')
    expect(res.isFrame).toBe(true)
  })

  it('without a frame header the preview cookie still works as before', async () => {
    canEdit = true
    const s = slug()
    previewCookie = `${s}:pediatric`
    const res = await resolveActiveSiteTemplate(s)
    expect(res.def.id).toBe('pediatric')
    expect(res.isPreview).toBe(true)
    expect(res.isFrame).toBe(false)
  })
})
