# DreamCRM Marketing-Site Brand Book — "Daylight Dream"

The binding personality language for the **public marketing site**
(`app/(marketing)`, `components/marketing`). Owner-approved direction, agreed
with Dustin Russenberger on DREAMCRM-43 (2026-09-14) and reversed from a night
hero to light throughout on DREAMCRM-67 (2026-09-15).

> **THE WHOLE MARKETING SITE LOOKS LIKE THIS.** The build order in Part 8 is
> COMPLETE as of DREAMCRM-80 (2026-09-16): moves 1–5 landed the homepage hero
> as the daylight band (DREAMCRM-69), the cinematic spine below the ticker
> (DREAMCRM-70), the tone tiles in place of every check mark (DREAMCRM-71), the
> shared chrome — `MarketingHeader`, `MarketingFooter`, `PageHero` —
> (DREAMCRM-72) and the re-pointed decorative-layer grader (DREAMCRM-73); move
> 6 then converted every subpage BODY, one page per PR: pricing (75), compare
> (76), the product tour (77), the manifesto (78), the resource library (79),
> and the pages Part 8 never named — `/grade`, `/roi`, `/partner-program` (80a)
> and `/blog`, `/changelog`, `/docs` (80b). **Every route under
> `app/(marketing)` now opens on `PageHero` and carries one language below it**,
> and that sentence is checkable rather than asserted: `git grep -L PageHero`
> over the route files returns nothing.
>
> **Both owner vetoes are closed in code at every call site**: `NIGHT_GRID`,
> `HERO_DOT_GRID` and `CheckIcon` are deleted rather than dormant, and two
> guards hold each veto at zero by asking the tree instead of trusting this
> paragraph. Where this file and the code disagree, this file is still the
> target and the code is still the backlog — but the gap Part 8 existed to
> close is closed, and what remains is Part 9's list, which is the owner's.

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

11. **Move 4 brought the shared chrome across, and it found a second drawn
    grid nobody was looking for** (DREAMCRM-72, 2026-09-16). `MarketingHeader`,
    `MarketingFooter` and `PageHero` are now Daylight Dream, so all eight
    subpages inherit the language before move 6 touches any of them. What
    building it decided:

    - **Decision 5 is now fully spent.** The header is TRANSPARENT at rest
      rather than `white/85`, because the treatment that existed to explain a
      seam has no seam to explain. What it gains is a state it did not have: a
      glass rail that only appears once something is scrolling under it —
      `white/85`, `backdrop-blur-xl`, a `DAY_WIRE` hairline and a BLUE shadow
      rather than a grey one, which is Part 3's "depth is emission" arriving in
      the chrome.
    - **`HERO_DOT_GRID` was a second drawn grid, and it outlived the veto by
      three moves.** Move 1 deleted `NIGHT_GRID` and the owner's first veto was
      recorded as closed; a `radial-gradient` dot tiled every 22px went on
      rendering on the other eight pages the whole time, because it lived under
      a different name in a different component. **A veto closed at one call
      site is not a veto closed** — the same lesson the check-mark census
      taught twice — so it leaves behind `tests/marketing/no-drawn-grid.test.ts`
      rather than another sentence. The guard states the rule geometrically (a
      gradient repeating on a fixed pitch) and knows the film grain is not one,
      which is the distinction that makes it safe to hold at zero.
    - **A translucent sticky bar is the footer's problem in a second costume.**
      The surface under the rail is a SIBLING scrolling past, not an ancestor,
      so axe and every source rule decline to grade the pair — and the darkest
      thing it ever crosses is the `gray-950` footer, on every page. The fill
      is graded in `token-contrast.test.ts` beside the footer's own table, with
      the alpha read out of the source. Measured run in Part 7; the `white/80`
      row is the one to read.
    - **The subpage bloom is sized in `vw`, not `rem`, and that was a contrast
      fix rather than a layout preference.** At `rem` widths a lobe tuned at
      1440 swallows a 390px viewport, which put the eyebrow at **4.42** — a
      real failure, caught by rendering rather than by looking. Proportional
      lobes hold the composition at every width and the worst run is now 5.36.

12. **Move 6 page 1 — pricing, and the four things a table decided that a hero
    section never would** (DREAMCRM-75, 2026-09-16). The pricing page's BODY is
    Daylight Dream. It went first because it is the honest test of the
    direction: a brand book that only works above the fold is a brand book for
    heroes.

    - **The two-tier list was the temptation, and leaving it alone was the
      decision.** The 26-row inventory is the quietest thing on a page this
      move exists to make louder, and the obvious fix — a tile per row — is the
      identical mark the owner vetoed, just prettier (item 10). So the ROWS did
      not change at all. What got louder is the group HEADER: a mono
      micro-label, a `DAY_WIRE` rule under it, and the group's row count as a
      mono numeral, **computed from `rows.length` rather than typed**. The
      check-mark census went stale twice as a number in prose; a count that
      derives itself cannot.
    - **Hard left is a PAGE property, not a hero property.** `SectionTitle` is
      centred and it is shared chrome, so this page opens each section with the
      `Eyebrow` + heading pair the homepage's "Honest by default" section
      already uses, rather than re-pointing a component eight pages inherit.
      Alignment then turned out to be measurable: the FAQ block sat in a
      `max-w-4xl` container while everything above it was `max-w-6xl`, which
      put its hard-left edge ~110px inside the hero's. Same container, narrower
      LIST, and Part 1's "precise" is one column down the whole page.
    - **The grid-break on a page with no product mock is the price panel
      crossing the section seam.** Part 3's signature move is the mock bleeding
      off the right edge; pricing has no mock, and inventing one would be
      decoration. The panel is pulled UP into the hero's light instead of
      floating in dead white a screen below it. It costs no contrast — the
      panel is opaque `bg-white`, so every run inside it rides white at its
      flat ratio whatever the bloom behind it is doing.
    - **Part 3's radius ladder was being violated in the loudest place on the
      page and nothing could see it.** The trial button was `rounded-full`, and
      999px is *reserved* for eyebrow badges and status chips. There is no
      guard for a radius — `tests/a11y` grades colour and `no-drawn-grid`
      grades texture — so this is the class of drift only a person reading Part
      3 against the page will ever catch. The page is now 14px cards, 12px
      tiles, 10px controls, and its one pill is the two-months-free chip.

    Two more, recorded because they are rules rather than taste:

    - **The FAQ quotes the config too.** Three answers carried the price in
      PROSE a few hundred pixels below a panel that resolves it, so a reprice
      would have put two different prices on one page under a heading reading
      *"answered straight"*. `tests/marketing/pricing-price-source.test.tsx`
      holds it, and its watched-fail run against the old page settled which
      half catches what: the source scan saw NOTHING wrong with
      `price-card.tsx`, because its four numbers had no dollar sign
      (`const LIST_MONTHLY = 500`) and printed through a template. Only the
      mocked-plan render caught the file that was most wrong.
    - **`scripts/decorative-layer-grade.mjs` grades subpages now, and fixing it
      to do so found a false red in the committed script.** It never scrolled,
      so `ScrollReveal` left the final CTA panel at `opacity: 0` and its three
      samples graded the WHITE PAGE behind an invisible panel — 1.00 / 2.63 /
      1.00. Reproduced against the committed version before it was touched. A
      false red is the safe direction, and it still makes a run people learn to
      discount, which for the instrument Part 7 rests on is the same defect
      wearing a hat. Measured run below.

