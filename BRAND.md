# DreamCRM Marketing-Site Brand Book — "Daylight Dream"

The binding personality language for the **public marketing site**
(`app/(marketing)`, `components/marketing`). Owner-approved direction, agreed
with Dustin Russenberger on DREAMCRM-43 (2026-09-14) and reversed from a night
hero to light throughout on DREAMCRM-67 (2026-09-15).

> **The fold and the list marks look like this; the chrome and the subpage
> layouts do not yet.** Moves 1–3 have landed: the homepage hero IS the
> daylight band (DREAMCRM-69), the cinematic spine sits below the ticker
> (DREAMCRM-70), and **both owner vetoes are now closed in code** — the night
> band's 56px grid and `CheckIcon` are deleted rather than dormant, so
> reaching for either is a build error rather than a review comment. Moves 4–6
> are still ahead: the shared chrome (`MarketingHeader`, `MarketingFooter`,
> `PageHero`) and every subpage's LAYOUT still wear the old language, even
> though their list marks are now tone tiles. Where this file and the code
> disagree, this file is the target and the code is the backlog — and Part 8
> says which move closes each gap.

**Scope boundary.** This file governs the marketing site only. It does not
touch `app/(default)` / `app/(double-sidebar)` (that is `DESIGN-SYSTEM.md` v3,
"Cute Dream, Living Data"), the patient portal, the public clinic sites
(`app/site`), or auth/onboarding. Those keep their own languages, deliberately.

**How it relates to the other docs:**

| Doc | Owns |
|---|---|
| `DESIGN.md` | What the marketing site *says* — the identity-first positioning, the honesty tenets, the outbound-vs-website rule |
| **This file** | What the marketing site *looks and feels like* — mood, palette energy, shape, type, emoji, motion, scaling, imagery |
| `DESIGN-SYSTEM.md` | The dashboard's language, and the token ramps both surfaces draw from |

The tokens are shared; the language is not. Nothing here extends or re-points a
ramp — every colour below already exists in `app/css/style.css`.

**Where things are.** Part numbers 0–9 are load-bearing: comments in `app/`,
`components/`, `tests/` and `scripts/` cite them by number. They keep their
numbers and their topics across the light reversal, which is why Scaling and
Imagery are appended as Parts 10 and 11 rather than slotted in where they would
read best.

| Part | Topic |
|---|---|
| 0 | The decision record |
| 1 | Mood |
| 2 | Palette energy |
| 3 | Shape language |
| 4 | Type |
| 5 | Emoji and copy voice |
| 6 | Motion, and the cinematic spine |
| 7 | The contrast law |
| 8 | Build order |
| 9 | What still needs the owner |
| 10 | Scaling |
| 11 | Imagery |

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
   mode."*

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
   sticky header sat above the night band at white/85, because shared chrome was
   a later move and changing it then would have re-skinned every subpage in a
   batch meant to cover one. **Superseded by decision 7:** with the whole page
   light, the header no longer sits on a ground it disagrees with, and the
   deliberate band-edge treatment that existed to explain the seam goes away
   with the seam.
6. **The emoji ban is reversed — themed animated emoji, curated** (DREAMCRM-56,
   2026-09-15). Owner decision, relayed by Mika and authorized by Dustin's
   comment on DREAMCRM-56 granting Mika's relay his own authority: *"what would
   be sick is to just use proper emojis, like find and download packs of
   animated emojis, try to find ones that fit the theme etc, not remove them
   completely."* Part 5 below is rewritten from a ban into a usage rule.

   **What did NOT change:** emoji still stay out of the hero, the chrome,
   pricing, comparisons, errors, billing and legal. The round-2 note the ban
   came from — *"way too childish"* — was about the site's VOICE being cute,
   and that judgement stands. Six curated glyphs marking real moments is a
   different thing from decoration sprinkled through the chrome, and the
   distance between them is the whole rule.

7. **THE HERO MOVES TO LIGHT — the reversal** (DREAMCRM-67, 2026-09-15). Three
   more rounds, all rendered:

   - **The owner lived with the night hero and rejected it:** *"we had landed
     on a dark hero, and honestly now that i've spent some time with it, i'm
     not a fan. I think i want to move heavier into the white/light theme."*
     In the same breath he named what he does want — *"cool effects and
     animations, like when a picture zooms to fill the full viewport on scroll,
     and then it switches from scrolling the page to scrolling popups over the
     picture, and things like parallax effects"* — and two outright vetoes:
     *"i'm not a big fan of thin black lines making up grids or bland check
     marks as icons."*
   - **Round A** offered three light directions — *Daylight Dream* (white
     ground, the aurora surviving as light), *Cinematic* (the zoom-and-pin he
     described), *Parallax Instrument* (asymmetric, panels drifting at
     different speeds). Two were grounds and one was a behaviour, so it was put
     as two questions. **Owner: "100% the right direction"** — but only halfway.
     The concept was right and the intensity was short.
   - **Round B dialled every dial up** — 86px headline hard left, a gradient
     second line, saturated light instead of hinted, film grain, the product
     bleeding off the right edge with pieces detached in front of it, the
     ticker closing the fold. **Owner: "yeah i think we're there."**
   - **Round C** turned his follow-up — *"the design and style is only half of
     the climb, making sure the animations, scaling, the images, the actual
     content etc are all up to par is hugely important"* — into the written
     standards now in Parts 6, 10, 11 and 5.
   - **The last two answers:** *"im not a fan of the big transparent editorial
     '2' in the mockup, other than that i want to go with 1 — product only for
     imagery."*

   **What that settles.** Light ground, hero included. The cinematic
   pin-and-scroll is the homepage spine (Part 6). Product-only imagery, no
   photography (Part 11). The oversized outlined chapter numeral is **out** — it
   was decoration duplicating a number that the chapter rail and the card
   eyebrow both already carry, and it was the only element in the set carrying
   its meaning in a `-webkit-text-stroke` that had to be hidden from screen
   readers to be legal. Dropping it costs no information and removes that
   wrinkle.

   The night band is **retired**. The footer is not — see Part 7, which is the
   half of the night-band discipline that does *not* retire with it.

