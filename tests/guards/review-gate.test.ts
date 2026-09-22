import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import {
  GATE_RULES,
  INTAKE_RULES,
  gateFindings,
  globToRegExp,
  intakeFindings,
  renderSummary,
} from '../../scripts/review-gate.mjs'

/**
 * The pre-merge review gate, checked against the tree it claims to describe.
 *
 * `scripts/review-gate.mjs` enumerates the areas the `dreamcrm-conventions`
 * skill puts behind Sentinel's review. An enumeration of paths has exactly one
 * failure mode and it is a quiet one: a file moves, the pattern that named it
 * stops matching anything, and the area silently leaves the gate. Nothing goes
 * red. The classifier keeps answering confidently, about a tree that no longer
 * exists — which is worse than not having it, because now there is a check
 * saying the PR is clean.
 *
 * So the load-bearing test here is the third one: EVERY pattern must still
 * match a real tracked file. It is the same argument `e2e/axe.ts` makes about
 * dead exclusions — the only thing in a harness that makes it looser is the
 * thing that most needs a check that has been seen to fail.
 *
 * `git ls-files` is the source of truth for "what is in the tree", and it
 * emits forward slashes on every platform. Windows is a supported dev platform
 * here (docs/CI.md), and a guard that scans the filesystem with the wrong
 * separator passes locally and fails in CI, or worse, the other way round.
 */

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
}

function areasFor(...files: string[]): string[] {
  return gateFindings(files).map((f: { id: string }) => f.id)
}

function intakeAreasFor(...files: string[]): string[] {
  return intakeFindings(files).map((f: { id: string }) => f.id)
}

/**
 * EVERY LOCAL MODULE A SUITE FILE IMPORTS, as repo-relative candidate paths.
 *
 * Both derivations below — the tree-walk detector and the palette-grader
 * detector — decide whether a file is a repo-wide rule by following its
 * imports. They each had their own copy of `/from\s+'(\.[^']+)'/g`, and that
 * regex sees exactly one of the two spellings this repo actually uses.
 *
 * **SENTINEL WATCHED IT MISS, reviewing #597.** They planted
 * `tests/a11y/sentinel-mutation.test.ts` — a brand-new, unlisted, repo-wide
 * palette rule — importing `from '@/tests/a11y/palette'`. `tsconfig.json` maps
 * `@/*` → `./*`, so it resolves and runs like any other module.
 * `review-gate.test.ts` came back **13 passed**: a new class of assertion, not
 * on the intake list, reported clean by the very rule written to catch that.
 *
 * It is §2d's identity-looseness family in a spelling it did not have yet.
 * Not a missing `\b`, not a Tailwind `_`, not a prefix mistaken for a name —
 * **the right module reached by a different path spelling.** The red run that
 * shipped with the rule tested the WIDENING direction (two bounded
 * template-recipe files it must leave alone) and never tested the missing one,
 * which is the asymmetry `axe-selftest` exists to teach: an absence assertion
 * over a clean tree cannot tell a working detector from a narrowed one.
 *
 * So resolution lives HERE, once, and is red-run below against every spelling
 * rather than the one that happened to be in the tree:
 *
 *   - relative — `./palette`, `../a11y/palette`, resolved against the importer;
 *   - alias — `@/tests/a11y/palette`, resolved against the repo root, because
 *     that is what `tsconfig.json` says `@/*` means;
 *   - either quote character, since nothing but lint convention keeps this
 *     repo on single quotes and a guard should not depend on a lint rule.
 *
 * Extensionless by design: it returns the candidate spellings a resolver would
 * try, and callers compare against the tracked path.
 *
 * WATCHED TO FAIL AGAINST THE REAL MUTATION, not only against the table below.
 * Sentinel's planted file was recreated verbatim — `tests/a11y/
 * sentinel-mutation.test.ts`, importing `from '@/tests/a11y/palette'`, added to
 * the index so `git ls-files` sees it — and the palette-grader rule now fails
 * naming that exact path, where before the fix the same file produced a clean
 * run. The fixture is NOT kept in the tree on purpose: a permanent unlisted
 * palette grader would trip the very rule it demonstrates, so the durable form
 * is the spelling table here plus this record of the tree-level run.
 */
export function importedModules(file: string, source: string): string[] {
  const out: string[] = []
  for (const m of Array.from(source.matchAll(/from\s+['"]([^'"]+)['"]/g))) {
    const spec = m[1]
    let base: string | null = null
    if (spec.startsWith('.')) base = normalize(join(dirname(file), spec))
    else if (spec.startsWith('@/')) base = normalize(spec.slice(2))
    if (base === null) continue
    const t = base.split('\\').join('/')
    out.push(t, `${t}.ts`, `${t}.tsx`, `${t}/index.ts`)
  }
  return out
}

describe('the import resolver both derivations share', () => {
  // THE RED RUN, in the direction the shipped version could not fail in.
  // Every spelling below resolves to the SAME module; the alias one is the
  // case Sentinel planted and watched pass.
  const REACHES_PALETTE: Array<[string, string]> = [
    ['relative, same directory', "import { AA } from './palette'"],
    ['relative, up and across', "import { AA } from '../a11y/palette'"],
    ['the ALIAS spelling — the miss', "import { AA } from '@/tests/a11y/palette'"],
    ['alias, double-quoted', 'import { AA } from "@/tests/a11y/palette"'],
    ['relative, double-quoted', 'import { AA } from "./palette"'],
    ['among other imports', "import { x } from 'vitest'\nimport { AA } from '@/tests/a11y/palette'"],
  ]

  it.each(REACHES_PALETTE)('resolves %s', (_why, source) => {
    expect(importedModules('tests/a11y/some-rule.test.ts', source)).toContain('tests/a11y/palette.ts')
  })

  it('does not invent a local module out of a package import', () => {
    // `vitest`, `node:fs`, `@vitest/spy` — bare specifiers and scoped packages
    // are not files in this tree, and a resolver that guessed at them would
    // put every test file in the graph.
    const src = "import { describe } from 'vitest'\nimport { readFileSync } from 'node:fs'\nimport x from '@vitest/spy'"
    expect(importedModules('tests/a11y/some-rule.test.ts', src)).toEqual([])
  })

  it('does not confuse a different module whose name merely ends the same way', () => {
    // The widening direction, kept from the shipped red run: a product module
    // that happens to be called `palette` is not this repo's a11y palette.
    const src = "import { buildCosmeticPalette } from '@/lib/site-templates/cosmetic/palette'"
    expect(importedModules('tests/x.test.ts', src)).not.toContain('tests/a11y/palette.ts')
  })
})

