import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { findReadCheck } from '@/lib/read-checks'
import {
  CHECK_ID,
  MIGRATIONS_DIR,
  STATES,
  compareLedger,
  readJournal,
  renderSummary,
  EXIT_CODE,
  NON_ANSWER_VERDICTS,
} from '../../scripts/migration-check.mjs'

/**
 * A FAILED MIGRATION MUST NOT DEPLOY GREEN (DREAMCRM-46).
 *
 * The check itself runs against production and cannot be exercised here, so
 * what this file pins is everything the check is MADE of: the comparison, the
 * wording of its three verdicts, the catalog entry that supplies the answer,
 * the grant without which that entry errors instead of answering, and the wiring
 * that lets a red result reach the deploy run.
 *
 * The comparison tests are written as the DEFECT SHAPES rather than as cases —
 * a batch rolled back, an entry skipped for being out of order, production
 * running ahead of the commit — because those are what the check has to be
 * right about, and a test named after a shape is one somebody can check against
 * reality later.
 */

const ROLE_SQL = 'scripts/readonly-role.sql'
const SCRIPT = 'scripts/migration-check.mjs'
const WORKFLOW = '.github/workflows/migration-check.yml'

/** LF-normalised, so a CRLF checkout does not change what a regex can see. */
function readLf(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n')
}

type Entry = { tag: string; when: string }

const JOURNAL: Entry[] = readJournal()

describe('the applied-migration comparison', () => {
  it('reads the real journal', () => {
    // If the journal ever stops parsing, every assertion below would be about
    // an empty list and would pass while saying nothing.
    expect(JOURNAL.length).toBeGreaterThan(150)
    for (const entry of JOURNAL) {
      expect(entry.tag).toMatch(/^\d{4}_/)
      expect(entry.when).toMatch(/^\d+$/)
    }
  })

  it('every journal entry has its .sql file in the tree', () => {
    // Not this check's own defect, but the one that would make it unanswerable:
    // drizzle's readMigrationFiles THROWS on a journal entry with no file, so a
    // missing .sql wedges the migrate route on every boot, forever, behind the
    // `|| true` in the Dockerfile. Derived from the journal rather than counted.
    const missing = JOURNAL.filter((e) => !existsSync(join(process.cwd(), MIGRATIONS_DIR, `${e.tag}.sql`)))
    expect(
      missing.map((e) => e.tag),
      'the journal names migration files that are not in the tree — drizzle throws on this at boot',
    ).toEqual([])
  })

  it('says nothing is wrong when the ledger holds every journal entry', () => {
    const result = compareLedger(
      JOURNAL,
      JOURNAL.map((e) => e.when),
    )
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.appliedCount).toBe(JOURNAL.length)
  })

  it('compares a bigint the driver returned as a string against a journal number', () => {
    // `created_at` is a `bigint`; node-postgres hands back int8 as a STRING
    // rather than risk a lossy Number. A comparison that did not normalise
    // would report every migration missing on a perfectly healthy database —
    // the loudest possible false alarm, on every deploy.
    const journal: Entry[] = [{ tag: '0001_x', when: '1778945702045' }]
    expect(compareLedger(journal, [1778945702045]).ok).toBe(true)
    expect(compareLedger(journal, ['1778945702045']).ok).toBe(true)
  })

  it('THE ROLLED-BACK BATCH: names every entry the transaction never committed', () => {
    // drizzle applies a boot's pending migrations in ONE transaction. If the
    // third throws, the ledger stays exactly where the previous deploy left it
    // and the three newest journal entries are simply absent.
    const applied = JOURNAL.slice(0, JOURNAL.length - 3).map((e) => e.when)
    const result = compareLedger(JOURNAL, applied)

    expect(result.ok).toBe(false)
    expect(result.missing.map((e: Entry) => e.tag)).toEqual(JOURNAL.slice(-3).map((e) => e.tag))
    // The FIRST missing entry is the one that threw; the others are blocked
    // behind it. The summary leads with it, so the order has to hold.
    expect(result.missing[0].tag).toBe(JOURNAL[JOURNAL.length - 3].tag)
  })

  it('THE SILENTLY SKIPPED ENTRY: an out-of-order `when` is still reported missing', () => {
    // The nastier half of the defect, and the one no redeploy fixes. drizzle
    // applies only entries whose `when` is GREATER than the newest ledger row,
    // so a migration generated on a branch and merged after a newer one is
    // skipped on every boot from then on, in silence. The ledger is FULLER than
    // the journal is long in this shape, which is exactly why a count
    // comparison would report it clean.
    const skipped = JOURNAL[JOURNAL.length - 2]!
    const applied = JOURNAL.filter((e) => e.tag !== skipped.tag).map((e) => e.when)
    const result = compareLedger(JOURNAL, applied)

    expect(result.ok).toBe(false)
    expect(result.missing.map((e: Entry) => e.tag)).toEqual([skipped.tag])
  })

  it('PRODUCTION AHEAD is not a failure', () => {
    // A newer merge deploying while this check polls is normal, and treating it
    // as a defect would make the check red on exactly the busy days somebody
    // needs to trust it.
    const result = compareLedger(JOURNAL, [...JOURNAL.map((e) => e.when), '9999999999999'])
    expect(result.ok).toBe(true)
    expect(result.ahead).toEqual(['9999999999999'])
  })

  it('an empty or unreadable ledger reports everything missing', () => {
    expect(compareLedger(JOURNAL, []).missing.length).toBe(JOURNAL.length)
    expect(compareLedger(JOURNAL, null).missing.length).toBe(JOURNAL.length)
    expect(compareLedger(JOURNAL, undefined).ok).toBe(false)
  })
})

