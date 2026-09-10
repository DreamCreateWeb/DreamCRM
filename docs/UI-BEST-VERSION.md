# UI Best-Version Program — the standing backlog

Owner directive (2026-08-19): *"look through the UI, piece by piece, component
by component, page by page, and ask: what is this now, and what's the best
version of this that there could be?"* — keeping it logical (no mega-menus on
a clinic sidebar). Presentation/interaction only; the feature freeze holds.

Method: three scouts walked the surface clusters against DESIGN-SYSTEM.md v3
and the "employee, not the tool" doctrine. Their ranked findings live here;
each work batch takes the top of the list, ships it behind the full gate, and
checks items off. New findings append; done items get ~~struck~~ with the
batch number.

**System-level finds:**
- ~~`--color-brand-600`/`--color-brand-50` referenced but DEFINED NOWHERE~~
  [CLOSED — this entry was STALE, struck in batch 52 after re-verification.
  Not one live call site remains: the two files that still spell the token
  do so inside comments explaining why it was removed. It is not merely
  fixed but PINNED — `tests/a11y/css-var-definitions.test.ts` fails on any
  `var(--token)` the sheet never defines, and names these three spellings
  (`--color-brand-600`, `--color-brand`, `--color-primary`) as tokens that
  must stay undefined. A punch-list entry the guards had overtaken.]
- ~~Hand-rolled `{pending ? 'Sending…' : 'Send'}` ternaries + Cancel buttons
  carrying the shared pending~~ [BATCH 52, both halves — and both counts in
  this entry were low. Ternaries: 67 on `ActionButton`, not ~35, on buttons
  that in most cases were ALREADY passed the same flag; the swap reflowed
  the button under the cursor and told a screen reader nothing, where the
  prop disables, sets aria-busy and holds the label's width under a
  spinner. Escape hatches: 17, not six — the original count had only looked
  in MODALS, and the shape is everywhere (drawer Cancels, wizard Backs,
  confirm Keeps, a Snooze disclosure, an Edit-first mode toggle). All 17
  become `disabled`, which is the honest state: the exit is unavailable, it
  is not the thing that is busy. `tests/design-system/pending-feedback.test.ts`
  pins zero on `ActionButton`, a lowerable ceiling on the raw-`<button>`
  remainder, and the escape-hatch rule mechanically (an onClick that is only
  a state setter, or a bare Cancel/Back/Keep/Close label, may never carry
  `pending`)].
- **The website Studio's Focus-point picker has no keyboard path at all.**
  `components/ui/focal-point-picker.tsx` is a pointer-only drag surface —
  `onPointerDown`/`Move`/`Up` on a plain `<div>`, no `tabIndex`, no `role`,
  no arrow keys — so choosing what stays in frame on a hero photo is
  mouse-or-touch only. Found in batch 53 while burning down the labels (its
  `<label>` had nothing to name, which is the tell). The fix is the standard
  2D-slider shape: focusable, `role="application"` or a pair of named
  sliders, arrow keys nudging 1% and Shift+arrow 10%. Deliberately NOT
  folded into that batch — it is a behaviour change, not an association.
- **Sibling actions sharing one `pending` flag all spin together.** Distinct
  from the escape-hatch class above and NOT closed by batch 52: where a
  surface runs several real actions off one `useTransition`, pressing one
  spins all of them (lead-drawer's Mark contacted / Convert / Archive row;
  every row of the review-request eligible list; the two payout
  dispositions in delete-partner-modal). The repo already has the fix
  named — `referral-card.tsx:202`'s `pending={pending && active === 'save'}
  disabled={pending}` — and batches 46/47/49 applied it per-surface. What is
  missing is the sweep. The guard test deliberately exempts the
  discriminating shape, so adopting it is already unblocked.
- ~~77 form fields have no accessible name~~ [BATCH 53, ALL 77, and
  `eslint-suppressions.json` is now EMPTY. A `<label>` that is a SIBLING of
  its input, with neither `htmlFor` nor nesting, connects nothing — to a
  screen reader the field was "edit text, blank". Found by the jsx-a11y gate
  on the day it landed (batch 52), NOT by reading, which is the point of the
  gate. The five surfaces a patient or applicant meets ALONE went first
  (public job application, add-to-cart, review form, accept-invite,
  partner-accept), then the staff bulk. 63 of the 77 were the plain shape and
  took `htmlFor`+`id` derived from the control's own `name`, or from the
  visible label text where a controlled React field had none. The other 14
  were NOT that shape and are the interesting half: seven `<label>`s were
  naming a GROUP, not a control (audiences' stage/source chip sets, the plan
  benefit rows, product photos and variant rows, the members checkbox list,
  the email-sender radio set) — a `<label>` can only ever name ONE control,
  so each became the group's own name via `role=group`/`radiogroup` +
  `aria-labelledby`, and the repeated rows inside them (benefits, variants,
  photo removes) got per-row names of their own, since "Variants & pricing"
  over four blank fields is still four blank fields. Four wrapped a `Toggle`,
  whose `role=switch` button the rule does not count as a control, and were
  wired `htmlFor`/`id` so the association is spelled out. Two were separated
  from their control by a paragraph of explanation (the Google review link,
  the GBP location picker — the latter dropping an `aria-label` that said
  something DIFFERENT from the visible heading). One was naming
  `FocalPointPicker`, which has no control to name at all, and became a
  span. The review form's note textarea, unlabelled entirely, gained one.
  `tests/a11y/form-labels.test.ts` pins the suppressions file empty of this
  rule — lint already fails on a new offender, but not on someone
  re-suppressing one to get the gate green.]
- ~~No automated accessibility gate~~ [BATCH 52: the repo had no
  `eslint-plugin-jsx-a11y`, no axe run, and no ESLint config at all — Next 16
  removed `next lint` and nothing replaced it, so even the 74 existing
  `eslint-disable` comments were inert. `eslint.config.mjs` now runs a
  CURATED set over `app/` + `components/` on every PR: accessible names,
  role/aria validity (the silent-failure class — a misspelled role is simply
  ignored by AT), text alternatives, and focus traps. Deliberately NOT the
  recommended preset: its interaction rules fire on hundreds of clickable
  rows and cards, and `prefer-tag-over-role` wants `<dialog>`/`<output>` for
  111 correct `role=` uses — an allowlist that size is the rule being off,
  with maintenance. Four real defects fell out on day one and are fixed: a
  `<video>` and a disabled `<button>` carrying `aria-hidden` while focusable
  (the preview button becomes a `<div>` — a facsimile should not put a real
  control in the tree), `SiteImage` spreading its required `alt` through
  `{...rest}` where no reader or tool could see it, and a redundant "photo"
  alt].
- ~~The branded primitives have no busy state at all~~ [BATCH 53. Two of the
  entry's own facts were wrong and worth recording: `ActionPill` is NOT in
  `components/patient-portal/ui.tsx` — it is file-local to
  `visit-card.tsx` — and the count was 7, not the 16 patient-facing buttons
  actually hand-rolling a label swap. `BrandButton` and `GhostButton` now
  take `pending` on the `ActionButton` contract, and so does `ActionPill`.
  The affordance itself is single-homed in `components/ui/busy-label.tsx`:
  the label stays in the layout at `opacity-0` so the button's width never
  jumps under a thumb that is still on it, a `.btn-spinner` overlays it, and
  a screen reader hears "Working…" — which a `{pending ? 'Sending…' : …}`
  ternary never said at all. It carries NO colour: `.btn-spinner` rings in
  `currentColor`, so a clinic's own brand tints it and the dashboard's teal
  never reaches the portal, which is the whole reason these primitives exist.
  `ActionButton` was re-pointed at the same component, so there is one busy
  affordance in the repo rather than four. Adopted at all 16: book, request,
  pay a bill, payment plan, messages Send, profile Save, records, loyalty
  redeem, family link request, survey note, and the visit card's
  Confirm / Move / Cancel. The four public-site submits (job application,
  membership join, cart checkout, review) take the shared BusyLabel but KEEP
  their own skins — they live in the clinic-site token system
  (`rounded-xl`, `--c-*`), and importing the portal's pill would have been a
  visual change wearing an accessibility fix's clothes. Three GhostButton /
  ActionPill exits (Never mind, Cancel) went `disabled`, per the
  escape-hatch rule. En route the guard caught the visit card's Confirm,
  whose ternary already carried the discriminating `active === 'confirm'`
  shape — and revealed that `run()`'s reschedule and cancel calls had never
  passed their `active` key, so all three pills spun together. They pass it
  now. `tests/design-system/pending-feedback.test.ts` holds the three
  branded primitives at ZERO alongside ActionButton, and its raw-`<button>`
  ceiling drops 78 → 71].
- ~~Inter arrived through a render-blocking Google-Fonts `@import` on line 1
  of `app/css/style.css`~~ [BATCH 51: self-hosted variable woff2 (latin +
  latin-ext) in public/fonts on the Nunito pattern. It was the worst-case
  shape — a CSS import is render-blocking AND can't start until the sheet
  itself has landed, so EVERY first paint in the product waited on a
  third-party round trip it couldn't preload. Variable 100–900 replaces the
  four static weights. `tokens.test.ts` now fails on any remote `@import`
  returning to the sheet, and on a woff2 the CSS names but public/ doesn't
  ship (a 404 font is silent — it just renders the fallback face)].
  RE-VERIFIED batch 53 (it was slated again as if still open): line 1 of
  `app/css/style.css` is `@import 'tailwindcss'`, both Inter woff2 files are
  in public/fonts, and the guard is live. Nothing to do.
- ~~The shared `Drawer` could open with NO accessible name~~ [BATCH 51: its
  header — and the only `DialogTitle` in the component — rendered solely
  when `title || actions`, so a title-less drawer opened as an anonymous
  "dialog", and an actions-only one got an EMPTY name. A visually-hidden
  DialogTitle now always supplies the name; the header's own title slot
  becomes a spacer when there's nothing to put in it].
- ~~Unannounced error/success nodes on the unauthenticated edge~~ [BATCH 50:
  `reset-password` announced NEITHER — its error had no role=alert (both
  sibling auth forms already did) and its success REPLACED the whole form
  with no role=status; `accept-invite`'s two formError nodes were silent
  too; the approval inbox's blocking validation complaints (empty subject,
  bad chair count) and its image-upload error had no role=alert, so the
  Approve button just appeared to stop working].
- **214 WCAG AA violations were live on `main` the whole time, in three
  rules.** The runtime accessibility checks (batch 53's sibling, DREAMCRM-25)
  found them on their first pass over real pages; they did not create them.
  QA carries them as a RATCHET in `e2e/axe-baseline.ts` — a ceiling per
  (stop, rule), numbers only ever going down — so the gate is green and closed
  against regressions rather than red and ignored. **176 `color-contrast`,
  25 `nested-interactive`, 13 `list`, across 25 of 35 stops; 62 of the
  contrast instances are on stops a patient or a visitor reaches.** Ten stops
  were already clean (both auth forms, all three onboarding steps, the
  published clinic home, coming-soon, the 404, the confirmed token page, the
  post-visit survey) — this is not systemic. Working notes for whoever takes
  the rest: the raw counts mislead in two places. The 4.48–4.49 cluster is
  68 of the 176 and is three token pairs sitting one hundredth under the
  requirement (cheapest ~40% of the contrast work), and `#5e6e8c` on
  `#10182e` (3.42:1, 16) is `--color-ink-500`'s LIGHT value rendering on a
  dark surface when the dark override already exists at
  `app/css/style.css:375` — that row needs a diagnosis, not a token change,
  and editing `--color-ink-500` would be fixing the wrong thing. Tracked as
  DREAMCRM-28; batch 54 took it to 166 and batch 55 to 119, and the baseline
  file carries a running burn-down log. One correction to the framing above,
  found in batch 55: `#5e6e8c` on `#10182e` is NOT the dark-mode side. It is
  the marketing footer — a dark band inside a light-mode page, where no
  `.dark` scope applies — so the dark override was never involved, which is
  what the "diagnosis, not a token change" instinct was protecting against.
  And 41 of `marketing: home`'s 43 remaining are inside `aria-hidden`
  decorative product mock-ups at 7–10px, which WCAG 1.4.3 exempts as
  incidental; they are deliberately not "fixed". Remaining: white text on the
  brand ramp's 500 step (`#ffffff` on `#4c7df0`, 3.81:1 — teal-600 and deeper
  are the legal white-text fills), and the agenda row (`nested-interactive` +
  `list` are ONE structural pattern — an `li[role="button"]` containing its
  own focusable controls, so both clear together when it becomes a
  non-interactive `li` around a button).
