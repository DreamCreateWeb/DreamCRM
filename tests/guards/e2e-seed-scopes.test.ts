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
 * WHAT A PREFIX LIST STILL CANNOT REACH — AND WHAT NOW DOES (DREAMCRM-124).
 * A row whose id is not of the `<prefix>_e2e_<name>` shape at all is invisible
 * to `ROW_ID`, and no prefix can ever make it visible: `prospecting_config` is
 * a platform-global SINGLETON at the literal id `'default'`. Until this issue
 * that row had no owner and this guard reported it as fine — QUIET, not red,
 * which is the failure mode the paragraph above was written about, one level
 * up. There the hole is a missing prefix; here it is a row id that can never
 * have one.
 *
 * `singletonOwnership` below closes it from the other side. It reads the
 * INSERT STATEMENT rather than the id: every `insert into <table> (id, …)
 * values ('<literal>', …)` whose literal `ROW_ID` did not already see must be
 * declared in `SCOPE_SINGLETONS` as `<table>:<id>`. That is derived from
 * content, so the next singleton — under any id, on any table — is graded on
 * the day it is written rather than on the day somebody remembers this file.
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
  'demo-journey': 'seedDemoJourney',
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

/**
 * ───────────────────────────────────────────────────────────────────────────
 * THE SINGLETON HALF (DREAMCRM-124).
 *
 * `ROW_ID` finds rows by the SHAPE OF THEIR ID, and a platform-global
 * singleton has no such id — `prospecting_config` is one row for the whole
 * platform at the literal `'default'`. The ownership check above is an
 * ABSENCE assertion over what `ROW_ID` returns, so a row it cannot see makes
 * that check GREENER rather than redder. #675 recorded the hole and said in as
 * many words that the prefix list could not grow into a fix.
 *
 * SO THE SUBJECT CHANGES FROM THE ID TO THE STATEMENT. An insert whose FIRST
 * COLUMN is literally `id` writes that table's primary key, and its first
 * VALUES literal is that key. Every such literal must be owned: either
 * `ROW_ID` already saw it (and the declared-vs-written check above graded it),
 * or `SCOPE_SINGLETONS` names it as `<table>:<id>`.
 *
 * WHAT THIS DELIBERATELY DOES NOT SEE, measured against the seed rather than
 * reasoned about (§2d — a caveat describing a hole the detector does not have
 * is worse than no caveat):
 *
 *   - **An id passed as a PARAMETER.** `base` builds its two clinics from the
 *     module-level CLINICS table and inserts them as `$1`, so no literal
 *     exists in the statement. Those two ids are declared in `SCOPE_ROWS` and
 *     `scopeFunctionSource` splices the header in for exactly this reason, so
 *     they are owned — but they are owned by the rule ABOVE, not by this one.
 *     A singleton smuggled in as `$1` would be invisible here. The assertion
 *     below counts the parameterised inserts so that population cannot grow
 *     silently.
 *   - **A table whose primary key is not named `id`, or is not first.**
 *     `clinic_profile`, `shop_config` and `clinic_review_config` key on
 *     `organization_id`; the org they name is a `ROW_ID` row somebody already
 *     owns, so the row travels with its owner.
 *   - **A SERIAL primary key.** `referral_commission` and `referral_payout`
 *     have no id literal to own; both are cleared by `delete … where
 *     partner_id = …` on restore, and the partner is declared.
 *   - **An UPDATE or a DELETE.** This grades what a scope CREATES. A scope
 *     that mutates a row it does not own is a different rule and does not
 *     exist in the seed today.
 *
 * WATCHED TO FAIL — FOUR MUTATIONS, FOUR REDS (§2d), on this tree:
 *
 *   1. THE DEFECT, #675 verbatim: `prospecting_config` written from
 *      `seedTokenPages`. Red on "gives every row it CREATES an owner".
 *   2. THE CLASS rather than the case: a DIFFERENT singleton nobody declares
 *      (`platform_config` at `'default'`, a table this seed has never
 *      touched). Red the same way, which is what makes this a rule about
 *      singletons and not a hand-fitted check about one row.
 *   3. THE WIRING: `SCOPE_SINGLETONS` renamed to `prospecting_config:defaults`
 *      — an id nothing writes. Red on BOTH directions, which is the point:
 *      a declaration pointing at nothing must not leave a real write unowned.
 *   4. THE EYES: the reader narrowed so it stops crossing a newline, which is
 *      the shape every insert in the seed is written in. The absence
 *      assertions cannot see that; the field-of-view test at the bottom is
 *      what reddens.
 *
 * AND THE ONE THAT CAME BACK GREEN, because it is the finding worth keeping.
 * The first draft compared each scope's inserts against the UNION of every
 * scope's declarations, and mutation 1 passed — `token-pages` writing the
 * singleton was "declared", by `base`. A rule about ownership had been
 * written as a rule about existence, and the defect it was built for walked
 * straight through it. Ownership is per-SCOPE here for that reason, and the
 * disjointness check below covers `base` as well as the consumable scopes:
 * an insert is a write, never a mention.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * An insert whose first column is `id`, paired with its first VALUES literal.
 *
 * `[\s\S]` rather than `.` on purpose: the SQL lives in multi-line template
 * literals, and `.` does not cross a newline.
 *
 * AND THE SPAN IS BOUNDED BY `(?!insert\s+into)`, which is this reader's
 * correctness rather than a flourish. A lazy `[\s\S]*?` runs to the first
 * `values (` it can SATISFY, not to the first one it reaches — so against an
 * insert whose own values begin with `$1` it walks past the end of that
 * statement and attaches the NEXT statement's literal to the wrong table.
 * Measured before the bound went in: three tables reported as parameterised
 * where one is. A reader that silently re-attributes a row is worse than one
 * that misses it — a miss is an absence, a re-attribution is a confident
 * wrong answer.
 */
