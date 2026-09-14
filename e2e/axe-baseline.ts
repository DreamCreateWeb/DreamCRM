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
 * Remaining: **18, all `color-contrast`, and all of them genuine** — the 41
 * decorative mocks are excluded at the scan rather than carried as a ceiling,
 * and the 2 on the booking confirmation were fade artifacts. 214 → 18 since
 * 2026-09-10, which is UI batches 54-58 doing the real work; QA's share of that
 * is the 43 that were never defects.
 *
 * WHAT IS LEFT IS NO LONGER ONE BIG PAIR. Every large identified cluster is
 * closed; the 18 are singles and pairs on eleven stops, each needing its own
 * look. Three things this suite structurally cannot see are recorded in
 * docs/UI-BEST-VERSION.md instead: 31 `color: brand` sites on the public site
 * (brand as TEXT — `readableInk`'s job), three icon wells that concatenate an
 * alpha suffix onto a `var()` and therefore render no background at all, and —
 * the one that matters most — **`ActionButton`'s primary gradient**, which
 * fails from 2.42 at its light end to 4.19 at 75% and clears only at the very
 * deep end. axe reports gradients as INCOMPLETE rather than failing, so it has
 * never been in this file's count and never will be. It is the design system's
 * signature element and changing it is an owner decision, not a sweep.
 */
export const A11Y_BASELINE: Record<string, Record<string, number>> = {
  'auth: sign-in showing the failure alert': { 'color-contrast': 1 },
  'portal: cancel confirmation showing': { 'color-contrast': 1 },
  'portal: patient dashboard': { 'color-contrast': 1 },
  'portal: reschedule panel open, a new time picked': { 'color-contrast': 1 },
  'portal: visit inside the notice window': { 'color-contrast': 1 },
  'portal: visits list after confirming': { 'color-contrast': 1 },
  'portal: visits list, a visit needing confirmation': { 'color-contrast': 1 },
  'staff: add-patient dialog, filled in': { 'color-contrast': 1 },
  'staff: dream team, a proposal waiting on a yes': { 'color-contrast': 1 },
  'staff: patients list, brand-new empty clinic': { 'color-contrast': 1 },
  'staff: the day agenda': { 'color-contrast': 1 },
  'staff: website hub, site published': { 'color-contrast': 3 },
}
