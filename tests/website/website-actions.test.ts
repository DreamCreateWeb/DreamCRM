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

const cookieDeletes: string[] = []
vi.mock('next/headers', () => ({
  cookies: async () => ({ delete: (name: string) => cookieDeletes.push(name) }),
}))

const ops: Array<{ table: string; set: Record<string, unknown> }> = []

vi.mock('@/lib/db', async () => {
  const { clinicProfile } = await import('@/lib/db/schema/platform')
  const { organization } = await import('@/lib/db/schema/auth')
  const name = (t: unknown) =>
    t === clinicProfile ? 'clinic_profile' : t === organization ? 'organization' : 'unknown'
  return {
    db: {
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
  saveHero,
  saveTemplate,
  saveAbout,
  saveStats,
  saveFaq,
  saveHours,
  saveContact,
  savePaymentFinancing,
  saveInsurance,
  saveInlineField,
} from '@/app/(default)/website/website-actions'

beforeEach(() => {
  ops.length = 0
  cookieDeletes.length = 0
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

/** Keys a section wrote, excluding the always-present updatedAt bookkeeping. */
function setKeys(table = 'clinic_profile') {
  const op = ops.find((o) => o.table === table)!
  return Object.keys(op.set).filter((k) => k !== 'updatedAt').sort()
}

describe('website section actions — gating', () => {
  it('rejects non-clinic tenants with ok:false', async () => {
    tenantCtx = { tenantType: 'platform', role: 'owner', organizationId: 'p', organizationSlug: 'd' }
    const res = await saveAbout(form({ about: 'x' }))
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/clinic/i) })
    expect(ops).toHaveLength(0)
  })

  it('rejects member role with ok:false', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    const res = await saveAbout(form({ about: 'x' }))
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/owner|admin/i) })
    expect(ops).toHaveLength(0)
  })
})

describe('website section actions — section isolation', () => {
  it('saveHero writes ONLY name fields (+ syncs org name)', async () => {
    const res = await saveHero(form({ displayName: '  Acme Dental  ', legalName: 'Acme LLC', tagline: 'Smiles' }))
    expect(res).toEqual({ ok: true })
    expect(setKeys('clinic_profile')).toEqual(['displayName', 'legalName', 'tagline'])
    const profileSet = ops.find((o) => o.table === 'clinic_profile')!.set
    expect(profileSet.displayName).toBe('Acme Dental') // trimmed
    // org name sync
    const orgOp = ops.find((o) => o.table === 'organization')!
    expect(orgOp.set.name).toBe('Acme Dental')
  })

  it('saveAbout writes ONLY about', async () => {
    await saveAbout(form({ about: 'We are warm.', displayName: 'IGNORED', stats: 'IGNORED' }))
    expect(setKeys()).toEqual(['about'])
  })

  it('saveStats writes ONLY stats', async () => {
    await saveStats(form({ stats: JSON.stringify([{ value: '8000', label: 'reviews' }]) }))
    expect(setKeys()).toEqual(['stats'])
  })

  it('saveInsurance writes ONLY acceptedInsuranceCarriers', async () => {
    await saveInsurance(form({ acceptedInsuranceCarriers: 'Aetna\nCigna' }))
    expect(setKeys()).toEqual(['acceptedInsuranceCarriers'])
    const set = ops.find((o) => o.table === 'clinic_profile')!.set
    expect(set.acceptedInsuranceCarriers).toEqual(['Aetna', 'Cigna'])
  })

  it('savePaymentFinancing writes its three fields only', async () => {
    await savePaymentFinancing(
      form({
        paymentMethods: 'Cash\nCards',
        financingPartners: JSON.stringify([{ name: 'CareCredit' }]),
        cancellationPolicy: '24 hours please',
      }),
    )
    expect(setKeys()).toEqual(['cancellationPolicy', 'financingPartners', 'paymentMethods'])
  })
})

describe('website section actions — FAQ + hours', () => {
  it('saveFaq parses + writes only faq', async () => {
    await saveFaq(
      form({ faq: JSON.stringify([{ category: 'Insurance', question: 'Q', answer: 'A' }]) }),
    )
    expect(setKeys()).toEqual(['faq'])
    const set = ops.find((o) => o.table === 'clinic_profile')!.set
    expect((set.faq as unknown[])).toHaveLength(1)
  })

  it('saveHours persists a valid map', async () => {
    const fd = form({})
    fd.set('hours[mon].open', '09:00')
    fd.set('hours[mon].close', '17:00')
    const res = await saveHours(fd)
    expect(res).toEqual({ ok: true })
    const set = ops.find((o) => o.table === 'clinic_profile')!.set
    expect((set.hours as Record<string, { open: string }>).mon.open).toBe('09:00')
  })

  it('saveHours returns ok:false (not throw) on a bad time', async () => {
    const fd = form({})
    fd.set('hours[mon].open', '9am')
    const res = await saveHours(fd)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/invalid open time/i)
    expect(ops).toHaveLength(0)
  })
})