const NOT_ANOTHER_INSERT = String.raw`(?:(?!insert\s+into)[\s\S])*?`
const KEYED_INSERT_SOURCE =
  String.raw`insert\s+into\s+"?([a-z_]+)"?\s*\(\s*id\s*[,)]` + NOT_ANOTHER_INSERT
const KEYED_INSERT = new RegExp(KEYED_INSERT_SOURCE + String.raw`\bvalues\s*\(\s*'([^']*)'`, 'gi')

/** Same shape, but the first value is a bind parameter — counted, not graded. */
const KEYED_INSERT_PARAM = new RegExp(
  KEYED_INSERT_SOURCE + String.raw`\bvalues\s*\(\s*\$\d`,
  'gi',
)

export interface KeyedInsert {
  table: string
  id: string
}

/** Every `insert into <table> (id, …) values ('<literal>', …)` in `src`. */
export function keyedInserts(src: string): KeyedInsert[] {
  return matches(src, KEYED_INSERT).map((m) => ({ table: m[1], id: m[2] }))
}

/** `SCOPE_SINGLETONS` is a literal, so reading it by a runtime scope name needs a widened view. */
function singletonsOf(scopeSingletons: unknown, scope: string): string[] {
  return (scopeSingletons as Record<string, string[]>)[scope] ?? []
}

