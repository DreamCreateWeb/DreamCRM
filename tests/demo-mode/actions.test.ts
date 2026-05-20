import { describe, it, expect, vi, beforeEach } from 'vitest'

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  organizationId: string
  platformAdmin: boolean
  userId: string
  role: 'owner' | 'admin' | 'member' | 'patient'
} | null = null

const cookieStore = {
  set: vi.fn<(name: string, value: string, opts: unknown) => void>(),
  delete: vi.fn<(name: string) => void>(),
}

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))

vi.mock('next/headers', () => ({
  cookies: async () => cookieStore,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest: string }).digest = `NEXT_REDIRECT:${url}`
    throw err
  },
}))

// Hoisted so the vi.mock factories below can capture them.
const { mockCreateDemo, dbState } = vi.hoisted(() => ({
  mockCreateDemo: vi.fn(async () => ({
    organizationId: 'org_demo_1',
    organizationSlug: 'acme-dental-demo',
    organizationName: 'Acme Dental Demo',
    created: true,
    patientCount: 15,
    appointmentCount: 12,
  })),
  dbState: { stubOrgSlug: 'some-other-clinic' as string | null },
}))

vi.mock('@/lib/services/demo-clinic', () => ({
  createDemoClinic: mockCreateDemo,
}))

vi.mock('@/lib/db', () => {
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => (dbState.stubOrgSlug ? [{ slug: dbState.stubOrgSlug }] : [])
    return obj
  }
  return { db: { select: () => chain() } }
})

import {
  enterDemoMode,
  exitDemoMode,
  seedAndEnterDemoClinic,
  seedDemoClinic,
} from '@/app/(default)/ecommerce/customers/admin-actions'

beforeEach(() => {
  cookieStore.set.mockReset()
  cookieStore.delete.mockReset()
  mockCreateDemo.mockClear()
  dbState.stubOrgSlug = 'some-other-clinic'
  tenantCtx = {
    tenantType: 'platform',
    organizationId: 'org_platform',
    platformAdmin: true,
    userId: 'user_dustin',
    role: 'owner',
  }
})

async function expectRedirect(p: Promise<unknown>, to: string) {
  await expect(p).rejects.toThrow(`NEXT_REDIRECT:${to}`)
}

describe('enterDemoMode', () => {
  it('sets a demo_context cookie with the chosen org + role', async () => {
    await expectRedirect(
      enterDemoMode({ orgId: 'org_clinic_a', role: 'admin' }),
      '/',
    )
    expect(cookieStore.set).toHaveBeenCalledTimes(1)
    const [name, raw, opts] = cookieStore.set.mock.calls[0]
    expect(name).toBe('demo_context')
    expect(JSON.parse(raw)).toEqual({ orgId: 'org_clinic_a', role: 'admin' })
    expect((opts as { httpOnly?: boolean }).httpOnly).toBe(true)
    expect((opts as { path?: string }).path).toBe('/')
  })

  it('passes patientId through when given', async () => {
    await expectRedirect(
      enterDemoMode({ orgId: 'org_clinic_a', role: 'patient', patientId: 'pat_xyz' }),
      '/',
    )
    const [, raw] = cookieStore.set.mock.calls[0]
    expect(JSON.parse(raw)).toEqual({
      orgId: 'org_clinic_a',
      role: 'patient',
      patientId: 'pat_xyz',
    })
  })

  it('refuses when the caller is not a platform admin', async () => {
    tenantCtx = {
      tenantType: 'clinic',
      organizationId: 'org_clinic_a',
      platformAdmin: false,
      userId: 'user_normal',
      role: 'owner',
    }
    await expect(enterDemoMode({ orgId: 'org_b', role: 'admin' })).rejects.toThrow(/Forbidden/)
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('does NOT run the demo seeder when entering a non-demo clinic', async () => {
    dbState.stubOrgSlug = 'real-clinic-slug'
    await expectRedirect(enterDemoMode({ orgId: 'org_real', role: 'owner' }), '/')
    expect(mockCreateDemo).not.toHaveBeenCalled()
  })

  it('triggers the seeder self-heal when entering the Acme demo specifically', async () => {
    dbState.stubOrgSlug = 'acme-dental-demo'
    await expectRedirect(enterDemoMode({ orgId: 'org_demo', role: 'owner' }), '/')
    expect(mockCreateDemo).toHaveBeenCalledTimes(1)
  })

  it('refuses when input is malformed', async () => {
    await expect(enterDemoMode({ orgId: '', role: 'admin' })).rejects.toThrow()
    await expect(enterDemoMode({ orgId: 'org_b', role: 'invalid' as never })).rejects.toThrow()
  })
})

describe('exitDemoMode', () => {
  it('clears the demo_context cookie', async () => {
    await expectRedirect(exitDemoMode(), '/')
    expect(cookieStore.delete).toHaveBeenCalledWith('demo_context')
  })

  it('does not require platform admin (works even after session swap)', async () => {
    tenantCtx = null
    await expectRedirect(exitDemoMode(), '/')
    expect(cookieStore.delete).toHaveBeenCalledWith('demo_context')
  })
})

describe('seedAndEnterDemoClinic', () => {
  it('seeds, then sets cookie targeting the new clinic, then redirects', async () => {
    await expectRedirect(seedAndEnterDemoClinic('owner'), '/')
    expect(cookieStore.set).toHaveBeenCalledTimes(1)
    const [name, raw] = cookieStore.set.mock.calls[0]
    expect(name).toBe('demo_context')
    expect(JSON.parse(raw)).toEqual({ orgId: 'org_demo_1', role: 'owner' })
  })

  it('refuses when not a platform admin', async () => {
    tenantCtx = {
      tenantType: 'clinic',
      organizationId: 'org_clinic_a',
      platformAdmin: false,
      userId: 'u',
      role: 'admin',
    }
    await expect(seedAndEnterDemoClinic('owner')).rejects.toThrow(/Forbidden/)
    expect(cookieStore.set).not.toHaveBeenCalled()
  })
})

describe('seedDemoClinic', () => {
  it('seeds and returns the new clinic without redirecting', async () => {
    const out = await seedDemoClinic()
    expect(out.organizationId).toBe('org_demo_1')
    expect(cookieStore.set).not.toHaveBeenCalled()
  })

  it('refuses when not a platform admin', async () => {
    tenantCtx = {
      tenantType: 'clinic',
      organizationId: 'x',
      platformAdmin: false,
      userId: 'u',
      role: 'owner',
    }
    await expect(seedDemoClinic()).rejects.toThrow(/Forbidden/)
  })
})
