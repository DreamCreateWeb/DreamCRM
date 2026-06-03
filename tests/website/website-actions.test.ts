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
  saveAbout,
  saveStats,
  saveFaq,
  saveHours,
  savePaymentFinancing,
  saveInsurance,
} from '@/app/(default)/website/website-actions'

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