/**
 * A PRODUCT ROOT, MATCHED AT A PATH BOUNDARY RATHER THAN AT A CLOSING QUOTE.
 *
 * The shipped version was `/(^|[^\w])'(app|components|lib)'/`, and to that regex
 * **a SUBDIRECTORY of a product root is not the product root.** Three tree-wide
 * marketing guards name `'app/(marketing)'`, `'components/marketing'` and
 * `'lib/marketing'`, so they matched it ZERO times while reading every source
 * file under roots they never named:
 *
 *   grep -cE "(^|[^\w])'(app|components|lib)'" tests/marketing/tone-tiles.test.ts    # 0
 *   grep -cE "(^|[^\w])'(app|components|lib)'" tests/marketing/no-drawn-grid.test.ts # 0
 *
 * All three were on the intake list anyway, and all three for the same
 * accidental reason: they import `ROOT` from `tests/a11y/palette` for a PATH
 * CONSTANT, which trips the palette derivation below by luck rather than on the
 * merits. **Write `const ROOT = process.cwd()` instead** — one line, no
 * behaviour change, nothing a reviewer would stop on — and before this fix a
 * brand-new tree-wide rule matched NEITHER derivation and was told on the job
 * summary that it merged on green owing nothing. That is #566's shape exactly,
 * one directory down (Forge's gate sweep, #617/#618).
 *
 * ── WHERE THE BOUNDARY IS, AND WHY IT IS NOT "ANY DEPTH" ────────────────────
 *
 * One segment, and a segment carrying an extension does not count.
 *
 *   'app'                     ✓ the root itself
 *   'app/(marketing)'         ✓ a route group — a whole site
 *   'components/clinic-site'  ✓ a persona's component tree
 *   'lib/services'            ✓ 190 files
 *   'lib/db/migrations'       ✗ a named module, two levels down
 *   'lib/read-checks.ts'      ✗ a named FILE — the bounded case this is not for
 *
 * Measured rather than argued, because #609's lesson applies to this fix as
 * much as to what it is fixing. Against the tree at the time: the bare-root
 * version derived 27 scanners; one segment derives 40; any depth derives 50 and
 * sweeps in six guards that name exactly what they read — `app/api/cron`,
 * `lib/services/demo-clinic`, `lib/db/schema`. A file that names what it reads
 * is the bounded reader §2 keeps refusing to sweep in, and widening until a
 * third of the suite matches is how a queue gets routed around.
 */
export const PRODUCT_ROOT_RE = /(^|[^\w])'(app|components|lib)(\/[^'/.]+)?'/

describe('the product-root match, in both directions', () => {
  // THE RED RUN §2d OWES THIS FIX (#609's lesson, applied to its own remedy).
  // An absence assertion over a clean tree cannot tell a working detector from
  // a narrowed one, so both directions are planted here.
  const MUST_MATCH: Array<[string, string]> = [
    ['the bare root, unchanged', "const ROOT = join(process.cwd(), 'app')"],
    ['a route group — the #617 miss', "const SCAN_DIRS = ['app/(marketing)', 'components/marketing']"],
    ['a component subtree — the #618 miss', "const ROOTS = ['components/marketing', 'lib/marketing']"],
    ['a persona tree', "const SCAN_DIRS = ['app/(portal)', 'components/patient-portal']"],
    ['the services layer', "const dir = join(ROOT, 'lib/services')"],
    ['a parenthesised group with a dash', "walk(join(ROOT, 'app/(double-sidebar)'))"],
  ]

  it.each(MUST_MATCH)('counts %s as a product root', (_why, source) => {
    expect(PRODUCT_ROOT_RE.test(source)).toBe(true)
  })

  // THE DIRECTION THE WIDENING COULD RUIN. Each of these NAMES what it reads,
  // which is the bounded case the intake list exists not to sweep in.
  const MUST_NOT_MATCH: Array<[string, string]> = [
    ['a named file one level down', "readFileSync(resolve(process.cwd(), 'lib/read-checks.ts'), 'utf8')"],
    ['a named file two levels down', "readFileSync(join(ROOT, 'lib/services/patient-journey.ts'), 'utf8')"],
    ['a module path two levels down', "const MIG_DIR = resolve(process.cwd(), 'lib/db/migrations')"],
    ['a feature directory two levels down', "const dir = join(process.cwd(), 'app/api/cron')"],
    ['a root that is merely a word inside one', "const label = 'applications'"],
    ['a root spelled as part of a longer identifier', "const x = myapp'"],
    ['some other top-level directory', "const dir = join(ROOT, 'docs')"],
    ['a root reached through a variable rather than quoted', 'const dir = join(ROOT, productRoot)'],
  ]

  it.each(MUST_NOT_MATCH)('leaves %s alone', (_why, source) => {
    expect(PRODUCT_ROOT_RE.test(source)).toBe(false)
  })
})

/**
 * THE THIRD DERIVATION: A GUARD THAT DRIVES A BROWSER (DREAMCRM-81).
 *
 * The two derivations below this one decide "repo-wide fact by construction" by
 * looking at what a suite file READS OFF DISK — one wants `readdirSync` or
 * `'ls-files'` plus a product root, the other wants an import of
 * `tests/a11y/palette.ts`. **A Playwright spec reads no source at all.** It
 * opens pages and measures the rendered result, so every source-reading
 * predicate correctly returns false about it while it asserts about every
 * marketing page at once.
 *
 * This is NOT a field-of-view gap and the difference decides the fix. Both
 * derivations already enumerate `e2e/` — each filters `trackedFiles()` by
 * `/^(tests|e2e)\/.*\.tsx?$/` — so these files are inside the population and
 * invisible to the predicates. Measured across all nineteen tracked `e2e/*.ts`
 * files at the time, `WALKS` matched zero times and `PRODUCT_ROOT` matched zero
 * times. Widening the product-root match above does nothing for this shape.
 *
 * ── WHAT IT KEYS ON, AND WHY THAT MEANS SOMETHING ──────────────────────────
 *
 * **The page list, not the assertion.** A spec is site-wide when it visits
 * pages NOBODY TYPED: `e2e/marketing-viewport.spec.ts` expands `COMPARISONS`,
 * `DOCS` and `RESOURCE_GUIDES` — the same registries the routes' own
 * `generateStaticParams` reads — into its stops, so a ninth comparison is
 * covered the day it is added rather than the day somebody remembers the spec.
 * That is the identical logical shape as rule 1 one surface over: reading
 * source it did not name becomes navigating pages it did not name.
 *
 * So the evidence is mechanical, on the same terms as the `@/lib/stripe` test:
 * imports `@playwright/test`, calls `.goto(`, and EXPANDS a binding imported
 * from `app/`, `components/` or `lib/` into a collection.
 *
 * ── WHY NOT "ITERATES A ROUTE COLLECTION" ──────────────────────────────────
 *
 * Because it catches `e2e/smoke.spec.ts`, which loops four hand-written paths
 * (`PROTECTED = ['/dashboard', '/patients', '/appointments', '/settings']`)
 * through `page.goto(path)` and is a bounded journey spec by anybody's reading.
 * Nineteen innocents are sitting in `e2e/` and that one is the sharpest; a
 * criterion that reddens it is the "208 places to catch 8" trade §2 keeps
 * refusing.
 *
 * ── WHAT IT DOES NOT COVER ─────────────────────────────────────────────────
 *
 * Stated here AND beside the entry in `scripts/review-gate.mjs`, per Sentinel's
 * #617 note, because that comment is what the rulebook entry gets written from:
 *
 *   - A browser-driven guard whose page list is TYPED. Deliberate — it is the
 *     whole discrimination above — but a hand-typed list that grows to cover a
 *     site is invisible here, exactly as `smoke.spec.ts` is.
 *   - A spec that discovers its pages at RUNTIME (crawling links, fetching a
 *     sitemap) imports no registry and matches nothing.
 *   - A spec driving a browser without `@playwright/test`. None exists, and
 *     `playwright.config.ts` is on the REVIEW gate, so the harness is watched.
 *   - It says nothing about what the spec ASSERTS. A derived-list spec that
 *     checks something trivial still matches, and that is still the direction
 *     to be wrong in — but it is not free, and the price was stated wrongly
 *     here (corrected DREAMCRM-92). A false positive is not "a sentence on an
 *     issue": this detector runs INSIDE `test`, so a file it wrongly matches
 *     fails a required check BY NAME until somebody acts. The fix when that
 *     happens is to drop the verb or narrow the predicate. It is NEVER to
 *     register the innocent file — that quietens the red by putting a
 *     permanent lie on `INTAKE_RULES`, and every future reader takes the list
 *     at its word.
 *
 * Returns the binding names that make the file site-wide, so a failure can say
 * WHICH registry it expanded rather than only that it matched.
 */
