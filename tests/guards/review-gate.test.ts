import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GATE_RULES, gateFindings, globToRegExp } from '../../scripts/review-gate.mjs'

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
    expect(
      areasFor(
        'tests/guards/review-gate.test.ts',
        'tests/payments/fees.test.ts',
        'e2e/portal.spec.ts',
        'docs/CI.md',
        'docs/RELEASE.md',
        'components/ui/action-button.tsx',
      ),
    ).toEqual([])
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
      'lib/db/migrations/0161_connect_refund_records.sql': 'db-migrations',
      '.github/workflows/deploy.yml': 'ci-workflows',
      'Dockerfile': 'deploy-path',
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

  it('every gate pattern still matches a real file in this tree', () => {
    const files = trackedFiles()
    const dead: string[] = []

    for (const rule of GATE_RULES) {
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
