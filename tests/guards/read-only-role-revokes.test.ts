import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CREDENTIAL_COLUMN_LIST } from '@/lib/read-checks'

/**
 * THE READ-ONLY ROLE CANNOT READ A CREDENTIAL.
 *
 * `dreamcrm_readonly` (scripts/readonly-role.sql) gets blanket SELECT and then
 * has the credential-bearing tables taken back. That shape is only as good as
 * the list of tables taken back, and the list is exactly the kind of thing that
 * is correct on the day it is written and wrong three schema additions later.
 * So this asserts, in both directions, that the list still describes the tree.
 *
 * WHAT THIS GUARD CANNOT DO, stated plainly because a green run here is going
 * to be read as "the role is safe":
 *
 *   * It matches COLUMN NAMES. `verification.value` holds password-reset
 *     material and matches nothing — not `token`, not `secret`, not `key`. It
 *     is protected only because that whole table is revoked for other reasons.
 *     That is what NAME_INVISIBLE below is for, and it is hand-maintained: the
 *     pattern is a net with a known hole, not a proof.
 *   * It reads the committed SQL. EDITING THAT FILE DOES NOT CHANGE PRODUCTION.
 *     A new credential column can be correctly revoked here, pass CI, and still
 *     be readable in production because nobody ran the REVOKE. The only thing
 *     that catches that is the `readonly-role-privileges` check, dispatched
 *     against the live database — which is why it is scheduled daily.
 *
 * So: green here means "the committed script still describes the schema." It
 * does not mean the database agrees.
 */

const SCHEMA_DIR = 'lib/db/schema'
const ROLE_SQL = 'scripts/readonly-role.sql'

/**
 * Read a file with line endings normalised to LF.
 *
 * Not a nicety. `\r` is a LINE TERMINATOR in JavaScript regexes, so `.` does
 * not match it and `/--.*$/` never reaches the end of a CRLF line — the
 * comment-stripping below silently did nothing, `revokedTables()` returned an
 * empty set, and this guard failed on a Windows checkout while passing in CI.
 * Caught by running the red runs locally; it would otherwise have been found by
 * whoever next cloned the repo on Windows, who would most likely have
 * "fixed" it by loosening the assertion.
 *
 * (Python's `.` DOES match `\r`, which is why the scan that produced this
 * list in the first place was unaffected. Two tools, two answers, same file.)
 */
function readLf(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n?/g, '\n')
}

/**
 * Widened from the original `token|secret|password|api_key`, which missed
 * `app_key`, `customer_key_encrypted`, `automation_key` and `idempotency_key` —
 * all present in the tree. A broad pattern plus named exemptions survives
 * review; a narrow one that silently matches nothing does not.
 */
const CREDENTIAL_NAME = /(token|secret|password|key|credential)/i

/**
 * Columns the pattern matches that are NOT credentials. A reason each, and the
 * stale-exemption test below fails any entry that stops matching a real column,
 * so a narrow allowance cannot outlive its subject and become a blanket pardon.
 */
const BENIGN: Array<{ table: string; column: string; why: string }> = [
  {
    table: 'connected_apps',
    column: 'app_key',
    why: 'half of the composite PK (user_id, app_key); an app identifier like "gmail", not a credential',
  },
  {
    table: 'campaigns',
    column: 'automation_key',
    why: 'deterministic dedupe key ("birthday:org_x:2026-06-18") so a cron re-run finds the existing row',
  },
  {
    table: 'patient_followup',
    column: 'rule_key',
    why: 'deterministic dedupe key for rule-created follow-ups ("recall:<patientId>:<YYYY-MM>")',
  },
  { table: 'proposal', column: 'source_key', why: "the generator's dedupe anchor — one proposal per piece of work" },
  { table: 'rate_limit', column: 'key', why: 'the fixed-window rate-limit bucket key ("{action}:{ip}")' },
  {
    table: 'referral_payout',
    column: 'idempotency_key',
    why:
      'a one-way digest ("rpo_" + sha256(partnerId:claimedIds)) of internal ids. Authorises nothing ' +
      'without the Stripe secret key, and the anti-double-pay control is the unique DB claim beside ' +
      'it rather than the string. Judged deliberately because it is the one allowlist entry on a ' +
      'money table.',
  },
]