8. **Move 1 built, and three things it settled that the direction did not**
   (DREAMCRM-69, 2026-09-15). The hero is the daylight band; the measured run
   is in Part 7. What building it decided:

   - **The 86px display needs a ~730px reading column at 1440, and that sets
     the split.** "One calm system." does not fit one line under that, so the
     hero's grid is `2.15fr / 1fr` inside `max-w-6xl` and the product column is
     narrow-but-bleeding rather than half the fold. The headline reads as three
     lines at 1440, two at 834 and four at 390 — Part 10's "type steps down; it
     does not reflow into a different design", arrived at by measuring the
     rendered line count rather than by eye. **A longer headline is a smaller
     display, not a wider column**; the column is already most of the grid.
   - **The hero's trust row drops its check marks now, ahead of move 3.** The
     owner's second veto is a veto; shipping ticks in the fold while the
     tone-tile set is three moves away would have shipped the vetoed thing on
     the one surface he was looking at. The hero row is mono with dot
     separators, which is what he approved in round B. That leaves **three**
     `CheckIcon` call sites on the homepage for move 3, not four.
   - **The detached pieces are pieces of the mock, and their content says so.**
     They carry `DashboardMock`'s own rows — the trend tile and the reply to
     the confirmation text the mock is about to send — rather than invented
     numbers. Part 5 says a number inside a product mock is part of the mock
     and the same number in our own voice is a claim; lifting a row out of the
     mock keeps it on the right side of that line, and `94% / 38 / $14,200`
     from the round-B renders deliberately did not ship.

9. **Move 2 built — the spine, and the four things building it decided that the
   spec did not** (DREAMCRM-70, 2026-09-15). The pin-and-scroll sequence is
   live on the homepage. The spec in Part 6 was right about the behaviour and
   silent on four questions that only come up once it is real:

   - **The spine is the section BELOW the ticker, not the hero.** Part 6 step 1
     says "the product sits in its frame under the headline" and step 2 "the
     headline fades behind it", which reads at first like the HERO's headline
     and mock. It is the spine's own. The reason is not convenience: the
     daylight hero landed on move 1 with the owner's sign-off on a specific
     composition — 86px hard left, the mock bleeding off the RIGHT edge with
     pieces detached in front of it — and Part 8 says move 2 "is not a
     re-skin". Growing that asymmetric mock to full bleed under a fading hero
     headline would rebuild what move 1 just shipped, and would invalidate the
     hero's measured decorative-layer run in Part 7, which was taken AT REST.
     So the spine takes the slot the old "What it feels like" section held —
     which is where it belongs anyway, since it tells that section's story by
     showing the product working instead of asserting three bullets about it.
     That section's headline and lede carry forward; its three bullet cards do
     not.
   - **The stacked layout is the BASE, and the pin is what gets added.** Part 6
     asks for "a real layout, not a disabled one" under
     `prefers-reduced-motion`, and the only way to owe that rather than promise
     it is for the ordinary reading layout to be what the server renders. So
     the server HTML is four stacked sections, and `.is-cinematic` — added by
     the client, only where the pin is legal — is the enhancement. JS failing,
     hydration failing, a media query never firing and reduced motion all land
     on the same correct page, and "no content is reachable only by animating"
     is true by construction. The CSS half is a GATE, not a revert list: the
     whole pinned sequence lives inside one
     `@media screen and (min-width: 1024px) and (prefers-reduced-motion:
     no-preference) and (hover: hover) and (pointer: fine)`, so outside those
     conditions the pinned declarations are not in the stylesheet at all and
     the class means nothing. That half alone suffices; both halves exist
     because the JS half is the one that can be wrong about the environment.

     **That last sentence used to be a claim rather than a fact, and it is
     worth keeping the correction.** It shipped as three `@media` blocks that
     UNDID the class, and Vesper's review measured them: they put back
     `position`, `height`, `opacity` and `transform` and not `width`, `margin`,
     `pointer-events` or the rail's reserved lane, so the CSS on its own left
     the cards at 528px against the left edge. And there was no block for
     `print` — printing the homepage produced three pages of pinned section
     carrying NONE of the four chapters, i.e. exactly the content-reachable-
     only-by-animating this Part forbids, in a medium nobody thought of. A
     revert list is a copy of the thing it reverts, and a copy drifts; a gate
     cannot. The lesson generalises past this section: **when a rule must not
     apply somewhere, don't apply it and take it back — don't apply it.**
   - **It un-pins rather than clipping, and the question is MEASURED.** The pin
     is `overflow: hidden` and the card is centred, so a card taller than the
     window loses its top and bottom with no scroll that reaches them. That is
     not a viewport question: it is set by the reader's own text size, which no
     media query reports — at the browser's 200% TEXT setting (the low-vision
     one, not zoom) a 1024x640 window ran the card to 1,049px. So the component
     measures the tallest card at mount and on resize and drops the pin when it
     does not fit, with `CARD_TRAVEL` of headroom at each end. The fix is
     always to UN-PIN: making the card scrollable would need `tabindex="0"`,
     which puts the one focus stop back inside the pinned region and undoes the
     keyboard answer below.
   - **Nothing inside the pinned region is focusable, and that is the whole
     keyboard answer.** Part 6 wants tab order through the chapters and out of
     the bottom, the section escapable at any point, and focus that does not
     fight the scroll position. Three decisions carry it: the pin is
     `position: sticky` so the document never stops scrolling and nothing
     calls `preventDefault`, `scrollTo` or `scrollIntoView`; the chapter cards
     are text; and the chapter rail is a position indicator rather than
     navigation — a clickable rail would be the one control on the page that
     fights the reader's own scroll. The section's single link sits in the
     RELEASE block after the pin. **A card link would be an invisible focus
     stop**, because a card spends most of the scroll at opacity 0, so this is
     held at zero by a test rather than by care.
   - **The product behind the cards is NOT dimmed, and this is the one place
     the build departs from the approved storyboard.** The storyboard washes
     the schedule pale behind the glass. On a light ground that is a contrast
     crime: veil a white surface at 55% and `gray-950` lands near 3.1 at real
     product size. Part 3 already had the better answer — "depth is emission,
     not stacking" — so the card reads as raised because coloured light spills
     out from under it, and the product stays crisp and fully legible. The
     stage is therefore **graded rather than exempted**: it is deliberately NOT
     in `DECORATIVE_MOCKS`, every pair in it is legal on its own ground, and
     `marketing: home` keeps its ceiling of ZERO on the merits. See Part 7.

10. **Move 3 built — the tone tiles, and the three things the direction did not
    say** (DREAMCRM-71, 2026-09-15). The veto and the shape were settled; what
    building it decided:

    - **A tile per line is the wrong default, and finding that out is most of
      the work.** The direction said "replace `CheckIcon` everywhere", and the
      literal reading puts a tile on each of the 26 rows of the pricing
      inventory and each of the 54 bullets on the product tour. That is 80
      coloured squares down two pages — a second uniform mark, differently
      shaped. **The veto was against sameness, not against ticks**, so a fix
      that re-creates the sameness in a new costume has not done anything. Hence
      Part 3's two tiers: a tile earns its place where the line is a different
      KIND of thing, and moves up to the group heading where the rows are one
      kind of thing already named above them.
    - **The subject list is required in content, not optional with a
      fallback.** `ourStrengths` in `lib/marketing/comparisons.ts` takes a
      `glyph` as a REQUIRED field, so a ninth vendor comparison cannot compile
      without somebody deciding what each win is about. An optional field with
      a generic default would have re-grown the identical mark one new vendor
      at a time, which is the same drift that made this a three-issue job.
    - **The ninth call site is not a marketing list and did not take a tile.**
      The one inside `ReviewsMock` sits in a product mock, and the mocks wear
      the dashboard's language — a marketing tile there would make the picture
      an unfaithful one, which is item 4's argument in a different costume. It
      borrows the registry's `star` PATH at mock scale instead: no tick, and
      the glyph finally says what the strip is about.

    One more thing, recorded because it was a near miss rather than a decision.
    The guard's first version attributed a path to the nearest preceding
    `function`, and a bare tick dropped into an arrow component after
    `MatrixMark` was silently pardoned by `MatrixMark`'s exemption — **the scan
    reported CLEAN with the defect live.** Only the mutation found it. That is
    §2d's "the right string in the wrong scope": the boundary a search needs is
    not always inside the regex, sometimes it is the region you ran it over.

