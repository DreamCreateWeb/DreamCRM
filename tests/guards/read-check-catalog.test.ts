import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { READ_CHECKS, findReadCheck, readCheckIds, CREDENTIAL_COLUMN_LIST } from '@/lib/read-checks'

/**
 * THE CATALOG IS THE SECURITY ARGUMENT.
 *
 * `/api/admin/read-check` is only defensible because the SQL it runs cannot
 * come from the caller: on a leaked ADMIN_READ_SECRET an attacker gets exactly
 * these entries and nothing else. These tests pin the properties that claim
 * rests on, so the day someone adds a parameter "just for this one check" it
 * fails a required check instead of passing review on a reviewer's attention.
 */
describe('read-check catalog', () => {
  it('ids are unique and lookup is exact', () => {
    const ids = readCheckIds()
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(findReadCheck(id)?.id).toBe(id)
  })

  it('an unknown id resolves to nothing', () => {
    for (const bogus of ['', 'nope', 'duplicate-stripe-accounts ', 'DUPLICATE-STRIPE-ACCOUNTS', '__proto__', 'toString']) {
      expect(findReadCheck(bogus)).toBeUndefined()
    }
  })

  it('no entry carries a placeholder or an interpolation', () => {
    // The whole no-parameters-in-v1 line, as an assertion. A `$1`, a `${`, or a
    // string concatenation in the SQL means something from outside can reach
    // it — at which point this route is worse than the options it beat.
    for (const c of READ_CHECKS) {
      expect(c.sql, `${c.id} contains a bind placeholder`).not.toMatch(/\$\d/)
      expect(c.sql, `${c.id} contains a template interpolation`).not.toMatch(/\$\{/)
    }
  })

  it('every entry is a single read-only statement', () => {
    for (const c of READ_CHECKS) {
      expect(c.sql.trim().toLowerCase().startsWith('select'), `${c.id} does not start with select`).toBe(true)
      // No statement batching: one `;` would let a second statement ride along.
      expect(c.sql.includes(';'), `${c.id} contains a semicolon`).toBe(false)
      expect(
        /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy)\b/i.test(c.sql),
        `${c.id} contains a write keyword`,
      ).toBe(false)
    }
  })

  it('every entry bounds its own result set', () => {
    // The route's MAX_ROWS caps AFTER materialisation — `result.rows.slice(0,
    // 100)` runs once the whole result set is in memory, so it bounds what is
    // logged, not what the production primary has to build. The entry's own
    // LIMIT is the bound that exists before that. (Capping a gate check is
    // safe: `duplicate-stripe-accounts` is judged empty-or-not, and 100
    // duplicates is already a catastrophe.)
    for (const c of READ_CHECKS) {
      expect(/\blimit\s+\d+\s*$/i.test(c.sql.trim()), `${c.id} does not end with a LIMIT`).toBe(true)
    }
  })

  it('every entry declares its output and its tenant scope', () => {
    for (const c of READ_CHECKS) {
      expect(c.returns.length, `${c.id} must declare what it returns (the no-PHI rule is reviewed against it)`)
        .toBeGreaterThan(10)
      expect(c.why.length).toBeGreaterThan(40)
      expect(['cross-tenant-by-design', 'scoped', 'no-tenant-data']).toContain(c.tenantScope)
    }
  })

  it('no entry returns a column the role may read but must never log', () => {
    // The second control: `shop_coupon.code` is legitimately readable and must
    // never leave the database. See NAME_INVISIBLE in read-only-role-revokes.
    for (const c of READ_CHECKS) {
      expect(/\bshop_coupon\b/i.test(c.sql), `${c.id} touches shop_coupon — codes must never reach an Actions log`)
        .toBe(false)
    }
  })

  it('the privilege check asks about every credential column', () => {
    const entry = findReadCheck('readonly-role-privileges')!
    for (const [table, column] of CREDENTIAL_COLUMN_LIST) {
      expect(entry.sql, `the privilege check does not assert about ${table}.${column}`).toContain(`('${table}','${column}')`)
    }
  })

  it('the privilege check asks about current_user, not a hardcoded role', () => {
    const entry = findReadCheck('readonly-role-privileges')!
    expect(entry.sql).toContain('current_user')
    expect(entry.sql).not.toContain("'dreamcrm_readonly'")
    // information_schema.column_privileges sees only DIRECT grants, so it would
    // report clean on a privilege inherited via PUBLIC or role membership —
    // exactly the mistake this check exists to catch.
    expect(entry.sql).not.toMatch(/information_schema/i)
  })

  it('the dispatch workflow offers exactly the catalog', () => {
    // A catalog entry nobody can dispatch is dead; a dispatch option with no
    // entry behind it is a 400 that looks like a broken deploy.
    const wf = readFileSync('.github/workflows/read-check.yml', 'utf8')
    const options = Array.from(wf.matchAll(/^\s{10}- ([a-z0-9-]+)$/gm)).map((m) => m[1]!)
    expect(options.sort()).toEqual(readCheckIds().sort())
  })
})

describe('the read-check route', () => {
  const raw = readFileSync('app/api/admin/read-check/route.ts', 'utf8')
  // Assert about the CODE. The route's comments deliberately spell out the
  // fallback they forbid ("never `?? process.env.DATABASE_URL`"), and a guard
  // that reads prose would fail on the warning against the very thing it is
  // checking for — while a guard that then got loosened to pass would stop
  // seeing the real thing.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('never falls back to the read-write connection', () => {
    // The single most important line in the design: a fallback turns a
    // read-only endpoint into a write-capable one at the exact moment somebody
    // is misconfiguring production.
    expect(raw).toContain('DATABASE_URL_READONLY')
    expect(/DATABASE_URL_READONLY\s*(\|\||\?\?)/.test(src), 'route falls back when the read-only URL is unset').toBe(
      false,
    )
    expect(/process\.env\.DATABASE_URL\b(?!_)/.test(src), 'route reads the read-write DATABASE_URL').toBe(false)
  })

  it('uses its own small pool, not the shared db', () => {
    expect(src).toMatch(/max:\s*2/)
    expect(/from '@\/lib\/db'/.test(src) && /\bdb\b\s*}/.test(src)).toBe(false)
  })

  it('takes its SQL from the catalog only', () => {
    expect(src).toContain('findReadCheck')
    expect(src).toContain('check.sql')
    // No string-built SQL anywhere in the route.
    expect(/`\s*select/i.test(src)).toBe(false)
  })

  it('does not echo the request or the driver error back to the caller', () => {
    expect(src).not.toMatch(/error:\s*\(err as Error\)\.message/)
    expect(src).toContain("error: 'check failed'")
  })
})
