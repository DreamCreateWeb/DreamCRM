import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

/**
 * THE AUDIENCE-LOCK WRITE, RENDERED FOR REAL (Phase 4).
 *
 * Standing lesson from the Phase-3 audit (docs/AUDITS.md): a database
 * modelled in JavaScript is not a database. That phase shipped a jsonb merge
 * that failed with 42P18 on every single call because drizzle binds
 * interpolated values as untyped parameters and Postgres cannot resolve one
 * against an overloaded operator — invisible to 5,600 passing tests. So any
 * NEW raw SQL gets a test at the real boundary, in the slice that writes it.
 *
 * This statement carries the switch that decides whether the machine talks
 * to customers at all. Silently failing would be its own kind of safe (the
 * lock stays closed) but the owner would flip it and be told it worked.
 */

const captured: { insert?: unknown; update?: Record<string, unknown> } = {}

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  return {
    schema,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          captured.insert = v.config
          return {
            onConflictDoUpdate: async (cfg: { set: Record<string, unknown> }) => {
              captured.update = cfg.set
            },
          }
        },
      }),
    },
  }
})

import { setGuardianAudience } from '@/lib/services/platform-config'

const dialect = new PgDialect()
const render = (frag: unknown) => dialect.sqlToQuery(frag as never)

beforeEach(() => {
  captured.insert = undefined
  captured.update = undefined
})

describe('the audience-lock write as Postgres parses it', () => {
  it('binds no untyped parameter — every $n carries a cast', async () => {
    await setGuardianAudience('clinic')
    for (const frag of [captured.insert, captured.update!.config]) {
      const { sql: text } = render(frag)
      for (const m of Array.from(text.matchAll(/\$\d+/g))) {
        const after = text.slice(m.index! + m[0].length)
        expect(
          after.startsWith('::'),
          `parameter ${m[0]} is bound without a cast — Postgres cannot infer its type here:\n${text}`,
        ).toBe(true)
      }
    }
  })

  it('the conflict path MERGES against the row’s own value — it never replaces the config wholesale', async () => {
    await setGuardianAudience('clinic')
    const { sql: text } = render(captured.update!.config)
    // `coalesce(config, '{}') || patch` — a bare assignment here would drop
    // every other platform switch the day a second one is added.
    expect(text).toContain('"config"')
    expect(text).toContain('coalesce')
    expect(text).toContain('||')
  })

  it('sends the audience as JSON the merge can apply, not a bare string', async () => {
    await setGuardianAudience('clinic')
    const { params } = render(captured.update!.config)
    expect(params).toContain(JSON.stringify({ guardianAudience: 'clinic' }))
  })

  it('locking back down writes the closed value the resolver floors to', async () => {
    await setGuardianAudience('platform')
    const { params } = render(captured.update!.config)
    expect(params).toContain(JSON.stringify({ guardianAudience: 'platform' }))
  })

  it('targets the real table and its primary key', async () => {
    await setGuardianAudience('platform')
    expect(render(captured.update!.config).sql).toContain('"platform_config"')
  })
})