**Why light is the right answer and not a retreat.** The original case for a
night band was memorability, and it was a real argument — but the pages that
close the sale (pricing, comparisons, docs, blog) are long-form reading done on
a bright operatory monitor by a practice owner in their fifties, and the
product's own default theme is light. A dark opening asked every visitor to
cross a seam twice. The saturated-light treatment in round B buys the
memorability back without the seam: **the light is the signature now, not the
dark.**

The page still ends in the dark — the footer sits on `gray-950` in both themes,
and it always did. What changed is that the dark is now the closing note rather
than the opening one.

---

## Part 1 — Mood

Derived from what the owner accepted and rejected across six rounds, not from a
word list picked in the abstract.

**In order: electric · precise · dreamlike.** Unchanged by the reversal — all
three survived a full ground inversion, which is the evidence they were the
right three.

- **Electric** — the site should feel switched on. Under the night band that
  meant glow against dark. It now means **saturated light**: colour that is
  present rather than hinted, with enough chroma that a thumbnail of the fold is
  recognisable. Pale-wash "clean SaaS white" is the failure mode; it is what
  round A's first pass was, and it is what *"only halfway"* meant.
- **Precise** — the anti-childish word, and the one that does the most work.
  Every choice answers *instrument* rather than *toy*: measured alignment,
  monospace numerals, dead-straight type. Note that the 56px blueprint grid used
  to carry this and no longer does (owner veto, Part 3) — precision now lives in
  alignment and type, not in a grid drawn on the page.
- **Dreamlike** — what keeps it DreamCRM rather than a generic dev tool. Not
  night sky and stars any more: **wide soft blooms of teal, violet and fuchsia
  light on white, with a fine film grain so the light has a surface.** The brand
  is named Dream and the dream is now daylit.

**Not us: cute. Also not us: corporate. Also not us: bland.** The third was
added on DREAMCRM-67 — going light is the move most likely to drift into the
default SaaS look, and "it went bland" is the specific way this direction fails.

**Warmth moved from the pixels to the words.** This is the trade the direction
makes and it must be honoured, or the site turns cold. The copy carries the
humanity: *"3 still need a text,"* never *"3 records pending confirmation."*
See Part 5.

---

## Part 2 — Palette energy

No new colours. **One ground now** — light — plus the dark footer the page has
always closed on.

### The daylight ground (the whole page)

| Role | Token / value |
|---|---|
| Ground | `#FFFFFF` and `surface-1 #F8FAFF` |
| Hairline | `rgb(76 125 240 / .16)` |
| Ink | `ink-900 #1A2440`, body `ink-600 #4C5A78`, quiet `ink-500 #5C6C89` |
| Accent | `teal-600 #3A67D9`, `teal-700 #2F52B3` |
| Second accent | `violet-700 #5D47DE` — **not** `violet-600`, which lands at 4.42:1 |
| Signature gradient | `teal-600 → violet-700 → fuchsia-700`, every stop legal as ink (Part 7) |
| Primary action | `teal-600 → teal-700` fill carrying white |
| Bloom | wide, low-alpha teal / violet / fuchsia radial washes — **a light source, so keep text out of it** (Part 7) |
| Grain | fine monochrome noise at low alpha, `aria-hidden`, never over a data surface |

### The footer — the one dark surface left

`bg-gray-950` (`#10182E`) carrying `gray-400` ink at 6.71, in both themes,
exactly as it always was. This is the surface Part 7's night-band discipline
continues to bind.

### Standing rules

- **The brand hue is never a status.** Inherited verbatim from
  `DESIGN-SYSTEM.md` Part 1 and it binds here too. Status keeps the tone
  registry: emerald ok, amber needs-our-action, rose urgent, violet in-flight,
  fuchsia celebrated.
- **Fuchsia is the celebration accent, and — new on DREAMCRM-67 — the terminal
  stop of the signature headline gradient.** Those are its only two homes. It is
  still never a status, never a standalone accent, never on pricing, never on an
  error. The rule's purpose was to stop fuchsia being diluted into another
  status colour; one terminal stop in a display-scale gradient does not dilute
  it, and the owner approved that headline in round B. Use **`fuchsia-700`** —
  see the trap in Part 7.
- **White text starts at `teal-600`.** `teal-400` / `teal-500` are identity
  colours, not white-text fills — solid or gradient stop, hover included. The
  night band's inversion of this rule (the luminous steps carrying *dark* ink)
  retires with the band.
- **Gradient used as text must have every stop legal.** Every end is the ink.
  This is the DREAMCRM-44 lesson, and on a white ground `class-pairs.ts` rule 4
  now grades it correctly and automatically — see Part 7.

---

## Part 3 — Shape language

- **Radii.** 10px controls and buttons · 12px small tiles · 14px cards ·
  16px the product mock · `999px` reserved for eyebrow badges and status chips.
  Nothing else is a pill; nothing is a square.
- **Never:** rotation, organic blobs, hard offset shadows, 2px cartoon outlines.
  Those four are what made the rejected version read as a toy.
- **Depth is emission, not stacking.** One hairline plus a soft blue shadow, and
  coloured light spilling out from under a raised object. No hard-edged drop
  shadows anywhere.
- **No drawn grid. Owner veto, DREAMCRM-67.** The 56px blueprint grid
  (`NIGHT_GRID`) is deleted, not lightened — *"i'm not a big fan of thin black
  lines making up grids."* Content still locks to a column rhythm; the rhythm is
  no longer drawn on the page.
