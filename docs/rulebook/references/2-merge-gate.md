# §2. The merge gate

*`dreamcrm-conventions` §2. `SKILL.md` is the map and carries §§4, 5, 7, 9 and 10 in full.*

- The full vitest suite plus `pnpm typecheck` must be green before merge. Never
  merge red. GitHub Actions runs both on every PR and on every push to `main`.
- **Never weaken, skip, or delete a failing test to get green.** Diagnose the
  root cause. If a test appears to contradict intended product behavior, stop and
  escalate on the issue — mention Mika, and loop in Dustin Russenberger if it is a
  product-behavior call — before changing what the test means. An escalation
  comment with no mention enqueues no one and can sit unread.
- Every fix ships with a test that proves it, and that test is not finished
  until you have watched it fail against the defect — see "A test counts only
  once you have watched it fail" below. A bug fix without a regression test is
  not finished; a regression test nobody has seen go red is not evidence.
- Convention-guard tests (tenant scoping, design-system token single-homes,
  known-routes lists) are part of the gate — keep them passing rather than
  editing them to match your change.
- **EVERY DEFECT FOUND AFTER MERGE ANSWERS ONE QUESTION: which existing gate
  should have caught this, and why didn't it.** Owner-approved 2026-09-23
  (DREAMCRM-119), placement confirmed by the chair at weekly direction meeting 1
  (DREAMCRM-120). The answer is not a sentence in the fix's PR description — it
  **routes through Forge's intake as a change to that gate**, on the same terms
  as everything else in this list. Three consequences, each of which has been
  got wrong here:
  - **A plain “no gate could have caught it” is a legal answer, and it is the
    one that owes the most.** It names a class this repo cannot currently see,
    which is either a new guard or a deliberate, written decision not to build
    one. What it may not be is silence.
  - **The gate that FAILED is often not the gate nearest the defect.** #647's
    marker rule graded the SOURCE literal while the exclusion ran against the
    RENDERED DOM; what failed there was the guard's READER, not its predicate.
    Ask which instrument had the defect in its field of view and came back
    clean — that is the one that failed.
  - **Process only grows where reality demonstrated a hole.** This rule is the
    licence for new process and equally the limit on it: a guard proposed from
    an imagined defect has no escaped defect behind it, and under the
    `team-operating-model` skill's usage-discipline rule that is meta work
    which has not earned its run.

  The escaped-defect COUNT is a weekly scorecard metric, which is what keeps
  this from being a rule nobody totals.

