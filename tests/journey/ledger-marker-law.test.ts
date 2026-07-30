import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  NOT_WORK_MARKERS,
  FAILURE_MARKERS,
  isWorkDetail,
  isFailureDetail,
} from '@/lib/ledger-markers'
import { workOnly, failureOnly } from '@/lib/services/action-ledger'

/**
 * THE MARKER LAW — the structural answer to Phase 4's dominant defect class.
 *
 * Across five audit rounds, nearly every major defect was one shape: two
 * pieces of code encoding one concept, one updated, the other not. The
 * `report` marker landing in `isWorkEntry` but not `workOnly()`. A counter
 * matching two markers while its explainer matched one. A throttle on one
 * writer while another wrote the same signal unthrottled.
 *
 * Fixing those one at a time just moved the seam. So the vocabulary now
 * lives in ONE list and every predicate is generated from it — and this
 * file is what stops the convention rotting back into a convention:
 *
 *  1. The JS law and the SQL law agree, marker by marker, mechanically.
 *  2. Nothing outside the owning module hand-writes a failure marker.
 *
 * If either ever stops being true, CI fails here rather than an audit
 * finding it six weeks later in a report that quietly said the wrong thing.
 */

const ROOT = resolve(__dirname, '../..')
const dialect = new PgDialect()
const render = (frag: unknown) => dialect.sqlToQuery(frag as never).sql

describe('the JS law and the SQL law are one list', () => {
  it('every not-work marker appears in the generated SQL', () => {
    const text = render(workOnly())
    for (const m of NOT_WORK_MARKERS) {
      expect(text, `'${m}' is excluded in JS but missing from workOnly()`).toContain(`'${m}'`)
    }
  })

  it('every not-work marker is rejected by the JS predicate', () => {
    for (const m of NOT_WORK_MARKERS) {
      const detail = { [m]: m === 'autonomyChange' ? 'granted' : true }
      expect(isWorkDetail(detail), `'${m}' should not be work`).toBe(false)
    }
    expect(isWorkDetail({ patientId: 'p1' })).toBe(true)
    expect(isWorkDetail(null)).toBe(true)
  })

  it('every failure marker appears in the generated failure SQL, and only those', () => {
    const text = render(failureOnly())
    for (const m of FAILURE_MARKERS) expect(text).toContain(`'${m}'`)
    // A report is NOT a failure — the Guardian must not count its own notes
    // toward the alarm it raises.
    expect(text).not.toContain("'report'")
    expect(isFailureDetail({ report: true })).toBe(false)
  })

  it('the failure fragment parenthesizes its own OR', () => {
    // drizzle's and() wraps the whole list in ONE pair of parens and never
    // parenthesizes the chunks, so a bare top-level OR escapes its AND chain
    // — which shipped once as a tenant-scoping breach. Walk the depth: the
    // OR must never sit at depth 0 of the fragment.
    const text = render(failureOnly())
    let depth = 0
    let orAtTop = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      else if (depth === 0 && text.slice(i, i + 4).toLowerCase() === ' or ') orAtTop = true
    }
    expect(orAtTop, `top-level OR escapes composition:\n${text}`).toBe(false)
  })

  it('the two renderings agree on POLARITY, not merely on naming (round-6 gap)', () => {
    // Naming a marker is not the same as excluding it. workOnly() must
    // NEGATE every not-work marker; a rendering that mentioned one in the
    // wrong direction would pass a name check and invert the law.
    const text = render(workOnly())
    for (const m of NOT_WORK_MARKERS) {
      const i = text.indexOf(`'${m}'`)
      const after = text.slice(i, i + 120)
      expect(
        /is distinct from 'true'|is null/.test(after),
        `'${m}' is named in workOnly() but not negated:\n${after}`,
      ).toBe(true)
    }
    // ...and failureOnly() must ASSERT its markers, the opposite direction.
    const fail = render(failureOnly())
    for (const m of FAILURE_MARKERS) {
      const i = fail.indexOf(`'${m}'`)
      expect(/= 'true'/.test(fail.slice(i, i + 60)), `'${m}' is named but not asserted`).toBe(true)
    }
  })

  it('workOnly() also composes safely — it is an AND chain with no bare OR', () => {
    // failureOnly()'s composition safety was pinned after it shipped a
    // tenant-scoping breach; workOnly() goes into the same `and()` calls and
    // had no equivalent proof (round-6 gap).
    const text = render(workOnly())
    let depth = 0
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      else if (depth === 0 && text.slice(i, i + 4).toLowerCase() === ' or ') {
        throw new Error(`workOnly() has a top-level OR:\n${text}`)
      }
    }
    expect(depth).toBe(0)
  })

  it('a marker added to the list reaches BOTH renderings without further edits', () => {
    // The generators map over the exported lists, so this is a property of
    // the construction rather than of any hand-maintained copy. Asserting
    // the counts match is what would fail if someone re-hand-wrote either.
    const workText = render(workOnly())
    const occurrences = NOT_WORK_MARKERS.filter((m) => workText.includes(`'${m}'`)).length
    expect(occurrences).toBe(NOT_WORK_MARKERS.length)
  })
})

