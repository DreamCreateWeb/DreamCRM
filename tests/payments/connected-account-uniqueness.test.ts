import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { connectRefund, shopConfig } from '@/lib/db/schema/clinic'

/**
 * ONE CONNECTED STRIPE ACCOUNT, ONE CLINIC — still ASSUMED, and this test is
 * what keeps the assumption honest while it waits.
 *
 * A Connect webhook names its tenant only through `event.account`, so
 * `orgIdForConnectedAccount` turns `shop_config.stripe_account_id` into a
 * TENANT on a money write path, with `.limit(1)`. Two rows sharing an account
 * id would file one clinic's refund in another clinic's records.
 *
 * The unique index that makes that structural is WRITTEN AND PARKED
 * (DREAMCRM-45 decision, 2026-09-15), because `CREATE UNIQUE INDEX` fails on
 * existing duplicates and a failed migration is silently skipped on this
 * deploy path — taking every later migration with it. It waits on one
 * production read.
 *
 * So the thing worth freezing is not "the index exists". It is that the parked
 * state cannot rot into a lie in either direction:
 *
 *  · the parked file must stay OUT of the journal, or it would apply on a
 *    deploy — the exact thing parking it prevents;
 *  · the schema must not declare the index while the file is still parked, or
 *    `drizzle-kit generate` would emit it into a numbered migration and it
 *    would apply anyway, quietly, from a different direction;
 *  · when it does land, this file has to be deleted in the same PR, or the
 *    repo would carry a "parked" instruction for an index that is already
 *    live.
 *
 * The last two are the same assertion read from both sides, which is the
 * point: schema and parked file must never both claim it.
 */

const MIG_DIR = resolve(process.cwd(), 'lib/db/migrations')
const PARKED = join(MIG_DIR, 'parked/one-stripe-account-per-clinic.sql')
const INDEX_NAME = 'shop_config_stripe_account_idx'

/** Every migration drizzle will actually run, in journal order. */
function journaledSql(): string {
  const journal = JSON.parse(readFileSync(join(MIG_DIR, 'meta/_journal.json'), 'utf8')) as {
    entries: Array<{ tag: string }>
  }
  return journal.entries
    .map((e) => {
      const f = join(MIG_DIR, `${e.tag}.sql`)
      return existsSync(f) ? readFileSync(f, 'utf8') : ''
    })
    .join('\n')
}

/** The schema's own declaration, read through drizzle rather than by grep. */
function schemaDeclaresIndex(): boolean {
  return getTableConfig(shopConfig).indexes.some((i) => i.config.name === INDEX_NAME)
}

describe('the parked one-account-per-clinic index', () => {
  const parkedExists = existsSync(PARKED)

  it('is parked, or it is live — never neither, never both', () => {
    const declared = schemaDeclaresIndex()
    const journaled = journaledSql().includes(INDEX_NAME)
    // Live means: declared in the schema AND in a journaled migration AND the
    // parked file deleted. Parked means: none of those.
    if (parkedExists) {
      expect(
        declared,
        'the schema declares the index while it is still parked — `pnpm db:generate` ' +
          'would emit it into a numbered migration and it would apply on the next ' +
          'deploy, which is the thing parking it exists to prevent. Delete the parked ' +
          'file in the same PR that re-adds the declaration.',
      ).toBe(false)
      expect(
        journaled,
        'a journaled migration creates the index while the parked file still says it is ' +
          'waiting on a production read. Delete the parked file.',
      ).toBe(false)
    } else {
      expect(
        declared && journaled,
        'the parked file is gone but the index is not fully live — it must be BOTH ' +
          'declared in lib/db/schema/clinic.ts and created by a journaled migration.',
      ).toBe(true)
    }
  })

  it('the parked file is not in the journal, so a deploy cannot run it', () => {
    if (!parkedExists) return
    const journal = JSON.parse(readFileSync(join(MIG_DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    const tags = journal.entries.map((e) => e.tag)
    expect(tags.some((t) => t.includes('one-stripe-account-per-clinic'))).toBe(false)
    // And drizzle resolves a journal entry to `<tag>.sql` at the directory
    // root, so nothing under `parked/` is reachable by any tag.
    for (const t of tags) expect(t.startsWith('parked/')).toBe(false)
  })

  it('the parked file still carries its precondition and how to run it', () => {
    if (!parkedExists) return
    const sql = readFileSync(PARKED, 'utf8')
    // The statement itself — partial, or it says nothing (every unconnected
    // clinic holds a null).
    expect(sql).toMatch(new RegExp(`create unique index "${INDEX_NAME}"`, 'i'))
    expect(sql).toMatch(/where\s+"shop_config"\."stripe_account_id"\s+is not null/i)
    // The named check that has to come back empty first, so the next person
    // does not have to rediscover which lookup this waits on.
    expect(sql).toContain('duplicate-stripe-accounts')
  })

  it('the named production check exists in the catalog', () => {
    if (!parkedExists) return
    // A precondition that points at a check nobody can run is not a
    // precondition. `lib/read-checks.ts` is the catalog (DREAMCRM-42).
    const catalog = readFileSync(resolve(process.cwd(), 'lib/read-checks.ts'), 'utf8')
    expect(catalog).toContain('duplicate-stripe-accounts')
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

  it('ships in a journaled migration, and needs no production precondition', () => {
    const sql = journaledSql()
    expect(sql).toMatch(/create table "connect_refund"/i)
    // A brand-new table cannot collide with existing data — which is why this
    // half did not have to wait for the read the index is waiting for.
    expect(sql).toMatch(/create unique index "connect_refund_intent_idx"/i)
  })
})

describe('the migrations directory itself', () => {
  it('has no un-journaled .sql at the root — parked work lives in parked/', () => {
    // A stray root-level .sql reads like a migration and runs like nothing.
    const journal = JSON.parse(readFileSync(join(MIG_DIR, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    const tags = new Set(journal.entries.map((e) => `${e.tag}.sql`))
    const orphans = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql') && !tags.has(f))
    expect(orphans, 'move these under parked/ or journal them').toEqual([])
  })
})
