import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * THE E2E SEED SCOPES HAVE TO STAY ROW-DISJOINT, AND EVERY CONSUMING SPEC HAS
 * TO CLAIM EXACTLY ONE OF THEM.
 *
 * DREAMCRM-19 split `scripts/e2e-seed.mjs` into named scopes so a Playwright
 * retry can restore just the rows the failing spec spent. Before that, the
 * harness seeded once per RUN: a spec that consumed its fixture died on its
 * FIRST assertion when retried, and that fixture complaint — not the real
 * failure — was the error a reader saw. `e2e/reseed.ts` fixes it by restoring
 * the owning spec's scope before every attempt.
 *
 * Two invariants hold that up, and NEITHER is visible in the SQL:
 *
 *  1. The consumable scopes are ROW-DISJOINT. Spec files run in parallel
 *     workers, so if two scopes wrote the same row, one worker restoring its
 *     own scope would reset a row another worker was halfway through spending
 *     — trading a retry-only trap for a genuine cross-worker race, which is
 *     strictly worse. Every scope MENTIONS 'org_e2e_live'; only `base` owns
 *     it, and ownership is therefore declared (SCOPE_ROWS), not inferred.
 *
 *  2. Every consumable scope is claimed by EXACTLY ONE spec file. An unclaimed
 *     scope is a spec still carrying the old trap; a scope claimed twice is
 *     two files racing to reset each other's rows.
 *
 * This runs in the normal vitest suite — no database, no browser — because a
 * broken invariant should fail in the two minutes before a merge rather than
 * as a confusing E2E flake days later.
 */

const ROOT = process.cwd()
const SEED_PATH = resolve(ROOT, 'scripts/e2e-seed.mjs')
const E2E_DIR = resolve(ROOT, 'e2e')
const seedSrc = readFileSync(SEED_PATH, 'utf8')

/**
 * Any seeded row id: `<prefix>_e2e_<name>`.
 *
 * `bp` (patient_balance_payment) joined the list with the `webhook` scope in
 * DREAMCRM-48. The prefix list is what makes a row VISIBLE to the
 * declared-vs-written check below, so a new table seeded under a prefix
 * nobody added here is a row with no owner that this guard reports as fine.
 * Add the prefix in the same PR as the scope.
 *
 * TWELVE more arrived with `token-pages` and `partner` (DREAMCRM-98), which is
 * the largest single addition this list has taken and worth a word about why.
 * Those two scopes reach further across the schema than any before them, so
 * every one is named rather than summarised — the first draft of this paragraph
 * said "eleven" and enumerated nine tables, which is §2d's "the predicate is
 * right and the sentence is wrong" (caught by Sentinel reviewing #669). A
 * prefix list is exactly the kind of thing a reader trusts the prose about
 * instead of counting:
 *
 *   prv    clinic_provider                 bpr    balance_payment_request
 *   plan   payment_plan                    rev    review_request
 *   wl     appointment_waitlist            wlo    appointment_waitlist_offer
 *   pros   prospect                        pmtg   prospect_meeting
 *   pgrd   practice_grade                  mevt   marketing_event
 *   mcap   event_capture                   rpart  referral_partner
 *
 * Each new table needs its prefix here or its rows are invisible to the
 * ownership check — which is the exact failure mode this docblock was written
 * for, and it goes quiet rather than red.
 *
 * WHAT A PREFIX LIST STILL CANNOT REACH, since this is the natural place to
 * look for it: a row whose id is not of the `<prefix>_e2e_<name>` shape at all.
 * `token-pages` writes one — the `prospecting_config` singleton at the literal
 * id `'default'` — and no prefix can ever make it visible here. It is named as
 * an unowned global write in that scope's header and in `docs/E2E.md`; if you
 * are about to add a second such row, read both before assuming this guard has
 * your back.
 *
 * `prop` and `pros` are two prefixes, not one: `prop_e2e_…` is a proposal
 * (`sign-here`) and `pros_e2e_…` is a prospect (`token-pages`). Alternation
 * cannot confuse them — every branch has to be followed by a literal `_e2e_`
 * — but a reader can, so they are named apart here rather than merged into a
 * pattern that would also match a table neither scope writes.
 */
const ROW_ID =
  /'((?:org|pat|appt|nps|user|mem|sess|lead|prop|bp|prv|bpr|plan|rev|wl|wlo|pros|pmtg|pgrd|mevt|mcap|rpart)_e2e_[a-z0-9_]+)'/g

/**
 * Everything above the first seeding function: the shared fixture constants
 * (CLINICS, HOURS) that `base` writes through a loop rather than inline.
 */
const seedHeader = seedSrc.slice(0, seedSrc.indexOf('async function seed'))

/** The source of one scope's seeding function, sliced between its declaration and the next. */
function scopeFunctionSource(fnName: string): string {
  const start = seedSrc.indexOf(`async function ${fnName}(pool)`)
  expect(start, `scripts/e2e-seed.mjs no longer declares ${fnName}`).toBeGreaterThan(-1)
  const rest = seedSrc.slice(start + 1)
  const next = rest.search(/\nasync function |\n\/\*\*\n \* Every scope/)
  const body = next === -1 ? rest : rest.slice(0, next)
  // `base` builds the two clinics from the module-level CLINICS table, so its
  // row ids are never spelled inside the function.
  return fnName === 'seedBase' ? seedHeader + body : body
}