/**
 * Credential columns the pattern CANNOT see, and the verdict on each. Two kinds
 * of verdict on purpose, because the role's grants and the catalog's output
 * rule are different controls:
 *
 *   'revoked'                — the role must not be able to read it at all.
 *   'readable-never-returned'— safe for the role to read, must never appear in
 *                              a check's result (results go to a shared log).
 *
 * The list is more useful as *considered* than as *protected*: an entry here is
 * a column someone looked at and made a call on.
 */
const NAME_INVISIBLE: Array<{
  table: string
  column: string
  verdict: 'revoked' | 'readable-never-returned'
  why: string
}> = [
  {
    table: 'verification',
    column: 'value',
    verdict: 'revoked',
    why: "better-auth's password-reset and email-verification material. Named `value`, so no pattern sees it.",
  },
  {
    table: 'shop_coupon',
    column: 'code',
    verdict: 'readable-never-returned',
    why:
      'a coupon code is meant to reach customers and authenticates nobody, so it is not a credential ' +
      'and the table stays readable. But dumping every clinic\'s discount codes into a shared Actions ' +
      'log would be a cross-tenant money leak, so no catalog entry may return it.',
  },
]

type Col = { table: string; column: string; file: string; line: number }

/**
 * Parse every `pgTable` in the schema tree. BOTH declaration forms — the
 * original version of this scan tracked only `pgTable('name'` on one line, so
 * for every table written `pgTable(\n  'name',` it kept attributing columns to
 * the LAST table it had seen. That produced four confidently-wrong entries in
 * the first draft of the revoke list (and would have made the script ERROR
 * partway, leaving everything after it unapplied). Hence this test's own first
 * assertion: the parser has to find a plausible number of tables.
 */
function schemaColumns(): { columns: Col[]; tableCount: number } {
  const columns: Col[] = []
  const tables = new Set<string>()
  for (const file of readdirSync(SCHEMA_DIR)) {
    if (!file.endsWith('.ts')) continue
    const lines = readLf(join(SCHEMA_DIR, file)).split('\n')
    let current: string | null = null
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      const inline = /=\s*pgTable\(\s*'([^']+)'/.exec(line)
      if (inline) {
        current = inline[1]!
        tables.add(current)
      } else if (/=\s*pgTable\(\s*$/.test(line)) {
        const next = /^\s*'([^']+)'/.exec(lines[i + 1] ?? '')
        if (next) {
          current = next[1]!
          tables.add(current)
        }
      }
      const col = /^\s*\w+:\s*(?:text|varchar|char)\(\s*'([^']+)'/.exec(line)
      if (col && current) columns.push({ table: current, column: col[1]!, file, line: i + 1 })
    }
  }
  return { columns, tableCount: tables.size }
}

/** The tables named in the REVOKE SELECT ... FROM dreamcrm_readonly statement. */
function parseRevoked(raw: string): Set<string> {
  const sql = raw.replace(/\r\n?/g, '\n')
  const block = /REVOKE\s+SELECT\s+ON([\s\S]*?)FROM\s+dreamcrm_readonly/i.exec(sql)
  if (!block) return new Set()
  const names = block[1]!
    .split('\n')
    .map((l) => l.replace(/--.*$/, '').trim().replace(/,$/, '').trim())
    .filter((l) => /^[a-z_][a-z0-9_]*$/.test(l))
  return new Set(names)
}

function revokedTables(): Set<string> {
  return parseRevoked(readFileSync(ROLE_SQL, 'utf8'))
}

