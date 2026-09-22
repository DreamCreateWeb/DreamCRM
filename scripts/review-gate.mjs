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
    id: 'check-definitions',
    area: 'what the required checks actually run',
    why:
      'the same argument that puts .github/workflows/** on this list, one level in. A workflow ' +
      'file names the job; these name the WORK inside it — which specs and tests run, with what ' +
      'retries, and (in e2e/axe.ts) which accessibility violations the harness is told to ignore. ' +
      'An exclusion is the one edit to a gate that can only ever make it looser, and it leaves no ' +
      'trace in .github/. scripts/review-gate.mjs is here for the same reason: it is the list ' +
      'that decides which PRs reach a reviewer at all, and scripts/rulebook-drift.mjs is the ' +
      'list of facts the rulebook asserts about this repo — delete a claim from it and the ' +
      'daily drift check goes on reporting CLEAN about something it no longer looks at. ' +
      'e2e/axe-baseline-raises.ts is the sharpest case of all: every entry in it is a ' +
      'deliberate, argued RAISE of an axe ceiling — a required check told to tolerate more ' +
      'than it did yesterday — and nothing shrinks a ceiling by editing that file.',
    // DELIBERATELY NOT `tests/**` or `e2e/**` wholesale — see INTAKE_RULES
    // below for why the rest of the suite is an intake obligation and not a
    // review one. These five are the files that decide what runs (or what gets
    // asked), as opposed to the files that assert something.
    patterns: [
      'vitest.config.ts',
      'playwright.config.ts',
      'e2e/axe.ts',
      // The written opt-out from the axe ratchet (DREAMCRM-60). The BASELINE
      // itself stays off every list here — shrinking it is the end of nearly
      // every accessibility fix, and a path pattern cannot tell a shrink from a
      // raise. This file can: it holds nothing but raises, so a diff touching it
      // is always the direction §2 forbids outright. That is the whole reason
      // the opt-out does not live beside the numbers it excuses.
      'e2e/axe-baseline-raises.ts',
      'scripts/review-gate.mjs',
      'scripts/rulebook-drift.mjs',
      // The post-merge half of this check (DREAMCRM-61). It decides which
      // merged PRs are reported as having skipped a review, and the edit that
      // breaks it is the quiet one: widen what counts as "satisfied" and the
      // sweep goes on running green every morning while seeing nothing. Same
      // argument as `scripts/rulebook-drift.mjs` beside it — a control that
      // reports CLEAN about a fact it no longer looks at.
      'scripts/review-sweep.mjs',
    ],
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
      // The post-deploy assertion that the applied-migration ledger matches the
      // journal (DREAMCRM-46). It decides whether a deploy is allowed to report
      // success, so weakening it is a deploy-path change even though it runs
      // after the deploy rather than during it.
      'scripts/migration-check.mjs',
      // The post-build assertion that the App Runner rollout actually served
      // (DREAMCRM-86). Same argument as `scripts/migration-check.mjs` above and
      // sharper: this one decides whether the deploy job reports success at
      // all, and the edit that breaks it is the quiet one — widen the
      // AccessDenied degrade path, or let ROLLBACK_SUCCEEDED read as a success,
      // and the job goes green on a deploy that never served.
      'scripts/rollout-check.mjs',
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
      // THE BOOKING DEPOSIT (DREAMCRM-57). Its two siblings above were added
      // on the "gate where money is SET IN MOTION, as actions.ts files rather
      // than trees" pass, and this one meets that test exactly and was missed:
      // `submitBookingRequest` reads the clinic's per-visit-type deposit
      // through `visitTypeDepositCents` and opens a Stripe Checkout session
      // for it via `createBookingDepositSession`. A PR changing what a patient
      // is charged to hold an appointment reported "merges on green". Found
      // the same way #569's was — while fixing an unrelated defect in the same
      // file — and widened in that PR rather than deferred.
      'app/site/[slug]/actions.ts',
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
      // THE DEMO-CONTEXT MINTER (DREAMCRM-47). `enterDemoMode` writes the
      // `demo_context` cookie, and `getTenantContext` gives that cookie
      // PRECEDENCE over real org membership — it decides which organization
      // the whole app renders as, for seven days. That is this rule's `why`
      // exactly ("these decide who is signed in and what they may reach"),
      // and the file matched nothing on the gate list: a PR changing which
      // org a platform admin can become reported "merges on green". Found
      // while fixing the missing target-org validation in the same function.
      'app/(default)/ecommerce/customers/admin-actions.ts',
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

