/**
 * WHAT THE ACCESSIBILITY CHECKS FOUND ON THEIR FIRST RUN — AND NOTHING MORE.
 *
 * Read this before you touch the numbers.
 *
 * `e2e/axe.ts` was added on 2026-09-10 (DREAMCRM-25) and its first pass over
 * real pages found **214 WCAG 2.1 AA violations across 25 of 35 stops**, in
 * exactly three rules. Every one of them was already live on `main` — the
 * checks did not create them, they revealed them. They are product defects in
 * UI code, and this file is written by QA, which changes tests and never
 * product code, so they could not be fixed in the same change that found them.
 *
 * The alternative to this file was to merge a red gate or to not land the
 * checks at all. Both are worse: a red gate teaches people to ignore red, and
 * no gate means the 214 keep quiet company with however many arrive next week.
 *
 * SO THIS IS A RATCHET, NOT A PARDON.
 *
 *   - Each number is a CEILING, not an expectation. Exceed it and the suite
 *     fails, naming the stop and the rule.
 *   - A rule NOT listed for a stop has a ceiling of zero. Any new kind of
 *     violation anywhere fails immediately.
 *   - A stop not listed here at all has a ceiling of zero for everything. New
 *     stops start clean and must stay clean.
 *   - Numbers only ever go DOWN. When a fix lands, shrink or delete the entry
 *     in the same PR; the run prints a note telling you which ones are now
 *     lower than their ceiling.
 *
 * **"NUMBERS ONLY EVER GO DOWN" IS ENFORCED** — since 2026-09-15, DREAMCRM-60.
 * `tests/guards/axe-baseline-ratchet.test.ts` reads every entry's value on
 * `origin/main` and fails `test` on any increase, INCLUDING a (stop, rule) that
 * is not listed there at all: an unlisted pair tolerates zero, so adding a line
 * is a raise from zero and not a new entry. For four batches this paragraph
 * said the opposite — raise any number by one and `pnpm test` was green,
 * nothing read the previous value, and no label fired — which made it the last
 * remaining way to weaken a required check with nobody seeing it (filed by
 * Sentinel in docs/RELEASE.md Part 5 on DREAMCRM-49).
 *
 * THIS FILE IS STILL OFF EVERY LABEL LIST, and that is the point of the design
 * rather than a hole left in it. A ceiling SHRINK is the end of nearly every
 * accessibility fix — it moved in 10 of the last 90 merged PRs — so labelling
 * those would teach people the label means nothing, and a path pattern cannot
 * tell a shrink from a raise. The written opt-out for the rare legitimate raise
 * therefore lives one file over, in `e2e/axe-baseline-raises.ts`, which holds
 * nothing BUT raises and is on the review gate. Shrinks stay quiet; a raise
 * reaches Sentinel. Read that file before you reach for it: the bar is that the
 * violations are PRE-EXISTING — a stop nothing had ever scanned — never that a
 * new one needs somewhere to go.
 *
 * A ceiling rather than an exact match on purpose: some counts genuinely wobble
 * by an element because what is on screen depends on the data — the three
 * agenda stops reported 8 nested-interactive and then 7, and the booking
 * confirmation 2 and then 1, across runs of the same tree. Every number here is
 * therefore the HIGHEST observed, not the latest. An exact-match baseline would
 * have made those stops flaky on day one, and a flaky gate is worse than a
 * loose one.
 *
 * WHAT IS ACTUALLY BROKEN, so nobody has to re-derive it from a CI log:
 *
 *   - **color-contrast (176)** — the bulk of it, and it collapses to about two
 *     dozen distinct token pairs rather than 176 separate mistakes. The worst
 *     offenders by volume: #bb4d00 on #fff0d9 (4.48:1, needs 4.5 — 36 of
 *     them, a hair under the line), #ffffff on #4c7df0 (3.81:1, 20),
 *     #9caf9f on #faf7f2 (2.17:1, 18), #5e6e8c on #e9f0fc (4.48:1, 18) and
 *     #5e6e8c on #10182e (3.42:1, the dark-mode side, 16). Several sit at
 *     4.48–4.49 against a 4.5 requirement, which is what a palette chosen by
 *     eye looks like from the outside. Fixing the tokens fixes the instances
 *     in bulk.
 *   - ~~**nested-interactive (25) and list (13)**~~ — CLOSED, batch 56, and it
 *     was one structural pattern exactly as this entry predicted: the
 *     appointments agenda row and the leads board row were both an
 *     `li[role="button"]` containing their own focusable controls, sitting in a
 *     list whose direct children were therefore not list items. Both rules
 *     reached ZERO on all four stops together and have left this file. **The
 *     baseline is now a single rule.**
 *
 * Owned by the UI lane and handed over with this reproduction — see the
 * comment thread on DREAMCRM-26. QA owns the checks; the pixels are not ours.
 *
 * ── BURNED DOWN SO FAR (append one line per batch; DREAMCRM-28) ──────────────
 *
 *   2026-09-10 · UI batch 54 · **214 → 166**, all 48 `color-contrast`.
 *     The patient portal was using the clinic's brand colour RAW — as a text
 *     fill on the #FAF7F2 ground and as a button fill under a hard-coded
 *     `text-white` — while the clinic public site had derived a contrast-safe
 *     value from it since the palette shipped. Not 48 separate mistakes: ONE
 *     missing derivation, now on all eight paths the brand takes to a patient
 *     (`portalBrand()`, lib/portal-brand.ts). Six portal stops went 8/10/11/
 *     8/7/8 → 1 and `token: confirm-my-visit page, still pending` reached
 *     ZERO and left the file. The remaining 1 per portal stop is NOT the
 *     brand — it is a separate pair, still to be identified.
 *     En route it also fixed `readableInk` measuring contrast on fractional
 *     rgb before `toHex` rounded it, which had been landing brands at
 *     4.48–4.50 against a 4.5 floor on the PUBLIC site: the same
 *     one-hundredth-under shape as the #bb4d00-on-#fff0d9 cluster below, and
 *     invisible to a unit test that checks the value it was handed.
 *
 *   2026-09-10 · UI batch 55 · **166 → 119**, all 47 `color-contrast`, from
 *     three single homes and a sweep:
 *       · `lib/ui/encodings.ts` painted every semantic tone as
 *         `bg-<ramp>-500/15 text-<ramp>-700`, so the ink's real background is
 *         the wash over whichever surface the pill landed on — and the darkest
 *         of those, `--color-surface-sunk`, decides. At the 700 step warn was
 *         3.96, ok 4.12 and urgent 4.25; violet scraped 4.59 and fuchsia sat on
 *         exactly 4.50. All five moved to the 800 step (worst pair now 5.57).
 *         **`#bb4d00 on #fff0d9 = 4.48` below IS this pair** — the warn tone on
 *         a white card — which is why the appointment-drawer stops went 15 → 1
 *         and the populated patients list 8 → 1.
 *       · `--color-ink-500`/`--color-gray-500` at #5e6e8c cleared 5.14 on white
 *         and 4.78 on the canvas and landed at 4.49 on the sunk surface. One
 *         point of HSL lightness darker (#5c6c89) → 4.63. That is the
 *         `#5e6e8c on #e9f0fc` row.
 *       · The `#5e6e8c on #10182e` row is **NOT the dark-mode side**, and this
 *         file said it was. It is the marketing FOOTER: a dark band inside a
 *         light-mode page, so no `.dark` scope applies and gray-500's light
 *         value renders onto gray-950 exactly as the cascade says it should.
 *         `--color-ink-500`'s dark override was never involved. The headings
 *         were also quieter than the links beneath them; they are gray-300 now.
 *       · `text-gray-400` — the ink the sheet marks "disabled only", 2.63 on
 *         white — used as real text on 24 lines of the marketing site, plus
 *         both error pages (the reference id a person is meant to read off a
 *         broken page was the least legible text on it, and global-error's
 *         Reload button was v2's retired teal AND 3.74:1).
 *     `tests/a11y/token-contrast.test.ts` now computes every ink×surface and
 *     tone-ink×its-own-wash pair from this repo's stylesheet and Tailwind's own
 *     theme.css, in both themes — the source-level contrast guard that did not
 *     exist, and the reason none of the above was caught before axe arrived.
 *
 *   2026-09-10 · UI batch 56 · **119 → 79**, closing `nested-interactive` and
 *     `list` ENTIRELY — 38 instances, one shape. Both rows became a plain
 *     clickable `listitem` whose keyboard door is a real button on the row's
 *     primary label (the visit type; the lead's name), with the accessible name
 *     leading with the visible one so Label-in-Name still holds. Whole-row
 *     click is unchanged. `tests/a11y/clickable-rows.test.tsx` re-implements
 *     both rules over the rendered DOM, so this cannot regress between runs of
 *     this suite. `marketing: home` also settled to 41 — see below, that is now
 *     ALL of it.
 *
 * ⚠ `marketing: home` USED TO SIT AT 41 and no longer appears here at all.
 *   All 41 were inside `aria-hidden` decorative product mock-ups — miniature
 *   simulated app screens at 7–10px — which WCAG 1.4.3 exempts as incidental,
 *   and restyling a deliberate illustration to reach 4.5:1 at 7px helps
 *   nobody. The UI lane correctly declined to lower the ceiling to a number
 *   implying they had been fixed, and asked QA whether the scan should
 *   `exclude` those subtrees instead.
 *
 *   ANSWERED: yes, and the reason is about the gate rather than the pixels. A
 *   ceiling of 41 means the 42nd instance is the first one that fails — on the
 *   busiest public page we have, that is 41 real defects' worth of room to
 *   hide in. The stop now excludes `DECORATIVE_MOCKS` (see `e2e/axe.ts` for
 *   the exemption and the risk it carries) and holds ZERO, which is the only
 *   state in which a new contrast defect there fails on arrival.
 *
 *   ⚠ AND THE SAME CLASS IS UNSCANNED ON `/product`, WHICH HAS NO STOP AT ALL
 *   (Neon, DREAMCRM-77, 2026-09-16 — full write-up in `docs/RELEASE.md` Part 5).
 *   The product tour renders NINE mocks and measures 89 / 103 / 103 violation
 *   nodes at 390 / 834 / 1440 against the production build — `color-contrast`
 *   only, every one inside an `aria-hidden` mock, ZERO on the page itself at
 *   every width. Worst pairs as rendered: `#c9c2b6 on #faf7f2` at **1.65**
 *   (10.56px, "9:00 AM", `BookingMock`), `#ffffff on #ffb900` at **1.72**
 *   (9.28px, the "MJ" avatar, `DashboardMock`), `#b4ab9e on #ffffff` at
 *   **2.26** (7.68px, "Visits", `PortalMock`).
 *
 *   THE BLOCKER IS THE EXCLUSION'S SHAPE, not the decision — that was settled
 *   above. `DECORATIVE_MOCKS` keys on the drift wrapper (`.mkt-float >`), and
 *   the tour's mocks do not float; they are the page's subject. So the
 *   selector matches nothing there, `deadExclusions` would fail the stop by
 *   name, and adding `marketing: product` needs an exclusion derived from what
 *   those mocks ARE. `aria-hidden` alone is too wide — it would pardon every
 *   decorative subtree on the site forever, which is the blanket allowance
 *   §2d's third rule is about.
 *
 * THE WOBBLE IS RESOLVED, and it was never data-dependence (QA, 2026-09-11).
 * It was the scan landing mid-fade: the clinic and marketing sites reveal
 * content with a 700ms opacity transition, and a partially-faded element
 * measures as a blend against the page behind it. `findA11yViolations` now
 * waits for finite animations to finish (#544), which removes the variance at
 * its source. Consequences for the two ceilings that were held back:
 *
 *   · `booking: the confirmation a patient lands on` measures **0** settled,
 *     not 1 — both instances were fade artifacts, never defects. Entry DELETED.
 *   · `staff: dream team, a proposal waiting on a yes` measures 2 against its
 *     ceiling of 3. Left at 3 on purpose: that is one post-settle observation,
 *     and Vesper's rule that a one-element drop is not evidence still stands.
 *     Shrink it on the next run that confirms 2, or when a fix lands.
 *
 * The general form, worth keeping: two attempts reporting the SAME selector
 * with DIFFERENT colours is a timing artifact, not a defect that two runs
 * agreed on. Mid-fade samples all sit below the settled value, so they agree
 * with each other by construction.
 *
 * ~~WHAT THREE OF THE 36 ARE~~ — CLOSED, batch 57, and the diagnosis written
 * here is the reason it took minutes to locate rather than an afternoon. The
 * three were `#f0f3f1 on #9caf9f` at 2.07 (the selected day chip's weekday
 * label) and `#ffffff on #9caf9f` at 2.32 twice (the chip's date and the
 * selected time slot) — the seeded clinic's raw pale-sage brand used as a FILL
 * under light text, exactly as recorded.
 *
 * The fix took THREE stops to zero rather than one, because the same shape was
 * on the unselected booking page and on the pre-live portal door:
 * `booking: slot chosen, details filled in` 3 → 0, `clinic site: booking page`
 * 3 → 0, `clinic site: portal door on a pre-live clinic` 2 → 0. All three
 * entries have left this file.
 *
 * One correction to the note above: the weekday label could NOT be fixed by
 * swapping in `brandStrong`. That role is darkened only as far as FULL white
 * needs, so the label's `rgba(255,255,255,0.85)` composited back into failure
 * (3.54–4.88 across the four template recipes). It is opaque white now. A
 * partly-transparent ink on a brand fill is never safe.
 *
 * (Seen at 4 rather than 3 once, on actions/runs/34547087372, before #544's
 * settle landed — the 4th was the `ScrollReveal` fade artifact described above,
 * not a fourth defect. Diagnosed rather than accommodated: raising the ceiling
 * would have written an artifact into this file as a defect.)
 *
 *   2026-09-11 · UI batch 57 · **36 → 28**, all 8 `color-contrast`, and THREE
 *     stops to zero. QA's hand-off named three instances on the public booking
 *     page; reading the source for the SHAPE rather than the symptom found 22
 *     across the public clinic site, nineteen of them on pages this suite never
 *     visits (about, careers and the job page, the apply form, intake, the
 *     intake packet, intake-start, payment plans, four shop surfaces). All 22
 *     go through `brandFill()` now — plus 37 places that already spelled it
 *     `var(--c-brand-strong, ${brand})`, whose FALLBACK was the raw brand.
 *     `tests/clinic-site/brand-fill.test.ts` holds all four template recipes to
 *     the white floor (only the default one had ever been checked) and scans the
 *     call sites. Its first scan matched only the literal
 *     `backgroundColor: brand` and its red run PASSED — the booking page's two
 *     worst instances are conditional — so it parses the colour value now.
 *
 *   2026-09-13 · UI batch 58 · **28 → 18**, and SEVEN stops to zero. The
 *     `#ffffff on #4c7df0` row below was the last large identified pair, and
 *     the reason it reached 44 places is that `--color-teal-500` was labelled
 *     "primary fill (light)" in BOTH app/css/style.css and DESIGN-SYSTEM.md —
 *     the label was the defect and the instances were compliance. The ramp is
 *     an IDENTITY ramp: teal-500 stays the brand (chart-1, focus rings,
 *     selection washes, dots, progress bars — none of which carry text) and a
 *     solid fill with a white label is teal-600 (5.09) or deeper. Both token
 *     comments now say so. Three of the 44 were ALSO failing in DARK mode and
 *     nobody had noticed — `dark:text-gray-900` with no `dark:bg-*` put
 *     near-black ink on teal-500 at 4.01 — and fixing only the light side
 *     would have made those worse (3.01), so they took both halves.
 *     `tests/a11y/token-contrast.test.ts` gained the source rule plus the
 *     NEGATIVE assertion that teal-400/500 really are below the floor, so the
 *     cutoff is derived rather than asserted.
 *     **CORRECTED batch 59: it had not.** Only the positive assertion landed —
 *     teal-600 and deeper clear AA — which grades the palette and can never
 *     fail on a call site. The 44 product fixes were real and complete; the
 *     guard described here simply was not in the tree, in this file or in
 *     docs/UI-BEST-VERSION.md, for four days. Both now exist and are
 *     red-verified. If you are reading this file to find out what defends a
 *     rule, that is exactly the reading this note nearly broke.
 *
 *   2026-09-14 · UI batch 59 · **no change to the numbers below, and that is
 *     the point.** DREAMCRM-34 closed the class of contrast defect this file
 *     structurally cannot see: a DARK-MODE pairing. The suite walks one theme,
 *     so every `dark:` rendering in the product has always been outside its
 *     reach — which is how batch 58's three chips
 *     (`dark:text-gray-900` with no `dark:bg-*`, near-black on teal-500 at
 *     4.01) sat live under a nightly contrast gate. The new guard is a SOURCE
 *     rule (`tests/a11y/class-pairs.ts` + `dark-mode-parity.test.ts`) that
 *     resolves both renderings of any element whose light and dark modes
 *     disagree about which half of the pair is overridden, and fails on the
 *     ones that miss AA.
 *     It deliberately carries NO BASELINE. The constraint from QA on that
 *     issue was "not two lists of contrast problems that can disagree", and a
 *     second inventory keyed by source location instead of by (stop, rule)
 *     would have overlapped this one with different keys — the first time they
 *     disagreed about whether something was fixed, neither would be believed.
 *     It holds at ZERO instead: the shape was live in eight places and all
 *     eight are fixed in the same PR. Ten of the fixed instances were found by
 *     its own red run over the live tree, one of them inside a ternary branch.
 *     FOUR CEILINGS COME DOWN with it, and they are the four batch 58 left
 *     standing on a single observation: add-patient dialog 2 → 1, the
 *     brand-new patients list 2 → 1, the day agenda 2 → 1, the published
 *     website hub 4 → 3. That entry said "the next run that confirms the
 *     lower number can take them"; actions/runs/34808966031 is that run, and
 *     it measured the same lower number at all four. Two independent
 *     observations is the bar this file set for itself, so they move.
 *     Note they produced no `::warning`: a drop of exactly one is inside
 *     `WOBBLE`, so the annotation deliberately stays quiet and the evidence
 *     has to be read off the `carried by the baseline` counts in the run log.
 *     That is working as designed — but it does mean a one-element fix will
 *     never announce itself, and somebody has to go looking.
 *     Batch 59's own colour changes touched two SHARED components
 *     (`delete-button.tsx`, `dropdown-filter.tsx`), so some of that drop is
 *     plausibly this batch rather than the confirmation of batch 58's. The
 *     ceilings land in the same place either way and no count went UP —
 *     every change in the batch moves a pair toward AA — so the direction is
 *     not in doubt even where the attribution is.
 *
 * Four stops each dropped by exactly ONE in that run — add-patient dialog,
 * the brand-new patients list, the day agenda, and the published website hub.
 * Their ceilings deliberately stayed put. A one-element drop is not evidence
 * under this file's own rule, even when it is four at once and the batch
 * plainly touched buttons on those pages; the next run that confirms the
 * lower number can take them. (`staff: dream team` is the worked example:
 * batch 55 left it at 3 on a single observation of 2, and batch 58's run
 * reported 1, which IS a warning, so it moved.)
 *
 *   2026-09-14 · QA (DREAMCRM-33) · **ALL FOUR CONFIRMED AND SHRUNK**, 18 → 14.
 *     actions/runs/34808555090 measured them a second time, post-settle, and
 *     reported the same lower numbers: add-patient dialog 1 (was 2), brand-new
 *     patients list 1 (was 2), the day agenda 1 (was 2), published website hub
 *     3 (was 4). That is exactly the bar the paragraph above sets — batch 58's
 *     run was the first observation, this is the confirming one — so the room
 *     closes. No product code changed; the defects were already fixed in batch
 *     58 and these ceilings were the dead weight left behind.
 *
 *     Worth noting HOW this arrived, because the mechanism matters more than
 *     the four numbers: nothing warned. The shrink warning fires at zero or on
 *     a drop bigger than the wobble, and a drop of exactly one — the case this
 *     paragraph exists for — is by construction silent. The numbers came from
 *     reading `[a11y] ok — <stop> (N carried by the baseline)` out of a run
 *     log. If these four sat unshrunk for four batches, that is why, and the
 *     habit to keep is grepping that line after any run you have in front of
 *     you rather than waiting to be told.
 *
 *   2026-09-14 · UI batch 62 · **17 → 8, and every `portal:` stop leaves the
 *     file.** One `opacity-70` in the portal LAYOUT was the whole of the
 *     "remaining 1 per portal stop" batch 54 could not identify — see the
 *     DREAMCRM-33 note at the bottom for the reproduction and for why the
 *     second colour QA measured was a fade frame rather than a second defect.
 *     The lesson is not about opacity. A defect in a SHARED component presents
 *     here as one violation per stop, which is indistinguishable from nine
 *     small unrelated debts — and nine ceilings of 1 is exactly the shape
 *     nobody looks at twice. When several stops on one surface all carry the
 *     SAME small number, the first question is what they render in common.
 *
 *   2026-09-15 · UI batch 64 · **8 → ZERO. THIS FILE IS EMPTY, AND EVERY STOP
 *     IN THE SUITE NOW TOLERATES NOTHING.** 214 → 0 since 2026-09-10, across
 *     UI batches 54-64; QA's share is the 43 that were never defects.
 *
 *     The eight were NOT eight things. They were three, and the biggest of
 *     them is the one this file's own advice predicted: six of the eight —
 *     four stops — were one class pair written upside down.
 *
 *       · **`text-gray-400 dark:text-gray-500`, 177 places across 85 files.**
 *         DESIGN-SYSTEM.md §2.2 has said since v3 shipped that `gray-500` is
 *         the lightest meaningful ink on white and `dark:gray-400` the
 *         lightest on dark, and `--color-ink-400` carries the comment
 *         "disabled only". This is that line backwards, and it fails in BOTH
 *         themes at once: **#93a0bc on #ffffff = 2.62** (the website hub's
 *         three "optional" suffixes and the dream-team field label, 12px),
 *         **#93a0bc on #f3f7fe = 2.44** (the saved-views bar's "Views:" chip,
 *         which is what `staff: the day agenda` was carrying), and on the dark
 *         side **#5c6c89 on #0c1226 = 3.51**. All 177 are the right way up
 *         now. `tests/a11y/class-pairs.ts` rule 6 +
 *         `tests/a11y/quiet-ink.test.ts` hold the shape at zero with no
 *         ceiling, and it is red-verified against the real live defect in
 *         `components/saved-views/saved-views-bar.tsx`, not only against
 *         planted strings.
 *       · **`auth: sign-in showing the failure alert`** — the error block was
 *         `text-red-600` on `bg-red-50`, **#fa4949 on #ffe8e8 = 2.93** at
 *         14px. `red-*` was never a v3 tone ramp (batch 59 made the same
 *         point about Delete and Clear), and the alert is a tone WASH WITH ITS
 *         OWN INK, which is exactly `TONE_PILL`. It and the six siblings
 *         spelling the same string — the reset-password form, both
 *         accept-invite alerts, three ecommerce add-modals — now read
 *         `TONE_PILL.urgent` (6.33 light).
 *       · **`staff: patients list, brand-new empty clinic` and `staff:
 *         add-patient dialog, filled in`** were ONE element, not two: the
 *         trial banner's CTA, `text-white` on `bg-violet-500` =
 *         **#ffffff on #8470ff = 3.65** at 12px. A brand-new clinic is on day
 *         7 of its trial, so the calm tier is the one that renders at those
 *         stops — and the two tiers the browser suite never reaches were
 *         worse (2.13 on amber-500, 2.89 on orange-500). It carries
 *         `TONE_FILL` now; see the header in `components/ui/trial-banner.tsx`
 *         for why the orange tier is the one hand-spelled recipe.
 *
 *     WHAT THIS FILE IS NOW. An empty baseline is not a retired instrument —
 *     it is the instrument at full sensitivity. Every stop in the suite has a
 *     ceiling of zero for every rule, so the next contrast defect anywhere the
 *     E2E suite walks fails on the PR that introduces it, which is the state
 *     `e2e/axe.ts`'s comments have argued for since the day it landed. Do not
 *     add an entry here to get a red run green. If a defect is genuinely not
 *     ours to fix in the same PR, that is a conversation on the issue, not a
 *     number in this file. And a raise is no longer yours to make quietly:
 *     `tests/guards/axe-baseline-ratchet.test.ts` (#588 / #595) reads every
 *     entry's value on `origin/main` and fails `test` on any increase,
 *     INCLUDING a (stop, rule) absent there — an unlisted pair tolerates zero,
 *     so adding a line IS a raise from zero. The written opt-out is
 *     `e2e/axe-baseline-raises.ts`, which is on the review gate.
 *
 *     **An earlier draft of this paragraph said that guard was "still
 *     unbuilt", and it shipped in the PR that emptied this file.** It was
 *     wrong by four days — caught in review, not by a check, because
 *     `e2e/axe-baseline.ts` merges cleanly and the merged header would have
 *     carried both claims at once: the top of this file documenting the
 *     ratchet, and this paragraph denying it exists. Worth leaving the scar
 *     rather than a silent correction, for two reasons. It is §2d's "a note
 *     saying a guard shipped is not a guard" read from the other end, and the
 *     other end is worse: a note saying a guard does NOT exist is an
 *     invitation to route around one that does. And this header is now the
 *     product's only contrast ledger as well as the first thing anyone opens
 *     before touching a ceiling, so a false sentence in it costs more than it
 *     did when there were 214 entries to read past.
 *
 *     Two things worth keeping about HOW the eight were found, because neither
 *     was available by reading source. `expectNoA11yViolations` prints
 *     elements and colours only for violations ABOVE a ceiling — a carried one
 *     is a count in a log line and nothing else — so eight defects sat behind
 *     eight ceilings with nobody able to say what they were. Zeroing this file
 *     on a throwaway branch and dispatching `ci.yml` at it
 *     (actions/runs/34993335573) printed all eight with selectors and measured
 *     colours in four minutes. And once measured, SIX OF THEM WERE ONE SHAPE
 *     — four stops that looked like four small unrelated debts, which is the
 *     batch-62 lesson arriving a second time from the other direction.
 *
 * WHAT WAS LEFT WAS NO LONGER ONE BIG PAIR. Every large identified cluster is
 * closed; the 18 are singles and pairs on eleven stops, each needing its own
 * look. Three things this suite structurally cannot see are recorded in
 * docs/UI-BEST-VERSION.md instead: 31 `color: brand` sites on the public site
 * (brand as TEXT — `readableInk`'s job), three icon wells that concatenate an
 * alpha suffix onto a `var()` and therefore render no background at all
 * (**CLOSED — this clause was STALE from the day it was written.** The three
 * wells were fixed by `components/clinic-site/success-well.tsx` in DREAMCRM-36
 * / #560, the same week, and `tests/clinic-site/brand-wash.test.ts` has held
 * the shape at zero across `app/site`, `components/clinic-site` AND
 * `components/patient-portal` ever since. Batch 62 re-verified: not one
 * surviving call site. Three places said it was open — this file, the
 * punch-list entry, and the issue that sent somebody to fix it — which is the
 * batch-58 shape in reverse: a note claiming a defect is LIVE is read exactly
 * as carefully as one claiming a guard exists.), and —
 * the one that matters most — **`ActionButton`'s primary gradient**, which
 * fails from 2.42 at its light end to 4.19 at 75% and clears only at the very
 * deep end. axe reports gradients as INCOMPLETE rather than failing, so it has
 * never been in this file's count and never will be. It is the design system's
 * signature element and changing it is an owner decision, not a sweep.
 *
 *     RESOLVED BY DECISION, batch 61 (DREAMCRM-31 → DREAMCRM-39), and recorded
 *     HERE because the sentence above is where the next reader will come
 *     looking. The owner APPROVED the darker gradient: the signature is now
 *     `from-teal-600 to-teal-800`, hand-measured at 5.09 at its light end and
 *     9.50 at its deep end, no point under AA — against the old span's 2.42 /
 *     3.46 / 4.19 / 5.09. Hover deepens to `from-teal-700` (7.05). This was NOT
 *     skipped and it did NOT go into the count on the way out: it never could,
 *     and that is the point. Four siblings carrying the same pair went with it
 *     (the breath skin, the active sidebar pill, the prospecting hero band, the
 *     Studio AI send button), plus the Call Mode dial block's hover.
 *
 *     Do not wait for this file to notice the next one. `tests/a11y/
 *     class-pairs.ts` rule 3 now grades `from-`/`via-`/`to-` stops under white
 *     text at the SOURCE, in the `test` check, holding at zero with no ceiling
 *     — the same division of labour as the dark-mode parity guard: axe owns
 *     what it can measure on screen, and a source rule owns what it
 *     structurally cannot. A gradient is the second of those.
 *
 * ── THREE NEW STOPS, 2026-09-14 (DREAMCRM-33, the money journey) ────────────
 *
 * `e2e/portal-billing.spec.ts` walks a patient paying a balance and stops at
 * three states nothing had ever scanned. They are entered here on their first
 * measured run, for the same reason the original 214 were: these are
 * PRE-EXISTING defects in portal UI that the checks REVEALED, not regressions
 * the spec caused, and QA changes tests rather than product code. A new stop
 * normally starts at zero — the exception is a stop that was never looked at
 * before, which is exactly the situation this whole file was created for.
 *
 * They are the same shape as the one every other portal stop already carries:
 * muted ink on the portal's #FAF7F2 ground, measured settled, at small sizes.
 * `#968f88 on #faf7f2` at 12px is 2.98:1 and `#8c857d on #faf7f2` at 14px is
 * 3.4:1, against a 4.5 floor. That pair is the "remaining 1 per portal stop is
 * NOT the brand — a separate pair, still to be identified" noted in batch 54;
 * these stops make it three instances more visible, and it is one fix in
 * `components/patient-portal/ui.tsx`'s muted tone, not three.
 *
 * HANDED TO THE UI LANE with the colours above. Shrink or delete these the
 * moment that tone moves — they are the smallest entries in the file and they
 * should be the shortest-lived.
 *
 *     FOUND AND FIXED, batch 62 (DREAMCRM-51), and ALL NINE PORTAL ENTRIES GO
 *     WITH IT. It was never the muted TONE: `PORTAL_MUTED` #6B635A clears
 *     5.52:1 on this ground. It was the portal FOOTER dimming that tone a
 *     second time — `app/(portal)/layout.tsx`'s "Powered by DreamCreate" at
 *     `text-[0.75rem] opacity-70`, which composites to exactly the `#968f88`
 *     QA measured, at exactly 12px, for exactly 2.98:1. Reproduced in Chromium
 *     with axe-core before touching anything, and the line lives in the portal
 *     LAYOUT, so it is ONE defect rendering on every portal page. That is the
 *     "remaining 1 per portal stop is NOT the brand — a separate pair, still
 *     to be identified" batch 54 left open, and why nine stops sat at exactly
 *     1 for eight batches: a shared component reads, from this file's side,
 *     like nine unrelated small debts.
 *
 *     THE SECOND COLOUR, `#8c857d` at 3.4, IS A FADE ARTIFACT — and the
 *     evidence is in `e2e/axe.ts`'s own `settleAnimations` note. Solve it for
 *     opacity against the same #6B635A on the same ground and it gives 0.77,
 *     which matches NO css in the tree (there is no `opacity-77`, and the only
 *     dimming the portal ever spelled was the footer's 0.70). It is the same
 *     shape that note records at 0.69 and 0.84 for one booking-page selector
 *     on two attempts: frames of a fade, not a settled colour. Two of these
 *     three billing stops were never measured at all — they were entered at 1
 *     on the reasoning that every portal stop carried 1, which was CORRECT
 *     reasoning about the footer.
 *
 *     So all nine go to zero rather than to a lower number, and there is a
 *     SOURCE rule behind them now: `tests/a11y/portal-ink-opacity.test.ts`
 *     refuses an `opacity-*` on portal ink at all, holding at zero with no
 *     ceiling. Same division of labour as the dark-mode parity guard and the
 *     gradient rules — axe owns what it can measure at the stops it visits,
 *     and a source rule owns the shape. It caught a second live instance axe
 *     never could: a message subject at `opacity-80` on a patient's own
 *     brand-filled bubble, 3.79–4.42 depending on the clinic's brand, on a
 *     page the browser suite does not stop at.
 */