describe('the E2E seed singletons', () => {
  it('gives every row it CREATES an owner, including the ones ROW_ID cannot see', async () => {
    const { SCOPE_SINGLETONS } = await import('@/scripts/e2e-seed.mjs')

    for (const [scope, fnName] of Object.entries(FN_FOR_SCOPE)) {
      const src = scopeFunctionSource(fnName)
      const visibleToRowId = new Set(matches(src, ROW_ID).map((m) => m[1]))
      // OWNERSHIP IS PER SCOPE, and that is not a detail — the first draft
      // compared against the union of every scope's declarations and came back
      // GREEN with the real defect planted (#675's `prospecting_config` write,
      // back in `token-pages`, verbatim). It was "declared" because `base`
      // declared it, which is precisely the two-writers race this file exists
      // to prevent. An insert is a WRITE, never a mention, so the scope doing
      // it has to be the scope that owns it.
      const declared = new Set<string>(singletonsOf(SCOPE_SINGLETONS, scope))

      for (const { table, id } of keyedInserts(src)) {
        // Already owned by the row-id rule above — nothing to add here.
        if (visibleToRowId.has(id)) continue
        expect(
          declared.has(`${table}:${id}`),
          `${fnName} inserts ${table} at the literal id '${id}', which is not of the ` +
            `<prefix>_e2e_<name> shape and so is INVISIBLE to SCOPE_ROWS. Declare it in ` +
            `SCOPE_SINGLETONS under '${scope}' as '${table}:${id}' — or, if another scope ` +
            `already owns it, do not write it from here at all. A platform-global row written ` +
            `by two scopes is reset under every other spec's feet, in a parallel worker.`,
        ).toBe(true)
      }
    }
  })

  it('declares only singletons the scope actually writes', async () => {
    const { SCOPE_SINGLETONS } = await import('@/scripts/e2e-seed.mjs')
    for (const scope of Object.keys(SCOPE_SINGLETONS as Record<string, string[]>)) {
      expect(
        Object.keys(FN_FOR_SCOPE),
        `SCOPE_SINGLETONS names a scope '${scope}' that does not exist`,
      ).toContain(scope)
      const written = new Set(
        keyedInserts(scopeFunctionSource(FN_FOR_SCOPE[scope])).map((k) => `${k.table}:${k.id}`),
      )
      for (const decl of singletonsOf(SCOPE_SINGLETONS, scope)) {
        expect(
          written.has(decl),
          `SCOPE_SINGLETONS['${scope}'] claims ${decl}, but ${FN_FOR_SCOPE[scope]} never inserts it. ` +
            `A stale declaration is how ownership quietly stops meaning anything.`,
        ).toBe(true)
      }
    }
  })

  it('lets exactly one scope own each singleton — including `base`', async () => {
    // EVERY scope, not only the consumable ones. Disjointness among row ids is
    // about two specs RESTORING each other's rows mid-run, so `base` is
    // rightly outside it; a platform-global singleton written from two places
    // is a race whichever two they are, because one of them is a scope some
    // spec restores while the other worker is reading the row.
    const { SCOPE_SINGLETONS, SCOPES } = await import('@/scripts/e2e-seed.mjs')
    const owner = new Map<string, string>()
    for (const scope of Object.keys(SCOPES as Record<string, unknown>)) {
      for (const decl of singletonsOf(SCOPE_SINGLETONS, scope)) {
        const prior = owner.get(decl)
        expect(
          prior,
          `singleton ${decl} is claimed by BOTH '${prior}' and '${scope}'. A platform-global row ` +
            `written from two scopes is reset under the other one's feet, in a parallel worker.`,
        ).toBeUndefined()
        owner.set(decl, scope)
      }
    }
  })

  /**
   * THE FIELD-OF-VIEW HALF (§2d). The three tests above are absence
   * assertions, so they go GREENER every time `keyedInserts` narrows: a regex
   * that stopped crossing a newline, a `values` spelling it no longer reaches,
   * an id column that moved. None of those can redden an absence. This one
   * replays the reader against constructed SQL in the exact shapes the seed
   * uses, and against the seed itself, and fails on a narrowing.
   */
  it('the insert reader still sees the shapes the seed actually writes', () => {
    // The real singleton, in its real multi-line template-literal shape.
    expect(
      keyedInserts(
        "await pool.query(\n  `insert into prospecting_config (id, config)\n     values ('default', $1)\n     on conflict (id) do update set config = excluded.config`,\n)",
      ),
    ).toEqual([{ table: 'prospecting_config', id: 'default' }])

    // A quoted table name — `"user"` is a reserved word and is spelled this
    // way in four scopes.
    expect(
      keyedInserts("`insert into \"user\" (id, name)\n values ('user_e2e_partner', 'Jules')`"),
    ).toEqual([{ table: 'user', id: 'user_e2e_partner' }])

    // NOT keyed on `id` — clinic_profile keys on organization_id, so its first
    // literal is a foreign key and must not be read as a primary one.
    expect(
      keyedInserts("`insert into clinic_profile (organization_id, display_name)\n values ('org_e2e_live', 'E2E')`"),
    ).toEqual([])

    // A serial primary key: no id column at all.
    expect(
      keyedInserts("`insert into referral_payout (partner_id, amount_cents)\n values ('rpart_e2e_partner', 3000)`"),
    ).toEqual([])

    // And over the seed itself: the reader must find the singleton it was
    // written for, plus a substantial population of ordinary rows. A number
    // rather than a nonzero check, because "it found ONE thing" is the shape a
    // narrowed reader has.
    const all = keyedInserts(seedSrc)
    expect(
      all.some((k) => k.table === 'prospecting_config' && k.id === 'default'),
      'the reader no longer finds the singleton this rule was written for',
    ).toBe(true)
    expect(
      all.length,
      'the insert reader collapsed — it used to find 40+ keyed inserts across the seed',
    ).toBeGreaterThan(30)

    // The parameterised inserts this rule cannot grade, ENUMERATED so the
    // population cannot grow in silence. Three statements today, all of them
    // loops over ids the function itself spells out somewhere (which is why
    // `ROW_ID` still owns every row they write):
    //
    //   organization — `seedBase`'s two clinics, from the module-level CLINICS
    //                  table; `scopeFunctionSource` splices that header in.
    //   appointment  — `seedStaffDay`'s three visits and
    //                  `seedPortalReschedule`'s two, each from an array of
    //                  `appt_e2e_…` ids declared inside the function.
    //
    // A SINGLETON smuggled in as `$1` would be invisible to the whole rule,
    // and this is the assertion that would notice.
    const parameterised = matches(seedSrc, KEYED_INSERT_PARAM)
      .map((m) => m[1])
      .sort()
    expect(
      parameterised,
      'a new insert passes its primary key as a bind parameter, which this rule cannot read. ' +
        'Spell the id as a literal, or add it here with the reason it cannot be one.',
    ).toEqual(['appointment', 'appointment', 'organization'])
  })
})
