import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression test for multi-tenant isolation on the legacy Mosaic-template
 * services that survive: customers (the platform's Clinics list), orders (its
 * Projects board) and invoices (Subscriptions). The `products` and `cart`
 * services were deleted with the Mosaic shop/cart/product pages — their only
 * callers — so their sections went with them rather than being kept green
 * against code nothing runs. Each surviving service
 * must:
 *   1. Set organizationId on every INSERT
 *   2. Include an organizationId clause on every UPDATE / DELETE WHERE
 *   3. Filter every SELECT by organizationId
 *
 * The test mocks @/lib/db at the chain leaves and captures inserts +
 * where-clause SQL fragments so we can assert the org id appears in
 * each mutation.
 */

interface CapturedInsert {
  values: Record<string, unknown>
}

interface CapturedWhere {
  // Stringified SQL fragment; we just grep for the org id literal.
  sql: string
}

const state: {
  inserts: CapturedInsert[]
  wheres: CapturedWhere[]
  selectRows: unknown[][]
} = {
  inserts: [],
  wheres: [],
  selectRows: [],
}

function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (obj.value !== undefined) parts.push(String(obj.value))
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.leftJoin = () => obj
    obj.innerJoin = () => obj
    obj.where = (clause: unknown) => {
      state.wheres.push({ sql: captureSql(clause) })
      return obj
    }
    obj.groupBy = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectRows.shift() ?? []
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectRows.shift() ?? [])
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (vals: Record<string, unknown>) => ({
          returning: async () => {
            state.inserts.push({ values: vals })
            return [{ id: 1, ...vals }]
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: (clause: unknown) => {
            state.wheres.push({ sql: captureSql(clause) })
            return {
              returning: async () => [{ id: 1 }],
            }
          },
        }),
      }),
      delete: () => ({
        where: (clause: unknown) => {
          state.wheres.push({ sql: captureSql(clause) })
          return {
            returning: async () => [{ id: 1 }],
          }
        },
      }),
    },
    schema,
  }
})

import {
  createCustomer,
  deleteCustomers,
  updateCustomer,
  toggleFav,
  listCustomers,
  getCustomerOrderStats,
} from '@/lib/services/customers'
import {
  createOrder,
  deleteOrders,
  updateOrderStatus,
  listOrders,
} from '@/lib/services/orders'
import {
  createInvoice,
  deleteInvoices,
  setInvoiceStatus,
  markInvoicePaid,
  listInvoices,
  invoiceCountsByStatus,
} from '@/lib/services/invoices'

const ORG_A = 'org_a_acme_dental'
const ORG_B = 'org_b_bright_dental'

beforeEach(() => {
  state.inserts.length = 0
  state.wheres.length = 0
  state.selectRows.length = 0
})

describe('customers service — tenant scoping', () => {
  it('createCustomer writes organizationId on insert', async () => {
    await createCustomer(
      { name: 'Jane Doe', email: 'jane@example.com' },
      'user_1',
      ORG_A,
    )
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0].values.organizationId).toBe(ORG_A)
  })

  it('listCustomers filters by organizationId', async () => {
    await listCustomers(ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('getCustomerOrderStats filters by organizationId', async () => {
    await getCustomerOrderStats(ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('updateCustomer scopes WHERE to organizationId', async () => {
    await updateCustomer(7, ORG_A, { name: 'New Name' })
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('deleteCustomers scopes WHERE to organizationId', async () => {
    await deleteCustomers([1, 2, 3], ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('toggleFav scopes WHERE to organizationId', async () => {
    await toggleFav(5, ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('does not leak rows across orgs', async () => {
    await listCustomers(ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_B))).toBe(false)
  })
})

describe('orders service — tenant scoping', () => {
  it('createOrder writes organizationId on insert', async () => {
    await createOrder({ totalCents: 1000, currency: 'USD', items: [], status: 'pending' }, ORG_A)
    expect(state.inserts[0].values.organizationId).toBe(ORG_A)
  })

  it('listOrders filters by organizationId', async () => {
    await listOrders(ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('updateOrderStatus scopes WHERE to organizationId', async () => {
    await updateOrderStatus(42, ORG_A, 'shipped')
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('deleteOrders scopes WHERE to organizationId', async () => {
    await deleteOrders([10, 11], ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })
})

describe('invoices service — tenant scoping', () => {
  it('createInvoice writes organizationId on insert', async () => {
    await createInvoice(
      { totalCents: 5000, currency: 'USD', status: 'draft' },
      ORG_A,
    )
    expect(state.inserts[0].values.organizationId).toBe(ORG_A)
  })

  it('listInvoices filters by organizationId', async () => {
    await listInvoices(ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('invoiceCountsByStatus filters by organizationId', async () => {
    await invoiceCountsByStatus(ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('markInvoicePaid scopes WHERE to organizationId', async () => {
    await markInvoicePaid(3, ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('setInvoiceStatus scopes WHERE to organizationId', async () => {
    await setInvoiceStatus(3, ORG_A, 'paid')
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })

  it('deleteInvoices scopes WHERE to organizationId', async () => {
    await deleteInvoices([1, 2], ORG_A)
    expect(state.wheres.some((w) => w.sql.includes(ORG_A))).toBe(true)
  })
})
