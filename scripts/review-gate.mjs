// NO SHEBANG, DELIBERATELY — the workflow runs `node scripts/review-gate.mjs`,
// so it was never load-bearing, and it broke the guard test on a Windows
// checkout. git hands this file to a Windows working tree with CRLF endings,
// and vitest's SSR transform leaves the `\r` behind when it strips `#!…`,
// producing a parse error at column 1 in every test that imports this module.
// `docs/CI.md` says Windows is a supported dev platform; a guard that only
// runs on Linux is half a guard.
/**
 * WHICH FILES IN THIS PR NEED SENTINEL'S EYES BEFORE IT MERGES.
 *
 * The repo has had a pre-merge review gate since the Foundations cycle —
 * money, tenant scoping, auth and token surfaces, DB migrations, CI workflow
 * files, branch protection, the deploy pipeline. Until now it lived entirely
 * in a skill document and in the habits of whoever happened to be reading it.
 * Nothing in the repository knew the list, so nothing could ever object: a
 * forgotten review request on a fee calculation or a migration merged green,
 * with every check passing and no part of the system aware that a rule had
 * been skipped.
 *
 * That is not a hypothetical either. PR #517 edited a workflow file review-free
 * by riding along in a UI-polish PR — and the convention's own answer to that
 * ("classify by the riskiest file in the diff, not by the headline") is
 * precisely the judgement a person makes worst at the end of a long change and
 * a machine makes perfectly.
 *
 * WHAT THIS IS NOT: a gate. It labels and it writes a summary. It is not a
 * required check, it cannot block a merge, and it must never try to — a second
 * blocking check on the riskiest PRs in the repo would put the review gate's
 * own outages in front of production fixes, and an advisory that is right 100%
 * of the time is worth more than a blocker that is right 95%. It also does not
 * know whether the review HAPPENED; it knows only whether one is owed.
 *
 * WHY PATTERNS AND NOT A CLEVERER TEST. The gate list is a policy, and policies
 * are enumerations. Anything smarter — reading imports, tracing call graphs —
 * would be a model of the rule rather than the rule, and would disagree with
 * the skill document the first time either moved. `tests/guards/review-gate.test.ts`
 * pins the other half of that bargain: every pattern here must still match a
 * real file, so a rename cannot silently drop a whole area out of the gate.
 *
 * Usage:  node scripts/review-gate.mjs <file-with-one-path-per-line>
 *         node scripts/review-gate.mjs --paths a/b.ts c/d.ts
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * THE GATE LIST, as paths.
 *
 * One entry per area the `dreamcrm-conventions` review gate names, worded so a
 * PR author reading the summary learns WHY rather than just THAT. Keep these in
 * step with the skill: this file is the enforcement, that document is the
 * policy, and the two disagreeing is worse than neither existing.
 *
 * Patterns support `*` (one segment) and `**` (any depth). `[` is literal —
 * Next.js route folders are named `[token]`, and a glob engine that reads that
 * as a character class would match nothing at all, silently.
 */