const FN_FOR_SCOPE: Record<string, string> = {
  base: 'seedBase',
  tokens: 'seedTokens',
  portal: 'seedPortal',
  'staff-day': 'seedStaffDay',
  'portal-reschedule': 'seedPortalReschedule',
  'sign-here': 'seedSignHere',
  'go-live': 'seedGoLive',
  billing: 'seedBilling',
  webhook: 'seedWebhook',
  'token-pages': 'seedTokenPages',
  partner: 'seedPartner',
}

/** `SCOPE_ROWS` is a literal, so reading it by a runtime scope name needs a widened view. */
function rowsOf(scopeRows: unknown, scope: string): string[] {
  return (scopeRows as Record<string, string[]>)[scope] ?? []
}

/** All matches of `re` in `src`, without relying on iterator downlevelling (tsconfig targets es5). */
function matches(src: string, re: RegExp): RegExpMatchArray[] {
  return Array.from(src.matchAll(re))
}

describe('the E2E seed scopes', () => {
  it('declares row ownership for every scope it defines', async () => {
    const { SCOPES, SCOPE_ROWS, CONSUMABLE_SCOPES } = await import('@/scripts/e2e-seed.mjs')
    expect(Object.keys(SCOPE_ROWS).sort()).toEqual(Object.keys(SCOPES).sort())
    expect(CONSUMABLE_SCOPES).not.toContain('base')
    expect(CONSUMABLE_SCOPES.sort()).toEqual(
      Object.keys(SCOPES)
        .filter((s: string) => s !== 'base')
        .sort(),
    )
    // Every scope name here is also a function this guard can read.
    expect(Object.keys(FN_FOR_SCOPE).sort()).toEqual(Object.keys(SCOPES).sort())
  })

  it('keeps the CONSUMABLE scopes row-disjoint — the property parallel workers rely on', async () => {
    const { SCOPE_ROWS, CONSUMABLE_SCOPES } = await import('@/scripts/e2e-seed.mjs')
    const owner = new Map<string, string>()
    for (const scope of CONSUMABLE_SCOPES as string[]) {
      for (const row of rowsOf(SCOPE_ROWS, scope)) {
        const prior = owner.get(row)
        expect(
          prior,
          `row ${row} is claimed by BOTH '${prior}' and '${scope}' — restoring one scope would reset the other's rows mid-run`,
        ).toBeUndefined()
        owner.set(row, scope)
      }
    }
  })

  it('declares only rows the scope actually writes, and writes only rows somebody declares', async () => {
    const { SCOPE_ROWS } = await import('@/scripts/e2e-seed.mjs')
    const allDeclared = new Set<string>(
      Object.values(SCOPE_ROWS as Record<string, string[]>).flat(),
    )

    for (const [scope, fnName] of Object.entries(FN_FOR_SCOPE)) {
      const src = scopeFunctionSource(fnName)
      const mentioned = Array.from(new Set(matches(src, ROW_ID).map((m) => m[1])))

      // Declared -> present. A stale declaration is how disjointness quietly
      // stops meaning anything.
      for (const row of rowsOf(SCOPE_ROWS, scope)) {
        // The staff-day / reschedule ids live in arrays inside the function,
        // so a plain substring check covers both spellings.
        expect(
          src.includes(`'${row}'`),
          `SCOPE_ROWS['${scope}'] claims ${row}, but ${fnName} never writes it`,
        ).toBe(true)
      }

      // Present -> declared by SOMEBODY. A scope legitimately MENTIONS rows it
      // does not own (every one references 'org_e2e_live'), so the bar is that
      // some scope declares it — which catches a brand-new row nobody owns.
      for (const row of mentioned) {
        expect(
          allDeclared.has(row),
          `${fnName} writes or references ${row}, which no scope declares in SCOPE_ROWS — give it an owner`,
        ).toBe(true)
      }
    }
  })

  it('has every consumable scope claimed by exactly one spec file', async () => {
    const { CONSUMABLE_SCOPES, SCOPES } = await import('@/scripts/e2e-seed.mjs')
    const claims = new Map<string, string[]>()

    for (const file of readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'))) {
      const src = readFileSync(resolve(E2E_DIR, file), 'utf8')
      // Anchored at column 0: the declaration is a top-level statement, and
      // an unanchored match also picks up prose ABOUT it in a comment.
      for (const m of matches(src, /^restoresSeedScope\(([^)]*)\)/gm)) {
        for (const s of matches(m[1], /'([^']+)'/g)) {
          claims.set(s[1], (claims.get(s[1]) ?? []).concat(file))
        }
      }
    }

    // No spec may claim a scope that does not exist — a typo would otherwise
    // fail only at E2E runtime, as an unknown-scope error inside a hook.
    for (const [scope, files] of Array.from(claims.entries())) {
      expect(
        Object.keys(SCOPES),
        `${files.join(', ')} claims seed scope '${scope}', which scripts/e2e-seed.mjs does not define`,
      ).toContain(scope)
    }

    // `base` is structure nothing consumes; no spec should be restoring it.
    expect(claims.get('base'), 'no spec should restore `base` — nothing consumes it').toBeUndefined()

    for (const scope of CONSUMABLE_SCOPES as string[]) {
      const files = claims.get(scope) ?? []
      expect(
        files.length,
        files.length === 0
          ? `seed scope '${scope}' is claimed by no spec — whichever file spends those rows still has the retry trap`
          : `seed scope '${scope}' is claimed by ${files.join(' and ')} — two files restoring one scope race each other`,
      ).toBe(1)
    }
  })
})
