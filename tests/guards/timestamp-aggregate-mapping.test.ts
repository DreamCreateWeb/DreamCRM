import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { max, min, sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'

/**
 * AN AGGREGATE OVER A TIMESTAMP COLUMN KEEPS THAT COLUMN'S DRIVER MAPPER.
 *
 * `timestamp('start_time')` has no time zone, so drizzle's mapper for it reads
 * the raw text node-postgres hands back as UTC — literally `new Date(value +
 * '+0000')`. A bare `sql` expression is not a column, so it gets no mapper: the
 * same text arrives as a plain string, and the `new Date(...)` that follows
 * parses it in the HOST's zone instead.
 *
 * Same string, different instant. On a UTC server the two agree, which is
 * exactly why this is worth a guard rather than a comment — production is UTC
 * and `vitest.config.ts` pins `TZ=UTC`, so the whole class is invisible to
 * ordinary tests. It surfaces on a developer's machine, in a future non-UTC
 * runtime, or the day someone reuses the pattern somewhere that is neither.
 *
 * `max(column)` / `min(column)` are `sql`max(...)`.mapWith(column)` — the fix
 * is to use them rather than to remember the mapper.
 */

/** The text node-postgres actually returns for `timestamp`: no `T`, no `Z`. */
const DRIVER_TEXT = '2026-03-01 14:30:00'
const AS_UTC = Date.UTC(2026, 2, 1, 14, 30, 0)

/**
 * Every drizzle SQL expression carries a `decoder`; only the aggregate helpers
 * surface it on their public type. Reaching it is the whole point of these
 * tests, so the narrowing happens once, here.
 */
function decoderOf(expr: unknown): { mapFromDriverValue: (v: unknown) => unknown } {
  return (expr as { decoder: { mapFromDriverValue: (v: unknown) => unknown } }).decoder
}

describe('drizzle aggregates carry the column mapper', () => {
  it('max() over a timestamp column decodes the driver text as UTC', () => {
    const decoded = decoderOf(max(schema.appointment.startTime)).mapFromDriverValue(DRIVER_TEXT)
    expect(decoded).toBeInstanceOf(Date)
    expect((decoded as Date).getTime()).toBe(AS_UTC)
  })

  it('min() over the same column does too', () => {
    const decoded = decoderOf(min(schema.appointment.startTime)).mapFromDriverValue(DRIVER_TEXT)
    expect((decoded as Date).getTime()).toBe(AS_UTC)
  })

  it('a bare sql`max(...)` does NOT — the negative control', () => {
    // Feeding an ISO string here would pass either way, which is how the first
    // version of this guard failed to guard anything.
    const decoded = decoderOf(sql`max(${schema.appointment.startTime})`).mapFromDriverValue(DRIVER_TEXT)
    expect(decoded).toBe(DRIVER_TEXT)
    expect(decoded).not.toBeInstanceOf(Date)
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

/**
 * Does this column's driver mapper actually TRANSFORM the raw text?
 *
 * Only lossy-mapper columns matter. `max(orders.order_number)` over a text
 * column loses nothing, because text's mapper is the identity — flagging it
 * would be noise, and a guard that cries wolf gets an allowlist and then gets
 * ignored. Asking the column itself is what keeps this precise as the schema
 * grows: a `numeric` or `date` column added tomorrow is covered without anyone
 * remembering to extend a list of type names.
 */
function hasLossyMapper(column: unknown): boolean {
  const map = (column as { mapFromDriverValue?: (v: unknown) => unknown } | null)?.mapFromDriverValue
  if (typeof map !== 'function') return false
  try {
    return map.call(column, DRIVER_TEXT) !== DRIVER_TEXT
  } catch {
    // A mapper that throws on this shape is not one this guard can reason
    // about; leave it to its own tests rather than guess.
    return false
  }
}

/** `schema.appointment.startTime` → the column object, or undefined. */
function resolveColumn(path: string): unknown {
  return path
    .split('.')
    .slice(1) // drop the leading `schema`
    .reduce<unknown>(
      (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
      schema as unknown,
    )
}

describe('no service hand-rolls an aggregate over a mapped column', () => {
  const root = process.cwd()
  const files = walk(resolve(root, 'lib'))

  it('is actually looking at lib/', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('the resolver and the mapper probe both work', () => {
    // Two ways this guard could pass while inspecting nothing: the column path
    // stops resolving, or every mapper reads as lossless.
    expect(resolveColumn('schema.appointment.startTime')).toBeTruthy()
    expect(hasLossyMapper(resolveColumn('schema.appointment.startTime'))).toBe(true)
    expect(hasLossyMapper(resolveColumn('schema.appointment.id'))).toBe(false)
  })

  it('uses max()/min() wherever the column mapper matters', () => {
    const pattern = /sql(?:<[^>]*>)?`\s*(?:max|min)\(\$\{(schema\.[A-Za-z0-9_.]+)\}\)\s*`(?!\s*\.mapWith)/g
    const offenders: string[] = []

    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const m of Array.from(src.matchAll(pattern))) {
        const column = resolveColumn(m[1])
        if (!column || !hasLossyMapper(column)) continue // text/identity: nothing to lose
        offenders.push(`${file.slice(root.length + 1).replace(/\\/g, '/')} — ${m[1]}`)
      }
    }

    expect(
      offenders,
      `These build a max()/min() by hand over a column whose driver mapper does\n` +
        `real work, so the mapper is lost and the raw text parses in the host's\n` +
        `zone. Use drizzle's max()/min(), or add .mapWith(<the column>):\n` +
        offenders.join('\n'),
    ).toEqual([])
  })
})