/**
 * THE SECOND OBLIGATION: this PR changes what can merge, so the rulebook has to
 * hear about it. Intake, not review. (DREAMCRM-49.)
 *
 * WHY THIS EXISTS. PR #566 added rule 4 to `tests/a11y/class-pairs.ts` — a new
 * class of blocking assertion inside the required `test` check, which means a
 * gradient-text chunk that merged green yesterday fails today. It touched
 * nothing under `.github/`, nothing on the gate list above, and this script
 * printed **"✅ No review-gate files in this PR — merges on green"**. Its author
 * had predicted in the DREAMCRM-45 planning meeting that it would need routing,
 * remembered the §2 intake rule by hand, and routed it. The machine told them
 * the opposite, on the job summary, with a green tick.
 *
 * That is the fourth time this shape has occurred — the axe ratchet (#534,
 * three days to reach the skill), the shared-pending guard (#559), the brand
 * ramp's solid-fill rule (#555, whose second rule went unrecorded for a day
 * because only the headline half was routed), and #566. Every one of them
 * changed what can merge without touching a file any gate list named.
 *
 * WHY IT IS NOT A REVIEW. §2 of the conventions is explicit — "Intake, not
 * review: a test-only PR stays exempt from §3 unless its diff carries something
 * on the gate list." Folding these into `GATE_RULES` would have been the easy
 * move and the wrong one. Measured against the last 90 merged PRs, it would put
 * roughly a third of them into a review queue of one; the money rule was
 * narrowed deliberately to avoid exactly that ("gating every UI-polish PR on
 * them would put the gate in the way often enough to get it routed around"),
 * and a queue that long would do it faster. The obligation these files actually
 * carry is the cheap one: say so on the issue, mention Forge, so the rule
 * reaches the skill the same day instead of three days later.
 *
 * WHAT IS ON IT: the files that hold a repo-wide blocking assertion — a scan of
 * the product tree with a zero or a ceiling over whatever it finds — plus the
 * two modules those scans share (`palette.ts` computes every ratio, `jsx-attrs`
 * does every walk), where a one-line change silently re-grades every rule built
 * on it.
 *
 * WHAT IS DELIBERATELY NOT ON IT:
 *
 *   - `e2e/axe-baseline.ts`. It is an INVENTORY of debt that already exists,
 *     not a rule. Shrinking it is the expected end of every accessibility fix
 *     — it moved in 10 of the last 90 PRs — so labelling those would teach
 *     people the label means nothing. The direction that matters there is a
 *     ceiling going UP, which §2 already forbids outright and which a path
 *     pattern cannot see anyway. That wanted a monotonicity guard rather than a
 *     label, and since DREAMCRM-60 it has one:
 *     `tests/guards/axe-baseline-ratchet.test.ts` reads every entry's value on
 *     `origin/main` and fails any increase. The file stays off both lists; its
 *     written opt-out, `e2e/axe-baseline-raises.ts`, is on the REVIEW gate
 *     above, which is the split a path pattern could not make on its own.
 *   - `tests/**` and `e2e/**` wholesale. ~6,900 tests assert about one unit
 *     each and change nothing for anybody else.
 *
 * `tests/guards/review-gate.test.ts` closes the hole a path list cannot: a
 * BRAND-NEW guard file matches no pattern here, so the guard DERIVES the set
 * from the tree and fails `test` by name on the day one arrives. That is the
 * direction #566 got through. There are THREE derivations, and each keys on
 * something that MEANS "repo-wide fact by construction" rather than on "reads
 * another file" — §2 has twice refused the latter, because it describes most of
 * an 8,000-test suite and a queue catching a third of all PRs gets routed
 * around:
 *
 *   1. IT READS SOURCE IT DID NOT NAME. A suite file that walks a directory
 *      (`readdirSync` / `git ls-files`) and names a product root — `'app'`,
 *      `'components'`, `'lib'`, or one of their top-level divisions such as
 *      `'app/(marketing)'` — is grading every file under a tree, including the
 *      ones written after it.
 *   2. IT GRADES THE PALETTE. `tests/a11y/palette.ts` is the one place this
 *      repo resolves its own colours and computes AA, so a rule built on it is
 *      a rule about every colour in the product whether or not it opens a
 *      directory (#598).
 *   3. IT NAVIGATES PAGES IT DID NOT NAME (DREAMCRM-81). A browser-driven spec
 *      reads no source at all, so both predicates above correctly return false
 *      about it while it asserts about a whole site — which is why
 *      `e2e/marketing-viewport.spec.ts` had to be registered by hand. The
 *      mechanical evidence is the PAGE LIST: a Playwright spec that expands a
 *      product ROUTE REGISTRY (`COMPARISONS`, `DOCS`, …) into the paths it
 *      visits covers pages nobody typed, including the ninth comparison added
 *      next month. A spec that types its stops covers exactly those stops.
 *
 * WHAT THE THREE STILL DO NOT COVER, stated here rather than only in the test,
 * because this comment is what the rulebook entry gets written from (Sentinel,
 * #617):
 *
 *   - A browser-driven guard whose page list is TYPED rather than derived.
 *     That is deliberate and it is the whole discrimination in rule 3:
 *     `e2e/smoke.spec.ts` loops four hand-written paths and must stay silent.
 *     A hand-typed list that grows to cover a whole site is invisible here.
 *   - A spec that discovers its pages at RUNTIME — crawling links, reading a
 *     sitemap over HTTP — imports no registry and matches nothing.
 *   - A browser-driven guard that does not import `@playwright/test` (a raw
 *     `chromium.launch()` script). None exists; `playwright.config.ts` is on
 *     the REVIEW gate above, so the harness itself is watched either way.
 *   - Rule 3 says nothing about WHAT the spec asserts. A derived-list spec
 *     that checks one trivial thing still matches. Intake is a sentence on an
 *     issue; a false positive costs that sentence and nothing else.
 *   - Rule 3 wants the navigation IN the spec. `NAVIGATES` is a literal
 *     `.goto(`, so a spec with a fully derived page list that calls
 *     `await visit(page, slug)` — the `page.goto` living in an `e2e/` helper —
 *     matches nothing. Wrapping navigation is an ordinary thing for an e2e
 *     suite to grow, so treat this as the first thing to widen rather than as
 *     a settled scope: when a navigation helper appears, teach `NAVIGATES` to
 *     follow one hop into it, the way rule 1 already follows a walker through
 *     an import. (Sentinel, reviewing #622.)
 *   - Rule 3 resolves the registry import ONE HOP. `import { COMPARISONS }
 *     from './routes'`, where `e2e/routes.ts` re-exports
 *     `lib/marketing/comparisons`, matches nothing — the binding arrives from
 *     inside the suite, which is the same shape as importing a fixture. That
 *     one-hop limit is deliberate (a spec expanding `./reseed` is a fixture
 *     loop, not a site-wide guard) and it is also a hole, and it is the #597
 *     shape again: the right module reached by a different path spelling. The
 *     other two derivations follow imports transitively; this one does not.
 *     If a re-export appears, resolve through it rather than exempting it.
 *   - Rule 3's population contains one permanent SELF-MATCH:
 *     `tests/guards/review-gate.test.ts` carries the detector's own fixture
 *     strings, so it matches itself. Harmless — that file is registered — but
 *     do not read a count of one as "the detector found something".
 *   - Rule 1 matches a product root or one of its top-level divisions, NOT a
 *     module path any depth down. `'lib/db/migrations'` and
 *     `'lib/services/demo-clinic'` are named modules, and a file that names
 *     what it reads is the bounded case this list is not for. The boundary is
 *     one segment, and a segment carrying an extension (`'lib/read-checks.ts'`)
 *     is a named FILE and never a root.
 */
