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
 * ── QA ANSWERED THE DECORATIVE-MOCK QUESTION: THEY ARE EXEMPT, NOT CARRIED ──
 *
 *   `marketing: home` used to sit at a ceiling of 41, and all 41 were inside
 *   two `aria-hidden` decorative product mock-ups in the hero — miniature
 *   simulated app screens (`DashboardMock`, `PortalMock` in
 *   `components/marketing/ui.tsx`) whose every text node renders at 7.7-10.9px.
 *   The UI lane (batch 56) declined to restyle an illustration to satisfy a
 *   tool and asked QA whether the scan should exclude those subtrees instead.
 *
 *   It should, and now does — see `A11Y_INCIDENTAL` below. Three reasons, in
 *   the order they decided it:
 *
 *     1. **WCAG 1.4.3 exempts them.** "Incidental" text — text that is part of
 *        a picture containing significant other visual content — carries no
 *        contrast requirement. A simulated screenshot rendered in DOM rather
 *        than shipped as a PNG is the same picture; axe measures computed
 *        style and cannot tell the two apart.
 *     2. **The repo already ruled this way once.**
 *        `tests/a11y/legibility-floor.test.ts` enforces the 12px SIZE floor
 *        over the dashboard, the portal and `components/ui` — and deliberately
 *        NOT over `components/marketing`, which is the only reason 0.48rem text
 *        in these mocks has never failed it. Carrying the same text as a
 *        contrast ceiling while exempting it from the size floor is the repo
 *        holding two positions at once.
 *     3. **A ceiling of 41 is unreadable as a ceiling.** It never comes down,
 *        because there is nothing to fix; it just sits on the product's
 *        most-visited page looking like 41 outstanding defects, and anyone
 *        triaging a11y debt has to re-derive that it is not. The file's own
 *        rule is that numbers only go down — a number that provably cannot is
 *        not a ceiling, it is a mislabelled exemption.
 *
 *   VERIFIED, not taken on trust: the first baselined run
 *   (actions/runs/34531475518) enumerated all 45 instances at this stop with
 *   selectors and computed colours. 41 resolve inside the two mock roots (every
 *   one at font-size 5.8-8.2pt); the other 4 were the marketing footer's
 *   `nav[aria-label=...]` column headings at 12px, which batch 55 fixed. 45
 *   minus those 4 is exactly the 41 that remained.
 *
 *   The stop's entry is therefore DELETED rather than lowered, which puts
 *   `marketing: home` back to zero tolerance: with the illustrations out of
 *   scope, a real contrast defect anywhere else on the home page now fails on
 *   arrival instead of being absorbed into an opaque 41.
 *
 *   WHAT THIS IS NOT: a way to make a red stop green. See `A11Y_INCIDENTAL`.
 *
 * Drops that were the documented WOBBLE rather than fixes, whose ceilings
 * deliberately stayed put: `booking: the confirmation a patient lands on`
 * reported 1 against its ceiling of 2 in every run, and `staff: dream team`
 * came in at 2 against 3. Both are the data-dependent counts the header warns
 * about, and a one-element drop is not evidence.
 *
 * Remaining after batch 56 and this file's exemption: **38 genuine
 * `color-contrast`, all in the baseline below.** (The 79 the UI lane reported
 * was 38 plus the 41 decorative-mock instances that are now exempt rather than
 * carried — the same page, counted honestly.) The largest identified pair among
 * the 38 is `#ffffff on #4c7df0` at 3.81:1: white text on the brand ramp's 500
 * step. teal-600 and deeper are the legal white-text fills, and
 * `tests/a11y/token-contrast.test.ts` asserts that, so the rule is written down
 * where the next batch will find it.
 */
export const A11Y_BASELINE: Record<string, Record<string, number>> = {
  'auth: sign-in showing the failure alert': { 'color-contrast': 1 },
  'booking: slot chosen, details filled in': { 'color-contrast': 3 },
  'booking: the confirmation a patient lands on': { 'color-contrast': 2 },
  'clinic site: booking page': { 'color-contrast': 3 },
  'clinic site: portal door on a pre-live clinic': { 'color-contrast': 2 },
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

/**
 * SUBTREES WCAG ITSELF PUTS OUT OF SCOPE, per stop. The narrow companion to the
 * ratchet above, and the ONLY thing in this harness that makes the gate looser
 * — so read the bar before adding one.
 *
 * THE BAR, all three:
 *
 *   1. The standard exempts the content, not merely "we do not want to fix it".
 *      Today that means WCAG 1.4.3's "incidental" clause: text that is part of
 *      a picture containing significant other visual content. A ceiling is for
 *      a real defect awaiting a fix; an exemption is for something that was
 *      never a defect. Anything you would be embarrassed to justify to a
 *      low-vision user is a ceiling, not an exemption.
 *   2. The selector matches the illustration and nothing else. Every one below
 *      pairs a structural hook with `aria-hidden="true"`, so it cannot quietly
 *      spread over content a person is meant to read: real readable content is
 *      not hidden from assistive tech.
 *   3. It is justified HERE, in the file a reader already opens to find out why
 *      a stop is tolerated — never inline at a call site in a spec, where the
 *      next person reads a bare CSS selector and no reason.
 *
 * WHY `exclude` RATHER THAN A CONTRAST-ONLY FILTER. `exclude` drops the subtree
 * from every rule, not just `color-contrast`, which is a real cost — but the
 * only WCAG rule that looks inside an `aria-hidden` subtree at all is
 * `aria-hidden-focus` (a focusable node hidden from assistive tech), and
 * `eslint.config.mjs` already errors on exactly that over `components/**` at
 * the source level. The cost is covered; a second filtering mechanism would not
 * have been.
 *
 * HOW IT FAILS SAFE. `deadExemptions()` in `e2e/axe.ts` asserts every selector
 * here still matches something at its stop, so an exemption cannot outlive the
 * illustration it describes. And if it ever did, the failure direction is the
 * safe one: nothing gets excluded, the stop has no ceiling, and the run goes
 * red rather than quietly clean. `e2e/axe-selftest.spec.ts` pins both halves —
 * that the exemption discounts the decorative text, and that it does not
 * discount faint text sitting next to it.
 */
export const A11Y_INCIDENTAL: Record<string, string[]> = {
  // The marketing hero's two simulated app screens — a browser-framed dashboard
  // and a phone-framed portal, `aria-hidden` illustrations at 7.7-10.9px whose
  // job is to look like the product from across a room. 41 instances; the long
  // note at the top of this file has the derivation and the evidence.
  //
  // Written as `<float wrapper> > <the aria-hidden mock root>` because that is
  // the whole of what makes these two subtrees pictures: `.mkt-float` /
  // `.mkt-float-slow` are the hero's own drift animations
  // (app/(marketing)/page.tsx), and the mock components put `aria-hidden="true"`
  // on their own outermost element. Swap either mock for a real screenshot or a
  // readable panel and this stops matching, which is `deadExemptions()`'s cue
  // to make somebody look at it again.
  'marketing: home': [
    '.mkt-float > [aria-hidden="true"]',
    '.mkt-float-slow > [aria-hidden="true"]',
  ],
}
