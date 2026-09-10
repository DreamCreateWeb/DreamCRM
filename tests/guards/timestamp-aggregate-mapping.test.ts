import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'
import { max, min, sql } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { sqlTemplates } from '../helpers/sql-templates'

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
 * `max(column)` / `min(column)` are `sql`max(...)`.mapWith(column)` — where the
 * aggregate's whole body is one column, the fix is to use them rather than to
 * remember the mapper. Where it is not (a `case` or a `least()` inside), the
 * fix is an explicit `.mapWith(<the column>)`.
 *
 * SCOPE, stated so it is a known edge rather than a surprise: the scan keys on
 * `max(` / `min(` by name. `sql<Date>`coalesce(${tsCol}, now())`` or a bare
 * `least(${a}, ${b})` drops the mapper identically and is NOT covered. The
 * aggregates are where this has actually bitten; the rest is named here so the
 * next person knows the boundary instead of inferring a guarantee.
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

/* ------------------------------------------------------------------------ *
 * The repo scan.
 *
 * The first version of this scan matched a template whose ENTIRE body was
 * `max(${schema.a.b})`. That found two sites in the whole tree, both over text
 * columns, so the offenders list was empty for the trivial reason that the
 * candidate list was empty — while nine real instances sat in `main`. Two
 * shapes slipped past it, and both are represented in the fixtures below:
 *
 *   - a column imported DIRECTLY from a schema module, so no `schema.` prefix;
 *   - an aggregate wrapping a `case` / `least()` rather than a bare column.
 *
 * So the scan now walks `sql` templates properly, resolves every interpolation
 * inside a max()/min() span, and — the part that was missing — the tests below
 * assert it actually finds things. An empty offenders list must never again be
 * indistinguishable from an empty candidate list.
 * ------------------------------------------------------------------------ */

/** A hand-rolled aggregate the scan found, and the column that makes it matter. */
interface Candidate {
  file: string
  column: string
  mapped: boolean
}

/**
 * Deliberately not fixed in this PR, with a reason and a follow-up.
 *
 * The ALLOWLIST doubles as the scan's canary: every entry must still be FOUND
 * by the scan. If one stops being found it was either fixed (drop the entry) or
 * the scan broke — and both of those deserve a red test rather than silence.
 */
const ALLOWED: Array<{ file: string; why: string }> = [
  // Empty, and that is the point: `patient-journey.ts` was the last entry and
  // DREAMCRM-13 fixed its ten aggregates, so the entry went with it. The
  // `candidates > 0` floor below does NOT rest on this list being non-empty —
  // those ten sites are still FOUND by the scan, just found already-mapped.
]

/**
 * The trees the scan covers.
 *
 * `app/` reads zero candidates today, but this repo runs raw SQL from server
 * actions (`app/(default)/shop/actions.ts` and friends), so it is one file away
 * from mattering and the cost of including it is this line.
 */
const SCANNED_ROOTS = ['lib', 'app'] as const

function scannedFiles(root: string): string[] {
  return SCANNED_ROOTS.flatMap((dir) => walk(resolve(root, dir)))
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

/**
 * Does this column's mapper turn the driver's text into a Date?
 *
 * That — not "does the mapper do anything" — is the property this guard is
 * about, and getting it wrong in the loose direction cries wolf. A first cut
 * asked whether the mapper CHANGED the text, which flagged
 * `coalesce(max(${schema.tasks.position}), 0)::int` over an `integer` column:
 * its mapper returns `NaN` for that text, so it "changed" it, but pg hands
 * int4 back as a number and the cast says so. Nothing is lost there.
 *
 * Losing a Date mapper is different in kind: the value still arrives, still
 * looks plausible, and is silently the wrong instant. Asking the column itself
 * keeps this precise as the schema grows — a `date` or `timestamptz` column
 * added tomorrow is covered without anyone extending a list of type names.
 */
function mapsToDate(column: unknown): boolean {
  const map = (column as { mapFromDriverValue?: (v: unknown) => unknown } | null)?.mapFromDriverValue
  if (typeof map !== 'function') return false
  try {
    return map.call(column, DRIVER_TEXT) instanceof Date
  } catch {
    // A mapper that throws on this shape is not one this guard can reason
    // about; leave it to its own tests rather than guess.
    return false
  }
}

/**
 * `schema.appointment.startTime` AND `formSubmission.submittedAt` → the column.
 *
 * A service may reach the schema through the namespace or import the table
 * straight out of `@/lib/db/schema/clinic`. Both spellings name the same
 * object, and the first version of this scan only understood one of them —
 * which is precisely how `forms.ts` stayed invisible.
 */
function resolveColumn(path: string): unknown {
  const parts = path.split('.').filter(Boolean)
  if (parts[0] === 'schema') parts.shift()
  if (parts.length < 2) return undefined
  return parts.reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    schema as unknown,
  )
}

