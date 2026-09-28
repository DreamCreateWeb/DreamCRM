# §6. UI works inside the design system

*`dreamcrm-conventions` §6. `SKILL.md` is the map and carries §§4, 5, 7, 9 and 10 in full.*

If your change renders anything:

- `docs/DESIGN-SYSTEM.md` (v3) is binding — its 10 shared primitives, the chart
  kit, and the token single-homes (all enforced by guard tests).
- Work within the system, never alongside it. No off-system UI, ever.
- `docs/UI-BEST-VERSION.md` is the standing UI-quality punch list — the program
  of record for UI work.
- Accessibility findings outrank cosmetics. Dark-mode parity on everything you
  touch.
- Anything you render is scanned by the E2E accessibility checks, against the
  ceilings in `e2e/axe-baseline.ts` (see §2). Landing a fix means shrinking or
  deleting its entry in the same PR; a ceiling is room a defect can hide in,
  not a defect count.
- **The 12px type floor and the retired-tone ban now grade all of `components`,
  not just `components/ui`** (DREAMCRM-50, §2). Any arbitrary font size is parsed
  and compared numerically, so `text-[11.5px]` fails `test` wherever you write it;
  a retired tone counts as retired in the `theme(colors.sky.500/40%)` spelling too.
  The five patient token landing pages (`app/b`, `app/c`, `app/n` and siblings)
  are inside the portal-token scan now as well — use the exported token, never the
  hex.
- **A gradient under white text runs entirely on `teal-600` or deeper — every
  stop, in every rendering including `hover:`.** A solid `teal-400`/`teal-500`
  fill under white is out for the same reason. **Gradient TEXT
  (`bg-clip-text text-transparent`) runs on `teal-600` or deeper too** — there
  the gradient is the ink, so each stop is graded against the page's white
  ground, and because the WCAG ratio is symmetric it is the same cutoff, not a
  second one. All three are graded at the source by `test` (§2), not by the
  browser suite: axe cannot measure a gradient at all, so a clean axe run says
  nothing about one. `DESIGN-SYSTEM.md`'s accent-usage rules are the
  design-system home for the cutoff.
- **A solid tone fill with a label on it comes from `TONE_FILL` /
  `TONE_FILL_HOVER` in `lib/ui/encodings.ts` — look it up, never pick it.**
  Count badges, status chips, done-ticks, avatar wells, small tone-coloured
  chip buttons. One ink for all six tones; the hover half is lighter, not
  deeper; no `dark:` half, because the fill is the surface. Rule 5 in `test`
  (§2) fails an off-registry pairing **even when it clears 4.5:1**, because
  the defect it catches is a second answer to a question that already has one.
  `DESIGN-SYSTEM.md` carries the design-system statement of the recipe.
- **The neutral ramp has three written roles, and only one of them is text**
  (`DESIGN-SYSTEM.md` §2.2, completed 2026-09-15 on DREAMCRM-62). `gray-500` in
  light and `dark:gray-400` in dark are the lightest READABLE inks — that half
  has been binding since v3 and is now enforced at zero by rule 6 in `test`
  (§2b). `gray-400` in light is the stylesheet's **"disabled only"** value.
  `gray-300` / `dark:gray-600` is the **ornament step**: exempt from the
  readable-ink floor because it carries no information, and never the sole
  carrier of a state — the `·` between two fields, the arrow a card reveals on
  hover. Before this landed the ramp had a readable end and a disabled end and
  nothing in between, so every faint separator in the product was a judgement
  call and a guard's window was the only written answer. If you want a neutral to
  be faint, say which of the three you mean; if none of them fits, that is a
  §2.2 edit, not a local decision.