/**
 * EMPTY, AS OF UI BATCH 64 (2026-09-15) — and empty is the working state, not
 * a gap. `expectNoA11yViolations` gives a rule that is absent for a stop a
 * ceiling of ZERO, and a stop that is absent entirely a ceiling of zero for
 * everything, so `{}` means every stop the suite walks tolerates nothing. The
 * next contrast defect on any of them fails on the PR that introduces it.
 *
 * It took 214 → 0 across UI batches 54-64 to get here. Read the header for
 * what each of those was; read it BEFORE adding an entry back.
 *
 * AND READ THIS BEFORE YOU READ AN EMPTY FILE AS A CLEAN PRODUCT, because the
 * last entry to leave is the argument against it. The portal's "taken" slot
 * was 1.85:1 and this file never counted it once — no spec loads a day with a
 * booked slot in it, so no stop ever rendered the state that was broken. It
 * was found by hand and fixed pre-emptively in the same batch that emptied
 * this file. A ceiling of zero is not evidence a surface is clean; it is
 * evidence that nothing has scanned the state that is dirty. What covers that
 * gap is the source rules, which do not depend on a spec happening to walk
 * past: `tests/a11y/portal-palette.test.ts` grades every portal ink on every
 * portal surface, and `tests/a11y/quiet-ink.test.ts` grades the tree.
 */
export const A11Y_BASELINE: Record<string, Record<string, number>> = {}
