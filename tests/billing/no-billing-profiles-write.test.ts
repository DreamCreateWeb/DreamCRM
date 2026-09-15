import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, sep } from 'node:path'

/**
 * NOTHING WRITES `billing_profiles` (DREAMCRM-58).
 *
 * The table is user-keyed legacy from the single-tenant template. The truth
 * about a clinic's plan and subscription state is the ORG-scoped
 * `clinic_profile` (`planTier`, `subscriptionStatus`), written by the Stripe
 * webhook and read through `getTenantContext`. `billing_profiles` had exactly
 * one writer, `upsertBilling`, and no reader at all — a vanity write.
 *
 * Why that is worth a guard rather than a deletion and a shrug: the write was
 * reachable from a `'use server'` action that took the plan name from its
 * caller, so any signed-in user could set `plan` to 'enterprise'. It bought
 * them nothing while nothing read the column, and it was one `select` away from
 * self-serve plan escalation the day somebody wired a read to the near-identical
 * table name. The defect a guard has to prevent here is not the write coming
 * back on its own — it is a READ arriving to meet it.
 *
 * So both directions fail:
 *
 *  - any INSERT/UPDATE/DELETE against `billingProfiles` in product code;
 *  - any SELECT either, because a read is what would make the stale rows
 *    already in the table load-bearing. `schema/domain.ts` (the definition) and
 *    this file are the only places the name may appear.
 *
 * Deleting the TABLE is a migration on the deploy path and it holds whatever
 * the legacy UI wrote, so it is queued in `docs/POST-1.0.md` rather than done
 * here.
 *
 * ── RED RUN (2026-09-15) ────────────────────────────────────────────────────
 *
 * Mutation 1: restored `upsertBilling` to `lib/services/settings.ts` verbatim —
 * case 1 failed naming that file. Mutation 2: the realistic regression instead
 * of a revert — a bare `db.select().from(schema.billingProfiles)` added to
 * `lib/services/billing.ts`, which is the read that turns the dormant rows into
 * a plan — case 2 failed naming it. Mutation 3: the write spelled through the
 * raw table name (`sql\`update billing_profiles …\``) rather than the Drizzle
 * symbol — case 3 failed. Both mutations were run against the tree.
 */

/** Product code. Tests, migrations and the schema definition are not swept. */
const ROOTS = ['app', 'lib', 'scripts', 'components']

/** Where the table is allowed to be named at all, repo-relative. */
const ALLOWED_FILES = new Set(['lib/db/schema/domain.ts'])

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'migrations') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$|\.mjs$/.test(full)) out.push(full)
  }
  return out
}

/** Comments scope nothing — a comment explaining why the write is gone is not a write. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function productFiles(): Array<{ path: string; src: string }> {
  const root = process.cwd()
  const files: string[] = []
  for (const r of ROOTS) walk(resolve(root, r), files)
  return files
    .map((f) => ({ path: f.slice(root.length + 1).split(sep).join('/'), src: code(readFileSync(f, 'utf8')) }))
    .filter(({ path }) => !ALLOWED_FILES.has(path))
}

function matching(re: RegExp): string[] {
  const hits: string[] = []
  for (const { path, src } of productFiles()) {
    src.split('\n').forEach((line, i) => {
      if (re.test(line)) hits.push(`${path}:${i + 1} — ${line.trim()}`)
    })
  }
  return hits
}

describe('billing_profiles is write-nothing and read-nothing', () => {
  it('the scanner actually reaches product code', () => {
    // A guard that matches nothing passes forever. `clinicProfile` is the table
    // this one's subject was confused with, so it is the honest canary.
    const paths = productFiles().map((f) => f.path)
    expect(paths).toContain('lib/services/settings.ts')
    expect(paths).toContain('lib/services/billing.ts')
    expect(matching(/schema\.clinicProfile/).length).toBeGreaterThan(0)
  })

  it('no product code writes the table', () => {
    expect(
      matching(/\.(insert|update|delete)\(\s*schema\.billingProfiles/),
      'billing_profiles has no reader — the org-scoped clinic_profile (planTier / ' +
        'subscriptionStatus, written by the Stripe webhook) is the source of truth.',
    ).toEqual([])
  })

  it('no product code reads it either — a read is what would make the stale rows matter', () => {
    expect(
      matching(/schema\.billingProfiles/),
      'Reading billing_profiles would give whatever the retired Plans UI wrote ' +
        'a meaning it never had. Read planTier / subscriptionStatus off the ' +
        'tenant context instead.',
    ).toEqual([])
  })

  it('and not through the raw table name, which is how a guard on the symbol gets walked around', () => {
    expect(matching(/\bbilling_profiles\b/)).toEqual([])
  })
})