- **No bland check marks. Owner veto, DREAMCRM-67 — CLOSED on DREAMCRM-71.**
  `CheckIcon` is deleted, not dormant, and every marketing call site now carries
  a **tone tile**: a filled squircle whose glyph says what the line is actually
  about — a calendar for the schedule, a speech bubble for messaging, a banknote
  for payments. The tile fill is a tone tint; the glyph is that tone's deep ink.
  The census reached zero rather than nine (Part 8 move 3).

  **The tiles are a VOCABULARY, and it has three rules.**

  1. **A subject owns its tone; a call site never picks one.** The registry is
     `lib/marketing/tone-tiles.ts` — add a subject there, never at a call site.
     A site that can choose its own colour will eventually choose a second one
     for the same subject, which is the failure `TONE_FILL` exists to prevent.
  2. **Three tone families, and the three that are missing are the point.**
     `brand` is what the product IS (every surface, every module, and the
     honesty terms — Part 2 says the brand hue is never a status, and
     honest-by-default is identity rather than a state); `growth` is what it
     earns you; `auto` is what it does without you. **`rose` and `amber` are
     withheld** because they are the registry's urgency signals and nothing on
     a benefit list is urgent or needs the reader's action. **`fuchsia` is
     withheld** because Part 2 gives it exactly two homes and a feature bullet
     is neither — and it is "never on pricing", which is where a third of these
     tiles live.
  3. **Two tiers, because a tile repeated down an inventory is wallpaper.**
     This is the rule that keeps the fix from re-committing the original sin:
     replacing one uniform mark with a second uniform mark satisfies the letter
     of the veto and misses all of it.
     - **Tier A — a tile per LINE**, where every line is a different KIND of
       thing: the honesty tenets, the partner terms, a vendor's strengths, the
       "everything else" cards.
     - **Tier B — a tile on the GROUP, a tone dash on each row**, where the
       rows are one kind of thing under a heading that already names the
       subject: the pricing module inventory (26 rows, 4 groups) and the
       product tour's bullets (54 across 10 sections). Eight ways of saying
       "website" do not need eight globes; they need one globe and eight
       legible lines.

  **The hero's trust row takes NO mark at all** and that is not an oversight —
  the composition the owner approved in round B is plain mono with dot
  separators, and four tiles there would be four statements the headline has
  already made. "Every list gets tiles" was never the rule; "every mark says
  something" is.
- **Geometry, chrome zones only.** Blooms and grain. Never behind reading text
  (Part 7 is not advisory about this), never inside a data surface, always
  `aria-hidden` and `pointer-events: none`.
- **The grid-break is the product, and it is a bleed.** The product mock crosses
  the container edge — off the right at every width — with pieces detached and
  floating in front of it. This is the signature move and it survives the step
  down to 390px (Part 10). Breaking the grid by *rotating* something is still
  banned; that was the childish move.

---

## Part 4 — Type

- **Inter stays the marketing face.** Self-hosted, already in
  `public/fonts/inter-latin-var.woff2`. Nunito is the dashboard's face and does
  not cross over; Fraunces belongs to the clinic sites.
- **Display is big now.** The hero headline is 86px at 1440 and hard left, not
  64px centred. Round B's *"only halfway"* was as much about type scale as about
  colour. Part 10 has the step-down.
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
- **No oversized decorative numerals.** Owner veto, DREAMCRM-67. A chapter
  number belongs in the eyebrow and the chapter rail, at reading size, where it
  is real text. A 210px outlined ghost of it behind the card is decoration
  pretending to be structure.

---

## Part 5 — Emoji and copy voice

**Emoji.** Six curated animated glyphs, used to mark moments — never as
decoration, and never as the site's voice. The registry is
`lib/marketing/emoji.ts`; the component is `<MarketingEmoji>`; the assets are
Google's **Noto Animated Emoji**, CC BY 4.0, re-encoded and self-hosted under
`public/images/emoji/`.

| Glyph | For |
|---|---|
| 🚀 rocket | Something shipped — the newest changelog week, a launch. |
| 🎉 popper | A real win the visitor caused. Never a win we caused ourselves. |
| ✨ sparkles | Small delight; something got better without them asking. |
| 💫 dizzy | Motion and arrival. Stands in for 🌠, which is not animated. |
| 🪐 planet | The space register itself, where a page needs a mark not a mood. |
| ⭐ star | A result worth keeping. The quiet anchor — it barely moves, on purpose. |

- **Six, not a pack.** A whole pack is weight nobody looks at, and the limit is
  what keeps the set reading as a decision rather than a dependency. A seventh
  is an edit to this table first.
- **Still banned:** the chrome, the hero, product mocks, pricing, comparisons,
  ROI and grader numbers, error copy, billing copy, legal copy. Unchanged from
  the ban, and for the same reason — the site's job is *precise instrument*, and
  a glossy 3D cartoon in the chrome is the round-2 note coming back. The ground
  going light does not soften this: a bright page is if anything a friendlier
  host for clutter, so the ban carries over verbatim.
- **Still banned: emoji as decoration.** Marking a moment is the permission. A
  glyph that is not marking anything is the sparkle that got rejected.
- **No faces.** The only animated moon in the pack (🌛) has one, and it is cut
  for exactly that. Faces are the cute register.
- **Decorative by default.** `<MarketingEmoji>` emits `alt=""` and
  `aria-hidden` unless given a `label`. Pass one ONLY when the glyph carries
  meaning the copy next to it does not already say — announcing "party popper"
  next to *"Application in — thank you"* is noise, not access.
- **Plain unicode emoji are still fine** in body copy where a named human is
  writing, and in a mock showing a glyph the real product shows (decision 4
  above). The animated set is for moments; a character in a sentence is a
  character in a sentence.
- **Celebration by light is still the default.** The glow pulse, the luminous
  pill, the fuchsia chip — those did not get replaced, they got a companion.
  Reach for light first; reach for the popper when a person just did something.
- **Attribution is a licence term.** CC BY 4.0 requires the credit, and it
  lives in `MarketingFooter` on every marketing page. `public/images/emoji/LICENSE.md`
  carries the provenance — including the fact that the animation source repo is
  gone, so the licence statement lives in a GitHub issue thread. Do not delete
  that line as clutter; a test fails if it goes.

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

**Every number on the page is real, or visibly an example** (DREAMCRM-67). The
round-B mockups are full of `94%`, `38`, `$14,200` and `2,418`, and every one of
them is illustrative. They must not ship as implied claims about live customers.
Testimonials, logos and named practices are only as real as the permission
behind them — `Riverbend Dental` in the ticker is a placeholder, not a customer.
A number inside a product mock is part of the mock; the same number in our own
voice is a claim.

---

## Part 6 — Motion, and the cinematic spine

CSS-driven, no animation library. `prefers-reduced-motion: reduce` is
non-negotiable, and it is specified as a *layout* rather than as an absence —
see the spine below. The site's existing `MarketingMotionStyles` establishes the
pattern.

### The standing rules

- **Ambient, one loop per band:** the bloom drifts slowly (~18s); the live dot
  pulses ~1.8s. Compositor-only (transform/opacity), never layout properties.
- **Once, on load:** the existing `mkt-fade-up` entrance stagger (0.65s,
  `cubic-bezier(.16,1,.3,1)`).
