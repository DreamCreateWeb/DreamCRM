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
 * A ceiling rather than an exact match on purpose: one stop genuinely varies
 * (the booking confirmation reported 2 and then 1 across two attempts of the
 * same run, because what is on screen depends on which slot was free). An
 * exact-match baseline would have made that stop flaky on day one, and a flaky
 * gate is worse than a loose one.
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
 *   - **nested-interactive (25) and list (13)** — one structural pattern, not
 *     two: the appointments agenda row is an `li[role="button"]` that contains
 *     its own focusable controls, sitting in a list whose direct children are
 *     therefore not list items. A screen-reader user tabbing into the row gets
 *     something it cannot describe. Both rules clear together when that row is
 *     restructured. It shows up on the day agenda, the drawer stops (which
 *     render over it) and the leads board.
 *
 * Owned by the UI lane and handed over with this reproduction — see the
 * comment thread on DREAMCRM-26. QA owns the checks; the pixels are not ours.
 */
export const A11Y_BASELINE: Record<string, Record<string, number>> = {
  'auth: sign-in showing the failure alert': { 'color-contrast': 1 },
  'booking: slot chosen, details filled in': { 'color-contrast': 3 },
  'booking: the confirmation a patient lands on': { 'color-contrast': 2 },
  'clinic site: booking page': { 'color-contrast': 3 },
  'clinic site: portal door on a pre-live clinic': { 'color-contrast': 2 },
  'marketing: home': { 'color-contrast': 45 },
  'marketing: pricing': { 'color-contrast': 7 },
  'portal: cancel confirmation showing': { 'color-contrast': 8 },
  'portal: patient dashboard': { 'color-contrast': 10 },
  'portal: reschedule panel open, a new time picked': { 'color-contrast': 11 },
  'portal: visit inside the notice window': { 'color-contrast': 8 },
  'portal: visits list after confirming': { 'color-contrast': 7 },
  'portal: visits list, a visit needing confirmation': { 'color-contrast': 8 },
  'staff: add-patient dialog, filled in': { 'color-contrast': 2 },
  'staff: appointment drawer open': { 'color-contrast': 15, 'list': 4, 'nested-interactive': 8 },
  'staff: cancel-appointment confirmation over the drawer': { 'color-contrast': 15, 'list': 4, 'nested-interactive': 8 },
  'staff: dream team, a proposal waiting on a yes': { 'color-contrast': 3 },
  'staff: leads board, filtered to contacted': { 'color-contrast': 1, 'list': 1, 'nested-interactive': 1 },
  'staff: patient chart': { 'color-contrast': 3 },
  'staff: patients list, brand-new empty clinic': { 'color-contrast': 2 },
  'staff: patients list, populated': { 'color-contrast': 8 },
  'staff: the day agenda': { 'color-contrast': 5, 'list': 4, 'nested-interactive': 8 },
  'staff: website hub, site not yet published': { 'color-contrast': 1 },
  'staff: website hub, site published': { 'color-contrast': 4 },
  'token: confirm-my-visit page, still pending': { 'color-contrast': 2 },
}