describe('the three verdicts stay told apart', () => {
  const journal: Entry[] = [
    { tag: '0000_a', when: '1' },
    { tag: '0001_b', when: '2' },
  ]

  it('NOT VERIFIED never reads like a pass', () => {
    // THE HONESTY REQUIREMENT. Until the DREAMCRM-42 owner-side setup lands,
    // EVERY run of this workflow is this outcome and exits 0 — so the summary
    // is the only thing standing between a green tick and somebody believing
    // the migrations were checked.
    const summary = renderSummary(STATES.NOT_VERIFIED, { reason: '`ADMIN_READ_SECRET` is not set.' })

    expect(summary).toContain('NOT VERIFIED')
    expect(summary).toContain('nothing was checked')
    expect(summary).not.toContain('✅')
    expect(summary.toLowerCase()).not.toContain('has applied every migration')
    // "verified" must only ever appear inside "NOT VERIFIED" here.
    expect(summary.replace(/NOT VERIFIED/g, '')).not.toMatch(/verified/i)
  })

  it('VERIFIED says how much it checked', () => {
    const result = compareLedger(journal, ['1', '2'])
    const summary = renderSummary(STATES.VERIFIED, { result, url: 'https://example.test/api/admin/read-check' })
    expect(summary).toContain('VERIFIED')
    expect(summary).toContain('2 of 2')
  })

  it('MISMATCH leads with the entry that stopped the batch', () => {
    const result = compareLedger(journal, ['1'])
    const summary = renderSummary(STATES.MISMATCH, { result, url: 'https://example.test', waitedSeconds: 720 })

    expect(summary).toContain('MISMATCH')
    expect(summary).toContain('0001_b')
    expect(summary).toContain('1 of 2')
    // The two things a reader needs that the numbers do not give them: that it
    // will not fix itself, and that a slow rollout is the innocent explanation.
    expect(summary).toContain('does not self-heal')
    expect(summary).toContain('re-run this workflow')
  })

  it('BROKEN does not borrow NOT VERIFIED’s "this run is green"', () => {
    // Found by running the script against a stub that answers 401: the broken
    // path exited 1 while rendering NOT VERIFIED's body, which states in bold
    // that the run is green. Two outcomes sharing one paragraph is the drift a
    // single render function is meant to prevent, not cause.
    const summary = renderSummary(STATES.BROKEN, { why: 'HTTP 401 — the secret does not match.' })
    expect(summary).toContain('THE CHECK ITSELF IS BROKEN')
    expect(summary).not.toContain('This run is green')
    expect(summary).not.toContain('NOT VERIFIED')
  })

  it('no summary that claims the run is green rides a non-zero exit', () => {
    // THE ASSERTION THE ONE ABOVE COULD NOT MAKE. Re-introducing the real bug —
    // main() rendering NOT VERIFIED on the 401 path — left `renderSummary(BROKEN,
    // …)` correct and the test above green, which is a broken test rather than a
    // clean tree. So the property is asserted over the state table instead: any
    // verdict whose body tells the reader the run is green must be one that
    // actually exits 0.
    const detail = {
      reason: 'r',
      why: 'w',
      url: 'https://example.test',
      waitedSeconds: 1,
      journalCount: 2,
      result: compareLedger(journal, ['1']),
    }
    for (const state of Object.values(STATES) as string[]) {
      expect(EXIT_CODE, `${state} has no exit code — finish() would return undefined`).toHaveProperty(state)
      if (renderSummary(state, detail).includes('This run is green')) {
        expect(EXIT_CODE[state], `${state} claims the run is green and then exits non-zero`).toBe(0)
      }
    }
  })

  it('a non-answer maps to a verdict through the table, not through a branch', () => {
    // The two call sites main() actually uses. A broken alarm has to be able to
    // fail; a not-configured-yet one has to stay quiet. Getting these the wrong
    // way round is silent in both directions.
    expect(EXIT_CODE[NON_ANSWER_VERDICTS.fatal], 'a broken alarm must fail the run').toBe(1)
    expect(EXIT_CODE[NON_ANSWER_VERDICTS['not-configured']], 'not configured yet must not fail the run').toBe(0)
  })

  it('UNANSWERED is a finding, not a skipped check', () => {
    const summary = renderSummary(STATES.UNANSWERED, {
      url: 'https://example.test',
      waitedSeconds: 720,
      why: 'HTTP 400',
      journalCount: 2,
    })
    expect(summary).toContain('UNANSWERED')
    expect(summary).toContain('not a skipped check')
    expect(summary).not.toContain('NOT VERIFIED')
  })
})