- **Hover, pointer-fine only:** 1px lift, the bloom deepens. 140ms.
- **No spring overshoot on marketing.** `--spring-pop` is the dashboard's cute
  register; here it reads as bounce. Ease-out only, and interaction springs live
  in the 120–260ms band.
- **Target 60fps on a mid-range laptop.** Transform and opacity only. Anything
  that runs forever and is not ambient is a defect.
- **Never animate text being read**, and never animate the ticker's contents on
  hover (it pauses, as it already does).

### Animated image assets (the emoji set) obey the same law, by markup not CSS

`animation: none` cannot reach inside an animated WebP, so the reduced-motion
fallback is a `<picture>` with a `media="(prefers-reduced-motion: reduce)"`
`<source>` pointing at a still frame — the browser never fetches the animated
file at all. That is the pattern; do not replace it with JS.

- **No animation library, still.** Noto also ships these as Lottie, and Lottie
  needs `lottie-web` (~70 KB gzipped) on a site that ships zero animation JS.
  Animated WebP needs nothing. This rule is what chose the format.
- **The still frame is chosen, not frame 0.** Several glyphs start from nothing
  — 🎉's first frame is the cone before the burst, which reads as "nothing
  happened". `scripts/build-emoji.mjs` records the chosen frame per glyph.
- **A glyph that blinks out mid-loop is cut**, not tuned. ⚡ and 🌟 both scale
  to near-zero inside their loops and read as a flicker at 40px; they are in
  the `REJECTED` list with the reason.
- **Always emit `width`/`height`.** These load inside text runs, and an image
  that arrives late and reflows a paragraph is worse than no image.

### The cinematic spine — the scroll-driven exception

**This is an explicit amendment.** Before DREAMCRM-67 this Part banned
scroll-driven animation beyond the one entrance stagger. The owner asked for the
opposite by name and approved it rendered, so the ban is replaced by a
specification. One such sequence per page, and on the homepage it is the spine:

1. **At rest** — the product sits in its frame under the headline.
2. **On scroll** — the frame grows toward full bleed; the headline fades behind
   it; the first chapter card rises.
3. **Pinned** — the page stops advancing and the chapter cards scroll *over* the
   product, one at a time, while the schedule behind them keeps working. A
   chapter rail tracks position.
4. **Release** — after the last chapter the section unpins and the page scrolls
   on normally.

**The rules that make it shippable, all of them build-blocking:**

- **One scroll position drives everything.** Not a chain of listeners, not a
  queue. Derive every transform from a single normalised progress value.
- **It is interruptible.** Reversing the wheel reverses the animation
  immediately; nothing queues, and nothing finishes an animation the reader has
  already scrolled away from.
- **`prefers-reduced-motion` gets a real layout, not a disabled one.** The
  section unpins and the chapter cards become ordinary stacked sections that
  read top to bottom. Nobody gets a dead screen or a frozen viewport, and no
  content is reachable only by animating.
- **The pin never traps a keyboard or screen-reader user.** Tab order moves
  through the chapters and out of the bottom; the section is escapable at any
  point; focus moving into a chapter must not fight the scroll position.
  **Vesper reviews this specifically, before merge.**
- **It does not pin on touch.** On phones it degrades to the stacked reading
  order (Part 10).
- **A chapter card's copy is static once the card has arrived** — the
  never-animate-text rule is not suspended inside the spine.

**BUILT ON DREAMCRM-70 (2026-09-15), and four things the spec above did not
say.** Full reasoning in Part 0 item 9; the short forms, because they are the
ones a future change will trip over:

- **"Under the headline" is the SPINE's headline, and the spine is the section
  below the ticker.** Not the hero — the hero landed on move 1 with an
  owner-approved composition and its own measured run in Part 7, taken at rest.
- **The stacked layout is the base; the pin is added by a class.** The server
  renders four ordinary sections. The CSS puts the entire pinned sequence
  behind ONE `@media screen and (min-width: 1024px) and
  (prefers-reduced-motion: no-preference) and (hover: hover) and (pointer:
  fine)` gate rather than reverting the class afterwards — a revert list is a
  copy of the thing it reverts, and the first version of it missed four
  properties and the whole `print` medium. Part 0 item 9 has the measurement.
- **PRINT IS A MEDIUM, and it counts.** The stacked layout is what prints, and
  "no content is reachable only by animating" is false the moment a pinned
  section reaches a printer with its cards at `opacity: 0`. `screen` in that
  gate is the one word doing it.
- **It un-pins rather than clipping a card.** The tallest chapter card is
  measured against the window at mount and on resize; if it does not fit with
  room to travel, the pin does not happen. The reader's TEXT SIZE sets that
  height and no media query reports it. Never answer this with
  `overflow-y: auto` on the card — a scrollable region needs `tabindex="0"`,
  which puts a focus stop back inside the pin.
- **Nothing inside the pinned region is focusable.** That is the keyboard answer
  in full, and it is held at zero by
  `tests/marketing/cinematic-spine.test.tsx` — a chapter card spends most of the
  scroll at opacity 0, so a link in one is an invisible focus stop.
- **The product is not dimmed behind the cards.** Part 3's "depth is emission,
  not stacking" replaces the storyboard's pale wash, which on a light ground
  would put `gray-950` near 3.1 at real product size. The stage is graded, not
  exempted — it is deliberately outside `DECORATIVE_MOCKS`.

One more thing the sequence owes and the list above does not name: the chapter
rail is a position INDICATOR, never navigation. A clickable rail is the one
control a pinned section can carry that fights the reader's own scroll position.

---

## Part 7 — The contrast law

**Two things changed on DREAMCRM-67 and they pull in opposite directions. Read
both before assuming this Part got smaller.**

### What retires

The hero's night band is gone, and with it:

- **The hand-graded ink-on-`#10182E` table for the hero.** Daylight pairs are
  graded automatically by `class-pairs.ts` rules 1–4 against the white ground
  they actually ride, so a hand-maintained table is no longer the only
  instrument there.
- **The `CLIPPED_TEXT_EXEMPTIONS` entry for the homepage headline — and it must
  be DELETED rather than weakened.** Its entire justification was that the stops
  ride a dark ground. On white, rule 4 grades `teal-300` at 1.88 and
  `violet-300` at 2.03 and is simply right. `token-contrast.test.ts` asserts the
  exemption's premise structurally — the exempted span must still sit inside a
  `<section>` carrying `bg-gray-950` and rendering `NightSky` — so **moving the
  hero to white turns that guard red on purpose, naming the exemption.** That
  red run is the designed warning, not a regression. Delete the entry, delete
  the assertions that exist to police it, and leave rule 4 exactly as it is.
  Weakening rule 4 to get green would re-open the 2.42 headline DREAMCRM-44
  closed.

