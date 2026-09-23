# §2d. A guard counts only once you have watched it fail

*`dreamcrm-conventions` §2d. `SKILL.md` is the map and carries §§4, 5, 7, 9 and 10 in full.*

## The guard suite has been mutation-tested once

**`docs/GUARD-MUTATION-PASS.md` is the audit of record** (DREAMCRM-50,
2026-09-15, linked from the RELEASE.md Part 5 entry that prompted it). Every
existing guard had its defect reintroduced in the defect's real shape: **42
mutations over 31 guards, seven of them blind, 14 live product defects found
behind the seven.** Read it before you write a tree-wide rule — the traps in it
are cheaper to read than to rediscover — and read it before you treat a guard's
green run as coverage. Tenant scoping came through clean on the first try, all six
guards.

**The finding that generalises: not one of the seven was blind to the defect it
was written for.** Every guard caught its own canonical shape. They were blind to
the same defect written the way this codebase actually writes it — through
`cn()`, after a Tailwind `_`, with a trailing comment, in a directory the guard's
doc comment claimed and its path list did not. **So the mutation that finds
something is the second one, not the first.**

Five guards changed what `test` asserts, and all five can fail a PR that has
nothing to do with guards:

- `server-only-services.test.ts` — **a commented-out banner is no longer
  proof.** The scan ran against raw source, so `// import 'server-only'` read
  as full protection; it strips comments first now. This is the one with a real
  consequence: the banner is what makes a client component importing a service a
  build error instead of database code — table names, query strings, env-var
  reads — shipping to a patient's browser. Nothing had gone wrong; the guard
  could not have told us if it had.
- `no-native-dialogs.test.ts` — bans a bare `confirm('…')` as well as `alert(`
  and `window.confirm(`. The bare form is discriminated from the sanctioned
  `const confirm = useConfirm()` by **argument shape**: a string is the native
  dialog, an options object is the hook. Matching the bare name alone reported
  all 42 correct uses — see "suspect the widening" below.
- `legibility-floor` — scope widened from `components/ui` to **all of
  `components`** (31 dashboard files had never been swept), and arbitrary font
  sizes are now **parsed and compared numerically** against the 12px floor instead
  of matched against a list of spellings, so `text-[11.5px]` and `text-[0.72rem]`
  can no longer walk through. Two faithful third-party chrome mocks are exempted
  with a reason each.
- `retired-tones` — same scope widening, plus the `theme(colors.sky.500/40%)`
  spelling this repo uses for inset rings and shadows.
- `portal-tokens` — now covers the five **token landing pages** patients reach
  from a text or an email, not only the portal tree. `app/r/[token]` is exempted
  with a reason, and that exemption re-checks its own premise in both directions.

`legibility-floor` and `retired-tones` are registered in `blocking-assertions` in
`scripts/review-gate.mjs`, and that is the intake classifier working as designed:
**a scope widening is a reclassification.** Both said `components/ui`, which reads
as one named directory; both now say `components`, which is a product root, and a
rule grading a product root grades everyone's diff. `kpi-numerals` (now reading
`className` through the shared `ownAttrs` tag reader in
`tests/design-system/jsx-attrs.ts` instead of its own regex, and no longer giving
up on a class list over 400 characters) and `site-tokens` (deriving its banned
names from `components/clinic-site/tokens.ts` rather than copying them, and
reporting every offending line rather than the first) were already on that list.

One thing was deliberately left open rather than widened in passing:
`app/r/[token]/review-form.tsx` re-declares the clinic-site surface tokens
locally, which `site-tokens` bans but its scope does not reach. The reproduction
is in the doc.

## A test counts only once you have watched it fail

A guard that has never failed has never been tested — and this applies to every
test you write to prove a fix, not only to the ones called guards. Before you
open the PR:

1. Break the thing the test protects — reintroduce the defect by hand, in the
   tree, **in the shape it actually had**.
2. Run the test and **watch it fail**, naming the site you broke.
3. Revert the break and watch it pass.

Say in the PR description that you did the red run, and on what. "I wrote a
test" is not the bar. A watched red run against the real defect is.

Three ways a test passes while its defect is live, each from an instance we hit:

