# §2b. The contrast and design guards inside `test`

*`dreamcrm-conventions` §2b. `SKILL.md` is the map and carries §§4, 5, 7, 9 and 10 in full.*

**The `test` check also enforces dark-mode contrast parity at the source**
(since 2026-09-14, #555). `tests/a11y/dark-mode-parity.test.ts` plus
`class-pairs.ts` resolve both renderings of any element whose light and dark
modes disagree about which half of a colour pair is overridden — `dark:text-*`
with no `dark:bg-*`, or the reverse — and fail the ones that miss AA. It exists
because the browser suite structurally cannot see this: axe walks one theme, so
every `dark:` rendering in the product was outside its reach, which is how three
chips sat live at 4.01 under a nightly contrast gate. **It holds at ZERO and
carries no baseline**, deliberately — a second inventory of contrast problems
keyed by source location rather than by (stop, rule) would overlap
`e2e/axe-baseline.ts` with different keys, and the first time the two disagreed
about whether something was fixed, neither would be believed again. So a new
offender fails a required check on arrival and there is no ceiling to raise. If a
change genuinely needs an exception, write the reason beside it in the source.

**Rule 1's COMPLEMENT has a rule of its own since batch 68 — see rule 7 below,
and do not read rule 1's silence as a clean pair again.** Rule 1 grades a chunk
only when exactly one half carries the `dark:` override and every participating
utility is opaque; its own header argued the rest away (*both overridden is a
pair somebody chose; neither is one `token-contrast` and axe already cover*) and
batch 64 measured 29 live sites where both halves of that sentence were false.
The two rules now partition one population by reading a single exported
predicate — `isParitySubject` — rather than each describing it in prose.

**The `test` check also grades the brand ramp at the source** — three more
rules living beside the parity scanner in `tests/a11y/class-pairs.ts`, asserted
from `tests/a11y/token-contrast.test.ts`. The first two grade white text
against the ramp; the third grades the ramp itself as text:

- **Rule 2, solid fills** (2026-09-14, #555 — it shipped in the same PR as the
  parity guard above and spent its first day undocumented here). White text on
  `teal-400` or `teal-500` fails. The cutoff is derived, never transcribed: the
  test asserts those two really do sit below AA and that `teal-600` (5.09) and
  deeper clear it, so `SHALLOW_BRAND_FILLS` cannot drift from the palette. It
  carries **exact-class-string exemptions with a reason each** — currently one,
  an `aria-hidden` decorative mock — plus a detector that fails when an
  exemption stops matching anything, so a narrow allowance cannot outlive its
  subject and quietly become a blanket pardon.
- **Rule 3, gradients** (2026-09-14, #564 / DREAMCRM-39, `f9bf4b2`). If white
  rides a gradient, **every stop it names must be a white-text fill** — `from-`,
  `via-` and `to-`, in every rendering, `hover:` included. It holds at **ZERO,
  with no ceiling and no exemption at all.** Grading the stops rather than the
  span is the honest simplification: the ramp is monotonic in lightness, so a
  span between two legal stops is legal throughout.
- **Rule 4, CLIPPED text** (2026-09-14, #566 / DREAMCRM-44, `513315d4`;
  widened from gradient-only to any clipped fill by #594 / DREAMCRM-63, merged
  2026-09-15 as `a90c6f64`). When `bg-clip-text text-transparent` makes the BACKGROUND
  the ink rather than the fill, **every colour that background resolves to must
  read AS text on the light ground** — `teal-600` or deeper, same as rule 2.
  **Since #644 (2026-09-22) that ground is `surface-1` (#F8FAFF), not plain
  `white`** — the ground-move write-up below has the four palette words that
  change verdict and the proof that the ramp cutoff does not. It
  holds at **ZERO**; `CLIPPED_TEXT_EXEMPTIONS` exists for a site that genuinely rides a dark band, and **since 2026-09-15 it
  carries exactly one entry** — the marketing night band's headline
  (DREAMCRM-54, below). The predicted case arriving is not a hole: rule 4 itself
  was not touched, and the exemption carries the measurement. Its cutoff is not
  a second opinion: the WCAG ratio is
  symmetric, so "white reads on teal-600" and "teal-600 reads on white" are one
  measurement, and the test asserts that equality rather than transcribing it.
  Grading against the WORST light surface was tried and rejected, and still is —
  `teal-600` is 4.45 on `surface-sunk`, which would outlaw the step
  `DESIGN-SYSTEM.md` calls the shallowest legal one and leave the repo carrying
  two cutoffs that disagree. `surface-1` is the middle answer #644 took: the
  marketing site's real SECOND ground rather than a worst case borrowed from a
  dashboard well, and `teal-600` reads 4.88 on it — so **one number, three
  rules** survives the move, and is asserted from the palette rather than
  claimed. The bounded cost NARROWS rather than closing: clipped text on a
  ground deeper than `surface-1` (`surface-sunk`, `canvas`) is still graded a
  little kindly, and that is named in the module header along with the dark
  rendering, `hover:` stops and alpha stops it does not see.
  **What #594 widened, and why the name moved with it.** Until then rule 4
  looked for a GRADIENT under the clip, so `bg-teal-400 bg-clip-text
  text-transparent` — a SOLID fill poured into the letterforms — was graded by
  nothing in this repo. Rule 4 wanted `from-`/`via-`/`to-`; rule 2 wants an ink
  spelled `text-white` and this ink is `transparent`; rule 3 wants a `text-white`
  to anchor on; and axe cannot see a clipped background at all. 2.42 on white —
  the same number that started DREAMCRM-44, in the same shape from the other
  side. `clippedInks` now resolves the gradient stops OR the solid fill, same
  ground and same cutoff, a gradient winning when both are present because
  `background-image` paints over `background-color`. **Zero instances existed
  when it shipped**, which is the whole argument for doing it then: a hole closed
  before anybody writes one costs a test, and closed afterwards it costs a sweep
  as well. The exported surface was renamed with the widening — `isClippedText`,
  `CLIPPED_TEXT_EXEMPTIONS` — because a name reading "gradient" over a rule that
  also grades solid fills is §2d's overclaiming-name failure from the other end,
  and the name is what the next author trusts instead of reading the body.

Rule 3 is the one worth knowing about, because it closed a gap no gate in this
repo could see. **axe reports a gradient fill as `incomplete`, not as a
violation** — it will not guess which pixel-column to measure — so
`e2e/axe-baseline.ts` has never carried a gradient and never will; and rule 2
cannot see one either, because a gradient spells its fill `from-`/`via-`/`to-`
rather than `bg-<ramp>-<step>`. The product's single most prominent element sat
in that gap for the whole program: `ActionButton`'s primary ran
`from-teal-400 to-teal-600` under white text, 2.42 at its light end, across
five live sites — found only because somebody measured by hand. **A tool that
answers "can't tell" has not answered "fine".** When a check declines to grade
something, that is the thing to go and measure, and then to build a gate for.

Rule 3 grades `hover:` where rule 1 deliberately does not, and the distinction
is the reusable part: a gradient stop is the surface directly under the ink, so
no ancestor has to be resolved to grade it honestly. Its blind spots are written
in the `class-pairs.ts` module header and every one of them is a false NEGATIVE
by design — alpha stops, variants beyond `dark:`/`hover:`/`dark:hover:`, a chunk
carrying `hover:text-*`, and a gradient whose ink lives in a *different* quoted
string (`call-session.tsx` is exactly that, and had to be fixed by hand). **A
green run is not proof the tree is clean; it is proof that nothing the rule can
see is dirty.** `DESIGN-SYSTEM.md`'s accent-usage rules carry the design-system
statement of the same cutoff — the two move together.

**Rule 4 is the same gradient read from the other end, and rule 3 shipped with
the hole still open.** Rule 3 needs a `text-white` to anchor on; gradient text
has `text-transparent` by construction, so rule 3's own "stays quiet" test
pinned the homepage headline's `from-teal-600 to-teal-400` as a PASS one batch
before anyone measured it at 2.42. Rule 2 could not see it either (the fill is
spelled `from-`/`to-`), and `marketing: home` held **zero** in
`e2e/axe-baseline.ts` the whole time — a clean sheet, because axe never graded
it. Four gates, four different reasons to say nothing, one headline fading into
a white page. The reusable part is not "add rule 4": it is that **when you write
a rule for a shape, write down what the shape's inverse would do to it.** Rule
3's module header named its false negatives honestly and this was not among
them, because nobody asked what happens when the gradient stops being the
surface.

**The `test` check also holds the product to ONE answer for "a solid fill with a
label on it"** — rule 5, 2026-09-15, #585 / DREAMCRM-52, `b4f3b1b9`. It lives in
the same module and the same test as rules 2-4 (`tests/a11y/class-pairs.ts`,
asserted from `tests/a11y/token-contrast.test.ts`), but it is not a brand-ramp
rule and, more to the point, **it is not a ratio rule.** Rules 1-4 ask whether a
pair clears 4.5:1, and a call site may answer that question any way it likes —
which is exactly how the product carried white on `amber-500` (2.13) in the
sidebar count badge and dark ink on `amber-500` (7.18) in the messaging badge
four files away, nobody wrong on purpose and nowhere to look the answer up. Rule
5 asks instead whether the pair **is** `TONE_FILL`: the registry in
`lib/ui/encodings.ts` that now single-homes this shape beside `TONE_PILL` (the
wash), `TONE_TEXT` (the ink) and `TONE_DOT` (the swatch). **A fresh pairing that
CLEARS AA still fails**, deliberately — a second passing answer is how a single
source of truth stops being one; the neutral avatar well measured 5.30 and was
re-pointed with the rest. It holds at **ZERO** with named exact-string exemptions
and no ceiling, and it grades against the registry rather than a transcription of
it, so re-measuring a tone and editing `TONE_FILL` re-grades every call site on
the next run.

Three things to know before you write a tone-coloured badge, chip, done-tick or
avatar well:

- **Look the fill up; do not pick it.** The registry's rule is *one ink
  (`text-gray-900`) for all six tones, then start at `TONE_DOT`'s step and step
  LIGHTER, never deeper, when it cannot carry that ink.* `ok`/`warn`/`neutral`
  stay where the dot is; `urgent`/`info`/`special` each move one step. Worst
  pair in the table 5.36. `TONE_FILL_HOVER` is the hover half and moves lighter
  for the same reason — deepening on hover is the reflex, and it walks the label
  back toward the floor. No recipe carries a `dark:` half: a solid opaque fill IS
  the surface, so adding `dark:text-*` to one is not parity work, it is the exact
  defect `dark-mode-parity.test.ts` exists to catch.
- **The window is narrow on purpose** — an opaque `bg-<ramp>-<step>` on the six
  tone ramps at steps 300-600, in a chunk that also carries an opaque `text-*`.
  The 50/100/200 end is a tone wash and the 700+ end is a dark band; the brand
  ramp is out entirely, because teal is identity rather than status and rules 2
  and 3 already grade it — grading it twice is how two guards start reporting
  the same line differently. Same false-negative direction as every rule in that
  module: a fill and its ink in different quoted strings, or a fill assembled
  through a variable, are invisible to it.
- **The one exemption is `ActionButton`'s `danger`** (`bg-rose-600 text-white`),
  because `VARIANT_CLASSES` is the design system's own single home for a BUTTON
  fill — that pairing is already decided in one place, which is the thing rule 5
  protects rather than the thing it forbids. Its 4.53 against a 4.5 floor is an
  OPEN NOW line on the `docs/UI-BEST-VERSION.md` punch list rather than a silent
  pass, and `deadToneFillExemptions` fails when an exemption stops matching
  anything.

**The reusable part is what a complete sweep does to the scanner that enforces
it.** Once a call site interpolates the registry entry, the fill lives only in
`encodings.ts` and the one-quoted-string scanner cannot see it — so after the
22-site sweep across 16 files, all that is left inside rule 5's own window is the
six recipe strings plus the exemption. A count of what it sees would therefore
prove nothing about whether it still works. The proof is the red run instead:
three breaks restored in their live shapes (the 2.13 sidebar badge caught and
named, the 5.30 avatar well caught as off-registry-but-clearing, and the
exemption's subject moved a step so the stale-exemption detector had to notice),
plus a field-of-view test pinning the tree walk. **When your own fix removes your
guard's subjects, say so in the test and move the evidence to the red run** — do
not let a small window read as a clean tree.

**READ THIS BEFORE THE NEXT FIVE PARAGRAPHS: the night band is GONE from the
homepage.** The book turned light first (#611 / DREAMCRM-67, `02074ff0`, the
owner reversing the dark hero and retitling `BRAND.md` *Daylight Dream*), and the
build followed within hours — **#613 / DREAMCRM-69, `375ce1fb`, Daylight Dream
move 1, merged 2026-09-15**. So the next five paragraphs are now **history plus
live machinery mixed together**, and the way to read them is: the SHAPES they
describe are still the shapes (a band whose ground differs from the page defeats
every automated grader here), while the homepage hero itself is no longer the
example.

**What happened to the four predictions this entry made, because the scoreboard
is the point.** They were written while the decision was landing and the build
was not, and three landed exactly as written:

- **The `CLIPPED_TEXT_EXEMPTIONS` entry was DELETED, not re-pointed, and rule 4
  was not touched.** It carried exactly one entry for one day, and the list is
  **empty again**. On white, `teal-300` at 1.88 and `violet-300` at 2.03 are not
  a grading error — they are the page. Weakening rule 4 to keep a green run would
  have re-opened the defect the rule was built for. **An exemption whose premise
  is scheduled to expire should be met with a deletion, and the red run that
  announces it is the design working.** This is the cleanest instance in the
  program of a narrow allowance not outliving its subject.
- **Part 7 did not shrink; it re-points at the footer**, which is still
  `bg-gray-950`, so the hand-graded discipline and the `gray-500` negative both
  survive. Part 7 now also records the measured daylight run.
- **Part 7's gradient table is measured from `tests/a11y/palette.ts`**, the
  resolver the guards use.

The fourth has **NOT** happened, and it is a live defect rather than a pending
chore: **`scripts/night-band-grade.mjs` still takes the BRIGHTEST pixel under
each run of glyphs, and its own header still says that is "the worst case for
light ink on a dark band".** #613 touched no file under `scripts/`. The hero is
now a light ground carrying dark ink, where the worst case is the **darkest**
pixel — so the tool measures the wrong extreme for the surface it is named after,
and its name is a misnomer on top of that (§2d's overclaiming-name family). It
is a TOOL and not a gate, which is exactly why this can sit wrong indefinitely:
**a reporting-only instrument has no failing run to tell you it went stale.** Do
not quote its number for the daylight band until it flips brightest to darkest —
`BRAND.md` Part 7 is what defends that surface on every run, and the 5.61 that
this tool once produced was evidence about a band that no longer exists. Handed
to the Daylight build (DREAMCRM-69) and recorded here rather than only in a
thread, since here is where the next author will be standing.

**The rest of this block is the original write-up, and the shapes in it are still
worth knowing before you build the next surface like it:**

- **The `CLIPPED_TEXT_EXEMPTIONS` entry must be DELETED, never weakened.** Rule 4
  going red when the hero turns white is the **designed warning**, not an
  obstacle — the entry's whole premise is a dark ground, and §2b's own
  dead-exemption lesson is that an allowance outliving its ground is the failure
  these lists exist to prevent. An exemption whose premise is scheduled to expire
  is the one case where you know the red run is coming; meet it with a deletion.
- **The hand-graded Part 7 table does NOT get smaller, it re-points.** The
  marketing FOOTER is still `bg-gray-950`, so the discipline and the `gray-500`
  negative assertion both survive — read the table as defending the footer (and
  the hero until Daylight lands), not "the hero band".
- **The bloom-under-text risk inverts rather than disappears**, and
  `scripts/night-band-grade.mjs` re-points with it — flip brightest-pixel to
  darkest — instead of retiring. A tool aimed at "the extreme pixel under the
  glyphs" survives a ground inversion by changing which extreme it takes.
- **Part 7's gradient table is now measured from `tests/a11y/palette.ts`** — the
  same resolver the guards use — rather than typed by hand. That is the "a
  Markdown file is a fine place for a measurement and a terrible place for a
  guarantee" rule below, taken one step further: the document and the gate now
  read the palette through one piece of code.

**And it names a trap that is rule 4's documented blind spot arriving for
real: `fuchsia-600` is 4.66 on white and 4.46 on `surface-1`.** It would PASS
rule 4, which graded clipped text against white, and fail the page. Rule 4's
module header predicted exactly this cost (clipped text on `canvas` or
`surface-sunk` graded a little kindly) and the new signature gradient is where
it stopped being theoretical. Fuchsia also gains exactly ONE home in the book —
the gradient's terminal stop — and stays banned as a status colour or a
standalone accent, so do not read "fuchsia is in the palette now" from a
gradient.

**CLOSED on 2026-09-22 by #644 (`9d242b57`, DREAMCRM-87): rule 4 now grades
against `surface-1` (#F8FAFF), not plain `white`.** This is the rule's own
module header being taken up on its offer — it said "if one lands, this is the
paragraph to come back to rather than a ceiling to raise", and this is the
coming back. Read it as the model for retiring a bounded gap, because three
things about HOW it was done are the reusable part:

- **What came back was not a SITE but a STOP.** The header's escape hatch was
  written expecting a new call site on a darker ground. What actually arrived
  was a colour one step off the signature gradient's terminal stop, with
  `app/(marketing)/page.tsx` carrying a comment naming it "the trap" and saying
  it is NOT used. **A person holding a line is not a rule holding it** — that is
  the sentence to take, and it is `BRAND.md` Part 7's "4.18 reads as nearly
  fine" wearing a light-ground costume.
- **`surface-1`, not `surface-sunk`, and the old objection survives intact.**
  Grading against the WORST light surface is still wrong: `teal-600` is 4.45 on
  `surface-sunk`, so that version would outlaw the step `DESIGN-SYSTEM.md` calls
  the shallowest legal one. `surface-1` is the marketing site's real SECOND
  ground — 13 sites spell `bg-[#F8FAFF]` under `app/(marketing)` and
  `components/marketing` — so it is a ground clipped text can actually land on
  rather than a worst case borrowed from a dashboard well.
- **"One number, three rules" still holds, and is ASSERTED rather than
  asserted-about.** The brand-ramp cutoff does not move: `teal-600` is 5.09 on
  white and 4.88 on `surface-1` (legal on both), `teal-500` 3.82 and 3.66
  (illegal on both). Across the whole resolved palette exactly FOUR words change
  verdict between the two grounds and none is on the ramp — `fuchsia-600`
  (4.66 → 4.46), `indigo-500` (4.58 → 4.38), `pink-600` (4.54 → 4.35),
  `rose-600` (4.53 → 4.34). `token-contrast.test.ts` re-derives that list from
  the palette and asserts the ramp's invariance, so "we did not just make it
  stricter everywhere" is a check rather than a claim. That is the §2d rule —
  assert the answer, not a proxy for it — applied to a migration.

**#644 also added the comparison-matrix marks rule, and it is the first here
whose subject is a colour that IS the value.** The three marks on the
comparison page carry no `sr-only`-free text; the glyph is `aria-hidden` with an
`sr-only` word, so the colour is the whole answer a reader came to that page
for, and no other rule in this repo grades it — rule 1 wants a `dark:` half
(this site has none), rules 2-4 want white or a clipped background, rule 5 wants
a registry tone fill. Three assertions, and the middle one is the pattern worth
copying: each mark reads clear of the floor **against its OWN tile**, the three
read as one family rather than one shout and two whispers, and — the field-of-view
guard — **exactly three marks render, so a narrowed scan cannot report clean.**
A rule that has quietly stopped matching anything is the failure §2d is about;
this one asserts its own subject count.

**The night band is the first surface in this repo graded by a DOCUMENT, and
PR #587 put two new classes of assertion into `test` to make that safe**
(DREAMCRM-54, 2026-09-15, `15e0365d`; the direction it implements is `BRAND.md`,
PR #586, `9b418712`, approved by the owner on DREAMCRM-43). The homepage hero
is now a dark band inside a light-mode page, and that shape defeats every automated
grader this repo owns. The reasons are worth knowing before you build the next
one:

- **The parity guard cannot see it** — there is no `.dark` scope, because a dark
  band inside a light page is not a theme.
- **axe cannot see it** — axe grades ink against `background-color`, and every
  decorative layer here (grid, aurora, orbit rings, orb, stars) is a
  `background-image`. `marketing: home` carries no entry in `e2e/axe-baseline.ts`
  and holds ZERO, and the band introduced no finding. That is a true statement
  about what axe graded, not about the band — the rule 3 lesson again.
- **Rules 2-4 grade against the ground that is really under the ink**, and when
  this was written that ground was white for every other `bg-clip-text` in the
  tree. Which is why rule 4 fails this band correctly-in-form and
  wrongly-in-fact, exactly as its own module header predicted before the case
  existed. (Rule 4's ground moved to `surface-1` on #644, above; the band's
  exemption is unaffected — it disputes the ground, not the measurement, and
  `gray-950` is neither white nor `surface-1`.)

So the gate for this surface is `BRAND.md` Part 7 — a table somebody measured by
hand. Both new classes exist because a hand-measured claim is worth nothing on
its own.

**Class one: an exemption's PREMISE, asserted against the source that justifies
it.** The entry added to `GRADIENT_TEXT_EXEMPTIONS` came with a test that the
exempted call site is still inside the surface the exemption describes — the
span must sit inside a `<section>` carrying the night ground AND rendering
`NightSky`. A separate numeric half asserts BOTH directions: the stops really
are unreadable on white (`teal-300` 1.88, `violet-300` 2.03 — the exemption does
not dispute rule 4's measurement, only the ground it was taken against) and
really do clear AA on `gray-950` (9.36 and 8.69), re-derived from
`app/css/style.css` rather than read out of the `why` text.

**The red run is what makes this worth writing down.** Moving the hero back to
`bg-white` left every assertion in that file GREEN. The four dead-exemption
detectors in this repo — `deadBrandFillExemptions`, `deadGradientTextExemptions`
and `deadToneFillExemptions` in `tests/a11y/class-pairs.ts`, plus
`deadExclusions` in `e2e/axe.ts` — all ask whether an exemption still MATCHES
something. **Not one of them asks whether its REASON is still true.** So an
exemption that describes the ink but not the ground goes on pardoning a 1.88
headline long after the ground under it has gone. #587 closed that for the one
entry it added, with three mutations each watched fail — the
`public-action-tenancy` lesson in new clothes, and a narrow allowance outliving
its subject is the precise failure these lists were built to prevent.

**#594 / DREAMCRM-63 closes it for the other three** (merged 2026-09-15,
`a90c6f64`). Each list's `why` makes a claim, and the
claim is now what gets asserted rather than the fact that a class string still
matches something:

| List | The claim its `why` makes | What `test` asserts now |
|---|---|---|
| `BRAND_FILL_EXEMPTIONS` | an `aria-hidden` illustration whose teal-200/300/400/600 bars are a designed progression | the OWNING component still marks *itself* `aria-hidden`, and all four steps are still there |
| `TONE_FILL_EXEMPTIONS` | already decided in ONE place (`VARIANT_CLASSES`), clearing AA at 4.53 | the string is still the `danger` VALUE of that record, with 4.53 and 6.03 re-derived from the palette |
| `DECORATIVE_MOCKS` (`e2e/axe.ts`) | a PICTURE — WCAG 1.4.3 — every finding inside it at 5.8–8.2pt | every contrast finding the exclusion *discounts* renders below the repo's 12px legibility floor |

What that can fail a stranger's PR on, concretely: removing `aria-hidden` from a
marketing mock, moving `ActionButton`'s `danger` fill out of `VARIANT_CLASSES`,
re-pointing `rose-600`, or growing a readable panel inside one of the homepage
hero's illustrations.

**Two details in that table are the transferable part.** First, `aria-hidden` is
asserted on the OWNING component, not on the file: most mocks in that 1,100-line
file carry the attribute, so a whole-file search would have passed on somebody
else's — the §2d identity-looseness family again, in the spelling *the right
string in the wrong scope*. Second, the axe one measures what the exclusion **buys**
rather than what sits inside it. `DashboardMock` and `PortalMock` both carry a
16-16.8px headline that reads perfectly well, so a premise check asking "is
everything in here decorative?" would fire on those — the "208 places to catch 8"
shape that gets a guard switched off within a week. **Assert the thing the
allowance actually pardons, not everything it stands next to.**

A third assertion ships with these and belongs to §2c: a WIRING guard,
`tests/guards/axe-exclusion-premise.test.ts`, so `test` goes red if
`expectNoA11yViolations` stops calling either axe-side detector at all.

**When you write an exemption, write down the fact that makes it legitimate and
then assert that fact.** "The class string still appears somewhere" is
bookkeeping. "The ground this ink rides is still dark" is the rule. That
question is worth asking of every allow-list in the tree, not only this one.

**Class two: a hand-written document table graded against the stylesheet.**
`BRAND.md` Part 7 is now re-derived from `app/css/style.css` on every `test`
run — ten pairs, each required to clear AA on the dark marketing ground, plus a
NEGATIVE pin on `gray-500`, which the marketing footer rendered at 3.42 for
months under a nightly contrast gate for exactly the reasons above. (Since #611
the ground that table defends is the FOOTER rather than the hero, and the
`gray-500` negative survives the retitle for the same reason: the footer is
still `bg-gray-950`.) A ramp edit now re-grades
the band instead of silently invalidating a document. **A Markdown file is a
fine place for a measurement and a terrible place for a guarantee**: if a
document is the only gate a surface has, the document needs a test, or it is a
list of numbers somebody typed once. Building from the book proved that inside
one batch — the mono label size was specified at 0.72rem (11.52px, under this
repo's own 12px floor) and one contrast row had been copied down from the row
above it. Neither could have been caught by reading.

**`scripts/night-band-grade.mjs` is a TOOL, not a gate — know which one you are
quoting.** It renders the page, hides the band's content and takes the brightest
pixel under each run of glyphs, which is the measurement axe structurally cannot
make, and it found a real defect on the way: the caption at 3.40, sitting inside
the product mock's bloom. Bloom pulled in, caption given air, 6.58; worst pair
as shipped 5.61. But nothing in `test` or `e2e` runs it — it needs a `BASE_URL`
and a rendered page. **The 5.61 is evidence, not an invariant.** What defends
the band on every run is the Part 7 table above.

**Rule 5 has no opinion about the band's chips, and that was confirmed rather
than assumed.** They are translucent tints and `gradeToneFillClasses` reads
opaque pairs only. Pinned in both directions — the tint stays quiet, a solid
tone chip fires — with the answer for a future solid chip recorded where it will
be needed: extend the registry, never write a local recipe. `TONE_PILL` is the
wash for a LIGHT ground and the ink steps it pairs are unreadable on a dark one,
so the night band has no registry entry to be off yet. **Asking a rule whether
it applies and pinning the answer costs one test and settles the question
permanently**; the alternative is the next author assuming the opposite.

**The `test` check also grades the PATIENT PORTAL's palette, which is not the
dashboard's** — `tests/a11y/portal-palette.test.ts`, #591 / DREAMCRM-62,
2026-09-15, `15062848`. The portal is a warm cream world with its own hexes,
single-homed in `components/patient-portal/ui.tsx` and banned elsewhere by
`portal-tokens.test.ts`; `token-contrast.test.ts` grades the dashboard out of
the stylesheet and never saw them. Nothing had multiplied the two lists
together. It holds at **ZERO** with no ceiling, worst pair in the portal today
4.60.

**What it cost to not have it is the part to carry.** The slot grid's "taken"
time was a one-off warm grey `#B9B0A5` on a one-off warm well `#F3EEE7` —
**1.85:1**, found by hand in batch 62. Both ends were written raw at the call
site, so neither guard could see it: `portal-tokens.test.ts` bans the hexes it
has been TOLD about, and no `portal:` stop in the browser suite ever loads a day
with a booked slot in it. **The point is the SURFACE, not the ink.** The portal
added inks and washes all program and every one was graded on arrival; what
nobody graded was a new GROUND, because a background reads as decoration until
something is written on it. So the rule is keyed off the token module — a new
`PORTAL_*` hex must declare which half of a pair it is and is then multiplied
against the other half automatically. **When you add a colour, the question is
not "is this ink legible" but "which pairs does this create".**

**The `test` check also holds one control’s busy state to itself** (PR #559 /
DREAMCRM-36, merged to `main` as `b3147d96` on 2026-09-14).
`tests/design-system/shared-pending.test.ts` plus `shared-pending.ts` hold the
product at ZERO for "sibling actions never share one undiscriminated `pending`
flag", by two rules: a group of two or more source sites in one scope carrying
the same bare flag, and — the one it took a review to find — a *single* site
inside a `.map()` whose flag is destructured from `useTransition()` in the same
scope, because that is one source site rendered N times and so can never group.
Like the parity guard it carries **named exemptions with a reason each, not a
numeric ceiling**, so a new offender fails a required check on arrival and there
is nothing to raise. Exemptions are keyed `file|Component|flag`, and the
component name is part of the key deliberately — two components in one file can
each own a `pending`, and an exemption written for one must not quietly cover
the other. Two further tests keep the instrument honest: one asserts each rule
still matches something (a rule narrowed until it matches nothing reports CLEAN
forever), and one pins `partners-table` and `subscription-panel` as *unflagged*,
so the per-row rule cannot widen into reporting eight right answers to catch two
wrong ones.
**Rule 6, the QUIET INK — a neutral ink declared for BOTH themes on an element
with no surface of its own** (PR #597 / DREAMCRM-62, UI batch 64, **MERGED
2026-09-15, `3819a61e`** — routed here before it merged on the DREAMCRM-60
pattern, and flipped by Forge on the merge rather than by its author, which is
the whole point of routing early: the rule was readable the day it was written
and nobody had to be nudged to come back and finish the entry). It lives beside rules 1-5 in
`tests/a11y/class-pairs.ts` (`gradeQuietInkClasses`, `scanForUnreadableQuietInk`)
and is asserted from `tests/a11y/quiet-ink.test.ts`. It holds at **ZERO, with no
ceiling and no exemption list at all.**

Its subject is the family **rule 1 structurally cannot see.** Rule 1 needs both
halves of a pair in one quoted string — an ink and a `bg-` — so it has a surface
to measure against. A label whose background comes from an ancestor gives it ink
only, so it correctly declines to grade, and `text-gray-400
dark:text-gray-500` — `DESIGN-SYSTEM.md` §2.2's line written backwards, in both
themes at once — sat live in **177 sites across 85 files** with four sites in the
tree spelling it the right way up. Six of the eight findings left in
`e2e/axe-baseline.ts` came from that one inverted pair: `#93a0bc on #ffffff =
2.62` on the website hub's three "optional" suffixes and the dream-team field
label, `#93a0bc on #f3f7fe = 2.44` on the saved-views bar's "Views:" chip.

**How it grades with no ancestor, which is the transferable part: against the
BEST CASE its theme allows.** The lightest declared surface in light mode, the
darkest in dark, both derived by luminance from the palette rather than named. An
ink that cannot clear AA on the friendliest surface its own theme offers cannot
clear it anywhere, whatever it actually landed on — so a finding is a **fact
rather than an estimate**, and the rule cannot produce a false positive by
guessing a background wrong. Its cost is one-directional and named: it stays
quiet about an ink that fails only on a less friendly surface. Read it as the
third answer to "I cannot resolve the ancestor", after widening the rule (rule
1's *208 places to catch 8* trade, refused) and declining to grade: **when the
real value is out of reach, grade against the bound that makes your answer true
either way.**

**The narrowing was derived from the rule's own first red run, not chosen up
front** — worth copying as a method. Unconstrained, it also reported 15 sites
spelling `text-gray-300 dark:text-gray-600`, and every one was chrome: a `·`
between two metadata fields, the faint `→` a card reveals on hover, a delete
glyph that appears at `group-hover`. `gray-300` in light mode is below every
floor the sheet names, so it cannot be an ink somebody intended as readable text.
So one half of the pair must name step **400 or 500** — the two steps the
design-system line is literally about. Run the rule wide once, look at what comes
back, and let the tree tell you where the edge is.

**What it deliberately does not see, so nobody reads a green run as a clean
tree.** A **bare `text-gray-400` with no `dark:` half is not graded.** Light
fails at 2.63, dark passes at 6.19 because with no override the surface re-tints
underneath. When rule 6 shipped there were about 194 of those and they went into
the OPEN NOW index in `docs/UI-BEST-VERSION.md` rather than into a widening of
this rule, on the grounds that each needed a per-site look and a rule firing on
194 sites to find the real text is the guard people switch off.

**THAT PASS IS DONE — batch 69, DREAMCRM-88 / PR #656 (Vesper). STATE: MERGED —
`4e127f5e`, 2026-09-22 14:50:48Z, Sentinel APPROVE WITH NOTES** — the notes are
the five sites the reader could not see, and *the shared reader* below is what
came of them. 167
live sites across 70 files; **115 moved to the §2.2 pair** `text-gray-500
dark:text-gray-400` (worst light 4.63 on `surface-sunk`, worst dark 5.73 on
`surface-2`), and **52 were deliberately left alone**. The triage the OPEN NOW
entry wrote needed **two corrections**, and they are the part to carry:

- **Icons were never a separate case.** 2.63 misses 1.4.11's 3:1 as well as
  1.4.3's 4.5, so an icon at that ratio is not a kinder floor, it is the same
  verdict. This document's own parenthesis said so and the entry still listed
  icons as a third answer.
- **There were no genuinely disabled controls in the population.** The one
  element leaning on 1.4.3's disabled exemption without declaring it was the
  paged-table `Previous` arm, and batch 68 fixed it into a real disabled
  button with `aria-disabled`.

**So all three branches collapsed, and the real discriminator turned out to be
the ANCESTOR'S GROUND** — `gray-400` measures 4.99 / 5.83 / 6.71 on `gray-800` /
`gray-900` / `gray-950`, where `gray-500` would fail at 2.47 / 2.89 / 3.32. Of
the 52 left, **22 sit on a dark panel inside a light page** — the Studio chrome,
the demo presenter, the homepage's closing band — where the faint grey is the
correct choice and the sweep would have made them worse; the other 30 are inside
product mock-ups and social previews, where the type is part of a picture.

**The bail is vindicated, and NOT for the reason the entry gave.** The original
argument was volume — 194 sites to catch the real text. The argument that
survives is that the honest rule needs a ground **no source scanner in this repo
can resolve**, which is precisely why rule 6 grades a two-sided ink against its
theme's best case and declines a one-sided one. Widening it to one-sided inks
would not be strict, it would be **wrong 22 times**. Rule 6's module header now
says that instead of carrying the stale "about 194".

**And the residual is named rather than closed, with the cheap instrument named
too.** `e2e/axe-baseline.ts` is `{}`, so every one of these on a stop the E2E
suite walks is already gated at zero. The gap is a bare `gray-400` on a light
surface **no stop renders** — and the thing that closes it is **another stop,
not another source rule**. That is the general shape: when a rule's honest
version needs the rendered tree, add a browser stop and let the browser answer;
a source rule that guesses the ground is a false positive generator with a
docblock.

**The gap rule 6 left open is now CLOSED, and closing it is what makes the
rule's window legitimate rather than improvised.** `DESIGN-SYSTEM.md` §2.2 names
the **ornament step** — `gray-300` / `dark:gray-600`, exempt from the
readable-ink floor because it carries no information, never the sole carrier of a
state, and explicitly **not** `gray-400`, which the stylesheet labels "disabled
only". Decided by Vesper on 2026-09-15 under §8 — a design-system vocabulary
addition is on none of the five owner-gated items — and sent up as an FYI with
the default taken. The neutral ramp now has **three written roles**: readable
ink, the disabled-only step, and the ornament step. Rule 6's 400/500 window
therefore enforces a decision somebody made instead of standing in for one
nobody had, and the two move together — widening the window without widening
§2.2 puts the guard back to inventing the rule it grades.

The sequence is the transferable part: the rule **derived** its window from its
own red run, the window's edge exposed that the design system had no word for
what sat outside it, and the word was written the same day. **A guard whose
scope you cannot justify from a document is telling you the document is missing
a sentence** — not that the guard needs widening. In the wording that stood
before §2.2 was completed: The `·` between two
fields, the arrow that lights up on hover — almost certainly fine, but "faint on
purpose or faint by accident" has no written answer at either end of the ramp, so
each one is a judgement call and rule 6's step narrowing is the de facto rule.
Note what §8 says about who settles that: a design-system vocabulary addition is
on none of the five owner-gated items, so the answer is to decide it, write it
into `DESIGN-SYSTEM.md` §2.2 beside the line rule 6 enforces, and send the owner
an FYI — not to wait.

**Its sibling landed FIRST, as a hotfix, and the two have to stay out of each
other's way.** `tests/a11y/muted-ink-direction.test.ts` (PR #598, `164c2310`,
2026-09-15) is Sentinel's fix for a RED `e2e` on `main` — the same inverted pair,
a different instrument, and the division of labour is worth keeping straight
because §2b's own history says two guards grading one line is how a repo ends up
with two answers for it:

| | what it grades | what it cannot |
|---|---|---|
| `muted-ink-direction.test.ts` (on `main`) | the palette DIRECTION, both halves on every declared surface — light `gray-500` 4.63-5.30 ✓ and `gray-400` 2.29-2.63 ✗, dark `gray-400` 5.73-7.07 ✓ and `gray-500` 2.84-3.51 ✗ — plus an exact-string pin on the two saved-views bars | any other site: it names two files and says so |
| rule 6 (`3819a61e`, on `main`) | every two-sided neutral ink in `app/`, `components/`, `lib/` | the palette direction itself; a one-sided ink |

They are complementary on purpose — one grades the FACT, one grades the TREE —
but they now both assert about the same two files, so an edit to
`components/saved-views/saved-views-bar.tsx` has to satisfy an exact string pin
(`text-gray-500 dark:text-gray-400 mr-0.5">Views:`) as well as rule 6. #597's
branch fixed that site to exactly that string independently, which is luck rather
than design: it does not contain `164c2310` yet.

**One number in rule 6's module header was wrong, and a harmless one was still
worth correcting — fixed in PR #597, with both surfaces named in the prose.**
The header said `#5c6c89` "on the darkest dark surface is
3.32:1". 3.32 is `#5c6c89` on `canvas` (`#10182e`); the darkest dark surface is
`surface-sunk` (`#0c1226`) and the ratio there is **3.51** — the number the
batch's own hand-off table carries and the top of #598's measured range. The
conclusion does not move (every dark surface fails), and the CODE derives the
surface by luminance rather than transcribing it, so the gate is correct and only
the prose is wrong. That is the third instance of this exact failure in §2b —
`BRAND.md`'s contrast row copied down from the row above it, the mono label
specified under the legibility floor — and it lands in the module header, which
is what the next author trusts *instead of* reading the body. **A number in a
header is prose: if the rule derives it, quote what the rule derives, and name
the surface you measured against.**
**RULE 7, THE ONE-STRING PAIR — an ink and its surface written in the SAME
`className`, which nothing in this repo was grading.**
`tests/a11y/one-string-pairs.test.ts` gates it; `gradeSameStringPair` /
`scanForUngradedStringPairs` / `sameStringPairSites` live beside rules 1-6 in
`tests/a11y/class-pairs.ts`. DREAMCRM-88 / PR #655, UI batch 68, Vesper.
**STATE: MERGED — `0211cb72`, 2026-09-22 14:41:37Z, Sentinel APPROVE**, flipped
at the next intake rather than by its author. It holds at **ZERO, with no
ceiling and no exemption list**, and it
introduces **no new number** — the floor is AA out of `tests/a11y/palette.ts`,
the same one every rule above uses.

**READ THIS ONE IF YOU WRITE UI, because it has the widest catchment of any
contrast rule in this repo.** After it lands, **writing an ink and a surface in
the same class string and not measuring the pair fails `test` by name** — and
that is the ordinary way a chip, a badge or a button gets styled. Every rule
above it is narrower: rule 2 wants white on two named brand steps, rule 5 wants
a `TONE_FILL` subject, rule 6 wants a chunk with no `bg-` at all. This one wants
any `bg-<colour>` and any `text-<colour>` in one quoted string. The compensating
property is that a finding here is a **fact rather than an estimate**: the
element carries both ends of its own pairing, so no ancestor has to be guessed.

**The three ways a pair got past rules 1-6, which is why this is a rule and not
a case.** All three are one sentence in rule 1's old header that nobody had
measured:

1. **Both halves overridden.** Rule 1 read that as *a pair somebody chose*. A
   chosen pair can be chosen wrong: `bg-teal-600 text-white dark:bg-teal-500
   dark:text-gray-900` is **4.01 in dark** — the batch-58 defect verbatim,
   near-black ink on `teal-500` — and it was **every sign-in, reset-password and
   accept-invite button in the product**, which is every way a person gets in.
2. **Neither half overridden.** Rule 1 read that as *already covered by
   `token-contrast` and axe*. `token-contrast` grades the pairs the design
   system DECLARES, and `text-red-600` on `bg-red-50` (**2.94**) is declared
   nowhere — `red` was never a v3 tone ramp. axe could see it in the one theme
   it walks, on the one stop that renders it, and never in dark.
3. **The alpha bail, which the punch-list entry had not separated out.** Rule 1
   skips the WHOLE CHUNK when any participating utility is a wash. Correct for
   the wash; it also drops a fully opaque, fully determined rendering on the
   floor. `text-rose-600 bg-rose-50 dark:bg-rose-500/10` had a light rendering
   at **4.12** that nothing graded. **Rule 7 skips a RENDERING with an alpha
   half, not the chunk** — that difference is the whole of gap 3.

**HOW IT PARTITIONS RATHER THAN JOINS, which is the transferable engineering.**
§2b's standing complaint is that two rules grading one line is how a repo ends
up with two answers for it. Rule 7 does not restate rule 1's scope — it
**reads** it: rule 1's grading condition is exported as `isParitySubject` and
rule 7 is defined as its complement, so a future edit to rule 1's scope moves
both rules by construction and cannot open a gap under either. White on the
shallow brand ramp stays rule 2's in both themes (so the deliberately pardoned
`aria-hidden` mock bar is not re-reported one rule over); the BASE pairing of a
solid tone fill stays rule 5's, while a tone fill declared **only for dark** is
graded here because rule 5 never looks at a `dark:` override and deferring it
would hand the rendering to nobody; rule 6 bails on any `bg-` and this rule
requires one, so they cannot both match. **And the disjointness is asserted over
the REAL TREE** — the gate runs rule 7's findings against rules 1, 2 and 5's and
requires an empty intersection — not over planted strings, which is the failure
mode a partition claimed in prose always has.

**Its red run keeps six planted defects, one per way the scanner could be
wrong**, including the CONDITIONAL form — the pair inside a ternary branch of a
template literal — because **batch 57's guard passed its red run green while its
defect was live** on exactly that spelling. The watched-fail was run both ways:
the gate reddened naming all 29 sites before the sweep, and re-planting the
sign-in button's override reddens it again naming
`app/(auth)/signin/signin-form.tsx:170 — dark: gray-900 on teal-500 = 4.01`.

**ONE THING IT IS STRICTER ABOUT THAN WCAG, written down rather than
exempted.** It does not ask whether the element has a text node, so a pair whose
only child is an **icon** is graded at 4.5 where 1.4.11 asks 3:1. **No such site
fails today** — `components/dropdown-filter.tsx`'s `fill-current` button, the
case batch 64 flagged, now reads 5.30 and clears both floors. **If one lands,
the fix is to give the rule a shape it can see, not to exempt the file.** That
is §2's registered-guard doctrine arriving in a contrast rule: a guard that
cannot tell an icon from a sentence should over-report and be told, rather than
acquire a list of pardons keyed on nothing.

**What it does not see**, so a green run is not mistaken for proof — the same
false-negative direction as every rule in this file: an ink and its surface in
DIFFERENT quoted strings (one quoted string is the unit, here as everywhere);
any rendering with an alpha half; `hover:` and the other state variants; and a
colour word this palette does not define (an arbitrary `[#hex]`, a `--c-*`
clinic-brand var). Also a `dark:`-only half with no base spelling, which is half
a decision rather than a pair.

**THE SHARED READER — `quotedChunks`, which decides what ALL SEVEN RULES CAN
SEE, and had a hole in it for two years.** `tests/a11y/class-pairs.ts`;
DREAMCRM-88 / PR #657, batch 70, Vesper, from Sentinel's review of #656.
**STATE: MERGED — `88332a9a`, 2026-09-22 15:36:41Z, Sentinel APPROVE with two
non-blocking notes**, both answered by #658 the same day (below). **No assertion, threshold or number changes** — the floor is still
AA out of `palette.ts`. What changes is the FIELD OF VIEW of every rule on the
`blocking-assertions` list that reads a class string, which is a kind of gate
change this list had not carried before. Read *a widening is not a new rule, and
it is not nothing either* in §2 for why it is an intake at all.

**The defect.** The reader was one regex — a quote, a run of non-quote
characters, the same quote again. A template literal whose interpolation
contains a quote therefore **stops matching entirely**, and its static text is
never read:

```
className={`mt-2 text-xs text-gray-400 ${s.enabled ? '' : 'opacity-50'}`}
```

The two ternary branches match as their own chunks. `text-gray-400` is
invisible. The module header had described this as *"a static prefix is not
JOINED to an interpolated branch"* — which is a **different and much smaller
claim**. Not joining a prefix to a branch is a deliberate false negative;
dropping the prefix is a hole. **When a header describes a limitation, check
that the code's limitation is the one described** — this is the same species as
the three wrong numbers §2b already records, one level up, because the wrong
thing was the *shape* of the claim rather than a digit in it.

**What it cost, and how it was caught.** Batch 69's five missed sites, every one
of them a template literal — and the tell Sentinel found is the one to copy:
`balance-outreach-card.tsx` line 122 is a plain string and **was** swept, line
126 is a template literal on the same card with the same ink and **was not**.
Same card, same surface, opposite outcome is a *syntax* signature, not a
judgement one. Note where the miss landed: #655's own red run plants the
CONDITIONAL form specifically, with a comment about batch 57 passing green while
its two worst instances were live — and #656 shipped the same miss one PR over.

**The fix is a tokenizer, and the single-homing is half the value.**
`dimmed-text.test.ts` carried its own COPY of the regex and therefore its own
copy of the hole. `quotedChunks` is now exported and read by both, so *these two
guards read the same unit* is true by construction rather than by comment.

**The verification is the part worth carrying, because a reader cannot be graded
by the rules that sit on top of it.** Every downstream assertion is an ABSENCE
assertion, so a reader that silently narrows makes all of them greener. The lock
is an additive one — *no class token any rule could read is lost, across the
whole tree* — and it earned its keep immediately: it went red on its first run
against the NEW reader, over a quoted run inside a template's static text
(`` `<div class="…">` ``, the shape an HTML string built in a template has),
which would otherwise have shipped silently.

**Forge re-ran that lock independently rather than reading the claim, and it
holds where it matters: of 78,489 plain-quoted chunks the old reader produced,
ZERO carrying a colour utility are lost.** Three things came back worth writing
down:

- **It is additive over the TREE, not by construction.** There is a
  constructible counterexample: a line that OPENS a template, carries a quoted
  run in the template's STATIC text, and does not close the template on that
  line. `scanChunks` only re-scans the statics when it saw the closing
  backtick, so that run is dropped where the old regex found it. **No instance
  carrying a colour utility exists today**, which is why the assertion is
  green — but green here means *the tree has no instance*, not *the shape is
  handled*. That is §2d's staged-file blindness in a new coat.
- **The reader is per-LINE, so a MULTI-LINE template literal's static text is
  still invisible — on every one of its lines.** This is #657's own defect one
  level up, and it is the larger remainder. Measured against #657's own reader:
  **10 source lines carry an ink or a surface the reader still cannot see, one
  of them a full rule 7 subject** (`welcome-interview.tsx:579`,
  `bg-stone-800 dark:bg-stone-200 … text-white dark:text-stone-900` — it
  passes comfortably in both themes, so there is no defect hiding there today).
  Rule 7's zero is a zero over the population its reader can reach.
- **An additive assertion cannot see this, and that is structural.** It compares
  the new reader against the OLD one, and the old one could not see a multi-line
  template either. **An additive lock proves you did not go backwards; it can
  never measure what neither instrument sees.** To measure that you have to
  compare the reader against the SOURCE — count the lines carrying a utility
  that no chunk contains — which is a different assertion and the one that
  would have named this residual without anybody guessing at it.

**The reusable sentence, which is Vesper's and belongs in this file:** *a sweep
is only as wide as its reader, and "I grepped for the class" is not the same as
"the guard can see the class."* Everything in §2b that holds at ZERO holds at
zero **over what `quotedChunks` returns**. That is the one dependency every rule
here shares, and it is now the one place to go and check it.

**THE FOLLOW-UP — #658 (batch 71, MERGED `acc32c1f`, 2026-09-22 15:51:00Z),
which corrected the LOCK rather than the reader, and promoted the residual above
out of a docblock.** Test-and-docs only; no assertion, threshold or number
changes.

- **The lock's coverage depended on the checkout, not on the code.** Its
  dual-rendering loop was `raw.endsWith('\r') ? [raw, raw.slice(0, -1)] : [raw]`
  — both line endings on a CRLF tree, exactly ONE on an LF tree — under a header
  claiming *both line endings on every platform*. This checkout is **276,016
  CRLF lines against 1,342 bare LF**, and 1,342 is exactly the file count (the
  trailing empty split), so there is effectively no LF content line here at all:
  on Windows the chop was the only thing the assertion ever saw the second
  rendering through. **It was whole here and half on CI, which is the wrong way
  round** — the runner that gates the merge got the weaker assertion. It
  normalises first and grades `[lf, lf + '\r']` unconditionally now. Mutation
  re-run by Forge rather than read: reverting the chop still reddens it, naming
  `components/dropdown-help.tsx: bg-gray-200`.
- **Why both renderings and not the git-normalised blob.** Across 277,358 lines
  not one line's rule verdict differs between the two, so grading the blob would
  make the assertion correct only on the platform CI happens to use — and would
  re-create the original defect in mirror image for a Windows contributor.
  Worth keeping as the reasoning, because "just normalise and grade once" is the
  obvious simplification and it is the wrong one.
- **The termination test asserted the wrong MECHANISM.** `not.toThrow()` catches
  non-termination only via the 20 s `testTimeout`, so a hang would have failed
  it as a timeout while its name said it was about exceptions. `toEqual([])`
  proves the same property and describes it. (Sentinel confirmed the hang from
  outside: guard removed, never returns, killed at 90 s; guard present, 0 ms.)
  **A red run that names the wrong mechanism sends the next reader to the wrong
  place**, which is the cost a green suite never shows you.
- **The apostrophe hazard is LIVE, harmless, and now measured on the record.**
  `app/site/[slug]/new-patients/page.tsx:84` yields the chunk
  `"s been a while and I"` — a run between two apostrophes in prose, carrying no
  class token. It is exactly the false chunk the plain-string rule accepts in
  exchange for never spanning two real strings. On the record rather than
  rediscovered as a bug by whoever meets it next.

**THE RESIDUAL IS NOW AN OPEN NOW ENTRY, AND THAT PROMOTION IS THE PROCESS HALF
OF #658.** The reader is per LINE, so a MULTI-LINE template literal's static
text is invisible on every one of its lines: **25 colour-bearing lines, 23 real,
0 findings**, with `welcome-interview.tsx:579` — a full rule 7 subject — sitting
ungraded for a purely syntactic reason. Closing it means scanning per FILE,
which also deletes the boundary both of batch 70's bugs lived on, so it is a
field-of-view change and wants its own measurement, red run and review.
**A known residual parked in a module header stops being work**: the header is
read by whoever is already editing that file, which is precisely the person who
did not need telling. Put it where unstarted work lives.

**THE CLINIC'S BRAND IS NEVER RAW INK ON TEXT** — `tests/clinic-site/brand-as-text.test.ts`
(#610 / DREAMCRM-62 part 2, UI batch 65, merged 2026-09-15 `bd102e11`). The
mirror of the brand-as-a-SURFACE rule that `brand-fill.test.ts` already owned:
this one grades the brand as the TEXT itself on the light ground. It holds at
ZERO and, unusually, needs **no exemption list at all** — see below.

**Why a clinic's own colour can be a defect: it is TENANT DATA, so the whole
class hides behind whoever is looking.** A practice picks the colour in a well,
and nothing stops them picking pale sage (`#9CAF9F`, 2.17:1 on the warm ground)
or a pale pink (1.75:1). A clinic whose brand happens to be dark has a site that
reads perfectly and files nothing. **So it is graded against the DERIVATION, never
against one tenant's value** — `readableInk(brand, ground)`, which returns the
brand untouched when it clears the floor and darkens along the brand's own hue
when it does not. The guard pins BOTH directions, and the second one is the
load-bearing half: `#1D4ED8` in → `#1d4ed8` out at 6.15, unchanged. Without
that, the rule would license "make it near-black" and quietly delete the brand
from the product to satisfy a floor.

**32 sites spelled `color: brand`, and they were two populations wearing one
spelling** — which is why the earlier batch was right to leave the whole group
alone rather than sweep it. 8 were real copy and are fixed (the intake form's
progress label and section eyebrows, the shop's two navigation links, the Cart
button's own word, and `numbered-steps`' eyebrow, `<h2>` and numerals — a 44px
brand-coloured heading being the most prominent text on the section and, on a
pale brand, the least readable). 2 were icon-only CONTROLS, which owe 1.4.11's
3:1 rather than 4.5. The rest are decorative graphics that 1.4.3 does not grade
at all, and darkening every one of them would have flattened the brand accent
off the whole site to fix nothing. **One spelling is not one population: count
the populations before you decide the sweep's shape.**

**The rule is STRUCTURAL, and that is what removes the exemption list.** After
the sweep every surviving raw-brand ink sits on an `<svg>` or on an
`aria-hidden` element — the markup says "picture, not sentence" instead of a
reviewer's head saying it — so to keep a brand-coloured graphic you say it is a
graphic. Compare the four allow-lists elsewhere in this section: an exemption
list needs a dead-exemption detector and a premise check to stay honest, and a
structural rule needs neither, because the justification is IN the tree. Prefer
it when the shape allows. What it does not see is named in its header: the brand
reached through CSS rather than a `style` prop, the brand arriving as `fill` /
`stroke` / `borderColor` (1.4.11's business), and whether an `aria-hidden`
graphic is honestly decorative — a judgement it takes the markup's word for.

One implementation detail worth stealing: it reads **the whole opening tag**,
not the matched line. The line-based first draft called every surviving `<svg>`
unexplained, because most of them carry the `style` prop six lines below the tag
name. A scanner's unit has to be the syntactic thing the rule is about, not the
line the match landed on.
**THE APP DOES NOT DIM ITS OWN TEXT** — `tests/a11y/dimmed-text.test.ts`
(#612 / DREAMCRM-62 part 3, UI batch 66, **MERGED 2026-09-16, `24b8b13b`**,
widened the same night by #615 `85c11fbe` — routed before merge on the
DREAMCRM-60 pattern and flipped by Forge on the merge). A new CLASS, not a new
case of the portal's rule — see the scoping below, which is the whole
difference.

**The finding is worth more than the rule, because it renames the defect.**
Dimming does not fail; it fails *on ink that was already the quiet answer*. On
`gray-800` it survives (75% = 5.96, 80% = 6.98). On anything already chosen to be
quiet it does not: `gray-500` at 75% = 3.19, at 70% = 2.91; `gray-600` at 80% =
4.25. On a tone or a brand fill it fails hardest — the shared `FilterChip` count
at `gray-600`/70% on its own `gray-100` chip = **3.15**, its active state = 3.84,
and a message SUBJECT in an outbound bubble at white/75% on `teal-600` = **3.61**.
So the defect is **a second quietening of an ink that was already the quiet
step** — word for word what batch 62 found in the portal. Put it beside §2.2 and
the shape is obvious: the design system has ONE quiet step and one ornament step
below it, and an opacity is a third, unnamed, ungraded one. **When a fix keeps
recurring in a new place, check whether the rule you need is about the technique
or about what the technique is applied TO.**

**The scoping is the transferable engineering.** The portal could ban the
technique outright — one palette, three instances. The app has **45 entirely
correct `opacity-*` sites**, so a blanket ban would have fired on 45 to catch 12,
which is the *208-places-to-catch-8* trade this section refuses everywhere else.
So the rule fires only where the element has **declared itself type**: the same
class string carries a text size (`text-xs` … `text-[13px]`) or a numeral class
(`tabular-nums`, `font-mono-num`). Narrow, and unambiguous — an element that sets
its own type scale is type. The left-alone populations were counted against the
tree rather than assumed: 23 inactive controls (WCAG 1.4.3 exempts an inactive
component outright), 22 graphics and chrome, plus every variant-prefixed
`hover:`/`group-hover:`/`disabled:` case and the `opacity-0`/`opacity-100`
animation endpoints, because a momentary state is not the settled colour a person
reads. **Grade the shape, not the ratio**: it composites nothing, needs no
palette and carries no ceiling, and a site that would happen to measure fine is
still an offender — the same call rule 5 makes about an off-registry pairing that
clears AA.

Two things to keep from the batch. **Every fix was a DELETION** — all twelve
sites already carried `text-xs` or `font-semibold` doing the same job, so the
hierarchy survived the dimming's removal, which is why this rule costs nothing to
obey. The one exception is the attachment's `×` remove button, where the hover
affordance moved from `opacity` to the **fill**, so the glyph stops being dimmed
on top of an unpredictable user photo. And the rule's named blind spot cost real
findings: **an opacity alone in a ternary branch**, where the size class sits in
the static half of the template literal — the branches are separate chunks and it
reads one at a time, exactly as `class-pairs.ts` does. Two of the twelve had that
shape and were found by hand. Joining the branches would invent pairings that
never render together, so the honest answer is the blind spot plus the hand pass,
not a wider rule.

**`components/marketing` JOINED THE RULE'S SCOPE ON DREAMCRM-87 (PR #645).
STATE: MERGED — `82ffb7e7`, 2026-09-22 12:13:20Z; live, and STACKED on #642
rather than merely cross-referencing it** — the stacking is the interesting part. The exclusion
that kept the tree out was never about the rule: it was sequenced behind the
Daylight Dream rebuild (`BRAND.md` Part 8), and moves 1-7 are merged, so the
reason expired. What replaced it:

- **A pardon derived from the CHUNK, not from the path.** The directory
  exclusion's own stated reason was about a KIND — "the four hits are inside the
  product mock-ups at 7-9px, far below the repo's own legibility floor, so they
  are pictures rather than small text". `isPictureScale` says exactly that and
  nothing more: an element declaring its own type scale below 12px is not
  reading text. The number is borrowed rather than invented — it is the floor
  `e2e/axe.ts` already calls `PICTURE_SCALE_CEILING_PX`.
- **The hole it opens is closed from the FLOOR's end, which is why the PRs are
  stacked.** Write `text-[0.7rem]` and the dimming rule stops looking; but
  sub-12px type is banned across the dashboard, the portal and the shared
  components by `legibility-floor`, and — only once #642 lands — across both
  marketing trees by `type-floor`. Land #645 first and sub-12px type in
  `components/marketing` would be graded by NOTHING. **A derived exclusion whose
  closing guard is in another PR is not cross-referenced, it is stacked**, and
  that is the transferable call.
- **The pardoned population is enumerated by name** — four sites in `ui.tsx` at
  7.04 / 8.00 / 7.68 / 8.96px, each asserted under the floor by construction
  rather than read off the list, so a fifth arrives as a red diff somebody has to
  look at rather than as silence. The boundary is graded from both sides:
  `text-[12px]` and `text-[0.75rem]` at `opacity-80` still FAIL, and a named
  scale step (`text-xs`) buys nothing, because none of Tailwind's scale is
  sub-12px.

**And the count that motivated the batch was wrong by a factor of seven, which is
its own lesson.** The brief said ~400 opacity sites; the real population needing a
look was **56**, of which **12** were text. The first number counted every fade in
the tree including hover states and animation endpoints. **A grep count is a
population, not a defect count** — grade a sample before you size a batch from
it.

**Its scope was wrong for one day, and the correction is the most reusable
thing in this whole section** (#615, `85c11fbe`, 2026-09-16 — Sentinel's note
on #612, fixed rather than noted). The rule shipped enumerating seven route groups
where `app/` has thirty-five entries: sixteen were never opened and, unlike the
stated exclusions, carried **no reason at all**. It walks `app/`, `components/`
and `lib/` now, with the token landing pages (`app/r`, `app/b`, `app/c`, `app/e`,
`app/g`, `app/i`, `app/n`, `app/w`) **pinned by name** so the widening cannot
silently regress, plus a dead-exclusion detector. Red-verified by planting a
defect in `app/r/[token]/page.tsx` and watching it named by path. **An
enumeration of what a rule LOOKS AT is a claim, exactly like an exemption is —
and the unlisted entries are the ones nobody argued for.** A guard's roots
deserve the same scrutiny as its allow-list; §2d calls a scope widening a
reclassification, and this is the same coin from the other face.

**One exclusion came off because the REASON for it was wrong, and I had endorsed
that reason here.** The earlier wording of this paragraph said the marketing
surface was deferred because #611 is repainting that ground, and called
sequencing behind a moving ground a good reason. It is a good reason for
deferring a MEASUREMENT and it is not one for narrowing a RULE: **this rule
grades a SHAPE, and a shape does not move when a palette does.** `app/(marketing)`
and `app/site` are in scope and clean. What survives correctly is the deferral of
the marketing and clinic-site *measurements* — the 7 decorative-mock sites and
the clinic sites' 10, the latter needing Part 2's
grade-the-recipe-not-one-tenant's-value treatment — both in
`docs/UI-BEST-VERSION.md` with their reasons rather than a vague "later".
**Before a reason narrows a rule's field of view, check whether it is a reason
about the rule or a reason about the work.** Deferring the work is scheduling;
narrowing the rule is a blind spot with a confident label on it.

**And every remaining exclusion is now a MEASURED reason rather than a
category.** Vesper ran the rule's own `gradeChunk` over each excluded tree
instead of gesturing at a kind of thing: three `aria-hidden` emoji glyphs in the
portal (covered by the stricter portal rule), three in clinic-site that are an
`aria-hidden` hover arrow and two editor-only placeholders, four in marketing
inside the 7-9px decorative mock-ups `e2e/axe.ts` already exempts. That is
the #587 premise lesson applied to an exclusion list at birth: **"this tree is
decorative" is a category; "I graded these ten chunks and here is what each one
is" is a measurement.**

## The check-mark veto — the first guard here that grades a SHAPE

*`tests/marketing/tone-tiles.test.ts`, DREAMCRM-71 / PR #617, `3fc12a96`,
**merged 2026-09-16.** It earned §3's review because the diff registers the rule
in `scripts/review-gate.mjs`, and Sentinel's REQUEST CHANGES → APPROVE round is
written onto the PR as §3 requires. Every other rule in this file grades a
colour; this one grades a drawing.*

The owner's second veto on DREAMCRM-67 was **"bland check marks as icons"** —
nine identical blue ticks across the homepage, pricing, the product tour, the
comparison pages and the partner page. `CheckIcon` is **deleted** from
`components/marketing/ui.tsx` rather than left dormant, and the replacement is a
tone-tile vocabulary: a tinted squircle carrying a glyph that says what the line
is about.

What the guard fails a PR on, and why each part is shaped the way it is:

- **Any `d` attribute that is ENTIRELY a check-mark polyline**, under any
  component name or none — one subpath, three points, x rightward, middle
  lowest, last highest — anywhere under `app/(marketing)` or
  `components/marketing`. **Geometric rather than nominal on purpose.** The
  obvious spelling of this defect is already impossible: `CheckIcon` does not
  exist, so re-importing it is a `tsc` error. What a name could never catch is
  the way it actually comes back — hand-rolled in a fresh `<svg>`. **When the
  obvious spelling of a defect has been made impossible, put the rule on the
  defect's shape.**
- **Both directions of the detector are asserted**, which is #609's lesson
  answered at birth rather than after a review: one case feeds it the ticks the
  site really shipped and requires a catch, another feeds it the glyphs that
  replaced them and requires silence. An absence assertion over a clean tree
  cannot tell a working detector from a narrowed one.
- **One exemption, `MatrixMark`, by component and with its premise asserted in
  BOTH halves** — the exempted component must still contain a tick, and must
  still carry the `sr-only` word that makes that tick a VALUE in a
  yes/partial/no matrix rather than an ornament. Take the word away and the test
  fails; the exemption cannot outlive its reason.
- **`ourStrengths` takes a REQUIRED `glyph`**, so a tenth vendor comparison
  cannot compile without deciding what that win is about. An optional field with
  a fallback re-grows the identical mark one vendor at a time.
- **The tone vocabulary, against rule 5.** Every subject resolves to a tone with
  a graded recipe; no tile may reach a tone the brand book withholds (red and
  amber are the app's needs-attention colours and nothing on a sales page is
  urgent; fuchsia stays the celebration accent); and every tile is a tone WASH
  carrying deep ink, which is what keeps it outside `TONE_FILL` by construction
  rather than by exemption. Measured through `tests/a11y/palette.ts`:
  `teal-800`/`teal-200` **6.49**, `emerald-800`/`emerald-200` **5.95**,
  `violet-800`/`violet-200` **5.75**. The `-800` ink because `-700` puts two of
  the three under the floor; the `-200` tint because at `-100` the tile grades
  1.14-1.27 against its own card and is invisible. Step 200 sits outside rule
  5's `FILL_STEPS` (300-600) by construction, as `BRAND.md` Part 7 predicted —
  no exemption entry needed.

**The mutation that found a real hole is the one to remember** (§2d, the
identity-looseness family). Nine mutations were watched fail on the real shape;
the one that came back GREEN with the defect live was a bare tick planted in an
arrow component sitting after `MatrixMark` in the file. Attribution walked back
to the nearest preceding `function`, so `MatrixMark`'s exemption pardoned
somebody else's element and the scan reported CLEAN. **An exemption is only as
narrow as the identity it is matched on**, and "the nearest preceding
declaration" is not an identity.

**Two-tier, against the literal instruction, and the reasoning is the general
one.** Pricing's "Everything included" list is 26 lines and the product tour is
54. A tile on every one of those would be a second identical mark, just a
prettier one — which is the thing the veto was actually about. So on the long
lists the glyph sits ONCE on the group heading and the lines below take a quiet
dash in that group's tone. **A rule against sameness is not satisfied by a new
uniform thing**; read the veto, not its wording. Recorded in `BRAND.md` Part 3
with the withheld tones, Part 7 with the measured table, Part 0 as a decision
record.

## The cinematic spine's stylesheet guards — a premise check pointed at CSS

*`tests/marketing/cinematic-spine.test.tsx`, DREAMCRM-70 / #616, `b728d69a`,
merged 2026-09-16. Bounded, unlabelled, and owed an entry anyway under the #610
ruling: it grades `MarketingMotionStyles` in `components/marketing/ui.tsx`,
which every marketing PR touches. **Extended by DREAMCRM-82 / #633,
`866991f5`, merged 2026-09-17**, which rewrote one of the three bullets below
from a list into a derivation and added two cases, one of them a new KIND for
this file. Routed to intake by its author on the day of merge.*

- **Every `var(--mkt-…)` reference carries its at-rest value as a fallback.**
  This is the enforced PREMISE of the `--mkt-` entry that #616 added to
  `RUNTIME_PROVIDED` in `tests/a11y/css-var-definitions.test.ts`. That guard
  exists because `var(--token)` on an undefined token makes CSS drop the WHOLE
  declaration, invisibly; the spine's tokens are legitimately written per frame
  by the client, so they earn the exemption — and an exemption whose reason
  nothing checks is the `deadExclusions` lesson pointed at a stylesheet. With
  the fallback, a token nothing ever writes renders the resting frame instead of
  dropping a transform. **This is the first time the #587 / #594 premise family
  has been aimed at CSS, and the thing it stops hiding is an invisible dropped
  declaration rather than a bad ratio.**
- **The whole pinned sequence lives inside exactly ONE `@media` gate**, whose
  prelude must name every exclusion — `screen`, `min-width: 1024px`,
  `prefers-reduced-motion: no-preference`, `hover: hover`, `pointer: fine` — and
  **no `.mkt-spine.is-cinematic` declaration exists outside it**. `screen` is
  one word and the one most likely to be tidied away, so it has its own case.
- **Only `transform` and `opacity` are scroll-driven** (`BRAND.md` Part 6): a
  scroll-linked `top`, `height` or `margin` is a reflow on every frame.
  **Since #633 the SUBJECT of that rule is derived rather than enumerated, and
  the reason is this entry's own lesson arriving one level down.** It shipped
  matching a hardcoded alternation of the seven `--mkt-` tokens that existed
  the day it was written — which is a COPY of the component's token set, held
  in the test, exactly as the three revert blocks below were a copy of the
  stylesheet. It drifted the first time the set grew: `--mkt-so`, the scene
  layer's opacity, arrived with the four-scene stage and the alternation did
  not, so **the one new scroll-driven declaration in the batch was graded by
  nothing** and the test stayed green saying so. It now matches every
  `var(--mkt-…)` reference and subtracts one named layout token
  (`--mkt-spine-steps`, the track's length in viewport heights, written once
  inline from a constant and legitimately a `height`), with a detector that the
  exception still matches something — the `deadExclusions` shape, so a
  narrowing subtraction cannot quietly become a blanket pardon. **A guard whose
  subject is a LIST somebody maintains drifts the same way a revert list does,
  and it is the harder one to notice**: the revert list was wrong about
  something present, this one was silent about something absent. Prefer
  "everything of this shape, minus a named exception whose reason is checked"
  over "these seven", every time the set can grow.
  **#636 widened it once more, and that one is a CASE rather than a class**
  (Forge's intake, 2026-09-22): a `--mkt-*` custom-property DEFINITION now
  counts as a legal scroll-driven declaration, because the stage drives its
  beat through `--mkt-k` and then spends it on `transform`. Measured before it
  was accepted — 30 scroll-driven declarations in the real stylesheet, exactly
  ONE pardoned, and three planted escapes (`filter:`, `width:`, and progress
  laundered through a non-`--mkt-` token into `height:`) all still fail. The
  pardon is a pass-through, not a hole: what the token is eventually spent on
  is still graded.
  **Its live blind spot is the token NAME, and it is the same
  identity-looseness family §2d catalogues** (Sentinel, reviewing #636). The
  rule matches `--mkt-` followed by `[a-z-]+`, which cannot match a custom
  property ending in a DIGIT, so `--mkt-k0` at `ui.tsx:241` is invisible to the
  rule entirely — not pardoned, never seen. Harmless today because that token
  is not scroll-driven, and a trap the moment somebody numbers a second beat.
  Widen the character class to `[a-z0-9-]+` rather than adding `--mkt-k0` to
  anything; a guard whose subject is a LIST is the failure this very bullet is
  about, and a character class too narrow to spell the names in the tree is
  that failure wearing a regex.
- **The card's bottom inset is bounded by arithmetic between a FUNCTION and the
  STYLESHEET — a new kind of premise check for this file** (#633). The chapter
  card is anchored to the bottom of the pin now (centred, its top edge landed
  across the scene panel and cut sentences in half), which puts `pinnedCardFits`
  and the CSS into a relationship they did not have before: the function
  guarantees `height <= viewport - 2 x CARD_TRAVEL`, so a bottom inset of at
  most `2 x CARD_TRAVEL` cannot clip the ARRIVED card at any window the pin is
  legal at. The test reads `CARD_TRAVEL` off the stylesheet's own at-rest
  fallback on `--mkt-cy` rather than transcribing it — which is the first bullet
  above being spent rather than merely asserted — then bounds the `clamp()`'s
  ceiling, its floor and its viewport-relative middle stop against it. **The
  edit it stops is not a typo; it is a designer nudging the card up for air**
  (`8vh` to `12vh`, or the ceiling to `8rem`) with nothing anywhere saying what
  the ceiling was for. Where the earlier bullets check that a premise is
  STATED, this one checks that two independently-editable numbers still add up.
- **What `pinnedCardFits` measures is pinned by a case, because the honest
  subject moved** (#633). Each chapter `<li>` is a full-viewport LAYER now, so
  measuring the `<li>` would hand the function `pinnedCardFits(vh, vh)` —
  false at every size, the pin off on every machine, **and every existing case
  still green, because happy-dom reports 0 for both.** The ref is on
  `.mkt-spine-card-glass`, which is also the element `overflow: hidden` clips
  when a card outgrows the window — the defect the function is named for. A
  case now asserts the pin survives a viewport-height layer wrapping a 300px
  card, which fails the moment the ref walks back out to the wrapper.
- **The decorative-stage assertion counts, and derives the count** (#633).
  There are four stages now, written by one `.map`, and all four must carry
  `aria-hidden` — asserted as `stages.length === CHAPTERS.length` and a
  per-stage map, not a check on the first. A check on the first passes on a
  fifth somebody added by hand, which is the same identity-looseness family as
  the `MatrixMark` mutation above.

**What it replaced is the reusable half.** This shipped as three `@media` blocks
reverting `.is-cinematic`, and the test asserted each contained
`position: static`, `height: auto`, `opacity: 1` and `transform: none`. All
three passed while the layout was wrong — the reverts never put back `width`,
`margin`, `pointer-events` or the rail's reserved lane — and there was no fourth
block for `print`, so printing the homepage produced ~3 pages of pinned section
carrying **none of its four chapters**, which is Part 6's "no content is
reachable only by animating" in a medium nobody thought of. **A revert list is a
copy of the thing it reverts, and asserting four of its lines cannot tell you
the copy is complete.** The fix deleted the second list rather than lengthening
it. **When a guard grades a COPY, ask first whether the copy needs to exist** —
a property the test can actually check beats a longer list of lines it can.

## The living stage's particle layer — arithmetic against an ink axe cannot reach

*`tests/marketing/cinema-fx.test.ts`, the `BRAND.md` Part 6 amendment of
2026-09-22 (owner directive) / PR #636, `e2b87c9f`. **STATE: MERGED 2026-09-22.**
Registered on `INTAKE_RULES` by the same diff (`1b0315de`) — see §2, where the
routing story beside it is worth more than the rule. Its subject is a
`<canvas>`: no element, no computed style, nothing for axe or for any
tree-walking contrast rule to resolve.*

The homepage stage gained a particle layer — bursts that are pure functions of
scroll position, plus one ambient mote field. The canvas sits BETWEEN the scenes
and the chapter glass, so a mote never crosses reading copy; the worst it can do
to an ink is tint the ground under it. **That worst case is asserted as
arithmetic rather than measured in a browser**: at `MOTE_ALPHA_MAX` (0.12), for
each of the three tints, the tint over white leaves the stage's body ink
(`gray-600`) at ≥5.5 and its display ink (`gray-950`) at ≥13, and at TWICE the
ceiling — two motes overlapping — `gray-600` still clears 4.5.

- **This is the second guard in the repo to assert arithmetic between a function
  and a stylesheet**, after the spine's `--mkt-spine-steps` pair above, and for
  the same reason: the subject has no DOM answer to read. A canvas is a bitmap.
  `getComputedStyle` has nothing to say about what it painted, so a clean axe run
  says nothing about it — the gradient argument in §6, one layer further out.
- **The ceiling is imported, not retyped.** The assertion grades
  `MOTE_ALPHA_MAX` as the constant the drawing code actually uses, so raising it
  re-grades. Spell an alpha inline at a call site instead and nothing re-grades:
  that is the guard's stated field-of-view cost, the §2d identity-looseness
  family in its newest spelling.
- **Purity is asserted rather than assumed.** A burst is a PICTURE of its
  particles at `t`, seeded; the test drives the same position twice and requires
  the same output, which is what makes Part 6's "one scroll position drives
  everything" checkable once a second clock (the ambient field) shares the
  canvas. The motes' own loop is fenced the same way — it never enters the
  header lane, asserted on drift and on wrap, not only at seed.

**THE SAME FILE GREW A SECOND KIND OF ASSERTION — #659, MERGED `12fc04e4`,
2026-09-22 17:54:01Z (Vesper), and it is not a palette fact.** The stage's
coordinates had been measured once at 1440x900 and stored as fractions of the
frame. The panels have FIXED widths, so on the owner's 32-inch monitor the
cursor and the sparks landed a panel away from the Approve button they were
supposed to be tapping. Every path and burst now names the ELEMENT it belongs
to, the spine measures it at runtime, and the fraction is only a fallback.

- **The guard is a bidirectional contract between two registries and the
  rendered markup.** It renders `CinemaStage` through `renderToStaticMarkup` and
  requires that every anchor a `CURSOR_STOPS` entry or a `BURSTS` entry names is
  present as `data-anchor="<name>"` in that scene — and that every name in
  `SCENE_ANCHORS` is used by something, so the registry cannot quietly outlive
  its purpose. **Both directions matter and only one of them is obvious**: the
  forward half catches a renamed element, the reverse half catches the dead
  entry that a forward-only check would happily carry forever.
- **Watched to fail against the shipped spelling** (§2d): deleting
  `data-anchor="approve"` from `cinema-scenes.tsx` reddens it with *scene 2 must
  render data-anchor="approve"* — the scene and the element both named, which is
  the difference between a red run you can act on and one you have to
  investigate.
- **`frameZoom` and `fxScale` are bounded at BOTH ends**, not just capped.
  `frameZoom` is 1 at and below the 1440x900 design size — it never shrinks the
  laptop layout — `min(width/1440, height/900)` above it, capped at 1.8, so an
  ultrawide is not a taller scene. `fxScale` runs 0.8 to 1.9, and the particle
  radius is asserted to actually grow with it rather than merely to be passed
  the number.
- **`--mkt-zoom` is written by `sizeCanvas` on mount and resize, never by
  `paint`** — so the zoom and the rail lane's `padding-right` that reads it are
  layout that happens a handful of times, not a reflow per frame. The variable
  is on the spine test's tracked-custom-property list, which is what keeps that
  true.

**The reusable half is about WHERE a measurement lives, and it is the second
time this file has paid for the same mistake.** A coordinate measured once on
one screen and stored as a fraction is a constant pretending to be a
measurement: it is correct on exactly the monitor it was taken on, and nothing
re-grades it. The fix is the same shape as *the ceiling is imported, not
retyped* above — **name the thing, measure it at runtime, and keep the frozen
number only as the fallback it actually is.** Note who found this one: the
owner, on his own monitor, because no guard in this repo renders at a size
nobody developed at.

## The drawn-grid veto — the first guard here that grades a DECORATIVE LAYER

*`tests/marketing/no-drawn-grid.test.ts`, DREAMCRM-72 / PR #618. **STATE:
MERGED 2026-09-16, `16dd4fcd`** — it was behind §3's review because the diff
registers the rule in `scripts/review-gate.mjs`, and §2 carried the flip on the
next intake while these three entries did not. Flipped here on the 2026-09-17
reconciliation pass: **a state line that lives in two files is two things to
maintain, and the one nobody is reading is the one that goes stale.** The check-mark veto above grades
the shape of a glyph; this grades a layer painted behind everything.*

The owner's other veto on DREAMCRM-67 was *"i'm not a big fan of thin black
lines making up grids."* Move 1 deleted `NIGHT_GRID` and **the veto was recorded
as closed at one call site.** A second drawn grid — `HERO_DOT_GRID`, a
`radial-gradient` dot tiled every 22px inside `PageHero` — went on rendering on
the other EIGHT marketing pages for three more moves, under a different name in
a different component, while a sentence in a document said the veto was shut.
That is the tone-tile census lesson arriving a second time, and it takes the
same answer: **something has to ask the tree, because a sentence cannot.**

What it fails a PR on, anywhere under `app/(marketing)`, `components/marketing`
or `lib/marketing`:

- **A lattice, stated geometrically: a gradient that repeats on a fixed pitch.**
  Two spellings produce one — a `backgroundImage` containing `gradient(` in the
  same object literal as a `backgroundSize` (the tile pitch, which is what turns
  one soft wash into a ruled field), or a `repeating-linear-gradient` /
  `repeating-radial-gradient`, which carries its own pitch and needs no
  `backgroundSize` at all. The second has **zero instances today**, and that is
  the argument for adding it now rather than later (the #594 reasoning): a hole
  closed before anybody writes one costs a test, and closed afterwards it costs
  a sweep as well.
- **The unit read is the enclosing OBJECT, brace-matched outward** — not a
  window of N lines. The pitch and the image it tiles are two properties of ONE
  declaration, and a line window pairs a `backgroundSize` with whichever
  `backgroundImage` happens to sit near it.

**The discrimination is the whole guard, and it is derived from what the tile
PAINTS.** The film grain (`DAY_GRAIN`) is also a tiled background — an inline
`feTurbulence` at 140px — and `BRAND.md` Part 1 asks for it by name, *"a fine
film grain so the light has a surface"*, with Part 7 grading the hero with it
on. Noise has no lattice in it; that is what makes it noise. So the rule asks
whether the tiled image paints a `gradient(` or a data-URI, rather than keying
on a name, a path or an exemption entry — **the grain is safe by construction,
and moving it to another file cannot break either half.** The blooms
(`DAYLIGHT_BLOOM`, `PAGE_BLOOM`) are gradients with NO `backgroundSize`: one
wash across a band, no pitch, not a lattice — pinned in the test so the rule
cannot drift into banning gradients.

**Why nothing else in this repo could have seen it.** axe reads
`background-color` and a lattice is a `background-image`; every class-string
scanner here reads Tailwind utilities and this recipe is a style object; every
other rule in this file grades a pair, a ramp, a fill or an ink direction. A
decorative layer is a fourth kind of subject.

What it cannot see, so nobody reads a green run as more than it is: a lattice
drawn as an `<svg>` of `<line>` elements, as a repeated `border-right` down a
flex row, or as a pair of Tailwind ARBITRARY utilities rather than a style
object. None has appeared in these trees; the third is the cheapest to add if
one does. **One authoring note worth stealing:** that third case is *described*
rather than spelled in the test, because Tailwind 4 scans `tests/` along with
everything else — writing the class in a comment MINTS it, and the CSS build
then tries to resolve its `url()`, breaking `next dev` and `next build` from
inside a comment.

Watched fail (§2d) on the real defect — `HERO_DOT_GRID` restored verbatim in its
shipped spelling, named by file and by declaration — and mutated in both
directions: `isDrawnLattice` forced always-true reddens on the grain (proving
the grain clause is load-bearing), forced always-false reddens the fixture
cases.

## The 12px floor over the marketing site — a rule's FIELD OF VIEW, widened twice

*`tests/marketing/chrome-legibility.test.ts`, DREAMCRM-72 / PR #618. **STATE:
MERGED 2026-09-16, `16dd4fcd`**, behind the same review. The #615 shape, second
instance: what changed is what an existing floor LOOKS AT, not what it asserts.
**Renamed to `tests/marketing/type-floor.test.ts` and widened again by
DREAMCRM-87 / PR #642 — see the block at the end of this section for what moved
and what its STATE is.***

`BRAND.md` Part 4 sets the floor in plain words — *"No `text-[11px]`, no
sub-0.75rem literals"* — and `tests/a11y/legibility-floor.test.ts` already holds
it. It also **skips `components/marketing` wholesale**, for a good reason: the
product mocks in `ui.tsx` imitate a real screen at 7px, and a tree-wide floor
over that file would report ~90 right answers to catch two wrong ones, which is
the "208 places to catch 8" shape that gets a guard switched off in a week.

**The skip is keyed on a DIRECTORY while the exemption is about a KIND of
thing**, and those two came apart: the shared chrome lives in the same directory
as the mocks and owes the floor like any other reading text. Two literals were
live under it on every page of the marketing site when this was written — the
footer's CC BY line at `0.72rem` (11.52px) and the header megamenu's
descriptions at `0.74rem` (11.84px), both text a visitor is meant to read.
Neither is `text-[11px]`; both were caught by multiplying the rem value out
rather than by looking at it, which is the same arithmetic slip Part 4 already
records against the mono label.

So the scope is **the components, not the directory**. It names the shared
chrome — `chrome.tsx` whole, because the file *is* the header, plus
`MarketingFooter`, `PageHero`, `Eyebrow`, `SectionTitle`, `PrimaryCta`,
`GhostCta` and `MarqueeStrip` inside 1,600 lines of mostly-mock `ui.tsx` — and
leaves the mocks out **by construction rather than by an exemption list**: a
mock is never inside one of those bodies, so there is nothing here to go stale
into a blanket pardon. The trade is a false NEGATIVE, stated rather than hidden:
a new chrome component not added to the list is not graded. That is why a
premise case fails loudly when one of the named components is renamed, instead
of quietly scanning nothing.

**Take the generalisation, because it is the transferable part.** An enumeration
of what a rule LOOKS AT is a claim exactly as an allow-list is (#615), and a
path-keyed skip standing in for a kind-keyed exemption is the weakest form of
it — it holds only while the directory and the kind happen to coincide, and
nothing goes red on the day they stop. Ask it of every scoped guard: **is this
skip about a PLACE or about a KIND, and are those still the same set?**

Also deliberately out of view, so a green run is read correctly: sizes that are
not `text-[…]` literals (`text-sm` and friends resolve through Tailwind's scale
and none is under 12px, and a size assembled through a variable is invisible —
the false-negative direction every source scanner here has); `MONO_LABEL`, a
shared constant pinned at 0.75rem in Part 4's prose rather than re-derived here,
because two guards grading one string is how they start disagreeing; and
everything outside the chrome — `CinemaStage`'s two `0.72rem` literals at real
reading size are recorded in `docs/RELEASE.md` Part 5 rather than absorbed.

Watched fail on both live literals restored to their shipped spellings, named by
component and by px; the extractor was mutated too — forcing it to return the
WHOLE file reddens on the mocks (the scope is real, not decorative), forcing it
to return an empty string reddens the premise case instead of passing silently.

**WIDENED AND RENAMED ON DREAMCRM-87 — `tests/marketing/type-floor.test.ts`
(PR #642). STATE: MERGED — `f004444d`, 2026-09-22 10:27:21Z; the widened rule
is live and can fail a stranger's PR.** Everything above is the DREAMCRM-72
version and stays true as history. What moved:

- **The scope is both marketing trees, graded BY COMPONENT.** `app/(marketing)`
  was in no `SCAN_DIRS` any guard walks, under any exemption, for no stated
  reason — eight literals were found there over four sweeps and every one closed
  because somebody happened to be rebuilding the element it sat on, which is the
  right way for a literal to get fixed and the wrong way for a FLOOR to get
  enforced. And the directory-versus-kind gap this section already names came
  apart a SECOND time after it was written down: `CinemaStage` is the product at
  full bleed at real reading size, it lives in `components/marketing`, and it
  carried two 11.52px literals for a week. Naming the eight components it graded
  was never going to hold.
- **THE DIRECTION OF THE COST INVERTED WITH THE SCOPE, and that is the part to
  carry.** The old version listed what it GRADED, so its cost was a false
  NEGATIVE — a new chrome component nobody added to the list was not graded. The
  new one enumerates the EXEMPTIONS instead: thirteen registered product mocks,
  each with a written reason and its own premise asserted. So the cost is a
  false POSITIVE — a genuinely new mock fails `test` until somebody registers it
  and writes the WCAG 1.4.3 sentence. **For a floor that is the right
  direction**, and it is the same reclassification `legibility-floor` and
  `retired-tones` went through on DREAMCRM-50. What a stranger feels:
  `text-[0.7rem]` anywhere on the marketing site now fails a required check, by
  file, line, component and px.
- **`aria-hidden` is the asserted PREMISE, never the justification.** Eleven
  entries rest on the mock marking its own outermost element `aria-hidden`,
  re-derived on the OWNING component's body rather than on the file — `ui.tsx`
  carries `aria-hidden` in a dozen places, so a file-wide search would be
  satisfied by somebody else's attribute while this component quietly became
  content. The other two entries are file-local helpers (`StatusPill`, `Avatar`)
  whose pardon is derived from WHERE they render: exporting one, or calling it
  from outside a registered mock, fails rather than widening quietly.
- **Comments are blanked before anything is counted, offsets preserved**, and
  that is load-bearing rather than tidy:
  `app/(marketing)/resources/guide-ui.tsx` quotes `text-[0.72rem]` in a docblock
  while explaining its removal, and a re-derivation that counts a comment
  reports a defect that is not there.
- **The mutation that matters is the one that stayed GREEN.** Forcing
  `isRegisteredMock` to always-FALSE reddens the floor at once — 104 literals
  arrive. Forcing it to always-TRUE left every test green, because each
  sub-floor literal in the tree today is already inside a registered mock, so a
  pardon-everything detector and a correct one produce the same set. **A widened
  pardon has to fail on a CONSTRUCTED case or it cannot fail at all** — which is
  why the detector is graded against `PageHero`, `MarketingFooter` and
  `cinema-scenes.tsx`'s own same-named `Avatar` rather than only against the
  real tree. Put that beside §2d's mutate-an-exclusion-in-both-directions rule:
  **the second direction is not always reachable from the repo as it stands, and
  when it is not, you build the case rather than recording that it passed.**

Its blind spots are unchanged and still named: a size that is not a `text-[…]`
literal; `MONO_LABEL`, pinned at 0.75rem in Part 4's prose rather than
re-derived here, because two guards grading one string is how they start
disagreeing; and a literal inside a nested arrow component, which is reported as
`<no component>` and FAILS — the safe direction, with a test asserting that
population is empty today.

## The product-mock marker — the first guard here whose subject is a VOCABULARY

*`tests/marketing/product-mocks.test.tsx`, DREAMCRM-87 / PR #647. **STATE:
MERGED — `71f4037e`, 2026-09-22 11:55:16Z; live.** A new CLASS, and the reason is
worth stating exactly: every other rule on §2's blocking-assertions list grades
a colour, a glyph's shape, a decorative layer, a layer's arithmetic or a type
size — something a file CONTAINS. This one grades what a WORD is allowed to
mean, and where it may be written.*

The word is `data-mkt-mock="true"`. It is the first half of `PRODUCT_MOCKS` in
`e2e/axe.ts`, the exclusion the new `marketing: product` axe stop holds a
ceiling of ZERO on the back of. **An exclusion is the one thing in that harness
that can only ever make a gate LOOSER**, and this one is spelled as an attribute
anybody can type, so the population has to be enumerable from the source rather
than only observable in a browser. Three assertions, each closing a different
way the marker could quietly widen: **both halves on the same element** (the
marker without `aria-hidden` is exempt from nothing — a silent no-op now and a
confusing red stop later); **it still matches something** (a rename that empties
an exclusion makes it report clean forever — `deadExclusions` catches that too,
but only on a browser run, and this catches it in `test`); and **it has not left
the drawn screens** (every use in `components/marketing/ui.tsx`, the one
deliberately path-shaped assertion here, because a use anywhere else is somebody
about to exempt a real surface from a required accessibility check).

**THIS SECTION CARRIED A FALSE CLAIM FOR ONE RUN, AND THE CORRECTION IS THE
MOST USEFUL THING ON THE PAGE.** As first routed it said, following the PR's own
`scripts/review-gate.mjs` comment: *"writing `data-mkt-mock` anywhere under
`app/`, `components/` or `lib/` outside `ui.tsx` fails `test`, and so does
carrying it without `aria-hidden="true"` on the same element."* **That is not
true of the tree as it stands.** Sentinel's review of #647 (2026-09-22,
REQUEST CHANGES, one blocking finding) found that `markerUses` searches the
SOURCE for the literal `data-mkt-mock="true"`, while the exclusion runs against
the RENDERED DOM — where React normalises a valueless JSX attribute. So
`<div data-mkt-mock aria-hidden="true">` on the shared marketing header, which
renders on every page of the site, is pardoned by the exclusion and invisible to
the guard: **4 passed**, green, nobody prompted. Nothing was ever live, and
Vesper owns the one-line fix (`/data-mkt-mock(?![\w-])/`, plus reconciling
`e2e/axe.ts` and `ui.tsx`, which disagree today about whether the selector is
the presence form or the `="true"` form). What a stranger feels is therefore
**what the rule will claim once that lands**, not what it claims today, and this
paragraph stays until the fix is on `main`.

Two things about the episode outlast the fix:

- **A rule the rulebook believes in is worse than no rule**, which is Sentinel's
  phrasing and the reason this correction is not a footnote. An intake copies a
  PR's own sentence about itself into a document agents trust more than the
  code; when that sentence is aspirational, the intake laundered it into a
  guarantee. **Read the guard's matcher, not its docblock's summary of the
  matcher** — the two came apart here in the one direction nobody checks.
- **It is §2d's identity-looseness family in a value costume**, now its eighth
  member and written up there: the earlier members are loose about where a NAME
  ends, this one about what a VALUE may be spelled as. The mutation that would
  have caught it — plant the valueless spelling on `chrome.tsx`'s header — is
  one line, and it is the mutation the watched-fail list did not carry.

Three things to take from it:

- **The claim moved to the component that makes it.** `[aria-hidden="true"]`
  alone was the obvious replacement selector, and it is the blanket pardon §2d's
  third rule is about — the author saying "not content" is a weaker claim than
  "this is a picture", and it sits on hundreds of unrelated decorative things in
  this repo. A page can place a mock anywhere; only the mock knows it is a
  drawing of our own product at reduced scale, so the mock says so. **When an
  exclusion needs a justification a selector cannot carry, move the declaration
  to whoever can make it — and then guard the vocabulary**, because an attribute
  is cheap to type.
- **The count is asserted, and that is why the comment stripper exists.**
  `ui.tsx`'s own docblock quotes the marker while explaining it, so the first
  draft counted twelve uses for eleven elements — and the phantom PASSED the
  both-halves rule by accident, because walking back to the nearest `<` from
  inside a comment lands somewhere arbitrary and the slice happened to contain
  somebody else's `aria-hidden`. §2d's "the right string in the wrong scope",
  found by reading a COUNT rather than by reasoning about the pattern.
- **It says nothing about whether a marked subtree is still picture-scale**, and
  says so. That question needs a rendered page, and `exclusionsHidingReadableText`
  answers it on every run of the stop — it found two the day the marker shipped
  (`EditorMock`'s 16.8px headline and `BookingMock`'s 12.8px day numeral, both
  2.97 on the fictional clinic's sage), and both were FIXED rather than pardoned,
  which is what let the stop hold zero instead of a ceiling.

**AND THE THIRD QUESTION NEITHER OF THOSE ASKS — `tests/guards/axe-exclusion-premise.test.ts`,
Quinn's #650, stacked on #647. STATE: MERGED — `180955c7`, 2026-09-22
12:28:05Z; live.** A new class on
an already-registered file: that guard held whether the two exclusion CHECKS
stay wired; it now also grades the SELECTORS themselves. **An axe exclusion
whose selector is satisfiable by `aria-hidden="true"` alone fails `test`.**

The gap was reproduced rather than reasoned about: replacing `PRODUCT_MOCKS`
with `['[aria-hidden="true"]']` — the exact blanket pardon `e2e/axe.ts` spends a
paragraph of its own docblock refusing — left `pnpm test` at **8,262 passed**,
identical to the unmutated run. Green with the code changed, §2d's worst result.
`e2e` does not close it either, so it is not a check in the wrong place:
`deadExclusions` passes trivially (the attribute is on hundreds of elements) and
`exclusionsHidingReadableText` fires only on ≥12px text that is ALSO failing
contrast, of which `/product` has none once #647's two fixes landed. Both
instruments report clean; the widened pardon buys nothing today and hides
whatever grows a defect next, anywhere on the site.

- **The property, stated in its own terms rather than as a spelling.**
  `[aria-hidden="true"]` is the author saying "not content". WCAG 1.4.3 exempts
  something stronger — "this is a picture" — and only the second claim justifies
  taking a subtree out of a required check. So **the attribute may be a
  necessary HALF of an exclusion and never the whole of one**: strip it, and
  what remains must still restrict to something. A combinator is not a
  restriction — `* > [aria-hidden="true"]` leaves a non-empty remainder and
  pardons just as widely, so the remainder must carry a class, an id or a second
  attribute.
- **Why it slipped is the transferable part, and it is the #642 lesson again
  from the other end.** `e2e/axe-selftest.spec.ts` ALREADY pinned this exact
  trap — its comment reads *"A bare `[aria-hidden="true"]` would exempt the
  whole hero"* — but it pinned it by NAMING `DECORATIVE_MOCKS`, so it could not
  see a second exclusion arriving. **A guard that names its subject cannot cover
  the next one**, which is why #650 derives its subject from every exported
  `string[]` in the module and asserts the census (`['DECORATIVE_MOCKS',
  'PRODUCT_MOCKS']`) so that un-exporting a list to duck the rule fails rather
  than going quiet. `DECORATIVE_MOCKS` was ungraded in this direction until now.
- **It imports the module rather than grepping it**, which is §2d's
  assert-the-answer rule; the source reads that remain are there only because a
  function BODY cannot be imported, and that cost is named (≈0.3s of
  Playwright/axe imports in the unit suite).

## The sticky bar's fill — an ink graded against a SIBLING, not an ancestor

*A pair in `tests/a11y/token-contrast.test.ts`, DREAMCRM-72 / PR #618. **STATE:
MERGED 2026-09-16, `16dd4fcd`**, behind the same review. A new class, and the reason is
structural: every other contrast rule in this repo grades ink against a
background declared on an ANCESTOR.*

The marketing header is `position: sticky` with a **translucent** fill, so the
surface under its nav ink is not `white` and not any declared token — it is
white composited at some alpha over whatever the page happens to be showing at
that scroll position. **The thing under a sticky bar is a sibling scrolling
past**, so axe, `dark-mode-parity` and rules 1–6 in `class-pairs.ts` all
correctly decline to see the pair. It is the footer's problem in a second
costume, and it takes the same answer: grade it here, from the palette, on every
run.

- **The worst case is the `gray-950` footer**, and that is not hypothetical — it
  is what the rail sits over for the last screenful of every page on the site.
  `gray-950` is also the darkest surface the marketing site declares, so nothing
  else can beat it.
- **The alpha is READ OUT OF `chrome.tsx` rather than transcribed**, which is
  the whole point: the number being defended is a DECISION somebody could thin
  on taste. The quietest nav ink (`gray-600`) over the footer measures 5.63 /
  **5.05** / 4.51 / **4.01** at `white/90` / `85` / `80` / `75`. **The shipped
  80 clears a 4.5 floor by ONE HUNDREDTH** — Part 7's "4.18 reads as nearly
  fine" in its sharpest form. Thinning the fill turns this red naming the ratio;
  both directions were watched.
- **A premise case guards the read**: lose the `bg-white/<alpha>` fill and the
  test says so rather than silently grading nothing, because the header going
  opaque (ink back on a declared token, this rule retires with the
  translucency) and the elevated state being re-spelled (nothing grading the
  composite any more) need different answers.
- **The arithmetic is exact for the case it grades, not a model of one.** The
  footer is a FLAT `gray-950` field, so `over()` is precisely what the
  compositor does there. `backdrop-blur-xl` moves the mean of a flat field by
  nothing, and over a varied field it averages toward the middle — i.e. away
  from the extreme this grades. **The bound is true whichever way it falls**,
  which is rule 6's method: when the real value is out of reach, grade against
  the bound that makes your answer true either way.

**The general shape to carry forward, because it is bigger than this header.** A
composited surface has no owner in the DOM, and "which background is this ink
on" stops having a single answer the moment a layer is translucent and the thing
beneath it moves. Any guard that resolves a background by walking UP the tree is
blind to that entire family by construction — translucent sticky chrome, drawers
over content, overlays. **When you make something translucent you have taken it
out of every contrast rule in the repo**, and only an explicit worst-case
pairing, written by hand against the darkest surface it can cross, puts it back.

**THE MARKETING SITE IS LIGHT IN BOTH THEMES, AND A `dark:` CLASS REACHING IT
IS A DEFECT** — `tests/marketing/forced-light-chrome.test.tsx`, #638
(`0e7e7bd6`, DREAMCRM-87, merged 2026-09-22). It renders the marketing header,
`PageHero` and the footer and fails on any `dark:` variant in a `class`
attribute of the produced DOM. `app/(marketing)/layout.tsx` hard-codes
`bg-white text-gray-950` and carries no `dark:` class under it, but
`next-themes` still puts `.dark` on `<html>` from the OS preference — so a
`dark:` half on anything rendered here fires on a ground that never went dark.
The shared company lockup carried `text-[--brand-ink,#22304E] dark:text-white`
and measured **1.00** on `/why` at 1440 for a dark-OS visitor: the words gone
from every page, while the bubble MARK kept painting because it has its own
gradient fill.

**This is the first guard here whose subject is a RENDERED COMPOSITION rather
than a path, a class string or a stylesheet, and that is the whole reason it
exists.** Read it as the general lesson, because the two ways the existing
guards declined are both structural:

- **`dark-mode-parity` exists for exactly this shape** — a `dark:text-*` with
  no `dark:bg-*` beside it — and returned null, because the LIGHT half was
  `text-[--brand-ink,#22304E]`, an arbitrary CSS-var value rather than a
  `text-<ramp>-<step>` its resolver can grade. The §2d identity-looseness
  family, once more: an arbitrary-value class is not a named one.
- **Every source scanner in this repo is keyed on a PATH.** `dark:` has a count
  of ZERO across `app/(marketing)` and `components/marketing`, and always did —
  the offending class lives in `components/brand/`, where it is CORRECT for the
  partner shell, the auth shell and the dashboard chrome, all of which really
  are theme-aware. A rule banning `dark:` in the marketing directories would
  have been green the entire time, and one banning it in `components/brand/`
  would be wrong.

So a shared component leaking a dark half into this lane fails here whatever
file it lives in, which is the one question a path scanner structurally cannot
ask. **When a rule is about a LANE that several directories feed, grade what the
lane renders, not who wrote it.** `MarketingFooter` is the one exemption, by
name, with its premise asserted rather than assumed — the dark band it sits on
has to still be there. Watched to fail (§2d) against the shipped spelling:
removing `alwaysLightGround` from `components/marketing/chrome.tsx` reddens it
naming `span — dark:text-white`, and forcing the walker to return `[]` reddens
the field-of-view assertion. What it does not see is stated in its header: a
dark rendering assembled outside `className`, and the page BODIES — deliberately
out of scope, since a page author writing `dark:` in `app/(marketing)` is
visible to an ordinary grep and never has.

**It reached this document with nobody routing it** — no mention, no record on
the PR, found by §2's unscoped sweep pass on 2026-09-22. The path-scoped pass
could not have seen it: the diff is two components, `docs/RELEASE.md` and one
new test file.

## The guards that live OUTSIDE `tests/guards/` — hand-registered

*Forge's intake, 2026-09-23 (DREAMCRM-114). Read this together with §2d's
"a never-again guard lives in `tests/guards/`" and §2's guards-census entry.*

**The census is `tests/guards/**` and these files are not in it.** From
DREAMCRM-114, `scripts/rulebook-drift.mjs` asserts that every file under
`tests/guards/` is named somewhere in `docs/rulebook/**`, so a machinery guard
arriving unregistered fails `test` by name. That mechanism is registration by
LOCATION, and its honest limit is exactly this list: the design and
accessibility guards grew up in `tests/marketing/` and `tests/a11y/` beside the
ordinary unit tests for the same surfaces, and no predicate separates them from
those neighbours that does not also sweep in ~80 innocent files (measured
2026-09-23: "a test that reads source off disk" hits 81 files outside
`tests/guards/`, and still misses `hero-lcp-paint`, which reads its subject out
of a rendered stylesheet). **So these are registered BY HAND, the two-pass
sweep is the only control over them, and nothing goes red if the next one is
forgotten.** Do not read this section as coverage. It is an inventory with a
known way of going stale, written down so the staleness is visible rather than
assumed away.

**The design guards in `tests/marketing/`.** Each is written up in full
elsewhere in this file or in §2c; this is the registration, not the retelling.

- `no-drawn-grid.test.ts` — the drawn-grid veto, the first rule here to grade a
  DECORATIVE LAYER.
- `tone-tiles.test.ts` — the check-mark veto, geometric rather than nominal.
- `product-mocks.test.tsx` — the `data-mkt-mock` VOCABULARY rule, half of an
  axe exclusion.
- `plan-price-literals.ts` — the plan-price invariant's scanner (§2c).
- `type-floor.test.ts` — the 12px floor over both marketing trees.
- `cinema-fx.test.ts` / `cinematic-spine.test.tsx` — the cinematic spine's
  stylesheet guards and the living stage's particle arithmetic.
- `forced-light-chrome.test.tsx` — the forced-light marketing chrome rule,
  whose subject is a RENDERED COMPOSITION rather than a path.
- `pricing-price-source.test.tsx` — the pricing page FOLLOWS the billing config
  (§2c), which is a stronger claim than agreeing with it.
- `comparisons-count.test.ts`, `launch-post-price.test.ts`,
  `emoji-changelog-placement.test.tsx` — the comparison-matrix marks rule, the
  launch post's price, and the emoji registry's placement rule.
- `hero-lcp-paint.test.tsx`, `marketing-not-found.test.tsx` — #698, §2's
  fifty-third entry.

**The accessibility guards in `tests/a11y/` that this rulebook had never named
at all.** Found at the same intake, by running the census predicate over the
sibling directory rather than only over the one it was written for — six
zero-holding guards, every one of them able to fail a stranger's PR, none of
them mentioned anywhere in this document before today:

- `announced-phase-changes.test.tsx` — a phase swap narrates itself: an
  `aria-pressed` set is announced inside a NAMED group, a grid that reloads on
  another control's touch carries a live region, and a swap that REPLACES the
  surface moves focus. **Read its field of view before you trust it**: it
  renders TWO named components (the slot picker and the booking success
  screen), so it holds nothing at zero and cannot see a third. Vesper measured
  the real population on 2026-09-23 — 15 patient-facing files drive a phase
  state machine and 8 carry no live region at all. That widening is a new
  blocking assertion and routes here when it lands.
- `clickable-rows.test.tsx` — a clickable row is a list item, not a button. It
  re-implements axe's `nested-interactive` and `list` rules over the rendered
  DOM so the shape cannot come back between browser runs.
- `form-labels.test.ts` — `eslint-suppressions.json` stays EMPTY of
  `label-has-associated-control`. Lint already fails a new unassociated label;
  what this pins is the other way the class returns, `eslint --suppress-rule`
  turning a red gate green and making 78 the new floor.
- `portal-brand.test.ts` — the patient portal's clinic-brand ink and button
  fill are swept across the whole hue wheel at every plausible lightness,
  rather than against the handful of brands a fixture happened to hold. It also
  asserts the ALGEBRA the derivation rests on.
- `retired-tones.test.ts` — `sky` and `stone` stay retired, including in the
  two shared REGISTRIES that hand colours to everything else. A registry on a
  retired ramp re-seeds it everywhere it is read.
- `site-tokens.test.ts` — the public-site token names live once in
  `components/clinic-site/tokens.ts`; a parallel LOCAL CONSTANT fails. Its
  mutation pass is §2d's identity-looseness family three times in one regex.

**What this section costs if nobody maintains it.** Every name above was
absent, or absent from any list, until an intake went looking. The guards
census closes that for `tests/guards/`; here the answer is either to move a
guard into `tests/guards/` when it is genuinely a never-again rule (§2d), or to
accept that this list is a hand-kept list — the defect this rulebook writes up
more often than any other — and say so, which is what this paragraph is.