### What does NOT retire

- **The footer is still `bg-gray-950`.** It is a dark band inside a light-mode
  page, which is the exact shape this Part was written for:
  `dark-mode-parity.test.ts` cannot see it (it only fires on elements whose
  `dark:` and light halves disagree), axe grades only the stops the browser
  suite walks, and gradients come back `incomplete` rather than failing. Every
  ink that lands on the footer is still hand-graded, and the negative assertion
  pinning `gray-500` — **3.32** on that ground, the pair that actually shipped
  live for months at 3.42 — stays exactly where it is.
- **The bloom-under-text risk inverts; it does not disappear.** On the night
  band a bright wash walked pale ink down. On white, a saturated bloom walks the
  *ground* down under **dark** ink, and the arithmetic is just as unforgiving.
  `ink-600` body copy at 6.91 on pure white has real headroom; the same copy
  sitting inside a violet bloom does not necessarily.
- **`scripts/night-band-grade.mjs` re-points rather than retires.** Its
  instrument is right and its extremum is now backwards: it renders the page,
  hides the band's content, screenshots the decorative layers alone and takes
  the **brightest** pixel under each run of glyphs — correct for pale ink on
  dark. For dark ink on light it must take the **darkest** pixel under each run
  and grade the ink against that. Rename it, flip the extremum, keep everything
  else: screenshotting the decorative layers alone is what makes a
  `background-image` visible to a guard at all, and axe reads only
  `background-color`.

### The rules that bind the new ground

- **Keep blooms centred outside the reading column and horizontally apart.**
  Lobes that stack under text do not have headroom. This was measured rather
  than assumed on the night band: a single teal lobe at 16% alpha over the
  ground already put the palest ink there at 5.05.
- **A bloom is a light source, so keep text out of it.** On the night band a
  caption first measured **3.40**, then **4.18**, then 6.58 once it was moved
  out of the product mock's spill. **Note the middle number — 4.18 is a real
  failure that reads as "nearly fine",** which is what this whole class of
  surface is dangerous for.
- **Grain counts.** A noise overlay over reading text is a contrast reduction
  like any other. Keep it off the reading column, or grade the ratio with the
  grain on rather than without it.

### The daylight hero, measured (DREAMCRM-69)

The rules above are the reasoning. This is the run, taken the way the light
ground has to be graded: render the page, hide the band's CONTENT, screenshot
the blooms and the grain alone, and take the **darkest** pixel under each run
of glyphs. Grain ON. 1440 × 900, the widest of the three widths and the one
where the lobes are largest.

| Text | Ink | Darkest ground under it | Rendered | Flat |
|---|---|---|---|---|
| eyebrow badge | `teal-700` | `rgb(205 218 247)` | **5.02** | 7.05 |
| headline | `gray-950` | `rgb(220 229 249)` | **13.94** | 17.62 |
| body copy | `gray-600` | `rgb(251 251 251)` | **6.67** | 6.91 |
| trust row | `gray-600` | `rgb(246 227 248)` | **5.68** | 6.91 |
| daylight ticker | `gray-600` | `rgb(220 229 253)` | **5.48** | 6.91 |

Read the gap between the last two columns rather than the last column: the
blooms cost the eyebrow **2.03** and the trust row **1.23**, and the trust row's
loss is the fuchsia lobe's tail specifically. Those are the numbers that say how
much of this ground is spent, and the eyebrow is the one with the least left. A
lobe moved toward the reading column comes out of that headroom.

Two notes for whoever tunes a lobe next:

- **The body copy reads 6.67 against a flat 6.91 because it is the one run the
  lobes genuinely miss.** That is the target shape for a reading column, not a
  happy accident — it is what "centred outside the reading column" buys.
- **Measure the ticker separately.** It sits below the hero section on
  `surface-1` rather than inside the band, so it is the one run whose ground is
  not a bloom at all, and grading it with the hero is what catches a lobe that
  has grown far enough down to reach it.

The instrument used here was a throwaway: `scripts/night-band-grade.mjs` is the
committed one and it still takes the BRIGHTEST pixel, which was correct for the
band it was written for and is backwards for this ground. Flipping the extremum
and renaming it is the move-5 build issue, and this table is what it re-derives.
### The signature gradient, graded

Rule 4 grades every stop of a `bg-clip-text` gradient as ink on white, with a
flat 4.5 cutoff and no large-text exception. On the light ground that is now the
*correct* question rather than the wrong one, so the headline simply has to be
legal. Measured from `tests/a11y/palette.ts`, the same resolver the guards use:

| Stop | on white | on `surface-1 #F8FAFF` | Verdict |
|---|---|---|---|
| `teal-600 #3A67D9` | 5.09 | 4.88 | legal — the shallowest legal blue |
| `teal-700 #2F52B3` | 7.05 | 6.75 | legal, comfortable |
| `violet-700 #5D47DE` | 6.14 | 5.88 | legal |
| `fuchsia-700 #A800B7` | 6.27 | 6.01 | legal — **use this one** |
| `teal-500 #4C7DF0` | 3.82 | 3.66 | **illegal as ink**; fill only |
| `violet-600 #755FF8` | 4.42 | 4.23 | **illegal as ink** |
| `fuchsia-600 #C800DE` | 4.66 | **4.46** | **trap — see below** |

**`fuchsia-600` is the trap on this ground.** It clears on pure white by 0.16
and *fails on `surface-1`*, the raised panel the same headline treatment will
eventually sit on. Rule 4 grades against white, so it would pass the guard and
fail the page. That is the 4.18 lesson in its light-ground costume: pin
`fuchsia-700` and the question never arises.

### Rule 5 and the tone tiles

Rule 5 (`TONE_FILL`, the solid-fill registry) had **no opinion** about the night
band's chips because they were translucent tints. **The Part 3 tone tiles are
the same shape and the same answer** — a tone tint carrying that tone's deep ink
— so they stay outside rule 5 by construction. If a tile ever needs a SOLID tone
fill, extend the registry rather than writing a local recipe. On a light ground
`TONE_PILL`'s ink steps are finally the ones they were chosen for, which is one
thing that genuinely got easier.

**Built and measured on DREAMCRM-71.** The prediction above held: `FILL_STEPS`
is 300–600, the tiles landed at **200**, and the exclusion is structural rather
than an exemption entry. Graded through `tests/a11y/palette.ts`, the same
resolver the guards use:

| Tile | Fill | Ink | Ratio | vs white | vs `gray-50` |
|---|---|---|---|---|---|
| `brand` | `teal-200` | `teal-800` | **6.49** | 1.47 | 1.36 |
| `growth` | `emerald-200` | `emerald-800` | **5.95** | 1.28 | 1.19 |
| `auto` | `violet-200` | `violet-800` | **5.75** | 1.53 | 1.42 |