- **A red run that passes is a broken test, not a clean tree.** The first source
  scan for the raw-brand fill (#548) matched only the literal spelling
  `backgroundColor: brand`, and its red run **passed** — the booking page's two
  worst instances are conditional (`isSelected ? brand : SURFACE`), so the guard
  could not have caught the defect it was written for. Reintroduce the defect in
  its real shape — conditionals, indirection, the `var(…, ${fallback})` spelling
  — because a simplified stand-in only proves the test can see the simplified
  version. When a red run comes back green, the test is what you fix. A
  source-scanning guard has its own version of this: the first draft of the
  per-row `pending` rule (#559) reported CLEAN with both of the defects it was
  written for live, because it walked back only to the *nearest* unclosed `(`
  and a JSX ternary wraps its arms in parens — so above a per-row button it
  found `) : (` and never reached the `.map(` two levels out. Ask about every
  enclosing paren, not the closest one.
- **Assert what the reader actually gets, not a proxy for it.** The MRR guards
  asserted the caption instead of the number, and stayed green with the wrong
  number on screen. PR #540 turned up 22 existing assertions pinned on
  `.rejects.toThrow(…)` that passed the entire time production was showing
  patients an opaque error digest — a thrown server-action message survives in
  the test process and nowhere else. They read the result now.
- **A green guard is evidence only in proportion to what it has been shown.**
  Six of the eleven reviews in the Foundations cycle ended on a guard that
  passed while its bug was live in the tree — in the worst case it reported
  clean with nine instances present, and once rebuilt it found 28 sites instead
  of 2.
- **The identity-looseness family — six regex spellings so far, each paid for
  by a mutation, each waiting for the next tree-wide rule** (a seventh member,
  further down, is not a regex at all — a guard can be loose about what
  its subject IS as easily as about where a name ends). Cite this family by
  NAME, not by ordinal: it has grown four times in two days, and §2b was already
  carrying a stale "fifth spelling" pointer into it. `\b` is **not** a token boundary when your tokens
  contain hyphens — a hyphen is a non-word character, so `\b` after `surface`
  matches *inside* `--c-surface-alt`; use `(?![\w-])`. And `\b` also fails where
  Tailwind writes a `_` — an arbitrary value spells spaces as `_`, which *is* a
  word character, so `\btheme\(` never matches `1px_theme(`. A third, from #557:
  `^` without the `m` flag anchors to the file, not to the line.
  **A fourth, from #588 / DREAMCRM-60 (merged 2026-09-15, `62acd835`): A
  PREFIX IS NOT A NAME.** The axe ratchet found its marker with `indexOf`, so
  renaming `A11Y_BASELINE` to `A11Y_BASELINE_V2` and aliasing the old name left
  every assertion passing while the parser went on reading the *old* literal — a
  mutation that came back GREEN **and changed the code**, which is the worst
  result on the scale. `\b` would not have saved it either, since `_` is a word
  character. **The mutation to reach for: wherever a guard says `includes(`,
  `indexOf(` or `startsWith(` on an identifier, try `<MARKER>_V2`.** Fixed with a
  `(?![\w$])` lookahead and pinned by a unit test.
  **A fifth, from #594 / DREAMCRM-63 (`a90c6f64`, 2026-09-15, found in review):
  A NUMBER HAS NO END EITHER.** The list above reads as being about
  identifiers; it is not. A guard pinning the picture-scale ceiling asserted
  `toContain('const PICTURE_SCALE_CEILING_PX = 12')`, which `= 120` satisfies —
  **4/4 green with the code changed**, the same worst-case result as the
  `_V2` mutation. Fix is the same shape, `(?![\d.])`, and the `.` matters as
  much as the `\d`. The generalisable half is about which mutation to try:
  this is **not a graded loosening**. Past roughly 120px the check is simply
  OFF, because no glyph in an illustration is that tall — so the dangerous
  mutation is the one FURTHEST from the real value, not the nearest. **When you
  mutate a number, try an order of magnitude before you try off-by-one**; a
  guard that survives `12 → 13` and dies on `12 → 120` is telling you the
  ceiling is load-bearing, and one that survives both is not a guard.
  **A sixth, same PR: THE RIGHT STRING IN THE WRONG SCOPE.** The premise check
  for `BRAND_FILL_EXEMPTIONS` has to establish that a decorative mock is still
  `aria-hidden`. Searching the FILE for `aria-hidden` passes — most of the mocks
  in that 1,100-line file carry it, so the assertion would have been satisfied by
  somebody else's attribute while the exempted component quietly became content.
  Asserted on the OWNING component instead. The pattern was exactly right and
  was pointed at the wrong haystack, which is why this belongs in this family
  rather than beside it: **the boundary a search needs is not always inside the
  regex — sometimes it is the region you ran the regex over.**
  **An EIGHTH, from #647 / DREAMCRM-87, found by Sentinel in review before the
  merge: THE SOURCE SPELLING IS NOT THE RENDERED ONE.**
  `tests/marketing/product-mocks.test.tsx` searched the SOURCE for the literal
  `data-mkt-mock="true"`. The exclusion it exists to police runs against the
  **rendered DOM**, where React normalises a valueless JSX attribute — so
  `<div data-mkt-mock aria-hidden="true">` and `data-mkt-mock={true}` each
  produce a node the exclusion pardons and the guard cannot see. Planting the
  valueless spelling on the shared marketing header — which renders on every
  page of the site — left the guard at **4 passed**: the whole site's chrome
  removable from a required accessibility check, green, with nobody prompted.
  This is the family's usual shape one step over. The earlier members are loose
  about where a NAME ends; this one is loose about what a VALUE may be spelled
  as. **The mutation to reach for: when a guard reads SOURCE about something
  that acts on the DOM, mutate to the spelling the framework normalises** — the
  valueless attribute, `={true}`, `={someVar}`. The structural answer is cheap:
  match the attribute with `(?![\w-])` and report the value actually found, so
  an unexpected spelling lands in the rule rather than vanishing from it.
- **Assert the ANSWER, not a proxy for it** — #588 again (`62acd835`). The
  ratchet's "a raise cannot merge unseen" test first checked that the
  gate's *source* mentioned `e2e/axe-baseline-raises.ts`. Deleting the pattern
  from `GATE_RULES` left it green, because the filename survived in a `why`
  string and a comment. Calling `gateFindings(['e2e/axe-baseline-raises.ts'])`
  and asserting on the result fails correctly, because it asks the classifier
  the question the guard is actually about. **A guard that greps a module it
  could have imported is testing the file, not the rule.** Grep an
  implementation only when you cannot run it.
  **The boundary, because this rule has a legitimate exception and §2a is
  standing on it:** a proxy is right when the real answer needs state you have
  **deliberately chosen not to fetch** — and then you name it as a proxy and
  record what it cannot see. The ratchet's own event-name check is that case:
  the genuine property needs `merge-base`, `merge-base` needs shared history,
  and all four jobs fetch `--depth=1` on purpose. The bullet above is the other
  case — a proxy reached for because the real answer looked inconvenient, when
  the module was right there to import. **The question is whether the cost was
  chosen and written down, not whether the check is indirect.** §2a has the
  worked example, including the honest-looking property that read correctly and
  failed at the one case it existed for.
- **A guard that leans on a tool's verdict inherits that tool's blind spot** —
  #603 / DREAMCRM-66 (`5322a489`, 2026-09-15), the seventh member of the
  identity-looseness family above and the first that is not a regex: the loose
  identity here is *"unreviewable" = "git says binary"*. The control-byte guard had two easy shapes available and both
  would have reported CLEAN with the defect live. Re-deriving git's 8000-byte
  binary-sniff window passes `lib/services/acquisition.ts`, whose three raw
  `NUL`s sat at bytes 8750+ — one added comment paragraph from turning the file
  opaque. And `0x08` never trips git's flag at all, yet it had already eaten a
  word out of `docs/RELEASE.md`. **The mutations that found something were the
  two git cannot see**: a control byte past byte 8000, and a `0x08` anywhere.
  So when your rule is about a tool's behaviour, state the property in your own
  terms and gate on that; let the tool's own answer be a SECOND assertion you
  cross-check against. This guard does exactly that — it scans the bytes
  itself, then asks `git ls-files --eol` and requires the two instruments to
  name the same files. The window is reported in the failure message and gates
  nothing. **The trap inside the second instrument: read the `w/` column, not
  `i/`.** `i/` is the blob in the index, so the test failed on a file whose fix
  was already applied on disk but unstaged — a guard that only tells the truth
  after `git add` teaches people to distrust it.
- **Derive an exclusion set from CONTENT, not from paths — then close the hole
  it opens from the other side.** Same guard. Genuine binaries must be skipped,
  and a hand-written path list of them both goes stale on the next PNG and
  becomes the obvious place to hide a file; so a file is skipped only when its
  first bytes are a known binary signature anchored at offset 0. Asking git "is
  this binary?" would have been circular — git had already classified the
  defective file `-text`, which is to say the exclusion would have excluded
  exactly the files the guard exists to find. Content-derivation opens one hole,
  a text file wearing a binary header, and a second assertion fails any file
  whose header and extension disagree. **Mutate an exclusion detector in BOTH
  directions**: forcing `binarySignatureOf` to always-`null` and to always-match
  each went red, which is what makes "derived, not a hiding place" a tested
  claim rather than an intention. (Same move as the derive-from-the-tree half of
  the intake list in §2 — a list you wrote is a list you will forget to
  extend.)
  **THE SHARPENING, from Quinn's review of #647 (DREAMCRM-87): derive it from
  what identifies the SUBJECT, never from the property the CHECK ITSELF
  GRADES.** The binary-signature rule above is already an instance of it — a
  signature at offset 0 identifies the subject, whereas asking git "is this
  binary?" grades the same property the guard exists to test, which is the
  circularity that bullet refuses in so many words. The marketing case is the
  same move in a friendlier costume, and it was declined for this reason rather
  than on cost. The alternative shape considered for `PRODUCT_MOCKS` was *every
  `aria-hidden` subtree whose text is entirely below the picture-scale floor* —
  self-healing, content-derived, apparently the more principled option. It would
  have made `exclusionsHidingReadableText` a **tautology**: that check reports
  text at or above 12px inside an excluded subtree, so an exclusion DEFINED as
  "a subtree with no text at or above 12px" can never return anything, at any
  stop, ever. The instrument that found `EditorMock`'s 16.8px headline and
  `BookingMock`'s 12.8px numeral at 2.97 would have been deleted by a
  definition rather than by anybody's decision. **Test the wording of a proposed
  exclusion against the premise check that is supposed to police it: if that
  check cannot fail by construction, the exclusion is defining its own alibi.**
  And note how the failure DEGRADES, because that is what costs money later —
  under the derived shape those two mocks drop silently OUT of the exclusion and
  are counted as ordinary violations, so the stop fails as "N nodes over
  ceiling" rather than as "an exclusion is pardoning readable text at 16.8px",
  and the cheapest way to green a count-over-ceiling failure is to raise the
  ceiling. Secondary but real: **a declared vocabulary costs a review to widen;
  a run-time derivation costs nothing and tells you less when it breaks.**
- **A suite run before `git add` cannot see a new tree-wide guard — the one
  case where "green" and "green at HEAD" come apart.** Rio's intake,
  2026-09-15, from #606. `trackedFiles()` in `tests/guards/review-gate.test.ts`
  derives the set of whole-tree scanners from `git ls-files`, which is the
  derive-from-the-tree move §2's intake list depends on and is exactly right.
  The cost it carries is this: while a new guard file is UNTRACKED the
  meta-guard cannot see it, so the author's full-suite run was **honestly green
  — 7,976 passed** — and went red the moment the file was committed. Sentinel
  reproduced `1 failed | 7,975 passed` on a clean checkout of the same tree, and
  it cost a REQUEST CHANGES round. Nobody was careless: the run was correct
  about the tree it was given, and it was given the wrong tree.
  **The habit that closes it is one command in a different order — `git add` the
  new file BEFORE the verifying run, not after.** And it is wider than guards,
  because three suite files derive their subject from `git ls-files`:
  `review-gate.test.ts` twice over (the scanner derivation, and the
  `@/lib/stripe` money check) and `control-bytes.test.ts`. A brand-new untracked
  service importing Stripe, or a brand-new file carrying a raw control byte, is
  invisible to the guard written for it on exactly the run you would use to
  certify it. **Every `git ls-files`-derived guard is blind to the file you have
  not staged.** That is the same fault line as the `w/` column trap above seen
  from the other end — that one reads the index when the truth is on disk, this
  one reads the index when the file is not in it yet — and it belongs in this
  section for the section's own reason: a guard the suite cannot yet see has not
  earned the right to be believed, however green the run beside it was.
  **Second instance, 2026-09-16 (#618), and the cost moved.** Two brand-new
  guard files were untracked when their author's full local suite ran green; the
  first CI run was the first run that could SEE them, and it failed naming both.
  Where it landed is the part worth keeping: not on a guard's own subject this
  time, but on the **intake derivation** in `review-gate.test.ts` — the
  `git ls-files` enumeration §2's whole intake half depends on — and the bill
  arrived as a red required check rather than as a REQUEST CHANGES round.
  `review-gate.test.ts`'s own header already records having to add Sentinel's
  planted fixture to the index for exactly this reason, which makes this the
  third time that one file has been the one to trip it. **Nothing about the rule
  changes; read the repetition as evidence that it has to be a HABIT and not a
  fact you know.** It is a property of the machinery that nothing states in the
  workflow's terms, so state it in them: `git add` is a step of the verifying
  run, not of the commit that follows it.
- **If a widened guard lights up everywhere, suspect the guard, not the tree.**
  Twice in the mutation pass a fix reported dozens of hits and was wrong both
  times — the obvious repair to `no-native-dialogs` flagged all 42 *correct* uses
  of our own `useConfirm()` helper. A red run is evidence about the rule before it
  is evidence about the code, in both directions.
- **A note saying a guard shipped is not a guard.** Three places —
  `e2e/axe-baseline.ts`, `docs/UI-BEST-VERSION.md` and its punch-list entry —
  recorded batch 58 as having landed a source rule for white on teal-400/500,
  plus a negative assertion and a stale-exemption check. Only the *positive*
  assertion had landed, and that one grades the palette and can never fail on a
  call site. The product fix was real and complete, so nothing was broken; the
  repo simply believed a rule defended it, for four days, in the three places
  someone would go to check. Writing down that a guard exists certifies its red
  run — and when you are relying on such a note, open the file it names.

**A test name states the case it actually exercises, not the class it belongs
to.** Rio's intake, 2026-09-15, from #579. Eighteen ordering tests were green
while the defect they were believed to cover was live in the tree. The
stale-event case exercised a stale event that would *lower* a total — a real
case, correctly asserted — and was named as though it covered stale events
generally. Nothing in that suite was wrong except a name, and the name is what
the next reader uses to decide the area is covered.

An overclaiming name is worse than no test at all: a missing test asks to be
written, and a name that answers "is this covered?" wrongly is never re-asked.
Name the case (`ignores a stale event that would lower the total`), not the
class (`handles stale events`). The red run above is where this surfaces — when
you break the defect by hand and watch which tests go red, the ones that stay
green while carrying the class's name in their title are the ones to rename or
to widen. Check the name in the same breath as the regex; it is the same gap
seen from the other end.


## Render the SQL when the defect lives in the PREDICATE

*Quinn's ruling, 2026-09-22 (DREAMCRM-96), on the pattern Rio arrived at
in #640; Rio and Sentinel concur. Codified NARROWLY — this is a technique for
one shape of defect, not a house style, and the boundary in part 2 is as
binding as the licence in part 1.*

A test that mocks `@/lib/db` answers every predicate with the same canned rows,
so it **physically cannot see a wrong `WHERE`.** Change the tenant filter, widen
the window, drop a `not exists` — the mock returns what it was told to return
and the test stays green. That is the "a red run that passes" family above with
no regex involved at all: the instrument was never pointed at the thing. When
the defect you are guarding against is predicate-shaped, render the query
through the real dialect instead:

```ts
import { PgDialect } from 'drizzle-orm/pg-core'
const q = new PgDialect().sqlToQuery(recallDueWhereSql(...) as never)
```

**Nine test files already do this** and nothing pointed at any of them, which is
the worst of both worlds — de facto standard and undocumented:
`tests/journey/*-sql.test.ts` (five), plus
`tests/journey/ledger-marker-law.test.ts`,
`tests/billing/trial-milestone-claim-sql.test.ts`,
`tests/messaging/thread-list-bounds.test.ts` and
`tests/patients/recall-sql-parity.test.ts`. Read `recall-sql-parity.test.ts`
first; it is the clearest worked example of all three parts.

1. **Use it when the defect lives in the predicate** — *this `WHERE` matches
   nothing / matches the wrong tenant / matches too much.* That is a recurring
   money-and-tenancy bug shape here rather than a one-off, which is the whole
   argument for making it standard: #640's first query would have pinned a
   practice at `blocked` for the life of the account if the clinic had switched
   off "push my bookings", which is exactly what a clinic with a dead bridge
   does. The measurement that settled the ruling: **reverting one of that PR's
   predicates reddens exactly six tests.**
2. **State its boundary out loud, in the test's own header.** It proves the SQL
   we **render**, not the rows Postgres **returns**. It cannot see a type
   coercion, NULL semantics, a collation or a missing index, and it is no
   substitute for a row-level test when the defect is in the DATA. A rendering
   test whose header does not say this is the exact defect the section below is
   about — a guard describing a reach it does not have — and it is worse here
   than elsewhere, because "we render the SQL" sounds like end-to-end coverage
   to everyone who did not write it.
3. **Assert on the rendered PARAMS and the CLAUSE you care about, never a whole
   golden SQL string.** `expect(q.params).toContain(RECALL_DEFAULT_MONTHS)` and
   `expect(q.sql).toContain('"pms_recall_due_at" is not null')`, not a snapshot
   of the statement. A full-string snapshot goes red on every harmless refactor,
   and **a test people regenerate on sight is a test that has stopped
   checking.** The narrow assertion also says which property it is defending,
   which the snapshot never does.

The red-run discipline at the top of this file applies on top of all three, and
it is what stops part 3 collapsing into a vacuous `toContain`: render the SQL,
then revert the predicate BY HAND and watch the assertion name the clause. A
fragment that appears in every version of the query asserts nothing, and it
looks identical to one that asserts everything.

## A guard's READER is a guard, and nothing downstream can grade it

*DREAMCRM-88 / PR #657, 2026-09-22. The mutation family above is about a guard's
PREDICATE — the regex that decides whether a thing it is looking at is the thing
it is looking for. This is the family one step earlier: the code that decides
what the guard ever LOOKS AT.*

`tests/a11y/class-pairs.ts` read class strings with a single regex for two
years. It could not span a template literal whose interpolation contained a
quote, so **10,021 chunks — 11% of the tree by the PR's count, 6% by a
re-run — were never read at all.** Seven contrast rules and the dimmed-text
rule all sat on it. Every one of them was green.

**Why no amount of watching those rules fail would have found it.** Each rule's
gate is an ABSENCE assertion — *this scan returns nothing*. A reader that
silently narrows makes every one of them **greener**, so the failure mode is
invisible from every direction the existing tests look. §2d's standing rule is
*never gate on the verdict of the tool whose blind spot IS the defect*; this is
that rule turned inward. **The tool whose blind spot is the defect is your own
instrument's front end, and every assertion you own is downstream of it.**

Three things this batch established, all of them worth copying:

1. **A field-of-view change needs its own assertion, and the honest one is
   ADDITIVE over the real tree.** *No token any rule could read is lost.* Do not
   assert chunk-set EQUALITY — a legitimate reader change alters how chunks are
   cut (the old regex matched a quote-free template whole, interpolation source
   included), so the sets differ while the tokens do not. Assert the thing you
   actually mean.
2. **An additive lock proves you did not go backwards. It can NEVER measure what
   neither instrument sees.** It compares new against OLD, so any blind spot the
   two share is invisible to it by construction. Here the shared one is real and
   larger than the one that was closed: the reader is per-LINE, so a MULTI-LINE
   template literal's static text is unread on every one of its lines. Ten
   source lines carry a colour utility no chunk contains, one of them a full
   rule 7 subject. **To measure what an instrument cannot see, compare it
   against the SOURCE, not against its predecessor.** Count the lines carrying
   the thing you grade that produce no chunk containing it — that assertion
   names a residual instead of waiting for someone to trip on it.
3. **A tree-derived additive assertion is green as long as the tree has no
   counterexample — which is not the same as handling the shape.** #657's
   reader has a constructible one (a line that opens a template, holds a quoted
   run in its static text, and does not close on that line). Zero instances
   carry a colour utility today. That is the staged-file blindness at the end
   of this file wearing different clothes: **a guard derived from what is there
   cannot speak about what is not there yet.** Say which of the two a green run
   bought you.

**And the second-copy hazard is not theoretical.** The additive assertion has to
hold a copy of the OLD regex to compare against, and that copy arrived carrying
a literal control byte — the backreference mangled in transit — **twice** while
it was being written, and a third time independently when Forge re-ran the lock
for intake. A silently-broken regex reports a CLEAN TREE, which is the same
false green as the reader bug it was written to catch. The same issue had
already seen it once: a census meant to count one class read 36 sites when the
number was 167. **So a copy of a pattern owes a self-check that it still
matches something it must match** — and note the asymmetry that makes this
urgent rather than tidy: §2c's control-byte guard fails a required check for a
raw control byte in a TRACKED file, so the repo catches this; a pattern you
build in a scratch script or paste into a document has no such guard, and the
only thing standing between you and a vacuous green run is asserting that your
copy still works.

**The one-line version: a rule you have watched fail is a rule whose PREDICATE
you trust. You have not yet learned anything about its EYES.**

## The WIRING between a guard and what it grades is its own mutation family

*Sentinel's intake, 2026-09-23 (DREAMCRM-109, from the 2026-09-22/23 planning
meeting). Seven blocking findings landed in one day and **not one of them was
about the shape of the defect**. Every one was in the plumbing between a guard
and the thing it is supposed to be looking at: the guard was correct, the
defect was real, and they had been quietly disconnected.*

The section above asks you to watch the PREDICATE fail, and the one before it
asks whether the READER can see the tree. This is the third seam, and it is
between them: **the guard's predicate is right, its reader is wide enough, and
the two are not wired to each other.** A guard in that state passes every
review, passes its own fixture, and grades nothing.

Three mutations, in the order they are cheapest to run. Do all three on any
guard that references something by NAME — an id, a command, a fixture path, a
selector:

1. **Rename the id the guard references.** If the guard still passes, it was
   not reading what its name says it reads. This catches the whole family of
   "the constant moved and the matcher kept matching nothing" — an absence
   assertion over an empty set is green.
2. **Make the asserted command a no-op while leaving a satisfying copy
   elsewhere in the file.** A census that counts a STRING rather than a
   POSITION is satisfied by a comment, a heredoc, a disabled step or an
   `if: false` block. The guard reports that the thing is present; the thing
   does not run. This is the mutation that catches a census whose scope is a
   FILE while the property is about a JOB.
3. **Feed the fixture the real defect and check it reddens FOR THE STATED
   REASON.** Not merely that it goes red — read the failure message and
   confirm it names the defect you planted. **#664's stub failed correctly by
   accident**: the assertion went red, the author read "red" and stopped, and
   the redness came from a different branch than the one under test. A guard
   that is right for the wrong reason is a guard whose next edit silently
   turns it off.

**Why this is its own family rather than a bullet under mutation testing.** A
mutation audit asks "can this predicate fail?" and answers it by breaking the
SUBJECT. All three mutations above break the WIRE, and the predicate keeps
passing its own tests throughout — which is exactly why seven of these arrived
on one day without anybody's mutation pass catching one.

**The cheapest tell that you are in this family**: the guard's docblock
describes a property about the RUNNING SYSTEM (a step executes, a command
fires, a file is read) while its code inspects TEXT. That is not automatically
wrong — most guards here read text — but it is the gap where these seven lived,
and it is worth one paragraph in the docblock saying how the text and the
behaviour are tied together.

## A guard's SENTENCE is a claim about a MACHINE — ask which one

**THE WORKED INSTANCE, 2026-09-23 (#685), and it is the cheapest possible
demonstration: it shipped in the same PR that added this section.** A
tree-level assertion claimed "rule 4's narrowing is doing work" by requiring at
least one commentary SHA that was RESOLVABLE and not an ancestor of `main`.
True in a developer's full clone, which still carries the deleted PR-branch
heads. **False on the runner**, which fetches only `main`: there those objects
do not exist, the lookup answers `unknown`, the set is empty, and the assertion
went red **while the guard it was about was working perfectly**. Nobody
reviewing it could see the difference, because the sentence and the code agreed
with each other — they just disagreed with the machine that gates the merge.

**THE THIRD INSTANCE, AND THE EXPENSIVE ONE: THE MACHINE CAN BE THE CI EVENT.**
2026-09-23, hours after the two above. Every job that runs `pnpm test` had a
fetch-of-main step, correctly spelled, pinned by a census that asserted it was
there. On a `pull_request` it transferred main's history. On a `push` to `main`
it transferred nothing — `actions/checkout` had already left main at depth
1 with its tip equal to the remote tip, so there was nothing to fetch —
and `origin/main` resolved with ONE commit. `ci.yml` was honestly green on
every PR; `deploy.yml` was red on every push, and `deploy: needs: test` froze
the production pipeline.

Note what was NOT wrong: the step, its spelling, the census that pinned it, the
tree, and the reasoning about the tree. **The sentence "this job fetches main's
history" was a claim about a MACHINE, and there were two machines.** Ask the
question this section is named for at the level of the RUNNER as well as the
predicate: which event produced this run, and does the step do the same thing
under both? If a workflow triggers on more than one event, that is the first
place to look, and the cheapest fix is usually to remove the state the
difference lives in rather than to branch on it.

The fix is the one this section prescribes: **ask which machine, and then
assert the part that is true on both.** The tree-level claim became "commentary
SHAs EXIST" — which is a fact about the document, not about the clone — and the
behavioural half moved to fixtures, where the answer does not depend on what
anybody happened to fetch. Read your tree-walking assertion and ask: *does this
depend on an object being present, or on the document saying something?* Only
the second kind survives a shallow checkout.


*Forge's intake, 2026-09-22 (DREAMCRM-96/100). Three guards in two days
described a reach they did not have, and all three read green either way.*

- **#657's header** claimed a smaller limitation than its code had. The reader
  did not merely fail to *join* a template literal whose interpolation carried
  a quote; it did not read that chunk **at all**.
- **#658's dual-rendering loop** was whole on Windows and half on the Ubuntu
  runner that actually gates the merge.
- **#658's termination test** asserted a different mechanism from the one that
  terminates the loop.

None of these is a loose regex, so no mutation family above can find them: the
PREDICATE is right and the SENTENCE BESIDE IT is wrong. A green run is
consistent with both readings, which is why the instrument here is a review
HABIT rather than another guard. It costs about a minute per guard:

1. **Read the guard's sentence** — the docblock, the `why` string, the PR's
   claim about what it covers.
2. **Read the code** and ask what it actually matches, joins, walks or skips.
3. **Ask whether that sentence is true on CI, not on the author's box.** Line
   endings, path separators, case sensitivity and locale all differ between a
   Windows checkout and the Ubuntu runner, and only one of those two decides a
   merge. A claim that holds locally is not yet a claim about the gate. When the
   two could differ, say which tree you read — §3's reviewer provenance is the
   other half of this.

**The fix is almost always the SENTENCE, never the code.** Narrowing a true
claim costs nothing and takes one line. Leaving a wide one in place means the
next reader treats an area as covered when it is not — which is the
overclaiming-test-name rule above, one level up: a name answers *is this
covered?* wrongly for one case, a docblock answers it wrongly for a whole rule,
and a rule's docblock is what the next intake reads to decide whether the rule
needs widening at all.

**And a guard you have watched fail can still stop running.** That is a
different property from anything in this file, and it has its own rule: §2a's
*every alarm ships with the thing that notices it stopped.*

## A new check's ENVIRONMENT is part of its correctness

*Sentinel's intake, 2026-09-23 (DREAMCRM-114, from the 2026-09-23 planning
meeting). ACCEPTED as written. The families above cover the wiring between a
guard and what it GRADES; this is the wiring between a guard and the MACHINE it
runs on, and nothing in this file graded that until #685 proved it needed to.*

**Run the new check the way CI runs it, not the way your workdir runs it.**
`tests/guards/rulebook-state.ts` passed on a full local clone and reddened every
CI push, because `actions/checkout` defaults to `fetch-depth: 1` and the guard
reads `git log origin/main`. Neither the author's local run nor the review
caught it. The thing that caught it was production traffic through the pipeline
— a red `main`, a stopped deploy, and every open PR inheriting the failure
through `strict: true`. The repair (#697) was to give every job that runs the
suite full history, which is the right fix and arrived after the outage.

The three differences that have actually bitten here, which is the whole list
worth memorising:

1. **A SHALLOW CLONE.** One commit, no `origin/main`, no tags, no history. Any
   guard whose subject is the repository's own past — merge records, ancestry,
   a comparison against `main` — reads an empty answer and either fails or,
   worse, passes vacuously. §2c's axe-baseline ratchet needed the same fetch
   step in four workflows for exactly this reason; the rulebook-state guard
   needed it in three more.
2. **NO SECRETS.** `test` has `contents: read` and the repo holds one secret. A
   guard that reaches for a token gets `undefined`, and the interesting failure
   is the one that treats `undefined` as "nothing to check" rather than as an
   error. §2a's fail-closed rule applies here and is easy to forget when the
   variable is populated on the box you wrote it on.
3. **NO NETWORK YOU HAVE NOT ASKED FOR**, and a clean environment: no
   `.env.local`, no globally-installed CLI, a different OS, different line
   endings, a different locale, `TZ=UTC`.

**How to satisfy this before review rather than after the outage.** The mutation
is not to the predicate — it is to the environment. Re-run the new guard against
a shallow clone of the repo (`git clone --depth 1` of your own branch into a
temp directory is two commands) with the environment emptied, and check it
reddens FOR THE STATED REASON rather than for a missing file. If the guard
cannot run there at all, that is the finding: **a required check that needs
something CI does not give it is not a check, it is a scheduled outage.**

**And the asymmetry that makes this worth a section rather than a note.** Every
other family here fails in the direction of a guard that cannot find a real
defect. This one fails in the direction of a guard that fails a CORRECT tree, on
`main`, after the merge — where the clearing action does not exist yet and every
other PR in the repo is blocked behind it. It is the most expensive way a guard
can be wrong.

## A never-again guard lives in `tests/guards/`

*Forge's intake, 2026-09-23 (DREAMCRM-114). This is the convention half of §2's
guards census; the check half is `scripts/rulebook-drift.mjs`.*

**If a test's thesis is "this pattern may never appear again", put it in
`tests/guards/`.** Not "this function returns the right answer" — that is an
ordinary unit test and belongs beside the thing it tests. The distinguishing
question is what a failure MEANS: an ordinary test goes red because behaviour
changed, and a guard goes red because somebody reintroduced a shape this repo
has decided against. A guard's audience is the next author, not the current one.

**Why the directory and not a predicate, which is the part that was measured.**
The obvious mechanical answer — "a guard is a test that reads source off
disk" — was tried on 2026-09-23 and hits **81 files outside `tests/guards/`**,
most of them ordinary unit tests, while still missing `hero-lcp-paint`, which
reads its subject out of a rendered stylesheet rather than off disk. Over-broad
by roughly ten times AND blind to that day's actual case. Per §2 a false
positive here costs a red `test` run naming an innocent file, so
registration-by-predicate is the wrong shape and was not built. **A directory is
self-declaring: a file is in it because its author put it there, so the
false-positive rate is zero by construction.** That is the general lesson, not a
fact about this directory — when you need a population and no predicate is both
sound and complete, a declaration beats an inference.

**What the census then buys.** Every file under `tests/guards/` must be named,
by its own file name, somewhere in `docs/rulebook/**`. So a new machinery guard
either reaches this rulebook in the PR that introduces it or fails `test` by
name, and the intake stops depending on somebody choosing to look. **Its honest
limit is that it covers exactly that directory**: the design and accessibility
guards in `tests/marketing/` and `tests/a11y/` are registered by hand in §2b and
nothing goes red if the next one is forgotten. Moving such a guard into
`tests/guards/` is the way to buy it coverage — and moving one OUT is a way to
lose coverage silently, so do not, and say why in the PR if you ever must.

## A rule that holds a population at ZERO ships a field-of-view assertion

*Vesper's intake, 2026-09-23 (DREAMCRM-114). ACCEPTED as a convention;
DECLINED, for now, as a derivation — the reasoning is below, because a declined
half is worth as much on the record as an accepted one.*

**A rule whose gate is "this scan returns nothing" cannot go red when its own
eyes narrow.** That is the reader family above, stated as the obligation it
implies rather than as a lesson: *when you add or widen a rule that holds a
population at zero, the same PR ships an assertion about what the rule can
SEE.* The two shapes already in the tree are both legitimate and are the two
worth copying — `tests/a11y/one-string-pairs.test.ts` compares the chunks its
rule reads against the SOURCE, and `tests/a11y/dimmed-text.test.ts` replays its
own former caller and asserts a count. Pick whichever actually measures the
narrowing you are exposed to, and say in the docblock which one you picked.

**Why not a derivation yet, measured rather than asserted.** It has been
hand-built exactly twice, and Vesper is right that a pattern applied twice by
hand is usually the shape of the next derivation. The reason to wait is that the
two instances do not share a MECHANISM: one grades a reader against source text,
the other replays a caller and counts. A derivation over "every zero-holding
rule" would have to choose which of those a given rule needs, and choosing
wrongly produces a lock that passes vacuously — **the exact failure the lock
exists to prevent, wearing the lock's uniform**, which is the worst outcome
available here. A derivation also needs every such rule to expose its reader as
something callable, and most do not today.

**So the trigger is written down instead of left to memory: when a THIRD
zero-holding rule ships a field-of-view assertion and two of the three share a
mechanism, that is the derivation, and it routes here.** Until then this is a
convention a reviewer enforces, and §3's checklist is where a reviewer reads it.
