import { describe, it, expect, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * THE BOUNDARY TEST the DB-modelled-in-JavaScript convention requires
 * (CLAUDE.md, Phase 3: "any new raw SQL ... needs a boundary test").
 * Audit round 3 found a CRITICAL here: `enableFeature` cleared the
 * doors_closed memory with `${toOpen}::text[]`, and drizzle renders a JS
 * array inside a sql template as a parenthesised scalar list —
 * `($1, $2)::text[]` — which Postgres rejects ("malformed array literal"),
 * so every person's "Turn on" failed in the one UPDATE that also opened
 * the door. The statements are rendered through drizzle's REAL dialect
 * here, so the shape Postgres sees is what is asserted.
 */

const state = { patches: [] as Array<Record<string, unknown>>, rows: [] as Array<Record<string, unknown>> }
vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const select = () => {
    const obj: any = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.limit = async () => state.rows
    return obj
  }
  const update = () => ({ set: (patch: Record<string, unknown>) => ({ where: async () => { state.patches.push(patch) } }) })
  return { schema, db: { select, update } }
})

import { disableFeature, doorsClosedKeysLiteral, enableFeature, openDoors } from '@/lib/services/feature-switches'
import { FEATURE_SWITCHES } from '@/lib/feature-switches'

const dialect = new PgDialect()
const render = (fragment: unknown) => dialect.sqlToQuery(fragment as ReturnType<typeof sql>)
const NOW = new Date('2026-10-12T15:00:00Z')

describe('doors_closed statements, rendered through the real dialect', () => {
  it('a person’s Turn on clears the memory with ONE text[] literal param — never a parenthesised scalar list', async () => {
    state.rows = [{}]
    state.patches = []
    await enableFeature('org_a', 'my_day', NOW)
    const q = render(state.patches[0].doorsClosed)
    expect(q.sql).toMatch(/- \$1::text\[\]$/)
    expect(q.sql).not.toMatch(/\(\$1/)
    expect(q.params).toEqual(['{my_day}'])
  })

  it('several keys at once are still one literal', async () => {
    state.rows = [{}]
    state.patches = []
    await openDoors('org_a', ['my_day', 'growth'], NOW, { honorClosed: false })
    const q = render(state.patches[0].doorsClosed)
    expect(q.sql).toMatch(/- \$1::text\[\]$/)
    expect(q.params).toEqual(['{my_day,growth}'])
  })

  it('Turn off merges one key with a scalar text bind, like the activation stamp', async () => {
    state.patches = []
    await disableFeature('org_a', 'shop', NOW)
    const q = render(state.patches[0].doorsClosed)
    expect(q.sql).toMatch(/jsonb_build_object\(\$1::text, to_jsonb\(\$2::text\)\)/)
    expect(q.params).toEqual(['shop', NOW.toISOString()])
  })

  it('every feature key is a safe array-literal element', () => {
    for (const f of FEATURE_SWITCHES) expect(f.key).toMatch(/^[a-z_]+$/)
    expect(doorsClosedKeysLiteral(['my_day', 'followups'])).toBe('{my_day,followups}')
  })
})
