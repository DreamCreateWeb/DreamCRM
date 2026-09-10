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

// `revalidateTag` too: the clinic-site cache boundary invalidates a tag on
// every writer this file exercises, and its catch deliberately only
// swallows "no request scope". An absent export therefore surfaces as a
// failed save rather than a silently skipped invalidation — which is the
// whole point of that narrowing.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

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
import { revalidateTag } from 'next/cache'
import { clinicSiteTag, clinicSiteSlugTag } from '@/lib/services/clinic-site-cache'

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

  it('writes clinic_profile row with sanitized identity fields', async () => {
    await updateClinicProfile(
      form({
        displayName: '  Test Dental  ',
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

  it('persists logoUrl (the one shared image this form still owns)', async () => {
    await updateClinicProfile(form({ displayName: 'X', logoUrl: 'https://blob/logo.png' }))
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: { logoUrl: string } }).set
    expect(set.logoUrl).toBe('https://blob/logo.png')
  })

  it('IDENTITY ONLY: a save never touches (or nulls) any website-content column', async () => {
    // The website columns live in the Website workspace with per-section
    // scoped saves. This action writes whatever is in its payload — so a
    // website column here would be NULLED by every identity save that
    // doesn't round-trip it. The exclusion is the load-bearing contract.
    await updateClinicProfile(
      form({
        displayName: 'X',
        // A hostile/stale client submitting website fields must be IGNORED:
        tagline: 'stale tagline',
        about: 'stale about',
        brandColor: '#123456',
        template: 'cosmetic',
        heroImageUrl: 'https://blob/hero.jpg',
        differenceVideoUrl: 'https://blob/v.mp4',
        services: JSON.stringify([{ id: 'a', name: 'Cleanings' }]),
        staff: JSON.stringify([{ id: 'a', name: 'Dr. Smith' }]),
        stats: JSON.stringify([{ id: 's1', value: '8,000+', label: 'reviews' }]),
        officePhotos: JSON.stringify([{ id: 'op1', url: 'https://blob/op1.jpg' }]),
        faq: JSON.stringify([{ id: 'f1', question: 'Q', answer: 'A' }]),
        acceptedInsuranceCarriers: 'Aetna',
        paymentMethods: 'Cash',
        financingPartners: JSON.stringify([{ name: 'CareCredit' }]),
        cancellationPolicy: '24 hours',
        testimonials: JSON.stringify([{ id: 't1', quote: 'Great.', authorName: 'S.' }]),
      }),
    )
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as { set: Record<string, unknown> }).set
    for (const col of [
      'tagline',
      'about',
      'brandColor',
      'template',
      'heroImageUrl',
      'heroImageUrl2',
      'differenceVideoUrl',
      'services',
      'staff',
      'stats',
      'officePhotos',
      'faq',
      'acceptedInsuranceCarriers',
      'paymentMethods',
      'financingPartners',
      'cancellationPolicy',
      'testimonials',
      'copyOverrides',
      'leadForms',
      'coloringPages',
      'imagePositions',
    ]) {
      expect(col in set, `website column '${col}' must not be in the identity payload`).toBe(false)
    }
    // The identity fields it DOES own are present.
    for (const col of ['displayName', 'phone', 'email', 'logoUrl', 'hours', 'timezone']) {
      expect(col in set, `identity column '${col}' missing from the payload`).toBe(true)
    }
  })

  /**
   * THE WRITER ACTUALLY CALLS IT, WITH THE RIGHT TAG AND THE RIGHT PROFILE.
   *
   * The mock above was added because `revalidateTag` being absent made the
   * save throw — which proved only that the export exists. That is a weaker
   * claim than it looks: a writer that never invalidated at all would pass it
   * just as happily, and the whole "Publish takes effect immediately" promise
   * rests on this call being made with these arguments.
   *
   * `{ expire: 0 }` is load-bearing, not decoration. Next 16's `revalidateTag`
   * takes a cache-life profile, and only an immediate expiry sets
   * `pathWasRevalidated` to `ActionDidRevalidateStaticAndDynamic` — the
   * read-your-own-writes flag. Drop the argument and Next warns and
   * deprecates; pass a non-zero profile and the entry goes
   * stale-while-revalidate instead, so the clinic's next page load can still
   * serve the old copy. Both tags, because the site payload is keyed on orgId
   * and the theme on slug.
   */
  it('drops BOTH cache tags with an immediate-expiry profile', async () => {
    vi.mocked(revalidateTag).mockClear()
    await updateClinicProfile(form({ displayName: 'Acme Dental' }))

    expect(revalidateTag).toHaveBeenCalledWith(clinicSiteTag('org_1'), { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith(clinicSiteSlugTag('acme'), { expire: 0 })
  })

  it('flags hours/address/phone source as manual (so a later Google sync respects the edit)', async () => {
    await updateClinicProfile(form({ displayName: 'X', phone: '555', city: 'Austin' }))
    const insertOp = ops.find((o) => o.kind === 'insert' && o.table === 'clinic_profile')!
    const set = (insertOp.values as {
      set: { hoursSource: string; addressSource: string; phoneSource: string }
    }).set
    expect(set.hoursSource).toBe('manual')
    expect(set.addressSource).toBe('manual')
    expect(set.phoneSource).toBe('manual')
  })
})
