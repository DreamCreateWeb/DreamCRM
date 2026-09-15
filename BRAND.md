# DreamCRM Marketing-Site Brand Book — "Night Dream"

The binding personality language for the **public marketing site**
(`app/(marketing)`, `components/marketing`). Owner-approved direction, agreed
with Dustin Russenberger on DREAMCRM-43, 2026-09-14.

**Scope boundary.** This file governs the marketing site only. It does not
touch `app/(default)` / `app/(double-sidebar)` (that is `DESIGN-SYSTEM.md` v3,
"Cute Dream, Living Data"), the patient portal, the public clinic sites
(`app/site`), or auth/onboarding. Those keep their own languages, deliberately.

**How it relates to the other docs:**

| Doc | Owns |
|---|---|
| `DESIGN.md` | What the marketing site *says* — the identity-first positioning, the honesty tenets, the outbound-vs-website rule |
| **This file** | What the marketing site *looks and feels like* — mood, palette energy, shape, type, emoji, motion |
| `DESIGN-SYSTEM.md` | The dashboard's language, and the token ramps both surfaces draw from |

The tokens are shared; the language is not. Nothing here extends or re-points a
ramp — every colour below already exists in `app/css/style.css`.

---

## Part 0 — The decision record

Three rounds with the owner, all with rendered comparisons rather than
descriptions (2026-09-14, DREAMCRM-43):

1. **Diagnosis.** The site was selling a different product than the one people
   get: austere white/Inter/square-cornered marketing in front of a rounded,
   floating, springy dream-blue app. Four directions were built on identical
   content — *Today*, *Dream Out Loud* (the app's own v3 language), *Editorial
   Dream* (Fraunces, off-centre), *Playground* (blobs, stickers, tilt).
2. **Owner picked Playground** for its energy — *"way too childish, if we could
   make D feel more modern techno dream."* Three grown-up variants followed:
   *Night Dream* (all dark), *Daylight Techno* (all light), *Night hero,
   daylight body*.
3. **Owner picked the third:** *"I like D the most, with only the hero in dark
   mode."* That is this document.

**Implementation decisions since (append one block per batch):**

4. **The emoji ban does not reach a product mock's own glyphs** (DREAMCRM-54,
   2026-09-15). Part 5 bans emoji in "product mocks", and the dashboard mock in
   the hero shows the birthday glyph on a patient row. That glyph is the real
   product — `lib/ui/encodings.ts` hands out the same character on the real
   Today's-chair row, and `docs/` documents it to customers — so removing it
   would make the mock an unfaithful picture of the thing being sold, which is
   the one job a mock has. **The ban is on emoji as our VOICE, not on a
   screenshot telling the truth about the app.** Decoration, chrome, headlines
   and copy stay clear of them.
5. **The chrome is still daylight and that is not a defect** (same batch). The
   sticky header sits above the night band at white/85, because shared chrome is
   move 3 below and changing it now would re-skin every subpage in a batch that
   is meant to cover one. The band's top edge is therefore drawn deliberately —
   a resting hairline plus the one-shot scan sweep — so it reads as a surface
   starting rather than as a header that forgot to change.

**Why hero-only dark is the right answer and not a compromise.** The pages that
close the sale — pricing, comparisons, docs, blog — are long-form reading done
on a bright operatory monitor by a practice owner in their fifties. Dark is a
worse surface for those. And the product's own default theme is light, so a
fully dark site would have recreated the round-1 mismatch in reverse. The night
band buys the memorability; daylight keeps the reading.

The page already ended in the dark — the footer sits on `gray-950` in both
themes. The night hero makes that deliberate: **the page opens and closes at
night, and does its reading in daylight.**

---

## Part 1 — Mood

Derived from what the owner accepted and rejected across the three rounds, not
from a word list picked in the abstract.

**In order: electric · precise · dreamlike.**

- **Electric** — the site should feel switched on. Glow, not gloss.
- **Precise** — the anti-childish word, and the one that does the most work.
  Every choice answers *instrument* rather than *toy*: measured grids, 1px
  strokes, monospace numerals, dead-straight alignment.
- **Dreamlike** — what keeps it DreamCRM rather than a generic dev tool. Night
  sky, aurora, stars, soft bloom. The brand is named Dream; the night is where
  dreams happen.