export const GATE_RULES = [
  {
    id: 'ci-workflows',
    area: 'CI workflow files',
    why:
      'a workflow file decides which checks run at all, so it is the gate every other gate ' +
      'stands on. #517 edited one review-free by riding along in a UI-polish PR.',
    patterns: ['.github/workflows/**'],
  },
  {
    id: 'deploy-path',
    area: 'the deploy pipeline',
    why:
      'main auto-deploys to production and migrations apply on boot, so a merge here is a ' +
      'production release.',
    patterns: [
      'Dockerfile',
      'scripts/db-migrate.mjs',
      'scripts/migrate.mjs',
      'scripts/setup-cron-schedules.sh',
      'app/api/admin/migrate/**',
    ],
  },
  {
    id: 'db-migrations',
    area: 'DB migrations',
    why: 'migrations apply on boot against the production database; a bad one wedges a deploy.',
    patterns: ['lib/db/migrations/**'],
  },
  {
    id: 'money',
    area: 'money — fees, payouts, payment plans, loyalty, carts',
    why: 'a one-line change to fee math moves real money, which is why size never exempts it.',
    // WORD PATTERNS, not a file list. The first draft of this rule enumerated
    // seventeen exact filenames and missed refunds, order totals, revenue and
    // MRR — every one of them present on `main` at the time, and every one
    // reported CLEAN by this check (caught in review of #553). Matching on the
    // words the money domain actually uses in its filenames covers what exists
    // AND most of what gets added next; the `must-be-gated` direction in
    // tests/guards/review-gate.test.ts is what catches the rest.
    patterns: [
      'lib/stripe.ts',
      'lib/stripe-config.ts',
      'lib/billing-status.ts',
      'lib/mrr.ts',
      'lib/services/*stripe*.ts',
      'lib/services/*billing*.ts',
      'lib/services/*payment*.ts',
      'lib/services/*payout*.ts',
      'lib/services/*refund*.ts',
      'lib/services/*invoice*.ts',
      'lib/services/*order*.ts',
      'lib/services/*revenue*.ts',
      'lib/services/*mrr*.ts',
      'lib/services/*coupon*.ts',
      'lib/services/*membership*.ts',
      'lib/services/*purchase*.ts',
      'lib/services/shop*.ts',
      'lib/services/loyalty.ts',
      'lib/services/collections.ts',
      'lib/services/booking-deposits.ts',
      'lib/services/checkout-error.ts',
      'lib/services/referrals.ts',
      // No money word in the filename, and every one of them reaches Stripe.
      // Found by the sweep Sentinel asked for at the end of the batch — the
      // authoritative question turned out not to be "does the name look like
      // money" but "does it import `@/lib/stripe`", which is now enforced
      // directly in tests/guards/review-gate.test.ts.
      'lib/services/clinic-provisioning.ts', // creates Stripe coupons + customers
      'lib/services/clinics.ts', // lists Stripe invoices for the platform's numbers
      'lib/services/operations.ts', // same, for the ops dashboards
      // Decided deliberately rather than by pattern (Sentinel's judgement
      // call): `lib/trial.ts` moves no money, it decides ENTITLEMENT from
      // subscription state. Gated anyway, because it is the twin of
      // `lib/billing-status.ts` and `lib/services/billing-state.ts`, which are
      // both already on this list, and because a bug here either gives the
      // product away or locks out somebody who paid for it. Consistency beats
      // a fine distinction nobody will re-derive under pressure.
      'lib/trial.ts',
      'app/api/webhooks/stripe/**',
      'app/api/webhooks/stripe-connect/**',
      // THE MONEY UI (batch 60, found by Sentinel reviewing #559). Until now
      // this rule was `lib/**` plus the two Stripe webhooks, so a diff could
      // contain the button that FIRES a partner payout and be reported
      // "merges on green". The author classified it by hand and requested the
      // review, so the human half worked — but the machine half would have
      // told the next author the opposite, which is the quiet-wrong case the
      // gate exists to remove.
      //
      // Deliberately NOT `app/(default)/shop/**` or `payments/**` wholesale.
      // Those trees are mostly presentation, and gating every UI-polish PR on
      // them would put the gate in the way often enough to get it routed
      // around. What is listed is where money is actually SET IN MOTION: the
      // server actions, and the named client surfaces that call a payout or a
      // charge directly.
      'app/(default)/shop/**/actions.ts',
      'app/(default)/payments/**/actions.ts',
      'app/(default)/partners/**/admin-actions.ts',
      'app/(partner)/**/actions.ts',
      'app/(portal)/patient/invoices/**',
      // Fires `archivePartnerAction({ resolve: 'pay' | 'void' })` — pays out
      // or voids a partner's accrued commission from a button.
      'app/(default)/partners/delete-partner-modal.tsx',
      // The partner's own Stripe Connect onboarding entry point.
      'app/(partner)/partner/partner-payout.tsx',
      // THE PATIENT-FACING HALF (Sentinel, round 2 of the #559 review). The
      // first pass applied "gate where money is SET IN MOTION" only to the
      // staff route groups, and these meet the same test exactly — they are
      // `actions.ts` files rather than trees, so they cost a UI-polish PR
      // nothing, which is the whole objection the trees raised.
      'app/site/[slug]/shop/actions.ts', // startCheckout + applyCoupon discount arithmetic — carts
      'app/site/[slug]/membership/actions.ts', // startMembershipCheckout — a recurring charge
      'app/i/[token]/actions.ts', // startPlanSetupAction — payment plans, on a token-is-auth landing
      'app/b/[token]/actions.ts', // a patient-supplied amountCents, bounds-checked in this file
      // Same principle, checked on the same pass: both open a Stripe checkout.
      'app/(default)/billing/activate/actions.ts', // createActivationCheckout
      'app/(onboarding)/actions.ts', // provisions the plan tier at signup
    ],
  },
  {
    id: 'auth',
    area: 'auth and session surfaces',
    why: 'these decide who is signed in and what they may reach; middleware is the only door.',
    patterns: [
      'lib/auth.ts',
      'lib/auth-client.ts',
      'lib/auth/**',
      'lib/session.ts',
      'lib/cron-auth.ts',
      'lib/crypto.ts',
      'middleware.ts',
      'app/(auth)/**',
      'app/api/auth/**',
    ],
  },
  {
    id: 'token-surfaces',
    area: 'token surfaces — the token IS the authentication',
    why:
      'these routes have no session behind them; a leak in one is an open door with nothing ' +
      'else in front of it. The calendar feed hands out a clinic’s whole agenda on a token alone.',
    // `app/**/[token]/**`, not `app/*/[token]/**`. One segment reached the
    // single-letter public routes (/r, /c, /b, …) and MISSED every nested one:
    // app/api/calendar/[token], app/api/unsub/[token], app/api/track/*/[token]
    // (review of #553). The two modules that MINT and verify these tokens are
    // on the list for the same reason the routes are.
    patterns: [
      'app/**/[token]/**',
      'app/(partner-accept)/**',
      'lib/marketing/tokens.ts',
      'lib/services/calendar-feed.ts',
    ],
  },
  {
    id: 'read-checks',
    area: 'the production read-check catalog',
    why:
      'every entry runs against the production primary and its result lands in an Actions log ' +
      'anything with repo read can open, so the no-PHI rule and the cross-tenant waiver are ' +
      'per-entry review or they are nothing. Added with the catalog (DREAMCRM-42) because a ' +
      'follow-up PR adding one entry touched NOTHING on this list and reported "merges on ' +
      'green" — the first PR gated only because it also changed middleware and cron-auth.',
    // Deliberately not folded into `token-surfaces`: that rule's `why` is about
    // routes with no session behind them, and borrowing it would make its
    // stated reason false for half its members. A rule whose `why` does not
    // describe its patterns is how the next reader stops trusting this file.
    patterns: ['lib/read-checks.ts', 'app/api/admin/read-check/**', 'scripts/readonly-role.sql'],
  },
  {
    id: 'tenant-scoping',
    area: 'tenant scoping',
    why:
      'a scoping mistake leaks one clinic’s patient data to another, and there is no small ' +
      'version of that bug. NOTE this rule is a PROXY, not the area: every tenant-scoped query ' +
      'lives in lib/services/**, which is 190 files and not enumerable here, so a clean result ' +
      'from this rule is not coverage. tests/tenant-scoping/** is the real enforcement.',
    // lib/auth/context.ts (getTenantContext) is already covered by the auth rule.
    patterns: ['lib/db/index.ts'],
  },
]