13. **Move 6 page 2 — the comparison pages, where the brand work and a
    correctness fix turned out to be one edit** (DREAMCRM-76, 2026-09-16). Four
    decisions, none of them about colour.

    - **A data table that does not fit gets TWO presentations, not a scroll
      box.** The capability matrix is 13 rows × 3 columns with a note under
      every mark; at 390 it wanted 672px inside 358, and the old answer was
      `overflow-x-auto` around a `min-w-[42rem]` table. Below `md` it is now a
      card per capability with the two verdicts side by side — the comparison
      is the point of the page, so stacking them would turn a matrix into two
      lists — and from `md` up it is a real `<table>` with no `min-width`. Both
      render from `c.matrix`, so they cannot disagree, and exactly one is in
      the accessibility tree at a time. **The rejected alternative is the
      instructive one:** reflowing a single `<table>` with `display: block`
      drops the implicit table roles and needs ARIA to put back what semantic
      markup already had. The duplication costs 7.5 KB gzipped on this page and
      was measured rather than waved at; it is worth it on the one page whose
      entire job is a matrix, and `compare/page.tsx`'s six-row table — which
      fits 390 with room — deliberately does not make the same trade.
    - **Grade the DOCUMENT, not the elements.** The ledger blamed "an ancestor
      sizing to content without `min-width: 0`" and offered it as a lead; it
      was wrong. Every ancestor computed `min-width: 0px` at 390px wide.
      `MatrixMark`'s `sr-only` spans are `position: absolute`, nothing inside
      the scroll box was positioned, so their containing block resolved to the
      ICB *outside* it and 26 of them sat at their static positions out to
      x=601.5, widening the document by exactly 212. The entry's own scan for
      "elements with no `overflow-x` ancestor" returned zero and was *correct* —
      those spans have one in the DOM. Scrollable overflow follows the
      containing-block chain, and for an abspos element the two come apart.
      **A zero-escaping-elements result does not mean zero elements escaped**,
      which is why Part 10's guard grades the document's own number.
    - **The second page to want a shape is when it stops being local.**
      `SectionOpener` was declared inside the pricing page with a comment
      saying why — shared chrome re-skins eight pages, and a move that owns one
      page has no business doing that. Right, while one page wanted it. Two
      private copies of a heading recipe is the drift this direction exists to
      prevent, so it moved to `components/marketing/ui.tsx` unchanged.
      `SectionTitle` stayed centred and untouched for the pages move 6 has not
      reached.
    - **A restyle does not get to sharpen what we say about a competitor.**
      `lib/marketing/comparisons.ts` is untouched by this move — every claim,
      hedge and reported price still renders verbatim. The one number that is
      OURS stopped being typed on these two pages and resolves from
      `getQuotedPlan()` (DREAMCRM-38's rule): our own price sat at the bottom
      of a column of competitor prices, which is the worst place in the product
      to be quietly stale.

14. **Move 6 page 3 — the product tour, where the page-level version of the
    check-mark veto turned up** (DREAMCRM-77, 2026-09-16). Three things this
    one decided that neither the direction nor the two pages before it had.

    - **Ten of the same section IS the bland check mark, one altitude up.** The
      owner's words on DREAMCRM-67 were *"bland check marks as icons"*, and the
      blandness was never the draughtsmanship — it was nine identical marks
      saying the same nothing nine times. This page was ten identical SECTIONS
      doing exactly that, and the fix has the same shape the tiles' did: not a
      nicer section, a section that says which one it is. The chapter mark
      (tile, `NN / 10`, eyebrow) and the rail that tracks you through them are
      the page-level tone tile.
    - **A sticky structural column is a narrower CONTAINER wearing a different
      word.** The first draft put the chapter mark in a three-column rail that
      stuck beside its section — a good-looking spine that moved every heading
      on the page ~180px right of the hero's. Move 6 page 1 had already paid
      for this lesson in the form the rule is written in ("narrow the LIST, not
      the container"), and it did not read as the same mistake until it was on
      screen. **If a structure shifts where the reading column starts, it is a
      container decision, whatever it is called.**
    - **A second translucent sticky bar is ungraded by construction, so it went
      opaque.** The old module nav was `bg-white/90 backdrop-blur` — reading
      ink on a surface that is a SIBLING scrolling past rather than an
      ancestor, which axe, `dark-mode-parity` and every rule in
      `class-pairs.ts` correctly decline to grade. The one instrument that does
      grade that shape reads the alpha out of `chrome.tsx` by name and asserts
      it finds exactly ONE there, so it could never have reached this one.
      Going opaque answers the question instead of adding a second guarded
      number — which is what that test's own docblock names as the
      alternative. The site keeps one glass bar, the graded one.

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

**Its top edge carries the signature gradient** (DREAMCRM-72) — a 3px rule,
`aria-hidden`, so the page's light ENDS here rather than a grey slab starting.
It uses the luminous steps (`teal-400` / `violet-500` / `fuchsia-500`) rather
than the ink steps, and that is legal for one reason only: "white text starts
at `teal-600`" governs fills that CARRY WHITE, and nothing rides this bar. Put
a label on it and it becomes a rule-3 violation the same afternoon.

**No bloom down here, deliberately.** Every ink on this surface is PALER than
its ground, so a wash lifts the ground and closes all three pairs at once — as
a `background-image`, which is the one thing no gate in this repo can see. The
Part 7 table would stay green while the footer got quietly less legible. A flat
ground is what makes that table a guarantee rather than an estimate.

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
- **No drawn grid. Owner veto, DREAMCRM-67 — CLOSED on DREAMCRM-72.** The 56px
  blueprint grid (`NIGHT_GRID`) was deleted rather than lightened by move 1 —
  *"i'm not a big fan of thin black lines making up grids."* Content still locks
  to a column rhythm; the rhythm is no longer drawn on the page.

  **It took two deletions, not one, and that is the part to carry.** A SECOND
  drawn grid — `HERO_DOT_GRID`, a `radial-gradient` dot tiled every 22px inside
  `PageHero` — survived move 1 and two moves after it, rendering on all eight
  subpages, because it lived under a different name in a different component
  while a sentence in this document said the veto was closed. Move 4 deleted it
  and replaced the sentence with `tests/marketing/no-drawn-grid.test.ts`.

  **The guard states the rule in its own terms rather than by name**, for the
  same reason the tone-tile census does: both names are gone, so asserting
  their absence would assert what `tsc` asserts. A lattice is **a gradient that
  repeats on a fixed pitch** — a `backgroundImage` carrying `gradient(` in the
  same declaration as a `backgroundSize`, or a `repeating-*-gradient`, which
  brings its own pitch and had zero instances when the rule shipped. The film
  grain is tiled at 140px and is NOT a lattice: noise has no lattice in it, and
  the discrimination is derived from what the tile PAINTS rather than from a
  name or an exemption entry.
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
- **The subpage display steps down to 3.6rem** (DREAMCRM-72): 3.6rem at 1440
  against the homepage's 5.375rem, through 3rem at 834 to 2.35rem at 390, hard
  left like the home hero. Subordinate, still unmistakably display, and it
  steps rather than reflowing — Part 10. `PageHero` is where that lives, so all
  eight subpages carry it without being opened.
- **The eyebrow IS the mono micro-label** — `Eyebrow` spells `MONO_LABEL`
  rather than keeping a second sans copy of the same measurements. On
  `PageHero` a 36px rule in the signature gradient leads it, so every subpage
  opens with the brand's three hues. That is deliberately not the HEADLINE
  treatment: Part 2 gives fuchsia exactly two homes and one of them is *the*
  signature headline gradient, singular — eight subpage titles wearing it would
  dilute the one place it means something.
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

  **And it stays OUTSIDE the decorative-layer grader, which is a different
  question from the one above.** That script grades text sitting on a
  `background-image`; this footer is a FLAT `bg-gray-950` with no wash under
  its text — the 3px gradient bar at its top edge carries no text, by rule. A
  flat ground is exactly what `token-contrast.test.ts` and the hand table
  already grade correctly, so adding it there would duplicate a guard that
  works — and under a global extremum flip it would have been duplicated
  BACKWARDS. The boundary is structural rather than a comment: the grader's CTA
  selector is a `div`, and this footer is a `<footer>`.
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

  **DONE on DREAMCRM-73, and the sentence above is wrong in one place — read
  the correction, because acting on "flip the extremum" as written would put a
  false pass in this document.** It is `scripts/decorative-layer-grade.mjs`
  now. The extremum is **not a constant and not a global flip**: it follows the
  INK. Dark ink on a light ground takes the darkest pixel; pale ink on a dark
  ground takes the brightest one — and this page has both, because the final
  CTA panel is `bg-gray-950` under its own wash. A script flipped wholesale to
  "darkest" grades that panel by its BEST case, which was measured rather than
  argued: under the flip the panel's palest ink reported **6.48** where the
  correct extremum says 5.69. So the script derives the extremum per sample
  from the ink's polarity against its own flat ground, and prints which one it
  chose. The measured run is below.

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
| daylight ticker | `gray-600` | `rgb(220 229 253)` | ~~**5.48**~~ | ~~6.91~~ |

**The ticker row is WRONG and DREAMCRM-73 found it by re-running the
measurement with a committed instrument.** Both of its numbers are graded
against the wrong ground. The strip has carried an opaque `bg-[#F8FAFF]` since
this very PR (`375ce1fb`), so its flat pair is **6.61**, not 6.91 — and nothing
paints over it, so its rendered pair is 6.61 as well, cost 0.00. The throwaway
harness hid the STRIP rather than its labels, exposing the hero bloom behind an
opaque surface and grading the ticker against a wash that never touches it;
`rgb(220 229 253)` is that bloom. The lesson is the one this Part keeps
relearning from the other direction — **an instrument nobody re-runs is a
number nobody re-checks** — and it is the concrete argument for the committed
script over a throwaway. Every other row above re-derived within the phase
sweep's spread (see the DREAMCRM-73 table).

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
**It re-derived it on DREAMCRM-73 and found one row wrong — see the strikeout
above, and the replacement table below.**

### The decorative layers, re-measured (DREAMCRM-73 — move 5)

`scripts/decorative-layer-grade.mjs`, the re-pointed instrument, run against the
real page at all three widths. Method unchanged where it was right — render,
hide the CONTENT, screenshot the decorative layers alone, take the extreme pixel
under each RUN OF GLYPHS rather than under an element box. Grain ON. Three
things are new, each because the old run could not have been trusted without
them:

- **The extremum is per sample**, derived from the ink's polarity against its
  own flat ground. Not a global flip — see the correction under "What does NOT
  retire".
- **Six frozen phases of `mkt-bloom`'s 18s drift**, worst kept. The old script
  waited 3.5s and screenshotted whichever phase that landed on; six of the
  fifteen worst readings below are NOT at phase 0, and the trust row at 1440
  moves 1.02 across the loop. Phase 0 is the identity transform, which is also
  where `prefers-reduced-motion` pins the bloom, so that path is inside the
  sweep by construction.
- **The headline is two runs**, because the ink moves across it: the flat half
  is `gray-950`, and the `bg-clip-text` half is clipped at the 50% stop and each
  side graded against its own shallower endpoint. Grading the whole gradient
  against its shallowest stop pairs `teal-600` with a pixel 500px away under the
  fuchsia end, and reported 4.58 — a number about nothing.

| Run | Ink | Worst | 1440 | 834 | 390 | Flat |
|---|---|---|---|---|---|---|
| hero eyebrow badge | `teal-700` | darkest | 5.08 | 5.15 | **4.73** | 7.05 |
| hero headline, flat half | `gray-950` | darkest | 13.36 | 13.67 | 14.67 | 17.62 |
| hero headline, gradient left | `teal-600` | darkest | 4.92 | **4.62** | 4.92 | 5.09 |
| hero headline, gradient right | `violet-700` | darkest | 5.83 | 5.52 | 5.93 | 6.14 |
| hero body copy | `gray-600` | darkest | 6.67 | 6.67 | 6.67 | 6.91 |
| hero trust row | `gray-600` | darkest | 5.54 | 6.56 | 5.96 | 6.91 |
| ticker labels | `gray-600` | darkest | 6.61 | 6.61 | 6.61 | 6.61 |
| final CTA headline | `white` | brightest | 15.97 | 15.97 | 15.97 | 17.62 |
| final CTA body copy | `gray-400` | brightest | **5.69** | 5.85 | 6.33 | 6.71 |
| final CTA ghost button | `white` | brightest | 14.73 | 14.00 | 13.76 | 17.62 |

Worst rendered pair on the site's decorative layers: **4.62**, and everything
passes. Five things in that table are worth carrying forward.

- **4.62 is the "nearly fine" band, and it is the thinnest number on this
  page.** The gradient's shallowest stop starts at 5.09 flat — rule 4 grades it
  there and is right — so it has 0.59 of headroom before the floor, and the
  bloom takes up to 0.47 of it at 834. Nothing is wrong today. But **this is the
  one run where warming a lobe, widening the headline, or nudging the gradient's
  first stop half a step lands under 4.5**, and no source rule would say a word:
  rule 4 would still read 5.09 and pass. If the signature gradient ever needs
  more room, `teal-700` (7.05 flat) is the stop with it. It also re-reads
  4.62/4.63 between runs — glyph antialiasing at the clip boundary — so treat
  anything at this end as ±0.01 rather than exact.
- **The dark CTA panel was never graded by anything, and it is fine.** The
  prediction in the move-5 issue held: `gray-400` at 6.71 flat, two radial
  lobes at 15% opacity, and the wash costs it **1.02** at its worst — landing at
  5.69, comfortably clear. Reference point for the next dark wash: Part 7
  records a single teal lobe at 16% alpha costing the palest night ink 1.7, so
  1.02 at 15% over two lobes is the same order of magnitude and this panel is
  spending about three fifths of what it could afford.
- **The eyebrow badge's 4.73 at 390 is CONSERVATIVE, not a near miss.** The
  badge is a `bg-white` pill, so its real ground is white at 7.05; hiding a
  sample's content hides that element's own background too, so the script
  reports the bloom BEHIND the pill. That error only ever costs a passing pair
  a red run — it can never pass a failing one — which is the only direction an
  instrument like this is allowed to be wrong in. Stated here so nobody
  "fixes" the badge.
- **The body copy reads 6.67 against 6.91 at every width** — the lobes genuinely
  miss it, which is what "centred outside the reading column" buys, and it is
  the target shape for a reading column rather than a happy accident.
- **The ticker costs 0.00 and that is the finding, not a boring row.** Its
  ground is the strip's own opaque `#F8FAFF` and no wash reaches it — which is
  how we know the DREAMCRM-69 row was measured against the wrong surface, and
  how a lobe that ever grows far enough down to reach the strip would announce
  itself as a cost above zero.

**The instrument was watched failing before this table was believed**
(`dreamcrm-conventions` §2d), four ways, and one of them found a real defect in
the script itself:

1. **The defect it exists for.** A hero lobe moved into the reading column at
   0.95 alpha: four runs went red, worst 1.80, exit 1 — and the worst readings
   landed at phases 3s, 6s and 12s, so the sweep is load-bearing. **The same
   tree passed all 340 `tests/a11y` + `tests/design-system` tests green**, which
   is this whole Part's premise measured rather than asserted.
2. **The global extremum flip** — the bug the move-5 issue warned about. Forcing
   every sample to "darkest" graded the CTA panel by its best case (6.48 where
   the truth is 5.69) and the run went **green**. A false pass, reproduced.
3. **A dead selector.** Re-pointing the CTA at `section.bg-gray-950` — the exact
   shape that killed five of the old script's six samples — reports `NOT
   MEASURED` naming each one, and fails. It first did this by hanging 30s on
   Playwright's auto-waiting `boundingBox()` and throwing a stack trace BEFORE
   writing the report, which is the wrong failure for the one defect this script
   has to survive; fixed so the grade does the reporting.
4. **The sweep itself.** Breaking the phase freeze so all six phases return the
   same instant fails the run with `PHASE SWEEP NOT MOVING` — because a
   measurement that has quietly stopped measuring looks exactly like a clean
   one.
### The shared chrome, measured (DREAMCRM-72)

Two surfaces, two instruments, because they fail in two different ways.

**`PageHero`'s blooms — rendered, darkest pixel under each run of glyphs, grain
ON**, the same method as the daylight hero above, at all three widths. The
subpage band is a third the height of the homepage band, so a lobe tuned there
lands its dense middle where the home band only ever put a tail:

| Run | Ink | 390 | 834 | 1440 | Flat |
|---|---|---|---|---|---|
| eyebrow + rule | `teal-700` | 6.81 | 6.17 | 6.81 | 7.05 |
| headline | `gray-950` | 10.37 | 11.35 | 15.29 | 17.62 |
| sub | `gray-600` | **5.64** | **5.36** | 6.62 | 6.91 |

Worst run **5.36**. Read the headline row against the eyebrow row: the violet
lobe passes behind the display type and costs it up to 7.24, which it can
afford at 10.37 — and it misses the eyebrow and the reading column almost
entirely, which is the shape Part 7 asks for.

**Two numbers that are not in the table, because they are the reason it looks
like this.** At `rem`-width lobes the eyebrow measured **4.42** at 390 — a real
failure, found by rendering and invisible to every source rule. Sizing the
lobes in `vw` instead holds the composition proportionally at every width and
took it to 6.81. An intermediate tuning then sat at **4.72**, which passes and
is exactly the "nearly fine" band this Part keeps warning about; it was not
shipped either.

**The sticky header's fill — arithmetic, not a render, and exact for the case
it grades.** A `position: sticky` bar composites over whatever is passing
beneath it, and that surface is a SIBLING rather than an ancestor, so axe,
`dark-mode-parity` and rules 1-6 all correctly decline. The worst case is the
`gray-950` footer, which the rail sits over for the last screenful of every
page. The quietest nav ink is `gray-600`:

| Fill | Rail ground | `gray-600` |
|---|---|---|
| `white/90` | `rgb(231 232 234)` | 5.63 |
| **`white/85`** — shipped | **`rgb(219 220 224)`** | **5.05** |
| `white/80` | `rgb(207 209 213)` | **4.51** |
| `white/75` | `rgb(195 197 203)` | **4.01** |

**Read the `white/80` row: it clears a 4.5 floor by one hundredth.** That is
the 4.18 lesson in its sharpest form, and it is why the fill sits two steps
above it rather than one. `token-contrast.test.ts` reads the alpha out of
`chrome.tsx`, so thinning it turns a required check red naming the ratio —
a measurement, never a preference.

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

### The pricing page, measured (DREAMCRM-75 — move 6, page 1)

The same instrument, pointed at a subpage for the first time
(`scripts/decorative-layer-grade.mjs` now takes a `path` per sample). Method
unchanged: render, hide the CONTENT, screenshot the decorative layers alone,
darkest pixel under each RUN OF GLYPHS, grain ON, six frozen phases of
`mkt-bloom`, worst kept.

| Run | Ink | Worst | 1440 | 834 | 390 | Flat |
|---|---|---|---|---|---|---|
| pricing hero eyebrow + rule | `teal-700` | 6.81 | 6.81 | **6.08** | 6.81 | 7.05 |
| pricing hero headline | `gray-950` | 10.36 | 15.24 | 11.35 | **10.36** | 17.62 |
| pricing hero sub | `gray-600` | **5.28** | 6.62 | **5.28** | 5.59 | 6.91 |

Worst rendered pair on this page: **5.28**, and everything passes. Three things
worth carrying to the next four subpages.

- **5.28 is BELOW the DREAMCRM-72 component table's 5.36, and that gap is the
  whole argument for measuring the PAGE.** `PageHero`'s run was measured on one
  subpage; the lobes are sized in `vw` but the reading column's LENGTH is each
  page's own, so a sub that wraps one line further down meets a lobe the
  component's numbers never met. The component table is not wrong — it is about
  a component. **Measure every move-6 page; do not inherit a number.**
- **Nothing below the hero is on a decorative layer, and that is a
  composition decision rather than a gap in the sweep.** The price panel, the
  inventory band and the FAQ are all OPAQUE surfaces — `bg-white` or the
  ticker's `#F8FAFF` — painted over the ground, so no wash reaches their ink
  and `class-pairs.ts` plus axe grade them correctly from the class strings.
  Sampling them anyway would have made the run WORSE, not more thorough: the
  script's own honest limit says hiding a sample's content hides its own
  background, so it would report the bloom behind an opaque panel and could
  fail a pair that really rides white at 17.62.
- **The instrument had a false red and it is fixed.** It never scrolled, so
  `ScrollReveal` left the homepage's final CTA panel at `opacity: 0` and its
  three samples graded the white page behind it. `settleReveals` walks the page
  before measuring, after EVERY load — the first version of the fix settled
  only after `goto` and the samples stayed red, because two reloads sit between
  that and the measurement. The evidence it is faithful rather than merely
  green: every homepage number in the two tables above re-derives exactly,
  4.62 included.

### The comparison pages, measured (DREAMCRM-76 — move 6, page 2)

Same instrument, same method: render, hide the CONTENT, screenshot the
decorative layers alone, darkest pixel under each RUN OF GLYPHS, grain ON, six
frozen phases of `mkt-bloom`, worst kept. Two pages rather than one, because
`/compare/[vendor]` gained a `PageHero` on this move (it had carried a bespoke
`bg-gradient-to-b from-teal-50/60` band since before move 4) and its sub is
`c.summary` — **the longest run of body copy `PageHero` renders anywhere on the
site**, ten lines at 390. `/compare` sits beside it as the two-line control.

| Run | Ink | Worst | 1440 | 834 | 390 | Flat |
|---|---|---|---|---|---|---|
| compare index eyebrow + rule | `teal-700` | 6.40 | 6.81 | **6.40** | 6.81 | 7.05 |
| compare index headline | `gray-950` | 10.87 | 14.64 | **10.87** | 13.14 | 17.62 |
| compare index sub | `gray-600` | 6.07 | 6.67 | **6.07** | 6.34 | 6.91 |
| compare vendor eyebrow + rule | `teal-700` | 6.81 | 6.81 | 6.81 | 6.81 | 7.05 |
| compare vendor headline | `gray-950` | 15.51 | 17.02 | 17.02 | **15.51** | 17.62 |
| compare vendor sub | `gray-600` | **5.83** | 6.67 | **5.83** | 6.47 | 6.91 |

Worst rendered pair on these two pages: **5.83**, and everything passes. Three
things worth carrying forward, one of which corrects an expectation.

- **The longest sub on the site is NOT the worst sub on the site**, and the
  move-6 rule survives the surprise intact. Pricing measured 5.28; this page's
  sub is four times longer and reads 5.83. Length decides how far down the band
  a run reaches, but the lobes are positioned in `vw` — what actually costs
  contrast is whether a run's x-span crosses a lobe, and this page's reading
  column clears the violet one at 834 where pricing's does not. **Measure the
  page** still holds; "the longest page will be the worst" does not, and
  reasoning from length instead of measuring would have put a wrong number in
  this table.
- **834 is where the cost lands, on both pages and on pricing.** Five of the
  six worst-column entries above are the 834 column, and the homepage's own
  worst pair (4.62, `teal-600`) is 834 too. That is now four pages agreeing,
  which makes it a property of the lobe geometry at that width rather than a
  coincidence — grade 834 first when a move is short of time.
- **Nothing below either hero is on a decorative layer**, same as pricing, and
  for the same composition reason: the vendor page's new two-price panel, the
  matrix band and the FAQ are all OPAQUE (`bg-white` or the ticker's `#F8FAFF`)
  painted over the ground. The panel is deliberately NOT sampled — hiding a
  sample's content hides its own background, so the script would report the
  bloom BEHIND it and could fail a pair that really rides white at 17.62.

The homepage's numbers re-derived exactly in the same run, **4.62 included**,
which is what says the instrument measured rather than merely returned green.

### The product tour, measured (DREAMCRM-77 — move 6, page 3)

Same instrument, same method: render, hide the CONTENT, screenshot the
decorative layers alone, darkest pixel under each RUN OF GLYPHS, grain ON, six
frozen phases of `mkt-bloom`, worst kept. This page carries the **longest
headline `PageHero` renders anywhere** — three display lines at 1440, six at
390 — which matters because the headline is the run the violet lobe passes
behind (the DREAMCRM-72 table has it costing up to 7.24).

| Run | Ink | Worst | 1440 | 834 | 390 | Flat |
|---|---|---|---|---|---|---|
| product hero eyebrow + rule | `teal-700` | 6.81 | 6.81 | 6.81 | 6.81 | 7.05 |
| product hero headline | `gray-950` | **11.35** | 15.12 | **11.35** | **11.35** | 17.62 |
| product hero sub | `gray-600` | 6.67 | 6.67 | 6.67 | 6.67 | 6.91 |

Worst rendered pair on this page: **6.67**, and everything passes. Three things
worth carrying to the last two subpages.

- **The longest headline costs 6.27 and still lands at 11.35**, which is the
  DREAMCRM-72 prediction holding at three times the length it was made at. The
  lobe's whole cost lands on the display type, exactly as designed, and display
  type is the one run on the page with the headroom to pay it.
- **This is the first move-6 page whose SUB is the cheapest run rather than the
  dearest** — 6.67 at all three widths, against pricing's 5.28 and compare's
  5.83. Nothing changed in `PageHero`; the reading column is simply further
  left of the violet lobe here than on either of those pages, because this sub
  is one paragraph on a page whose eyebrow is two words. **Measure the page**
  is now three-for-three as the rule, and "the sub is the run with the least
  headroom" is two-for-three as a habit — it is a tendency, not a law, and the
  only way to know which you have is the run.
- **The 834 pattern holds at four pages plus the homepage.** Every column that
  is not 1440 here ties at its worst, and the homepage's 4.62 re-derived
  exactly in the same run — 66 samples, zero failures, zero NOT MEASURED.

**Nothing below this hero is on a decorative layer, and one thing had to change
to make that true.** The ten chapters, the "everything else" band and the close
are all painted over the page's own ground — plain white, or the ticker's
opaque `#F8FAFF` for the band. The exception was the sticky module nav, which
shipped `bg-white/90 backdrop-blur`: a SECOND translucent sticky surface on the
site, carrying reading ink, that no instrument here can see. Move 6 made it
**opaque** rather than adding a second guarded alpha —
`token-contrast.test.ts`'s sticky-fill arithmetic is anchored to `chrome.tsx`
and asserts it finds exactly one alpha there, so it was never going to reach
this one. On `bg-white` the rail's inactive chips are `gray-600` at 6.91 and
its active chip `teal-700` at 7.05, both flat, both visible to the source rules
and to axe. The page keeps a glass bar — the header above it is still
`white/85` and still graded.

### The manifesto, measured (DREAMCRM-78 — move 6, page 4)

Same instrument, same method: render, hide the CONTENT, screenshot the
decorative layers alone, darkest pixel under each RUN OF GLYPHS, grain ON, six
frozen phases of `mkt-bloom`, worst kept. This is the page the bloom rule was
written for — almost all prose — and it is also the CONTROL at the short end:
its sub is two lines at 1440 against `/compare/weave`'s ten.

| Run | Ink | Worst | 1440 | 834 | 390 | Flat |
|---|---|---|---|---|---|---|
| why hero eyebrow + rule | `teal-700` | 6.40 | 6.81 | **6.40** | 6.81 | 7.05 |
| why hero headline | `gray-950` | **10.38** | 13.80 | **10.38** | 13.71 | 17.62 |
| why hero sub | `gray-600` | 6.23 | 6.67 | **6.23** | 6.62 | 6.91 |

Worst rendered pair on this page: **6.23**, and everything passes. Three things
worth carrying to the last page.

- **THE SHORT SUB IS NOT THE CHEAP ONE, which settles what the length
  hypothesis was worth.** Compare measured 5.83 on the longest sub
  `PageHero` renders and predicted the wrong lesson; product measured 6.67 on
  one paragraph and this page's TWO-LINE sub reads 6.23 — worse than the
  one-paragraph page and better than the ten-line one. Length does not order
  these numbers in either direction. What orders them is whether a run's
  x-span crosses a lobe, which is a property of the eyebrow's width and the
  headline's wrap on each page. **Measure the page** is now four-for-four, and
  "the sub is the run with the least headroom" is three-for-four — still a
  tendency, never a law.
- **834 holds at five pages plus the homepage.** Every worst column here is
  834, on all three runs, and the homepage's own worst pair (4.62, `teal-600`)
  re-derived exactly in the same run — 75 samples, zero failures, zero NOT
  MEASURED. Grade 834 first when a move is short of time.
- **The headline pays 7.23 at 834 and lands at 10.38**, the deepest cost the
  violet lobe has been measured taking anywhere and within 0.01 of the
  DREAMCRM-72 prediction (7.24). The lobe's whole spend keeps landing on the
  display type, which is the only run with the headroom for it.

**Nothing below this hero is on a decorative layer, and on this page that
mattered most.** The thesis paragraph, the six numbered beliefs and the close
all ride the page's own white with no wash, no grain and no tinted band — so
every run in the body grades at its flat ratio and no instrument here needs to
see them. Resolved through `tests/a11y/palette.ts`, the resolver the guards
use: `gray-700` (the belief bodies and the thesis) **10.30**, `gray-600` (the
close) **6.91**, `gray-500` (the mono labels and the `NN / 06` numerals)
**5.30**, `teal-700` (the receipts) **7.05**. A reading page is exactly where a decorative layer buys the least and
costs the most, which is what the 4.18 in the rules above is a record of.

### The resource library, measured (DREAMCRM-79 — move 6, page 5)

Same instrument, same method: render, hide the CONTENT, screenshot the
decorative layers alone, darkest pixel under each RUN OF GLYPHS, grain ON, six
frozen phases of `mkt-bloom`, worst kept. **Two pages, and seven runs rather
than six** — the guide hero has a fourth, which nothing on this site had
before.

| Run | Ink | Worst | 1440 | 834 | 390 | Flat |
|---|---|---|---|---|---|---|
| hub hero eyebrow + rule | `teal-700` | 5.53 | 6.81 | 6.40 | **5.53** | 7.05 |
| hub hero headline | `gray-950` | 10.74 | 14.28 | **10.74** | 12.62 | 17.62 |
| hub hero sub | `gray-600` | 6.07 | 6.67 | **6.07** | 6.41 | 6.91 |
| guide hero eyebrow + rule | `teal-700` | 5.62 | 6.81 | 6.76 | **5.62** | 7.05 |
| guide hero headline | `gray-950` | 10.84 | 16.52 | 12.15 | **10.84** | 17.62 |
| guide hero sub | `gray-600` | 6.37 | 6.67 | **6.37** | 6.67 | 6.91 |
| guide hero read-time spine | `gray-600` | 6.46 | 6.67 | **6.46** | 6.67 | 6.91 |

Worst rendered pair on these two pages: **5.53**, and everything passes. The
whole-site run is 96 samples, zero failures, zero NOT MEASURED, and the worst
pair anywhere is still the homepage's **4.62** (`teal-600` at 834), re-derived
exactly. Three things to carry.

- **"GRADE 834 FIRST WHEN A MOVE IS SHORT OF TIME" IS DEAD, AND THIS PAGE
  KILLED IT.** It held for five pages plus the homepage and the manifesto
  entry above records it as a shortcut. Both eyebrows here are worst at **390**
  — 5.53 and 5.62, against 6.40 and 6.76 at 834 — so a move that graded only
  834 would have reported this page 0.87 better than it is. The *reason* is not
  new; it is the thing the manifesto entry already proved and then let itself
  be summarised away: **what orders these numbers is whether a run's x-span
  crosses a lobe**, which is a property of that RUN on that PAGE. The eyebrow
  here is "Practice growth library" against `/why`'s "Why DreamCRM" — a longer
  run, and at 390 the lobes are at their largest relative to the band, so the
  extra width buys extra lobe. **Grade all three widths. The extremum column
  follows the run, not the page.**
- **THE LOWEST READING TEXT IN ANY HERO ON THIS SITE COSTS NOTHING, WHICH WAS
  NOT THE EXPECTED ANSWER.** The guide hero puts a fourth run in `PageHero`'s
  `children` slot, below the sub — no other page does — and the whole reason it
  is sampled is that "further down into the blooms" is the direction this Part
  keeps warning about. It reads **6.46** worst against the sub's 6.37: very
  slightly BETTER than the run above it. The bottom fade
  (`bg-gradient-to-t from-white`) is why, and it is doing real work rather than
  being a seam-removal detail. A fifth run below this one would be a new
  question; this one is answered.
- **NOTHING BELOW EITHER HERO IS ON A DECORATIVE LAYER**, and on the longest
  reading columns this site has that is the whole design. The shelf, the
  article body, the chapter rail, the script cards, the caveat notes and both
  closes ride the page's own white at their flat ratios — `gray-800` (the
  script cards) **13.12**, `gray-700` (body and notes) **10.30**, `gray-600`
  (the rail, the index rows, the closes) **6.91**, `gray-500` (mono labels)
  **5.30**, `teal-700` (links, the card labels) **7.05**, `amber-700` (the
  caveat label) **5.03**. Resolved through `tests/a11y/palette.ts`, the
  resolver the guards use.

  **The script cards were a tint and are white NOW, which is this move's one
  real contrast change rather than a restyle.** They shipped `bg-teal-50/40`
  carrying `gray-800` — a wash under eight lines of reading text, on the pages
  with more of that than anywhere else on the site. That is the shape the 4.18
  in the rules above is a record of. Nothing was measured under 4.5, so this is
  headroom bought rather than a defect closed; it is recorded here because the
  next person to reach for a tinted well on a reading page should find out that
  this page tried it.

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

### The docs and the changelog, measured

Move 6 page 6b (DREAMCRM-80), and the last decorative-layer run this build
order needs. Three new hero surfaces entered the sample set — nine samples
across `/changelog`, `/docs` and `/docs/<slug>` — bringing
`scripts/decorative-layer-grade.mjs` to **150 samples over 14 pages**.

**Full run: 150 samples, zero failures, zero NOT MEASURED.** Darkest pixel under
each run of glyphs, grain ON, six frozen bloom phases, all three widths.

| Run | Page | Worst rendered | Flat | Cost |
|---|---|---|---|---|
| hero eyebrow (`teal-700`) | `/changelog` | **6.40** at 834 | 7.05 | 0.65 |
| hero headline (`gray-950`) | `/changelog` | **13.47** at 834 | 17.62 | 4.15 |
| hero sub (`gray-600`) | `/changelog` | **5.37** at 834 | 6.91 | 1.54 |
| hero eyebrow (`teal-700`) | `/docs` | **6.76** at 834 | 7.05 | 0.29 |
| hero headline (`gray-950`) | `/docs` | **10.36** at 834 | 17.62 | 7.26 |
| hero sub (`gray-600`) | `/docs` | **6.27** at 834 | 6.91 | 0.64 |
| hero eyebrow (`teal-700`) | `/docs/<slug>` | **6.23** at 834 | 7.05 | 0.82 |
| hero headline (`gray-950`) | `/docs/<slug>` | **10.37** at 390 | 17.62 | 7.25 |
| hero sub (`gray-600`) | `/docs/<slug>` | **5.60** at 390 | 6.91 | 1.31 |

**The worst pair anywhere on the site is still the homepage's 4.62** — the
gradient's `teal-600` stop at 834, re-derived exactly. Nothing on these three
pages comes within 0.75 of it: the lowest here is the changelog's hero sub at
**5.37**, which is 0.87 of headroom over the floor. None of these pages puts
the signature gradient on a heading, which is where that homepage number comes
from.

**On "which width is worst": seven of these nine are at 834 and two at 390.**
Page 5 retired "834 is worst" as a LAW after both its worst runs landed at 390,
and this run is the other half of that correction rather than a reversal of it —
834 is a strong tendency and not a rule, so all three widths still get measured.
What IS consistent across pages 5 and 6 is which RUN has least headroom: the
quiet runs (eyebrow, sub) sit where the violet lobe's tail reaches, and the
headline — despite costing far more, up to 7.26 — starts from 17.62 and has the
room to pay it.

**`/blog` AND `/blog/[slug]` ARE NOT IN THE SAMPLE SET**, and it is the same
boundary `e2e/marketing-viewport.spec.ts` draws for the same reason: their
bodies come out of the DATABASE, and this script drives a real browser against a
built app, so on a freshly migrated database `/blog` renders an empty state and
`/blog/<slug>` does not resolve at all. A decorative-layer grade that depends on
fixture data is a grade that goes red for fixture reasons. Their heroes are
`PageHero` verbatim with no page-specific runs, so the `/docs` samples measure
the identical composition. Both pages WERE checked by hand for this move against
temporary fixtures — zero horizontal scroll at all three widths — and that check
expired when the fixtures were reverted, which is exactly why this table does
not carry a number for them. When the blog gets a seeded stop, add it here, in
`marketing-viewport.spec.ts` and in `smoke.spec.ts` together.

**Everything below every one of these heroes rides the page's own white**,
which is pages 1–5's answer arriving for the sixth time: the shelves, the
chapter heads, the changelog items, the step markers, the margin columns and
all five closes carry no decorative layer, so the rendered ratio IS the flat
ratio and only the hero needed the instrument.


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
4. ~~**Shared chrome**~~ — **LANDED** (DREAMCRM-72, 2026-09-16).
   `MarketingHeader`, `MarketingFooter` and `PageHero`, plus the scaffolds
   `PageHero` actually renders (`Eyebrow`, `PrimaryCta`, `GhostCta`) — a
   Daylight hero with a flat square-shouldered button inside it is drift
   visible in one screenshot, so they moved together. All eight subpages
   inherit it without being opened. The footer stayed `bg-gray-950` with its
   inks untouched and gained an inkless gradient top edge; the header lost
   decision 5's treatment and gained the glass rail. `HERO_DOT_GRID` was
   deleted, closing the grid veto's second call site. Decisions it settled:
   Part 0 item 11. Measured runs: Part 7. Zero horizontal scroll on twelve
   marketing pages x three widths; `/compare/[vendor]` still reads +212 at 390,
   unchanged, and is filed in `docs/RELEASE.md` Part 5 as somebody else's.
5. ~~**Re-point the decorative-layer grader**~~ — **LANDED** (DREAMCRM-73,
   2026-09-16). `scripts/night-band-grade.mjs` → `decorative-layer-grade.mjs`,
   re-anchored at the light hero, the ticker and the final CTA panel. Measured
   run: Part 7, "The decorative layers, re-measured".

   **It was more than a rename and a flipped constant, and both halves of that
   are worth knowing before the next move touches a wash.** Five of its six
   samples were anchored to `section.bg-gray-950`, which move 1 deleted — they
   had been matching NOTHING, so the script reported zero rects rather than a
   wrong number, and the sixth (the ticker) still resolved and was grading a
   light surface by its BEST case. And "flip the extremum" is wrong as a global
   instruction: the extremum follows the INK, which this page has in both
   polarities, so it derives per sample now. The final CTA panel — `bg-gray-950`
   under two `aria-hidden` radial gradients — had never been measured by
   anything and is in the sample set for the first time.
6. **Then per page, in this order:** pricing (the honest test of whether the
   language survives a table), compare, product, why, resources.

   - ~~**Pricing**~~ — **LANDED** (DREAMCRM-75, 2026-09-16). Hard-left sections
     on one `max-w-6xl` column, the price panel breaking the hero's seam,
     Part 3's radius ladder (the `rounded-full` trial button was the loudest
     violation left and no guard can see a radius), mono micro-labels on the
     toggle, the struck list price and the group headers, and the inventory's
     two-tier shape untouched with its row counts computed. Every price on the
     page — the panel, the metadata, the JSON-LD and three FAQ answers — now
     resolves from `getQuotedPlan()`; `tests/marketing/pricing-price-source.test.ts[x]`
     holds it. Emoji stayed banned (Part 5). Decisions it settled: Part 0 item
     12. Measured run: Part 7, "The pricing page, measured". Zero horizontal
     scroll at 390 / 834 / 1440; `marketing: pricing` clean at all three widths
     in three states each (rest, annual, every FAQ open).

   - ~~**Compare**~~ — **LANDED** (DREAMCRM-76, 2026-09-16). Both files: the
     index and `compare/[vendor]`. The vendor page had never inherited move 4
     — it carried a bespoke `from-teal-50/60` band with a hand-rolled
     `Eyebrow`/`h1` pair — so it gained `PageHero`, a two-price panel breaking
     the hero's seam, hard-left sections on one `max-w-6xl` column, Part 3's
     radius ladder, and the FAQ's rotating `+` tile from page 1.
     `SectionOpener` was promoted out of the pricing page into
     `components/marketing/ui.tsx` on the way: it was local there **on purpose
     while one page wanted it**, and the second page wanting it is the moment
     that argument flips. Emoji stayed banned (Part 5). Measured run: Part 7,
     "The comparison pages, measured".

     **AND IT CLOSED THE TWO PART 5 LEDGER ENTRIES ON THE CAPABILITY MATRIX**,
     which is the rare case where fixing a correctness defect and doing the
     brand work are the same edit. The matrix now reflows to a card per
     capability below `md` and is a `<table>` with no `min-width` from `md` up,
     so the page has no scroll container at any width: the 212px sideways drag
     at 390 and `scrollable-region-focusable` both go, on all eight vendor
     slugs. **The ledger's stated cause was wrong and the correction is the
     part to carry** — nothing was sizing to content; `MatrixMark`'s `sr-only`
     spans are `position: absolute` with no positioned ancestor inside the
     scroll box, so their containing block resolved to the ICB *outside* it and
     they widened the DOCUMENT from their static position at x=601.5. Scrollable
     overflow follows the containing-block chain, not DOM ancestry, and for an
     abspos element those come apart — so **grade the document, not the
     elements**, which is what Part 10 already says and what
     `e2e/marketing-viewport.spec.ts` now does on every marketing page at all
     three widths.

   - ~~**Product**~~ — **LANDED** (DREAMCRM-77, 2026-09-16). The longest page
     on the site, and the one that read as a wall: ten module sections, each a
     headline, a paragraph, a mock and six bullets, alternating left and right
     between identical `gray-100` hairlines. The move was STRUCTURE rather than
     skin. It is a numbered tour now — every section opens on a chapter mark
     (the tone tile, `NN / 10` as a mono numeral, the eyebrow) and the sticky
     module nav became a CHAPTER RAIL that answers *where am I*, carrying the
     header's own 2px gradient underline on the chapter you are actually in.
     Hard left throughout, one `max-w-6xl` column, the alternation retired; the
     chapter head leads full width and the section then splits seven columns of
     product to five of spec, so the screens are larger than they were. Part
     3's radius ladder against a page that was uniformly `rounded-xl`,
     `DAY_WIRE` for `gray-100`, `SectionOpener` and the pricing page's
     bookend close. Emoji stayed banned (Part 5 bans them in product mocks, and
     a tour of ten product mocks is that register). Measured run: Part 7, "The
     product tour, measured".

     **The two things worth carrying.** A SPINE IN THE LEFT MARGIN WAS THE
     FIRST DRAFT and it is the pricing page's cost in a new costume — a sticky
     three-column rail carrying the chapter mark beside its section reads well
     and moved every heading on the page ~180px right of the hero's. A
     structural column is a narrower CONTAINER by another name. And the rail's
     translucent fill went OPAQUE rather than gaining a second guard, which is
     the Part 7 note above: the alpha `token-contrast.test.ts` grades is
     anchored to `chrome.tsx` by name, so a second sticky bar anywhere else on
     the site is ungraded by construction.

   - ~~**Why**~~ — **LANDED** (DREAMCRM-78, 2026-09-16). The manifesto, and
     the page Part 7's bloom rule was written for — almost all prose, which
     is half a reading measure away from the 4.18 this Part keeps quoting.
     The answer was the same one pages 1–3 reached: **nothing below the hero
     carries a decorative layer**, so every run on the body rides white at its
     flat ratio and only the three hero runs needed measuring. Measured run:
     Part 7, "The manifesto, measured".

     **The move was the six beliefs, and it is the tone-tile lesson one
     altitude up.** They were a 2x3 card grid — six equivalent tiles, which is
     what a CHECKLIST looks like — on a page whose whole argument is that each
     line is a position somebody could disagree with. They are a numbered
     manifesto now: `NN / 06` as a mono numeral under the subject's tone tile,
     the claim in five of twelve columns and its argument in the other seven,
     hard left on the hero's own `max-w-6xl` column with `DAY_WIRE` hairlines
     between. The count is computed everywhere it appears. Tones come from the
     registry with the subject and land 4 `brand` / 2 `auto` with no `growth`
     at all — no belief on a positioning page is about what the product EARNS
     you, and that is the honest reading rather than a flat one.

     **Two things are new here rather than inherited.** The two checkable
     beliefs — the gaps are marked, leaving is allowed — carry a mono RECEIPT
     link to the page that proves them, and the other four carry none, because
     a decorative receipt is worse than no receipt. And **the price is on the
     page**: `DESIGN.md`'s three honesty tenets are the price on the page, the
     gaps marked, leaving allowed, and the page ABOUT those tenets carried two
     of them and never named the number. It resolves from `getQuotedPlan()`
     (DREAMCRM-38) and `tests/marketing/pricing-price-source.test.tsx` now
     scans this route for a typed one; all three are pinned by
     `tests/marketing/marketing-site.test.tsx` against a restyle that softens
     a BODY rather than a heading, which is the half the old assertion could
     not see. No emoji — Part 5's permission is marking a MOMENT, and a
     manifesto has none in it.

     **AND IT IS THE FIRST MARKETING SUBPAGE WITH AN AXE STOP**, which is
     worth a line because `e2e/axe-baseline.ts` explains at length why
     `/product` cannot have one: `DECORATIVE_MOCKS` keys on the drift
     wrapper and the tour's nine mocks do not float, so the exclusion would
     be dead on arrival. This page renders no mock at all, so it needs no
     exemption and holds a CEILING OF ZERO — measured 0 rules / 0 nodes at
     all three widths before it was asserted, and watched to fail on a
     `teal-400` receipt link (`#7ca5ff` on white, **2.41**). A stop with no
     exemption is the only kind whose zero means what it says.

   - ~~**Resources**~~ — **LANDED** (DREAMCRM-79, 2026-09-16). FOUR routes,
     not one: the hub and the three guides. Measured run: Part 7, "The
     resource library, measured".

     **THIS PAGE'S FIRST FINDING IS THAT ITS OWN ISSUE WAS WRONG ABOUT IT**,
     and the shape is one to expect again. DREAMCRM-79 opens *"these already
     inherit the new header, footer and `PageHero` from move 4, so the top of
     each page is converted — the work here is the bodies."* True of the hub.
     The three ARTICLES render `GuideShell`, which carried its own
     `from-teal-50/60` band with a hand-rolled `Eyebrow`/`h1` pair — the exact
     shape `compare/[vendor]` was found in on page 2, on three more pages.
     Move 4's "all eight subpages inherit it without being opened" counted
     ROUTE GROUPS, and a page that renders its own hero does not inherit the
     one it never called. **The count of pages wearing this brand has been
     wrong twice now, in the same direction, for the same reason** — once for
     `compare/[vendor]`, once for these three. `PageHero` now opens all four
     resource routes.

     **The hub was three equal cards in a `md:grid-cols-3`**, which is the
     third costume of the mistake pages 3 and 4 fixed: equivalent tiles are
     what a CHECKLIST looks like. It is an INDEX now — one row per guide,
     the subject's tone tile, `NN / 03`, the read time, and `contains` from
     the registry naming the artifacts actually on the page below. That last
     part is the page's delight and it is usefulness rather than ornament: the
     only question a reader brings to a shelf is *which one has what I need*,
     and three cards carrying a title and one sentence could not answer it.
     `contains` carries NO NUMBERS by rule — a count typed in prose about a
     countable fact in the tree is the shape that went stale twice in move 3.

     **`glyph` IS REQUIRED ON A GUIDE**, the call `ourStrengths` made on page
     2: a new guide cannot compile without somebody deciding what it is about.
     The library lands 1 `brand` / 2 `growth` and `megaphone` was REJECTED for
     the patient-growth guide even though it would have given one tile from
     each family — picking a subject to get a colour is the exact failure Part
     3's first tone rule names, and that guide argues ads come LAST.

     **THE CHAPTER RAIL IS PAGE 3's MOVE ARRIVING WHERE IT WAS NEEDED MORE,
     AND ON THE OTHER SIDE.** These are the longest sustained reading columns
     on the site — eight to ten screens — and hard-left on `max-w-6xl` left
     the right HALF of a 1440 article empty for all of it while the reader had
     no way to see what was in the guide. Page 3's rail is the cautionary tale
     (*"a structural column is a narrower container by another name"*) and the
     difference is which side: this one is on the RIGHT, so the article still
     starts exactly where the `h1` starts. It is DERIVED from the shell's own
     `children` — it walks them for `GuideH2` elements — because a hand-kept
     chapter list goes stale INVISIBLY: a rail naming a renamed chapter still
     looks like a rail. `lg:` and up only, `hidden` below (not off-screen), so
     it adds no tab stops on the width where there is no margin to fill.

     Its first draft carried a `NN` numeral and that was wrong on exactly one
     page: `how-to-get-more-dental-patients` numbers its own chapters in the
     copy, so the rail read `01  1. The Google listing…`. Stripping the typed
     prefix to make room was the clever fix and would have HIDDEN a
     disagreement rather than shown it. **The rail stopped claiming a position
     it does not own** — a tone dash instead, Tier B exactly as Part 3 defines
     it, which makes this and the hub's index the second and third lists on
     the site to qualify.

     **THE WORKED EXAMPLE HAD NEVER LINED UP.** The membership guide's
     arithmetic is a leader-dot column — `2 cleanings ...... 2 × $120 = $240`
     — set in a proportional face under `whitespace-pre-line`, which also
     COLLAPSES the runs of spaces holding it together. So the numbers the
     whole guide is about formed no column at any width. `ScriptCard` now
     takes `kind="figures"` (mono at 0.85rem, `pre-wrap`) beside the default
     `kind="script"` (sans, `pre-line`, right for copy a patient will
     receive). Part 4 names this case: mono is for any number the reader is
     meant to compare. It is a named kind rather than a boolean because the
     name is the rule. One honest limit: at 390 the widest line still wraps,
     because ~66 characters cannot fit 326px above the 12px floor — the sans
     version wrapped there too and lined up nowhere, so this is better
     everywhere and imperfect at one width.

     **THE PRICE RESOLVES, AND THE BLAST RADIUS IS THE LESSON.** `GuideShell`
     typed `"$200/mo"`. Because it is a SHARED shell that was live on three
     public pages at once while counting as one surface — the cheapest place
     this drift can hide. `tests/marketing/pricing-price-source.test.tsx`
     scans the COMPONENT rather than the three routes that render it.

     **NO EMOJI, AND THE ISSUE ASKED FOR SOME.** DREAMCRM-79 names these as
     *"the one place the curated animated set is allowed in body copy — where
     a named human is writing in the first person"*. That runs Part 5's two
     clauses together. The body-copy permission is for **plain unicode** ("the
     animated set is for moments; a character in a sentence is a character in
     a sentence"), and its precondition is a **named human** — these guides
     have no byline, no author field, and a corporate "we" is the voice that
     clause distinguishes itself FROM. There is no moment on a page somebody
     is reading either. So the fifth move-6 page in a row ships with none and
     Part 5's table is untouched. **The open question this raises is the
     owner's, not this document's:** if that clause is ever to have a call
     site anywhere on the site, the guides need a real named author, and
     inventing one is against the registry's own content laws.

     **FIRST AND SECOND MARKETING AXE STOPS SINCE `/why`** (`marketing:
     resources`, `marketing: resource guide`), both at a CEILING OF ZERO with
     no exemption — the condition `/product` cannot meet. Measured 0 rules /
     0 nodes on all four routes at all three widths before being asserted, and
     watched to fail on the rail's links at `gray-400` (`#93a0bc` on white,
     **2.62** as rendered, x6) with the hub stop staying green, which is how
     the two stops were checked to be scanning different pages. Zero
     horizontal scroll at 390 / 834 / 1440 on all four.

   - ~~**The pages Part 8 never named**~~ — **LANDED** (DREAMCRM-80,
     2026-09-16), in two halves. **6a:** `/grade`, `/roi` and
     `/partner-program` — the three the issue's audit named, each rendering a
     BESPOKE hero, so each was a page a visitor would have called unconverted
     while a grep for the shared chrome called it done. **6b:** `/blog`,
     `/blog/[slug]`, `/changelog`, `/docs` and `/docs/[slug]`. Measured runs:
     Part 7, "The three tools, measured" and "The docs and the changelog,
     measured".

     **THE COUNT OF PAGES WEARING THIS BRAND WAS WRONG A THIRD AND FOURTH
     TIME, AND IT IS NOW A RULE RATHER THAN AN ANECDOTE.** DREAMCRM-80 listed
     `/blog`, `/changelog` and `/docs` as *"already inheriting the new chrome
     from move 4; bodies only"*. True of the three INDEX routes. Both ARTICLE
     routes — `blog/[slug]` and `docs/[slug]` — rendered a hand-rolled `<h1>`
     in a bare `max-w-3xl` article and had never called `PageHero`, which is
     the shape `compare/[vendor]` was found in on page 2 and `GuideShell` on
     page 5. Four instances, same direction, same cause: **move 4's "all eight
     subpages inherit it" counted ROUTE GROUPS, and a dynamic route is one
     entry in that count and a registry's worth of pages to a reader.** The
     check that works is `git grep -L PageHero` over the route files; the check
     that failed four times is counting subpages.

     **A CHAPTER RAIL WAS BUILT FOR `/docs/[slug]` AND THEN DELETED, WHICH IS
     THE MOST USEFUL THING ON THIS PAGE.** Page 5's rail is derived from the
     article's own headings, and a doc's headings live in
     `doc.sections[].heading` — structured data, one better than walking
     children. It was built, gated on "more than one chapter", and then the
     registry was counted: **no doc has more than ONE heading** and most have
     none, so it would have rendered on exactly zero routes. A component that
     looks like coverage and is nothing is `deadExclusions`' lesson in a new
     costume. It was caught only because the e2e stop asserting it went looking
     for a two-heading doc and could not find one — **a guard that cannot fail
     is the same defect as a rail that cannot render**, and writing the guard
     first is what surfaced it. What fills the margin instead is content the
     page already had: `More in <category>` moved out of the article's basement
     into the empty right column. It STACKS below `lg` rather than hiding,
     which is where it parts company with page 5's rail — a table of contents
     is redundancy on a phone, three links to other articles are not.

     **THE PRICE RESOLVES ON THREE MORE SURFACES, AND TWO ARE NEW SHAPES.**
     `/blog/[slug]`'s CTA was the eighth, and the same defect for the eighth
     time. `lib/marketing/docs.ts` is the ninth and the first CONTENT REGISTRY
     — two help-article steps whose prose said the price, live on two public
     doc pages. Every surface before it was a route or a component, which is
     why eight previous sweeps walked past a `.ts` file full of sentences.
     **`app/opengraph-image.tsx` is the tenth and the one to remember**: the
     share card for every link to this site said `$150-500/mo` — the
     three-tier range from a reprice that was never executed Stripe-side — and
     it was found by LOOKING AT THE RENDERED IMAGE while screenshotting a blog
     post, not by any guard. It sits in the scan's blind spot by construction:
     `moneyLiterals` saw `150` (not a plan price, correctly ignored) and never
     saw the `500` at all, because that half of the range carries no dollar
     sign. **A price written as a RANGE is invisible to the rule that protects
     prices**, and the shapes to look for next are content and ranges.

     **PART 11's LAYOUT-SHIFT DEFECT IS CLOSED**, and the fix is a ratio rather
     than a guess. The blog cover is the only `<img>` on the designed marketing
     pages and it carried no width or height, so every post reflowed its whole
     article when the cover loaded. `blog_post` stores no dimensions, so there
     is no true intrinsic size to declare — typing one would be wrong for every
     upload that is not that shape. It declares the ratio WE impose (16:9) and
     crops to it with `object-cover`, which the old markup already did, so the
     box is correct before the bytes arrive and after. Part 11's AVIF/raster
     clause is deliberately NOT claimed: the cover is an author-supplied URL
     out of the CMS, so its encoding is whatever was uploaded, and that is a
     content-pipeline job rather than a brand one.

     **THE CHANGELOG'S CADENCE IS UNTOUCHED, DELIBERATELY.** The obvious move
     available to a restyle was breaking a week's items into cards or grouping
     them under New / Improved / Fixed — both of which are the weekly entry
     ceasing to be one entry, against the owner's directive and
     `dreamcrm-conventions` §7. The registry, the order and the contents are
     exactly as they were; what changed is that a week is a CHAPTER now (page
     3's chapter mark on a changelog), with the date, release and item count
     leading in a sticky column so a reader landing mid-scroll knows which week
     they are in.

     **AND PART 5's BODY-COPY CLAUSE FINALLY HAS A CALL SITE — on the author,
     not on this move.** Page 5 closed by noting the clause (plain unicode in
     body copy *where a named human is writing*) had nowhere on the site to
     live, because the guides carry no byline. `BlogPost.authorName` is a real
     field a real person fills in. So the permission lands on the blog, in
     prose the author writes, and what this move did was make the byline a real
     one — in the hero's spine rather than a 13px grey line under the title.
     **A byline is what earns that clause; a component cannot.** Six move-6
     pages shipped with no emoji and Part 5's table is untouched; the only
     glyph on any of them is the changelog rocket, which was already there and
     already correct.

   **What page 6 inherits from these five.** Four of them cost real time
   earlier in the move and none is page-specific: SECTION CONTAINERS ALL
   MATCH (a narrower container for a reading block moves its hard-left edge off
   the page's column — narrow the TEXT, not the container, and note that a
   sticky rail column is a container by another name, which is what page 3
   nearly shipped and what page 5 avoided by putting its rail on the RIGHT);
   MEASURE THE PAGE AT ALL THREE WIDTHS
   rather than inheriting `PageHero`'s numbers or grading 834 as a shortcut —
   page 5 retired that shortcut, and "the sub is the run with the least
   headroom" is a tendency rather than a law (page 5's worst runs are both
   EYEBROWS, at 390); READ PART 3's RADIUS LADDER against the page, because
   nothing in CI grades a radius and every one of these pages predates it; and
   CHECK WHETHER THE PAGE ACTUALLY RENDERS `PageHero` rather than trusting a
   count of subpages — two of the five found a bespoke hero nobody had
   counted, and page 6 is six routes none of which has been opened.

**THE BUILD ORDER IS COMPLETE.** Every move in this Part has landed, and the
marketing site carries one language from the homepage fold to the last help
article. There is no route left that opens in a different register, and the
banner at the top of this file no longer has a gap to describe.

What that does NOT mean is that this Part has stopped being useful. The four
miscounts it records are a property of how coverage was CLAIMED rather than of
any one page, and the same mistake is available to the next person who adds a
route: a page that renders its own hero does not inherit the one it never
called. The standing checks this Part leaves behind are `git grep -L PageHero`
over the route files, `e2e/marketing-viewport.spec.ts` at all three widths, and
`scripts/decorative-layer-grade.mjs` against anything that puts a wash behind
text. What remains open is Part 9's list, which is the owner's rather than this
document's.

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

  **Since DREAMCRM-76 this rule is a TEST rather than a habit** —
  `e2e/marketing-viewport.spec.ts`, inside the required `e2e` check: every
  marketing page whose content is code, at all three widths, graded on
  `documentElement.scrollWidth - clientWidth` and on `scrollTo(9999, 0)`
  leaving `scrollX` at 0. The dynamic routes expand from the same registries
  their own `generateStaticParams` reads, so a ninth comparison is covered the
  day it is added. `/blog` is deliberately out: its body comes from the
  database and the spec is seed-free.

  It exists because the rule was enforced by whoever remembered, and
  `/compare/[vendor]` shipped dragging **212px** at 390 through three moves and
  two ledger entries. Moves 3 and 4 both found it by hand and both were right;
  what a hand sweep cannot do is still be true tomorrow.

  **Grade the DOCUMENT, never the elements.** The element-level version of this
  check — walk the DOM for anything clearing the viewport with no `overflow-x`
  ancestor — was tried on that very defect and returned ZERO while the page
  panned 212px, because the culprits were `sr-only` spans whose containing
  block sat outside the scroll container they were inside in the DOM. The
  document's own number cannot be fooled that way: it is not an inference about
  a mechanism, it is what the reader experiences.
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

**One generated image sits outside that sentence and is worth naming here**:
`app/opengraph-image.tsx`, the share card every link to this site falls back
to. It is CSS-and-type in the same register, so it does not break the
product-only rule — but it is an IMAGE nobody opens in a browser, which is
exactly how it went on saying `$150-500/mo` (a reprice that was never executed
Stripe-side) long after `/pricing` settled on one plan. Found and fixed on
DREAMCRM-80; it resolves from `getQuotedPlan()` now. **The lesson generalises
past the price: a rendered asset with no page around it gets read by nobody on
the team and by everybody who shares a link.**

**Why this is a position and not a shortfall.** The honest version of this
product's story is a Tuesday that runs itself, and a mock of the real screen
tells that story better than a stock photograph of strangers in scrubs. The
failure mode to watch is Part 1's third "not us": product-only plus pale washes
is exactly how a site gets bland. The saturated light and the bleed are what
keep this from being a screenshot gallery.

**The bar, for every image that does exist** — the blog cover slot today, and
anything added later:

- AVIF/WebP with a raster fallback.
- **Explicit width and height**, so nothing reflows on load. ~~*The blog cover
  at `app/(marketing)/blog/[slug]/page.tsx` has neither today.*~~ **CLOSED on
  DREAMCRM-80** (move 6 page 6b), in the PR that had the file open anyway.

  **The fix is a declared RATIO, not a guessed size, and the distinction is the
  part worth carrying.** `blog_post` stores `cover_image_url` and
  `cover_image_alt` and no dimensions, so there is no true intrinsic size
  available to declare — typing one would be a number that is wrong for every
  upload that is not exactly that shape. What the attributes actually buy in a
  modern browser is an `aspect-ratio` for the box while the bytes are in
  flight, so the cover declares the ratio WE impose (16:9, `1600x900`) and crops
  to it with `object-cover`, which the old markup already did. The box is
  correct before the image arrives and correct after it, whatever was uploaded,
  and the CSS `aspect-[16/9]` and the attributes agree by construction. It also
  gained `loading="eager"` + `fetchPriority="high"` — it is the one
  above-the-fold asset on a post.

  **The AVIF/WebP-with-raster-fallback clause above is deliberately NOT claimed
  for this slot.** The cover is an author-supplied URL out of the CMS, so its
  encoding is whatever was uploaded. That is a content-pipeline job — the clinic
  sites solve the same problem with `<SiteImage>` through `/_next/image` —
  rather than a brand one, and it is left standing here as a real gap rather
  than quietly dropped.
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
