import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * What survives of the Mosaic template's routes, and where it sends people.
 *
 * The generic shop / cart / product / pay pages are GONE (Mosaic deletion
 * pass) — they had zero inbound links from any nav or module registry, and
 * they sat on a parallel commerce stack (`services/products`, `services/cart`,
 * the `products`/`cart_items` tables) that the real dental Shop never touched.
 * A route only kept alive by the test that asserts it redirects is not a
 * migration path, it is a maintained museum.
 *
 * What DOES stay is the pattern this file was written for: routes that still
 * exist under a Mosaic-shaped URL because something real lives there
 * (`/ecommerce/orders` is the platform's Projects board; `/ecommerce/customers`
 * and `/ecommerce/invoices` are Clinics and Subscriptions), plus the retired
 * `tasks/*` stubs that keep an old bookmark from dead-ending.
 *
 * We mock requireTenant to drive the tenant type and make redirect() throw a
 * sentinel (as real Next does, so execution stops at the preamble) to assert
 * where each tenant is sent.
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
vi.mock('drizzle-orm', () => ({ inArray: vi.fn(), sql: vi.fn(() => ({})) }))
vi.mock('@/lib/services/tasks', () => ({
  listTasks: vi.fn().mockResolvedValue([]),
  listTagsForOrg: vi.fn().mockResolvedValue([]),
  listSubtasks: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/lib/services/orders', () => ({ listOrders: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/services/customers', () => ({ listCustomers: vi.fn().mockResolvedValue([]) }))

import Kanban from '@/app/(default)/tasks/kanban/page'
import TasksList from '@/app/(default)/tasks/list/page'
import OrdersOrPipeline from '@/app/(default)/ecommerce/orders/page'

beforeEach(() => {
  redirect.mockClear()
  tenantCtx = { tenantType: 'clinic', role: 'owner', planTier: 'premium', organizationId: 'org_1', userId: 'u1' }
})

async function expectRedirect(run: () => Promise<unknown>, path: string) {
  await expect(run()).rejects.toThrow(`REDIRECT:${path}`)
  expect(redirect).toHaveBeenCalledWith(path)
}

describe('raw Mosaic route clinic redirects', () => {
  // Tasks + Calendar were fully retired 2026-07-07 (platform declutter) — they
  // redirect EVERY tenant now (out of all nav), so clinic lands on /dashboard.
  it('tasks/kanban → /dashboard for clinic', () => expectRedirect(() => Kanban(), '/dashboard'))
  it('tasks/list → /dashboard for clinic', () => expectRedirect(() => TasksList(), '/dashboard'))
  it('ecommerce/orders → /shop/orders for clinic', () =>
    expectRedirect(() => OrdersOrPipeline(), '/shop/orders'))
})

describe('retired Mosaic routes redirect platform tenants too', () => {
  beforeEach(() => { tenantCtx = { ...tenantCtx, tenantType: 'platform' } })

  // The generic Tasks board + list are gone from the platform sidebar and
  // now redirect platform to the real dashboard, not the template UI.
  it('tasks/kanban → /dashboard for platform', () =>
    expectRedirect(() => Kanban(), '/dashboard'))
  it('tasks/list → /dashboard for platform', () =>
    expectRedirect(() => TasksList(), '/dashboard'))

  // Sales Pipeline (/ecommerce/orders) stays real — no redirect.
  it('ecommerce/orders renders the pipeline (no redirect) for platform', async () => {
    await OrdersOrPipeline()
    expect(redirect).not.toHaveBeenCalled()
  })
})
