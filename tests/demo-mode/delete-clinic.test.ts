import { describe, it, expect, vi, beforeEach } from 'vitest'

let tenantCtx: {
  tenantType: 'platform' | 'clinic' | 'patient'
  organizationId: string
  platformAdmin: boolean
  userId: string
  role: 'owner' | 'admin' | 'member' | 'patient'
} | null = null

const cookieStore = {
  get: vi.fn<(name: string) => { value: string } | undefined>(),
  set: vi.fn<(name: string, value: string, opts: unknown) => void>(),
  delete: vi.fn<(name: string) => void>(),
}

vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => {
    if (!tenantCtx) throw new Error('Not authenticated')
    return tenantCtx
  }),
}))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`)
    ;(err as Error & { digest: string }).digest = `NEXT_REDIRECT:${url}`
    throw err
  },
}))
vi.mock('@/lib/services/demo-clinic', () => ({ createDemoClinic: vi.fn() }))

const { mockCancel, dbState } = vi.hoisted(() => ({
  mockCancel: vi.fn(async () => ({ id: 'sub_cancelled' })),
  dbState: {
    selectQueue: [] as unknown[][],
    deletes: [] as { table: string }[],
  },
}))

vi.mock('@/lib/services/stripe-admin', () => ({ cancelSubscriptionNow: mockCancel }))

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const tableName = (table: unknown) =>
    table === schema.organization ? 'organization' : table === schema.membership ? 'membership' : 'unknown'
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => dbState.selectQueue.shift() ?? []
    return obj
  }
  const deleteBuilder = (table: unknown) => ({
    where: async () => {
      dbState.deletes.push({ table: tableName(table) })
    },
  })
  return {
    db: {
      select: () => chain(),
      delete: (table: unknown) => deleteBuilder(table),
      transaction: async (cb: (tx: unknown) => Promise<void>) => {
        await cb({ delete: (table: unknown) => deleteBuilder(table) })
      },
    },
    schema,
  }
})

import { deleteClinicAction } from '@/app/(default)/ecommerce/customers/admin-actions'

beforeEach(() => {
  cookieStore.set.mockReset()
  cookieStore.delete.mockReset()
  cookieStore.get.mockReset()
  mockCancel.mockReset().mockResolvedValue({ id: 'sub_cancelled' })
  dbState.selectQueue.length = 0
  dbState.deletes.length = 0
  tenantCtx = {
    tenantType: 'platform',
    organizationId: 'org_platform',
    platformAdmin: true,
    userId: 'user_dustin',
    role: 'owner',
  }
})

describe('deleteClinicAction', () => {
  it('deletes a clinic and reports back', async () => {
    dbState.selectQueue.push([
      { id: 'org_acme', name: 'Acme Dental Demo', slug: 'acme-dental-demo', type: 'clinic' },
    ])
    dbState.selectQueue.push([{ stripeSubscriptionId: null }])

    const out = await deleteClinicAction({ orgId: 'org_acme', confirmSlug: 'acme-dental-demo' })

    expect(out).toEqual({ ok: true, name: 'Acme Dental Demo', subscriptionCanceled: false })
    // Memberships are cleared first (the historical restrict-FK blocker), then
    // the org is dropped (cascade handles the rest).
    expect(dbState.deletes.map((d) => d.table)).toEqual(['membership', 'organization'])
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('cancels the Stripe subscription first when one is on file', async () => {
    dbState.selectQueue.push([
      { id: 'org_real', name: 'Real Clinic', slug: 'real-clinic', type: 'clinic' },
    ])
    dbState.selectQueue.push([{ stripeSubscriptionId: 'sub_123' }])

    const out = await deleteClinicAction({ orgId: 'org_real', confirmSlug: 'real-clinic' })

    expect(mockCancel).toHaveBeenCalledWith('sub_123')
    expect(out.subscriptionCanceled).toBe(true)
    expect(dbState.deletes.map((d) => d.table)).toContain('organization')
  })

  it('still deletes the org if the Stripe cancel call fails', async () => {
    dbState.selectQueue.push([
      { id: 'org_real', name: 'Real Clinic', slug: 'real-clinic', type: 'clinic' },
    ])
    dbState.selectQueue.push([{ stripeSubscriptionId: 'sub_fail' }])
    mockCancel.mockRejectedValueOnce(new Error('Stripe down'))

    const out = await deleteClinicAction({ orgId: 'org_real', confirmSlug: 'real-clinic' })

    expect(out.subscriptionCanceled).toBe(false)
    expect(dbState.deletes.map((d) => d.table)).toContain('organization')
  })

  it('refuses when the confirm slug does not match', async () => {
    dbState.selectQueue.push([
      { id: 'org_acme', name: 'Acme', slug: 'acme-dental-demo', type: 'clinic' },
    ])
    await expect(
      deleteClinicAction({ orgId: 'org_acme', confirmSlug: 'wrong-slug' }),
    ).rejects.toThrow(/Confirmation slug/)
    expect(dbState.deletes).toHaveLength(0)
  })

  it('refuses to delete the platform org', async () => {
    dbState.selectQueue.push([
      { id: 'org_platform', name: 'Dream Create', slug: 'dream-create', type: 'platform' },
    ])
    await expect(
      deleteClinicAction({ orgId: 'org_platform', confirmSlug: 'dream-create' }),
    ).rejects.toThrow(/only clinic tenants/i)
    expect(dbState.deletes).toHaveLength(0)
  })

  it('refuses when the caller is not a platform admin', async () => {
    tenantCtx = {
      tenantType: 'clinic',
      organizationId: 'org_clinic',
      platformAdmin: false,
      userId: 'u',
      role: 'owner',
    }
    await expect(
      deleteClinicAction({ orgId: 'org_acme', confirmSlug: 'acme-dental-demo' }),
    ).rejects.toThrow(/Forbidden/)
    expect(dbState.deletes).toHaveLength(0)
  })

  it('refuses when the caller is a member-level platform user', async () => {
    tenantCtx = {
      tenantType: 'platform',
      organizationId: 'org_platform',
      platformAdmin: true,
      userId: 'u',
      role: 'member',
    }
    await expect(
      deleteClinicAction({ orgId: 'org_acme', confirmSlug: 'acme-dental-demo' }),
    ).rejects.toThrow(/owner or admin/)
  })

  it('clears the demo cookie when it points at the deleted clinic', async () => {
    dbState.selectQueue.push([
      { id: 'org_acme', name: 'Acme', slug: 'acme-dental-demo', type: 'clinic' },
    ])
    dbState.selectQueue.push([{ stripeSubscriptionId: null }])
    cookieStore.get.mockReturnValueOnce({ value: JSON.stringify({ orgId: 'org_acme', role: 'owner' }) })

    await deleteClinicAction({ orgId: 'org_acme', confirmSlug: 'acme-dental-demo' })

    expect(cookieStore.delete).toHaveBeenCalledWith('demo_context')
  })

  it('leaves the demo cookie alone when it points at a different org', async () => {
    dbState.selectQueue.push([
      { id: 'org_acme', name: 'Acme', slug: 'acme-dental-demo', type: 'clinic' },
    ])
    dbState.selectQueue.push([{ stripeSubscriptionId: null }])
    cookieStore.get.mockReturnValueOnce({ value: JSON.stringify({ orgId: 'org_other', role: 'owner' }) })

    await deleteClinicAction({ orgId: 'org_acme', confirmSlug: 'acme-dental-demo' })

    expect(cookieStore.delete).not.toHaveBeenCalled()
  })

  it('throws when the clinic does not exist', async () => {
    dbState.selectQueue.push([]) // no org found
    await expect(
      deleteClinicAction({ orgId: 'org_nope', confirmSlug: 'whatever' }),
    ).rejects.toThrow(/not found/i)
  })
})
