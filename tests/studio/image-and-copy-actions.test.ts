import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Studio image + copy-override server actions. These read the current jsonb map
 * (imagePositions / copyOverrides) then write a merged patch — the existing
 * website-actions test only mocks db.update, so the read-modify-write paths
 * (focal-point set/clear, copy-key set/clear) were untested. The behaviors that
 * matter for the editor: clearing an image also clears its stored focal point;
 * blanking a copy override deletes the key (so the template falls back); and the
 * whitelists reject anything off-list.
 */

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  role: 'owner' | 'admin' | 'member' | 'patient'
  organizationId: string
  organizationSlug: string
} | null = null

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// `selectRow` is what the action's read returns; `ops` records every write.
let selectRow: Record<string, unknown> | undefined
const ops: Array<{ table: string; set: Record<string, unknown> }> = []

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { organization } = await import('@/lib/db/schema/auth')
  const name = (t: unknown) =>
    t === clinicProfile ? 'clinic_profile' : t === organization ? 'organization' : 'unknown'
  return {
    db: {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => (selectRow ? [selectRow] : []) }) }),
      }),
      update: (table: unknown) => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            ops.push({ table: name(table), set: v })
          },
        }),
      }),
    },
  }
})

import {
  saveImageField,
  saveInlineField,
  saveDifferenceVideo,
} from '@/app/(default)/website/website-actions'

beforeEach(() => {
  ops.length = 0
  selectRow = { imagePositions: null, copyOverrides: null }
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
  }
})

const profileSet = () => ops.find((o) => o.table === 'clinic_profile')!.set

describe('saveDifferenceVideo — URL-validated single column', () => {
  it('rejects a malformed URL without writing', async () => {
    const res = await saveDifferenceVideo('not a url')
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/valid video/i) })
    expect(ops).toHaveLength(0)
  })

  it('rejects a dangerous scheme', async () => {
    const res = await saveDifferenceVideo('javascript:alert(1)')
    expect(res).toMatchObject({ ok: false })
    expect(ops).toHaveLength(0)
  })

  it('stores a valid https URL', async () => {
    const res = await saveDifferenceVideo('https://cdn.x/clip.mp4')
    expect(res).toEqual({ ok: true })
    expect(profileSet().differenceVideoUrl).toBe('https://cdn.x/clip.mp4')
  })

  it('stores an uploaded /-rooted path', async () => {
    const res = await saveDifferenceVideo('/uploads/clinic-video/a.mp4')
    expect(res).toEqual({ ok: true })
    expect(profileSet().differenceVideoUrl).toBe('/uploads/clinic-video/a.mp4')
  })

  it('clears the field on empty (falls back to a photo)', async () => {
    const res = await saveDifferenceVideo('')
    expect(res).toEqual({ ok: true })
    expect(profileSet().differenceVideoUrl).toBeNull()
  })

  it('still gates non-clinic tenants', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'p', organizationSlug: 'd' }
    const res = await saveDifferenceVideo('https://cdn.x/clip.mp4')
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/clinic/i) })
    expect(ops).toHaveLength(0)
  })
})

describe('saveInlineField — differenceVideoUrl no longer inline-editable', () => {
  it('rejects differenceVideoUrl on the inline path (it has its own action now)', async () => {
    const res = await saveInlineField('differenceVideoUrl', 'https://cdn.x/clip.mp4')
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be edited inline/i) })
    expect(ops).toHaveLength(0)
  })
})

describe('saveImageField — gate + whitelist', () => {
  it('rejects a field not on the image whitelist', async () => {
    const res = await saveImageField('aboutImage', 'https://x/a.png', null)
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be edited/i) })
    expect(ops).toHaveLength(0)
  })

  it('blocks non-owner/admin roles', async () => {
    tenantCtx!.role = 'member'
    const res = await saveImageField('heroImageUrl', 'https://x/a.png', '60% 40%')
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/owner|admin/i) })
    expect(ops).toHaveLength(0)
  })
})

