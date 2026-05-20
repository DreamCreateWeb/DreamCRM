import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const ops: Array<{ kind: 'insert' | 'update'; table: string; values: unknown }> = []

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { organization } = await import('@/lib/db/schema/auth')
  const name = (t: unknown) =>
    t === clinicProfile ? 'clinic_profile' : t === organization ? 'organization' : 'unknown'
  return {
    db: {
      insert: (table: unknown) => ({
        values: (v: unknown) => ({
          onConflictDoUpdate: async ({ set }: { set: unknown }) => {
            ops.push({ kind: 'insert', table: name(table), values: { values: v, set } })
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (v: unknown) => ({
          where: async () => {
            ops.push({ kind: 'update', table: name(table), values: v })
          },
        }),
      }),
    },
  }
})

import { updateClinicProfile } from '@/app/(default)/settings/clinic/actions'

beforeEach(() => {
  ops.length = 0
  tenantCtx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
  }
})

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('updateClinicProfile', () => {
  it('rejects when tenant is not a clinic', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'org_p', organizationSlug: 'dream' }
    await expect(updateClinicProfile(form({ displayName: 'X' }))).rejects.toThrow(/clinic/i)
  })

  it('rejects when role is member', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    await expect(updateClinicProfile(form({ displayName: 'X' }))).rejects.toThrow(/owner|admin/i)
  })

  it('writes clinic_profile row with sanitized fields', async () => {
    await updateClinicProfile(
      form({
        displayName: '  Test Dental  ',
        tagline: 'Caring smiles',
        phone: '555',
        email: 'hi@x.com',
        city: 'Austin',
        state: 'TX',
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    expect(insertOp).toBeDefined()
    const set = (insertOp.values as { set: Record<string, unknown> }).set
    expect(set.displayName).toBe('Test Dental') // trimmed
    expect(set.tagline).toBe('Caring smiles')
    expect(set.country).toBe('US') // default
  })

  it('updates organization.name when displayName provided', async () => {
    await updateClinicProfile(form({ displayName: 'Acme Dental' }))
    const orgUpdate = ops.find((o) => o.kind === 'update' && o.table === 'organization')
    expect(orgUpdate).toBeDefined()
    expect((orgUpdate!.values as { name: string }).name).toBe('Acme Dental')
  })

  it('persists hours map when provided', async () => {
    const fd = form({ displayName: 'X' })
    fd.set('hours[mon].open', '09:00')
    fd.set('hours[mon].close', '17:00')
    fd.set('hours[sun].closed', 'on')
    await updateClinicProfile(fd)
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as {
      set: { hours: Record<string, { open?: string; close?: string; closed?: boolean }> }
    }).set
    expect(set.hours.mon.open).toBe('09:00')
    expect(set.hours.mon.close).toBe('17:00')
    expect(set.hours.sun.closed).toBe(true)
  })

  it('rejects invalid hour formats', async () => {
    const fd = form({ displayName: 'X' })
    fd.set('hours[mon].open', '9am')
    await expect(updateClinicProfile(fd)).rejects.toThrow(/Invalid open time/i)
  })

  it('stores null hours when no day was edited', async () => {
    await updateClinicProfile(form({ displayName: 'X' }))
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { hours: unknown } }).set
    expect(set.hours).toBeNull()
  })

  it('marks "closed" without requiring time fields', async () => {
    const fd = form({ displayName: 'X' })
    fd.set('hours[sat].closed', 'on')
    await updateClinicProfile(fd)
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { hours: Record<string, { closed?: boolean }> } }).set
    expect(set.hours.sat.closed).toBe(true)
  })

  it('persists logoUrl and heroImageUrl', async () => {
    await updateClinicProfile(
      form({
        displayName: 'X',
        logoUrl: 'https://blob/logo.png',
        heroImageUrl: 'https://blob/hero.jpg',
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { logoUrl: string; heroImageUrl: string } }).set
    expect(set.logoUrl).toBe('https://blob/logo.png')
    expect(set.heroImageUrl).toBe('https://blob/hero.jpg')
  })

  it('parses services JSON, drops items with missing name', async () => {
    await updateClinicProfile(
      form({
        displayName: 'X',
        services: JSON.stringify([
          { id: 'a', name: 'Cleanings', icon: '🦷' },
          { id: 'b', name: '', icon: '?' }, // dropped
          { id: 'c', name: 'Whitening', description: 'Brighter' },
        ]),
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { services: Array<{ name: string }> } }).set
    expect(set.services).toHaveLength(2)
    expect(set.services.map((s) => s.name)).toEqual(['Cleanings', 'Whitening'])
  })

  it('stores null services for empty array', async () => {
    await updateClinicProfile(form({ displayName: 'X', services: '[]' }))
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { services: unknown } }).set
    expect(set.services).toBeNull()
  })

  it('stores null services for malformed JSON', async () => {
    await updateClinicProfile(form({ displayName: 'X', services: 'not json' }))
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { services: unknown } }).set
    expect(set.services).toBeNull()
  })

  it('parses staff JSON with optional fields', async () => {
    await updateClinicProfile(
      form({
        displayName: 'X',
        staff: JSON.stringify([
          { id: 'a', name: 'Dr. Smith', title: 'Dentist', bio: '15 yrs', photoUrl: 'p1.jpg' },
          { id: 'b', name: '  ', title: 'Skipped' }, // dropped (empty name)
          { id: 'c', name: 'Dr. Lee' },
        ]),
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as {
      set: { staff: Array<{ name: string; photoUrl: string | null }> }
    }).set
    expect(set.staff).toHaveLength(2)
    expect(set.staff[0].name).toBe('Dr. Smith')
    expect(set.staff[0].photoUrl).toBe('p1.jpg')
    expect(set.staff[1].name).toBe('Dr. Lee')
  })

  it('parses stats JSON, drops fully-empty rows', async () => {
    await updateClinicProfile(
      form({
        displayName: 'X',
        stats: JSON.stringify([
          { id: 's1', value: '8,000+', label: 'reviews' },
          { id: 's2', value: '', label: '' }, // dropped
          { id: 's3', value: 'Same-week', label: 'appointments' },
        ]),
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { stats: Array<{ value: string }> } }).set
    expect(set.stats).toHaveLength(2)
    expect(set.stats.map((s) => s.value)).toEqual(['8,000+', 'Same-week'])
  })

  it('parses testimonials JSON, requires both quote + authorName', async () => {
    await updateClinicProfile(
      form({
        displayName: 'X',
        testimonials: JSON.stringify([
          {
            id: 't1',
            quote: 'Great visit.',
            authorName: 'Sarah K.',
            authorLocation: 'Austin, TX',
          },
          { id: 't2', quote: 'No name', authorName: '' }, // dropped (no author)
          { id: 't3', quote: '', authorName: 'No quote' }, // dropped (no quote)
          { id: 't4', quote: 'Loved it.', authorName: 'Marcus T.' },
        ]),
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as {
      set: {
        testimonials: Array<{
          quote: string
          authorName: string
          authorLocation: string | null
        }>
      }
    }).set
    expect(set.testimonials).toHaveLength(2)
    expect(set.testimonials[0].quote).toBe('Great visit.')
    expect(set.testimonials[0].authorLocation).toBe('Austin, TX')
    expect(set.testimonials[1].authorName).toBe('Marcus T.')
  })

  it('parses office photos JSON, requires url', async () => {
    await updateClinicProfile(
      form({
        displayName: 'X',
        officePhotos: JSON.stringify([
          { id: 'op1', url: 'https://blob/op1.jpg', alt: 'Reception', caption: 'Front desk' },
          { id: 'op2', url: '', alt: 'No url' }, // dropped
          { id: 'op3', url: 'https://blob/op2.jpg' },
        ]),
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as {
      set: { officePhotos: Array<{ url: string; alt: string | null; caption: string | null }> }
    }).set
    expect(set.officePhotos).toHaveLength(2)
    expect(set.officePhotos[0].url).toBe('https://blob/op1.jpg')
    expect(set.officePhotos[0].caption).toBe('Front desk')
  })

  it('stores null for the new content fields when not provided', async () => {
    await updateClinicProfile(form({ displayName: 'X' }))
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as {
      set: { stats: unknown; testimonials: unknown; officePhotos: unknown }
    }).set
    expect(set.stats).toBeNull()
    expect(set.testimonials).toBeNull()
    expect(set.officePhotos).toBeNull()
  })
})