- ~~The patient portal used the clinic's brand colour RAW, as text and as a
  button fill~~ [BATCH 54, and it was a product defect rather than the
  palette correction the 176 contrast instances made it look like. The
  clinic public site derives a whole contrast-checked palette from the one
  brand colour (`buildClinicPalette` — `heading` for brand-as-text,
  `brandStrong` for a fill under white text) and every guarded token clears
  4.5:1. **The portal never adopted it.** It read
  `clinicProfile.brandColor` raw and used it the two ways that carry text:
  as a fill on the #FAF7F2 ground and on white cards (`PortalHeading`, the
  phone links, Reschedule) and as a `BrandButton` background under a
  hard-coded `text-white`. A dark brand hides that; the seeded sage lands at
  2.17:1 as text and 2.32:1 under white, a pale pink at 1.64:1 — so it was
  never a fixture artefact, it was every clinic that picks a light brand.
  The five token pages a patient reaches from a text or an email (confirm a
  visit, pay a balance, set up a plan, the survey, the review request) had
  the same shape. `lib/portal-brand.ts`'s `portalBrand()` now sits on all
  eight paths the brand takes to a patient. ONE derived value, not the two
  the clinic site uses, because one provably covers both roles: a colour
  dark enough to clear 4.5:1 as text on the cream has luminance ≤ 0.170, and
  white on anything that dark clears 4.5:1 too — which is what let this land
  as an eight-line change instead of threading a second colour through
  ~100 call sites. Hue is preserved (a sage clinic reads deep sage, not
  slate), a brand that already clears the floor passes through verbatim, and
  the cream rather than white is the derivation ground because it is the
  darker of the two surfaces involved. En route the new guard's hue-wheel
  sweep caught a live bug in `readableInk` ITSELF, which the clinic site has
  used since the palette shipped: it measured contrast on the FRACTIONAL
  rgb and then let `toHex` round, so a whole band of brands came out at
  4.48–4.50 — passing in the unit test, failing in the browser, and the
  same one-hundredth-under shape as the biggest cluster in the axe baseline.
  It now measures the colour that actually ships. `tests/clinic-site/
  palette.test.ts` asserted the right floor and missed it for the ordinary
  reason: nine named fixtures, none of them on the boundary.
  `tests/a11y/portal-brand.test.ts` sweeps 2,880 brands across the hue wheel
  at every plausible lightness, pins the one-value implication, and guards
  the eight entry points by source so a new patient surface cannot read the
  brand raw].