/** `*` matches within a segment, `**` matches across them. Everything else is literal. */
export function globToRegExp(pattern) {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` (or a trailing `**`) spans any number of segments, including none.
        i++
        if (pattern[i + 1] === '/') i++
        out += '(?:.*/)?'
        // A trailing `**` should also match the directory's own files.
        if (i >= pattern.length - 1) out += '[^/]*'
      } else {
        out += '[^/]*'
      }
    } else {
      out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`)
}

const COMPILED = GATE_RULES.map((rule) => ({
  ...rule,
  matchers: rule.patterns.map(globToRegExp),
}))

/**
 * Which gate rules a set of changed files trips, and the files that tripped them.
 *
 * Paths must use forward slashes — every producer here (`gh pr diff`, `git diff
 * --name-only`, `git ls-files`) emits them, but Windows is a supported dev
 * platform and a backslashed path would match nothing while looking fine.
 */
export function gateFindings(files) {
  const normalized = files.map((f) => f.trim().replace(/\\/g, '/')).filter(Boolean)

  return COMPILED.map((rule) => ({
    id: rule.id,
    area: rule.area,
    why: rule.why,
    files: normalized.filter((f) => rule.matchers.some((m) => m.test(f))),
  })).filter((r) => r.files.length > 0)
}

/** The label the workflow puts on a PR that owes a review. */
export const REVIEW_LABEL = 'needs-sentinel-review'