describe('saveImageField — focal point set / clear', () => {
  it('stores a non-centred focal point alongside the image URL', async () => {
    const res = await saveImageField('heroImageUrl', 'https://x/hero.png', '60% 30%')
    expect(res).toEqual({ ok: true })
    const set = profileSet()
    expect(set.heroImageUrl).toBe('https://x/hero.png')
    expect(set.imagePositions).toEqual({ heroImageUrl: '60% 30%' })
  })

  it('does NOT store a dead-centre (50% 50%) focal point', async () => {
    await saveImageField('heroImageUrl', 'https://x/hero.png', '50% 50%')
    const set = profileSet()
    expect(set.heroImageUrl).toBe('https://x/hero.png')
    // No focal point worth storing → the whole map collapses to null.
    expect(set.imagePositions).toBeNull()
  })

  it('clearing the image also clears that image’s focal point key', async () => {
    // Start with an existing position for this field + another field.
    selectRow = { imagePositions: { heroImageUrl: '60% 30%', heroImageUrl2: '20% 80%' } }
    const res = await saveImageField('heroImageUrl', '', '60% 30%')
    expect(res).toEqual({ ok: true })
    const set = profileSet()
    expect(set.heroImageUrl).toBeNull()
    // heroImageUrl's key is gone; the unrelated field's key survives.
    expect(set.imagePositions).toEqual({ heroImageUrl2: '20% 80%' })
  })

  it('removing the only positioned image nulls the whole positions map', async () => {
    selectRow = { imagePositions: { heroImageUrl: '60% 30%' } }
    await saveImageField('heroImageUrl', '', '60% 30%')
    expect(profileSet().imagePositions).toBeNull()
  })

  it('preserves other fields’ focal points when setting a new one', async () => {
    selectRow = { imagePositions: { heroImageUrl2: '20% 80%' } }
    await saveImageField('heroImageUrl', 'https://x/hero.png', '10% 10%')
    expect(profileSet().imagePositions).toEqual({
      heroImageUrl2: '20% 80%',
      heroImageUrl: '10% 10%',
    })
  })
})

describe('saveInlineField — copy override map', () => {
  it('sets a copy override key from copy:<key>', async () => {
    selectRow = { copyOverrides: null }
    const res = await saveInlineField('copy:home.contactTitle', '  Come on in  ')
    expect(res).toEqual({ ok: true })
    expect(profileSet().copyOverrides).toEqual({ 'home.contactTitle': 'Come on in' })
  })

  it('merges into existing overrides without dropping other keys', async () => {
    selectRow = { copyOverrides: { 'home.blogTitle': 'Latest' } }
    await saveInlineField('copy:home.contactTitle', 'Come on in')
    expect(profileSet().copyOverrides).toEqual({
      'home.blogTitle': 'Latest',
      'home.contactTitle': 'Come on in',
    })
  })

  it('blanking a copy override deletes its key (template falls back to default)', async () => {
    selectRow = { copyOverrides: { 'home.contactTitle': 'Come on in', 'home.blogTitle': 'Latest' } }
    await saveInlineField('copy:home.contactTitle', '   ')
    expect(profileSet().copyOverrides).toEqual({ 'home.blogTitle': 'Latest' })
  })

  it('nulls the whole map when the last override is cleared', async () => {
    selectRow = { copyOverrides: { 'home.contactTitle': 'Come on in' } }
    await saveInlineField('copy:home.contactTitle', '')
    expect(profileSet().copyOverrides).toBeNull()
  })

  it('rejects an empty copy key (copy:)', async () => {
    const res = await saveInlineField('copy:', 'x')
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/invalid copy key/i) })
    expect(ops).toHaveLength(0)
  })

  it('still gates non-clinic tenants on the copy path', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'p', organizationSlug: 'd' }
    const res = await saveInlineField('copy:home.contactTitle', 'x')
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/clinic/i) })
    expect(ops).toHaveLength(0)
  })
})