- **The marketing site has its own binding language: `BRAND.md`** (#586,
  2026-09-15, approved by the owner on DREAMCRM-43). Read it before you touch
  `app/(marketing)` or `components/marketing`. It is the single home for that
  direction — do not restate its rules here or in an agent's instructions,
  because it moves: the no-emoji rule in it was reversed by the owner within
  hours of it landing, and the replacement has since SHIPPED — Part 5 is now a
  usage rule, not a ban (#602 / DREAMCRM-56, `86b0c714`, 2026-09-15): six
  curated animated glyphs, a registry in `lib/marketing/emoji.ts`, and two
  placements only. The bans that did not move — hero, chrome, product mocks,
  pricing, comparisons, errors, billing, legal — did not move, so read Part 5
  rather than assuming the reversal was general. **Part 7 of it is load-bearing inside `test`** (§2) —
  its hand-graded contrast table is re-derived from `app/css/style.css` on every
  run, so a ramp edit re-grades the dark marketing ground, and editing that table
  without measuring fails a required check. **Since #611 / DREAMCRM-67
  (`02074ff0`, 2026-09-15) the book is retitled *Daylight Dream* and the table
  points at the FOOTER**: the owner reversed the dark hero, Part 2 collapses to
  one ground, and Part 6's scroll-animation ban became a specification (one
  scroll position drives everything, interruptible, a real stacked layout under
  `prefers-reduced-motion`, no keyboard trap, no pin on touch). **Part 6 was AMENDED again on 2026-09-22, owner
  directive — THE LIVING STAGE** (#636, `e2b87c9f`): the homepage stage is a
  scroll-scrubbed showcase rather than four pictures cross-fading, and the
  amendment keeps every rule above by construction. Every beat is driven by one
  custom property per frame and eased in CSS `calc()`; the particle layer is a
  pure function of the same scroll position, with one ambient loop; the canvas
  sits between the scenes and the reading copy; the pointer is a second INPUT,
  not a second clock. **Its alpha arithmetic is graded inside `test`**
  (`tests/marketing/cinema-fx.test.ts`, §2b) because axe cannot see a canvas any
  more than it can see a gradient. **Move 1 of the
  build has now landed too** (#613 / DREAMCRM-69, `375ce1fb`, 2026-09-15): the
  homepage hero is a light band, and the one `CLIPPED_TEXT_EXEMPTIONS` entry the
  dark hero needed was deleted rather than re-pointed. Part 8 is the remaining
  build order, and Parts 10 and 11 were APPENDED rather than slotted in because parts 0-9 are cited by number from `app/`, `components/`,
  `tests/` and `scripts/`. Renumbering a document that code cites by number is a
  silent break: append.
- **On the dark marketing ground the ramp runs the other way round** (the hero
  until Daylight lands; the footer after). The daylight rule is
  white ink starting at `teal-600`; on the dark band the LUMINOUS end of the
  ramp is the fill and dark ink `#0c1226` rides it (`teal-300` 9.87,
  `teal-400` 7.68). That is why it is a separate `NightPrimaryCta` rather than a
  variant of the daylight button. Labels and captions there use `gray-400`,
  never `gray-500` — 3.42 on the night ground, pinned as a negative in `test`.
  And a dark band inside a light-mode page is **not** a theme: no `dark:`
  classes, which is exactly why every pair on it is hand-graded.
- **A contrast or accessibility fix that stays inside the design system's
  existing colour family is not a redesign and does not wait on the owner —
  signature elements included.** Ruled 2026-09-14 on DREAMCRM-31. The primary
  gradient's white label failed contrast across most of its width; it was sent
  up as an owner decision *because* it is the brand's signature element, and the
  ruling came back that it should not have needed one. Moving a token one step
  deeper in the same family to clear 4.5:1 is engineering. Changing the family,
  the hue, or the element's shape is a redesign and still waits (below).
- No redesigns without explicit direction from the owner (Dustin Russenberger).
  If a task seems to require one, propose it in an issue comment instead.
- **Handing a contrast defect to another lane, or writing one into a ceiling or the ledger — §10 says what the entry owes.** The measured foreground hex, the element and the stop; a suspected token is never a substitute for the measurement.
