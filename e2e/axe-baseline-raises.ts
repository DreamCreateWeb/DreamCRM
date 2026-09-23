/**
 * THE ONLY WAY A CEILING IN `e2e/axe-baseline.ts` IS ALLOWED TO GO UP.
 *
 * `e2e/axe-baseline.ts` states the rule four ways — "numbers only ever go
 * DOWN", "this is a ratchet, not a pardon" — and the conventions state it twice
 * more ("ceilings only ever go down"; "raising a ceiling to get green is
 * weakening a failing test"). Until now nothing read the previous value, so
 * raising any entry by one made `pnpm test` green and tripped no guard and no
 * label. That was the last remaining way to weaken a required check with nobody
 * seeing it (docs/RELEASE.md Part 5, filed by Sentinel on DREAMCRM-49).
 *
 * `tests/guards/axe-baseline-ratchet.test.ts` now reads every entry's value on
 * `origin/main` and fails `test` on any increase — INCLUDING an entry that did
 * not exist there at all, because an unlisted (stop, rule) has a ceiling of
 * zero, and adding `{ 'color-contrast': 2 }` to a clean stop is a raise from 0
 * to 2 wearing the clothes of a new line.
 *
 * WHY THERE IS AN OPT-OUT AT ALL. One legitimate raise has already happened and
 * will happen again: a stop nobody had ever scanned. The three portal-billing
 * stops entered on 2026-09-14 were pre-existing defects that a NEW spec
 * revealed, not regressions that spec caused — the same situation the whole
 * baseline was created for. A guard with no way to say that would be answered
 * by deleting the guard.
 *
 * WHY IT IS A SEPARATE FILE. `e2e/axe-baseline.ts` is deliberately off the
 * review gate's intake list, because a ceiling SHRINK is the end of nearly
 * every accessibility fix — it moved in 10 of the last 90 merged PRs — and
 * labelling those would teach people the label means nothing. A path pattern
 * cannot tell a shrink from a raise. But it CAN tell this file from that one:
 * nothing shrinks a ceiling by editing this list, so every diff that touches it
 * is a raise, and `scripts/review-gate.mjs` gates it under `check-definitions`
 * (the rule whose own `why` is "an exclusion is the one edit to a gate that can
 * only ever make it looser"). Shrinks stay label-free; raises reach Sentinel.
 * That is the whole reason the opt-out does not live beside the numbers.
 *
 * WHAT AN ENTRY OWES, and why each part is checked rather than trusted:
 *
 *   - `from` and `to` must be EXACTLY the value on `origin/main` and the value
 *     in this tree. An entry that authorises 1 → 2 does not authorise 1 → 5,
 *     and the guard will not round in your favour.
 *   - `why` has to argue that the violations being admitted are PRE-EXISTING —
 *     revealed by a new stop, a new rule, or a page nothing had walked — rather
 *     than newly introduced. A raise to get a new defect past the gate is the
 *     move this whole mechanism exists to refuse, and there is no wording of it
 *     that makes it legal.
 *   - `ref` names the issue or PR carrying the argument, so the next reader can
 *     go and check it instead of taking the sentence's word.
 *
 * AND AN ENTRY HAS TO STAY TRUE. Every one of these is re-checked against the
 * live baseline on every run: once the ceiling it describes moves off `to` —
 * which is what happens the moment somebody fixes the defect and shrinks it —
 * the entry is describing a tree that no longer exists, and `test` goes red
 * until it is deleted. That is deliberate and it is the #587 lesson applied
 * here: three of this repo's four dead-exemption detectors ask only whether an
 * exemption still MATCHES something, never whether its REASON is still true, so
 * an allowance written for one ground goes on pardoning its subject long after
 * the ground has gone. An expired pardon in THIS list would be a standing
 * licence to carry a defect nobody can name.
 *
 * It is empty, and it should usually be empty. An empty list is the ratchet
 * working.
 */

export type CeilingRaise = {
  /** The stop key, exactly as it is spelled in `A11Y_BASELINE`. */
  stop: string
  /** The axe rule id, exactly as it is spelled in `A11Y_BASELINE`. */
  rule: string
  /** The value on `origin/main`. `0` for a (stop, rule) that is not listed there. */
  from: number
  /** The value this raise lands on. Must equal what `e2e/axe-baseline.ts` now says. */
  to: number
  /** The day it was taken, `YYYY-MM-DD`. */
  date: string
  /** The issue key or PR number carrying the argument — `DREAMCRM-33`, `#573`. */
  ref: string
  /**
   * Why these violations are pre-existing rather than newly introduced, in
   * enough detail that somebody can go and disagree with it. Name the colours,
   * the selectors, or the spec that first walked the stop.
   */
  why: string
}

const DEMO_PANEL_WHY =
  'PRE-EXISTING, on a surface nothing had ever scanned. `e2e/demo-journey.spec.ts` ' +
  '(DREAMCRM-124) is the first spec in the suite to load the pop-out presenter panel — the ' +
  'script window a salesperson reads from during a live branded demo. Nothing in `e2e/` had ' +
  'walked `/demo/script`, or `/platform/prospecting` at all, which is the same situation the ' +
  'three portal-billing stops entered under on 2026-09-14 and the situation this opt-out was ' +
  'written for. Every failing node is live on `main` and none of them is reachable by any spec ' +
  'that existed before this PR: the panel is dark chrome and these are the quiet inks on it, ' +
  'all at 12px. The measured pairs, hexes/ratios/elements, are enumerated in ' +
  '`e2e/axe-baseline.ts` beside the ceiling — worst is #4c5a78 on #282f43 at 1.92:1 on the ' +
  'CURRENT beat marker, and the two action buttons are #1a2440 on #2f6d6a at 2.56:1, where ' +
  'the ground is the prospect\'s own brand colour out of the demo skin. The fix is UI-lane ' +
  'token work (and, for the buttons, a brand-derived readable ink the way `portalBrand()` ' +
  'already does for the portal); QA changes tests, not pixels. The alternative was to not ' +
  'land the coverage, which leaves 14 defects on the surface a prospect watches invisible for ' +
  'the same reason they have been invisible until today.'

export const CEILING_RAISES: CeilingRaise[] = [
  {
    stop: 'demo: presenter script, beat 1 of a live demo',
    rule: 'color-contrast',
    from: 0,
    to: 9,
    date: '2026-09-23',
    ref: '#722',
    why: DEMO_PANEL_WHY,
  },
  {
    stop: 'demo: the wrap-up, outcome not yet chosen',
    rule: 'color-contrast',
    from: 0,
    to: 5,
    date: '2026-09-23',
    ref: '#722',
    why: DEMO_PANEL_WHY,
  },
]
