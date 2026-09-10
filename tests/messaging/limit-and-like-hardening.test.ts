import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  clampRowLimit,
  escapeLikeTerm,
  DEFAULT_THREAD_LIMIT,
  MAX_THREAD_LIMIT,
  DEFAULT_THREAD_MESSAGE_LIMIT,
  MAX_THREAD_MESSAGE_LIMIT,
} from '@/lib/types/messaging'

/**
 * THE `/messages` BOUNDS ARE CORRECT ON THEIR OWN TERMS.
 *
 * The three defects here were all unreachable from today's callers — the view
 * gates on `Number.isFinite`, and every other caller passes a constant. That is
 * the reason to fix them, not a reason to skip them: a bound that only holds
 * because of what its callers happen to do is not a bound, and the next caller
 * is written by someone who read the function's signature, not its call sites.
 *
 *  1. `Math.min(Math.max(1, Math.trunc(x)), max)` returns `NaN` for `NaN`, and
 *     `NaN` reaches Postgres as `limit NaN`.
 *  2. The message stream's copy of that clamp had NO upper bound at all, so a
 *     hand-typed value reopened exactly the unbounded read it exists to close.
 *  3. The staff search moved from JS `includes` into SQL `LIKE` without
 *     escaping, so `%` and `_` silently became wildcards.
 */

describe('clampRowLimit', () => {
  it('passes an ordinary value through', () => {
    expect(clampRowLimit(50, 100, 500)).toBe(50)
  })

  it('falls back for undefined and null', () => {
    expect(clampRowLimit(undefined, 100, 500)).toBe(100)
    expect(clampRowLimit(null, 100, 500)).toBe(100)
  })

  it('falls back for NaN rather than passing it to the query', () => {
    // The bug: Math.min(Math.max(1, Math.trunc(NaN)), 500) === NaN.
    expect(clampRowLimit(NaN, 100, 500)).toBe(100)
    expect(Number.isNaN(clampRowLimit(NaN, 100, 500))).toBe(false)
  })

  it('falls back for Infinity, which trunc leaves untouched', () => {
    expect(clampRowLimit(Infinity, 100, 500)).toBe(100)
    expect(clampRowLimit(-Infinity, 100, 500)).toBe(100)
  })

  it('floors at 1 — a limit of 0 or -5 is never what the caller meant', () => {
    expect(clampRowLimit(0, 100, 500)).toBe(1)
    expect(clampRowLimit(-5, 100, 500)).toBe(1)
  })

  it('ceilings at max', () => {
    expect(clampRowLimit(10_000, 100, 500)).toBe(500)
  })

  it('truncates fractions instead of handing Postgres a decimal', () => {
    expect(clampRowLimit(12.9, 100, 500)).toBe(12)
  })

  it('clamps the fallback too, so a bad default cannot escape the ceiling', () => {
    expect(clampRowLimit(undefined, 9_000, 500)).toBe(500)
    expect(clampRowLimit(undefined, 0, 500)).toBe(1)
  })
})

describe('escapeLikeTerm', () => {
  it('leaves an ordinary term alone', () => {
    expect(escapeLikeTerm('mia hayes')).toBe('mia hayes')
  })

  it('escapes % — otherwise searching "50%" matches every thread', () => {
    expect(escapeLikeTerm('50%')).toBe('50\\%')
  })

  it('escapes _ — otherwise "a_b" matches "axb"', () => {
    expect(escapeLikeTerm('a_b')).toBe('a\\_b')
  })

  it('escapes the escape character itself', () => {
    expect(escapeLikeTerm('a\\b')).toBe('a\\\\b')
  })
})

/** ---------------------------------------------------------------------- */

const rendered: Array<{ sql: string; params: unknown[] }> = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const real = drizzle({} as never, { schema })
  const capture = (query: { toSQL(): { sql: string; params: unknown[] } }) => {
    rendered.push(query.toSQL())
    return []
  }
  function wrap(builder: unknown): unknown {
    return new Proxy(builder as object, {
      get(target, prop, receiver) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => resolve(capture(target as never))
        }
        const value = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args)
          return out && typeof out === 'object' ? wrap(out) : out
        }
      },
    })
  }
  return { schema, db: { select: (cols?: Record<string, unknown>) => wrap(real.select(cols as never)) } }
})

import { listPatientThreadsPage } from '@/lib/services/patient-messaging'

async function threadSql(filters: Record<string, unknown> = {}) {
  rendered.length = 0
  await listPatientThreadsPage('org_1', 'usr_1', filters as never)
  return rendered[0]
}

beforeEach(() => {
  rendered.length = 0
})

describe('the rendered search statement', () => {
  it('names the escape character on every LIKE it builds', async () => {
    const q = await threadSql({ search: 'hayes' })
    const likes = q.sql.match(/like \$\d+/gi) ?? []
    const escapes = q.sql.match(/escape '\\'/g) ?? []
    expect(likes.length).toBeGreaterThanOrEqual(3)
    // Every LIKE that takes a user term declares its escape char. The
    // digits-only phone clause is built from `\D`-stripped input, so it has
    // nothing to escape and is correctly not counted here.
    expect(escapes.length).toBe(3)
  })

  it('escapes wildcards in the bound parameter, not just in the SQL text', async () => {
    const q = await threadSql({ search: '50%' })
    // The three name / email / body patterns are escaped. The digits-only
    // phone pattern is built from `\D`-stripped input and is deliberately not
    // — it can never contain a character that needs escaping.
    expect(q.params).toContain('%50\\%%')
    expect(q.params.filter((p) => p === '%50\\%%')).toHaveLength(3)
    expect(q.params).toContain('%50%')
  })

  it('builds no LIKE at all for an empty search', async () => {
    const q = await threadSql({ search: '   ' })
    expect(q.sql).not.toMatch(/like \$\d+/i)
  })

  it('clamps a hand-typed thread limit to the ceiling', async () => {
    const q = await threadSql({ limit: 10_000 })
    // One row over the cap is fetched on purpose, to learn whether more exist.
    expect(q.params).toContain(MAX_THREAD_LIMIT + 1)
  })

  it('uses the default rather than NaN when the limit is not a number', async () => {
    const q = await threadSql({ limit: Number('not a number') })
    expect(q.params).toContain(DEFAULT_THREAD_LIMIT + 1)
    expect(q.params.some((p) => typeof p === 'number' && Number.isNaN(p))).toBe(false)
  })
})

describe('the message stream has an upper bound', () => {
  it('MAX_THREAD_MESSAGE_LIMIT is a real ceiling above the default', () => {
    // The stream cap used to be `Math.max(1, Math.trunc(limit))` — a floor with
    // no ceiling — so this constant is the fix, not decoration.
    expect(MAX_THREAD_MESSAGE_LIMIT).toBeGreaterThan(DEFAULT_THREAD_MESSAGE_LIMIT)
    expect(clampRowLimit(10_000, DEFAULT_THREAD_MESSAGE_LIMIT, MAX_THREAD_MESSAGE_LIMIT)).toBe(
      MAX_THREAD_MESSAGE_LIMIT,
    )
    expect(clampRowLimit(NaN, DEFAULT_THREAD_MESSAGE_LIMIT, MAX_THREAD_MESSAGE_LIMIT)).toBe(
      DEFAULT_THREAD_MESSAGE_LIMIT,
    )
  })
})