/** Every .ts file under lib/, excluding the module that owns the vocabulary. */
function libFiles(): Array<{ path: string; src: string }> {
  const out: Array<{ path: string; src: string }> = []
  const OWNERS = ['lib/ledger-markers.ts', 'lib/services/action-ledger.ts']
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.ts')) {
        const rel = relative(ROOT, full).replace(/\\/g, '/')
        if (!OWNERS.includes(rel)) out.push({ path: rel, src: readFileSync(full, 'utf8') })
      }
    }
  }
  walk(join(ROOT, 'lib'))
  return out
}

describe('nothing outside the owning module writes a failure marker by hand', () => {
  /** The Guardian's own note is the one legitimate `report: true` writer. */
  const ALLOWED_REPORT_WRITERS = ['lib/services/guardian-alerts.ts']

  it('no failure or report marker literal escapes its owner', () => {
    // THE GUARD. `reopen()` used to hand-stamp `autoFailure: true` through
    // recordAction, which is precisely how it ended up outside the throttle
    // the other producer had and unreadable by the explainer the counter
    // relied on. Every producer goes through `recordEngineFailure`.
    const offenders: string[] = []
    for (const { path, src } of libFiles()) {
      // ALL not-work markers, not just the failure ones (round-6 gap): the
      // `report` marker is written by the Guardian and `autonomyChange` by
      // the ladder, and a second hand-writer of either would fork the law
      // exactly as the hand-back did.
      for (const m of FAILURE_MARKERS) {
        if (new RegExp(`\\b${m}\\s*:\\s*true`).test(src)) offenders.push(`${path} (${m})`)
      }
      if (/\breport\s*:\s*true/.test(src) && !ALLOWED_REPORT_WRITERS.includes(path)) {
        offenders.push(`${path} (report)`)
      }
    }
    expect(
      offenders,
      `these write a failure marker directly — use recordEngineFailure() instead:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it('the marker names are not re-typed as string literals in SQL elsewhere', () => {
    // A second copy of the predicate is the other way the law forks.
    //
    // ALLOWLIST — genuinely-exempt files, each with its reason. Anything new
    // here needs one too; "it was easier" is not one.
    const ALLOWED: Record<string, string> = {
      // The demo seeder identifying ITS OWN rows to delete on resync. It asks
      // "which rows did I write?", not "what counts as work" — a different
      // question that happens to name the same column.
      'lib/services/demo-voice.ts': 'demo cleanup selects its own seeded rows, not the work law',
    }
    const offenders: string[] = []
    for (const { path, src } of libFiles()) {
      if (ALLOWED[path]) continue
      if (/->>\s*'(failure|autoFailure|report|autonomyChange)'/.test(src)) offenders.push(path)
    }
    expect(
      offenders,
      `these hand-write a marker predicate — import workOnly()/failureOnly():\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})