const FIX =
  'Add it to the REVOKE list in scripts/readonly-role.sql AND to CREDENTIAL_COLUMNS in ' +
  'lib/read-checks.ts (both, deliberately — one changes production, the other notices drift). ' +
  'Then remember: editing the script does not change production. Run the REVOKE against the ' +
  'database, dispatch `readonly-role-privileges`, and confirm zero rows.'

describe('the read-only role cannot read a credential', () => {
  const { columns, tableCount } = schemaColumns()
  const revoked = revokedTables()

  it('the schema parser did not silently break', () => {
    // If the parser regresses to single-line-only, this collapses long before
    // the assertions below start reporting a clean tree for the wrong reason.
    expect(tableCount).toBeGreaterThanOrEqual(120)
    expect(columns.length).toBeGreaterThanOrEqual(500)
  })

  it('the REVOKE statement was found and is not empty', () => {
    expect(revoked.size).toBeGreaterThanOrEqual(15)
  })

  it('the parse does not depend on line endings', () => {
    // The original draft did. `\r` is a line terminator in JS regexes, so `.`
    // cannot match it and `/--.*$/` never reached the end of a CRLF line —
    // comment stripping did nothing, every name failed the `^[a-z_]+$` test,
    // and the set came back EMPTY. Empty means "no table is revoked", which
    // this guard would then have reported as a tree full of offenders: a
    // failure loud enough to get "fixed" by loosening the assertion.
    const lf = readFileSync(ROLE_SQL, 'utf8').replace(/\r\n?/g, '\n')
    const crlf = lf.replace(/\n/g, '\r\n')
    expect(parseRevoked(crlf)).toEqual(parseRevoked(lf))
    expect(parseRevoked(crlf).size).toBeGreaterThanOrEqual(15)
  })

  it('every credential-looking column lives in a revoked table', () => {
    const benign = new Set(BENIGN.map((b) => `${b.table}.${b.column}`))
    const offenders = columns
      .filter((c) => CREDENTIAL_NAME.test(c.column))
      .filter((c) => !benign.has(`${c.table}.${c.column}`))
      .filter((c) => !revoked.has(c.table))
      .map((c) => `${c.table}.${c.column} (${c.file}:${c.line})`)

    expect(
      offenders,
      `These columns look like credentials and their table is NOT revoked from dreamcrm_readonly.\n${FIX}`,
    ).toEqual([])
  })

  it('every name-invisible credential is handled per its verdict', () => {
    for (const entry of NAME_INVISIBLE) {
      const exists = columns.some((c) => c.table === entry.table && c.column === entry.column)
      expect(exists, `NAME_INVISIBLE names ${entry.table}.${entry.column}, which no longer exists`).toBe(true)
      if (entry.verdict === 'revoked') {
        expect(revoked.has(entry.table), `${entry.table} must be revoked: ${entry.why}`).toBe(true)
      }
    }
  })

  it('the two credential lists agree, at COLUMN granularity', () => {
    // N2: a new credential column must reach BOTH lists, or the scheduled
    // production check silently stops asserting about it.
    //
    // Compared per COLUMN, not per table, and the difference is not academic.
    // A table-level comparison is satisfied the moment the table appears
    // anywhere, so a NEW credential column on an ALREADY-REVOKED table passes
    // every assertion in this file — `every credential-looking column lives in
    // a revoked table` sees `revoked.has('appointment')` and moves on — while
    // never reaching CREDENTIAL_COLUMNS, and so never being asserted about by
    // `readonly-role-privileges`. Ever.
    //
    // That is harmless only while the whole table is revoked. It stops being
    // harmless at exactly the moment this design plans for: the first narrow
    // `GRANT SELECT (col, ...)` on one of these 19 tables. From then on the
    // column-level grant is the thing that can leak, and the daily check's
    // assertion list would have a hole precisely on the tables where narrow
    // grants happen.
    const inCatalog = new Set(CREDENTIAL_COLUMN_LIST.map(([t, c]) => `${t}.${c}`))
    const benign = new Set(BENIGN.map((b) => `${b.table}.${b.column}`))

    const shouldBeListed = [
      ...columns
        .filter((c) => CREDENTIAL_NAME.test(c.column))
        .filter((c) => !benign.has(`${c.table}.${c.column}`))
        .map((c) => `${c.table}.${c.column}`),
      ...NAME_INVISIBLE.filter((n) => n.verdict === 'revoked').map((n) => `${n.table}.${n.column}`),
    ]

    const missingFromCatalog = shouldBeListed.filter((k) => !inCatalog.has(k))
    const missingFromSql = Array.from(new Set(CREDENTIAL_COLUMN_LIST.map(([t]) => t))).filter(
      (t) => !revoked.has(t),
    )
    expect(
      { missingFromCatalog, missingFromSql },
      'Every credential column must appear in CREDENTIAL_COLUMNS (lib/read-checks.ts) so the ' +
        'scheduled readonly-role-privileges check asserts about it, AND its table must be revoked ' +
        'in scripts/readonly-role.sql. Two lists on purpose: one changes production, the other ' +
        'notices when production and the script have drifted apart.',
    ).toEqual({ missingFromCatalog: [], missingFromSql: [] })
  })

  it('every credential column in the catalog list really exists', () => {
    const present = new Set(columns.map((c) => `${c.table}.${c.column}`))
    const vanished = CREDENTIAL_COLUMN_LIST.map(([t, c]) => `${t}.${c}`).filter((k) => !present.has(k))
    expect(vanished, 'these credential columns no longer exist — the privilege check asserts nothing about them').toEqual(
      [],
    )
  })

  it('no benign exemption has outlived its column', () => {
    const present = new Set(columns.map((c) => `${c.table}.${c.column}`))
    const stale = BENIGN.filter((b) => !present.has(`${b.table}.${b.column}`)).map((b) => `${b.table}.${b.column}`)
    expect(stale, 'an exemption that matches nothing is a blanket pardon waiting to happen').toEqual([])
  })

  it('the role script never grants a write or re-opens the default', () => {
    const sql = readLf(ROLE_SQL).replace(/--.*$/gm, '')

    // Parse the PRIVILEGE LIST — the part between GRANT and ON — rather than
    // scanning the statement. Two failures this avoids, one in each direction:
    //
    //   * `/GRANT\s+(INSERT|UPDATE|...)/` only catches a write privilege
    //     written FIRST. It misses `GRANT SELECT, INSERT ON ...`, which is the
    //     shape the mistake will actually have: this file tells the next person
    //     to add `GRANT SELECT (col, ...) ON <table>`, so their edit already
    //     begins with `GRANT SELECT` and a comma is one keystroke away.
    //   * Widening to `/GRANT\b[^;]*\b(...|ALL)\b/` catches that, and then
    //     false-positives on the legitimate `GRANT SELECT ON ALL TABLES IN
    //     SCHEMA public` — the `ALL` there is `ALL TABLES`, not the `ALL`
    //     privilege. A guard that fails on the correct line is one somebody
    //     loosens.
    const WRITE_PRIVILEGE = /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b/i
    const writeGrants = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((statement) => {
        const privileges = /^GRANT\s+([\s\S]*?)\s+ON\b/i.exec(statement)
        return privileges ? WRITE_PRIVILEGE.test(privileges[1]!) : false
      })
    expect(writeGrants, 'dreamcrm_readonly must never be granted a write privilege').toEqual([])
    // N1: ALTER DEFAULT PRIVILEGES would auto-grant SELECT on future tables,
    // so a credential table added later would be readable in production while
    // this guard stayed green. It was deliberately removed; keep it removed.
    expect(/ALTER\s+DEFAULT\s+PRIVILEGES/i.test(sql)).toBe(false)
  })
})