- ~~The semantic tone recipe failed WCAG AA on its own tinted background~~
  [BATCH 55, and it was the biggest single cluster in the axe baseline
  (`#bb4d00 on #fff0d9`, 4.48:1, 36 instances) wearing a token pair's
  clothes. `lib/ui/encodings.ts` painted every tone as
  `bg-<ramp>-500/15 text-<ramp>-700`, so the ink's real background is the
  wash OVER WHICHEVER SURFACE the pill landed on — and the darkest of those,
  `--color-surface-sunk` (table headers, wells), is what decides. At the 700
  step warn measured 3.96, ok 4.12 and urgent 4.25; violet scraped 4.59 and
  fuchsia sat on exactly 4.50, which is a coincidence rather than a margin.
  All five coloured tones moved to the 800 step — one step of the same hue,
  uniform, because letting the pill and text recipes drift apart is the
  cheapest way for a registry to stop being a single source of truth. It took
  the appointment-drawer stops from 15 to 1 and the populated patients list
  from 8 to 1. Alongside it: `--color-ink-500`/`--color-gray-500` nudged one
  point of lightness darker (#5e6e8c → #5c6c89) because it cleared 5.14 on
  white and 4.78 on the canvas and landed at 4.49 on the sunk surface; the
  marketing footer's column headings, which were BOTH failing at 3.42 and
  quieter than the links beneath them; `text-gray-400` — the ink the sheet
  marks "disabled only" — used as real text on 24 lines of the marketing
  site; and both error pages, where the reference id a person is meant to
  read off a broken page and quote back to us was the least legible text on
  it (2.62 light, 2.18 dark) and global-error's Reload button was v2's
  retired teal AND 3.74:1. THE DURABLE PART is
  `tests/a11y/token-contrast.test.ts`: the source-level contrast guard the
  repo did not have. The legibility floor tests SIZE, jsx-a11y cannot see
  colour at all, and axe only measures the 35 stops the browser suite happens
  to walk — so nothing ever read the design system's own numbers and asked
  whether they clear 4.5:1, which is how 176 of these accumulated quietly and
  why so many sat at 4.48–4.49. It reads the real values from
  `app/css/style.css` and Tailwind's own `theme.css`, layered in the
  browser's cascade order with oklch converted the way Chromium converts it
  (pinned against canvas-read values, so a wrong matrix cannot make it pass),
  and asserts every ink × surface and every tone-ink × its-own-wash pair in
  both themes. Nothing in it is transcribed].
- ~~The agenda row was an `li[role="button"]` wrapped around its own
  controls~~ [BATCH 56 — the whole `nested-interactive` (25) + `list` (13)
  count, and it was ONE shape, not two rules. The appointments agenda row and
  the leads board row were both `<li role="button" tabIndex={0}>` containing a
  checkbox, a link to the patient and inline Confirm / Mark-done actions. That
  broke two things at once: a button may not contain focusable controls, so a
  screen-reader user tabbing in landed on controls inside something announced
  as a single button; and an element carrying `role="button"` is no longer a
  `listitem`, so the `<ul>` around it had no list items in it at all — the
  list was not a list. Both clear together. The row is now a plain clickable
  list item whose keyboard door is a REAL button on its primary label (the
  visit type, and the lead's name), which is also the better reading:
  "cleaning, button" inside a list item beats one giant "Open Riley's visit,
  button" with the controls buried in it. The accessible name leads with the
  visible label so it still satisfies Label-in-Name (WCAG 2.5.3) while saying
  whose visit it opens — "cleaning" alone is not enough when six rows say
  cleaning. Whole-row click is preserved: a bare `onClick` on a
  non-interactive element, which is the established pattern on these surfaces
  (`eslint.config.mjs` turns the interaction rules off precisely because
  hundreds of rows and cards do this) and is legitimate now that the keyboard
  has its own door. `tests/a11y/clickable-rows.test.tsx` re-implements BOTH
  axe rules over the rendered DOM — no focusable element may have a focusable
  ancestor, no list may have a non-list-item child — so the pattern cannot
  come back between E2E runs, and pins the two behaviours the restructure had
  to preserve (the row still opens on click; the row-level controls are still
  first-class). Red-verified by putting the old shape back: four of its six
  tests fail and the nested check names all eight trapped controls.
  `e2e/staff-day.spec.ts` located rows via `getByRole('button', { name: "Open
  Riley Staffday's visit" })`, which only worked BECAUSE of the broken shape;
  it now locates a `listitem` and opens it through the row's own button].

---

## Cluster 1 — Daily (Overview · My Day · Follow-ups · Leads)

### Overview (`app/(default)/dashboard/`)
Already best-version: TodayChairRow, MorningReveal, ring+text pairing, GrantsStrip zero state.
1. ~~Approve button → ActionButton primary + pending; Edit-first → ghost~~ [BATCH 10 — struck in batch 53 on re-verification: approval-inbox.tsx's Approve is an `ActionButton variant="primary" pending`, Edit-first is `variant="ghost"`].
2. ~~AttentionCard headline number → the link its subtitle promises~~ [BATCH 10 — struck in batch 53: every AttentionCard carries its `cta` href, and kpi-stat.tsx wraps the whole tile in a Link when `href` is set].
3. ~~Dead preview rows → deep links~~ [BATCH 10 — struck in batch 53: Unconfirmed and Unmarked rows link to `?appt=<id>`, New inquiries to `/leads?status=new`, Follow-ups due to `/followups`].
4. ~~Proposal + standup cards on the retired etched recipe~~ [BATCH 15: .v2-card].
5. ~~Machine-handled sky pill~~ [BATCH 15: violet info tone on card + rail; the icon well drops its phantom brand-50 token too].
6. ~~Morning skeleton wrong shape~~ [BATCH 15: sign-here card + 4-card grid + 5 KPIs + feed].
7. ~~Feed rows hover where they can't click~~ [BATCH 15: hover gated on href]; MorningReveal on the feed left open (motion budget judgment).
8. ~~Raw inputs/selects in the inbox~~ [BATCH 29: form-input/form-textarea/form-select — the sky focus rings are gone].
9. ~~Three amber notice dialects stacked~~ [BATCH 29: readiness banner, site-health banner and guardian note all on the standard warn recipe bg-amber-500/10 + ring-inset].
10. ~~Sign-here stack keyboard path~~ [BATCH 29: →/n next, ←/p previous; guarded against typing targets and view-all].
11. Two of five trend tiles have no spark/delta (:719, :726). DEFERRED — those metrics have no per-day history series in getOverview; same reason class as the heartbeat deferrals (data-path work, not UI polish). → **POST-1.0** (`docs/POST-1.0.md`, daily metrics snapshot).
12. ~~ComingSoonCard permanent dead chrome~~ [BATCH 29: component deleted; a one-line texting footnote inside the Reviews card, gated on !smsLive].

### My Day
Already best-version: ClosedHeartbeat, undo-toast on tick-off.
1. ~~loading.tsx max-w-6xl vs page max-w-[96rem] — guaranteed reflow~~ [BATCH 10 — struck in batch 53: both are `max-w-[96rem]`, and the skeleton mirrors the real 6-tile grid].
2. ~~Tick-off circle not disabled during transition~~ [BATCH 30: verified covered — the shared TickButton (batch 16) always disables while pending].
3. ~~Prep flags bare amber text~~ [BATCH 15: StatusPill warn].
4. ~~Raw 🪑/🚪 emoji, no legend~~ [BATCH 30: the agenda's own labeled StatusPill recipe (🪑 Seated ok / 🚪 Arrived info) — self-explaining, and the two surfaces can't drift].
5. ~~Unread badge hand-rolled~~ [BATCH 15: StatusPill warn + hover meaning].
6. ~~"Claim" raw chip~~ [BATCH 15: ActionButton secondary sm + pending].
7. ~~7 KPI tiles orphan~~ [BATCH 30: grid goes 4-up on lg when the conditional proposals tile joins — 4+3, no lone orphan].
8. ~~No primary action~~ [BATCH 30: "All my follow-ups" is the header primary].
9. digest-toggle: ~~no pending acknowledgment~~ [BATCH 15]; the orphaned placement stays (a deliberate quiet footnote).
10. ~~Sparkline compat import~~ [BATCH 30: MiniTrend everywhere — the compat wrapper itself is retired (kpi-stat + intake heartbeat swapped too, sparkline.tsx deleted)].

### Follow-ups board
Already best-version: due-state grouping, optimistic complete with honest revert.
1. ~~No PendingVeil on filter nav~~ [BATCH 10 — struck in batch 53: `{navPending && <PendingVeil />}` on the board].
2. ~~One useTransition freezes rows during nav — split navPending/rowPending~~ [BATCH 10 — struck in batch 53: two transitions, `rowPending` on the rows and `navPending` on the veil].
3. ~~Settings card between filters and the work~~ [BATCH 30: collapsed one-line summary ("N of M on · morning digest on/off") + chevron disclosure; body stays mounted while hidden (settings-tabs law)].
4. ~~No tailored loading.tsx~~ [BATCH 16: chip row + rules line + grouped tick rows].
5. ~~Empty states hand over no action~~ [BATCH 30: the unfiltered caught-up state hands over Open patients; filtered already had Clear filters].
6. ~~"N due now" in the primary slot~~ [BATCH 16: StatusPill warn in the legend zone].
7. ~~Tick circle drifted~~ [BATCH 16: components/ui/tick-button.tsx, both boards adopted].
8. ~~Bordered select on every row~~ [BATCH 30: transparent until hover/focus — the assignee reads as quiet text, the control chrome appears when reached for].
9. ~~Heartbeat gone on tablets~~ [BATCH 16: label always shows; the spark stays desktop].
10. ~~Sparkline → MiniTrend~~ [BATCH 30].

### Leads
Already best-version: tone/ball-in-court mapping, ageTitle, per-status empty copy, drawer action ladder, dedupe confirm.
1. ~~Archive sub-panel escapes the drawer — add `relative`~~ [BATCH 10 — struck in batch 53: the drawer panel carries `relative`].
2. ~~Rows mouse-only — role/tabIndex/Enter~~ [BATCH 10 — struck in batch 53: the row has role=button, tabIndex=0 and an onKeyDown].
3. ~~Hand-rolled search → SearchInput~~ [BATCH 10 — struck in batch 53: leads-view imports and renders the shared SearchInput].
4. ~~Discarded pending flag → PendingVeil~~ [BATCH 10 — struck in batch 53: `{isPending && <PendingVeil />}`].
5. ~~Empty states actionless~~ [BATCH 16: Share-your-website / Clear-filters handed over].
6. ~~Drawer timeline uses browser-local time~~ [BATCH 30: formatClinicDayTime with the clinic tz plumbed page → view → drawer].
7. ~~leads/loading.tsx wrong shape~~ [BATCH 30: chip row + select-all line + left-bordered card stack].
8. ~~Select-all orphaned~~ [BATCH 16: a label-clickable list header].
9. ~~Two styles for the archive exits~~ [BATCH 16: both ghost ActionButtons].
10. ~~Spark desktop-only + compat import~~ [BATCH 30: MiniTrend; the container was already hidden lg:flex].

---

## Cluster 2 — Records + Comms (Patients · Appointments · Messages · Inbox · Intake)

### Patients list
1. ~~Sort headers unfocusable, no aria-sort, arrow shifts width~~ [BATCH 11: SortableTh — real buttons, aria-sort, fixed arrow slot].
2. ~~Row dead outside the name cell~~ [BATCH 19: whole-row mouse nav (cursor-pointer, own controls excluded, rides the PendingVeil transition); the name Link stays the keyboard/AT path].
3. ~~Search needs Enter but never says so~~ [BATCH 19: SearchInput grows an opt-in `enterHint` ↵ kbd — shown only while typed text awaits submit; Messages' live search unaffected].
4. ~~Two raw selects amid FilterChips~~ [BATCH 19: the picker stays a select (long enumerations), but an ACTIVE source/tag presents as the shared active FilterChip with one-click clear].
5. ~~Bulk bar~~ [BATCH 11: Invite/Pay-link ride the pending prop. CLOSED in batch 53 — the "Tagging…" placeholder-select spinner is a recorded DEFERRAL, not outstanding work: a select is the honest control for a long tag enumeration, its first-option pending label is visible feedback, and a popover menu would re-implement the same list for chrome.]
6. ~~No sticky thead~~ [BATCH 11].
7. ~~Heartbeat hidden lg:flex~~ [BATCH 19: label survives from sm up; the spark stays desktop — the followups precedent].
8. ~~saved-views-bar re-implements FilterChip~~ [BATCH 19: All-patients + view chips ride FilterChip href-mode; the action pills (+ Save view / Follow-up all / Send a campaign) stay deliberate — chips filter, they never act].
9. ~~Saved-view delete hover-only, no confirm~~ [BATCH 16: always visible at reduced contrast + useConfirm].
10. ~~window.prompt() for audience naming~~ [BATCH 16: the inline-naming recipe, Enter/Esc].
11. ~~text-gray-400 on meaningful labels~~ [BATCH 16: gray-500 floor].

### Patient detail
1. ~~Six same-weight header actions~~ [BATCH 18: Send message · Book · Edit + ONE More ▾ menu (intake/review/view-as) on the shared dismiss contract].
2. ~~Vanishing feedback spans~~ [BATCH 12: Send-intake/review/portal-invite report through the global toast; the pay-link nudge keeps its persistent inline confirmation by design].
3. ~~Timeline filter is component-local~~ [BATCH 18: ?tab= via history.replaceState — refresh/share lands on the same slice].
4. ~~Timeline empty state actionless~~ [BATCH 18: per-tab action — book / send message / send intake].
5. ~~Needs-attention hand-rolled box~~ [BATCH 18: v2-card + StatusPill warn/ok header].
6. ~~Amber-emoji aging encoding not in any legend~~ [BATCH 18: agingBorderClass left border on the li; icon tint dropped].
7. Raw back link where TrailBack exists (:205). DEFERRED: TrailBack is trail-context/header-slot-bound (the form-builder lesson) — the plain link is the honest fit here.
8. ~~Header stat strip has no heartbeat~~ [BATCH 18: Visit-rhythm MiniTrend bar — completed visits/quarter, trailing 2y, derived from the timeline already in hand].
9. ~~Timeline unbounded~~ [BATCH 18: 40-row pages + "Show older (N more)"].
10. ~~Note bodies at text-xs~~ [BATCH 18: text-sm; empty prose de-italicized]. EmptyState adoption in the rail DEFERRED: the py-12 well is sized for main-column lists — inside a 240px rail card it would be mostly chrome.
11. ~~Note delete bare × no confirm; doc upload no progress~~ [BATCH 18: useConfirm + 24px icon target; a live in-progress row with spinner + filename during upload].

### Patients modals
1. ~~merge-duplicate unsafe shell~~ [BATCH 12: role=dialog + aria-modal + focus trap + Esc; scrim-click deliberately does NOT dismiss an irreversible flow].
2. ~~Import wizard has no step indicator~~ [BATCH 20: StepRail — Upload → Match columns → Done; current ringed teal, finished ticked emerald, aria-current=step].
3. ~~Import file picker raw input~~ [BATCH 20: dashed drop well — click to browse or drop the CSV; filename + size echo back; non-CSV drops refused with a plain sentence].
4. ~~Edit modal: 14 fields, no section headings~~ [BATCH 20: Contact / Address / Insurance / Care preferences / Family access headings; the ✕ landed in batch 17].
5. ~~Bulk message: no recipient visibility; ternary send~~ [BATCH 20: "To: first three names +N more" with a full-list disclosure; Send rides the pending prop].
6. ~~Add-patient doesn't autofocus~~ [BATCH 17].
7. ~~Import close is text ×~~ [BATCH 17: the standard icon button; Edit modal gains a ✕ too].
8. ~~SIX modals spin their Cancel~~ [BATCH 11: disabled, never pending, on every onClose].

### Agenda
Already best-version: emptyCopy() engine.
1. ~~Row is li onClick — mouse-only drawer~~ [BATCH 11: role=button + Enter/Space + aria-label].
2. ~~Nine chips + two selects + search in one unlabeled row~~ [BATCH 22: When:/Show: group labels + a hairline divider before the pickers; search gains the enterHint ↵].
3. ~~Bulk bar ternaries~~ [BATCH 17: activeBulk key — only the pressed bulk button spins].
4. ~~Right cluster shrink-0 squeezes patient name~~ [BATCH 22: the pill cluster wraps onto a second row (max 45% width) instead of crushing the name].
5. ~~Sticky day header top-0 tucks under chrome~~ [BATCH 11: top-16].
6. ~~Bulk composer no dismiss contract~~ [BATCH 17: usePopoverDismiss on the trigger+panel wrapper].

### Appointment drawer + booking
1. ~~One useTransition spins five buttons at once~~ [BATCH 12: activeAction keys — only the clicked button spins, the rest disable].
2. ~~No sticky footer action row~~ [BATCH 31: the one-primary ladder moved to a sticky bottom footer (the shared Drawer's slot recipe); in-office + destructive rows stay in-flow — destructive never sits beside the primary].
3. ~~Reschedule always opens tomorrow 09:00~~ [BATCH 12: seeds from the visit's own local date+time; past visits fall back].
4. ~~In-office undo micro-text~~ [BATCH 17: gray-500 floor + underline].
5. ~~Patient replies at text-xs~~ [BATCH 17: reply bodies at text-sm full ink; metadata stays xs].
6. ~~Slot grid collapses to text while loading~~ [BATCH 17: six skeleton chips in the grid's shape].
7. ~~Walk-in defaults 09:00~~ [BATCH 12: now, rounded up to the next quarter hour].
8. ~~Fast-pass~~ [BATCH 17: Remove confirms, contrast lifted. CLOSED in batch 53 — the collapsed-by-default summary is a deliberate quiet panel, not a remainder.]

### Messages (list + detail)
Already best-version: the message stream + receipts; per-row optimistic nav.
1. ~~No keyboard nav while /inbox has j/k~~ [BATCH 21: j/k walks the list (skips while typing; rides the same optimistic nav + veil)].
2. ~~Metadata at text-gray-400: timestamp, You:, assignee~~ [BATCH 11: gray-500 floor]; read preview weight kept (unread bolding is the signal).
3. ~~Urgency badge hand-rolled rose~~ [BATCH 11: StatusPill tone=urgent].
4. ~~14px checkboxes on a batch surface~~ [BATCH 21: 16px].
5. ~~Snooze popover: no Esc/outside-click~~ [BATCH 14: usePopoverDismiss on the wrapper — verified wired].
6. ~~Empty states actionless~~ [BATCH 21: Clear filters / Message-a-patient-from-their-chart handed over on both panes].
7. ~~Composer rows=2 no auto-grow~~ [BATCH 11: grows to 280px, collapses on send].
8. ~~Send mislabels during unrelated actions~~ [BATCH 11: dedicated sending flag + pending prop].
9. ~~Header stacks six blocks before the stream~~ [BATCH 22: tags + quick-follow-up fold behind one named disclosure ("Tags (N) & follow-up"); controls stay MOUNTED while collapsed (tabs law) so a half-typed follow-up survives].
10. ~~Four popovers, zero Esc~~ [BATCH 14: assign/snooze/templates/schedule all on usePopoverDismiss — verified wired].
11. ~~Schedule confirm raw violet button~~ [BATCH 21: ActionButton secondary + pending; Cancel goes ghost — violet stays a tone, never a button skin].
12. ~~Attachment remove opacity-0 hover-only~~ [BATCH 21: always visible at opacity-80 (touch had no way in)].
13. ~~Receipts/footnotes at text-gray-400~~ [BATCH 21: gray-500 floor; the activity-marker lines stay deliberately quiet per the markers law].

### Inbox
1. ~~Generic skeleton~~ [BATCH 23: inbox-shaped loading.tsx — list pane beside reading pane]. Moving sync+classify off first paint DEFERRED: a behavior change to the mailbox data path, not presentation — post-1.0 candidate.
2. ~~Arbitrary px type in reading pane~~ [BATCH 23: text-[20px]/[13px]/[12px]/[14px] + 15px icons onto the standard scale].
3. ~~Raw surface colors~~ [BATCH 23: sidebar → surface-1 token, reading pane → canvas token; the two translucent backdrop-blur strips keep alpha whites by necessity].
4. ~~FilterChips hand-rolls FilterChip~~ [BATCH 23: view toggles ride the shared FilterChip href mode; intent chips keep their tone colors on purpose].
5. ~~BulkActionBar: no toasts~~ [BATCH 31: every bulk act toasts its count ('3 conversations archived'), failures toast urgent. The header swap stays — selection swapping the toolbar is the Gmail grammar].
6. ~~Trash/Archive: no feedback~~ [BATCH 23: global toast ('Conversation archived' / 'Moved to trash'). No confirm on purpose — both are reversible, Gmail grammar].
7. ~~Unread emerald vs amber contract conflict~~ [BATCH 23: unread dot + count pill go amber; the emerald patient-link chip stays (identity, not unread)].
8. ~~Hover-revealed checkboxes; lowercase refresh~~ [BATCH 23: checkboxes always visible at half strength (touch has no hover); Refresh/Syncing… cased; the empty state was already EmptyState and now hands over Clear filters].
9. ~~ToolbarButton re-implements primary~~ [BATCH 23: the dead primary variant removed — Reply (ActionButton) is the pane's one primary by construction].

### Intake forms + builder
Already best-version: CompletedHeartbeat.
1. ~~Fill URL un-copyable gray mono~~ [BATCH 11: the new shared CopyChip primitive].
2. ~~"No submissions yet" dimmed below floor~~ [BATCH 11].
3. ~~Three equal row buttons~~ [BATCH 26: Edit leads at secondary weight; Preview/Kiosk demote to ghost].
4. ~~Packets~~ [BATCH 11: CopyChip + contrast on the URLs and the empty state; BATCH 26: quiet-until-hover rose Delete on the audiences recipe — the confirm was already there. Both named halves shipped, so the entry closes in batch 53.]
5. ~~Silent 50-cap~~ [BATCH 26: honest footer line pointing at each form's full history]. Filters DEFERRED: the index is a glance surface; per-form pages carry the full lists.
6. ~~Builder reorder = 10px ▲▼ text glyphs~~ [BATCH 14: 28px grid targets — verified wired].
7. ~~Archive adjacent to Save~~ [BATCH 14: moved to a quiet footer above the bar — verified wired].
8. ~~Remove-section no confirm~~ [BATCH 14: confirms with the question count; empty sections skip the dialog — verified wired].
9. ~~No dirty-state indicator~~ [BATCH 26: the save bar says "Unsaved changes" (amber) whenever state differs from the last-saved shape; baseline resets on save].
10. Preview hidden under lg. DEFERRED: the builder is a desk task — a stacked live preview on phones would double the scroll for a surface nobody edits there.
11. ~~Add-field native details dump~~ — already a labeled button GRID behind a styled disclosure (scout stale); category grouping adds little at ten types.
12. Raw back link where TrailBack exists. DEFERRED: TrailBack is trail-context/header-slot-bound (the form-builder lesson) — the plain link is the honest fit.

---

## Cluster 3 — Portal + Hubs + Settings

### Portal chrome & shell
1. ~~Runtime Google-Fonts fetch for Fraunces~~ [BATCH 32: self-hosted variable woff2 (latin + latin-ext) in public/fonts on the Nunito pattern, preloaded — the third-party round trip and the Georgia flash are gone].
2. ~~portal loading.tsx cool-gray shimmer~~ [BATCH 32: warm sand-tone shimmer blocks on the portal's own cream palette].
3. ~~Header "Book a visit" self-link~~ [BATCH 32: on /patient/book the pill goes quiet-outline + aria-current instead of a primary that reloads the page you're on].
4. ~~More-sheet nav carried the current page in tint alone~~ [BATCH 50: the desktop nav and the bottom tab bar both announced aria-current; the More sheet's items did not, so the page you were already on was unmarked. The More TRIGGER also gains aria-expanded (it opens a sheet and never said so) and aria-current when the active page lives inside it].

### Patient dashboard
1. ~~Two hand-rolled amber strips~~ [BATCH 32: both task strips ride PortalNotice warn; the one-off #EBDCB8 border retired].
2. ~~Balance amount buried mid-sentence~~ [BATCH 32: "$42.50 balance" leads in bold — the fact the patient came for doesn't hide].
3. ~~Verbs grid no pressed state~~ [BATCH 32: active:scale-[0.98] press feedback].
4. ~~"See all visits" gated on >3~~ [BATCH 32: shows whenever any visit is upcoming — the page also holds history].

### Appointments (portal)
1. ~~Past-visit rows not tappable~~ [BATCH 32: every row links to its visit page, with a › affordance + warm hover].
2. ~~Past list uncapped~~ [BATCH 32: latest 10 + "Show older visits (N more)" via ?all=1].
3. ~~Empty Past silently omitted~~ [BATCH 32: one quiet "No past visits with us yet" line].

### Visit detail — mostly already best-version.
1. ~~Pending-forms callout re-implements PortalNotice~~ [BATCH 32: rides the primitive].
2. ~~Bring-list emoji bullets~~ [BATCH 32: quieted to 0.85rem at 60% — markers, not headlines].

### Book / Request / Slot picker
1. ~~Slot buttons under the tap floor~~ [BATCH 33: py-3 on slot buttons + taken chips — 44px on the most-tapped control].
2. ~~Three files re-declare INK/MUTED/BORDER~~ [BATCH 33: all three import PORTAL_* aliased — one home for the palette].
3. ~~Submit buttons bypass BrandButton~~ [BATCH 33: book + request submits and the See-my-visits CTA ride BrandButton (tap feedback, disabled states); the .ics download stays a plain anchor by necessity].
4. ~~request-form lost sibling a11y~~ [BATCH 33: who-for + reason chips get role=group + aria-pressed; the error announces (role=alert); free-text fields ride PortalInput/PortalTextarea with real focus rings].
5. ~~"No openings" no next step~~ [BATCH 33: when the clinic has a phone, the empty state offers "Call us at (555)… and we'll find you something"].
6. ~~Slot pickers had aria-pressed but NO group~~ [BATCH 50: batch 33 gave the choice chips role=group + aria-label and left both slot pickers out — the portal picker's day strip and slot grid, and the public form's, are now named groups too ("Pick a day"/"Pick a date" + "Pick a time"). A day chip is no longer a loose toggle belonging to nothing].
7. ~~Picking a day swapped the whole grid in silence~~ [BATCH 50: one polite role=status region per picker narrates the phase — "Checking openings…" → "6 times available on Sep 12" / "No openings on Sep 12". The portal skeleton's own sr-only "Checking openings…" had been sitting INSIDE an aria-hidden wrapper, so it never spoke at all].
8. ~~Public day chips spoke a bare number~~ [BATCH 50: the visible label is two split divs ("MON" over "12") with no month; they now carry the same aria-label the portal picker already had].
9. ~~The public booking payoff was SILENT~~ [BATCH 50: `BookingSuccess` REPLACES the form outright — the submit button unmounts, focus falls back to <body>, and a screen-reader user pressed Book and heard nothing. The funnel's whole endpoint. A live region can't carry this one (it mounts already-populated, the case screen readers don't reliably announce), so the phase-change contract is focus: the "You're booked." heading takes tabIndex=-1 and is focused on mount, which speaks it AND puts the keyboard at the top of the new content].

### Billing / invoices
1. ~~pay-form primitive-starved~~ [BATCH 33: PORTAL_* tokens, BrandButton, role=alert on the error, focus-within ring on the amount pill].
2. ~~Post-Stripe success banner hand-rolled~~ [BATCH 33: PortalNotice success inside role=status].
3. ~~billing-history tabs 28px, ARIA half-wired~~ [BATCH 33: 40px min-height pills; tabs gain ids + aria-controls and the list is the labelled tabpanel].
4. plan-offer.tsx already best-version.

### Records
1. ~~Off-palette #B4452F error hex~~ [BATCH 33: PortalErrorText (palette ink + role=alert)].
2. ~~Success state hand-rolled, no live region~~ [BATCH 33: PortalNotice success inside role=status].
3. ~~"Not on file" dimmed below palette~~ [BATCH 33: PORTAL_MUTED].

### Portal messages
1. ~~Send feedback tiny, unannounced, self-clears~~ [BATCH 34: 0.85rem, role=status/alert, persists until the next action — no more 5s vanish].
2. ~~Composer vs tab bar on short phones~~ [BATCH 34: one line at rest, auto-grows with content to ~5 lines, collapses after send].
3. ~~Attachment remove 20px target~~ [BATCH 34: 24px].
4. ~~📎 emoji icon~~ [BATCH 34: new 'clip' stroke in the PortalIcon set].

### Profile
1. ~~No focus ring on 11 fields~~ [BATCH 34: every field rides PortalInput (real focus-visible ring); size overrides via inline style so utility conflicts can't regress it]. [was WCAG-level]
2. ~~Save confirmation vanishing whisper~~ [BATCH 34: role=status, persists until the next edit/submit].
3. ~~Sign out no pending state~~ [BATCH 34: 'Signing out…' + disabled].
4. ~~Opt-in toggle reverts silently~~ [BATCH 34: the revert now says so (role=alert line)].

### Family
1. ~~"Book for {name}" ~32px~~ [BATCH 34: BrandButton small — tap feedback + honest size].
2. ~~No-dependents state hides FamilyLinkRequest~~ [BATCH 34: the self-serve link-request card renders under the explainer — the exact flow the empty state describes].
3. ~~"· 8" age without unit~~ [BATCH 34: "· age 8"].

### Intake (portal)
1. ~~"Fill it out" ~32px pill~~ [BATCH 34: BrandButton small].
2. ~~Raw #7BA37E green~~ [BATCH 34: PORTAL_SUCCESS_INK].
3. ~~Empty to-fill state bare~~ [BATCH 34: PortalEmptyState + See-your-visits next step].

### Portal primitives + shared cards
1. ~~NPS row 36px circles + hover:scale on touch~~ [BATCH 35: 44px circles, active:scale press feedback (hover doesn't exist on the phone this renders on)].
2. ~~VisitCard Confirm no "Confirming…"~~ [BATCH 35: per-action key so only the pressed pill changes its label].
3. ~~VisitCard duplicates STATUS_STYLES + hand-rolls result notice~~ [BATCH 35: rides the shared VisitStatusPill (new labelOverride carries the deliberate "Needs confirming" divergence) and PortalNotice (which grew the danger tone)].
4. ~~loyalty-card text-rose-600~~ [BATCH 35: PORTAL_DANGER_INK + role=alert].
5. ~~PortalEmptyState hardcoded #9CAF9F fallback~~ [BATCH 35: falls back to PORTAL_INK — on-palette even unbranded].
6. ~~family-link-request placeholders-as-labels~~ [BATCH 35: real labels above each field; placeholders demote to examples].

### Growth hub
1. Hero KPI + FunnelStat → KpiStat. DEFERRED: the v3 hub's hero scoreboard and inline funnel row are deliberate owner-approved layouts (2026-07-26) — KpiStat's tile chrome would box what was designed to flow.
2. ~~NewsCard duplicated verbatim across two hubs~~ [BATCH 24: hoisted to components/ui/news-card.tsx (valueSuffix kept); both hubs import the one recipe].
3. Funnel heartbeats. DEFERRED: getRecallStats carries no weekly history — a new data series is server work beyond presentation. → **POST-1.0** (`docs/POST-1.0.md`, daily metrics snapshot).
4. ~~Utility footer links ~20px hit height~~ [BATCH 24: py-2 tap height on all three].

### Reviews
1. Sixteen KPIs, zero heartbeats. DEFERRED: every tile already rides KpiStat; sparks need per-metric history series the services don't keep. → **POST-1.0** (`docs/POST-1.0.md`, daily metrics snapshot).
2. ~~Four identical bands~~ [BATCH 24: each band now leads with its own header — the ask→review funnel · On Google right now · Where they reviewed · Patient pulse].
3. ~~Google-link gate hand-rolled amber panel~~ [BATCH 24: the standard warn recipe (amber-500/10 + inset ring)].
4. ~~Secondary competes with breath primary~~ [BATCH 24: Edit-request-email demotes to ghost].

### Audiences
1. ~~Full danger Delete on every card~~ [BATCH 13: ghost w/ rose hover].
2. ~~Recipient count whispered~~ [BATCH 13: mono-numeral hero].
3. ~~Empty state actionless~~ [BATCH 13: + New audience in the well].
4. ~~Shared pending spins all Deletes~~ [BATCH 13: per-card deletingId].
5. ~~Per-audience counts before first paint~~ [BATCH 31: countsPromise unawaited server-side; cards paint immediately, each number streams in via use() + Suspense with a quiet – fallback].

### Outreach queue
1. ~~TIER_ACCENT_BG contradicts the tone contract~~ [BATCH 25: tier headers ride the standard tone surface recipe (tone-500/10 + inset ring) — the *-50 dialect retired].
2. ~~Empty tiers render full-height~~ [BATCH 25: one quiet ✓ line — good news doesn't get the biggest box on the page].
3. ~~Four primary Sends at once~~ [BATCH 25: the largest tier's Send is the one primary; the rest demote to secondary].

### Website hub
1. ~~"Your site is live" prints even when NOT live~~ [BATCH 13: gated on siteLiveAt].
2. ~~Delta detached from its tile~~ [BATCH 25: the ▲/▼ moves under the visits number it describes]. The trio stays hand-shaped like the Growth hero (deliberate hub layout).
3. ~~Go-live checklist fake radio circles~~ [BATCH 25: the circle stays a to-do marker but hovers an → inside — the row navigates, it doesn't tick].
4. ~~Utility footer repeats hero facts~~ [BATCH 25: Design/Pages footer doors drop their fact echoes (the hero carries them); Domain keeps its address (its only editable home); all four links get py-2 tap height].
5. ~~The go-live lever lies in both directions~~ [BATCH 53, from Quinn's browser run at DREAMCRM-15 — a pending-state honesty problem, so it came here rather than staying in the product-defect lane. (a) After "Go live" the site is public in ~300ms, but the hub sat on "Going live…" for up to SIXTY SECONDS with no `GET /website` going out at all — `router.refresh()` was called inside the same async `startTransition` that awaited the action, and the router's own transition was starved by the one waiting on it. Sometimes it landed instantly, which is worse than a consistent stall: nobody can tell a slow success from a failure, and the reliable response to a stuck button is to press it again — on the button that publishes a practice's website. The refresh now runs from an effect, outside that transition, and the card stops depending on it entirely: it confirms "Your site is online." in a role=status the moment the action returns. (b) "Take site offline" could not fail — `TakeOfflineLink` never read its action's result, so a refusal or a DB error closed the confirm and looked exactly like a success; a deliberate-breakage run found the site still serving with the hub reporting nothing. It now says what went wrong AND what is true ("… — your site is still live") in a role=alert, with a Try again. Six rendering tests in `tests/website/go-live-feedback.test.tsx`; the E2E spec header that reported the stall is updated, its reloads deliberately kept].

### Quick edits
1. ~~Save = raw bg-teal-500~~ [BATCH 13: ActionButton primary + pending].
2. ~~Errors, no live region~~ [BATCH 13: role=alert].
3. ~~No focus trap in the modal~~ [BATCH 31: the shared useFocusTrap (Tab cycle, initial focus, restore-on-close, Esc) replaces the bare window Escape listener].
4. ~~Services modal saves silently~~ [BATCH 31: reorder + remove now toast success in the picker (add + errors already did) — the auto-save is audible everywhere].

### Design panel
1. ~~Four identical primaries on one surface~~ [BATCH 13: the hoisted SaveBar on all three cards; Browse-designs demoted to secondary].
2. ~~Saved ✓ self-destructs 2.5s~~ [BATCH 13: persists until next edit, role=status].
3. ~~Two cards allow no-op saves~~ [BATCH 13: dirty tracking everywhere].
4. ~~"Publish to go live" ×3~~ [BATCH 13: once at panel level].

### Pages manager
1. ~~Three same-weight 12px links/row~~ [BATCH 31: verified already fixed in place — Open in editor leads (teal, font-medium), View live + manager sit quiet gray; a per-row button would out-shout a 12-row list].
2. ~~invisible-but-focusable chevron~~ [BATCH 31: verified already fixed — no-copy rows render plain text with the chevron simply absent, no dead tab stop].
3. ~~"N text edits" unexplained~~ [BATCH 14: title explains + points at the disclosure].

### Website forms
1. ~~Submission rows not links~~ [BATCH 31: each row deep-links to its own inquiry (/leads?status=all&lead=… — LeadsView opens the drawer from the param)].
2. ~~Empty state plain sentence~~ [BATCH 31: EmptyState + Share-your-website action].
3. ~~count7d whispers~~ [BATCH 31: the number leads at text-sm semibold mono; the label stays quiet].

### Settings home
1. ~~No tile carries state~~ [BATCH 27: server-fetched TileBadge map — Team shows "N invites pending", Billing shows "Trial — N days left"; best-effort, quiet when nothing's live].
2. ~~Search results unannounced/uncounted~~ [BATCH 27: role=status "N matches" line above the grid].
3. ~~Clear-search 20px target~~ [BATCH 27: 28px].
4. ~~No-match bare sentence~~ [BATCH 27: names the query + an inline clear-the-search action].

### Team
1. ~~Default tab = Invite~~ [BATCH 13: Members → Pending → Invite].
2. ~~Pending count invisible~~ [BATCH 13: "Pending (N)" in the tab label].
3. ~~Shared pending spins every row~~ [BATCH 27: per-action keys (remove-/resend-/cancel-id) — only the pressed button spins, the rest disable].
4. ~~Raw amber vs TONE_TEXT.warn~~ [BATCH 27: the expiry-soon text rides the token].

### Practice — the SaveBar is the model.
1. ~~Hoist SaveBar~~ [BATCH 13: components/ui/save-bar.tsx; practice + design adopted; portal Profile still open].
2. ~~View-only banner hand-rolled amber~~ [BATCH 31: standard warn recipe bg-amber-500/10 + inset ring].
3. ~~Raw emerald tick~~ [BATCH 31: TONE_TEXT.ok + role=status].
4. ~~Tabs never write the URL~~ [BATCH 31: tab + subtab clicks history.replaceState ?tab=&sub= (the patient-detail precedent) — refresh/share lands on the same tab; deep-link reads already existed].

### Billing panel
1. Four money facts as prose. DEFERRED: the facts read as warm sentences (the product's voice) with mono values already — a grid trades voice for scan speed on a rarely-visited page.
2. ~~One pending covers checkout/portal/cancel/resume~~ [BATCH 28: activeAction keys — portal/cancel/resume each spin alone; plan buttons ride their own pendingPlan].
3. ~~Upgrade nudge hand-rolled violet~~ — already the standard info recipe (violet-500/10 + inset ring); scout stale.

### Payments hub
1. ~~Doors restate the KPI band verbatim~~ [BATCH 28: doors drop the duplicated stats — only Online payments keeps its connect STATE (a door fact); tests pin the absence].
2. Outstanding heartbeat. DEFERRED: needs a balance-history series the services don't keep. → **POST-1.0** (`docs/POST-1.0.md`, daily metrics snapshot).
3. ~~Doors bespoke hover~~ [BATCH 28: v2-card-interactive].
4. ~~Stripe notice hand-rolled violet~~ — already the standard info recipe; scout stale.

### Shop hub
1. ~~TWO "Connect Stripe" primaries~~ [BATCH 13: panel copy demoted to secondary].
2. ~~Up to four stacked notices before data~~ [BATCH 28: the steady-state "storefront live" band demotes to a quiet one-line status — good news is not a standing banner; the off-state and transient connect banners stay actionable].
3. Sales band vanish. DEFERRED: hiding the $0 band during setup is a documented deliberate decision in the code (nobody stares at a $0 band while onboarding).
4. ~~LowStockPanel outranks the Sales band~~ [BATCH 28: restock is housekeeping — it now reads AFTER the money story].

---

## Cluster 4 — Platform tenant (scouted 2026-08-21; three scouts: core · prospecting · tail)

Scope notes: platform nav "Sales Pipeline" = /platform/prospecting; /marketing(+/pipeline)
are deep-link-reachable legacy routes and still audited; /developer is a bare redirect
(nothing to audit). No tenant-voice violations found anywhere — the platform owner never
reads clinic-voiced copy.

### Platform cross-cutting (mechanical sweeps)
1. Cancel-spins + shared-pending sweep. CORE FILES DONE [BATCH 36: clinics-list (delete-modal Cancel + View-as demoted from per-row primary + resend-invite failure surfaced + dead ternaries), partner-actions (per-action keys), referral-card, referred-clinics-table, delete-partner-modal, subscriptions-panel (per-action), plans-panel (per-price keys)]. Remaining sites ride their surface batches: pipeline-lead-drawer, add-lead-button, audiences-client, campaign-editor, blog-editor, review-board, library-entry-editor, prospecting files.
2. ~~FlashToast announces errors as success~~ [BATCH 36: role=alert + assertive when tone==='urgent'; partners-table and referred-clinics-table now pass urgent tones on every failure path (validation + catches). pipeline-board's silent move failure rides the /marketing batch].
3. Tone sweep. PARTIAL [BATCH 42: prospecting sky retired — cool score band → violet, communicated stage + replies tile → fuchsia (special: a human reaching back), email channel dot → violet; brand-teal-as-status → emerald across pipeline-panel Won, territory Won, board reply tone, deal-room savings, copilot done-line (now a toast); plus the module's *-50 surfaces → surface-sunk and the demos/call-list raw hex (#ddd6fe/#f59e0b) → tokens]. ~~Remainder: marketing terminology.ts sky/stone stage accents~~ [CLOSED in batch 53: lib/marketing/terminology.ts carries no sky or stone accent — the six stages are gray/fuchsia/violet/amber/emerald/rose and `stageAccentClasses` emits tone tokens; the file only spells "sky/stone" in the comment recording their retirement. It rode the /marketing batch (45) as planned and was never struck here.] (Subscriptions-attention + clinic-detail + violet-as-link were closed in earlier batches; phone-queue special deliberately kept.)
4. ~~Retired *-50 dialect sweep~~ [BATCHES 38–49, verified at close: the flagged sites landed with their surface batches (prospecting b42/43, marketing b45, service library b46, blog b47, settings b48, campaigns/audiences b49); a final grep finds only false positives (z-50/opacity-50), interaction-state hover:bg-gray-50 (accepted idiom), and the daily-briefing hero's white-on-teal chrome (deliberate)].
5. ~~Missing loading.tsx~~ [CLOSED in batch 53 on re-verification: every route this entry named ships one — /ecommerce/customers, /ecommerce/invoices, /messages, /partners and /partners/[id], /platform/prospecting, /call-mode, /call-list, /demo/[id], /website/blog, /platform/service-library — landed across batches 41/45/46/47 and their surface batches without this list being struck. The one remaining clause is a recorded DEFERRAL, not work: dashboard/loading.tsx is clinic-shaped for the platform tenant, and loading.tsx is static and tenant-blind, so branching would need the skeleton moved into the page or a cookie-reading client shim — disproportionate for the one-user platform surface.]
6. ~~role=alert/status adoption~~ [BATCHES 36–49, verified at close: prospecting went from zero live regions to toast/role adoption across 10 files; every flagged bare error div now carries role=alert; the flagged silent successes (subscriptions, plans, drawer actions, resend-invite) all toast].

### Platform Overview
1. ~~No primary action in the header~~ [BATCH 37: + Add clinic is the one primary (lands on /ecommerce/customers?add=1, which now opens the modal on arrival); Revenue's header slot moved to the quick-link grid].
2. ~~Guardian audience control raw mechanics~~ [BATCH 37: ActionButtons with pending + real targets; note role=status, error role=alert. The INLINE confirm stays deliberately — the audited Phase-4 design keeps the would-hear count beside the decision; a modal would detach it].
3. ~~Honesty banners amber-50~~ [BATCH 37: standard warn recipe on both].
4. ~~Etched card recipe in guardian/brain panels~~ [BATCH 37: .v2-card everywhere].
5. ~~Engine/brain state chips hand-rolled + no legend~~ [BATCH 37: StatusPill tones (urgent/warn/neutral/ok) + an EncodingLegend in the panel header rendered FROM the same table].
6. KPI heartbeats. PARTIAL [BATCH 37: Revenue page's Total + Project KPIs gained sparks from their existing weekly buckets]. Overview MRR/Needs-Attention DEFERRED — getMrrSnapshot is a point-in-time tier count with no stored monthly series; a spark needs new history bookkeeping. → **POST-1.0** (`docs/POST-1.0.md`, daily metrics snapshot).
7. ~~Stripe-unavailable banner raw + silent~~ [BATCH 37: standard warn recipe + role=status on both pages].
8. ~~PMS-demand clinic chips dead~~ [BATCH 37: each chip opens its clinic page (service now carries the org id)].
9. ~~Activity rows title-only targets~~ [BATCH 37: the whole row is the link]. QuickLink duplication resolved by the header restructure — Revenue's only top door is now the quick-link grid.

### Platform Revenue (fintech/platform-revenue.tsx)
1. ~~Contributor bars use semantic tones as series~~ [BATCH 37: CHART_SERIES tokens on the split bars + the transaction source dot goes neutral. subscriptions-stats' PlanMixCard rides the MRR batch].
2. ~~Top-contributor + transaction rows dead-end~~ [BATCH 37: contributor names and transaction clinic names deep-link (RevenueTransaction now carries clinicId)].
3. ~~KPIs no heartbeats~~ [BATCH 37: Total rides the combined buckets, Project Revenue its own]. The page keeps two quiet secondaries by design — Revenue is a REPORT; its jobs live on the pages it links.
4. ~~Legend order off~~ [BATCH 37: fixed 1..3 order; the trend width stays a bounded constant (the card is max-width-capped) and LegendDot stays local — a one-page helper].

### Clinics list (clinics-list.tsx)
1. ~~Delete modal hand-rolled~~ [BATCH 38: focus trap + Esc + scrim-click (all blocked mid-delete), role=dialog, ink-token scrim, modal shadow, role=alert error; the Cancel spin fell in batch 36].
2. ~~Every row primary "View as"~~ [BATCH 36: secondary — + Add clinic is the page's one primary].
3. ~~Resend-invite swallows failure~~ [BATCH 36: a failed send reads 'Failed — try again' on the button].
4. ~~Raw search input + dead filtered-empty~~ [BATCH 38: SearchInput with clear; the no-match state hands over Show all clinics].
5. ~~Raw hex avatars / gray-50 thead / doubled ternaries~~ [BATCH 38: brand token fallback on both avatar sites, surface-sunk thead; ternaries fell in batch 36].

### Clinic detail ([id]/**, add-clinic-modal)
1. Hand-rolled identity header — DEFERRED as deliberate: this is an ENTITY page (logo + name + tagline), which PageHeader has no slot for; forcing it would lose the identity treatment. The eyebrow hue and legend landed (below).
2. ~~Violet identity + special misuse~~ [BATCH 38: teal eyebrow; in_progress rides info].
3. ~~Pills + glyphs no EncodingLegend~~ [BATCH 38: PROJECT_STATUS_LEGEND + TYPE channels feed EncodingLegend on the clinic-detail header — verified present at close].
4. Rows inert. INVOICES DONE [BATCH 38: each links to its Stripe hosted page (service carries hostedInvoiceUrl)]. Project rows DEFERRED — no per-project destination exists (/ecommerce/orders has no row-targeting param); an IA gap, post-1.0.
5. ~~NexHealth card raw mechanics~~ [BATCH 38: ActionButton primary with per-action pending (bind vs write-back no longer share fate), form-checkbox class, success role=status].
6. ~~ReferralCard shared pending + rose-50 errors~~ [BATCH 36 split the pending; BATCH 38 moved both error blocks to the urgent recipe + role=alert].
7. ~~Server dates / modal success / scrim~~ [BATCH 38: role=status + ink-token scrim. CLOSED in batch 53 — the other two clauses were never work: server dates are N/A BY DESIGN (a platform-global surface has no clinic tz to anchor to — the tz law binds clinic-facing renders — and the dates are day-granular), and the hardcoded domain string is display copy mirroring the SITE_DOMAIN default.]

### Client messaging (double-sidebar platform branch)
1. ~~No thread-header identity~~ [BATCH 39: the conversation title renders at real heading size/ink in the pane; the sticky chrome keeps its one mobile control].
2. ~~Send never spins~~ [BATCH 39: pending prop].
3. ~~New-conversation trigger 20px~~ [BATCH 39: 40px circular hit area with hover wash].
4. ~~Raw hex + gray-400 toggle~~ [BATCH 39: gray-900 token + gray-500 floor].
5. ~~Stat strip special misuse~~ [BATCH 39: active-count goes neutral ink (a count is not a celebration), numerals ride font-mono-num, strip chrome on surface tokens. The compact 3-up strip layout stays — KpiStat tiles are too heavy for a 20rem rail].
6. ~~Sidebar gaps~~ [BATCH 39: team empty state hands over an Invite-a-teammate button; SearchInput with clear; tab strip gains aria-pressed; chrome on surface/hairline tokens].

### MRR / Subscriptions (ecommerce/invoices/**)
1. ~~Local tone map w/ sky + special churn~~ [BATCH 39: sky retired from subscriptions-attention (local map now info=violet/special=fuchsia), scheduled-to-cancel rides warn — verified no sky remains at close].
2. ~~Shared row transition + orphaned errors~~ [BATCH 36 split the pending; BATCH 39 moves the error beside the buttons that caused it, role=alert].
3. ~~Mutations silent on success~~ [BATCH 39: cancel/keep/plan-change/archive/price-toggle/create-plan all toast].
4. + New plan placement — DEFERRED as deliberate: creating a Stripe plan is a rare act; promoting it to the page primary would out-shout the daily job (managing subscriptions). The button stays with the Plans card it creates into.
5. ~~"+N more" dead + silent banner~~ [BATCH 39: each bucket's +N-more deep-links ?status= (the table now reads it); the Stripe banner announces role=alert on the urgent recipe].
6. ~~Raw search + plan select + PlanMix empty~~ [BATCH 39: SearchInput adopted, selects ride form-select, PlanMixCard renders an EmptyState — verified at close].

### Partners
1. ~~Errors as success toasts~~ [BATCH 36: FlashToast announces urgent as alert; both tables pass urgent tones].
2. ~~Shared transitions + spinning Cancels~~ [BATCH 36: per-action keys everywhere; Cancels disabled-not-spinning].
3. ~~Filtered-empty dead end~~ [BATCH 40: EmptyState + Show-all-partners action]. Ledger/payout empties stay quiet one-liners DELIBERATELY — the in-card quiet-line precedent (portal batch 32; EmptyState wells inside side-by-side cards are mostly chrome).
4. ~~gray-400 on meaningful text~~ [BATCH 40: gray-500 floor on the term, the % unit, and the ✕ (which also grew a 32px hit area)].
5. ~~rose-50 errors, no role=alert~~ [BATCH 40: urgent recipe + role=alert in all three].
6. ~~Terms editor no dirty contract + two primaries~~ [BATCH 40: Save lights only when something changed ('Unsaved changes' hint), the baseline moves on save, and Save demotes to secondary — Pay-now keeps the page's one primary. A floating SaveBar would be heavy for a one-card form].
7. ~~Back link / server dates / effectiveFilter~~ [BATCH 40: the effectiveFilter fallback writes the state, so the chip row always shows the truth. CLOSED in batch 53 — the back link stays a plain link on the TrailBack context-bound precedent, and server dates are N/A on a platform-global, day-granular surface.]
Already best-version reference: delete-partner-modal, tone-aware toasts, per-row pendingId, legends, mono money columns.

### Prospecting — module-wide
1. ~~Zero live regions / no useToast module-wide~~ [BATCHES 41–44: the module's action surfaces (drawer, contacts, call cards, Call Mode, copilot, practice booth, drafter, focus banner, territory) adopted the global toast + role=alert/status; read-only report panels legitimately carry none].
2. ~~No loading.tsx on any prospecting route~~ [BATCH 41: shaped skeletons for /prospecting, /call-mode, /call-list, /demo/[id]].
3. ~~sky/brand-as-won/*-50/raw-hex tone sweep~~ [BATCHES 42–43: executed as the cross-cutting sweep — see the Cross-cutting section's tone-sweep entry for the full disposition].

### Prospecting workspace (page.tsx)
1. ~~Two header primaries~~ [BATCH 41: Call Mode is the one primary with breath; Add-a-clinic demotes to secondary].
2. ~~Two stacked underline tab rows~~ [BATCH 43: the page's view switcher becomes FilterChips (href mode, counts inside) — no longer confusable with the workspace's underline sub-nav].
3. ~~Raw search + hand-rolled kill-switch banner~~ [BATCH 41: SearchInput (a small client wrapper keeps the plain GET form) with ↵ hint + clear; the banner rides the warn recipe + role=status].
4. ~~Name-only deep link + no warmth legend~~ [BATCH 43: the whole practice cell (avatar + name + phone) is one deep-link target — a literal anchor-spanning-a-<tr> isn't valid HTML, so the cell is the honest maximum; the filter row gains an EncodingLegend for the four warmth tiles].
5. ~~gray-400 "not checked yet"~~ [BATCH 43: gray-500]. Pagination already rides ActionButtons; PendingVeil on filter nav DEFERRED — the page is server-rendered (chips are plain GETs) and batch 41's loading.tsx covers the transition.

### Daily briefing / hunt panel / focus banner
1. ~~Briefing empties + amber card~~ [BATCH 43: Empty lifts to gray-500 and grows per-column CTAs (see demos / browse prospects / see hot); the follow-ups card moves onto the standard amber recipe; the count onto font-mono-num gray-500].
2. Hero CTA + overnight rows. PARTIAL [BATCH 43: 🎯 New-overnight arrivals now carry ids from the service and deep-link to their deal rooms]. The hero's white-on-teal pill DELIBERATELY stays a styled Link — no ActionButton variant expresses white-fill-on-brand-gradient, and matching Call Mode's dial-block language is the point.
3. Hunt panel. PARTIAL [BATCH 43: the five engine pills gain an EncodingLegend; tile subs lift to gray-500]. KpiStat+MiniTrend heartbeats DEFERRED — HuntStats stores 24h totals only; sparks need a new HOURLY aggregate, so the daily snapshot in `docs/POST-1.0.md` would NOT unblock this one. Post-1.0 in its own right.
4. ~~Focus banner~~ [BATCH 43: both controls become ActionButtons (view=secondary, clear=ghost w/ pending); clearing announces via toast; banner onto the ring recipe].

### Copilot bar
1. ~~Hand-rolled modal no trap/role/aria-modal~~ [BATCH 42: useFocusTrap + role=dialog/aria-modal/aria-label on the ⌘J panel; Esc moves off the global listener into the trap].
2. ~~running disables ALL actions~~ [BATCH 42: per-action key — only the tapped action reads "Running…"; suggested-action buttons keep their compact chip form (a palette's chips, not page CTAs) — raw-button conversion accepted as-is].
3. ~~Success vanishing line / gray-400 floors / trigger~~ [BATCH 42: mutation success → global toast; "Try asking"/matched-name/footer/thinking line to gray-500 + role=status; trigger grows to a 40px target].

### Prospect drawer + deal room
1. ~~Hand-rolled drawer~~ [BATCH 41: a client ProspectDrawerShell supplies scrim + Esc + focus trap + role=dialog while the CONTENT stays server-rendered (the ?prospect= deep link is the part worth keeping — the shared client Drawer would have lost it); ✕ grows a 36px target + Esc hint].
2. ~~drawer-actions shared transition + silent successes~~ [BATCH 41: per-action keys; suppress rides useConfirm(danger); enroll/stop/re-enrich/suppress all toast; error role=alert].
3. ~~contacts-panel shared pending + confirm-less delete~~ [BATCH 41: per-act keys (re-verify/add/pin-id/del-id with live labels), delete asks by address, ✕ gets a 24px boxed target off gray-400].
4. ~~Deal-room savings + drafter~~ [BATCH 42: savings panel → emerald ok recipe] [BATCH 44: the drawer's remaining gray-400 floors → gray-500; the follow-up drafter drops its dead ternaries for pending props, errors carry role=alert, the logged confirmation announces via toast + role=status, and copy confirmations go aria-live]. CopyChip adoption DEFERRED — the chip renders its value inline in mono (built for URLs); a multi-paragraph email draft is the wrong shape for it, and the draft is already visible in the editable textarea.

### Call Mode + call list
1. ~~One pending disables five outcomes / OutcomeButton emerald-as-primary~~ [BATCH 42: per-outcome active key ("Logging…" only on the tapped one); OutcomeButton grows a busy prop; the primary outcome's fill moves to the brand token].
2. ~~Errors/pickers/skip/practice modal/session strip~~ [BATCH 42: role=alert on call-session + practice-panel errors; both pickers' Cancels become ghost ActionButtons; pass chips show live "Logging…" labels; Skip lifts to a legible gray-500 underline; practice-panel gains scrim-click + Esc + focus trap + role=dialog + a 32px ✕] [BATCH 44: every session-strip segment carries a title text twin ("Call 3 — Demo booked" / "current call" / "up next") on both the live strip and the wrap-up strip, so the colors are never the only encoding].
3. ~~call-card one pending / all-primary / vanishing success~~ [BATCH 42: per-outcome keys incl. per-loss-reason; ALL outcome buttons go secondary (no per-card primary in a list of cards); the 2.5s flash becomes a global toast; Not-interested toggle never spins].
4. ~~ConvertForm + loss chips~~ [BATCH 42: submit pending prop + role=alert + success toast; loss chips → rose-500/10 w/ live labels] [BATCH 44: call-session's hand-rolled LOST_REASONS table deleted — both pickers now read the single MANUAL_LOSS_REASONS + LOSS_REASON_LABELS registry; the suggested-reply disclosure gains aria-expanded and its copy confirmation goes aria-live]. The SaveBar/modal reshape of ConvertForm stays DEFERRED — 4 visible fields inline, works as-is.
5. ~~call-list ring + queue~~ [BATCH 42: raw #f59e0b fallback → var(--color-amber-500)] [BATCH 43: phone-queue's "No website" flips to urgent to match the prospects table (same fact, same tone) + hover title; the dial CTA moves onto the secondary recipe so a queue of rows isn't a queue of primaries (tel: can't ride Link/ActionButton)].

### Demo prep (demo/[id])
1. ~~THREE primaries~~ [BATCH 42: prep-actions' pair and the brief's Generate demote to secondary — the track-picker launcher is the page's one breathing primary].
2. ~~prep-actions shared pending~~ [BATCH 42: per-action keys ('demo'/'enrich'); the re-enrich note gains role=status].
3. ~~track-picker teal-50 selected~~ [BATCH 42: selected state onto the token recipe].
4. ~~brief-panel ternaries + alert~~ [BATCH 42: dead ternaries under the pending prop removed; AI failure carries role=alert].
5. Demo-prep heartbeats + empty. PARTIAL [BATCH 44: the "no verified gaps" line now points at the header's ↻ Re-enrich control by name — an inline duplicate of that button would double its per-action state]. KpiStat heartbeats DEFERRED — no stored per-day series behind those numbers. → **POST-1.0** (`docs/POST-1.0.md`, daily metrics snapshot).

### Add-a-clinic modal
1. ~~Add-a-clinic modal~~ [BATCH 41: Cancel no longer spins; trigger demoted to secondary] [BATCH 42: focus trap + Esc (guarded while pending) + aria-labelledby onto the dialog; success panel + duplicate warning gain role=status (the warning also drops a broken dark-mode class for the standard amber recipe); submit ternary removed under the pending prop; footer Cancel disabled-only; ✕ grows a 32px target. The success panel's two buttons were already one-primary-at-a-time by condition].

### Pipeline board / momentum / win-loss / territory (prospecting)
1. ~~pipeline-panel~~ [BATCH 42: tiles onto surface-sunk; Won → emerald] [BATCH 43: all seven gray-400 floors → gray-500; loss meters tokened (surface-sunk track, rose-500 fill) + aria-hidden since counts sit beside them]. KpiStat adoption DEFERRED — the tiles already match the token recipe and have no spark data; the zero-state prose card stays (in-card precedent).
2. ~~Hand-rolled meters~~ [BATCH 43: loss/worked-% bars tokened + aria-hidden (their numbers are textual siblings); the warmth bar's cool segment moves off bg-slate-400 onto violet to match the cool band everywhere else].
3. ~~Board inert numbers + hints~~ [BATCH 42: violet-50 soon card → tokens] [BATCH 43: column count pills and the 4xl Prospects headline deep-link to their lists; EmptyHints lift to gray-500 (their copy explains how a column fills — kept); momentum flat/zero deltas lift to gray-500].
4. ~~Territory~~ [BATCH 42: Won → emerald; sunk surfaces tokened] [BATCH 43: per-row pending keys (only the tapped Focus toggle reads Saving…) + aria-pressed + 32px targets; the suggested-focus CTA becomes an ActionButton; state cells become real Links; banners onto ring recipes; gray-400 floors → gray-500; the empty row links straight to settings → state rollout; Won stat tile → emerald].

### Marketing home + legacy pipeline (/marketing)
1. ~~Stage accents sky + -50 + stone~~ [BATCH 45: the terminology accent contract moves onto registry tones — new=gray, contacted=fuchsia (matches the prospecting board's Communicated), demo=violet (demos are violet everywhere), trial=amber (a countdown), customer=emerald, lost=rose — and stageAccentClasses emits token recipes (bg-*-500/10, no -50s, no stone)].
2. Home deep-links. PARTIAL [BATCH 45: funnel rows link to the pipeline, recent-activity rows open the lead's drawer (?lead=), audience items link to /growth/audiences; the funnel track onto surface-sunk + aria-hidden]. KPI heartbeats DEFERRED (no stored time series for lead counts) → **POST-1.0** (`docs/POST-1.0.md`, daily metrics snapshot). — the stage chip keeps the stage-accent language (now tokened via the terminology contract) — StatusPill's six tones can't carry the six-stage identity the board columns share.
3. ~~Board move failure / drawer / add-lead modal~~ [BATCH 45: a failed drag announces "snapped back" via urgent toast (refresh reverts it); the drawer gets per-action keys (save/archive/opt-out — Revert disabled-only), error toasts on every path, an optimistic opt-out that rolls back on failure, and the global toast replaces its FlashToast; the add-lead modal gains focus trap + Esc (guarded while pending) + role=dialog/aria-labelledby + a 32px ✕, Cancel stops spinning, the submit ternary drops for the pending prop, the error carries role=alert, and its FlashToast goes global].
4. ~~Zero-state / tab stops / loading~~ [BATCH 45: an all-empty board renders an EmptyState handing over the Add-lead button; the sortable wrapper drops dnd-kit's role=button/tabIndex so each card is ONE tab stop (keyboard users change stages through the drawer's Stage select — keyboard DRAG deferred with that rationale); /marketing/pipeline gains a kanban-shaped loading.tsx]. Card/column surfaces already ride tokens; the source chip is a neutral medium chip, kept.

### Service library
1. ~~library-entry-editor modal + guard + buttons~~ [BATCH 46: the panel gains focus trap + Esc + role=dialog/aria-labelledby; a JSON-snapshot dirty flag drives useUnsavedChanges AND an in-modal confirm on every close path (✕, scrim, Esc, Cancel) — no more silent loss on an outside click; Save/Cancel become ActionButtons (pending prop, Cancel disabled while saving). Kept its own panel rather than the shared Drawer — the sticky-header/footer long-form layout is the part worth keeping].
2. ~~Approve/Reject busy + note validation + toasts~~ [BATCH 46: per-action busy key ({slug, act}) so only the pressed button spins and its sibling disables; the missing-note complaint becomes an inline role=alert line under the textarea (cleared on typing, aria-invalid set) instead of a flying toast; the local FlashToast channel is deleted — everything reports through the global toast with fuller success copy].
3. ~~Rows/chips/error/controls/search~~ [BATCH 46: entry rows → .v2-card; the origin chip drops dev-speak ("origin: platform" → "Platform-seeded"/"Clinic-submitted") and its -50 surface; the Edited chip → violet-500/10 + a hover explanation; the editor error carries role=alert on the ring recipe; the char counter lifts to gray-500 tabular; reorder/remove controls grow to 32px with rose-500/10 danger hover (both the editor's RowBtn and the shared editor-kit Ctrl); the board gains a SearchInput (name/slug/clinic) with a clear-search empty state; /platform/service-library gains a loading.tsx].
~~ESCALATED primitive~~ [BATCH 46: editor-kit's inputCls/textareaCls/selectCls now ride the app-wide form-input/form-textarea/form-select recipes (brand focus ring) — every Website Studio editor inherits; the TagListEditor's focus-within ring moves to teal].

### Platform blog (blog-editor + list)
1. ~~One transition ×8~~ [BATCH 47: autosave gets its OWN transition so a background save never spins the sidebar; explicit actions carry per-action keys (publish/unpublish/unschedule/preview/email/archive) with live labels — only the pressed control shows progress].
2. ~~Publish nudge + roles~~ [BATCH 47: the nudge moves onto the teal ring recipe with role=status and its button becomes a secondary ActionButton (no second primary); publishError carries role=alert; the autosave line gains role=status at gray-500].
3. ~~Helpers + inputs~~ [BATCH 47: helper copy lifts to gray-500; every hand-rolled sidebar input/select/textarea (excerpt, byline, author, reviewer, category, tags, alt, SEO) moves onto form-input/form-select/form-textarea]. The two violet AI chips stay raw-button chips DELIBERATELY — the violet chip is the app's recognized AI affordance; the Tools email/archive buttons keep their quiet list-button shape but gain live per-action labels.
4. ~~List~~ [BATCH 47: "No author" lifts to gray-500; the read-count cell links into the post; /website/blog gains a loading.tsx]. Whole-row anchors stay off — the title is the row's one clear target and the row also carries an external View link.

### Platform settings
1. ~~Settings home search~~ [BATCH 48: verified against batch 27 — the hand-rolled search box + 28px clear were still there; both become the shared SearchInput (serves both tenants). The aura hero stays DELIBERATELY — batch 27 established it as the one sanctioned brand-chrome moment].
2. Platform taxonomy (two tiles; Service Library/Blog/Prospecting settings unlinked) — **DEFERRED TO POST-1.0** (recorded 2026-09-10, batch 52). An information-architecture change, not a polish batch: `docs/STRUCTURE-AUDIT.md` territory, and those areas keep their own in-module settings doors by design. It stopped being a floating deferral and became a scheduled one — `docs/POST-1.0.md` now carries the whole STRUCTURE-AUDIT change-list remainder as one line, so nobody re-litigates it batch by batch.
3. ~~Notifications panel~~ [BATCH 48: Pause-all note onto the standard amber ring recipe; Includes lines lift to gray-500; the footer becomes the shared SaveBar with a ghost Reset — dirty now compares against a baseline that MOVES on save (before this the form read dirty forever after saving); local FlashToast → global toast; the two panel test files wrap in ToastProvider].

### Shared growth surfaces (platform orientation)
1. ~~Campaigns-list eyebrow~~ [BATCH 49: the platform-only list's eyebrow becomes ‹ Marketing (its real home) — ‹ Growth bounced the platform owner to /dashboard].
2. ~~Audiences two names one destination~~ [BATCH 49: the platform's redundant "← Sales pipeline" button (which went to /marketing, while the NAV's Sales Pipeline is prospecting) is removed — the ‹ Marketing eyebrow is the one way back; clinics keep ← Recall dashboard (a genuinely different destination)].
3. ~~Campaigns empty state~~ [BATCH 49: the empty state hands over the + New campaign button itself instead of describing where it is].
4. ~~Audience delete + editors~~ [BATCH 49: Delete grows a 32px target on rose-500/10 hover, and the delete path reports failures; BOTH audience editors (customer + patient) gain focus trap + Esc (guarded while pending) + role=dialog/aria-label, per-action keys (Refresh-preview vs Save spin independently), Cancel disabled-only, dropped label ternaries, save error toasts, and the dead copy-pasted deletingId state is deleted; the whole surface moves off its local FlashToast onto the global toast].
5. Audience preview manual-refresh — DEFERRED as designed: each preview is a full segment query, so an auto-refreshing preview would fire one per keystroke/chip-toggle; the explicit Refresh (now with its own pending state) keeps the cost visible.
6. ~~Campaign editor + [id] strip~~ [BATCH 49: the channel picker's "Resend" label becomes "Branded email" (matching channelLabel everywhere else) with aria-pressed + 32px targets; all four modal Cancels stop spinning (disabled-only) and their primaries drop label ternaries for the pending prop; Delete-campaign grows a 32px target on rose-500/10; the preview-text reveal link and modal ✕ lift to legible/32px; the schedule error carries role=alert; the [id] page's status pill gains a hover meaning — the compact breadcrumb strip is deliberate on an editor page, so the full legend stays on the list].