/** The `${...}` interpolations sitting inside a max(...) / min(...) span. */
function aggregateInterpolations(template: string): string[] {
  const out: string[] = []
  const call = /\b(?:max|min)\s*\(/g
  for (let m = call.exec(template); m; m = call.exec(template)) {
    // Walk to the matching close paren so `min(case … least(a, b) … end)` is
    // taken whole rather than cut at the first `)`.
    let depth = 1
    let i = m.index + m[0].length
    for (; i < template.length && depth > 0; i++) {
      if (template[i] === '(') depth++
      else if (template[i] === ')') depth--
    }
    const span = template.slice(m.index, i)
    for (const ref of Array.from(span.matchAll(/\$\{\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)+)\s*\}/g))) {
      out.push(ref[1])
    }
  }
  return out
}

/*
 * `sqlTemplates()` used to live here. It now lives in
 * `tests/helpers/sql-templates.ts`, because the per-site pin in
 * `tests/journey/journey-timestamp-mapping.test.ts` needs the same answer to
 * "where does this template end?" and its own attempt at it was wrong — an
 * unbounded lazy span that ran past its template onto the next one's
 * `.mapWith`. Same walker, same `mapped` rule; the helper additionally reports
 * each template's span and the argument of the `.mapWith` that follows.
 */


/**
 * Everything the scan considers, before the allowlist is applied.
 *
 * DELIBERATELY counts a hit whether or not it is already `.mapWith`-ed. That
 * is what keeps the `candidates > 0` floor standing on its own: when
 * DREAMCRM-13 fixes `patient-journey.ts` and the ALLOWLIST empties, those
 * eight sites are still FOUND — just found already-correct. A version that
 * only collected offenders would see the floor collapse to zero on the day the
 * repo got clean, and the guard would go back to passing on nothing.
 *
 * The offender filter therefore lives at the assertion, not here.
 */
function scanCandidates(files: string[], root: string): Candidate[] {
  const found: Candidate[] = []
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    for (const t of sqlTemplates(src)) {
      for (const path of aggregateInterpolations(t.body)) {
        const column = resolveColumn(path)
        if (!column || !mapsToDate(column)) continue // not a date column: nothing to lose
        found.push({
          file: file.slice(root.length + 1).replace(/\\/g, '/'),
          column: path,
          mapped: t.mapped,
        })
      }
    }
  }
  return found
}

