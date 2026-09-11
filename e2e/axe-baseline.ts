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
 * ⚠ ONE CEILING HERE IS NOT A DEFECT COUNT. `marketing: home` sits at 41, and
 *   **all 41 are inside `aria-hidden` decorative product mock-ups** —
 *   miniature simulated app screens at 7–10px. WCAG 1.4.3 exempts them
 *   ("incidental": text that is part of a picture containing significant other
 *   visual content has no contrast requirement), and restyling a deliberate
 *   illustration to reach 4.5:1 at 7px helps nobody. The UI lane has left them
 *   alone rather than lower the ceiling to a number implying they were fixed.
 *   The real question is whether the scan should `exclude` those subtrees at
 *   that stop — QA's call, raised on DREAMCRM-28, NOT a ceiling to raise.
 *
 * Drops that were the documented WOBBLE rather than fixes, whose ceilings
 * deliberately stayed put: `booking: the confirmation a patient lands on`
 * reported 1 against its ceiling of 2 in every run, and `staff: dream team`
 * came in at 2 against 3. Both are the data-dependent counts the header warns
 * about, and a one-element drop is not evidence.
 *
 * Remaining after batch 56: **79, all `color-contrast`, of which 41 are the
 * WCAG-incidental decorative mocks above — so 38 are genuine.** The largest
 * identified pair among them is `#ffffff on #4c7df0` at 3.81:1: white text on
 * the brand ramp's 500 step. teal-600 and deeper are the legal white-text
 * fills, and `tests/a11y/token-contrast.test.ts` asserts that, so the rule is
 * written down where the next batch will find it.
 */
export const A11Y_BASELINE: Record<string, Record<string, number>> = {
  'auth: sign-in showing the failure alert': { 'color-contrast': 1 },
  'booking: slot chosen, details filled in': { 'color-contrast': 3 },
  'booking: the confirmation a patient lands on': { 'color-contrast': 2 },
  'clinic site: booking page': { 'color-contrast': 3 },
  'clinic site: portal door on a pre-live clinic': { 'color-contrast': 2 },
  'marketing: home': { 'color-contrast': 41 },
  'marketing: pricing': { 'color-contrast': 2 },
  'portal: cancel confirmation showing': { 'color-contrast': 1 },
  'portal: patient dashboard': { 'color-contrast': 1 },
  'portal: reschedule panel open, a new time picked': { 'color-contrast': 1 },
  'portal: visit inside the notice window': { 'color-contrast': 1 },
  'portal: visits list after confirming': { 'color-contrast': 1 },
  'portal: visits list, a visit needing confirmation': { 'color-contrast': 1 },
  'staff: add-patient dialog, filled in': { 'color-contrast': 2 },
  'staff: appointment drawer open': { 'color-contrast': 1 },
  'staff: cancel-appointment confirmation over the drawer': { 'color-contrast': 1 },
  'staff: dream team, a proposal waiting on a yes': { 'color-contrast': 3 },
  'staff: leads board, filtered to contacted': { 'color-contrast': 1 },
  'staff: patient chart': { 'color-contrast': 1 },
  'staff: patients list, brand-new empty clinic': { 'color-contrast': 2 },
  'staff: patients list, populated': { 'color-contrast': 1 },
  'staff: the day agenda': { 'color-contrast': 2 },
  'staff: website hub, site not yet published': { 'color-contrast': 1 },
  'staff: website hub, site published': { 'color-contrast': 4 },
}