describe('the catalog entry the check depends on', () => {
  const entry = findReadCheck(CHECK_ID)

  it('exists and reads the drizzle ledger', () => {
    expect(entry, `lib/read-checks.ts has no '${CHECK_ID}' entry — the check would 400 forever`).toBeDefined()
    expect(entry!.sql).toContain('drizzle.__drizzle_migrations')
    // `created_at` IS the journal `when`, and it is the only field drizzle
    // keys on. Asking for anything else would answer a nearby question.
    expect(entry!.sql).toContain('created_at')
  })

  it('the read-only role is actually granted what it needs to answer', () => {
    // THE QUIET FAILURE THIS CATCHES. `scripts/readonly-role.sql` grants SELECT
    // on schema `public`; the ledger lives in schema `drizzle`, so without both
    // of these the entry comes back as a 500 'check failed' rather than an
    // answer — and the check would be red every day for a reason that has
    // nothing to do with migrations.
    //
    // Editing that file does not change production either way: this asserts the
    // committed script still describes what the catalog needs, which is the
    // same bargain the credential-revoke guard makes.
    const sql = readLf(ROLE_SQL).replace(/--.*$/gm, '')
    expect(sql).toMatch(/GRANT\s+USAGE\s+ON\s+SCHEMA\s+drizzle\b/i)
    expect(sql).toMatch(/GRANT\s+SELECT\s+ON\s+TABLE\s+drizzle\.__drizzle_migrations\b/i)
  })
})

describe('a failed boot-time migration reaches the alarm that watches those logs', () => {
  // DERIVED FROM BOTH FILES, not restated. error-scan.yml greps the App Runner
  // application log group every 30 minutes; before DREAMCRM-46 the two failure
  // lines in db-migrate.mjs matched none of its terms, so the one alarm already
  // pointed at those logs read straight past a migration that never applied.
  const scanTerms = (() => {
    const pattern = /--filter-pattern\s+'([^']+)'/.exec(readLf('.github/workflows/error-scan.yml'))
    if (!pattern) return []
    return pattern[1]!
      .split(/\s+/)
      .map((t) => t.replace(/^\?/, ''))
      .filter(Boolean)
  })()

  const failureLines = (() => {
    const src = readLf('scripts/db-migrate.mjs')
    return Array.from(src.matchAll(/console\.error\(\s*'([^']*)'/g)).map((m) => m[1]!)
  })()

  it('the scan pattern and the failure lines were both found', () => {
    // Either half coming back empty would make the assertion below vacuous —
    // a derived guard's one real failure mode is deriving nothing and then
    // reporting clean about it forever.
    expect(scanTerms, 'error-scan.yml no longer has a --filter-pattern to derive from').not.toEqual([])
    expect(scanTerms.length).toBeGreaterThanOrEqual(4)
    expect(failureLines.length).toBeGreaterThanOrEqual(2)
  })

  it('every failure line db-migrate prints matches a term the scan looks for', () => {
    const invisible = failureLines.filter((line) => !scanTerms.some((term) => line.includes(term)))
    expect(
      invisible,
      'These lines are printed when migrations do NOT apply, and error-scan.yml cannot see them — ' +
        'so the failure lands in a log that is being watched, by a watcher that will not report it. ' +
        `Terms it matches: ${scanTerms.join(' ')}.`,
    ).toEqual([])
  })
})