const DRIVES_BROWSER = /from\s+['"]@playwright\/test['"]/
const NAVIGATES = /\.goto\s*\(/
const PRODUCT_MODULE = /^(app|components|lib)\//

/** The bindings an import clause introduces: `{ A, B as C }`, `X`, `* as X`. */
function importBindings(clause: string): string[] {
  const names: string[] = []
  const braced = clause.match(/\{([^}]*)\}/)
  if (braced) {
    for (const part of braced[1].split(',')) {
      const m = part.trim().match(/(?:\w+\s+as\s+)?(\w+)$/)
      if (m) names.push(m[1])
    }
  }
  const head = clause.replace(/\{[^}]*\}/g, '').replace(/,/g, ' ').trim()
  const star = head.match(/^\*\s+as\s+(\w+)$/)
  if (star) names.push(star[1])
  else if (/^\w+$/.test(head)) names.push(head)
  return names
}

/**
 * Is this binding EXPANDED into a collection, rather than merely called?
 *
 * The distinction a bounded spec turns on: importing `formatCents` from
 * `lib/money` to build an expected string is not a page list; spreading
 * `COMPARISONS` into one is. `\b` on both sides deliberately — §2d's
 * identity-looseness family is the most common way a guard like this quietly
 * matches a longer name and starts reporting about the wrong thing.
 *
 * THE VERB LIST IS THE WHOLE RULE, so a missing verb is a silent hole rather
 * than a near miss. `reduce` was missing when this shipped and Sentinel found
 * it by probing (#622 review): `const PAGES = DOCS.reduce((a, d) => [...a,
 * d.slug], [])` returned `[]` — a fully derived page list, invisible. Added
 * with `reduceRight`, `slice` and `sort` beside it, since all four take a
 * collection and hand back a collection, which is the property that matters.
 * Adding a verb is the cheap direction: a verb that never appears costs
 * nothing, and a missing one costs a whole guard. If you find another, add it
 * here rather than writing a caveat about it.
 */