Two decisions rather than measurements, and both are the cinema stage's
reasoning reaching the same place independently:

- **The `-800` ink, not the `-700`.** On these tints `-700` gives 4.81 / 4.16 /
  4.35 — **two of the three are already under the floor**, and the one that
  clears does so by 0.31. That is the 4.18 lesson again: a tile one step off
  the floor passes today and fails the first time somebody warms the tint.
- **The `-200` tint, not the `-100`.** Read the last two columns, which are the
  tile against the card it sits on rather than the ink against the tile. At
  `-100` those read 1.14–1.27 and the tile is a ghost — and a tile you cannot
  quite see is Part 1's third "not us", which is the specific way this
  direction fails. Contrast was never the binding constraint at this end; being
  *seen at all* was.

Both of those are pinned by `tests/marketing/tone-tiles.test.ts` rather than
left to care — warming a fill to `-300` or softening an ink to `-700` fails the
suite, naming the tone.

### The cinema stage — graded rather than exempted (DREAMCRM-70)

The spine's full-bleed product surface (`CinemaStage`) is the first illustration
on this site that is **not** covered by `DECORATIVE_MOCKS` in `e2e/axe.ts`, and
the reason is the one this Part is about.

Those two exclusions pardon the hero's miniature mocks under WCAG 1.4.3 — text
that is part of a picture — and the argument rests entirely on SIZE: every
finding they discount measures 5.8–8.2pt. The cinema stage is the same product
at **full bleed**, so its type is real reading size, and
`exclusionsHidingReadableText` exists precisely to fail a run that pardons that.
Adding a third selector would have widened the one mechanism in the harness that
makes the gate LOOSER, in order to excuse text a person can read.

So the stage is graded instead, and the grading shaped it:

| Pair | Where | Ratio |
|---|---|---|
| `gray-950` on `#F3F7FE` | patient names, the KPI numbers | 16.40 |
| `gray-600` on `#F3F7FE` | visit lines, times, the mono labels | 6.43 |
| `teal-700` on `#F3F7FE` | the practice label | 6.56 |
| `amber-800` on `amber-50` | *Needs a text* | 6.84 |
| `emerald-800` on `emerald-50` | *Confirmed* | 7.23 |
| `fuchsia-800` on `fuchsia-50` | *First visit* | 7.79 |
| `#1F3D8F` on `#DCE7FD` | the avatar initials | 7.96 |

Two of those are the decisions rather than the measurements:

- **The status chips take the `-800` ink, not the `-700`** the existing mocks
  use. `-700` also passes (4.85 / 5.09 / 5.84), and it is the right choice
  INSIDE a picture exemption where nothing re-grades it. Out here the surface is
  graded by axe on every run, and a chip one step off the floor is the "4.18
  reads as passing" shape waiting for someone to warm the tint.
- **The avatars are a tint carrying deep ink, not white on the brand blue.**
  White on `#4C7DF0` is **3.82** — fine at 7px inside the hero's exemption, a
  real failure at reading size out here. This is the same shape as Part 3's tone
  tiles, arrived at independently by the same constraint.

**`aria-hidden` is not a contrast exemption and never was.** The stage carries it
because it is an illustration and the chapter cards hold every word of the
meaning — but axe reports contrast on visible text regardless, which is the
entire reason `DECORATIVE_MOCKS` had to name the hero's mocks by selector in the
first place. Anyone reaching for `aria-hidden` to quiet a contrast finding is
about to discover that.

**What the committed gate still cannot see here, stated so nobody assumes it
can.** `marketing: home` scans at scroll 0 in one viewport, where the chapter
cards sit at `opacity: 0` — invisible to axe, so never graded — and the stage is
at rest scale. Before merge the same page was scanned at a ceiling of zero in
nine further states: each of the four chapters fully on screen in the pinned
sequence, and the stacked layout at 1440 / 834 / 390 under both
`prefers-reduced-motion` and touch. All clean. The cards' own pairs are
`gray-950` / `gray-600` / `violet-700` on white (17.62 / 6.91 / 6.14), which the
source rules in `tests/a11y/class-pairs.ts` grade from the class strings and do
not depend on a scroll position at all.

**The chapter rail's second channel is SIZE, not hue** (added after Vesper's
DREAMCRM-70 review). The active row and the inactive rows are `#2f52b3` and
`#4c5a78` — both legal against the pill (7.05 and 6.91, re-measured as rendered
at all four chapters, on the white bar-chart card the pill actually sits on) —
but they differ in hue at the same lightness, so they grade **1.02** against
EACH OTHER. In greyscale, or to most kinds of colour blindness, the rail was
four identical lines with no indication which one you were on. The old dot could
not carry it either: `#c3d0e8` graded 1.55 on the pill. So the dot takes the
row's own ink and the ACTIVE one is half again as big — no new colour, and a
channel that survives greyscale. This was never a WCAG violation (the rail is
`aria-hidden`, and the card says `02 · THE TEXT THAT BOOKS` as text a few inches
away, so the information is never colour-only on the page), which is exactly why
no gate would ever have raised it. **Two inks that both pass against the
background can still be indistinguishable from each other, and nothing in CI
measures that pair.**

**One blind spot neither half of the build can close, recorded so it is not
rediscovered.** A link that jumps to text INSIDE a chapter — Chrome's "copy link
to highlight", and the highlighted-text links Google sometimes puts in search
results — lands on the wrong chapter: the browser scrolls to the text's document
position, where the sequence has not reached that chapter yet, so chapter 2 is
on screen while chapter 4 is at `opacity: 0`. Find-on-page uses the same text
finder and does the same. It is the sighted twin of "no content is reachable
only by animating", it is inherent to every pinned sequence on the web, and it
is not worth contorting the build over — but it belongs in the same list as the
scroll-0 scan blind spot above, because the honest version of "we verified this"
names what the verification could not see.

---

## Part 8 — Build order

Ordered, each its own small PR, each verified in the real page at all three
widths before it lands. Nothing merges without the three-size screenshots and
the reduced-motion path in the same PR.

1. ~~**The homepage hero becomes the daylight band**~~ — **LANDED**
   (DREAMCRM-69, 2026-09-15). Saturated blooms, grain, 86px hard-left headline
   with the legal gradient, the product bleeding off the right edge with
   detached pieces in front of it, the ticker closing the fold. `NIGHT_GRID`,
   `NightSky`, the star field, the scan sweep and both night CTAs were deleted
   in the same PR, along with the `CLIPPED_TEXT_EXEMPTIONS` entry and the two
   assertions policing its premise. **The red run arrived exactly as this
   document predicted it would**, naming the entry through both halves — the
   dead-exemption detector and the structural premise check — and rule 4 was
   not touched. Decisions it settled: Part 0 item 8. Measured run: Part 7.