export function renderSummary(findings, totalFiles) {
  if (findings.length === 0) {
    return [
      '### ✅ No review-gate files in this PR',
      '',
      `None of the ${totalFiles} changed ${totalFiles === 1 ? 'file is' : 'files are'} on the ` +
        'pre-merge review list, so this one merges on green.',
      '',
      'This check is advisory and never blocks a merge — it reads the diff against the gate list ' +
        'in the `dreamcrm-conventions` skill and says what it sees.',
      '',
    ].join('\n')
  }

  const count = findings.reduce((n, f) => n + f.files.length, 0)
  const lines = [
    '### 🛡️ This PR needs Sentinel’s review before it merges',
    '',
    `${count} changed ${count === 1 ? 'file is' : 'files are'} on the pre-merge review list. ` +
      '**Classify a PR by the riskiest file in its diff, not by its headline** — one hunk on this ' +
      'list puts the whole PR through review, however small a share of the change it is.',
    '',
  ]

  for (const finding of findings) {
    lines.push(`**${finding.area}** — ${finding.why}`, '')
    for (const file of finding.files) lines.push(`- \`${file}\``)
    lines.push('')
  }

  lines.push(
    'Request it by commenting on your issue with the PR link and this mention:',
    '',
    '```markdown',
    '[@Sentinel](mention://agent/030cc8a2-06a9-415d-a419-e8d5d7c01969)',
    '```',
    '',
    'Merge on `APPROVE` or `APPROVE WITH NOTES`; on `REQUEST CHANGES`, fix and re-request. This ' +
      'check cannot tell whether the review happened, only that one is owed — and it never blocks ' +
      'the merge either way.',
    '',
  )
  return lines.join('\n')
}

function githubOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`)
}

function main() {
  const args = process.argv.slice(2)
  let files = []

  if (args[0] === '--paths') {
    files = args.slice(1)
  } else if (args[0] && existsSync(args[0])) {
    files = readFileSync(args[0], 'utf8').split('\n')
  } else if (args[0]) {
    console.log(`[review-gate] no such file: ${args[0]}`)
    githubOutput('needs-review', 'false')
    return
  }

  files = files.map((f) => f.trim()).filter(Boolean)
  const findings = gateFindings(files)
  const summary = renderSummary(findings, files.length)

  console.log(summary)
  githubOutput('needs-review', findings.length > 0 ? 'true' : 'false')
  githubOutput('areas', findings.map((f) => f.id).join(','))

  if (findings.length > 0) {
    console.log(
      `::notice title=Sentinel review required::This PR touches ${findings
        .map((f) => f.area)
        .join('; ')}. Post the review request on your issue before merging.`,
    )
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  }
}

// Direct invocation only, so the guard test can import the classifier.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