export const INTAKE_RULES = [
  {
    id: 'blocking-assertions',
    area: 'a repo-wide blocking assertion inside the required `test` / `e2e` checks',
    why:
      'these files hold the rules that grade the WHOLE tree, so adding or loosening one changes ' +
      'what every other PR can merge — the axe ratchet (#534) and the brand-ramp rules ' +
      '(#555/#564/#566) all did that without touching a single file under .github/. The ' +
      'conventions call that intake: say on your issue what new class of assertion this adds, ' +
      'and mention Forge the same day so the rule reaches the skill. Adding a CASE to an ' +
      'existing rule is not that — this check reads paths and cannot tell the two apart, so say ' +
      'which one it is rather than guessing what it meant.',
    patterns: [
      // The CI machinery guards, and the tenant-scoping convention guards.
      // Both directories exist to hold the product tree at zero for something.
      'tests/guards/**',
      'tests/tenant-scoping/**',
      // The contrast rules (1-4) and the two modules every one of them is
      // built on. `palette.ts` is where AA and every ratio are computed: move
      // a number there and all four rules re-grade the tree at once.
      'tests/a11y/class-pairs.ts',
      'tests/a11y/palette.ts',
      'tests/a11y/dark-mode-parity.test.ts',
      'tests/a11y/token-contrast.test.ts',
      'tests/a11y/css-var-definitions.test.ts',
      // The shared-pending guard (#559) and the source walker it shares with
      // the pending-feedback rule.
      'tests/design-system/shared-pending.ts',
      'tests/design-system/shared-pending.test.ts',
      'tests/design-system/jsx-attrs.ts',
      'tests/design-system/pending-feedback.test.ts',
      'tests/design-system/kpi-numerals.test.ts',
      // The two a11y source scanners. They arrived here on DREAMCRM-50, not
      // because they were new but because their scope WIDENED: both said
      // `components/ui`, which reads as one named directory, and now say
      // `components`, which is a product root. The classifier is right to
      // reclassify them — a rule that grades all of `components` grades
      // everyone's diff, and that is the thing intake is for.
      'tests/a11y/legibility-floor.test.ts',
      'tests/a11y/retired-tones.test.ts',
      // The two PALETTE-GRADING rules that are not tree walks, and so reached
      // neither half of the derivation until #597 added a second one. A test
      // built on `tests/a11y/palette.ts` — the one place this repo resolves
      // its own colours and computes AA — asserts a repo-wide fact whether or
      // not it opens a directory. `muted-ink-direction` (#598) is the worked
      // example: a new class of assertion, merged with no label and no intake,
      // because it was neither an enumerated path nor a walk.
      'tests/a11y/muted-ink-direction.test.ts',
      'tests/a11y/portal-palette.test.ts',
      // The dimmed-type rule (DREAMCRM-62 / UI batch 66). It trips BOTH
      // derivations — it walks the app roots and it grades the palette — and
      // it was the guard's own author it caught, which is the point of
      // deriving the list from the tree rather than remembering it.
      'tests/a11y/dimmed-text.test.ts',
      // Rule 6, the quiet-ink gate (DREAMCRM-62 / UI batch 64). A NEW CLASS of
      // assertion rather than a case on an existing one, which is the
      // distinction this entry's `why` asks to be stated rather than guessed:
      // it grades a neutral ink declared for BOTH themes on an element with no
      // surface of its own — the family rule 1 structurally cannot see, because
      // rule 1 needs a `bg-` on the same element to measure against. 177 places
      // were failing it in both themes when it landed.
      'tests/a11y/quiet-ink.test.ts',
      // The check-mark veto (DREAMCRM-71, BRAND.md Part 3). A NEW CLASS of
      // assertion rather than a case on an existing one, stated here rather
      // than guessed as this entry's `why` asks: every rule above grades a
      // COLOUR — a pair, a ramp, an ink direction. This one grades a SHAPE.
      // It walks the marketing trees and fails any `d` attribute that is
      // entirely a check-mark POLYLINE, under any component name or none.
      //
      // It is on this list on the merits and not merely because it imports
      // `palette.ts` for `ROOT`: after it lands, no future PR can put a bare
      // tick on the marketing site, which is exactly "changing what every
      // other PR can merge". The owner vetoed those ticks on DREAMCRM-67 and
      // the call-site count went stale twice while it lived in prose — a
      // number in a document cannot ask the tree, so the veto became a test.
      //
      // WHAT THE RULE DOES NOT COVER, stated HERE and not only in the test's
      // own docblock, because this comment is what the next author reads and
      // what the rulebook entry gets written from (Sentinel, #617):
      //
      //   - **Stroked polylines only.** A CLOSED path — a solid/filled tick,
      //     `…8.6-8.6Z` — is rejected at the door and passes the guard. That
      //     is a deliberate scope, not an oversight: the filled form has never
      //     appeared in these trees and widening to it would mean grading
      //     filled areas rather than three points. If one shows up, widen the
      //     detector rather than adding an exemption for it.
      //   - A tick drawn as `<polyline>`, as a background image, or as the
      //     character "✓" in copy is also invisible to it.
      //
      // So the sentence this entry earns is "no future PR can put a bare
      // STROKED tick on the marketing site" — narrower than the first draft
      // claimed, and a gate rule recorded as stronger than it is, is wrong
      // quietly. The detector was corrected in the same review to resolve each
      // segment against its own command letter and to normalise right-to-left
      // traversal; before that it missed `M5 13l4 4L19 7`, which is in this
      // repo five times.
      'tests/marketing/tone-tiles.test.ts',
      // The drawn-grid veto (DREAMCRM-72, BRAND.md Part 3), the SECOND of the
      // owner's two vetoes to become a test. A NEW CLASS rather than a case on
      // an existing one, stated here as this entry's `why` asks: the tone-tile
      // rule beside it grades the SHAPE OF A GLYPH, this one grades a
      // DECORATIVE LAYER — a `backgroundImage` that repeats on a fixed pitch,
      // which is invisible to axe (it reads `background-color`) and to every
      // class-string scanner in the repo (the recipe is a style object).
      //
      // Why it is on the merits and not merely because it imports `palette.ts`
      // for `ROOT`: after it lands, no future PR can rule a lattice across any
      // marketing page. It exists because the veto was recorded as CLOSED when
      // `NIGHT_GRID` was deleted, while a second drawn grid under a different
      // name in a different component went on rendering on eight pages for
      // three more moves. A number in a document cannot ask the tree; neither
      // can a sentence saying a veto is closed.
      //
      // WHAT IT DOES NOT COVER, here rather than only in the test's docblock,
      // because this comment is what the rulebook entry gets written from:
      //
      //   - A lattice drawn as an `<svg>` of `<line>` elements, as a repeated
      //     `border-right` down a flex row, or as a pair of Tailwind ARBITRARY
      //     utilities rather than a style object. None has appeared in these
      //     trees; the third is the cheapest to add if one does.
      //   - It says nothing about a gradient with NO pitch. A bloom is one
      //     wash across a band and is the direction this brand is built on —
      //     that case is pinned in the test so the rule cannot drift into
      //     banning gradients.
      //
      // The film grain is tiled at 140px and is deliberately NOT a lattice:
      // noise has no lattice in it, and the discrimination is derived from
      // what the tile PAINTS rather than from a name or an exemption entry.
      'tests/marketing/no-drawn-grid.test.ts',
      // BRAND.md Part 4's 12px floor inside the shared marketing chrome
      // (DREAMCRM-72). Read this one as a FIELD-OF-VIEW entry rather than a
      // new assertion — the #615 shape: `tests/a11y/legibility-floor.test.ts`
      // already holds this floor and already skips `components/marketing`
      // wholesale, because the product mocks in that directory imitate a real
      // screen at 7px. That skip is keyed on a DIRECTORY while the exemption
      // is about a KIND of thing, and the shared chrome sits in the same
      // directory as the mocks. Two literals were live under the floor on
      // every marketing page when it shipped.
      //
      // It grades BY COMPONENT rather than by path, so the mocks stay out by
      // construction and there is no exemption list to go stale. The cost is a
      // false NEGATIVE stated in the test: a new chrome component not added to
      // its list is not graded, which is why a premise assertion fails loudly
      // on a rename instead of quietly scanning nothing.
      'tests/marketing/chrome-legibility.test.ts',
      // The living stage's particle layer (BRAND.md Part 6, 2026-09-22):
      // asserts MOTE_ALPHA_MAX against the stage's graded inks through
      // `tests/a11y/palette.ts` — a palette-grading assertion that walks no
      // tree, the exact #598 shape this list exists for.
      'tests/marketing/cinema-fx.test.ts',
      // ── THE TEN THE FIXED TREE-WALK DERIVATION FOUND (DREAMCRM-81) ──────
      //
      // None of these is new. Every one has been walking a product tree for
      // weeks while `PRODUCT_ROOT` required a BARE quoted root and they all
      // name a top-level division of one — `'app/(portal)'`, `'app/site'`,
      // `'components/clinic-site'`, `'lib/services'`, `'app/(default)'`. To a
      // regex, a subdirectory of a product root was not the product root, so
      // the derivation read every one of them and matched zero times. Fixing
      // the regex at a path boundary is what put them on this list; they are
      // registered here on the merits, not because the fix swept them in.
      //
      // Read the group as ONE class, not ten: **a guard that holds an entire
      // PERSONA TREE at zero for a convention.** Three personas are covered —
      // the patient portal, the public clinic site, the staff app — plus the
      // services layer and the chart kit. Each fails `test` for a stranger who
      // writes an ordinary line in the wrong tree, which is the intake test
      // exactly ("changes what everyone else can merge").
      //
      // WHAT THEY DO NOT COVER, here rather than only in their docblocks:
      // every one is keyed on a SCAN_DIRS list, so a persona tree that grows a
      // new top-level directory is ungraded until somebody adds it — the #615
      // field-of-view shape, live in ten files at once. None of them grades
      // `app/(marketing)`, which is the tone-tile and drawn-grid rules' tree.
      //
      // The portal: no dimmed ink, no raw meaning-hexes, brand tokens single-
      // homed. Walks `app/(portal)` + `components/patient-portal`.
      'tests/a11y/portal-brand.test.ts',
      'tests/a11y/portal-ink-opacity.test.ts',
      'tests/a11y/portal-tokens.test.ts',
      // The public clinic site: the brand is never raw ink on text, never a
      // `var()` with an alpha suffix glued on, never an unresized camera
      // original, and its tokens are single-homed. Walks `app/site` +
      // `components/clinic-site` (and, for the wash rule,
      // `components/patient-portal` as well).
      'tests/a11y/site-tokens.test.ts',
      'tests/clinic-site/brand-as-text.test.ts',
      'tests/clinic-site/brand-fill.test.ts',
      'tests/clinic-site/brand-wash.test.ts',
      'tests/clinic-site/site-image.test.ts',
      // The services layer — the journey spine's ledger rules, walked across
      // all of `lib/services` (190 files). The widest scan on this list.
      'tests/journey/spine.test.ts',
      // The staff app's charts: every chart in `app/(default)`,
      // `app/(double-sidebar)` and `components/ui` comes from the kit rather
      // than being hand-rolled. `components/ui/charts/` is exempt by
      // construction, being the kit itself.
      'tests/ui/chart-kit.test.tsx',
      // The a11y harness every browser-driven spec calls (#534). Registered BY
      // HAND and said so plainly: it neither reads source nor navigates, so no
      // derivation above can see it, and nothing would have flagged the axe
      // ratchet for the rulebook — the founding example of an intake owed for
      // a new class inside an existing required check. It holds
      // `expectNoA11yViolations`, the exclusion list and the baseline wiring,
      // so an edit here re-grades every page every spec opens. It is already
      // on the REVIEW gate above under `check-definitions`; a PR touching it
      // owes both obligations, which is not a contradiction — one adds a
      // reviewer, the other adds a sentence on an issue.
      'e2e/axe.ts',
      // The remaining tree-wide scanners, each holding the product at zero for
      // one convention. Derived from the tree by the guard test, not recalled.
      // A NEW CLASS rather than another instance of an existing one: it holds
      // the product at zero for a DORMANT TABLE in BOTH directions, and the
      // read half is the novel part — every other scanner here bans a way of
      // writing something, this one also bans reading `billing_profiles`,
      // because a read is what would give the rows the retired Plans UI left
      // behind a meaning they never had.
      'tests/billing/no-billing-profiles-write.test.ts',
      'tests/clinic-site/jsonld-escaping.test.ts',
      'tests/clinic-site/public-form-error.test.ts',
      'tests/clinic-site/site-load-dedupe.test.ts',
      'tests/intake-forms/insurance-ocr-host-adoption.test.ts',
      'tests/journey/ledger-marker-law.test.ts',
      'tests/middleware.test.ts',
      'tests/settings/no-plan-gating.test.ts',
      'tests/timezone/server-render-tz.test.ts',
      // `BRAND.md` Part 10's zero-horizontal-scroll rule, inside `e2e`
      // (DREAMCRM-76). A NEW CLASS rather than a case on an existing one,
      // stated here rather than guessed as this entry's `why` asks: every
      // file above grades SOURCE — a class string, a `d` attribute, a style
      // object, a palette. This one grades a RENDERED DOCUMENT, at three
      // viewport widths, and fails any marketing page whose
      // `documentElement.scrollWidth` exceeds its `clientWidth`. After it
      // lands, no future PR can widen a marketing page past the viewport at
      // 390, 834 or 1440 — which is "changing what every other PR can merge"
      // in the plain sense, and is the second accessibility-shaped gate to
      // arrive inside `e2e` after the axe ratchet (#534).
      //
      // IT IS HERE BY HAND BECAUSE NEITHER DERIVATION IN
      // `tests/guards/review-gate.test.ts` CAN SEE IT, and that is the part
      // worth carrying rather than the file name. The walk detector looks for
      // a suite file that reads a product root off disk; the palette detector
      // looks for one built on `tests/a11y/palette.ts`. This file does
      // neither — it opens a BROWSER and measures pixels, so it reads no
      // source at all and grades every marketing page at once. That is a
      // third shape, and #598 is what the second one cost when nobody
      // registered it: merged with no label, no mention, and reached the
      // rulebook by the morning sweep alone.
      //
      // So registering one path closes one hole rather than the class. The
      // class — "a suite file that drives a real page and asserts about all
      // of them" — needs a third derivation beside the other two, and that is
      // gate machinery rather than a marketing change, so it is routed to
      // Forge with this PR rather than written here.
      //
      // WHAT IT DOES NOT COVER, here rather than only in the spec's docblock,
      // because this comment is what the rulebook entry gets written from:
      // `/blog` and `/blog/[slug]`, whose bodies come out of the database.
      // The spec is seed-free like `smoke.spec.ts`, so on a freshly migrated
      // database those two render an empty state rather than the page a
      // reader gets. Every other marketing page is covered, and the dynamic
      // families are expanded from the same registries their own
      // `generateStaticParams` reads rather than typed out.
      'e2e/marketing-viewport.spec.ts',
    ],
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

const compile = (rules) =>
  rules.map((rule) => ({ ...rule, matchers: rule.patterns.map(globToRegExp) }))

const COMPILED_GATE = compile(GATE_RULES)
const COMPILED_INTAKE = compile(INTAKE_RULES)

/**
 * Which of `rules` a set of changed files trips, and the files that tripped them.
 *
 * Paths must use forward slashes — every producer here (`gh pr diff`, `git diff
 * --name-only`, `git ls-files`) emits them, but Windows is a supported dev
 * platform and a backslashed path would match nothing while looking fine.
 */
function findingsFor(compiled, files) {
  const normalized = files.map((f) => f.trim().replace(/\\/g, '/')).filter(Boolean)

  return compiled
    .map((rule) => ({
      id: rule.id,
      area: rule.area,
      why: rule.why,
      files: normalized.filter((f) => rule.matchers.some((m) => m.test(f))),
    }))
    .filter((r) => r.files.length > 0)
}

/** Which files in this PR owe Sentinel a review before it merges (§3). */
export function gateFindings(files) {
  return findingsFor(COMPILED_GATE, files)
}

/**
 * Which files in this PR change what can merge and so owe Forge an intake (§2).
 *
 * A separate answer from `gateFindings` on purpose: these are two different
 * obligations with two different costs, and the conventions say so explicitly.
 * Reporting them as one would either drag a third of the repo's PRs into a
 * review queue or keep printing "merges on green" at the ones that quietly
 * moved the gate. A PR can owe both, one, or neither.
 */
export function intakeFindings(files) {
  return findingsFor(COMPILED_INTAKE, files)
}

/** The label the workflow puts on a PR that owes a review. */
export const REVIEW_LABEL = 'needs-sentinel-review'

/** The label the workflow puts on a PR that changes what can merge. */
export const INTAKE_LABEL = 'needs-forge-intake'

export function renderSummary(findings, totalFiles, intake = []) {
  const parts = []

  if (findings.length === 0) {
    parts.push(
      '### ✅ No review-gate files in this PR',
      '',
      `None of the ${totalFiles} changed ${totalFiles === 1 ? 'file is' : 'files are'} on the ` +
        'pre-merge review list, so this one merges on green.',
      '',
      'This check is advisory and never blocks a merge — it reads the diff against the gate list ' +
        'in the `dreamcrm-conventions` skill and says what it sees.',
      '',
    )
  } else {
    parts.push(renderReviewSection(findings))
  }

  if (intake.length > 0) parts.push(renderIntakeSection(intake))

  return parts.join('\n')
}

/**
 * The intake section — a SECOND obligation, deliberately not folded into the
 * review verdict above.
 *
 * A PR can be told "merges on green" and still owe this. That combination is
 * not a contradiction, it is the whole point: #566 was correctly exempt from
 * review (test-only diff, nothing on the gate list) and still added a new
 * blocking assertion to `test`. The old summary had no way to say both, so it
 * said the reassuring half and stopped.
 */
function renderIntakeSection(intake) {
  const count = intake.reduce((n, f) => n + f.files.length, 0)
  const lines = [
    '### 📓 This PR may change what can merge — tell Forge the same day',
    '',
    `${count} changed ${count === 1 ? 'file holds' : 'files hold'} a repo-wide blocking ` +
      'assertion. **This is intake, not review** — it does not add a reviewer to your PR and it ' +
      'does not stop the merge. It is the §2 obligation: a new class of assertion inside a ' +
      'required check changes what everyone else can merge exactly as a workflow edit does, and ' +
      'a rule that reaches nobody gets rediscovered.',
    '',
  ]

  for (const finding of intake) {
    lines.push(`**${finding.area}** — ${finding.why}`, '')
    for (const file of finding.files) lines.push(`- \`${file}\``)
    lines.push('')
  }

  lines.push(
    'If this PR **adds or loosens a rule** (a new assertion class, a new exemption, a widened ' +
      'pattern), say so on your issue — naming every new class it adds, not just the one the ' +
      'title leads with — and mention:',
    '',
    '```markdown',
    '[@Forge](mention://agent/187124c3-23a7-47f6-bdee-e90bfc3fa216)',
    '```',
    '',
    'If it only **adds a case** to a rule that already exists, say that instead and move on. ' +
      'This check reads paths and genuinely cannot tell the two apart — naming which one it is ' +
      'costs a sentence, and is the difference between the skill learning the rule today and ' +
      'somebody rediscovering it in three days.',
    '',
  )
  return lines.join('\n')
}

function renderReviewSection(findings) {
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
    '**The verdict then gets written onto this PR before it merges** (DREAMCRM-61). Sentinel ' +
      'records it when he gives it; your job is to check it is there before you merge, and to ' +
      'post it yourself if it is not:',
    '',
    '```bash',
    'gh pr comment <n> --body "Sentinel review: APPROVE — <link to the verdict comment>"',
    '```',
    '',
    'The verdict lives on a Multica issue, which GitHub cannot see, so without this a reviewed PR ' +
      'and a forgotten one are indistinguishable from the outside. `review-sweep.yml` reads it the ' +
      'next morning and goes red on anything that merged with this label and no record — #573 and ' +
      '#582 both merged that way in one batch. It does not block your merge either.',
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
  const intake = intakeFindings(files)
  const summary = renderSummary(findings, files.length, intake)

  console.log(summary)
  githubOutput('needs-review', findings.length > 0 ? 'true' : 'false')
  githubOutput('needs-intake', intake.length > 0 ? 'true' : 'false')
  githubOutput('areas', findings.map((f) => f.id).join(','))

  if (findings.length > 0) {
    console.log(
      `::notice title=Sentinel review required::This PR touches ${findings
        .map((f) => f.area)
        .join('; ')}. Post the review request on your issue before merging.`,
    )
  }

  if (intake.length > 0) {
    console.log(
      '::notice title=Forge intake owed::This PR touches a repo-wide blocking assertion inside ' +
        '`test`/`e2e`. If it adds or loosens a rule, say so on your issue and mention Forge the ' +
        'same day — intake, not review, and it does not block the merge.',
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
