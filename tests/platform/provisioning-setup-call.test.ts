import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.dreamcreatestudio.com'
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    txCalls: { n: 0 },
    sendInvite: vi.fn(async () => undefined),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email', () => ({ sendInvitationEmail: h.sendInvite }))
vi.mock('@/lib/services/forms', () => ({ seedDefaultIntakeForm: vi.fn(async () => undefined) }))
vi.mock('@/lib/onboarding/defaults', () => ({ seedClinicDay0Defaults: vi.fn(async () => undefined) }))
vi.mock('@/lib/services/starter-pack', () => ({ applyStarterFloor: vi.fn(async () => ({})) }))
vi.mock('@/lib/stripe', () => ({ stripe: { coupons: { create: vi.fn() } } }))
vi.mock('@/lib/db', () => {
  const schema = {
    organization: { id: 'org.id', slug: 'org.slug' },
    clinicProfile: { organizationId: 'cp.orgId' },
    invitation: { id: 'inv.id', organizationId: 'inv.orgId', role: 'inv.role', email: 'inv.email', status: 'inv.status' },
    pmsConnectRequest: { organizationId: 'pms.orgId' },
    clinicReviewConfig: { organizationId: 'rc.orgId' },
  }
  const db = {
    select: h.select,
    insert: h.insert,
    update: h.update,
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      h.txCalls.n++
      return cb({ insert: h.insert, select: h.select })
    },
  }
  return { db, schema }
})

import { provisionManagedClinic } from '@/lib/services/clinic-provisioning'

const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = []
let selectRows: unknown[][] = []

beforeEach(() => {
  vi.clearAllMocks()
  inserted.length = 0
  h.txCalls.n = 0
  let i = 0
  h.select.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: async () => selectRows[Math.min(i++, selectRows.length - 1)] ?? [] }) }),
  }))
  h.insert.mockImplementation((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      inserted.push({ table, values })
      const p = Promise.resolve(undefined) as Promise<undefined> & { onConflictDoNothing: () => Promise<undefined> }
      p.onConflictDoNothing = () => Promise.resolve(undefined)
      return p
    },
  }))
})

const input = {
  name: 'Bright Smile Dental',
  slug: 'bright-smile',
  ownerEmail: 'Jane@BrightSmile.com',
  ownerName: 'Dr. Jane Lee',
  planId: 'premium' as const,
  interval: 'monthly' as const,
  pricing: { kind: 'standard' as const },
  inviterUserId: 'admin-1',
  inviterName: 'Dustin',
  brand: { color: '#0d9488' },
  dossier: { timezone: 'America/Chicago', phone: '5551234567', addressLine1: '1 Main', city: 'Austin', state: 'TX', postalCode: '78701' },
  setup: { npi: '123-456-7890', pmsVendor: 'dentrix' },
}

describe('provisionManagedClinic — the setup call', () => {
  it('writes org, profile, PMS request and invite in ONE transaction, then sends the invite once', async () => {
    selectRows = [[]]
    const r = await provisionManagedClinic(input)
    expect(h.txCalls.n).toBe(1)
    const profile = inserted.find((x) => 'planTier' in x.values)!.values
    expect(profile).toMatchObject({
      timezone: 'America/Chicago',
      npi: '1234567890',
      brandColor: '#0d9488',
      pmsAnswer: 'dentrix',
      city: 'Austin',
    })
    const pms = inserted.find((x) => 'vendor' in x.values)!.values
    expect(pms).toMatchObject({ vendor: 'dentrix', status: 'requested', contactEmail: 'jane@brightsmile.com', organizationId: r.organizationId })
    expect(inserted.find((x) => 'inviterId' in x.values)!.values.email).toBe('jane@brightsmile.com')
    expect(h.sendInvite).toHaveBeenCalledTimes(1)
  })

  it('files no PMS request for "none", but still records the answer', async () => {
    selectRows = [[]]
    await provisionManagedClinic({ ...input, setup: { pmsVendor: 'none' } })
    expect(inserted.some((x) => 'vendor' in x.values)).toBe(false)
    expect(inserted.find((x) => 'planTier' in x.values)!.values.pmsAnswer).toBe('none')
  })

  it('a second submit with the same slug and owner makes no second org and no second invite', async () => {
    selectRows = [[{ id: 'org_1' }], [{ id: 'inv_1', email: 'jane@brightsmile.com' }]]
    const r = await provisionManagedClinic(input)
    expect(r).toMatchObject({ organizationId: 'org_1', invitationId: 'inv_1', alreadyProvisioned: true })
    expect(inserted).toHaveLength(0)
    expect(h.sendInvite).not.toHaveBeenCalled()
  })

  it('refuses a slug that belongs to someone else', async () => {
    selectRows = [[{ id: 'org_1' }], [{ id: 'inv_1', email: 'other@x.com' }]]
    await expect(provisionManagedClinic(input)).rejects.toThrow(/already taken/)
    expect(inserted).toHaveLength(0)
  })
})