describe('Google-sync source flags flip to manual on edit', () => {
  it('saveHours flags hoursSource manual (so an auto Google sync respects the edit)', async () => {
    const fd = form({})
    fd.set('hours[mon].open', '09:00')
    fd.set('hours[mon].close', '17:00')
    await saveHours(fd)
    const set = ops.find((o) => o.table === 'clinic_profile')!.set
    expect(set.hoursSource).toBe('manual')
  })

  it('saveContact flags addressSource + phoneSource manual', async () => {
    await saveContact(form({ phone: '555-0100', addressLine1: '1 Main St', city: 'Austin' }))
    const set = ops.find((o) => o.table === 'clinic_profile')!.set
    expect(set.addressSource).toBe('manual')
    expect(set.phoneSource).toBe('manual')
  })

  it('inline phone edit flags phoneSource manual', async () => {
    await saveInlineField('phone', '(512) 555-0100')
    const set = ops.find((o) => o.table === 'clinic_profile')!.set
    expect(set.phone).toBe('(512) 555-0100')
    expect(set.phoneSource).toBe('manual')
  })

  it('inline tagline edit does NOT touch any source flag', async () => {
    await saveInlineField('tagline', 'Gentle care')
    const set = ops.find((o) => o.table === 'clinic_profile')!.set
    expect(set.phoneSource).toBeUndefined()
    expect(set.hoursSource).toBeUndefined()
    expect(set.addressSource).toBeUndefined()
  })
})

describe('saveInlineField (Website Studio click-to-edit)', () => {
  it('rejects a field that is not on the inline whitelist', async () => {
    const res = await saveInlineField('services', '[]')
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/cannot be edited inline/i) })
    expect(ops).toHaveLength(0)
  })

  it('blocks non-owner roles', async () => {
    tenantCtx!.role = 'member'
    const res = await saveInlineField('tagline', 'Hi')
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/owner|admin/i) })
  })

  it('writes ONLY the named column (tagline), trimmed', async () => {
    const res = await saveInlineField('tagline', '  Gentle care  ')
    expect(res).toEqual({ ok: true })
    expect(setKeys('clinic_profile')).toEqual(['tagline'])
    expect(ops.find((o) => o.table === 'clinic_profile')!.set.tagline).toBe('Gentle care')
  })

  it('persists null when the value is blank (falls back to the site default)', async () => {
    await saveInlineField('about', '   ')
    expect(ops.find((o) => o.table === 'clinic_profile')!.set.about).toBeNull()
  })

  it('syncs organization.name when displayName is edited', async () => {
    await saveInlineField('displayName', 'Bright Smiles')
    const orgOp = ops.find((o) => o.table === 'organization')!
    expect(orgOp.set.name).toBe('Bright Smiles')
  })

  it('accepts image-url fields (logoUrl / heroImageUrl)', async () => {
    const res = await saveInlineField('logoUrl', 'https://x/logo.png')
    expect(res).toEqual({ ok: true })
    expect(setKeys('clinic_profile')).toEqual(['logoUrl'])
  })
})


describe('saveTemplate (Design picker apply)', () => {
  it('writes the template column and clears the preview cookie', async () => {
    const res = await saveTemplate('modern')
    expect(res).toEqual({ ok: true })
    expect(setKeys()).toEqual(['template'])
    expect(ops[0].set.template).toBe('modern')
    expect(cookieDeletes).toContain('dc-template-preview')
  })

  it('rejects an unregistered template id without writing', async () => {
    const res = await saveTemplate('not-a-design')
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/unknown/i) })
    expect(ops).toHaveLength(0)
  })

  it('rejects members (owner/admin only)', async () => {
    tenantCtx = { tenantType: 'clinic', role: 'member', organizationId: 'org_1', organizationSlug: 'acme' }
    const res = await saveTemplate('modern')
    expect(res.ok).toBe(false)
    expect(ops).toHaveLength(0)
  })
})