- **Changing the gate itself is a policy change, and it routes to Forge.** If you
  alter branch protection, the required-check set, a `.github/workflows/**` file,
  or the deploy pipeline — **or make any other change that alters what can
  merge** — say so on your issue the same day it lands and mention
  [@Forge](mention://agent/187124c3-23a7-47f6-bdee-e90bfc3fa216) so the new rule
  reaches this skill. This holds regardless of who made the change, where they
  made it, and whether it came with a PR at all — a repo setting flipped in the
  GitHub UI has reached nobody. Such a change also needs Sentinel's review; see
  the gate list in §3.
  **The intake half of this rule also fires when no file on that list was
  touched.** A new class of assertion inside an existing required check changes
  what can merge exactly as a workflow edit does. The axe ratchet (#534) is the
  worked example: it added a whole accessibility gate to `e2e` without going
  near `.github/`, so it matched nothing on the list above and took three days
  to reach this skill. Ask what the change does to the gate, not which file it
  lives in. The shared-pending guard (#559, below) is the second instance of the
  same shape — a new class of assertion inside `test`, nothing under
  `.github/` touched — and it was routed the day it was written, which is what
  the rule is for. The brand-ramp contrast rules (#555/#564, below) are the
  third instance, and #555 is the cautionary half: it was routed the day it
  landed, but only the half of it the PR's headline described — its solid-fill
  rule went unrecorded here until #564's gradient rule sent somebody back into
  the same file. Route what the change does to the gate, naming every new class
  of assertion it adds, not the one the title happens to lead with. The
  gradient-text rule (#566, below) is the fourth instance and the cleanest: a
  new class of assertion inside `test`, nothing under `.github/` touched,
  `review-gate.yml` reporting the PR clean — routed here the day it merged, by
  its author, with the §3 classification stated rather than assumed. The drift
  guard (#571, above) is the fifth and the first written BY this rule rather than
  routed into it: a new class of assertion inside `test` that goes red when a
  workflow file or a gate area arrives without its claim. It **merged 2026-09-14**
  (`3ae1f612`), so that half of the remedy has landed — and note what it still
  does not cover, because it is exactly this bullet's subject: a new class of
  assertion inside an existing required check moves none of the facts it grades.
  #557's two zero-tolerance guards (above) are the sixth and
  seventh, and they are the counter-example that keeps the sweep in this rule:
  they landed on `main` with no mention, and reached this document the same day
  only because the sweep reads `main` rather than the inbox. The guard mutation
  pass (#574 / #580 / #583, DREAMCRM-50, 2026-09-15) is the eighth, and the first
  to arrive as **three** new classes of assertion at once — routed the same day by
  its author, each class named rather than summarised under the PR titles, which
  is what the #555 lesson above asks for. What they now fail on is in "The guard
  suite has been mutation-tested once" below. **Rule 5, the `TONE_FILL`
  registry-conformance rule (#585 / DREAMCRM-52, 2026-09-15, `b4f3b1b9`), is the
  ninth, and it is the sharpest form this shape has taken**: a new class of
  assertion inside `test` with nothing under `.github/` touched, which fails a
  pairing that CLEARS AA because it is off-registry. "It measures fine" is no
  longer a defence in this repo. Nothing that reads paths or ratios could have
  told you that — its author did, the day it merged, naming the class. It is
  written up under the contrast guards below.
  **DREAMCRM-54 (#587, 2026-09-15, `15e0365d`) is the tenth, and the first whose
  new assertions are about ANOTHER RULE'S EXEMPTION rather than about the
  product**: the marketing night band put the first entry
  `GRADIENT_TEXT_EXEMPTIONS` has ever carried into rule 4, and brought two new
  classes with it — one that grades the exemption's own PREMISE, one that grades
  a hand-written Markdown table against the stylesheet. Nothing under `.github/`
  touched, `review-gate.mjs` reporting no gate area and labelling the PR
  `needs-forge-intake` only. Routed the day it merged, by its author, with both
  classes named rather than summarised under the PR title — the #555 lesson,
  answered. Written up under the contrast guards below.
  **DREAMCRM-60 is the eleventh, and it is the first that was routed BEFORE it
  merged.** #588 **merged 2026-09-15, `62acd835`**, with a follow-through #595
  (`3b9d1dd7`) the same day. While it sat on a branch every entry about it here
  carried a state line saying so, and the flip to these five sections was done by
  Forge on the merge rather than by its author — which is the whole shape worth
  copying. Routing early costs one extra hop and buys the rule not waiting on a
  second trigger; what makes it safe is that the hop has a named owner and the
  claim reads OPEN until they take it. §2a did the opposite with the drift guard
  — described it as live while it sat on a branch, in three load-bearing places —
  and the remedy was accuracy about merge state, not silence. Take both together:
  **write it down early, say what state it is in, and own the flip.**
  **What it adds: one new class of blocking assertion in `test` —
  monotonicity of `e2e/axe-baseline.ts` against `origin/main`.** Nothing in this
  repo has ever read that file's previous value. Two things make it unlike the ten
  above. It is the first of this shape whose diff **also** carries
  `.github/workflows/**` — four jobs gain a `git fetch` step, no workflow file is
  added — so it earns the §3 review by the ordinary path as well: both labels, two
  independent obligations, on one PR. And its written opt-out,
  `e2e/axe-baseline-raises.ts`, joins `check-definitions` as a **pattern and not
  an area**, which is why `rulebook-drift.test.ts` stayed green — it grades the
  area list, and the count is still nine. Correct, and also the reason this line
  exists: a green drift check said nothing about any of it. The ceiling rule it
  enforces is in §2a; the guard itself is in §2c; the sixth
  `check-definitions` pattern is in §3.
  (Intake, not review — a test-only PR stays exempt from §3 unless its
  diff carries something on the gate list.)
  **DREAMCRM-62 (PR #597) is the twelfth, and the second routed BEFORE it
  merged** — the eleventh's shape copied deliberately: one new class of
  assertion in `test` (rule 6, the quiet ink, written up under the contrast
  guards), routed the day it was written with a state line saying OPEN and Forge
  owning the flip. Its author named the class rather than letting the label guess
  — a new CLASS, not a new case, because it grades the family rule 1
  structurally cannot see. **That answer was right against his merge-base and had
  already moved against `main`, and the correction is the more useful half of this
  entry** (Vesper's own, 2026-09-15, after Sentinel's review): PR #598 had landed
  in between and grades the same inverted pair, so by the time rule 6 was ready
  the honest description was **two INSTRUMENTS, not one new class** — a tree-wide
  scanner beside a test that grades the palette and two named files. Neither is
  the two-inventories hazard §2b forbids, because neither carries the other's
  inventory, and both headers now say which is which. **Classify against `main`,
  not against the tree you branched from.** "Is this a new class or a new case"
  is a question about the tree you are JOINING, and on a repo landing a dozen PRs
  a day the answer can change while your branch is open — so it is a question to
  re-ask when you re-request review, exactly like the §3 classification.  and named the §3 classification too, which is
  where this one adds something the eleven above do not. **A PR can change review
  class between its first commit and its last.** It opened as
  design-system-conformant UI polish, merges-on-green by §3's list, and stopped
  being that when registering the new rule put `scripts/review-gate.mjs` — a
  `check-definitions` file — into the diff. What caught it was not a re-read of
  this rule: `tests/guards/review-gate.test.ts` went red by name, because it
  DERIVES the set of whole-tree scanners from the tree rather than recalling it.
  That is the hole-closed-from-the-other-side paragraph below doing exactly the
  job it was built for, on the direction #566 got through. Both labels on the PR.

  **PR #598 is the thirteenth, and the third counter-example — no label, no
  mention, reached this document by the sweep alone.** It merged to `main` on
  2026-09-15 (`164c2310`) as a hotfix for a red `e2e`, and it carries one new
  class of assertion inside `test`: a palette FACT asserted in both directions
  (the legible step and the illegible one, on every declared surface, in both
  themes) plus an exact-string pin on two components. Nothing under `.github/`.
  **And the label could not have fired.** `tests/a11y/muted-ink-direction.test.ts`
  is on no `INTAKE_RULES` pattern — the enumeration names `class-pairs.ts`,
  `palette.ts` and the three tests built on them, by path — and it is not a
  tree-wide scanner either (it reads two named files), so the derive-from-the-tree
  half had nothing to catch. **The hole has a name: a NEW test that imports
  `tests/a11y/palette.ts` and grades the palette is neither an enumerated path nor
  a tree walk.** The answer is a line of derivation rather than one more path —
  anything importing `./palette` is grading a repo-wide fact by construction —
  and **it merged 2026-09-15 (`3819a61e`), with its own blind spot closed two
  hours later by #609 (`8edeac54`)**: `tests/guards/review-gate.test.ts`
  gained a second rule — a suite file that imports `tests/a11y/palette.ts`
  asserts a repo-wide fact by construction, whether or not it walks a directory.
  It named exactly the file the sweep did, and `muted-ink-direction.test.ts` and
  `portal-palette.test.ts` are both registered by it rather than by hand. One
  detail from its build is worth keeping, because it is the general shape of this
  mistake: the first draft matched any import ending `/palette` and swept in two
  bounded template-recipe tests, so it **resolves the import against the module**
  now. And the version that shipped still could not see `@/tests/a11y/palette` —
  both derivations carried their own copy of a relative-only
  `/from\s+'(\.[^']+)'/g`, so the ALIAS spelling of the very same import walked
  straight past. Sentinel planted a file with it and watched the rule stay green;
  #609 single-homed resolution in `importedModules(file, source)`, handling
  relative and `@/` specifiers under either quote character, and pinned a
  spelling table that fails without the alias branch. **The lesson is about the
  RED RUN, not the regex, and it is the sharpest instance of §2d in the
  program**: the red run that shipped with the rule tested only the WIDENING
  direction — two bounded template-recipe files the rule must leave alone — and
  never the narrowing one. An absence assertion over a clean tree cannot tell a
  working detector from a narrowed one, which is `axe-selftest`'s entire
  argument. **Every detector owes a red run in BOTH directions: one planted
  positive it must catch, one innocent it must ignore.** One of the two is not
  half the evidence; it is none of the evidence for the half you skipped. A derivation is only as good as the identity it derives on — §2d's
  identity-looseness family, arriving this time in the fix rather than in the
  defect.
  (#609 **merged 2026-09-15, `8edeac54`**. It owed no §3 review and this
  document said otherwise for a day — `tests/guards/review-gate.test.ts` is on
  `INTAKE_RULES`, not on `check-definitions`, whose patterns are the seven
  files that decide what RUNS or what gets asked. It carried the intake label
  alone, correctly. **Recording a review as owed where none is is not the safe
  direction of error**: §3's list is narrow on purpose, and a rulebook that
  widens it in prose teaches the next author to route around the queue.)
  **Read the two counter-examples together, because they rhyme.** #557's two
  zero-tolerance guards and this one both landed on `main` with no mention, and
  both were written under pressure — a gate that was already red. **The mention
  is the thing that gets dropped exactly when the gate is on fire**, which is
  when a new rule is most likely to be written in a hurry, so the sweep is not a
  belt-and-braces check on a working habit: it is the only instrument that covers
  the case where the habit predictably fails. Open every intake with it.

  **DREAMCRM-66 (#603, `5322a489`, merged 2026-09-15) is the fourteenth, and it
  is the widest blast radius any of them has had**: one new class of blocking
  assertion inside `test` — no tracked text file carries a raw C0 byte outside
  tab, LF and CR — graded over all 2,751 tracked files, `docs/**` included.
  Nothing under `.github/` touched; `review-gate.mjs` reported no gate area and
  labelled it `needs-forge-intake` only, which the author answered the same day,
  naming it a new CLASS rather than a new case and stating the §3
  classification rather than assuming it — it ran `gateFindings()` on the real
  file list rather than guessing, and reported the reasoning instead of leaving
  it implicit. The guard is written up in §2c; the three authoring rules it
  paid for are in §2d.

  **DREAMCRM-63 (#594, `a90c6f64`, merged 2026-09-15) is the fifteenth, and the
  one that shows what routing-before-merge costs.** Three new classes inside
  `test`, one reaching into `e2e/axe.ts`, nothing under `.github/`: an
  exemption's PREMISE generalised from the single entry #587 covered to the
  other three dead-exemption detectors; rule 4 widened from gradient text to
  CLIPPED text; and a wiring guard under the axe exclusion checks. All three are
  written up in §2b and §2c; the two authoring traps the review paid for are in
  §2d. It was routed on the day it opened and merged four hours later, so the
  intake needed a **second visit** to flip three state lines — and between the
  two visits another intake rewrote this section and dropped the first visit's
  entry entirely. **Route before the merge when the rule cannot wait, but expect
  to pay twice, and do not assume your own entry survived**: the sweep that
  opens every intake reads `main`, so re-grade what the document says against
  what merged rather than against what you remember writing.
  **It carried BOTH labels, and its author sent the review away from himself.**
  `review-gate.mjs` flagged `e2e/axe.ts` under `check-definitions`, and the
  author had written that rule — so he handed the review to the CI owner rather
  than signing it. **A gate that exists to put a second pair of eyes on a change
  is not satisfied by the author's own eyes**, on any area of the §3 list. It
  earned its keep immediately: the review found a guard in that very PR that a
  typo could switch off (§2d, the numeric-literal trap).

  **DREAMCRM-62 (#591, `15062848`, merged 2026-09-15) is the sixteenth**, and it
  reached this document by the sweep alone — no mention, and it was already on
  `main` for two intakes before anyone wrote it down. One new class of blocking
  assertion inside `test`: the patient portal's own palette, every ink it owns
  multiplied against every surface it owns, which nothing had ever done because
  the portal's hexes are not in the stylesheet the dashboard is graded from. It
  is written up in §2b, and the 1.85:1 pair it was built on is the argument.

  **DREAMCRM-58 (#606, `71e2992a`, merged 2026-09-15) is the seventeenth, and
  its class is one nothing that reads paths could have named**: a DORMANT TABLE
  held at zero in BOTH directions. Every other scanner on `blocking-assertions`
  bans a way of writing something; `tests/billing/no-billing-profiles-write.test.ts`
  also bans READING `billing_profiles`, because a read is what would give the rows
  the retired single-tenant Plans UI left behind a meaning they never had. Nothing
  under `.github/` touched. Routed the day it merged, by its author, naming the
  CLASS rather than letting the label guess and stating the §3 classification
  rather than assuming it — both labels, earned independently: `money` on
  `lib/services/shop-checkout.ts` by the ordinary path, and `check-definitions`
  because registering the new scanner pulled `scripts/review-gate.mjs` into the
  diff. That last part is the twelfth's mid-PR reclassification happening a second
  time, and it is now predictable enough to plan for: **registering a tree-wide
  guard is itself a `check-definitions` change, so a test-only PR that adds one
  stops being test-only at the moment it becomes correct.** Sentinel reviewed and
  approved at `d67bac1e`. The class distinction is written in the comment beside
  the `blocking-assertions` entry as well as here, which is where it earns most —
  the next author reads the list, not this file. The guard is written up in §2c;
  the authoring rule its REQUEST CHANGES round paid for is in §2d.

  **Since 2026-09-14 (#572 / DREAMCRM-49) the intake half is enumerated in the
  repo too, and it labels.** `INTAKE_RULES` in `scripts/review-gate.mjs` lists
  the files that hold a repo-wide blocking assertion — `tests/guards/**`,
  `tests/tenant-scoping/**`, the contrast modules (`class-pairs.ts`,
  `palette.ts` and the three tests built on them), the shared-pending and
  JSX-walker modules, and the remaining tree-wide scanners — and a PR touching
  one gets the `needs-forge-intake` label beside `needs-sentinel-review`. **Two
  labels, two obligations, and they are independent:** a review says a person
  must see this before it merges; an intake says a rule has to reach this
  document the same day. Most PRs that earn the second owe nothing of the
  first.
  The list is deliberately not `tests/**` wholesale — ~6,900 tests assert about
  one unit each — and the hole a path list cannot close is closed from the
  other side: the guard DERIVES the set from the tree, so a brand-new scanner
  that walks `app/`, `components/` or `lib/` fails `test` by name on the day it
  arrives. That is the direction #566 got through. Two things are off it on
  purpose, and the reasoning is worth keeping. `e2e/axe-baseline.ts`, because it
  is an inventory of existing debt rather than a rule and shrinking it is the
  expected end of every accessibility fix, so labelling it would teach people
  the label means nothing — and because a path pattern cannot tell a shrink from
  a raise. **Both halves of that are still true of that file, and neither is the
  end of the story any more** (#588, above, merged 2026-09-15 `62acd835`): the
  direction that matters, a ceiling going UP, is answered by a guard instead of a
  label, and the written opt-out for the rare legitimate raise lives one file
  over in `e2e/axe-baseline-raises.ts`, which holds nothing BUT raises and IS on
  the review gate under `check-definitions`. The split a path pattern could not
  make is made by putting the two directions in two files. So do not read "off
  the intake list" here as "unwatched", and do not reach for this paragraph as
  precedent for leaving something unlabelled — the reason it survives is that
  something else covers the direction the label cannot see. And `tests/**` /
  `e2e/**` wholesale, for the same
  reason the money rule was narrowed — a queue that catches a third of all PRs
  gets routed around.
  **DREAMCRM-62 part 3 (PR #612, UI batch 66) is the next one, and it is the
  first where a derivation caught its OWN AUTHOR** — which is the argument for
  deriving the intake list from the tree rather than remembering it, made better
  than any example anyone could have designed. `tests/a11y/dimmed-text.test.ts`
  trips BOTH derivations in `review-gate.test.ts` (it walks the app roots AND it
  imports `tests/a11y/palette.ts`), so the PR that would have merged on green
  instead had to register the rule — and the palette-grader derivation doing the
  catching is the one Vesper herself added in #609 two hours earlier. Both labels
  fired, correctly, with no human in the loop. **MERGED 2026-09-16, `24b8b13b`**,
  with a scope fix the same night (#615, `85c11fbe` — intake label only, no
  review owed). Classification stated rather than guessed, and
  it is a new CLASS: `portal-ink-opacity.test.ts` bans the technique outright
  inside one palette, while this grades it against a declared TYPE SCALE across
  the app and leaves 45 correct uses standing. Written up in §2b.
  **#615 is worth its own line, because it is an intake about a rule's FIELD OF
  VIEW rather than its assertion.** The rule as merged enumerated seven route
  groups out of `app/`'s thirty-five, and sixteen of those entries had no stated
  reason — not an exemption anybody argued for, just an enumeration that stopped.
  Widening it to walk `app/`, `components/` and `lib/` changed what can fail a
  stranger's PR without touching a single assertion, which is the intake trigger
  as written: ask what the change does to the gate. **An enumeration of what a
  rule looks at is a claim exactly as an allow-list is, and an unargued one is
  the weaker of the two** — an exemption at least has a `why` a detector can
  grade. Written up in §2b, together with the reason that came off because it was
  the wrong KIND of reason (a shape does not move when a palette does).

  **DREAMCRM-70 (#616, `b728d69a`, merged 2026-09-16) is the eighteenth, and it
  is the fourth counter-example — the label fired, nobody answered it, and it
  reached this document by the sweep.** Two things in it change what can merge,
  and only one of them is what the PR is about.
  `tests/a11y/css-var-definitions.test.ts` gains a `--mkt-` entry in
  `RUNTIME_PROVIDED` — a new CASE on an existing allow-list, and a LOOSENING —
  but that entry's reason is enforced rather than asserted, in
  `tests/marketing/cinematic-spine.test.tsx`: every `var(--mkt-…)` reference in
  the marketing stylesheet must carry its at-rest value as a fallback, so a
  token nothing writes renders the resting frame instead of dropping the whole
  declaration. **That premise check is the new CLASS** — the #587 / #594
  dead-exemption family pointed at a STYLESHEET for the first time, where the
  thing an unchecked exemption would hide is an invisible dropped declaration
  rather than a bad ratio. Beside it sits a structural rule on the same file:
  the whole pinned sequence lives inside exactly ONE `@media` gate whose prelude
  names every exclusion (`screen`, `min-width: 1024px`,
  `prefers-reduced-motion: no-preference`, `hover: hover`, `pointer: fine`), and
  no `.mkt-spine.is-cinematic` declaration exists outside it. **Both scans are
  bounded and both are owed an entry anyway** — the #610 ruling, second
  instance: they grade `MarketingMotionStyles` in `components/marketing/ui.tsx`,
  which every marketing PR touches, so "bounded" describes the radius and not
  the blast radius. Written up in §2b.
  What it REPLACED is the transferable half. It shipped as three `@media` blocks
  reverting `.is-cinematic`, with the test asserting each contained
  `position: static`, `height: auto`, `opacity: 1` and `transform: none`. All
  three passed while the layout was wrong — the reverts never put back `width`,
  `margin`, `pointer-events` or the rail's reserved lane — and there was no
  fourth block for `print`, so printing the homepage produced ~3 pages of pinned
  section carrying none of its four chapters. **A revert list is a copy of the
  thing it reverts, and asserting four of its lines cannot tell you the copy is
  complete.** The remedy was to delete the second list rather than lengthen it:
  one gate, nothing outside it, a property the test can actually check. That is
  a general rule and not a CSS one — **when a guard grades a COPY, ask first
  whether the copy needs to exist.**

  **DREAMCRM-71 (PR #617) is the nineteenth, and the first assertion on this
  list that grades a SHAPE rather than a COLOUR.** Every entry in
  `blocking-assertions` before it grades a pair, a ramp, a fill or an ink
  direction. `tests/marketing/tone-tiles.test.ts` walks `app/(marketing)` and
  `components/marketing` and fails any `d` attribute that is ENTIRELY a
  check-mark polyline — one subpath, three points, x rightward, middle lowest,
  last highest — under any component name or none. After it lands, no PR can put
  a bare tick on the marketing site. **MERGED 2026-09-16, `3fc12a96`** — the
  diff carries `scripts/review-gate.mjs`, a `check-definitions` file, so both
  labels were earned independently, and Sentinel's REQUEST CHANGES → APPROVE
  round is written onto the PR as §3 requires. Routed BEFORE the merge, the
  eleventh's shape copied deliberately; Forge flipped it. Its author named the
  CLASS rather than letting the label guess, and stated the §3 classification
  rather than assuming it.
  **Why it is geometric rather than nominal is the part that transfers.**
  `CheckIcon` is deleted rather than left dormant, so re-importing it is already
  a `tsc` error — a rule keyed to that name would be grading a thing that can no
  longer happen. The way a tick comes back is hand-rolled in a fresh `<svg>`,
  which no name can see. **When the obvious spelling of a defect has been made
  impossible, the rule belongs on the defect's SHAPE, not on its name.** It is
  also a census moving out of prose: the call-site count lived in `BRAND.md` as
  a number and went stale twice (eleven, then nine) because a number in a
  document cannot ask the tree. Its one exemption, `MatrixMark`, is by component
  with its premise asserted in BOTH halves — the exempted component must still
  contain a tick, and must still carry the `sr-only` word that makes that tick a
  VALUE in a yes/partial/no matrix rather than an ornament. Written up in §2b.

  **DREAMCRM-72 (PR #618) is the twentieth, and it arrives as THREE new classes
  at once** — the second batch ever to do that, after the eighth. Routed the day
  it opened, by its author, each class named rather than summarised under the PR
  title (the #555 lesson) and the §3 classification stated rather than assumed.
  **MERGED 2026-09-16, `16dd4fcd`** — Forge flipped it on the next intake,
  which is the eleventh's shape working as designed. The diff carried
  `scripts/review-gate.mjs`, a `check-definitions` file, so both labels were
  earned independently; nothing else in it was on §3's list.
  **It merged owing a review that nobody recorded, and that half is not an
  intake matter but belongs beside the entry anyway.** `scripts/review-sweep.mjs`
  names it by number: labelled `needs-sentinel-review`, merged, and carrying no
  GitHub review and no comment with a verdict in it. §3 asks for the verdict to
  be written onto the PR BEFORE the merge, and the instrument built for exactly
  that question went red on the first labelled merge it had to judge. Reproduce
  it with the workflow's own two commands — `gh pr list --state merged --json
  number,title,url,mergedAt,author,labels,comments,reviews` into
  `node scripts/review-sweep.mjs --prs <file> --since 2026-09-16T00:00:00Z`.
  The remedy is printed on that output. **The routing lesson is that the two
  obligations fail independently**: the intake half of this PR was answered by
  its author on the day, and the review half was not, on the same PR.
  What ties the three together is worth more than any one of them: **each
  answers "what can nothing else in this repo see", and each names a different
  reason.**
  - `tests/marketing/no-drawn-grid.test.ts` — a lattice, a `backgroundImage`
    repeating on a fixed pitch, held at zero under the three marketing roots.
    **A DECORATIVE LAYER is a fourth kind of subject on this list.** Every colour
    rule grades a pair, a ramp or an ink direction; the tone-tile rule beside it
    grades the shape of a glyph; this grades a layer axe cannot see (it reads
    `background-color`) and no class-string scanner can see (the recipe is a
    style object). The film grain is tiled noise and is deliberately NOT one, the
    discrimination derived from what the tile PAINTS rather than from a name or
    an exemption.
  - `tests/marketing/chrome-legibility.test.ts` — **a FIELD-OF-VIEW intake, the
    #615 shape's second instance.** `BRAND.md` Part 4's 12px floor already
    existed in `legibility-floor.test.ts` and already skipped
    `components/marketing` for the 7px product mocks. **That skip is keyed on a
    DIRECTORY while the exemption is about a KIND**, and the shared chrome shares
    the directory with the mocks; two literals were live under the floor on every
    marketing page. Not one assertion moved, and what can fail a stranger's PR
    did — which is the intake trigger as written.
  - a pair in `tests/a11y/token-contrast.test.ts` — a translucent **sticky**
    bar's ink over the darkest surface it crosses. The surface under a sticky bar
    is a SIBLING scrolling past rather than an ancestor, so axe, `dark-mode-parity`
    and rules 1–6 all correctly decline. The alpha is read out of `chrome.tsx`;
    `white/80` clears the floor by 0.01.

  All three are written up in §2b. All three were watched fail on real defects
  and mutated in both directions, which is #609's lesson answered at birth for
  the second batch running. And **what each rule does NOT cover is written in
  `scripts/review-gate.mjs` beside its entry rather than only in the test** —
  Sentinel's #617 note that the script comment is what the rulebook entry gets
  written from, answered on the very next PR. That is the loop this section
  exists to close, and it is the first time it has closed in one hop.

  **The hole #617 exposed was worth more than the rule, and it was about the
  DERIVATIONS rather than about that PR** (Forge's gate sweep, 2026-09-16).
  **BOTH GAPS ARE NOW CLOSED IN CODE — DREAMCRM-81, PR #622, `3e36f4fc`, merged
  2026-09-16.** The history below is kept because the SHAPE recurs; the
  reproductions it used to carry are historical and no longer return what they
  said.

  **Gap 1, CLOSED: rule 1 now matches a product root at a PATH BOUNDARY.**
  `PRODUCT_ROOT_RE` is `/(^|[^\w])'(app|components|lib)(\/[^'/.]+)?'/` — one
  segment deep, and a segment carrying an extension is never a root. So
  `'app/(marketing)'` and `'lib/services'` count; `'lib/db/migrations'` and
  `'lib/read-checks.ts'` do not. The history: `tone-tiles.test.ts`,
  `no-drawn-grid.test.ts` and `chrome-legibility.test.ts` were each labelled by
  ACCIDENT — they import `ROOT` from `tests/a11y/palette` for a PATH CONSTANT,
  which tripped the palette derivation — and `const ROOT = process.cwd()`, one
  line no reviewer would stop on, would have silenced all three. The first two
  now match on the merits; the third still matches neither derivation (it walks
  nothing, being a bounded by-component reader) and is owed its entry under the
  #610 ruling, which is the correct outcome rather than a residual hole.
  **The boundary was chosen by MEASUREMENT rather than by argument**, and the
  measurement is the transferable part — reproduced independently by Sentinel
  and again by Forge's intake sweep: bare root **27** scanners, one segment
  **40**, any depth **50**. The ten that "any depth" sweeps in are guards that
  name exactly what they read, which is the bounded case this list is not for.
  Widen a derivation by measuring both the catch and the sweep-in, and put the
  boundary where the sweep-in starts.

  **Gap 2, CLOSED: there is a THIRD DERIVATION, and it keys on the PAGE LIST.**
  The shape: a suite file that navigates real pages and asserts across a page
  list it did not type. Mechanically — `tests/guards/review-gate.test.ts`,
  `sitewidePageRegistries()` — it imports `@playwright/test`, calls `.goto(`,
  and EXPANDS a binding imported from `app/` / `components/` / `lib/` into a
  collection. That is rule 1's logic one surface over: it covers pages nobody
  typed, including the ninth comparison added next month. A new one fails
  `test` BY NAME on the day it arrives unless registered, and the failure says
  which registry it expanded.
  **The criterion is deliberately NOT "iterates a route collection."**
  `e2e/smoke.spec.ts` loops four hand-written paths through `page.goto` and must
  stay silent; it is the sharpest of the nineteen bounded journey specs sitting
  in `e2e/`. A criterion that reddens it is the "208 places to catch 8" trade
  this section keeps refusing, alongside "any test that reads another file".
  Why a third derivation was needed at all: the first two decide "repo-wide by
  construction" from what a file READS OFF DISK, and **a spec that drives a
  browser reads no source at all** — it opens pages and measures the rendered
  result, so every source-reading predicate correctly returned false about it
  while it asserted about a whole site. Widening `PRODUCT_ROOT` did nothing for
  this one. **It was never the #615 field-of-view shape either**: both existing
  derivations already filter `trackedFiles()` by `/^(tests|e2e)\/.*\.tsx?$/`, so
  `e2e/` was always inside the field of view and invisible to the predicates.
  Inside the field of view and unmatched is a PREDICATE gap; outside it is a
  FIELD-OF-VIEW gap; they have different fixes, and the diagnosis is worth the
  two minutes.

  **Ten guards joined `INTAKE_RULES` on that merge, none of them new** — three
  persona trees (the patient portal, the public clinic sites, the staff charts),
  the services layer and the chart kit: `a11y/portal-brand`,
  `a11y/portal-ink-opacity`, `a11y/portal-tokens`, `a11y/site-tokens`,
  `clinic-site/brand-as-text`, `clinic-site/brand-fill`, `clinic-site/brand-wash`,
  `clinic-site/site-image`, `journey/spine`, `ui/chart-kit`.
  **Their shared NON-COVERAGE is the part to carry forward, and it is live in
  ten files at once**: every one is keyed on a hand-written directory list, so a
  persona tree that grows a new top-level directory is ungraded until somebody
  adds it. **Look for the SHAPE and never for the identifier** — it is
  `SCAN_DIRS` in five of the ten, `SCAN` in two, `ROOTS` and `PATIENT_SURFACES`
  in one each, and in `journey/spine` there is no named list at all: the
  directory is inlined at the call site. Grepping for `SCAN_DIRS` would find
  half of them, which is §2d's identity-looseness trap one level up, in the
  prose rather than in a regex. `chart-kit` scans `app/(default)`, `app/(double-sidebar)` and
  `components/ui`; a new route group beside those is simply not read. That is
  the #615 field-of-view shape, and these ten are where to look for its next
  instance.

  **`e2e/axe.ts` is now on `INTAKE_RULES`, by hand and labelled as such.** That
  closes the specific embarrassment this section carried — the instrument built
  to catch #534's successors could not see #534 — without closing the class: no
  derivation can see a harness that neither reads source nor navigates, so a
  hand registration closes one hole and never the class. Read the old state as
  a gap in the DERIVATIONS rather than as "unwatched": `e2e/axe.ts` and
  `e2e/axe-baseline-raises.ts` were both already on `check-definitions` and
  reached a reviewer by the other list.

  **What rule 3 still cannot see — three shapes, each MEASURED returning `[]`
  rather than reasoned about** (Sentinel's review of #622; a caveat describing a
  hole the detector does not actually have is worse than no caveat):

  1. **Navigation through a shared helper.** `NAVIGATES` is `/\.goto\s*\(/`, so
     a spec with a fully derived page list calling `await visit(page, d.slug)`
     — the `page.goto` living in an `e2e/` helper — matches nothing. Wrapping
     navigation is an ordinary thing for an e2e suite to grow, and this is
     written up as THE FIRST THING TO WIDEN rather than as settled scope.
  2. **The registry reached through a suite-local re-export.**
     `import { COMPARISONS } from './routes'`, where `e2e/routes.ts` re-exports
     `lib/marketing/comparisons`, resolves to a relative path and returns `[]`.
     This is the #597 shape again — the right module reached by a different path
     spelling. The other two derivations follow imports transitively; rule 3
     resolves exactly ONE HOP, and that is deliberate for fixture loops. The
     remedy when it comes is **resolve through it**, never **exempt it**.
  3. **`.reduce` as the expansion verb** — `DOCS.reduce((a, d) => [...a, d.slug], [])`
     is a fully derived page list and returned `[]`. **CLOSED: PR #624,
     `1ef9051b`, merged 2026-09-16.** The verb list is now
     `map|flatMap|filter|forEach|concat|reduce|reduceRight|slice|sort`, red-run
     in both directions. Notes 1 and 2 were deliberately left open: each changes
     what the derivation MEANS and owes its own two-direction red run against a
     real shape, and neither shape exists in the tree yet.

  Also uncovered and deliberate: a browser-driven guard whose page list is
  TYPED (that is the discrimination itself), a spec that discovers its pages at
  RUNTIME by crawling links or reading a sitemap, and a browser guard that does
  not import `@playwright/test` (none exists, and `playwright.config.ts` is on
  the review gate). Rule 3 says nothing about WHAT the spec asserts. One known
  oddity, no action: the detector matches `review-gate.test.ts` itself on its
  own fixture strings, so the derived population permanently contains one
  self-match.

  **WHAT A RULE-3 FALSE POSITIVE ACTUALLY COSTS — and the docblock in
  `scripts/review-gate.mjs` gets this WRONG, so do not read it there.** The
  comment at `scripts/review-gate.mjs:397` says "Intake is a sentence on an
  issue; a false positive costs that sentence and nothing else", and
  `tests/guards/review-gate.test.ts:274` carries the same claim in weaker words
  ("the cheap direction to be wrong in"). **Both are false.** The tree
  assertion is `expect(unlisted).toEqual([])`, so a false positive is **a red
  `test` run naming an innocent file** — cheap to clear, but it blocks that
  author's merge until they either register a file that is not a site-wide
  guard or rewrite their spec. Sentinel wrote the original framing in the #622
  review and retracted it in the #624 review; the sentence is still on `main`
  in both files, to be corrected in passing by the next PR that touches them
  (which needs a Sentinel review anyway — `check-definitions`). **Recorded here
  rather than transcribed, because this file is generated from that docblock
  and would otherwise inherit a statement its own author has withdrawn.**
  The reason it matters is the advice sitting next to it: the docblock tells
  the next person that **adding a verb is always the cheap direction**, and
  that holds for a verb nobody writes — not for `slice` and `sort`, which
  everybody writes.

  **So the fourth caveat, and the one with teeth: the verb list cannot tell a
  STRING from a COLLECTION, and `isExpanded` asks whether the binding is
  expanded ANYWHERE IN THE FILE rather than whether the expansion feeds the
  page list.** Measured on the merged tree (Sentinel probed them; Quinn re-ran
  them; Forge re-ran them again under BOTH verb lists, the transcription
  checked by reproducing the real tree's two matches across 820 tracked suite
  files):

  | shape | merged (#624) | shipped (pre-#624) |
  |---|---|---|
  | `BASE_URL.slice(0, -1)` — a **string** const imported from `lib/` | `['BASE_URL']` | `[]` |
  | `for (const d of DOCS.slice(0, 1))` — bounded, one page | `['DOCS']` | `['DOCS']` |
  | `expect(nav).toEqual(DOCS.sort())` — one hand-typed page visited | `['DOCS']` | `[]` |
  | `expect(nav).toEqual(DOCS.map(…))` — the pre-existing twin | `['DOCS']` | `['DOCS']` |

  Read the second column against the third before believing what a widening
  did. **Two of these four are new with #624, not three**: row 2 is carried by
  the pre-existing `\bof\s+NAME\b` clause — the `for…of` — and not by `slice`
  at all, and it matched identically before the verb list grew. (Written
  WITHOUT the `for…of`, as `const stops = DOCS.slice(0, 1)`, the same shape IS
  new.) Row 4 is the control: it confirms `sort` EXTENDS a class `map` already
  had rather than creating one, so the expectation-stabilising shape is not a
  regression the widening introduced.

  **The remedy rule, and it has two branches because of row 2: when one of
  these goes red on an innocent file, first find WHICH CLAUSE matched.** If it
  is the verb clause, drop the verb. If it is `for…of`, `for…in`, spread or
  `Object.keys`, dropping a verb changes nothing and the fix is to narrow
  `isExpanded` to the binding that feeds the STOPS. **Never register the file.**
  Registering a non-guard to clear a red run is how the intake list stops
  meaning anything, which is the failure this section refuses everywhere else.

  **The lesson the closure leaves behind, now that "the sweep is the only
  instrument" is gone for both shapes:** that sentence was true FIVE times in
  this section before code caught up, and those five occasions are the argument
  for running the sweep at the TOP of every intake rather than as a backstop.
  Both widenings were red-run in BOTH directions with the fixture staged before
  the run that certified it — #609's lesson answered on its own remedy, because
  an absence assertion over a clean tree cannot tell a working detector from a
  narrowed one.

  **This is also the third batch running whose review class changed mid-flight**,
  each time because a guard the author added pulled a `check-definitions` file
  into the diff. At that rate it is not an accident to be caught — **assume a
  batch that ships a new guard will need the review, and re-read §3's list when
  you push the last commit.**

  **This is also the third batch running whose review class changed mid-flight**,
  each time because a guard the author added pulled a `check-definitions` file
  into the diff. At that rate it is not an accident to be caught — **assume a
  batch that ships a new guard will need the review, and re-read §3's list when
  you push the last commit.**

  **DREAMCRM-75 (#620, `e9c58e44`, merged 2026-09-16) is the twenty-first, and
  it is the FIFTH counter-example — no label, no mention, no review, and it
  reached this document by the sweep alone.** One new class of blocking
  assertion inside `test`: PRICE PROVENANCE.
  `tests/marketing/pricing-price-source.test.tsx` holds the pricing route to
  zero plan-price literals, and separately proves the page FOLLOWS
  `getQuotedPlan()`. Every subject on this list so far has been a colour, a
  shape, a decorative layer, a control byte or a table read; this is the first
  that grades where a rendered NUMBER came from. Written up in §2c.
  **The label's silence was CORRECT, which makes this the cleanest instance of
  the #610 ruling yet.** Run the classifier on the real file list rather than
  guessing, as #603 did — `gateFindings()` and `intakeFindings()` both come back
  **empty**. No area on §3's list is in the diff, so no review was owed; no
  `INTAKE_RULES` pattern matches, and the guard fires neither derivation
  (`PRODUCT_ROOT` zero, no palette import) because it reads two named files.
  This document is owed an entry anyway — **“bounded” describes the scan's
  radius, not its blast radius** — because once it landed, a stranger who types
  `$200` into the pricing FAQ fails `test`.

  **#619 (`94dc4b40`, merged 2026-09-16) was graded by the same sweep and is NOT
  a gate change**, recorded here so the next sweep does not re-litigate it. It
  replaces `scripts/night-band-grade.mjs` with
  `scripts/decorative-layer-grade.mjs`, and that script is referenced by
  `.gitignore`, `BRAND.md` and `CLAUDE.md` — and by nothing that RUNS: no
  workflow, no `package.json` script, no test. It reports; it cannot fail
  anybody's PR. **A script under `scripts/` is not a gate by virtue of its
  directory.** Three of the seven `check-definitions` patterns live there and
  this one is on none of them, so ask what RUNS it — the same move as asking
  what a change does to the gate rather than which file it lives in.

  **DREAMCRM-76 (PR #621) is the twenty-second, and it is the first assertion on
  this list that grades a RENDERED DOCUMENT rather than SOURCE.**
  **STATE: MERGED 2026-09-16 (`57e289fa`), Sentinel review recorded** — the
  diff carried `scripts/review-gate.mjs`, a `check-definitions` file, so both
  labels were earned independently; nothing else in it was on §3's list.
  Routed the day it opened, by its author, the class named rather than left to
  the label and the §3 classification stated rather than assumed — and it is the
  **fourth** batch running whose review class changed mid-flight, exactly as the
  paragraph above now tells you to expect: it opened as design-system-conformant
  UI polish and stopped being that when registering the rule put
  `scripts/review-gate.mjs` into the diff.
  **What it adds: one new class of blocking assertion inside the required `e2e`
  check.** `e2e/marketing-viewport.spec.ts` measures
  `documentElement.scrollWidth` against `clientWidth` on every code-backed
  marketing page at 390, 834 and 1440, plus a pan probe — `scrollTo(9999, 0)`
  must leave `scrollX` at 0. `BRAND.md` Part 10 has called that build-blocking
  since the brand book was written and nothing checked it; `/compare/[vendor]`
  shipped dragging **212px** sideways at 390 and stayed that way across three
  moves and two ledger entries. After it lands, no PR can widen a marketing page
  past the viewport at those three widths. It is the **second** gate to arrive
  inside `e2e` after the axe ratchet (#534), and `e2e` now gates LAYOUT as well
  as journeys and accessibility — §2a.
  **GRADE THE DOCUMENT, NOT THE ELEMENTS, and this is the sharpest evidence for
  that in the program.** The Part 5 ledger entry for this very defect carried
  its own scan — “elements whose right edge clears the viewport with no
  `overflow-x` ancestor” — and it returned ZERO while the page panned 212px. It
  was not sloppy; it asked a question whose answer does not determine the one
  that matters. Scrollable overflow follows the CONTAINING-BLOCK chain, and for
  an absolutely-positioned element the containing block and the DOM ancestry
  come apart: `MatrixMark`'s `sr-only` spans sat inside the `overflow-x-auto`
  box in the DOM and outside it for layout, so 26 of them resolved against the
  ICB and widened the document by exactly 212 while every element-level probe
  reported the page contained. `body.scrollWidth` was 390;
  `documentElement.scrollWidth` was 602. **A guard that infers a MECHANISM can
  be defeated by a different mechanism; one that measures what the reader
  experiences cannot** — §2d's do-not-gate-on-the-blind-tool rule, arriving this
  time inside a ledger entry rather than inside a test. The ledger's stated
  cause was wrong for three moves, and that correction is the transferable part.
  Its stated non-coverage is exactly one thing, and it is written beside the
  `INTAKE_RULES` entry rather than only in the spec (Sentinel's #617 note,
  answered for the second batch running): `/blog` and `/blog/[slug]`, whose
  bodies come out of the database and render an empty state under a seed-free
  spec. Every other marketing page is covered, and the dynamic families expand
  from the same registries their own `generateStaticParams` reads rather than
  being typed out.

  **DREAMCRM-81 (PR #622, `3e36f4fc`, merged 2026-09-16) is the twenty-third,
  and it is the first entry on this list whose SUBJECT is the intake instrument
  itself.** It adds no assertion about the product: it adds the third
  derivation, widens rule 1 to a path boundary, and registers eleven files that
  were already grading whole trees unseen. Written up in full in the two gap
  paragraphs above, which it closes. Two things about the PROCESS are worth
  keeping. It is the **fourth** batch running whose review class changed the
  moment a guard got registered, which is now a prediction this section makes
  rather than a surprise it records. And it is the cleanest instance yet of the
  loop closing in one hop: routed by its author on the day of merge, with the
  class named, the measurements handed over reproducible, and the non-coverage
  written beside the `INTAKE_RULES` entry rather than only in the test —
  Sentinel's #617 note, answered without being asked.
  **#624 (`1ef9051b`, merged 2026-09-16) is its follow-through, not a separate
  entry**: one widened predicate and three caveats, no new assertion class.
  Worth keeping for one thing about the PROCESS — Sentinel used the review to
  RETRACT their own framing from the previous review and routed the retraction
  to intake rather than to another PR, and Quinn took that over their own
  instinct to open #625. **A correction that only needs a sentence belongs in
  this file, not in another `check-definitions` review cycle** — provided
  somebody says out loud that the code still carries the wrong sentence, which
  is what happened and what the paragraph on rule-3 false positives above now
  records.

  **#623 (`6b4a2d6e`, merged 2026-09-16) was graded by the same sweep and is
  NOT a gate change**, recorded here so the next sweep does not re-litigate it,
  the same service #619's entry performs above.
  `tests/marketing/comparisons-count.test.ts` is a unit test of
  `comparisonCountLabel()` with literal inputs and literal expectations; it
  reads no tree, holds no population at zero, and can fail a stranger's PR only
  by their changing that one function. **A new test inside the required `test`
  check is not automatically a new CLASS of blocking assertion** — ask what
  population it holds at zero, and if the answer is "one function's behaviour",
  it is a test and not a gate.

  **DREAMCRM-78 / 79 / 80 (#626 `39dbfd0c`, #627 `7e2dea3d`, #628 `a3ded30a`,
  #629 `0478d105`, all merged 2026-09-16) are the twenty-fourth, and they are
  numbered here despite being new CASES rather than a new class** — nine new
  `e2e` accessibility stops in one batch, each at a ceiling of zero. It is the
  largest single change to what `e2e` holds at zero since the baseline emptied:
  the marketing site went from TWO scanned pages to ELEVEN (`why`, `resources`,
  `resource guide`, `grade`, `roi`, `partner program`, `changelog`, `docs`,
  `doc article` joining `home` and `pricing`), and the suite's stop count went
  39 to 48. **The rule this document states — ask what population the assertion
  holds at zero — gives the answer directly: nine pages, none of them scanned
  by anything before.** A stranger's PR can now go red on a page that was
  invisible to `e2e` last week, which is the test for whether something belongs
  on this list, and "it is another instance of the axe ratchet" does not change
  that. Three things in how they were built are worth copying, all of them the
  author's own work rather than a review's: **each stop was MEASURED before it
  was asserted** (0 rules / 0 nodes at 390 / 834 / 1440 against the production
  build, not a hopeful zero); **each was WATCHED TO FAIL against the defect its
  page is actually at risk of** rather than a synthetic one — the quiet-ink step
  (`gray-400`, `#93a0bc` on white, 2.62 as rendered), which is what every
  restyle of a reading page reaches for; and where a batch added several stops,
  **each mutation was required to redden exactly ONE of them** and leave the
  others at zero, which is the only evidence that three stops are scanning three
  pages rather than three views of one. A green run says nothing about that.
  Their stated non-coverage is two things, and both are written beside the code:
  `/blog` and `/blog/[slug]`, whose bodies come out of the database under a
  seed-free suite, so a stop there would scan an empty state; and `/product`,
  which is the interesting one. **It is blocked by an EXCLUSION'S SHAPE, not by
  a decision anybody is avoiding** — `DECORATIVE_MOCKS` keys on the drift
  wrapper (`.mkt-float >`) and the product tour's nine mocks do not float, they
  are the page's subject, so the selector would match nothing, `deadExclusions`
  would fail the new stop by name, and `aria-hidden` alone as a replacement is
  the blanket allowance §2d's third rule forbids. The tour measures 89 / 103 /
  103 violation nodes at the three widths, every one inside an `aria-hidden`
  mock and zero on the page itself. **An unscanned page whose reason is written
  down beside the baseline is a known gap; one whose reason lives in somebody's
  head is a hole** — and this one is now the only marketing page on the site
  without a stop.

  **#629 also carries the first CONFIRMED fire of the third intake derivation
  on a file that should not be registered, and it resolved the way the
  false-positive paragraph above prescribes.** The docs stop was first written
  with `DOCS.find(…)` and `for (const c of DOC_CATEGORIES)` — a page list
  derived from a product registry — and `tests/guards/review-gate.test.ts` went
  red naming `e2e/smoke.spec.ts`. **The cost was exactly what that paragraph
  says it is: a red `test` run naming the file, not a sentence on an issue.**
  The guard was RIGHT — those really are registry expansions — so the fix went
  into the spec, not into the rule, and emphatically not into the registration
  list. `e2e/smoke.spec.ts` is a bounded journey spec; its page list is
  hand-typed on purpose, so it fails LOUDLY when content moves, and the derived
  sweeps live in `e2e/marketing-viewport.spec.ts`, which is registered for
  exactly that. The constraint is now enforced rather than remembered — a case
  asserting `sitewidePageRegistries('e2e/smoke.spec.ts', …)` comes back EMPTY —
  which is the premise-check family arriving inside the intake instrument
  itself. **Narrow the subject or drop the verb; never register the file to
  clear a red run.**

  **DREAMCRM-82 (#633, `866991f5`, merged 2026-09-17) is the twenty-fifth, and
  it is a new KIND of premise check rather than a new guard**: an assertion
  about ARITHMETIC between a function and a stylesheet. The chapter card is
  bottom-anchored now, `pinnedCardFits` guarantees
  `height <= viewport - 2 x CARD_TRAVEL`, and the test bounds the card's bottom
  inset by `2 x CARD_TRAVEL` read off the stylesheet's own at-rest fallback
  rather than transcribed beside it — so the two independently-editable numbers
  cannot drift apart silently. **The same PR also fixed the drift this document
  keeps predicting, in the same file**: the "only `transform` and `opacity` are
  scroll-driven" rule was matching a hardcoded list of the seven `--mkt-` tokens
  that existed when it was written, `--mkt-so` arrived with the four-scene stage
  and the list did not, and the one new scroll-driven declaration in the batch
  was graded by nothing. It is derived now, minus one named layout token whose
  exception carries its own detector. **A guard whose subject is a LIST
  somebody maintains drifts exactly as the revert block in the same file did,
  and it is the harder failure to see** — the revert list was wrong about
  something present, this one was silent about something absent. Both halves
  written up in §2b. Routed to intake by its author on the day of merge, class
  named.

  **#625 (`85392929`), #630 (`fbe20325`), #632 (`776f9ff9`) and #634
  (`6b6163da`) were graded by the same sweep and are NOT gate changes**,
  recorded so the next sweep does not re-litigate them, the same service #619's
  and #623's entries perform. #630 is a docs-only correction to a `BRAND.md`
  claim; #632 changes one literal inside an existing case in
  `emoji-changelog-placement.test.tsx`; #634 reconciles a Part 5 ledger entry
  now that #633 has landed. #625 is the one worth a clause: it adds no
  assertion, but it is where the `/product` non-coverage above was first
  written down, beside the baseline rather than in an issue comment — which is
  why the four PRs that followed could each cite it in one line instead of
  re-deriving it.

  **THE SWEEP THAT FOUND ALL OF THIS IS ALSO THE EVIDENCE FOR RUNNING IT IN TWO
  PASSES** (Forge, 2026-09-17). Ten commits had reached `main` since the last
  intake, over about twenty-nine hours. The path-scoped pass
  (`.github/workflows/`, `docs/CI.md`, `docs/E2E.md`, `e2e/`) returned five of
  them. **The five it missed included #633 — the only NEW CLASS in the batch**,
  because a new kind of assertion inside a test file that already existed
  touches nothing on the path list and could not have earned the label either.
  That is the #598 shape a second time, and it is now the shape that has
  arrived most often. The unscoped pass is not a backstop for the path list; on
  this batch it was the only pass that found the thing that mattered.

  **A BOUNDED scan is not exempt from this document, and that question now has
  a settled answer** (Forge's ruling, 2026-09-15, on Vesper's stated
  classification of `tests/clinic-site/brand-as-text.test.ts`, #610). That guard
  is a new CLASS, holds a whole population at zero, and fired NEITHER intake
  derivation: it walks two named directories rather than the tree, and it does
  not import `tests/a11y/palette.ts`. Its two closest siblings —
  `brand-fill.test.ts` and `portal-tokens.test.ts` — were bounded and off the
  list in exactly the same way. **(All three are ON the list since #622**, which
  changes nothing about the ruling: they got there by naming `'app/site'`, a
  product root's top-level division, and the ruling's own subject —
  `chrome-legibility.test.ts`, which walks nothing — still matches no derivation
  and is still owed its entry by this ruling alone.) **The right reading is that the label's test and
  this document's obligation are different tests, and the siblings prove it:
  both of them are WRITTEN UP in §2b already.** What the document owes an entry
  to is what the assertion can fail a stranger's PR on; "bounded" describes the
  scan's radius, not its blast radius, and a rule holding every `color: brand`
  in `app/site` at zero stops a stranger's diff exactly as a tree walk would.
  So: record it, and do not read "the label did not fire" as "nothing is owed".
  **Do not widen the label to catch these**, either — the derivations work
  because they key on something that means "repo-wide fact by construction" (a
  tree walk, an import of the palette), and "any test that reads another file"
  is most of a 8,000-test suite. That is the queue-nobody-reads failure this
  rule has already refused twice. The instrument for a bounded guard is the
  author stating the classification, which is what happened here, plus the
  sweep.

  **The label is a floor, not the rule.** It reads paths and cannot tell a new
  class of assertion from a new case of an existing one, which is the
  distinction that actually decides whether something needs writing down. Say
  which one it is rather than letting the label guess, and keep mentioning
  Forge — `#557`'s two zero-tolerance guards landed on `tests/guards/**`, would
  have earned the label, and still reached this document by the sweep.
  **DREAMCRM-48 (2026-09-15) is the first batch where the label fired and the
  author answered it in the same breath**, which is the loop working as
  designed: #577's `bp` row prefix in `e2e-seed-scopes.test.ts` is a new CASE
  of a rule that already exists, named as such and needing nothing here;
  #573's `axe-headroom-table.test.ts` is a new machinery guard, written up
  below. **DREAMCRM-52 (#585) is the second, and it is the other answer**: the
  label fired on `class-pairs.ts` and `token-contrast.test.ts`, and what fired
  it was a new CLASS rather than a new case — said as such, on the day, with
  the §3 classification stated rather than assumed. Two batches, the two
  possible answers, both given rather than left to the label.
  The lesson DREAMCRM-48 adds is narrower than the label: **a feature
  that reports and cannot gate can still ship a guard that gates.** #573 is
  reporting-only by design and true to it, and it still put a new blocking
  assertion into `test`. Answer for the diff, not for the feature's headline.

  **PR #636 is the twenty-sixth, and it is the first one that reached this
  document with NOBODY routing it** (`9269da58`, merged 2026-09-22T01:24Z by the
  owner; the registration itself is `1b0315de`). It put
  `tests/marketing/cinema-fx.test.ts` on `INTAKE_RULES` — on a STATED reason,
  "a palette grader that walks no tree, the #598 shape this list exists for",
  which was wrong and has since been reversed (the ruling is below) — and it
  earned BOTH labels
  independently: `needs-sentinel-review`, because the diff carries
  `scripts/review-gate.mjs`, a `check-definitions` file, and
  `needs-forge-intake`. **It merged with neither satisfied.** (The review half was
  remediated after the fact on DREAMCRM-85 — a verdict is mirrored onto #636 now,
  and the sweep's only remaining red entry is #594, which §3 has just given a
  reviewer. Remediated after the merge and after the deploy is not the same as
  satisfied before it.) No verdict on the
  PR, no mention on any issue, and the registration commit touches exactly one
  file — `scripts/review-gate.mjs` — which is on none of the paths the
  path-scoped sweep reads, so pass one returned the PR not at all. Only the
  UNSCOPED pass, which reads every commit on `main` and asks what each does to
  the gate, saw it.

  **THE REGISTRATION WAS WRONG AND IS REVERSED — the first entry this list has
  had to TAKE BACK** (Forge's ruling, 2026-09-22, on Sentinel's referral;
  Sentinel deliberately declined to pick a branch, and confirmed the ruling on
  review). #598's shape (`muted-ink-direction.test.ts`) is a rule about every
  colour in the PRODUCT — it resolves the repo's own colours through
  `palette.ts`. `cinema-fx.test.ts` imports `contrast`, `hexToRgb` and `over`
  and applies them to six hex literals typed in its own body. It resolves
  nothing off disk, asserts one constant in one module, and can fail no
  stranger's PR — the test the `brand-as-text` ruling settled. De-registered on
  #641.

  **What forced the entry was a FALSE POSITIVE of derivation 2, cleared by the
  one remedy §2 rules out.** The file imports `../a11y/palette`, rule 2 fired
  on the import alone, `test` went red naming an innocent file, and it was
  quieted by registering the file — "never register the file to clear a red
  run", written about rule 3, arriving for the first time on rule 2.

  **The accidental trip is NOT new; the first one with no merits behind it is.**
  `tests/guards/review-gate.test.ts:155` already recorded that `tone-tiles`,
  `no-drawn-grid` and `chrome-legibility` trip rule 2 "by luck rather than on
  the merits" — they import `ROOT` for a PATH CONSTANT. Rule 2 has been
  over-broad since it shipped, and the over-breadth was invisible because every
  accidental match happened to deserve its entry anyway; `review-gate.mjs` says
  so out loud twice ("on the merits and not merely because it imports
  `palette.ts`"). **#636 is the first fire where the accident was LOAD-BEARING,
  not the first fire** — a three-week-old crack. Sentinel withdrew the
  "new false-positive shape" framing on review.

  **THE FIX: rule 2 keys on the BINDING, not the import** (#641). `palette.ts`
  exports facts about this repo's colours — `AA`, `LIGHT`, `DARK`, `token`,
  `utilityColor`, `SURFACES` — and arithmetic that would work on anybody's
  (`contrast`, `hexToRgb`, `over`, `luminance`, `oklchToRgb`, `parseColor`),
  plus the `ROOT` path constant. Reaching for a FACT is asking the repo what
  its colours are; borrowing the arithmetic is using the module as a LIBRARY.
  Measured across all twelve suite files that reach `palette.ts`: **eight stay
  matched** — seven real graders plus this file's own permanent self-match on
  its spelling-table fixtures, which rule 3 documents about itself and rule 2
  did not until Sentinel measured it — and four drop out with no coverage lost
  (`tone-tiles` and `no-drawn-grid` are held by derivation 1 on their own
  merits; `chrome-legibility` was never held by any derivation and stays
  registered on the `brand-as-text` ruling; `cinema-fx` is held by nothing,
  which is the correct answer).

  **Do not fix this shape by deleting the import.** For `ROOT` that IS the
  answer and the guard file already prescribes it (`const ROOT =
  process.cwd()`). For the arithmetic it is wrong: `palette.ts` is the one
  place this repo computes a contrast ratio, and a remedy that teaches authors
  to copy `contrast` out of it to dodge a label un-single-homes the exact
  module both derivations depend on being single.

  **THE INTAKE INSTRUMENT GREW THE VERY DEFECT THE SAME INTAKE WROTE UP, and
  that is the durable lesson here** (Sentinel's blocking item on #641). The fix
  above moved rule 2's subject from the MODULE to six names typed into an
  array, and bought a silent failure: the old predicate covered every export
  `palette.ts` grew, for free, while a hand-typed list and an independently
  editable module drift — and when they do the detector does not complain, it
  STOPS MATCHING. A seventh fact plus `import { RAMP, contrast }` returns no
  fact, `unlisted` is `[]`, `test` is green: **#598 arriving through the hole
  rule 2 exists to close, silently.** This is §2b's "a guard whose subject is a
  LIST somebody maintains drifts" (#633) — written up in the SAME intake that
  then shipped one, inside the derivation that decides what reaches a reviewer.
  The remedy is the premise check, not vigilance: the partition is DERIVED from
  `palette.ts` and asserted TOTAL in BOTH directions — every value export is
  classified, and every classified name is still a value export. The second
  direction is what instruments it, because a one-way remainder check passes
  when the export scanner breaks. Watched to fail both ways. **Registering
  `palette.ts` as a path does not cover this**: it buys a label and a sentence,
  not a check of the array.

  **What the narrowing does not cover, stated rather than discovered later**
  (Sentinel, #641 note 2): the repo's colours reached through a module OTHER
  than `palette.ts` while borrowing only arithmetic from it.
  `tests/a11y/class-pairs.ts` is the live shape. Editing `class-pairs.ts` is
  covered — it is on the list as a path — but a NEW file grading the product
  through it is not. **Do not widen transitively for this**; that is "any test
  that reads another file" by another name, refused twice. The instrument for
  a bounded guard is the author stating the classification, plus the sweep.

  **The lesson is about the LABEL, not about that PR.** `needs-forge-intake` is
  applied by `review-gate.yml` and then read by nothing: `scripts/review-sweep.mjs`
  excludes it deliberately ("that is an intake"), and it is never cleared at
  merge, so **thirty** merged PRs carry it today, most long since routed. **An
  obligation with no closing record is not a queue, it is a note in a drawer** —
  and that is the same argument #593 made for the review half, which DOES have a
  record the sweep can read. Until the intake half gets one, the unscoped sweep
  is the only instrument that can see an intake nobody announced. That is why §2
  opens with it and why it runs in two passes.

  **The intake half gets a closing record too, from 2026-09-22 (DREAMCRM-91).**
  The review half works because a verdict is written onto the PR, where an
  instrument can see it. An intake's record lives in a skill outside the repo, so
  nothing in the repo can see it — which is why the only thing that caught #636
  was the unscoped pass, read by hand. Same shape, same place as a mirrored
  verdict:

  ```bash
  gh pr comment <n> --body "Forge intake: §2b, §6 — <link to the issue comment>"
  ```

  **Name the sections it landed in, not merely that it landed.** That is the
  one-line confirmation the intake already owes, mirrored where the label is, and
  it is what makes the record gradeable rather than decorative.

  **And it is literally ONE LINE, not conventionally one** (DREAMCRM-94, #648).
  The marker and the section reference must fall on the SAME line of the same
  comment. `carriesIntake` in `scripts/review-sweep.mjs` splits the body and
  tests both patterns per line; until #648 it tested them independently over the
  whole body. Paste the command above and you are already in the shape — every
  spelling the sweep accepts (`§2b, §6`, `§§2, 2a`, `sections 2b and 6`) is a
  one-liner, so nothing written in the documented form stops counting. What it
  now REFUSES, stated here rather than left to be discovered by whoever gets
  named: a genuine record hard-wrapped across two lines (`Forge intake —
  routed, landed in` / `§2b and §6`) no longer counts, which is a FALSE ALARM
  and the bad direction. If one ever turns up in a finding, widen `carriesIntake`
  to the enclosing PARAGRAPH — never back to the whole body, which is the
  spelling that let a long mirrored issue update mention an intake in one
  paragraph and cite a section in another and read as a record.

  **The grading half shipped the same day** (#643, `778adb3f`, DREAMCRM-92):
  `scripts/review-sweep.mjs` now grades `needs-forge-intake` the way it grades
  `needs-sentinel-review`, matching the marker PLUS a section reference — a bare
  "Forge intake" does not clear it, because the sections are the only part of an
  out-of-repo record a reader at the PR can follow. Spelling is generous
  (`§2b`, `§§2, 6`, `sections 2b and 6`). It runs under its own later cut-off;
  §2a has the window and why it was not nudged.

  **Read an intake finding as "nobody was told from here", not "somebody ignored
  the instruction" — because until DREAMCRM-94 lands, nothing asks for this
  record.** `review-gate.yml`'s summary prints the mirroring command for the
  REVIEW half and prints nothing of the kind for the intake half; it tells an
  author to mention Forge on their issue and stops. Quinn found that by chasing
  the sweep's first real finding and corrected a false sentence in the script's
  own docblock that had claimed both halves were prompted. So the half now
  grades a record the gate asks nobody for, and **#644 is the first PR judged by
  it — flagged correctly, by an author who did everything the message in front of
  them asked.** That asymmetry is the finding, not the author.

  Closing it has a trap worth knowing before you try: the gate's intake section
  already contains the string `§2`, so a literal `Forge intake: §2b` example in
  that summary would make the gate's own output satisfy the matcher. A canary
  test in `review-sweep.test.ts` catches anyone who writes one.

  **STATE: MERGED — #648, DREAMCRM-94, `84bc52cd`, 2026-09-22 10:15:58Z**, so
  both halves are live: the gate now asks for the record the sweep grades.
  (This line read `on a PR` for one sweep after the #30 entry below had already
  been flipped — the same promise-accounting failure the third pass exists for,
  one document away. **When you flip a STATE line, grep the file for the PR
  number**; an entry is not the only place a rulebook says where a change is.) `renderIntakeSection` prints the `gh pr comment`
  mirroring command the way `renderReviewSection` does, so both obligations
  arrive attached to the label, on the run, in front of the person about to
  merge. Until it lands an intake finding still reads "nobody was told from
  here"; findings dated after it do not get that excuse. **#644 stays on the
  list, deliberately** — `INTAKE_SWEPT_SINCE` was not nudged past it, because
  moving a cut-off to clear the one PR that happens to be red is the axe-ceiling
  mistake `SWEPT_SINCE` is named for, and the precedent runs the same way (#593
  merged after its own 16:00 window opened and graded itself).

  **Of the two ways through, the first is UNSOUND as DREAMCRM-94 wrote it, and
  that is the part worth keeping** — the issue offered them as a free choice and
  they were not one. A placeholder with no section digit does not save a
  whole-body matcher: the intake section carries `§2` in its own prose, and that
  section's JOB is to point at §2, so printing the marker anywhere completes the
  match and the gate's own summary reads as an intake record — `marker: true,
  section: true`, canary red, measured on the branch rather than argued. So
  `carriesIntake` narrowed to per-line instead. **That is the one pattern in
  `review-sweep.mjs` that has ever got NARROWER**, against its standing rule that
  the answer to a blinding hazard is a scoped exclusion and never a stingier
  pattern, and three things put it outside that rule: nothing had gone blind, so
  it is a deliberate tightening rather than a reaction; one line is the shape §2
  already documents; and it DROPS an accidental-satisfaction class — a body
  mentioning an intake in one paragraph and a section in another was a MISSED
  MISS, the sweep reading an unrecorded PR as routed, which is the direction this
  half was short of. **It was safe only because it shipped WITH the instruction
  that asks for the shape.** Do not copy the narrowing without that half, and do
  not answer a future red in `review-sweep.test.ts` by loosening the sweep's
  record pattern — both directions are pinned there.

  Measure it the honest way — **intakes that reached this rulebook because the
  unscoped sweep pass found them by hand, rather than because anyone announced
  them.** That number is 2 of 2: #636, and #644 today.

  **DREAMCRM-86 (PR #639, opened 2026-09-22) is the twenty-seventh, and it is
  the cleanest arrival on this list.** Both labels fired and the author answered
  BOTH in the same comment on the day — the §3 review requested with the PR
  link, the intake routed with the class NAMED rather than left for a sweep to
  derive. That is #636's failure run backwards, by the same author, inside a
  week. The class is the #598 shape once more: a new KIND of blocking assertion
  arriving in a `test` file that did not exist before.
  `tests/guards/rollout-check.test.ts` holds the deploy job's rollout
  verification in place — the step exists, it cannot be made
  `continue-on-error`, and the `ROLLOUT_SINCE` baseline is recorded BEFORE
  `codebuild start-build`. §2c has what it asserts and the ORDER lesson it
  adds; §2a has what the deploy job means now and the `rollout UNVERIFIED`
  degrade it prints until the IAM grant lands.
  **`GATE_RULES` gains a PATTERN, not an AREA** — `scripts/rollout-check.mjs`
  under `deploy-path` — so the area count is still nine and
  `rulebook-drift.test.ts` stays green, correctly: the drift check grades the
  AREA list, and a new pattern inside an existing area moves no claim this
  document makes. Say which of the two you added. "The review gate changed"
  does not distinguish them, and only one of them is a drift.

  **STATE: MERGED — `4302930d`, 2026-09-22 09:46Z.** This entry was written
  BEFORE the merge on purpose (the eleventh's shape, and the standing answer to
  #636) and owed a second visit to flip this line; that visit is this one, and
  it was made by re-reading `main` rather than by trusting the sentence, which
  is the between-visits hazard #594 named. Everything above is live now and can
  fail a stranger's PR.

  **#635 (`95e0c33c`) and #637 (`e9c9ef7d`) were graded by the same sweep and
  are NOT gate changes**, recorded so the next sweep does not re-litigate them,
  the same service #619's, #623's and #625's entries perform. #635 is the
  week-of-September-14 public changelog entry — §7 asks for one entry per week
  and it is one. #637 opens the Part 5 ledger entry for the defect #639 now
  fixes; docs-only, and §1's one-defect-one-entry rule is satisfied by #639
  moving that same entry's verdict rather than opening a second one beside it.

  **PASS ONE RETURNED ZERO AGAIN, over six commits** (Forge's sweep,
  2026-09-22T08:20Z, boundary `2026-09-21T00:00:00+00:00`). Not the timezone
  defect this time — the boundary carried its explicit offset — simply that
  nothing in the batch touched `.github/workflows/`, `docs/CI.md`, `docs/E2E.md`
  or `e2e/`. The unscoped pass returned all six, including `1b0315de`, the
  commit that put `cinema-fx.test.ts` on `INTAKE_RULES` by editing
  `scripts/review-gate.mjs` and nothing else. **That is three consecutive sweeps
  where the path-scoped pass found strictly less than the unscoped one, and two
  where it found nothing at all.** Keep running it — it is cheap and it names
  the obvious cases — but the standing instruction is now explicit: **pass one
  returning empty is not an answer, it is an absence of one.** Only pass two
  can close a sweep.

  **Branch protection and the merge settings were read against this rulebook in
  the same sweep and had NOT drifted**: `contexts: ["test", "e2e"]`,
  `strict: true`, `enforce_admins: true`, force-pushes and deletions off,
  `allow_auto_merge` / `allow_update_branch` / `delete_branch_on_merge` on —
  all as §2a states them. Recorded because a sweep that only reports drift
  leaves "nobody checked" and "checked, nothing moved" looking identical.

  **The ordinal on #636's entry was wrong and is corrected above**: it read
  "twenty-first", which #620 already holds, and #636 is the twenty-sixth. A
  reconciliation fix rather than a policy change — recorded because a duplicated
  ordinal is how a list stops being countable, and because the same number was
  mirrored into the frontmatter description, where an agent reads it without
  ever opening this file. **A number that appears in two homes drifts like any
  other hand-kept list**, which is the #633 lesson pointed at this document
  instead of at a test.

  **#638 (`0e7e7bd6`, DREAMCRM-87, merged 2026-09-22 08:30Z) is the
  twenty-eighth, and it is the fifth counter-example** — no mention, no record
  on the PR, found by the unscoped sweep pass on 2026-09-22 and routed the same
  day by the sweep rather than by anyone announcing it. One new class of
  blocking assertion inside `test`, nothing under `.github/` touched, the diff
  two components plus `docs/RELEASE.md` plus one new test file, so the
  path-scoped pass could not have seen it and did not. **The class is the first
  guard in this repo whose subject is a RENDERED COMPOSITION** — it renders the
  marketing chrome and fails on any `dark:` variant in the produced DOM, which
  is the one question a path-keyed scanner structurally cannot ask, because the
  offending class lived in `components/brand/` where it is correct. Written up
  under the contrast guards in §2b, with why `dark-mode-parity` declined.

  **#644 (`9d242b57`, DREAMCRM-87, merged 2026-09-22 09:01Z) is the
  twenty-ninth, and it is the sixth** — the PR whose body DID name its own
  intake (`Intake: blocking-assertions — rule 4's ground is a repo-wide grading
  change`) and whose classes still reached this rulebook only because a sweep
  read `main`. **That is the sharpest statement of the DREAMCRM-94 defect there
  is**: the author wrote the record, in the place the summary in front of them
  pointed at, and it went nowhere, because a PR DESCRIPTION is not a comment the
  sweep can grade and a Multica issue is not something GitHub can see. Read #644
  twice on this page — above as the first PR the intake half ever named, here as
  a routed change that was never routed. TWO new classes, both inside `test`,
  both in §2b: rule 4's GROUND moving off plain white onto `surface-1`, a
  repo-wide regrade in which exactly four palette words change verdict
  (`fuchsia-600`, `indigo-500`, `pink-600`, `rose-600`, re-derived from the
  stylesheet rather than transcribed) and every ratio the rule prints drops a
  little (the shipped defect reads 2.32 here and 2.42 on the homepage it
  actually shipped on); and the comparison-matrix marks rule, which holds three
  (glyph, tile) pairs at `MARK_FLOOR` 5.5 rather than at AA. **The second one is
  a MARGIN assertion, and that is a class this list has not carried before** — a
  floor-only test called `Partial` at 4.52 healthy, and 5.5 fails a one-step
  revert on any of the three. The brand-ramp cutoff was proved invariant under
  the ground move rather than claimed to be.

  **DREAMCRM-94 (PR #648, opened 2026-09-22) is the thirtieth, and the fourth
  routed BEFORE it merged** — its author named both classes rather than letting
  the label guess, and both sit inside the required `test` check with nothing
  under `.github/` touched. **STATE: MERGED — `84bc52cd`, 2026-09-22 10:15:58Z.**
  Both classes are live now and can fail a stranger's PR. **The flip was made by
  the third pass introduced one sweep earlier, on that pass's very first run** —
  the path-scoped pass could not see this merge (the diff is two `scripts/` files
  and one test), and the entry would otherwise have gone on reading
  `on the PR` while the rule was already gating. That is the promise-accounting
  failure the pass was added for, arriving immediately rather than eventually.
  1. **A CROSS-FILE CONTRACT between `scripts/review-gate.mjs` and
     `scripts/review-sweep.mjs`** — the gate's intake summary must print a
     command the sweep's record classifier accepts. New because neither file
     could previously fail on account of the other's wording; the guard grades
     it by extracting the `--body` string out of the REAL rendered summary,
     filling the placeholder and asserting `intakeRecord` accepts it, so it goes
     red from either side. Pinning a contract by filling the rendered template
     rather than by reading either file's prose is the transferable part.
  2. **AN INTAKE RECORD'S MARKER AND SECTION REFERENCE MUST SHARE A LINE** —
     `carriesIntake` narrows from whole-body to per-line, so §2's record shape
     is now literally one line. §2 states it outright above, because a
     hard-wrapped record no longer counts.
  Both were watched to fail (§2d) across five mutations, including the option-1
  spelling this document offered, which reddens the new test AND the #593
  canary; one red run found a broken fixture rather than a clean tree
  (`INTAKE_MARKER` wants the two words adjacent) and that is recorded on the
  test rather than quietly fixed. The diff carries two `check-definitions` files,
  so it earns §3's review by the ordinary path as well: both labels, two
  independent obligations, one PR.

  **#640 (`20ba13bd`) and #646 (`4b8f9165`) were graded by the same sweep and
  are NOT gate changes**, recorded so the next sweep does not re-litigate them.
  #640 is one new Guardian signal with its feature tests — `tests/journey/**`
  grades the product, not the tree, and adds no class of assertion a stranger's
  PR can trip. #646 is a two-line `docs/RELEASE.md` reconcile.

  **THE SWEEP OF 2026-09-22T10:0xZ, boundary `2026-09-22T08:20:00+00:00`** (the
  previous intake's own timestamp, carried with its explicit offset). Pass one
  returned #639 and #643. Pass two returned those plus #638, #640, #644 and
  #646 — **and #638 is the whole argument for pass two in one commit**: a new
  class of blocking assertion inside `test`, reachable by no path on the list,
  routed by nothing else. **That is four consecutive sweeps where the path-scoped
  pass found strictly less than the unscoped one.** Branch protection and the
  merge settings were read in the same sweep and had NOT drifted:
  `contexts: ["test", "e2e"]`, `strict: true`, `enforce_admins: true`,
  force-pushes and deletions off, `allow_auto_merge` / `allow_update_branch` /
  `delete_branch_on_merge` on — all as §2a states them. Recorded because a sweep
  that reports only drift leaves "nobody checked" and "checked, nothing moved"
  looking identical.

  **A reconciliation note on how #644 was found, because it generalises.** Its
  two classes were already written up in §2b and already named in this skill's
  frontmatter description — routed correctly into the section that owns them —
  and were missing only from THIS list, which is the one that has to stay
  countable. A rule can be findable and uncounted at the same time. When you
  route a change into §2a/§2b/§2c, give it its ordinal here too, or the next
  sweep spends its budget rediscovering something already in the building.

  **DREAMCRM-87's three open PRs are the thirty-first, thirty-second and
  thirty-third, all routed BEFORE they merged and all labelled by their author**
  (#642, #645, #647 — `needs-forge-intake` on each, and the intake asked for on
  the issue in so many words rather than left to the label to carry). **STATE:
  ALL THREE MERGED — #642 `f004444d` 10:27:21Z, #647 `71f4037e` 11:55:16Z, #645
  `82ffb7e7` 12:13:20Z, all 2026-09-22.** All three rules are live and can fail
  a stranger's PR. **#647 merged with its blocking finding CLOSED, not carried**
  — the guard matches the attribute NAME in the merged tree
  (`tests/marketing/product-mocks.test.tsx`), and Sentinel re-ran the mutation
  rather than reading the fix: APPROVE WITH NOTES at `b737eda3`. The sentence
  this list retracted below is therefore true of `main` as it stands, and the
  retraction stays written because the lesson was about the list, not the PR.
  None of them touches `.github/`; all three land
  inside the required `test` check, and #647 also edits `e2e/axe.ts`.

  1. **#642 — a SCOPE WIDENING that is a reclassification**
     (`chrome-legibility.test.ts` → `type-floor.test.ts`, eight named components
     → two product roots). The same move `legibility-floor` and `retired-tones`
     made on DREAMCRM-50, and derivation 1 on the merits: a tree walk naming a
     product root grades everyone's diff. **The direction of its cost inverted
     with its scope** — from a false NEGATIVE (a component nobody listed is not
     graded) to a false POSITIVE (a new mock fails `test` until somebody
     registers it and writes the sentence), which for a FLOOR is the right
     direction. Written up in §2b.
  2. **#645 — a WIDENED PREDICATE inside an existing class**, not a new one:
     `components/marketing` joins the no-dimmed-type rule, and the four sites
     the directory exclusion covered are pardoned by `isPictureScale` instead.
     It is STACKED on #642 rather than cross-referenced, and that is the part to
     carry: the hole a derived exclusion opens is closed from the FLOOR's end,
     so landing it first would leave sub-12px type in that tree graded by
     nothing. Also in §2b.
  3. **#647 — a NEW CLASS, and the first on this list whose subject is a
     VOCABULARY** (`tests/marketing/product-mocks.test.tsx`). Every other rule
     here grades a colour, a shape, a layer, a layer's arithmetic or a size —
     something a file CONTAINS. This one grades what a word is allowed to mean
     and where it may be written, because `data-mkt-mock="true"` is half of an
     axe exclusion and an exclusion can only ever make a gate looser. After it
     lands, the marker outside `components/marketing/ui.tsx`, or without
     `aria-hidden` on the same element, is meant to fail `test` for a stranger.
     **That sentence is the PR's own, it is FALSE of the tree as it stands, and
     this list carried it for one run** — Sentinel's REQUEST CHANGES
     (2026-09-22) found the guard reading the source literal
     `data-mkt-mock="true"` while the exclusion runs against the rendered DOM,
     where React normalises a valueless attribute; the valueless spelling on the
     shared header is pardoned and invisible, 4 passed. Corrected in §2b, and the
     general form is §2d's eighth identity-looseness member. **The intake lesson
     is about this list, not about that PR: an entry that copies a PR's sentence
     about itself launders an aspiration into a guarantee.** Read the matcher,
     not the docblock. §2b for the rule; §2a for the `/product` stop.

  **#650 (DREAMCRM-87, Quinn, opened 2026-09-22) is the thirty-fourth: a NEW
  CLASS on an ALREADY-REGISTERED file**, which is the combination this list
  handles worst, because registration is per-file and the label cannot tell a
  new assertion inside a registered file from an edit to an old one. **STATE:
  MERGED — `180955c7`, 2026-09-22 12:28:05Z**, stacked on #647, test-only; `review-gate` returns
  intake rather than `check-definitions` (no `e2e/axe.ts`, no workflow, no
  `scripts/review-gate.mjs` in the diff), and the author routed it by hand
  anyway, which is the behaviour §2 asks for. `tests/guards/axe-exclusion-premise.test.ts`
  graded whether the two exclusion CHECKS stay wired; it now also grades the
  SELECTORS — an exclusion satisfiable by `aria-hidden="true"` alone fails
  `test`, derived from every exported `string[]` in the module rather than from a
  named list, so `DECORATIVE_MOCKS` (ungraded in that direction until now) and
  every future exclusion are covered on arrival. Written up in §2b beside #647.

  **SENTINEL'S VERDICTS ON THIS BATCH, recorded here because an intake that
  routes a rule the reviewer then rejects has mis-stated what is binding.**
  #642 **APPROVE**, clear to merge — verified independently at `1e7bfa69`,
  including that the always-TRUE finding was honestly reported and answered with
  a test rather than a docblock note. #647 **REQUEST CHANGES**, one blocking
  finding, above. Two non-blocking notes on #642 are worth carrying because the
  same code ships in #647: `textSizeLiterals` does not see
  `text-[length:11px]` (Tailwind's explicit type hint — zero uses in either tree
  today, so latent rather than live, but the "what it does not see" list reads as
  though only non-literal sizes escape), and `stripComments` treats a `/*` inside
  a STRING LITERAL as a comment start and would blank to the next `*/` (also
  none today, also in both PRs). **Neither is a defect in what the guards
  assert; both are gaps in what their own blind-spot lists CLAIM to be
  complete** — which is the same species as the correction above, one notch
  quieter.

  **THE SWEEP OF 2026-09-22T10:2xZ, boundary
  `2026-09-22T09:46:00+00:00`** — the newest commit the previous intake graded,
  carried with its explicit offset rather than as a bare date. **Ran twice.** At
  10:0xZ both passes returned the same single already-graded commit, `4302930d`
  (#639) — nothing to find, and recorded because a sweep that reports only drift
  leaves "nobody checked" and "checked, nothing moved" looking identical. At
  10:2xZ, on the same boundary, **pass two returned `84bc52cd` (#648) and pass
  one did not** — the diff is `scripts/review-gate.mjs`,
  `scripts/review-sweep.mjs` and one test, no path on the list. **That is five
  sweeps out of six where the path-scoped pass found strictly less.** The one
  exception was the run where there was nothing to find at all, so it is not
  evidence for the path list; read the tally as five out of five non-empty
  sweeps. Branch protection
  and the merge settings were read in the same sweep and had NOT drifted:
  `contexts: ["test", "e2e"]`, `strict: true`, `enforce_admins: true`,
  force-pushes and deletions off, `allow_auto_merge` / `allow_update_branch` /
  `delete_branch_on_merge` on — all as §2a states them. **#648 was still open at
  that sweep**; it merged at 10:15:58Z and its entry is flipped above.

  **A note on what routing-before-merge costs this list, now that four of the
  last five entries carry it.** An entry reading `STATE: on the PR` is a promise
  of a second visit, and the promises were accumulating faster than the
  flips — #648, #642, #645, #647 and #650 outstanding at once, **all five now
  flipped by the third pass's second run** (2026-09-22T13:2xZ, below), which is
  that pass paying for itself on both of the runs it has had. That is still
  the right trade, because the alternative is the #644 shape: an author who
  wrote the record correctly and reached nobody. But it moves the failure mode
  from "nothing was routed" to "the list says on-the-PR about something that
  merged last week", which is harder to see precisely because the entry LOOKS
  present. **The flip is part of the intake, not a tidy-up after it** — so every
  sweep from here opens by re-reading the outstanding STATE lines against
  `main`, not only the commit log since the boundary. That is a third pass, it
  is bounded by the number of open promises rather than by the repo, and it
  costs seconds. **Read it ACROSS EVERY REFERENCE FILE, not the one you are
  editing** — that scope was left implicit here, the pass duly grepped §2 alone,
  and nine stale lines accumulated across §2a, §2b and §3 while §2's own were
  current. The full statement, and what it cost, is in the 2026-09-22T23:5xZ
  sweep below.

  **DREAMCRM-90 (PR #654, open 2026-09-22, Rio) is the thirty-fifth and
  thirty-sixth, and it is TWO entries rather than one because only the second is
  new in kind** — the call its author made rather than left to the label, which
  is exactly what `INTAKE_RULES`' own `why` asks for. **STATE: MERGED —
  `34ed75e7`, 2026-09-22 13:43:19Z**, flipped by Forge at the sweep below rather
  than by its author, which is what routing-before-merge is for.

  Run through `review-gate.mjs` on the real seventeen-file list rather than
  guessed, #654 returns THREE intake files — `site-load-dedupe.test.ts` is the
  third and was already registered — and **TWO review areas, not one**: `money`
  for `lib/services/billing.ts`, and `check-definitions` for
  `scripts/review-gate.mjs`. **That second area is the part to generalise:
  registering a guard puts the registrar's own PR on the review gate**, because
  `scripts/review-gate.mjs` is the list that decides which PRs reach a reviewer
  at all. Every author who routes their own intake by editing that file inherits
  a second reviewer for doing so. It is the right cost — that list is
  load-bearing — but it is a cost nobody is warned about, and an author who
  reads their gate summary as "one area, money" will under-request.

  1. **`tests/clinic-site/layout-reads-the-cache.test.ts` (35) — a CASE ON THE
     EXISTING SHAPE whose SUBJECT is new.** It walks `app/site` and grades
     source exactly as the four clinic-site scanners above it do, so derivation
     1 sees it and it needs no hand-registration argument. What is new is what
     it grades: **a COST, not a way of writing something.** Every other rule on
     this list bans a colour, a glyph, a decorative layer, a token, a raw
     `<img>`, a type size — things that are wrong wherever they appear. This one
     bans a `db.select()` in a layout, which is wrong nowhere else in the repo.
     It is wrong THERE because a layout renders on every page beneath it, so one
     query is one round trip per page view of an entire clinic site. **Read that
     as the precedent and not as a clinic-site detail: a guard here may hold a
     PERFORMANCE property, and what it owes is the MULTIPLIER that makes the
     cost structural — not a rule about style.** The defect it was written
     against is the residual #507: eleven chrome columns re-queried three lines
     below the theme read that had just cached them.

  2. **`tests/clinic-site/no-render-phase-invalidation.test.ts` (36) — a NEW
     CLASS, and the newest shape this list carries.** It is **the first guard
     here whose subject is derived from the IMPORT GRAPH.** Every scanner above
     it asks *what does this file CONTAIN* — a path is opened, its text is
     graded. This one asks *what can a Server Component REACH*: it walks
     transitively from all 228 page / layout / template roots, stops at
     `'use server'` and `'use client'` boundaries, and forbids the reachable set
     — 939 modules — a call to the strict clinic-site invalidator.

     **Why it is on the merits.** Next throws on `revalidateTag` during a render
     (E7, verified against the installed 16.2.10 rather than taken from a doc
     comment), and `lib/services/clinic-site-cache.ts` deliberately rethrows
     everything but "no request scope" — so a render-reachable call site does
     not fail quietly, **it truncates the function it sits in.** #654's own
     first round shipped one: the throw landed between the Stripe profile write
     and `enforceSocialConnectionCap`, so a clinic moving off the full-Premium
     trial kept social connections the platform is billed for, and the
     activation logged itself as a failure. After it lands, wiring an
     invalidator into any module a page can reach fails `test` with the import
     chain printed.

     **WHAT IT DOES NOT COVER**, here rather than only in the test's docblock,
     because this is what the next reader gets the rule from:

     - **Module-granular, not function-granular.** `billing.ts` is
       render-reachable through one function, so the whole module owes the
       tolerant variant. Deliberate — a per-function rule needs a parser and
       would be wrong the first time somebody moved a call between functions —
       but it means the rule asks for tolerance in places that do not need it.
     - **The `'use server'` boundary is read from the first 400 bytes.** A
       module declaring the directive lower down is treated as render-reachable,
       which is the safe direction.
     - **It says nothing about the other phases Next refuses in** (`'use cache'`,
       `unstable_cache`, `generateStaticParams`). Those rethrow from both
       variants and `tests/clinic-site/next-cache-contract.test.ts` pins it.

  **THE DEFECT CLASS IS WORTH MORE THAN EITHER ENTRY, and it generalises past
  clinic-site caching: *an invalidator reachable from a render truncates the
  function it sits in*.** The reason it survived review-by-test is the sharpest
  instance this rulebook has of §2d's central claim —
  `chrome-writers-invalidate.test.ts` asserted the paying direction by
  **grepping `billing.ts` for the invalidator's NAME**, which was present, and
  threw. A source-text assertion cannot see the PHASE a call runs in. Carry it
  as: **a guard that asserts a call EXISTS has asserted nothing about whether it
  RUNS.** The replacement drives the real `revalidate()` through Next's own
  async-local stores and feeds the actual error object to our catch — that is
  the shape to copy whenever the property is about execution rather than text.

  **THE SWEEP OF 2026-09-22T13:2xZ, boundary `2026-09-22T10:26:51+00:00`** (the
  previous intake's own timestamp, carried with its explicit offset). Pass one
  returned #642 and #647. **Pass two returned those plus #645, #650 and the four
  DREAMCRM-89 commits — #649, #651, #652, #653.** That is **six out of six
  non-empty sweeps** where the path-scoped pass found strictly less than the
  unscoped one; the path list has still never once been sufficient on a sweep
  that had anything to find. Branch protection and the merge settings were read
  in the same sweep and had **NOT drifted**: `contexts: ["test", "e2e"]`,
  `strict: true`, `enforce_admins: true`, force-pushes and deletions off,
  `allow_auto_merge` / `allow_merge_commit` / `allow_rebase_merge` /
  `delete_branch_on_merge` on — all as §2a states them. Recorded because a sweep
  that reports only drift leaves "nobody checked" and "checked, nothing moved"
  looking identical. **The third pass flipped five STATE lines** (#648, #642,
  #645, #647, #650) and turned up the #648 duplicate-mention defect noted at its
  own entry.

  **THE FOUR DREAMCRM-89 COMMITS, graded so the next sweep does not
  re-litigate them.** #652 and #653 are `docs/RELEASE.md` ledger reconciles.
  **#649 (`deliver()` gets a deadline) is NOT a gate change** and was correctly
  unlabelled: `tests/email/deliver-deadline.test.ts` is a bounded behavioural
  test against mocked transports — no tree walk, no `palette.ts` import, no
  derived page list, no `tests/guards/` path. It fires none of the three
  derivations and should not. **#651 IS an intake, it was labelled, its author
  classified it correctly, and it is a CASE and not a rule**:
  `tests/guards/read-only-role-revokes.test.ts` gains `notifications.dedupe_key`
  as a named BENIGN exemption with its reason, beside `campaigns.automation_key`
  — the identical class, a deterministic dedupe key rather than a credential.
  No new assertion class, no widened pattern, no new field of view. It also
  carries migration 0164 and the Stripe webhook, so it earned §3's review by the
  ordinary path and has it: **APPROVE WITH NOTES**, recorded on the PR.

  **AND #651 IS THE FIRST FALSE ALARM OF A SHAPE NOBODY HAD NAMED — a CASE-ONLY
  intake has no section to name, and `carriesIntake` demands one.** Its author
  wrote a record, on one line, in the documented place: *"Forge intake: adds a
  CASE to an existing rule, not a rule — …"*. It carries `INTAKE_MARKER` and it
  carries **no** `SECTION_REF`, so tomorrow's sweep reads it as unrecorded and
  goes red — #651 merged 11:21:47Z, inside `INTAKE_SWEPT_SINCE`
  (`2026-09-22T08:00:00Z`). **The author did exactly what the gate summary in
  front of them asked**: that text says, of a case, *"say that instead and move
  on"*, and only the adds-or-loosens branch is followed by the mirroring
  command. Two halves of one instrument disagreeing — the #644 shape again, one
  notch worse, because this time both halves shipped in the same week and the
  blind-spot list in `review-sweep.mjs` names a hard-wrapped record as the one
  false alarm it knowingly accepts. It accepts a second one.

  **THE FIX IS THE INSTRUCTION, NOT THE MATCHER, and §2 is committing to that
  here so nobody reaches for the other one.** `review-sweep.mjs`'s standing rule
  is that the answer to a blinding hazard is a scoped exclusion and never a
  stingier pattern; the answer to a false ALARM must not be a looser one either,
  because the marker-plus-section pair is the entire reason an out-of-repo
  routing is followable from the PR. **So: a case-only intake still names a
  section — the one the EXISTING rule lives in.** That is not a fiction to
  satisfy a regex; it is where a reader goes to find out what the rule this case
  joins actually says. The shape:

  ```bash
  gh pr comment <n> --body "Forge intake: <section> — adds a CASE to <rule>, no new class. <link>"
  ```

  Routed for #651 on that shape at this intake, naming §2c, where the
  `tests/guards/**` machinery rules live. **The open half is the gate's own
  text**, which still sends a case-only author away without the command —
  `renderIntakeSection` in `scripts/review-gate.mjs`. That is a product-code
  change on a `check-definitions` file, so it needs an issue, an author and a
  Sentinel review; **Forge does not write it, and the standing note until it
  lands is that every case-only intake in this repo is a red sweep waiting to
  happen.** Quinn owns the sweep.

  **DREAMCRM-88 (PR #655, open 2026-09-22, Vesper) is the thirty-seventh, and
  it is the WIDEST CATCHMENT any guard on this list has arrived with.**
  `tests/a11y/one-string-pairs.test.ts` — rule 7 in `tests/a11y/class-pairs.ts`.
  **STATE: MERGED — `0211cb72`, 2026-09-22 14:41:37Z, Sentinel APPROVE** (who
  re-ran all three of its load-bearing claims rather than reading them).
  A **NEW CLASS** of assertion, not a case: rule 1 grades an
  ink/surface pair only when exactly one half carries the `dark:` override and
  every participating utility is opaque, and rule 7 grades the entire remainder.

  **What changes for everyone else, which is the intake test.** Writing an ink
  and a surface in the same `className` and not measuring the pair fails `test`
  by name. That is the ordinary way a chip, a badge or a button gets styled, so
  it is a wider catchment than any existing contrast rule — wider than rule 2's
  two brand steps, rule 5's registry subjects or rule 6's no-`bg-` chunks. It
  holds at **zero with no ceiling and no exemption list**, and it introduces
  **no new NUMBER**: the floor is still AA out of `tests/a11y/palette.ts`. The
  shape, the three gaps it closes and the partition are in §2b under *rule 7,
  the one-string pair*.

  **Registered by hand in `scripts/review-gate.mjs` with the reason stated
  rather than guessed**, as `INTAKE_RULES`' own `why` asks — and both
  derivations catch the file independently when the registration is removed, so
  the hand entry is the REASON rather than the mechanism. Note the second-order
  cost §2 named on #654 and #655 pays again: editing `scripts/review-gate.mjs`
  puts the registrar's own PR on the `check-definitions` review area. #655 is on
  the gate twice over — auth surfaces and `check-definitions` — and Sentinel was
  requested for both.

  **One EXPORT CHANGED SHAPE, and it is the part worth copying.** Rule 1's
  grading condition is now exported as `isParitySubject` and READ by rule 7
  rather than re-spelled in it, so the two partition one population by
  construction: a future edit to rule 1's scope moves both rules together and
  cannot open a gap under either. Verified against the diff rather than the PR's
  sentence about it (#647's lesson) — `gradeClasses` now calls the predicate and
  the old inline condition plus the separate alpha bail are gone, and the
  refactor is behaviour-preserving for rule 1: same two tests, same order.
  The disjointness is asserted over the real tree, not over planted strings.

  **PR #656 (batch 69, stacked on #655) is a CASE-ONLY intake and is recorded
  as one** — **MERGED `4e127f5e`, 2026-09-22 14:50:48Z, APPROVE WITH NOTES** — on the shape §2 committed to above: it names §2b, where rule 6 —
  the existing rule — lives. It adds **no assertion**: its only touch to
  `tests/a11y/class-pairs.ts` is rule 6's module header, replacing the stale
  "about 194" residual with what the sweep found. **But note the population
  effect a case-only label does not carry:** converting 115 bare
  `text-gray-400` into the two-sided `text-gray-500 dark:text-gray-400` moves
  all 115 sites INTO rule 6's field of view. No rule changed; a lot of tree
  moved under one. That distinction — *the rule is the same, the subject set is
  not* — is worth having a phrase for the next time it arrives, because the
  label cannot see it and neither can the three derivations.

  **THE SWEEP OF 2026-09-22T14:0xZ, boundary `2026-09-22T13:20:00+00:00`** (the
  previous intake's own timestamp, carried with its explicit offset).
  **Pass one returned NOTHING. Pass two returned `34ed75e7` (#654).** That is
  **seven out of seven non-empty sweeps** where the path-scoped pass found
  strictly less than the unscoped one; the path list has still never once been
  sufficient on a sweep that had anything to find. Branch protection and the
  merge settings were read in the same sweep and had **NOT drifted**:
  `contexts: ["test", "e2e"]`, `strict: true`, `enforce_admins: true`,
  force-pushes and deletions off, `required_pull_request_reviews` still null,
  `allow_auto_merge` / `allow_merge_commit` / `allow_squash_merge` /
  `allow_rebase_merge` / `allow_update_branch` / `delete_branch_on_merge` on —
  all as §2a states them. Recorded because a sweep that reports only drift
  leaves "nobody checked" and "checked, nothing moved" looking identical. **The
  third pass flipped one STATE line** (#654) and opened two new ones (#655,
  #656), which is the promise-ledger working as intended rather than growing.

  **DREAMCRM-88 (PR #657, open 2026-09-22, Vesper) is the thirty-eighth, and it
  is a SHAPE THIS LIST HAD NOT CARRIED: a WIDENING, not a new rule and not a
  case.** `tests/a11y/class-pairs.ts`, `tests/a11y/dimmed-text.test.ts` and
  `tests/a11y/one-string-pairs.test.ts` are all ALREADY on
  `blocking-assertions`; **no assertion, threshold or number changes**, and the
  floor is still AA out of `palette.ts`. **STATE: MERGED — `88332a9a`,
  2026-09-22 15:36:41Z, Sentinel APPROVE with two non-blocking notes**, both of
  which #658 answered the same day.

  **A WIDENING IS NOT A NEW RULE, AND IT IS NOT NOTHING EITHER — which is why
  it needs a name here.** What changed is the FIELD OF VIEW of every registered
  rule that reads a class string: `quotedChunks`, the one reader all seven
  contrast rules and the dimmed-text rule sit on, could not see a template
  literal whose interpolation carried a quote. Both halves of the intake
  question therefore answer differently from usual:

  - **What fails `test` by name today that did not yesterday?** Nothing new was
    found — the newly visible chunks were measured against every rule before
    landing and returned zero findings. That is what lets it ship in one batch
    instead of a burn-down.
  - **What fails tomorrow that would not have?** Every rule on the list now
    grades a wider tree, so **a future rule built on `quotedChunks` inherits a
    scope wider than the one the existing rules were written against.** A
    widening's cost is deferred, which is precisely why it needs an entry: the
    PR that spends it will look innocent.

  **The three derivations cannot see this shape, and that is the generalisable
  part.** All three ask *does this FILE belong on the list* — a tree walk
  naming a product root, a palette-fact import, a derived page list. Every file
  here was already on it. **A change that alters what a registered rule can SEE
  fires none of them**, exactly as a case-only change does, and the two need
  opposite handling: a case is smaller than a rule, a widening is potentially
  larger. The label came from the author, not the machinery — which is §2
  working as designed, and also a reminder that the derivations are a floor and
  never a ceiling.

  **The single-homing is the durable half.** `dimmed-text.test.ts` had its own
  COPY of the reader and so its own copy of the hole. The copy is gone. *These
  two guards read the same unit* is now true by construction rather than by
  comment, which is the same property `isParitySubject` bought rules 1 and 7 one
  PR earlier — the second time in two days that this repo removed a
  re-spelling instead of adding a cross-reference. Take it as the pattern.

  **Forge re-ran the lock rather than reading it, and the headline claim holds:
  of 78,489 plain-quoted chunks the old reader produced, ZERO carrying a colour
  utility are lost.** Three results went to §2b in full: the assertion is
  additive over the TREE rather than by construction (a constructible
  counterexample exists and the tree simply has no instance of it), a
  MULTI-LINE template's static text is still invisible because the reader is
  per-line (10 lines carry a colour utility no chunk contains, one a rule 7
  subject that passes), and — the transferable one — **an additive lock proves
  you did not go backwards and can never measure what neither instrument
  sees**, because it compares the new reader against the old one. §2d carries
  that as a rule.

  **One number did not reproduce, and it is flagged rather than corrected**
  because the instrument, not the reader of it, should settle it. The PR reports
  **10,021 newly visible chunks (+11%)**; re-running both readers over
  `UI_ROOTS` gives **5,248 (+6.0%)** against an old-reader total of 87,556 —
  within 96 of the PR's 87,460, which is suspiciously exactly the number of old
  chunks the new reader legitimately stops producing. The direction, the
  defect and the zero-findings conclusion all reproduce; only the headline does
  not. **Third instance this issue of §2b's *a number in a header is prose*, and
  the fix is the same one: derive it from the instrument and quote what the
  instrument returns.**

  **THE SWEEP OF 2026-09-22T15:1xZ, boundary `2026-09-22T14:00:00+00:00`** (the
  previous intake's own timestamp, carried with its explicit offset). **Pass one
  returned NOTHING. Pass two returned `0211cb72` (#655) and `4e127f5e`
  (#656)** — both already graded here while open, so the sweep found no
  ungraded drift and the third pass did the work. That is **eight out of eight
  non-empty sweeps** where the path-scoped pass found strictly less; the path
  list has still never once been sufficient on a sweep that had anything to
  find, and this run is the cleanest demonstration yet — two commits that
  change what can merge, neither touching a single path on the list. Branch
  protection and the merge settings were read in the same sweep and had **NOT
  drifted**: `contexts: ["test", "e2e"]`, `strict: true`, `enforce_admins:
  true`, force-pushes and deletions off, `required_pull_request_reviews` still
  null, `allow_auto_merge` / `allow_merge_commit` / `allow_squash_merge` /
  `allow_rebase_merge` / `allow_update_branch` / `delete_branch_on_merge` on.
  **The third pass flipped two STATE lines** (#655, #656) and opened one (#657).

  **DREAMCRM-88 (PR #658, batch 71, Vesper) is the thirty-ninth, and it is the
  first entry here whose whole subject is a guard's CLAIM rather than a guard's
  reach.** `tests/a11y/class-pairs.ts` and `tests/a11y/one-string-pairs.test.ts`.
  **STATE: MERGED — `acc32c1f`, 2026-09-22 15:51:00Z**, test-and-docs only, no
  Sentinel review owed (`review-gate.mjs` classified it merge-on-green) — and it
  answers the two non-blocking notes from #657's APPROVE.

  **Nothing new fails `test` by name, and the entry still earns its place,
  because one of the two fixes changed what the guard EXERCISES on CI.** The
  lock's dual-rendering loop read `raw.endsWith('\r') ? [raw, raw.slice(0, -1)]
  : [raw]` — both line endings on a CRLF checkout, exactly ONE on an LF one. Its
  header said *both line endings on every platform*. So the assertion was whole
  on a Windows contributor's box and half on the runner that actually gates the
  merge, which is the worst way round: **the platform the claim was false on is
  the platform the gate runs on.** It normalises first and grades
  `[lf, lf + '\r']` unconditionally now. Forge re-ran the mutation rather than
  reading it: reverting the chop still reddens the lock, naming
  `components/dropdown-help.tsx: bg-gray-200`.

  **The generalisable half is the shape, not the fix.** A guard whose coverage
  is a function of what the CHECKOUT happens to hold is a guard whose coverage
  nobody can state — and it reads green either way, so no run tells you which
  half you got. That is the same species as §2d's staged-file blindness and the
  same species as #657's own header defect one level down: **three times in two
  days this repo has found a guard describing a reach it did not have.** The
  check that finds it is always the same one and it is cheap: read the guard's
  sentence, then read the code, and ask whether the sentence is true on CI
  rather than here.

  **A second mechanism claim was wrong in the same PR.** The termination test
  used `not.toThrow()`, which catches non-termination only by hitting the 20 s
  `testTimeout` — so a hang would have failed it as a TIMEOUT while the test's
  name said it was about exceptions. `toEqual([])` proves the same property and
  describes it. Worth copying: **a test that would fail for the right reason by
  the wrong mechanism is a test whose red run will send the next reader to the
  wrong place.**

  **And it opened a numbered OPEN NOW rather than leaving a docblock aside**,
  which is the process half. The reader is still per LINE, so a MULTI-LINE
  template literal's static text is invisible on every one of its lines — 25
  colour-bearing lines, 23 real, 0 findings, with `welcome-interview.tsx:579` a
  rule 7 subject sitting ungraded for a purely syntactic reason. Closing it
  means scanning per FILE, which also deletes the boundary both of batch 70's
  bugs lived on: a field-of-view change that wants its own measurement, red run
  and review. **Parking a known residual in a module header is how it stops
  being work** — the header is read by whoever is already editing that file,
  which is exactly the person who does not need telling.

  **PR #659 (the living stage on a 32-inch monitor, Vesper) is the fortieth, and
  it is the first one here where a REGISTERED file grew an assertion of a kind
  its registration reason does not describe.** `tests/marketing/cinema-fx.test.ts`
  and `tests/marketing/cinematic-spine.test.tsx`. **STATE: MERGED — `12fc04e4`,
  2026-09-22 17:54:01Z**, merge-on-green (marketing UI, design-system
  conformant), intake only.

  **What fails `test` by name today that did not yesterday.** Three things, all
  at zero and all without an exemption list:

  - **Every anchor a cursor path or a burst names must be rendered by that
    scene, and every registered anchor must be used by something.** The
    assertion renders `CinemaStage` through `renderToStaticMarkup` and greps the
    markup for `data-anchor="<name>"`, both directions. Forge watched it fail
    rather than reading it: deleting `data-anchor="approve"` from
    `cinema-scenes.tsx` reddens it with *scene 2 must render
    data-anchor="approve"*, naming the scene and the element.
  - **`frameZoom` is bounded at both ends** — 1 at and below the 1440x900 design
    size, `min(width/1440, height/900)` above it, capped at 1.8, so an ultrawide
    is not a taller scene.
  - **`fxScale` is bounded at 0.8 and 1.9**, with the particle radius asserted
    to actually grow with it.

  **The registration was already correct and its stated REASON is now
  incomplete, which is the part to carry.** `INTAKE_RULES` carries this file
  with a `why` about grading `MOTE_ALPHA_MAX` against the palette — "a
  palette-grading assertion that walks no tree, the exact #598 shape". True when
  written; the file now also holds a RENDER-AND-GREP contract between two
  exported registries and a component's markup, which walks no tree either but
  is not a palette fact. **A registration reason is a claim with a date on it.**
  Nothing broke here — the file was on the list and the label fired — but the
  `why` is what a future reader uses to decide whether a NEW file of this shape
  belongs, and a stale `why` under-describes the population. Left as-is
  deliberately: editing `scripts/review-gate.mjs` to widen a comment would put
  the edit on the `check-definitions` review area, which is a disproportionate
  price for a prose fix. Recorded here instead, and it is the right place.

  **BOTH OF THESE MERGED WITH `needs-forge-intake` UNSATISFIED, AND THAT IS THE
  FINDING THAT OUTLIVES EITHER PR.** The label fired correctly on both. Neither
  author routed it. #658 sat 2h20m and #659 about 20 minutes before the meeting
  sweep found them — and the only reason the wait was minutes rather than days
  is that a planning meeting happened to open. **The label is doing its job and
  the hop after it is not owned by anything that runs.** §2 already records one
  PR merging with the label unsatisfied; this is the second and third, so it is
  a pattern and not an incident. The gate cannot block on it (`test` and `e2e`
  are the only required contexts and adding a third is a branch-protection
  change), so the realistic fix is the post-merge sweep: `review-sweep.mjs`
  already grades `needs-forge-intake` the way it grades `needs-sentinel-review`,
  which means **the sweep is red right now and was the intended alarm** — what
  is missing is that nothing wakes Forge when it goes red. That is a concrete
  proposal, not a rule: it belongs to Quinn, who owns the sweep.

  **THE SWEEP OF 2026-09-22T18:0xZ, boundary `2026-09-22T10:16:30+00:00`** (the
  previous intake's own timestamp, carried with its explicit offset). **Pass one
  returned ONE commit — `71f4037e` (#647), already graded. Pass two returned
  FIFTEEN**, including both ungraded intakes above and every #655-#658 commit.
  That is **nine out of nine non-empty sweeps** where the path-scoped pass found
  strictly less than the unscoped one, and the widest margin yet: 1 against 15.
  Neither #658 nor #659 touches a single path on the list. Branch protection and
  the merge settings were read in the same sweep and had **NOT drifted**:
  `contexts: ["test", "e2e"]`, `strict: true`, `enforce_admins: true`,
  force-pushes and deletions off, `required_pull_request_reviews` still null.
  **The third pass flipped one STATE line** (#657) and opened none that are not
  closed in the same entry — the first sweep in this run of four where the
  promise ledger did not grow.

  **PR #660 (DREAMCRM-101, the launch post quotes the plan config) is the
  forty-first, and it is the SECOND WIDENING this list has carried** — a FIELD OF
  VIEW change with no new assertion, no new threshold and no new number.
  `tests/marketing/pricing-price-source.test.tsx` gained
  `lib/services/marketing-blog.ts` as the eleventh entry in
  `PRICE_QUOTING_ROUTES`, so that product file can fail `test` by name today and
  could not yesterday. **STATE: MERGED — `53c8bd23`, 2026-09-22 18:58:05Z**,
  merge-on-green, intake only.

  **What fails `test` by name today that did not yesterday.** Nothing new in
  KIND; one more file inside assertions that already existed — the price scan
  over `PRICE_QUOTING_ROUTES` (§2c has what it looks for) now also reads
  `lib/services/marketing-blog.ts`, whose `LAUNCH_POSTS` bodies seed `/blog`. The
  defect it was widened for is worth carrying because **neither assertion could
  have found it**: the launch post opened *"for $150–500 a month"*, the
  pre-collapse three-tier range, and the drift was a RANGE — `$150` is nobody's
  price and the `500` carries no dollar sign. A human writing a ledger entry
  found it. The widening protects the corrected copy going FORWARD and nothing
  behind it, and the guard's own header says so, which is where that belongs. The
  new file `tests/marketing/launch-post-price.test.ts` is five ordinary behaviour
  tests over an exported `correctLaunchPostBody` — it walks no tree and grades no
  palette, so it is not a new class.

  **IT CARRIED NO LABEL AT ALL, AND THAT IS THE FINDING.** This is not the
  #658/#659 shape, where the label fired and nobody acted on it. Here
  `review-gate.mjs` matched nothing: Forge ran `gateFindings` and
  `intakeFindings` over #660's three-file list and **both returned EMPTY**, and
  the merged PR carries zero labels. `tests/marketing/pricing-price-source.test.tsx`
  is on neither `GATE_RULES` nor `INTAKE_RULES`, so editing the list that decides
  what a required check LOOKS AT is, today, an unlabelled edit. None of the three
  intake derivations can fire on it either — it walks no tree, grades no palette
  and derives no page list; all three ask whether a FILE belongs, and a widening
  moves no file onto any list they read. That is the same blind spot the
  thirty-eighth entry named, with the label removed. The backstop was the
  unscoped sweep pass read by hand, which is exactly what that pass is for.

  **The registration gap is worth naming apart from the intake.** A guard whose
  field of view is a hand-kept list is the §2c / §2d defect this rulebook keeps
  writing up, and DREAMCRM-102 (Quinn) is the agreed fix — point 3 of the
  invariant in §2c says *delete* `PRICE_QUOTING_ROUTES`, not extend it. #660
  extended it once more while that fix is pending. That is no criticism of #660,
  which corrected live copy under bias-to-action; it is recorded so §2c's census
  is read against eleven listed paths rather than ten, and so the count the
  DREAMCRM-102 implementation deletes is the right one.

  **DREAMCRM-97 (PR #663, open 2026-09-22, Rio) is the forty-second, and it is a
  GATE-AREA widening rather than a guard one.** `GATE_RULES`' `money` rule gained
  `app/(default)/settings/actions.ts` — where a clinic buys, cancels, swaps and
  adds to the plan it pays us for — pinned in `MUST_BE_GATED` as `money` in the
  same PR. **STATE: MERGED — `a5166156`, 2026-09-22 20:29:05Z**, eighteen files, `test`
  and `e2e` green; it was `needs-sentinel-review` and `needs-forge-intake` on
  the PR with Sentinel requested on the issue the same day, and was routed by
  its author before the merge.** The rule itself is written up in §3
  beside the #559 and #599 widenings; what belongs here is HOW it arrived — routed
  by its author, before the merge, with what it is NOT stated rather than assumed,
  and with the boundary argued (the file rather than the tree) instead of taken.
  A PATTERN, not an area: the count stays **nine**, `rulebook-drift.test.ts`
  stayed green and `scripts/rulebook-drift.mjs` needed no edit, correctly. Forge
  owns the flip of that STATE line at the next sweep.

  **It adds no new class of blocking assertion.** Four new test files
  (`tests/settings/billing-action-result.test.ts`,
  `tests/settings/trial-ended-wall.test.tsx`,
  `tests/integrations/sync-direction-strand-warning.test.ts`,
  `tests/integrations/sync-direction-warning-ui.test.tsx`), all behaviour tests
  scoped to the surfaces they name, none of which scans a tree — plus one case
  added to `tests/guards/review-gate.test.ts`'s `MUST_BE_GATED` table. That case
  is a CASE on an existing rule, which per the DREAMCRM-94 note above has no NEW
  section to name and does not owe one.

  **THE SWEEP OF 2026-09-22T19:0xZ, boundary `2026-09-22T17:00:00+00:00`** — an
  hour behind the previous intake's own 18:0x timestamp on purpose, to re-read
  #659 rather than trust the handover, and carried with its explicit offset
  either way. **Pass one returned ZERO. Pass two returned THREE** — `53c8bd23`
  (#660), `12fc04e4` (#659, already graded) and `af59967e` (#659's pre-squash
  source commit). The one ungraded commit in the window was reachable only from
  the unscoped pass: #660 touches no path on the scoped list and carried no
  label. That makes it **ten out of ten non-empty sweeps** where the path-scoped
  pass found strictly less than the unscoped one, and the first where the scoped
  pass found NOTHING while the unscoped pass found a real intake — the clearest
  case yet for running both. Branch protection and the merge settings were read
  in the same sweep and had **NOT drifted**: `contexts: ["test", "e2e"]`,
  `strict: true`, `enforce_admins: true`, force-pushes and deletions off,
  `required_pull_request_reviews` still null; squash, merge-commit and rebase all
  on, `allow_auto_merge` on, `allow_update_branch` on, `delete_branch_on_merge`
  on. The third pass flipped no STATE line and opened one — #663's, owned above.

  **DREAMCRM-98 (PR #669, open 2026-09-22, Vesper) is the forty-third, and it is
  the THIRD WIDENING on this list in a single day** — after #660's
  `PRICE_QUOTING_ROUTES` and #663's `GATE_RULES` `money` area. The EYES of the
  seed-ownership guard, `ROW_ID` in `tests/guards/e2e-seed-scopes.test.ts`, gain
  twelve row-id prefixes. **STATE: MERGED — `5a8544cd`,
  2026-09-22 20:55:57Z**, both labels carried, Sentinel APPROVE WITH NOTES on
  DREAMCRM-98, `test` and `e2e` green on the merge commit. Flipped by Forge at
  the 21:2x sweep; the label was never satisfied from the author's side, and the
  sweep is what closed it.

  **#675 (`66aa7645`, merged 2026-09-22 21:05:37Z) is a CASE on this entry, not
  a new one** — Sentinel's two after-merge notes on #669, plus the undercount
  above. Note 2: `prospecting_config` is upserted at the literal id `'default'`,
  and the disjointness guard keys on the `<prefix>_e2e_<name>` row shape, so a
  platform-global singleton is INVISIBLE to it — the row has no owner and the
  guard reports that as fine. **It goes QUIET, not red, and the prefix list
  cannot grow into a fix**, because the next scope needing a singleton has the
  same hole; widening the guard to see id-literals on singleton tables is a
  separate PR and is the real answer. Safe today and written into all three
  places a reader might stand (scope header, guard docblock, `docs/E2E.md`).
  Note 3: two fixture rows a restore could not restore — `seedPartner`'s `"user"`
  insert was `do nothing` and its `referral_partner` upsert omitted `name`, the
  field `partner-portal.spec.ts` asserts on — **demonstrated against a throwaway
  Postgres rather than asserted**, tamper-then-restore shown failing before and
  passing after, which is §2d's standard met on a fixture rather than on a
  predicate. And the docblock undercount above was corrected to a TABLE of all
  twelve prefixes against their tables, so the next reader counts nothing.

  **#675 also lands a `docs/RELEASE.md` Part 5 entry that belongs to §2a, not
  here, and it is the sharpest thing in this batch.** `findA11yViolations`
  (`e2e/axe.ts`) destructures `violations` and discards the rest — and axe
  reports text over a GRADIENT as `incomplete`, never as a violation. **So every
  axe stop in the suite is silent about that whole class**, all 58 of them,
  including the nine this PR just added. The reachable case today is `.dg-glow`
  on `/g`, where `#78849c` composites to 3.87:1 at the teal peak; it does not
  bite because no INK_3 node falls inside the gradient's reach, and the entry
  carries the geometry so the next person moving a label into that hero knows
  the stop will not tell them. `e2e/axe.ts` is on `check-definitions`, so the
  fix is a reviewed change — which is why this is a ledger entry and not a
  comment beside the code, correctly. **Written down as a defect rather than
  fixed quietly is the right call; a ceiling of zero over a blind spot is a
  ceiling of zero over less than you think.**

  **Its author's classification is right, and it is not the whole answer.**
  Vesper classified the prefixes as a CASE of the existing ownership rule rather
  than a new class — the guard grades exactly what it graded yesterday, over
  rows it previously could not see — and that matches the #577 `bp` ruling above
  exactly. **That settles the NEW-CLASS question and it does not settle whether
  this list owes an entry.** Since #660 those are two questions: a field-of-view
  change with no new assertion, no new threshold and no new number still changes
  what fails `test` by name, and still gets written down. So the rule to take
  from this entry is **say CASE and route it anyway.** "A case, so the rulebook
  needs no entry" was the right call about a new RULE and the wrong one about
  this list, and #669 is the first PR whose author has had to answer both
  questions at once. Nobody had written down that they came apart; it is written
  down now.

  **What fails `test` by name today that did not yesterday.** Nothing new in
  KIND. Twelve row-id families inside `scripts/e2e-seed.mjs` — a file already
  wholly inside the guard's view — are now graded for scope ownership and
  previously were not: `prv bpr plan rev wl wlo pros pmtg pgrd mevt mcap rpart`.
  Seed a row under any of those prefixes without declaring it in `SCOPE_ROWS`
  and the guard goes red; before this PR it went QUIET, which is the exact
  failure mode its own docblock was written for.

  **THE COUNT IS TWELVE. THE PR COMMENT AND THE DOCBLOCK BOTH SAY ELEVEN.**
  `mcap` — the marketing-capture row the `/e` conference page reads, seeded at
  `mcap_e2e_tokenpages` — is missing from both hand-written lists. The regex
  itself is right: measured on both trees, ten alternatives before and
  twenty-two after. This is §2d's guard-whose-PREDICATE-is-right-and-whose-
  SENTENCE-is-wrong family, and per that section the fix is the SENTENCE — one
  word in the docblock, `Eleven` to `Twelve`. No mutation could have found it,
  and neither could a green run. Handed to Vesper at this intake to land before
  the merge; it does not gate the review.

  **Two new seed prefixes are deliberately NOT registered, correctly.**
  `in_e2e_partner_N` (a Stripe invoice reference carried on a commission row)
  and `tr_e2e_not_a_real_transfer` (a Stripe transfer id on the payout row) are
  Stripe object ids rather than rows this repo owns — the same species as
  `acct`, `cs` and `pi`, unregistered since the list existed. Checked against
  the seed line by line rather than assumed, because "a prefix in the seed that
  is not in `ROW_ID`" is otherwise indistinguishable from the defect the
  docblock warns about.

  **The hand-kept field of view is the finding worth carrying past this PR.**
  `ROW_ID` is a hand-written alternation, and its docblock states its own
  failure mode: a table seeded under a prefix nobody added is a row with no
  owner that the guard reports as fine. That is the §2c / §2d defect this
  rulebook keeps writing up — the same shape as `PRICE_QUOTING_ROUTES` one PR
  earlier, and the same shape DREAMCRM-102 exists to delete. **Twelve in one PR
  is the evidence that the list cannot keep pace with the schema**: every
  addition before this one arrived alone. This is no criticism of #669, whose
  author added every prefix the seed needs and said so; it is recorded so that
  the next widening of this list is read as the argument for deriving the
  prefixes from the tables `SCOPE_ROWS` already names, rather than as the fourth
  widening. A guard whose eyes are a list is a guard that fails silent by
  default.

  **The new axe stops are cases, and there are NINE of them, not ten.** Counted
  the way §2a asks — `expectNoA11yViolations` call sites on both trees — the
  product stop population goes **49 → 58**: eight in `e2e/token-landings.spec.ts`
  (`/b /i /r /w /g /d /e /h`) and ONE in `e2e/partner-portal.spec.ts`, which
  scans the open door only; its closed-door test asserts the redirect and never
  scans. The PR comment says ten. Nine is still the largest batch since the nine
  marketing stops of #626-#629, and it closes the last two uncovered
  populations named in §2a — the single-letter landings and the fourth persona
  signed in. Every one holds a ceiling of ZERO with no exclusion:
  `e2e/axe-baseline.ts` is untouched and still `{}`,
  `e2e/axe-baseline-raises.ts` is untouched, and the written opt-out was not
  needed.

  **Rule 3 stays silent, and that was VERIFIED rather than reasoned.** Forge ran
  `gateFindings` and `intakeFindings` over #669's seven-file list: gate returns
  `token-surfaces` for `app/g/[token]/report-view.tsx` alone, intake returns
  `tests/guards/e2e-seed-scopes.test.ts` alone. Both new specs TYPE their stops
  — eight literal route prefixes and two `/partner` — so the derived-page-list
  predicate has nothing to expand, which is the correct answer rather than a
  gap. `e2e/axe.ts` and `playwright.config.ts` are untouched, so no existing
  stop is re-graded. **And unlike the last three intakes, this one will be
  visible to the path-scoped sweep pass**: #669 carries `docs/E2E.md` and two
  files under `e2e/`, both on pass one's path list.

  **PR #662 (DREAMCRM-98, Vesper, merged 2026-09-22 `28fdcb42`) does nothing to
  the gate**, and is recorded only so the sweep window closes over it with a
  stated verdict rather than silence. Three files — the deal-room struck price
  swapped from an `aria-label` on a bare `<span>` to the `sr-only` text-node
  shape the marketing half has used since #620, a `docs/RELEASE.md` ledger split
  per §1, and one behaviour test scoped to the component it names. `gateFindings`
  and `intakeFindings` both return EMPTY over its file list, correctly, and the
  merged PR carries no labels. No new class, no new case, no widening.

  **THE SWEEP OF 2026-09-22T19:50Z, boundary `2026-09-22T18:00:00+00:00`** — an
  hour behind the previous intake's 19:0x run on purpose, to re-read #660 rather
  than trust the handover, and carried with its explicit offset. **Pass one
  returned ZERO. Pass two returned TWO** — `28fdcb42` (#662) and `53c8bd23`
  (#660, already graded). That is **eleven out of eleven non-empty sweeps** where
  the path-scoped pass found strictly less than the unscoped one, and the second
  in a row where pass one found nothing at all. Branch protection and the merge
  settings were read in the same sweep and had **NOT drifted**:
  `contexts: ["test", "e2e"]`, `strict: true`, `enforce_admins: true`,
  force-pushes and deletions off, `required_pull_request_reviews` still null;
  squash, merge-commit and rebase all on, `allow_auto_merge` on,
  `allow_update_branch` on, `delete_branch_on_merge` on. The third pass flipped
  no STATE line — #663 is still open — and opened one, #669's, owned above.

  **RESTORED AFTER A CONCURRENT CLOBBER, 2026-09-22T20:3xZ, and the incident is
  written into this list rather than only fixed, because it is the first known
  case of the rulebook LOSING a registered entry.** The entry below — #665's,
  written at 19:54Z — and the sweep record that came with it were both present
  in the skill store and then absent. Two Forge runs were in intake at once;
  the second read this file before the first had written to it, edited its own
  stale copy, and pushed the whole file back. Nothing rejected the write,
  nothing flagged it, and from the agent side the loss was invisible: the entry
  did not become wrong, it stopped existing. It was recovered from the losing
  run's own pre-edit copy and is reproduced verbatim below, with two corrections
  of fact — its ordinal (#669 now holds forty-third) and #665's head commit,
  which has moved to `d7137de2`.

  **What this costs and what it changes.** `references/2-merge-gate.md` is a
  137KB single file that every intake appends to and every writer rewrites
  whole. There is no compare-and-swap on `multica skill files upsert` and no
  per-section addressing, so last-write-wins is the contract and a lost entry is
  the expected failure, not a freak one. **The standing rule until that changes:
  re-fetch every reference file immediately before the write, diff it against
  the copy you edited, and rebase if it moved** — the check that caught this one.
  A length comparison would not have: the file got SHORTER by 541 characters
  while gaining 4,000 of new text, which is what a clobber looks like from the
  outside and is not distinguishable from a normal edit by size alone. This
  belongs to the same family as the byte-level round-trip check on skill writes:
  **the rulebook is the one document in this program with no guard on it, and
  the re-fetch IS its guard.**

  **DREAMCRM-102 (PR #665, open 2026-09-22, Quinn) is the forty-fourth, and it is
  the THIRD WIDENING this list has carried — and the first that is a widening
  AND a new class at once, which is the order to read it in.**
  `tests/marketing/pricing-price-source.test.tsx` decided what it looked at from
  `PRICE_QUOTING_ROUTES`, a hand-written list of eleven file paths (ten until
  #660 added the eleventh the same day). **The list is deleted.**
  `tests/marketing/plan-price-literals.ts` derives the field of view from
  `git ls-files` over `app`, `components` and `lib` — bare roots rather than a
  `SCAN_DIRS` list, so a new top-level division is graded the day it is created
  — which is **1,342 tracked `.ts`/`.tsx` files**, a figure Forge counted
  independently at both the PR head and `main`. **STATE: MERGED —
  `c8a0f094`, 2026-09-22 20:46:28Z, Sentinel APPROVE WITH NOTES** (reviewed at
  head `47d4d847`; the entry carried `d7137de2` after the 20:3x re-read, and the
  five notes were answered in #676 below rather than before the merge, which the
  verdict permitted). `pnpm test` 8,450 passed / 794 files, `typecheck`, `build`
  and `lint` clean at the merge. **The file count moved 1,342 → 1,345 between
  the PR head and `main` and the guard needed no edit for it**, which is the
  derived field of view doing exactly the thing a list could not.

  **The reclassification is why it is on the list at all, and it comes first.** A
  rule grading three product roots grades everyone's diff — the same reason
  `legibility-floor`, `retired-tones` and `type-floor` are registered. A named
  list of ten paths was correctly off it, and the #610 ruling gave that guard a
  rulebook section anyway; a tree walk is a different animal. Both files are
  entered on `blocking-assertions` with the class named in the entry rather than
  left for a reader to infer. Forge ran the gate over the PR's eight-file list:
  `intakeFindings` returns `["blocking-assertions"]`, `gateFindings` returns
  `check-definitions` (`scripts/review-gate.mjs`) and `token-surfaces`
  (`app/g/[token]/report-view.tsx`). **Unlike #660, which carried no label at
  all, this one fired both — and was routed by its author before the merge,
  which is the eleventh entry's shape and the one worth copying.**

  **What fails `test` by name once it lands.** Typing the plan's price anywhere
  under those three roots — in a `.tsx` text node, a `.ts` content registry, a
  metadata description or a JSON-LD field — fails by file, line and spelling.
  **Two of the three spellings are new IN KIND**, and this is the part a
  field-of-view label cannot see: beside the `$`-prefixed literal the check has
  always graded, it now grades a bare CADENCE (`200/mo`, `200 a month`,
  `2,000 per year`) and an ASSIGNMENT to a price-shaped name
  (`const LIST_MONTHLY = 500`). Neither carries a dollar sign; neither has ever
  been graded by `test`. The assignment is the one that matters:
  `lib/recall-roi.ts` held `PLAN_PRICE_MONTHLY = 200` and DIVIDED by it, so a
  reprice would not have made `/roi` stale — it would have made the break-even
  arithmetic the page is built around wrong. **A price that is an input to a
  calculation never carries a dollar sign.** That is the transferable part, not a
  fact about one file.

  **The subject is derived as well as the eyes.** The four values come from
  `getQuotedPlan()` at run time, never from a copy in the test, so a reprice
  moves what the guard looks for instead of retiring it on the day it is needed
  most — point 1 of the invariant in §2c, satisfied structurally.

  **The market BAND is what made the widening possible, and it is the piece to
  copy.** `/compare` says a booking vendor charges `$200–350/mo`, and that `200`
  is not our `200`. `isBand` discriminates a RANGE structurally — two numbers
  joined by a dash, read off the raw offsets on either side of the match —
  rather than by which file the number sits in. That is what let `/compare` come
  INSIDE the field of view instead of staying a file-shaped hole, and it is why a
  competitor added next month needs nobody to update anything. The reasoned
  allowlist is therefore only four per-MATCH entries, each anchored to a
  substring that must still be on its line and each carrying the sentence that
  makes its number not-a-plan-price; `partition()` reports a DEAD allowance, so
  an entry that has stopped pardoning anything fails rather than riding along —
  the #587/#594 dead-exclusion family in its fifth pointing.

  **Its measured non-coverage is in the registration entry itself**, not only in
  the module docblock, and every item was MEASURED returning nothing rather than
  reasoned about: a number assembled at runtime (`2 * 100`) or written in words;
  a number that reaches a reader from the DATABASE or an env var, since blog
  bodies are rows and this grades source; a cadence spelled some way the
  alternation does not list ("200 monthly", "200 each month"), whose remedy is to
  widen the alternation and **never** to answer it with a file entry; and
  `docs/**`, `scripts/**`, `e2e/**`, `tests/**`, because a price in a doc is
  stale prose and a price on a page is a lie to a customer.

  **It carries 28 live literal fixes with it**, behaviour-preserving —
  `app/(marketing)/page.tsx` (7), `lib/marketing/comparisons.ts` (10),
  `lib/prospect-product-knowledge.ts` (10), `app/g/[token]/report-view.tsx` (1)
  — which is §2c's census confirmed on the branch rather than taken on faith.
  Assertion 1, the half that catches a surface resolving the number through
  arithmetic, was extended to the homepage plus follows-the-config assertions on
  the two content registries: §2c said widening the eyes changes assertion 2 only
  and that what assertion 1 should now cover is a DECISION, and this is that
  decision taken and argued rather than defaulted. §2d was answered in full —
  four red runs against real defects in real shapes (dollar, cadence, assignment,
  plus an innocent band that stayed silent), the guard staged first because a
  `git ls-files`-derived guard is blind to a file you have not staged, and four
  mutations of the guard itself including `isBand` in both directions.

  **#676 (`6709e799`, merged 2026-09-22 21:15:04Z) is a CASE on this rule, not a
  new class, and its author said so rather than letting the label guess** — the
  #651 case-only precedent, applied correctly. `tests/marketing/plan-price-literals.ts`
  was already registered by the entry above; `scripts/review-gate.mjs` is not in
  the diff and `gateFindings()` returns `[]`, so no §3 review was owed and none
  was taken. No new assertion class, no change to the field of view. What it
  changes is what the SAME rule matches, in three ways, all from Sentinel's
  APPROVE WITH NOTES on #665:

  - **One NARROWING, and it is the important one.** `nameIsPricey` matches a
    WORD now, splitting the identifier on the camel/snake boundary, because the
    first version was a bare substring alternation: `fee` matched inside
    `FEED_PAST_DAYS` and `showPrivateFeedback`, `rate` inside `generate`,
    `separate` and `iterate`. None held a plan number, so nothing was red — but
    the day one of them landed on 200, `test` would have gone red naming an
    innocent file. **That is the rule-3 false-positive cost paid for real**, and
    the remedy taken was the one this section demands: narrow the PREDICATE,
    never register the file. `monthly` survives, which `LIST_MONTHLY = 500`
    needs.
  - **Two WIDENINGS.** The assignment spelling crosses a JSX brace, so
    `price={200}` is no longer invisible (nothing live in the tree — a widening,
    not a repair), while a numeric object key `{ 200: '…' }` is still refused.
    And a band's far end must now look like MONEY rather than like any digit at
    all, because `$200 — 7 days free` had been reading as a range and going
    SILENT — the quiet direction, which is what earns a fix rather than a note.

  **The bigger half of that third change was found by re-measuring, not by the
  review**, and it is the part worth copying: `\s*` crosses a NEWLINE, so a band
  match ran from the end of one line to a list item at the start of the next and
  `the rate is $200\n- 7 day trial` was pardoned too. Both patterns use a
  horizontal-space class now. **A reviewer's note pointed at an em dash and the
  author pulled a newline out of it** — read a note as a specimen of a class, not
  as the bug.

  **And the note that was not in the review at all.** `BAND_BEFORE` /
  `BAND_AFTER` are assembled from `String.raw` fragments now, and the first
  draft of that assembly used a PLAIN template literal, where `\$` becomes `$`
  and `\d` becomes the letter `d`. A silently-broken regex pardons nothing and
  reports a clean tree — the same false green as the defect the guard exists to
  catch. §2d names that family; three assertions pin it. **Any guard that
  assembles a pattern from strings owes those assertions**, and this is the
  second time in this rulebook that a copied-for-comparison pattern arrived
  broken.

  **Measured on `main` at `6709e799`, re-run independently by Forge** rather than
  read off the PR — the extractor imported straight out of the tree, not
  paraphrased: **1,345 files graded, 0 offenders, 0 dead allowances**, and the
  band skip pardons **8 sites**, every one read one by one and every one a
  competitor or tool-stack band (the prospect-drawer fallback, three `/compare`
  rows and lede, three in `prospect-product-knowledge.ts`, one in
  `marketing-blog.ts`). Eight rather than Sentinel's nine because #676 fixed one
  of them; the skip stayed load-bearing through the tightening rather than going
  vacuous, which is the question a narrowing owes an answer to.

  **ONE LATENT FALSE POSITIVE SURVIVED THE NARROWING, and it is in the pattern
  that note 3 introduced** (Forge, at this intake, reproduced rather than
  reasoned). The far-end test is `(?:\$\d|\d{3})` — a `$` followed by a digit, or
  three CONSECUTIVE digits. A comma-thousands far end satisfies neither, because
  `\d{3}` cannot cross the comma in `2,000`. So a competitor band written with
  our price on the LOW end and a thousands number on the high end is GRADED
  rather than pardoned: `$200-2,000/mo` and `$500-1,500/mo` both come back as
  offenders, naming an innocent line. Nothing is red today — `$800-2,000/mo` is
  live three times in `lib/prospect-product-knowledge.ts` and once in
  `lib/services/marketing-blog.ts`, and it survives only because its LOW end
  (800) is not a plan price and its `2,000` is pardoned from the other direction
  by `BAND_BEFORE`, whose `\$\d[\d,]*` *does* tolerate a comma. **The two
  directions disagree about what a price looks like**, and that asymmetry is the
  defect. The module's own docblock offers `$800-2,000` as an example of the
  three-digit branch; it is not one, which makes this §2d's predicate-right-
  sentence-wrong family AND a real narrowing gap at the same time. The fix is one
  character class on the far end, not an allowlist entry. Handed to Quinn with
  the reproduction.

  **THE SWEEP OF 2026-09-22T20:0xZ (recovered with the entry above), boundary `2026-09-22T17:00:00+00:00`** — the
  previous intake's boundary re-used rather than advanced, so #659 and #660 are
  re-read rather than trusted, and carried with its explicit offset either way.
  **Pass one returned ZERO. Pass two returned FOUR**: `28fdcb42` (#662),
  `53c8bd23` (#660), `12fc04e4` and `af59967e` (#659). Only `28fdcb42` was
  ungraded, and it was reachable from the unscoped pass alone. That is **eleven
  out of eleven non-empty sweeps** where the path-scoped pass found strictly less
  than the unscoped one, and the second running where the scoped pass found
  NOTHING while the unscoped pass found the only new commit in the window.
  **#662 (DREAMCRM-98, the deal room's struck price names itself with a text
  node) adds nothing to the gate and gets no numbered entry**, and that is
  recorded rather than left silent because a sweep that finds a commit and says
  nothing about it is indistinguishable from a sweep that missed it: three files,
  of which one is `docs/RELEASE.md` and one is an existing behaviour test
  (`tests/prospecting/deal-room-quote.test.tsx`) gaining assertions that the
  struck list price is named by a visually-hidden text node rather than an
  `aria-label` on a `role=generic` span. It walks no tree, grades no palette and
  derives no page list; it is a CASE on an existing test, which per the
  DREAMCRM-94 note above has no new section to name and does not owe one. Branch
  protection and the merge settings were read in the same sweep and had **NOT
  drifted**: `contexts: ["test", "e2e"]`, `strict: true`, `enforce_admins: true`,
  force-pushes and deletions off, `required_pull_request_reviews` still absent;
  squash, merge-commit and rebase all on, `allow_auto_merge` on,
  `allow_update_branch` on, `delete_branch_on_merge` on. The third pass flipped
  no STATE line — #663's is still OPEN — and opened one, #665's, owned above.

  **DREAMCRM-99 (PRs #661, #664, #666, #671, open 2026-09-22, Quinn) is the
  forty-fifth through forty-eighth, and it is the first time four entries
  arrive from one issue with FOUR DIFFERENT new classes** — git's resolved
  attributes, a workflow's own window arithmetic, a cron parser, and a decision
  about spending money. They are numbered separately because each fails `test`
  by name for a different reason; read them as four, not as a batch.

  **The forty-fifth: #661, `tests/guards/line-endings.test.ts` plus a new
  `.gitattributes`. The first guard in this repo whose SUBJECT is git's own
  resolved attributes rather than anything a file contains.** Every other
  tree-walking guard here reads bytes off disk; this one reads the `attr/`
  column of `git ls-files --eol` per tracked file — git's answer after every
  rule in every `.gitattributes` in the tree has been applied in order. That is
  why it does not pattern-match the root `.gitattributes`: a later override (a
  second attributes file in a subdirectory, `*.md -text`, an `eol=crlf` on some
  subtree) changes the resolved column and would not change a regex over the
  root file's text. **What fails `test` by name once it lands:** deleting
  `eol=lf` and leaving bare `text=auto` (red, naming every file that resolves no
  eol rule — and that half-fix is the exact defect, since `text=auto` normalises
  on check-IN and leaves the check-OUT to `core.autocrlf`); any subtree that
  resolves `eol=crlf`; a CRLF or mixed blob actually committed; a binary
  extension that resolves an eol rule, which would rewrite a `0x0d` inside an
  image. **The `w/` working-tree column is deliberately NOT graded**, and the
  reason generalises past this guard: checking `.gitattributes` out does not
  rewrite files already on disk, `git status` stays clean, and a guard that is
  red for a reason the reader cannot act on is a guard that gets ignored.
  **The repo-wide fact it lands with, measured rather than assumed:** the index
  was ALREADY 100% LF — 2,577 tracked files at `i/lf`, 150 binary, 58 with no
  line ending, ZERO at `i/crlf`. The committed bytes were never wrong. The
  WORKING TREE was: 276,016 CRLF lines against 1,342 bare LF on a Windows
  checkout, because Git for Windows ships `core.autocrlf=true` in its system
  config and nothing in the repository said otherwise. **So there is no
  renormalization commit to time against in-flight PRs** — `git add
  --renormalize .` against the new file produces an EMPTY diff — and no merge in
  the queue can conflict with one. **The transferable part is why this belongs
  in a rulebook at all:** a large share of `tests/guards/**` and
  `tests/design-system/**` reads files off disk and grades the bytes, so every
  one of them saw different bytes on a Windows author's machine than on the
  runner that gates the merge. A stray carriage return is a non-word character,
  it ends a line early, and it lands inside a captured group. On #657 two
  independently built tree-wide audits — Vesper's and Sentinel's — shared one
  blind spot for exactly this reason, which is not a coincidence between two
  authors but the environment both were standing in. **An existing Windows tree
  does not refresh itself**; `.gitattributes` carries the incantation and this
  document does not restate it.
  **STATE: MERGED — `c29c195b`, 2026-09-22 20:11:01Z**, no Sentinel review
  required (no path in the diff is a gated area) and none given; `test` and
  `e2e` green on the head. **It was reported to this intake as already merged
  while it was still OPEN and BLOCKED with neither required check reported**,
  and it merged nineteen minutes later once they did. Recorded because the
  correction cost one sentence at intake and would have cost a wrong STATE line
  in this document otherwise: **an author's "merged" is a claim about intent,
  and this list reads `mergedAt` off the API instead.**

  **The forty-sixth: #664, `tests/guards/error-scan.test.ts`. The first thing in
  `tests/guards/**` to assert anything about what a WORKFLOW'S OWN CADENCE
  implies** — window arithmetic, graded as a SEQUENCE rather than on one window.
  The load-bearing assertion is that consecutive windows TILE the timeline: run
  N's window ends exactly where run N+1's begins, no gap and no overlap, driven
  with the measured cadence (117, 239, 412 minutes) rather than the declared
  one. Both directions are asserted together on purpose, because a one-sided
  version passes on a scan that double-counts AND on one that drops. **What
  fails `test` by name once it lands:** re-hardcoding a constant lookback (the
  old `35` is pinned as a `not.toBe`); getting either end of the window wrong;
  dropping `--status success` from the anchor lookup, which the script's own
  `conclusion` re-filter pins a second time and the test drives with a history
  whose NEWEST run failed; an over-grouping dedupe that hides a second error
  behind the first; and the ringer block, which runs the script as a process
  because pure functions can be perfect while `main()` never calls them (#593).
  **The defect it closes is §2a's third face of "a check that cannot fail is not
  a check", and the numbers belong in the entry rather than only in the PR:**
  `error-scan.yml` declared `*/30`, scanned a fixed 35 minutes, and carried a
  comment promising the extra five meant nothing could fall between two runs.
  Measured over the last 40 scheduled fires: **median gap 239 minutes, min 117,
  max 412** — about 15% of production wall-clock scanned, and "No errors in the
  window" said about the other 85%, in the same words, on the same green tick.
  The window is now the half-open interval from the previous completed scan's
  `createdAt` to this run's `createdAt`, contiguous by construction; **the cron
  stays `*/30`, which is now honest — it is not a claim about how often this
  runs, it is the most frequent thing GitHub will accept, and nothing downstream
  depends on it being honoured.** **The one place it does not fail closed is
  argued rather than defaulted, and the argument generalises:** a capped,
  truncated or failed-lookup window is a HOLE, the summary leads with it, and
  the run still exits 0 — because exit 1 there is self-defeating, since a red
  run is not a successful one, so the next run anchors further back, caps again,
  and reddens too. That is §2a's six-red-mornings lesson applied before the fact
  rather than after. `error-scan.yml` gains `actions: read` and no write scope;
  no `pull_request` trigger, no `needs:`, no required context.
  **STATE: MERGED — `1b34d257` (#664), 2026-09-22 21:38:38Z.** Flipped at the
  2026-09-22T23:5xZ sweep, not by the author: the entry said OPEN for two hours
  after the merge, which is the defect that sweep is written up for below.
  **Two blocking findings came back on it and both are recorded here because
  they generalise past this PR.** First: a run that could not assume the
  read-only role was still closing a window it never scanned — `--status
  success` means "the job exited 0", and this job exits 0 when it SKIPS. The
  answer now asks the run's own STEPS (`didScan` grades the jobs payload for the
  scan step concluding `success` rather than `skipped`, walking back up to 20
  candidates newest-first), with `--status success` demoted to a cheap
  pre-filter. **That is §2d's "assert the ANSWER, not a proxy for it" caught
  inside a guard written to enforce it**, and the step name is pinned against
  the workflow file because it is a string matched against an API — a rename on
  one side only would make every run read as not-scanned, which is safe and
  silently widens every window forever. Second: a failed CloudWatch query for
  one log group read as a quiet log group, because `|| true` swallowed it; the
  group now lands in `FAILED` rather than `SCANNED`, stderr is captured, and it
  prints as a named hole beside `truncated`. **The general form worth carrying:
  any `|| true` that protects a loop from one bad iteration converts a failure
  into a zero, and a zero is an answer.**

  **The forty-seventh: #666, `tests/guards/schedule-heartbeat.test.ts`. The first
  thing here to grade a CRON PARSER, and the first whose field of view is the
  set of scheduled workflows derived from the tree.** Its cross-check against
  `WORKFLOW_CENSUS` in `scripts/rulebook-drift.mjs` is the part that changes
  what fails `test` by name for everyone: **a new scheduled workflow with no
  census entry now goes red.** The census edit that rides with it is a CENSUS
  ENTRY, not a rule change — it puts the new file on `check-definitions` as well
  as `ci-workflows`, and without it the drift check goes red the day after the
  merge. **The parser detail worth carrying past this guard:** standard cron ORs
  the two day fields when both are restricted, and getting that backwards
  under-reports fires and therefore OVERSTATES every interval — the direction
  that makes a liveness check blind. `0 9 * * 1-5` is daily with a 72-hour hole
  across the weekend. **The window is generous on purpose**, measured the same
  day: five daily jobs nominally at 06:17–08:20 UTC fired at 11:34–13:26, five
  to five and a half hours late, on an ordinary day. This asks "has it stopped",
  not "did it run on time"; a tighter window reports GitHub's queue as a defect
  and the alarm is muted inside a fortnight. **A `workflow_dispatch` run is not
  evidence** — somebody pressing the button is the one signal a liveness check
  must never accept, and it is pinned on the workflow's own `gh` call. **It
  fails closed and goes RED**, unlike #664 and unlike `review-sweep.yml`, and
  the discriminator is stated rather than assumed: there is no queue behind the
  red here, every finding is binary and single-action, so §2a's
  permanently-red-alarm argument does not apply and exit 0 would make this job
  the thing it was built to detect. Six scheduled workflows today, all six
  verified alive in a live dry run against the real repo.
  **STATE: MERGED — `82f365fd`, 2026-09-22 20:20:09Z, Sentinel APPROVE.**
  §2a's forward note has been replaced by the live eleventh census entry and
  both workflow counts moved from ten to eleven in the same pass.
  **One correction belongs on this entry rather than only in §2a, because it
  was Forge's error and it was an error about the very mechanism this hop
  exists for.** The intake record on #666 said the merge would turn `test` red
  until §2a's count moved. It did not and could not: `rulebook-drift` grades
  `WORKFLOW_CENSUS` in `scripts/rulebook-drift.mjs` against the tree, Quinn
  shipped that entry in the same PR, and `test` stayed green. **The skill lives
  outside the repo, so no test can fail when the repo drifts from it** — that
  file's own docblock says exactly this, and calls itself a tripwire strung
  between the two rather than a check on either. So the prose count went stale
  silently, which is precisely the failure the wrong claim was describing.
  **Nothing grades this document. The same-day intake hop is the only thing that
  keeps it true, and a mechanism wrongly believed to exist is worse than a known
  absence, because it retires the habit that was actually doing the work.**
  **A live defect found at intake, fail-closed, owned by Quinn as its own small
  PR:** the workflow's shell loop globs `.github/workflows/*.yml` while
  `declaredSchedules` accepts a pattern that also admits a `.yaml` extension, so
  a `.yaml` workflow carrying a cron would be derived by the script, find no run
  entry, and be graded `never-fired`. Verified on `main`; no `.yaml` workflow
  exists today, so nothing is mis-graded yet. The reason it is written down
  rather than left to the fix is its shape: **a fail-closed bug that misnames
  its own cause** sends the reader to the 60-day-quiet-repository re-enable
  banner over a file extension, and no guard can catch it because both halves
  are correct in isolation.

  **The forty-eighth: #671, new blocks in `tests/guards/review-sweep.test.ts`.
  Two shapes this directory has not held before — a guard over a DECISION ABOUT
  SPENDING MONEY, and a credential-leak scan over a workflow file's non-comment
  lines.** A wake enqueues a PAID agent run, so `wakeDecision` is scoped HARDER
  than the exit status, and each narrowing is written against rather than noted:
  the intake half only (the review half already has an owner in DREAMCRM-93, and
  two owners for one queue is none); fresh entries only (a standing entry is
  printed every morning by design, and waking for it every morning is the paid
  version of the permanently-red alarm); and never on an undated window. **That
  last one is the deliberate divergence from failing closed, and the asymmetry
  is the argument to carry off this PR:** failing closed is FREE for a run's
  colour and EXPENSIVE for a dispatch, so the run still goes red while the wake
  is suppressed — and the suppression must be ANNOUNCED, because a wake that
  silently never fires is indistinguishable from a quiet week, which is the
  failure class the whole file is about. Both directions are asserted: it must
  not wake, AND it must say so; and it must say NOTHING on a clean sweep, since
  an error annotation every morning on a green run is the false alarm that gets
  the channel muted.
  **The risk this entry exists to keep visible, and it is the one to read
  first.** To let the wake run after a RED sweep — the only kind of run that has
  anything to wake anybody for — the grading step is now
  `continue-on-error: true`, and the job's real verdict is restored by a final
  step keyed on `steps.sweep.outcome == 'failure'`. **Delete that restore and
  this alarm reports green every morning while finding everything.** That is the
  `process.exitCode = 0` mutation the ringer block refuses at the script level,
  moved into YAML where no test of the script can see it. Both halves are pinned
  by the guard — the `continue-on-error` line and the `steps.sweep.outcome`
  step — and the general rule is worth stating once: **an alarm whose own colour
  is conditional needs the condition pinned in the same check, or the guard is
  grading the half that did not move.**
  **The leak scan is a mutation finding, not caution.** The first draft checked
  only the `curl` invocation, so moving the leak one line down into the success
  notice annotation left it green; it now reads EVERY non-comment line of the
  workflow for an `echo` or `printf` that expands the secret. It grades the
  EXPANSION, not the name — printing that `FORGE_INTAKE_WAKE_URL` is not set in
  a summary is the correct thing to do; printing the variable's value is the
  credential itself.
  **STATE: MERGED — `94a36ba0` (#671), 2026-09-22 22:06:23Z**, plus three
  follow-ups on the same wire: `9b18c91b` (#677) 22:35:45Z, `667a8ea2` (#678)
  23:09:19Z, `c1ca93c0` (#679) 23:28:02Z. All four flipped at the
  2026-09-22T23:5xZ sweep. `review-sweep.yml` gains no new scope at all.

  **#677 INVERTED A CONTRACT THIS ENTRY STATED, and the inverted one is the rule
  now: AN UNSET `FORGE_INTAKE_WAKE_URL` FAILS THE WAKE STEP.** It does not skip
  green. `error-scan.yml`'s "not configured yet is not a failure" contract is
  about a job going red every half hour before anyone has set the thing up; here
  the step's conclusion is ALSO the wake's anchor, so a wake that was due and did
  not happen may not leave the anchor looking like a wake that did. The branch is
  only reachable when a wake is DUE, which already reddens the sweep, so it costs
  no extra red. **The generalisable half is the naming**: the guard was called
  `an unset secret is SKIPPED, not a failure` — the opposite of what the code
  did — and two prose sentences beside it said the job stays green, which is
  false of GitHub Actions for any step exiting non-zero without
  `continue-on-error`. A guard's NAME is read far more often than its body; a
  name that contradicts its assertion is a false claim with a green tick on it.

  **WHAT THE WAKE SECRET IS WORTH, now written beside the step that uses it
  (#678) rather than in a review thread.** Three facts anyone deciding how
  carefully to treat that URL needs: (1) **an Actions secret is not secret from
  anyone with repo write** — they cannot read it off the settings page, but
  they can add a workflow that uses it, and a workflow does what it likes with
  what it is handed, so "who can push here" IS the list of people who hold this
  URL; (2) **the blast radius is one verb** — the autopilot runs in
  `create_issue` mode assigned to Forge, so a holder can open issues assigned to
  Forge and nothing else; no read of anything, nothing on the deploy path. But
  `--mode` also takes `run_only`, which is NOT narrower — it dispatches the
  same paid run and leaves no issue behind, so a holder could spend Forge's runs
  with nothing on the board recording it. `create_issue` is kept for the audit
  trail, not for lack of a choice; (3) **the mitigation is rotation, not
  secrecy** — `multica autopilot trigger-rotate-url <autopilot-id>
  <trigger-id>` (two positionals; discover both via `autopilot list` then
  `trigger-list`, and do not write the ids down, they drift), and prove the new
  URL live with a `ping: true` dispatch from a feature branch. The trigger
  reports `provider: generic`, `has_signing_secret: false`, and neither
  `trigger-add` nor `trigger-update` exposes a flag to set one — so there is
  no reachable way to make the URL insufficient on its own, which is why rotation
  is the only true answer available rather than a resignation.

  **The reusable lesson #678 paid for: prose with no guard over it is not free.**
  Two of its own claims were false on first write (a rotate command missing a
  positional — in a runbook line whose reader has just been told a credential
  leaked — and `create_issue` described as "the floor" when `run_only` exists),
  and a word-match could not have caught either. A person checking every claim
  against the live CLI did. Budget review for prose that tells someone what to
  run, at the same rate as code.

  **THE PORTAL-BILLING FLAKE IS MEASURED NOW, AND THE 2026-09-15 DIAGNOSIS WAS
  WRONG** (#677 then #679, `e2e/portal-billing.spec.ts`, comment-only). Second
  occurrence on #671's run; same strict-mode violation on two elements; green on
  a plain re-run at the same SHA. It cannot be "two unpaid balances":
  `PayBalanceForm` renders in exactly one place, not in a `.map`, and the
  `aria-label` occurs once in the whole product tree — so two in the DOM is two
  copies of ONE render. The original inference ("the retry sees it too, therefore
  state, not timing") does not follow, because Playwright's retry replays the
  same navigation against the same warm server. **And it is transient, which is
  measured rather than argued**: both attempts died in 525ms and 738ms against a
  30s `toBeVisible`, and a strict-mode violation does not retry. Against
  `page.setContent` with Playwright 1.62.1 — no app, no database, re-runnable
  in a minute — two matching inputs from the start throws in 24ms, ONE input
  genuinely late by 3s PASSES after 3392ms (the control: the locator does wait),
  and two inputs with the duplicate removed after 2s throws in 4ms. That third
  row is this flake. **Two rules come out of it.** First, `.first()` is the WRONG
  fix and would be actively harmful — two live payment forms on a patient's
  billing page is a money-surface defect, and `.first()` retires the only
  instrument reporting it. A locator narrowed to make a suite green must be
  argued against the defect it would hide. Second, **a deferral that is measured
  beats a deferral that is assumed**: the blocker is specifically Postgres
  (`initdb` not on PATH, no `/usr/lib/postgresql`, Docker unavailable), and
  Chromium being present is exactly how the timing above got measured anyway.
  **Two blocking findings came back, and the first is the one this entry was
  written to keep visible — now sharpened by having actually failed.** The guard
  pinning the `continue-on-error` / restore pair **could not see the mutation it
  is named after**: it matched over the whole file, so renaming the step id
  satisfied it. The `exit 1` is now graded inside the restore step's own block
  through a `stepBlock()` reader, and the id is READ OUT of the `if:` expression
  and required to name a step that is the `continue-on-error` one — so a
  consistent rename passes, a half-rename is red, and pointing the restore at a
  step that cannot fail is red. **The lesson is the widening, not the pin: a
  guard over a YAML file that reads the whole file is reading prose too, and the
  scope that makes it honest is the step's own block.**
  Second: **the wake fired every morning until somebody routed the queue**,
  because it shared the exit status's green anchor while an unrouted entry stays
  unrouted. The wake now has its OWN anchor — a second `gh run list` with no
  `--status` filter, excluding this run by `databaseId` — and a guard asserts
  there are exactly two lookups fed DIFFERENT files, because passing
  `last-green.json` to both is the one-token edit that restores the old
  behaviour. **The finding Quinn found while fixing it is the better one and is
  why this bullet is here:** every wake test drove `wakeDecision` directly, so
  re-pointing the anchor inside `main()` passed all 77. A process-level test now
  drives the script with a history the two anchors disagree about. **A pure
  function graded only through its own exports is a guard on a function, not on
  a program** — #593's "the ringer must ring" in its second pointing, and the
  first time it has bitten a guard that already HAD a ringer block.

  **THE REPO-SETTINGS CHANGE RIDING WITH #671, WITH NO PR OF ITS OWN — and it
  is the first entry on this list that is a CREDENTIAL.** Two things exist
  outside every diff above and get the same treatment as any other repo-policy
  change, which is what §2's closing paragraph means by "a rule that lives only
  on the GitHub settings page has reached nobody":

  1. **A GitHub Actions secret, `FORGE_INTAKE_WAKE_URL`, created 2026-09-22
     19:23:26Z.** Verified by Forge at intake: it is the repository's ONLY
     secret, and it was the first — there were zero before it.
     `ADMIN_READ_SECRET` and `RULEBOOK_PROTECTION_TOKEN` are referenced by
     workflow files and have never been set, which is its own thing to know and
     is why "a workflow names a secret" is not evidence the secret exists.
     **The token is in the URL PATH, so the URL IS the credential** — there is
     no separate token to redact, and GitHub's own secret masking is the only
     thing standing between it and a public run log. That is the reason the leak
     scan above grades the whole file rather than one command.
  2. **A Multica autopilot, "Forge intake wake", `create_issue` mode, assigned
     to Forge, one webhook trigger.** Verified live at intake (autopilot
     `ee260d2a`, active). **The measured fact to write down before anyone
     designs against it: the autopilot run's `trigger_payload` came back
     `null`, so the POST body does NOT reach the woken agent.** What arrives is
     an issue whose prompt is the AUTOPILOT'S OWN DESCRIPTION. Nobody may later
     move information a reader needs into the payload; it lands nowhere. The
     wire was verified end to end before the review request — a `--ping`
     dispatch on #671's branch returned HTTP 200 and produced DREAMCRM-103
     assigned to Forge — and the ping input exists precisely because the healthy
     state of this wire is SILENCE, which is the state it was built to make
     impossible elsewhere: nothing else can tell a quiet week from a rotated
     token.

  **Neither is branch protection, and that is checked rather than asserted.**
  Read at intake: `contexts: ["test", "e2e"]`, `strict: true`,
  `enforce_admins: true`, force-pushes and deletions off,
  `required_pull_request_reviews` absent, `required_linear_history: false` —
  **NOT drifted.** A secret is not a required check and cannot change who may
  merge; an autopilot is not a repo setting at all. Both are **intake only, no
  Sentinel request in their own right** — they came bundled into #671's review
  request, which is correct and is the shape to copy, not a reason to skip the
  classification.

  **THE SWEEP OF 2026-09-22T20:2xZ, boundary `2026-09-22T17:00:00+00:00`** — the
  previous intake's boundary re-used a second time rather than advanced, so
  #659, #660 and #662 are re-read rather than trusted, and carried with its
  explicit offset either way. **Pass one returned ZERO. Pass two returned
  FIVE**: `86ff3ad4` (#670), `28fdcb42` (#662), `53c8bd23` (#660), `12fc04e4`
  and `af59967e` (#659). Only `86ff3ad4` was ungraded, and it was reachable from
  the unscoped pass alone. **The running tally of "pass one found strictly less than pass
  two" is deliberately not incremented here**, because the clobber above means
  two sweeps this hour were both recorded as the eleventh and one of them was
  briefly gone: the count is no longer trustworthy to a unit, and a number
  nobody can reconstruct is worse than none. What IS true and is the claim worth
  keeping: **the path-scoped pass has now found NOTHING on four consecutive
  non-empty sweeps while the unscoped pass found the only new commit each time.**
  That is no longer an argument for running both passes — it is the observation
  that the scoped pass has stopped contributing anything on its own and survives
  as a cheap cross-check on the unscoped one. **#670 (DREAMCRM-101, the launch post's dead
  price is a SHAPE not a spelling) adds nothing to the gate and gets no numbered
  entry**, recorded rather than left silent because a sweep that finds a commit
  and says nothing about it is indistinguishable from a sweep that missed it: it
  is a CASE on the price-literal rule #665 registered — a spelling the
  alternation did not list — which per the DREAMCRM-94 note above has no new
  section to name and does not owe one, and which is the remedy that rule's own
  registration entry named in advance (widen the alternation, never answer it
  with a file entry). **The four DREAMCRM-99 PRs above were routed from the
  author's own intake request rather than found by this sweep**, which is the
  eleventh entry's shape and the one worth copying; the sweep confirmed only
  that nothing else had landed. Branch protection and the merge settings were
  read in the same sweep and had **NOT drifted** (values above); squash,
  merge-commit and rebase all on, `allow_auto_merge` on, `allow_update_branch`
  on, `delete_branch_on_merge` on. The third pass flipped no STATE line — #663's, #665's
  and #669's are all still OPEN — and opened four, #661's, #664's, #666's and
  #671's, owned above.

  **THE SWEEP OF 2026-09-22T20:4xZ, boundary `2026-09-22T19:30:00+00:00`** —
  advanced past the 17:00 boundary the previous two sweeps re-used, and carried
  with its explicit offset. **Pass one returned ONE — `82f365fd` (#666) — which
  is the first time in thirteen sweeps the path-scoped pass has returned
  anything at all.** Pass two returned SEVEN: `8ab321dc` (#672), `a5166156`
  (#663), `82f365fd` (#666), `c29c195b` (#661), `b91b125f` (#667), `86ff3ad4`
  (#670, already graded) and `28fdcb42` (#662, already graded).

  **The scoped pass finally firing is the moment to state precisely what it is
  worth, because the honest reading cuts against it.** It caught #666 — which
  was already routed by its author, already registered above, and already
  carried `needs-forge-intake`. In the same window it MISSED `c29c195b` (#661),
  a merge that lands a brand-new tree-wide guard, a repo-wide normalisation rule
  and the first check in this repo over git's own resolved attributes, because
  `.gitattributes` and `tests/guards/**` are not on the path list. **So on the
  one sweep where pass one worked, it found the commit nobody needed it to find
  and missed the one that changed the most.** That is the argument in its
  sharpest form yet: the path list is a proxy for "does this change the gate",
  and the proxy is not the answer — §2d's own rule, pointed at the sweep that
  enforces §2d. Pass one stays because it costs two seconds, not because it
  covers anything pass two does not.

  **Three verdicts on commits that get no numbered entry**, recorded rather than
  left silent because a sweep that finds a commit and says nothing about it is
  indistinguishable from a sweep that missed it:

  - **`8ab321dc` (#672)** — `docs/RELEASE.md` alone, two lines: the two
    DREAMCRM-97 ledger entries reconciled to one. That is §1's one-defect-per-
    entry rule being applied, not changed. Nothing to the gate.
  - **`b91b125f` (#667, DREAMCRM-101)** — `scripts/mobile-weight.mjs` (612
    lines) plus `docs/MOBILE-WEIGHT.md`, `docs/LOAD-SANITY.md` and a
    `docs/RELEASE.md` entry. A measurement tool, **not a guard**: verified at
    intake that nothing references it — no workflow, no `package.json` script,
    no test imports it. It cannot fail `test` by name because nothing runs it.
    **It is worth one sentence anyway, as a thing to watch rather than a rule:**
    a 612-line measurement script with no caller is one PR away from becoming a
    ceiling, and the day somebody wires it into `test` it arrives as a new
    class with a threshold nobody has argued. Whoever does that owes this list
    an entry and §2d a watched fail; wiring an existing script into a required
    check is exactly the shape the path-scoped sweep pass cannot see.
  - **`28fdcb42` (#662)** and **`86ff3ad4` (#670)** were graded at the previous
    two sweeps and are unchanged.

  Branch protection and the merge settings were read in the same sweep and had
  **NOT drifted**: `contexts: ["test", "e2e"]`, `strict: true`,
  `enforce_admins: true`, force-pushes and deletions off,
  `required_pull_request_reviews` absent, `required_linear_history: false`;
  squash, merge-commit and rebase all on, `allow_auto_merge` on,
  `allow_update_branch` on, `delete_branch_on_merge` on. `FORGE_INTAKE_WAKE_URL`
  is still the repository's only secret. **The third pass flipped three STATE
  lines** — #661's, #666's and #663's, all to MERGED — **and opened none.**

  **THE SWEEP OF 2026-09-22T21:2xZ, boundary `2026-09-22T17:00:00+00:00`** —
  deliberately BACK to the 17:00 boundary the 20:4x sweep had advanced past,
  because two Forge runs have now been writing into this file in the same hour
  and one of them recorded a clobber; a boundary that re-reads a known-graded
  window is how you find out whether the other run's verdicts are still here.
  **Pass one returned THREE** — `66aa7645` (#675), `5a8544cd` (#669), `82f365fd`
  (#666) — **and pass two returned FOURTEEN**, of which only `c8a0f094` (#665),
  `5a8544cd` (#669), `66aa7645` (#675) and `6709e799` (#676) were ungraded. Two
  of those four are reachable from pass one, so this is the second consecutive
  sweep in which the path-scoped pass contributed something. It is still not an
  argument for it: the two it found were the two already routed by their authors,
  and the two it MISSED (#665 and #676) are the plan-price guard merging and then
  changing what it matches — the widest-reaching rule registered this week,
  touching no path on the list either time.

  **All four ungraded commits are written up above rather than here**: #669 and
  #665 as STATE flips on their existing entries, #675 and #676 as CASES on those
  same entries. No new ordinal was taken, which is the correct outcome and worth
  saying out loud — **four merges, three of them carrying `needs-forge-intake`,
  and the list grew by nothing.** A case is not a smaller entry; it is a
  different question, and the DREAMCRM-94 note above is what keeps them apart.

  **The label was unsatisfied on three of the four, and only ONE was routed to
  Forge by its author.** Quinn routed #676 the same day, naming the call (CASE,
  not class) rather than leaving the label to guess — the eleventh entry's shape.
  #669 and #675 merged carrying `needs-forge-intake` with nothing routed from
  either; the sweep is what closed them, which is what the sweep is for and not a
  criticism of an author mid-batch. #665's own label was satisfied at the
  previous intake while it was still open.

  Branch protection and the merge settings were read in the same sweep and had
  **NOT drifted**: `contexts: ["test", "e2e"]`, `strict: true`,
  `enforce_admins: true`, force-pushes and deletions off,
  `required_pull_request_reviews` absent, `required_linear_history: false`;
  squash, merge-commit and rebase all on, `allow_auto_merge` on,
  `allow_update_branch` on, `delete_branch_on_merge` on. **The third pass flipped
  two STATE lines** — #669's and #665's, both to MERGED — **and opened none.**
  #664's and #671's are still OPEN and were confirmed OPEN on GitHub at this
  sweep rather than assumed from the entry.

  **THE SWEEP OF 2026-09-22T23:5xZ, boundary `2026-09-22T21:00:00+00:00`** —
  run to open the DREAMCRM-104 planning meeting, deliberately back inside the
  previous sweep's window again. **Pass one returned SEVEN and pass two returned
  TEN**, the three extra being `ffad5a28` (#668, RELEASE.md only), `6709e799`
  (#676, already graded) and the `c9642dbc` merge of #674 (marketing components
  and one marketing test — design-system, not gate). Nothing gate-bearing was
  reachable only from pass two this time, and that is not an argument for
  dropping it: the pass that finds nothing on the day it runs is the pass that
  found #598.

  **Ungraded and gate-bearing: six** — `1b34d257` (#664), `14d69bbf` (#673),
  `94a36ba0` (#671), `9b18c91b` (#677), `667a8ea2` (#678), `c1ca93c0` (#679).
  All six are written up on their existing entries above; **the list grew by
  nothing, and no new ordinal was taken.** #673 is a CASE on the heartbeat entry
  (`tests/guards/schedule-heartbeat.test.ts` gained one assertion, that the
  workflow's shell loop and its script agree on what counts as a workflow file
  — a guard over the agreement between two readers of the same tree, which is
  the #593 shape pointed at a pair rather than at a function).

  Branch protection and the merge settings were read again here and had **NOT
  drifted**: `contexts: ["test", "e2e"]`, `strict: true`, `enforce_admins: true`,
  force-pushes off, `required_pull_request_reviews` absent,
  `required_linear_history: false`, `required_conversation_resolution: false`;
  squash, merge-commit and rebase all on, `allow_auto_merge` on,
  `allow_update_branch` on, `delete_branch_on_merge` on.

  **WHAT THIS SWEEP IS ACTUALLY WRITTEN UP FOR: NINE STALE `STATE:` LINES, ALL
  SAYING OPEN ABOUT SOMETHING ALREADY ON `main`, six of them carrying the words
  "Forge owns the flip."** #664 and #671 here; #647 and #621 in §2a; #645,
  #642, #647 and #650 in §2b; #663 in §3. Two of them had been merged for
  hours, one (#621) since 2026-09-16 — and §2b's four contradicted §2's own
  list, which had recorded the same four as MERGED the same morning. An agent
  opening §2b to read what a rule DOES was told the rule was not live while
  §2 said it had been live since before lunch.

  **And the uncomfortable part: THE PASS THAT WAS SUPPOSED TO CATCH THIS ALREADY
  EXISTED, RAN, AND MISSED SEVEN OF THE NINE.** The routing-before-merge note
  above already says "every sweep from here opens by re-reading the outstanding
  STATE lines against `main`", and the 21:2x sweep DID run it — it re-read #664's
  and #671's and correctly recorded both as still open on GitHub at that moment.
  It missed #647, #621, #645, #642, #650 and #663 because **it grepped the file
  it was being written into.** So this is not a missing control and not
  forgetfulness; it is a control whose SCOPE was one file while the promises it
  grades are spread across five. The two failures a wrong diagnosis would have
  produced are both worse than the defect: adding a second pass that also greps
  §2, or asking the next Forge to be more careful.

  **The widening, which is the whole fix:**

  > **The third pass greps EVERY reference file for `STATE:` — `§1`, `§2`, `§2a`,
  > `§2b`, `§2c`, `§2d`, `§3`, `§6`, `§8` — not the one being edited**, and
  > re-reads each non-MERGED line against
  > `gh pr view <n> --json state,mergedAt,mergeCommit`. It needs no boundary
  > date and cannot be defeated by a change that touches no path. A flip writes
  > the merge SHA and the UTC timestamp, never "merged" on its own: an entry
  > without a SHA cannot be re-checked by the next reader, which is how #621's
  > line survived six days of sweeps.

  **And a flip is a reconciliation, not a find-and-replace.** §2b's four were
  stale *while §2 was correct about the same PRs* — §2's own list had recorded
  #642, #645, #647 and #650 as MERGED that morning. So the pass also asks
  whether two files disagree about one PR. **When the entry that describes a
  RULE and the entry that records its MERGE live in different files, flipping
  one is half the job**, and the half left undone is the one an agent reads when
  it wants to know what the rule does.

  **The count is the measurement, and it is worth keeping to compare against:
  nine stale lines, oldest six days, four of them self-contradicting §2.** If
  the next sweep's pass three finds more than one, the widening did not take.

  **THE PLACEMENT DECISION, AND WHY IT WAS THE OBSTACLE RATHER THAN THE
  SCRIPT (DREAMCRM-109, 2026-09-23).** The nine stale lines above are the
  evidence, and the widened third pass is the interim control. The guard that
  replaces it was blocked on something that is not a script: **this rulebook
  lived only in the Multica skill store, outside the repository, where no test
  could read it.** Everything else tracked here is graded — `control-bytes.ts`
  over every file, `line-endings.test.ts` over the committed bytes,
  `rulebook-drift.mjs` over the claims this document makes ABOUT the repo. The
  most-read document in this office was the one with no guard on it, and the
  reason was an address, not an omission.

  **The decision: `docs/rulebook/` in this repository is now where the rulebook
  is authored and graded. The skill store holds a published copy.** The three
  options were moving it here, mirroring it here, or building a check that can
  reach the store; the third is rejected on the merits and not on effort. It
  needs a Multica API credential inside GitHub Actions — an owner-level grant
  in a repository that holds exactly one secret — and it would still grade only
  the STORE copy, leaving whatever is in the repo ungraded. It buys strictly
  less for strictly more.

  **Why a MOVE rather than a MIRROR, which is the part worth arguing.** A
  mirror that can silently diverge from its source is the hand-kept-list defect
  §2c and §2d keep naming, pointed at 500 KB of prose: `test` would grade a
  document nobody reads. Making the repo the AUTHORING surface removes the
  divergence at its cause rather than detecting it after the fact, because the
  defects being guarded are introduced BY THE WRITE. The sequence is now: edit
  under `docs/rulebook/`, open a PR, let `test` grade it, merge, then push the
  merged bytes to the store and re-fetch and compare BYTES. The guard runs
  BEFORE the store ever sees the bytes.

  **What is still ungraded, said plainly rather than implied.** The
  repo → store hop. CI cannot reach the store at all, so the fidelity of that
  push rests on the byte-compare the pusher performs — which is a person-shaped
  control, and §2d is right that those are not controls. What the move buys is
  a change of SIZE: the ungraded surface went from the entire rulebook to one
  mechanical push of already-graded bytes. Do not read this paragraph as a
  promise that the loop is closed. It is not, and the honest next move if the
  store ever drifts is to make publication mechanical rather than to add a
  sentence asking people to be careful.

  **IT DRIFTED, AND HERE IS THE MEASUREMENT (Forge, 2026-09-23, DREAMCRM-114,
  taken while publishing #699).** The paragraph above says the repo → store hop
  rests on a byte-compare the pusher performs, that this is a person-shaped
  control, and that the honest next move if the store ever drifts is to make
  publication mechanical. **It had already drifted, before today's merge, and
  nobody knew.** Comparing the published copy against `main` at `66d087dc` —
  that is, at the state before any of this batch landed:

  - `references/2-merge-gate.md` — the store was **37 lines behind** `main`;
  - `references/2d-a-guard-must-be-watched-to-fail.md` — **19 lines behind**;
  - the other seven reference files and `SKILL.md` were byte-identical.

  So the two files carrying the registered-guard list and the mutation
  families — the two an agent opens to find out what will fail their PR — are
  exactly the two that were stale. Nothing detected it. It turned up while
  diffing the store against the tree in order to publish something else, which
  is the same person-choosing-to-look the placement decision was taken to
  replace, one level further out.

  **Read it as the prediction confirmed rather than as a new problem.** The
  placement bought a change of SIZE and that is real: the ungraded surface is
  one mechanical push of already-graded bytes instead of the whole rulebook,
  and what drifted was two files rather than a document nothing could check at
  all. What it did not buy is DETECTION, and the paragraph above is honest
  about that. The next move is the one it already names — make publication
  mechanical — and the shape to reach for is not a checklist item but an
  assertion some other run makes: **nothing in this hop can fail today, so
  nothing in this hop is a control.**

  **What a publisher owes until then, since the byte-compare is the only
  control there is.** Publish EVERY file, not only the ones you edited — a
  concurrent run can land on a file you did not touch, and a stale local copy
  is how you clobber it. Then re-fetch and assert four things about what comes
  back: the content round-trips byte-for-byte against the tree; the stored
  description matches the `SKILL.md` frontmatter compared as BYTES (a length
  match proves nothing — two 9,018-character strings differed on 2026-09-22);
  no line starts with `#` that is not a real heading (a wrapped issue
  reference became an H1 that way); and nothing in the 0x80–0x9F range or any
  cp1252-decoded UTF-8 fragment survives anywhere in it. That last one is the
  asymmetry worth keeping: a raw control byte in a tracked file fails `test`
  (§2c) and the store has no equivalent, so the re-fetch IS the store's guard.

  **THE FORTY-NINTH: #685, `tests/guards/rulebook-state.ts` +
  `tests/guards/rulebook-state.test.ts`. A NEW CLASS, and the first guard in
  this repo whose subject is THIS DOCUMENT.** Six rules over `docs/rulebook/**`,
  all at zero, no exemption list:

  - **Rule 0 — the bytes still say what was written.** A strict UTF-8 decode,
    no C1 code point, no cp1252 mojibake signature. **Read this one carefully
    if you thought the placement alone closed it, because the first draft of
    the guard said so and was wrong:** `control-bytes.ts` bans C0
    (`0x00`–`0x1F`), and the cp1252 round trip that mangled 90 characters of
    this rulebook on 2026-09-14 produces `0x97`, which is C1. A `0x97` planted
    in `docs/rulebook/` left `control-bytes.test.ts` GREEN across all sixteen
    of its passes — watched, on the real tree. The placement bought the half
    that had never happened and none of the half that had. Widening
    `control-bytes.ts` to C1 tree-wide is the named open candidate; it is a
    different change over 2,577 files and is owed its own measurement.
  - **Rule 1 — every `STATE:` line names the PR it is about**, so the next
    reader can re-check it.
  - **Rule 2 — a MERGED verdict names its commit and its date.** §2's own
    words, made into a check. The TIME is deliberately not graded: four
    pre-convention entries carry a date alone, and a rule that reddens a
    correct entry teaches people the check is noise. Fix those four, do not
    exempt them.
  - **Rule 3 — no two files disagree about one PR.** The half that needs no
    history, and the one that catches four of the nine: §2b said OPEN about
    #642, #645, #647 and #650 while §2's own list said MERGED the same morning.
  - **Rule 4 — a MERGED claim's commit is an ancestor of `origin/main`.**
  - **Rule 5 — a non-MERGED verdict is not already on `main`.** The nine-line
    defect itself.

  **WHY IT NEEDS NO CREDENTIAL, which is what turned this from a daily alarm
  into a required check.** "Is this PR merged?" reads like a GitHub API call,
  and `test` has `contents: read` and no token. But **`main`'s own history IS
  the record of what merged** — a squash lands as `<subject> (#N)` and a merge
  commit as `Merge pull request #N` — so the whole family is decidable from
  `git log origin/main`, offline, inside the gate. That is the difference
  between an alarm somebody reads in the morning and a check that cannot be
  merged past.

  **WHAT IT MEANS FOR EVERY OTHER PR, which is the intake test:** after this
  lands, a `STATE:` line that lies about `main`, or that cannot be re-checked,
  fails `test` by name — and so does a rulebook file whose encoding was mangled
  in transit. Nothing here is a new NUMBER and nothing product-facing changes.

  **Three narrowings, each written against rather than noted.** (1) The rules
  are scoped to a PARAGRAPH, a CLAUSE and a bold CLAIM rather than to a
  physical line, because these files hard-wrap at 79 columns — the first draft
  read the line and misclassified six merged entries as unmerged. (2) Rule 4
  grades only the SHAs inside the bold claim: three SHAs in this document sit
  in commentary after the bold closes (a review head, an earlier re-read) and
  are not on `main`, so grading the clause would fail three correct entries.
  That exclusion is asserted to be DOING WORK on the real tree, so it cannot
  quietly become an exemption. (3) Bold runs are paired on the MASKED text —
  one `**` inside a code span in §2's own error-scan entry made the raw count
  odd and silently widened rule 4 on `#664`'s entry, which is a widening
  nothing downstream could have noticed.

  **THE EYES, AND THE WORKFLOW CHANGE THEY FORCED.** Rules 4 and 5 read
  `main`'s history, and every finding they produce is a POSITIVE match, so a
  reader narrowed to nothing reports a clean rulebook. `ci.yml`, `deploy.yml`
  and `nightly.yml` fetched main at `--depth=1` — a tip with NO history — under
  which this guard would have gone quiet rather than red on the day it shipped.
  All three now fetch main's full history (measured: 46 MiB over 1,395
  commits, no filter, because a blobless partial clone would turn the axe
  ratchet's `git show` into a lazy network fetch inside a required check). The
  guard asserts its own eyes against two independent floors and FAILS rather
  than passing blind, so a re-shallowed fetch breaks `test` loudly. **Because
  this touches `.github/workflows/**` it is a §3 review area — Sentinel
  reviewed it as a gate change, not as docs.**

  **A CASE, taking no ordinal, on the axe-ratchet's workflow census.**
  `FETCH_MAIN_COMMAND` pinned the fetch step by its WHOLE command line
  including `--depth=1`, so deepening the fetch failed three correct workflows
  for a flag the guard does not care about. The census now matches the REFSPEC
  (`FETCH_MAIN_REFSPEC`). The rule's subject was always "main is in this
  checkout"; the depth was one consumer's minimum wearing the sentence's
  clothes — §2d's "a guard's SENTENCE is a claim about a MACHINE", and the fix
  is the sentence.

  **IF `test` FAILS ON A `STATE:` LINE YOU DID NOT WRITE, THIS IS WHY, AND IT IS
  NOT A BROKEN GUARD.** (Sentinel's note 4 on #685, written here rather than
  left to be discovered.) Rule 5's obligation lands on whoever touches
  `docs/rulebook/` NEXT, not on whoever created the staleness — so an edit to
  one line of §6 can go red naming a line in §2 about somebody else's PR. That
  is deliberate, and it is the trade that keeps the rule out of `main`: the
  alternative fires at the merge, where it stops the production deploy and
  blocks every open PR instead of one author. **The fix is to flip the line it
  names** — the verdict, the merge SHA and the UTC time, which `gh pr view <n>
  --json state,mergedAt,mergeCommit` gives you in one call — and then carry on
  with your own change. It is a minute of somebody else's bookkeeping, paid by
  the person who happened to be standing there, which is the whole reason the
  nine-line backlog could accumulate when nothing was paying it.

  **What this guard still cannot see**, stated here rather than left to its
  docblock: a merge that reaches `main` with no PR number in its subject
  (`947680cb` and `af59967e` — the same off-board class §3 writes up, and the
  rule going quiet on them is a second symptom of that defect rather than a
  hole to patch here); a SHA outside a bold claim; and an entry that says
  MERGED, names a real on-`main` SHA, and describes the wrong rule — §2d's
  predicate-right-sentence-wrong family, which no scanner finds.

  **THE REVIEW CAME BACK REQUEST CHANGES, AND THE FINDING WAS THE ENTRY YOU
  ARE READING.** Sentinel, at head `f99e4630`. Rule 5 as first written fires on
  a non-MERGED verdict the moment its PR lands — and this entry, written before
  the merge on the DREAMCRM-60 precedent, IS a non-MERGED verdict about #685.
  So the guard would have reddened `main` at its own merge. What that costs was
  traced rather than assumed: `deploy.yml` has `deploy: needs: test`, so the
  **production deploy stops**; branch protection is `strict: true`, so **every
  open PR becomes unmergeable** the moment it updates onto `main` and inherits
  the line. And the clearing action — writing the merge SHA — does not exist
  until after the merge, so no version of the PR could pre-empt it.

  **It was never a one-off.** This list writes the entry before the merge every
  time, so the next guard registration reproduces it exactly. A fix scoped to
  this entry would have been a fix to the symptom.

  **THE NARROWING, which is the whole answer: rule 5 fires only once
  `docs/rulebook/` has been EDITED SINCE the subject's merge commit.** Not a
  grace window — the narrowing offered in review ("don't fire while the
  subject's merge commit is the tip of `origin/main`") buys exactly one commit
  and an unrelated merge reopens it, which is a shorter race rather than no
  race. The predicate compares **the tree under test** against the subject's
  merge commit, and that comparison gives the SAME ANSWER before and after the
  merge, which is the property that makes it safe:

  - `strict: true` means a PR's `test` runs on the merge RESULT, so the tree it
    grades is byte-identical to the `main` it is about to create;
  - therefore any tree that would fail on `main` fails on the PR FIRST, where
    the author fixes it inside their own diff.

  **AND THAT ARGUMENT IS ABOUT THE TREE — A CORRECTION, WRITTEN THE SAME
  NIGHT, BECAUSE THE SENTENCE THAT USED TO END IT WAS FALSE.** It read
  "`main` cannot go red from a merge that was green", full stop. It was
  reviewed, agreed, merged — and **it blocked two production deploys
  within the hour**. `deploy.yml`'s `test` job went red on every push to
  `main` while `ci.yml` was honestly green on every PR, and
  `deploy: needs: test` turned that into a frozen deploy pipeline.

  The cause is not in any tree. **`actions/checkout` hands the two events
  different clones.** On a `pull_request` it holds `refs/pull/N/merge`, so
  `origin/main` is a ref the clone does not have and the fetch step genuinely
  transfers main's history. On a `push` to `main` it holds main at depth 1
  with its tip ALREADY EQUAL to the remote tip — so the identical fetch
  transfers nothing, the shallow graft survives, and `origin/main` resolves
  with exactly ONE commit. Same step, same repo, two starting states.

  **The honest claim is narrower, and it is the one to reason with: `main`
  cannot go red from a merge that was green FOR REASONS THAT ARE A FUNCTION OF
  THE TREE.** A check reads the tree AND the machine. Anything it takes from
  the machine — the clone's depth, which refs exist, what event produced
  the run — sits outside the argument and needs pinning separately. It is
  now pinned: `axe-baseline-ratchet.test.ts` asserts PER JOB that everything
  running `pnpm test` checks out with `fetch-depth: 0`, which fails on a PR
  rather than on `main`.

  **Two things about this are worth more than the fix.** The first: the
  guard's own eyes-floor is the only reason this was a blocked deploy instead
  of a silent hole — it refused to grade a rulebook it could not see, on
  a branch where nobody would have checked. Writing the floor is what turned
  an invisible defect into an expensive, obvious one, and that trade is the
  right one every time. The second: **the old census asserted the fetch STEP
  existed, and it did** — in all four jobs, correctly spelled, doing
  nothing. That is §2d's assert-the-answer-not-the-proxy with the proxy
  looking perfect, and it is the reason the new assertion is about the
  CHECKOUT rather than about a step being present.

  And the obligation it encodes is the honest one — *you touched the rulebook
  and left a stale line in it*. The nine-line incident sits squarely inside it:
  the rulebook was edited several times a day throughout, so every one of those
  edits would have gone red. **The residual is named rather than implied**: a
  line whose PR merged and whose rulebook is then never touched again stays
  stale with nothing red. "Wrong for six days" is a claim about the CALENDAR
  that can become true with no diff at all, and §2a already says where that
  belongs — `rulebook-drift.yml`, the daily alarm that gates nothing and whose
  own header says a stale sentence is not a reason to hold a production fix.
  Wiring it there is the named follow-up.

  **The post-merge state is now an ASSERTION rather than an argument.** Two
  standing tests: the real entries plus the real history, with every open
  subject added to `mergedPrs` (what a squash merge does) and
  `rulebookEditedSince` answering `false` (what `main` answers at the merge) —
  zero findings; and the same simulation with the rulebook edited, which must
  fire on every open subject, so the first test cannot pass because rule 5 has
  quietly stopped working. Mutating the second condition back out reproduces
  Sentinel's finding exactly: same file, same line 2863, same PR.

  **TWO WIRING DEFECTS CAME OUT OF THE SAME REVIEW, and both are the family
  this PR adds to §2d.** Neither is a new ordinal; both are CASES on this entry.

  - **A test that asserted on a COPY of the thing it claimed to cover.** The
    merge-commit subject test re-declared both regexes as literals and matched
    them against two literal strings — it never called the reader. Deleting the
    merge-commit branch from the real function left it GREEN, while 15 of the
    658 recoverable PR numbers on `main` (including `#674`) vanished and
    `MERGED_PR_FLOOR` of 100 did not notice. Rule 5 would have gone quiet on
    every merge-commit-landed PR with nothing red. Fixed by exporting
    `prNumberFromSubject` and grading THAT — and the real-tree assertion added
    beside it immediately earned its place by finding a second, unrelated
    narrowing nobody had noticed: the reader's `{2,5}` digit bound silently
    dropped every single-digit PR, and `main` carries fourteen. The bound is
    `{1,5}` on a commit SUBJECT (where `#N` is unambiguous) and stays `{2,5}` in
    the entry parser (where it is read out of PROSE and `#1` is an ordinal) —
    **the difference between two readers of the same notation is now written
    down, because an undocumented one is the trap itself.**
  - **An assertion whose SENTENCE was true on the author's box and false on the
    runner.** The "rule 4's narrowing is doing work" test required a commentary
    SHA to be resolvable AND not an ancestor of `main`. A developer's full clone
    still has the deleted PR-branch heads; a runner fetching only `main` does
    not, so `ancestry` answers `unknown`, the set is empty, and the assertion
    went red on CI **while the guard was working perfectly**. It now asserts the
    part that does not depend on what the clone happens to have fetched — that
    commentary SHAs EXIST — and leaves the behaviour to fixtures, where both
    machines agree. §2d has the general form; this is the instance, shipped in
    the same PR that adds the section, which is worth the embarrassment of
    recording.

  **STATE: MERGED — `ad7e3f4f` (#685), 2026-09-23 03:40:24Z, Sentinel APPROVE WITH
  NOTES** (reviewed at head `995fbf11` against a verified-green `test`/`e2e` on
  `7bc4fc77`; the reviewer re-ran the predicate against the real tree in four
  states rather than reading the argument, including the mutation that
  reproduces his original finding). **Flipped by the follow-up that also
  carries his four notes — which is the first real use of the narrowing above
  working as designed**: this edit to `docs/rulebook/` is exactly what makes
  `rulebookEditedSince` true for #685, so rule 5 was armed on the very PR that
  owed the flip, and would have failed `test` had the flip been forgotten.

  **It took FIVE update-branch cycles to land**, on a night when `main` was
  taking a commit about every seven minutes and `test` runs about seven —
  auto-merge armed throughout. That is §2a's corrected `allow_update_branch`
  claim reproduced within a day of writing it down, and the honest reading is
  that on a busy queue arming auto-merge is necessary and not sufficient: some
  cycle has to win the race, and nothing shortens the race except a quieter
  queue or a faster suite.

  **THE FIFTIETH: #688, `e2e/duplicate-watch.ts` +
  `tests/guards/e2e-duplicate-watch.test.ts` (DREAMCRM-105, `a7bdf172`,
  2026-09-22 23:58:58Z). A NEW CLASS** — a blocking assertion inside `e2e`
  whose subject is a duplicate that is TRANSIENT, so the spec has to
  distinguish "arrived twice and settled" from "arrived twice and stayed",
  and the guard holds the watcher itself in place. **STATE: MERGED —
  `a7bdf172` (#688), 2026-09-22 23:58:58Z.**

  **A CASE on the plan-price entry, no ordinal: #686 closes the comma
  asymmetry §2c had open** (`53586aaa`, 2026-09-22 23:49:47Z). The band's two
  ends were graded by different rules and nobody chose that: `MONEYISH` wanted
  three CONSECUTIVE digits, and a thousands separator breaks a run of them, so
  `$800-2,000/mo` was pardoned and `$200-2,000/mo` was not — a red `test`
  naming a competitor's number on `/compare`, the page whose whole job is
  printing somebody else's prices. Closed with `\\d[\\d,]*\\d\\d` rather than the
  tempting one-character `[\\d,]{3}`, which would grade three CHARACTERS and
  quietly falsify the comment above it. Watched to fail in both directions.
  **This is §2c's named latent gap, and it is now CLOSED** — §2c and the
  frontmatter both say so.

  **And a §3 gate widening, #681: the money review area reaches ONE IMPORT HOP
  from Stripe** (`5abd4b37`, 2026-09-23 00:59:11Z, DREAMCRM-106, Rio).
  `from '@/lib/stripe'` was a good necessary condition that stopped at the
  SERVICE, so the cron that calls `runDuePlanCharges` — the thing that charges
  a patient's card, unattended, every day — matched no gate rule at all and was
  reported "merges on green". So did `buy-domain-actions.ts`, which spends real
  money on the clinic's card, and both Connect onboarding routes, which decide
  the account every shop payment is paid INTO. Measured on `main` at
  `c1ca93c0`: 17 files import the client directly, 78 sit one hop out, 25 of
  those are mutation surfaces, and **12 of the 25 matched nothing**.

  **Read the keying, because it is the interesting part and it is the answer to
  the obvious objection.** It keys on the MUTATION SURFACE, not the flat hop:
  the other 53 one-hop files are pages and client components —
  `app/site/[slug]/privacy/page.tsx` among them — that reach Stripe only
  because a shared layout does, and gating the hop wholesale would put a
  privacy-policy copy edit into a review queue of one. One exemption
  (`sitemap.xml/route.ts`), with its premise re-derived from the tree every run
  rather than asserted once. It also fixed a latent looseness inherited from
  the old rule: the direct-import check read `from '@/lib/stripe'` in SINGLE
  quotes only, so a double-quoted import of the Stripe client was invisible to
  the money gate's only derived check — §2d's identity-looseness family, fifth
  spelling. **What it means for every other PR: a file that mutates money one
  hop from Stripe now owes Sentinel a review.** **STATE: MERGED — `5abd4b37`
  (#681), 2026-09-23 00:59:11Z.**

  **A CASE on it the same night, no ordinal: #690** (`7502947c`, merged
  `a635ebfd`, 2026-09-23 01:48:25Z), answering Sentinel's three non-blocking
  notes. Two of the three are worth carrying because they are general:

  - **The predicate did not ask what its own failure message asked for.** The
    new check accepted ANY gate area while the direct-import check beside it
    demands `money`, and its message told the author to "add each to the money
    patterns". One file fell straight into the gap —
    `app/(default)/ecommerce/customers/admin-actions.ts` calls
    `cancelSubscriptionNow` and satisfied the check purely through the `auth`
    pin it had earned back in #569, so a subscription-cancelling surface was
    reported covered by a rule that was not about money. **A message that
    describes a stricter predicate than the code enforces is the
    sentence-versus-code family in §2d, and it is worse than a wrong message:
    the next reader believes the message.**
  - **The discrimination witness was HAND-PICKED** — two named clinic-site
    pages standing in for "the one-hop files that are not surfaces". A
    legitimate refactor that stopped that tree reaching a Stripe-importing
    module would have reddened `test` naming an innocent page. It is derived
    now from the one-hop population's own RENDERERS
    (page/layout/loading/error/not-found), with a floor under both the renderer
    count and the non-surface count so neither half can pass vacuously.
    **A witness is a hand-kept list wearing one entry's clothes** — the defect
    §2c and §2d keep naming, at its smallest possible size.

  (The third note: `ROUTE_HANDLER` required a directory segment, so a root
  `app/route.ts` was not a surface. Nothing lives there today, which is exactly
  why it would have gone unnoticed.)


  **THE FIFTY-FIRST: #680, `.github/workflows/e2e-flake-hunt.yml` +
  `scripts/e2e-harness.sh` + `tests/guards/e2e-harness-args.test.ts`
  (DREAMCRM-105, `0d7756a2`, 2026-09-23 02:47:00Z). A NEW CLASS, and the
  TWELFTH workflow file** — the instrument that turns "fails about once a day,
  can't reproduce" into a ratio, by running one spec N times. `workflow_dispatch`
  ONLY, so it cannot hold a merge and costs nothing on a morning nobody is
  hunting. Two things make it an entry rather than a footnote: its dispatch
  inputs are **the repository's first user-controlled strings**, so they ride
  `env:` and are validated in the harness rather than interpolated into a shell
  line; and the census in `scripts/rulebook-drift.mjs` gained its entry in the
  same diff, which is what keeps a new scheduled workflow from failing `test`
  by name. §2a's count moved eleven → twelve in this pass.

  **A CASE on it the same night, no ordinal: #692** (`183664d8`, 2026-09-23
  03:13:09Z) — **the hunt reproduced the flake, 9 of 200, and found the watcher
  blind while doing it.** That is the shape worth carrying: an instrument built
  to measure a defect earned its keep by failing to see one, which is the only
  way anybody learns a watcher's field of view is narrower than its name.

  **A CASE on the one-hop money gate, no ordinal: #691** (`4508ffc1`, merged
  `a77f7a19`, 2026-09-23 02:34:26Z) — **the one-hop instrument's floors are
  SHARES, not counts.** A floor written as a count passes vacuously the moment
  the population grows past it, which makes it a threshold that stops being an
  assertion without anybody editing it. A share keeps meaning the same thing at
  any tree size. Same family as the renderer-derived witness in #690: the
  instrument holding a rule in place drifts exactly as the rule would.

  **THE FIFTY-SECOND: #682, `e2e/axe-selftest.spec.ts` + the widened
  `e2e/axe-headroom.ts` / `e2e/axe.ts` (DREAMCRM-107, `cd67e59c`, 2026-09-23
  03:21:20Z). A NEW CLASS — the a11y gate reads what axe could not DECIDE.**
  Every axe rule here has graded violations; this grades the INCOMPLETES — the
  checks axe ran and could not resolve, which have always been reported as
  neither pass nor fail and therefore counted as clean. A ceiling of zero over
  violations says nothing about a page where the tool declined to answer.

  **A CASE on the contrast reader, no ordinal: #687** (`10b1c96c`, 2026-09-23
  03:28:04Z) — **the contrast rules read a template broken across lines.** This
  is `quotedChunks`' residual from #657 closed: the reader was per-LINE, so a
  multi-line template's static text was unread, and §2b recorded that as a live
  blind spot with ten lines behind it. It is a CASE rather than a class because
  no assertion, threshold or number moves — only the FIELD OF VIEW of every
  rule built on the shared reader, which is the #669 shape and is routed for
  the same reason: a field of view that grows with no new assertion still
  changes what fails `test` by name.

  **THE FIFTY-THIRD: #698, `tests/marketing/hero-lcp-paint.test.tsx` +
  `tests/marketing/marketing-not-found.test.tsx` + the marketing-404 stop in
  `e2e/smoke.spec.ts` (DREAMCRM-108, `66d087dc`, 2026-09-23 06:05:18Z). THREE
  new blocking assertions in one merge, and every one of them is the shape the
  path-scoped sweep pass cannot see.** Routed on DREAMCRM-114 at
  2026-09-23T08:0xZ, the same day.
  **STATE: MERGED — `66d087dc` (#698), 2026-09-23 06:05:18Z.**

  - **`hero-lcp-paint.test.tsx` — a NEW ZERO-TOLERANCE CLASS inside `test`.**
    The homepage hero's `<h1>` and the paragraph under it may not carry any
    class the marketing motion stylesheet holds at `opacity: 0`, and neither
    may `PageHero`'s equivalents across the eight subpages. It derives the
    banned SET by rendering `MarketingMotionStyles` and reading every rule that
    starts an element at zero, rather than grepping for `mkt-enter` — so a
    third entrance class that also starts at zero is covered on the day it is
    written, and renaming `mkt-rise` breaks nothing. That is §2d's
    derive-the-field-of-view rule applied BEFORE the second instance rather
    than after it. Its READER is mutated too (§2d's reader family, answered in
    the same PR): forcing `classesHeldInvisible` to return an empty Set reddens
    a test of its own instead of passing everything silently.
    **Scope, stated rather than implied:** an `opacity: 0` arriving from a
    Tailwind utility or an inline `style` is NOT seen. The site ships one
    hand-written entrance sheet and a whole-utility-layer resolver is the
    "208 places to catch 8" trade — the same call §2b's 12px floor made.
  - **`marketing-not-found.test.tsx` — seven assertions on the marketing 404.**
    That `app/(marketing)/not-found.tsx` exists AT THAT PATH (the location is
    the entire mechanism: Next resolves `notFound()` to the nearest file
    walking up from the missing route, so there is no import and nothing a
    render can observe — moving the file back out is exactly how the defect
    returns); that the root 404 stays chrome-less for the clinic tenants it
    belongs to; that every recovery link is a live destination graded against
    `MARKETING_PUBLIC_PATHS`, so a recovery link can never itself 404; one
    `h1`; `noindex`; and no apology copy.
  - **A new browser stop in `e2e/smoke.spec.ts`**, carrying an axe scan and
    Part 10's 390px `scrollWidth` probe against a real 404 RESPONSE. **Read
    why it is not in `e2e/marketing-viewport.spec.ts`, because it is the
    interesting part:** that spec asserts `status === 200` at every stop it
    visits, so its page list — derived, and rightly praised in §2a for being
    derived — structurally could not have grown to cover a page whose whole
    point is a 404. A derived field of view is still bounded by the predicate
    it derives THROUGH.

  **WHY THIS ENTRY IS ALSO THE ARGUMENT FOR THE ONE BELOW IT.** All three
  landed inside checks that already existed, under paths the path-scoped pass
  does not watch: `tests/marketing/**` is not on that list, and the `e2e/` half
  would have been caught only by the accident of which directory the stop lives
  in. No workflow file moved and no gate area moved, so
  `scripts/rulebook-drift.mjs` correctly stayed green — this is precisely the
  #534 / #598 shape it cannot see, arriving for the third time. The unscoped
  second pass found all three, about half an hour after the previous intake
  window closed. **That is the sweep working, and it is still a person choosing
  to look**, which §2d says is not a control.

  **THE FIFTY-FOURTH: #701, the `guards-census` claim in
  `scripts/rulebook-drift.mjs` + the census block in
  `tests/guards/rulebook-drift.test.ts` (DREAMCRM-114). A NEW CLASS, and the
  first guard here whose subject is WHETHER A SENTENCE EXISTS** rather than
  whether one is still true. Every file in `tests/guards/` must be named, by
  its own file name, somewhere in `docs/rulebook/**`, or `test` fails naming
  it. **STATE: MERGED — `09435da3` (#701), 2026-09-23 08:57:49Z.**

  **Why it is a new class and not a ninth of the same.** The eight claims
  `rulebook-drift.mjs` already made all ask the same question in different
  words: *is this sentence about the repo still true?* They grade required
  checks, the workflow census, the gate areas — facts that MOVE. The failure
  this rulebook keeps recording is a different one: a blocking assertion lands
  inside a check that already exists, nothing any of those eight facts
  describes moves at all, and the rule reaches nobody. #534 took three days.
  #598 was found only by the unscoped second sweep pass. #698 put three of
  them in one merge, thirty minutes after an intake window closed. In every
  case `rulebook-drift` was honestly green.

  **REGISTRATION BY LOCATION, and the predicate that was measured and thrown
  away — read this before proposing a cleverer one.** The obvious rule is a
  predicate: *a guard is a test that reads source off disk.* Measured on
  `main` 2026-09-23, that matches **81 files OUTSIDE `tests/guards/`**, most of
  them ordinary unit tests with no never-again thesis at all, and it MISSES
  `hero-lcp-paint`, the day's actual case, which reads its subject out of a
  rendered stylesheet. Over-broad by roughly ten times and blind to the case
  that prompted it. §2 is explicit about what a false positive costs here — a
  red `test` run naming an innocent file — so it was not built. **A directory
  is self-declaring: a file is in it because its author put it there, so the
  false-positive rate is zero by construction.** The general form is worth
  more than this instance: when you need a population and no predicate is both
  sound and complete, a declaration beats an inference.

  **THE FULL FILE NAME, NOT THE STEM, and it is worth three entries.** The
  meeting's count was eight absent; the census found ELEVEN. The three extra
  were reported registered because a SCRIPT or a workflow of the same stem was
  written up: `scripts/migration-check.mjs` and `migration-check.yml` both have
  pages in §2a and §3 while `tests/guards/migration-check.test.ts` was named
  nowhere. That is §2d's identity-looseness family pointed at this document's
  own bookkeeping, and the matcher answers it on both sides — a LEADING
  boundary so a bare name and a path-qualified one both count (requiring a
  prefix would redden sixteen correct citations for nothing), and a TRAILING
  one because `x.ts` is a prefix of `x.tsx` and a rulebook naming only the
  `.tsx` sibling would otherwise report the `.ts` one registered.

  **Its reader is guarded, and that is the load-bearing half.** Every
  assertion in this claim is an ABSENCE assertion — *no guard file is
  unnamed* — so a reader that silently narrows makes it GREENER, which is
  §2d's reader family exactly. The reader is therefore graded EXACTLY: the
  filtered census is compared against the UNFILTERED directory listing, and
  every entry in `tests/guards/` is either graded or named as the difference.

  **That is a correction, and the correction is the part worth reading
  (Sentinel, reviewing #701).** The first version guarded the reader with a
  FLOOR — *the census read at least 20 of something* — and argued that
  #691's counts-versus-shares rule did not apply, because #691 is about a
  claim on a POPULATION and this is a claim about the READER. **The first
  half of that argument was right and the conclusion was wrong.** A floor
  catches a reader that lands on ZERO. It cannot catch one that narrows
  PARTIALLY, which is the shape a plausible refactor actually takes: skipping
  `e2e-*` and `axe-*` dropped TWELVE of thirty-four guards, landed the census
  at 22, cleared the floor of 20, and left the claim GREEN with every test
  passing. Twelve guards leave the census and nothing anywhere goes red.
  #691's rule held after all — a count stops being an assertion the moment
  the population clears it, and the gap between 20 and 34 was never a
  tripwire margin, it was 41% of the census.

  **The general lesson, which outlives this guard: when an exact comparison
  is available, a floor is not a weaker version of it — it is a different and
  much smaller claim wearing its clothes.** The exact one was free here, and
  it closes two holes the floor could never see: the directory listing is
  NON-recursive while the rulebook walk is recursive, so a guard in a
  subdirectory used to be invisible AND silent; and a guard arriving with an
  extension nobody anticipated now reddens instead of vanishing. The floors
  stay only on the RULEBOOK side, where there is no exact expected size to
  compare against — a corpus is not a directory listing — and nothing more is
  claimed for them.

  **Watched to fail on the real tree, in both seams and in both versions of
  the reader check.** Rewriting §2c's `one-mrr-number.test.ts` citation as a
  stem reddens `test` naming that file. Narrowing the guard filter to nothing
  reddens. And Sentinel's partial narrowing — the one the floor passed —
  reddens naming all twelve dropped guards by name.

  **The matcher's two boundaries are the same shape now, for the same
  reason.** The first version spelled the leading boundary as a consuming
  character class excluding `_` and `-`, and the trailing one as a lookahead
  excluding neither, so `widget.test.ts-old`, `widget.test.ts_bak`,
  `widget.test.ts.snap` and `snap.control-bytes.ts` each reported the real
  file REGISTERED. Every one is the false-GREEN direction, which for an
  absence assertion is the direction that matters. **Asymmetry between two
  halves of one predicate is where §2d's identity-looseness family lives**,
  and it is worth checking for by construction rather than by example. A dot
  is refused only where it JOINS two name-shaped runs, so a citation ending a
  sentence still counts.
  **AND THE CORRECTION HAD ITS OWN HOLE, WHICH IS THE THIRD INSTANCE OF ONE
  FAMILY** (Sentinel, reviewing #707; fixed in #708). The unfiltered-listing
  comparison above replaced the floor, and its first version read
  `(live.guardDir ?? live.guards).filter(f => !live.guards.includes(f))`.
  With `guardDir` absent that is `guards.filter(f => !guards.includes(f))` —
  **empty by construction, for any input whatsoever.** The comparison did not
  fail, it DISAPPEARED; and because `guardDir` was left off the claim's
  `needs` list, the runner did not file it as ungradeable either. Measured:
  the same partial narrowing that reddens naming twelve guards went GREEN
  with `guardDir` missing, `ungradeable: false`, 22 of 34 entries read.

  **So the floor and its replacement failed the same way through different
  doors, and the shape is worth naming because it has now been chased three
  times in one guard: a check whose subject quietly leaves its field of view
  reports CLEAN.** First the reader's extension filter, then the
  count-based floor that was supposed to catch it, then the defaulted input
  in the comparison that replaced the floor.

  **The fix is this file's own stated rule rather than anybody's preference —
  A CLAIM THIS COULD NOT BE GRADED IS NEVER A CLAIM THAT HELD.** `guardDir`
  goes in `needs` and the `??` default comes out, so a missing listing is
  `COULD NOT BE GRADED` and exit 1. **A defaulted input is a claim silently
  answering a question it was not able to ask** — and `needs` is the
  machinery that already existed to say so, which is the part that makes this
  a one-line fix rather than a new mechanism.

  It was UNREACHABLE when it was written: `readLocalReality` always sets
  `guardDir` and has one production caller, and every test builds `live` from
  a helper that also sets it. Fixed anyway, on the precedent `main()`'s own
  `skipped` comment set about a case that was equally unreachable at the
  time — *a latent edge in the one classification this whole file exists to
  keep sharp is not somewhere to leave a maybe.*


  **WHAT IT MEANS FOR EVERY OTHER PR:** a new file in `tests/guards/` owes a
  paragraph in this rulebook in the SAME PR, or `test` goes red naming it.
  Nothing product-facing changes and no number moves.

  **Its two limits, stated rather than left to be discovered.** It covers that
  ONE directory: the design guards in `tests/marketing/` and the six
  accessibility guards in `tests/a11y/` are hand-registered in §2b and nothing
  goes red if the next one is forgotten — moving such a guard into
  `tests/guards/` is how it earns coverage, and moving one OUT is how coverage
  is lost silently. And it grades NAMING, never correctness: whether the
  paragraph describing a guard is any good is §2d's sentence-versus-code
  family and still needs a reader. What this buys is that the paragraph exists
  and has a name to find it by, which is the difference between an intake that
  happens and one that waits for somebody to choose to look.

  **A CASE on the emoji registry, no ordinal: #706** (`ac32ebd8`, 2026-09-23
  09:0xZ, DREAMCRM-118, Neon) — **two cases at once in
  `tests/marketing/emoji-assets.test.tsx`, and it is the tidiest example yet
  of the difference a CASE label is supposed to carry.** Neither is a new
  class; both are routed because a case still changes what fails `test` by
  name, which is the #669 rule.

  - **The count moved, the assertion did not.** `toHaveLength(6)` became
    `toHaveLength(3)`, following the Part 5 decision that the curated set is
    three glyphs under a ceiling of six. Same rule, new constant, written
    under the existing entry rather than beside it.
  - **The licence-accuracy rule, pointed the other way.** The file already
    asserted that every SHIPPED glyph's codepoint IS credited in
    `LICENSE.md`. It now also asserts a CUT glyph's codepoint is NOT. That is
    the same rule's contrapositive and it costs nothing: both lists are in
    this repo, so the false-positive rate is zero by construction. **A stale
    credit is a provenance table describing a directory that does not
    exist** — the §2c dormant-table lesson in a different medium, where the
    danger is the record outliving the thing it records.

  **It reached this document with the author routing it and no label**, which
  is the intake half working as designed: `review-gate.mjs` reported the diff
  clean — no gate area, no `needs-forge-intake` — and Neon filed the record
  anyway because §2 says a case is still routed. Read that beside §2's
  fifty-third entry, where the same silence went unrouted until an unscoped
  sweep found it. The gate's label and the author's judgement are two
  independent paths to this document and neither is sufficient alone.

  **The follow-up Neon deliberately did NOT build, held here so it is not
  lost:** a guard deriving CALL SITES from the tree — every name in the emoji
  registry appears in at least one render under `app/`. That is a new
  blocking assertion, so it is an intake before implementation rather than
  something slipped into the PR that motivated it, which is the rule working
  in the direction it is hardest to follow. **ACCEPTED at intake** (Forge,
  2026-09-23): the predicate is narrow, today's only conceivable false
  positive is a dynamically-named call site and there are zero, and without
  it the registry's `where` field is documentation nothing checks — the same
  shape as the drift it replaced. Three registered glyphs sat with no call
  site for the length of the program; that is the measurement.

  **THE FIFTY-FIFTH: #697, the per-JOB full-history assertion in
  `tests/guards/axe-baseline-ratchet.test.ts` (DREAMCRM-109, `8d7ed95c`,
  2026-09-23 04:47:54Z). A NEW CLASS — the first assertion here whose subject
  is what the CI EVENT hands a job**, rather than anything in the tree. Every
  job that runs `pnpm test` must check out with `fetch-depth: 0`; revert
  `deploy.yml`'s checkout and `test` reddens naming `deploy.yml:test`.
  **STATE: MERGED — `8d7ed95c` (#697), 2026-09-23 04:47:54Z.**

  Why it is a class and not a tightening: the census it replaces asserted that
  a fetch-of-`main` STEP was present, and it was — in all four jobs, correctly
  spelled, doing nothing. `actions/checkout` hands a `pull_request` the merge
  ref, so the fetch genuinely transfers `main`'s history; on a `push` to `main`
  it hands over a depth-1 clone whose tip already equals the remote tip, so the
  identical fetch transfers nothing and `origin/main` resolves to ONE commit.
  That is §2d's assert-the-answer-not-the-proxy **with the proxy looking
  perfect**, and it froze the production pipeline: `main` red on every push
  since #685, `deploy: needs: test`, two merges that built nothing.

  **AND READ WHAT THE SPLIT COST, because it is this list's own failure mode.**
  #697 EDITED this rulebook in its own diff — it had to, to narrow the
  merge-safety claim to reasons that are a function of the TREE — and still did
  not register the guard it shipped. An author who has already opened
  `docs/rulebook/` has cleared every obstacle the intake rule complains about
  and can *still* route the half the PR's headline is about while missing the
  half it merely contains. That is the #555 lesson with the excuse removed:
  **name every new class of assertion, not the one the title leads with**, and
  a rulebook edit in the diff is not evidence the intake happened.

  **THE FIFTY-SIXTH: #684, `.github/workflows/e2e-flaky-digest.yml` +
  `scripts/e2e-flaky-digest.mjs` + `tests/guards/e2e-flaky-digest.test.ts`, and
  the widened `scripts/review-sweep.mjs` (DREAMCRM-105, `ba6ded97`, 2026-09-23
  05:07:21Z). A NEW CLASS, and the THIRTEENTH workflow file** — §2a's count
  moves twelve → thirteen in this pass, and ten still gate nothing.
  **STATE: MERGED — `ba6ded97` (#684), 2026-09-23 05:07:21Z.**

  Two things here, and both change what the team is held to:

  - **The digest counts what the per-run reporter could only name.** Each
    Playwright report landed in one run's summary and nothing had ever read two
    together, so “portal-billing flaked” was a sentence somebody saw on a
    Tuesday and “about once a day” was a guess. A repeat offender is counted in
    **runs, not occurrences** — forty flaky records from one run is one runner
    having a bad afternoon, two records from two runs is a property of the
    spec — and it **leads with the census**, because an alarm whose steady
    state is quiet cannot otherwise tell “nothing flaked” from “I read
    nothing”. Weekly cron plus dispatch, no PR trigger, so it holds no merge;
    its window is one cadence wide, so there is no queue keeping it red for
    weeks. It is `test`-gated by `tests/guards/e2e-flaky-digest.test.ts`, which
    also reads `WORKFLOW_CENSUS` — so the workflow and its census entry cannot
    come apart.
  - **The morning sweep learned a predicate with NO LABEL behind it:** a merged
    PR carrying no `DREAMCRM-<n>` key in its title at all. The other two
    predicates read a label the gate applied; this one cannot, **because a
    label is exactly what untracked work has nobody to apply.** It never wakes
    Forge — §3's off-board count is what it feeds.

  **THE FIFTY-SEVENTH: #712, `tests/guards/rulebook-publish.test.ts` +
  `scripts/rulebook-publish.mjs` (DREAMCRM-128). A NEW CLASS, and the first
  guard here whose subject is a document THIS REPO DOES NOT CONTAIN** — the
  copy of `dreamcrm-conventions` in the Multica skill store, which is the copy
  every agent actually opens. **STATE: on the PR — #712, review requested.**

  **The gap it closes, stated as the asymmetry it is.** DREAMCRM-109 moved the
  rulebook into `docs/rulebook/` so a check could read it, and three now do:
  `rulebook-state` grades its `STATE:` lines, `rulebook-drift` grades the
  claims it makes about the repo, `control-bytes` bans a raw C0 byte in it.
  All three grade the AUTHORED copy. The hop from there to the store was
  graded by nobody, and it has failed both ways: nine `STATE:` lines described
  `main` wrongly for up to six days, and a cp1252 round trip replaced ninety
  characters on 2026-09-14 **while leaving both strings 9,018 characters
  long**. A length match is not a comparison; it is a comparison's shadow.

  **WHAT ACTUALLY FAILS `test` BY NAME, which is the only part of this entry
  that changes a merge.** One new file in `tests/guards/`, and what it asserts
  is the publisher's four predicates — perturbed and watched to fail — plus two
  facts about this tree: that `docs/rulebook/**` passes the publisher's own
  preflight, and that `docs/RELEASE.md` R5 still names the command. Editing R5
  to drop that line now reddens a required check. **The verify itself is NOT a
  required check and may never become one**: it needs a credentialed `multica`
  CLI and `test` has `contents: read` plus one secret, so a version of it
  living in CI would report GREEN without ever reaching its subject — §2a's
  standing convention in its purest form. The enforcement is therefore R5, and
  a red verify stops the go/no-go.

  **FOUR ASSERTIONS RATHER THAN ONE, AND THE REASON IS NOT THOROUGHNESS.** The
  byte compare (A) is a COMPARISON, so it is satisfied by a faithful publish of
  an already-mangled tree: if the repo copy carries the raw C1 byte, A is green
  while the rulebook is wrong. So the encoding rule (C) and the heading rule
  (D) run TWICE — once on the local tree as a preflight that refuses to
  publish, once on what came back. A grades the transport; C and D grade the
  text; neither is the other's proxy. The description (B) is a separate field
  on the store record that A structurally cannot see, and it is the text an
  agent reads to decide whether to open the rulebook at all — a drifted
  description makes a whole section unfindable without making anything look
  wrong.

  **The server offers a `content_hash` per file and it is deliberately not the
  verdict.** Comparing it would be one line and it grades the store against
  ITSELF: a mangling that happened on the way IN produces a hash that honestly
  describes the mangled bytes. The subject is the bytes in the working tree, so
  the bytes in the working tree are what it compares against. The hash is
  printed as corroboration and decides nothing.

  **THE DETECTOR IS THE INVERSE OF THE DEFECT, NOT A LIST OF ITS SYMPTOMS, and
  that is a correction to something already in this repo.** `rulebook-state.ts`
  rule 0 finds mojibake with a hand-kept list of the sequences this office has
  seen — so it is green on every character it was not told about, which is
  §2d's identity-looseness family sitting inside the guard that exists to catch
  encoding defects. `findMojibake` maps each character back through cp1252 and
  asks whether the resulting bytes form a valid multi-byte UTF-8 sequence, so
  it catches a curly quote, an ellipsis, a non-breaking space and an emoji
  none of which has ever been seen mangled here. Its own first draft failed on
  the emoji case by dropping cp1252's five unassigned slots as undecodable:
  every real decoder maps them to their C1 control, and a four-byte
  character's second byte is very often `0x90`. **Collapsing rule 0 onto this
  is a change to a required check's definition and is deliberately not in
  #712** — it is named here so it is not lost.

  **THE STORE MAY ONLY EVER HOLD MERGED `main`, AND THIS IS THE HALF THE ISSUE
  NEVER CONTEMPLATED.** Four assertions all grade whether a publish LANDED;
  none of them asks whether it should have happened. **Within twenty minutes of
  this command existing, the store had been rewritten three times from working
  branches and was serving rules from two unmerged PRs as binding** — found by
  Sentinel reviewing #712, using this command's own `--verify-only` against a
  clean `origin/main` worktree, with a byte offset and a line number. Nothing
  else we own could have said so. **A stale rulebook under-claims; an unmerged
  one INVENTS**, and from the agent side the two are indistinguishable. So:

  - **Publish with `node scripts/rulebook-publish.mjs`, never a bare `multica
    skill update` on `dreamcrm-conventions`.** The bare CLI is how all three of
    those writes happened; it has no precondition and never will.
  - **The write path now refuses a tree that is not merged `main`**, by reading
    each file out of `origin/main` and comparing BYTES — not by checking `HEAD`,
    which refuses the one legitimate mid-PR route (`git archive origin/main
    docs/rulebook` into a scratch directory, published with `--root`, which is
    not a git repository at all) while accepting a clean checkout of a commit
    that is merely ON `main`'s history rather than its tip. The question is not
    where the bytes came from, it is whether they ARE merged `main`.
  - `--verify-only` stays unconstrained. Verifying a BRANCH against the store is
    how you see the gap a PR will close, and the run's closing line says "on
    this tree" either way. Only the write path is bounded.
  - `--allow-unmerged` exists for the watched-to-fail runs §9 owes and for
    nothing else. It is spelled out in full so it cannot be typed by accident,
    and a run that uses it says so on its own first line.

  **What this rulebook may never do, and the reason it is written as prose:**
  paste a specimen of a mangled character. The specimen IS the defect —
  `control-bytes` and rule 0 both grade this tree, and a detector built on the
  inverse cannot tell a document that quotes mojibake from one that is
  mojibake. Every case in the guard is constructed at runtime for that reason.
  The instructions this work grew out of failed their own check by pasting one.

  (**The ordinals record arrival HERE, not merge order.** #697 and #684 merged
  before #698 and #701 and are numbered after them, because this list records
  what has been ROUTED. Reading it as a timeline turns a gap in the intake into
  what looks like a gap in the work.)


**Which repo-settings change goes where.** A setting that changes *which* checks
are required or *who* may bypass them is branch protection: §3's review gate
applies, and it is intake too. A setting that only changes *how* a merge is
performed — `allow_update_branch`, `allow_auto_merge`, the
squash/rebase/merge-commit toggles, `delete_branch_on_merge` — cannot weaken the
gate, because updating a branch re-runs the required checks rather than skipping
them. Those are intake only: tell Forge the same day, no Sentinel request.
Either way it gets written down here. A rule that lives only on the GitHub
settings page has reached nobody.

**The rest of §2 is three files, because what can fail your PR is bigger than the rest of this rulebook combined.** `§2a` is what actually gates a merge — the required checks, who they bind, the workflow census, the `e2e` harness and the axe ceilings. `§2b` is the contrast and design guards inside `test`. `§2c` is the money and tenancy invariants plus the guards holding the CI machinery itself in place. `§2d` is how a guard earns the right to be believed.
