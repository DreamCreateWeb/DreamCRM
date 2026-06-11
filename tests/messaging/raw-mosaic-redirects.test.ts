import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Raw Mosaic routes (orders / product / shop / cart / tasks) must 308-style
 * redirect CLINIC tenants to their dental-correct surface — but leave platform
 * tenants on the existing page. We mock requireTenant to drive the tenant type
 * and make redirect() throw a sentinel (as real Next does, so execution stops
 * at the preamble) to assert where each tenant is sent.
 */

type Ctx = { tenantType: 'platform' | 'clinic' | 'patient'; role: string; planTier: string; organizationId: string; userId: string }
let tenantCtx: Ctx
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))

vi.mock('@/lib/auth/context', () => ({ requireTenant: vi.fn(async () => tenantCtx) }))
vi.mock('next/navigation', () => ({ redirect }))

// Service + db stubs so the page modules import cleanly. The platform path
// returns empty data; the clinic path never reaches these (redirect throws).
vi.mock('@/lib/db', () => ({ db: {}, schema: {} }))
vi.mock('drizzle-orm', () => ({ inArray: vi.fn() }))
vi.mock('@/lib/services/tasks', () => ({
  listTasks: vi.fn().mockResolvedValue([]),
  listTagsForOrg: vi.fn().mockResolvedValue([]),
  listSubtasks: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/services/products', () => ({
  listProducts: vi.fn().mockResolvedValue([]),
  getProductBySlug: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/orders', () => ({ listOrders: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/services/customers', () => ({ listCustomers: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/services/cart', () => ({ cartTotal: vi.fn().mockResolvedValue({ subtotalCents: 0, itemCount: 0, lines: [] }) }))

import Kanban from '@/app/(default)/tasks/kanban/page'
import TasksList from '@/app/(default)/tasks/list/page'
import OrdersOrPipeline from '@/app/(default)/ecommerce/orders/page'
import Product from '@/app/(default)/ecommerce/product/page'
import Shop from '@/app/(default)/ecommerce/(shop)/shop/page'
import Cart from '@/app/(default)/ecommerce/(cart)/cart/page'

const sp = Promise.resolve({})

beforeEach(() => {
  redirect.mockClear()
  tenantCtx = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', userId: 'u1' }
})

async function expectRedirect(run: () => Promise<unknown>, path: string) {
  await expect(run()).rejects.toThrow(`REDIRECT:${path}`)
  expect(redirect).toHaveBeenCalledWith(path)
}

describe('raw Mosaic route clinic redirects', () => {
  it('tasks/kanban → / for clinic', () => expectRedirect(() => Kanban({ searchParams: sp }), '/'))
  it('tasks/list → / for clinic', () => expectRedirect(() => TasksList({ searchParams: sp }), '/'))
  it('ecommerce/orders → /shop/orders for clinic', () =>
    expectRedirect(() => OrdersOrPipeline(), '/shop/orders'))
  it('ecommerce/product → /shop for clinic', () =>
    expectRedirect(() => Product({ searchParams: Promise.resolve({}) }), '/shop'))
  it('ecommerce/shop → /shop for clinic', () => expectRedirect(() => Shop(), '/shop'))
  it('ecommerce/cart → /shop for clinic', () => expectRedirect(() => Cart(), '/shop'))
})

describe('platform tenants are NOT redirected by the Mosaic guards', () => {
  beforeEach(() => { tenantCtx = { ...tenantCtx, tenantType: 'platform' } })

  it('tasks/kanban does not redirect a platform tenant', async () => {
    // Platform falls through to render (returns JSX, not a thrown redirect).
    await Kanban({ searchParams: sp })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('tasks/list does not redirect a platform tenant', async () => {
    await TasksList({ searchParams: sp })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('ecommerce/orders renders the pipeline (no redirect) for platform', async () => {
    await OrdersOrPipeline()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('ecommerce/shop does not redirect a platform tenant', async () => {
    await Shop()
    expect(redirect).not.toHaveBeenCalled()
  })
})