**Not us: cute. Also not us: corporate.** Cute was rejected explicitly. Corporate
was rejected in round one, when the current site lost to every alternative.

**Warmth moved from the pixels to the words.** This is the trade the direction
makes and it must be honoured, or the site turns cold. The surfaces got sharper,
so the copy carries all the humanity: *"3 still need a text,"* never *"3 records
pending confirmation."* See Part 5.

---

## Part 2 — Palette energy

No new colours. Two grounds, one accent family, one celebration accent.

### The night band (hero, ticker, footer)

| Role | Token / value |
|---|---|
| Ground | `#0C1226` → `#10182E` (the design system's `surface-sunk` / `canvas` dark values) |
| Raised surface | `#161F3A`, `#1B2544` |
| Hairline ("wire") | `rgb(124 165 255 / .13)`, soft `/ .055` |
| Primary ink | `#FFFFFF` |
| Body ink | `gray-300 #C3D0E8` |
| Quiet ink | `gray-400 #93A0BC` — labels and captions only, never body copy |
| Accent, luminous | `teal-300 #9DBDFF`, `teal-400 #7CA5FF` |
| Second accent | `violet-300 #B7ACFF` — gradients only, never alone, never a status |
| Primary action | `teal-300 → teal-400` fill carrying **dark ink `#0C1226`** |

### The daylight body (everything else)

| Role | Token / value |
|---|---|
| Ground | `#FFFFFF` and `surface-1 #F8FAFF` |
| Hairline | `rgb(76 125 240 / .16)` |
| Ink | `ink-900 #1A2440`, body `ink-600 #4C5A78`, quiet `ink-500 #5C6C89` |
| Accent | `teal-600 #3A67D9`, `teal-700 #2F52B3` |
| Second accent | `violet-700 #5D47DE` — **not** `violet-600`, which lands at 4.42:1 |
| Primary action | `teal-600 → teal-700` fill carrying white |

### Standing rules

- **The brand hue is never a status.** Inherited verbatim from
  `DESIGN-SYSTEM.md` Part 1 and it binds here too. Status keeps the tone
  registry: emerald ok, amber needs-our-action, rose urgent, violet in-flight,
  fuchsia celebrated.
- **Fuchsia is the celebration accent and appears nowhere else.** New patient
  arriving, trial started, a real win. Never on pricing, never on an error.
- **White text starts at `teal-600`.** `teal-400`/`teal-500` are identity
  colours, not white-text fills — solid or gradient stop, hover included. On the
  night band the relationship inverts: the luminous steps carry *dark* ink.
- **Gradient used as text must have both stops legal.** Both ends are the ink.
  This is the DREAMCRM-44 lesson and no automated check can see it (Part 7).

---

## Part 3 — Shape language

- **Radii.** 10px controls and buttons · 12px small tiles · 14px cards ·
  16px the product mock · `999px` reserved for eyebrow badges and status
  chips. Nothing else is a pill; nothing is a square.
- **Never:** rotation, organic blobs, hard offset shadows, 2px cartoon
  outlines. Those four are what made the rejected version read as a toy.
- **Depth is emission, not stacking.** Night: an object glows
  (`0 6px 22px rgb(124 165 255/.34)` on the primary, bloom on the mock).
  Daylight: one hairline plus a soft blue shadow. No hard-edged drop shadows
  anywhere.
- **The grid is visible and it is the point.** A 56px blueprint grid at
  ≤5.5% alpha in the night band, radially masked so it fades before the edges.
  Content locks to it.
- **Geometry, chrome zones only.** Concentric orbit rings (1px, ≤13% alpha),
  one soft orb behind the headline, an aurora wash, a star field. Never behind
  reading text, never inside a data surface, always `aria-hidden` and
  `pointer-events: none`.
- **One grid-break per page, and it is a bleed.** Something crosses the
  container edge — the mock, a ring, the ticker. Breaking the grid by *rotating*
  something is banned; that was the childish move.

---

## Part 4 — Type

- **Inter stays the marketing face.** Self-hosted, already in
  `public/fonts/inter-latin-var.woff2`. Nunito is the dashboard's face and does
  not cross over; Fraunces belongs to the clinic sites.
- **Tracking is the technique.** Display `-0.035em`, headings `-0.02em`, body
  `0`. Tight tracking on a neutral grotesk is most of what reads as "modern
  tech."
- **Weights:** 800 display, 700 headings, 500 body, 600 UI labels.
- **Monospace micro-labels — the signature detail.** Geist Mono (already in the
  stack for dashboard numerals) for eyebrows, the trust row, KPI labels, the
  ticker, "learn more", timestamps and any number the reader is meant to
  compare. Uppercase, tracking `0.09em`–`0.16em`.
- **The 12px floor applies here too.** No `text-[11px]`, no sub-0.75rem
  literals. **Mono micro-labels are `0.75rem`.** This line originally said
  0.72rem was "at the floor" and that was arithmetic rather than taste —
  0.72 x 16 = 11.52px, which is UNDER the 12px floor. Nothing would have caught
  it either: `tests/a11y/legibility-floor.test.ts` skips `components/marketing`,
  because the product mocks there imitate a real screen at 7px. Corrected on
  DREAMCRM-54 before the first mono label shipped; the recipe is single-homed as
  `MONO_LABEL` in `components/marketing/ui.tsx`.

---

## Part 5 — Emoji and copy voice

**Emoji.** The techno register does not carry them. This narrows the studio's
general "emojis belong in empty states and success moments" rule for this
surface specifically:

- **Banned:** the chrome, the hero, product mocks, pricing, comparisons, ROI and
  grader tools, error copy, billing copy, legal copy. Also banned as decoration
  anywhere — the sparkle in the rejected version was a childish signal.
- **Allowed, sparingly:** blog and changelog body copy where a named human is
  writing in the first person.
- **Celebration is expressed with light, not with a face.** A glow pulse, a
  luminous pill, a fuchsia chip. That is the replacement, and it is better —
  it works in both grounds and cannot date.

**Copy voice.** Plain, short, declarative, specific. The warmth budget lives
here.

- Sentence case everywhere except mono micro-labels.
- Say the number: *"7 days free"*, *"$200/mo, flat"*, *"3 still need a text."*
- Name things as the reader experiences them — *"the portal your patients see"*,
  not *"the patient-facing surface."*
- Banned: *leverage, seamless, unlock, empower, revolutionise, supercharge*, and
  any sentence that would survive being pasted onto a competitor's site.
- Errors, billing and legal stay completely straight — no personality, no
  hedging, no apology theatre.
- Honesty tenets from `DESIGN.md` are load-bearing brand personality, not
  small print: the price is on the page, the gaps are marked, leaving is
  allowed.

---

## Part 6 — Motion

CSS only. No animation library. `prefers-reduced-motion: reduce` kills every
item below except opacity/colour fades — non-negotiable, and the site's existing
`MarketingMotionStyles` already establishes the pattern.

- **Ambient, night band only, one loop per band:** aurora drift ~18s; star field
  static or a very slow twinkle; the live dot pulses ~1.8s. Compositor-only
  (transform/opacity), never layout properties.
- **Once, on load:** the hairline scan sweep across the top of the night band;
  the existing `mkt-fade-up` entrance stagger (0.65s, `cubic-bezier(.16,1,.3,1)`).
- **Hover, pointer-fine only:** 1px lift and the glow deepens. 140ms.
- **No spring overshoot on marketing.** `--spring-pop` is the dashboard's cute
  register; here it reads as bounce. Ease-out only.
- **Never animate:** text being read, anything on scroll beyond the one
  entrance, the ticker's contents on hover (it pauses, as it already does).

---

## Part 7 — The contrast law for the night band

**A dark band inside a light-mode page is the repo's most dangerous surface, and
this direction adds a large one.** No `.dark` scope applies to it, so
`tests/a11y/dark-mode-parity.test.ts` cannot see it — that guard only fires on
elements whose `dark:` and light halves disagree. axe grades only the stops the
browser suite walks, and reports gradients as `incomplete` rather than failing.
This is not hypothetical: the marketing footer's column headings sat live at
3.42:1 for exactly this reason, and the homepage headline's gradient ink sat at
2.42:1 with every gate green (DREAMCRM-44).

**So every pair in the night band is measured by hand and recorded here. A
colour that is not in this table does not go in the night band.**

| Foreground | Ground | Ratio | Use |
|---|---|---|---|
| `#FFFFFF` | `#10182E` | 17.62 | headings, primary ink |
| `gray-300 #C3D0E8` | `#10182E` | 11.33 | body copy |
| `teal-300 #9DBDFF` | `#10182E` | 9.36 | headline gradient start, accent text |
| `violet-300 #B7ACFF` | `#10182E` | 8.69 | headline gradient end |
| `teal-400 #7CA5FF` | `#10182E` | 7.28 | eyebrows, icons, links |
| `gray-400 #93A0BC` | `#10182E` | 6.71 | labels and captions only |
| `#0C1226` ink | `teal-300 #9DBDFF` fill | 9.87 | the primary button, light end |
| `#0C1226` ink | `teal-400 #7CA5FF` fill | 7.68 | the primary button, deep end |
| `gray-300 #C3D0E8` | `surface-1 #161F3A` | 10.46 | copy on a raised card |
| `teal-400 #7CA5FF` | `surface-1 #161F3A` | 6.72 | accents on a raised card |

Measured with the WCAG relative-luminance formula. `teal-500 #4C7DF0` lands at
4.61 on the canvas — legal for text but too dim to use as the luminous accent;
it stays a fill and a dot colour on the night band.

**Two corrections from the first implementation (DREAMCRM-54, 2026-09-15),
because a table nobody re-measures is a list of numbers somebody typed once:**

- The primary-button row read **7.28**, which is `teal-400`'s ratio as INK on
  the ground one row up — the same number copied into the row below it. Dark
  ink on the `teal-400` fill is **7.68**, and the button is a gradient, so both
  ends are in the table now. No design changed; the transcription did.
- `gray-500 #5C6C89` is **3.32** on this ground and must never appear in the
  band. It is not in the table, so it was already banned — but it is the pair
  that actually shipped (the marketing footer's headings, live at 3.42 for
  months), so it is now pinned as a NEGATIVE assertion in
  `tests/a11y/token-contrast.test.ts` rather than left implicit.

### The table grades the FLAT ground. The band is not flat.

Every ratio above is ink against `#10182E`. The band also paints a blueprint
grid, an aurora wash, two orbit rings, an orb and a star field on top of it —
and every one of those is a `background-image`, which **axe cannot see at all**
(it reads `background-color`). So a wash that walks the ink under 4.5:1 would
be invisible to the table, to every source rule, and to the browser suite at
once.

`scripts/night-band-grade.mjs` closes that: it renders the page, hides the
band's content, screenshots the decorative layers alone, and takes the
BRIGHTEST pixel under each run of glyphs. Run it against any URL that serves
the page — `BASE_URL=… node scripts/night-band-grade.mjs` — and it fails when
anything lands under AA. The homepage measured on DREAMCRM-54:

| Text | Ink | Brightest ground under it | Rendered | Flat |
|---|---|---|---|---|
| eyebrow badge | `teal-400` | `rgb(32 45 78)` | **5.61** | 7.28 |
| headline | `#FFFFFF` | `rgb(64 75 100)` | **8.72** | 17.62 |
| body copy | `gray-300` | `rgb(37 50 85)` | **8.11** | 11.33 |
| trust row | `gray-300` | `rgb(25 35 62)` | **10.00** | 11.33 |
| caption | `gray-400` | `rgb(17 26 48)` | **6.58** | 6.71 |
| ticker | `gray-400` | `rgb(16 24 46)` | **6.71** | 6.71 |

Two rules fall out of that run and they bind the next batch:

- **Keep every aurora lobe centred OUTSIDE the band and horizontally apart.**
  A single teal lobe at 16% alpha over the ground already puts `gray-400` — the
  palest ink here — at 5.05. Lobes that stack over the reading column do not
  have that headroom.
- **A bloom is a light source, so keep text out of it.** The caption first
  measured **3.40**, then **4.18**: it was sitting in the spill from the product
  mock's bloom and the phone mock's grey shadow. Pulling the bloom in and giving
  the caption air took it to 6.58. Note the middle number — 4.18 is a real
  failure that reads as "nearly fine", which is what this whole surface is
  dangerous for.

**This table is now asserted, not just written.** `token-contrast.test.ts`
re-derives every row above from `app/css/style.css` on each run
("every ink BRAND.md Part 7 allows on the night band clears AA there"), so
re-pointing a ramp step re-grades the whole band instead of quietly
invalidating a document. The table is still where the DECISION lives; the test
is what stops it drifting away from the stylesheet.

### The twin of `GRADIENT_TEXT_EXEMPTIONS` — read this before you write gradient text on the band

`tests/a11y/class-pairs.ts` rule 4 grades the stops of a `bg-clip-text`
gradient **as ink against plain white**, deliberately. That is not an oversight
to route around: white was the ground under every `bg-clip-text` in the tree
when the rule landed, and grading against it keeps rule 4's cutoff IDENTICAL to
rule 2's rather than opening a third opinion about which teal step is legal.
Its own module header says so.

So **the night band's headline fails rule 4 correctly-in-form and
wrongly-in-fact**, and this is what it looks like:

| Stop | on white (what rule 4 grades) | on `#10182E` (what renders) |
|---|---|---|
| `teal-300 #9DBDFF` | 1.88 | **9.36** |
| `violet-300 #B7ACFF` | 2.03 | **8.69** |

The fix is a `GRADIENT_TEXT_EXEMPTIONS` entry carrying the measured dark
ratios, **not a change to rule 4** — it is right about every other site in the
tree, and weakening it to get green would re-open the 2.42 headline
DREAMCRM-44 closed. The entry is keyed to the exact class string, and a second
assertion checks its PREMISE structurally: the exempted span has to still be
inside a `<section>` that carries the night ground and renders `NightSky`. Move
the hero back to white and the guard goes red naming the exemption, which is
the only warning anyone will get — the scanner reads one quoted string and has
no ancestor to resolve.

Rule 5 (`TONE_FILL`, the solid-fill registry) has **no opinion** about the
band's chips, and that was checked rather than assumed: it only fires on an
opaque `bg-<ramp>-<step>` paired with an opaque `text-*`, and the band's chips
are translucent tints. Pinned in `token-contrast.test.ts` both ways — the tint
stays quiet, a SOLID tone chip fires. If you ever need a solid tone chip on the
night band, the answer is to extend the registry, not to write a local recipe:
`TONE_PILL`'s ink steps are chosen for a light ground and do not read on this
one.

---

## Part 8 — First moves

Ordered, each its own small PR, each verified in the real page before it lands:

1. **The homepage hero becomes the night band** — grid, aurora, orbit rings,
   orb, star field, mono micro-labels, the product mock as instrument glass —
   and the ticker goes with it. Fix the headline gradient in the same pass if
   DREAMCRM-44 has not already landed it.
2. **The rest of the homepage moves to daylight techno** — hairline cards at
   14px, mono eyebrows, straight grid, glow-on-hover, no tilt.
3. **Shared chrome** — `MarketingHeader`, `MarketingFooter` and `PageHero` in
   `components/marketing/` — so every subpage inherits the language for free
   instead of drifting page by page.
4. **Then per page, in this order:** pricing (the honest test of whether the
   language survives a table), compare, product, why, resources.

The site is light-only today (zero `dark:` classes under `app/(marketing)`).
Nothing here changes that: the night band is a dark *band*, hand-graded per
Part 7, not a theme. Whether the marketing site ever gets a real dark theme is a
separate question and has not been decided.

---

## Part 9 — What still needs the owner

Everything in Parts 1–8 is settled and ships without another approval round.
These do not:

- The logo, the mark, or the wordmark lockup.
- Any change to a colour ramp — extending it, re-pointing it, adding a hue.
- Anything that changes what the brand *is* rather than how loudly it speaks.
- Pricing, published external communications, money-moving behaviour, spending,
  and destructive operations — the studio's standing list, which outranks this
  document.

A contrast or accessibility fix that stays inside the existing colour family is
**not** on this list and does not wait, signature elements included.

---

## Living document

Update this file whenever an issue produces a brand decision — that is the
point of it. Add the decision to Part 0 with its date and the issue key, and
change the part it affects in the same commit. A decision that lives only in an
issue thread has reached nobody.
