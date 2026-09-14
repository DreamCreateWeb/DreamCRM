import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { shopConfig, connectRefund } from '@/lib/db/schema/clinic'

/**
 * ONE CONNECTED STRIPE ACCOUNT, ONE CLINIC — structurally, not by assumption.
 *
 * A Connect webhook names a tenant only by `event.account`, so
 * `orgIdForConnectedAccount` turns `shop_config.stripe_account_id` into a
 * TENANT on a money write path, with `.limit(1)`. Two rows sharing an account
 * id would have filed one clinic's refund in another clinic's records — and
 * which clinic won would have been whatever the planner returned first.
 *
 * The database is modelled in JavaScript here, so a vitest suite cannot watch
 * Postgres reject the second row. What it CAN pin is that the constraint is
 * declared, that it is declared the way this column needs (PARTIAL — the value
 * is null for every clinic that has not connected Stripe, and again after
 * `disconnectShopStripe` clears it), and that the generated migration carries
 * it. That is the boundary-test lesson from the Phase-3 audit: a schema fact
 * this load-bearing gets rendered and read, not assumed.
 */

function migrationSql(): string {
  const dir = resolve(process.cwd(), 'lib/db/migrations')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
}

describe('shop_config.stripe_account_id is unique', () => {
  it('declares a UNIQUE index on the account id', () => {
    const { indexes } = getTableConfig(shopConfig)
    const idx = indexes.find((i) => i.config.name === 'shop_config_stripe_account_idx')
    expect(idx, 'the uniqueness of a connected account is what keeps refunds in the right clinic').toBeDefined()
    expect(idx!.config.unique).toBe(true)
    expect(idx!.config.columns.map((c) => (c as { name: string }).name)).toEqual(['stripe_account_id'])
  })

  it('is PARTIAL, so unconnected and disconnected clinics do not collide on null', () => {
    const { indexes } = getTableConfig(shopConfig)
    const idx = indexes.find((i) => i.config.name === 'shop_config_stripe_account_idx')!
    expect(idx.config.where, 'a plain unique index here would be satisfied by nulls and say nothing').toBeDefined()
  })

  it('the migration that ships it is on disk', () => {
    const sql = migrationSql()
    expect(sql).toMatch(/create unique index "shop_config_stripe_account_idx"/i)
    expect(sql).toMatch(/where\s+"shop_config"\."stripe_account_id"\s+is not null/i)
  })
})

describe('connect_refund is claimed per charge', () => {
  it('one receipt per (org, payment intent) — the claim key a redelivery reuses', () => {
    const { indexes } = getTableConfig(connectRefund)
    const idx = indexes.find((i) => i.config.name === 'connect_refund_intent_idx')
    expect(idx).toBeDefined()
    expect(idx!.config.unique).toBe(true)
    expect(idx!.config.columns.map((c) => (c as { name: string }).name)).toEqual([
      'organization_id',
      'stripe_payment_intent_id',
    ])
  })

  it('carries organization_id — every read and write of it is tenant-scoped', () => {
    const { columns } = getTableConfig(connectRefund)
    const org = columns.find((c) => c.name === 'organization_id')
    expect(org).toBeDefined()
    expect(org!.notNull).toBe(true)
  })

  it('the migration that ships it is on disk', () => {
    expect(migrationSql()).toMatch(/create table "connect_refund"/i)
  })
})