describe('the scan itself works', () => {
  const root = process.cwd()

  /**
   * THE THREE SHAPES THAT MUST BE VISIBLE. None of these may be dropped.
   *
   * They read like near-identical documentation and they are not: each one is
   * a separate HISTORICAL ESCAPE. The namespaced case is all the first version
   * of this scan could see; the direct-import case is how `forms.ts` hid; the
   * `case`/`least` case is how `patient-journey.ts`'s eight hid. Merging them
   * into "one representative case" re-opens whichever two you drop.
   *
   * These are also the guard's LOAD-BEARING assertions, which is not obvious.
   * The allowlist canary below cannot cover them: `patient-journey.ts` is the
   * *namespaced* spelling, so if a future edit broke only direct-import
   * resolution — precisely the bug that hid `forms.ts` — the canary would
   * still find its file, `candidates > 0` would still pass, and a new
   * `forms.ts`-shaped instance would go invisible again. Only fixture #2 runs
   * that spelling end to end. The canary is a staleness detector for the
   * allowlist; these are the coverage.
   */
  const FIXTURES: Array<{ name: string; src: string; expect: string[] }> = [
    {
      name: 'a namespaced column — the shape the first version caught',
      src: 'const x = sql<Date>`max(${schema.appointment.startTime})`',
      expect: ['schema.appointment.startTime'],
    },
    {
      name: 'a DIRECTLY imported table — the shape that hid forms.ts',
      src: 'const x = sql<Date | string | null>`max(${formSubmission.submittedAt})`',
      expect: ['formSubmission.submittedAt'],
    },
    {
      name: 'an aggregate wrapping case/least — the shape that hid patient-journey.ts',
      src:
        'const x = sql<Date | null>`min(\n  case when ${A} = 1\n' +
        '       then least(coalesce(${schema.appointment.completedAt}, ${schema.appointment.startTime}), ${schema.appointment.startTime})\n' +
        '  end\n)`',
      expect: ['schema.appointment.completedAt', 'schema.appointment.startTime'],
    },
  ]

  for (const f of FIXTURES) {
    it(`sees ${f.name}`, () => {
      const [t] = sqlTemplates(f.src)
      expect(t, 'the template was not extracted at all').toBeTruthy()
      const cols = aggregateInterpolations(t.body).filter((p) => mapsToDate(resolveColumn(p)))
      for (const want of f.expect) expect(cols).toContain(want)
    })
  }

  it('does not flag an aggregate over a text column', () => {
    const [t] = sqlTemplates('const x = sql<string>`max(${schema.orders.orderNumber})`')
    const cols = aggregateInterpolations(t.body).filter((p) => mapsToDate(resolveColumn(p)))
    expect(cols).toEqual([])
  })

  it('does not flag an aggregate over an integer column', () => {
    const [t] = sqlTemplates('const x = sql<number>`coalesce(max(${schema.tasks.position}), 0)::int`')
    const cols = aggregateInterpolations(t.body).filter((p) => mapsToDate(resolveColumn(p)))
    expect(cols).toEqual([])
  })

  it('does not flag a non-aggregate reference to the same column', () => {
    // `where ${col} > x` is not an aggregate and loses no mapper.
    const [t] = sqlTemplates('const x = sql`${schema.appointment.startTime} > now()`')
    expect(aggregateInterpolations(t.body)).toEqual([])
  })

  it('still COUNTS an already-fixed site — the floor survives a clean repo', () => {
    // When DREAMCRM-13 lands and the allowlist empties, `candidates > 0` has to
    // keep standing on something. It does, because scanCandidates collects a
    // hit regardless of `mapped` and the offender filter runs at the assertion.
    // Written as a test rather than a comment so a future "optimisation" that
    // skips mapped templates fails here instead of silently un-flooring the
    // guard.
    const fixed =
      'const x = sql<Date | null>`min(case when ${A} = 1 then ${schema.appointment.createdAt} end)`' +
      '.mapWith(schema.appointment.createdAt)'
    const [t] = sqlTemplates(fixed)
    expect(t.mapped).toBe(true)
    const cols = aggregateInterpolations(t.body).filter((c) => mapsToDate(resolveColumn(c)))
    expect(cols, 'a fixed site must still be a candidate, just not an offender').toContain(
      'schema.appointment.createdAt',
    )
  })

  it('treats a following .mapWith as the fix', () => {
    const [t] = sqlTemplates(
      'const x = sql<Date>`max(${schema.appointment.startTime})`.mapWith(schema.appointment.startTime)',
    )
    expect(t.mapped).toBe(true)
  })

  it('resolves both spellings of the same column to the same object', () => {
    expect(resolveColumn('schema.appointment.startTime')).toBe(schema.appointment.startTime)
    expect(resolveColumn('formSubmission.submittedAt')).toBe(schema.formSubmission.submittedAt)
  })

  it('the mapper probe separates a timestamp from an id and an integer', () => {
    expect(mapsToDate(resolveColumn('schema.appointment.startTime'))).toBe(true)
    expect(mapsToDate(resolveColumn('schema.appointment.id'))).toBe(false)
    // The false positive that made the first cut of this probe cry wolf:
    // an integer column's mapper transforms the text, but loses nothing.
    expect(mapsToDate(resolveColumn('schema.tasks.position'))).toBe(false)
  })

  it('finds real candidates in lib/ — an empty offenders list must mean something', () => {
    // THE hole in the first version: it reported zero offenders out of zero
    // candidates and read as "the repo is clean". Every allowlisted file has
    // to still be found, or the entry is stale and so is the guard.
    const candidates = scanCandidates(scannedFiles(root), root)
    expect(candidates.length).toBeGreaterThan(0)

    const files = new Set(candidates.map((c) => c.file))
    for (const a of ALLOWED) {
      expect(
        files.has(a.file),
        `${a.file} is allowlisted but the scan no longer finds it. Either it was ` +
          `fixed — drop the entry — or the scan stopped seeing this shape.`,
      ).toBe(true)
    }
  })
})

describe('no service hand-rolls an aggregate over a mapped column', () => {
  const root = process.cwd()
  const files = scannedFiles(root)

  it('is actually looking at the source trees', () => {
    expect(files.length).toBeGreaterThan(100)
    // Both roots, not just whichever one happens to resolve.
    expect(files.some((f) => f.includes(`${sep}lib${sep}`))).toBe(true)
    expect(files.some((f) => f.includes(`${sep}app${sep}`))).toBe(true)
  })

  it('uses max()/min() or .mapWith() wherever the column mapper matters', () => {
    const offenders = scanCandidates(files, root)
      .filter((c) => !c.mapped)
      .filter((c) => !ALLOWED.some((a) => a.file === c.file))
      .map((c) => `${c.file} — ${c.column}`)

    expect(
      offenders,
      `These build a max()/min() by hand over a column whose driver mapper does\n` +
        `real work, so the mapper is lost and the raw text parses in the host's\n` +
        `zone. Use drizzle's max()/min() where the body is one column, or add\n` +
        `.mapWith(<the column>) where it is not:\n` +
        Array.from(new Set(offenders)).join('\n'),
    ).toEqual([])
  })

  it('every allowlist entry carries a real reason', () => {
    for (const a of ALLOWED) {
      expect(a.why.length, `${a.file} needs a reason, not a rubber stamp`).toBeGreaterThan(60)
    }
  })
})