2. ~~**The cinematic spine**~~ — **LANDED** (DREAMCRM-70, 2026-09-15). The
   pin-and-scroll sequence, its reduced-motion stacked layout and its keyboard
   path, sitting in the slot the old "What it feels like" section held — the
   section BELOW the ticker, not the hero, for the reasons in Part 0 item 9.
   The stacked layout is the base and the pin is a class added on top, so
   reduced motion, touch and anything under `lg` get the real reading layout
   from the server rather than a disabled sequence. Nothing inside the pinned
   region is focusable, which is the whole keyboard answer. The product behind
   the cards is NOT dimmed — Part 3's emission replaces the storyboard's wash,
   and the stage is graded rather than exempted (Part 7). Decisions it settled:
   Part 0 item 9. Measured pairs: Part 7. **Vesper's review of the
   keyboard/screen-reader path and the reduced-motion layout was requested on
   the issue at the PR** — the one part of this move that is a second pair of
   eyes rather than a measurement.
3. ~~**The tone tiles replace `CheckIcon`**~~ — **LANDED** (DREAMCRM-71,
   2026-09-15). All nine sites carry a tone tile or, on the two Tier-B
   inventories, a group tile plus tone dashes; `CheckIcon` is deleted from
   `components/marketing/ui.tsx` rather than left dormant, so re-importing it
   is a build error. `git grep "<CheckIcon" -- "app/(marketing)"
   components/marketing` returns nothing. The two `CheckIcon`s in
   `app/(default)` are separate local definitions in the dashboard's language
   and were left alone. Decisions it settled: Part 0 item 10. Measured tints:
   Part 7.

   **The census moved twice before it reached zero, and the third check is now
   a test rather than a sentence.** It was eleven when the direction was
   decided; move 1 took the hero's trust row and #614 corrected the line to
   ten; move 2 took the "What it feels like" card with the section it lived in,
   leaving nine. A number written in prose goes stale silently — which is
   exactly what happened, twice — so the closing move replaced it with
   `tests/marketing/tone-tiles.test.ts`, which asks the tree on every run and
   does not care what this paragraph says. **That guard is geometric, not
   nominal:** it fails on any path that is *entirely* a check mark, under any
   component name or none, because the way this comes back is not a re-import
   (impossible now) but somebody hand-rolling a tick into a fresh `<svg>`.
4. **Shared chrome** — `MarketingHeader`, `MarketingFooter` and `PageHero` in
   `components/marketing/` — so every subpage inherits the language for free
   instead of drifting page by page.
5. **Re-point the decorative-layer grader** per Part 7, and put it on the light
   hero.
6. **Then per page, in this order:** pricing (the honest test of whether the
   language survives a table), compare, product, why, resources.

The site is light-only today (zero `dark:` classes under `app/(marketing)`) and
nothing here changes that. Whether the marketing site ever gets a real dark
theme is a separate question and has not been decided — a smaller question now
that no hero band depends on hand-grading.

---

## Part 9 — What still needs the owner

Everything in Parts 1–8, 10 and 11 is settled and ships without another approval
round. These do not:

- The logo, the mark, or the wordmark lockup.
- Any change to a colour ramp — extending it, re-pointing it, adding a hue.
- Anything that changes what the brand *is* rather than how loudly it speaks.
- **Commissioning photography** — the Part 11 upgrade path is a funded project
  with releases and a shoot, not a design decision.
- Pricing, published external communications, money-moving behaviour, spending,
  and destructive operations — the studio's standing list, which outranks this
  document.

A contrast or accessibility fix that stays inside the existing colour family is
**not** on this list and does not wait, signature elements included.

---

## Part 10 — Scaling

**Three widths are a deliverable for every surface, not an afterthought: 390,
834, 1440.** A PR that shows one width has not shown the change.

- **The signature moves survive the step down.** At 390 the product still breaks
  the right edge, the headline still carries the gradient, the ticker still
  closes the fold. What changes is scale and stacking — never identity. A phone
  that drops the bleed is a phone showing a different brand.
- **Type steps down; it does not reflow into a different design.** 86px display
  at 1440, stepping through 834 to a size that still reads as display at 390.
- **Buttons go full width at 390.** Side by side at 834 and up.
- **Zero horizontal scroll at any width.** The full-bleed effect is achieved by
  **clipping**, not by letting the document get wider. That bug appeared while
  building round B and is exactly what ships if nobody checks — check it by
  measuring `scrollWidth` against `clientWidth`, not by looking at it.
- **The pinned scroll does not pin on touch.** Phones get the stacked reading
  order, which is the same layout `prefers-reduced-motion` gets (Part 6).

---

## Part 11 — Imagery

**Product-only. Owner decision, DREAMCRM-67:** *"product only for imagery."*

The app is the picture. No stock photography, no licensed dental imagery, no
photographs of practices. Every visual on the designed marketing pages is CSS,
SVG and product mock — which is what they already are: nothing under
`app/(marketing)` or `components/marketing` renders `next/image` or `<img>`
except the blog's author-supplied cover slot, which is content rather than
design.

**Why this is a position and not a shortfall.** The honest version of this
product's story is a Tuesday that runs itself, and a mock of the real screen
tells that story better than a stock photograph of strangers in scrubs. The
failure mode to watch is Part 1's third "not us": product-only plus pale washes
is exactly how a site gets bland. The saturated light and the bleed are what
keep this from being a screenshot gallery.

**The bar, for every image that does exist** — the blog cover slot today, and
anything added later:

- AVIF/WebP with a raster fallback.
- **Explicit width and height**, so nothing reflows on load. *The blog cover at
  `app/(marketing)/blog/[slug]/page.tsx` has neither today — a real
  layout-shift defect, and it belongs to whoever owns UI correctness rather than
  to this document.*
- `priority` on the one above-the-fold asset only; lazy everywhere else.
- Real alt text. Decorative art gets `aria-hidden`; an empty `alt` on something
  that carries meaning is a defect, not a shortcut. (The animated emoji set's
  `alt=""`-by-default is the correct version of this: decorative unless given a
  `label`, per Part 5.)

**The upgrade path, if it is ever funded:** photographs of real DreamCRM
practices — their teams, their front desks. It is the only imagery no competitor
can copy. It needs releases, a shoot and willing customers, so it is a project
rather than a task, and it sits in Part 9 until the owner starts it. Licensed
stock is not the middle ground; it is the option that makes the site look like
everyone else's.

---

## Living document

Update this file whenever an issue produces a brand decision — that is the
point of it. Add the decision to Part 0 with its date and the issue key, and
change the part it affects in the same commit. A decision that lives only in an
issue thread has reached nobody.

Part numbers 0–9 are cited by number from `app/`, `components/`, `tests/` and
`scripts/`. Renumbering them silently breaks those citations, so append new
parts at the end and leave the existing topics where they are — which is why
Scaling and Imagery are 10 and 11.
