import { describe, it, expect } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { parseActivation, earliestOf } from '@/lib/activation'
import { stampFragment, unstampedGuard } from '@/lib/services/activation'

/**
 * THE BOUNDARY TEST for the stamp's raw SQL (the Phase-3 law: any new raw
 * SQL renders through drizzle's own dialect). The merge must coalesce a
 * NULL column, build the key from a bound parameter (never interpolated),
 * and the guard must read the key with `->>` so an unset key — or a NULL
 * column — passes and a set key does not.
 */
const dialect = new PgDialect()
const render = (frag: unknown) => dialect.sqlToQuery(frag as never)

describe('stampActivation SQL', () => {
  it('merges onto a coalesced jsonb with the key and the instant as bound parameters', () => {
    const q = render(stampFragment('a1', new Date('2026-10-12T15:00:00Z')))
    expect(q.sql).toMatch(/coalesce\("clinic_profile"\."activation", '\{\}'::jsonb\) \|\| jsonb_build_object\(\$1::text, to_jsonb\(\$2::text\)\)/)
    expect(q.params).toEqual(['a1', '2026-10-12T15:00:00.000Z'])
  })

  it('the write-once guard admits a NULL column or an unset key only', () => {
    const q = render(unstampedGuard('a2'))
    expect(q.sql).toMatch(/\("clinic_profile"\."activation" is null or "clinic_profile"\."activation"->>\$1::text is null\)/)
    expect(q.params).toEqual(['a2'])
  })
})

describe('parseActivation', () => {
  it('reads the stored shape, drops junk keys and bad dates, never throws', () => {
    expect(parseActivation(null).a1).toBeNull()
    expect(parseActivation('nope').a1).toBeNull()
    expect(parseActivation([1]).a1).toBeNull()
    const a = parseActivation({ a1: '2026-10-01T00:00:00.000Z', a2: 'not a date', zz: '2026-10-01T00:00:00.000Z', a3: 5 })
    expect(a.a1).toEqual(new Date('2026-10-01T00:00:00.000Z'))
    expect(a.a2).toBeNull()
    expect(a.a3).toBeNull()
    expect('zz' in a).toBe(false)
  })

  it('earliestOf picks the earliest real date and ignores nulls and invalid dates', () => {
    const d1 = new Date('2026-10-01T00:00:00Z')
    const d2 = new Date('2026-10-05T00:00:00Z')
    expect(earliestOf(null, d2, undefined, d1, new Date('x'))).toEqual(d1)
    expect(earliestOf(null, undefined)).toBeNull()
  })
})