function isExpanded(name: string, source: string): boolean {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(\\.\\.\\.\\s*${n}\\b|\\b${n}\\s*\\.\\s*(map|flatMap|filter|forEach|concat|reduce|reduceRight|slice|sort)\\s*\\(` +
      `|\\bof\\s+${n}\\b|\\bin\\s+${n}\\b|\\bObject\\.(keys|values|entries)\\s*\\(\\s*${n}\\b)`,
  ).test(source)
}

export function sitewidePageRegistries(file: string, source: string): string[] {
  if (!DRIVES_BROWSER.test(source) || !NAVIGATES.test(source)) return []

  const found = new Set<string>()
  for (const m of Array.from(source.matchAll(/import\s+([^'"]*?)\s*from\s+['"]([^'"]+)['"]/g))) {
    const [, clause, spec] = m
    let base: string | null = null
    if (spec.startsWith('.')) base = normalize(join(dirname(file), spec))
    else if (spec.startsWith('@/')) base = normalize(spec.slice(2))
    if (base === null) continue
    if (!PRODUCT_MODULE.test(base.split('\\').join('/'))) continue
    for (const name of importBindings(clause)) if (isExpanded(name, source)) found.add(name)
  }
  return Array.from(found).sort()
}

describe('the browser-driven site-wide detector, in both directions', () => {
  // THE PLANTED POSITIVE, reduced from `e2e/marketing-viewport.spec.ts` — the
  // spec PR #621 had to register by hand, which is the whole reason this rule
  // exists. Both spellings of the import are covered because `@/` resolves the
  // same way and Sentinel has already watched one derivation miss on exactly
  // that (see `importedModules` above).
  const SITE_WIDE = `
import { test, expect } from '@playwright/test'
import { COMPARISONS } from '../lib/marketing/comparisons'

const PAGES = ['/', '/pricing', ...COMPARISONS.map((c) => \`/compare/\${c.slug}\`)]

for (const path of PAGES) {
  test(\`\${path} does not scroll sideways\`, async ({ page }) => {
    await page.goto(path)
  })
}
`

  it('catches a new browser-driven site-wide spec', () => {
    expect(sitewidePageRegistries('e2e/planted.spec.ts', SITE_WIDE)).toEqual(['COMPARISONS'])
  })

  it('catches it through the alias spelling too', () => {
    const aliased = SITE_WIDE.replace("'../lib/marketing/comparisons'", "'@/lib/marketing/comparisons'")
    expect(sitewidePageRegistries('e2e/planted.spec.ts', aliased)).toEqual(['COMPARISONS'])
  })

  // SENTINEL'S PROBE, VERBATIM (#622 review). `reduce` was not on the verb
  // list, so this exact source returned `[]` — a fully derived page list the
  // detector could not see. Kept as a case rather than a caveat because a verb
  // costs nothing and a hole costs the guard. Its three siblings are here for
  // the same reason: each takes a collection and returns one.
  const EXPANSION_VERBS: Array<[string, string]> = [
    ['reduce', 'const PAGES = DOCS.reduce((a, d) => [...a, `/docs/${d.slug}`], [])'],
    ['reduceRight', 'const PAGES = DOCS.reduceRight((a, d) => [...a, d.slug], [])'],
    ['slice', 'const PAGES = DOCS.slice(0, 5).map((d) => d.slug)'],
    ['sort', 'const PAGES = DOCS.sort().map((d) => d.slug)'],
  ]

  it.each(EXPANSION_VERBS)('counts %s as an expansion into a page list', (_verb, line) => {
    const src = `import { test } from '@playwright/test'\nimport { DOCS } from '@/lib/marketing/docs'\n${line}\nfor (const p of PAGES) { test(p, async ({ page }) => { await page.goto(p) }) }`
    expect(sitewidePageRegistries('e2e/planted.spec.ts', src)).toEqual(['DOCS'])
  })

  it('catches a default-imported registry and a namespace import', () => {
    const dflt = "import { test } from '@playwright/test'\nimport ROUTES from '@/lib/known-routes'\nfor (const p of ROUTES) { test(p, async ({ page }) => { await page.goto(p) }) }"
    expect(sitewidePageRegistries('e2e/planted.spec.ts', dflt)).toEqual(['ROUTES'])

    const ns = "import { test } from '@playwright/test'\nimport * as reg from '@/lib/marketing/docs'\nfor (const p of Object.keys(reg)) { test(p, async ({ page }) => { await page.goto(p) }) }"
    expect(sitewidePageRegistries('e2e/planted.spec.ts', ns)).toEqual(['reg'])
  })

  // THE INNOCENT DIRECTION, which is the half #609 shipped without and the half
  // that decides whether this rule survives contact with the suite. Nineteen
  // bounded journey specs are sitting in `e2e/`; these are the shapes that
  // would sweep them in if the criterion were sloppier.
  const INNOCENTS: Array<[string, string]> = [
    [
      'a bounded journey spec that loops a HAND-TYPED list — the smoke.spec.ts shape',
      "import { test } from '@playwright/test'\nconst PROTECTED = ['/dashboard', '/patients']\nfor (const p of PROTECTED) { test(p, async ({ page }) => { await page.goto(p) }) }",
    ],
    [
      'a bounded spec that imports a product helper and merely CALLS it',
      "import { test, expect } from '@playwright/test'\nimport { formatCents } from '@/lib/money'\ntest('shows the total', async ({ page }) => { await page.goto('/i/abc'); await expect(page.getByText(formatCents(1200))).toBeVisible() })",
    ],
    [
      'a spec that expands a registry but never opens a browser',
      "import { describe, it } from 'vitest'\nimport { COMPARISONS } from '@/lib/marketing/comparisons'\nfor (const c of COMPARISONS) { it(c.slug, () => {}) }",
    ],
    [
      'a Playwright helper that imports a registry but navigates nothing',
      "import { expect } from '@playwright/test'\nimport { DOCS } from '@/lib/marketing/docs'\nexport const slugs = DOCS.map((d) => d.slug)",
    ],
    [
      'a spec expanding a fixture from inside the suite rather than a product registry',
      "import { test } from '@playwright/test'\nimport { SEEDED } from './reseed'\nfor (const p of SEEDED) { test(p, async ({ page }) => { await page.goto(p) }) }",
    ],
    [
      'identity looseness: a longer name that merely starts with the import',
      "import { test } from '@playwright/test'\nimport { DOCS } from '@/lib/marketing/docs'\nconst DOCS_FIXTURE = ['/a']\nfor (const p of DOCS_FIXTURE) { test(p, async ({ page }) => { await page.goto(p) }) }",
    ],
  ]

  it.each(INNOCENTS)('leaves alone %s', (_why, source) => {
    expect(sitewidePageRegistries('e2e/some.spec.ts', source)).toEqual([])
  })
})

describe('the review-gate classifier', () => {
  it('flags a change in every area the review gate names', () => {
    // One real path per rule, spelled out rather than generated: if somebody
    // deletes a rule, this fails by name instead of quietly testing less.
    const cases: Record<string, string> = {
      'ci-workflows': '.github/workflows/ci.yml',
      'deploy-path': 'scripts/db-migrate.mjs',
      'db-migrations': 'lib/db/migrations/0161_connect_refund_records.sql',
      money: 'lib/services/balance-payments.ts',
      auth: 'lib/auth/context.ts',
      'token-surfaces': 'app/b/[token]/page.tsx',
      'tenant-scoping': 'lib/db/index.ts',
      'read-checks': 'lib/read-checks.ts',
      'check-definitions': 'vitest.config.ts',
    }

    expect(
      Object.keys(cases).sort(),
      'every rule in scripts/review-gate.mjs needs a case here, or the new area ships untested',
    ).toEqual(GATE_RULES.map((r: { id: string }) => r.id).sort())

    for (const [id, file] of Object.entries(cases)) {
      expect(areasFor(file), `${file} must trip the '${id}' rule`).toContain(id)
    }
  })

  it('says nothing about a test-only or docs-only PR', () => {
    // The convention exempts these explicitly, and a check that cried review on
    // every PR would be one people stop reading inside a week.
    const ordinary = [
      'tests/payments/fees.test.ts',
      'e2e/portal.spec.ts',
      'docs/CI.md',
      'docs/RELEASE.md',
      'components/ui/action-button.tsx',
    ]

    expect(areasFor(...ordinary)).toEqual([])

    // NEITHER obligation, not just neither review (DREAMCRM-49). The intake
    // rule sits next to the review rules and would be just as easy to widen
    // into everything; `tests/**` holds ~6,900 tests that assert about one
    // unit each and change nothing for anybody else.
    expect(intakeAreasFor(...ordinary)).toEqual([])
  })

  it('flags the whole PR on one risky file among many exempt ones', () => {
    // THE #517 SHAPE. A workflow hunk riding along in an otherwise exempt PR is
    // how the gate was skipped, and "the risky file is a small part of the
    // change" is the argument this exists to refuse.
    const findings = gateFindings([
      'components/ui/status-pill.tsx',
      'components/ui/kpi-stat.tsx',
      'tests/ui/status-pill.test.tsx',
      'docs/DESIGN-SYSTEM.md',
      '.github/workflows/deploy.yml',
    ])

    expect(findings.map((f: { id: string }) => f.id)).toEqual(['ci-workflows'])
    expect(findings[0].files).toEqual(['.github/workflows/deploy.yml'])
  })

  it('leaves no file on this list ungated — the direction that decays', () => {
    // THE MISS THIS TEST EXISTS FOR (review of #553). Every other test here
    // asks "does each pattern still point at something?". None asked the
    // opposite — "is there a file that should be gated and matches nothing?" —
    // and that is the direction that decays, because it fails every time
    // somebody adds a service.
    //
    // It shipped with `lib/services/refunds.ts`, `orders.ts`, `revenue.ts`,
    // `membership.ts`, `platform-mrr.ts` and `lib/mrr.ts` reported CLEAN, plus
    // every nested token route — `app/*/[token]/**` reached the single-letter
    // public routes and missed `app/api/calendar/[token]`, which hands out a
    // clinic's whole agenda on a token alone.
    //
    // A FALSE CLEAN IS WORSE THAN SILENCE. Before this check an author had to
    // remember the gate; after it, something authoritative tells them they do
    // not have to. So the bar is the one the workflow's own header sets — right
    // 100% of the time, not 95%.
    //
    // Curated rather than derived: a heuristic over the tree would be a second,
    // looser model of the same policy, and the two would disagree. These are
    // named files whose being gated is not a judgement call.
    const MUST_BE_GATED: Record<string, string> = {
      'lib/services/refunds.ts': 'money',
      'lib/services/orders.ts': 'money',
      'lib/services/revenue.ts': 'money',
      'lib/services/membership.ts': 'money',
      'lib/services/platform-mrr.ts': 'money',
      'lib/services/invoices.ts': 'money',
      'lib/services/payment-plans.ts': 'money',
      'lib/services/balance-payments.ts': 'money',
      'lib/services/referral-payouts.ts': 'money',
      'lib/services/shop-checkout.ts': 'money',
      'lib/services/loyalty.ts': 'money',
      'lib/services/coupons.ts': 'money',
      // The end-of-batch sweep: four Stripe-touching modules with no money
      // word in the filename. `domain-purchase.ts` creates payment intents and
      // refunds against the clinic's platform-billing customer;
      // `clinic-provisioning.ts` creates Stripe coupons and customers; the
      // other two read Stripe invoices for the platform's own revenue numbers,
      // which is the same class as `revenue.ts` and `platform-mrr.ts`.
      'lib/services/domain-purchase.ts': 'money',
      'lib/services/clinic-provisioning.ts': 'money',
      'lib/services/clinics.ts': 'money',
      'lib/services/operations.ts': 'money',
      'lib/trial.ts': 'money',
      // The money UI (batch 60). `lib/**` alone let the button that fires a
      // partner payout through as "merges on green" — see the note on the
      // money patterns in scripts/review-gate.mjs.
      'app/(default)/partners/delete-partner-modal.tsx': 'money',
      'app/(partner)/partner/partner-payout.tsx': 'money',
      'app/(default)/partners/admin-actions.ts': 'money',
      'app/(default)/shop/actions.ts': 'money',
      // The patient-facing half. `app/b/[token]/actions.ts` and
      // `app/i/[token]/actions.ts` are money too, but they are already pinned
      // below under `token-surfaces` and this map holds one expected rule per
      // file — either gating is enough to put the PR through review, and the
      // pattern list in the script now names them under money as well.
      'app/site/[slug]/shop/actions.ts': 'money',
      'app/site/[slug]/membership/actions.ts': 'money',
      // The booking deposit (DREAMCRM-57) — `submitBookingRequest` prices the
      // per-visit-type deposit and opens a Stripe Checkout session for it.
      // Same class as its two siblings above, missed on the pass that added
      // them.
      'app/site/[slug]/actions.ts': 'money',
      'app/(default)/billing/activate/actions.ts': 'money',
      'app/(onboarding)/actions.ts': 'money',
      'lib/mrr.ts': 'money',
      'lib/stripe.ts': 'money',
      'app/api/webhooks/stripe/route.ts': 'money',
      'app/api/webhooks/stripe-connect/route.ts': 'money',
      'app/api/calendar/[token]/route.ts': 'token-surfaces',
      'app/api/unsub/[token]/route.ts': 'token-surfaces',
      'app/api/track/click/[token]/route.ts': 'token-surfaces',
      'app/api/track/open/[token]/route.ts': 'token-surfaces',
      'app/b/[token]/actions.ts': 'token-surfaces',
      'app/i/[token]/actions.ts': 'token-surfaces',
      'lib/marketing/tokens.ts': 'token-surfaces',
      'lib/services/calendar-feed.ts': 'token-surfaces',
      'lib/session.ts': 'auth',
      'lib/auth/context.ts': 'auth',
      'middleware.ts': 'auth',
      // The demo-context minter (DREAMCRM-47): `enterDemoMode` writes the
      // cookie `getTenantContext` reads AHEAD of real org membership, so it
      // decides which organization the whole app renders as. Pinned because
      // its filename says "ecommerce customers" and nothing about auth.
      'app/(default)/ecommerce/customers/admin-actions.ts': 'auth',
      // The written opt-out from the axe ratchet (DREAMCRM-60). Pinned because
      // the whole design rests on it: `e2e/axe-baseline.ts` is deliberately off
      // every gate (a shrink is routine and a pattern cannot tell a shrink from
      // a raise), and this file is the half that only ever holds raises. Drop it
      // from the gate list and a deliberate weakening of a required check goes
      // back to merging with a "merges on green" summary.
      'e2e/axe-baseline-raises.ts': 'check-definitions',
      'lib/db/migrations/0161_connect_refund_records.sql': 'db-migrations',
      '.github/workflows/deploy.yml': 'ci-workflows',
      '.github/workflows/migration-check.yml': 'ci-workflows',
      'Dockerfile': 'deploy-path',
      // What the required checks actually run (DREAMCRM-49). `.github/` names
      // the job; these name the work inside it. `e2e/axe.ts` carries the
      // accessibility harness's EXCLUSIONS, which is the one kind of edit to a
      // gate that can only ever make it looser — and it leaves no trace under
      // `.github/` at all. `scripts/review-gate.mjs` is this file's own
      // subject: the list that decides which PRs reach a reviewer.
      //
      // `scripts/rulebook-drift.mjs` joined them in #571 for the same reason
      // one step further out: it holds the claims the daily drift check grades,
      // and deleting one leaves that check reporting CLEAN about a fact it no
      // longer looks at. It arrived on `ci-workflows` in that PR and moved here
      // on contact with this rule, which is the better home — the point is not
      // that it runs in a workflow, it is that it decides what gets asked.
      'vitest.config.ts': 'check-definitions',
      'playwright.config.ts': 'check-definitions',
      'e2e/axe.ts': 'check-definitions',
      'scripts/review-gate.mjs': 'check-definitions',
      'scripts/rulebook-drift.mjs': 'check-definitions',
      // The post-merge sweep (DREAMCRM-61). Pinned for the reason the two
      // above are: it decides which merged PRs get reported as having skipped
      // a review, and the edit that disables it is not a deletion — it is a
      // widened definition of "satisfied", after which the alarm runs green
      // every morning and sees nothing.
      'scripts/review-sweep.mjs': 'check-definitions',
      // The post-deploy migration assertion (DREAMCRM-46). Pinned because it is
      // the thing that decides whether a deploy may report success, and a
      // "small tweak to a script" is exactly how such a check gets loosened
      // review-free.
      'scripts/migration-check.mjs': 'deploy-path',
      // The post-build rollout assertion (DREAMCRM-86) — the same argument one
      // step earlier in the pipeline. It decides whether the deploy JOB may
      // report success, and it carries the repo's only deliberate
      // green-while-unverified path (the missing IAM grant), which is exactly
      // the kind of escape hatch that must not widen review-free.
      'scripts/rollout-check.mjs': 'deploy-path',
      // The production read-check catalog (DREAMCRM-42). Pinned because the
      // per-entry review is the ENTIRE control on "no PHI in a log anything
      // with repo read can open" and on the cross-tenant waiver — and because
      // a catalog-only PR is otherwise the easiest thing in this repo to
      // mistake for a one-line data change.
      'lib/read-checks.ts': 'read-checks',
      'app/api/admin/read-check/route.ts': 'read-checks',
      'scripts/readonly-role.sql': 'read-checks',
    }

    const tracked = new Set(trackedFiles())
    const ungated: string[] = []
    const vanished: string[] = []

    for (const [file, expectedRule] of Object.entries(MUST_BE_GATED)) {
      // A file that has been renamed away makes this entry a claim about
      // nothing — the same rot the pattern test catches, one level up.
      if (!tracked.has(file)) {
        vanished.push(file)
        continue
      }
      const areas = areasFor(file)
      if (!areas.includes(expectedRule)) {
        ungated.push(`${file} → expected '${expectedRule}', got ${areas.length ? areas.join(', ') : 'NOTHING'}`)
      }
    }

    expect(
      vanished,
      'These files no longer exist, so this list is asserting about a tree that moved. Re-point ' +
        'each entry at wherever the surface lives now — do not just delete it, or the gate quietly ' +
        'stops covering a real area.',
    ).toEqual([])

    expect(
      ungated,
      'These files are on the pre-merge review list by policy, and scripts/review-gate.mjs does ' +
        'not flag them — so a PR touching them would be told, with a green tick, that it merges ' +
        'on green. A false clean is worse than silence: before this check an author had to ' +
        'remember the gate; after it, something authoritative tells them they do not have to.',
    ).toEqual([])
  })

  it('gates every file that reaches the Stripe client — derived, not remembered', () => {
    // THE CURATED LIST ABOVE IS A LIST OF FILES SOMEBODY THOUGHT OF. This one
    // is not: importing `@/lib/stripe` is unambiguous evidence that a module
    // touches money, so the tree can answer the question itself, and a NEW
    // money module fails here on the day it arrives rather than on the day
    // somebody remembers to add it.
    //
    // It came out of the end-of-batch sweep Sentinel asked for. Reviewing #553
    // found `domain-purchase.ts` ungated; asking the tree instead of reading
    // filenames found FOUR — `domain-purchase`, `clinic-provisioning`,
    // `clinics` and `operations`, none of which carries a money word. Adding
    // four patterns would have closed four holes; this closes the class.
    //
    // Deliberately a NECESSARY condition, not a definition of the money area:
    // plenty of money code (fee math, cart totals, the payment-plan schedule)
    // never imports the client, and the curated list and the word patterns
    // stay responsible for that. This only catches the direction where the
    // evidence is mechanical.
    const ungated = trackedFiles()
      .filter((f) => /^(lib|app)\/.*\.tsx?$/.test(f))
      .filter((f) => /from '@\/lib\/stripe'/.test(readFileSync(join(process.cwd(), f), 'utf8')))
      .filter((f) => !areasFor(f).includes('money'))

    expect(
      ungated,
      'These files import the Stripe client and the review gate does not flag them as money — so ' +
        'a PR changing a charge, a refund or a payout in one of them would be reported clean. Add ' +
        'each to the money patterns in scripts/review-gate.mjs (and to MUST_BE_GATED above), or ' +
        'say in a comment why reaching Stripe is not money here.',
    ).toEqual([])
  })

  it('replays PR #566: no review owed, an intake owed, and the summary says both', () => {
    // THE PR THIS RULE EXISTS FOR (DREAMCRM-49). #566 added rule 4 to
    // `tests/a11y/class-pairs.ts` — a new class of blocking assertion inside
    // the required `test` check — and this script printed "✅ No review-gate
    // files in this PR ... merges on green". That was the RIGHT answer to the
    // review question and no answer at all to the one that mattered.
    //
    // Both halves are asserted, because getting either backwards undoes the
    // fix: widening the review rule instead would have put roughly a third of
    // the repo's recent PRs into a review queue of one, which is how a gate
    // gets routed around.
    const pr566 = [
      'DESIGN-SYSTEM.md',
      'app/(marketing)/page.tsx',
      'docs/RELEASE.md',
      'docs/UI-BEST-VERSION.md',
      'tests/a11y/class-pairs.ts',
      'tests/a11y/token-contrast.test.ts',
    ]

    expect(
      areasFor(...pr566),
      'PR #566 was correctly exempt from review — a test-only diff plus conformant UI polish, ' +
        'nothing on the §3 gate list. Widening a review rule to catch it would be the wrong fix.',
    ).toEqual([])

    expect(
      intakeAreasFor(...pr566),
      'PR #566 added a new blocking assertion class to the required `test` check. Something has ' +
        'to say so on the run, or the next author is told "merges on green" by the one part of ' +
        'the system that is supposed to know.',
    ).toEqual(['blocking-assertions'])

    const summary = renderSummary(gateFindings(pr566), pr566.length, intakeFindings(pr566))
    expect(summary).toContain('No review-gate files in this PR')
    expect(summary).toContain('may change what can merge')
    expect(summary).toContain('mention://agent/187124c3-23a7-47f6-bdee-e90bfc3fa216')
  })

  it('puts every product-tree scanner in the suite on the intake list — derived, not remembered', () => {
    // THE DIRECTION A PATH LIST CANNOT COVER BY ITSELF. `INTAKE_RULES` names
    // the scanners that exist today. The shape that got #566 through is a
    // scanner that does NOT exist yet: a brand-new file matches no pattern, so
    // the enumeration is silent about it on exactly the day it arrives. That
    // is not hypothetical — `dark-mode-parity.test.ts` (#555) and
    // `shared-pending.ts` (#559) were both new files carrying a new zero.
    //
    // So this asks the tree instead, on the same terms as the `@/lib/stripe`
    // test above: mechanical evidence, not a judgement. A suite file that
    // WALKS A DIRECTORY (`readdirSync`, or `git ls-files`) and names a product
    // root (`'app'`, `'components'`, `'lib'`) is reading source it did not
    // name — its assertion is about the whole tree, and changing it changes
    // what everyone else can merge. Modules that reach the walker through an
    // import count too, which is how `class-pairs.ts` reaches
    // `token-contrast.test.ts` and `jsx-attrs.ts` reaches `shared-pending.ts`.
    //
    // Failing here is cheap to fix and says what to do: add the file to
    // `blocking-assertions` in scripts/review-gate.mjs. The point is that the
    // author of the next tree-wide rule has to make that call consciously,
    // rather than being told by a green tick that nobody needs to know.
    const suite = trackedFiles().filter((f) => /^(tests|e2e)\/.*\.tsx?$/.test(f))
    const src = new Map(suite.map((f) => [f, readFileSync(join(process.cwd(), f), 'utf8')]))

    const localImports = (f: string): string[] => importedModules(f, src.get(f)!)

    const WALKS = /readdirSync|'ls-files'/
    const PRODUCT_ROOT = PRODUCT_ROOT_RE
    const walkers = new Set(suite.filter((f) => WALKS.test(src.get(f)!)))

    const scanners = new Set(
      suite.filter(
        (f) =>
          PRODUCT_ROOT.test(src.get(f)!) &&
          (walkers.has(f) || localImports(f).some((i) => walkers.has(i))),
      ),
    )
    // Whoever imports a scanner is asserting with it.
    for (let grew = true; grew; ) {
      grew = false
      for (const f of suite) {
        if (scanners.has(f)) continue
        if (localImports(f).some((i) => scanners.has(i))) {
          scanners.add(f)
          grew = true
        }
      }
    }

    // The instrument check the shared-pending guard taught us to write: a
    // detector narrowed until it matches nothing reports CLEAN forever, and
    // this one is built out of two regexes that a refactor could stop
    // matching. `class-pairs.ts` is the file rule 4 landed in.
    expect(
      scanners.has('tests/a11y/class-pairs.ts'),
      'the scanner detector stopped seeing tests/a11y/class-pairs.ts, so it is no longer ' +
        'detecting anything and the assertion below is worth nothing',
    ).toBe(true)
    expect(scanners.size).toBeGreaterThan(10)

    const unlisted = Array.from(scanners)
      .filter((f) => intakeAreasFor(f).length === 0)
      .sort()

    expect(
      unlisted,
      'These files hold an assertion about the WHOLE product tree and are not on the intake list ' +
        'in scripts/review-gate.mjs — so a PR that adds or loosens a rule in one of them would ' +
        'be told, on the job summary, that it merges on green with nothing else to do. That is ' +
        'exactly what PR #566 was told. Add each to the `blocking-assertions` patterns; if the ' +
        'scan is genuinely bounded, narrow it to name the files it reads instead.',
    ).toEqual([])
  })

  it('puts every PALETTE-GRADING suite file on the intake list too — derived, not remembered', () => {
    // THE SECOND DERIVATION, AND THE HOLE IT CLOSES (found by Forge's gate
    // sweep, 2026-09-15). #598 merged a new class of assertion —
    // `tests/a11y/muted-ink-direction.test.ts`, which grades the direction of
    // the muted ink in both themes — with NO labels and no intake mention, and
    // the label could not have fired. That file is on no enumerated
    // `INTAKE_RULES` path, and it is not a tree walk either: it reads the
    // palette and two named components. So both halves of the detector above
    // had nothing to catch.
    //
    // The shape the walk-detector misses: **a test that grades the PALETTE is
    // asserting a repo-wide fact by construction**, whether or not it opens a
    // directory. `tests/a11y/palette.ts` is the one place this repo resolves
    // its own colours and computes AA; a rule built on it is a rule about
    // every colour in the product, and changing what it asserts changes what
    // everyone else can merge — which is the whole test for intake.
    //
    // Deriving it from the import rather than listing one more path is the
    // point: the next palette rule is caught on the day it arrives, by the
    // same mechanism that caught the next tree walk.
    const suite = trackedFiles().filter((f) => /^(tests|e2e)\/.*\.tsx?$/.test(f))
    const src = new Map(suite.map((f) => [f, readFileSync(join(process.cwd(), f), 'utf8')]))

    // RESOLVED, not pattern-matched, and resolved through the SHARED helper.
    // The first draft of this rule matched any import path ENDING in
    // `/palette`, and it named two files that grade a product module which
    // happens to share the word — `@/lib/site-templates/cosmetic/palette` and
    // `@/lib/clinic-site-theme`. Those grade one template's recipe against its
    // own inputs; they are bounded, and sweeping them in would be the "208
    // places to catch 8" trade one directory over.
    //
    // The SECOND draft — the one that shipped in #597 — fixed that by
    // resolving the import, and resolved only the RELATIVE spelling. Sentinel
    // planted `from '@/tests/a11y/palette'` and watched this come back clean.
    // `importedModules` above now owns both spellings and is red-run against
    // each; see its header for why the miss was structural rather than sloppy.
    const PALETTE_MODULE = 'tests/a11y/palette.ts'
    const importsPalette = (f: string): boolean =>
      importedModules(f, src.get(f)!).includes(PALETTE_MODULE)

    const graders = suite.filter((f) => f !== PALETTE_MODULE && importsPalette(f))

    // The instrument check, for the same reason the walk-detector carries one:
    // a regex narrowed until it matches nothing reports CLEAN forever.
    expect(
      graders,
      'the palette-grader detector stopped matching anything, so the assertion below is worth nothing',
    ).toContain('tests/a11y/token-contrast.test.ts')

    const unlisted = graders.filter((f) => intakeAreasFor(f).length === 0).sort()
    expect(
      unlisted,
      'These files grade the PALETTE — the one module where this repo resolves its own colours ' +
        'and computes AA — so they assert a repo-wide fact even when they never walk the tree, ' +
        'and they are not on the intake list in scripts/review-gate.mjs. That is the gap #598 ' +
        'went through: a new class of assertion, merged with no label and no intake, because it ' +
        'was neither an enumerated path nor a directory walk. Add each to `blocking-assertions`.',
    ).toEqual([])
  })

  it('puts every BROWSER-DRIVEN site-wide spec on the intake list — derived, not remembered', () => {
    // THE THIRD DERIVATION, AGAINST THE REAL TREE. Its criterion, its two
    // directions and everything it does not cover are on `sitewidePageRegistries`
    // above; this is the part that asks the repo.
    //
    // WATCHED TO FAIL, STAGED FIRST (§2d — a `git ls-files`-derived guard is
    // blind to the file you have not staged). `e2e/planted-sitewide.spec.ts`
    // was written as a browser-driven spec expanding `COMPARISONS` from
    // `lib/marketing/comparisons` into its stops, `git add`-ed so `git ls-files`
    // could see it, and this test went red naming that exact path — while the
    // nineteen real specs beside it stayed silent. Then the same file with its
    // registry import replaced by a hand-typed list of the same eight paths ran
    // GREEN, which is the discrimination rather than the detection. The fixture
    // is not kept in the tree, for the reason Sentinel's mutation file is not:
    // a permanent unlisted site-wide spec would trip the very rule it
    // demonstrates. The durable form is the table above plus this record.
    const suite = trackedFiles().filter((f) => /^(tests|e2e)\/.*\.tsx?$/.test(f))
    const src = new Map(suite.map((f) => [f, readFileSync(join(process.cwd(), f), 'utf8')]))

    // THE INSTRUMENT CHECK, and it cannot be a tracked file the way the other
    // two derivations' can: a site-wide spec that is on the intake list is
    // still a match, but the only one in the tree is whichever lands first, and
    // a guard anchored to a single filename goes quiet on a rename. So the
    // anchor is the planted positive — narrow any of the three predicates until
    // this stops matching and the assertion below is worth nothing.
    expect(
      sitewidePageRegistries(
        'e2e/anchor.spec.ts',
        "import { test } from '@playwright/test'\nimport { COMPARISONS } from '@/lib/marketing/comparisons'\nfor (const c of COMPARISONS) { test(c.slug, async ({ page }) => { await page.goto(`/compare/${c.slug}`) }) }",
      ),
      'the browser-driven detector stopped matching its own planted positive, so it is no longer ' +
        'detecting anything and the assertion below is worth nothing',
    ).toEqual(['COMPARISONS'])

    // And the innocent direction against the real files rather than fixtures:
    // `smoke.spec.ts` loops four hand-typed paths through `page.goto`, which is
    // the shape a looser criterion would redden. If this ever becomes a real
    // match, the file has grown a derived page list and belongs on the list.
    expect(
      sitewidePageRegistries('e2e/smoke.spec.ts', src.get('e2e/smoke.spec.ts')!),
      'e2e/smoke.spec.ts is a bounded journey spec with a hand-typed path list; a detector that ' +
        'flags it is catching the nineteen innocents in e2e/ along with the guard it is after',
    ).toEqual([])

    const sitewide = suite.filter((f) => sitewidePageRegistries(f, src.get(f)!).length > 0)
    const unlisted = sitewide.filter((f) => intakeAreasFor(f).length === 0).sort()

    expect(
      unlisted,
      'These specs drive a browser and expand a PRODUCT ROUTE REGISTRY into the pages they ' +
        'visit, so they assert about every page in that registry — including the ones added ' +
        'after they were written — and they are not on the intake list in ' +
        'scripts/review-gate.mjs. That is the gap PR #621 had to close by hand for ' +
        'e2e/marketing-viewport.spec.ts: a browser-driven site-wide guard reads no source, so ' +
        'neither source-reading derivation above can ever see it. Add each to ' +
        '`blocking-assertions`; if the spec is genuinely a bounded journey, type the handful of ' +
        'paths it visits instead of expanding a registry.',
    ).toEqual([])
  })

  it('keeps the two obligations separately answerable', () => {
    // A rule id appearing in both lists would make `areas` ambiguous on the
    // workflow output and, worse, make "does this owe a review?" and "does
    // this owe an intake?" answer each other.
    const gate = GATE_RULES.map((r: { id: string }) => r.id)
    const intake = INTAKE_RULES.map((r: { id: string }) => r.id)
    expect(intake.filter((id: string) => gate.includes(id))).toEqual([])

    // And every intake rule carries the same two fields the summary renders,
    // so a new one cannot ship printing `undefined` at an author.
    for (const rule of INTAKE_RULES) {
      expect(rule.area, `intake rule '${rule.id}' needs an area`).toBeTruthy()
      expect(rule.why, `intake rule '${rule.id}' needs a why`).toBeTruthy()
    }
  })

  it('every gate pattern still matches a real file in this tree', () => {
    const files = trackedFiles()
    const dead: string[] = []

    for (const rule of [...GATE_RULES, ...INTAKE_RULES]) {
      for (const pattern of rule.patterns) {
        const re = globToRegExp(pattern)
        if (!files.some((f) => re.test(f))) dead.push(`${rule.id}: ${pattern}`)
      }
    }

    expect(
      dead,
      'These gate patterns match nothing in the tree any more, so whatever they were written to ' +
        'protect has moved and is now OUTSIDE the review gate — silently, because the classifier ' +
        'goes on reporting those PRs clean. Re-derive them against the current paths (or delete ' +
        'the pattern deliberately, if the area really is gone).',
    ).toEqual([])
  })

  it('carries no shebang, so this file can be imported on a Windows checkout', () => {
    // Found the hard way. git gives a Windows working tree CRLF endings, and
    // vitest's SSR transform leaves the `\r` behind when it strips `#!…` —
    // every test in this file then died with a parse error at column 1, on
    // Windows only, while CI stayed green. `docs/CI.md` says Windows is a
    // supported dev platform, and a guard that runs on one OS is half a guard.
    // The workflow invokes `node scripts/review-gate.mjs`, so the shebang was
    // never doing anything.
    const src = readFileSync(join(process.cwd(), 'scripts/review-gate.mjs'), 'utf8')
    expect(
      src.startsWith('#!'),
      'scripts/review-gate.mjs must not start with a shebang: with CRLF line endings it breaks ' +
        'vitest’s transform, and this whole guard file stops running on a Windows checkout.',
    ).toBe(false)
  })

  it('matches paths the way git reports them, on every platform', () => {
    // Windows is a supported dev platform and `\` is its separator. Every
    // producer (gh pr diff, git diff --name-only, git ls-files) emits `/`, but
    // a hand-run on a dev box should not quietly report a clean diff.
    expect(areasFor('lib\\db\\migrations\\0161_connect_refund_records.sql')).toContain('db-migrations')
  })

  it('is the file the workflow runs, and that workflow cannot publish a required check name', () => {
    const wf = readFileSync(join(process.cwd(), '.github/workflows/review-gate.yml'), 'utf8')

    expect(wf).toContain('node scripts/review-gate.mjs')

    // `test` and `e2e` are main's required status-check contexts. A second
    // producer of either name can report a green check onto a commit the real
    // gate never ran against — the exact reason the nightly and post-merge jobs
    // are named the way they are.
    //
    // ASSERTED ON THE EFFECTIVE CONTEXT, not the job key (review of #553). The
    // check-run context is the job's `name:` when it has one, and this very
    // workflow proves the two differ: key `review-gate`, context `review-gate
    // (advisory, does not block the merge)`. A guard that only looked at keys
    // would pass on a job keyed `review-gate` carrying `name: test` — which
    // would publish a check literally named `test` and satisfy branch
    // protection with a green tick the suite never produced.
    const contexts = [
      ...Array.from(wf.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)).map((m) => m[1]),
      ...Array.from(wf.matchAll(/^ {4}name:\s*(.+?)\s*$/gm)).map((m) => m[1].replace(/^['"]|['"]$/g, '')),
    ]

    for (const context of contexts) {
      expect(
        ['test', 'e2e'],
        `.github/workflows/review-gate.yml would publish a check context named '${context}', which ` +
          `is a REQUIRED status check on main. A green tick under that name satisfies branch ` +
          `protection without the suite ever having run. This workflow is advisory; give it a ` +
          `name that says so.`,
      ).not.toContain(context)
    }
  })
})