describe('the wiring that lets a red result reach the deploy run', () => {
  const workflow = readLf(WORKFLOW)
  const deploy = readLf('.github/workflows/deploy.yml')
  // Comments stripped for the "must NOT contain" assertions: this workflow's
  // own comment explains why it installs nothing, and a guard that reads prose
  // would fail on the note warning against the thing it is checking for — the
  // same trap tests/guards/read-check-catalog.test.ts calls out.
  const workflowCode = workflow.replace(/^\s*#.*$/gm, '')

  it('the workflow runs the script, and installs nothing to do it', () => {
    expect(workflow).toContain('node scripts/migration-check.mjs')
    // An alarm that needs the dependency tree installed before it can fire has
    // a second way to fail, on the path where something is already wrong.
    expect(workflowCode).not.toContain('pnpm install')
  })

  it('the workflow can be called, scheduled and dispatched', () => {
    // The post-deploy call is the point; the schedule is the timing-free second
    // reading that says whether a red post-deploy run was a stuck migration or
    // a slow rollout; the dispatch is how you re-run it.
    expect(workflow).toMatch(/^\s{2}workflow_call:/m)
    expect(workflow).toMatch(/^\s{2}workflow_dispatch:/m)
    expect(workflow).toMatch(/^\s{2}schedule:/m)
  })

  it('it cannot publish a required check context', () => {
    // `test` and `e2e` are the required contexts on main. A second producer of
    // either name reports a green check onto a commit the real gate never ran
    // against — asserted on the EFFECTIVE context (job key AND `name:`), the
    // same way tests/guards/review-gate.test.ts does.
    const contexts = [
      ...Array.from(workflow.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)).map((m) => m[1]!),
      ...Array.from(workflow.matchAll(/^ {4}name:\s*(.+?)\s*$/gm)).map((m) => m[1]!.replace(/^['"]|['"]$/g, '')),
    ]
    for (const context of contexts) {
      expect(['test', 'e2e'], `${WORKFLOW} would publish a required check context named '${context}'`).not.toContain(
        context,
      )
    }
  })

  it('deploy.yml calls it after the deploy, and lets it fail the run', () => {
    // Sliced rather than regexed: the job is last in the file today, and `$`
    // under /m would have stopped the match at the first newline.
    const start = deploy.indexOf('\n  migration-check:\n')
    expect(start, 'deploy.yml has no migration-check job — a failed migration deploys green again').toBeGreaterThan(
      -1,
    )

    const rest = deploy.slice(start + 1).split('\n').slice(1)
    const end = rest.findIndex((line) => /^ {2}[A-Za-z0-9_-]+:/.test(line))
    const body = (end === -1 ? rest : rest.slice(0, end)).join('\n')
    expect(body).toContain('uses: ./.github/workflows/migration-check.yml')
    expect(body).toContain('needs: deploy')
    // The whole point of the issue: the check has to be able to turn the run
    // red. `continue-on-error` here would restore the defect while leaving
    // every file in place and every summary still printing.
    expect(body, 'continue-on-error would make this check unable to fail the deploy run').not.toContain(
      'continue-on-error',
    )
    // Without inherited secrets the job reports NOT VERIFIED forever, which
    // exits 0 — a quiet alarm that looks installed.
    expect(body).toContain('secrets: inherit')
  })

  it('carries no shebang, so this file can be imported on a Windows checkout', () => {
    // git hands a Windows working tree CRLF endings and vitest's SSR transform
    // leaves the `\r` behind when it strips `#!…` — every test in this file
    // would then die with a parse error at column 1, on Windows only, while CI
    // stayed green. The same trap scripts/review-gate.mjs already fell into.
    expect(readFileSync(join(process.cwd(), SCRIPT), 'utf8').startsWith('#!')).toBe(false)
  })
})
